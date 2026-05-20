# External Animated Character Evidence

The current checked external animated-character evidence includes two pinned externally authored skinned GLB characters:

| Asset | Source | Local fixture | Status |
| --- | --- | --- | --- |
| Cesium Man | Khronos glTF Sample Assets, revision `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf`, `Models/CesiumMan/glTF-Binary/CesiumMan.glb` | `tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` | Imports and renders through browser WebGL skinning; warning only for Cesium trademark/logo limitations. |
| Fox | Khronos glTF Sample Assets, revision `2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf`, `Models/Fox/glTF-Binary/Fox.glb` | `tests/assets/corpus/khronos/Fox/Fox.glb` | Imports as one skinned mesh, one 24-joint skin, and three animation clips (`Run`, `Survey`, `Walk`). |

Evidence:

- `tests/assets/corpus/animated-character-corpus.manifest.json` records pinned source URIs, commit revision, SHA-256 hashes, licenses, and the Cesium trademark warning.
- `tests/assets/gltf-animation-corpus.test.ts` validates the manifest, verifies both local fixture hashes, imports Cesium Man as one skinned mesh, one 19-joint skin, and one 57-track animation clip, and imports Fox as one skinned mesh, one 24-joint skin, and three animation clips.
- `tests/browser/animation-browser-harness.ts` loads the same local GLB in the browser, samples the imported animation at two times, builds renderer skinning palettes, and renders the imported mesh with `SkinnedUnlitMaterial`.
- `tests/browser/animation-browser.spec.ts` and `tests/visual/skinned-animation-pixels.spec.ts` assert draw calls, vertex/joint counts, visible pixels, and changed pixels between two sampled animation frames.

## Current Route Context

The v8 app set adds route-level animation surfaces under `apps/v8-animation-*` and `apps/v8-skinning-*`. Those routes prove browser-visible animation behavior across keyframes, blending, additive layers, IK, morphs, multiple agents, and walking. They do not replace the external corpus; the corpus is still only Cesium Man, Fox, and local fixtures.

## Claim Boundary

This is real external animated-character corpus evidence for two different externally authored rigs and clip layouts, but it is still intentionally bounded. It does not establish retargeting coverage, production animation-authoring coverage, or ecosystem-level compatibility across many skinned meshes.

The current character visuals should not be marketed as final Three.js-level character quality. The repo still needs higher-quality licensed characters with multiple clips, better staging, and broader renderer-backed validation before making strong animation parity claims.
