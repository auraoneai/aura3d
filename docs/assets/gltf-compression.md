# glTF Compression Decoder Status

This page records the asset-pipeline compression behavior verified in the v2 asset slice.

## Geometry Compression

- `EXT_meshopt_compression` is wired through `GLTFLoaderOptions.meshoptDecoder`.
- `KHR_draco_mesh_compression` is wired through `GLTFLoaderOptions.dracoDecoder`.
- `createMeshoptDecoder()` adapts the `meshoptimizer` package `MeshoptDecoder.decodeGltfBuffer()` API to `GLTFLoaderOptions.meshoptDecoder`.
- `createDracoDecoder()` adapts a `draco3d.createDecoderModule()` result to `GLTFLoaderOptions.dracoDecoder`.
- The loader validates extension declaration, source buffer ranges, descriptor fields, decoded byte lengths, decoded attribute rows, and decoded index bounds before exposing mesh data.
- No decoder package is bundled by `@galileo3d/assets`. Applications must install and inject decoder packages explicitly. The repository dev environment pins `draco3d` and `meshoptimizer` so package-backed integration tests run instead of skipping.

Example package-backed setup:

```ts
import { GLTFLoader, createDracoDecoder, createMeshoptDecoder } from "@galileo3d/assets";
import { MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3d";

const dracoModule = await draco3d.createDecoderModule();
const loader = new GLTFLoader({
  meshoptDecoder: createMeshoptDecoder(MeshoptDecoder),
  dracoDecoder: createDracoDecoder(dracoModule)
});
```

## KTX2/Basis

`KHR_texture_basisu` and `image/ktx2` sources are accepted as glTF image and texture metadata. `createGLTFRenderResources()` now uses `transcodeKTX2BasisTexture()` for KTX2/Basis images when the default image decoder is used.

Current supported path:

- The loader preserves embedded KTX2 bytes and texture source references.
- The render-resource layer transcodes KTX2/Basis payloads through `@loaders.gl/textures`.
- The default target is `etc2-rgba8unorm`, which WebGL2 can upload without an extension.
- `createGLTFRenderResources({ ktx2BasisTargetFormat })` can request `etc2-rgba8unorm`, `bc3-rgba-unorm`, `astc-4x4-rgba-unorm`, or `rgba8`.
- Compressed targets include RGBA8 fallback mip levels for devices that cannot upload the requested compressed format.

Current limits:

- This is a bounded runtime texture path, not a broad production asset-pipeline claim.
- Renderer capability-driven GPU format choice is not yet integrated into the asset path.
- Browser deployments must make the loaders.gl Basis encoder WASM assets reachable, either through the default CDN behavior or bundler-specific asset hosting.
- Current verification uses a small real Khronos KTX2 fixture, not a broad KTX2/Basis corpus or visual parity matrix.

## Verification

- `tests/assets/gltf-compression-decoders.test.ts` proves Meshopt and Draco hook routing, missing-decoder diagnostics, and KTX2/Basis transcoding into renderer texture resources with compressed mips and RGBA8 fallback mips.
- `tests/assets/gltf-optional-external-decoders.test.ts` is an executable package-backed integration test. In the checked-in dev environment it loads pinned Khronos Meshopt and Draco assets through `meshoptimizer` and `draco3d`. It still skips honestly if a downstream installation removes either optional package.
- `tests/assets/asset-cache-scale.test.ts` proves cache diagnostics, duplicate in-flight load sharing, retry recovery, dependency cleanup, and aborted-load cleanup at bounded scale.
