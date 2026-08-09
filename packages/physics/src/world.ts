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
 * The selected Rapier solver is imported statically from this narrow entry instead of the
 * compatibility barrel. This preserves synchronous `app.physics` construction after the
 * adapter module's one-time WASM initialization without pulling unrelated arcade or query APIs.
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
