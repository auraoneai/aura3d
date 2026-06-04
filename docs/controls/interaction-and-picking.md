# Controls, Interaction, And Picking

Version: 1.0.0

`@aura3d/controls` owns camera controls, transform controls, selection, picking helpers, annotation picking, and interaction-mode adapters. The package is exported from `@aura3d/engine/controls`.

## Package Surface

| Capability | Source |
|---|---|
| Orbit camera | `packages/controls/src/OrbitControls.ts` |
| Trackball camera | `packages/controls/src/TrackballControls.ts` |
| Fly and first-person movement | `FlyControls.ts`, `FirstPersonControls.ts` |
| Map and pointer-lock movement | `MapControls.ts`, `PointerLockControls.ts` |
| Drag and transform tools | `DragControls.ts`, `TransformControls.ts` |
| Selection state | `SelectionManager.ts` |
| Unified interaction adapter | `InteractionControls.ts` |
| Renderable/object picking | `Picking.ts` |
| Annotation and hotspot picking | `PickingAnnotations.ts` |
| Shared control types and state | `NativeControlTypes.ts`, `ControlState.ts` |

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

- `tests/unit/controls/three-compat-controls.test.ts`
- `tests/browser/three-compat-controls.spec.ts`
- `tests/browser/advanced-examples-gallery.spec.ts`
- `tools/three-compat-controls-readiness/index.ts`

Useful commands:

```sh
pnpm three-compat:controls
pnpm advanced-gallery:pipeline
```

## Current Limits

- Imported GLB part selection is evidence-bound. Do not imply triangle-level authored-asset picking unless the route/test proves that exact path.
- XR controller sampling and AR hit-test behavior are route/app evidence surfaces, not a blanket package claim.
- Controls compatibility with low-level renderer code is scoped to supported adapters and tested workflows.
