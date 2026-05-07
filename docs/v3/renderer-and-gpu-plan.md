# Renderer And GPU Plan

## Goal

Build the renderer code required for credible modern web 3D visuals. The current renderer can draw bounded WebGL2 scenes, but the v3 target requires real model scenes with lighting, materials, shadows, postprocess, diagnostics, and performance evidence.

## Required File Areas

Expected primary code areas:

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/NormalMappedPBRMaterial.ts`
- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/rendering/src/ShadowMap.ts`
- `packages/rendering/src/ShadowPass.ts`
- `packages/rendering/src/CascadedShadowMaps.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/RenderGraph.ts`
- `packages/rendering/src/Texture.ts`
- `packages/rendering/src/TextureBinding.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `packages/rendering/src/shaders/*`
- `packages/scene/src/Camera.ts`
- `packages/scene/src/PerspectiveCamera.ts`
- `packages/scene/src/Scene.ts`

Expected test areas:

- `tests/unit/rendering/**`
- `tests/browser/rendering-*.spec.ts`
- `tests/visual/rendering-*.spec.ts`
- `tests/performance/rendering-*.ts`

Expected example areas:

- `examples/material-showroom`
- `examples/pbr-camera-comparison`
- `examples/pbr-material-lab`
- `examples/renderer-stress-lab`
- `examples/product-configurator`
- `examples/architecture-viewer`
- `examples/game-slice`

## PBR And Lighting

### Missing Code

- [ ] HDR render target support or explicit non-HDR enforcement.
- [ ] Linear/sRGB color management end to end.
- [ ] Environment texture loading path for real HDR or high-quality LDR environment maps.
- [ ] Irradiance convolution for diffuse IBL.
- [ ] Specular prefiltered environment mip chain.
- [ ] Calibrated split-sum BRDF LUT generation/loading.
- [ ] Material parameter validation against supported shader features.
- [ ] Reflection intensity, roughness response, metallic response, and normal response visible in real scenes.
- [ ] Clear unsupported-feature fallback that reports a warning rather than silently producing poor visuals.

### Done Criteria

- [ ] `examples/material-showroom` shows dielectric, metal, rough, glossy, normal-mapped, emissive, transparent/alpha, and clearcoat-like materials if supported.
- [ ] Screenshot tests compare material states across fixed camera/environment settings.
- [ ] PBR comparison report shows Galileo3D, Three.js, and Babylon rendering the same asset/material scene.
- [ ] Known-limits output lists unsupported PBR features for each loaded material.

## Shadows

### Missing Code

- [ ] Stable shadow camera/projection fitting.
- [ ] Bias controls per light or shadow map.
- [ ] PCF or equivalent filtering.
- [ ] Contact shadow solution or explicit no-contact-shadow limit.
- [ ] Moving-camera cascade stability tests.
- [ ] Shadow debug view for cascades, casters, receivers, frustum, and map resolution.
- [ ] Point/spot shadows only if claimed.

### Done Criteria

- [ ] `examples/shadow-lab` visibly shows shadow quality controls.
- [ ] Product, architecture, and game examples use visible shadows.
- [ ] Browser screenshots prove shadows are visible, stable, and not broken by resize/DPR.
- [ ] Tests cover shadow map resource cleanup.

## Postprocessing

### Missing Code

- [ ] Depth texture plumbing.
- [ ] RenderGraph pass inspection.
- [ ] HDR tonemapping if HDR exists.
- [ ] Bloom that operates on bright pixels in a real scene.
- [ ] FXAA or TAA with before/after visual evidence.
- [ ] SSAO, SSR, DOF only if implemented with real scenes and budgets.
- [ ] Runtime controls for enabling/disabling passes.

### Done Criteria

- [ ] `examples/postprocess-lab` shows before/after views.
- [ ] Product/game scenes use the same postprocess path.
- [ ] Browser tests read pixels proving passes change output.
- [ ] Performance reports show cost per pass.

## Scene Scale, Culling, Batching, LOD

### Missing Code

- [ ] Frustum culling integrated into real examples.
- [ ] Static batching or draw submission optimization where appropriate.
- [ ] Instancing APIs documented through examples.
- [ ] LOD selection by distance/screen size.
- [ ] Large-scene camera movement with stable frame timing.
- [ ] Resource memory estimates for geometry/materials/textures.

### Done Criteria

- [ ] `examples/renderer-stress-lab` allows object/material/light count changes.
- [ ] `benchmarks/galileo/src/scenes/large-scene.ts` uses real renderer paths.
- [ ] Reports include draw calls, visible objects, culled objects, frame time, and memory estimates.

## WebGPU

### Missing Code

- [ ] Real WebGPU adapter/device creation path tested in browser.
- [ ] Shader compilation diagnostics.
- [ ] Feature fallback table in code/report form.
- [ ] Render parity scene with WebGL2.
- [ ] Compute-backed particles or another real compute use case if WebGPU is claimed.
- [ ] Browser matrix runner for Chrome/Edge/Safari technology state where locally available.

### Done Criteria

- [ ] WebGPU examples fail gracefully when unavailable.
- [ ] WebGPU report distinguishes injected tests, browser contract tests, and real hardware tests.
- [ ] No "full WebGPU" claim exists without real hardware evidence.

