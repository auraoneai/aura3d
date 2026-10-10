# Q-13-6 → to:prd13 (qr-request, CONTRACTS §6.5)

**GitHub issue:** #704

**Files:** `templates/external-parity-asset-gallery`, `templates/external-parity-interactive-scene`,
`templates/external-parity-material-studio`, `templates/external-parity-product-viewer` (root `templates/` is 13's)
**Contract served:** PRD-15 T1.5 / §6.6 — the 4 parity templates are superseded by `templates/production-*`,
are not in root `files`, and are parity-named.

## Requested change

Delete the 4 `templates/external-parity-*` directories.

## rg -l output (as attached per T1.5)

```
templates/external-parity-asset-gallery/package.json
templates/external-parity-asset-gallery/src/main.ts
templates/external-parity-interactive-scene/package.json
templates/external-parity-interactive-scene/src/main.ts
templates/external-parity-material-studio/package.json
templates/external-parity-material-studio/src/main.ts
templates/external-parity-product-viewer/package.json
templates/external-parity-product-viewer/src/main.ts
package.json                                              (15-owned — handled)
tests/browser/external-parity-template-product-viewer.spec.ts (15-owned — deleted)
tools/external-parity-template-readiness/index.ts         (12-owned — see note)
tools/external-parity-{app-suite,external-vite-build,material,material-studio,package,release,screenshot-gallery,static-preview}-*/index.ts (12-owned)
```

`rg -o` note: the pattern also substring-matches `external-parity-material-studio-pro*`
(the material-studio-PRO app, unrelated) — hits in `package.json` and the two
`tests/browser/external-parity-material-studio*.spec.ts` files are that app, not these
templates, and were left alone.

## 15-owned hits removed in this lane

- `tests/browser/external-parity-template-product-viewer.spec.ts` — deleted (its `templates` array covers exactly these 4 ids).
- `package.json` script `external-parity:templates` — removed (it executed the deleted spec plus three 12-owned `external-parity-*-readiness` tools; the unaffected vitest invocations it chained remain runnable directly).

## Consumer note for lane 12

`tools/external-parity-template-readiness/index.ts` references the deleted spec and
`tests/reports/external-parity-template-product-viewer-browser.json`; the other 8
`external-parity-*` tool dirs reference the template paths. No CI workflow invokes them.

## Status

FILED as #704 (`qr-request` + `to:prd13`), 2026-10-09 — lane-13 write-back pass.
