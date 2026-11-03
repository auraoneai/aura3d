# Independently generated Basis KTX2 fixture

- File: `ktx2-red-4x4.ktx2` (316 bytes).
- SHA-256: `50e9c1550c9b1e94c6e9f5ac66858241d57bf75e56e82f0af045c1cc56d506e8`.
- Source image: 16 identical RGBA pixels `(224, 32, 16, 255)`, authored in this repository for this test. No external image or model was used.
- Fixture license: CC0-1.0.
- Encoder: locally installed Basis Universal encoder distributed in `@loaders.gl/textures` 4.4.1 (MIT package; Basis Universal uses Apache-2.0), with no network access. Generator script used `BasisEncoder.setCreateKTX2File(true)`, `setKTX2UASTCSupercompression(false)`, `setKTX2SRGBTransferFunc(false)`, `setSliceSourceImage(0, pixels, 4, 4, false)`, `setPerceptual(false)`, `setMipSRGB(false)`, `setQualityLevel(128)`, `setUASTC(false)`, `setMipGen(false)`; output is the first `encode()` bytes of a 65536-byte buffer.
- Encoder JS SHA-256: `d204cc62dfdf910f92bce616872a6d6057b6d2b45bbaffbc0ef047375351e4a6`.
- Encoder WASM SHA-256: `62ce0364ea8f4969e1e4277ce275213dcce5b234c8c96586da06e3879010341c`.
- Expected: valid ETC1S Basis KTX2 container, one mip, 4 × 4 pixels. Decoded RGBA8 is opaque red; ETC1S is lossy, so compare RGB with a tolerance rather than exact bytes.
