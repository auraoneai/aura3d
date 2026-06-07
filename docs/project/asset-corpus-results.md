# Asset Corpus Results

Generated: 2026-05-29T18:50:50.596Z

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
- Authenticated Sketchfab CC0 download proof passes in `tests/reports/sketchfab-asset-corpus.json` and `docs/project/sketchfab-asset-corpus-results.md`: `Mermaid2` (`01371cd3990f4d9587d40244b5e2a0a8`) as glb through add/validate/typegen/build/browser-render.
- Meshy exports still require a generated/exported user asset or API credential.
- Run the same add/validate/typegen/render flow against Meshy exports when credentials or licensed files are available before claiming broad generated-asset compatibility.

## Aura Clash 1.0.6 Selected Asset Findings

Source of truth:

- Manifest: `apps/aura-clash-showcase/aura.assets.json`
- Provenance: `apps/aura-clash-showcase/assets/quaternius-asset-provenance.json`, `apps/aura-clash-showcase/assets/quaternius-selection.json`, and staged license files under `apps/aura-clash-showcase/assets/quaternius-source/selected/licenses/`
- Browser gate: `apps/aura-clash-showcase/tests/asset-quality.spec.ts`

| Asset | Use | Source | License/provenance | Checksum | Bounds | Clips/materials | Approval status |
|---|---|---|---|---|---|---|---|
| `auraClashPlayerRig` | Player fighter rig | `assets/quaternius-source/selected/animations/UAL1_Standard.glb` | Quaternius Universal Animation Library / Universal Base Characters staged source; local license text records CC0 1.0 Universal / Public Domain Dedication. | `sha256-d867292451e432b735e2a910c2db6640fbea97b205d85a2e8ffed26da87972cf` | `[1.944, 1.829, 0.37]` | 45 embedded clips including `Idle_Loop`, `Hit_Chest`, `Hit_Head`, `Crouch_Fwd_Loop`; materials `M_Main`, `M_Joints`. | Approved for current automated 1.0.6 typed-asset proof; human visual approval of final screenshots remains separate. Warnings: no texture references; orientation metadata missing. |
| `auraClashRivalRig` | Rival fighter rig | `assets/quaternius-source/selected/animations/UAL2_Standard.glb` | Quaternius Universal Animation Library 2 / Universal Base Characters staged source; local license text records CC0 1.0 Universal / Public Domain Dedication. | `sha256-9a0ffda4931f934f13fb584002c51673723b03f9655a581167e7e5dae744f086` | `[1.944, 1.829, 0.37]` | 43 embedded clips including `Idle_FoldArms_Loop`, `Hit_Knockback`, `Hit_Knockback_RM`; materials `M_Main`, `M_Joints`. | Approved for current automated 1.0.6 typed-asset proof; human visual approval of final screenshots remains separate. Warnings: no texture references; orientation metadata missing. |
| `auraClashDuelStage` | Active duel stage model | `assets/source/scenes/aura-clash-duel-stage.glb` | Quaternius Downtown City MegaKit staged source; local license text records CC0 1.0 Universal / Public Domain Dedication. | `sha256-09735d3bb00092a6134152b9fcad57b82fa7d20c1e493442344de7a2d278617d` | `[20.644, 29.125, 18.628]` | 0 clips; static arena materials include `MI_InteriorFloor`, `MI_InteriorRoof`, `MI_Asphalt`, `MI_Ornaments`, `MI_Glass`. | Approved for current automated arena proof; no final human screenshot approval yet. Warning: no texture references detected. |
| `arenaNeonDowntown` | Source/background arena candidate | `assets/source/arenas/arena-neon-downtown.glb` | Quaternius Downtown City MegaKit staged source; local license text records CC0 1.0 Universal / Public Domain Dedication. | `sha256-56a42b193bbce0dc13fc632ac771a17eadbbdbdde0c3267c982fdbefc2318333` | `[20.644, 28.2, 25.322]` | 0 clips; static arena materials include `MI_InteriorFloor`, `MI_InteriorRoof`, `MI_Asphalt`, `Neon_AURA CLASH`, `Neon_NEON ROOFTOP`, `Neon_FIGHT READY`. | Approved as a registered contextual arena asset/candidate, but not a substitute for human visual approval. Warning: no texture references detected. |
| Audio cues | Hit/guard/jump/dash/special/KO/UI cue mapping | `apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest.ts` | No final typed audio file is selected yet; current proof uses synthesized Web Audio cue events. | Not applicable until typed audio assets are registered. | Not applicable. | Cue IDs are mapped and tested; no file clips/stems are registered. | Functional audio-event proof only. Final audio-file approval remains open in the audio-specific PRD rows. |
