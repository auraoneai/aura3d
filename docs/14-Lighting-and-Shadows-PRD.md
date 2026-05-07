# Lighting And Shadows PRD

## Purpose
Lighting and shadows provide directional, point, and spot lights; physically plausible light units; light culling; shadow map rendering; and debug visualization. This subsystem must be built after material and renderer contracts are stable.

## Lessons From Failed Attempts
- Old-G3D PBR reports show lighting failures caused by uniform upload, shader selection, tone mapping, and IBL/BRDF energy issues.
- Current README promised dynamic shadows and CSM before the renderer pipeline was proven.
- Rendering status reports showed remaining toon/line rendering failures, proving visual validation is mandatory.

Reuse conceptually:

- Directional, point, spot lights.
- Shadow mapping and cascaded shadows.
- Runtime light diagnostics.

Discard:

- Adding advanced GI before direct lighting and basic shadows pass.
- Silent light uniform fallback.
- Light systems that bypass material binding validation.

## Target Architecture
Lights are scene objects. Renderer builds a light list per view and passes it through a validated uniform/buffer layout. Shadows are render passes in the render graph.

## File-By-File Implementation Plan

### `packages/scene/src/Light.ts`
- Purpose: base light data.
- Tests: intensity/color/layer validation.

### `packages/scene/src/DirectionalLight.ts`
- Purpose: sun-like light.
- Tests: direction from transform.

### `packages/scene/src/PointLight.ts`
- Purpose: local omnidirectional light.
- Tests: range and attenuation.

### `packages/scene/src/SpotLight.ts`
- Purpose: cone light.
- Tests: cone angle and penumbra validation.

### `packages/rendering/src/LightCollector.ts`
- Purpose: collect visible lights for a camera.
- Edge cases: layer masks, disabled lights, max light count.
- Tests: ordering and culling.

### `packages/rendering/src/LightUniforms.ts`
- Purpose: packed light data for shaders.
- Edge cases: layout alignment, too many lights.
- Tests: CPU packing and GPU uniform verification.

### `packages/rendering/src/ShadowMap.ts`
- Purpose: shadow map resource and settings.
- Tests: framebuffer completeness and resize.

### `packages/rendering/src/ShadowPass.ts`
- Purpose: render shadow casters to shadow maps.
- Edge cases: no casters, transparent material, bias.
- Tests: depth-only render and state reset.

### `packages/rendering/src/CascadedShadowMaps.ts`
- Purpose: directional light cascades after basic shadows pass.
- Tests: cascade split calculation.

### `packages/rendering/src/LightingDebug.ts`
- Purpose: visualize lights, shadow frusta, and shadow maps.
- Tests: debug draw line generation.

## Acceptance Criteria
- One directional light lights a PBR sphere correctly.
- Point and spot lights affect objects within range.
- Basic shadow map renders visible, stable shadows in browser.
- Shadow pass does not corrupt forward pass state.
- Light uniforms are verified with GPU/program checks.

## Testing Checklist
- Unit: light data, collector, uniform packing, cascade splits.
- Browser: direct lighting, point/spot, shadow map.
- Visual: lit sphere grid, shadowed cube on plane.
- Regression: normal/tangent and light direction correctness.

## Implementation Order
1. Light scene objects.
2. Light collection and uniforms.
3. Direct lighting shader path.
4. Basic shadow map.
5. Cascaded shadows.
6. Debug visualization.

