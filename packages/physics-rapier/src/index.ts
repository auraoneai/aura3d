import type * as Rapier from "@dimforge/rapier3d-compat";
import { toRapierHeightfieldHeights } from "./HeightfieldLayout.js";

import { ensureRapier, getRapierInitializationError, getRapierModule, rapierInitMode, rapierLoadMode } from "./rapierInit.js";

// `@dimforge/rapier3d-compat` is an OPTIONAL peer (see PhysicsBackendMissingError for the failure contract): it must be absent-tolerant at module evaluation so
// `import { createAuraApp } from "@aura3d/engine"` works in consumers that never use physics. Failure defers to
// call time. Initialisation lives in `./rapierInit.js` (top-level await by default, a lazy variant under the
// `aura3d-no-tla` bundler condition).
export { ensureRapier as ensurePhysics, rapierInitMode as physicsInitMode };
/**
 * How this build loads Rapier: `eager` (default; at module evaluation, or in the background under `aura3d-no-tla`),
 * `on-demand` (`aura3d-physics-on-demand` condition / `aura3d({ physics: "lazy" })`: on the first `ensurePhysics()`), or
 * `stripped` (the Aura3D Vite plugin found no physics usage and removed the backend from this build).
 */
export const physicsLoadMode: "eager" | "on-demand" | "stripped" = rapierLoadMode;

/** A failure that already carries the typed PHYSICS_BACKEND_MISSING code (for example a build-time strip) is reported as is. */
function typedMissingCause(failure: { readonly cause: unknown } | null): Error | undefined {
  const cause = failure?.cause;
  return cause instanceof Error && (cause as { code?: unknown }).code === "PHYSICS_BACKEND_MISSING" ? cause : undefined;
}

/** Stable error code for an absent or unresolvable Rapier backend. */
export const PHYSICS_BACKEND_MISSING = "PHYSICS_BACKEND_MISSING" as const;
/** The exact command that installs the pinned Rapier backend with npm. */
export const PHYSICS_BACKEND_INSTALL_COMMAND = "npm install @dimforge/rapier3d-compat@0.20.0" as const;

/**
 * Thrown (synchronously for `new PhysicsWorld()` / declared `.physics({...})` bodies, asynchronously for
 * `createRapierPhysics()` and `preloadPhysics()`) when `@dimforge/rapier3d-compat` cannot be resolved. Carries the
 * install command so an agent or a developer can fix the project without reading docs.
 */
export class PhysicsBackendMissingError extends Error {
  readonly code = PHYSICS_BACKEND_MISSING;
  readonly installCommand = PHYSICS_BACKEND_INSTALL_COMMAND;
  constructor(detail?: string, options?: { readonly cause?: unknown }) {
    super(
      `${PHYSICS_BACKEND_MISSING}: ${detail ?? "Aura3D physics needs the Rapier backend @dimforge/rapier3d-compat, which is not installed."} Install it with: ${PHYSICS_BACKEND_INSTALL_COMMAND} (pnpm add @dimforge/rapier3d-compat@0.20.0, yarn add @dimforge/rapier3d-compat@0.20.0).`,
      options
    );
    this.name = "PhysicsBackendMissingError";
  }
}

export type PhysicsBackendStatus =
  | { readonly state: "ready" }
  | { readonly state: "missing"; readonly code: typeof PHYSICS_BACKEND_MISSING; readonly installCommand: typeof PHYSICS_BACKEND_INSTALL_COMMAND }
  | { readonly state: "failed"; readonly cause: unknown };

/** Observed (not predicted) backend state; `missing` also covers a lazy build that has not finished loading. */
export function getPhysicsBackendStatus(): PhysicsBackendStatus {
  if (getRapierModule()) return { state: "ready" };
  const failure = getRapierInitializationError();
  if (failure && !typedMissingCause(failure)) return { state: "failed", cause: failure.cause };
  return { state: "missing", code: PHYSICS_BACKEND_MISSING, installCommand: PHYSICS_BACKEND_INSTALL_COMMAND };
}

function requireRapierModule(): RapierModule {
  const rapier = getRapierModule();
  if (!rapier) {
    const failure = getRapierInitializationError();
    const typed = typedMissingCause(failure);
    if (typed) throw typed;
    if (failure) throw new Error("@aura3d/engine physics failed to initialize the Rapier WASM backend.", { cause: failure.cause });
    throw new PhysicsBackendMissingError(
      rapierLoadMode === "on-demand"
        ? "this build loads physics on demand (aura3d({ physics: \"lazy\" })), so `await app.physics.ready()` or `await ensurePhysics()` (from @aura3d/engine/physics) before creating a world; if it still fails the Rapier backend @dimforge/rapier3d-compat is not installed."
        : rapierInitMode === "lazy"
        ? "this build has no top-level await, so `await ensurePhysics()` (from @aura3d/engine/physics) before creating a world or calling createAuraApp; if it still fails the Rapier backend @dimforge/rapier3d-compat is not installed."
        : undefined
    );
  }
  return rapier;
}

export type RapierModule = typeof import("@dimforge/rapier3d-compat");
export type PhysicsVec3 = readonly [number, number, number];

export type RapierShapeSpec =
  | { readonly kind: "box"; readonly halfExtents: PhysicsVec3 }
  | { readonly kind: "sphere"; readonly radius: number }
  | { readonly kind: "capsule"; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: "plane"; readonly normal: PhysicsVec3; readonly constant: number }
  | { readonly kind: "mesh"; readonly vertices: readonly PhysicsVec3[]; readonly indices: readonly number[] }
  | { readonly kind: "convex-hull"; readonly vertices: readonly PhysicsVec3[] }
  | {
      readonly kind: "heightfield";
      readonly rows: number;
      readonly columns: number;
      readonly heights: readonly number[];
      readonly cellSize: number;
    };

export interface RapierRigidBodySpec {
  readonly type?: "dynamic" | "fixed" | "kinematic-position" | "kinematic-velocity";
  readonly position?: PhysicsVec3;
  readonly rotation?: readonly [number, number, number, number];
  readonly linearVelocity?: PhysicsVec3;
  readonly angularVelocity?: PhysicsVec3;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly ccd?: boolean;
  readonly canSleep?: boolean;
  readonly mass?: number;
  readonly principalAngularInertia?: PhysicsVec3;
}

export interface RapierColliderSpec {
  readonly shape: RapierShapeSpec;
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly sensor?: boolean;
  readonly collisionGroups?: number;
}

export interface RapierBodySpec extends RapierRigidBodySpec, RapierColliderSpec {}

export type RapierJointSpec = {
  /**
   * `revolute` is the Rapier-native name for `hinge`; `prismatic` is the
   * Rapier-native name for `slider`. Both spellings are accepted and build the
   * same native joint — the alias exists so H1's fixed/revolute/prismatic
   * promotion reads identically at the adapter and at root.
   */
  readonly type: "fixed" | "hinge" | "revolute" | "slider" | "prismatic" | "spring" | "ball-socket" | "motorised-hinge";
  readonly localAnchorA: PhysicsVec3;
  readonly localAnchorB: PhysicsVec3;
  /** Fixed-joint local frames; omitted frames default to identity. */
  readonly localRotationA?: readonly [number, number, number, number];
  readonly localRotationB?: readonly [number, number, number, number];
  /** Align the two local frames using the bodies' relative rotation at creation. */
  readonly relativeFrameBFromA?: readonly [number, number, number, number];
  readonly axis: PhysicsVec3;
  readonly restLength: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly motorSpeed: number;
  readonly maxMotorTorque: number;
  readonly limits?: readonly [number, number];
};

export interface RapierPhysicsOptions {
  readonly gravity?: PhysicsVec3;
  readonly moduleLoader?: (() => Promise<RapierModule>) | undefined;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}
function vec(value: PhysicsVec3, label: string): { x: number; y: number; z: number } {
  return { x: finite(value[0], `${label}[0]`), y: finite(value[1], `${label}[1]`), z: finite(value[2], `${label}[2]`) };
}

export class RapierBodyHandle {
  readonly #body: Rapier.RigidBody;
  readonly #world: RapierPhysicsWorld;
  constructor(world: RapierPhysicsWorld, body: Rapier.RigidBody) { this.#world = world; this.#body = body; }
  get id(): number { return this.#body.handle; }
  position(): PhysicsVec3 { const p = this.unsafeRapierBody().translation(); return [p.x, p.y, p.z]; }
  velocity(): PhysicsVec3 { const p = this.unsafeRapierBody().linvel(); return [p.x, p.y, p.z]; }
  sleeping(): boolean { return this.unsafeRapierBody().isSleeping(); }
  applyForce(force: PhysicsVec3): this { this.unsafeRapierBody().addForce(vec(force, "force"), true); return this; }
  applyImpulse(impulse: PhysicsVec3): this { this.unsafeRapierBody().applyImpulse(vec(impulse, "impulse"), true); return this; }
  setVelocity(velocity: PhysicsVec3): this { this.unsafeRapierBody().setLinvel(vec(velocity, "velocity"), true); return this; }
  setPosition(position: PhysicsVec3): this { this.unsafeRapierBody().setTranslation(vec(position, "position"), true); this.#world.markQueriesStale(); return this; }
  wake(): this { this.unsafeRapierBody().wakeUp(); return this; }
  sleep(): this { this.unsafeRapierBody().sleep(); return this; }
  remove(): void { this.#world.removeBody(this); }
  /** @internal */
  ownedBy(world: RapierPhysicsWorld): boolean { return this.#world === world; }
  /** Stable typed escape hatch. The caller does not own or free this object. */
  unsafeRapierBody(): Rapier.RigidBody { this.#world.assertBodyHandle(this); return this.#body; }
  /** The first attached collider, retained for the one-shape convenience API. */
  unsafeRapierCollider(): Rapier.Collider {
    const collider = this.unsafeRapierBody().collider(0);
    if (!collider) throw new Error("Rapier body has no collider.");
    return collider;
  }
}

export class RapierColliderHandle {
  readonly #collider: Rapier.Collider;
  readonly #world: RapierPhysicsWorld;
  readonly #surface?: Extract<RapierShapeSpec, { kind: "mesh" | "heightfield" }>;
  constructor(world: RapierPhysicsWorld, collider: Rapier.Collider, shape?: RapierShapeSpec) {
    this.#world = world; this.#collider = collider;
    if (shape?.kind === "mesh") this.#surface = { kind: "mesh", vertices: shape.vertices.map((v) => [v[0], v[1], v[2]]), indices: [...shape.indices] };
    else if (shape?.kind === "heightfield") this.#surface = { ...shape, heights: [...shape.heights] };
  }
  get id(): number { return this.#collider.handle; }
  remove(): void { this.#world.removeCollider(this); }
  /** @internal */
  ownedBy(world: RapierPhysicsWorld): boolean { return this.#world === world; }
  /** Stable typed escape hatch. The adapter owns and frees this object. */
  unsafeRapierCollider(): Rapier.Collider { this.#world.assertColliderHandle(this); return this.#collider; }
  /** @internal Original winding is needed to filter front faces of triangle meshes. */
  get surface(): Extract<RapierShapeSpec, { kind: "mesh" | "heightfield" }> | undefined { return this.#surface; }
  /** Cast a unit-distance ray at this collider; `maxDistance` is in world units. */
  castRay(origin: PhysicsVec3, direction: PhysicsVec3, maxDistance = Infinity, includeBackfaces = false): RapierColliderQueryHit | undefined {
    return this.#world.castColliderRay(this, origin, direction, maxDistance, includeBackfaces);
  }
  /** Sweep a sphere at this collider without approximating its corners or surface. */
  castSphere(origin: PhysicsVec3, radius: number, direction: PhysicsVec3, maxDistance = Infinity, includeBackfaces = false): RapierColliderSphereQueryHit | undefined {
    return this.#world.castColliderSphere(this, origin, radius, direction, maxDistance, includeBackfaces);
  }
  /** Test actual collider geometry against a world-aligned box or sphere. */
  intersectsShape(center: PhysicsVec3, shape: Extract<RapierShapeSpec, { kind: "sphere" | "box" }>): boolean {
    return this.#world.colliderIntersectsShape(this, center, shape);
  }
}

export interface RapierColliderQueryHit {
  readonly point: PhysicsVec3;
  readonly normal: PhysicsVec3;
  readonly distance: number;
}

export interface RapierColliderSphereQueryHit extends RapierColliderQueryHit {
  readonly castCenter: PhysicsVec3;
}

export class RapierJointHandle {
  readonly #joint: Rapier.ImpulseJoint;
  readonly #world: RapierPhysicsWorld;
  readonly #module: RapierModule;
  constructor(world: RapierPhysicsWorld, joint: Rapier.ImpulseJoint, module: RapierModule) { this.#world = world; this.#joint = joint; this.#module = module; }
  get id(): number { return this.#joint.handle; }
  remove(): void { this.#world.removeJoint(this); }
  /** @internal */
  ownedBy(world: RapierPhysicsWorld): boolean { return this.#world === world; }
  configureMotor(speed: number, maxTorque: number): void {
    const joint = this.unsafeRapierJoint() as Rapier.RevoluteImpulseJoint;
    if (joint.type() !== this.#module.JointType.Revolute) throw new Error("Motor control is supported only on revolute joints.");
    const safeSpeed = finite(speed, "motor speed");
    const safeTorque = nonNegative(maxTorque, "maximum motor torque");
    joint.configureMotorModel(this.#module.MotorModel.ForceBased);
    joint.setMotorMaxForce(safeTorque);
    joint.configureMotorVelocity(safeSpeed, 1);
  }
  /** Stable typed escape hatch. The adapter owns and frees this object. */
  unsafeRapierJoint(): Rapier.ImpulseJoint { this.#world.assertJointHandle(this); return this.#joint; }
}

export interface RapierRayHit {
  readonly body: RapierBodyHandle;
  readonly colliderHandle: number;
  readonly timeOfImpact: number;
  readonly point: PhysicsVec3;
}

export interface RapierCharacterMovement {
  readonly requested: PhysicsVec3;
  readonly applied: PhysicsVec3;
  readonly grounded: boolean;
  readonly collisions: number;
  readonly nextPosition: PhysicsVec3;
}

export class RapierCharacterControllerHandle {
  readonly #world: RapierPhysicsWorld;
  readonly #raw: Rapier.KinematicCharacterController;
  #lastGrounded = false;
  #lastApplied: PhysicsVec3 = [0, 0, 0];
  constructor(world: RapierPhysicsWorld, raw: Rapier.KinematicCharacterController) { this.#world = world; this.#raw = raw; }
  /** @internal */
  ownedBy(world: RapierPhysicsWorld): boolean { return this.#world === world; }
  /** The adapter owns this native controller. */
  get raw(): Rapier.KinematicCharacterController { this.#world.assertCharacterController(this); return this.#raw; }
  enableAutostep(maxHeight: number, minWidth: number, includeDynamicBodies = false): this { this.raw.enableAutostep(positive(maxHeight, "autostep maxHeight"), positive(minWidth, "autostep minWidth"), includeDynamicBodies); return this; }
  enableSnapToGround(distance: number): this { this.raw.enableSnapToGround(positive(distance, "snap distance")); return this; }
  setMaxSlopeClimbAngle(radians: number): this { this.raw.setMaxSlopeClimbAngle(slopeAngle(radians)); return this; }
  setMinSlopeSlideAngle(radians: number): this { this.raw.setMinSlopeSlideAngle(slopeAngle(radians)); return this; }
  /** Sliding down slopes too steep to stand on. Turning this off leaves a character stuck on a hill. */
  setSlideEnabled(enabled: boolean): this { this.raw.setSlideEnabled(enabled); return this; }
  /** Mass used when the character pushes a dynamic body, in kilograms. */
  setCharacterMass(mass: number | null): this { this.raw.setCharacterMass(mass === null ? null : positive(mass, "character mass")); return this; }
  /** Whether touching a dynamic body moves it. Off, the character walks through crates. */
  setApplyImpulsesToDynamicBodies(enabled: boolean): this { this.raw.setApplyImpulsesToDynamicBodies(enabled); return this; }
  /** The grounding reported by the most recent `move`, with no solver side effect. */
  get lastGrounded(): boolean { this.#world.assertCharacterController(this); return this.#lastGrounded; }
  get lastApplied(): PhysicsVec3 { this.#world.assertCharacterController(this); return [...this.#lastApplied]; }
  move(character: RapierColliderHandle | RapierBodyHandle, requested: PhysicsVec3): RapierCharacterMovement {
    this.#world.assertCharacterController(this);
    this.#world.assertCharacterTarget(character);
    const desired = vec(requested, "character movement");
    const collider = character.unsafeRapierCollider();
    if (collider.isSensor()) {
      throw new Error(
        "A solver-backed character controller cannot move through a sensor collider: sensors are reported to " +
        "queries but never block, so the character would fall through the world with no error anywhere."
      );
    }
    const body = collider.parent();
    if (!body) throw new Error("Character collider must be attached to a rigid body.");
    if (!this.#world.isPositionKinematic(body)) {
      throw new Error(
        "A solver-backed character controller moves a kinematic-position body; Rapier owns the position the " +
        "collision solver allowed. A dynamic body has to be pushed by forces or it gets two transform owners."
      );
    }
    this.#world.refreshQueries();
    this.raw.computeColliderMovement(collider, desired);
    const movement = this.raw.computedMovement();
    const current = body.translation();
    const next = { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z };
    body.setNextKinematicTranslation(next);
    this.#lastGrounded = this.raw.computedGrounded();
    this.#lastApplied = [movement.x, movement.y, movement.z];
    return {
      requested: [...requested],
      applied: [movement.x, movement.y, movement.z],
      grounded: this.#lastGrounded,
      collisions: this.raw.numComputedCollisions(),
      nextPosition: [next.x, next.y, next.z]
    };
  }
  /**
   * Teleport the character and clear the queued kinematic step.
   *
   * Writing only the rendered mesh leaves Rapier's queued next-translation in place,
   * so the respawned character is dragged back toward wherever the old movement was
   * headed on the following step.
   */
  setPosition(character: RapierColliderHandle | RapierBodyHandle, position: PhysicsVec3): PhysicsVec3 {
    this.#world.assertCharacterController(this);
    this.#world.assertCharacterTarget(character);
    const body = character.unsafeRapierCollider().parent();
    if (!body) throw new Error("Character collider must be attached to a rigid body.");
    if (!this.#world.isPositionKinematic(body)) throw new Error("A character controller requires a kinematic-position body.");
    const target = vec(position, "character position");
    body.setTranslation(target, true);
    body.setNextKinematicTranslation(target);
    this.#world.markQueriesStale();
    this.#lastGrounded = false;
    this.#lastApplied = [0, 0, 0];
    return [target.x, target.y, target.z];
  }
  dispose(): void { this.#world.removeCharacterController(this); }
}

/** Per-wheel suspension and grip tuning. All values are solver units. */
export interface RapierWheelTuning {
  readonly suspensionStiffness?: number;
  readonly suspensionCompression?: number;
  readonly suspensionRelaxation?: number;
  readonly maxSuspensionTravel?: number;
  readonly maxSuspensionForce?: number;
  /**
   * Tyre traction. Rapier's own wording: "the larger the value, the more
   * instantaneous braking will happen" — so a LARGER number is MORE grip and a
   * smaller number lets the tyre break loose. A racing game's drift control is
   * therefore a *reduction* of this value.
   */
  readonly frictionSlip?: number;
  readonly sideFrictionStiffness?: number;
}

/** A wheel plus its initial tuning, used by `addWheel`. */
export interface RapierWheelSpec extends RapierWheelTuning {
  readonly connection: PhysicsVec3;
  readonly direction: PhysicsVec3;
  readonly axle: PhysicsVec3;
  readonly restLength: number;
  readonly radius: number;
}

/** Driver input for one wheel for one step. */
export interface RapierWheelCommand {
  readonly engineForce?: number;
  readonly brake?: number;
  /** Radians. */
  readonly steering?: number;
}

/** Measured wheel state after `update`. */
export interface RapierWheelState {
  readonly index: number;
  readonly isInContact: boolean;
  readonly contactPoint: PhysicsVec3 | null;
  readonly contactNormal: PhysicsVec3 | null;
  readonly engineForce: number;
  readonly brake: number;
  readonly steering: number;
  readonly suspensionLength: number;
  readonly rotation: number;
  readonly frictionSlip: number;
  /** Force the suspension spring is applying this step, newtons. Zero means the spring is not carrying the car. */
  readonly suspensionForce: number;
  /** Tyre impulse along the rolling direction — the drive/brake traction actually realized. */
  readonly forwardImpulse: number;
  /** Tyre impulse across the rolling direction — the lateral grip actually realized. This is the slip signal. */
  readonly sideImpulse: number;
  /** Handle of the collider this tyre is standing on, or `null` in the air. Lets a game tell road from verge without a second query. */
  readonly groundColliderHandle: number | null;
}

function readVec(target: { x: number; y: number; z: number } | null): PhysicsVec3 | null {
  if (!target) return null;
  return [target.x, target.y, target.z];
}

export class RapierVehicleControllerHandle {
  readonly #world: RapierPhysicsWorld;
  readonly #raw: Rapier.DynamicRayCastVehicleController;
  #contactRevision = -1;
  readonly #rotationOffsets: number[] = [];
  constructor(world: RapierPhysicsWorld, raw: Rapier.DynamicRayCastVehicleController) { this.#world = world; this.#raw = raw; }
  /** @internal */
  ownedBy(world: RapierPhysicsWorld): boolean { return this.#world === world; }
  /** The adapter owns this native controller. */
  get raw(): Rapier.DynamicRayCastVehicleController { this.#world.assertVehicleController(this); return this.#raw; }

  /** Chassis-local axes the solver uses to project suspension and tyre forces. */
  get upAxis(): number { return this.raw.indexUpAxis; }
  set upAxis(axis: number) { this.raw.indexUpAxis = VehicleAxis(axis); }
  /**
   * Rapier declares this as the write-only accessor `setIndexForwardAxis`, so the
   * assignment below is the call, not a typo. Reading it back is `indexForwardAxis`.
   */
  set forwardAxis(axis: number) { this.raw.setIndexForwardAxis = VehicleAxis(axis); }
  get forwardAxis(): number { return this.raw.indexForwardAxis; }

  addWheel(spec: RapierWheelSpec): this {
    const connection = vec(spec.connection, "wheel connection");
    const direction = vec(spec.direction, "wheel direction");
    const axle = vec(spec.axle, "wheel axle");
    const directionLength = Math.hypot(direction.x, direction.y, direction.z);
    const axleLength = Math.hypot(axle.x, axle.y, axle.z);
    if (directionLength === 0 || axleLength === 0) throw new RangeError("wheel direction and axle must be non-zero.");
    const crossLength = Math.hypot(direction.y * axle.z - direction.z * axle.y, direction.z * axle.x - direction.x * axle.z, direction.x * axle.y - direction.y * axle.x);
    if (crossLength <= 1e-8 * directionLength * axleLength) throw new RangeError("wheel direction and axle must not be parallel.");
    const restLength = positive(spec.restLength, "suspension rest length");
    const radius = positive(spec.radius, "wheel radius");
    validateWheelTuning(spec);
    this.raw.addWheel(
      connection,
      { x: direction.x / directionLength, y: direction.y / directionLength, z: direction.z / directionLength },
      { x: axle.x / axleLength, y: axle.y / axleLength, z: axle.z / axleLength },
      restLength, radius,
    );
    const index = this.raw.numWheels() - 1;
    if (index < 0) throw new Error("Rapier did not register the wheel.");
    this.#rotationOffsets[index] = 0;
    this.#contactRevision = -1;
    this.setWheelTuning(index, spec);
    return this;
  }

  /** Wheel geometry may only be changed through the setters after registration. */
  setWheelTuning(index: number, tuning: RapierWheelTuning): this {
    const i = WheelIndex(index, this.raw.numWheels());
    validateWheelTuning(tuning);
    if (tuning.suspensionStiffness !== undefined) this.raw.setWheelSuspensionStiffness(i, finite(tuning.suspensionStiffness, "suspensionStiffness"));
    if (tuning.suspensionCompression !== undefined) this.raw.setWheelSuspensionCompression(i, finite(tuning.suspensionCompression, "suspensionCompression"));
    if (tuning.suspensionRelaxation !== undefined) this.raw.setWheelSuspensionRelaxation(i, finite(tuning.suspensionRelaxation, "suspensionRelaxation"));
    if (tuning.maxSuspensionTravel !== undefined) this.raw.setWheelMaxSuspensionTravel(i, finite(tuning.maxSuspensionTravel, "maxSuspensionTravel"));
    if (tuning.maxSuspensionForce !== undefined) this.raw.setWheelMaxSuspensionForce(i, finite(tuning.maxSuspensionForce, "maxSuspensionForce"));
    if (tuning.frictionSlip !== undefined) this.raw.setWheelFrictionSlip(i, positive(tuning.frictionSlip, "frictionSlip"));
    if (tuning.sideFrictionStiffness !== undefined) this.raw.setWheelSideFrictionStiffness(i, finite(tuning.sideFrictionStiffness, "sideFrictionStiffness"));
    return this;
  }

  /**
   * Applies drive input. Only the fields present are written, so a caller can
   * steer without disturbing throttle and vice versa.
   *
   * Nonzero input wakes the chassis. Rapier sleeps a body that has been still, and a
   * raycast vehicle writes its chassis velocity directly rather than through the force
   * accumulator, so nothing else wakes it: a car that sat on the start line long enough
   * to fall asleep then ignores the throttle when the lights go out. That is a
   * "car will not launch after a countdown" bug with no error anywhere in it.
   */
  setWheelCommand(index: number, command: RapierWheelCommand): this {
    const i = WheelIndex(index, this.raw.numWheels());
    if (command.engineForce !== undefined) finite(command.engineForce, "engineForce");
    if (command.brake !== undefined) nonNegative(command.brake, "brake");
    if (command.steering !== undefined) finite(command.steering, "steering");
    if (command.engineForce !== undefined) this.raw.setWheelEngineForce(i, finite(command.engineForce, "engineForce"));
    if (command.brake !== undefined) this.raw.setWheelBrake(i, nonNegative(command.brake, "brake"));
    if (command.steering !== undefined) this.raw.setWheelSteering(i, finite(command.steering, "steering"));
    if ((command.engineForce ?? 0) !== 0 || (command.brake ?? 0) !== 0 || (command.steering ?? 0) !== 0) {
      this.raw.chassis().wakeUp();
    }
    return this;
  }

  /** Broadcast the same brake to every wheel — the handbrake and stop case. */
  setBrakes(brake: number): this {
    const value = nonNegative(brake, "brake");
    this.raw.chassis().wakeUp();
    for (let i = 0; i < this.raw.numWheels(); i += 1) this.raw.setWheelBrake(i, value);
    return this;
  }

  wheelState(index: number): RapierWheelState {
    const i = WheelIndex(index, this.raw.numWheels());
    const validContact = this.#contactRevision === this.#world.queryRevision;
    return {
      index: i,
      isInContact: validContact && this.raw.wheelIsInContact(i),
      contactPoint: validContact ? readVec(this.raw.wheelContactPoint(i)) : null,
      contactNormal: validContact ? readVec(this.raw.wheelContactNormal(i)) : null,
      engineForce: this.raw.wheelEngineForce(i) ?? 0,
      brake: this.raw.wheelBrake(i) ?? 0,
      steering: this.raw.wheelSteering(i) ?? 0,
      suspensionLength: (validContact ? this.raw.wheelSuspensionLength(i) : null) ?? this.raw.wheelSuspensionRestLength(i) ?? 0,
      rotation: (this.raw.wheelRotation(i) ?? 0) - (this.#rotationOffsets[i] ?? 0),
      frictionSlip: this.raw.wheelFrictionSlip(i) ?? 0,
      suspensionForce: validContact ? this.raw.wheelSuspensionForce(i) ?? 0 : 0,
      forwardImpulse: validContact ? this.raw.wheelForwardImpulse(i) ?? 0 : 0,
      sideImpulse: validContact ? this.raw.wheelSideImpulse(i) ?? 0 : 0,
      groundColliderHandle: validContact ? this.raw.wheelGroundObject(i)?.handle ?? null : null,
    };
  }

  wheelStates(): readonly RapierWheelState[] {
    return Array.from({ length: this.raw.numWheels() }, (_, i) => this.wheelState(i));
  }

  /** True only while at least one tyre is touching the ground — the grounding test. */
  isGrounded(): boolean {
    if (this.#contactRevision !== this.#world.queryRevision) { this.#world.assertVehicleController(this); return false; }
    for (let i = 0; i < this.raw.numWheels(); i += 1) if (this.raw.wheelIsInContact(i)) return true;
    return false;
  }

  groundedWheelCount(): number {
    if (this.#contactRevision !== this.#world.queryRevision) { this.#world.assertVehicleController(this); return 0; }
    let count = 0;
    for (let i = 0; i < this.raw.numWheels(); i += 1) if (this.raw.wheelIsInContact(i)) count += 1;
    return count;
  }

  currentVehicleSpeed(): number { return this.raw.currentVehicleSpeed(); }
  wheelCount(): number { return this.raw.numWheels(); }
  update(dt: number): void { const step = positive(dt, "dt"); this.#world.refreshQueries(); this.raw.updateVehicle(step); this.#contactRevision = this.#world.queryRevision; }

  /**
   * Release every drive input without touching the chassis.
   *
   * A restart that teleports the car but leaves `engineForce` set resumes throttle
   * the instant the frame resumes, and a wheel left at full lock steers the car into
   * the barrier it was respawned away from. Both are invisible in a screenshot and
   * obvious in play, so the reset has to own them.
   */
  clearWheelCommands(): this {
    for (let i = 0; i < this.raw.numWheels(); i += 1) {
      this.raw.setWheelEngineForce(i, 0);
      this.raw.setWheelBrake(i, 0);
      this.raw.setWheelSteering(i, 0);
    }
    return this;
  }

  /**
   * Take the chassis back as a full physical state, not just a rendered transform.
   *
   * Position, rotation, linear velocity, angular velocity and sleep state are all
   * written, because leaving the old velocity in place means the respawned car keeps
   * its pre-crash momentum and drives straight off the new spawn.
   */
  setChassisPose(
    position: PhysicsVec3,
    rotation?: readonly [number, number, number, number],
    linearVelocity?: PhysicsVec3,
    angularVelocity?: PhysicsVec3
  ): this {
    const targetPosition = vec(position, "chassis position");
    const targetRotation = quaternion(rotation ?? [0, 0, 0, 1], "chassis rotation");
    const targetLinearVelocity = vec(linearVelocity ?? [0, 0, 0], "chassis linear velocity");
    const targetAngularVelocity = vec(angularVelocity ?? [0, 0, 0], "chassis angular velocity");
    const body = this.raw.chassis();
    body.setTranslation(targetPosition, true);
    body.setRotation(targetRotation, true);
    body.setLinvel(targetLinearVelocity, true);
    body.setAngvel(targetAngularVelocity, true);
    body.wakeUp();
    for (let i = 0; i < this.raw.numWheels(); i += 1) this.#rotationOffsets[i] = this.raw.wheelRotation(i) ?? 0;
    this.#world.markQueriesStale();
    this.clearWheelCommands();
    return this;
  }

  /** The native body the controller drives, so a caller can read the solved pose. */
  chassisPosition(): PhysicsVec3 { const p = this.raw.chassis().translation(); return [p.x, p.y, p.z]; }
  chassisRotation(): readonly [number, number, number, number] { const q = this.raw.chassis().rotation(); return [q.x, q.y, q.z, q.w]; }
  chassisLinearVelocity(): PhysicsVec3 { const v = this.raw.chassis().linvel(); return [v.x, v.y, v.z]; }
  chassisAngularVelocity(): PhysicsVec3 { const v = this.raw.chassis().angvel(); return [v.x, v.y, v.z]; }

  dispose(): void { this.#world.removeVehicleController(this); }
}

function VehicleAxis(axis: number): number {
  if (!Number.isInteger(axis) || axis < 0 || axis > 2) throw new TypeError("Vehicle axis must be 0 (x), 1 (y) or 2 (z).");
  return axis;
}
function WheelIndex(index: number, count: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError(`Wheel index ${index} is out of range for ${count} wheel(s).`);
  return index;
}
function positive(value: number, label: string): number {
  const v = finite(value, label);
  if (v <= 0) throw new RangeError(`${label} must be greater than zero.`);
  return v;
}
function nonNegative(value: number, label: string): number {
  const v = finite(value, label);
  if (v < 0) throw new RangeError(`${label} must not be negative.`);
  return v;
}

function slopeAngle(radians: number): number {
  const value = nonNegative(radians, "slope angle");
  if (value > Math.PI / 2) throw new RangeError("slope angle must not exceed pi/2.");
  return value;
}

function quaternion(value: readonly [number, number, number, number], label: string): { x: number; y: number; z: number; w: number } {
  const x = finite(value[0], `${label}[0]`), y = finite(value[1], `${label}[1]`);
  const z = finite(value[2], `${label}[2]`), w = finite(value[3], `${label}[3]`);
  const magnitude = Math.hypot(x, y, z, w);
  if (magnitude === 0) throw new RangeError(`${label} must not be zero.`);
  return { x: x / magnitude, y: y / magnitude, z: z / magnitude, w: w / magnitude };
}

function validateWheelTuning(tuning: RapierWheelTuning): void {
  for (const key of ["suspensionStiffness", "suspensionCompression", "suspensionRelaxation", "maxSuspensionTravel", "maxSuspensionForce", "sideFrictionStiffness"] as const) {
    if (tuning[key] !== undefined) nonNegative(tuning[key], key);
  }
  if (tuning.frictionSlip !== undefined) positive(tuning.frictionSlip, "frictionSlip");
}

/**
 * Owns the optional Rapier world and its native allocations. Supported colliders
 * are box, sphere, capsule, convex hull, and fixed-body plane, triangle mesh,
 * or heightfield. Fixed, revolute/hinge, prismatic/slider, spring, spherical,
 * and motorised-hinge joints are available. Unsupported combinations throw
 * before native creation. Disposing the world invalidates all owned handles;
 * removing a body also removes its colliders, joints, and vehicle controllers.
 */
export class RapierPhysicsWorld {
  readonly #module: RapierModule;
  readonly #world: Rapier.World;
  readonly #bodies = new Map<number, RapierBodyHandle>();
  readonly #colliders = new Map<number, RapierColliderHandle>();
  readonly #joints = new Map<number, RapierJointHandle>();
  readonly #jointBodies = new Map<RapierJointHandle, readonly [RapierBodyHandle, RapierBodyHandle]>();
  readonly #characters = new Set<RapierCharacterControllerHandle>();
  readonly #vehicles = new Set<RapierVehicleControllerHandle>();
  readonly #vehicleBodies = new Map<RapierVehicleControllerHandle, RapierBodyHandle>();
  #disposed = false;
  /**
   * Whether Rapier's internal scene-query structure still needs a pass before it can
   * answer a shape cast or wheel ray.
   *
   * This is a solver property worth stating plainly: Rapier rebuilds its query
   * acceleration structure inside `World.step()`. A collider created after the last
   * step is therefore *invisible* to `computeColliderMovement` and to
   * `updateVehicle`'s wheel rays. The symptom is not an error — the character controller
   * happily reports an unobstructed move through the level floor on the very first
   * frame, and every wheel reports "in the air" on the frame the car spawns. That is
   * the "character sinks through the floor" and "car beside the road" defect class,
   * created by construction order rather than by the game.
   *
   * A zero-duration step refreshes the structure without advancing anything: measured,
   * positions and velocities are bit-identical across it. So the wrapper can be honest
   * about freshness and pay one extra narrow-phase pass, once, after a structural change.
   */
  #queriesStale = true;
  #queryRevision = 0;
  constructor(module: RapierModule, gravity: PhysicsVec3) { this.#module = module; this.#world = new module.World(vec(gravity, "gravity")); }
  get disposed(): boolean { return this.#disposed; }
  /** True until {@link refreshQueries} or a real step has run since the last structural change. */
  get queriesStale(): boolean { return this.#queriesStale; }
  /** @internal Revision changes when a structural edit or teleport invalidates wheel observations. */
  get queryRevision(): number { return this.#queryRevision; }
  /** Declare that a transform was written outside the solver, so the next query needs a refresh. */
  markQueriesStale(): void { this.#assertAlive(); this.#queriesStale = true; this.#queryRevision += 1; }
  /**
   * Make scene queries valid without advancing the simulation.
   *
   * Called by `PhysicsWorld` before a character move or a vehicle wheel update when the
   * world changed since the last pass, so a route never has to know this exists.
   */
  refreshQueries(): void {
    this.#assertAlive();
    if (!this.#queriesStale) return;
    const previousTimestep = this.#world.timestep;
    this.#world.timestep = 0;
    try { this.#world.step(); } finally { this.#world.timestep = previousTimestep; }
    this.#queriesStale = false;
  }
  createRigidBody(spec: RapierRigidBodySpec = {}): RapierBodyHandle {
    this.#assertAlive();
    if (spec.type !== undefined && !["dynamic", "fixed", "kinematic-position", "kinematic-velocity"].includes(spec.type)) {
      throw new TypeError(`Unsupported Rapier body type '${String(spec.type)}'.`);
    }
    if (spec.principalAngularInertia && spec.mass === undefined) throw new TypeError("principalAngularInertia requires mass.");
    if (spec.principalAngularInertia) spec.principalAngularInertia.forEach((value) => positive(value, "principal angular inertia"));
    this.markQueriesStale();
    const R = this.#module;
    const descriptor = spec.type === "fixed" ? R.RigidBodyDesc.fixed() : spec.type === "kinematic-position" ? R.RigidBodyDesc.kinematicPositionBased() : spec.type === "kinematic-velocity" ? R.RigidBodyDesc.kinematicVelocityBased() : R.RigidBodyDesc.dynamic();
    if (spec.position) { const position = vec(spec.position, "position"); descriptor.setTranslation(position.x, position.y, position.z); }
    if (spec.rotation) descriptor.setRotation(quaternion(spec.rotation, "rotation"));
    if (spec.linearVelocity) { const velocity = vec(spec.linearVelocity, "linearVelocity"); descriptor.setLinvel(velocity.x, velocity.y, velocity.z); }
    if (spec.angularVelocity) descriptor.setAngvel(vec(spec.angularVelocity, "angularVelocity"));
    if (spec.linearDamping !== undefined) descriptor.setLinearDamping(nonNegative(spec.linearDamping, "linearDamping"));
    if (spec.angularDamping !== undefined) descriptor.setAngularDamping(nonNegative(spec.angularDamping, "angularDamping"));
    if (spec.ccd !== undefined) descriptor.setCcdEnabled(spec.ccd);
    if (spec.canSleep !== undefined) descriptor.setCanSleep(spec.canSleep);
    if (spec.mass !== undefined && spec.principalAngularInertia) {
      descriptor.setAdditionalMassProperties(
        nonNegative(spec.mass, "mass"),
        { x: 0, y: 0, z: 0 },
        vec(spec.principalAngularInertia, "principal angular inertia"),
        { x: 0, y: 0, z: 0, w: 1 }
      );
    } else if (spec.mass !== undefined) {
      descriptor.setAdditionalMass(nonNegative(spec.mass, "mass"));
    }
    const body = this.#world.createRigidBody(descriptor);
    const handle = new RapierBodyHandle(this, body); this.#bodies.set(body.handle, handle); return handle;
  }
  createCollider(body: RapierBodyHandle, spec: RapierColliderSpec): RapierColliderHandle {
    this.assertBodyHandle(body);
    validateColliderShape(spec.shape, body.unsafeRapierBody().isFixed());
    this.markQueriesStale();
    const R = this.#module;
    const shape = spec.shape;
    let collider: Rapier.ColliderDesc;
    if (shape.kind === "box") collider = R.ColliderDesc.cuboid(...shape.halfExtents);
    else if (shape.kind === "sphere") collider = R.ColliderDesc.ball(shape.radius);
    else if (shape.kind === "capsule") collider = R.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    else if (shape.kind === "plane") {
      const magnitude = Math.hypot(...shape.normal);
      const normal: PhysicsVec3 = [shape.normal[0] / magnitude, shape.normal[1] / magnitude, shape.normal[2] / magnitude];
      collider = new R.ColliderDesc(new R.HalfSpace(vec(normal, "plane normal")));
      collider.setTranslation(normal[0] * shape.constant, normal[1] * shape.constant, normal[2] * shape.constant);
    } else if (shape.kind === "mesh") {
      collider = R.ColliderDesc.trimesh(flattenVertices(shape.vertices), new Uint32Array(shape.indices));
    } else if (shape.kind === "convex-hull") {
      const hull = R.ColliderDesc.convexHull(flattenVertices(shape.vertices));
      if (!hull) throw new Error("Rapier could not construct the requested convex hull.");
      collider = hull;
    } else {
      collider = R.ColliderDesc.heightfield(
        shape.rows - 1,
        shape.columns - 1,
        toRapierHeightfieldHeights(shape),
        { x: shape.cellSize * (shape.columns - 1), y: 1, z: shape.cellSize * (shape.rows - 1) }
      );
    }
    if (spec.density !== undefined) collider.setDensity(nonNegative(spec.density, "density"));
    if (spec.friction !== undefined) collider.setFriction(nonNegative(spec.friction, "friction"));
    if (spec.restitution !== undefined) collider.setRestitution(nonNegative(spec.restitution, "restitution"));
    if (spec.sensor !== undefined) collider.setSensor(spec.sensor);
    // Sensor pairs must also detect fixed/kinematic and kinematic/kinematic overlaps.
    // Rapier's default enables only pairs containing a dynamic body.
    if (spec.sensor) collider.setActiveCollisionTypes(R.ActiveCollisionTypes.ALL);
    if (spec.collisionGroups !== undefined) {
      if (!Number.isInteger(spec.collisionGroups) || spec.collisionGroups < 0 || spec.collisionGroups > 0xffffffff) throw new RangeError("collisionGroups must be an unsigned 32-bit integer.");
      collider.setCollisionGroups(spec.collisionGroups >>> 0);
    }
    collider.setFrictionCombineRule(R.CoefficientCombineRule.Multiply);
    collider.setRestitutionCombineRule(R.CoefficientCombineRule.Max);
    const rawCollider = this.#world.createCollider(collider, body.unsafeRapierBody());
    // Rapier applies descriptor-level additional mass at the next mass-property
    // recomputation. Do that before the first step so initial velocity, force, and
    // inertia never run for one frame against a zero-mass dynamic body.
    try { body.unsafeRapierBody().recomputeMassPropertiesFromColliders(); }
    catch (error) { this.#world.removeCollider(rawCollider, true); throw error; }
    const handle = new RapierColliderHandle(this, rawCollider, shape); this.#colliders.set(rawCollider.handle, handle); return handle;
  }
  createBody(spec: RapierBodySpec): RapierBodyHandle {
    const body = this.createRigidBody(spec);
    try { this.createCollider(body, spec); } catch (error) { this.removeBody(body); throw error; }
    return body;
  }
  removeBody(handle: RapierBodyHandle): void {
    if (!handle.ownedBy(this)) throw new Error("Rapier body belongs to a different world.");
    if (this.#disposed || this.#bodies.get(handle.id) !== handle) return;
    this.markQueriesStale();
    const raw = handle.unsafeRapierBody();
    for (const [vehicle, chassis] of this.#vehicleBodies) if (chassis === handle) this.removeVehicleController(vehicle);
    for (const [joint, bodies] of this.#jointBodies) if (bodies.includes(handle)) this.removeJoint(joint);
    for (let index = 0; index < raw.numColliders(); index += 1) this.#colliders.delete(raw.collider(index).handle);
    this.#world.removeRigidBody(raw); this.#bodies.delete(raw.handle);
  }
  removeCollider(handle: RapierColliderHandle): void {
    if (!handle.ownedBy(this)) throw new Error("Rapier collider belongs to a different world.");
    if (this.#disposed || this.#colliders.get(handle.id) !== handle) return;
    this.markQueriesStale(); const raw = handle.unsafeRapierCollider(); this.#world.removeCollider(raw, true); this.#colliders.delete(raw.handle);
  }
  createJoint(spec: RapierJointSpec, a: RapierBodyHandle, b: RapierBodyHandle): RapierJointHandle {
    this.assertBodyHandle(a);
    this.assertBodyHandle(b);
    if (a === b) throw new Error("A joint requires two different bodies.");
    validateJointSpec(spec);
    const R = this.#module;
    const anchorA = vec(spec.localAnchorA, "joint anchor A");
    const anchorB = vec(spec.localAnchorB, "joint anchor B");
    const axisValue = vec(spec.axis, "joint axis");
    const axisLength = Math.hypot(axisValue.x, axisValue.y, axisValue.z);
    const axis = axisLength > 0 ? { x: axisValue.x / axisLength, y: axisValue.y / axisLength, z: axisValue.z / axisLength } : axisValue;
    let data: Rapier.JointData;
    if (spec.type === "fixed") data = R.JointData.fixed(anchorA, quaternion(spec.localRotationA ?? [0, 0, 0, 1], "joint localRotationA"), anchorB, quaternion(spec.localRotationB ?? [0, 0, 0, 1], "joint localRotationB"));
    else if (spec.type === "slider" || spec.type === "prismatic") data = R.JointData.prismatic(anchorA, anchorB, axis);
    else if (spec.type === "spring") {
      // Aura exposes normalized game-facing stiffness/damping; Rapier expects physical
      // coefficients. The adapter owns this unit conversion so public descriptors remain
      // backend-neutral.
      data = R.JointData.spring(spec.restLength, spec.stiffness * 100, spec.damping * 10, anchorA, anchorB);
    }
    else if (spec.type === "ball-socket") data = R.JointData.spherical(anchorA, anchorB);
    else data = R.JointData.revolute(anchorA, anchorB, axis);
    const raw = this.#world.createImpulseJoint(data, a.unsafeRapierBody(), b.unsafeRapierBody(), true);
    const handle = new RapierJointHandle(this, raw, R);
    this.#joints.set(raw.handle, handle);
    this.#jointBodies.set(handle, [a, b]);
    try {
      if (spec.relativeFrameBFromA) {
        const relative = quaternion(spec.relativeFrameBFromA, "joint relativeFrameBFromA");
        const frame = raw.frameX1();
        raw.setFrameX2({
          x: relative.w * frame.x + relative.x * frame.w + relative.y * frame.z - relative.z * frame.y,
          y: relative.w * frame.y - relative.x * frame.z + relative.y * frame.w + relative.z * frame.x,
          z: relative.w * frame.z + relative.x * frame.y - relative.y * frame.x + relative.z * frame.w,
          w: relative.w * frame.w - relative.x * frame.x - relative.y * frame.y - relative.z * frame.z
        });
      }
      if (spec.limits) {
        const unit = raw as Rapier.UnitImpulseJoint;
        if (typeof unit.setLimits !== "function") throw new Error(`Rapier ${spec.type} joint limits are unavailable in this backend.`);
        unit.setLimits(spec.limits[0], spec.limits[1]);
      }
      if (spec.type === "motorised-hinge") handle.configureMotor(spec.motorSpeed, spec.maxMotorTorque);
    } catch (error) { this.removeJoint(handle); throw error; }
    return handle;
  }
  removeJoint(handle: RapierJointHandle): void {
    if (!handle.ownedBy(this)) throw new Error("Rapier joint belongs to a different world.");
    if (this.#disposed || this.#joints.get(handle.id) !== handle) return;
    const raw = handle.unsafeRapierJoint(); this.#world.removeImpulseJoint(raw, true); this.#joints.delete(raw.handle); this.#jointBodies.delete(handle);
  }
  createFixedJoint(a: RapierBodyHandle, b: RapierBodyHandle): Rapier.ImpulseJoint {
    this.assertBodyHandle(a);
    this.assertBodyHandle(b);
    if (a === b) throw new Error("A joint requires two different bodies.");
    return this.#world.createImpulseJoint(this.#module.JointData.fixed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), a.unsafeRapierBody(), b.unsafeRapierBody(), true);
  }
  createCharacterController(offset = 0.01): RapierCharacterControllerHandle { this.#assertAlive(); const value = new RapierCharacterControllerHandle(this, this.#world.createCharacterController(positive(offset, "character offset"))); this.#characters.add(value); return value; }
  removeCharacterController(value: RapierCharacterControllerHandle): void {
    if (!value.ownedBy(this)) throw new Error("Rapier character controller belongs to a different world.");
    if (this.#disposed || !this.#characters.has(value)) return;
    this.#world.removeCharacterController(value.raw); this.#characters.delete(value);
  }
  createVehicleController(chassis: RapierBodyHandle): RapierVehicleControllerHandle {
    this.assertBodyHandle(chassis);
    if (!chassis.unsafeRapierBody().isDynamic()) throw new Error("A Rapier vehicle requires a dynamic chassis.");
    const value = new RapierVehicleControllerHandle(this, this.#world.createVehicleController(chassis.unsafeRapierBody())); this.#vehicles.add(value); this.#vehicleBodies.set(value, chassis); return value;
  }
  removeVehicleController(value: RapierVehicleControllerHandle): void {
    if (!value.ownedBy(this)) throw new Error("Rapier vehicle controller belongs to a different world.");
    if (this.#disposed || !this.#vehicles.has(value)) return;
    this.#world.removeVehicleController(value.raw); this.#vehicles.delete(value); this.#vehicleBodies.delete(value);
  }
  /** @internal Query one collider, including its current body transform. */
  colliderIntersectsShape(handle: RapierColliderHandle, center: PhysicsVec3, shape: Extract<RapierShapeSpec, { kind: "sphere" | "box" }>): boolean {
    this.assertColliderHandle(handle);
    const position = vec(center, "overlap center");
    const queryShape = shape.kind === "sphere"
      ? new this.#module.Ball(positive(shape.radius, "overlap sphere radius"))
      : new this.#module.Cuboid(
        positive(shape.halfExtents[0], "overlap box half extent x"),
        positive(shape.halfExtents[1], "overlap box half extent y"),
        positive(shape.halfExtents[2], "overlap box half extent z")
      );
    this.refreshQueries();
    const collider = handle.unsafeRapierCollider();
    const rotation = { x: 0, y: 0, z: 0, w: 1 };
    if (collider.intersectsShape(queryShape, position, rotation)) return true;
    if (handle.surface?.kind !== "heightfield") return false;
    // Rapier's intersection dispatcher can miss a box overlapping a
    // heightfield. Its contact query uses the real transformed geometry; zero
    // prediction admits overlap and touching but does not add a query margin.
    const contact = collider.contactShape(queryShape, position, rotation, 0);
    return contact !== null && contact.distance <= 0;
  }
  /** @internal Query one collider, including its current body transform. */
  castColliderRay(handle: RapierColliderHandle, origin: PhysicsVec3, direction: PhysicsVec3, maxDistance: number, includeBackfaces: boolean): RapierColliderQueryHit | undefined {
    this.assertColliderHandle(handle);
    const query = normalizeQuery(origin, direction, maxDistance);
    this.refreshQueries();
    const collider = handle.unsafeRapierCollider();
    const ray = new this.#module.Ray(query.origin, query.direction);
    let best: Rapier.RayIntersection | null = null;
    if (handle.surface && !includeBackfaces) {
      const pose = collider.translation(), rotation = collider.rotation();
      for (const [a, b, c] of surfaceTriangles(handle.surface)) {
        if (!frontFacing(a, b, c, rotation, query.direction)) continue;
        const triangle = new this.#module.Triangle(vec(a, "triangle a"), vec(b, "triangle b"), vec(c, "triangle c"));
        const hit = triangle.castRayAndGetNormal(ray, pose, rotation, best?.timeOfImpact ?? query.distance, true);
        if (hit && (!best || hit.timeOfImpact < best.timeOfImpact)) best = hit;
      }
    } else {
      best = collider.castRayAndGetNormal(ray, query.distance, true);
    }
    if (!best) return undefined;
    const distance = best.timeOfImpact;
    return { distance, point: pointAt(query.origin, query.direction, distance), normal: queryNormal(best.normal, query.direction) };
  }
  /** @internal Sweep one sphere, retaining contact on rounded and triangular geometry. */
  castColliderSphere(handle: RapierColliderHandle, origin: PhysicsVec3, radius: number, direction: PhysicsVec3, maxDistance: number, includeBackfaces: boolean): RapierColliderSphereQueryHit | undefined {
    this.assertColliderHandle(handle);
    const sphereRadius = positive(radius, "sphere cast radius");
    const query = normalizeQuery(origin, direction, maxDistance);
    this.refreshQueries();
    const collider = handle.unsafeRapierCollider();
    const rotation = collider.rotation();
    const sphere = new this.#module.Ball(sphereRadius);
    const stationary = { x: 0, y: 0, z: 0 };
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    let best: Rapier.ShapeCastHit | null = null;
    if (handle.surface && !includeBackfaces) {
      const pose = collider.translation();
      for (const [a, b, c] of surfaceTriangles(handle.surface)) {
        if (!frontFacing(a, b, c, rotation, query.direction)) continue;
        const triangle = new this.#module.Triangle(vec(a, "triangle a"), vec(b, "triangle b"), vec(c, "triangle c"));
        const hit = triangle.castShape(pose, rotation, stationary, sphere, query.origin, identity, query.direction, 0, best?.time_of_impact ?? query.distance, true);
        if (hit && (!best || hit.time_of_impact < best.time_of_impact)) best = hit;
      }
    } else {
      best = collider.castShape(stationary, sphere, query.origin, identity, query.direction, 0, query.distance, true);
    }
    if (!best) return undefined;
    const distance = best.time_of_impact;
    const castCenter = pointAt(query.origin, query.direction, distance);
    // A sweep that starts overlapping has no separating direction (Rapier reports an arbitrary
    // penetration axis); like the reference query path (`Raycast.ts`), it reports `-direction`.
    const normal = distance === 0 ? overlapNormal(query.direction) : queryNormal(rotateVector(best.normal1, rotation), query.direction);
    return { distance, castCenter, point: [castCenter[0] - normal[0] * sphereRadius, castCenter[1] - normal[1] * sphereRadius, castCenter[2] - normal[2] * sphereRadius], normal };
  }
  raycast(origin: PhysicsVec3, direction: PhysicsVec3, maxDistance = Number.POSITIVE_INFINITY): RapierRayHit | undefined {
    this.#assertAlive();
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length === 0) throw new RangeError("ray direction must be finite and non-zero.");
    if (Number.isNaN(maxDistance) || maxDistance < 0) throw new RangeError("ray maxDistance must be non-negative.");
    this.refreshQueries();
    const ray = new this.#module.Ray(vec(origin, "origin"), { x: direction[0] / length, y: direction[1] / length, z: direction[2] / length });
    const hit = this.#world.castRay(ray, maxDistance, true);
    if (!hit) return undefined;
    const collider = this.#world.getCollider(hit.collider.handle); const rawBody = collider?.parent();
    if (!rawBody) return undefined;
    const body = this.#bodies.get(rawBody.handle); if (!body) return undefined;
    const point = ray.pointAt(hit.timeOfImpact);
    return { body, colliderHandle: hit.collider.handle, timeOfImpact: hit.timeOfImpact, point: [point.x, point.y, point.z] };
  }
  step(dt = 1 / 60): void { this.#assertAlive(); this.#world.timestep = positive(dt, "dt"); this.#world.step(); this.#queriesStale = false; }
  setGravity(gravity: PhysicsVec3): void { this.#assertAlive(); this.#world.gravity = vec(gravity, "gravity"); this.#queriesStale = true; }
  /** Disposed worlds report no bodies, allowing owners to verify teardown. */
  bodies(): readonly RapierBodyHandle[] { return [...this.#bodies.values()]; }
  /** Stable typed escape hatch. The adapter owns and frees the returned world. */
  unsafeRapierWorld(): Rapier.World { this.#assertAlive(); return this.#world; }
  dispose(): void {
    if (this.#disposed) return;
    for (const value of [...this.#vehicles]) this.removeVehicleController(value);
    for (const value of [...this.#characters]) this.removeCharacterController(value);
    this.#joints.clear(); this.#jointBodies.clear(); this.#colliders.clear(); this.#bodies.clear(); this.#world.free(); this.#disposed = true;
  }
  /** @internal */
  assertBodyHandle(handle: RapierBodyHandle): void {
    this.#assertAlive();
    if (!handle.ownedBy(this)) throw new Error("Rapier body belongs to a different world.");
    if (this.#bodies.get(handle.id) !== handle) throw new Error("Rapier body has been removed.");
  }
  /** @internal */
  assertColliderHandle(handle: RapierColliderHandle): void {
    this.#assertAlive();
    if (!handle.ownedBy(this)) throw new Error("Rapier collider belongs to a different world.");
    if (this.#colliders.get(handle.id) !== handle) throw new Error("Rapier collider has been removed.");
  }
  /** @internal */
  assertJointHandle(handle: RapierJointHandle): void {
    this.#assertAlive();
    if (!handle.ownedBy(this)) throw new Error("Rapier joint belongs to a different world.");
    if (this.#joints.get(handle.id) !== handle) throw new Error("Rapier joint has been removed.");
  }
  /** @internal */
  assertCharacterController(handle: RapierCharacterControllerHandle): void {
    this.#assertAlive();
    if (!handle.ownedBy(this)) throw new Error("Rapier character controller belongs to a different world.");
    if (!this.#characters.has(handle)) throw new Error("Rapier character controller has been disposed.");
  }
  /** @internal */
  assertVehicleController(handle: RapierVehicleControllerHandle): void {
    this.#assertAlive();
    if (!handle.ownedBy(this)) throw new Error("Rapier vehicle controller belongs to a different world.");
    if (!this.#vehicles.has(handle)) throw new Error("Rapier vehicle controller has been disposed.");
  }
  /** @internal */
  assertCharacterTarget(handle: RapierBodyHandle | RapierColliderHandle): void {
    if (handle instanceof RapierBodyHandle) this.assertBodyHandle(handle);
    else this.assertColliderHandle(handle);
  }
  /** @internal */
  isPositionKinematic(body: Rapier.RigidBody): boolean { return body.bodyType() === this.#module.RigidBodyType.KinematicPositionBased; }
  #assertAlive(): void { if (this.#disposed) throw new Error("RapierPhysicsWorld is disposed."); }
}

type NativeVector = { x: number; y: number; z: number };
type NativeRotation = NativeVector & { w: number };

function normalizeQuery(origin: PhysicsVec3, direction: PhysicsVec3, maxDistance: number): { origin: NativeVector; direction: NativeVector; distance: number } {
  const start = vec(origin, "query origin");
  const velocity = vec(direction, "query direction");
  const length = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (length === 0) throw new RangeError("query direction must be non-zero.");
  if (Number.isNaN(maxDistance) || maxDistance < 0) throw new RangeError("query maxDistance must be non-negative.");
  return { origin: start, direction: { x: velocity.x / length, y: velocity.y / length, z: velocity.z / length }, distance: maxDistance };
}

function pointAt(origin: NativeVector, direction: NativeVector, distance: number): PhysicsVec3 {
  return [origin.x + direction.x * distance, origin.y + direction.y * distance, origin.z + direction.z * distance];
}

function queryNormal(value: NativeVector, direction: NativeVector): PhysicsVec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length < 1e-8) return overlapNormal(direction);
  return [value.x / length, value.y / length, value.z / length];
}

/** `-direction` without negative zeros (`0 - 0` is `+0`, unary minus is `-0`). */
function overlapNormal(direction: NativeVector): PhysicsVec3 {
  return [0 - direction.x, 0 - direction.y, 0 - direction.z];
}

function rotateVector(value: NativeVector, q: NativeRotation): NativeVector {
  const tx = 2 * (q.y * value.z - q.z * value.y);
  const ty = 2 * (q.z * value.x - q.x * value.z);
  const tz = 2 * (q.x * value.y - q.y * value.x);
  return { x: value.x + q.w * tx + q.y * tz - q.z * ty, y: value.y + q.w * ty + q.z * tx - q.x * tz, z: value.z + q.w * tz + q.x * ty - q.y * tx };
}

function frontFacing(a: PhysicsVec3, b: PhysicsVec3, c: PhysicsVec3, rotation: NativeRotation, direction: NativeVector): boolean {
  const ab = { x: b[0] - a[0], y: b[1] - a[1], z: b[2] - a[2] };
  const ac = { x: c[0] - a[0], y: c[1] - a[1], z: c[2] - a[2] };
  const normal = rotateVector({ x: ab.y * ac.z - ab.z * ac.y, y: ab.z * ac.x - ab.x * ac.z, z: ab.x * ac.y - ab.y * ac.x }, rotation);
  return normal.x * direction.x + normal.y * direction.y + normal.z * direction.z < 0;
}

function* surfaceTriangles(surface: Extract<RapierShapeSpec, { kind: "mesh" | "heightfield" }>): Generator<readonly [PhysicsVec3, PhysicsVec3, PhysicsVec3]> {
  if (surface.kind === "mesh") {
    for (let i = 0; i < surface.indices.length; i += 3) {
      yield [surface.vertices[surface.indices[i]!]!, surface.vertices[surface.indices[i + 1]!]!, surface.vertices[surface.indices[i + 2]!]!];
    }
    return;
  }
  const xOffset = (surface.columns - 1) * surface.cellSize / 2;
  const zOffset = (surface.rows - 1) * surface.cellSize / 2;
  const vertex = (row: number, column: number): PhysicsVec3 => [column * surface.cellSize - xOffset, surface.heights[row * surface.columns + column]!, row * surface.cellSize - zOffset];
  for (let row = 0; row < surface.rows - 1; row += 1) {
    for (let column = 0; column < surface.columns - 1; column += 1) {
      const topLeft = vertex(row, column), bottomLeft = vertex(row + 1, column);
      const topRight = vertex(row, column + 1), bottomRight = vertex(row + 1, column + 1);
      yield [topLeft, bottomLeft, topRight];
      yield [topRight, bottomLeft, bottomRight];
    }
  }
}

/** Supported shapes are explicit: planes, triangle meshes and terrain are fixed-body geometry. */
function validateColliderShape(shape: RapierShapeSpec, fixedBody: boolean): void {
  if (!shape || typeof shape !== "object") throw new TypeError("A Rapier collider requires a shape.");
  switch (shape.kind) {
    case "box":
      vec(shape.halfExtents, "box halfExtents");
      shape.halfExtents.forEach((value) => positive(value, "box halfExtents"));
      return;
    case "sphere":
      positive(shape.radius, "sphere radius");
      return;
    case "capsule":
      nonNegative(shape.halfHeight, "capsule halfHeight");
      positive(shape.radius, "capsule radius");
      return;
    case "plane":
      if (!fixedBody) throw new Error("Rapier plane colliders require a fixed body.");
      vec(shape.normal, "plane normal");
      if (Math.hypot(...shape.normal) === 0) throw new RangeError("plane normal must be non-zero.");
      finite(shape.constant, "plane constant");
      return;
    case "mesh":
      if (!fixedBody) throw new Error("Rapier mesh colliders require a fixed body.");
      if (!Array.isArray(shape.vertices) || shape.vertices.length < 3) throw new RangeError("mesh requires at least three vertices.");
      flattenVertices(shape.vertices);
      if (!Array.isArray(shape.indices) || shape.indices.length === 0 || shape.indices.length % 3 !== 0) throw new RangeError("mesh indices must contain complete triangles.");
      for (const index of shape.indices) {
        if (!Number.isInteger(index) || index < 0 || index >= shape.vertices.length) throw new RangeError("mesh index is outside the vertex array.");
      }
      return;
    case "convex-hull":
      if (!Array.isArray(shape.vertices) || shape.vertices.length < 4) throw new RangeError("convex-hull requires at least four vertices.");
      flattenVertices(shape.vertices);
      return;
    case "heightfield":
      if (!fixedBody) throw new Error("Rapier heightfield colliders require a fixed body.");
      if (!Number.isInteger(shape.rows) || shape.rows < 2 || !Number.isInteger(shape.columns) || shape.columns < 2) throw new RangeError("heightfield rows and columns must be integers of at least two.");
      if (!Array.isArray(shape.heights) || shape.heights.length !== shape.rows * shape.columns) throw new RangeError("heightfield requires rows*columns samples.");
      shape.heights.forEach((height) => finite(height, "heightfield sample"));
      positive(shape.cellSize, "heightfield cellSize");
      return;
    default:
      throw new TypeError(`Unsupported Rapier collider shape '${String((shape as { kind?: unknown }).kind)}'.`);
  }
}

function validateJointSpec(spec: RapierJointSpec): void {
  const types = ["fixed", "hinge", "revolute", "slider", "prismatic", "spring", "ball-socket", "motorised-hinge"];
  if (!types.includes(spec.type)) throw new TypeError(`Unsupported Rapier joint type '${String(spec.type)}'.`);
  vec(spec.localAnchorA, "joint anchor A");
  vec(spec.localAnchorB, "joint anchor B");
  vec(spec.axis, "joint axis");
  if (spec.localRotationA !== undefined || spec.localRotationB !== undefined) {
    if (spec.type !== "fixed") throw new Error(`Rapier ${spec.type} joints do not support fixed-joint local frames.`);
    if (spec.localRotationA) quaternion(spec.localRotationA, "joint localRotationA");
    if (spec.localRotationB) quaternion(spec.localRotationB, "joint localRotationB");
  }
  const unitJoint = spec.type === "hinge" || spec.type === "revolute" || spec.type === "motorised-hinge" || spec.type === "slider" || spec.type === "prismatic";
  if (spec.relativeFrameBFromA) {
    if (!unitJoint) throw new Error(`Rapier ${spec.type} joints do not support relative axis frames.`);
    quaternion(spec.relativeFrameBFromA, "joint relativeFrameBFromA");
  }
  if (unitJoint && Math.hypot(...spec.axis) === 0) throw new RangeError("joint axis must be non-zero.");
  nonNegative(spec.restLength, "joint restLength");
  nonNegative(spec.stiffness, "joint stiffness");
  nonNegative(spec.damping, "joint damping");
  finite(spec.motorSpeed, "joint motorSpeed");
  nonNegative(spec.maxMotorTorque, "joint maxMotorTorque");
  if (spec.limits) {
    if (!unitJoint) throw new Error(`Rapier ${spec.type} joints do not support limits.`);
    const lower = finite(spec.limits[0], "joint lower limit");
    const upper = finite(spec.limits[1], "joint upper limit");
    if (lower > upper) throw new RangeError("joint limits must be ordered [lower, upper].");
  }
}

function flattenVertices(vertices: readonly PhysicsVec3[]): Float32Array {
  const flattened = new Float32Array(vertices.length * 3);
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index]!;
    flattened[index * 3] = finite(vertex[0], `vertex ${index}[0]`);
    flattened[index * 3 + 1] = finite(vertex[1], `vertex ${index}[1]`);
    flattened[index * 3 + 2] = finite(vertex[2], `vertex ${index}[2]`);
  }
  return flattened;
}

export async function createRapierPhysics(options: RapierPhysicsOptions = {}): Promise<RapierPhysicsWorld> {
  const module = await (options.moduleLoader ?? (() => import("@dimforge/rapier3d-compat")))()
    .catch((error: unknown) => {
      if ((error as { code?: string })?.code === "ERR_MODULE_NOT_FOUND") throw new PhysicsBackendMissingError(undefined, { cause: error });
      throw error;
    });
  // The official compat build exposes explicit async WASM initialization and
  // avoids forcing each consuming bundler to configure a raw `.wasm` loader.
  const explicitInit = (module as unknown as { init?: (input?: unknown) => Promise<unknown> }).init;
  if (explicitInit) await explicitInit({});
  return new RapierPhysicsWorld(module, options.gravity ?? [0, -9.81, 0]);
}

/**
 * Synchronous construction after this ESM module's one-time top-level WASM initialization.
 * This preserves the established `new PhysicsWorld()` ergonomics without hiding a second
 * JavaScript solver behind the synchronous API.
 */
export function createRapierPhysicsSync(options: Omit<RapierPhysicsOptions, "moduleLoader"> = {}): RapierPhysicsWorld {
  return new RapierPhysicsWorld(requireRapierModule(), options.gravity ?? [0, -9.81, 0]);
}

/**
 * PRD-05 §6.3.7 — consume a generated `<id>.<hash8>.collision.glb` sidecar.
 *
 * The sidecar (written by `tools/asset-optimize` step `colliders`) carries one
 * node per mesh-bearing scene node; each mesh's `extras.aura3dCollider` names
 * the shape: `trimesh` / `convex-hull` geometry verbatim, or analytic `box` /
 * `capsule` parameters baked from bounds. Node-local TRS is baked into the
 * produced shape so colliders sit where the source mesh sits.
 *
 * `source` is a fetchable URL or the sidecar bytes. `transform` places the
 * fixed body all colliders attach to — it is the model's world transform
 * (Q-15-2 wires `model(asset, { physics, collider: "auto" })` to call this).
 * `options.collider` passes density/friction/etc. through to every collider.
 */
export interface ColliderSidecarTransform {
  readonly position?: PhysicsVec3;
  readonly rotation?: readonly [number, number, number, number];
}

export interface ColliderSidecarOptions extends ColliderSidecarTransform {
  readonly body?: RapierBodyHandle;
  readonly collider?: Readonly<Partial<Omit<RapierColliderSpec, "shape">>>;
}

export interface ColliderSidecarResult {
  readonly body: RapierBodyHandle;
  readonly colliders: readonly RapierColliderHandle[];
  /** Per-collider `extras.aura3dCollider.sourceNode` in creation order. */
  readonly sourceNodes: readonly string[];
}

interface Aura3dColliderExtra {
  readonly shape?: "box" | "capsule" | "convex" | "trimesh";
  readonly sourceNode?: string;
  /** Column-major 4x4 world transform of the source node (incl. ancestors). */
  readonly nodeWorldMatrix?: readonly number[];
  readonly halfExtents?: readonly [number, number, number];
  readonly radius?: number;
  readonly halfHeight?: number;
  readonly center?: readonly [number, number, number];
}

function transformPoint(m: readonly number[], p: readonly [number, number, number]): PhysicsVec3 {
  const [x, y, z] = p;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
  ];
}

/** Largest column length — uniform-scale estimate for baking node scale into collider params. */
function transformScale(m: readonly number[]): number {
  let max = 0;
  for (let c = 0; c < 3; c++) {
    const len = Math.hypot(m[c * 4]!, m[c * 4 + 1]!, m[c * 4 + 2]!);
    if (len > max) max = len;
  }
  return max || 1;
}

export async function createCollidersFromSidecar(
  world: RapierPhysicsWorld,
  source: string | Uint8Array,
  options: ColliderSidecarOptions = {}
): Promise<ColliderSidecarResult> {
  let bytes: Uint8Array;
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Collider sidecar request failed with HTTP ${response.status}.`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    bytes = source;
  }
  const [{ WebIO }, { ALL_EXTENSIONS }, { MeshoptDecoder }] = await Promise.all([
    import("@gltf-transform/core"),
    import("@gltf-transform/extensions"),
    import("meshoptimizer")
  ]);
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  await MeshoptDecoder.ready;
  const doc = await io.readBinary(bytes);

  const body = options.body ?? world.createRigidBody({
    type: "fixed",
    position: options.position,
    rotation: options.rotation
  });
  world.assertBodyHandle(body);
  const colliders: RapierColliderHandle[] = [];
  const sourceNodes: string[] = [];
  try {
    for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const extras = (mesh.getExtras() as { aura3dCollider?: Aura3dColliderExtra }).aura3dCollider;
    if (!extras?.shape) continue;
    const m = extras.nodeWorldMatrix && extras.nodeWorldMatrix.length === 16 ? extras.nodeWorldMatrix : node.getWorldMatrix();
    const scale = transformScale(m);
    let shape: RapierShapeSpec;
    if (extras.shape === "box") {
      if (!extras.halfExtents || !extras.center) throw new Error(`collider sidecar node ${node.getName()}: box shape missing halfExtents/center`);
      const center = transformPoint(m, [extras.center[0]!, extras.center[1]!, extras.center[2]!]);
      // Rapier cuboids are axis-aligned in collider space; rotation-baked boxes
      // become the AABB of the rotated corners (documented approximation).
      const h = extras.halfExtents;
      const corners: PhysicsVec3[] = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        corners.push(transformPoint(m, [extras.center[0]! + sx * h[0]!, extras.center[1]! + sy * h[1]!, extras.center[2]! + sz * h[2]!]));
      }
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const c of corners) for (let i = 0; i < 3; i++) {
        if (c[i]! < min[i]!) min[i] = c[i]!;
        if (c[i]! > max[i]!) max[i] = c[i]!;
      }
      const half: PhysicsVec3 = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
      if (half.every((v, i) => Math.abs(v - (h[i]! * scale)) < 1e-4) && center.every((v) => Math.abs(v) < 1e-6)) {
        shape = { kind: "box", halfExtents: [h[0]! * scale, h[1]! * scale, h[2]! * scale] };
      } else {
        // Off-center or rotated: encode the AABB as a trimesh-free box by
        // wrapping it in a convex hull of the 8 transformed corners.
        shape = { kind: "convex-hull", vertices: corners };
      }
    } else if (extras.shape === "capsule") {
      if (extras.radius === undefined || extras.halfHeight === undefined || !extras.center) {
        throw new Error(`collider sidecar node ${node.getName()}: capsule shape missing radius/halfHeight/center`);
      }
      const center = transformPoint(m, [extras.center[0]!, extras.center[1]!, extras.center[2]!]);
      if (center.some((v) => Math.abs(v) > 1e-6)) {
        // Capsules are origin-centred in collider space; an off-centre capsule
        // is approximated by a convex hull over both cap spheres.
        const vertices: PhysicsVec3[] = [];
        for (const sign of [-1, 1]) {
          for (let a = 0; a < 8; a++) {
            const t = (a / 8) * Math.PI * 2;
            const c = transformPoint(m, [
              extras.center[0]! + Math.cos(t) * extras.radius,
              extras.center[1]! + sign * extras.halfHeight,
              extras.center[2]! + Math.sin(t) * extras.radius
            ]);
            vertices.push(c);
          }
        }
        shape = { kind: "convex-hull", vertices };
      } else {
        shape = { kind: "capsule", halfHeight: extras.halfHeight * scale, radius: extras.radius * scale };
      }
    } else {
      const vertices: PhysicsVec3[] = [];
      const indices: number[] = [];
      const el: [number, number, number] = [0, 0, 0];
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute("POSITION");
        if (!pos) continue;
        const idx = prim.getIndices()?.getArray();
        const base = vertices.length;
        // getElement dequantizes — the sidecar is meshopt-compressed and its
        // POSITION accessors are KHR_mesh_quantization integers.
        for (let i = 0; i < pos.getCount(); i += 1) {
          pos.getElement(i, el);
          vertices.push(transformPoint(m, [el[0], el[1], el[2]]));
        }
        if (idx) for (const i of idx) indices.push(base + i);
        else for (let i = 0; i < pos.getCount(); i++) indices.push(base + i);
      }
      if (vertices.length === 0) continue;
      shape = extras.shape === "convex" ? { kind: "convex-hull", vertices } : { kind: "mesh", vertices, indices };
    }
      colliders.push(world.createCollider(body, { ...options.collider, shape }));
      sourceNodes.push(extras.sourceNode ?? node.getName());
    }
    return { body, colliders, sourceNodes };
  } catch (error) {
    // Leave a supplied body intact, but undo every collider from this failed import.
    if (options.body) for (const collider of colliders) collider.remove();
    else body.remove();
    throw error;
  }
}
