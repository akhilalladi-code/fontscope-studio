# FontScope

**A local-first font engineering and webfont QA studio.**

Inspect font packages, compare families, test Unicode character presence, explore variable axes when exposed by the parser, and prepare webfont handoffs.

## Features

- Scan installed desktop fonts through the browser Local Font Access API after explicit user permission.
- Batch inspect TTF, OTF, WOFF, WOFF2 and TTC files (50 MB per file; 200 MB total; 100 files per session).
- Validate file signatures before parsing untrusted font files.
- Parse metadata in a Web Worker and calculate SHA-256 fingerprints locally.
- Recover from parser worker errors without leaving imports stuck in a pending state.
- Detect missing metadata, suspicious filename/family differences, repeated PostScript names and byte-identical files.
- Inspect Unicode character presence, including Telugu, Devanagari and other supported blocks.
- Preview imported fonts and compare two faces side by side.
- Adjust specimen size, line height, letter spacing, text colour and background.
- Export JSON, CSV, CSS, design tokens, Tailwind configuration, regression metadata, HTML reports and bounded ZIP handoffs.
- Process font bytes locally in the browser. There is no application backend, account system, upload endpoint or analytics integration.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke
npm run test:e2e
```

The smoke command starts the Vite preview server and verifies the built HTML, CSP, generated JavaScript/CSS, privacy page and public metadata assets over HTTP. The Playwright suite exercises the workspace, explicit installed-font permission flow, invalid font-file rejection and privacy navigation in Chromium.

## Privacy and limits

Font files are read and processed in your browser. The optional Local Font Library requests explicit browser permission to read installed-font metadata; it does not upload or copy local font files. FontScope does not upload, persist, convert, subset or redistribute imported font files. Imported bytes remain in browser memory for the active page session. Refreshing or closing the page clears the application's in-memory data.

Local Font Access is available only in supported desktop browsers and requires user permission. Firefox, Safari and many mobile browsers do not expose this API; use the file importer as a fallback.

ZIP handoffs are limited to 80 MB to reduce browser memory pressure. Larger packages can be exported through the individual report buttons. The import limit is not a guarantee that every device can safely process the maximum size.

Glyph coverage measures Unicode character presence only. It does not validate OpenType shaping, ligatures, kerning, mark positioning, script layout, fallback behaviour or visual correctness. Use shaping-aware renderers and native applications for final multilingual QA.

Variable axes are shown only when exposed by the installed Fontkit parser. Browser variable-font preview is best-effort. TTC collections are inspectable, but CSS export intentionally omits them: extract a selected face to a standalone webfont before web deployment. Browser support for WOFF2 and other formats varies.

Metadata findings are advisory, not a legal assessment. Embedded copyright strings do not establish usage rights. Always verify font licensing with the font provider.

Read the [Privacy Notice](https://akhilalladi-code.github.io/fontscope-studio/privacy.html).

## Deployment and security

GitHub Actions runs typechecking, lint, unit tests, production build and HTTP smoke checks. The deployment job is separate and receives Pages deployment permissions only when publishing. A separate security workflow runs dependency auditing and Gitleaks secret scanning. Dependabot checks npm packages and GitHub Actions weekly.

GitHub Pages deploys the `dist` directory. Vite's base path is `/fontscope-studio/`.

## License

MIT — Copyright (c) 2026 Akhil Alladi. See [LICENSE](LICENSE).
