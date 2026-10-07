# Q-04-1: `apps/wow-webgpu-product-viewer` — `renderFrameAsync`/`backendSelection` gone

**From:** lane 15 · **To:** lane 04 · **Filed:** 2026-10-06

T2.6/T2.9 collapsed the renderer wrappers onto the single C-29 `Renderer`.
`ProductionRuntimeRenderer`/`A3DRenderer` still exist as deprecated aliases,
but `Renderer` has no `renderFrameAsync`/`renderFrame`/`renderImportedAsset`/
`backendSelection` members. Your app file
`apps/wow-webgpu-product-viewer/src/main.ts` calls `renderer.renderFrameAsync`
(:122) and `renderer.backendSelection` (:91, :149).

Adaptation recipe (same call chain, no behavior change):
- `renderer.renderFrameAsync({ source, camera, metadata })` →
  `await renderer.renderAsync(source, camera)` (returns
  `RenderDeviceDiagnostics` directly).
- `renderer.backendSelection` → compute
  `resolveProductionRuntimeRendererBackend({ backend, webgpu })` at creation
  and keep the `ProductionRuntimeRendererBackendSelection` for `.reason`.
- Imported-asset proof → `rendererProofCapture(renderer, input)`;
  features → `rendererFeatureReport(renderer)` (both exported from
  `@aura3d/rendering` and `devtools/rendererReports.ts`).

Apps aren't in `tsconfig.build.json`, so trunk stays green either way — but
the route breaks at runtime until adapted.
