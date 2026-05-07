# Materials And Shaders PRD

## Purpose
Materials and shaders define how renderable geometry is shaded. This subsystem owns material parameters, render state, shader variants, shader preprocessing, uniform/bind layouts, and validation. It exists to prevent the prior shader substitution, uniform upload, and PBR darkness failures.

## Lessons From Failed Attempts
- Current G3D scans found placeholder render pass and postprocess material behavior.
- `G3D2025` claimed material completeness but still had integration gaps and placeholder comments in shader chunks/terrain.
- `Old-G3D/autolightfix.md` recorded uniform upload failure, wrong shader selection, build substitution, conflicting shader systems, and PBR material darkness.
- `Old-G3D/sizzle-autopsy.md` concluded parts of the physical material pipeline required complete rebuild.

Reuse conceptually:

- PBR material model.
- Shader registry/library.
- Runtime validation and build-time shader checks.
- Material presets after core material correctness.

Discard:

- Multiple shader systems.
- Runtime fallback chains that hide broken shader selection.
- Build substitution with no source markers.
- Advanced materials before standard PBR is visually proven.

## Target Architecture
One shader library, one material base contract, one material binder, one shader preprocessor. Materials describe requirements; renderer compiles and binds them.

Public API:

```ts
const material = new PBRMaterial({
  baseColor: new Color(1, 0, 0),
  metallic: 0.2,
  roughness: 0.6
});
```

## File-By-File Implementation Plan

### `packages/rendering/src/Material.ts`
- Purpose: base material state and lifecycle.
- Contains: render state, shader key, parameter schema.
- Tests: validation and dirty tracking.

### `packages/rendering/src/MaterialInstance.ts`
- Purpose: parameter overrides sharing a base material.
- Tests: inherited and overridden values.

### `packages/rendering/src/MaterialBinding.ts`
- Purpose: convert material parameters to backend uniforms/bind groups.
- Edge cases: missing uniform, wrong type, texture unready.
- Tests: binding validation and error messages.

### `packages/rendering/src/PBRMaterial.ts`
- Purpose: standard metallic-roughness material.
- Inputs: base color, metallic, roughness, normal, emissive, occlusion textures.
- Edge cases: normal map without tangents, invalid roughness, color-space mismatch.
- Tests: parameter schema, visual PBR sphere.

### `packages/rendering/src/UnlitMaterial.ts`
- Purpose: debug/simple material path.
- Tests: flat color visual.

### `packages/rendering/src/ShaderModule.ts`
- Purpose: compiled shader and reflection.
- Tests: attribute/uniform reflection.

### `packages/rendering/src/ShaderPreprocessor.ts`
- Purpose: includes, defines, variants.
- Tests: include cycle and error line mapping.

### `packages/rendering/src/ShaderLibrary.ts`
- Purpose: canonical shader registration.
- Edge cases: duplicate name, missing variant.
- Tests: source marker preserved through compile.

### `packages/rendering/src/ShaderChunks.ts`
- Purpose: approved reusable shader chunks.
- Rule: chunk dependencies are explicit and cycle-checked.
- Tests: all chunks compile in at least one program.

### `packages/rendering/src/UniformLayout.ts`
- Purpose: typed uniform layout and packing.
- Edge cases: std140-like alignment, bool/int/float mismatch.
- Tests: layout offsets and upload data.

### `packages/rendering/src/TextureBinding.ts`
- Purpose: texture/sampler binding metadata.
- Tests: missing texture fallback reports warning, not silent success.

### `packages/rendering/src/MaterialPresets.ts`
- Purpose: optional presets after PBR acceptance.
- Tests: presets produce valid material configs.

## Acceptance Criteria
- One unlit and one PBR shader path render correctly in browser.
- PBR material validates color space, normal/tangent requirements, and parameter ranges.
- Shader source markers prove the expected shader source compiled.
- Uniform uploads have tests that verify CPU values reach the GPU program.
- Material binding failures are explicit errors or diagnostics, never silent fallbacks.
- No second shader registry exists.

## Testing Checklist
- Unit: material schema, shader preprocessing, uniform layout.
- Integration: material binding with WebGL2 program.
- Browser/runtime: PBR sphere, normal map test, unlit cube.
- Visual: base color, metal/roughness grid, emissive, normal map.
- Regression: wrong shader source marker fails a test.

## Implementation Order
1. Material base and instance.
2. Shader library/preprocessor.
3. Unlit material and shader.
4. Uniform layout and material binding.
5. PBR material and visual tests.
6. Presets and advanced material extension points.

