# draco_decoder (vendored)

Vendored copy of the Google Draco mesh-compression decoder used by the
`@aura3d/assets` `KHR_draco_mesh_compression` decode path
(`AssetDecoderRegistry` → `createDracoDecoder`).

- **Upstream:** https://github.com/google/draco
- **Source of this copy:** `three@0.185.1` npm package,
  `examples/jsm/libs/draco/gltf/` (the glTF decoder build; `draco3d@1.5.7`
  in the root lockfile carries the same decoder revision).
- **Files:**
  - `draco_decoder.js` — sha256 `8625489da79a805f4f2a7d511c3e52d8b4085608a9d2a4d5f4f9de5db0aea04f`
  - `draco_decoder.wasm` — sha256 `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac`
- **License:** Apache License 2.0 (upstream `google/draco` repo).
- **API used:** `DracoDecoderModule({ locateFile })` UMD factory →
  `{ Decoder, DecoderBuffer, Mesh, DracoFloat32Array, DracoInt32Array,
  TRIANGULAR_MESH, destroy }` consumed by `GLTFCompressionDecoders.ts`.

## Serving layout

App builds copy this directory to `<base>/aura-decoders/draco/` (repo dev
servers serve `public/aura-decoders/draco/`). Loaded only on
`registry.require(["draco"])`.
