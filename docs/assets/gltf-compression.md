# glTF Compression Decoder Status

Version: `1.0.0`

Aura3D has public hooks for mesh and texture compression paths in the asset pipeline.

## Current Code

- `packages/assets/src/GLTFCompressionDecoders.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/KTX2BasisTextureTranscoder.ts`
- `tests/browser/asset-compression-browser.spec.ts`
- `tests/assets/`

## Supported Paths

- `KHR_draco_mesh_compression` through a configured Draco decoder.
- `EXT_meshopt_compression` through a configured Meshopt decoder.
- `KHR_texture_basisu` / KTX2-facing texture transcoding helpers.
- Loader diagnostics for required extensions that cannot be decoded in the current environment.

## Verification

Useful focused checks:

```sh
pnpm exec vitest run --config tests/assets/vitest.config.ts
pnpm exec playwright test tests/browser/asset-compression-browser.spec.ts
```

## Boundaries

Compression support depends on decoder availability and browser/runtime environment. Do not document universal Draco, Meshopt, KTX2, or Basis behavior without a passing route, unit test, and report for that exact path.
