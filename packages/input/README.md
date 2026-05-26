# @aura3d/input

`@aura3d/input` owns keyboard, pointer, gamepad, gesture, action-map, interaction, picking-ray, and camera-control runtime contracts.

## Public API

- `InputSnapshot`, `InputSystem`: immutable per-frame input state and event-target integration.
- `KeyboardDevice`, `PointerDevice`, `GamepadDevice`: device adapters for browser-style events and polling.
- `ActionMap`: keyboard, keyboard chord, button, gamepad, and axis bindings.
- `GestureRecognizer`: pointer-derived gestures.
- `InteractionSystem`, `pickingRayFromCamera`: target picking, listener dispatch, and ray construction.
- `CameraRig`, `OrbitControls`, `FirstPersonControls`, `ThirdPersonFollowControls`, `EditorFlyControls`: camera movement controls.
- `createSceneCameraControlAdapter`: bridge from scene cameras to control transforms.

## Verification

Input snapshots, transitions, action maps, keyboard chords, pointer/gamepad behavior, gestures, interaction targets, picking rays, camera controls, and browser input lifecycle are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `tests/unit/input/camera-controls.test.ts`, and `tests/browser/input-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
