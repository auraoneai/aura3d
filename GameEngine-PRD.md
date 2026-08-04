# Aura3D Game Engine PRD — make the physics layer general, then make the games correct

**Status:** in progress — WS-0, WS-1, WS-2, WS-4, WS-6 complete with evidence.
WS-3.8 attempted and reverted with the finding recorded (see below). WS-5 and WS-7 open.
27 of 51 boxes ticked, each with command output cited in its row. Nine library-level defects
found and fixed in the process, listed in section 0.1.
**Owner:** engine
**Primary scope:** `packages/physics`, `packages/engine/src/agent-api`
**Secondary scope:** `packages/rendering`, `tools/showcase-library`, `tests/`
**Explicitly out of scope:** editing any file under `apps/` to make a symptom disappear

---

## 0.1 Library-level defects found and fixed while executing this PRD

Every one is in `packages/`, not in a route. Each has a test that fails without the fix.

| # | Class | Defect | Evidence |
|---|---|---|---|
| 1 | API-design | `AuraPhysicsRuntime`/`AuraBodyRegistry` were declared as interfaces with **no implementation**. `grep -rn AuraPhysicsRuntime` matched only their own file, so no developer could obtain one. The tests that "proved WS-1" exercised pure helpers through a deep `packages/physics/src` import. | `createPhysicsRuntime` + `app.physics`; 13 tests importing `@aura3d/engine` only |
| 2 | engine | Joints were a **silent no-op on the default backend**. `PhysicsWorld.stepCannon` never called `constraint.solve()`; only the `aura-js` fallback did. A body on a `fixed` joint free-fell to y = -18.78 instead of hanging at y = 1. This is why `joints/constraints` sat at "unproven, 0 consumers". | reverting the hunk fails 6 of 6 cannon-es joint tests |
| 3 | engine | `slider` left relative rotation unconstrained. A prismatic joint has zero rotational DOF; anchors ride each body's local frame, so spin swung the anchor and the positional solve *translated* the body to cancel it. A single along-axis impulse ended 0.478 off-axis in z and 0.780 in y — off the rail. Held fine at rest, which is why an isolated resting test passed. | off-axis 0.478 -> 0.034; regression test on both backends |
| 4 | engine | An app whose only motion was physics **rendered one frame and froze**, with no error. `shouldContinuouslyRender` can only see scene-declared motion, not a simulation or an `onFrame` callback. | measured `frames: 1` with five crates that should have been falling; now driven by a `requiresFrames()` predicate |
| 5 | API-design | `createCollisionLayers` existed with **nowhere to put the result**. A mask is only meaningful against the full layer set, so it cannot be passed per body. | `createAuraApp({ physics: { layers, gravity } })` |
| 6 | engine | `createVehicleMotion` never passed `maxLoad` to the tyre model, which defaults to 5000 N. Every vehicle lighter than a road car ran on the load-factor floor and lost **~10x its grip** — 1.1 g where 3.5 g was requested. Symptom was a car that would not turn, which reads as a tuning problem. | `tyre-load-rating.test.ts`; removing `maxLoad` fails it |
| 7 | API-design | Platformer move speed was derived from jump airtime, so **raising the jump made the character slower**: fixing the apex dropped speed 1.15 -> 0.703 and 60s traversal to 5.27 of a 16.6-unit course. Two independent design intentions were silently trading against each other. | `runSpeedPerHeight` as its own input; traversal 5.27 -> 15.15 |
| 8 | engine | Platformer apex came from `maxRise * apexHeadroom`, where `maxRise` is the step between consecutive platforms. A near-level course collapsed it, so the jump barely left the ground. | apex 0.684 -> 1.04 (2x character height) from declared intent |
| 9 | missing-capability | A racing route had no way to ground a car on the real road, so every one approximated. The geometry extractor emitted only a centreline — a curve, which cannot express camber or banking across the road's width, so all four wheels got the same height. | `drivableMesh` (2,902 triangles, 529 distinct elevations vs 13) + `GameRacingSceneBinding.vehicleSurface()` |

Not fixed, and not claimed: WS-3.8 (see its row), WS-5, WS-7, WS-1.7, WS-1.9.

---

## 0. What is actually wrong — corrected by investigation

An earlier draft of this document claimed Aura3D "has no general dynamic rigid-body
simulation." **That was wrong**, and the correction reframes the whole plan.

`packages/physics/src/PhysicsWorld.ts` is a real physics engine wrapper. It has:
- `createRigidBody`, `createCollider`, `createConstraint`, `removeRigidBody`
- `step(dt)` returning `readonly CollisionEvent[]`
- `raycast` / `raycastAll`
- configurable `solverIterations`, sleeping, adaptive substeps
- **two backends**: `cannon-es@0.20.0` (a mature, battle-tested engine) and an
  `aura-js` fallback

So the engine exists and works. `apps/advanced-examples-gallery` uses it and its
`[gameplay]` quality gates pass.

**The real defect is a reachability and layering failure, in three parts:**

### Part 1 — the public API exposes physics as *declaration only*, never as *simulation*

A developer can declare a body on a node:

```ts
primitives.box({ name: "crate" })
  .physics({ type: "dynamic", shape: "box", halfExtents: [.12,.12,.12], mass: 1, restitution: .18 })
```

That is the whole public physics surface. There is **no runtime handle**. In
`packages/engine/src/agent-api/index.ts`, across ~47k lines:
- `applyForce` — **0 occurrences**
- `onCollision` — **0 occurrences**
- `rigidBody` as a public runtime type — **0 occurrences**
- `applyImpulse` — **1 occurrence**, buried inside the canned `miniGolf` helper at
  line 5363, unreachable to any other route

So a developer can *place* a physics object and watch it fall. They cannot push it,
cannot know when it hits something, and cannot read its velocity. **Declaring a
simulation you cannot interact with is not a physics API.**

### Part 2 — genre kits are parallel implementations, not consumers of the engine

There are exactly four: `racing`, `platformer`, `falling-blocks`, `locomotion`. Each
is a self-contained implementation. `VehicleChassis` does not use `PhysicsWorld`; it
takes a `VehicleSurface` callback and integrates its own kinematics.
`PlatformerMotion` solves closed-form trajectories.

Two consequences:
- Anything outside those four genres has no path. Physics puzzle, tower defense,
  top-down shooter, stacking game, ragdoll, boat, spaceship: nothing.
- Fixing the racing kit helps nobody building anything else, because the fix lands
  in a sibling, not a shared foundation. **This is the structural reason we keep
  going in circles.**

### Part 3 — the two visible game defects are both "approximation baked at authoring time"

- **Car sinks through the road.** `VehicleChassis.ts:404` computes
  `contactPlaneY = min(wheel.position[1] - wheelRadius)` from a
  `VehicleSurface.sample(x, z)` callback. The chassis is correctly designed. But
  `apps/showcase-turbo-drift-circuit/src/main.ts:363` implements that callback as
  `height: TRACK_SURFACE_Y - VERGE_DROP * shoulderFraction` — **a flat plane plus an
  analytic ramp**. On a banked or crowned corner the height is wrong, the suspension
  solves against a lie, and the tyres pass through the visible mesh. The 30-line
  comment block defending `CAR_GROUND_Y` is itself the tell.
- **Jump barely lifts.** `PlatformerMotion.ts:175` sets
  `apex = max(minApex, geometry.maxRise * apexHeadroom)`. `maxRise` is the largest
  step-up between *consecutive* platforms. Skyline's platforms are near-level, so
  `maxRise` collapses and the apex falls to `minApex`. The solver optimises for
  "can technically reach the next platform," not "feels like a jump."

### The honest scorecard this must move

| Capability | Now | Consumers |
|---|---|---|
| rigid bodies | parity | 1 (gallery only) |
| colliders | parity | 2 |
| raycasting | **unproven** | **0** |
| character controller | **unproven** | **0** |
| joints / constraints | **unproven** | **0** |
| continuous collision detection | **unproven** | **0** |
| physics debug rendering | **unproven** | **0** |
| vehicle dynamics | claims **exceed** | 1 — *while the car sinks* |
| platformer motion tuning | claims **exceed** | cites a route **deleted in 1.5.2** |

---

## 1. Four rules that make this not-a-patch-job, enforceable by grep

1. **No route-local physics numbers.** Any constant under `apps/**` that encodes a
   surface height, gravity, jump velocity or contact plane is a defect.
   Enforced: `grep -rE "TRACK_SURFACE_Y|CAR_GROUND_Y|CAR_TYRE_CONTACT_Y|VERGE_DROP|jumpVelocity:|gravity:" apps/` → empty.
2. **Kits must consume the general layer.** No kit may integrate its own bodies or
   contacts. Enforced by an architecture test asserting every kit imports the shared
   physics runtime.
3. **Gates are written first and observed failing on the 1.5.2 build**, then the fix
   makes them pass. Every defect the user reported was invisible to a green pipeline.
4. **A defect is closed only when a unit test fails without the fix.** Screenshots
   corroborate; they never prove.

---

## 2. Workstreams

### WS-0 — Truth first: correct the false claims before building on them

Do this first so no later work inherits a lie.

| # | File | Task | Done when |
|---|---|---|---|
| 0.1 | `tools/product-remediation/build-threejs-parity.mjs` | Downgrade `vehicle dynamics` and `vehicle AI driving` from `exceed` to `parity-unproven`. A car that sinks through the road does not exceed Three.js. | Regenerated report shows the downgrade with a recorded reason |
| 0.2 | same | `platformer motion tuning` cites `showcase-platformer-game-layer-proof`, **deleted in 1.5.2**. Remove the dead consumer; re-derive status from live routes only. | No parity row cites a nonexistent route; add a test asserting this |
| 0.3 | `tests/unit/tools/parity-consumers.test.ts` **(new)** | Every consumer named in the parity report must resolve to a live route or package. | Test fails if a future deletion orphans a claim |
| 0.4 | ~~`tests/reports/clean-room-projects/racing-prototype.json`~~ | **RETRACTED 2026-08-04 — this task was based on a misreading.** I claimed the clean-room racing prototype ended with `speed: 0` / `x: 0` and called it the same defect as the live site. It is not. `tests/browser/clean-room-projects.spec.ts:61` presses keys in the order `["KeyW","KeyA","KeyD","KeyR"]`, and `KeyR` is **reset** — so the final snapshot is the correct post-reset state. `key:KeyW` records `changed: true`, which proves throttle did produce speed during the hold. The clean-room evidence was sound; my reading of it was not. The live-site `SPEED 0 / STATUS running` defect is still real and is tracked solely by WS-5.3. | n/a — retracted, no work required |

- [x] 0.1 Vehicle rows downgraded (physics exceed 2 -> 0; unproven 5 -> 7)
- [x] 0.2 Platformer row downgraded; report regenerates consumers from a live inventory so no dead route is cited
- [x] 0.3 `tests/unit/tools/parity-consumers.test.ts` — 3/3 pass; 94 consumers all resolve
- [x] 0.4 RETRACTED — premise was a misreading; clean-room evidence is sound (see table)

---

### WS-1 — A real public physics runtime (the spine; everything depends on it)

This is the workstream that turns four canned genres into a general engine. It does
**not** write a physics engine — `PhysicsWorld` + `cannon-es` already is one. It makes
that engine *reachable and safe*.

| # | File | Task | Done when |
|---|---|---|---|
| 1.1 | `packages/engine/src/agent-api/PhysicsRuntime.ts` **(new)** | `AuraBodyHandle`, returned by `app.bodies.get(id)` / `.require(id)`, mirroring the existing `app.nodes` pattern. Methods: `applyForce`, `applyImpulse`, `applyTorque`, `setVelocity`, `getVelocity`, `setPosition`, `teleport`, `wake`, `sleep`, `setEnabled`. | Unit tests per method against a stepped world |
| 1.2 | same | Collision events on the public surface: `app.onCollision(handler)`, `app.onCollisionWith(nodeName, handler)`, `app.onTriggerEnter/Exit`. Payload carries both nodes, contact point, normal, impulse magnitude, relative velocity. | Unit test: two dynamic bodies collide and the handler receives correct contact data |
| 1.3 | same | Queries: `app.physics.raycast(origin, dir, opts)`, `raycastAll`, `sphereCast`, `overlapSphere`, `overlapBox`. Wraps `PhysicsWorld.raycast`, which exists but has **zero consumers**. | Raycasting consumer count > 0; unit tests for hit/miss/filter-by-layer |
| 1.4 | same | Collision layers and masks so a developer can express "bullets hit enemies but not each other." | Unit test: masked pairs generate no contacts |
| 1.5 | `packages/physics/src/PhysicsWorld.ts` | Extend `.physics({...})` declaration to cover what the engine already supports: `capsule`, `cylinder`, `sphere`, `convexHull`, `trimesh`, `heightfield`; plus `linearDamping`, `angularDamping`, `sensor`, `layer`, `lockRotation`, `centerOfMass`. Audit which the backend truly supports; do not expose what it cannot do. | A capability table per shape, test-backed; unsupported shapes throw an actionable error |
| 1.6 | `packages/engine/src/agent-api/PhysicsRuntime.ts` | Joints as a real public feature: hinge, slider, fixed, ball-socket, spring, motorised hinge. `joints / constraints` is unproven with 0 consumers. | Unit tests: stability under load, motor drives a hinge, spring returns to rest |
| 1.7 | `packages/physics/src/PhysicsDebugDraw.ts` | Make debug draw consumable: colliders, contacts, normals, joints, sleeping state, raycasts. Currently unproven, 0 consumers. | A route renders it; browser test screenshots visible overlays |
| 1.8 | `packages/engine/src/agent-api/index.ts` | Export the whole runtime from the **public** API. Nothing above may require a deep import. | `tests/unit/public-api-contracts.test.ts` asserts every new export; ESLint deep-import ban still passes |
| 1.9 | `docs/api/public-api.md`, `docs/concepts/physics.md` **(new)** | Document the runtime with runnable snippets: push a crate, detect a pickup, raycast for line-of-sight, build a hinged door. | `pnpm check:docs-codeblocks` passes on every snippet |

- [x] 1.1 `AuraBodyHandle` with forces, impulses, torque, velocity — `createPhysicsRuntime` implemented and attached as `app.physics`; `public-physics-runtime.test.ts` 13/13 via `@aura3d/engine` only. Earlier commit declared the interface with **no implementation** (`grep -rn AuraPhysicsRuntime` matched only its own file); that is now a real value.
- [x] 1.2 Collision + trigger events with full contact payload — `onCollision`/`onCollisionWith`/`onTriggerEnter`/`onTriggerExit` dispatch from `physics.step()`; tests assert contact normal, `relativeSpeed`, and that a sensor fires enter exactly once (not per frame).
- [x] 1.3 Raycast / spherecast / overlap queries; raycasting consumers > 0 — `app.physics.queries.*` with layer filtering and an ignore list. Consumers now > 0: `tests/clean-room/physics-sandbox` raycasts to pick a crate, asserted in the browser suite.
- [x] 1.4 Collision layers and masks — `createCollisionLayers` + `createAuraApp({ physics: { layers } })`. Proven behaviourally, not just structurally: the clean-room shooter asserts `bulletOnBulletContacts === 0` on a pre-reset snapshot while bullets are in flight, and a control case confirms cross-layer pairs *do* collide.
- [x] 1.5 Full shape and body-property coverage, audited against the backend — audit found the declared list advertised `cylinder`, which `Shape.ts` does not provide; it would have thrown for any caller. Removed rather than faked with a box, `trimesh` renamed to `mesh` to match the factory, capability table documented, and unsupported shapes throw an actionable error.
- [x] 1.6 Six joint types with stability tests — `fixed`, `hinge`, `slider`, `ball-socket`, `spring`, `motorised-hinge`, each tested on **both** backends (`public-joints.test.ts` 19/19). Uncovered and fixed two engine defects: joints never solved on the default cannon-es backend (a `fixed` joint free-fell to y = -18.78), and `slider` left rotation unconstrained so spin leaked into 0.478 of off-axis translation.
- [x] 1.7 Debug draw with a real consumer — `buildLines` drew colliders only; four of the six things WS-1.7 asks for did not exist. Added contacts (tinted by penetration), normals, joint segments, dimmed sleeping bodies and caller-supplied raycasts, each categorised. Exposed as `app.physics.debugLines()`. Consumed by `tests/clean-room/physics-sandbox`, measured in a live browser run: **72 collider, 10 contact, 5 normal, 1 raycast** lines; the gate asserts contacts and normals specifically, since a bare line count would pass on the old collider-only draw.
- [x] 1.8 Everything reachable from the public API, no deep imports — every new physics test imports `@aura3d/engine` only. The three new clean-room projects report `packagesImported: ["@aura3d/engine"]` with zero private imports, measured by the harness rather than asserted.
- [x] 1.9 Physics concepts doc with runnable snippets — `docs/concepts/physics.md` rewritten (was a stale file listing pinned at "Version: 1.4.5" with no code in it). Six snippets: push a crate, detect a pickup, raycast for line of sight, bullets that miss each other, a motorised hinged door, ground to a mesh. `check:docs-codeblocks` now **compiles** them against the real public API rather than only checking import specifiers; proven load-bearing by renaming `applyImpulse` to a nonexistent method and observing the gate fail.

---

### WS-2 — Mesh surface queries (kills the "baked plane" defect class at its root)

| # | File | Task | Done when |
|---|---|---|---|
| 2.1 | `packages/physics/src/MeshBVH.ts` **(new)** | Deterministic BVH over indexed triangle geometry. | 10k-tri mesh, 1k random rays match brute force exactly |
| 2.2 | `packages/physics/src/Raycast.ts` | `raycastMesh` returning point, triangle index, barycentric coords, interpolated normal, distance. | Tests: front/back face, glancing, parallel miss, origin inside, degenerate triangle |
| 2.3 | `packages/physics/src/SurfaceQuery.ts` **(new)** | `createMeshSurfaceQuery(geometry, worldMatrix)` → `sampleHeight/sampleNormal/sampleGrip`, per-frame cached by integer cell. | A crowned/banked track returns different heights across its width and a real normal, not `[0,1,0]` |
| 2.4 | `packages/engine/src/agent-api/index.ts` | Expose surface queries publicly, so grounding anything to a mesh is a one-liner for any genre. | Public-API test; used by WS-3 and WS-4 |

- [x] 2.1 BVH matches brute force — `mesh-surface-query.test.ts`: 1,000 random rays over a 10k-triangle mesh match brute force exactly.
- [x] 2.2 `raycastMesh` handles all five edge cases — front/back face, glancing, parallel miss, origin inside, degenerate triangle, all covered in `mesh-surface-query.test.ts`.
- [x] 2.3 Mesh surface query returns real per-point height and normal — proven on the **real** circuit, not a synthetic grid: the committed contract's road mesh carries 529 distinct elevations against the centreline's 13, and four wheels across the road width receive independent heights.
- [x] 2.4 Publicly reachable — `createMeshSurfaceQuery`, `buildMeshBVH` and `raycastMesh` re-exported from `@aura3d/engine`, consumed by `GameRacingSceneBinding.vehicleSurface()`.

---

### WS-3 — Refactor the four kits onto the general layer (stops the sibling-fix problem)

This is the structural change. Without it, every future genre repeats this PRD.

| # | File | Task | Done when |
|---|---|---|---|
| 3.1 | `packages/engine/src/agent-api/VehicleChassis.ts` | Add `createMeshVehicleSurface(trackGeometry, worldMatrix, { gripByMaterial })` on WS-2.3. Per-wheel independent sampling. | Four wheels over a banked corner get four different heights |
| 3.2 | same | Chassis attitude follows the sampled surface **normal**, not only load transfer. | On a 10° bank, body roll matches the normal within 0.5° |
| 3.3 | `packages/physics/src/VehicleDynamics.ts` | Replace the kinematic 2D point with a force-based tyre model: slip ratio, slip angle, load-sensitive friction, combined-slip circle. Driven through `PhysicsWorld`, not a private integrator. | Tests: understeer at high slip angle, wheelspin under excess torque, weight transfer under braking |
| 3.4 | same | Continuous collision so a tyre cannot tunnel between frames. Proves `continuous collision detection`. | At 200 km/h with a 16 ms step, no wheel penetrates |
| 3.5 | `packages/physics/src/CharacterController.ts` | Make real against mesh: capsule sweep, step up/down, slope limit, ceiling, wall slide. Proves `character controller` (0 consumers today). | A test per behaviour, all against mesh geometry |
| 3.6 | `packages/engine/src/agent-api/PlatformerMotion.ts` | **Change the objective function.** Apex comes from declared intent (`jumpHeight` in world units, or a feel preset), then is *validated* against geometry. Never silently shrink the jump; fail loudly with the unclearable gap named. | A level with `maxRise = 0.05` still yields a usable apex; an unclearable level throws with an actionable message |
| 3.7 | same | Add the mechanics that make a jump feel right: asymmetric gravity (fast fall), coyote time, jump buffering, variable height on release, apex hang. | Tests: rise/fall ratio, short-hop vs full-hop apex differ, coyote window honoured |
| 3.8 | `packages/engine/src/agent-api/GameGenreKits.ts` | All four kits consume `PhysicsRuntime` + `SurfaceQuery`. No kit integrates its own bodies or contacts. | Architecture test: each kit imports the shared runtime; none defines a private integrator |
| 3.9 | `packages/engine/src/agent-api/GameGenreKits.ts` | Kits become *compositions* over the general layer, so a fifth genre needs no new kit. Document the composition path. | A new genre (see WS-6.3) is built with **no** new kit code |

- [ ] 3.1 Mesh-backed vehicle surface, per-wheel
- [ ] 3.2 Attitude from surface normal
- [ ] 3.3 Force-based tyre model on the shared engine
- [ ] 3.4 No tunnelling at 200 km/h
- [ ] 3.5 Character controller real against mesh
- [x] 3.6 Apex from intent, validated, loud on failure — apex comes from `jumpHeight` or a `feel` preset scaled by character height, then is validated against geometry; an unclearable level throws naming the offending step instead of silently shrinking. `platformer-jump-intent.test.ts` 13/13.
- [x] 3.7 Coyote/buffer/variable-height/asymmetric gravity — coyote and buffer windows scale with airtime rather than being fixed milliseconds, plus asymmetric fall gravity, apex hang and short-hop apex. Asserted on the real level in `skyline-real-level-motion.test.ts`.
- [ ] 3.8 All four kits on the shared runtime — **ATTEMPTED AND REVERTED 2026-08-04, finding recorded below**

  I wired `createGameRacingKit` onto `createVehicleMotion` (the WS-3.3 force model), replacing
  its kinematic `heading += steer * steerRate * dt`. The swap typechecked and the whole physics
  suite stayed green, but it regressed 5 route tests: the car could not complete a lap of its
  own certified circuit (`turbo-sixty-second-race` 1 checkpoint of 20 needed, 2,776 of 3,600
  frames off-track). I reverted it rather than ship a kit that cannot drive its own route, and
  rather than weaken those gates.

  **What the attempt established, which is the useful part:**

  1. **A real engine defect, now fixed and committed separately.** `createVehicleMotion` never
     passed `maxLoad` to `samplePacejkaTireForces`, which defaults to 5000 N. Every vehicle
     lighter than a road car ran on the load-factor floor and lost ~10x its grip — measured 1.1 g
     where 3.5 g was requested. Fixed in `ae71897a`, with a load-bearing regression test.
  2. **The blocker is not the model, it is a unit-frame mismatch.** A certified route is
     normalised: this circuit's road is 0.439 units wide, its tightest corner 0.48 units. The
     force model is dimensional. Converting between them requires *choosing* a scale, and every
     choice I derived broke something else in sequence — a road car's 62 m/s made the tightest
     corner need 56.8 g; solving for 3 g gave a 0.19 m wheelbase under a 0.46 m centre of mass,
     producing 86 rad/s of yaw; fixing that left drag balancing at 9.5 m/s against a declared 3.3.
     Running the model directly in game units removes the scale but still leaves the route's
     declared 4x arcade pace demanding ~4 g through a fixed radius.
  3. **The honest conclusion.** The racing kit's tuning (`maxSpeed`, `acceleration`, `steerRate`,
     and the routes certified against them) encodes a *kinematic* contract. Moving to a force
     model is not a drop-in substitution; it changes what those numbers mean, so the routes and
     their certified lap times have to be re-derived with it. That is real work with a real
     scope, not a wiring change, and claiming 3.8 without it would be exactly the kind of
     unproven claim WS-0 existed to correct.

  Remaining scope for 3.8: re-derive the racing route's speed/steer contract against the force
  model, then re-certify `turbo-drift-circuit`'s lap time. The kit-swap diff is recorded in this
  session's history and the defect it uncovered is already fixed and shipped.
- [ ] 3.9 Kits are compositions, path documented

---

### WS-4 — Delete the route-local lies

| # | File | Task | Done when |
|---|---|---|---|
| 4.1 | `apps/showcase-turbo-drift-circuit/src/main.ts` | **Delete** `TRACK_SURFACE_Y`, `CAR_GROUND_Y`, `CAR_TYRE_CONTACT_Y`, `VERGE_DROP`, `SHOULDER_WIDTH` and the analytic `circuitSurface.sample`. Use `createMeshVehicleSurface`. Net constants removed. | Rule-1 grep returns empty for this file |
| 4.2 | `apps/showcase-skyline-runner/src/main.ts` | Route declares `jumpHeight` / `feel` only. It must not compute gravity, velocity or apex. | `grep -cE "gravity:|jumpVelocity:"` → 0 |
| 4.3 | `tests/unit/physics/vehicle-mesh-contact.test.ts` **(new)** | Scripted lap over the **real** circuit mesh: max penetration < 1 mm every step, four wheels grounded on tarmac. | Fails if 4.1 is reverted |
| 4.4 | `tests/unit/physics/character-mesh-contact.test.ts` **(new)** | Scripted run over the real level mesh: no penetration, no missed landings, apex ≥ declared height. | Fails if 4.2 is reverted |

- [x] 4.1 Turbo drift surface constants deleted — `TRACK_SURFACE_Y`, `CAR_GROUND_Y`, `CAR_TYRE_CONTACT_Y`, `VERGE_DROP`, `SHOULDER_WIDTH` and the analytic `circuitSurface.sample` are gone; all five counts are 0 in code. The route now calls `racingScene.vehicleSurface()` and throws at startup if the contract carries no drivable triangles rather than silently flattening.
- [x] 4.2 Skyline motion constants deleted — apex now comes from declared intent (`feel: "responsive"` scaled by character height): **0.684 -> 1.04**, exactly 2x character height. The stale `previousTuning: { gravity: -22, jumpVelocity: 7.4 }` literal is gone. `grep -cE "gravity:|jumpVelocity:"` reports 3, and all three are *reads* of solver output for evidence publication, not route-chosen values; `skyline-real-level-motion.test.ts` enforces that distinction by parsing assignments rather than counting occurrences.
- [x] 4.3 Vehicle mesh-contact test load-bearing — `turbo-drift-real-circuit-contact.test.ts` (9 tests) reads the **committed** contract the shipped route imports. Reverting the mesh surface to the old flat plane fails exactly 3 of the 9 (per-wheel heights, real normals, surface grip); restoring passes them.
- [x] 4.4 Character mesh-contact test load-bearing — `skyline-real-level-motion.test.ts` (8 tests) against the committed level. It re-derives the previous apex from the solver rather than remembering a number, and asserts all six motion invariants. Uncovered a real coupling defect: move speed was derived from jump airtime, so **raising the jump made the character slower** (1.15 -> 0.703, 60s traversal 5.27 of 16.6 units). Now independent: apex 1.04, speed 1.30, traversal 15.15, checkpoints 2 -> 6.

---

### WS-5 — Rendering and telemetry defects visible in the screenshots

| # | File | Task | Done when |
|---|---|---|---|
| 5.1 | `packages/rendering/src/PBRMaterial.ts`, `Renderer.ts` | Diagnose the translucent DUNLOP arch. Likely glTF alpha-mode misread (`OPAQUE` treated as `BLEND`) or unsorted transparency. Classify before fixing. | Unit test on the alpha-mode path; the arch renders opaque |
| 5.2 | `packages/rendering/src/Renderer.ts` | Correct transparent sort order and depth-write policy. | Overlapping transparent quads composite correctly |
| 5.3 | `apps/showcase-turbo-drift-circuit/src/main.ts`, telemetry source | Fix `SPEED 0` while `STATUS running` on the **live site**. (Not a clean-room defect — see the WS-0.4 retraction.) Reproduce first: determine whether the HUD reads a different state object than the simulation, or whether the car is genuinely stationary while status says running. Classify before fixing. | After N stepped frames at throttle, HUD speed > 0 and matches simulation state |

- [ ] 5.1 Arch opacity root-caused — **INVESTIGATED 2026-08-04, no engine defect found; needs an asset check before any code change.** Traced the whole alpha path: `adaptGLTFMaterial` (`GLTFMaterialAdapter.ts:5`) reads `material.alphaMode ?? "OPAQUE"` correctly and does not coerce `OPAQUE` to `BLEND`. `validateRenderState` (`Material.ts:166`) *throws* if a blended material leaves `depthWrite` on, so the misconfiguration WS-5.1 hypothesised cannot exist silently. The only place blend is forced on is `ArchitecturalMaterialCatalog.ts:97`, which is `category === "glass"` and not on this path. **Classification: asset, most likely** — the arch is part of the Tsukuba track GLB, so if its material declares `alphaMode: "BLEND"` the renderer is honouring the asset faithfully. Remaining work is to read the GLB's material block and, if it is `BLEND` with alpha 1, decide whether the engine should treat that as opaque. Left unticked rather than closed, because I did not verify the asset itself.
- [ ] 5.2 Transparency sorting correct — **INVESTIGATED 2026-08-04, existing behaviour verified correct; no change made.** `sortExternalParityAlphaItems` groups opaque -> mask -> blend, sorts opaque and mask front-to-back (correct for early-Z) and blend back-to-front (correct for compositing). I suspected the `a.alphaMode === "blend" || b.alphaMode === "blend"` condition was wrong for mixed pairs, and measured it: mixed pairs return earlier on the group comparison, so the condition is only reached within a single group and the behaviour is right. Depth-write policy is enforced by a hard throw in `validateRenderState`. Left unticked because "correct" here means "I found no defect", which is weaker than the passing overlapping-quad test the row asks for.
- [ ] 5.3 Live-site speed telemetry matches simulation — **INVESTIGATED 2026-08-04; HUD/simulation coherence verified, so the reported symptom is not a telemetry bug.** `updateRacingHud` reads `raceSnapshot.speed`, and `raceSnapshot` is the exact value returned by `racingState.step(...)` on the same frame — one object, no second state to disagree with. So `SPEED 0` while `STATUS running` means the car genuinely was not moving, which is the correct reading of an idle car: `status` is `"running"` from the first frame because the race has started, and speed is 0 until throttle is held. **Classification: application-authoring / presentation**, not engine. The honest fix is a `Ready`-versus-`Racing` distinction so an untouched car does not read as a broken one, plus the WS-7.3 gate to hold it. Left unticked because that change is not made.

---

### WS-6 — Prove generality: the test that this is an engine, not four demos

The whole point. If this workstream cannot be completed, the layering is still wrong.

| # | File | Task | Done when |
|---|---|---|---|
| 6.1 | `tests/clean-room/physics-sandbox/` **(new)** | Clean-room project: stack crates, push them with an impulse, detect collisions, raycast to pick. Public API only, under 200 authored lines, zero private imports. | Passes the existing clean-room gate |
| 6.2 | `tests/clean-room/top-down-shooter/` **(new)** | A genre with **no kit**: projectiles, collision layers so bullets miss each other, trigger pickups, enemy hit events. Under 300 lines. | Builds with no new kit code — proves 3.9 |
| 6.3 | `tests/clean-room/physics-puzzle/` **(new)** | Hinged door, sliding block, spring platform — joints only, no kit. Under 300 lines. | Proves joints are usable, not just present |
| 6.4 | `tests/browser/clean-room-projects.spec.ts` | Add all three to the clean-room suite with the same budgets and zero-private-import rule. | 7/7 clean-room projects pass |

- [x] 6.1 Physics sandbox under 200 lines — 97/200 authored lines, `@aura3d/engine` only, zero private imports. Asserts contacts generated, impulses applied, raycast pick hits and names a crate, and an overlap query finds the stack.
- [x] 6.2 Top-down shooter with no kit code — 176/300 lines. **No kit exists for this genre and none was added**; `usedKit: false` is asserted. This is the generality proof the PRD was written to obtain.
- [x] 6.3 Physics puzzle using joints — 105/300 lines. Motorised hinge, slider and spring, each asserted to have visibly done its job. None of it was buildable before the cannon-es constraint-solve fix, when joints were inert.
- [x] 6.4 All seven clean-room projects in the suite — `pnpm exec playwright test tests/browser/clean-room-projects.spec.ts` → **7 passed**. The `manual-physics-integration` forbidden pattern bans `new PhysicsWorld`, so the three new projects cannot pass by hand-wiring physics.

---

### WS-7 — Gates that would have caught every one of these

| # | File | Task | Done when |
|---|---|---|---|
| 7.1 | `tools/showcase-library/game-visual-qa.mjs` | Penetration gate: no rendered geometry may intersect a surface it should rest on, measured from the frame. | **Observed failing on 1.5.2** |
| 7.2 | same | Motion-feel gate: apex, rise/fall ratio, airtime within declared bounds. | **Observed failing on current Skyline** |
| 7.3 | same | Telemetry-coherence gate: displayed values match simulation state. | **Observed failing on current turbo drift** |
| 7.4 | same | Opaque-asset gate: an asset declared opaque may not render with alpha < 1. | **Observed failing on the current arch** |
| 7.5 | `tests/browser/showcase-gameplay-proof.spec.ts` | Operate each game through a full scripted objective and assert observable state change, not first-frame screenshots. | Both games complete an objective under automation |
| 7.6 | `package.json` | `pnpm check:game-runtime` runs 7.1–7.5; wire into `check:release`. | Present in `check:release` and passing |

- [ ] 7.1 Penetration gate fails on 1.5.2
- [ ] 7.2 Motion-feel gate fails on current Skyline
- [ ] 7.3 Telemetry gate fails on current turbo drift
- [ ] 7.4 Opaque-asset gate fails on current arch
- [ ] 7.5 Scripted objective completion for both games
- [ ] 7.6 `check:game-runtime` in `check:release`

---

## 3. Sequencing

```
WS-0 (truth)  ──> WS-1 (public physics runtime)  ──┬──> WS-3 (kits refactored) ──> WS-4 (delete lies)
                  WS-2 (mesh surface queries) ─────┘                                      │
WS-5 (rendering/telemetry) — independent, any time                                        │
WS-7 (gates) — write each BEFORE its fix, observe failing on 1.5.2                        │
WS-6 (generality proof) — last, and it is the real acceptance test ────────────────────────┘
```

WS-1 before WS-3 is non-negotiable: refactoring kits onto a runtime that is not yet
public just moves the problem.

## 4. Definition of done

- [ ] Every checkbox above checked
- [ ] `grep -rE "TRACK_SURFACE_Y|CAR_GROUND_Y|CAR_TYRE_CONTACT_Y|VERGE_DROP|jumpVelocity:|gravity:" apps/` → empty
- [ ] Physics capability rows: **zero** `parity-unproven` with zero consumers
- [ ] No parity row claims `exceed` without a passing gate and a live consumer
- [ ] `pnpm check:game-runtime` passes, and every gate in it was observed failing on 1.5.2 first
- [ ] **7 clean-room projects pass**, including three genres with no kit support —
      this is the proof that a developer can build a game that is not one of our four demos
- [ ] A developer can, using only `@aura3d/engine`: create a dynamic body, push it,
      hear about collisions, raycast the world, join two bodies, and ground anything
      to a mesh — each in a handful of lines, documented with a runnable snippet
- [ ] Turbo Drift and Skyline promoted out of `prototype-blocked` **only** after all
      of the above, with independent human visual review

## 5. What this deliberately does not do

- Does **not** write a new physics engine. `PhysicsWorld` + `cannon-es@0.20.0` is a
  real, mature engine. Replacing it would discard working code and restart the cycle.
  The work is reachability, layering and contact correctness.
- Does **not** claim Three.js parity on any capability without a passing gate and a
  named live consumer.
- Does **not** adjust a screenshot, poster, threshold or gate tolerance to make
  anything pass.
- Does **not** add a route-local constant to correct a symptom.
- Does **not** promote route status as part of any task.

## 6. Honest expectation setting

After WS-1 and WS-2, a developer can build **arbitrary physics games** on the public
API — that is the change from "four demos" to "an engine."

After WS-3 and WS-4, the racing and platformer games are correct at the mechanism
level, and any future genre inherits that correctness instead of re-deriving it.

What this still will **not** deliver, and should not be claimed: authored content
quality. A correct engine does not make a good-looking track or a well-designed
level. Those are asset and level-design problems, and they are the honest reason the
current games look rough beyond the physics defects. Rendering visual parity against
Three.js also remains a separate, still-unproven claim — the strict product-render
gate fails at 0.331 against a 0.15 threshold and is untouched by this PRD.
