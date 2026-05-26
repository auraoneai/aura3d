# @aura3d/rendering

`@aura3d/rendering` owns render-device abstraction, WebGL2/mock backends, buffers, geometry, textures, samplers, shader modules, shader libraries, material schemas, render pipelines, render graphs, lighting, shadows, diagnostics-facing render state, and particle rendering/effects.

## Public API

- `RenderDevice`, `createRenderDevice`, `MockRenderDevice`, `WebGL2Device`, `WebGPUDevice`: backend lifecycle, resource creation, draw commands, diagnostics, WebGPU device-lost reporting, and explicit WebGPU capability handling.
- `VertexFormat`, `VertexBuffer`, `IndexBuffer`, `Geometry`, `Texture`, `Sampler`, `UniformLayout`, `TextureBinding`: GPU resource and layout data, including texture readiness and color-space binding validation.
- `ShaderModule`, `ShaderLibrary`, `ShaderPreprocessor`, `SHADER_CHUNKS`: shader source ownership, named shader variants, typed attribute/uniform reflection, include/variant preprocessing with source maps, chunk validation, and default shader names/markers.
- `Material`, `MaterialInstance`, `MaterialBinding`, `UnlitMaterial`, `TexturedUnlitMaterial`, `PBRMaterial`, `NormalMappedPBRMaterial`, `MaterialPresetRegistry`: material schemas, uniform/texture binding, diagnostics, and presets.
- `RenderGraph`, `ForwardPass`, `DepthPass`, `ShadowPass`, `ShadowMap`, `ShadowProjectionBuilder`, `CascadedShadowMaps`, `ToneMappingPass`, `BloomPass`, `FXAAPass`: pass orchestration, resource lifetime plans, forward rendering, depth/shadow contracts, cascade data, and deterministic post-process passes.
- `LightCollector`, `LightUniforms`, `LightingDebug`: directional, point, and spot light collection, uniform packing, and debug lines.
- `Renderer`: public facade for render source submission, resize, diagnostics, and disposal.
- `Particle`, `ParticleEmitter`, particle modules, `ParticleRenderer`, `ParticleRenderPass`, `GPUParticleBackend`, `ParticleSystem`: CPU/GPU particle spawn/update contracts, diagnostics counters, and render integration.

## Verification

Renderer resources, vertex formats, shader libraries, shader markers, material binding, PBR lighting, render graph ordering/lifetime plans, deterministic tone-mapping/bloom/FXAA post-process passes, shadow pass/projection, lighting debug cascades, particle rendering, GPU particle spawn/update paths, WebGPU device-lost diagnostics, WebGL2 browser pixels, visual pixels, shader verification, and performance baselines are covered by `tests/unit/rendering/*.test.ts`, `tests/browser/rendering-webgl2.spec.ts`, `tests/browser/shadow-browser.spec.ts`, `tests/browser/particle-browser.spec.ts`, `tests/browser/gpu-particle-backend.spec.ts`, `tests/visual/*.spec.ts`, and `tests/performance/system-baselines.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
