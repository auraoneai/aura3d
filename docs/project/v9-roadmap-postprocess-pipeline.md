# V9 Postprocess Pipeline

G3D has render-target and postprocess code with matched baseline/bloom routes. Advanced postprocess parity remains partial.

## Real Code

- `packages/rendering/src/RenderTarget.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/postprocess/*`
- `packages/rendering/src/production-runtime/postprocess/*`
- `packages/rendering/src/production-runtime/framegraph/*`
- `packages/rendering/src/WebGL2Device.ts`
- `apps/postprocessing-bloom/`
- `apps/postprocessing-depth-outline/`

## What Is Supported

- FBO/render-target abstraction.
- Render-to-texture and fullscreen pass style composition.
- Bloom route with V9 same-scene evidence.
- Renderer-owned postprocess chains in scoped routes.
- Disposal and resize behavior in the renderer/resource lifecycle.

## Evidence

- `tests/reports/v9/unreal-bloom-parity.json`
- `tests/reports/v9/route-health.json`
- `tests/reports/v9/visual-review.json`

## Remaining Deltas

- `webgl_postprocessing_outline` remains partial.
- `webgl_postprocessing_dof` remains partial.
- `webgl_postprocessing_ssao` remains partial.
- Bloom output still differs from Three.js in intensity/halo distribution; current evidence supports scoped parity, not visual superiority.
