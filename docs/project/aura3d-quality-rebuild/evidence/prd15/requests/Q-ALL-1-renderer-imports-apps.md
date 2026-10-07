# Q-ALL-1 — run `renderer-imports` on non-15-owned apps

**From:** PRD 15 (T2.12) · **To:** owners of `apps/postprocessing-*` (03),
`apps/{asset-lookdev,loader-ktx2}` (05), `apps/wow-webgpu-product-viewer` (04),
`apps/{webgpu-lab,wow-webgpu-instancing}` (11), `apps/threejs-parity-lab` (12),
`apps/common` (09), `apps/showcase-*` (14) · **Filed:** 2026-10-06 ·
**SLA:** 2 working days (CONTRACTS §6.5; requester never waits)

## What to do

Run the registered codemod on your app files:

```
aura3d codemod renderer-imports "apps/<your-app>/src/**/*.ts" --write --report
```

It rewrites the four deprecated subpaths
(`@aura3d/engine/{advanced,production}-runtime`,
`@aura3d/rendering/{advanced,production}-runtime`) to
`@aura3d/engine/renderer`, renames `A3DRenderer`/`A3DRendererOptions` to
`Renderer`/`RendererOptions`, maps the deleted wrapper methods
(`renderFrame`→`a3dRenderFrame`, `captureProof`/`renderImportedAsset`→
`rendererProofCapture`, `getFeatures`→`rendererFeatureReport`,
`getShadowEvidence`→`rendererShadowReport`), drops `preserveDrawingBuffer`
(rejected on `Renderer.create`; capture is C-05 `toBlob`), and rewrites
`Parameters<X["renderFrame"]>[N]` to `Parameters<typeof a3dRenderFrame>[N+1]`.

Rows with `mapping: "none"` need a human call (names that stay on the
deprecated subpath until Phase 8, or receiver-dependent members like
`.evidence()`/`X.backend`). `approximate` rows assume the receiver is a
`Renderer` — verify them.

## Dry-run report for your files (already computed)

`docs/project/aura3d-quality-rebuild/evidence/prd15/codemod-reports/renderer-imports-non-owner-apps.json`
— 9 files, 4 would change. Most production-runtime imports (`createStudioLighting`,
`createSideViewGameRenderPreset`, `TypedGLBActor`, `createProductViewer`, …)
map `none` and correctly stay on the deprecated subpath for now.

## Special cases already filed separately

- `apps/common/src/runtime.ts` (09): `ProductionWebGL2Renderer.renderFrame` /
  `.renderImportedAsset` / `ReturnType<…["renderFrame"]>` — recipe in
  `Q-09-1-apps-common-renderer-surface.md`.
- `apps/wow-webgpu-product-viewer/src/main.ts` (04): `renderFrameAsync` →
  `a3dRenderFrameAsync` — recipe in `Q-04-1-app-renderframeasync-adaptation.md`.

Nothing here blocks compilation today: apps are outside `tsconfig.build.json`
and the deprecated aliases stay exported until Phase 8.

---

## T5.9 follow-up — `engine-entry-imports` / `devtools-imports` codemods

T5.9 collapsed `@aura3d/engine` subpaths to the §6.1 list. In addition to
`renderer-imports`, run `aura3d codemod engine-entry-imports "<paths>" --write --report`
and `aura3d codemod devtools-imports "<paths>" --write --report` on your files.
Dry-run report (7 remaining non-15-owned files — owners 03/04/05/09 — 18 planned rows):
`docs/project/aura3d-quality-rebuild/evidence/prd15/reports/engine-entry-imports-other-lanes.json`
