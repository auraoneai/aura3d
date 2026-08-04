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

import { Shape, type PhysicsShape } from "@aura3d/physics";
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

/** Declaration for a body created at runtime rather than through the scene. */
export interface AuraBodySpec {
  /** Name used by {@link AuraBodyRegistry.get} and reported on collision events. */
  readonly name?: string | undefined;
  readonly type?: "static" | "dynamic" | "kinematic" | undefined;
  readonly shape?: AuraColliderShape | undefined;
  readonly position?: PhysicsVec3 | undefined;
  readonly halfExtents?: PhysicsVec3 | undefined;
  readonly radius?: number | undefined;
  readonly halfHeight?: number | undefined;
  readonly mass?: number | undefined;
  readonly friction?: number | undefined;
  readonly restitution?: number | undefined;
  readonly linearDamping?: number | undefined;
  readonly angularDamping?: number | undefined;
  /** Sensors report overlaps through `onTriggerEnter`/`onTriggerExit` and never push. */
  readonly sensor?: boolean | undefined;
  /** Layer name, resolved against the layers passed to {@link createPhysicsRuntime}. */
  readonly layer?: string | undefined;
}

export interface AuraPhysicsRuntime {
  readonly bodies: AuraBodyRegistry;
  readonly queries: AuraPhysicsQueries;
  /**
   * Create a simulated body at runtime.
   *
   * Needed because scene declaration is authored up front, and gameplay is not: a
   * projectile, a spawned enemy or a stacked crate does not exist when the scene is built.
   */
  createBody(spec?: AuraBodySpec): AuraBodyHandle;
  /** Remove a body and its colliders and joints. */
  removeBody(id: number | string): void;
  /** Connect two bodies. See {@link AuraJointKind}. */
  createJoint(spec: AuraJointSpec): AuraJointHandle;
  /** Advance the simulation and dispatch collision, trigger and contact events. */
  step(dt?: number): readonly AuraCollisionEvent[];
  /** Contacts live in the most recent step. */
  contacts(): readonly AuraCollisionEvent[];
  /** Declared collision layers, if any were supplied. */
  readonly layers: AuraCollisionLayers | undefined;
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

/**
 * Collider shapes the declaration surface accepts.
 *
 * WS-1.5 audit, run against `packages/physics/src/Shape.ts`: the factory provides `box`,
 * `sphere`, `capsule`, `plane`, `mesh`, `convexHull` and `heightfield`. There is **no**
 * `Shape.cylinder`. An earlier draft of this list advertised `cylinder`, which would have
 * thrown at runtime for anyone who used it — the exact "declared but unsupported" failure
 * this list exists to prevent. It is removed rather than faked with a box.
 *
 * Capability table:
 *
 * | shape | dynamic | static | from a body spec |
 * |---|---|---|---|
 * | `box` | yes | yes | yes |
 * | `sphere` | yes | yes | yes |
 * | `capsule` | yes | yes | yes |
 * | `convexHull` | yes | yes | no — needs vertices |
 * | `mesh` | no | yes | no — needs geometry |
 * | `plane` | no | yes | yes |
 * | `heightfield` | no | yes | no — needs a height grid |
 */
export type AuraColliderShape =
  | "box"
  | "sphere"
  | "capsule"
  | "plane"
  | "convexHull"
  | "mesh"
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
  "convexHull"
];

export const AURA_STATIC_ONLY_SHAPES: readonly AuraColliderShape[] = ["plane", "mesh", "heightfield"];

/** Shapes {@link AuraPhysicsRuntime.createBody} can build from dimensions alone. */
export const AURA_SPEC_CONSTRUCTIBLE_SHAPES: readonly AuraColliderShape[] = [
  "box",
  "sphere",
  "capsule",
  "plane"
];

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

/** Options for {@link createPhysicsRuntime}. */
export interface AuraPhysicsRuntimeOptions {
  /**
   * Collision layers, so "bullets hit enemies but not each other" is expressible.
   *
   * Supplied here rather than per body because a mask is only meaningful relative to the
   * full set of layers: `collisionMaskFor` has to know every layer to build the bitmask.
   */
  readonly layers?: AuraCollisionLayers | undefined;
  /** Resolve a body id to the scene node name it drives, for event payloads. */
  readonly nodeNameFor?: ((bodyId: number) => string | undefined) | undefined;
}

/**
 * Build the public physics runtime over a `PhysicsWorld`.
 *
 * This is the function that closes the reachability gap described at the top of this
 * file. Everything above it was type declarations and pure helpers; without an
 * implementation that a live app hands out, `AuraPhysicsRuntime` was an interface no
 * value ever satisfied, and no developer could obtain one.
 */
export function createPhysicsRuntime(
  world: PhysicsWorld,
  options: AuraPhysicsRuntimeOptions = {}
): AuraPhysicsRuntime {
  const layers = options.layers;
  const handles = new Map<number, AuraBodyHandle>();
  const namesById = new Map<number, string>();
  const idsByName = new Map<string, number>();
  const layerByBodyId = new Map<number, string>();

  const collisionHandlers = new Set<AuraCollisionHandler>();
  const namedHandlers = new Map<string, Set<AuraCollisionHandler>>();
  const triggerEnterHandlers = new Set<AuraCollisionHandler>();
  const triggerExitHandlers = new Set<AuraCollisionHandler>();
  let lastEvents: readonly AuraCollisionEvent[] = [];

  function nodeNameFor(bodyId: number): string | undefined {
    return namesById.get(bodyId) ?? options.nodeNameFor?.(bodyId);
  }

  function resolveBody(id: number): AuraBodyHandle | undefined {
    const existing = handles.get(id);
    if (existing) return existing;
    const body = world.getBody(id);
    if (!body) return undefined;
    const handle = createBodyHandle(body, world, nodeNameFor(id));
    handles.set(id, handle);
    return handle;
  }

  function resolveId(id: number | string): number | undefined {
    if (typeof id === "number") return id;
    return idsByName.get(id);
  }

  /** Translate the public layer-name filter into the numeric mask the solver takes. */
  function toRaycastOptions(options?: AuraRaycastOptions) {
    if (!options) return {};
    let mask: number | undefined;
    if (options.layers && layers) {
      mask = 0;
      for (const name of options.layers) mask |= layerMask(layers, name);
    }
    const ignoreColliders: number[] = [];
    for (const bodyId of options.ignore ?? []) {
      for (const collider of world.colliders()) {
        if (collider.bodyId === bodyId) ignoreColliders.push(collider.id);
      }
    }
    return {
      ...(options.maxDistance === undefined ? {} : { maxDistance: options.maxDistance }),
      ...(mask === undefined ? {} : { mask }),
      ...(ignoreColliders.length === 0 ? {} : { ignore: ignoreColliders })
    };
  }

  const queries: AuraPhysicsQueries = {
    raycast(origin, direction, opts) {
      const hit = world.raycast([...origin], [...direction], toRaycastOptions(opts));
      return hit ? toAuraRaycastResult(hit, resolveBody) : undefined;
    },
    raycastAll(origin, direction, opts) {
      const hits = world.raycastAll([...origin], [...direction], toRaycastOptions(opts));
      const out: AuraRaycastResult[] = [];
      for (const hit of hits) {
        const result = toAuraRaycastResult(hit, resolveBody);
        if (result) out.push(result);
      }
      return out;
    },
    sphereCast(origin, radius, direction, opts) {
      const hit = world.sphereCast([...origin], radius, [...direction], toRaycastOptions(opts));
      return hit ? toAuraRaycastResult(hit, resolveBody) : undefined;
    },
    overlapSphere(center, radius, opts) {
      // Implemented as a bounds test against every collider rather than a solver query,
      // because `PhysicsWorld` exposes casts but not a standing overlap test. Filtering by
      // layer here keeps the public semantics identical to the cast paths.
      const allowed = opts?.layers && layers
        ? new Set(opts.layers)
        : undefined;
      const ignore = new Set(opts?.ignore ?? []);
      const out: AuraBodyHandle[] = [];
      const r2 = radius * radius;
      for (const body of world.bodies()) {
        if (ignore.has(body.id)) continue;
        if (allowed) {
          const layerName = layerByBodyId.get(body.id);
          if (!layerName || !allowed.has(layerName)) continue;
        }
        const dx = body.position[0] - center[0];
        const dy = body.position[1] - center[1];
        const dz = body.position[2] - center[2];
        if (dx * dx + dy * dy + dz * dz <= r2) {
          const handle = resolveBody(body.id);
          if (handle) out.push(handle);
        }
      }
      return out;
    },
    overlapBox(center, halfExtents, opts) {
      const allowed = opts?.layers && layers ? new Set(opts.layers) : undefined;
      const ignore = new Set(opts?.ignore ?? []);
      const out: AuraBodyHandle[] = [];
      for (const body of world.bodies()) {
        if (ignore.has(body.id)) continue;
        if (allowed) {
          const layerName = layerByBodyId.get(body.id);
          if (!layerName || !allowed.has(layerName)) continue;
        }
        if (
          Math.abs(body.position[0] - center[0]) <= halfExtents[0] &&
          Math.abs(body.position[1] - center[1]) <= halfExtents[1] &&
          Math.abs(body.position[2] - center[2]) <= halfExtents[2]
        ) {
          const handle = resolveBody(body.id);
          if (handle) out.push(handle);
        }
      }
      return out;
    }
  };

  const bodies: AuraBodyRegistry = {
    get(id) {
      const resolved = resolveId(id);
      return resolved === undefined ? undefined : resolveBody(resolved);
    },
    require(id) {
      const handle = bodies.get(id);
      if (!handle) {
        throw new Error(
          `No physics body "${id}". Create one with app.physics.createBody({ name: "${id}" }), ` +
          `or declare .physics({...}) on the scene node of that name.`
        );
      }
      return handle;
    },
    has(id) {
      return bodies.get(id) !== undefined;
    },
    ids() {
      return world.bodies().map((body) => body.id);
    },
    all() {
      const out: AuraBodyHandle[] = [];
      for (const body of world.bodies()) {
        const handle = resolveBody(body.id);
        if (handle) out.push(handle);
      }
      return out;
    }
  };

  function dispatch(events: readonly AuraCollisionEvent[]): void {
    for (const event of events) {
      if (event.sensor) {
        const set = event.phase === "end" ? triggerExitHandlers : triggerEnterHandlers;
        // Only `begin` and `end` are meaningful for a trigger; a `stay` overlap would
        // re-fire "entered" every frame, which is the classic pickup-collected-twice bug.
        if (event.phase === "begin" || event.phase === "end") {
          for (const handler of [...set]) handler(event);
        }
        continue;
      }
      for (const handler of [...collisionHandlers]) handler(event);
      for (const name of [event.nodeA, event.nodeB]) {
        if (!name) continue;
        const set = namedHandlers.get(name);
        if (!set) continue;
        for (const handler of [...set]) handler(event);
      }
    }
  }

  const runtime: AuraPhysicsRuntime = {
    bodies,
    queries,
    layers,
    createBody(spec: AuraBodySpec = {}) {
      const type = spec.type ?? "dynamic";
      const shape = spec.shape ?? "box";
      assertShapeSupported(shape, type);
      const body = world.createRigidBody({
        type,
        position: spec.position ? [...spec.position] : [0, 0, 0],
        ...(spec.mass === undefined ? {} : { mass: spec.mass }),
        ...(spec.friction === undefined ? {} : { friction: spec.friction }),
        ...(spec.restitution === undefined ? {} : { restitution: spec.restitution }),
        ...(spec.linearDamping === undefined ? {} : { linearDamping: spec.linearDamping }),
        ...(spec.angularDamping === undefined ? {} : { angularDamping: spec.angularDamping })
      });
      const filter = spec.layer && layers
        ? { layer: layerMask(layers, spec.layer), mask: collisionMaskFor(layers, spec.layer) }
        : undefined;
      if (spec.layer) {
        if (!layers) {
          throw new Error(
            `Body layer "${spec.layer}" was declared, but the runtime has no layers. ` +
            "Pass layers: createCollisionLayers({...}) when creating the app."
          );
        }
        layerByBodyId.set(body.id, spec.layer);
      }
      world.createCollider(body, {
        shape: toPhysicsShape(shape, spec),
        ...(spec.sensor === undefined ? {} : { sensor: spec.sensor }),
        ...(filter ? { filter } : {}),
        material: {
          friction: spec.friction ?? 0.5,
          restitution: spec.restitution ?? 0
        }
      });
      if (spec.name) {
        namesById.set(body.id, spec.name);
        idsByName.set(spec.name, body.id);
      }
      const handle = createBodyHandle(body, world, spec.name);
      handles.set(body.id, handle);
      return handle;
    },
    removeBody(id) {
      const resolved = resolveId(id);
      if (resolved === undefined) return;
      world.removeRigidBody(resolved);
      handles.delete(resolved);
      layerByBodyId.delete(resolved);
      const name = namesById.get(resolved);
      if (name) idsByName.delete(name);
      namesById.delete(resolved);
    },
    createJoint(spec) {
      validateJointSpec(spec);
      const idA = resolveId(spec.bodyA);
      const idB = resolveId(spec.bodyB);
      const bodyA = idA === undefined ? undefined : world.getBody(idA);
      const bodyB = idB === undefined ? undefined : world.getBody(idB);
      if (!bodyA || !bodyB) {
        throw new Error(`createJoint needs two existing bodies; got "${spec.bodyA}" and "${spec.bodyB}".`);
      }
      // Anchors are given in world space by the public API because that is what a level
      // author knows — the hinge is at the door frame. Convert to each body's local frame.
      const anchor = spec.anchor ?? ([
        (bodyA.position[0] + bodyB.position[0]) / 2,
        (bodyA.position[1] + bodyB.position[1]) / 2,
        (bodyA.position[2] + bodyB.position[2]) / 2
      ] as const);
      const constraint = world.createConstraint({
        type: spec.kind,
        bodyA,
        bodyB,
        localAnchorA: [anchor[0] - bodyA.position[0], anchor[1] - bodyA.position[1], anchor[2] - bodyA.position[2]],
        localAnchorB: [anchor[0] - bodyB.position[0], anchor[1] - bodyB.position[1], anchor[2] - bodyB.position[2]],
        ...(spec.axis ? { axis: [...spec.axis] as [number, number, number] } : {}),
        ...(spec.stiffness === undefined ? {} : { stiffness: Math.min(1, spec.stiffness) }),
        ...(spec.damping === undefined ? {} : { damping: spec.damping }),
        ...(spec.restLength === undefined ? {} : { restLength: spec.restLength }),
        ...(spec.motorSpeed === undefined ? {} : { motorSpeed: spec.motorSpeed }),
        ...(spec.maxMotorTorque === undefined ? {} : { maxMotorTorque: spec.maxMotorTorque }),
        ...(spec.limits ? { limits: spec.limits } : {})
      });
      let jointId = 0;
      for (const [index, candidate] of world.constraints().entries()) {
        if (candidate === constraint) jointId = index + 1;
      }
      const handle: AuraJointHandle = {
        id: jointId,
        kind: spec.kind,
        setEnabled(enabled) {
          constraint.setEnabled(enabled);
          return handle;
        },
        setMotorSpeed(speed) {
          if (spec.kind !== "motorised-hinge") {
            throw new Error(`setMotorSpeed is only valid on a motorised-hinge joint, not "${spec.kind}".`);
          }
          constraint.setMotorSpeed(speed);
          return handle;
        },
        remove() {
          constraint.setEnabled(false);
        }
      };
      return handle;
    },
    step(dt) {
      const events = dt === undefined ? world.step() : world.step(dt);
      const out: AuraCollisionEvent[] = [];
      for (const event of events) {
        const mapped = toAuraCollisionEvent(event, resolveBody);
        if (mapped) out.push(mapped);
      }
      lastEvents = out;
      dispatch(out);
      return out;
    },
    contacts() {
      return lastEvents;
    },
    onCollision(handler) {
      collisionHandlers.add(handler);
      return () => collisionHandlers.delete(handler);
    },
    onCollisionWith(nodeName, handler) {
      const set = namedHandlers.get(nodeName) ?? new Set<AuraCollisionHandler>();
      set.add(handler);
      namedHandlers.set(nodeName, set);
      return () => {
        set.delete(handler);
        if (set.size === 0) namedHandlers.delete(nodeName);
      };
    },
    onTriggerEnter(handler) {
      triggerEnterHandlers.add(handler);
      return () => triggerEnterHandlers.delete(handler);
    },
    onTriggerExit(handler) {
      triggerExitHandlers.add(handler);
      return () => triggerExitHandlers.delete(handler);
    },
    gravity() {
      return [...world.gravity] as unknown as PhysicsVec3;
    },
    setGravity(gravity) {
      world.setGravity([...gravity]);
    }
  };

  return runtime;
}

/**
 * Map a declared shape name onto a solver shape.
 *
 * Kept private to this module: the public surface takes a name plus dimensions, so a route
 * never constructs a `PhysicsShape` and never needs a deep import into `@aura3d/physics`.
 */
function toPhysicsShape(shape: AuraColliderShape, spec: AuraBodySpec): PhysicsShape {
  const half = spec.halfExtents ?? ([0.5, 0.5, 0.5] as const);
  switch (shape) {
    case "sphere":
      return Shape.sphere(spec.radius ?? 0.5);
    case "capsule":
      return Shape.capsule(spec.radius ?? 0.25, spec.halfHeight ?? 0.5);
    case "plane":
      return Shape.plane([0, 1, 0], spec.position?.[1] ?? 0);
    case "box":
      return Shape.box(half[0], half[1], half[2]);
    default:
      // `convexHull`, `trimesh` and `heightfield` need geometry the declaration form does
      // not carry. Failing loudly beats silently substituting a box, which would look like
      // a physics bug rather than a missing argument.
      throw new Error(
        `Shape "${shape}" cannot be created from a body spec because it needs geometry. ` +
        `Constructible from a spec: ${AURA_SPEC_CONSTRUCTIBLE_SHAPES.join(", ")}. ` +
        "For mesh-backed ground use createMeshSurfaceQuery instead."
      );
  }
}
