# basis_transcoder (vendored)

Vendored copy of the Basis Universal GPU texture transcoder used by the
`@aura3d/assets` KTX2/Basis decode path (`KTX2BasisTextureTranscoder`,
`KTX2TranscodeWorker`, `AssetDecoderRegistry`).

- **Upstream:** [Basis Universal](https://github.com/BinomialLLC/basis_universal),
  tag `v1_50_0_2`, commit `b76a431c6a39c07fe8bb2edf1cbf44781150ed6b`.
- **Direct source:** `webgl/transcoder/build/` at that commit. The previous
  vendor copies were recorded as acquired through an intermediary distribution;
  these files were reacquired directly from the upstream project and verified
  against the SHA-256 values below. The source URLs and acquisition record are
  in [`../codec-provenance.json`](../codec-provenance.json).
- **Files:**
  - `basis_transcoder.js` — sha256 `8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1`
  - `basis_transcoder.wasm` — sha256 `6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a`
- **Licenses:** Apache License 2.0 ([`LICENSE.txt`](LICENSE.txt)). The upstream
  KTX2 build enables Zstandard by default, so the Zstandard BSD 3-Clause license
  ([`LICENSE-zstd.txt`](LICENSE-zstd.txt)) is included conservatively; the build
  configuration for these prebuilt files is not established.
- **API used:** `BASIS({ locateFile })` UMD factory → `Module.initializeBasis()`,
  `Module.KTX2File` (`isValid`, `isUASTC`, `isETC1S`, `getWidth`, `getHeight`,
  `getLevels`, `getLayers`, `getFaces`, `getHasAlpha`, `getDFDFlags`,
  `getImageLevelInfo`, `getImageTranscodedSizeInBytes`, `startTranscoding`,
  `transcodeImage`, `close`, `delete`).

## Serving layout

App builds copy this directory to `<base>/aura-decoders/basis/` (repo dev
servers serve `public/aura-decoders/basis/`). `transcoderUrl` always points at
that same-origin directory. Keep the license files with the decoder when
redistributing it. The generated `.mjs` file carries a notice describing the
module wrapper added by Aura3D.
