# ADR 0003 — Game kits consume shared runtime services by capability

- **Date:** 2026-08-08
- **Status:** accepted; supersedes ADR 0002
- **Workstream:** WS-4.7 — kits consume the shared runtime

## Context

WS-4.7 was interpreted as requiring every game kit to import `PhysicsRuntime` and
`SurfaceQuery`. Source characterization shows that rule is too broad:

| Kit | State it advances | Shared capability it needs |
|---|---|---|
| racing | continuous planar vehicle pose | arcade vehicle motion plus racing-surface query |
| platformer | continuous character pose | kinematic body plus platform surface query |
| falling blocks | discrete board cells and rule timers | deterministic simulation clock only |
| locomotion | animation state selected from an input snapshot | no pose integration; consumes motion state |
| fighting | combat actors, collision, camera, effects | already delegates to `GameRuntime` services |

Falling-block gravity is a rule that advances a board row after a deterministic number of frames;
it is not rigid-body gravity. Locomotion selects clips from supplied velocity and grounding; it does
not move an actor. Making either instantiate a physics world would add a solver dependency without
removing an implementation. R11 and the product North Star forbid that coupling.

ADR 0002 proved a different mismatch. The then-present `createVehicleMotion` prototype was a force-based tyre simulation with
metres, kilograms, newtons, gravity, load transfer, slip and yaw inertia. `game.racing` promises an
arcade route contract: arbitrary authored units and a public `paceMultiplier` from 0.5 through 4.
The measured 4x route pace cannot be represented by the force model without physically meaningless
loads. The missing length scale was real, but adding one would not make the public arcade contract a
force-simulation contract.

## The four R11 questions

1. **Does Three.js already solve this?** No. Three.js owns rendering and delegates game motion.
2. **Does another mature ecosystem library solve this?** Rigid-body libraries solve physical
   vehicles and character collision. They do not define Aura3D's deterministic arcade-route rules,
   falling-block rules, locomotion clip selection, or fighting-game composition.
3. **Does this create lasting differentiation for Aura3D?** The differentiated layer is a typed,
   deterministic game-kit API composed over shared services—not another solver.
4. **Does this belong above or below the public API?** The service implementations are below the
   kit API. Public snapshots and controls remain stable; kits delegate continuous integration to the
   relevant shared service.

## Decision

1. `GameRuntime` owns deterministic game stepping and general kinematic bodies.
2. The physics package owns geometry surface queries. The unused force-vehicle prototype is not a
   second shipped motion owner; a future physical vehicle API requires a new explicit contract.
3. `game.racing` is explicitly arcade motion. It delegates pose integration to one shared arcade
   vehicle service; it is not an adapter over the tyre-force model.
4. `game.platformer` delegates continuous pose integration to the shared kinematic-body service and
   retains genre rules such as coyote time, jump buffering, checkpoints and hazards.
5. Falling blocks retains board rules but uses the shared deterministic step contract. Locomotion
   remains a state consumer. Neither imports a rigid-body solver.
6. Fighting continues to compose the shared collision, combat, camera and effects services.
7. A source architecture test identifies the service each kit consumes and rejects private
   continuous pose integration in racing and platformer. It does not pass by checking that files
   merely coexist.

This resolves ADR 0002 by rejecting its premise that the force model must own the arcade kit. The
unreleased prototype and its prototype-only tests were subsequently removed under a six-point R8
dependency proof. A future physically simulated racing kit must use a separate public contract that
states length scale and physical handling explicitly.

## Unit and stepping contract

- Game-runtime vectors use authored game units.
- `dt` is finite seconds, clamped at the public kit boundary, and deterministic for identical state
  and input.
- Arcade velocity and acceleration are authored units per second and per second squared.
- A future force-model contract must state mass, force, torque, gravity, wheelbase, grip and
  suspension in physical units; the arcade service does not claim those meanings.
- Surface queries classify/support motion but do not integrate it.
- Reset replaces pose and velocity and clears the step accumulator.
- Fixed-step services expose interpolation alpha when they accumulate wall-clock deltas; kit tests
  drive exact deterministic steps and therefore observe alpha zero.

## Compatibility targets

Before deleting either private continuous integrator, retained tests must prove:

- racing preserves reset, checkpoint/lap progression, signed track offset, route recovery, certified
  maximum speed and the 60-second deterministic driver;
- platformer preserves jump apex, coyote time, jump buffering, dash, moving-platform carry, grounding,
  hazard/fall respawn, checkpoints, completion and neutral-input respawn protection;
- falling blocks preserves seeded checksums and replay;
- locomotion preserves transition priority and one-shot timing;
- fighting preserves deterministic combat, pushboxes, camera and effects evidence.

The three prototype-blocked showcase routes remain blocked. This decision does not grant a visual
approval or promote a route.

## Consequences

- R12 is measured by implementation ownership, not by the coexistence of `GameRuntime.ts` and
  `GameGenreKits.ts`.
- The old detector's `GameRuntime.ts && GameGenreKits.ts` predicate is invalid: it can only become
  green by deleting an entire public module, regardless of whether any duplicate integration exists.
- The old vehicle predicate's search for the word `heading` is also invalid: snapshots and cameras
  legitimately expose heading after delegation.
- Those predicates must be replaced only after the shared services and source architecture tests
  exist, so the gate cannot be made green by prose.

## Evidence

- ADR 0002 contains the measured failed force-model migration and route pace sweep.
- `packages/engine/src/agent-api/GameRuntime.ts` owns kinematic bodies, collision, combat, simulation,
  camera and effects services.
- `packages/engine/src/agent-api/GameGenreKits.ts` delegates racing and platformer pose integration
  to the shared owners named by this decision.
- `packages/engine/src/agent-api/game-kits/fighting.ts` already composes the shared combat, camera and
  effects services.
- `pnpm check:deletion-safety -- packages/physics/src/VehicleMotion.ts` proves all six R8 dependency
  classes empty before removal.
- Focused compatibility suites are named in the implementation commits; this ADR grants no checkbox
  by file existence alone.
