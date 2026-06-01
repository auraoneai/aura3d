import {
  Body as CannonBody,
  Box as CannonBox,
  Cylinder as CannonCylinder,
  Plane as CannonPlane,
  Quaternion as CannonQuaternion,
  Sphere as CannonSphere,
  Vec3 as CannonVec3,
  World as CannonWorld
} from "cannon-es";
import { Collider, type ColliderDescriptor } from "./Collider.js";
import { CollisionEventQueue, type CollisionEvent, type Contact } from "./CollisionEvents.js";
import { Constraint, type ConstraintDescriptor } from "./Constraint.js";
import { raycastCollider, sphereCastCollider, type RaycastHit, type RaycastOptions, type SphereCastHit } from "./Raycast.js";
import { RigidBody, type RigidBodyDescriptor, type RigidBodySnapshot } from "./RigidBody.js";
import { cloneVec3, dotVec3, normalizeVec3, scaleVec3, subVec3, type Bounds, type PhysicsShape, type Vec3 } from "./Shape.js";

export type PhysicsWorldDescriptor = {
  readonly backend?: PhysicsBackendPreference;
  readonly gravity?: Vec3;
  readonly fixedDelta?: number;
  readonly solverIterations?: number;
  readonly enableSleeping?: boolean;
  readonly sleepVelocityThreshold?: number;
  readonly sleepDelay?: number;
};

export type PhysicsBackend = "cannon-es" | "aura-js";
export type PhysicsBackendPreference = PhysicsBackend | "auto";

export type PhysicsBackendSelection = {
  readonly requested: PhysicsBackendPreference;
  readonly active: PhysicsBackend;
  readonly fallback?: string;
  readonly deterministic: boolean;
  readonly jsFallbackAvailable: boolean;
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
  private readonly bodiesById = new Map<number, RigidBody>();
  private readonly collidersById = new Map<number, Collider>();
  private readonly constraintsList: Constraint[] = [];
  private readonly bodyColliders = new Map<number, Set<number>>();
  private readonly eventQueue = new CollisionEventQueue();
  private readonly requestedBackend: PhysicsBackendPreference;
  private backendSelection: PhysicsBackendSelection;
  private cannonWorld: CannonWorld | undefined;
  private readonly cannonBodiesByAuraId = new Map<number, CannonBody>();
  private nextBodyId = 1;
  private nextColliderId = 1;
  private lastEvents: readonly CollisionEvent[] = [];
  private lastBroadphasePairs = 0;
  private lastBroadphaseProfile: BroadphaseProfile = emptyBroadphaseProfile();
  private steps = 0;

  constructor(descriptor: PhysicsWorldDescriptor = {}) {
    this.requestedBackend = descriptor.backend ?? "auto";
    this.gravity = cloneVec3(descriptor.gravity ?? [0, -9.81, 0]);
    this.fixedDelta = descriptor.fixedDelta ?? 1 / 60;
    this.solverIterations = descriptor.solverIterations ?? 1;
    this.enableSleeping = descriptor.enableSleeping ?? true;
    this.sleepVelocityThreshold = descriptor.sleepVelocityThreshold ?? 0.02;
    this.sleepDelay = descriptor.sleepDelay ?? 0.5;
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
      jsFallbackAvailable: true
    };
    if (this.backendSelection.active === "cannon-es") {
      this.cannonWorld = new CannonWorld({
        gravity: toCannonVec3(this.gravity),
        allowSleep: this.enableSleeping
      });
      (this.cannonWorld.solver as { iterations?: number }).iterations = this.solverIterations;
      this.cannonWorld.defaultContactMaterial.friction = 0.5;
      this.cannonWorld.defaultContactMaterial.restitution = 0;
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
    for (const body of this.bodyValues()) {
      body.integrate(dt, this.gravity);
    }
    for (const constraint of this.constraintsList) {
      constraint.solve();
    }
    let contacts: Contact[] = [];
    for (let i = 0; i < this.solverIterations; i += 1) {
      contacts = this.detectContacts();
      for (const contact of contacts) {
        this.resolveContact(contact);
      }
      for (const constraint of this.constraintsList) {
        constraint.solve();
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
      backend: this.backendSelection,
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
      const bounds = collider.bounds(body.position);
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

  private resolveContact(contact: Contact): void {
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
    const relativeVelocity = subVec3(bodyB.velocity, bodyA.velocity);
    const velocityAlongNormal = dotVec3(relativeVelocity, contact.normal);
    const materialA = this.effectiveMaterial(bodyA, contact.colliderA);
    const materialB = this.effectiveMaterial(bodyB, contact.colliderB);
    const restitution = Math.max(materialA.restitution, materialB.restitution);
    let normalImpulseMagnitude = 0;
    if (velocityAlongNormal <= 0) {
      normalImpulseMagnitude = -(1 + restitution) * velocityAlongNormal / invMassSum;
      this.applyImpulsePair(bodyA, bodyB, scaleVec3(contact.normal, normalImpulseMagnitude));
    }
    const updatedRelativeVelocity = subVec3(bodyB.velocity, bodyA.velocity);
    const updatedNormalVelocity = dotVec3(updatedRelativeVelocity, contact.normal);
    const tangentVelocity = subVec3(updatedRelativeVelocity, scaleVec3(contact.normal, updatedNormalVelocity));
    const tangentSpeed = Math.hypot(tangentVelocity[0], tangentVelocity[1], tangentVelocity[2]);
    if (tangentSpeed > 1e-9) {
      const tangent = scaleVec3(tangentVelocity, 1 / tangentSpeed);
      const friction = Math.sqrt(Math.max(0, materialA.friction) * Math.max(0, materialB.friction));
      const targetMagnitude = -dotVec3(updatedRelativeVelocity, tangent) / invMassSum;
      const maxFriction = friction * (Math.abs(normalImpulseMagnitude) + contact.penetration);
      const frictionMagnitude = Math.max(-maxFriction, Math.min(maxFriction, targetMagnitude));
      if (frictionMagnitude !== 0) {
        this.applyImpulsePair(bodyA, bodyB, scaleVec3(tangent, frictionMagnitude));
      }
    }
  }

  private effectiveMaterial(body: RigidBody, colliderId: number): { readonly restitution: number; readonly friction: number } {
    const collider = this.collidersById.get(colliderId);
    return {
      restitution: Math.max(body.restitution, collider?.material.restitution ?? 0),
      friction: Math.max(body.friction, collider?.material.friction ?? 0)
    };
  }

  private applyImpulsePair(bodyA: RigidBody, bodyB: RigidBody, impulse: Vec3): void {
    if (bodyA.inverseMass > 0) {
      bodyA.velocity = [bodyA.velocity[0] - impulse[0] * bodyA.inverseMass, bodyA.velocity[1] - impulse[1] * bodyA.inverseMass, bodyA.velocity[2] - impulse[2] * bodyA.inverseMass];
      if (bodyA.sleeping && bodyA.speedSquared() > this.sleepVelocityThreshold * this.sleepVelocityThreshold) {
        bodyA.wake();
      }
    }
    if (bodyB.inverseMass > 0) {
      bodyB.velocity = [bodyB.velocity[0] + impulse[0] * bodyB.inverseMass, bodyB.velocity[1] + impulse[1] * bodyB.inverseMass, bodyB.velocity[2] + impulse[2] * bodyB.inverseMass];
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
    cannonBody.addShape(resolved.shape, resolved.offset, resolved.orientation);
    cannonBody.updateMassProperties();
    syncCannonFromAura(body, cannonBody);
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
      jsFallbackAvailable: true
    };
  }

  private stepCannon(dt: number): readonly CollisionEvent[] {
    if (!this.cannonWorld) return [];
    this.cannonWorld.gravity.copy(toCannonVec3(this.gravity));
    for (const body of this.bodyValues()) {
      const cannonBody = this.cannonBodiesByAuraId.get(body.id);
      if (cannonBody) syncCannonFromAura(body, cannonBody);
    }
    this.cannonWorld.step(dt);
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
  if (body.sleeping) cannonBody.sleep();
  else cannonBody.wakeUp();
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

function toCannonShape(shape: PhysicsShape): { readonly shape: CannonBox | CannonSphere | CannonPlane | CannonCylinder; readonly offset?: CannonVec3; readonly orientation?: CannonQuaternion } | undefined {
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
  }
}
