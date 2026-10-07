# tests/qr/prd01 — lane 01 QA harness

PRD-01 §16.4 tooling: lane metrics, the self-contained browser harness, the
Playwright conformance spec, and the capture script. Everything is lane-owned
(`tests/qr/prd01/` pending QR-OWN-1).

## Layout

- `metrics/` — pure pixel metrics (`maskIoU`, `regionSsim`, `deltaE2000`, `temporalSigma`), unit-tested in `unit/`.
- `harness/` — vite `index.html` + `main.ts` + `vite.config.ts`: mounts a `prd01-*` scene on `aura3d` or `three`, sets `window.__QR_READY__`/`__QR_ERROR__`/`__QR_TOOLS__`.
- `browser/` — Playwright conformance spec (both engines × `a3d-qr=none|core`).
- `capture.mjs` — capture loop: per flag-set × scene × engine screenshots + strip frames + in-page metric evaluation → `report.json`/`summary.md`.
- `serve.mjs` — tiny static server for the built harness.
- `unit/` — vitest specs.
- `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json` — lane-scoped configs (root configs untouched).

## Commands

```sh
pnpm exec tsc -p tests/qr/prd01/tsconfig.json --noEmit
pnpm exec vitest run --config tests/qr/prd01/vitest.config.ts
pnpm exec vite build --config tests/qr/prd01/harness/vite.config.ts
pnpm exec playwright test --config tests/qr/prd01/playwright.config.ts   # macOS/chromium in CI
node tests/qr/prd01/capture.mjs --flags none,core --out <dir>
```
