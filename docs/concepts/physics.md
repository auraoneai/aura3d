# Physics

> three.js ships no physics layer, so you pick a solver and sync it to your meshes yourself. In Aura3D `app.physics` is on the live app, from `@aura3d/engine` with no deep imports: bodies declared on scene nodes, impulses, trigger sensors, raycasts, collision layers and joints.

Aura3D physics has two layers, and the distinction matters when you are deciding what to reach for:

- **`app.physics`** — the public runtime on a live app. This is what you use to build a game.
  Reachable from `@aura3d/engine` with no deep imports.
- **`@aura3d/physics`** — the solver underneath (`PhysicsWorld`, `RigidBody`, `Collider`,
  `Constraint`, `MeshBVH`, `SurfaceQuery`), over either a `cannon-es` or a native `aura-js`
  backend. You do not need it for gameplay code.

In the retired 1.x line only the second layer existed in any usable form. `.physics({ type: "dynamic" })`
let you declare a body and watch it fall; there was no handle to push it, no collision callback,
and no query. Declaring a simulation you cannot interact with is not a physics API, and it is why
the library had four hardcoded genre kits and no path to a fifth.

## Push a crate

Every snippet below uses `@aura3d/engine` only.

```ts
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#stage", {
  scene: scene().add(
    primitives.box({ name: "crate", material: material.pbr({ color: "#c98b4b" }) })
      .position(0, 0.5, 0)
      .physics({ type: "dynamic", shape: "box", halfExtents: [0.25, 0.25, 0.25], mass: 1 })
  )
});

// Bodies declared on scene nodes are registered under their node name.
app.physics.bodies.require("crate").applyImpulse([4, 0, 0]);

app.onFrame(({ dt }) => {
  app.physics.step(dt);
});
```

`applyForce` accumulates over a step; `applyImpulse` changes velocity immediately. Both wake a
sleeping body, so you do not have to remember to.

## Detect a pickup

Sensors report overlaps and never push. `onTriggerEnter` fires once per overlap rather than every
frame, so a pickup cannot be collected twice.

```ts
import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#stage", { scene: scene() });

const collected = new Set<string>();
app.physics.createBody({
  name: "ammo",
  type: "static",
  shape: "sphere",
  radius: 0.3,
  position: [2, 0.3, 0],
  sensor: true
});

app.physics.onTriggerEnter((event) => {
  const pickup = [event.nodeA, event.nodeB].find((name) => name === "ammo");
  if (pickup && !collected.has(pickup)) {
    collected.add(pickup);
    app.physics.removeBody(pickup);
  }
});
```

Collision events carry both node names, the contact point and normal, penetration depth, and
`relativeSpeed` — the approach speed along the normal. That last one is what separates a landing
from a crash, and without it gameplay code has to cache last-frame velocities itself.

## Raycast for line of sight

```ts
import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#stage", { scene: scene() });

const hit = app.physics.queries.raycast([0, 1, 0], [0, 0, -1], { maxDistance: 20 });
if (hit) {
  // `hit.nodeName` is the scene node, so you can act on it directly.
  hit.body.applyImpulse([0, 2, 0]);
}
```

`raycastAll`, `sphereCast`, `overlapSphere` and `overlapBox` are also available. Prefer
`sphereCast` over `raycast` when the moving thing has width: a zero-radius ray slips between
colliders a real projectile would hit. Every query accepts `ignore` (skip these body ids, so a
shooter does not hit itself) and `layers`.

## Bullets that hit enemies but not each other

Collision layers are declared on the app, because a mask is only meaningful relative to the
complete set of layers.

```ts
import { createAuraApp, createCollisionLayers, scene } from "@aura3d/engine";

const layers = createCollisionLayers({
  bullet: ["enemy", "wall"],
  enemy: ["bullet", "wall"],
  wall: ["bullet", "enemy"]
});

const app = createAuraApp("#stage", {
  scene: scene(),
  physics: { layers, gravity: [0, 0, 0] }
});

app.physics.createBody({ name: "bullet-1", shape: "sphere", radius: 0.05, mass: 0.05, layer: "bullet" });
```

Masked pairs generate no contacts at all, rather than being filtered after the solver has already
pushed them apart. `tests/clean-room/top-down-shooter` is a complete worked example in 176 lines.

## Build a hinged door

Six joint kinds are available: `fixed`, `hinge`, `slider`, `ball-socket`, `spring` and
`motorised-hinge`. Anchors are given in world space, because that is what a level author knows —
the hinge is at the door frame.

```ts
import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#stage", { scene: scene() });

app.physics.createBody({ name: "frame", type: "static", shape: "box", position: [0, 0.6, 0], halfExtents: [0.06, 0.6, 0.06] });
app.physics.createBody({ name: "door", shape: "box", mass: 2.4, position: [0.55, 0.6, 0], halfExtents: [0.5, 0.55, 0.04] });

const door = app.physics.createJoint({
  kind: "motorised-hinge",
  bodyA: "frame",
  bodyB: "door",
  anchor: [0, 0.6, 0],
  axis: [0, 1, 0],
  motorSpeed: 0,
  maxMotorTorque: 6
});

// Later, to open it:
door.setMotorSpeed(1.8);
```

A `slider` is prismatic: one translational degree of freedom and zero rotational ones.
`tests/clean-room/physics-puzzle` uses a hinge, a slider and a spring in 105 lines.

## Ground anything to a mesh

`createMeshSurfaceQuery` builds a BVH over indexed triangles and answers height, normal and grip
per point, cached per integer cell. This is what replaces a hand-written height approximation.

```ts
import { createMeshSurfaceQuery } from "@aura3d/engine";

const surface = createMeshSurfaceQuery({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2])
});

const height = surface.sampleHeight(0.25, 0.25);
const normal = surface.sampleNormal(0.25, 0.25);
```

For racing routes, `game.racingSceneBinding(...).vehicleSurface()` does this for you against the
track asset's own drivable triangles, so a route holds no surface constant at all.

## Shape capability

Audited against `packages/physics/src/Shape.ts`. Declaring an unsupported combination throws with
an actionable message rather than silently substituting a box.

| shape | dynamic | static | from a body spec |
|---|---|---|---|
| `box` | yes | yes | yes |
| `sphere` | yes | yes | yes |
| `capsule` | yes | yes | yes |
| `convexHull` | yes | yes | no — needs vertices |
| `mesh` | no | yes | no — needs geometry |
| `plane` | no | yes | yes |
| `heightfield` | no | yes | no — needs a height grid |

`mesh` and `heightfield` are static-only: a concave triangle soup has no well-defined inertia
tensor, and treating one as dynamic produces a body that falls through thin geometry.

## Collision matrix

Box, sphere and capsule bodies collide with a static plane or box, and with each other, and come to rest where
their shape says they should (`tests/unit/agent-api/physics-root-collision.test.ts`). The remote pixel receipt
`evidence/receipts/physics-root-collision/<version>.json` (`tests/browser/physics-root-receipts.spec.ts`) drops six
bodies onto a static ground through `createAuraApp` and records each body's rest height, its speed, whether the
visible node followed its body, and which pairs collided.

A capsule's `halfHeight` is the half-length of its cylindrical section, so it rests `radius + halfHeight` above a
floor. A capsule or cylinder primitive whose physics spec names no shape or size gets a collider that spans the
visible `size` (`[diameter, total height, diameter]`), not a default one:

```ts
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#stage", {
  scene: scene()
    .add(primitives.box({ name: "ground", size: [14, 0.5, 8] }).position(0, -0.25, 0)
      .physics({ type: "static", shape: "box", halfExtents: [7, 0.25, 4] }))
    .add(primitives.capsule({ name: "post", size: [0.5, 1.6, 0.5], material: material.pbr({ color: "#ffca28" }) })
      .position(0, 3, 0)
      .physics({ type: "dynamic", mass: 1 }))
});

// After it settles, the post's centre is half its 1.6 m height above the ground.
const rest = app.physics.bodies.require("post").position()[1];
```

Not covered by the receipt: mesh and heightfield colliders, joints, vehicles, and any claim about solver parity with another engine.

## Bundler targets and top-level await

The default build initialises the Rapier solver with a top-level `await`, so `app.physics` and `new PhysicsWorld()` are live
synchronously. That needs an ES2022+ module build: esbuild with `target: "es2020"` (or any iife/cjs output), Vite with
`build.target: "es2020"` and Rollup `iife` fail with "Top-level await is not available".

Consumers who must bundle that way opt in to the lazy solver with the `aura3d-no-tla` condition and initialise it first:

```ts
// esbuild: conditions: ["aura3d-no-tla"]   Vite: resolve.conditions: ["aura3d-no-tla"]   Rollup node-resolve: exportConditions
import { createAuraApp, scene } from "@aura3d/engine";
import { ensurePhysics } from "@aura3d/engine/physics";

await ensurePhysics(); // resolves immediately in the default build
const app = createAuraApp("#stage", { scene: scene() });
```

In the lazy build a world created before `ensurePhysics()` resolves throws an error that says so. `physicsInitMode` is
`"top-level-await"` (default) or `"lazy"`.

## Boundary

The public boundary is `app.physics` on `@aura3d/engine`; the solver boundary is
`@aura3d/physics`. Claims about collision, solver or character-controller behaviour must cite the
specific API and the test or route evidence behind them.

- Physics debug rendering is available as `app.physics.debugLines()` and is consumed by
  `tests/clean-room/physics-sandbox`, which reports per-category line counts.
## Current Limits

- Genre kits consume shared runtime services by capability, as recorded in ADR 0003. Racing and
  platformer delegate continuous pose integration to shared `GameRuntime` services; falling blocks
  uses deterministic stepping; locomotion consumes motion state; fighting composes shared combat,
  collision, camera and effects services. They do not all instantiate `app.physics`, because board
  rules and animation selection are not rigid-body simulation.
- Vehicle dynamics and vehicle AI driving remain `parity-unproven` in the Three.js parity report.
  `game.racing` is an authored-unit arcade contract. The unused, unreleased force-tyre prototype was
  removed rather than presented as physical simulation or retained as a second vehicle integrator.
- Cloth, softbody and large-scale simulation are not implemented.
- Rendering visual parity against Three.js is a separate, still-unproven claim; the strict
  product-render gate fails at 0.331 against a 0.15 threshold and is untouched by this layer.
- `mesh` and `heightfield` colliders are static-only. A concave triangle soup has no well-defined
  inertia tensor, and treating one as dynamic produces a body that falls through thin geometry.
