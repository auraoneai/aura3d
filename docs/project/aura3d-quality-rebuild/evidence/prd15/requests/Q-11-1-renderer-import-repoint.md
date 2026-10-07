# Q-11-1: lane-11 production-runtime files — minimal import repoints (applied)

**From:** lane 15 · **To:** lane 11 · **Filed:** 2026-10-06

T2.6 deleted `ProductionWebGL2Renderer.ts`/`ProductionRuntimeRenderer.ts`. Two
lane-11 files imported them; to keep `tsc` green I applied the smallest
redirects — no behavior change:

- `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts` —
  `analyzePixels` → `./renderProofs`, `ProductionWebGL2RendererOptions` →
  `./backendSelection` (both are verbatim moves, same code).
- `packages/rendering/src/production-runtime/backends/WebGL2RendererBackend.ts` —
  `ProductionWebGL2Renderer` class → `Renderer` (the alias it now resolves to);
  `renderer.renderImportedAsset(input)` → `rendererProofCapture(renderer, input)`;
  `renderer.getFeatures()` → `rendererFeatureReport(renderer)` (moved members,
  same call chain).

If your PRD wants these expressed differently (e.g. your own thin adapter),
revert freely — the contract is: the classes are gone, `Renderer` is the only
renderer, proof/feature surface is the `renderProofs.ts` free functions.
