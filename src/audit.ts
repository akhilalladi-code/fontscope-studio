export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const MAX_FILES = 100;
export const extensions = ["ttf", "otf", "woff", "woff2", "ttc"];

export function hasValidFontSignature(buffer: ArrayBuffer, extension: string): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
  const ascii = String.fromCharCode(...bytes);
  const signatures: Record<string, string[]> = {
    ttf: ["\u0000\u0001\u0000\u0000", "true"],
    otf: ["OTTO"],
    woff: ["wOFF"],
    woff2: ["wOF2"],
    ttc: ["ttcf"],
  };
  return (signatures[extension.toLowerCase()] || []).some((signature) => ascii === signature);
}

export const formatBytes = (n: number): string => {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(2) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
};

export function coverage(chars: number[], text: string) {
  const available = new Set(chars);
  const codepoints = [...new Set(Array.from(text).map((c) => c.codePointAt(0)!).filter((cp) => ![9, 10, 13, 32].includes(cp)))];
  const missing = codepoints.filter((cp) => !available.has(cp));
  return {
    total: codepoints.length,
    present: codepoints.length - missing.length,
    missing,
    percent: codepoints.length ? Math.round(((codepoints.length - missing.length) / codepoints.length) * 100) : 100,
  };
}

export function unicodeBlock(cp: number): string {
  const blocks: [number, number, string][] = [
    [0x0000,0x007f,"Basic Latin"],[0x0080,0x00ff,"Latin-1 Supplement"],[0x0100,0x024f,"Latin Extended"],
    [0x0300,0x036f,"Combining Diacritical Marks"],[0x0370,0x03ff,"Greek"],[0x0400,0x04ff,"Cyrillic"],
    [0x0590,0x05ff,"Hebrew"],[0x0600,0x06ff,"Arabic"],[0x0900,0x097f,"Devanagari"],
    [0x0980,0x09ff,"Bengali"],[0x0a00,0x0a7f,"Gurmukhi"],[0x0a80,0x0aff,"Gujarati"],
    [0x0b00,0x0b7f,"Oriya"],[0x0b80,0x0bff,"Tamil"],[0x0c00,0x0c7f,"Telugu"],
    [0x0c80,0x0cff,"Kannada"],[0x0d00,0x0d7f,"Malayalam"],[0x0e00,0x0e7f,"Thai"],
    [0x2000,0x206f,"General Punctuation"],[0x20a0,0x20cf,"Currency Symbols"],[0x1f300,0x1faff,"Emoji & Symbols"],
  ];
  return blocks.find(([start,end]) => cp >= start && cp <= end)?.[2] || "Other";
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
}

export function csv(rows: any[]): string {
  const q = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return ["file,family,style,postscript,version,weight,glyphs,bytes,sha256,issues",
    ...rows.map((r) => [r.fileName,r.family,r.subfamily,r.postscriptName,r.version,r.weight,r.glyphCount,r.fileSize,r.sha256,(r.issues || []).join("; ")].map(q).join(","))].join("\r\n");
}

export function css(rows: any[]): string {
  return rows.filter((r) => !/\.ttc$/i.test(r.fileName)).map((r) => {
    const ext = r.fileName.split(".").pop()?.toLowerCase() || "woff2";
    const format = ext === "ttf" ? "truetype" : ext === "otf" ? "opentype" : ext;
    const family = String(r.family).replace(/["\\]/g, "");
    const file = String(r.fileName).replace(/["\\]/g, "").replace(/[()]/g, "");
    const weight = r.axes?.wght ? r.axes.wght.min + " " + r.axes.wght.max : (r.weight || 400);
    return '@font-face {\n  font-family: "' + family + '";\n  src: url("./' + file + '") format("' + format + '");\n  font-style: ' + (/italic|oblique/i.test(r.subfamily) ? "italic" : "normal") + ';\n  font-weight: ' + weight + ';\n  font-display: swap;\n}';
  }).join("\n\n") + (rows.some((r) => /\.ttc$/i.test(r.fileName)) ? "\n\n/* TTC collections are intentionally omitted: extract a face to a standalone webfont before using it on the web. */" : "");
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function auditFaces(faces: any[]) {
  const findings: { severity: "error" | "warning" | "info"; title: string; detail: string; faceId?: string }[] = [];
  const postscript = new Map<string, any[]>();
  const hashes = new Map<string, any[]>();
  for (const face of faces) {
    for (const issue of face.issues || []) findings.push({ severity: issue.severity || "warning", title: issue.title || issue, detail: issue.detail || face.fileName, faceId: face.id });
    if (face.postscriptName) {
      const key = String(face.postscriptName).toLowerCase();
      postscript.set(key, [...(postscript.get(key) || []), face]);
    }
    if (face.sha256) hashes.set(face.sha256, [...(hashes.get(face.sha256) || []), face]);
  }
  for (const group of postscript.values()) if (group.length > 1) findings.push({ severity: "warning", title: "Repeated PostScript name", detail: group.map((f) => f.fileName + " (" + f.subfamily + ")").join(" · ") });
  for (const group of hashes.values()) if (group.length > 1) findings.push({ severity: "error", title: "Identical font file content", detail: group.map((f) => f.fileName).join(" · ") });
  return findings;
}
