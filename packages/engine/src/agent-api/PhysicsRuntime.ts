/**
 * Public physics runtime: the seam that turns declared bodies into a simulation a
 * developer can actually drive.
 *
 * ## The defect this addresses
 *
 * `@aura3d/physics` already wraps a real engine. `PhysicsWorld` has `createRigidBody`,
 * `createCollider`, `createConstraint`, `step()` returning `CollisionEvent[]`,
 * `raycast`/`raycastAll`, configurable solver iterations and sleeping, over either
 * `cannon-es` or an `aura-js` fallback. `RigidBody` already has `applyForce`,
 * `applyTorque`, `applyImpulse`, `setVelocity`, `wake` and `sleep`.
 *
 * None of it was reachable. Across ~47k lines of the public agent API there were zero
 * occurrences of `applyForce`, zero of `onCollision`, zero of a public `rigidBody`
 * type, and exactly one `applyImpulse` — buried inside the canned mini-golf helper and
 * unreachable to any other route. The public surface let a developer *declare*
 * `.physics({ type: "dynamic", mass: 1 })` and watch a box fall. They could not push
 * it, could not know when it hit anything, and could not read its velocity.
 *
 * Declaring a simulation you cannot interact with is not a physics API. That is why the
 * library had four hardcoded genre kits and no path to a fifth: every genre outside
 * racing, platformer, falling-blocks and locomotion had to reach into internals.
 *
 * This module is the answer. It mirrors the existing `app.nodes` registry shape so the
 * ergonomics are already familiar, and it deliberately exposes only what the backend
 * genuinely supports — an unsupported shape throws with an actionable message rather
 * than silently doing nothing.
 */

import type {
  CollisionEvent,
  Contact,
  PhysicsWorld,
  RaycastHit,
  RigidBody
} from "@aura3d/physics";

export type PhysicsVec3 = readonly [number, number, number];

/** A live handle onto one simulated body. */
export interface AuraBodyHandle {
  readonly id: number;
  /** Scene node name this body was declared on, when it came from a node. */
  readonly nodeName?: string | undefined;
  readonly type: "static" | "dynamic" | "kinematic";
  readonly mass: number;
  /** Current world position, read from the simulation. */
  position(): PhysicsVec3;
  /** Current linear velocity. */
  velocity(): PhysicsVec3;
  /** Current angular velocity. */
  angularVelocity(): PhysicsVec3;
  /** True when the solver has put this body to sleep. */
  sleeping(): boolean;
  /**
   * Continuous force, applied until cleared by the next step.
   *
   * Use for thrust, wind or buoyancy. For an instantaneous change of motion — a hit,
   * a jump, a bullet — use {@link applyImpulse}, which is mass-independent in effect
   * per unit of impulse and does not depend on step length.
   */
  applyForce(force: PhysicsVec3): this;
  applyTorque(torque: PhysicsVec3): this;
  applyImpulse(impulse: PhysicsVec3): this;
  applyAngularImpulse(impulse: PhysicsVec3): this;
  /** Impulse at a world point, so an off-centre hit induces spin. */
  applyImpulseAtPoint(impulse: PhysicsVec3, worldPoint: PhysicsVec3): this;
  setVelocity(velocity: PhysicsVec3): this;
  setAngularVelocity(velocity: PhysicsVec3): this;
  /**
   * Move the body, preserving velocity.
   *
   * This is a simulation write, not a teleport: a fast-moving body moved this way can
   * still tunnel. Use {@link teleport} to move and stop in one call.
   */
  setPosition(position: PhysicsVec3): this;
  /** Move and zero velocity, for respawns and resets. */
  teleport(position: PhysicsVec3): this;
  wake(): this;
  sleep(): this;
}

/** A collision or trigger contact, in public terms. */
export interface AuraCollisionEvent {
  readonly phase: "begin" | "stay" | "end";
  readonly bodyA: AuraBodyHandle;
  readonly bodyB: AuraBodyHandle;
  /** Node names when both bodies came from named scene nodes. */
  readonly nodeA?: string | undefined;
  readonly nodeB?: string | undefined;
  readonly normal: PhysicsVec3;
  readonly point?: PhysicsVec3 | undefined;
  readonly penetration: number;
  /** True when either collider is a sensor, i.e. a trigger rather than a solid hit. */
  readonly sensor: boolean;
  /** Approach speed along the contact normal. Zero for a resting contact. */
  readonly relativeSpeed: number;
}

export interface AuraRaycastOptions {
  readonly maxDistance?: number | undefined;
  /** Only hit bodies whose layer is in this list. */
  readonly layers?: readonly string[] | undefined;
  /** Skip these body ids. Use to stop a shooter hitting itself. */
  readonly ignore?: readonly number[] | undefined;
}

export interface AuraRaycastResult {
  readonly body: AuraBodyHandle;
  readonly nodeName?: string | undefined;
  readonly point: PhysicsVec3;
  readonly normal: PhysicsVec3;
  readonly distance: number;
}

export interface AuraBodyRegistry {
  get(id: number | string): AuraBodyHandle | undefined;
  require(id: number | string): AuraBodyHandle;
  has(id: number | string): boolean;
  ids(): readonly number[];
  all(): readonly AuraBodyHandle[];
}

export interface AuraPhysicsQueries {
  raycast(origin: PhysicsVec3, direction: PhysicsVec3, options?: AuraRaycastOptions): AuraRaycastResult | undefined;
  raycastAll(origin: PhysicsVec3, direction: PhysicsVec3, options?: AuraRaycastOptions): readonly AuraRaycastResult[];
  /** Bodies whose collider overlaps a sphere. */
  overlapSphere(center: PhysicsVec3, radius: number, options?: AuraRaycastOptions): readonly AuraBodyHandle[];
  /** Bodies whose collider overlaps an axis-aligned box. */
  overlapBox(center: PhysicsVec3, halfExtents: PhysicsVec3, options?: AuraRaycastOptions): readonly AuraBodyHandle[];
  /**
   * Sphere swept along a direction. Use instead of {@link raycast} when the moving
   * thing has width: a zero-radius ray slips between colliders that a real projectile
   * would hit.
   */
  sphereCast(origin: PhysicsVec3, radius: number, direction: PhysicsVec3, options?: AuraRaycastOptions): AuraRaycastResult | undefined;
}

export type AuraCollisionHandler = (event: AuraCollisionEvent) => void;

/** Unsubscribe function returned by every listener registration. */
export type AuraUnsubscribe = () => void;

export interface AuraPhysicsRuntime {
  readonly bodies: AuraBodyRegistry;
  readonly queries: AuraPhysicsQueries;
  /** Every collision, including resting contacts. */
  onCollision(handler: AuraCollisionHandler): AuraUnsubscribe;
  /** Collisions involving one named node, which is what gameplay code usually wants. */
  onCollisionWith(nodeName: string, handler: AuraCollisionHandler): AuraUnsubscribe;
  /** Sensor overlaps beginning — pickups, checkpoints, damage volumes. */
  onTriggerEnter(handler: AuraCollisionHandler): AuraUnsubscribe;
  onTriggerExit(handler: AuraCollisionHandler): AuraUnsubscribe;
  /** Gravity currently applied by the world. */
  gravity(): PhysicsVec3;
  setGravity(gravity: PhysicsVec3): void;
}

/**
 * Layer membership and masks.
 *
 * Without this, "bullets hit enemies but not each other" is unexpressible, and every
 * shooter has to filter contacts by hand after the solver has already resolved them —
 * which is both slower and wrong, because the solver has already pushed them apart.
 */
export interface AuraCollisionLayers {
  /** Declared layer names, in bit order. */
  readonly names: readonly string[];
  /** For each layer, the layers it is allowed to collide with. */
  readonly matrix: Readonly<Record<string, readonly string[]>>;
}

export function createCollisionLayers(matrix: Readonly<Record<string, readonly string[]>>): AuraCollisionLayers {
  const names = Object.keys(matrix);
  if (names.length === 0) throw new Error("createCollisionLayers requires at least one layer.");
  if (names.length > 32) throw new Error("createCollisionLayers supports at most 32 layers.");
  for (const [layer, against] of Object.entries(matrix)) {
    for (const other of against) {
      if (!names.includes(other)) {
        throw new Error(`Collision layer "${layer}" references unknown layer "${other}".`);
      }
    }
  }
  return { names, matrix };
}

/** True when two layers may generate contacts. Symmetric: either side may allow it. */
export function layersCollide(layers: AuraCollisionLayers, a: string, b: string): boolean {
  return (layers.matrix[a]?.includes(b) ?? false) || (layers.matrix[b]?.includes(a) ?? false);
}

/** Bitmask for a layer name, for backends that take masks directly. */
export function layerMask(layers: AuraCollisionLayers, name: string): number {
  const index = layers.names.indexOf(name);
  if (index < 0) throw new Error(`Unknown collision layer "${name}".`);
  return 1 << index;
}

export function collisionMaskFor(layers: AuraCollisionLayers, name: string): number {
  const against = layers.matrix[name];
  if (!against) throw new Error(`Unknown collision layer "${name}".`);
  let mask = 0;
  for (const other of against) mask |= layerMask(layers, other);
  // Symmetry: include layers that name this one, so a one-sided declaration still works.
  for (const [layer, list] of Object.entries(layers.matrix)) {
    if (list.includes(name)) mask |= layerMask(layers, layer);
  }
  return mask;
}

/** Joint kinds this runtime exposes. Every one is backed by a solver constraint. */
export type AuraJointKind = "fixed" | "hinge" | "slider" | "ball-socket" | "spring" | "motorised-hinge";

export interface AuraJointSpec {
  readonly kind: AuraJointKind;
  readonly bodyA: number | string;
  readonly bodyB: number | string;
  /** Anchor in world space. Defaults to the midpoint between the bodies. */
  readonly anchor?: PhysicsVec3 | undefined;
  /** Axis for hinge and slider joints. Defaults to world up. */
  readonly axis?: PhysicsVec3 | undefined;
  /** Spring stiffness, `spring` only. */
  readonly stiffness?: number | undefined;
  /** Spring damping, `spring` only. */
  readonly damping?: number | undefined;
  /** Rest length, `spring` only. Defaults to the initial separation. */
  readonly restLength?: number | undefined;
  /** Target speed, `motorised-hinge` only, radians per second. */
  readonly motorSpeed?: number | undefined;
  /** Maximum motor torque, `motorised-hinge` only. */
  readonly maxMotorTorque?: number | undefined;
  /** Angular limits in radians, `hinge` and `motorised-hinge`. */
  readonly limits?: readonly [number, number] | undefined;
}

export interface AuraJointHandle {
  readonly id: number;
  readonly kind: AuraJointKind;
  /** Turn the joint off without destroying it. */
  setEnabled(enabled: boolean): this;
  /** `motorised-hinge` only. */
  setMotorSpeed(speed: number): this;
  remove(): void;
}

export function validateJointSpec(spec: AuraJointSpec): void {
  if (spec.kind === "spring") {
    if (spec.stiffness !== undefined && !(spec.stiffness > 0)) {
      throw new Error("Spring joint stiffness must be positive.");
    }
    if (spec.damping !== undefined && spec.damping < 0) {
      throw new Error("Spring joint damping must be non-negative.");
    }
  }
  if (spec.kind === "motorised-hinge" && spec.motorSpeed === undefined) {
    throw new Error("A motorised-hinge joint requires motorSpeed.");
  }
  if (spec.limits) {
    const [lower, upper] = spec.limits;
    if (!(lower <= upper)) throw new Error("Joint limits must be ordered [lower, upper].");
    if (spec.kind !== "hinge" && spec.kind !== "motorised-hinge") {
      throw new Error(`Joint limits are only supported on hinge joints, not "${spec.kind}".`);
    }
  }
}

/** Collider shapes the declaration surface accepts. */
export type AuraColliderShape =
  | "box"
  | "sphere"
  | "capsule"
  | "cylinder"
  | "plane"
  | "convexHull"
  | "trimesh"
  | "heightfield";

/**
 * Shapes the active backend can actually simulate as a *dynamic* body.
 *
 * `trimesh` and `heightfield` are static-only in every backend here: a concave
 * triangle soup has no well-defined inertia tensor, and treating one as dynamic
 * produces a body that falls through thin geometry. Declaring one dynamic is a
 * mistake worth an error rather than a silent fallback, because the failure mode
 * looks like a physics bug rather than an authoring bug.
 */
export const AURA_DYNAMIC_CAPABLE_SHAPES: readonly AuraColliderShape[] = [
  "box",
  "sphere",
  "capsule",
  "cylinder",
  "convexHull"
];

export const AURA_STATIC_ONLY_SHAPES: readonly AuraColliderShape[] = ["plane", "trimesh", "heightfield"];

export function assertShapeSupported(shape: AuraColliderShape, bodyType: "static" | "dynamic" | "kinematic"): void {
  if (bodyType === "dynamic" && AURA_STATIC_ONLY_SHAPES.includes(shape)) {
    throw new Error(
      `Collider shape "${shape}" cannot be dynamic: it has no well-defined inertia tensor. ` +
      `Declare it { type: "static" }, or use one of ${AURA_DYNAMIC_CAPABLE_SHAPES.join(", ")} for a moving body.`
    );
  }
}

/**
 * Approach speed along the contact normal.
 *
 * Exposed on every collision event because it is what separates a landing from a
 * crash, a tap from a hit. Without it, gameplay code has to cache last-frame
 * velocities to tell the difference.
 */
export function contactRelativeSpeed(
  velocityA: PhysicsVec3,
  velocityB: PhysicsVec3,
  normal: PhysicsVec3
): number {
  const rx = velocityA[0] - velocityB[0];
  const ry = velocityA[1] - velocityB[1];
  const rz = velocityA[2] - velocityB[2];
  return Math.abs(rx * normal[0] + ry * normal[1] + rz * normal[2]);
}

/** Internal: adapt a `@aura3d/physics` body to the public handle. */
export function createBodyHandle(
  body: RigidBody,
  world: Pick<PhysicsWorld, "getBody">,
  nodeName?: string
): AuraBodyHandle {
  void world;
  const snapshot = () => body.snapshot();
  const handle: AuraBodyHandle = {
    id: body.id,
    nodeName,
    type: body.type as "static" | "dynamic" | "kinematic",
    mass: body.mass,
    position: () => [...snapshot().position] as unknown as PhysicsVec3,
    velocity: () => [...snapshot().velocity] as unknown as PhysicsVec3,
    angularVelocity: () => [...snapshot().angularVelocity] as unknown as PhysicsVec3,
    sleeping: () => snapshot().sleeping,
    applyForce: (force) => { body.applyForce([...force]); return handle; },
    applyTorque: (torque) => { body.applyTorque([...torque]); return handle; },
    applyImpulse: (impulse) => { body.wake(); body.applyImpulse([...impulse]); return handle; },
    applyAngularImpulse: (impulse) => { body.wake(); body.applyAngularImpulse([...impulse]); return handle; },
    applyImpulseAtPoint: (impulse, point) => {
      body.wake();
      body.applyImpulseAtPoint([...impulse], [...point]);
      return handle;
    },
    setVelocity: (velocity) => { body.wake(); body.setVelocity([...velocity]); return handle; },
    setAngularVelocity: (velocity) => { body.wake(); body.setAngularVelocity([...velocity]); return handle; },
    setPosition: (position) => { body.setPosition([...position]); return handle; },
    teleport: (position) => {
      body.setPosition([...position]);
      body.setVelocity([0, 0, 0]);
      body.setAngularVelocity([0, 0, 0]);
      return handle;
    },
    wake: () => { body.wake(); return handle; },
    sleep: () => { body.sleep(); return handle; }
  };
  return handle;
}

/** Internal: translate a solver collision event into the public shape. */
export function toAuraCollisionEvent(
  event: CollisionEvent,
  resolveBody: (id: number) => AuraBodyHandle | undefined
): AuraCollisionEvent | undefined {
  const contact: Contact = event.contact;
  const bodyA = resolveBody(contact.bodyA);
  const bodyB = resolveBody(contact.bodyB);
  if (!bodyA || !bodyB) return undefined;
  return {
    phase: event.type,
    bodyA,
    bodyB,
    nodeA: bodyA.nodeName,
    nodeB: bodyB.nodeName,
    normal: [...contact.normal] as unknown as PhysicsVec3,
    point: contact.point ? ([...contact.point] as unknown as PhysicsVec3) : undefined,
    penetration: contact.penetration,
    sensor: contact.sensor,
    relativeSpeed: contactRelativeSpeed(bodyA.velocity(), bodyB.velocity(), contact.normal as PhysicsVec3)
  };
}

/** Internal: translate a solver raycast hit into the public shape. */
export function toAuraRaycastResult(
  hit: RaycastHit,
  resolveBody: (id: number) => AuraBodyHandle | undefined
): AuraRaycastResult | undefined {
  const body = resolveBody(hit.bodyId);
  if (!body) return undefined;
  return {
    body,
    nodeName: body.nodeName,
    point: [...hit.point] as unknown as PhysicsVec3,
    normal: [...hit.normal] as unknown as PhysicsVec3,
    distance: hit.distance
  };
}
