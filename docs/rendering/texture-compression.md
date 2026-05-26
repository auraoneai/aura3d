# Renderer Texture Compression

Version: `1.0.0`

Texture compression support is split between asset decoding/transcoding and renderer texture submission.

## Current Code

- `packages/assets/src/KTX2BasisTextureTranscoder.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/rendering/src/Texture.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/WebGPUDevice.ts`
- `tests/browser/asset-compression-browser.spec.ts`
- `tests/assets/corpus/ktx2/Rib_N.ktx2`

## Current Behavior

- KTX2/Basis-facing data can be represented by asset and texture pipeline helpers.
- Renderer texture utilities know compressed format sizing and block-byte calculations.
- Route and test coverage exists for selected local KTX2/compressed texture cases.

## Boundaries

Compressed texture support depends on browser/device extensions, transcoder availability, texture format, and fallback policy. Do not claim universal KTX2/Basis support without a passing device-specific report.
