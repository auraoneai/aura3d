# External Animated Character Evidence

The current v2 animation evidence includes two pinned externally authored skinned GLB characters:

| Asset | Source | Local fixture | Status |
| --- | --- | --- | --- |
| Cesium Man | Khronos glTF Sample Assets, revision `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf`, `Models/CesiumMan/glTF-Binary/CesiumMan.glb` | `tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` | Imports and renders through browser WebGL skinning; warning only for Cesium trademark/logo limitations. |
| Fox | Khronos glTF Sample Assets, revision `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf`, `Models/Fox/glTF-Binary/Fox.glb` | `tests/assets/corpus/khronos/Fox/Fox.glb` | Imports as one skinned mesh, one 24-joint skin, and three animation clips (`Run`, `Survey`, `Walk`). |

Evidence:

- `tests/assets/corpus/animated-character-corpus.manifest.json` records pinned source URIs, commit revision, SHA-256 hashes, licenses, and the Cesium trademark warning.
- `tests/assets/gltf-animation-corpus.test.ts` validates the manifest, verifies both local fixture hashes, imports Cesium Man as one skinned mesh, one 19-joint skin, and one 57-track animation clip, and imports Fox as one skinned mesh, one 24-joint skin, and three animation clips.
- `tests/browser/animation-browser-harness.ts` loads the same local GLB in the browser, samples the imported animation at two times, builds renderer skinning palettes, and renders the imported mesh with `SkinnedUnlitMaterial`.
- `tests/browser/animation-browser.spec.ts` and `tests/visual/skinned-animation-pixels.spec.ts` assert draw calls, vertex/joint counts, visible pixels, and changed pixels between two sampled animation frames.

This is real external animated-character corpus evidence for two different externally authored rigs and clip layouts, but it is still intentionally bounded. It does not establish retargeting coverage, production animation-authoring coverage, or ecosystem-level compatibility across many skinned meshes. Those claims require additional externally authored characters with different rigs, proportions, animation structures, material layouts, and loader edge cases.
