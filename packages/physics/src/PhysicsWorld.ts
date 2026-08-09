import {
  createRapierPhysicsSync,
  type RapierBodyHandle,
  type RapierColliderHandle,
  type RapierJointHandle,
  type RapierPhysicsWorld
} from "@aura3d/physics-rapier";
import { Collider, type ColliderDescriptor } from "./Collider.js";
import { CollisionEventQueue, type CollisionEvent, type Contact } from "./CollisionEvents.js";
import { Constraint, type ConstraintDescriptor } from "./Constraint.js";
import { raycastCollider, sphereCastCollider, type RaycastHit, type RaycastOptions, type SphereCastHit } from "./Raycast.js";
import { RigidBody, type RigidBodyDescriptor, type RigidBodySnapshot } from "./RigidBody.js";
import { cloneVec3, dotVec3, lengthVec3, normalizeVec3, scaleVec3, subVec3, validateFiniteVec3, type Bounds, type PhysicsShape, type Vec3 } from "./Shape.js";
import { timeOfImpact } from "./TimeOfImpact.js";

export type PhysicsContinuousCollisionDescriptor = {
  /**
   * Bounds the travel of every moving collider by splitting a requested step.
   * The wrapper bounds motion in addition to Rapier's native CCD.
   */
  readonly mode: "adaptive-substeps";
  /**
   * Maximum internal Rapier steps allowed for one public `step()` call.
   * The default overflow policy throws rather than silently losing the CCD
   * guarantee.
   */
  readonly maxSubSteps?: number;
  /**
   * Maximum travel per internal step as a fraction of the smallest finite
   * collider feature in the world. Defaults to 0.5.
   */
  readonly motionThreshold?: number;
  readonly onSubstepLimit?: "error" | "clamp";
};

export type PhysicsContinuousCollisionSelection = {
  readonly active: boolean;
  readonly mode: "disabled" | "adaptive-substeps";
  readonly provider: "none" | "rapier-native-ccd+adaptive-substeps";
  readonly maxSubSteps: number;
  readonly motionThreshold: number;
  readonly onSubstepLimit: "error" | "clamp";
  readonly lastSubSteps: number;
  readonly lastRequiredSubSteps: number;
  readonly lastMaxMotion: number;
  readonly lastMinColliderFeature?: number;
  readonly lastTimeOfImpact?: number;
  readonly limitExceeded: boolean;
};

export type PhysicsWorldDescriptor = {
  readonly backend?: PhysicsBackendPreference;
  readonly gravity?: Vec3;
  readonly fixedDelta?: number;
  readonly solverIterations?: number;
  readonly enableSleeping?: boolean;
  /** @deprecated Rapier owns its native sleep thresholds. Retained for source compatibility. */
  readonly sleepVelocityThreshold?: number;
  /** @deprecated Rapier owns its native sleep delay. Retained for source compatibility. */
  readonly sleepDelay?: number;
  readonly continuousCollision?: PhysicsContinuousCollisionDescriptor;
};

/**
 * The one production solver.
 *
 * The backend bake-off and subsequent 1.6 replatform selected Rapier as the single
 * physical owner. The former in-house and Cannon paths have been removed.
 *
 * Keeping two solvers was not a safety net, it was the defect generator: every
 * behaviour implemented by only one branch shipped as a silent divergence. The stable
 * public descriptors now delegate joints, forces, contacts, sleep, CCD, and all supported
 * collider shapes to the same selected adapter.
 *
 * One solver means a passing test and a shipped route execute the same code. Per R12 this
 * capability now has exactly one owner.
 */
export type PhysicsBackend = "rapier";
export type PhysicsBackendPreference = PhysicsBackend | "auto";

export type PhysicsBackendSelection = {
  readonly requested: PhysicsBackendPreference;
  readonly active: PhysicsBackend;
  readonly deterministic: boolean;
  readonly continuousCollision: PhysicsContinuousCollisionSelection;
};

export type PhysicsStepStats = {
  readonly steps: number;
  readonly bodies: number;
  readonly colliders: number;
  readonly constraints: number;
  readonly broadphasePairs: number;
  readonly broadphaseFiniteColliders: number;
  readonly broadphaseInfiniteColliders: number;
  readonly broadphaseCandidateTests: number;
  readonly broadphaseActiveMax: number;
  readonly broadphaseRejectedByBounds: number;
  readonly contacts: number;
  readonly events: number;
  readonly sleepingBodies: number;
  readonly kineticEnergy: number;
  readonly maxContactPenetration: number;
};

export type PhysicsSnapshot = {
  readonly backend: PhysicsBackendSelection;
  readonly bodies: readonly RigidBodySnapshot[];
  readonly contacts: readonly Contact[];
  readonly stats: PhysicsStepStats;
};

export class PhysicsWorld {
  readonly gravity: [number, number, number];
  readonly fixedDelta: number;
  private readonly solverIterations: number;
  private readonly enableSleeping: boolean;
  private readonly continuousCollision: NormalizedContinuousCollisionDescriptor;
  private readonly bodiesById = new Map<number, RigidBody>();
  private readonly collidersById = new Map<number, Collider>();
  private readonly constraintsList: Constraint[] = [];
  private readonly bodyColliders = new Map<number, Set<number>>();
  private readonly eventQueue = new CollisionEventQueue();
  private readonly requestedBackend: PhysicsBackendPreference;
  private backendSelection: PhysicsBackendSelection;
  private readonly rapierWorld: RapierPhysicsWorld;
  private readonly rapierBodiesByAuraId = new Map<number, RapierBodyHandle>();
  private readonly rapierCollidersByAuraId = new Map<number, RapierColliderHandle>();
  private readonly rapierJointsByConstraint = new Map<Constraint, RapierJointHandle>();
  private nextBodyId = 1;
  private nextColliderId = 1;
  private lastEvents: readonly CollisionEvent[] = [];
  private lastBroadphasePairs = 0;
  private lastBroadphaseProfile: BroadphaseProfile = emptyBroadphaseProfile();
  private lastContinuousCollisionStep: ContinuousCollisionStepPlan = emptyContinuousCollisionStepPlan();
  private steps = 0;

  constructor(descriptor: PhysicsWorldDescriptor = {}) {
    this.requestedBackend = descriptor.backend ?? "auto";
    this.gravity = cloneVec3(descriptor.gravity ?? [0, -9.81, 0]);
    this.fixedDelta = descriptor.fixedDelta ?? 1 / 60;
    // Keep the established public default while configuring Rapier's native solver.
    this.solverIterations = descriptor.solverIterations ?? 10;
    this.enableSleeping = descriptor.enableSleeping ?? true;
    this.continuousCollision = normalizeContinuousCollisionDescriptor(descriptor.continuousCollision);
    if (!Number.isFinite(this.fixedDelta) || this.fixedDelta <= 0) {
      throw new Error("fixedDelta must be a finite positive number.");
    }
    if (!Number.isInteger(this.solverIterations) || this.solverIterations <= 0) {
      throw new Error("solverIterations must be a positive integer.");
    }
    if (descriptor.sleepVelocityThreshold !== undefined && (!Number.isFinite(descriptor.sleepVelocityThreshold) || descriptor.sleepVelocityThreshold < 0)) {
      throw new Error("sleepVelocityThreshold must be finite and non-negative.");
    }
    if (descriptor.sleepDelay !== undefined && (!Number.isFinite(descriptor.sleepDelay) || descriptor.sleepDelay < 0)) {
      throw new Error("sleepDelay must be finite and non-negative.");
    }
    if (this.requestedBackend !== "auto" && this.requestedBackend !== "rapier") {
      // Reached from JavaScript callers and from code compiled against 1.5.x, where
      // `"aura-js"` was a selectable backend. Failing loudly is the point: the previous
      // behaviour of that string was "quietly run a different solver".
      throw new Error(
        `Unknown physics backend '${String(this.requestedBackend)}'. Aura3D 2.0 has one ` +
          "production solver, 'rapier'; the legacy 'aura-js' and 'cannon-es' backends were removed " +
          "(see docs/architecture/physics-backend-decision.md). Omit `backend` or pass " +
          "'rapier'."
      );
    }
    this.backendSelection = {
      requested: this.requestedBackend,
      active: "rapier",
      deterministic: true,
      continuousCollision: this.continuousCollisionSelection(true)
    };
    this.rapierWorld = createRapierPhysicsSync({ gravity: this.gravity });
    this.rapierWorld.unsafeRapierWorld().integrationParameters.numSolverIterations = this.solverIterations;
  }

  createRigidBody(descriptor: RigidBodyDescriptor = {}): RigidBody {
    const body = new RigidBody(this.nextBodyId, descriptor);
    this.nextBodyId += 1;
    this.bodiesById.set(body.id, body);
    this.bodyColliders.set(body.id, new Set());
    const rapierBody = this.rapierWorld.createRigidBody({
      type: body.type === "static" ? "fixed" : body.type === "kinematic" ? "kinematic-position" : "dynamic",
      position: body.position,
      rotation: body.rotation,
      linearVelocity: body.velocity,
      angularVelocity: body.angularVelocity,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      ccd: body.type === "dynamic",
      canSleep: this.enableSleeping,
      ...(body.type === "dynamic" ? { mass: body.mass } : {}),
      ...(body.declaredInertia ? { principalAngularInertia: body.declaredInertia } : {})
    });
    if (body.sleeping) rapierBody.sleep();
    this.rapierBodiesByAuraId.set(body.id, rapierBody);
    return body;
  }

  createCollider(body: RigidBody | number, descriptor: ColliderDescriptor): Collider {
    const bodyId = typeof body === "number" ? body : body.id;
    if (!this.bodiesById.has(bodyId)) {
      throw new Error(`Cannot create collider for missing body ${bodyId}.`);
    }
    const collider = new Collider(this.nextColliderId, bodyId, descriptor);
    this.nextColliderId += 1;
    this.collidersById.set(collider.id, collider);
    this.bodyColliders.get(bodyId)?.add(collider.id);
    const rapierBody = this.rapierBodiesByAuraId.get(bodyId);
    if (!rapierBody) throw new Error(`Missing Rapier body for Aura body ${bodyId}.`);
    const rapierCollider = this.rapierWorld.createCollider(rapierBody, {
      shape: collider.shape,
      density: 0,
      friction: collider.material.friction,
      restitution: collider.material.restitution,
      sensor: collider.sensor,
      collisionGroups: encodeRapierCollisionGroups(collider.filter.layer, collider.filter.mask)
    });
    this.rapierCollidersByAuraId.set(collider.id, rapierCollider);
    return collider;
  }

  createConstraint(descriptor: ConstraintDescriptor): Constraint {
    if (!this.bodiesById.has(descriptor.bodyA.id) || !this.bodiesById.has(descriptor.bodyB.id)) {
      throw new Error("Cannot create a constraint for bodies outside this PhysicsWorld.");
    }
    const constraint = new Constraint(descriptor);
    this.constraintsList.push(constraint);
    this.rapierJointsByConstraint.set(constraint, this.createRapierJoint(constraint));
    return constraint;
  }

  /**
   * Change world gravity after construction.
   *
   * Needed for anything that flips or scales gravity at runtime — a low-gravity level, a
   * zero-g section, a game that inverts it as a mechanic. Without a setter the only way to
   * change it was to rebuild the world and lose every body.
   */
  setGravity(gravity: Vec3): void {
    validateFiniteVec3(gravity, "world gravity");
    this.gravity[0] = gravity[0];
    this.gravity[1] = gravity[1];
    this.gravity[2] = gravity[2];
    this.rapierWorld.setGravity(this.gravity);
  }

  getBody(id: number): RigidBody | undefined {
    return this.bodiesById.get(id);
  }

  getCollider(id: number): Collider | undefined {
    return this.collidersById.get(id);
  }

  bodies(): readonly RigidBody[] {
    return Array.from(this.bodiesById.values()).sort((a, b) => a.id - b.id);
  }

  colliders(): readonly Collider[] {
    return Array.from(this.collidersById.values()).sort((a, b) => a.id - b.id);
  }

  private bodyValues(): IterableIterator<RigidBody> {
    return this.bodiesById.values();
  }

  private colliderValues(): IterableIterator<Collider> {
    return this.collidersById.values();
  }

  constraints(): readonly Constraint[] {
    return [...this.constraintsList];
  }

  removeRigidBody(id: number): void {
    const colliderIds = Array.from(this.bodyColliders.get(id) ?? []);
    for (const colliderId of colliderIds) {
      this.removeCollider(colliderId);
    }
    this.bodyColliders.delete(id);
    this.bodiesById.delete(id);
    const rapierBody = this.rapierBodiesByAuraId.get(id);
    if (rapierBody) {
      this.rapierWorld.removeBody(rapierBody);
      this.rapierBodiesByAuraId.delete(id);
    }
    for (let index = this.constraintsList.length - 1; index >= 0; index -= 1) {
      const constraint = this.constraintsList[index]!;
      if (constraint.bodyA.id === id || constraint.bodyB.id === id) {
        const joint = this.rapierJointsByConstraint.get(constraint);
        if (joint) joint.remove();
        this.rapierJointsByConstraint.delete(constraint);
        this.constraintsList.splice(index, 1);
      }
    }
  }

  removeCollider(id: number): void {
    const collider = this.collidersById.get(id);
    if (!collider) {
      return;
    }
    this.bodyColliders.get(collider.bodyId)?.delete(id);
    this.collidersById.delete(id);
    const rapierCollider = this.rapierCollidersByAuraId.get(id);
    if (rapierCollider) rapierCollider.remove();
    this.rapierCollidersByAuraId.delete(id);
    const removalEvents = this.eventQueue.removeCollider(id);
    if (removalEvents.length > 0) {
      this.lastEvents = [...this.lastEvents, ...removalEvents].sort((a, b) => a.pairKey.localeCompare(b.pairKey) || a.type.localeCompare(b.type));
    }
  }

  step(dt = this.fixedDelta): readonly CollisionEvent[] {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("PhysicsWorld.step dt must be finite and positive.");
    }
    return this.stepProduction(dt);
  }

  drainEvents(): readonly CollisionEvent[] {
    const events = this.lastEvents;
    this.lastEvents = [];
    return events;
  }

  raycast(origin: Vec3, direction: Vec3, options: RaycastOptions = {}): RaycastHit | undefined {
    const normalized = normalizeVec3(direction);
    return this.raycastAll(origin, normalized, options)[0];
  }

  raycastAll(origin: Vec3, direction: Vec3, options: RaycastOptions = {}): readonly RaycastHit[] {
    const normalized = normalizeVec3(direction);
    const hits: RaycastHit[] = [];
    for (const collider of this.colliderValues()) {
      const body = this.bodiesById.get(collider.bodyId);
      if (!body) {
        continue;
      }
      if (options.ignoreColliders?.includes(collider.id) || options.ignoreBodies?.includes(collider.bodyId)) {
        continue;
      }
      const hit = raycastCollider(origin, normalized, collider, body, options);
      if (hit) {
        hits.push(hit);
      }
    }
    hits.sort((a, b) => a.distance - b.distance || a.colliderId - b.colliderId);
    return hits;
  }

  sphereCast(origin: Vec3, radius: number, direction: Vec3, options: RaycastOptions = {}): SphereCastHit | undefined {
    return this.sphereCastAll(origin, radius, direction, options)[0];
  }

  sphereCastAll(origin: Vec3, radius: number, direction: Vec3, options: RaycastOptions = {}): readonly SphereCastHit[] {
    const normalized = normalizeVec3(direction);
    const hits: SphereCastHit[] = [];
    for (const collider of this.colliderValues()) {
      const body = this.bodiesById.get(collider.bodyId);
      if (!body) {
        continue;
      }
      if (options.ignoreColliders?.includes(collider.id) || options.ignoreBodies?.includes(collider.bodyId)) {
        continue;
      }
      const hit = sphereCastCollider(origin, radius, normalized, collider, body, options);
      if (hit) {
        hits.push(hit);
      }
    }
    hits.sort((a, b) => a.distance - b.distance || a.colliderId - b.colliderId);
    return hits;
  }

  snapshot(): PhysicsSnapshot {
    const contacts = this.eventQueue.snapshotContacts();
    const bodies = this.bodies();
    return {
      backend: {
        ...this.backendSelection,
        continuousCollision: this.continuousCollisionSelection(true)
      },
      bodies: bodies.map((body) => body.snapshot()),
      contacts,
      stats: {
        steps: this.steps,
        bodies: this.bodiesById.size,
        colliders: this.collidersById.size,
        constraints: this.constraintsList.length,
        broadphasePairs: this.lastBroadphasePairs,
        broadphaseFiniteColliders: this.lastBroadphaseProfile.finiteColliders,
        broadphaseInfiniteColliders: this.lastBroadphaseProfile.infiniteColliders,
        broadphaseCandidateTests: this.lastBroadphaseProfile.candidateTests,
        broadphaseActiveMax: this.lastBroadphaseProfile.activeMax,
        broadphaseRejectedByBounds: this.lastBroadphaseProfile.rejectedByBounds,
        contacts: contacts.length,
        events: this.lastEvents.length,
        sleepingBodies: bodies.filter((body) => body.sleeping).length,
        kineticEnergy: totalKineticEnergy(bodies),
        maxContactPenetration: contacts.reduce((max, contact) => Math.max(max, contact.penetration), 0)
      }
    };
  }

  /** Release the selected native solver and every world-owned handle. Idempotent. */
  dispose(): void {
    this.rapierWorld.dispose();
    this.rapierJointsByConstraint.clear();
    this.rapierCollidersByAuraId.clear();
    this.rapierBodiesByAuraId.clear();
    this.constraintsList.length = 0;
    this.collidersById.clear();
    this.bodiesById.clear();
    this.bodyColliders.clear();
    this.lastEvents = [];
  }

  private detectContacts(): Contact[] {
    const potentialPairs = this.collectPotentialPairs();
    this.lastBroadphasePairs = potentialPairs.length;
    const contacts: Contact[] = [];
    for (const [a, bodyA, b, bodyB] of potentialPairs) {
      const colliderA = this.rapierCollidersByAuraId.get(a.id)?.unsafeRapierCollider();
      const colliderB = this.rapierCollidersByAuraId.get(b.id)?.unsafeRapierCollider();
      if (!colliderA || !colliderB) continue;
      if (a.sensor || b.sensor) {
        if (!this.rapierWorld.unsafeRapierWorld().intersectionPair(colliderA, colliderB)) continue;
        const separation = subVec3(bodyB.position, bodyA.position);
        const normal = lengthVec3(separation) > 1e-9 ? normalizeVec3(separation) : [0, 1, 0] as const;
        contacts.push({ colliderA: a.id, colliderB: b.id, bodyA: bodyA.id, bodyB: bodyB.id, normal, penetration: 0, sensor: true });
        continue;
      }
      let best: Contact | undefined;
      this.rapierWorld.unsafeRapierWorld().contactPair(colliderA, colliderB, (manifold, flipped) => {
        const normalValue = manifold.normal();
        const direction = flipped ? -1 : 1;
        const normal: Vec3 = [normalValue.x * direction, normalValue.y * direction, normalValue.z * direction];
        const count = Math.max(manifold.numSolverContacts(), manifold.numContacts());
        for (let index = 0; index < count; index += 1) {
          const distance = index < manifold.numSolverContacts() ? manifold.solverContactDist(index) : manifold.contactDist(index);
          const penetration = Math.max(0, -distance);
          const pointValue = index < manifold.numSolverContacts() ? manifold.solverContactPoint(index) : undefined;
          const candidate: Contact = {
            colliderA: a.id,
            colliderB: b.id,
            bodyA: bodyA.id,
            bodyB: bodyB.id,
            normal,
            penetration,
            ...(pointValue ? { point: [pointValue.x, pointValue.y, pointValue.z] as Vec3 } : {}),
            sensor: false
          };
          if (!best || candidate.penetration > best.penetration) best = candidate;
        }
      });
      if (best) contacts.push(best);
    }
    contacts.sort((a, b) => a.colliderA - b.colliderA || a.colliderB - b.colliderB);
    return contacts;
  }

  private collectPotentialPairs(): readonly PotentialPair[] {
    const finiteEntries: BroadphaseEntry[] = [];
    const infiniteEntries: BroadphaseEntry[] = [];
    const profile = emptyBroadphaseProfile();
    for (const collider of this.colliderValues()) {
      const body = this.bodiesById.get(collider.bodyId);
      if (!body) {
        continue;
      }
      const bounds = collider.bounds(body.position, body.rotation);
      const entry = { collider, body, bounds };
      if (isFiniteBounds(bounds)) {
        finiteEntries.push(entry);
        profile.finiteColliders += 1;
      } else {
        infiniteEntries.push(entry);
        profile.infiniteColliders += 1;
      }
    }

    finiteEntries.sort((a, b) => a.bounds.min[0] - b.bounds.min[0] || a.collider.id - b.collider.id);
    const pairs: PotentialPair[] = [];
    const seen = new Set<string>();
    const active: BroadphaseEntry[] = [];

    for (const entry of finiteEntries) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index]!.bounds.max[0] < entry.bounds.min[0]) {
          active.splice(index, 1);
        }
      }
      for (const other of active) {
        profile.candidateTests += 1;
        if (boundsOverlap(other.bounds, entry.bounds)) {
          pushPotentialPair(pairs, seen, other, entry);
        } else {
          profile.rejectedByBounds += 1;
        }
      }
      for (const infinite of infiniteEntries) {
        profile.candidateTests += 1;
        pushPotentialPair(pairs, seen, infinite, entry);
      }
      active.push(entry);
      profile.activeMax = Math.max(profile.activeMax, active.length);
    }

    for (let i = 0; i < infiniteEntries.length; i += 1) {
      for (let j = i + 1; j < infiniteEntries.length; j += 1) {
        profile.candidateTests += 1;
        pushPotentialPair(pairs, seen, infiniteEntries[i]!, infiniteEntries[j]!);
      }
    }

    pairs.sort((a, b) => a[0].id - b[0].id || a[2].id - b[2].id);
    this.lastBroadphaseProfile = profile;
    return pairs;
  }

  private createRapierJoint(constraint: Constraint): RapierJointHandle {
    const bodyA = this.rapierBodiesByAuraId.get(constraint.bodyA.id);
    const bodyB = this.rapierBodiesByAuraId.get(constraint.bodyB.id);
    if (!bodyA || !bodyB) throw new Error("Cannot create a Rapier joint for missing bodies.");
    return this.rapierWorld.createJoint({
      type: constraint.type,
      localAnchorA:
        constraint.type === "fixed"
        && constraint.localAnchorA.every((value) => value === 0)
        && constraint.localAnchorB.every((value) => value === 0)
          ? constraint.restOffset
          : constraint.localAnchorA,
      localAnchorB: constraint.localAnchorB,
      axis: constraint.axis,
      restLength: constraint.restLength,
      stiffness: constraint.stiffness,
      damping: constraint.damping,
      motorSpeed: constraint.motorSpeed(),
      maxMotorTorque: Number.isFinite(constraint.maxMotorTorque) ? constraint.maxMotorTorque : Number.MAX_VALUE,
      ...(constraint.limits ? { limits: constraint.limits } : {})
    }, bodyA, bodyB);
  }

  private synchronizeRapierJoints(): void {
    for (const constraint of this.constraintsList) {
      const existing = this.rapierJointsByConstraint.get(constraint);
      if (!constraint.isEnabled()) {
        if (existing) existing.remove();
        this.rapierJointsByConstraint.delete(constraint);
        continue;
      }
      const joint = existing ?? this.createRapierJoint(constraint);
      this.rapierJointsByConstraint.set(constraint, joint);
      if (constraint.type === "motorised-hinge") {
        joint.configureMotor(
          constraint.motorSpeed(),
          Number.isFinite(constraint.maxMotorTorque) ? constraint.maxMotorTorque : Number.MAX_VALUE
        );
      }
    }
  }

  private stepProduction(dt: number): readonly CollisionEvent[] {
    this.rapierWorld.setGravity(this.gravity);
    const stepForces = new Map<number, { readonly force: Vec3; readonly torque: Vec3 }>();
    for (const body of this.bodyValues()) {
      const rapierBody = this.rapierBodiesByAuraId.get(body.id);
      if (!rapierBody) continue;
      const force = body.pendingForce();
      const torque = body.pendingTorque();
      if (force[0] !== 0 || force[1] !== 0 || force[2] !== 0 || torque[0] !== 0 || torque[1] !== 0 || torque[2] !== 0) {
        stepForces.set(body.id, { force, torque });
        body.clearForces();
      }
      syncRapierFromAura(body, rapierBody);
    }
    this.synchronizeRapierJoints();
    const continuousStep = this.planContinuousCollisionStep(dt);
    this.lastContinuousCollisionStep = continuousStep;
    this.assertContinuousCollisionPlan(continuousStep);
    const subDelta = dt / continuousStep.subSteps;
    for (let index = 0; index < continuousStep.subSteps; index += 1) {
      for (const [bodyId, pending] of stepForces) {
        const raw = this.rapierBodiesByAuraId.get(bodyId)?.unsafeRapierBody();
        if (!raw) continue;
        raw.resetForces(false);
        raw.resetTorques(false);
        raw.addForce(toRapierVector(pending.force), true);
        raw.addTorque(toRapierVector(pending.torque), true);
      }
      this.rapierWorld.step(subDelta);
    }
    for (const bodyId of stepForces.keys()) {
      const raw = this.rapierBodiesByAuraId.get(bodyId)?.unsafeRapierBody();
      raw?.resetForces(false);
      raw?.resetTorques(false);
    }
    for (const body of this.bodyValues()) {
      const rapierBody = this.rapierBodiesByAuraId.get(body.id);
      if (rapierBody) syncAuraFromRapier(rapierBody, body);
    }
    const contacts = this.detectContacts();
    this.lastEvents = this.eventQueue.update(contacts);
    this.steps += 1;
    return this.lastEvents;
  }

  private planContinuousCollisionStep(dt: number): ContinuousCollisionStepPlan {
    if (!this.continuousCollision.active) {
      return emptyContinuousCollisionStepPlan();
    }
    let maxMotion = 0;
    for (const body of this.bodyValues()) {
      if (body.type === "static" || body.sleeping) continue;
      const bodyRadius = this.bodyBoundingRadius(body.id);
      const linearMotion = lengthVec3(body.velocity) * dt;
      const angularMotion = lengthVec3(body.angularVelocity) * bodyRadius * dt;
      maxMotion = Math.max(maxMotion, linearMotion + angularMotion);
    }
    const minColliderFeature = this.smallestFiniteColliderFeature();
    const earliestImpact = this.earliestTimeOfImpact(dt);
    if (maxMotion <= 0 || minColliderFeature === undefined) {
      return {
        subSteps: 1,
        requiredSubSteps: 1,
        maxMotion,
        minColliderFeature,
        timeOfImpact: earliestImpact,
        limitExceeded: false
      };
    }
    const maxMotionPerSubstep = minColliderFeature * this.continuousCollision.motionThreshold;
    const requiredSubSteps = Math.max(1, Math.ceil(maxMotion / maxMotionPerSubstep));
    const limitExceeded = requiredSubSteps > this.continuousCollision.maxSubSteps;
    return {
      subSteps: Math.min(requiredSubSteps, this.continuousCollision.maxSubSteps),
      requiredSubSteps,
      maxMotion,
      minColliderFeature,
      timeOfImpact: earliestImpact,
      limitExceeded
    };
  }

  private earliestTimeOfImpact(dt: number): number | undefined {
    let earliest: number | undefined;
    const colliders = this.colliders();
    for (let firstIndex = 0; firstIndex < colliders.length; firstIndex += 1) {
      const colliderA = colliders[firstIndex]!;
      const bodyA = this.bodiesById.get(colliderA.bodyId);
      if (!bodyA) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < colliders.length; secondIndex += 1) {
        const colliderB = colliders[secondIndex]!;
        const bodyB = this.bodiesById.get(colliderB.bodyId);
        if (
          !bodyB ||
          bodyA.id === bodyB.id ||
          (bodyA.type !== "dynamic" && bodyB.type !== "dynamic") ||
          !colliderA.canCollideWith(colliderB)
        ) {
          continue;
        }
        const impact = timeOfImpact(
          colliderA.shape,
          bodyA.position,
          bodyA.velocity,
          colliderB.shape,
          bodyB.position,
          bodyB.velocity,
          dt
        );
        if (impact && (earliest === undefined || impact.time < earliest)) {
          earliest = impact.time;
        }
      }
    }
    return earliest;
  }

  private assertContinuousCollisionPlan(plan: ContinuousCollisionStepPlan): void {
    if (plan.limitExceeded && this.continuousCollision.onSubstepLimit === "error") {
      throw new Error(
        `PhysicsWorld adaptive-substep CCD requires ${plan.requiredSubSteps} substeps, ` +
        `above maxSubSteps ${this.continuousCollision.maxSubSteps}. Increase maxSubSteps, reduce dt, ` +
        "or use a swept movement query; the step was rejected so tunneling is not silently accepted."
      );
    }
  }

  private smallestFiniteColliderFeature(): number | undefined {
    let smallest: number | undefined;
    for (const collider of this.colliderValues()) {
      const feature = colliderFeatureSize(collider.shape);
      if (feature === undefined) continue;
      smallest = smallest === undefined ? feature : Math.min(smallest, feature);
    }
    return smallest;
  }

  private bodyBoundingRadius(bodyId: number): number {
    let radius = 0;
    for (const colliderId of this.bodyColliders.get(bodyId) ?? []) {
      const collider = this.collidersById.get(colliderId);
      if (collider) radius = Math.max(radius, colliderBoundingRadius(collider.shape));
    }
    return radius;
  }

  private continuousCollisionSelection(backendSupportsWrapper: boolean): PhysicsContinuousCollisionSelection {
    const active = this.continuousCollision.active && backendSupportsWrapper;
    return {
      active,
      mode: active ? "adaptive-substeps" : "disabled",
      provider: active ? "rapier-native-ccd+adaptive-substeps" : "none",
      maxSubSteps: this.continuousCollision.maxSubSteps,
      motionThreshold: this.continuousCollision.motionThreshold,
      onSubstepLimit: this.continuousCollision.onSubstepLimit,
      lastSubSteps: active ? this.lastContinuousCollisionStep.subSteps : 1,
      lastRequiredSubSteps: active ? this.lastContinuousCollisionStep.requiredSubSteps : 1,
      lastMaxMotion: active ? this.lastContinuousCollisionStep.maxMotion : 0,
      ...(active && this.lastContinuousCollisionStep.minColliderFeature !== undefined
        ? { lastMinColliderFeature: this.lastContinuousCollisionStep.minColliderFeature }
        : {}),
      ...(active && this.lastContinuousCollisionStep.timeOfImpact !== undefined
        ? { lastTimeOfImpact: this.lastContinuousCollisionStep.timeOfImpact }
        : {}),
      limitExceeded: active && this.lastContinuousCollisionStep.limitExceeded
    };
  }
}

type NormalizedContinuousCollisionDescriptor = {
  readonly active: boolean;
  readonly maxSubSteps: number;
  readonly motionThreshold: number;
  readonly onSubstepLimit: "error" | "clamp";
};

type ContinuousCollisionStepPlan = {
  readonly subSteps: number;
  readonly requiredSubSteps: number;
  readonly maxMotion: number;
  readonly minColliderFeature?: number;
  readonly timeOfImpact?: number;
  readonly limitExceeded: boolean;
};

function normalizeContinuousCollisionDescriptor(
  descriptor: PhysicsContinuousCollisionDescriptor | undefined
): NormalizedContinuousCollisionDescriptor {
  if (!descriptor) {
    return {
      active: false,
      maxSubSteps: 1,
      motionThreshold: 0.5,
      onSubstepLimit: "error"
    };
  }
  const maxSubSteps = descriptor.maxSubSteps ?? 256;
  const motionThreshold = descriptor.motionThreshold ?? 0.5;
  const onSubstepLimit = descriptor.onSubstepLimit ?? "error";
  if (!Number.isInteger(maxSubSteps) || maxSubSteps < 1) {
    throw new Error("continuousCollision.maxSubSteps must be a positive integer.");
  }
  if (!Number.isFinite(motionThreshold) || motionThreshold <= 0 || motionThreshold > 1) {
    throw new Error("continuousCollision.motionThreshold must be finite and in the range (0, 1].");
  }
  return {
    active: true,
    maxSubSteps,
    motionThreshold,
    onSubstepLimit
  };
}

function emptyContinuousCollisionStepPlan(): ContinuousCollisionStepPlan {
  return {
    subSteps: 1,
    requiredSubSteps: 1,
    maxMotion: 0,
    limitExceeded: false
  };
}

function colliderFeatureSize(shape: PhysicsShape): number | undefined {
  if (shape.kind === "box") return Math.min(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]);
  if (shape.kind === "sphere" || shape.kind === "capsule") return shape.radius;
  return undefined;
}

function colliderBoundingRadius(shape: PhysicsShape): number {
  if (shape.kind === "box") return Math.hypot(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]);
  if (shape.kind === "sphere") return shape.radius;
  if (shape.kind === "capsule") return shape.radius + shape.halfHeight;
  if (shape.kind === "mesh") {
    return shape.vertices.reduce((radius, vertex) => Math.max(radius, lengthVec3(vertex)), 0);
  }
  return 0;
}

function toRapierVector(value: Vec3): { x: number; y: number; z: number } {
  return { x: value[0], y: value[1], z: value[2] };
}

function encodeRapierCollisionGroups(layer: number, mask: number): number {
  return (((layer & 0xffff) << 16) | (mask & 0xffff)) >>> 0;
}

/** Mirror the public Aura body state onto its sole physical-simulation owner. */
function syncRapierFromAura(body: RigidBody, rapierBody: RapierBodyHandle): void {
  const raw = rapierBody.unsafeRapierBody();
  raw.setTranslation(toRapierVector(body.position), false);
  raw.setRotation({ x: body.rotation[0], y: body.rotation[1], z: body.rotation[2], w: body.rotation[3] }, false);
  raw.setLinvel(toRapierVector(body.velocity), false);
  raw.setAngvel(toRapierVector(body.angularVelocity), false);
  raw.setLinearDamping(body.linearDamping);
  raw.setAngularDamping(body.angularDamping);
  if (body.sleeping) raw.sleep();
  else if (raw.isSleeping()) raw.wakeUp();
}

/** Publish Rapier's solved transform and velocity through the stable Aura wrapper. */
function syncAuraFromRapier(rapierBody: RapierBodyHandle, body: RigidBody): void {
  const raw = rapierBody.unsafeRapierBody();
  const position = raw.translation();
  const rotation = raw.rotation();
  const velocity = raw.linvel();
  const angularVelocity = raw.angvel();
  body.previousPosition = cloneVec3(body.position);
  body.previousRotation = [body.rotation[0], body.rotation[1], body.rotation[2], body.rotation[3]];
  body.position = [position.x, position.y, position.z];
  body.rotation = [rotation.x, rotation.y, rotation.z, rotation.w];
  body.velocity = [velocity.x, velocity.y, velocity.z];
  body.angularVelocity = [angularVelocity.x, angularVelocity.y, angularVelocity.z];
  body.sleeping = raw.isSleeping();
}

function totalKineticEnergy(bodies: readonly RigidBody[]): number {
  let total = 0;
  for (const body of bodies) {
    if (body.type !== "dynamic") {
      continue;
    }
    const linearSpeedSquared = dotVec3(body.velocity, body.velocity);
    const angularEnergy = body.angularVelocity.reduce((sum, velocity, index) => {
      const inverseInertia = body.inverseInertia[index] ?? 0;
      return inverseInertia > 0 ? sum + 0.5 * velocity * velocity / inverseInertia : sum;
    }, 0);
    total += 0.5 * body.mass * linearSpeedSquared + angularEnergy;
  }
  return total;
}

type BroadphaseEntry = {
  readonly collider: Collider;
  readonly body: RigidBody;
  readonly bounds: Bounds;
};

type PotentialPair = readonly [Collider, RigidBody, Collider, RigidBody];

type BroadphaseProfile = {
  finiteColliders: number;
  infiniteColliders: number;
  candidateTests: number;
  activeMax: number;
  rejectedByBounds: number;
};

function addVectors(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function crossVectors(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function emptyBroadphaseProfile(): BroadphaseProfile {
  return {
    finiteColliders: 0,
    infiniteColliders: 0,
    candidateTests: 0,
    activeMax: 0,
    rejectedByBounds: 0
  };
}

function isFiniteBounds(bounds: Bounds): boolean {
  return isFiniteBoundValue(bounds.min[0]) && isFiniteBoundValue(bounds.min[1]) && isFiniteBoundValue(bounds.min[2]) &&
    isFiniteBoundValue(bounds.max[0]) && isFiniteBoundValue(bounds.max[1]) && isFiniteBoundValue(bounds.max[2]);
}

function isFiniteBoundValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < Number.MAX_SAFE_INTEGER;
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2];
}

function pushPotentialPair(pairs: PotentialPair[], seen: Set<string>, a: BroadphaseEntry, b: BroadphaseEntry): void {
  if (a.collider.bodyId === b.collider.bodyId || !a.collider.canCollideWith(b.collider)) {
    return;
  }
  if (a.body.type !== "dynamic" && b.body.type !== "dynamic") {
    return;
  }
  const first = a.collider.id < b.collider.id ? a : b;
  const second = a.collider.id < b.collider.id ? b : a;
  const key = `${first.collider.id}:${second.collider.id}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  pairs.push([first.collider, first.body, second.collider, second.body]);
}
