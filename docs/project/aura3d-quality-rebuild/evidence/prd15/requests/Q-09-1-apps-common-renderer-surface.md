# Q-09-1: `apps/common/src/runtime.ts` — renderer surface collapsed

**From:** lane 15 · **To:** lane 09 · **Filed:** 2026-10-06

T2.6 deleted `ProductionWebGL2Renderer`/`ProductionRuntimeRenderer`; the names
remain as deprecated aliases of the C-29 `Renderer`, which has no
`renderFrame`/`renderImportedAsset` members. Your
`apps/common/src/runtime.ts` calls `ProductionWebGL2Renderer.create`,
`renderer.renderFrame(renderInput)` (:266, :568) and
`renderer.renderImportedAsset(renderInput)` (:267), and types
`ReturnType<...["renderFrame"]>` (:140, :555).

Adaptation recipe:
- `renderer.renderFrame({ source, camera, metadata })` →
  `renderer.render(source, camera)` (`RenderDeviceDiagnostics`).
- `renderer.renderImportedAsset(input)` →
  `rendererProofCapture(renderer, input)` (`ProductionRenderProof`).
- Features list → `rendererFeatureReport(renderer)` /
  `rendererInteractiveFeatureReport(renderer, diagnostics, input)`.
