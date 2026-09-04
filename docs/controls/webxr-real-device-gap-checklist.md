# WebXR real-device gap checklist (muse3jsparity-PRD N3)

`WebXRSessionController` (`packages/input/src/WebXRSessionController.ts`)
samples controller, hand, XR-camera, hit-test, and haptic state through an
**injected session only**. Every capability flag in `WebXRCapabilityReport`
degrades to an explicit `false`/empty — the controller never claims hardware
XR. The `webxr-interactions` route publishes `evidenceMode:
"injected-webxr-session"` with `realDeviceClaimed: false`.

A real-device pass is NOT claimed until each item below is closed with
device-captured evidence:

- [ ] Physical headset + browser matrix named (device, OS, browser build, WebXR flags).
- [ ] `immersive-vr` session started from `navigator.xr` (not an injected `A3DXRSystemLike`).
- [ ] Controller poses match optical ground truth within a stated tolerance (per-controller log).
- [ ] Hand-tracking joints converge against a pinned-hand fixture (per-joint error table).
- [ ] Viewer-pose matrices drive the XR camera for a full session without `tracked: false` gaps (gap log).
- [ ] Hit-test placements reproduce against a measured room anchor (offset table).
- [ ] Haptic `pulse()` acknowledged by device actuators (per-actuator receipt, not just API acceptance).
- [ ] Frame-rate and thermal behavior recorded over a 10-minute session (no injected-frame extrapolation).
- [ ] `XRLayer` handling validated against real `XRWebGLLayer`/`XRProjectionLayer` composition (currently capability-reported only).
- [ ] Graceful loss path proven: device disconnect mid-session ends the controller without throwing and reports `active: false`.
