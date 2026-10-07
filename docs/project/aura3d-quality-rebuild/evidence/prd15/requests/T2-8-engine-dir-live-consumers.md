# T2.8 deviation: `engine/src/threejs-example-parity/` has live consumers

PRD-15 T2.8's deletion is gated on `rg -l "threejs-example-parity" apps
examples templates packages tests` showing only the files themselves and their
own tests. Reality:

- `apps/flagship-viewer/src/main.ts` and `apps/wow-common/src/showcase.ts`
  import `createCurrentRoutesFlagshipViewer` from
  `packages/engine/src/threejs-example-parity/index.ts` — the live flagship
  viewer product (955 lines), not dead parity code.
- `tests/unit/apps/wow-concept-car-cinema-car-material-stability.test.ts`
  reads the same file for HDR/material-stability assertions.

What landed instead (same commit, `qr/prd15-one-renderer`):

- `packages/rendering/src/threejs-example-parity/` deleted. Its only consumer
  was the engine file; `CurrentRoutesInteractiveRenderer`,
  `createCurrentRoutesPostprocess`, `captureCurrentRoutesCanvasScreenshot` and
  the metrics/screenshot types moved **verbatim** into
  `engine/src/threejs-example-parity/index.ts` — zero API change for the two
  app consumers (same import path, same exports).
- The moved class's internals were adapted to the single-`Renderer` surface
  (`Renderer.create` + `resolveProductionRuntimeRendererBackend` +
  `rendererInteractiveFeatureReport` + `renderAsync`), matching
  `createProductViewer`'s recipe.

Engine dir deletion is deferred to Phase 8 (it is not a renderer wrapper — it
is the flagship viewer). The 25 cross-package relative imports the task cited
still exist in the engine dir; removing them belongs with the dir's eventual
relocation, not its deletion.
