import { Collider, type ColliderDescriptor } from "../Collider.js";
import { CollisionEventQueue, contactPairKey, type CollisionEvent, type Contact } from "../CollisionEvents.js";
import { Constraint, type ConstraintDescriptor } from "../Constraint.js";
import type { PhysicsCharacterController, PhysicsCharacterControllerDescriptor } from "../PhysicalCharacterController.js";
import type { PhysicsVehicleController } from "../PhysicalVehicleController.js";
import type { RaycastHit, RaycastOptions, SphereCastHit } from "../Raycast.js";
import { RigidBody, type RigidBodyDescriptor, type RigidBodySnapshot } from "../RigidBody.js";
import { Shape, validateFiniteVec3, type PhysicsShape, type Vec3 } from "../Shape.js";
import { beginNativeBodyStep, finishNativeBodyStep, integrateNativeBodyPose, integrateNativeBodyVelocity } from "./NativeBody.js";
import { collectNativePairs, type NativeBroadphaseEntry, type NativeBroadphaseResult } from "./NativeBroadphase.js";
import { createNativeCharacter, type NativeCharacterSweepHit } from "./NativeCharacter.js";
import { collideNative } from "./NativeCollision.js";
import { NativeContactSolver, type NativeContactRow } from "./NativeContacts.js";
import { NATIVE_CONTINUOUS_DEFAULT_MAX_IMPACTS, NATIVE_CONTINUOUS_MAX_IMPACTS, nativeContinuousStep, type NativeContinuousContact, type NativeContinuousPair, type NativeContinuousStepResult } from "./NativeContinuousStep.js";
import { NativeJointSolver } from "./NativeJoints.js";
import { nativeInertia, nativeInverseInertia, nativeLocalCenterOfMass, nativeMassProperties, setNativeMassProperties } from "./NativeMassProperties.js";
import { nativeOverlapCollider, nativeRaycastCollider, nativeSphereCastCollider, nativeSweepCollider, nativeWheelRaycastCollider } from "./NativeQueries.js";
import { NativeSleepingController, type NativeSleepingContact, type NativeSleepingOptions } from "./NativeSleeping.js";
import { certifyNativeSupportPath } from "./NativeSupportPath.js";
import { createNativeVehicle, type NativeVehicleRayHit } from "./NativeVehicle.js";

/** Internal experiment. This is not selected by the public PhysicsWorld. */
export interface NativePhysicsWorldOptions {
  /** A Rapier request is rejected: this constructor only creates a native world. */
  readonly backend?: "auto" | "native-experimental" | "rapier";
  readonly gravity?: Vec3;
  readonly fixedDelta?: number;
  readonly solverIterations?: number;
  /** Provenance only; the native world does not use an RNG. */
  readonly seed?: number;
  /** Automatic sleep needs an explicit native `sleeping` policy. */
  readonly enableSleeping?: boolean;
  /** @deprecated Validated for public descriptor compatibility, but not used by the native sleep policy. */
  readonly sleepVelocityThreshold?: number;
  /** @deprecated Validated for public descriptor compatibility, but not used by the native sleep policy. */
  readonly sleepDelay?: number;
  /** Reject a step if the initial motion estimate needs more substeps. */
  readonly maxSubSteps?: number;
  /** Explicit experimental sleep policy; omitted until backend defaults are established. */
  readonly sleeping?: NativeSleepingOptions;
  /** Native analytic CCD handles a restricted subset; unsupported modes and cases throw. */
  readonly continuousCollision?:
    | { readonly mode: "linear"; readonly maxImpacts?: number }
    | { readonly mode: "adaptive-substeps"; readonly maxSubSteps?: number; readonly motionThreshold?: number; readonly onSubstepLimit?: "error" | "clamp" };
}

/** Truthful native-specific selection; its CCD and sleep policies do not claim Rapier parity. */
export interface NativePhysicsBackendSelection {
  readonly requested: "auto" | "native-experimental";
  readonly active: "native-experimental";
  readonly deterministic: true;
  readonly seed?: number;
  readonly continuousCollision:
    | { readonly active: false; readonly mode: "disabled"; readonly provider: "none"; readonly lastSubSteps: number }
    | { readonly active: true; readonly mode: "linear"; readonly provider: "native-linear"; readonly lastSubSteps: number; readonly maxImpacts: number; readonly lastImpactBatches: number; readonly lastTrajectory?: NativeContinuousStepResult["diagnostics"]["trajectory"] };
  readonly sleeping: { readonly active: boolean; readonly provider: "manual-only" | "native-explicit" };
}

export interface NativePhysicsStepStats {
  readonly steps: number;
  readonly bodies: number;
  readonly colliders: number;
  readonly constraints: number;
  /** Profile of a diagnostic broadphase pass at the end of the last successful step. */
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
  /** Number of planned native substeps in the last successful outer step. */
  readonly subSteps: number;
}

export interface NativePhysicsSnapshot {
  readonly backend: NativePhysicsBackendSelection;
  readonly bodies: readonly RigidBodySnapshot[];
  readonly contacts: readonly Contact[];
  readonly stats: NativePhysicsStepStats;
}

type NativeBroadphaseProfile = Omit<NativeBroadphaseResult, "pairs"> & { readonly pairCount: number };

/**
 * An isolated integration harness for the independently authored native pieces.
 * It does not replace the public Rapier world: continuous collision detection,
 * controller parity, full mass-property compatibility, and broader validation remain required.
 */
export class NativePhysicsWorld {
  readonly gravity: [number, number, number];
  readonly fixedDelta: number;
  readonly seed?: number;
  private readonly requestedBackend: NativePhysicsBackendSelection["requested"];
  private readonly iterations: number;
  private readonly maxSubSteps: number;
  private readonly bodyMap = new Map<number, RigidBody>();
  private readonly colliderMap = new Map<number, Collider>();
  private readonly jointList: Constraint[] = [];
  private readonly jointSolver = new NativeJointSolver();
  private readonly sleeping?: NativeSleepingController;
  private readonly automaticSleeping: boolean;
  private readonly continuousCollision?: { readonly mode: "linear"; readonly maxImpacts?: number };
  /** Private witnesses are committed only with a successful continuous step. */
  private continuousSupports = new Map<string, NativeContinuousContact>();
  private events = new CollisionEventQueue();
  private bodyId = 1;
  private colliderId = 1;
  private steps = 0;
  private lastSubSteps = 0;
  private lastBroadphase?: NativeBroadphaseProfile;
  private lastContinuousDiagnostics?: NativeContinuousStepResult["diagnostics"];
  private lastEvents: readonly CollisionEvent[] = [];
  private disposed = false;

  constructor(options: NativePhysicsWorldOptions = {}) {
    if (options.backend !== undefined && options.backend !== "auto" && options.backend !== "native-experimental") {
      throw new Error(`Native world cannot select backend '${String(options.backend)}'; use 'auto' or 'native-experimental'.`);
    }
    this.requestedBackend = options.backend ?? "auto";
    const gravity = options.gravity ?? [0, -9.81, 0];
    validateFiniteVec3(gravity, "native world gravity");
    this.gravity = [...gravity];
    this.fixedDelta = options.fixedDelta ?? 1 / 60;
    this.iterations = options.solverIterations ?? 10;
    this.maxSubSteps = options.maxSubSteps ?? 64;
    if (!Number.isFinite(this.fixedDelta) || this.fixedDelta <= 0) throw new Error("Native world fixedDelta must be finite and positive.");
    if (!Number.isInteger(this.iterations) || this.iterations <= 0) throw new Error("Native world solverIterations must be a positive integer.");
    if (!Number.isInteger(this.maxSubSteps) || this.maxSubSteps <= 0) throw new Error("Native world maxSubSteps must be a positive integer.");
    if (options.seed !== undefined && (!Number.isFinite(options.seed) || !Number.isInteger(options.seed))) throw new Error("Native world seed must be a finite integer.");
    this.seed = options.seed;
    if (options.enableSleeping !== undefined && typeof options.enableSleeping !== "boolean") throw new Error("Native world enableSleeping must be a boolean.");
    if (options.sleepVelocityThreshold !== undefined && (!Number.isFinite(options.sleepVelocityThreshold) || options.sleepVelocityThreshold < 0)) throw new Error("sleepVelocityThreshold must be finite and non-negative.");
    if (options.sleepDelay !== undefined && (!Number.isFinite(options.sleepDelay) || options.sleepDelay < 0)) throw new Error("sleepDelay must be finite and non-negative.");
    if (options.enableSleeping === true && !options.sleeping) throw new Error("Native automatic sleeping requires an explicit sleeping policy with thresholds and quiet duration.");
    if (options.sleeping && options.enableSleeping !== undefined && options.sleeping.enableSleeping !== undefined && options.enableSleeping !== options.sleeping.enableSleeping) {
      throw new Error("Native world enableSleeping conflicts with the explicit sleeping policy.");
    }
    this.automaticSleeping = !!options.sleeping && (options.enableSleeping ?? options.sleeping.enableSleeping ?? true);
    if (options.sleeping) this.sleeping = new NativeSleepingController({ ...options.sleeping, enableSleeping: this.automaticSleeping });
    if (options.continuousCollision !== undefined) {
      const continuous = options.continuousCollision;
      if (continuous?.mode === "adaptive-substeps") {
        throw new Error("Native world does not support the adaptive-substeps CCD contract; its linear CCD supports only explicitly verified cases.");
      }
      if (!continuous || continuous.mode !== "linear" || (continuous.maxImpacts !== undefined && (!Number.isInteger(continuous.maxImpacts) || continuous.maxImpacts <= 0 || continuous.maxImpacts > NATIVE_CONTINUOUS_MAX_IMPACTS))) {
        throw new Error(`Native continuous collision requires linear mode and an integer impact limit from 1 to ${NATIVE_CONTINUOUS_MAX_IMPACTS}.`);
      }
      this.continuousCollision = { ...continuous };
    }
  }

  createRigidBody(descriptor: RigidBodyDescriptor = {}): RigidBody {
    this.assertActive();
    const body = new RigidBody(this.bodyId, descriptor);
    if (body.type === "dynamic") setNativeMassProperties(body, nativeMassProperties(body.mass, [], body.declaredInertia));
    this.sleeping?.add(body);
    this.bodyMap.set(body.id, body);
    this.bodyId += 1;
    return body;
  }

  createCollider(body: RigidBody | number, descriptor: ColliderDescriptor): Collider {
    this.assertActive();
    const owner = this.requireBody(body);
    const shape = Shape.clone(descriptor.shape);
    if (owner.type !== "static" && ["plane", "mesh", "heightfield"].includes(shape.kind)) {
      throw new Error(`Native collider shape '${shape.kind}' is supported only on static bodies.`);
    }
    const collider = new Collider(this.colliderId, owner.id, { ...descriptor, shape });
    const { layer, mask } = collider.filter;
    if (!Number.isInteger(layer) || layer < 0 || layer > 0xffff ||
        !Number.isInteger(mask) || mask < 0 || (mask > 0xffff && mask !== 0xffffffff)) {
      throw new Error("Native collision layer and mask must fit 16 bits (mask 0xffffffff means all layers).");
    }
    const mass = owner.type === "dynamic"
      ? nativeMassProperties(owner.mass, [...this.colliders().filter((existing) => existing.bodyId === owner.id).map((existing) => existing.shape), shape], owner.declaredInertia)
      : undefined;
    Object.freeze(collider.filter);
    Object.freeze(collider.material);
    Object.freeze(collider);
    this.colliderMap.set(collider.id, collider);
    if (mass) setNativeMassProperties(owner, mass);
    this.colliderId += 1;
    return collider;
  }

  createConstraint(descriptor: ConstraintDescriptor): Constraint {
    this.assertActive();
    this.requireBody(descriptor.bodyA);
    this.requireBody(descriptor.bodyB);
    const constraint = new Constraint(descriptor);
    this.jointSolver.add(constraint, { preserveOffset: constraint.type === "fixed" && descriptor.localAnchorA === undefined && descriptor.localAnchorB === undefined });
    this.jointList.push(constraint);
    return constraint;
  }

  /** Prototype controller using tolerance-limited sphere, capsule, or box casts. */
  createCharacterController(body: RigidBody | number, descriptor: PhysicsCharacterControllerDescriptor = {}): PhysicsCharacterController {
    this.assertActive();
    const owner = this.requireBody(body);
    const collider = this.colliders().find((candidate) => candidate.bodyId === owner.id);
    if (!collider) throw new Error("Native character requires a collider.");
    if (collider.shape.kind !== "sphere" && collider.shape.kind !== "capsule" && collider.shape.kind !== "box") {
      throw new Error("Native world character integration currently requires a sphere, capsule, or box collider.");
    }
    const shape = collider.shape;
    return createNativeCharacter(owner, collider, {
      fixedDelta: this.fixedDelta,
      isActive: (candidate, target) => !this.disposed && this.bodyMap.get(candidate.id) === candidate && this.colliderMap.get(target.id) === target,
      sweep: (request) => {
        let closest: NativeCharacterSweepHit | undefined;
        for (const candidate of this.colliders()) {
          if (candidate.bodyId === owner.id || candidate.sensor || !collider.canCollideWith(candidate)) continue;
          const target = this.bodyMap.get(candidate.bodyId)!;
          const hit = nativeSweepCollider(shape, request.position, owner.rotation, request.displacement, candidate, target, request.offset);
          if (hit && (!closest || hit.fraction < closest.fraction)) closest = hit;
        }
        return closest;
      },
      certifySupportPath: (request) => certifyNativeSupportPath({
        body: request.body,
        collider: request.collider,
        origin: request.origin,
        displacement: request.displacement,
        offset: request.offset,
        maxSlopeClimbAngle: request.maxSlopeClimbAngle,
        includeDynamicBodies: request.includeDynamicBodies,
        requireCenterSupport: request.requireCenterSupport,
        // Dynamic geometry is included even when it cannot serve as support:
        // the certificate must not ignore a collidable obstacle.
        obstacles: this.entries()
      })
    }, descriptor);
  }

  /** Prototype suspension rays use the current scene and ignore chassis/sensors. */
  createVehicleController(chassis: RigidBody | number): PhysicsVehicleController {
    this.assertActive();
    const owner = this.requireBody(chassis);
    return createNativeVehicle(owner, {
      isActive: (candidate, collider) => !this.disposed && this.bodyMap.get(candidate.id) === candidate && (!collider || this.colliderMap.get(collider.id) === collider),
      raycast: (request) => {
        let closest: NativeVehicleRayHit | undefined;
        for (const collider of this.colliders()) {
          if (collider.bodyId === owner.id || collider.sensor) continue;
          const target = this.bodyMap.get(collider.bodyId)!;
          const hit = nativeWheelRaycastCollider(request.origin, request.direction, collider, target, { maxDistance: request.maxDistance });
          if (hit && (!closest || hit.distance < closest.distance)) closest = { ...hit, collider, body: target };
        }
        return closest;
      }
    });
  }

  raycast(origin: Vec3, direction: Vec3, options: RaycastOptions = {}): RaycastHit | undefined {
    return this.raycastAll(origin, direction, options)[0];
  }

  raycastAll(origin: Vec3, direction: Vec3, options: RaycastOptions = {}): readonly RaycastHit[] {
    this.assertActive();
    validateQuery(origin, options);
    validateDirection(direction);
    const hits: RaycastHit[] = [];
    for (const collider of this.colliders()) {
      const hit = nativeRaycastCollider(origin, direction, collider, this.bodyMap.get(collider.bodyId)!, options);
      if (hit) hits.push(hit);
    }
    return hits.sort((a, b) => a.distance - b.distance || a.colliderId - b.colliderId);
  }

  sphereCast(origin: Vec3, radius: number, direction: Vec3, options: RaycastOptions = {}): SphereCastHit | undefined {
    return this.sphereCastAll(origin, radius, direction, options)[0];
  }

  sphereCastAll(origin: Vec3, radius: number, direction: Vec3, options: RaycastOptions = {}): readonly SphereCastHit[] {
    this.assertActive();
    validateQuery(origin, options);
    validateDirection(direction);
    if (!Number.isFinite(radius) || radius <= 0) throw new Error("Sphere cast radius must be finite and positive.");
    const hits: SphereCastHit[] = [];
    for (const collider of this.colliders()) {
      const hit = nativeSphereCastCollider(origin, radius, direction, collider, this.bodyMap.get(collider.bodyId)!, options);
      if (hit) hits.push(hit);
    }
    return hits.sort((a, b) => a.distance - b.distance || a.colliderId - b.colliderId);
  }

  overlapShape(center: Vec3, shape: Extract<PhysicsShape, { kind: "sphere" | "box" }>, options: RaycastOptions = {}): readonly Collider[] {
    this.assertActive();
    validateQuery(center, options);
    const query = shape.kind === "sphere" ? Shape.sphere(shape.radius) : Shape.box(...shape.halfExtents);
    return this.colliders().filter((collider) => {
      if ((collider.sensor && options.includeSensors === false) || options.ignoreColliders?.includes(collider.id) ||
          options.ignoreBodies?.includes(collider.bodyId) || (options.mask !== undefined && (collider.filter.layer & options.mask) === 0)) return false;
      return nativeOverlapCollider(center, query, collider, this.bodyMap.get(collider.bodyId)!);
    });
  }

  /** Change gravity for subsequent steps without reconstructing the world. */
  setGravity(gravity: Vec3): void {
    this.assertActive();
    validateFiniteVec3(gravity, "native world gravity");
    this.gravity[0] = gravity[0];
    this.gravity[1] = gravity[1];
    this.gravity[2] = gravity[2];
  }

  getBody(id: number): RigidBody | undefined { this.assertActive(); return this.bodyMap.get(id); }
  getCollider(id: number): Collider | undefined { this.assertActive(); return this.colliderMap.get(id); }
  bodies(): readonly RigidBody[] { this.assertActive(); return [...this.bodyMap.values()].sort((a, b) => a.id - b.id); }
  colliders(): readonly Collider[] { this.assertActive(); return [...this.colliderMap.values()].sort((a, b) => a.id - b.id); }
  constraints(): readonly Constraint[] { this.assertActive(); return [...this.jointList]; }

  removeConstraint(constraint: Constraint): void {
    this.assertActive();
    const index = this.jointList.indexOf(constraint);
    if (index < 0) return;
    this.jointList.splice(index, 1);
    this.jointSolver.remove(constraint);
  }

  removeCollider(id: number): void {
    this.assertActive();
    const collider = this.colliderMap.get(id);
    if (!collider) return;
    const owner = this.bodyMap.get(collider.bodyId)!;
    const mass = owner.type === "dynamic"
      ? nativeMassProperties(owner.mass, this.colliders().filter((candidate) => candidate.bodyId === owner.id && candidate.id !== id).map((candidate) => candidate.shape), owner.declaredInertia)
      : undefined;
    this.colliderMap.delete(id);
    for (const [key, contact] of this.continuousSupports) if (contact.pair.includes(id)) this.continuousSupports.delete(key);
    if (mass) setNativeMassProperties(owner, mass);
    const ended = this.events.removeCollider(id);
    if (ended.length) this.lastEvents = [...this.lastEvents, ...ended].sort((a, b) => a.pairKey.localeCompare(b.pairKey) || a.type.localeCompare(b.type));
  }

  removeRigidBody(id: number): void {
    this.assertActive();
    if (!this.bodyMap.has(id)) return;
    for (const joint of [...this.jointList]) if (joint.bodyA.id === id || joint.bodyB.id === id) this.removeConstraint(joint);
    for (const collider of this.colliders()) if (collider.bodyId === id) this.removeCollider(collider.id);
    this.sleeping?.remove(this.bodyMap.get(id)!);
    this.bodyMap.delete(id);
  }

  step(dt = this.fixedDelta): readonly CollisionEvent[] {
    this.assertActive();
    if (!Number.isFinite(dt) || dt <= 0) throw new Error("Native world step dt must be finite and positive.");
    validateFiniteVec3(this.gravity, "native world gravity");
    const bodies = this.bodies();
    const entries = this.entries();
    // Work on a private contact queue until the entire outer step succeeds.
    // A failed later substep must not publish intermediate begin/end events.
    const nextEvents = new CollisionEventQueue();
    nextEvents.update(this.events.snapshotContacts());
    const previousBodies = bodies.map(snapshotBodyState);
    const previousJoints = this.jointSolver.snapshotState();
    const previousSleep = this.sleeping?.snapshotState();
    let forcesConsumed = false;
    try {
      const forces = new Map(bodies.map((body) => [body.id, beginNativeBodyStep(body)]));
      const activated = bodies.filter((body) => !body.sleeping && (body.poseOverridden || body.velocityOverridden ||
        Math.hypot(...body.pendingForce()) > 0 || Math.hypot(...body.pendingTorque()) > 0));
      let subSteps = 1;
      let completedEvents: readonly CollisionEvent[];
      let nextSupports = new Map<string, NativeContinuousContact>();
      let nextContinuousDiagnostics: NativeContinuousStepResult["diagnostics"] | undefined;
      if (this.continuousCollision) {
        if (this.sleeping) throw new Error("Native linear continuous collision does not support sleeping policy.");
        const continuous = this.stepLinearContinuous(bodies, dt, nextEvents);
        completedEvents = continuous.events;
        nextSupports = continuous.supports;
        nextContinuousDiagnostics = continuous.diagnostics;
      } else {
        this.sleeping?.wakeConnected(this.sleepingContacts(this.detect(entries).contacts), this.jointList, activated);
        // This estimate does not bound later impulses or provide swept-shape CCD.
        subSteps = this.planSubSteps(entries, dt);
        if (subSteps > this.maxSubSteps) throw new Error(`Native world requires ${subSteps} substeps, exceeding maxSubSteps ${this.maxSubSteps}.`);
        const transitions: CollisionEvent[] = [];
        const stable = new Map<string, CollisionEvent>();
        const changed = new Set<string>();
        // Distribute solver iterations over time so forces, constraints and pose
        // updates advance together within the outer step.
        const passes = subSteps * this.iterations;
        const subDelta = dt / passes;
        for (let pass = 0; pass < passes; pass += 1) {
          for (const body of bodies) integrateNativeBodyVelocity(body, this.gravity, forces.get(body.id)!, subDelta);
          const { rows, contacts } = this.detect(entries);
          this.sleeping?.wakeConnected(this.sleepingContacts(contacts), this.jointList);
          const solver = new NativeContactSolver(rows, subDelta);
          this.jointSolver.beginStep(subDelta);
          for (let iteration = 0; iteration < this.iterations; iteration += 1) {
            solver.solve();
            this.jointSolver.solve(subDelta);
          }
          for (const body of bodies) integrateNativeBodyPose(body, subDelta);
          for (const event of nextEvents.update(this.detect(entries).contacts)) {
            if (event.type === "stay") stable.set(event.pairKey, event);
            else { transitions.push(event); changed.add(event.pairKey); }
          }
        }
        completedEvents = [...transitions, ...[...stable.values()].filter((event) => !changed.has(event.pairKey))];
      }
      forcesConsumed = true;
      for (const body of bodies) finishNativeBodyStep(body);
      this.sleeping?.finishStep(dt, this.sleepingContacts(nextEvents.snapshotContacts()), this.jointList, activated);
      // Capture a final-pose diagnostic pass. Do not publish it if any part of the
      // outer step fails, and retain counts rather than references to live bodies.
      const { pairs, ...profile } = collectNativePairs(entries);
      this.events = nextEvents;
      this.continuousSupports = nextSupports;
      this.lastEvents = completedEvents;
      this.steps += 1;
      this.lastSubSteps = subSteps;
      this.lastBroadphase = { ...profile, pairCount: pairs.length };
      this.lastContinuousDiagnostics = nextContinuousDiagnostics;
      return this.lastEvents;
    } catch (error) {
      if (forcesConsumed) for (const previous of previousBodies) {
        previous.body.clearForces();
        previous.body.applyForce(previous.force);
        previous.body.applyTorque(previous.torque);
      }
      for (const previous of previousBodies) restoreBodyState(previous);
      this.jointSolver.restoreState(previousJoints);
      if (previousSleep) this.sleeping!.restoreState(previousSleep);
      throw error;
    }
  }

  drainEvents(): readonly CollisionEvent[] {
    this.assertActive();
    const events = this.lastEvents;
    this.lastEvents = [];
    return events;
  }

  snapshot(): NativePhysicsSnapshot {
    this.assertActive();
    const bodies = this.bodies();
    const contacts = this.events.snapshotContacts().map(copyContact);
    const profile = this.lastBroadphase;
    return {
      backend: {
        requested: this.requestedBackend,
        active: "native-experimental",
        deterministic: true,
        ...(this.seed === undefined ? {} : { seed: this.seed }),
        continuousCollision: this.continuousCollision
          ? {
              active: true, mode: "linear", provider: "native-linear", lastSubSteps: this.lastSubSteps,
              maxImpacts: this.continuousCollision.maxImpacts ?? NATIVE_CONTINUOUS_DEFAULT_MAX_IMPACTS,
              lastImpactBatches: this.lastContinuousDiagnostics?.impactBatches ?? 0,
              ...(this.lastContinuousDiagnostics ? { lastTrajectory: this.lastContinuousDiagnostics.trajectory } : {})
            }
          : { active: false, mode: "disabled", provider: "none", lastSubSteps: this.lastSubSteps },
        sleeping: { active: this.automaticSleeping, provider: this.automaticSleeping ? "native-explicit" : "manual-only" }
      },
      bodies: bodies.map((body) => body.snapshot()),
      contacts,
      stats: {
        steps: this.steps,
        bodies: this.bodyMap.size,
        colliders: this.colliderMap.size,
        constraints: this.jointList.length,
        broadphasePairs: profile?.pairCount ?? 0,
        broadphaseFiniteColliders: profile?.finiteColliders ?? 0,
        broadphaseInfiniteColliders: profile?.infiniteColliders ?? 0,
        broadphaseCandidateTests: profile?.candidateTests ?? 0,
        broadphaseActiveMax: profile?.activeMax ?? 0,
        broadphaseRejectedByBounds: profile?.rejectedByBounds ?? 0,
        contacts: contacts.length,
        events: this.lastEvents.length,
        sleepingBodies: bodies.filter((body) => body.sleeping).length,
        kineticEnergy: nativeKineticEnergy(bodies),
        maxContactPenetration: contacts.reduce((max, contact) => Math.max(max, contact.penetration), 0),
        subSteps: this.lastSubSteps
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.jointSolver.dispose();
    this.sleeping?.dispose();
    this.bodyMap.clear();
    this.colliderMap.clear();
    this.continuousSupports.clear();
    this.jointList.length = 0;
    this.lastEvents = [];
    this.lastBroadphase = undefined;
    this.lastContinuousDiagnostics = undefined;
    this.events.update([]);
    this.disposed = true;
  }

  private entries(): NativeBroadphaseEntry[] {
    return this.colliders().map((collider) => ({ collider, body: this.bodyMap.get(collider.bodyId)! }));
  }

  /** Linear CCD owns its exact subset; unsupported dynamics fail before commit. */
  private stepLinearContinuous(bodies: readonly RigidBody[], dt: number, queue: CollisionEventQueue): { events: readonly CollisionEvent[]; supports: Map<string, NativeContinuousContact>; diagnostics: NativeContinuousStepResult["diagnostics"] } {
    if (bodies.some((body) => body.type === "kinematic" && body.velocity.some((value) => value !== 0))) {
      throw new Error("Native linear continuous collision does not support authored kinematic velocity.");
    }
    const colliders = this.colliders();
    const pairs: NativeContinuousPair[] = [];
    for (let i = 0; i < colliders.length; i += 1) for (let j = i + 1; j < colliders.length; j += 1) {
      const first = colliders[i]!, second = colliders[j]!;
      const a = this.bodyMap.get(first.bodyId)!, b = this.bodyMap.get(second.bodyId)!;
      if (a === b || !first.canCollideWith(second)) continue;
      if (a.type !== "dynamic" && b.type !== "dynamic" && !first.sensor && !second.sensor) continue;
      pairs.push({ first, second, friction: first.material.friction * second.material.friction, restitution: Math.max(first.material.restitution, second.material.restitution) });
    }
    const previous = queue.snapshotContacts();
    const activeContacts: NativeContinuousContact[] = previous.map((contact) => {
      if (!contact.point || contact.colliderA >= contact.colliderB) throw new Error("Native linear continuous collision needs ordered prior contact witnesses.");
      const cached = this.continuousSupports.get(contactPairKey(contact.colliderA, contact.colliderB));
      const supportState = cached?.supportState && sameNumbers(cached.normal, contact.normal) && sameNumbers(cached.point, contact.point) ? cached.supportState : undefined;
      return { pair: [contact.colliderA, contact.colliderB], sensor: contact.sensor, normal: contact.normal, point: contact.point, ...(supportState ? { supportState } : {}) };
    });
    const result = nativeContinuousStep({
      bodies, pairs, colliders, duration: dt, acceleration: this.gravity, constraints: this.jointList, activeContacts,
      ...(this.continuousCollision?.maxImpacts === undefined ? {} : { maxImpacts: this.continuousCollision.maxImpacts })
    });
    const active = new Map(previous.map((contact) => [contactPairKey(contact.colliderA, contact.colliderB), contact]));
    const transitions: CollisionEvent[] = [];
    const changed = new Set<string>();
    const convert = (contact: NativeContinuousContact): Contact => {
      const [first, second] = contact.pair;
      const a = this.colliderMap.get(first), b = this.colliderMap.get(second);
      if (!a || !b || first >= second || contact.sensor !== (a.sensor || b.sensor)) throw new Error("Native continuous collision returned an invalid contact pair.");
      validateFiniteVec3(contact.normal, "native continuous contact normal");
      validateFiniteVec3(contact.point, "native continuous contact point");
      const length = Math.hypot(...contact.normal);
      if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-6) throw new Error("Native continuous contact normal must be unit length.");
      return { colliderA: first, colliderB: second, bodyA: a.bodyId, bodyB: b.bodyId, sensor: contact.sensor, normal: contact.normal, point: contact.point, penetration: 0 };
    };
    let priorTime = 0;
    for (const transition of result.contactTransitions) {
      if (!Number.isFinite(transition.time) || transition.time < priorTime || transition.time > dt) throw new Error("Native continuous contact times must be ordered within the step.");
      priorTime = transition.time;
      const contact = convert(transition), key = contactPairKey(contact.colliderA, contact.colliderB);
      if (transition.type === "persist") {
        if (!active.has(key)) throw new Error("Native continuous collision persisted a missing contact.");
        active.set(key, contact);
        continue;
      }
      if (transition.type === "begin") {
        if (active.has(key)) throw new Error("Native continuous collision began an active contact.");
        active.set(key, contact);
      } else {
        if (!active.has(key)) throw new Error("Native continuous collision ended a missing contact.");
        // Refresh the contact first so the end event carries the exact exit witness.
        active.set(key, contact);
        queue.update([...active.values()]);
        active.delete(key);
      }
      const event = queue.update([...active.values()]).find((candidate) => candidate.pairKey === key && candidate.type === transition.type);
      if (!event) throw new Error("Native continuous collision could not publish a contact transition.");
      transitions.push(event);
      changed.add(key);
    }
    const final = new Map<string, Contact>();
    const supports = new Map<string, NativeContinuousContact>();
    for (const item of result.activeContacts) {
      const contact = convert(item), key = contactPairKey(contact.colliderA, contact.colliderB);
      if (!active.has(key) || final.has(key)) throw new Error("Native continuous collision returned inconsistent active contacts.");
      final.set(key, contact);
      if (item.supportState) supports.set(key, cloneContinuousContact(item));
    }
    if (final.size !== active.size) throw new Error("Native continuous collision lost an active contact.");
    const stable = queue.update([...final.values()]).filter((event) => event.type === "stay" && !changed.has(event.pairKey));
    if (result.bodies.length !== bodies.length) throw new Error("Native continuous collision returned inconsistent body state.");
    const seen = new Set<number>();
    for (const state of result.bodies) {
      const body = this.bodyMap.get(state.id);
      if (!body || seen.has(state.id)) throw new Error("Native continuous collision returned an invalid body.");
      validateFiniteVec3(state.position, "native continuous body position");
      validateFiniteVec3(state.velocity, "native continuous body velocity");
      validateFiniteVec3(state.angularVelocity, "native continuous body angular velocity");
      if (state.rotation.length !== 4 || !state.rotation.every(Number.isFinite) || Math.abs(Math.hypot(...state.rotation) - 1) > 1e-6) {
        throw new Error("Native continuous body rotation must be a unit quaternion.");
      }
      if (typeof state.sleeping !== "boolean") throw new Error("Native continuous body sleeping state must be a boolean.");
      seen.add(state.id);
      body.position = [...state.position];
      body.velocity = [...state.velocity];
      body.rotation = [...state.rotation];
      body.angularVelocity = [...state.angularVelocity];
      body.sleeping = state.sleeping;
    }
    return { events: [...transitions, ...stable], supports, diagnostics: result.diagnostics };
  }

  private sleepingContacts(contacts: readonly Contact[]): NativeSleepingContact[] {
    return contacts.map((contact) => ({
      bodyA: this.bodyMap.get(contact.bodyA)!, bodyB: this.bodyMap.get(contact.bodyB)!, sensor: contact.sensor,
      key: `${Math.min(contact.colliderA, contact.colliderB)}:${Math.max(contact.colliderA, contact.colliderB)}`
    }));
  }

  private detect(entries: readonly NativeBroadphaseEntry[]): { contacts: Contact[]; rows: NativeContactRow[] } {
    const contacts: Contact[] = [];
    const rows: NativeContactRow[] = [];
    for (const [a, b] of collectNativePairs(entries).pairs) {
      const manifold = collideNative(a.collider, a.body, b.collider, b.body);
      if (manifold.length === 0) continue;
      const sensor = a.collider.sensor || b.collider.sensor;
      const deepest = manifold.reduce((best, point) => point.penetration > best.penetration ? point : best);
      contacts.push({ colliderA: a.collider.id, colliderB: b.collider.id, bodyA: a.body.id, bodyB: b.body.id, normal: deepest.normal, point: deepest.point, penetration: sensor ? 0 : deepest.penetration, sensor });
      for (const point of manifold) rows.push({ bodyA: a.body, bodyB: b.body, ...point, sensor, friction: a.collider.material.friction * b.collider.material.friction, restitution: Math.max(a.collider.material.restitution, b.collider.material.restitution) });
    }
    return { contacts, rows };
  }

  private planSubSteps(entries: readonly NativeBroadphaseEntry[], dt: number): number {
    let smallest = Infinity;
    for (const { collider, body } of entries) {
      if (body.type !== "dynamic") continue;
      smallest = Math.min(smallest, featureSize(collider.shape));
    }
    let rotationalSteps = 1;
    let motion = 0;
    for (const body of this.bodyMap.values()) {
      if (body.type !== "dynamic" || body.sleeping) continue;
      const force = body.pendingForce();
      const acceleration = Math.hypot(this.gravity[0] + force[0] * body.inverseMass, this.gravity[1] + force[1] * body.inverseMass, this.gravity[2] + force[2] * body.inverseMass);
      const radius = entries.filter((entry) => entry.body === body).reduce((max, entry) => Math.max(max, boundingRadius(entry.collider.shape)), 0) + Math.hypot(...nativeLocalCenterOfMass(body));
      const angularSpeed = Math.hypot(...body.angularVelocity);
      const angularMomentum = nativeInertia(body, body.angularVelocity);
      const gyro: Vec3 = [
        body.angularVelocity[1] * angularMomentum[2] - body.angularVelocity[2] * angularMomentum[1],
        body.angularVelocity[2] * angularMomentum[0] - body.angularVelocity[0] * angularMomentum[2],
        body.angularVelocity[0] * angularMomentum[1] - body.angularVelocity[1] * angularMomentum[0]
      ];
      // Explicit gyroscopic integration loses angular momentum quickly on an
      // asymmetric spinning body. Bound its per-step turn even with no colliders.
      if (Math.hypot(...gyro) > 1e-12) rotationalSteps = Math.max(rotationalSteps, Math.ceil(angularSpeed * dt / (0.01 * this.iterations)));
      const axes: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const inverseNorm = Math.hypot(...axes.flatMap((axis) => [...nativeInverseInertia(body, axis)]));
      const inertiaNorm = Math.hypot(...axes.flatMap((axis) => [...nativeInertia(body, axis)]));
      const angularAccelerationEstimate = inverseNorm * (Math.hypot(...body.pendingTorque()) + angularSpeed * angularSpeed * inertiaNorm);
      motion = Math.max(motion, (Math.hypot(...body.velocity) + acceleration * dt + (angularSpeed + angularAccelerationEstimate * dt) * radius) * dt);
    }
    if (!Number.isFinite(motion)) throw new Error("Native world motion estimate must be finite.");
    if (!Number.isFinite(rotationalSteps)) throw new Error("Native world rotational step estimate must be finite.");
    return Math.max(rotationalSteps, Number.isFinite(smallest) ? Math.ceil(motion / (smallest * 0.5)) : 1);
  }

  private requireBody(body: RigidBody | number): RigidBody {
    const owned = this.bodyMap.get(typeof body === "number" ? body : body.id);
    if (!owned || (typeof body !== "number" && owned !== body)) throw new Error("Body is missing or belongs to a different native world.");
    return owned;
  }

  private assertActive(): void { if (this.disposed) throw new Error("Native physics world is disposed."); }
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

function copyContact(contact: Contact): Contact {
  const normal: Vec3 = [...contact.normal];
  const point: Vec3 | undefined = contact.point ? [...contact.point] : undefined;
  return { ...contact, normal, ...(point ? { point } : {}) };
}

/** Linear velocity is the center-of-mass velocity; native inertia uses world axes. */
function nativeKineticEnergy(bodies: readonly RigidBody[]): number {
  let energy = 0;
  for (const body of bodies) {
    if (body.type !== "dynamic") continue;
    try {
      const momentum = nativeInertia(body, body.angularVelocity);
      const angular = body.angularVelocity[0] * momentum[0] + body.angularVelocity[1] * momentum[1] + body.angularVelocity[2] * momentum[2];
      energy += 0.5 * (body.mass * (body.velocity[0] ** 2 + body.velocity[1] ** 2 + body.velocity[2] ** 2) + angular);
    } catch {
      // Snapshots remain inspectable even when externally mutated body state is invalid.
      return Number.NaN;
    }
  }
  return energy;
}

function cloneContinuousContact(contact: NativeContinuousContact): NativeContinuousContact {
  const support = contact.supportState;
  return {
    pair: [contact.pair[0], contact.pair[1]],
    sensor: contact.sensor,
    normal: [...contact.normal],
    point: [...contact.point],
    ...(support ? { supportState: {
      ...support,
      spherePosition: [...support.spherePosition],
      sphereRotation: [...support.sphereRotation],
      sphereVelocity: [...support.sphereVelocity],
      sphereAngularVelocity: [...support.sphereAngularVelocity],
      planePosition: [...support.planePosition],
      planeRotation: [...support.planeRotation],
      normal: [...support.normal]
    } } : {})
  };
}

function snapshotBodyState(body: RigidBody) {
  return {
    body,
    position: [...body.position] as RigidBody["position"],
    previousPosition: [...body.previousPosition] as RigidBody["previousPosition"],
    rotation: [...body.rotation] as RigidBody["rotation"],
    previousRotation: [...body.previousRotation] as RigidBody["previousRotation"],
    velocity: [...body.velocity] as RigidBody["velocity"],
    angularVelocity: [...body.angularVelocity] as RigidBody["angularVelocity"],
    force: body.pendingForce(),
    torque: body.pendingTorque(),
    sleeping: body.sleeping,
    poseOverridden: body.poseOverridden,
    velocityOverridden: body.velocityOverridden
  };
}

function restoreBodyState(state: ReturnType<typeof snapshotBodyState>): void {
  const { body } = state;
  body.position = state.position;
  body.previousPosition = state.previousPosition;
  body.rotation = state.rotation;
  body.previousRotation = state.previousRotation;
  body.velocity = state.velocity;
  body.angularVelocity = state.angularVelocity;
  body.sleeping = state.sleeping;
  body.poseOverridden = state.poseOverridden;
  body.velocityOverridden = state.velocityOverridden;
}

function validateQuery(origin: Vec3, options: RaycastOptions): void {
  validateFiniteVec3(origin, "query origin");
  if (options.maxDistance !== undefined && (Number.isNaN(options.maxDistance) || options.maxDistance < 0)) throw new Error("Query maxDistance must be non-negative.");
  if (options.mask !== undefined && (!Number.isInteger(options.mask) || options.mask < 0 || options.mask > 0xffffffff)) throw new Error("Query mask must be a non-negative 32-bit mask.");
}

function validateDirection(direction: Vec3): void {
  validateFiniteVec3(direction, "query direction");
  const length = Math.hypot(...direction);
  if (!Number.isFinite(length) || length <= 1e-9) throw new Error("Query direction must have finite non-zero length.");
}

function featureSize(shape: PhysicsShape): number {
  if (shape.kind === "sphere" || shape.kind === "capsule") return shape.radius;
  if (shape.kind === "box") return Math.min(...shape.halfExtents);
  if (shape.kind === "convex-hull") {
    const bounds = Shape.bounds(shape, [0, 0, 0]);
    return Math.min(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) * 0.5;
  }
  return Infinity;
}

function boundingRadius(shape: PhysicsShape): number {
  if (shape.kind === "sphere") return shape.radius;
  if (shape.kind === "capsule") return shape.halfHeight + shape.radius;
  if (shape.kind === "box") return Math.hypot(...shape.halfExtents);
  if (shape.kind === "convex-hull") return shape.vertices.reduce((max, vertex) => Math.max(max, Math.hypot(...vertex)), 0);
  return 0;
}
