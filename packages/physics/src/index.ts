/**
 * WS-4.1 — the backend-neutral public physics contract.
 *
 * ## What this file is
 *
 * This barrel *is* the contract. Everything a developer can reach through
 * `@aura3d/physics` is listed below, grouped by the seven contract areas, and nothing in
 * it names or exposes the solver underneath.
 *
 * That neutrality is the point, and it is load-bearing rather than stylistic. WS-4.2
 * selected one production solver on measured evidence and recorded dated triggers for
 * reopening the decision (`docs/architecture/physics-backend-decision.md`). A future
 * backend swap is a bounded change **only** while no solver type reaches a caller: the
 * solver is imported in exactly one file (`PhysicsWorld.ts`) out of ~12.6k lines, and
 * every symbol it brings in is either a private field or a module-local bridge function.
 * `Vec3`, `Quat`, `Bounds`, `PhysicsShape`, `RaycastHit` and the rest are Aura3D's own
 * plain-array types.
 *
 * The solver is deliberately not named anywhere in this file — not even in prose. WS-4.1's
 * proof is a grep for the backend package name over this file returning empty, so naming it
 * in a comment would satisfy the letter of the contract while breaking its own gate. This
 * paragraph exists because the first draft did exactly that and the gate caught it.
 *
 * Enforced, not asserted: `tests/unit/physics/backend-neutral-contract.test.ts` fails if a
 * backend type or the package name appears in the public surface, and
 * `tests/unit/physics/single-solver-ownership.test.ts` fails if a second solver returns.
 *
 * ## The seven contract areas
 *
 * Named by the PRD, and each has to be reachable from here or the contract has a hole.
 *
 * 1. **Bodies** — `RigidBody`, mass/inertia/damping, forces, impulses, sleep/wake.
 * 2. **Colliders** — `Shape` (7 kinds), materials, layer/mask filters, sensors, volumes.
 * 3. **Joints** — `Constraint`: fixed, hinge, slider, ball-socket, spring, motorised hinge.
 * 4. **Raycast / shapecast** — `raycast`, `raycastAll`, `sphereCast`, `sphereCastAll`,
 *    ground-height sampling, swept `timeOfImpact`, `MeshBVH` and `SurfaceQuery` for
 *    geometry-level queries.
 * 5. **Character movement** — `ArcadeCharacterController` and
 *    `FightingCharacterController` are explicitly authored-unit motion.
 *    Physical collision-constrained character movement belongs to the
 *    selected optional Rapier adapter.
 * 6. **Vehicle** — `ArcadeVehicleTelemetry` provides non-integrating telemetry,
 *    Pacejka sampling, and drivetrain helpers. Physical vehicle ownership lives
 *    in the optional selected engine; public arcade pose/driver ownership lives
 *    in `GameRuntime`.
 * 7. **Deterministic stepping** — `PhysicsWorld.step(dt)` with a fixed delta,
 *    `PhysicsStepper` for accumulator-driven fixed-step loops, and the adaptive-substep
 *    CCD wrapper, which is Aura3D's because the solver exposes no native swept TOI.
 *
 * Above the solver and deliberately kept: kinematic and hitbox worlds, debug drawing,
 * and the ECS/scene bridges. Navigation and crowd ownership moved to the optional
 * Recast/Detour adapter at the major-version boundary.
 */

// --- 1. Bodies, and the shared math/shape vocabulary the whole contract speaks in ---
export * from "./Shape.js";
export * from "./RigidBody.js";

// --- 2. Colliders: shapes in the world, with materials, filters and sensors ---
export * from "./Collider.js";
export * from "./CollisionEvents.js";
export * from "./CollisionVolumes.js";

// --- 3. Joints ---
export * from "./Constraint.js";
export * from "./Constraints.js";

// --- 4. Raycast, shapecast, and geometry-level queries ---
export * from "./Raycast.js";
export * from "./TimeOfImpact.js";
export * from "./MeshBVH.js";
export * from "./SurfaceQuery.js";

// --- 5. Character controllers ---
export * from "./ArcadeCharacterController.js";
export * from "./FightingCharacterController.js";
export * from "./KinematicBody.js";
export * from "./KinematicWorld.js";
export * from "./HitboxWorld.js";

// --- 6. Vehicle, and the racing layer above the solver ---
export * from "./ArcadeVehicleTelemetry.js";

// --- 7. Deterministic stepping ---
export * from "./PhysicsWorld.js";
export * from "./PhysicsStepper.js";

// --- Above the solver: bridges and diagnostics ---
export * from "./ScenePhysicsBridge.js";
export * from "./ECSPhysicsBridge.js";
export * from "./PhysicsDebugDraw.js";
