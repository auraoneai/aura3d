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

## Install the Rapier backend

Physics runs on `@dimforge/rapier3d-compat`, an optional peer of `@aura3d/engine`. It is not installed with the engine, so a project that
never installs it never ships it; once it is installed, every app in the project loads it at startup unless it is built with the Aura3D Vite plugin (see the costs and the two modes below). Install it once in any project that calls `.physics({...})`, `app.physics`, `preloadPhysics()` or
`new PhysicsWorld()`:

```bash
npm install @dimforge/rapier3d-compat@0.20.0
```

If it is missing, the failure is typed and immediate rather than an anonymous string:

- `error.code === "PHYSICS_BACKEND_MISSING"` and `error.installCommand` holds the command above (thrown by `app.physics`,
  `new PhysicsWorld()`, `createRapierPhysics()`; `preloadPhysics()` rejects with it).
- `createAuraApp` keeps the app alive: `app.diagnostics().errors` contains the message, the canvas shows the error overlay, and the console logs it. Declared bodies stay unsimulated.
- `aura3d doctor` fails a project whose `src/` uses physics while the backend cannot be resolved, and prints the same command.

### What installing Rapier costs, and how to pay it only when you use physics

Once `@dimforge/rapier3d-compat` is resolvable from your project, the engine's physics world module initialises it with a top-level
`await`; that is what makes `app.physics` and `new PhysicsWorld()` usable synchronously the moment `createAuraApp` returns. Without
help from the build, that means **every** app that imports `@aura3d/engine` downloads and initialises Rapier at startup, including
an app that never touches physics. The Aura3D Vite plugin removes that cost in two ways:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { aura3d } from "@aura3d/assets/vite";

export default defineConfig({ plugins: [aura3d()] }); // physics: "auto" (default) | "lazy" | true | false
```

- **`physics: "auto"` (default): strip at build time.** On `vite build` the plugin walks your app's own module graph (your source,
  including dynamically imported modules and shared folders outside the Vite root, plus any third-party dependency that itself
  depends on `@aura3d/*` or Rapier). Any mention of physics keeps Rapier: `.physics(`, `app.physics`, `preloadPhysics`,
  `ensurePhysics`, `PhysicsWorld`, `@aura3d/physics`, `@dimforge/rapier*`, rigid bodies, colliders, character controllers, vehicles,
  ragdolls, scene kits and every genre kit (`game`, `games`, `createGame*`), case-insensitive, comments and strings included.
  Engine APIs that declare bodies internally keep it too, even when your code never spells a physics word: the name of every
  public engine export or namespace member whose implementation declares bodies or colliders or uses the physics world
  (for example `prefabs.miniGolfHole()` and `prefabs.miniGolfCourse()`, which build static walls and a dynamic ball) is generated
  from the engine sources into `packages/assets/src/vite/physicsEntryPoints.generated.ts`, and a unit test fails when that list
  falls behind the engine. When the scan cannot tell which member you use, it keeps Rapier: `prefabs[name]`,
  `Object.values(prefabs)`, passing `prefabs` along, an `import * as engine from "@aura3d/engine"` used other than as
  `engine.member`, or `import("@aura3d/engine")`. Only when there is no mention at all is the solver module replaced by a stub
  without a Rapier import, so no Rapier chunk is emitted.
  The build log says which way it went (`[aura3d] physics kept ("physics" in src/level.ts)` or `[aura3d] physics stripped: ...`).
  The scan reads text, so it cannot see physics reached only through a name assembled at runtime (`app[["ph", "ysics"].join("")]`):
  set `aura3d({ physics: true })` for such an app. If a stripped app uses physics after all, `app.physics`,
  `new PhysicsWorld()` and `preloadPhysics()` throw the typed error with `error.code === "PHYSICS_BACKEND_MISSING"` and the message
  `PHYSICS_BACKEND_MISSING: physics was stripped at build time because no physics usage was found; set aura3d({ physics: true }) in vite.config`.
  `vite dev` never strips; neither does an SSR build. `physics: true` never strips, `physics: false` always does.
- **`physics: "lazy"`: download on first use.** Rapier stays in the build as a separate chunk but is fetched only when a scene
  declares `.physics({...})` bodies (initial scene, `app.setScene` or a runtime node add) or `app.physics` is first touched. Until it
  has loaded, declared bodies and `onCollision` / `onCollisionWith` / `onTriggerEnter` / `onTriggerExit` handlers are queued and
  applied in order on load, `app.physics.step()` and `contacts()` return `[]`, and every other `app.physics` call (`createBody`,
  `createJoint`, `bodies.*`, `queries.*`, `gravity()`, ...) throws a typed error with `error.code === "PHYSICS_NOT_READY"` that tells
  you to `await app.physics.ready()` (or `await app.ready()`, which also waits for a load in flight). After that, `app.physics` is the
  same object and behaves exactly like the eager build. Code that calls `app.physics.createBody(...)` right after `createAuraApp(...)`
  therefore needs one `await app.physics.ready()` first; that is why this mode is opt-in. The same semantics are available without
  the plugin through `createAuraApp(target, { physics: { load: "on-demand" } })` (Rapier is then already downloaded by an eager
  build, but the API behaves identically, so dev and prod agree), and for non-Vite bundlers through the `aura3d-physics-on-demand`
  package condition. Genre kits and `createGame` construct their worlds synchronously: in a lazy build, `await ensurePhysics()` (from
  `@aura3d/engine/physics`) before creating them, as in the `aura3d-no-tla` build.

Measured in a clean Vite 8 consumer (the npm dependency tree of `@aura3d/engine@5.0.2` with Rapier installed, engine replaced by the
packed tarball), gzip at level 9, scripts fetched by headless Chrome with the real GPU:

| App | Build | JS emitted | gzip | Rapier chunk | Rapier fetched |
| --- | --- | --- | --- | --- | --- |
| one lit box, no physics | 5.0.2 (npm), no plugin | 9.40 MB | 3.01 MB | 2.85 MB (1.08 MB gzip) | at startup |
| one lit box, no physics | this engine, no plugin | 9.41 MB | 3.01 MB | 2.85 MB (1.08 MB gzip) | at startup |
| one lit box, no physics | `aura3d()` (auto) | **6.55 MB** | **1.93 MB** | **none** | never |
| one lit box, no physics | `aura3d({ physics: "lazy" })` | 9.41 MB | 3.01 MB | 2.85 MB (1.08 MB gzip) | never (not used) |
| recipe 16 (physics at startup) | `aura3d()` (auto: kept) | 9.41 MB | 3.01 MB | 2.85 MB (1.08 MB gzip) | at startup |
| intro scene, physics scene after 2.5 s | `aura3d({ physics: "lazy" })` | 9.41 MB | 3.01 MB | 2.85 MB (1.08 MB gzip) | 2.78 s, on first use |

The physics app's output with `aura3d()` is byte-identical to the build without the plugin, and recipe 16 reports the same state
after 140 fixed steps in every configuration (eager, `auto`, `lazy`, 5.0.2: `solidHits 109`, `firstCrateHitStep 78`, identical body
positions) with byte-identical frames. The numbers, chunk lists and network timelines are in `evidence/physics-519/`.

Without the plugin nothing changes, and the rest still applies:

- Do not install Rapier in a project that does not use physics, not even "just in case", unless you build with `aura3d()`.
  Installing `@aura3d/physics` or `@aura3d/physics-rapier` from npm also installs it (they list it as a dependency).
- The `aura3d-no-tla` condition (see "Bundler targets and top-level await" below) does not avoid the download: it only moves the WASM
  initialisation off the import path, and that module still starts loading Rapier as soon as it is evaluated.
- Rapier's separate-`.wasm` build (`@dimforge/rapier3d`, not `-compat`) would be smaller on the wire (measured for 0.20.0: a 2.02 MB
  `.wasm`, 0.76 MB gzip, plus 0.24 MB of JS glue, against the compat chunk's 2.85 MB / 1.08 MB gzip with the WASM inlined as base64)
  and could be compiled while streaming and cached on its own, but it imports the `.wasm` as an ES module, which needs a WASM bundler
  plugin in every consumer and a different package name. It is not used: switching would break existing installs.
- Making `lazy` the default (and `app.physics` async-first) is the breaking change left for 6.0 (C5-05 in
  `docs/project/5.0-games-and-examples-upgrade-plan.md`).

A complete example is recipe 16 in `docs/agents/recipes.md` (`docs/agents/recipes-src/physics-basics`).

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
