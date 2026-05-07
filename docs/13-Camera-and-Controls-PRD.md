# Camera And Controls PRD

## Purpose
Cameras define how a scene is viewed. Controls provide reusable camera movement behaviors for orbit, first-person, third-person, editor fly, and cinematic use. This subsystem makes camera behavior reusable without hardcoding it into examples.

## Lessons From Failed Attempts
- Current examples each carried their own camera/controller logic.
- G3D docs described cameras and controls, but transform hierarchy gaps made reliable camera behavior risky.
- Old-G3D had many cameras, editor controls, and cinematic fixes spread through examples and failure reports.

Reuse conceptually:

- Perspective and orthographic camera types.
- Orbit, first-person, and editor controls.
- Camera rigs for follow and cinematic use.

Discard:

- Example-only camera logic as the canonical implementation.
- Controls mutating renderer state directly.

## Target Architecture
Camera data lives in `scene`. Reusable controls can live in `input` or a small controls package. Controls consume input snapshots and mutate scene camera nodes explicitly.

## File-By-File Implementation Plan

### `packages/scene/src/Camera.ts`
- Purpose: abstract camera data, view/projection generation.
- Tests: view/projection matrices and frustum extraction.

### `packages/scene/src/PerspectiveCamera.ts`
- Purpose: perspective camera.
- Edge cases: invalid FOV, near/far reversed, aspect changes.
- Tests: projection values and resize.

### `packages/scene/src/OrthographicCamera.ts`
- Purpose: orthographic camera.
- Tests: zoom and projection bounds.

### `packages/input/src/controls/OrbitControls.ts`
- Purpose: rotate/pan/zoom around target.
- Dependencies: input snapshot, scene node, math.
- Edge cases: polar clamps, zoom min/max, target changes.
- Tests: deterministic rotation/pan/zoom.

### `packages/input/src/controls/FirstPersonControls.ts`
- Purpose: keyboard/mouse movement and look.
- Edge cases: pointer lock unavailable, pitch clamp.
- Tests: movement and look deltas.

### `packages/input/src/controls/ThirdPersonFollowControls.ts`
- Purpose: follow target with smoothing and collision hook.
- Edge cases: target removed, smoothing with low FPS.
- Tests: follow offset and damping.

### `packages/input/src/controls/EditorFlyControls.ts`
- Purpose: editor viewport navigation.
- Tests: speed modifier and focus pivot.

### `packages/input/src/controls/CameraRig.ts`
- Purpose: composable rig offsets, shake, blend between camera states.
- Tests: state blending and shake decay.

## Acceptance Criteria
- Perspective and orthographic cameras produce correct frustums.
- Orbit and first-person controls work in browser examples.
- Controls can be enabled/disabled and disposed without leaked listeners.
- Camera update order is explicit: input phase mutates camera transform, scene phase computes world matrix, render phase reads camera.

## Testing Checklist
- Unit: camera matrices, frustum, controls math.
- Browser/runtime: orbit and first-person examples.
- Visual: grid scene from multiple camera types.
- Regression: controls do not attach duplicate event listeners.

## Implementation Order
1. Camera correctness.
2. Orbit controls.
3. First-person controls.
4. Editor fly controls.
5. Third-person controls and camera rig.

