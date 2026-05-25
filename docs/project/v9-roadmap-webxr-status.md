# V9 WebXR Status

WebXR is scoped and partial.

## Real Code

- `packages/input/src/WebXRSessionController.ts`
- `apps/webxr-interactions/`
- V9 inventory and claim reports under `tests/reports/v9/`.

## Current Claim

G3D has WebXR-facing session/controller/hit-test style interaction code and a scoped interaction route.

## Blocked Claims

- Real headset production readiness.
- Full Three.js WebXR example parity.
- Complete renderer frame-submission parity.
- Full haptics, grip/target-ray, AR placement, and VR interaction coverage.

## Required To Graduate

- Real browser/headset session evidence.
- Renderer camera/projection integration for XR frame loops.
- Controller pose and interaction parity against official Three.js WebXR examples.
- Device-specific failure-mode documentation.
