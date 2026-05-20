# Asset Corpus Report

Version: 0.1.0-alpha.0

This page summarizes the current asset evidence. It is intentionally split between source classification, loader compatibility, production viewer assets, and visual route evidence.

## Current Asset Reports

| Report | Purpose |
| --- | --- |
| `tests/reports/gltf-corpus.json` | Bounded Khronos loader corpus report. |
| `tests/reports/gltf-100-classification.json` | 100 pinned Khronos GLB source-classification report. |
| `tests/reports/asset-compatibility-threejs.json` | Loader compatibility scaffold with Galileo3D, Three.js, and Babylon.js columns. |
| `tests/reports/blender-export-validation.json` | Three pinned Blender-export fixture validations. |
| `tests/reports/v6-asset-readiness.json` | v6 production asset/environment readiness across real GLBs and HDR environments. |
| `tests/reports/v8-assets.json` | v8 route asset corpus used by flagship, animation, material, loader, and physics surfaces. |

## Current v8 Corpus

`tests/reports/v8-assets.json` currently passes and records:

| Metric | Value |
| --- | ---: |
| Asset count | 20 |
| Environment count | 2 |
| SHA-verified assets | 20 |
| Total bytes | 101859800 |
| Total triangles | 490350 |
| Textured PBR assets | 15 |
| Animation assets | 9 |
| Skin assets | 4 |
| Morph assets | 2 |
| Material-extension assets | 6 |

Feature coverage includes animation, skinning, morph targets, PBR metallic-roughness, normal textures, ORM textures, emissive textures, material extensions, texture transform, material variants, real geometry, and textures.

## Current v6 Corpus

`tests/reports/v6-asset-readiness.json` currently passes and records 28 real parsed GLB assets, 28 SHA-verified assets, 25 PBR texture assets, 6 advanced-material assets, 6 animation assets, 2 skin assets, 1 morph asset, and extension coverage including `KHR_materials_clearcoat`, `KHR_materials_sheen`, `KHR_materials_specular`, and `KHR_animation_pointer`.

The v6 readiness path is the stronger production-viewer evidence because it pairs assets with rendered screenshots, HDR environments, and app-suite reports. The v8 path is broader route evidence.

## Blender And Khronos Evidence

The Khronos source revision remains `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf` for the primary glTF sample assets. The 100-asset classification proves breadth of pinned source coverage, not visual compatibility. The Blender-export fixtures prove three bounded Blender-generated glTF inputs can be loaded into renderable scenes; they do not prove a local Blender export round trip or broad DCC compatibility.

## Known Caveats

- Many sample assets carry upstream license, trademark, or suitability caveats. They are good validation inputs, not necessarily product art.
- Asset readiness is not the same as visual quality. Some animation and demo routes are functional but not visually competitive.
- v8 flagship currently has real asset/HDR loading costs; do not claim instant startup or streaming until dedicated preload/streaming work exists.
- The compatibility scaffold prevents ungrounded claims, but broad Three.js/Babylon.js loader parity still requires per-feature visual and runtime evidence.

## Verification

- `tests/reports/v8-assets.json`
- `tests/reports/v6-asset-readiness.json`
- `tests/reports/gltf-100-classification.json`
- `tests/reports/blender-export-validation.json`
- `tests/assets/gltf-compression-decoders.test.ts`
- `tests/assets/gltf-optional-external-decoders.test.ts`
