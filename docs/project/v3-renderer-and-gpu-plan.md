# Renderer And GPU Plan

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


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

- [x] HDR render target support or explicit non-HDR enforcement.
- [x] Linear/sRGB color management end to end.
- [x] Environment texture loading path for real HDR or high-quality LDR environment maps.
- [x] Irradiance convolution for diffuse IBL.
- [x] Specular prefiltered environment mip chain.
- [x] Calibrated split-sum BRDF LUT generation/loading.
- [x] Material parameter validation against supported shader features.
- [x] Reflection intensity, roughness response, metallic response, and normal response visible in real scenes.
- [x] Clear unsupported-feature fallback that reports a warning rather than silently producing poor visuals.

### Done Criteria

- [x] `examples/material-showroom` shows dielectric, metal, rough, glossy, normal-mapped, emissive, transparent/alpha, and clearcoat-like materials if supported.
- [x] Screenshot tests compare material states across fixed camera/environment settings.
- [x] PBR comparison report shows Galileo3D, Three.js, and Babylon rendering the same asset/material scene. Evidence: `tests/reports/comparison-threejs.json` and `tests/reports/comparison-babylon.json` include the shared `pbr-materials` benchmark scene, and `pnpm verify:v3` passes.
- [x] Known-limits output lists unsupported PBR features for each loaded material.

## Shadows

### Missing Code

- [x] Stable shadow camera/projection fitting.
- [x] Bias controls per light or shadow map.
- [x] PCF or equivalent filtering.
- [x] Contact shadow solution or explicit no-contact-shadow limit.
- [x] Moving-camera cascade stability tests.
- [x] Shadow debug view for cascades, casters, receivers, frustum, and map resolution.
- [x] Point/spot shadows only if claimed.

### Done Criteria

- [x] `examples/shadow-lab` visibly shows shadow quality controls.
- [x] Product, architecture, and game examples use visible shadows.
- [x] Browser screenshots prove shadows are visible, stable, and not broken by resize/DPR. Evidence: `tests/browser/rendering-foundation-labs.spec.ts` validates shadow-lab controls, PCF pixels, projected shadow regions, and resize-safe browser rendering under `pnpm verify:foundation-rendering`.
- [x] Tests cover shadow map resource cleanup.

## Postprocessing

### Missing Code

- [x] Depth texture plumbing.
- [x] RenderGraph pass inspection.
- [x] HDR tonemapping if HDR exists. Evidence: production HDR render-target claims remain blocked; the bounded real-scene tone-mapping path is validated by `examples/postprocess-lab/main.ts`, `packages/rendering/src/PostProcessPass.ts`, and `pnpm verify:foundation-rendering`.
- [x] Bloom that operates on bright pixels in a real scene.
- [x] FXAA or TAA with before/after visual evidence.
- [x] SSAO, SSR, DOF only if implemented with real scenes and budgets. Evidence: SSAO, SSR, and DOF are not claimed; renderer feature/known-limit reporting keeps unsupported post effects blocked while `pnpm verify:v3` and `pnpm verify:external-parity-rendering` pass.
- [x] Runtime controls for enabling/disabling passes.

### Done Criteria

- [x] `examples/postprocess-lab` shows before/after views.
- [x] Product/game scenes use the same postprocess path. Evidence: `examples/product-configurator/main.ts` and `examples/game-slice/main.ts` publish the shared `V4RenderPreset.toneMapPixels.bloomPixels.fxaaPixels` readback path, enforced by `tests/browser/example-screenshot-audit-external-parity.spec.ts`.
- [x] Browser tests read pixels proving passes change output.
- [x] Performance reports show cost per pass.

## Scene Scale, Culling, Batching, LOD

### Missing Code

- [x] Frustum culling integrated into real examples.
- [x] Static batching or draw submission optimization where appropriate.
- [x] Instancing APIs documented through examples.
- [x] LOD selection by distance/screen size.
- [x] Large-scene camera movement with stable frame timing.
- [x] Resource memory estimates for geometry/materials/textures.

### Done Criteria

- [x] `examples/renderer-stress-lab` allows object/material/light count changes.
- [x] `benchmarks/galileo/src/scenes/large-scene.ts` uses real renderer paths.
- [x] Reports include draw calls, visible objects, culled objects, frame time, and memory estimates.

## WebGPU

### Missing Code

- [x] Real WebGPU adapter/device creation path tested in browser.
- [x] Shader compilation diagnostics.
- [x] Feature fallback table in code/report form.
- [x] Render parity scene with WebGL2.
- [x] Compute-backed particles or another real compute use case if WebGPU is claimed. Evidence: broad WebGPU compute particles are not claimed; `examples/webgpu-capability/main.ts` publishes the blocked compute boundary, and WebGPU contract tests pass under `pnpm verify:foundation-rendering`.
- [x] Browser matrix runner for Chrome/Edge/Safari technology state where locally available.

### Done Criteria

- [x] WebGPU examples fail gracefully when unavailable.
- [x] WebGPU report distinguishes injected tests, browser contract tests, and real hardware tests.
- [x] No "full WebGPU" claim exists without real hardware evidence.
