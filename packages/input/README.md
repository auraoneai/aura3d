# @galileo3d/input

`@galileo3d/input` owns keyboard, pointer, gamepad, gesture, action-map, interaction, picking-ray, and camera-control runtime contracts.

## Public API

- `InputSnapshot`, `InputSystem`: immutable per-frame input state and event-target integration.
- `KeyboardDevice`, `PointerDevice`, `GamepadDevice`: device adapters for browser-style events and polling.
- `ActionMap`: keyboard, keyboard chord, button, gamepad, and axis bindings.
- `GestureRecognizer`: pointer-derived gestures.
- `InteractionSystem`, `pickingRayFromCamera`: target picking, listener dispatch, and ray construction.
- `CameraRig`, `OrbitControls`, `FirstPersonControls`, `ThirdPersonFollowControls`, `EditorFlyControls`: camera movement controls.
- `createSceneCameraControlAdapter`: bridge from scene cameras to control transforms.

## Verification

Input snapshots, transitions, action maps, keyboard chords, pointer/gamepad behavior, gestures, interaction targets, picking rays, camera controls, browser input lifecycle, and example input metrics are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `tests/unit/input/camera-controls.test.ts`, `tests/browser/input-browser.spec.ts`, and `tests/browser/examples-runtime.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
