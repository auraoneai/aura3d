/**
 * WS-2.2 — `PhysicsWorld` and the solver, as a narrow entry point.
 *
 * ## Why this exists rather than importing the barrel
 *
 * `app.physics` is documented and tested as being live **synchronously** for every app
 * (`tests/unit/agent-api/lazy-physics-world.test.ts`), so `createAuraApp` must be able to construct a
 * world without awaiting. That rules out loading the solver with `await import()` — R7 forbids breaking
 * working semantics to chase a byte count, and an async-only `app.physics` would break every existing
 * caller.
 *
 * So the solver is imported statically, but from **here** rather than from `@aura3d/physics`. The
 * barrel is a chain of `export *` covering `HitboxWorld`, `CharacterController`, `KinematicBody`,
 * arcade vehicle telemetry, `NarrowPhase` and six fixture modules; importing it to get one class dragged all
 * of them in. This entry exposes the solver and nothing else.
 *
 * Measured on scenario 1 (one cube, no bodies), the eager physics chunk:
 *
 *   via the barrel      77,081 B gzip   (cannon-es 83,869 raw + HitboxWorld 14,379 + KinematicBody
 *                                        8,975 + CharacterController 8,531 + NarrowPhase 8,488 +
 *                                        arcade telemetry 8,125 + compatibility controllers + ...)
 *   via this entry      the solver only
 *
 * `cannon-es` itself stays on the critical path, and that is the honest remaining cost of a synchronous
 * `app.physics`. Removing it requires deciding whether the public contract may become async — which is
 * a **P4** question, not a P2 one, and one the physics bake-off has to answer anyway because Rapier is
 * WASM and therefore asynchronous by construction.
 */
export { PhysicsWorld } from "./PhysicsWorld.js";
export type {
  PhysicsBackend,
  PhysicsBackendPreference,
  PhysicsBackendSelection,
  PhysicsContinuousCollisionDescriptor,
  PhysicsContinuousCollisionSelection,
  PhysicsSnapshot,
  PhysicsStepStats,
  PhysicsWorldDescriptor
} from "./PhysicsWorld.js";
