import { describe, it, expect } from "vitest";
import { auditFaces, coverage, css, csv, escapeHtml, extensions, formatBytes, hasValidFontSignature, unicodeBlock } from "./audit";
import { MAX_ZIP_EXPORT_BYTES, zipStore } from "./archive";

describe("FontScope audit helpers", () => {
  it("formats file sizes and rejects invalid values", () => {
    expect(formatBytes(2048)).toBe("2.00 KB");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
  it("checks unique Unicode code points rather than UTF-16 units", () => {
    expect(coverage([65, 66], "AAB D")).toMatchObject({ total: 3, present: 2, missing: [68], percent: 67 });
    expect(coverage([0x1f600], "😀").percent).toBe(100);
  });
  it("identifies Indic Unicode blocks", () => {
    expect(unicodeBlock(0x0c05)).toBe("Telugu");
    expect(unicodeBlock(0x0915)).toBe("Devanagari");
  });
  it("escapes HTML content", () => expect(escapeHtml("<script>")).toBe("&lt;script&gt;"));
  it("quotes CSV values safely", () => expect(csv([{ fileName: 'a".woff2', family: "A,B", issues: [] }])).toContain('"a"".woff2"'));
  it("omits TTC from webfont CSS", () => {
    expect(css([{ fileName: "family.ttc", family: "Family", subfamily: "Regular" }])).toContain("TTC collections are intentionally omitted");
    expect(css([{ fileName: "family.woff2", family: "Family", subfamily: "Regular" }])).toContain('format("woff2")');
  });
  it("finds duplicate PostScript names and hashes", () => {
    const findings = auditFaces([
      { id: "1", fileName: "a.ttf", postscriptName: "Family-Regular", sha256: "same", issues: [] },
      { id: "2", fileName: "b.ttf", postscriptName: "family-regular", sha256: "same", issues: [] },
    ]);
    expect(findings.some((f) => f.title === "Repeated PostScript name")).toBe(true);
    expect(findings.some((f) => f.title === "Identical font file content")).toBe(true);
  });

  it("validates font file signatures instead of trusting extensions", () => {
    const bytes = (value: string) => Uint8Array.from([...value].map((character) => character.charCodeAt(0))).buffer;
    expect(hasValidFontSignature(bytes("wOF2"), "woff2")).toBe(true);
    expect(hasValidFontSignature(bytes("OTTO"), "otf")).toBe(true);
    expect(hasValidFontSignature(bytes("ttcf"), "ttc")).toBe(true);
    expect(hasValidFontSignature(bytes("nope"), "woff2")).toBe(false);
    expect(hasValidFontSignature(bytes("wOFF"), "woff2")).toBe(false);
  });
  it("builds a valid empty ZIP container and enforces the export memory limit", async () => {
    const archive = zipStore([{ name: "readme.txt", data: new TextEncoder().encode("hello") }]);
    expect(archive.type).toBe("application/zip");
    expect(archive.size).toBeGreaterThan(50);
    expect(() => zipStore([{ name: "large.bin", data: new Uint8Array(11) }], 10)).toThrow("limited to 0 MB");
    expect(MAX_ZIP_EXPORT_BYTES).toBe(80 * 1024 * 1024);
  });
  it("lists accepted formats", () => expect(extensions).toContain("woff2"));
});
