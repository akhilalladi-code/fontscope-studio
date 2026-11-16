/// <reference lib="webworker" />
import * as fontkit from "fontkit";
const ctx = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<{ id: string; name: string; size: number; buffer: ArrayBuffer; sha256: string }>) => {
  const d = event.data;
  try {
    const parsed = (fontkit as any).create(new Uint8Array(d.buffer));
    const fonts = Array.isArray(parsed.fonts) ? parsed.fonts : [parsed];
    const faces = fonts.map((f: any, index: number) => {
      const family = String(f.familyName || "Unknown family");
      const style = String(f.subfamilyName || "Regular");
      const postscript = String(f.postscriptName || "");
      const version = String(f.version || "");
      const issues: { severity: "error" | "warning" | "info"; title: string; detail: string }[] = [];
      if (!f.familyName) issues.push({ severity: "warning", title: "Family name missing", detail: "The font does not expose a family name in its metadata." });
      if (!postscript) issues.push({ severity: "warning", title: "PostScript name missing", detail: "Some applications and workflows rely on a stable PostScript name." });
      if (!version) issues.push({ severity: "info", title: "Version metadata missing", detail: "No version string was reported by the parser." });
      if (Number(f.numGlyphs || 0) < 2) issues.push({ severity: "error", title: "Unusually low glyph count", detail: "The parsed font contains fewer than two glyphs." });
      if (!f.unitsPerEm) issues.push({ severity: "warning", title: "Units per em unavailable", detail: "The font's em-square metrics could not be read." });
      const filename = d.name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "");
      const normalized = family.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalized && filename && !filename.includes(normalized) && !normalized.includes(filename) && filename.length > 3 && normalized.length > 3) {
        issues.push({ severity: "info", title: "Filename differs from family name", detail: "Filename and internal family naming differ; this may be intentional." });
      }
      const rawAxes = f.variationAxes || f.variation?.axes || {};
      const axes: Record<string, { min: number; default: number; max: number; name?: string }> = {};
      if (Array.isArray(rawAxes)) {
        for (const axis of rawAxes) if (axis?.tag && Number.isFinite(axis.minValue) && Number.isFinite(axis.maxValue)) {
          axes[String(axis.tag)] = { min: Number(axis.minValue), default: Number(axis.defaultValue ?? axis.minValue), max: Number(axis.maxValue), name: String(axis.name || axis.tag) };
        }
      } else if (rawAxes && typeof rawAxes === "object") {
        for (const [tag, axis] of Object.entries(rawAxes as Record<string, any>)) if (axis && Number.isFinite(axis.minValue) && Number.isFinite(axis.maxValue)) {
          axes[tag] = { min: Number(axis.minValue), default: Number(axis.defaultValue ?? axis.minValue), max: Number(axis.maxValue), name: String(axis.name || tag) };
        }
      }
      return {
        id: d.id + "-" + index, fileId: d.id, fileName: d.name, fileSize: d.size, faceIndex: index,
        family, subfamily: style, fullName: String(f.fullName || family + " " + style), postscriptName: postscript,
        version, weight: Number(f["OS/2"]?.usWeightClass) || 400, glyphCount: Number(f.numGlyphs || 0),
        unitsPerEm: Number(f.unitsPerEm) || null, ascent: Number(f.ascent) || null, descent: Number(f.descent) || null,
        characterSet: Array.isArray(f.characterSet) ? f.characterSet.map(Number) : [], issues, previewFamily: "FontScope-" + d.id + "-" + index,
        sha256: d.sha256, axes, isCollection: fonts.length > 1, isVariable: Object.keys(axes).length > 0,
      };
    });
    ctx.postMessage({ id: d.id, faces });
  } catch (error) {
    ctx.postMessage({ id: d.id, error: error instanceof Error ? error.message : "Unable to parse this font." });
  }
};
export {};
