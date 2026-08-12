# ADR 0002 — `game.racing` cannot adopt the force model until the route contract states a length scale

- **Date:** 2026-08-07
- **Status:** superseded by ADR 0003
- **Workstream:** WS-4.7 — kits consume the shared runtime

## The four R11 questions

R11 is invoked here in its second, less obvious mode: not "should we build a new subsystem"
but "we have two implementations of one capability and the migration between them does not
converge". The questions still discriminate.

1. **Does Three.js already solve this?** No. Three.js ships no vehicle model at all; its own
   vehicle example delegates to Rapier's `DynamicRayCastVehicleController`. Vehicle dynamics is
   not a rendering concern, so there is nothing to defer to.
2. **Does another mature ecosystem library solve this?** Partly, and it does not remove the
   problem. `cannon-es` ships `RaycastVehicle` and Rapier ships a vehicle controller, but both
   are *3D rigid-body* vehicles requiring a physical length scale — which is precisely what
   this ADR establishes the route contract does not supply. Swapping the implementation does
   not answer the question; stating the scale does.
3. **Does this create lasting differentiation for Aura3D?** The force model already exists and
   is already ours (`VehicleMotion.ts` + a Pacejka tyre model). The differentiation question is
   therefore not "should we own this" but "should two owners persist" — and R12 says no.
4. **Does this belong above or below the public API?** Below. `GameRacingSnapshot` is the public
   surface and the integrator is an implementation detail, which is why the rewire was
   attempted at all: it should have been invisible to callers. It was not, and the reason is
   the missing scale rather than the API boundary.

The unclear answer is #2/#4 in combination, so per R11 implementation stopped and this landed.

## Decision, and why the workstream is not done

WS-4.7's central item is that `createGameRacingKit` "integrates its own kinematic motion, so
heading comes from steering input and the force model is bypassed." That is accurate, and it
is also the last unresolved R12 duplicate-ownership row for vehicle motion: `game.racing` and
`packages/physics/VehicleMotion` both integrate a vehicle, and the shipped kit uses its own.

The rewire was implemented in full and **reverted**. It is recorded here rather than left in
the tree, because a partly-converted kit is worse than either end state.

## What was built

`createGameRacingKit` driving `createVehicleMotion`: `heading`, `speed` and `lateralSpeed`
from the model, position advanced from the model's velocity (so the car no longer travels
exactly where it points), `drift` measured from rear slip angle instead of counted up while a
key is held, a new `GameRacingSnapshot.vehicle` carrying slip angles, yaw rate,
understeer/oversteer and per-axle load, and `VehicleMotion`/`VehicleDynamics` exposed on
`@aura3d/physics/solverless` so the racing kit does not drag the solver onto the critical path.

Four real defects were found and fixed along the way. Three are **kept**, because they are
correct independently of this decision, and are committed separately:

1. **Do not measure corner radius per vertex — the repository already knows this.** My first
   attempt computed the tightest radius from the turn angle at each vertex and got **0.480**,
   which is a duplicate-point artifact (a closed route repeats its first point as its last, so
   the turn across a zero-length segment is meaningless). Excluding degenerate segments gave
   **0.684**. Both are wrong. `arcCurvature` in `GameGenreKits.ts` already measures curvature
   over an arc window using the Menger formula, and its own comment explains exactly why the
   per-vertex form is invalid: "a polyline has no curvature within a segment and an undefined
   spike at each vertex", previously differing by 2.068 in curvature across one continuous
   corner. The correct tightest radius, measured through the shipped sampler, is **1.005** at
   progress 0.267. **This fix is therefore "use the existing function", and no new measurement
   code should be added.**
2. **The kit clamped reported speed without telling the model.** `maxSpeed` is a route
   contract, and the model knows nothing about it. Measured: the model's internal speed ran to
   **18.15** while the snapshot reported the clamped **4.31**, so every speed-derived quantity
   was computed for a car going four times too fast.
3. **A steering rack has no rate limit in a kinematic model and needs one in a force model.**
   With yaw inertia, a proportional controller tuned against instant response overshoots and
   limit-cycles: measured `yawRate` alternating +1.95 / −1.90 rad/s on consecutive frames.
   `steerRate` — the kit's own long-standing option, whose name already means this — sets it.

## Evidence — why it is blocked

**A force model requires an absolute length scale, and the route contract does not carry one.**

`GameRacingRoute` declares `points`, `width` and a certified speed, all in authored game
units. Nothing states how long one unit is. Every quantity a tyre model needs is
scale-dependent:

| Quantity | Depends on absolute scale |
| --- | --- |
| Wheelbase vs corner radius | Yes — sets the steer angle required, and a tyre's force *peaks at a few degrees of slip and falls off past it* |
| Cornering limit `v = sqrt(mu*g*r)` | Yes — through `g` |
| Tyre load sensitivity | Yes — through `mass * g` |
| Integrator stability | Yes — the stable step goes as `1/g`, and `resolveSample` caps substeps |

The shipped circuit is internally consistent and *implies* a scale of roughly **27 metres per
unit** (a 0.439-unit road read as a 12 m track). Its shape is normal — the tightest corner is
2.3 road widths, against about 2.1 for real Tsukuba. What is not normal is the pace: **9.8 road
widths per second**. For comparison, a real car at 200 km/h on a 12 m road covers 4.6 road
widths per second.

Measured with the **correct** arc-window radius of 1.005, sweeping target cornering load
against wheelbase — 11 of 12 configurations cannot hold the corner, and the one that can
reports 120 g, which is not a car:

| Target g | Wheelbase | Achievable radius | Holds 1.005? | Delivered lateral g |
| --- | --- | --- | --- | --- |
| 2 | 0.251 / 0.151 / 0.080 | 11.29 / 10.03 / 9.09 | no | 0.2 |
| 3 | 0.251 / 0.151 / 0.080 | 4.92 / 4.38 / 3.76 | no | 0.6 / 0.7 / 24.2 |
| 4 | 0.251 / 0.151 / 0.080 | 2.68 / 3.87 / 1.61 | no | 1.6 / 17.1 / 56.8 |
| 6 | 0.251 / 0.151 / 0.080 | 1.43 / 2.75 / 0.795 | only 0.080 | 27.2 / 63.4 / **120.4** |

Holding geometry fixed and sweeping the declared pace instead (these figures used the earlier
0.684 radius, so read them as relative rather than absolute — the ordering is the point):

| Pace (units/s) | Road widths/s | Achievable radius | Holds the 0.684 corner? |
| --- | --- | --- | --- |
| 4.312 (shipped, 4x) | 9.8 | 4.077 | no |
| 3.000 | 6.8 | 1.582 | no |
| 2.000 | 4.6 | 15.159 | no |
| 1.500 | 3.4 | 0.274 | **yes** |
| 1.078 (1x certified) | 2.5 | 0.259 | **yes** |

Raising the substep cap from 64 to 1024 changed none of these figures, so this is not the
integrator-stability limit — it is the tyre operating past its slip peak.

The non-monotonic row (pace 2.0 giving 15.2) is itself evidence: the search is not landing in
a well-behaved region of the parameter space, and the delivered `lateralG` figures in the
failing configurations reach 40–150 g, which is not a car.

## The actual conclusion

**The shipped 4x pace is a kinematic pace.** It is achievable when heading is a direct
function of steering input, because such a car has no slip, no lateral velocity and no tyre
to saturate. It is not achievable by any parameterisation of a tyre-based force model on this
geometry. Continuing to tune constants until the tests pass would produce numbers chosen to
satisfy assertions rather than to describe a vehicle, which is precisely the pattern
the Aura3D 2.0 architecture contract exists to end.

The three existing tests that fail are not wrong, and must not be weakened (R2). They encode
the shipped route's real behavioural contract:

- `turbo-route-drivability` — "gains real speed through the mounted proof's key sequence"
  (measured 0.291 against a required 0.5) and "recovers to the racing line under the route's
  own steering correction" (1,459 of 1,800 frames off-road)
- `racing-signed-track-offset` — a proportional controller must cross the line rather than
  oscillate about it
- `turbo-sixty-second-race` — the retained 60-second race proof

## Consequences — what has to happen first

1. **`GameRacingRoute` states its length scale**, e.g. `unitsPerMetre`, the same fix
   `VehicleMotionSpec.gravity` already documents at the model level and for the same reason.
   Without it the kit is guessing, and this ADR is the record of guessing not working.
2. **The route's certified pace is re-derived** against what its geometry supports, or the
   geometry is re-authored for the pace. Note the pace is ~2x what a real car does relative to
   road width, which is a legitimate arcade choice and simply has to be *stated* as one. That changes shipped route evidence and the 60-second
   race proof, so it is a Phase 5 route decision with human review (R5), not a kit change.
3. **Then** the rewire relands, with the three fixes above already in place.

## What ships now instead

The three defect fixes, which stand on their own. The kinematic integrator stays, and stays
**named**: it is the remaining R12 vehicle-motion row, reported by
`tools/negative-complexity/index.ts` (2 of 5 violations) rather than quietly closed. R12 is
not satisfied by this ADR and should not be marked satisfied.

## Supersession

ADR 0003 preserves this document and its measurements as the rejected force-model migration
record, but changes the decision about what `game.racing` is required to consume. The public kit's
documented `paceMultiplier` and arbitrary authored route units describe an arcade-motion contract,
not a tyre-simulation contract. Requiring the force model here conflated two different capabilities.
