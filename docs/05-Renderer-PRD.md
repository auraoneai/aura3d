# Renderer PRD

## Purpose
The renderer converts scene state into GPU commands. It owns GPU devices, resources, render graph execution, geometry layouts, shaders, material binding, frame state, and render passes. It must be modular and extensible without repeating the prior multiple-renderer and multiple-shader-system failures.

## Lessons From Failed Attempts
- Current `G3D` had a VertexBuffer investigation proving CPU data was correct while the GPU still saw bad values, meaning the failure was likely upload, shader attributes, VAO state, draw timing, or state mutation.
- Current source scans showed backup renderer files and placeholder render graph/pass logic.
- `G3D2025` had a good render PRD but still reported integration gaps around material system integration.
- `Old-G3D` had valuable WebGL/WebGPU and diagnostic ideas but suffered shader substitution, uniform upload, PBR darkness, line rendering, toon rendering, and duplicate renderer complexity.

Reuse conceptually:

- Render-device abstraction.
- Render graph.
- Draw-call diagnostics.
- Shader/material validation.
- WebGL2 and WebGPU backend separation.

Discard:

- Competing renderer entry points.
- Multiple shader registries.
- Build-time shader substitution tricks.
- Backup files and facade chains.

## Target Architecture
Rendering package layers:

1. Device abstraction: WebGL2 first, WebGPU later behind the same interface.
2. Resources: buffers, textures, samplers, pipelines, shader modules.
3. Geometry contract: vertex formats and attributes are explicit.
4. Material contract: materials generate shader requirements and bind groups/uniforms through one binder.
5. Render graph: passes declare reads/writes; graph validates resources.
6. Renderer: builds frame context, draws scene, records diagnostics.

Public API:

```ts
const renderer = await Renderer.create({ canvas, backend: "webgl2" });
renderer.render(scene, camera);
renderer.resize(width, height);
renderer.dispose();
```

## File-By-File Implementation Plan

### `packages/rendering/src/Renderer.ts`
- Purpose: public renderer facade.
- Contains: `Renderer`, `RendererOptions`, frame render method.
- Dependencies: `RenderDevice`, `RenderGraph`, `Scene`, `Camera`.
- Edge cases: context loss, resize during frame, render before init.
- Tests: init, resize, render empty scene, dispose, context lost event.

### `packages/rendering/src/RenderDevice.ts`
- Purpose: backend-neutral GPU contract.
- Contains: interfaces for buffers, textures, shader modules, pipelines, command encoder.
- Edge cases: unsupported features, resource disposed, out-of-memory.
- Tests: mock device conformance.

### `packages/rendering/src/WebGL2Device.ts`
- Purpose: WebGL2 implementation of `RenderDevice`.
- Contains: WebGL2 resource wrappers, state cache, context-loss handling.
- Edge cases: VAO state leaks, attribute binding mismatch, framebuffer incomplete.
- Tests: browser WebGL2 init, buffer upload readback, shader compile failure.

### `packages/rendering/src/WebGPUDevice.ts`
- Purpose: future WebGPU implementation behind same contract.
- Contains: feature detection and no-op unavailable error path initially.
- Edge cases: adapter unavailable, device lost.
- Tests: feature detection and graceful fallback.

### `packages/rendering/src/VertexFormat.ts`
- Purpose: canonical vertex layout description.
- Contains: `VertexAttributeSemantic`, `VertexAttribute`, `VertexFormat`.
- Edge cases: duplicate semantics, unaligned offsets, stride mismatch.
- Tests: P3, P3N3, P3N3T2, P3N3T4T2 layouts.

### `packages/rendering/src/VertexBuffer.ts`
- Purpose: CPU and GPU vertex buffer wrapper.
- Contains: typed setters, dirty range tracking, upload method.
- Edge cases: partial upload, disposed buffer, interleaved layouts.
- Tests: CPU layout tests plus WebGL readback test.

### `packages/rendering/src/IndexBuffer.ts`
- Purpose: typed index buffer.
- Edge cases: 16-bit/32-bit selection, out-of-range indices.
- Tests: draw indexed triangle.

### `packages/rendering/src/Geometry.ts`
- Purpose: renderable mesh geometry container.
- Contains: vertex/index buffers, bounds, primitive topology.
- Tests: bounds generation and buffer ownership.

### `packages/rendering/src/ShaderModule.ts`
- Purpose: compiled shader representation.
- Contains: compile result, reflection metadata, source marker.
- Edge cases: compile errors, missing attributes/uniforms.
- Tests: compile valid/invalid shaders.

### `packages/rendering/src/ShaderPreprocessor.ts`
- Purpose: includes, defines, and variant preprocessing.
- Edge cases: circular include, undefined define, line mapping.
- Tests: include cycle, variant expansion, source maps for errors.

### `packages/rendering/src/ShaderLibrary.ts`
- Purpose: one canonical shader source registry.
- Edge cases: duplicate shader name, stale variant cache.
- Tests: registration and lookup.

### `packages/rendering/src/Material.ts`
- Purpose: base material contract.
- Contains: `Material`, `MaterialDescriptor`, render state.
- Edge cases: invalid render state, missing shader requirements.
- Tests: state validation.

### `packages/rendering/src/MaterialInstance.ts`
- Purpose: per-object parameter overrides.
- Tests: override inheritance, dirty tracking.

### `packages/rendering/src/PBRMaterial.ts`
- Purpose: standard metallic-roughness PBR material.
- Edge cases: texture missing, color space, normal map tangent requirement.
- Tests: shader requirements, uniform binding, visual sphere baseline.

### `packages/rendering/src/UnlitMaterial.ts`
- Purpose: simplest validated material path.
- Tests: render a colored triangle and cube.

### `packages/rendering/src/RenderGraph.ts`
- Purpose: DAG of render passes and frame resources.
- Edge cases: cycles, missing resource producers, write-after-read hazards.
- Tests: graph compile and execution order.

### `packages/rendering/src/RenderPass.ts`
- Purpose: pass interface.
- Tests: mock pass execution.

### `packages/rendering/src/ForwardPass.ts`
- Purpose: initial stable object rendering path.
- Edge cases: no lights, no material, invalid geometry.
- Tests: one cube, many cubes, state reset.

### `packages/rendering/src/DepthPass.ts`
- Purpose: depth-only pass used by shadows and prepass.
- Tests: depth framebuffer completeness.

### `packages/rendering/src/PostProcessPass.ts`
- Purpose: generic full-screen pass after forward path is stable.
- Tests: pass-through visual baseline.

### `packages/rendering/src/DebugRenderPass.ts`
- Purpose: lines, bounds, axes, physics debug draw.
- Tests: visible lines, no state leak into forward pass.

### `packages/rendering/src/index.ts`
- Purpose: public rendering exports.
- Tests: subpath export smoke.

## Acceptance Criteria
- WebGL2 renderer initializes in Chrome and renders a colored triangle, cube, lit cube, and textured cube.
- VertexBuffer CPU layout, GPU upload, shader attribute binding, and VAO state are separately tested.
- PBR material has a visual baseline and shader/material binding diagnostics.
- Render graph validates pass dependencies and resource lifetimes.
- Context loss is detected and reported.
- Renderer package has no backup files or duplicate shader registries.

## Testing Checklist
- Unit: vertex formats, render graph, material state, shader preprocessor.
- Browser: WebGL2 device, buffer readback, framebuffer completeness.
- Visual: triangle, cube, normals, PBR sphere, unlit material, debug lines.
- Integration: scene-to-renderer, material-to-shader, asset-to-texture.
- Performance: 1,000 cubes static, 10,000 instances after instancing is added.

## Implementation Order
1. `RenderDevice` and mock device.
2. `WebGL2Device`.
3. Buffers, textures, shader modules.
4. Vertex format and geometry.
5. Unlit material and forward pass.
6. Render graph.
7. PBR material.
8. Debug pass and diagnostics.
9. WebGPU adapter skeleton after WebGL2 acceptance passes.

