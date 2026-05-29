# Aura3D Asset Corpus

The executable asset-corpus test generates its fixtures under
`tests/reports/asset-corpus-workspace/` so binary and large files are not kept in
the repository.

Current generated/adversarial cases cover:

- valid small GLB
- large GLB over the warning budget
- `.gltf` with an external `.bin`
- `.gltf` with an external texture
- `.gltf` with a missing external `.bin`
- `.gltf` with a missing texture
- `.glb` that references a missing external texture
- malformed GLB
- file extension that lies
- unsupported extension
- file names with spaces
- unicode file names
- duplicate asset IDs
- nested directory assets
- KTX2 texture extension handling

The executable asset corpus also copies selected pinned local fixtures into the
temporary test workspace and runs them through `aura3d assets add`,
`validate`, and typegen:

| Fixture | Local Source | License / Source Notes | Purpose |
|---|---|---|---|
| Duck GLB | `fixtures/asset-corpus/duck.glb` | Khronos glTF Sample Assets metadata; importer validation only | small real GLB |
| Damaged Helmet GLB | `fixtures/asset-corpus/damaged-helmet.glb` | Khronos glTF Sample Assets metadata; importer validation only | textured PBR GLB |
| Antique Camera GLB | `fixtures/asset-corpus/antique-camera.glb` | Khronos glTF Sample Assets metadata; importer validation only | larger product-form GLB |
| Boom Box GLB | `fixtures/asset-corpus/boom-box.glb` | CC0-1.0 | larger textured product GLB |
| Avocado GLB | `fixtures/asset-corpus/avocado.glb` | CC0-1.0 | organic PBR GLB |
| Clear Coat Test GLB | `fixtures/asset-corpus/clear-coat-test.glb` | Khronos glTF Sample Assets metadata; importer validation only | clearcoat material-extension GLB |
| Sheen Test Grid GLB | `fixtures/asset-corpus/sheen-test-grid.glb` | Khronos glTF Sample Assets metadata; importer validation only | sheen material-extension GLB |
| Fox GLB | `tests/assets/corpus/khronos/Fox/Fox.glb` | CC-BY-4.0, pinned source details in `tests/assets/corpus/khronos/Fox/README.md` | animation/skinning metadata |
| Vulkan Samples Primitives glTF | `tests/assets/corpus/blender/vulkan-samples/primitives.gltf` | Apache-2.0, pinned source details in `tests/assets/corpus/blender/blender-export-fixtures.manifest.json` | Blender-exported glTF |
| KTX2 normal texture | `tests/assets/corpus/ktx2/Rib_N.ktx2` | local repository fixture; source review required before product use | KTX2 typegen/validation |

The executable asset corpus also downloads selected external fixtures at test
time into `tests/reports/asset-corpus-workspace/` so external binaries and image
textures are not committed:

| Fixture | External Source | License / Source Notes | Purpose |
|---|---|---|---|
| Poly Haven Arm Chair 01 1k glTF | Poly Haven API/files | CC0 | real external `.gltf` with `.bin` plus nested JPG texture dependencies |
| Khronos Box glTF-Draco | Khronos glTF Sample Models | CC-BY-4.0 | real Draco-compressed glTF using `KHR_draco_mesh_compression` and an external `.bin` |
| Sketchfab Mermaid2 GLB | Sketchfab API authenticated download, model `01371cd3990f4d9587d40244b5e2a0a8` | CC0 Public Domain | authenticated external GLB download, `assets add`, validation, typegen, build, and browser-render evidence in `docs/project/sketchfab-asset-corpus-results.md` |

External wild-asset confidence is still not complete. Authenticated Sketchfab
CC0 proof now passes, but Meshy coverage still requires a generated/exported
asset or API credential. Add those source/license notes and run the same
add/validate/typegen/render flow before broad generated-asset confidence is
claimed.
