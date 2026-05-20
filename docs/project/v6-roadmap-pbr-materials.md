# PBR Materials

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 currently proves PBR material ingestion and WebGL2 rendering for real glTF assets with base color, metallic roughness, normal, occlusion, emissive, clearcoat, sheen, and specular metadata coverage.

The current claim is material coverage with renderer proof, evidence-scoped physical material coverage across measured extensions. Advanced extension behavior is reported, bounded, and compared where evidence exists.

## Public Material Diagnostics

The public `loadGltfScene()` API exposes material metadata through `scene.metadata`. The flagship viewer renders those diagnostics in its material panel instead of hiding unsupported features.

Important fields:

- `materialCount`
- `textureCount`
- `normalMapCount`
- `ormTextureCount`
- `emissiveTextureCount`
- `materialFeatures`
- `extensionsUsed`
- `extensionsRequired`
- `unsupportedExtensions`
- `warnings`

The viewer displays material counts, normal maps, ORM textures, emissive textures, feature names, unsupported extension counts, and warning counts.

## Supported And Bounded Features

| Feature | V6 status | Notes |
|---|---|---|
| Base color | Rendered | Factor and texture are preserved. |
| Metallic roughness | Rendered | Factor and texture are preserved. |
| Normal map | Rendered | Normal texture and scale are threaded through render resources. |
| Occlusion | Rendered as material data | AO workflow needs stricter side-by-side visual validation before broad claims. |
| Emissive | Rendered as material data | Emissive texture/count diagnostics are surfaced. |
| Clearcoat | Bounded support | Factors and textures are loaded and bound where supported; visual parity still needs broader proof. |
| Sheen | Bounded support | Factors and textures are loaded and bound where supported; visual parity still needs broader proof. |
| Specular | Bounded support | Factors and textures are loaded and bound where supported; visual parity still needs broader proof. |
| Transmission/volume | Bounded/gap | Metadata is surfaced, but mature visual parity is not claimed. |
| Anisotropy/iridescence | Gap unless proven by a specific artifact | Do not market parity without dedicated visual proof. |

## V7 Rule

Material support is not proven by a debug chart or by claiming that a field exists in JSON. It is proven when:

- the loader preserves the material data,
- render resources bind it to a real material,
- the flagship app exposes the diagnostic,
- the visual artifact shows the material behavior clearly enough to inspect,
- the Three.js comparison report names any visible gap.

Primary evidence:

- `tests/reports/v6-pbr-hdr-readiness.json`
- `tests/reports/v6-gltf-render-readiness.json`
- `tests/reports/v6-threejs-parity-readiness.json`
- `tests/reports/v7/product-viewer/product-viewer-report.json`
- `tests/reports/v7/material-extensions/material-extensions.png`
- `tests/reports/v7/material-extensions/material-extensions.json`

V7 adds a dedicated material-extension artifact using real Khronos sample GLBs for:

- `KHR_materials_anisotropy`
- `KHR_materials_iridescence`
- `KHR_materials_transmission`
- `KHR_materials_volume`

## Known Gaps

Do not claim full material parity yet. The remaining required proof is visual, not just structural:

- clearcoat response across multiple real assets
- sheen response on fabric-like assets
- specular extension response under rotated HDR environments
- deeper transmission and volume parity against a mature renderer
- AO energy behavior against direct and indirect lighting
- deeper anisotropy and iridescence parity against a mature renderer
