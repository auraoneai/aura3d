# Asset Corpus Results

Generated: 2026-05-28T16:30:03.000Z

| Case | Expected | Result | Message |
|---|---|---:|---|
| `valid-small-glb` | success | pass | Added validSmall -> /aura-assets/validSmall.ae556abc.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `large-glb-warning` | success | pass | Added largeModel -> /aura-assets/largeModel.dcd98aa6.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `gltf-external-bin` | success | pass | Added externalBin -> /aura-assets/externalBin.7ab56b3b.gltf; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `gltf-missing-bin` | failure | pass | Aura3D assets add failed: referenced asset file missing: missing.bin. Suggested fix: keep external .bin and texture files beside the .gltf or export as .glb. |
| `malformed-glb` | failure | pass | Invalid GLB header. Suggested fix: re-export the asset as binary glTF (.glb). |
| `unsupported-extension` | failure | pass | Unsupported Aura3D asset format: txt. Suggested fix: use glb, gltf, png, jpg, webp, ktx2, hdr, exr, mp3, wav, or ogg. |
| `file-with-spaces` | success | pass | Added fileWithSpaces -> /aura-assets/fileWithSpaces.abb4e814.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `unicode-file-name` | success | pass | Added unicodeModel -> /aura-assets/unicodeModel.456d511a.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `duplicate-asset-id` | success | pass | Added duplicateModel -> /aura-assets/duplicateModel.0fe67e10.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `nested-directory-asset` | success | pass | Added nestedModel -> /aura-assets/nestedModel.ce6f1067.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `ktx2-texture-extension` | success | pass | Added ktxTexture -> /aura-assets/ktxTexture.23035988.ktx2; Wrote aura.assets.json; Wrote src/aura-assets.ts |

## Warnings

- duplicateModel: no texture references detected
- externalBin: no texture references detected
- fileWithSpaces: no texture references detected
- ktxTexture: bounds could not be extracted
- largeModel: asset exceeds 25 MB; consider compression before deployment
- largeModel: no texture references detected
- nestedModel: no texture references detected
- unicodeModel: no texture references detected
- validSmall: no texture references detected

## Remaining External Corpus Work

- Add licensed wild GLBs from Sketchfab CC0, Poly Haven, Meshy, Blender exports, Draco, and KTX2-heavy assets.
- Run the same add/validate/typegen/render flow against that external corpus before stable release confidence.
