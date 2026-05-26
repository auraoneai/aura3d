# Physics Sandbox

Interactive renderer-backed physics sandbox for the v2 physics track.

## Run

Run the repository dev server used by the browser tests and open `examples/physics-sandbox/index.html`.

## Systems Used

- `@aura3d/physics` for rigid bodies, colliders, sensors, discrete fixed-step simulation, broadphase stats, and debug line extraction.
- `@aura3d/rendering` for WebGL2 renderer-backed cubes, ground lines, and physics debug lines.

## Expected Output

The canvas shows a ground line, falling boxes, a fast body, a sensor box, and optional physics debug overlays. The buttons spawn another box, step the simulation, and toggle debug rendering. Debug layer checkboxes control collider outlines, contact normal lines, AABB boxes, and sleeping-body markers. Runtime state is published to `window.__AURA3D_PHYSICS_SANDBOX__`.

## Known Limits

Continuous collision detection is not supported; fast bodies use discrete fixed-step collision. This sandbox demonstrates the built-in deterministic physics path, not vehicle dynamics, cloth, soft bodies, fluids, or a native physics backend.
