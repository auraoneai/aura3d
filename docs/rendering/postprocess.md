# Renderer Postprocess

The renderer exposes both low-level postprocess passes and route-level postprocess app evidence:

- `ToneMappingPass`, bloom, FXAA, vignette, sharpening, color grading, and debug depth presentation in the root renderer path.
- three-compat/production-runtime postprocess modules for cinematic examples and app-suite evidence.
- v8 routes for bloom and depth-outline examples under `apps/postprocessing-bloom` and `apps/postprocessing-depth-outline`.
- WebGPU render-to-texture and HDR readback evidence in the WebGPU matrix.

The high-level flow is still the same: render a scene into an offscreen target, run one or more full-screen passes, then present or read back the final target. `RenderGraph`/composer-style code is used to keep pass dependencies explicit.

## Current Use Cases

- Product viewers that need tone mapping after HDR/IBL lighting.
- Cinematic demo routes with bloom, outline/depth visualization, or color grading.
- WebGPU/WebGL2 render-target validation.
- Visual-quality gates that need representative pixels instead of pure unit tests.

## Current Evidence

- `tests/reports/external-parity-postprocess-suite.json` records root postprocess coverage.
- `tests/reports/production-runtime-lighting-postprocess-readiness.json` and production-runtime app-suite screenshots cover cinematic postprocess routes.
- `tests/reports/current-routes-visual-review.json` includes v8 bloom and depth-outline screenshots as accepted route evidence.
- `tests/reports/current-routes-route-health.json` includes the v8 postprocessing routes in the route registry.

## Known Gaps

- Bloom/depth-outline routes are not full Unreal/Unity post stacks. They are evidence that the route and pass wiring work.
- Depth of field, SSAO, SSR, TAA, motion blur, temporal history, and robust anti-aliasing pipelines remain bounded or incomplete unless a specific report says otherwise.
- Visual review passing does not mean final art quality. It checks framing, nonblank coverage, contrast, and notes, but it does not replace human art direction or broad competitor comparison.
- Some current demos still read as debug scenes. Those should not be used in GTM material until they are restaged or replaced with polished assets.

## Verification

- `tests/unit/rendering/render-graph.test.ts`
- `tests/browser/rendering-root-quality-gate.spec.ts`
- `tests/browser/rendering-external-parity-visuals.spec.ts`
- `tests/reports/external-parity-postprocess-suite.json`
- `tests/reports/current-routes-visual-review.json`
