# meshopt_decoder (vendored)

Vendored copy of the meshoptimizer GLB extension decoder used by the
`@aura3d/assets` C-16 registry (`AssetDecoderRegistry.loadMeshoptModule`,
`KTX2BasisTextureTranscoder.probeMeshoptPackage`).

- **Upstream:** [meshoptimizer](https://github.com/zeux/meshoptimizer), release
  `v1.2` / npm package `meshoptimizer@1.2.0`, commit
  `9d9890c73011d75920af614485296d1e03e95448`.
- **ES module:** [`js/meshopt_decoder.mjs`](https://raw.githubusercontent.com/zeux/meshoptimizer/9d9890c73011d75920af614485296d1e03e95448/js/meshopt_decoder.mjs)
  — SHA-256 `cb08bf53ad8ad9693d8bb759b2dbade350eb38bcce63d005385e225b564c5f6a`.
- **CommonJS module:** [`js/meshopt_decoder.cjs`](https://raw.githubusercontent.com/zeux/meshoptimizer/9d9890c73011d75920af614485296d1e03e95448/js/meshopt_decoder.cjs)
  — SHA-256 `fedf06f101ff2ba59d66335578230b7e8f5fac5057dee084be64c67444ac6c12`.
- **License:** MIT; the complete copyright and permission notice is in
  [`LICENSE.txt`](LICENSE.txt), copied from the same
  [upstream revision](https://raw.githubusercontent.com/zeux/meshoptimizer/9d9890c73011d75920af614485296d1e03e95448/LICENSE.md).
  Its SHA-256 is `f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26`.
- **API used:** `MeshoptDecoder` ES module export (`ready`, `decodeVertexBuffer`,
  `decodeIndexBuffer`, `decodeIndexSequence`, `decodeGltfBuffer`,
  `decodeGltfBufferAsync`, `supported`, `useWorkers`).

## Serving layout

App builds copy this directory, including the license notice, to
`<base>/aura-decoders/meshopt/` (repo dev servers serve
`public/aura-decoders/meshopt/`). The browser path loads the ESM via dynamic
`import()` from that same-origin URL — never a CDN or an npm specifier the
consumer bundler must resolve. The Node/test path resolves the `meshoptimizer`
npm package or this vendored copy. The native render worker bundles its own
decoder asset and retains the same notice alongside that distribution.
