# Asset Corpus Report

Version: 1.0.5

This page describes the local asset corpus that is present in the repository.

## Local Corpus

| Corpus | Source |
|---|---|
| Product and material GLB fixtures | `fixtures/asset-corpus/manifest.json` |
| HDR environment fixtures | `fixtures/environment-corpus/manifest.json` |
| Khronos glTF sample manifest | `tests/assets/corpus/gltf-corpus.manifest.json` |
| Animated character manifest | `tests/assets/corpus/animated-character-corpus.manifest.json` |
| Blender export fixtures | `tests/assets/corpus/blender/blender-export-fixtures.manifest.json` |

The product/material fixture manifest currently lists seven local GLB assets. The environment manifest lists named HDRI fixtures used by production and route surfaces.

## Related Code

- `packages/assets/src/AssetCorpus.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/loadRenderableAsset.ts`
- `packages/assets/src/createRenderableScene.ts`
- `packages/environments/src/index.ts`

## Verification

Useful focused commands:

```sh
pnpm exec vitest run --config tests/assets/vitest.config.ts
```

Generated report files under `tests/reports/` are ignored by git and may be absent until the relevant command runs.

## Boundaries

