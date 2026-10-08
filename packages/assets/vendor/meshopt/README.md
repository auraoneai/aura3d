# meshopt_decoder (vendored)

Vendored copy of the meshoptimizer GLB extension decoder used by the
`@aura3d/assets` C-16 registry (`AssetDecoderRegistry.loadMeshoptModule`,
`KTX2BasisTextureTranscoder.probeMeshoptPackage`).

- **Upstream:** https://github.com/zeux/meshoptimizer
- **Source of this copy:** `meshoptimizer@1.2.0` npm package, `meshopt_decoder.mjs`
- **File:** `meshopt_decoder.mjs` — sha256 `cb08bf53ad8ad9693d8bb759b2dbade350eb38bcce63d005385e225b564c5f6a`
- **License:** MIT (see upstream).
- **API used:** `MeshoptDecoder` ES module export (`ready`, `decodeVertexBuffer`,
  `decodeIndexBuffer`, `decodeIndexSequence`, `decodeGltfBuffer`,
  `decodeGltfBufferAsync`, `supported`, `useWorkers`).

## Serving layout

App builds copy this directory to `<base>/aura-decoders/meshopt/` (repo dev
servers serve `public/aura-decoders/meshopt/`). The browser path loads the
ESM via dynamic `import()` from that same-origin URL — never a CDN or an
npm specifier the consumer bundler must resolve. The Node/test path
resolves the `meshoptimizer` npm package or this vendored copy.
