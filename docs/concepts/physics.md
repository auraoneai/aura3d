# Physics

Version: 1.5.3

Aura3D physics has two layers, and the distinction matters when you are deciding what to reach for:

- **`app.physics`** — the public runtime on a live app. This is what you use to build a game.
  Reachable from `@aura3d/engine` with no deep imports.
- **`@aura3d/physics`** — the solver underneath (`PhysicsWorld`, `RigidBody`, `Collider`,
  `Constraint`, `MeshBVH`, `SurfaceQuery`), over either a `cannon-es` or a native `aura-js`
  backend. You do not need it for gameplay code.

Until 1.5.3 only the second layer existed in any usable form. `.physics({ type: "dynamic" })`
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

## Boundary and limits

The public boundary is `app.physics` on `@aura3d/engine`; the solver boundary is
`@aura3d/physics`. Claims about collision, solver or character-controller behaviour must cite the
specific API and the test or route evidence behind them.

- Genre kits (`game.racing`, `game.platformer`, `game.fallingBlocks`, `game.locomotion`) do
  **not** yet consume this runtime. They remain separate implementations, so a fix in a kit does
  not reach the general layer or vice versa. See `GameEngine-PRD.md` WS-3.8.
- Cloth, softbody and large-scale simulation are not implemented.
- Physics debug rendering exists in `packages/physics/src/PhysicsDebugDraw.ts` but has no route
  consumer, so it is unproven.
- Vehicle dynamics and vehicle AI driving are `parity-unproven` in the Three.js parity report.
  A racing route's motion is a kit-local kinematic model, not the force-based tyre model in
  `packages/physics/src/VehicleMotion.ts`.
