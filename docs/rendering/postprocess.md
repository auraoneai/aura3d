# Renderer Postprocess

The current renderer package exposes deterministic postprocess passes that operate on render targets:

- `ToneMappingPass` reads an HDR-style color target and writes tone-mapped LDR pixels.
- `BloomPass` extracts bright pixels, diffuses them over a bounded radius, and writes a bloom output target.
- `FXAAPass` detects high-contrast luma edges and writes a smoothed output target.

`examples/postprocess-lab` wires those passes through `RenderGraph` in this order:

1. `tone-mapping`: reads `hdr-color`, writes `tone-mapped-color`.
2. `bloom`: reads `tone-mapped-color`, writes `bloom-color`.
3. `fxaa`: reads `bloom-color`, writes `fxaa-color`.

The example intentionally registers the passes out of order and uses `RenderGraph.compilePlan()` to prove dependency ordering before execution. It exposes `window.__GALILEO3D_POSTPROCESS_LAB__` with the compiled pass order, resource lifetime summary, diagnostics, and representative pixels.

## Limits

- The lab uses deterministic LDR byte buffers for postprocess verification.
- HDR render-target formats, color-management policy, TAA, DOF, SSR, SSAO, depth-aware bloom, and temporal history are not implemented in this slice.
- The WebGL2 render-target path supports readback and source pixels; GPU fullscreen postprocess compositing is not claimed by this example.

## Verification

- `tests/unit/rendering/render-graph.test.ts` covers the individual passes and render-graph ordering.
- `tests/visual/rendering-pixels.spec.ts` covers tone mapping, bloom, and FXAA browser pixels.
- `tests/visual/rendering-postprocess-lab.spec.ts` covers the ordered `examples/postprocess-lab` graph and presentation pixels.
