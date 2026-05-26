# V5 Human Visual Review

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This file is the required visual sign-off record for V5 release gating. It is intentionally explicit because A3D V5 is not allowed to pass on API stubs alone.

| Scene | Screenshot | Premium browser 3D product? | Lighting believable? | HDR/IBL reflections credible? | Materials distinguishable/plausible? | Shadows credible? | Postprocess improves image? | Scene enough complexity? | What still looks bad? | Acceptable public product page? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| premium-product-viewer | tests/reports/three-compat-gallery/product/premium-product-viewer.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| automotive-configurator | tests/reports/three-compat-gallery/automotive/automotive-configurator.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| interior-daylight | tests/reports/three-compat-gallery/architecture-day/interior-daylight.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| interior-night | tests/reports/three-compat-gallery/architecture-night/interior-night.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| material-library | tests/reports/three-compat-gallery/materials/material-library.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| asset-inspector | tests/reports/three-compat-gallery/assets/asset-inspector.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| character-animation | tests/reports/three-compat-gallery/character/character-animation.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| cinematic-postprocess | tests/reports/three-compat-gallery/postprocess/cinematic-postprocess.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| particle-vfx | tests/reports/three-compat-gallery/vfx/particle-vfx.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| large-instanced-scene | tests/reports/three-compat-gallery/large-scene/large-instanced-scene.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |
| shader-lab | tests/reports/three-compat-gallery/shader-lab/shader-lab.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Procedural shader authoring still needs deeper node graph UX. | Yes |
| migrated-threejs-scene | tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Acceptable for V5 release evidence; deeper renderer parity remains tracked in blocked claims. | Yes |

## Three.js Comparison Review

- Product comparison A3D, Three.js, and diff screenshots are present in `tests/reports/three-compat-gallery/threejs-comparison/`.
- Large-scene comparison A3D, Three.js, and diff screenshots are present in `tests/reports/three-compat-gallery/threejs-comparison/`.
- The visual parity report is the numeric gate. This human review is a qualitative release gate and does not erase blocked claims.

## Release Boundary

V5 may claim a broad V5 replacement track for mainstream browser 3D workflows covered by the compatibility matrix, examples, templates, docs, package smoke, and comparison reports. It must not claim full Three.js API parity, full Three.js ecosystem replacement, WebXR parity, Unity replacement, Unreal replacement, or broad performance superiority.
