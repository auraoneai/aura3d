# Renderer Environment Lighting

Version: 1.4.5

Environment lighting is implemented through renderer environment resources, environment presets, and fixture manifests.

## Current Code

- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/rendering/src/EnvironmentLighting.ts`
- `packages/rendering/src/EnvironmentPlatform.ts`
- `packages/rendering/src/EnvironmentPreset.ts`
- `packages/environments/src/index.ts`
- `fixtures/environment-corpus/manifest.json`

## Current Behavior

- Rendering-internal cubemap and equirectangular backgrounds have directional browser-pixel evidence.
- GGX PMREM and the split-sum BRDF LUT have roughness-response and energy-conservation evidence.
- The production-runtime RGBE path loads URL or Blob Radiance HDR files into disposable renderer-ready environment resources.
- Live cube-camera captures bind six refreshed faces into PBR environment sampling.
- Bounded scene-color transmission/refraction captures opaque color, excludes recursive self-sampling, and uses roughness mips.
- Generated terrain heightfields provide indexed PBR geometry, bounds, normals, tangents, UVs, and a future-collider descriptor.
- Rendering-internal `RectAreaLight` emitters carry finite dimensions and orientation through scene serialization, direct-light packing, clustered textures, and all PBR-family shaders. Studio/product key rigs integrate the emitting surface with deterministic two-by-two quadrature.
- Environment preset and fog/stage helpers remain separately scoped.

## Boundaries

These are `rendering` or `production-runtime` capabilities, not automatic root
`createAuraApp` claims. OpenEXR decode, physical Rayleigh/Mie atmosphere, three.js LTC
lookup-table identity, rectangular-light shadow maps, planar mirrors, physical caustics,
and native terrain collision are not implemented. Rendering-internal finite rectangular
emitters have size-dependent and one-sided WebGL2 pixel proof; rendering-internal linear
and exponential-squared fog have deterministic
WebGL2 object-pixel and screenshot proof; that evidence does not establish volumetric
scattering, physical atmosphere, automatic preset attachment, or root `createAuraApp`
support.
