# Renderer Texture Compression

The renderer texture contract now accepts bounded compressed GPU texture payloads:

- `bc1-rgba-unorm`
- `bc3-rgba-unorm`
- `etc2-rgba8unorm`
- `astc-4x4-rgba-unorm`

`Texture.byteLength` reports compressed GPU payload bytes for those formats. `fallbackData` or `fallbackMipLevels` can carry same-size RGBA8 data for devices that cannot upload a requested compressed format.

```ts
const texture = new Texture({
  width: 8,
  height: 8,
  format: "bc1-rgba-unorm",
  data: new Uint8Array(32),
  fallbackData: new Uint8Array(8 * 8 * 4)
});
```

Compressed textures can also carry explicit mip chains:

```ts
const texture = new Texture({
  width: 8,
  height: 8,
  format: "etc2-rgba8unorm",
  mipLevels: [
    { width: 8, height: 8, data: new Uint8Array(64) },
    { width: 4, height: 4, data: new Uint8Array(16) }
  ],
  fallbackMipLevels: [
    { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) },
    { width: 4, height: 4, data: new Uint8Array(4 * 4 * 4) }
  ]
});
```

The WebGL2 backend attempts native compressed upload when the required extension or WebGL2 ETC2 format is available. If the format is unavailable and RGBA8 fallback levels exist, it uploads the fallback pixels instead and reports fallback counters in `RenderDeviceDiagnostics`:

- `compressedTextures`
- `compressedTextureBytes`
- `textureFallbacks`
- `textureFallbackBytes`

## Limits

- The asset package has a bounded KTX2/Basis adapter through `@loaders.gl/textures` that can transcode real `image/ktx2` inputs to ETC2, BC3, ASTC 4x4, or RGBA8 payloads and attach RGBA8 fallback mip levels.
- The default glTF render-resource path targets `etc2-rgba8unorm`, because ETC2 is available in WebGL2. Applications can override the target through `createGLTFRenderResources({ ktx2BasisTargetFormat })`.
- This is not a full production texture pipeline claim. GPU-format selection is not yet driven by a renderer capability query, transcoder WASM loading still depends on the host bundler/CDN setup in browser deployments, and the corpus coverage is currently a small real KTX2 fixture rather than broad asset validation.

## Verification

- `tests/unit/rendering/resource-lifetime.test.ts` validates compressed byte accounting, payload sizes, and fallback-data contracts.
- `tests/assets/gltf-compression-decoders.test.ts` transcodes a real Khronos KTX2/Basis fixture into ETC2 mip levels plus RGBA8 fallback levels, then routes it through `createGLTFRenderResources()`.
- WebGL2 diagnostics expose compressed upload/fallback counters when compressed textures are bound through material samplers.
