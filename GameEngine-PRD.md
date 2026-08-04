# Aura3D Game Engine PRD — make the runtime real, not the screenshots

**Status:** proposed, not started
**Owner:** engine
**Scope:** `packages/physics`, `packages/engine/src/agent-api`, `packages/rendering`
**Explicitly out of scope:** editing any file under `apps/` to make a symptom disappear

---

## 0. Read this before writing code

This PRD exists because Aura3D 1.5.2 shipped with cameras, sizing and repaired
test harnesses while the two game routes still visibly fail: the car's tyres sink
into the road on turns, the DUNLOP arch renders translucent, speed reads `0` while
status reads `running`, and the Skyline character barely leaves the ground.

The previous three releases each fixed a *symptom* and each left the *mechanism*
intact. This document targets mechanisms. Four rules make that enforceable:

1. **No route-local numbers.** If a fix adds or edits a constant inside
   `apps/**`, it is the wrong fix. Every value a game needs must be derived by a
   library function from geometry, asset bounds, or declared intent.
2. **No new "certified" language until the gate that would catch the defect
   exists and passes.** The current failures were all invisible to green gates.
3. **A defect is closed when a unit test fails without the fix.** Screenshots are
   corroboration, never proof.
4. **`prototype-blocked` stays until the runtime is right.** No status promotion
   is part of any task here.

### The single root cause behind both games

Both failures are the same bug wearing different clothes: **the runtime never
queries real geometry at runtime.** It queries an *approximation baked once at
authoring time.*

- **Vehicle:** `packages/engine/src/agent-api/VehicleChassis.ts:404` computes
  `contactPlaneY = min(wheel.position[1] - wheelRadius)` from a
  `VehicleSurface.sample(x, z)` callback. The chassis design is correct and takes a
  real surface query. But `apps/showcase-turbo-drift-circuit/src/main.ts:363`
  implements that callback as
  `height: TRACK_SURFACE_Y - VERGE_DROP * shoulderFraction` — a **flat plane minus
  an analytic shoulder ramp**. `TRACK_SURFACE_Y` is one frozen scalar. So on a
  banked or crowned corner the returned height is wrong, the suspension solves
  against a lie, and the tyres pass through the visible mesh. The 30-line comment
  block above `CAR_GROUND_Y` explaining why the plane is finally correct is itself
  the tell: a correct system needs no essay defending a constant.
- **Platformer:** `packages/engine/src/agent-api/PlatformerMotion.ts:175` sets
  `apex = max(minApex, geometry.maxRise * apexHeadroom)`. `maxRise` is the largest
  *step-up between consecutive platforms*. Skyline's platforms are nearly
  level, so `maxRise` is tiny, so the apex collapses to `minApex`, so the character
  barely hops. The solver is optimising for "can technically reach the next
  platform" instead of "feels like a jump." It also has no notion of jumping *onto*
  or *over* anything that is not the immediate next platform.

Fix the mechanism in both cases: **replace analytic surface approximations with
real mesh raycasts**, and **replace step-derived motion with intent-derived
motion validated against geometry.**

---

## 1. Workstreams

### WS-1 — Real mesh raycasting (foundation; everything else depends on it)

`raycasting` is `parity-unproven` with **zero production consumers**.
`packages/physics/src/Raycast.ts` exists but nothing ships against it. Until a
game can ask "what is the surface under this point, on this mesh, right now," every
grounding system is guessing.

| # | File | Task | Done when |
|---|---|---|---|
| 1.1 | `packages/physics/src/Raycast.ts` | Audit existing API. Record what it supports (shapes? triangle meshes? BVH?) and what it does not. Do not assume it works. | A written capability table in the PR body, with a test per claim |
| 1.2 | `packages/physics/src/MeshBVH.ts` **(new)** | Build a BVH over indexed triangle geometry. Deterministic construction; no reliance on iteration order. | Unit test: 10k-triangle mesh, 1k random rays, results match brute force exactly |
| 1.3 | `packages/physics/src/Raycast.ts` | Add `raycastMesh(origin, direction, mesh, options)` returning hit point, triangle index, barycentric coords, interpolated normal, and distance. | Unit tests: front/back face, glancing angle, parallel miss, ray origin inside geometry, degenerate triangle |
| 1.4 | `packages/physics/src/SurfaceQuery.ts` **(new)** | `createMeshSurfaceQuery(geometry, worldMatrix)` → `{ sampleHeight(x, z), sampleNormal(x, z), sampleGrip(x, z) }`. Downward ray per sample, cached per frame by integer cell. | Unit test: a crowned/banked track mesh returns different heights across its width, and a real normal, not `[0,1,0]` |
| 1.5 | `packages/physics/src/index.ts`, `packages/engine/src/agent-api/index.ts` | Export the surface-query surface from the **public** API. | `tests/unit/public-api-contracts.test.ts` asserts the exports; consumer count for `raycasting` rises above 0 |
| 1.6 | `packages/physics/src/PhysicsDebugDraw.ts` | Make debug rendering actually consumable: visualise rays, hits, normals, BVH nodes, contact points. Currently `parity-unproven`, 0 consumers. | A route renders it; a browser test screenshots visible ray/contact overlays |

**Checklist**
- [ ] 1.1 Raycast.ts capability table written and test-backed
- [ ] 1.2 MeshBVH matches brute force on 1k rays
- [ ] 1.3 raycastMesh handles all six edge cases
- [ ] 1.4 createMeshSurfaceQuery returns per-point height **and** normal from real geometry
- [ ] 1.5 Exported from the public API; raycasting consumer count > 0
- [ ] 1.6 PhysicsDebugDraw has a real consumer and a visual test

---

### WS-2 — Vehicle contact against the real track mesh

The chassis is sound. Its *input* is fake. This workstream deletes the fake input.

| # | File | Task | Done when |
|---|---|---|---|
| 2.1 | `packages/engine/src/agent-api/VehicleChassis.ts` | Add `createMeshVehicleSurface(trackGeometry, worldMatrix, { gripByMaterial })` built on WS-1.4. Per-wheel independent sampling. | Unit test: four wheels over a banked corner get four different heights |
| 2.2 | `packages/engine/src/agent-api/VehicleChassis.ts` | Use the sampled **normal** to orient the chassis. Pitch/roll must follow the surface, not only load transfer. | Unit test: on a 10° bank the body roll matches the surface normal within 0.5° |
| 2.3 | `packages/physics/src/VehicleDynamics.ts` | Replace the kinematic 2D point with force-based longitudinal/lateral tyre model (slip ratio, slip angle, load-sensitive friction, combined-slip circle). | Unit tests: understeer at high slip angle, wheelspin under excess torque, weight transfer under braking |
| 2.4 | `packages/physics/src/VehicleDynamics.ts` | Continuous collision for wheels so a tyre cannot tunnel through the mesh between frames at speed. Depends on `continuous collision detection` (currently unproven). | Unit test: at 200 km/h with a 16 ms step, no wheel penetrates the surface |
| 2.5 | `apps/showcase-turbo-drift-circuit/src/main.ts` | **Delete** `TRACK_SURFACE_Y`, `CAR_GROUND_Y`, `CAR_TYRE_CONTACT_Y`, `VERGE_DROP`, `SHOULDER_WIDTH`, and the analytic `circuitSurface.sample`. Replace with `createMeshVehicleSurface(...)`. Net constants removed, not added. | `grep -c "TRACK_SURFACE_Y" apps/showcase-turbo-drift-circuit/src/main.ts` → 0 |
| 2.6 | `tests/unit/physics/vehicle-mesh-contact.test.ts` **(new)** | Drive a scripted lap over the **real** circuit mesh. Assert max penetration below 1 mm at every step and all four wheels grounded on tarmac. | Test fails if 2.5 is reverted |
| 2.7 | `tools/showcase-library/game-visual-qa.mjs` | Add a gate that measures tyre-vs-road penetration from the rendered frame, so a sinking wheel is caught by CI, not by the user. | Gate fails on the current 1.5.2 build and passes after the fix |

**Checklist**
- [ ] 2.1 Mesh-backed vehicle surface with per-wheel sampling
- [ ] 2.2 Chassis attitude follows the surface normal
- [ ] 2.3 Force-based tyre model replaces the kinematic point
- [ ] 2.4 No tunnelling at 200 km/h
- [ ] 2.5 All route-local surface constants deleted
- [ ] 2.6 Scripted-lap penetration test in place and load-bearing
- [ ] 2.7 Rendered-frame penetration gate fails on 1.5.2

---

### WS-3 — Character controller and a jump that feels like a jump

`character controller` is `parity-unproven` with **zero consumers**.
`packages/physics/src/CharacterController.ts` exists and no game uses it.

| # | File | Task | Done when |
|---|---|---|---|
| 3.1 | `packages/physics/src/CharacterController.ts` | Audit and make real: capsule vs mesh, swept movement, step-up/step-down, slope limit, ceiling handling, wall slide. | Unit tests per behaviour, all against mesh geometry |
| 3.2 | `packages/engine/src/agent-api/PlatformerMotion.ts` | **Change the objective function.** Apex must come from declared intent (`jumpHeight` in world units, or a named feel preset), then be *validated* against geometry — not derived from `maxRise`. Fail loudly when intent cannot clear the level, instead of silently shrinking the jump. | Unit test: a level with `maxRise = 0.05` still yields a usable apex; a level whose gaps are unclearable throws with an actionable message |
| 3.3 | `packages/engine/src/agent-api/PlatformerMotion.ts` | Add asymmetric gravity (fast fall), coyote time, jump buffering, variable jump height on button release, and apex hang. These are what "natural" means. | Unit tests: rise time vs fall time ratio, short-hop vs full-hop apex differ, coyote window honoured |
| 3.4 | `apps/showcase-skyline-runner/src/main.ts` | Route declares intent (`jumpHeight`, `feel: "responsive"`). It must not compute gravity, velocity or apex. | `grep -cE "gravity:|jumpVelocity:" apps/showcase-skyline-runner/src/main.ts` → 0 |
| 3.5 | `tests/unit/physics/character-mesh-contact.test.ts` **(new)** | Scripted run over the real level mesh: no penetration, no missed landings, apex ≥ declared height. | Fails if 3.4 is reverted |
| 3.6 | `packages/engine/src/agent-api/PlatformerMotion.ts` | Level-design feedback: report which gaps/rises are unclearable at the declared feel, so a bad level is a level bug with a name. | Report consumed by a route-health gate |

**Checklist**
- [ ] 3.1 CharacterController works against mesh, all six behaviours tested
- [ ] 3.2 Apex from intent, validated against geometry, loud on failure
- [ ] 3.3 Coyote time, jump buffer, variable height, asymmetric gravity
- [ ] 3.4 Route declares intent only; zero motion constants
- [ ] 3.5 Scripted-run mesh contact test in place
- [ ] 3.6 Unclearable geometry reported by name

---

### WS-4 — Rendering defects visible in the screenshots

| # | File | Task | Done when |
|---|---|---|---|
| 4.1 | `packages/rendering/src/PBRMaterial.ts`, `Renderer.ts` | Diagnose the translucent DUNLOP arch. Likely alpha-mode misread from glTF (`OPAQUE` treated as `BLEND`) or unsorted transparency. Classify before fixing. | Unit test on the glTF alpha-mode path; the arch renders opaque |
| 4.2 | `packages/rendering/src/Renderer.ts` | Correct transparent-geometry sort order and depth-write policy. | Test: overlapping transparent quads composite in the right order |
| 4.3 | `apps/showcase-turbo-drift-circuit/src/main.ts` + telemetry source | Fix `SPEED 0` while `STATUS running`. Telemetry must read from the same state the renderer draws. | Test: after N stepped frames at throttle, reported speed > 0 |
| 4.4 | `tools/showcase-library/game-visual-qa.mjs` | Gate: any asset declared opaque that renders with alpha < 1 is a failure. | Gate fails on the current arch |

**Checklist**
- [ ] 4.1 Arch opacity root-caused and classified
- [ ] 4.2 Transparency sorting correct
- [ ] 4.3 Speed telemetry matches simulation
- [ ] 4.4 Opaque-asset gate catches the regression

---

### WS-5 — Close the physics capability gaps honestly

Five capabilities are `parity-unproven` with zero consumers. Each needs a real
consumer or an honest downgrade — no third option.

| # | Capability | File | Done when |
|---|---|---|---|
| 5.1 | joints / constraints | `packages/physics/src/Constraint.ts`, `Constraints.ts` | A route uses a hinge/slider/fixed joint; solver stability test under load |
| 5.2 | continuous collision detection | `packages/physics/src/TimeOfImpact.ts` | Consumed by WS-2.4; fast-mover tunnelling test |
| 5.3 | physics debug rendering | `packages/physics/src/PhysicsDebugDraw.ts` | WS-1.6 |
| 5.4 | raycasting | `packages/physics/src/Raycast.ts` | WS-1 |
| 5.5 | character controller | `packages/physics/src/CharacterController.ts` | WS-3 |

**Checklist**
- [ ] 5.1 Joints proven by a consumer
- [ ] 5.2 CCD proven by the fast-mover test
- [ ] 5.3 Debug draw proven by a route
- [ ] 5.4 Raycasting proven by the surface query
- [ ] 5.5 Character controller proven by Skyline

---

### WS-6 — Correct the parity claims that are currently false

| # | File | Task | Done when |
|---|---|---|---|
| 6.1 | `tools/product-remediation/build-threejs-parity.mjs` | `vehicle dynamics` and `vehicle AI driving` claim **exceed** while the car sinks through the road. Downgrade to `parity-unproven` until WS-2 lands. | Regenerated report shows the honest status |
| 6.2 | same | `platformer motion tuning` claims **exceed** citing `showcase-platformer-game-layer-proof`, a route **deleted in 1.5.2**. The claim cites a consumer that no longer exists. | Consumer list contains only live routes |
| 6.3 | `marketing/index.html` | Remove any game-capability implication not backed by a passing gate. | `check:marketing-truth` passes with the corrected claims |

**Checklist**
- [ ] 6.1 Vehicle rows downgraded pending WS-2
- [ ] 6.2 Deleted-route consumer removed from the platformer row
- [ ] 6.3 Marketing claims match gate reality

---

### WS-7 — Gates that would have caught all of this

Every defect the user reported was invisible to a green pipeline. That is the
deepest failure here.

| # | File | Task | Done when |
|---|---|---|---|
| 7.1 | `tools/showcase-library/game-visual-qa.mjs` | Penetration gate: no rendered geometry may intersect a surface it should rest on. | Fails on 1.5.2 |
| 7.2 | same | Motion-feel gate: apex, rise/fall ratio and airtime within declared bounds. | Fails on Skyline's current hop |
| 7.3 | same | Telemetry-coherence gate: displayed values match simulation state. | Fails on `SPEED 0 / running` |
| 7.4 | `tests/browser/showcase-gameplay-proof.spec.ts` | Operate each game through a scripted play session and assert observable state changes, not first-frame screenshots. | Both games exercised through a full objective |
| 7.5 | `package.json` | `pnpm check:game-runtime` runs 7.1–7.4 as one gate. | Wired into `check:release` |

**Checklist**
- [ ] 7.1 Penetration gate fails on 1.5.2
- [ ] 7.2 Motion-feel gate fails on current Skyline
- [ ] 7.3 Telemetry gate fails on current turbo drift
- [ ] 7.4 Scripted play sessions for both games
- [ ] 7.5 `check:game-runtime` in `check:release`

---

## 2. Sequencing

WS-1 first — everything grounded depends on real raycasting. Then WS-2 and WS-3 in
parallel. WS-4 is independent and can run alongside. WS-7 gates should be written
**before** their corresponding fixes, so each is observed failing on 1.5.2 first.
WS-6 lands with WS-2/WS-3. WS-5 is a consequence of 1–3, not separate work.

```
WS-1 ──┬──> WS-2 ──┐
       └──> WS-3 ──┼──> WS-5 (falls out) ──> WS-6
WS-4 ──────────────┘
WS-7 (write gates first, throughout)
```

## 3. Definition of done for this PRD

- [ ] Every checkbox above is checked
- [ ] `grep -rE "TRACK_SURFACE_Y|CAR_GROUND_Y|jumpVelocity:|gravity:" apps/` returns nothing
- [ ] `pnpm check:game-runtime` passes, and each of its gates was **observed
      failing** on the 1.5.2 build first
- [ ] Physics capability rows: 0 `parity-unproven` with 0 consumers
- [ ] A developer can build a grounded vehicle game and a platformer on the public
      API with no route-local physics constants, proven by two new clean-room
      projects under the existing line budgets
- [ ] Turbo Drift and Skyline promoted out of `prototype-blocked` **only** after
      all of the above, with independent human visual review

## 4. Explicit non-goals

- Do not adjust a screenshot, poster, threshold or gate tolerance to make anything pass.
- Do not add a route-local constant to correct a symptom.
- Do not promote route status as part of any task here.
- Do not claim Three.js parity on any capability without a passing gate and a
  named consumer.
