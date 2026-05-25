# Renderer Environment Lighting

Galileo3D now has two environment-lighting tiers in the repo:

- the public `Renderer.render(...)` environment input for normal WebGL2 scene rendering;
- the production-runtime/v8 production viewer path that loads real HDR environment files, builds PMREM/BRDF resources, and renders textured glTF assets in apps such as `apps/flagship-viewer`.

The public render input still accepts direct environment settings:

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
    environmentMapTexture,
    environmentMapIntensity: 0.42,
    environmentMapSpecularIntensity: 0.24,
    environmentMapMipCount: 3,
    environmentBrdfLutTexture
  }
});
```

That path feeds `u_environmentColor`, procedural sky/horizon/ground terms, optional environment texture uniforms, optional mip-aware specular sampling, and an optional BRDF LUT into the default PBR material shader. It is useful for examples, editor previews, and deterministic browser tests.

The higher-fidelity path lives in `packages/rendering/src/EnvironmentPipeline.ts`, `packages/rendering/src/PMREM.ts`, `packages/rendering/src/IBL.ts`, `packages/rendering/src/production-runtime/PBRHDRPipeline.ts`, and the production-runtime/v8 flagship apps. Current reports show real HDR parsing, RGBA16F environment sampling, PMREM/BRDF resources, WebGL2 render proofs, and visible environment deltas. `tests/reports/production-runtime-pbr-hdr-readiness.json` passes for studio/sunset HDR scenes, and `tests/reports/current-routes-threejs-parity.json` records a same-scene G3D/Three.js flagship comparison using `studio_small_08_1k.hdr`.

## Current Use Cases

- Product and asset viewers that need studio HDR lighting with real glTF materials.
- Material labs that compare roughness, metallic, clearcoat, transmission, and texture slots under consistent light.
- Editor/runtime previews where a readable default environment matters more than physical calibration.
- WebGPU/WebGL2 parity tests that need explicit environment state and fallback behavior.

## Known Gaps

- Environment loading can still be visible to users. One current `flagship-viewer` report records roughly `440ms` for the GLB asset and `1634ms` for the environment to become ready after first frame. That is acceptable evidence for a route, not acceptable as a finished product experience.
- The simple `Renderer.render(...)` environment texture path is still an approximation and should not be described as full HDR IBL by itself.
- PMREM/BRDF resources exist, but the repo does not yet prove broad environment-map parity against Three.js across many HDRIs, devices, and material classes.
- Reflections, color management, and tone mapping have bounded evidence; they are not yet production-calibrated across a full film/game pipeline.

## Verification

- `tests/reports/production-runtime-pbr-hdr-readiness.json`
- `tests/reports/production-runtime-hd-flagship-readiness.json`
- `tests/reports/current-routes-threejs-parity.json`
- `tests/unit/rendering/environment-map-resources.test.ts`
- `tests/unit/rendering/pbr-lighting.test.ts`
- `tests/visual/pbr-environment-pixels.spec.ts`
