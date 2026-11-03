# Khronos conformance fixture licenses (PRD-04 corpus)

All `.glb` files in this directory added for the prd04 lane come from the
public Khronos glTF-Sample-Assets repository and remain under their upstream
licenses. `scenes/prd04/assets.ts` records the per-file `provenance` (source
URL or encoder command + version) next to each sha256.

| File | Upstream model | License | Copyright |
|---|---|---|---|
| `texture-transform-test.glb` | TextureTransformTest | CC0 1.0 | Cesium (donated), packed from glTF + PNG sources to GLB |
| `normal-tangent-test.glb` | NormalTangentTest | CC0 1.0 | Khronos |
| `normal-tangent-mirror-test.glb` | NormalTangentMirrorTest | CC-BY 4.0 | Autodesk (via Khronos) |
| `iridescence-lamp.glb` | IridescenceLamp | CC-BY 4.0 | Wayfair (via Khronos) |
| `anisotropy-barn-lamp.glb` | AnisotropyBarnLamp | CC-BY 4.0 | Shopify (via Khronos) |
| `anisotropy-rotation-test.glb` | AnisotropyRotationTest | CC-BY 4.0 | Shopify (via Khronos) |
| `dispersion-test.glb` | DispersionTest | CC-BY 4.0 | Shopify (via Khronos) |
| `materials-variants-shoe.glb` | MaterialsVariantsShoe | CC-BY 4.0 | AGI / Shopify (via Khronos) |
| `alpha-blend-mode-test.glb` | AlphaBlendModeTest | CC-BY 4.0 | Khronos |
| `compare-transmission.glb` | CompareTransmission | LicenseRef-LegalMark-Khronos | Khronos (screenshot/limitation notice retained) |
| `damaged-helmet-uastc.glb` | DamagedHelmet + UASTC | CC-BY 4.0 (model) | theblueturtle_ / Khronos; encoded `gltf-transform uastc` 4.5.1 + toktx 4.4.0 |
| `damaged-helmet-etc1s.glb` | DamagedHelmet + ETC1S | CC-BY 4.0 (model) | theblueturtle_ / Khronos; encoded `gltf-transform etc1s` 4.5.1 + toktx 4.4.0 |
| `textures/metal-plates-013-1k/*.png` | Poly Haven "Metal Plates 013" | CC0 1.0 | Poly Haven |

CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/
LicenseRef-LegalMark-Khronos: https://registry.khronos.org/glTF-Sample-Assets/models/CompareTransmission

## Source-pass fixtures (5.0, 2026-11-02)

The files below are tracked so the clean-checkout source pass can run the
tests that read them. Each Khronos file is byte-identical to the upstream file
at glTF-Sample-Assets revision `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf`;
source URLs, full attribution and SHA-256 digests are in
[`khronos-sources.json`](khronos-sources.json).

| File | Upstream model | License (SPDX, from upstream `metadata.json`) | Attribution |
|---|---|---|---|
| `cesium-man.glb` | CesiumMan | LicenseRef-CC-BY-TM; LicenseRef-LegalMark-Cesium (logo) | Cesium, 2017 |
| `animated-morph-cube.glb` | AnimatedMorphCube | CC0-1.0 | Microsoft, 2017 |
| `clear-coat-test.glb` | ClearCoatTest | CC-BY-4.0 | Ed Mackey, Analytical Graphics, Inc., 2020 |
| `antique-camera.glb` | AntiqueCamera | CC0-1.0; LicenseRef-LegalMark-UX3D (logo) | Maximillan Kamps, UX3D, 2018 |
| `sheen-test-grid.glb` | SheenTestGrid | CC0-1.0 | Eric Chadwick, 2023 |
| `compare-transmission.glb` | CompareTransmission | CC0-1.0; LicenseRef-LegalMark-Khronos (glTF logo) | Eric Chadwick and DGG, 2024 |
| `normal-tangent-mirror-test.glb` | NormalTangentMirrorTest | CC-BY-4.0 | Ed Mackey, Analytical Graphics, Inc., 2018 |
| `materials-variants-shoe.glb` | MaterialsVariantsShoe | CC-BY-4.0 | Shopify, 2021 |
| `damaged-helmet-draco.glb`, `damaged-helmet-meshopt.glb` | DamagedHelmet (derived) | CC-BY-4.0 (ctxwing, 2018); earlier version CC-BY-NC-4.0 (theblueturtle_, 2016) | Generated from the tracked `damaged-helmet.glb` by `node tools/generate-prd04-compressed-fixtures.mjs` (deterministic; regeneration is byte-identical) |

LicenseRef-CC-BY-TM / LegalMark texts: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/LICENSES
