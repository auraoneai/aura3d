# Tutorial: Physics Sandbox

This tutorial explains the current `examples/physics-sandbox` demo. It is an interactive renderer-backed physics slice for rigid-body behavior and debug output.

## Run The Demo

Serve the repository with the browser-test example server and open:

```text
/examples/physics-sandbox/index.html
```

Focused browser verification is:

```sh
pnpm exec playwright test tests/browser/physics-sandbox-browser.spec.ts
```

## What It Uses

- `@aura3d/physics` for rigid bodies, colliders, sensors, fixed-step simulation, broadphase stats, and debug line extraction.
- `@aura3d/rendering` for WebGL2-rendered cubes, ground lines, and debug geometry.
- Browser controls for spawning, stepping, and toggling debug layers.

## Implementation Shape

Keep simulation and presentation separate:

```ts
world.step(fixedDeltaSeconds);
syncPhysicsBodiesToRenderItems(world, renderItems);
const diagnostics = renderer.render(renderItems);
```

The physics world decides contacts and body transforms. The renderer only receives the current geometry and debug lines.

## Current Limits

Continuous collision detection is not supported. This demo does not claim vehicle dynamics, cloth, soft bodies, fluids, destructible simulation, or a native physics backend.
