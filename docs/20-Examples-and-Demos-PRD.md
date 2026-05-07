# Examples And Demos PRD

## Purpose
Examples are validation artifacts. They prove engine capabilities in real browser usage and provide future users with working patterns. They are not decoration and cannot claim features that are not covered by tests or visual checks.

## Lessons From Failed Attempts
- Current examples frequently claimed zero placeholders, but some documented simplified collision and stub raycasts.
- Current E2E tests had low pass counts while examples implied production readiness.
- Old-G3D WOW and particle reports show examples can mask failures unless visual validation is strict.

Reuse conceptually:

- FPS, racing, platformer, physics sandbox, voxel, arch-viz style examples as later validation themes.
- Shared example harness.
- Browser visual test scripts.

Discard:

- Feature claims without automated or manual validation.
- Example-specific engine workarounds.
- Advanced showcase examples before core examples pass.

## Target Architecture
Examples are standalone browser applications that import only public Galileo3D package APIs. Shared example helpers are allowed only under `examples/shared`; package source must never import from examples. Each example has a validation role, a README, a browser smoke test, and visual or interaction assertions where appropriate.

Example runtime architecture:

- `exampleHarness.ts` creates the canvas, engine, renderer, resize handling, error output, and stats.
- Each example owns its scene setup but uses public packages only.
- Browser tests launch examples through the same dev server path users run.
- Visual checks validate nonblank output and expected regions.
- Performance examples emit structured stats for later regression tracking.

## Target Example Structure
```text
examples/
  00-basic-triangle/
  01-basic-scene/
  02-materials-pbr/
  03-shadows/
  04-physics-stack/
  05-animation-character/
  06-asset-gltf/
  07-input-controls/
  08-audio-spatial/
  09-editor-runtime/
  10-particles/
  shared/
    exampleHarness.ts
    statsPanel.ts
    visualCheck.ts
```

## File-By-File Implementation Plan

### `examples/shared/exampleHarness.ts`
- Purpose: consistent init, resize, error display, stats.
- Tests: example smoke imports.

### `examples/shared/visualCheck.ts`
- Purpose: canvas-pixel checks for nonblank and expected color regions.
- Tests: blank canvas detection.

### `examples/00-basic-triangle/main.ts`
- Purpose: prove WebGL2 device and draw call.
- Acceptance: colored triangle visible.

### `examples/01-basic-scene/main.ts`
- Purpose: scene graph, camera, renderer, transforms.
- Acceptance: nested cubes and grid visible.

### `examples/02-materials-pbr/main.ts`
- Purpose: PBR material matrix.
- Acceptance: roughness/metalness grid visually distinct.

### `examples/03-shadows/main.ts`
- Purpose: directional light shadow map.
- Acceptance: cube casts visible shadow on plane.

### `examples/04-physics-stack/main.ts`
- Purpose: physics fixed-step and scene sync.
- Acceptance: cubes fall and stack; debug draw optional.

### `examples/05-animation-character/main.ts`
- Purpose: clip/mixer/skeleton or transform animation.
- Acceptance: looped animation visible and deterministic.

### `examples/06-asset-gltf/main.ts`
- Purpose: glTF asset loading.
- Acceptance: imported model renders with material/texture.

### `examples/07-input-controls/main.ts`
- Purpose: orbit and first-person controls.
- Acceptance: controls modify camera, no stuck input.

### `examples/08-audio-spatial/main.ts`
- Purpose: spatial source and listener.
- Acceptance: user gesture unlock and panner updates.

### `examples/09-editor-runtime/main.ts`
- Purpose: selection, gizmo, command undo/redo.
- Acceptance: select/move/undo a cube.

### `examples/10-particles/main.ts`
- Purpose: CPU particle emitter and renderer.
- Acceptance: visible seeded fountain/fire effect.

## Acceptance Criteria
- Every example has a README with purpose, acceptance target, and run command.
- Every example has a smoke test.
- Visual examples have screenshot/canvas validation.
- Examples use public package APIs only.
- Example failures block release for the subsystem they validate.

## Testing Checklist
- Browser smoke for all examples.
- Visual nonblank check for all rendering examples.
- Canvas-pixel expected-region checks for triangle, shadows, PBR.
- Performance stats captured for physics, particles, and large scene examples.

## Implementation Order
1. Harness.
2. Triangle.
3. Basic scene.
4. PBR.
5. Shadows.
6. Physics.
7. Animation.
8. Assets.
9. Input/audio/editor/particles.
