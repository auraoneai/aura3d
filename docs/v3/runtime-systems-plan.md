# Runtime Systems Plan

## Goal

Turn runtime subsystems from isolated proofs into real app behavior. The runtime should support a local game-like scene and editor-authored scene with rendering, physics, animation, input, particles, audio, and scripting working together.

## Physics

Required code areas:

- `packages/physics/src/*`
- `examples/physics-sandbox`
- `examples/game-slice`
- `apps/editor/src/panels/InspectorPanel.ts`

Missing code:

- [ ] Robust constraints/joints demo.
- [ ] Trigger/sensor workflow.
- [ ] Continuous collision detection only if claimed.
- [ ] Character/controller helper if game examples need it.
- [ ] Physics material editing in editor.
- [ ] Collider authoring and debug drawing in editor.
- [ ] Stress scenes with stability metrics.
- [ ] Benchmarks against Rapier/Ammo/Cannon only if making physics advantage claims.

Done criteria:

- [ ] Physics sandbox has scenes for stack, constraints, triggers, raycasts, shape casts, sleeping, and stress.
- [ ] Editor can author colliders and show debug overlays.
- [ ] Game example uses physics for real interaction, not just counters.

## Animation

Required code areas:

- `packages/animation/src/*`
- `examples/animation-state-machine`
- `examples/animated-character`
- `examples/character-animation-viewer`
- `apps/editor/src/panels/InspectorPanel.ts`

Missing code:

- [ ] Real glTF animation clip playback in viewer.
- [ ] Skinned mesh visual rendering for real characters.
- [ ] Animation timeline or clip preview UI.
- [ ] State-machine graph UI for authoring/debugging.
- [ ] Blend tree controls in examples.
- [ ] Retargeting only if claimed.
- [ ] Animation event visualization.

Done criteria:

- [ ] Character example shows a real animated model.
- [ ] Browser tests verify animation changes pixels over time.
- [ ] Editor can preview animation clips.

## Particles And Effects

Required code areas:

- `packages/rendering/src/effects/*`
- `examples/10-particles`
- `examples/game-slice`

Missing code:

- [ ] Particle rendering integrated into real scenes.
- [ ] Blending/sorting controls.
- [ ] Bounds and culling.
- [ ] GPU particles on real WebGPU hardware only if claimed.
- [ ] Effect presets.
- [ ] Editor authoring for emitters.

Done criteria:

- [ ] Game/product/material examples use particles where visually appropriate.
- [ ] Reports show live count, upload bytes, update time, render time.

## Input And Controls

Required code areas:

- `packages/input/src/*`
- `examples/product-configurator`
- `examples/architecture-viewer`
- `examples/game-slice`
- `apps/editor/src/viewport/EditorViewport.ts`

Missing code:

- [ ] Unified orbit controls in asset/product/architecture viewers.
- [ ] Touch controls.
- [ ] Pointer lock flow.
- [ ] Configurable bindings UI.
- [ ] Gamepad matrix.
- [ ] Selection and interaction state diagnostics.

Done criteria:

- [ ] Every viewer has orbit/pan/zoom/focus.
- [ ] Browser tests cover pointer, keyboard, and touch simulation where feasible.

## Audio

Required code areas:

- `packages/audio/src/*`
- `examples/game-slice`
- `apps/editor/src/panels/InspectorPanel.ts`

Missing code:

- [ ] Real loaded audio clip example.
- [ ] Mixer UI.
- [ ] Spatial audio debug view.
- [ ] Mobile unlock handling.
- [ ] Editor audio source authoring.

Done criteria:

- [ ] Game example uses audio state that can be unlocked and heard in browser.
- [ ] Browser tests verify unlock/playback state without relying on external APIs.

## Scripting And Behaviors

Required code areas:

- `packages/scripting/src/*`
- `apps/editor/src/panels/InspectorPanel.ts`
- `apps/editor/src/playmode/*`

Missing code:

- [ ] Behavior component attached to scene objects.
- [ ] Script lifecycle in play mode.
- [ ] Error overlay for script failures.
- [ ] Hot reload or explicit reload flow.
- [ ] Visual graph editor only if claimed.
- [ ] Example behaviors for movement, interaction, trigger, and UI.

Done criteria:

- [ ] Editor-authored app includes at least one behavior created/configured through editor UI.
- [ ] Playwright test verifies behavior changes runtime state and pixels.

