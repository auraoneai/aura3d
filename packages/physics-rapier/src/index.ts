import type * as Rapier from "@dimforge/rapier3d-compat";

const defaultRapierModule = await import("@dimforge/rapier3d-compat");
const defaultRapierInit = (defaultRapierModule as unknown as { init?: (input?: unknown) => Promise<unknown> }).init;
if (defaultRapierInit) await defaultRapierInit({});

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
  position(): PhysicsVec3 { const p = this.#body.translation(); return [p.x, p.y, p.z]; }
  velocity(): PhysicsVec3 { const p = this.#body.linvel(); return [p.x, p.y, p.z]; }
  sleeping(): boolean { return this.#body.isSleeping(); }
  applyForce(force: PhysicsVec3): this { this.#body.addForce(vec(force, "force"), true); return this; }
  applyImpulse(impulse: PhysicsVec3): this { this.#body.applyImpulse(vec(impulse, "impulse"), true); return this; }
  setVelocity(velocity: PhysicsVec3): this { this.#body.setLinvel(vec(velocity, "velocity"), true); return this; }
  setPosition(position: PhysicsVec3): this { this.#body.setTranslation(vec(position, "position"), true); return this; }
  wake(): this { this.#body.wakeUp(); return this; }
  sleep(): this { this.#body.sleep(); return this; }
  remove(): void { this.#world.removeBody(this); }
  /** Stable typed escape hatch. The caller does not own or free this object. */
  unsafeRapierBody(): Rapier.RigidBody { return this.#body; }
  /** The first attached collider, retained for the one-shape convenience API. */
  unsafeRapierCollider(): Rapier.Collider {
    const collider = this.#body.collider(0);
    if (!collider) throw new Error("Rapier body has no collider.");
    return collider;
  }
}

export class RapierColliderHandle {
  readonly #collider: Rapier.Collider;
  readonly #world: RapierPhysicsWorld;
  constructor(world: RapierPhysicsWorld, collider: Rapier.Collider) { this.#world = world; this.#collider = collider; }
  get id(): number { return this.#collider.handle; }
  remove(): void { this.#world.removeCollider(this); }
  /** Stable typed escape hatch. The adapter owns and frees this object. */
  unsafeRapierCollider(): Rapier.Collider { return this.#collider; }
}

export class RapierJointHandle {
  readonly #joint: Rapier.ImpulseJoint;
  readonly #world: RapierPhysicsWorld;
  readonly #module: RapierModule;
  constructor(world: RapierPhysicsWorld, joint: Rapier.ImpulseJoint, module: RapierModule) { this.#world = world; this.#joint = joint; this.#module = module; }
  get id(): number { return this.#joint.handle; }
  remove(): void { this.#world.removeJoint(this); }
  configureMotor(speed: number, maxTorque: number): void {
    const joint = this.#joint as Rapier.RevoluteImpulseJoint;
    joint.configureMotorModel(this.#module.MotorModel.ForceBased);
    joint.setMotorMaxForce(finite(maxTorque, "maximum motor torque"));
    joint.configureMotorVelocity(finite(speed, "motor speed"), 1);
  }
  /** Stable typed escape hatch. The adapter owns and frees this object. */
  unsafeRapierJoint(): Rapier.ImpulseJoint { return this.#joint; }
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
  readonly raw: Rapier.KinematicCharacterController;
  constructor(world: RapierPhysicsWorld, raw: Rapier.KinematicCharacterController) { this.#world = world; this.raw = raw; }
  enableAutostep(maxHeight: number, minWidth: number, includeDynamicBodies = false): this { this.raw.enableAutostep(maxHeight, minWidth, includeDynamicBodies); return this; }
  enableSnapToGround(distance: number): this { this.raw.enableSnapToGround(distance); return this; }
  setMaxSlopeClimbAngle(radians: number): this { this.raw.setMaxSlopeClimbAngle(radians); return this; }
  move(character: RapierColliderHandle | RapierBodyHandle, requested: PhysicsVec3): RapierCharacterMovement {
    const desired = vec(requested, "character movement");
    this.raw.computeColliderMovement(character.unsafeRapierCollider(), desired);
    const movement = this.raw.computedMovement();
    const body = character.unsafeRapierCollider().parent();
    if (!body) throw new Error("Character collider must be attached to a rigid body.");
    const current = body.translation();
    const next = { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z };
    body.setNextKinematicTranslation(next);
    return {
      requested: [...requested],
      applied: [movement.x, movement.y, movement.z],
      grounded: this.raw.computedGrounded(),
      collisions: this.raw.numComputedCollisions(),
      nextPosition: [next.x, next.y, next.z]
    };
  }
  dispose(): void { this.#world.removeCharacterController(this); }
}

export class RapierVehicleControllerHandle {
  readonly #world: RapierPhysicsWorld;
  readonly raw: Rapier.DynamicRayCastVehicleController;
  constructor(world: RapierPhysicsWorld, raw: Rapier.DynamicRayCastVehicleController) { this.#world = world; this.raw = raw; }
  addWheel(connection: PhysicsVec3, direction: PhysicsVec3, axle: PhysicsVec3, restLength: number, radius: number): this {
    this.raw.addWheel(vec(connection, "connection"), vec(direction, "direction"), vec(axle, "axle"), finite(restLength, "restLength"), finite(radius, "radius"));
    return this;
  }
  update(dt: number): void { this.raw.updateVehicle(finite(dt, "dt")); }
  dispose(): void { this.#world.removeVehicleController(this); }
}

export class RapierPhysicsWorld {
  readonly #module: RapierModule;
  readonly #world: Rapier.World;
  readonly #bodies = new Map<number, RapierBodyHandle>();
  readonly #colliders = new Map<number, RapierColliderHandle>();
  readonly #joints = new Map<number, RapierJointHandle>();
  readonly #characters = new Set<RapierCharacterControllerHandle>();
  readonly #vehicles = new Set<RapierVehicleControllerHandle>();
  #disposed = false;
  constructor(module: RapierModule, gravity: PhysicsVec3) { this.#module = module; this.#world = new module.World(vec(gravity, "gravity")); }
  get disposed(): boolean { return this.#disposed; }
  createRigidBody(spec: RapierRigidBodySpec = {}): RapierBodyHandle {
    this.#assertAlive();
    const R = this.#module;
    const descriptor = spec.type === "fixed" ? R.RigidBodyDesc.fixed() : spec.type === "kinematic-position" ? R.RigidBodyDesc.kinematicPositionBased() : spec.type === "kinematic-velocity" ? R.RigidBodyDesc.kinematicVelocityBased() : R.RigidBodyDesc.dynamic();
    if (spec.position) descriptor.setTranslation(...spec.position.map((value, index) => finite(value, `position[${index}]`)) as [number, number, number]);
    if (spec.rotation) descriptor.setRotation({ x: finite(spec.rotation[0], "rotation[0]"), y: finite(spec.rotation[1], "rotation[1]"), z: finite(spec.rotation[2], "rotation[2]"), w: finite(spec.rotation[3], "rotation[3]") });
    if (spec.linearVelocity) descriptor.setLinvel(...spec.linearVelocity.map((value, index) => finite(value, `linearVelocity[${index}]`)) as [number, number, number]);
    if (spec.angularVelocity) descriptor.setAngvel(vec(spec.angularVelocity, "angularVelocity"));
    if (spec.linearDamping !== undefined) descriptor.setLinearDamping(finite(spec.linearDamping, "linearDamping"));
    if (spec.angularDamping !== undefined) descriptor.setAngularDamping(finite(spec.angularDamping, "angularDamping"));
    if (spec.ccd !== undefined) descriptor.setCcdEnabled(spec.ccd);
    if (spec.canSleep !== undefined) descriptor.setCanSleep(spec.canSleep);
    if (spec.mass !== undefined && spec.principalAngularInertia) {
      descriptor.setAdditionalMassProperties(
        finite(spec.mass, "mass"),
        { x: 0, y: 0, z: 0 },
        vec(spec.principalAngularInertia, "principal angular inertia"),
        { x: 0, y: 0, z: 0, w: 1 }
      );
    } else if (spec.mass !== undefined) {
      descriptor.setAdditionalMass(finite(spec.mass, "mass"));
    }
    const body = this.#world.createRigidBody(descriptor);
    const handle = new RapierBodyHandle(this, body); this.#bodies.set(body.handle, handle); return handle;
  }
  createCollider(body: RapierBodyHandle, spec: RapierColliderSpec): RapierColliderHandle {
    this.#assertAlive();
    const R = this.#module;
    const shape = spec.shape;
    let collider: Rapier.ColliderDesc;
    if (shape.kind === "box") collider = R.ColliderDesc.cuboid(...shape.halfExtents);
    else if (shape.kind === "sphere") collider = R.ColliderDesc.ball(shape.radius);
    else if (shape.kind === "capsule") collider = R.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    else if (shape.kind === "plane") {
      collider = new R.ColliderDesc(new R.HalfSpace(vec(shape.normal, "plane normal")));
      collider.setTranslation(shape.normal[0] * shape.constant, shape.normal[1] * shape.constant, shape.normal[2] * shape.constant);
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
        new Float32Array(shape.heights),
        { x: shape.cellSize * (shape.columns - 1), y: 1, z: shape.cellSize * (shape.rows - 1) }
      );
    }
    if (spec.density !== undefined) collider.setDensity(finite(spec.density, "density"));
    if (spec.friction !== undefined) collider.setFriction(finite(spec.friction, "friction"));
    if (spec.restitution !== undefined) collider.setRestitution(finite(spec.restitution, "restitution"));
    if (spec.sensor !== undefined) collider.setSensor(spec.sensor);
    if (spec.collisionGroups !== undefined) collider.setCollisionGroups(spec.collisionGroups >>> 0);
    collider.setFrictionCombineRule(R.CoefficientCombineRule.Multiply);
    collider.setRestitutionCombineRule(R.CoefficientCombineRule.Max);
    const rawCollider = this.#world.createCollider(collider, body.unsafeRapierBody());
    // Rapier applies descriptor-level additional mass at the next mass-property
    // recomputation. Do that before the first step so initial velocity, force, and
    // inertia never run for one frame against a zero-mass dynamic body.
    body.unsafeRapierBody().recomputeMassPropertiesFromColliders();
    const handle = new RapierColliderHandle(this, rawCollider); this.#colliders.set(rawCollider.handle, handle); return handle;
  }
  createBody(spec: RapierBodySpec): RapierBodyHandle {
    const body = this.createRigidBody(spec);
    this.createCollider(body, spec);
    return body;
  }
  removeBody(handle: RapierBodyHandle): void {
    this.#assertAlive();
    const raw = handle.unsafeRapierBody();
    for (let index = 0; index < raw.numColliders(); index += 1) this.#colliders.delete(raw.collider(index).handle);
    this.#world.removeRigidBody(raw); this.#bodies.delete(raw.handle);
  }
  removeCollider(handle: RapierColliderHandle): void { this.#assertAlive(); const raw = handle.unsafeRapierCollider(); this.#world.removeCollider(raw, true); this.#colliders.delete(raw.handle); }
  createJoint(spec: RapierJointSpec, a: RapierBodyHandle, b: RapierBodyHandle): RapierJointHandle {
    this.#assertAlive();
    const R = this.#module;
    const anchorA = vec(spec.localAnchorA, "joint anchor A");
    const anchorB = vec(spec.localAnchorB, "joint anchor B");
    const axis = vec(spec.axis, "joint axis");
    let data: Rapier.JointData;
    if (spec.type === "fixed") data = R.JointData.fixed(anchorA, { x: 0, y: 0, z: 0, w: 1 }, anchorB, { x: 0, y: 0, z: 0, w: 1 });
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
    const unit = raw as Rapier.UnitImpulseJoint;
    if (spec.limits && "setLimits" in unit) unit.setLimits(spec.limits[0], spec.limits[1]);
    const handle = new RapierJointHandle(this, raw, R);
    if (spec.type === "motorised-hinge") handle.configureMotor(spec.motorSpeed, spec.maxMotorTorque);
    this.#joints.set(raw.handle, handle);
    return handle;
  }
  removeJoint(handle: RapierJointHandle): void { this.#assertAlive(); const raw = handle.unsafeRapierJoint(); this.#world.removeImpulseJoint(raw, true); this.#joints.delete(raw.handle); }
  createFixedJoint(a: RapierBodyHandle, b: RapierBodyHandle): Rapier.ImpulseJoint {
    this.#assertAlive();
    return this.#world.createImpulseJoint(this.#module.JointData.fixed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), a.unsafeRapierBody(), b.unsafeRapierBody(), true);
  }
  createCharacterController(offset = 0.01): RapierCharacterControllerHandle { this.#assertAlive(); const value = new RapierCharacterControllerHandle(this, this.#world.createCharacterController(offset)); this.#characters.add(value); return value; }
  removeCharacterController(value: RapierCharacterControllerHandle): void { if (!this.#characters.delete(value)) return; this.#world.removeCharacterController(value.raw); }
  createVehicleController(chassis: RapierBodyHandle): RapierVehicleControllerHandle { this.#assertAlive(); const value = new RapierVehicleControllerHandle(this, this.#world.createVehicleController(chassis.unsafeRapierBody())); this.#vehicles.add(value); return value; }
  removeVehicleController(value: RapierVehicleControllerHandle): void { if (!this.#vehicles.delete(value)) return; this.#world.removeVehicleController(value.raw); }
  raycast(origin: PhysicsVec3, direction: PhysicsVec3, maxDistance = Number.POSITIVE_INFINITY): RapierRayHit | undefined {
    this.#assertAlive();
    const ray = new this.#module.Ray(vec(origin, "origin"), vec(direction, "direction"));
    const hit = this.#world.castRay(ray, maxDistance, true);
    if (!hit) return undefined;
    const collider = this.#world.getCollider(hit.collider.handle); const rawBody = collider?.parent();
    if (!rawBody) return undefined;
    const body = this.#bodies.get(rawBody.handle); if (!body) return undefined;
    const point = ray.pointAt(hit.timeOfImpact);
    return { body, colliderHandle: hit.collider.handle, timeOfImpact: hit.timeOfImpact, point: [point.x, point.y, point.z] };
  }
  step(dt = 1 / 60): void { this.#assertAlive(); this.#world.timestep = finite(dt, "dt"); this.#world.step(); }
  setGravity(gravity: PhysicsVec3): void { this.#assertAlive(); this.#world.gravity = vec(gravity, "gravity"); }
  bodies(): readonly RapierBodyHandle[] { return [...this.#bodies.values()]; }
  /** Stable typed escape hatch. The adapter owns and frees the returned world. */
  unsafeRapierWorld(): Rapier.World { this.#assertAlive(); return this.#world; }
  dispose(): void {
    if (this.#disposed) return;
    for (const value of [...this.#vehicles]) this.removeVehicleController(value);
    for (const value of [...this.#characters]) this.removeCharacterController(value);
    this.#joints.clear(); this.#colliders.clear(); this.#bodies.clear(); this.#world.free(); this.#disposed = true;
  }
  #assertAlive(): void { if (this.#disposed) throw new Error("RapierPhysicsWorld is disposed."); }
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
  const module = await (options.moduleLoader ?? (() => import("@dimforge/rapier3d-compat")))();
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
  return new RapierPhysicsWorld(defaultRapierModule, options.gravity ?? [0, -9.81, 0]);
}
