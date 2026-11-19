# @aura3d/controls

`@aura3d/controls` owns camera controls, transform controls, picking,
selection, annotations, hotspots, and interaction helpers for Aura3D apps,
including projects ported from three.js.

## Public API

- `OrbitControls`, `TrackballControls`, `FlyControls`, `FirstPersonControls`,
  `MapControls`, and `PointerLockControls`: camera/navigation controls.
- `DragControls`, `TransformControls`: object manipulation controls.
- `SelectionManager`: selection ownership for interactive scenes.
- `InteractionControls`: interaction modes, rays, listeners, and hotspot
  handling.
- `Picking`: picking reports and diagnostics.
- Picking annotation helpers such as `createRobotPickingAnnotations`,
  `createDistrictPickingAnnotations`, `pickAnnotation`, and
  `pickScreenSpaceAnnotation`.
- Shared control state and native control type helpers.

## Package Boundary

This package provides control and picking primitives. A public root
`createAuraApp` route proves an interaction by importing the controls or root
interaction helpers and verifying the behavior in a browser test.
