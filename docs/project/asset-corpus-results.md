# Asset Corpus Results

Generated: 2026-05-29T04:38:01.316Z

| Case | Expected | Result | Message |
|---|---|---:|---|
| `valid-small-glb` | success | pass | Added validSmall -> /aura-assets/validSmall.ae556abc.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `large-glb-warning` | success | pass | Added largeModel -> /aura-assets/largeModel.dcd98aa6.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `gltf-external-bin` | success | pass | Added externalBin -> /aura-assets/externalBin.b508b3b6.gltf; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `gltf-external-texture` | success | pass | Added externalTexture -> /aura-assets/externalTexture.0660f35b.gltf; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `gltf-missing-bin` | failure | pass | Aura3D assets add failed: referenced asset file missing: missing.bin. Suggested fix: keep external .bin and texture files beside the .gltf or export as .glb. |
| `gltf-missing-texture` | failure | pass | Aura3D assets add failed: referenced asset file missing: missing.png. Suggested fix: keep external .bin and texture files beside the .gltf or export as .glb. |
| `glb-missing-external-texture` | failure | pass | Aura3D assets add failed: referenced asset file missing: missing.png. Suggested fix: keep external .bin and texture files beside the .gltf or export as .glb. |
| `malformed-glb` | failure | pass | Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb). |
| `file-extension-lies` | failure | pass | Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb). |
| `unsupported-extension` | failure | pass | Unsupported Aura3D asset format: txt. Suggested fix: use glb, gltf, png, jpg, webp, ktx2, hdr, exr, mp3, wav, or ogg. |
| `file-with-spaces` | success | pass | Added fileWithSpaces -> /aura-assets/fileWithSpaces.abb4e814.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `unicode-file-name` | success | pass | Added unicodeModel -> /aura-assets/unicodeModel.456d511a.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `duplicate-asset-id` | success | pass | Added duplicateModel -> /aura-assets/duplicateModel.0fe67e10.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `nested-directory-asset` | success | pass | Added nestedModel -> /aura-assets/nestedModel.ce6f1067.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `ktx2-texture-extension` | success | pass | Added ktxTexture -> /aura-assets/ktxTexture.23035988.ktx2; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `external-polyhaven-armchair-cc0-gltf` | success | pass | Added polyhavenArmChair -> /aura-assets/polyhavenArmChair.91e39d5b.gltf; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `external-khronos-draco-box-gltf` | success | pass | Added khronosDracoBox -> /aura-assets/khronosDracoBox.3c46acec.gltf; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-khronos-duck-glb` | success | pass | Added realDuck -> /aura-assets/realDuck.65bf938f.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-damaged-helmet-glb` | success | pass | Added damagedHelmet -> /aura-assets/damagedHelmet.4028ccbc.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-antique-camera-product-glb` | success | pass | Added antiqueCamera -> /aura-assets/antiqueCamera.7480f9be.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-boom-box-cc0-product-glb` | success | pass | Added boomBox -> /aura-assets/boomBox.de9d5954.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-avocado-cc0-organic-glb` | success | pass | Added avocado -> /aura-assets/avocado.2713a264.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-clear-coat-material-glb` | success | pass | Added clearCoatTest -> /aura-assets/clearCoatTest.c3a1cbe3.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-sheen-material-grid-glb` | success | pass | Added sheenGrid -> /aura-assets/sheenGrid.b3d82dde.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-khronos-fox-animation-glb` | success | pass | Added foxAnimation -> /aura-assets/foxAnimation.d97044e7.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-blender-export-gltf` | success | pass | Added blenderPrimitives -> /aura-assets/blenderPrimitives.171a3473.gltf; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `real-ktx2-texture` | success | pass | Added ribNormalKtx2 -> /aura-assets/ribNormalKtx2.7bbd1d77.ktx2; Wrote aura.assets.json; Wrote src/aura-assets.ts |

## Warnings

- antiqueCamera: asset exceeds 25 MB; consider compression before deployment
- blenderPrimitives: no texture references detected
- boomBox: asset exceeds 25 MB; consider compression before deployment
- duplicateModel: no texture references detected
- externalBin: no texture references detected
- fileWithSpaces: no texture references detected
- khronosDracoBox: no texture references detected
- ktxTexture: bounds could not be extracted
- largeModel: asset exceeds 25 MB; consider compression before deployment
- largeModel: no texture references detected
- nestedModel: no texture references detected
- ribNormalKtx2: bounds could not be extracted
- unicodeModel: no texture references detected
- validSmall: no texture references detected

## Source And License Notes

- `external-polyhaven-armchair-cc0-gltf`: Poly Haven API/files: ArmChair_01 1k glTF; CC0; Downloaded at test time into tests/reports only; verifies a real external CC0 model with .gltf, .bin, and external JPG texture dependencies.
- `external-khronos-draco-box-gltf`: Khronos glTF Sample Models: Box/glTF-Draco; CC-BY-4.0; Downloaded at test time into tests/reports only; verifies a real glTF using KHR_draco_mesh_compression and an external .bin buffer.
- `real-khronos-duck-glb`: fixtures/asset-corpus/duck.glb; Khronos glTF Sample Assets metadata; local fixture used for importer validation only; Small real GLB fixture used to verify the CLI handles non-synthetic product/prop assets.
- `real-damaged-helmet-glb`: fixtures/asset-corpus/damaged-helmet.glb; Khronos glTF Sample Assets metadata; local fixture used for importer validation only; Textured PBR GLB fixture used to verify real-material metadata, typed refs, and validation.
- `real-antique-camera-product-glb`: fixtures/asset-corpus/antique-camera.glb; Khronos glTF Sample Assets license metadata; local fixture used for importer validation only; Large product-form GLB fixture used to verify typed refs and validation on a realistic inspectable object.
- `real-boom-box-cc0-product-glb`: fixtures/asset-corpus/boom-box.glb; CC0-1.0; CC0 Khronos Boom Box fixture used to verify a larger textured product asset through add/validate/typegen.
- `real-avocado-cc0-organic-glb`: fixtures/asset-corpus/avocado.glb; CC0-1.0; CC0 Khronos Avocado fixture used to verify an organic PBR asset with texture metadata.
- `real-clear-coat-material-glb`: fixtures/asset-corpus/clear-coat-test.glb; Khronos glTF Sample Assets license metadata; local fixture used for importer validation only; Clearcoat material-extension fixture used to verify metadata extraction on non-basic PBR material coverage.
- `real-sheen-material-grid-glb`: fixtures/asset-corpus/sheen-test-grid.glb; Khronos glTF Sample Assets license metadata; local fixture used for importer validation only; Sheen material-extension grid used to verify metadata extraction on non-basic PBR material coverage.
- `real-khronos-fox-animation-glb`: tests/assets/corpus/khronos/Fox/Fox.glb; CC-BY-4.0; Pinned Khronos animated/skinned character fixture with source details in tests/assets/corpus/khronos/Fox/README.md.
- `real-blender-export-gltf`: tests/assets/corpus/blender/vulkan-samples/primitives.gltf; Apache-2.0; Pinned Blender-exported Vulkan Samples fixture; source manifest is tests/assets/corpus/blender/blender-export-fixtures.manifest.json.
- `real-ktx2-texture`: tests/assets/corpus/ktx2/Rib_N.ktx2; local repository fixture; source review required before product use; Real KTX2 texture fixture used to prove the asset CLI handles KTX2 file typegen/validation.

## Remaining External Corpus Work

- The asset corpus now covers generated/adversarial assets, selected pinned Khronos/product-form/material-extension/Blender-export/animation/textured-PBR/KTX2 fixtures, a downloaded Poly Haven CC0 model, and a downloaded Khronos Draco-compressed glTF.
- Sketchfab CC0 direct model downloads require authenticated API access, and Meshy exports require a generated/exported user asset or API credential.
- Run the same add/validate/typegen/render flow against Sketchfab CC0 and Meshy exports when credentials or licensed files are available before claiming broad asset compatibility.
