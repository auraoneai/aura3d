# basis_transcoder (vendored)

Vendored copy of the Basis Universal GPU texture transcoder used by the
`@aura3d/assets` KTX2/Basis decode path (`KTX2BasisTextureTranscoder`,
`KTX2TranscodeWorker`, `AssetDecoderRegistry`).

- **Upstream:** https://github.com/BinomialLLC/basis_universal
- **Source of this copy:** `three@0.185.1` npm package,
  `examples/jsm/libs/basis/`
- **Files:**
  - `basis_transcoder.js` — sha256 `8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1`
  - `basis_transcoder.wasm` — sha256 `6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a`
- **License:** Apache License 2.0 (see `LICENSE` in this directory /
  upstream `basis_universal` repo).
- **API used:** `BASIS({ locateFile })` UMD factory → `Module.initializeBasis()`,
  `Module.KTX2File` (`isValid`, `isUASTC`, `isETC1S`, `getWidth`, `getHeight`,
  `getLevels`, `getLayers`, `getFaces`, `getHasAlpha`, `getDFDFlags`,
  `getImageLevelInfo`, `getImageTranscodedSizeInBytes`, `startTranscoding`,
  `transcodeImage`, `close`, `delete`).

## Serving layout

App builds copy this directory to `<base>/aura-decoders/basis/` (repo dev
servers serve `public/aura-decoders/basis/`). `transcoderUrl` always points at
that same-origin directory — there is no CDN fallback.
