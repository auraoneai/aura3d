import {
  Body as CannonBody,
  Box as CannonBox,
  ContactMaterial as CannonContactMaterial,
  ConvexPolyhedron as CannonConvexPolyhedron,
  Cylinder as CannonCylinder,
  Heightfield as CannonHeightfield,
  Material as CannonMaterial,
  Plane as CannonPlane,
  Quaternion as CannonQuaternion,
  Sphere as CannonSphere,
  Trimesh as CannonTrimesh,
  Vec3 as CannonVec3,
  World as CannonWorld
} from "cannon-es";
import { Collider, type ColliderDescriptor } from "./Collider.js";
import { CollisionEventQueue, type CollisionEvent, type Contact } from "./CollisionEvents.js";
import { Constraint, type ConstraintDescriptor } from "./Constraint.js";
import { buildNativeNarrowPhaseContact } from "./NarrowPhase.js";
import { raycastCollider, sphereCastCollider, type RaycastHit, type RaycastOptions, type SphereCastHit } from "./Raycast.js";
import { RigidBody, type RigidBodyDescriptor, type RigidBodySnapshot } from "./RigidBody.js";
import { cloneVec3, dotVec3, lengthVec3, normalizeVec3, scaleVec3, subVec3, validateFiniteVec3, type Bounds, type PhysicsShape, type Vec3 } from "./Shape.js";
import { timeOfImpact } from "./TimeOfImpact.js";

/**
 * Standard gravity, used as the floor for cannon's friction reference magnitude so that a
 * zero-gravity or low-gravity world still honours declared surface friction.
 */
const STANDARD_GRAVITY = 9.81;

export type PhysicsContinuousCollisionDescriptor = {
  /**
   * Bounds the travel of every moving collider by splitting a requested step.
   * The wrapper protects both the native and cannon-es backends.
   */
  readonly mode: "adaptive-substeps";
  /**
   * Maximum internal Cannon steps allowed for one public `step()` call.
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
  readonly provider: "none" | "aura3d-adaptive-substep-wrapper";
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
  readonly sleepVelocityThreshold?: number;
  readonly sleepDelay?: number;
  readonly continuousCollision?: PhysicsContinuousCollisionDescriptor;
};

export type PhysicsBackend = "cannon-es" | "aura-js";
export type PhysicsBackendPreference = PhysicsBackend | "auto";

export type PhysicsBackendSelection = {
  readonly requested: PhysicsBackendPreference;
  readonly active: PhysicsBackend;
  readonly fallback?: string;
  readonly deterministic: boolean;
  readonly jsFallbackAvailable: boolean;
  readonly continuousCollision: PhysicsContinuousCollisionSelection;
};

type ContactImpulseState = {
  normal: number;
  tangent: Vec3;
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
  private readonly sleepVelocityThreshold: number;
  private readonly sleepDelay: number;
  private readonly continuousCollision: NormalizedContinuousCollisionDescriptor;
  private readonly bodiesById = new Map<number, RigidBody>();
  private readonly collidersById = new Map<number, Collider>();
  private readonly constraintsList: Constraint[] = [];
  private readonly bodyColliders = new Map<number, Set<number>>();
  private readonly eventQueue = new CollisionEventQueue();
  private readonly requestedBackend: PhysicsBackendPreference;
  private backendSelection: PhysicsBackendSelection;
  private cannonWorld: CannonWorld | undefined;
  private readonly cannonBodiesByAuraId = new Map<number, CannonBody>();
  // Interned by `${friction}|${restitution}` so two colliders declaring the same surface
  // share one cannon Material, and each unordered pair gets exactly one ContactMaterial.
  private readonly cannonMaterialsByKey = new Map<string, CannonMaterial>();
  private readonly cannonContactMaterialPairs = new Set<string>();
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
    this.solverIterations = descriptor.solverIterations ?? 1;
    this.enableSleeping = descriptor.enableSleeping ?? true;
    this.sleepVelocityThreshold = descriptor.sleepVelocityThreshold ?? 0.02;
    this.sleepDelay = descriptor.sleepDelay ?? 0.5;
    this.continuousCollision = normalizeContinuousCollisionDescriptor(descriptor.continuousCollision);
    if (!Number.isFinite(this.fixedDelta) || this.fixedDelta <= 0) {
      throw new Error("fixedDelta must be a finite positive number.");
    }
    if (!Number.isInteger(this.solverIterations) || this.solverIterations <= 0) {
      throw new Error("solverIterations must be a positive integer.");
    }
    if (!Number.isFinite(this.sleepVelocityThreshold) || this.sleepVelocityThreshold < 0) {
      throw new Error("sleepVelocityThreshold must be finite and non-negative.");
    }
    if (!Number.isFinite(this.sleepDelay) || this.sleepDelay < 0) {
      throw new Error("sleepDelay must be finite and non-negative.");
    }
    this.backendSelection = {
      requested: this.requestedBackend,
      active: this.requestedBackend === "aura-js" ? "aura-js" : "cannon-es",
      deterministic: true,
      jsFallbackAvailable: true,
      continuousCollision: this.continuousCollisionSelection(true)
    };
    if (this.backendSelection.active === "cannon-es") {
      this.cannonWorld = new CannonWorld({
        gravity: toCannonVec3(this.gravity),
        allowSleep: this.enableSleeping
      });
      (this.cannonWorld.solver as { iterations?: number }).iterations = this.solverIterations;
      this.cannonWorld.defaultContactMaterial.friction = 0.5;
      this.cannonWorld.defaultContactMaterial.restitution = 0;
      this.applyCannonFrictionGravity();
    }
  }

  createRigidBody(descriptor: RigidBodyDescriptor = {}): RigidBody {
    const body = new RigidBody(this.nextBodyId, descriptor);
    this.nextBodyId += 1;
    this.bodiesById.set(body.id, body);
    this.bodyColliders.set(body.id, new Set());
    const cannonBody = this.createCannonBody(body);
    if (cannonBody) {
      this.cannonBodiesByAuraId.set(body.id, cannonBody);
      this.cannonWorld?.addBody(cannonBody);
    }
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
    this.addCannonCollider(collider);
    return collider;
  }

  createConstraint(descriptor: ConstraintDescriptor): Constraint {
    if (!this.bodiesById.has(descriptor.bodyA.id) || !this.bodiesById.has(descriptor.bodyB.id)) {
      throw new Error("Cannot create a constraint for bodies outside this PhysicsWorld.");
    }
    const constraint = new Constraint(descriptor);
    this.constraintsList.push(constraint);
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
    if (this.cannonWorld) {
      this.cannonWorld.gravity.copy(toCannonVec3(this.gravity));
      this.applyCannonFrictionGravity();
    }
  }

  /**
   * Keep cannon's friction reference force independent of world gravity magnitude.
   *
   * Defect class: engine. cannon-es bounds a contact's friction impulse by
   * `mu * reducedMass * |world.frictionGravity ?? world.gravity|`
   * (`cannon-es/dist/cannon-es.js`, `mug` in `createFrictionEquationsFromContact`). With
   * `frictionGravity` left undefined, a world built with `gravity: [0, 0, 0]` produced
   * `mug = 0`, so *every* declared `material.friction` was silently discarded: a box given
   * `velocity: [4, 0, 0]` on a `friction: 1` floor still read `vx === 3.996651` after 5 steps
   * of a zero-gravity world (measured on raw upstream cannon-es 0.20.0; the same fixture
   * reads `vx === 1.689911` once `frictionGravity` is pinned), and no combination of
   * penetration depth or `solverIterations` changed it. Zero-g and low-g worlds are a supported public configuration
   * (`setGravity`), so friction cannot be a function of how much gravity a scene happens to
   * declare — the tangential bound belongs to the contact, not to the level design.
   *
   * The reference magnitude is therefore pinned to standard gravity whenever the world's own
   * gravity is too small to bound friction, and tracks world gravity once it is larger, so
   * high-gravity worlds keep their stronger grip.
   */
  private applyCannonFrictionGravity(): void {
    if (!this.cannonWorld) return;
    const magnitude = lengthVec3(this.gravity);
    const reference = Math.max(magnitude, STANDARD_GRAVITY);
    this.cannonWorld.frictionGravity = new CannonVec3(0, -reference, 0);
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
    const cannonBody = this.cannonBodiesByAuraId.get(id);
    if (cannonBody) {
      this.cannonWorld?.removeBody(cannonBody);
      this.cannonBodiesByAuraId.delete(id);
    }
    for (let index = this.constraintsList.length - 1; index >= 0; index -= 1) {
      const constraint = this.constraintsList[index]!;
      if (constraint.bodyA.id === id || constraint.bodyB.id === id) {
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
    const removalEvents = this.eventQueue.removeCollider(id);
    if (removalEvents.length > 0) {
      this.lastEvents = [...this.lastEvents, ...removalEvents].sort((a, b) => a.pairKey.localeCompare(b.pairKey) || a.type.localeCompare(b.type));
    }
  }

  step(dt = this.fixedDelta): readonly CollisionEvent[] {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("PhysicsWorld.step dt must be finite and positive.");
    }
    if (this.cannonWorld) {
      return this.stepCannon(dt);
    }
    const continuousStep = this.planContinuousCollisionStep(dt);
    this.lastContinuousCollisionStep = continuousStep;
    this.assertContinuousCollisionPlan(continuousStep);
    const subDelta = dt / continuousStep.subSteps;
    const outerStepTransforms = new Map(
      this.bodies().map((body) => [
        body.id,
        {
          position: cloneVec3(body.position),
          rotation: [...body.rotation] as [number, number, number, number]
        }
      ])
    );
    let contacts: Contact[] = [];
    for (let subStep = 0; subStep < continuousStep.subSteps; subStep += 1) {
      for (const body of this.bodyValues()) {
        body.integrate(subDelta, this.gravity, false);
      }
      for (const constraint of this.constraintsList) {
        constraint.solve();
      }
      const contactImpulses = new Map<string, ContactImpulseState>();
      for (let i = 0; i < this.solverIterations; i += 1) {
        contacts = this.detectContacts();
        for (const contact of contacts) {
          this.resolveContact(contact, contactImpulses);
        }
        for (const constraint of this.constraintsList) {
          constraint.solve();
        }
      }
    }
    for (const body of this.bodyValues()) {
      body.clearForces();
      const outerTransform = outerStepTransforms.get(body.id);
      if (outerTransform) {
        body.previousPosition = outerTransform.position;
        body.previousRotation = outerTransform.rotation;
      }
    }
    this.lastEvents = this.eventQueue.update(contacts);
    this.updateSleeping(dt, contacts);
    this.steps += 1;
    return this.lastEvents;
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

  private detectContacts(): Contact[] {
    const potentialPairs = this.collectPotentialPairs();
    this.lastBroadphasePairs = potentialPairs.length;
    const contacts: Contact[] = [];
    for (const [a, bodyA, b, bodyB] of potentialPairs) {
      const contact = buildContact(a, bodyA, b, bodyB);
      if (contact) {
        contacts.push(contact);
      }
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

  private resolveContact(contact: Contact, contactImpulses: Map<string, ContactImpulseState>): void {
    if (contact.sensor) {
      return;
    }
    const bodyA = this.bodiesById.get(contact.bodyA);
    const bodyB = this.bodiesById.get(contact.bodyB);
    if (!bodyA || !bodyB) {
      return;
    }
    const invMassSum = bodyA.inverseMass + bodyB.inverseMass;
    if (invMassSum <= 0) {
      return;
    }
    const correction = scaleVec3(contact.normal, contact.penetration / invMassSum);
    if (bodyA.inverseMass > 0) {
      bodyA.position = [bodyA.position[0] - correction[0] * bodyA.inverseMass, bodyA.position[1] - correction[1] * bodyA.inverseMass, bodyA.position[2] - correction[2] * bodyA.inverseMass];
    }
    if (bodyB.inverseMass > 0) {
      bodyB.position = [bodyB.position[0] + correction[0] * bodyB.inverseMass, bodyB.position[1] + correction[1] * bodyB.inverseMass, bodyB.position[2] + correction[2] * bodyB.inverseMass];
    }
    const relativeVelocity = relativeContactVelocity(bodyA, bodyB, contact.point);
    const velocityAlongNormal = dotVec3(relativeVelocity, contact.normal);
    const materialA = this.effectiveMaterial(bodyA, contact.colliderA);
    const materialB = this.effectiveMaterial(bodyB, contact.colliderB);
    const restitution = Math.max(materialA.restitution, materialB.restitution);
    const pairKey = `${contact.colliderA}:${contact.colliderB}`;
    const impulseState = contactImpulses.get(pairKey) ?? { normal: 0, tangent: [0, 0, 0] };
    let normalImpulseMagnitude = 0;
    if (velocityAlongNormal <= 0) {
      const normalDenominator = contactImpulseDenominator(bodyA, bodyB, contact.normal, contact.point);
      normalImpulseMagnitude = normalDenominator > 0 ? -(1 + restitution) * velocityAlongNormal / normalDenominator : 0;
      impulseState.normal += normalImpulseMagnitude;
      this.applyImpulsePair(bodyA, bodyB, scaleVec3(contact.normal, normalImpulseMagnitude), contact.point);
    }
    const updatedRelativeVelocity = relativeContactVelocity(bodyA, bodyB, contact.point);
    const updatedNormalVelocity = dotVec3(updatedRelativeVelocity, contact.normal);
    const tangentVelocity = subVec3(updatedRelativeVelocity, scaleVec3(contact.normal, updatedNormalVelocity));
    const tangentSpeed = Math.hypot(tangentVelocity[0], tangentVelocity[1], tangentVelocity[2]);
    if (tangentSpeed > 1e-9) {
      const friction = Math.sqrt(Math.max(0, materialA.friction) * Math.max(0, materialB.friction));
      const tangent = scaleVec3(tangentVelocity, 1 / tangentSpeed);
      const tangentDenominator = contactImpulseDenominator(bodyA, bodyB, tangent, contact.point);
      const targetImpulse: Vec3 = tangentDenominator > 0 ? scaleVec3(tangentVelocity, -1 / tangentDenominator) : [0, 0, 0];
      const proposedTangent: Vec3 = [
        impulseState.tangent[0] + targetImpulse[0],
        impulseState.tangent[1] + targetImpulse[1],
        impulseState.tangent[2] + targetImpulse[2]
      ];
      const proposedMagnitude = lengthVec3(proposedTangent);
      const maxFriction = friction * impulseState.normal;
      const accumulatedTangent = proposedMagnitude > maxFriction && proposedMagnitude > 0
        ? scaleVec3(proposedTangent, maxFriction / proposedMagnitude)
        : proposedTangent;
      const frictionImpulse = subVec3(accumulatedTangent, impulseState.tangent);
      impulseState.tangent = accumulatedTangent;
      if (lengthVec3(frictionImpulse) > 0) {
        this.applyImpulsePair(bodyA, bodyB, frictionImpulse, contact.point);
      }
    }
    contactImpulses.set(pairKey, impulseState);
  }

  private effectiveMaterial(body: RigidBody, colliderId: number): { readonly restitution: number; readonly friction: number } {
    const collider = this.collidersById.get(colliderId);
    return {
      restitution: Math.max(body.restitution, collider?.material.restitution ?? 0),
      friction: Math.max(body.friction, collider?.material.friction ?? 0)
    };
  }

  private applyImpulsePair(bodyA: RigidBody, bodyB: RigidBody, impulse: Vec3, point?: Vec3): void {
    if (bodyA.inverseMass > 0) {
      if (point) bodyA.applyContactImpulseAtPoint(scaleVec3(impulse, -1), point);
      else bodyA.velocity = [bodyA.velocity[0] - impulse[0] * bodyA.inverseMass, bodyA.velocity[1] - impulse[1] * bodyA.inverseMass, bodyA.velocity[2] - impulse[2] * bodyA.inverseMass];
      if (bodyA.sleeping && bodyA.speedSquared() > this.sleepVelocityThreshold * this.sleepVelocityThreshold) {
        bodyA.wake();
      }
    }
    if (bodyB.inverseMass > 0) {
      if (point) bodyB.applyContactImpulseAtPoint(impulse, point);
      else bodyB.velocity = [bodyB.velocity[0] + impulse[0] * bodyB.inverseMass, bodyB.velocity[1] + impulse[1] * bodyB.inverseMass, bodyB.velocity[2] + impulse[2] * bodyB.inverseMass];
      if (bodyB.sleeping && bodyB.speedSquared() > this.sleepVelocityThreshold * this.sleepVelocityThreshold) {
        bodyB.wake();
      }
    }
  }

  private updateSleeping(dt: number, contacts: readonly Contact[]): void {
    if (!this.enableSleeping) {
      return;
    }
    const contactBodyIds = new Set<number>();
    for (const contact of contacts) {
      if (!contact.sensor) {
        contactBodyIds.add(contact.bodyA);
        contactBodyIds.add(contact.bodyB);
      }
    }
    const gravityMagnitudeSquared = dotVec3(this.gravity, this.gravity);
    const thresholdSquared = this.sleepVelocityThreshold * this.sleepVelocityThreshold;
    for (const body of this.bodyValues()) {
      if (body.type !== "dynamic") {
        continue;
      }
      if (body.speedSquared() > thresholdSquared) {
        body.resetSleepTimer();
        continue;
      }
      const supportedOrUnaccelerated = contactBodyIds.has(body.id) || gravityMagnitudeSquared <= thresholdSquared;
      if (!supportedOrUnaccelerated) {
        body.resetSleepTimer();
        continue;
      }
      if (body.accumulateSleepTime(dt) >= this.sleepDelay) {
        body.sleep();
      }
    }
  }

  private createCannonBody(body: RigidBody): CannonBody | undefined {
    if (!this.cannonWorld) return undefined;
    const cannonBody = new CannonBody({
      type: body.type === "static" ? CannonBody.STATIC : body.type === "kinematic" ? CannonBody.KINEMATIC : CannonBody.DYNAMIC,
      mass: body.type === "dynamic" ? body.mass : 0,
      position: toCannonVec3(body.position),
      velocity: toCannonVec3(body.velocity),
      quaternion: new CannonQuaternion(body.rotation[0], body.rotation[1], body.rotation[2], body.rotation[3]),
      angularVelocity: toCannonVec3(body.angularVelocity),
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
      allowSleep: this.enableSleeping,
      sleepSpeedLimit: this.sleepVelocityThreshold,
      sleepTimeLimit: this.sleepDelay
    });
    if (body.sleeping) cannonBody.sleep();
    applyDeclaredCannonInertia(body, cannonBody);
    return cannonBody;
  }

  private addCannonCollider(collider: Collider): void {
    if (!this.cannonWorld) return;
    const body = this.bodiesById.get(collider.bodyId);
    const cannonBody = this.cannonBodiesByAuraId.get(collider.bodyId);
    if (!body || !cannonBody) return;
    const resolved = toCannonShape(collider.shape);
    if (!resolved) {
      this.disableCannonBackend(`unsupported shape '${collider.shape.kind}'`);
      return;
    }
    cannonBody.collisionFilterGroup = collider.filter.layer;
    cannonBody.collisionFilterMask = collider.filter.mask;
    cannonBody.isTrigger = cannonBody.isTrigger || collider.sensor;
    // Defect class: engine. The collider's `material` was validated, stored, and read by the
    // aura-js resolver, but never handed to cannon -- so on the production backend every
    // surface used `defaultContactMaterial` (friction 0.3, restitution 0). A collider
    // declaring `restitution: 1` did not bounce and `friction: 1` did not grip.
    const surface = this.internCannonMaterial(collider.material.friction, collider.material.restitution);
    resolved.shape.material = surface;
    cannonBody.material = surface;
    cannonBody.addShape(resolved.shape, resolved.offset, resolved.orientation);
    cannonBody.updateMassProperties();
    // `updateMassProperties` recomputes inertia from the collider geometry and overwrites
    // anything set at construction, so a declared inertia has to be re-applied after every
    // shape addition, not only once.
    applyDeclaredCannonInertia(body, cannonBody);
    syncCannonFromAura(body, cannonBody);
  }

  private internCannonMaterial(friction: number, restitution: number): CannonMaterial {
    const key = `${friction}|${restitution}`;
    const existing = this.cannonMaterialsByKey.get(key);
    if (existing) return existing;
    const created = new CannonMaterial({ friction, restitution });
    this.cannonMaterialsByKey.set(key, created);
    // cannon combines a pair's properties from an explicit ContactMaterial when one exists,
    // and silently falls back to `defaultContactMaterial` when it does not. Register the
    // pairing against every known surface -- including itself -- so no declared pair is
    // resolved by the default.
    for (const other of this.cannonMaterialsByKey.values()) {
      const pairKey = created.id <= other.id ? `${created.id}:${other.id}` : `${other.id}:${created.id}`;
      if (this.cannonContactMaterialPairs.has(pairKey)) continue;
      this.cannonContactMaterialPairs.add(pairKey);
      this.cannonWorld?.addContactMaterial(
        new CannonContactMaterial(created, other, {
          // Pairwise combination matches the aura-js resolver: friction multiplies (so a
          // frictionless surface stays frictionless against anything), restitution takes
          // the maximum (so one elastic surface is enough to bounce).
          friction: created.friction * other.friction,
          restitution: Math.max(created.restitution, other.restitution)
        })
      );
    }
    return created;
  }

  private disableCannonBackend(reason: string): void {
    if (!this.cannonWorld) return;
    this.cannonWorld = undefined;
    this.cannonBodiesByAuraId.clear();
    this.backendSelection = {
      requested: this.requestedBackend,
      active: "aura-js",
      fallback: reason,
      deterministic: true,
      jsFallbackAvailable: true,
      continuousCollision: this.continuousCollisionSelection(true)
    };
  }

  private stepCannon(dt: number): readonly CollisionEvent[] {
    if (!this.cannonWorld) return [];
    this.cannonWorld.gravity.copy(toCannonVec3(this.gravity));
    for (const body of this.bodyValues()) {
      const cannonBody = this.cannonBodiesByAuraId.get(body.id);
      if (cannonBody) syncCannonFromAura(body, cannonBody);
    }
    const continuousStep = this.planContinuousCollisionStep(dt);
    this.lastContinuousCollisionStep = continuousStep;
    this.assertContinuousCollisionPlan(continuousStep);
    const subSteps = continuousStep.subSteps;
    const subDelta = dt / subSteps;
    for (let index = 0; index < subSteps; index += 1) {
      this.cannonWorld.step(subDelta);
      // Solve constraints inside the substep loop, and mirror the result back into the
      // cannon bodies before the next substep.
      //
      // Defect class: engine. Before this, `stepCannon` never called `constraint.solve()`,
      // so on the default `cannon-es` backend every joint was a silent no-op — a body on a
      // `fixed` joint free-fell to y=-18.8 over two seconds instead of hanging. The
      // aura-js branch always solved them, which is why the joint unit tests passed while
      // the shipped default backend ignored joints entirely.
      if (this.constraintsList.length > 0) {
        for (const body of this.bodyValues()) {
          const cannonBody = this.cannonBodiesByAuraId.get(body.id);
          if (cannonBody) syncAuraFromCannon(cannonBody, body);
        }
        for (let iteration = 0; iteration < this.solverIterations; iteration += 1) {
          for (const constraint of this.constraintsList) constraint.solve();
        }
        for (const body of this.bodyValues()) {
          const cannonBody = this.cannonBodiesByAuraId.get(body.id);
          if (cannonBody) syncCannonFromAura(body, cannonBody);
        }
      }
    }
    for (const body of this.bodyValues()) {
      const cannonBody = this.cannonBodiesByAuraId.get(body.id);
      if (cannonBody) syncAuraFromCannon(cannonBody, body);
    }
    const contacts = this.detectContacts();
    this.lastEvents = this.eventQueue.update(contacts);
    this.updateSleeping(dt, contacts);
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
      provider: active ? "aura3d-adaptive-substep-wrapper" : "none",
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

function toCannonVec3(value: Vec3): CannonVec3 {
  return new CannonVec3(value[0], value[1], value[2]);
}

function fromCannonVec3(value: CannonVec3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function syncCannonFromAura(body: RigidBody, cannonBody: CannonBody): void {
  cannonBody.position.set(body.position[0], body.position[1], body.position[2]);
  cannonBody.velocity.set(body.velocity[0], body.velocity[1], body.velocity[2]);
  cannonBody.quaternion.set(body.rotation[0], body.rotation[1], body.rotation[2], body.rotation[3]);
  cannonBody.angularVelocity.set(body.angularVelocity[0], body.angularVelocity[1], body.angularVelocity[2]);
  /*
   * Forward accumulated force and torque to the backend.
   *
   * `RigidBody.applyForce`/`applyTorque` accumulate into private accumulators that only
   * `RigidBody.integrate()` reads — and `integrate()` is the `aura-js` fallback path. On
   * the default `cannon-es` backend this sync copied position, velocity and rotation but
   * dropped the accumulators, so **`applyForce` was silently a no-op**: a developer could
   * call it every frame and the body would never accelerate. Impulses worked, because
   * those mutate velocity directly, which made the gap look like a physics quirk rather
   * than a missing bridge.
   *
   * Cleared on the Aura side after forwarding, so a force applied once is applied once —
   * matching the accumulate-then-clear contract `integrate()` already implements.
   */
  const force = body.pendingForce();
  if (force[0] !== 0 || force[1] !== 0 || force[2] !== 0) {
    cannonBody.applyForce(toCannonVec3(force));
  }
  const torque = body.pendingTorque();
  if (torque[0] !== 0 || torque[1] !== 0 || torque[2] !== 0) {
    cannonBody.torque.set(
      cannonBody.torque.x + torque[0],
      cannonBody.torque.y + torque[1],
      cannonBody.torque.z + torque[2]
    );
  }
  if (force[0] !== 0 || force[1] !== 0 || force[2] !== 0 || torque[0] !== 0 || torque[1] !== 0 || torque[2] !== 0) {
    body.clearForces();
  }
  if (body.sleeping) cannonBody.sleep();
  else cannonBody.wakeUp();
}

/**
 * Forward an explicitly declared principal inertia to the backend.
 *
 * Defect class: engine, and the same class as the joint and `applyForce` no-ops.
 * `RigidBodyDescriptor.inertia` was validated (rejecting non-positive moments), stored as
 * `inverseInertia`, and read by the `aura-js` integrator -- but never handed to cannon.
 * cannon derives inertia from collider geometry in `updateMassProperties`, and a body with
 * no collider gets **zero** inertia, hence zero inverse inertia. The observable result was
 * that `applyTorque` did nothing at all on the default backend and a declared inertia
 * tensor was silently ignored when it did: a caller could ask for `inertia: [2, 4, 8]`,
 * get no error, and watch the body refuse to spin.
 *
 * Only applied when the descriptor asked for it. Bodies that took the mass-derived default
 * keep cannon's geometry-derived tensor, which is the more physically accurate of the two.
 */
function applyDeclaredCannonInertia(body: RigidBody, cannonBody: CannonBody): void {
  const declared = body.declaredInertia;
  if (!declared || body.type !== "dynamic") return;
  cannonBody.inertia.set(declared[0], declared[1], declared[2]);
  cannonBody.invInertia.set(1 / declared[0], 1 / declared[1], 1 / declared[2]);
  cannonBody.updateInertiaWorld(true);
}

function syncAuraFromCannon(cannonBody: CannonBody, body: RigidBody): void {
  body.previousPosition = cloneVec3(body.position);
  body.previousRotation = [body.rotation[0], body.rotation[1], body.rotation[2], body.rotation[3]];
  body.position = fromCannonVec3(cannonBody.position);
  body.velocity = fromCannonVec3(cannonBody.velocity);
  body.angularVelocity = fromCannonVec3(cannonBody.angularVelocity);
  body.rotation = [cannonBody.quaternion.x, cannonBody.quaternion.y, cannonBody.quaternion.z, cannonBody.quaternion.w];
  body.sleeping = cannonBody.sleepState === CannonBody.SLEEPING;
}

function toCannonShape(shape: PhysicsShape): { readonly shape: CannonBox | CannonSphere | CannonPlane | CannonCylinder | CannonTrimesh | CannonConvexPolyhedron | CannonHeightfield; readonly offset?: CannonVec3; readonly orientation?: CannonQuaternion } | undefined {
  if (shape.kind === "box") return { shape: new CannonBox(toCannonVec3(shape.halfExtents)) };
  if (shape.kind === "sphere") return { shape: new CannonSphere(shape.radius) };
  if (shape.kind === "capsule") return { shape: new CannonCylinder(shape.radius, shape.radius, shape.halfHeight * 2 + shape.radius * 2, 12) };
  if (shape.kind === "plane") {
    const orientation = new CannonQuaternion();
    orientation.setFromVectors(new CannonVec3(0, 0, 1), toCannonVec3(shape.normal));
    return {
      shape: new CannonPlane(),
      offset: toCannonVec3(scaleVec3(shape.normal, shape.constant)),
      orientation
    };
  }
  if (shape.kind === "mesh") {
    // cannon-es Trimesh takes flat vertex/index arrays. Concave triangle soup is supported
    // for static and kinematic colliders; dynamic trimesh-vs-trimesh is a documented
    // cannon-es limitation. Before this, `mesh` fell through to `undefined` and tripped
    // `disableCannonBackend`, silently swapping the whole world onto the `aura-js` branch
    // -- the same divergence class as the joint no-op recorded below in `stepCannon`.
    const vertices: number[] = [];
    for (const vertex of shape.vertices) vertices.push(vertex[0], vertex[1], vertex[2]);
    return { shape: new CannonTrimesh(vertices, [...shape.indices]) };
  }
  if (shape.kind === "convex-hull") {
    const vertices = shape.vertices.map((vertex) => new CannonVec3(vertex[0], vertex[1], vertex[2]));
    const faces: number[][] = [];
    for (let index = 0; index + 2 < shape.indices.length; index += 3) {
      const a = shape.indices[index];
      const b = shape.indices[index + 1];
      const c = shape.indices[index + 2];
      if (a === undefined || b === undefined || c === undefined) continue;
      faces.push([a, b, c]);
    }
    if (vertices.length < 4 || faces.length < 4) return undefined;
    return { shape: new CannonConvexPolyhedron({ vertices, faces }) };
  }
  if (shape.kind === "heightfield") {
    // Aura stores heights row-major; cannon-es Heightfield indexes data[x][y].
    const data: number[][] = [];
    for (let column = 0; column < shape.columns; column += 1) {
      const strip: number[] = [];
      for (let row = 0; row < shape.rows; row += 1) {
        strip.push(shape.heights[row * shape.columns + column] ?? 0);
      }
      data.push(strip);
    }
    return { shape: new CannonHeightfield(data, { elementSize: shape.cellSize }) };
  }
  return undefined;
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

function relativeContactVelocity(bodyA: RigidBody, bodyB: RigidBody, point?: Vec3): Vec3 {
  if (!point) return subVec3(bodyB.velocity, bodyA.velocity);
  const radiusA = subVec3(point, bodyA.position);
  const radiusB = subVec3(point, bodyB.position);
  const velocityA = addVectors(bodyA.velocity, crossVectors(bodyA.angularVelocity, radiusA));
  const velocityB = addVectors(bodyB.velocity, crossVectors(bodyB.angularVelocity, radiusB));
  return subVec3(velocityB, velocityA);
}

function contactImpulseDenominator(bodyA: RigidBody, bodyB: RigidBody, direction: Vec3, point?: Vec3): number {
  let denominator = bodyA.inverseMass + bodyB.inverseMass;
  if (!point) return denominator;
  if (bodyA.inverseMass > 0) {
    const radius = subVec3(point, bodyA.position);
    const angular = bodyA.multiplyInverseInertiaWorld(crossVectors(radius, direction));
    denominator += dotVec3(direction, crossVectors(angular, radius));
  }
  if (bodyB.inverseMass > 0) {
    const radius = subVec3(point, bodyB.position);
    const angular = bodyB.multiplyInverseInertiaWorld(crossVectors(radius, direction));
    denominator += dotVec3(direction, crossVectors(angular, radius));
  }
  return denominator;
}

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

function buildContact(a: Collider, bodyA: RigidBody, b: Collider, bodyB: RigidBody): Contact | undefined {
  const ab = subVec3(bodyB.position, bodyA.position);
  if (a.shape.kind === "plane" || b.shape.kind === "plane") {
    const planeCollider = a.shape.kind === "plane" ? a : b;
    const planeBody = a.shape.kind === "plane" ? bodyA : bodyB;
    const otherCollider = a.shape.kind === "plane" ? b : a;
    const otherBody = a.shape.kind === "plane" ? bodyB : bodyA;
    if (planeCollider.shape.kind !== "plane") {
      return undefined;
    }
    const radius = supportRadius(otherCollider);
    const signedDistance = dotVec3(planeCollider.shape.normal, otherBody.position) + planeCollider.shape.constant + dotVec3(planeCollider.shape.normal, planeBody.position);
    if (signedDistance > radius) {
      return undefined;
    }
    const normal = a.shape.kind === "plane" ? planeCollider.shape.normal : scaleVec3(planeCollider.shape.normal, -1);
    return {
      colliderA: a.id,
      colliderB: b.id,
      bodyA: bodyA.id,
      bodyB: bodyB.id,
      normal,
      penetration: radius - signedDistance,
      sensor: a.sensor || b.sensor
    };
  }
  if (a.shape.kind === "sphere" && b.shape.kind === "sphere") {
    const distance = Math.hypot(ab[0], ab[1], ab[2]);
    const radiusSum = a.shape.radius + b.shape.radius;
    if (distance >= radiusSum) {
      return undefined;
    }
    return {
      colliderA: a.id,
      colliderB: b.id,
      bodyA: bodyA.id,
      bodyB: bodyB.id,
      normal: distance > 1e-9 ? [ab[0] / distance, ab[1] / distance, ab[2] / distance] : [1, 0, 0],
      penetration: radiusSum - distance,
      sensor: a.sensor || b.sensor
    };
  }
  if ((a.shape.kind === "sphere" && b.shape.kind === "box") || (a.shape.kind === "box" && b.shape.kind === "sphere")) {
    return buildSphereBoxContact(a, bodyA, b, bodyB);
  }
  if ((a.shape.kind === "capsule" && b.shape.kind === "sphere") || (a.shape.kind === "sphere" && b.shape.kind === "capsule")) {
    return buildCapsuleSphereContact(a, bodyA, b, bodyB);
  }
  if ((a.shape.kind === "capsule" && b.shape.kind === "box") || (a.shape.kind === "box" && b.shape.kind === "capsule")) {
    return buildCapsuleBoxContact(a, bodyA, b, bodyB);
  }
  if (a.shape.kind === "capsule" && b.shape.kind === "capsule") {
    return buildCapsuleCapsuleContact(a, bodyA, b, bodyB);
  }
  const nativeContact = buildNativeNarrowPhaseContact(a, bodyA, b, bodyB);
  if (nativeContact) {
    return {
      colliderA: a.id,
      colliderB: b.id,
      bodyA: bodyA.id,
      bodyB: bodyB.id,
      normal: nativeContact.normal,
      penetration: nativeContact.penetration,
      point: nativeContact.point,
      sensor: a.sensor || b.sensor
    };
  }
  const boundsA = a.bounds(bodyA.position);
  const boundsB = b.bounds(bodyB.position);
  const overlapX = Math.min(boundsA.max[0] - boundsB.min[0], boundsB.max[0] - boundsA.min[0]);
  const overlapY = Math.min(boundsA.max[1] - boundsB.min[1], boundsB.max[1] - boundsA.min[1]);
  const overlapZ = Math.min(boundsA.max[2] - boundsB.min[2], boundsB.max[2] - boundsA.min[2]);
  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
    return undefined;
  }
  let normal: Vec3 = [Math.sign(ab[0]) || 1, 0, 0];
  let penetration = overlapX;
  if (overlapY < penetration) {
    normal = [0, Math.sign(ab[1]) || 1, 0];
    penetration = overlapY;
  }
  if (overlapZ < penetration) {
    normal = [0, 0, Math.sign(ab[2]) || 1];
    penetration = overlapZ;
  }
  return {
    colliderA: a.id,
    colliderB: b.id,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    normal,
    penetration,
    sensor: a.sensor || b.sensor
  };
}

function buildSphereBoxContact(a: Collider, bodyA: RigidBody, b: Collider, bodyB: RigidBody): Contact | undefined {
  const sphereCollider = a.shape.kind === "sphere" ? a : b;
  const sphereBody = a.shape.kind === "sphere" ? bodyA : bodyB;
  const boxCollider = a.shape.kind === "box" ? a : b;
  const boxBody = a.shape.kind === "box" ? bodyA : bodyB;
  if (sphereCollider.shape.kind !== "sphere" || boxCollider.shape.kind !== "box") {
    return undefined;
  }
  const boxBounds = boxCollider.bounds(boxBody.position);
  const closest: Vec3 = [
    clamp(sphereBody.position[0], boxBounds.min[0], boxBounds.max[0]),
    clamp(sphereBody.position[1], boxBounds.min[1], boxBounds.max[1]),
    clamp(sphereBody.position[2], boxBounds.min[2], boxBounds.max[2])
  ];
  const fromBoxToSphere = subVec3(sphereBody.position, closest);
  const distance = Math.hypot(fromBoxToSphere[0], fromBoxToSphere[1], fromBoxToSphere[2]);
  if (distance >= sphereCollider.shape.radius) {
    return undefined;
  }
  const normalFromBoxToSphere = distance > 1e-9 ? scaleVec3(fromBoxToSphere, 1 / distance) : axisFromBoxCenter(boxBody.position, sphereBody.position, boxCollider.shape.halfExtents);
  const normal = a.shape.kind === "box" ? normalFromBoxToSphere : scaleVec3(normalFromBoxToSphere, -1);
  return {
    colliderA: a.id,
    colliderB: b.id,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    normal,
    penetration: sphereCollider.shape.radius - distance,
    sensor: a.sensor || b.sensor
  };
}

function buildCapsuleSphereContact(a: Collider, bodyA: RigidBody, b: Collider, bodyB: RigidBody): Contact | undefined {
  const capsuleCollider = a.shape.kind === "capsule" ? a : b;
  const capsuleBody = a.shape.kind === "capsule" ? bodyA : bodyB;
  const sphereCollider = a.shape.kind === "sphere" ? a : b;
  const sphereBody = a.shape.kind === "sphere" ? bodyA : bodyB;
  if (capsuleCollider.shape.kind !== "capsule" || sphereCollider.shape.kind !== "sphere") {
    return undefined;
  }
  const closest = closestPointOnSegment(sphereBody.position, capsuleSegment(capsuleBody.position, capsuleCollider.shape.halfHeight));
  const delta = subVec3(sphereBody.position, closest);
  const distance = Math.hypot(delta[0], delta[1], delta[2]);
  const radiusSum = capsuleCollider.shape.radius + sphereCollider.shape.radius;
  if (distance >= radiusSum) {
    return undefined;
  }
  const normalFromCapsuleToSphere = distance > 1e-9 ? scaleVec3(delta, 1 / distance) : [1, 0, 0] as Vec3;
  const normal = a.shape.kind === "capsule" ? normalFromCapsuleToSphere : scaleVec3(normalFromCapsuleToSphere, -1);
  return {
    colliderA: a.id,
    colliderB: b.id,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    normal,
    penetration: radiusSum - distance,
    sensor: a.sensor || b.sensor
  };
}

function buildCapsuleCapsuleContact(a: Collider, bodyA: RigidBody, b: Collider, bodyB: RigidBody): Contact | undefined {
  if (a.shape.kind !== "capsule" || b.shape.kind !== "capsule") {
    return undefined;
  }
  const closest = closestPointsBetweenSegments(
    capsuleSegment(bodyA.position, a.shape.halfHeight),
    capsuleSegment(bodyB.position, b.shape.halfHeight)
  );
  const delta = subVec3(closest.b, closest.a);
  const distance = Math.hypot(delta[0], delta[1], delta[2]);
  const radiusSum = a.shape.radius + b.shape.radius;
  if (distance >= radiusSum) {
    return undefined;
  }
  return {
    colliderA: a.id,
    colliderB: b.id,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    normal: distance > 1e-9 ? scaleVec3(delta, 1 / distance) : [1, 0, 0],
    penetration: radiusSum - distance,
    sensor: a.sensor || b.sensor
  };
}

function buildCapsuleBoxContact(a: Collider, bodyA: RigidBody, b: Collider, bodyB: RigidBody): Contact | undefined {
  const capsuleCollider = a.shape.kind === "capsule" ? a : b;
  const capsuleBody = a.shape.kind === "capsule" ? bodyA : bodyB;
  const boxCollider = a.shape.kind === "box" ? a : b;
  const boxBody = a.shape.kind === "box" ? bodyA : bodyB;
  if (capsuleCollider.shape.kind !== "capsule" || boxCollider.shape.kind !== "box") {
    return undefined;
  }
  const bounds = boxCollider.bounds(boxBody.position);
  const closest = closestVerticalSegmentPointToAabb(capsuleBody.position, capsuleCollider.shape.halfHeight, bounds);
  const fromBoxToCapsule = subVec3(closest.segmentPoint, closest.boxPoint);
  const distance = Math.hypot(fromBoxToCapsule[0], fromBoxToCapsule[1], fromBoxToCapsule[2]);
  if (distance >= capsuleCollider.shape.radius) {
    return undefined;
  }
  const normalFromBoxToCapsule = distance > 1e-9 ? scaleVec3(fromBoxToCapsule, 1 / distance) : axisFromBoxCenter(boxBody.position, closest.segmentPoint, boxCollider.shape.halfExtents);
  const normal = a.shape.kind === "box" ? normalFromBoxToCapsule : scaleVec3(normalFromBoxToCapsule, -1);
  return {
    colliderA: a.id,
    colliderB: b.id,
    bodyA: bodyA.id,
    bodyB: bodyB.id,
    normal,
    penetration: capsuleCollider.shape.radius - distance,
    sensor: a.sensor || b.sensor
  };
}

type Segment = {
  readonly start: Vec3;
  readonly end: Vec3;
};

function capsuleSegment(position: Vec3, halfHeight: number): Segment {
  return {
    start: [position[0], position[1] - halfHeight, position[2]],
    end: [position[0], position[1] + halfHeight, position[2]]
  };
}

function closestPointOnSegment(point: Vec3, segment: Segment): Vec3 {
  const ab = subVec3(segment.end, segment.start);
  const lengthSquared = dotVec3(ab, ab);
  if (lengthSquared <= 1e-9) {
    return segment.start;
  }
  const t = clamp(dotVec3(subVec3(point, segment.start), ab) / lengthSquared, 0, 1);
  return [
    segment.start[0] + ab[0] * t,
    segment.start[1] + ab[1] * t,
    segment.start[2] + ab[2] * t
  ];
}

function closestPointsBetweenSegments(a: Segment, b: Segment): { readonly a: Vec3; readonly b: Vec3 } {
  const d1 = subVec3(a.end, a.start);
  const d2 = subVec3(b.end, b.start);
  const r = subVec3(a.start, b.start);
  const aLength = dotVec3(d1, d1);
  const bLength = dotVec3(d2, d2);
  const d12 = dotVec3(d1, d2);
  const d1r = dotVec3(d1, r);
  const d2r = dotVec3(d2, r);
  const denominator = aLength * bLength - d12 * d12;
  let s = denominator <= 1e-9 ? 0 : clamp((d12 * d2r - bLength * d1r) / denominator, 0, 1);
  let t = bLength <= 1e-9 ? 0 : (d12 * s + d2r) / bLength;
  if (t < 0) {
    t = 0;
    s = aLength <= 1e-9 ? 0 : clamp(-d1r / aLength, 0, 1);
  } else if (t > 1) {
    t = 1;
    s = aLength <= 1e-9 ? 0 : clamp((d12 - d1r) / aLength, 0, 1);
  }
  return {
    a: [a.start[0] + d1[0] * s, a.start[1] + d1[1] * s, a.start[2] + d1[2] * s],
    b: [b.start[0] + d2[0] * t, b.start[1] + d2[1] * t, b.start[2] + d2[2] * t]
  };
}

function closestVerticalSegmentPointToAabb(position: Vec3, halfHeight: number, bounds: Bounds): { readonly segmentPoint: Vec3; readonly boxPoint: Vec3 } {
  const segmentMinY = position[1] - halfHeight;
  const segmentMaxY = position[1] + halfHeight;
  let segmentY: number;
  let boxY: number;
  if (segmentMaxY < bounds.min[1]) {
    segmentY = segmentMaxY;
    boxY = bounds.min[1];
  } else if (segmentMinY > bounds.max[1]) {
    segmentY = segmentMinY;
    boxY = bounds.max[1];
  } else {
    segmentY = clamp(position[1], Math.max(segmentMinY, bounds.min[1]), Math.min(segmentMaxY, bounds.max[1]));
    boxY = segmentY;
  }
  const segmentPoint: Vec3 = [position[0], segmentY, position[2]];
  const boxPoint: Vec3 = [
    clamp(position[0], bounds.min[0], bounds.max[0]),
    boxY,
    clamp(position[2], bounds.min[2], bounds.max[2])
  ];
  return { segmentPoint, boxPoint };
}

function axisFromBoxCenter(boxPosition: Vec3, spherePosition: Vec3, halfExtents: Vec3): Vec3 {
  const local = subVec3(spherePosition, boxPosition);
  const distances: readonly [number, Vec3][] = [
    [halfExtents[0] - Math.abs(local[0]), [Math.sign(local[0]) || 1, 0, 0]],
    [halfExtents[1] - Math.abs(local[1]), [0, Math.sign(local[1]) || 1, 0]],
    [halfExtents[2] - Math.abs(local[2]), [0, 0, Math.sign(local[2]) || 1]]
  ];
  return distances.reduce((best, candidate) => candidate[0] < best[0] ? candidate : best)[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function supportRadius(collider: Collider): number {
  switch (collider.shape.kind) {
    case "box":
      return collider.shape.halfExtents[1];
    case "sphere":
      return collider.shape.radius;
    case "capsule":
      return collider.shape.radius + collider.shape.halfHeight;
    case "plane":
      return 0;
    case "mesh": {
      const bounds = collider.bounds([0, 0, 0]);
      return Math.max(Math.abs(bounds.min[1]), Math.abs(bounds.max[1]));
    }
    case "convex-hull":
    case "heightfield": {
      const bounds = collider.bounds([0, 0, 0]);
      return Math.max(Math.abs(bounds.min[1]), Math.abs(bounds.max[1]));
    }
  }
}
