# Controls, Interaction, And Picking

Version: 3.0.0

`@aura3d/controls` owns camera controls, transform controls, selection, picking helpers, annotation picking, and interaction-mode adapters. The package is exported from `@aura3d/engine/controls`.

## Package Surface

| Capability | Source |
|---|---|
| Orbit camera | `packages/controls/src/OrbitControls.ts` |
| Arcball camera (free rotation, no polar clamp) | `packages/controls/src/ArcballControls.ts` |
| Trackball camera | `packages/controls/src/TrackballControls.ts` |
| Fly and first-person movement | `FlyControls.ts`, `FirstPersonControls.ts` |
| Map and pointer-lock movement | `MapControls.ts`, `PointerLockControls.ts` |
| Drag and transform tools | `DragControls.ts`, `TransformControls.ts` |
| Selection state | `SelectionManager.ts` |
| Hover highlight + focus framing decisions | `HoverOutline.ts`, `FocusFrame.ts` |
| Unified interaction adapter | `InteractionControls.ts` |
| Renderable/object picking (incl. skinned/instanced) | `Picking.ts` |
| Annotation and hotspot picking | `PickingAnnotations.ts` |
| Shared control types and state | `NativeControlTypes.ts`, `ControlState.ts` |

## F1 Disposal Standard

Every control follows the same disposal contract, verified in
`tests/unit/controls/control-disposal.test.ts`:

- `dispose()` disables the instance, detaches cameras/objects, drains
  residual (damping) velocity, drops every listener/handler, and owns zero
  DOM listeners — so nothing can leak. All mutators are no-ops afterwards.
- `dispose()` is idempotent, and `isDisposed` reports the state
  (`SelectionManager` is the deliberate exception: it stays re-mountable so
  repeated mount/dispose cycles work, while listeners are still dropped).
- The `controls` package owns zero DOM listeners by construction — input
  arrives through method calls and `InputSnapshot`s. DOM listeners live only
  in `@aura3d/input`'s `InputSystem`, which removes every listener it adds
  on `dispose()` (proven by the attach/dispose balance test). The
  repeated-mount test (25 cycles across all 12 control/adapter classes)
  proves no listener accumulation and post-dispose silence.

## F1 Parity Table (option x control x three.js r185 addon)

Reference: repository-locked `three@0.185.1` addon implementations.
`yes` means the option/behavior exists and is covered by a test named below.
`GAP` means explicitly missing — listed, never claimed.

| Option / behavior | three.js r185 | Orbit | Arcball | Trackball | Map | Fly | FirstPerson | PointerLock | Drag | Transform | Interaction |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Rotate / orbit | yes | yes | yes (free, no polar clamp) | yes | yes | n/a (look) | yes (`look`) | yes (locked `look`) | n/a | n/a | yes (delegates) |
| Pan / truck | yes | yes | yes (`pan`) | yes | yes (`truck`, XZ ground plane) | n/a (strafe/lift) | n/a | n/a | n/a | n/a | yes (delegates) |
| Dolly / zoom + min/max distance | yes | yes (min/maxDistance, polar clamp via engine) | yes (`dolly`, min/maxDistance) | yes | yes | n/a | n/a | n/a | n/a | n/a | yes (delegates) |
| Damping (`enableDamping` + tick) | Orbit/Trackball yes | GAP (delegated engine is undamped) | yes (`update(dt)`) | yes (`update(dt)`) | GAP (inherits Orbit) | GAP (direct velocity) | GAP | GAP | n/a | n/a | n/a |
| Zoom to cursor | Orbit yes | GAP (see note 1) | GAP (see note 1) | GAP | GAP | n/a | n/a | n/a | n/a | n/a | n/a |
| Pan bounds | no (unbounded) | n/a (matches: unbounded) | n/a (matches: unbounded) | n/a | n/a (matches: unbounded XZ truck) | n/a | n/a | n/a | n/a | n/a | n/a |
| Keyboard look/pan/roll/dolly | Trackball keys | GAP | GAP | yes (`handleKey`) | GAP | yes (WASD/QE + Shift fast) | yes | yes (locked) | n/a | n/a | yes (fly keys) |
| Roll about view axis | Trackball/Arcball | GAP | yes (`roll`) | yes (`roll`) | GAP | n/a | n/a | n/a | n/a | n/a | n/a |
| Pointer lock gate | PointerLock yes | n/a | n/a | n/a | n/a | n/a | n/a | yes (`lock`/`unlock`/`locked`) | n/a | n/a | n/a |
| `saveState` / `reset` | Orbit yes | yes (attached) | GAP (stateless deltas) | yes (inherits Orbit) | yes (inherits Orbit) | n/a | n/a | n/a | n/a | n/a | n/a |
| Snap (translate/rotate/scale) | Transform yes | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a (delegates) | yes (`snap` settings + drag math) | n/a |
| Gizmo pick + pointer drag lifecycle | Transform yes | n/a | n/a | n/a | n/a | n/a | n/a | n/a | explicit deltas only (deprecated shim) | yes (`pick`/`hover`/`pointerDown`/`pointerMove`/`pointerUp`) | n/a |
| `dispose()` to F1 standard | yes (listener removal) | yes | yes | yes | yes (inherits Orbit) | yes | yes (inherits Fly) | yes | yes | yes | yes |
| Skinned/instanced picking | Raycaster yes | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a (see Picking rows) |

Notes:

1. Zoom-to-cursor is a deliberate GAP, not an oversight: this package owns
   no DOM or cursor state (input arrives via snapshots/method calls) and the
   `*CameraLike` surfaces carry position only, so there is no projecting
   camera to resolve the cursor ray. Same reason the Arcball header lists
   `cursorZoom`, two-finger gestures, and `adjustNearPlane` as gaps.
2. Damping exists where decaying velocity is meaningful (Arcball/Trackball
   free rotation). Orbit delegates to the input engine's exact spherical
   math, which is undamped; adding a second damped integrator on top would
   fork the camera path rather than match three.js.
3. `DragControls` is a deprecated compatibility shim (explicit world-space
   deltas onto `TransformControls`); it is not a browser/Three.js
   DragControls implementation. See `DRAG_CONTROLS_DEPRECATION`.

## F4 Picking, Hover, Focus, And Gizmo Snap

- `Picking` handles `Mesh`, `SkinnedMesh` (bind-pose sphere; bone-deformed
  triangles beyond the radius are an explicit non-goal), `InstancedMesh`
  (per-instance spheres via metadata `instancePositions`, hit reports
  `instanceId`), `Sprite`, `Points`, and `LineSegments`.
  Tests: `tests/unit/controls/skinned-instanced-picking.test.ts`.
- `HoverOutline` owns the hover/selection-to-outline decision (hover,
  selected, hover-selected tones with distinct styles); the renderer owns
  the pixels. `FocusFrame.frameSelection` computes the orbit target and
  distance that frames a pick set for a given fov. Tests:
  `tests/unit/controls/hover-outline-focus-frame.test.ts`. Browser proof
  (real WebGL2 pixels): `tests/browser/controls-hover-focus.spec.ts` —
  hover outline changes 1,801 pixels (100% blue-dominant), selection
  re-tones 2,094 pixels, and the framed cube lands centered (127.5, 127.5)
  at the analytic distance. Evidence:
  `tests/reports/controls-hover-focus/`.
- Editor-route gizmo snapping goes through `InteractiveTransformGizmo`
  (`@aura3d/editor-runtime`) snap settings, not the controls twin.
  Browser proof: `tests/browser/editor-gizmo-snap.spec.ts` — a 0.68
  translate gesture commits 0.5 on the grid (unsnapped twin commits 0.68),
  and a 68-degree rotate gesture commits 75 degrees on the 15-degree grid,
  with 5,568 rendered gizmo pixels. Evidence:
  `tests/reports/editor-gizmo-snap/`.

## Interaction Model

Use camera controls to own camera intent, not scene mutation. Use `SelectionManager` to track selected scene objects or annotations. Use `InteractionControls` when a route needs one adapter for hover, select, drag, inspect, or camera modes.

Picking has two current layers:

- `Picking` for scene/object-oriented picking reports and diagnostics.
- `PickingAnnotations` for route-authored screen-space or metadata-backed hotspots.

This split matters for product and advanced-gallery routes: annotation hotspots can be accepted when the route owns the annotation geometry or screen-space targets, while full triangle-level picking over imported GLB renderables needs separate renderer/asset evidence.

## Where It Is Used

- Product configurator and product-studio workflows use controls for camera framing, inspection, and variant interactions.
- Advanced gallery routes use route-specific controls, reset/capture buttons, camera presets, and runtime stats.
- Three-compat routes use controls evidence through `three-compat:controls`.
- Editor/runtime surfaces use picking and transform controls through `@aura3d/editor-runtime`.

## Verification

Focused coverage lives in:

- `tests/unit/controls/control-disposal.test.ts` (F1: every control + repeated mount)
- `tests/unit/controls/skinned-instanced-picking.test.ts` (F4)
- `tests/unit/controls/hover-outline-focus-frame.test.ts` (F4)
- `tests/browser/controls-hover-focus.spec.ts` (F4 pixel proof)
- `tests/browser/editor-gizmo-snap.spec.ts` (F4 editor-route snap proof)
- `tests/unit/controls/exported-controls-resolution.test.ts`
- `tests/unit/input/orbit-controls-three-parity.test.ts`
- `tests/unit/rendering/interactive-cubes-three-parity.test.ts`
- `tests/unit/rendering/interactive-points-three-parity.test.ts`
- `tests/unit/controls/three-compat-controls.test.ts`
- `tests/browser/threejs-parity-orbit-controls.spec.ts`
- `tests/browser/threejs-parity-transform-controls.spec.ts`
- `tests/browser/input-browser.spec.ts`
- `tests/browser/current-routes-parity-evidence.spec.ts`

Useful commands:

```sh
pnpm three-compat:controls
pnpm renderer:controls-picking-xr-context
```

## Current Limits

- Imported GLB part selection is evidence-bound. Do not imply triangle-level authored-asset picking unless the route/test proves that exact path.
- XR controller sampling and AR hit-test behavior are route/app evidence surfaces, not a blanket package claim.
- The current XR receipt uses injected sessions only; it is not physical-device,
  compositor, or hardware-renderer evidence.
- Controls compatibility with low-level renderer code is scoped to supported adapters and tested workflows.

See `docs/rendering/controls-picking-xr-context.md` for the current r185,
rendered-route, input-modality, injected-XR, and context-restoration receipt.
