# Runtime Systems Plan

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Goal

Turn runtime subsystems from isolated proofs into real app behavior. The runtime should support a local game-like scene and editor-authored scene with rendering, physics, animation, input, particles, audio, and scripting working together.

## Physics

Required code areas:

- `packages/physics/src/*`
- `examples/physics-sandbox`
- `examples/game-slice`
- `apps/editor/src/panels/InspectorPanel.ts`

Missing code:

- [x] Robust constraints/joints demo.
- [x] Trigger/sensor workflow.
- [x] Continuous collision detection only if claimed.
- [x] Character/controller helper if game examples need it.
- [x] Physics material editing in editor.
- [x] Collider authoring and debug drawing in editor.
- [x] Stress scenes with stability metrics.
- [x] Benchmarks against Rapier/Ammo/Cannon only if making physics advantage claims.

Done criteria:

- [x] Physics sandbox has scenes for stack, constraints, triggers, raycasts, shape casts, sleeping, and stress.
- [x] Editor can author colliders and show debug overlays.
- [x] Game example uses physics for real interaction, not just counters.

## Animation

Required code areas:

- `packages/animation/src/*`
- `examples/animation-state-machine`
- `examples/animated-character`
- `examples/character-animation-viewer`
- `apps/editor/src/panels/InspectorPanel.ts`

Missing code:

- [x] Real glTF animation clip playback in viewer.
- [x] Skinned mesh visual rendering for real characters.
- [x] Animation timeline or clip preview UI.
- [x] State-machine graph UI for authoring/debugging.
- [x] Blend tree controls in examples.
- [x] Retargeting only if claimed.
- [x] Animation event visualization.

Done criteria:

- [x] Character example shows a real animated model.
- [x] Browser tests verify animation changes pixels over time.
- [x] Editor can preview animation clips.

## Particles And Effects

Required code areas:

- `packages/rendering/src/effects/*`
- `examples/10-particles`
- `examples/game-slice`

Missing code:

- [x] Particle rendering integrated into real scenes.
- [x] Blending/sorting controls.
- [x] Bounds and culling.
- [x] GPU particles on real WebGPU hardware only if claimed.
- [x] Effect presets.
- [x] Editor authoring for emitters.

Done criteria:

- [x] Game/product/material examples use particles where visually appropriate.
- [x] Reports show live count, upload bytes, update time, render time.

## Input And Controls

Required code areas:

- `packages/input/src/*`
- `examples/product-configurator`
- `examples/architecture-viewer`
- `examples/game-slice`
- `apps/editor/src/viewport/EditorViewport.ts`

Missing code:

- [x] Unified orbit controls in asset/product/architecture viewers.
- [x] Touch controls.
- [x] Pointer lock flow.
- [x] Configurable bindings UI.
- [x] Gamepad matrix.
- [x] Selection and interaction state diagnostics.

Done criteria:

- [x] Every viewer has orbit/pan/zoom/focus.
- [x] Browser tests cover pointer, keyboard, and touch simulation where feasible.

## Audio

Required code areas:

- `packages/audio/src/*`
- `examples/game-slice`
- `apps/editor/src/panels/InspectorPanel.ts`

Missing code:

- [x] Real loaded audio clip example.
- [x] Mixer UI.
- [x] Spatial audio debug view.
- [x] Mobile unlock handling.
- [x] Editor audio source authoring.

Done criteria:

- [x] Game example uses audio state that can be unlocked and heard in browser.
- [x] Browser tests verify unlock/playback state without relying on external APIs.

## Scripting And Behaviors

Required code areas:

- `packages/scripting/src/*`
- `apps/editor/src/panels/InspectorPanel.ts`
- `apps/editor/src/playmode/*`

Missing code:

- [x] Behavior component attached to scene objects.
- [x] Script lifecycle in play mode.
- [x] Error overlay for script failures.
- [x] Hot reload or explicit reload flow.
- [x] Visual graph editor only if claimed.
- [x] Example behaviors for movement, interaction, trigger, and UI.

Done criteria:

- [x] Editor-authored app includes at least one behavior created/configured through editor UI.
- [x] Playwright test verifies behavior changes runtime state and pixels.
