# FontScope agent instructions

## Product constraints
- Keep FontScope a local-first, browser-only font utility. Do not add a backend, analytics, accounts, payments, telemetry or font upload endpoint without explicit product approval.
- Font bytes and installed-font metadata must not be transmitted to third parties.
- Local Font Access must only be invoked from an explicit user gesture and must handle unsupported browsers and permission denial.
- Treat imported font files as untrusted input. Validate extension and file signature, enforce size limits, parse in the Web Worker and recover from worker failures.
- Preserve the existing visual design and keyboard accessibility.

## Engineering rules
- Use strict TypeScript. Avoid any in new code unless a third-party library requires it and the boundary is documented.
- Keep pure utilities in small modules and cover them with Vitest tests.
- Keep archive generation bounded in memory. Do not silently increase import or export limits.
- Escape user-controlled metadata before inserting it into HTML.
- Do not claim Unicode presence checks validate shaping, ligatures, kerning or visual correctness.
- Do not claim font licensing or legal compliance.

## Verification
Run npm run typecheck, npm run lint, npm run test, npm run build and npm run smoke.
Inspect the diff and test all changed user flows. Never make a successful build stand in for browser-level verification.

## Deployment
- GitHub Pages is the production host. Vite base path is /fontscope-studio/.
- Pull requests run quality checks but must not deploy.
- Only the deployment job receives pages: write and id-token: write.
- Do not merge or deploy without explicit user approval.
