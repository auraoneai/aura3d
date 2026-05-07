# Input And Interaction PRD

## Purpose
Input provides normalized keyboard, pointer, mouse, touch, wheel, and gamepad state plus action mapping. Interaction connects pointer rays and scene queries to picking, hovering, dragging, and controls without making the renderer or scene graph own browser event handling.

## Lessons From Failed Attempts
- Current G3D had input modules for keyboard, mouse, pointer, touch, gamepad, and gestures.
- Examples used simplified or ad hoc input logic.
- Old-G3D had editor and interaction systems mixed with large UI/admin/platform concerns.

Reuse conceptually:

- Unified action mapping.
- Pointer and gamepad abstraction.
- Editor interaction as a consumer, not owner.

Discard:

- Example-specific input that bypasses the engine.
- Browser event listeners spread across subsystems.
- Hidden globals for input state.

## Target Architecture
The input package owns platform event adapters and frame-stable snapshots. It emits actions during the engine input phase.

Public API:

```ts
const input = new InputSystem(canvas);
input.actions.bind("jump", [{ type: "keyboard", code: "Space" }]);
if (input.actions.pressed("jump")) jump();
```

## File-By-File Implementation Plan

### `packages/input/src/InputSystem.ts`
- Purpose: public input owner.
- Contains: devices, snapshots, update method.
- Edge cases: canvas focus loss, pointer lock exit, disposal.
- Tests: event routing and snapshot stability.

### `packages/input/src/InputSnapshot.ts`
- Purpose: immutable per-frame input state.
- Tests: pressed/down/released semantics.

### `packages/input/src/KeyboardDevice.ts`
- Purpose: keyboard state.
- Edge cases: repeat events, lost keyup on blur.
- Tests: key transitions.

### `packages/input/src/PointerDevice.ts`
- Purpose: pointer/mouse/touch normalized state.
- Edge cases: multi-touch, pointer capture, devicePixelRatio.
- Tests: movement, buttons, wheel.

### `packages/input/src/GamepadDevice.ts`
- Purpose: gamepad polling and mapping.
- Edge cases: connect/disconnect, dead zones.
- Tests: mocked navigator gamepads.

### `packages/input/src/ActionMap.ts`
- Purpose: map device inputs to named actions/axes.
- Tests: chords, alternatives, axis scale.

### `packages/input/src/GestureRecognizer.ts`
- Purpose: pinch, pan, tap, long press.
- Tests: multi-touch gesture recognition.

### `packages/input/src/PickingRay.ts`
- Purpose: convert screen coordinates to scene ray using camera.
- Dependencies: math and scene camera types.
- Tests: center ray and corner ray.

### `packages/input/src/InteractionSystem.ts`
- Purpose: hover/click/drag event generation using scene queries.
- Edge cases: object removed during drag.
- Tests: picking and drag lifecycle.

### `packages/input/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Input state is stable for a frame and transitions are correct.
- Keyboard, pointer, wheel, touch, and gamepad are normalized.
- Action maps support named actions and axes.
- Picking ray matches camera projection.
- Interaction events do not mutate scene unless user code handles them.

## Testing Checklist
- Unit: action map, snapshots, devices.
- Browser/runtime: pointer lock, touch where available, keyboard focus.
- Integration: camera picking ray, scene hover/click.
- Examples: first-person controls, orbit controls, editor selection.

## Implementation Order
1. Snapshot and keyboard.
2. Pointer and wheel.
3. Action maps.
4. Gamepad.
5. Picking ray.
6. Interaction system.
7. Gestures.

