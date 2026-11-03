# draco_decoder (vendored)

Vendored copy of the Google Draco mesh-compression decoder used by the
`@aura3d/assets` `KHR_draco_mesh_compression` decode path
(`AssetDecoderRegistry` → `createDracoDecoder`).

- **Upstream:** [Google Draco](https://github.com/google/draco), tag `1.5.6`,
  commit `9f856abaafb4b39f1f013763ff061522e0261c6f`.
- **Direct source:** `javascript/draco_decoder_gltf.js` and
  `javascript/draco_decoder_gltf.wasm` at that commit. The previous vendor
  copies were recorded as acquired through an intermediary distribution;
  these files were reacquired directly from the upstream project and verified
  against the SHA-256 values below. The source URLs, original upstream names,
  and acquisition record are in [`../codec-provenance.json`](../codec-provenance.json).
  This vendor revision is distinct from the separately used `draco3d` 1.5.7.
- **Files:**
  - `draco_decoder.js` — sha256 `8625489da79a805f4f2a7d511c3e52d8b4085608a9d2a4d5f4f9de5db0aea04f`
  - `draco_decoder.wasm` — sha256 `a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac`
- **License:** Apache License 2.0 ([`LICENSE.txt`](LICENSE.txt)).
- **API used:** `DracoDecoderModule({ locateFile })` UMD factory →
  `{ Decoder, DecoderBuffer, Mesh, DracoFloat32Array, DracoInt32Array,
  TRIANGULAR_MESH, destroy }` consumed by `GLTFCompressionDecoders.ts`.

## Serving layout

App builds copy this directory to `<base>/aura-decoders/draco/` (repo dev
servers serve `public/aura-decoders/draco/`). Loaded only on
`registry.require(["draco"])`. Keep the license file with the decoder when
redistributing it. The generated `.mjs` file carries a notice describing the
module wrapper added by Aura3D.

The current upstream JavaScript contains an embedded asm.js implementation;
the presence of the sidecar `.wasm` alone does not establish that the current
JavaScript executes it. The upstream WASM wrapper is a different artifact.
