# V6 V5 Visual Failure Audit

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 starts by acknowledging the exact V5 failure that must not repeat.

## Failed Evidence Pattern

V5 created broad packages, docs, examples, and release gates, but its visual proof path was weak. The V5 visual parity and gallery flow allowed proof images that did not originate from real G3D renderer output.

Specific failures:

- `tests/browser/v5-threejs-visual-parity.spec.ts` used canvas-painted visual evidence instead of rendering real G3D scenes through a production WebGL2/WebGPU renderer.
- `tests/reports/v5-gallery/*` was initially allowed to pass with tiny, blank, flat, or non-renderer screenshots.
- V5 app-suite tests used metadata such as `window.__app` as proof, which is not enough for visual product quality.
- V5 renderer capture contracts could return identifiers instead of real framebuffer pixels.
- V5 parity metadata contained hardcoded scene scores rather than computed image similarity from real same-scene renders.

## V6 Correction

V6 must prove real renderer output:

- screenshots from WebGL2/WebGPU frame buffers
- real glTF/GLB assets loaded through G3D
- real HDR environments and PBR materials
- runtime renderer metrics with nonzero draw calls, textures, materials, and assets
- same-scene screenshots rendered by G3D and Three.js
- pixel-stat and human-review gates that reject fake or primitive output

## Non-Acceptable V6 Evidence

The following cannot count as completion:

- Canvas 2D painted screenshots
- primitive-only flagship scenes
- stick figures
- triangle-shaped cars
- synthetic blocks/circles as product proof
- `page.setContent()` screenshot proof for flagship scenes
- mock renderer screenshots
- hardcoded visual scores
- file-existence-only readiness

## Required Audit Outcome

`tools/v6-v5-failure-audit/index.ts` must fail if the failure docs do not name canvas-painted visual proof, fake parity scores, non-renderer screenshots, mock renderer output, and the requirement for real WebGL2/WebGPU frame-buffer screenshots.
