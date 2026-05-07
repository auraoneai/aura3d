# Renderer Environment Lighting

The renderer accepts a bounded environment-lighting input on `Renderer.render(...)`:

```ts
renderer.render({
  scene,
  geometryLibrary,
  materialLibrary,
  environmentLighting: {
    color: [0.46, 0.56, 0.72],
    intensity: 0.12,
    proceduralMap: {
      skyColor: [0.22, 0.38, 0.82],
      horizonColor: [0.9, 0.7, 0.45],
      groundColor: [0.07, 0.075, 0.08],
      specularColor: [1, 0.9, 0.68],
      intensity: 0.58,
      specularIntensity: 0.34
    },
    environmentMapTexture: new TextureBinding({
      name: "u_environmentMapTexture",
      texture: new Texture({ width: 64, height: 32, colorSpace: "srgb", data: environmentPixels }),
      sampler: new Sampler({ addressU: "repeat", addressV: "clamp-to-edge" }),
      expectedColorSpace: "srgb",
      required: true
    }),
    environmentMapIntensity: 0.42,
    environmentMapSpecularIntensity: 0.24,
    environmentMapMipCount: 3,
    environmentBrdfLutTexture: new TextureBinding({
      name: "u_environmentBrdfLutTexture",
      texture: new Texture({ width: 32, height: 32, colorSpace: "linear", data: brdfLutPixels }),
      sampler: new Sampler({ addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      expectedColorSpace: "linear",
      required: true
    })
  }
});
```

This path feeds `u_environmentColor`, `u_environmentIntensity`, optional `proceduralMap` uniforms, optional sampled environment-map texture uniforms, and an optional BRDF LUT texture into the default `PBRMaterial` shader. Without either optional environment path, the shader applies the older hemispheric diffuse ambient term. With `proceduralMap`, it blends sky, horizon, and ground colors by normal direction and adds a roughness-sensitive procedural specular response. With `environmentMapTexture`, it samples an equirectangular RGBA8 texture for diffuse normal-direction lighting and a reflection-direction highlight. `generateRgba8EnvironmentMipLevels(...)` can build a bounded CPU-generated RGBA8 mip chain, and when `environmentMapMipCount` is set, specular sampling uses roughness-dependent `textureLod(...)`. `generateApproximateBrdfLutPixels(...)` can create the bounded linear RGBA8 LUT used by the examples; when `environmentBrdfLutTexture` is supplied, sampled specular is modulated by that LUT keyed by `NdotV` and roughness. It is intended to keep indirectly lit PBR objects readable in examples and bounded browser tests.

## Limits

- This is not physically correct image-based lighting.
- The sampled texture path currently accepts ordinary `TextureBinding` RGBA8 data and optional authored or helper-generated RGBA8 mip levels. It is not an HDR environment map pipeline.
- The BRDF LUT path is a bounded shader input for examples/tests, not a production-calibrated split-sum implementation.
- There is no irradiance convolution, generated specular prefiltering pipeline, reflection probe, or color-management pipeline behind this approximation.
- The term affects the current default `PBRMaterial` shader path. Other material shaders ignore the input unless they expose the same uniforms.

## Verification

- `tests/unit/rendering/pbr-lighting.test.ts` verifies material uniforms and renderer-level environment uniform overrides.
- `tests/unit/rendering/environment-map-resources.test.ts` verifies bounded RGBA8 environment mip and BRDF LUT helper generation.
- `tests/browser/rendering-webgl2.spec.ts` verifies a WebGL2 PBR environment pixel.
- `tests/visual/pbr-environment-pixels.spec.ts` verifies the `examples/pbr-material-lab` scene, verifies `examples/pbr-camera-comparison` against a same-page Three.js reference scene, writes `tests/reports/pbr-environment-validation.json`, and checks that the examples report the sampled approximation instead of claiming full IBL.
- `tests/reports/pbr-rendering-comparison.json` records the bounded perspective-camera comparison descriptor, Galileo/reference/diff screenshot paths, ROI/full-canvas delta metrics, and exact claim boundary.
