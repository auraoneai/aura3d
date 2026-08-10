# Controls, Picking, WebXR, And Context Recovery

Status: Aura3D 2.0 bounded interaction and lifecycle receipt.

The canonical proof combines public control/input packages, rendered diagnostic
routes, the root `createAuraApp` lifecycle API, and selected comparisons against
actual `three@0.185.1` / r185. It does not promote package controls into root
scene-builder APIs or injected WebXR into a physical-device claim.

## Controls and input

Rendered browser routes prove:

- Orbit controls apply six rotate samples, four pan samples, and one wheel
  sample to an A3D WebGL2 camera.
- Trackball controls apply rotate, pan, zoom, and roll to an A3D WebGL2 camera.
- Transform controls render translate, rotate, and scale gizmos with 6, 3, and
  7 handles. Pointer drags constrain X translation to 0.5, Z rotation to
  0.785398 radians, and X scale to 1.5; a raw 0.68 drag snaps to 0.5.
- First-person controls move a browser-side camera from keyboard state.
- Browser input records keyboard focus and blur, a touch-style pointer down/up,
  a 0.75 gamepad axis, a gamepad button transition, and pointer-lock request
  settlement.

The tested viewport is keyboard-focusable and has an `application` role, a
nonempty accessible label, and described-by instructions. This proves the
tested interaction semantics, not a complete WCAG audit.

The focused unit gate also compares the same orbit input and identical cube and
point rays against actual Three.js `OrbitControls` and `Raycaster` behavior.
That is behavioral comparison, not a pixel-identical control-widget claim.

## Picking and gizmos

The rendered picking route reports hits for transformed cubes and a point cloud
through public camera-ray and scene-picking APIs. A separate browser sweep moves
a real pointer across the route and requires a live cube hit. Package tests
cover nearest/priority picking, annotations and imported-hotspot metadata,
selection, misses, constraints, snapping, and local/world gizmo orientation.

Transform controls are a public `@aura3d/controls` package feature. They are not
claimed as a root `createAuraApp` scene-builder feature.

## WebXR boundary

The retained WebXR route starts injected `immersive-vr`, `immersive-ar`, and
`inline` sessions through `WebXRSessionController`. It samples two controllers,
trigger/squeeze interactions, three AR hit tests, reference spaces, and session
lifecycle. The evidence explicitly records `realDeviceClaimed: false`.

No physical headset, controller, browser XR compositor, native XR renderer, or
hardware presentation path was used. Physical-device WebXR remains unproven.

## Context loss and scene restoration

The root-safe retained route uses `WEBGL_lose_context` to provoke a real WebGL2
loss. Its `app.onDeviceLost(...)` handler pauses the app before unsafe frame
work continues. On the public restoration signal it explicitly calls
`app.setScene(...)`, waits for `app.ready()`, resumes, and renders through a
newly mounted production runtime.

The browser receipt records one loss, one restoration, and one recovery; a
mounted replacement runtime; 518,400 lit pixels before and after; and the same
`a2fb8e3e` framebuffer hash after restoration. It also verifies that removing a
loss subscription prevents the listener from firing again.

This is app-driven recovery using public APIs. Aura3D does not claim that every
lower-level renderer consumer transparently recreates arbitrary external GPU
resources without an explicit remount.

## Reproduce the receipt

```bash
pnpm renderer:controls-picking-xr-context
```

The command verifies the online current Three.js baseline, builds the workspace,
runs 19 focused unit tests, runs eight browser tests, and writes a 12/12
aggregate report to
`tests/reports/controls-picking-xr-context/report.json`.
