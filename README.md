# FontScope

**A local-first font package inspector and webfont QA studio.**

Inspect font packages before they enter a design system, website or client handoff.

## Features
- Batch inspect TTF, OTF, WOFF, WOFF2 and TTC using Fontkit.
- Read family, subfamily, full name, PostScript name, version, weight, glyph count and units-per-em.
- Detect missing metadata, suspicious filename/family mismatches and repeated PostScript names.
- Test unique Unicode character presence, including Telugu and Devanagari samples.
- Preview imported fonts using the browser FontFace API.
- Export CSS @font-face declarations, JSON and CSV inventories, and a portable HTML report.
- Parse font bytes locally in a Web Worker. No accounts, backend, uploads or analytics.

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
```

## Limitations
Browser preview is best-effort. Glyph coverage checks Unicode character presence, not shaping, ligatures, script layout or visual correctness. Variable-font axes are not exposed as controls. FontScope does not convert, subset, modify or redistribute fonts. Embedded copyright information is not proof of a license. Files are processed in memory and not persisted.

## Deployment
GitHub Actions builds and deploys dist to GitHub Pages. Enable Settings → Pages → Build and deployment → GitHub Actions. The Vite base path is /fontscope-studio/.

## License
MIT — Copyright (c) 2026 Akhil Alladi. See LICENSE.
