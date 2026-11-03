# Independently generated three-level Basis KTX2 fixture

- File: `ktx2-red-mips-4x4.ktx2` (406 bytes).
- SHA-256: `faa461c058aaa3c8be164c9276536b769843b6c5dad0a4f3f89ee3cec47afe88`.
- Source: 16 identical RGBA pixels `(224, 32, 16, 255)`, authored for this fixture. No external image or model was used.
- Fixture license: CC0-1.0.
- Encoder: Basis Universal 1.15 distributed in the locally installed `@loaders.gl/textures` 4.4.1. The package is MIT licensed and Basis Universal is Apache-2.0 licensed. Encoding used no network, browser, GPU, package installation or build.
- Encoder JS SHA-256: `d204cc62dfdf910f92bce616872a6d6057b6d2b45bbaffbc0ef047375351e4a6`.
- Encoder WASM SHA-256: `62ce0364ea8f4969e1e4277ce275213dcce5b234c8c96586da06e3879010341c`.
- Expected: ETC1S Basis KTX2, three levels of 4×4, 2×2 and 1×1 pixels. Decoded RGBA8 is opaque red; compare RGB with a tolerance because ETC1S is lossy.

Reproduce from the repository root with the already installed encoder:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const js = resolve("node_modules/@loaders.gl/textures/dist/libs/basis_encoder.js");
const wasm = readFileSync(resolve("node_modules/@loaders.gl/textures/dist/libs/basis_encoder.wasm"));
const cjs = { exports: {} };
const factory = new Function("module", "exports", "require", "__filename", "__dirname",
  readFileSync(js, "utf8") + "\nreturn module.exports;")
  (cjs, cjs.exports, createRequire(import.meta.url), js, dirname(js));
const lib = await factory({ wasmBinary: wasm });
lib.initializeBasis();
const encoder = new lib.BasisEncoder();
try {
  const pixels = new Uint8Array(64);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([224, 32, 16, 255], i);
  encoder.setCreateKTX2File(true);
  encoder.setKTX2UASTCSupercompression(false);
  encoder.setKTX2SRGBTransferFunc(false);
  encoder.setSliceSourceImage(0, pixels, 4, 4, false);
  encoder.setPerceptual(false);
  encoder.setMipSRGB(false);
  encoder.setQualityLevel(128);
  encoder.setUASTC(false);
  encoder.setMipGen(true);
  const output = new Uint8Array(65536);
  const length = encoder.encode(output);
  writeFileSync("tests/assets/native-fixtures/ktx2-red-mips-4x4.ktx2", output.subarray(0, length));
} finally {
  encoder.delete();
}
```
