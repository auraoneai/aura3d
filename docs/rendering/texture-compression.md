# Renderer Texture Compression

## Superiority (K1 · 2026-09-04)

- Covered at matrix level only: M2 decoder/streaming rows are mapped in
  `tests/reports/muse3jsparity/matrix-check.json` with every GAP owned.
  No standalone K1 wall-clock or capture number exists for compression
  itself — ordered KTX2/transcoding proof lives in the decoder reports
  cited under Current Behavior, not here.

Version: 2.0.3

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

