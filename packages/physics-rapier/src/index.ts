import type * as Rapier from "@dimforge/rapier3d-compat";

export type RapierModule = typeof import("@dimforge/rapier3d-compat");
export type PhysicsVec3 = readonly [number, number, number];

export type RapierShapeSpec =
  | { readonly kind: "box"; readonly halfExtents: PhysicsVec3 }
  | { readonly kind: "sphere"; readonly radius: number }
  | { readonly kind: "capsule"; readonly halfHeight: number; readonly radius: number };

export interface RapierBodySpec {
  readonly type?: "dynamic" | "fixed" | "kinematic-position" | "kinematic-velocity";
  readonly position?: PhysicsVec3;
  readonly rotation?: readonly [number, number, number, number];
  readonly linearVelocity?: PhysicsVec3;
  readonly angularVelocity?: PhysicsVec3;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly ccd?: boolean;
  readonly canSleep?: boolean;
  readonly shape: RapierShapeSpec;
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly sensor?: boolean;
}

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
  readonly #collider: Rapier.Collider;
  readonly #world: RapierPhysicsWorld;
  constructor(world: RapierPhysicsWorld, body: Rapier.RigidBody, collider: Rapier.Collider) { this.#world = world; this.#body = body; this.#collider = collider; }
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
  /** Stable typed escape hatch. The body owns this collider's lifecycle. */
  unsafeRapierCollider(): Rapier.Collider { return this.#collider; }
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
  move(character: RapierBodyHandle, requested: PhysicsVec3): RapierCharacterMovement {
    const desired = vec(requested, "character movement");
    this.raw.computeColliderMovement(character.unsafeRapierCollider(), desired);
    const movement = this.raw.computedMovement();
    const current = character.unsafeRapierBody().translation();
    const next = { x: current.x + movement.x, y: current.y + movement.y, z: current.z + movement.z };
    character.unsafeRapierBody().setNextKinematicTranslation(next);
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
  readonly #characters = new Set<RapierCharacterControllerHandle>();
  readonly #vehicles = new Set<RapierVehicleControllerHandle>();
  #disposed = false;
  constructor(module: RapierModule, gravity: PhysicsVec3) { this.#module = module; this.#world = new module.World(vec(gravity, "gravity")); }
  get disposed(): boolean { return this.#disposed; }
  createBody(spec: RapierBodySpec): RapierBodyHandle {
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
    const body = this.#world.createRigidBody(descriptor);
    const shape = spec.shape;
    const collider = shape.kind === "box" ? R.ColliderDesc.cuboid(...shape.halfExtents) : shape.kind === "sphere" ? R.ColliderDesc.ball(shape.radius) : R.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    if (spec.density !== undefined) collider.setDensity(finite(spec.density, "density"));
    if (spec.friction !== undefined) collider.setFriction(finite(spec.friction, "friction"));
    if (spec.restitution !== undefined) collider.setRestitution(finite(spec.restitution, "restitution"));
    if (spec.sensor !== undefined) collider.setSensor(spec.sensor);
    const rawCollider = this.#world.createCollider(collider, body);
    const handle = new RapierBodyHandle(this, body, rawCollider); this.#bodies.set(body.handle, handle); return handle;
  }
  removeBody(handle: RapierBodyHandle): void { this.#assertAlive(); const raw = handle.unsafeRapierBody(); this.#world.removeRigidBody(raw); this.#bodies.delete(raw.handle); }
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
  bodies(): readonly RapierBodyHandle[] { return [...this.#bodies.values()]; }
  /** Stable typed escape hatch. The adapter owns and frees the returned world. */
  unsafeRapierWorld(): Rapier.World { this.#assertAlive(); return this.#world; }
  dispose(): void {
    if (this.#disposed) return;
    for (const value of [...this.#vehicles]) this.removeVehicleController(value);
    for (const value of [...this.#characters]) this.removeCharacterController(value);
    this.#bodies.clear(); this.#world.free(); this.#disposed = true;
  }
  #assertAlive(): void { if (this.#disposed) throw new Error("RapierPhysicsWorld is disposed."); }
}

export async function createRapierPhysics(options: RapierPhysicsOptions = {}): Promise<RapierPhysicsWorld> {
  const module = await (options.moduleLoader ?? (() => import("@dimforge/rapier3d-compat")))();
  // The official compat build exposes explicit async WASM initialization and
  // avoids forcing each consuming bundler to configure a raw `.wasm` loader.
  const explicitInit = (module as unknown as { init?: (input?: unknown) => Promise<unknown> }).init;
  if (explicitInit) await explicitInit({});
  return new RapierPhysicsWorld(module, options.gravity ?? [0, -9.81, 0]);
}
