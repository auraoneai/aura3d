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

## Asset Pipeline Integration

- `KHR_texture_basisu` and `image/ktx2` are preserved by the glTF loader.
- `createGLTFRenderResources()` can transcode KTX2/Basis through `@loaders.gl/textures`.
- The default target is `etc2-rgba8unorm`, with RGBA8 fallback mip levels for devices that cannot upload the compressed target.
- `createGLTFRenderResources({ ktx2BasisTargetFormat })` can request ETC2, BC3, ASTC 4x4, or RGBA8 payloads.
- v8 loader routes include KTX2/compression route evidence and screenshots under `tests/reports/v8/loaders`.

## Known Gaps

- GPU-format choice is not yet fully renderer-capability driven across all deployment targets.
- Browser deployments still depend on loaders.gl Basis transcoder assets being reachable through the host bundler or CDN setup.
- The real KTX2/Basis corpus remains small. Do not call this broad texture-compression compatibility.
- Compression upload diagnostics prove resource behavior, not final visual parity.

## Verification

- `tests/unit/rendering/resource-lifetime.test.ts` validates compressed byte accounting, payload sizes, and fallback-data contracts.
- `tests/assets/gltf-compression-decoders.test.ts` transcodes a real Khronos KTX2/Basis fixture into ETC2 mip levels plus RGBA8 fallback levels, then routes it through `createGLTFRenderResources()`.
- WebGL2 diagnostics expose compressed upload/fallback counters when compressed textures are bound through material samplers.
- `tests/reports/v8-assets.json`
- `tests/reports/current-routes-visual-review.json`
