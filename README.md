# FontScope

**A local-first font engineering and webfont QA studio.**

Inspect font packages, compare families, test character coverage, explore variable axes when exposed by the parser, and prepare safer webfont handoffs.

## Features

- Batch inspect TTF, OTF, WOFF, WOFF2 and TTC files (50 MB per file; 200 MB total; 100 files per session).
- Parse metadata in a Web Worker and calculate SHA-256 file fingerprints locally.
- Detect missing metadata, suspicious filename/family differences, repeated PostScript names and byte-identical files.
- Inspect Unicode character presence and group missing characters by Unicode block, including Telugu and Devanagari.
- Preview imported fonts and compare two faces side by side.
- Adjust specimen size, line height, letter spacing, text colour and background.
- Expose variable-font axis controls when axis metadata is available from the parser.
- Export JSON, CSV, CSS, design tokens, Tailwind font-family configuration, a baseline/candidate metadata regression report, a standalone HTML report, or a ZIP handoff containing original inputs and generated reports.
- Keep font bytes in the browser session. There is no account, backend, upload endpoint or analytics.

## Run locally

Requires Node.js 20.19+ or 22.12+.

\`\`\`bash
npm install
npm run dev
\`\`\`

## Quality checks

\`\`\`bash
npm run typecheck
npm run lint
npm run test
npm run build
\`\`\`

## Privacy and limits

Font files are read and processed in your browser. FontScope does not upload, persist, convert, subset or redistribute font files. Clearing or refreshing the page clears the session. The app shell currently uses system fonts; it does not need a remote font service.

Glyph coverage measures Unicode character presence only. It does not validate OpenType shaping, ligatures, kerning, mark positioning, script layout, fallback behavior or visual correctness. Use a shaping-aware renderer and native applications for final multilingual QA.

Variable axes are shown only when exposed by the installed Fontkit parser. Browser variable-font preview is best-effort. TTC collections are inspectable, but CSS export intentionally omits them: extract a selected face to a standalone webfont before web deployment. Browser support for WOFF2 and other formats varies.

Metadata findings are advisory, not a legal assessment. Embedded copyright strings do not establish usage rights. Always verify font licensing with the font provider.

## Deployment

GitHub Actions builds and deploys \`dist\` to GitHub Pages. Enable Settings → Pages → Build and deployment → GitHub Actions. Vite's base path is \`/fontscope-studio/\`.

## License

MIT — Copyright (c) 2026 Akhil Alladi. See [LICENSE](LICENSE).
