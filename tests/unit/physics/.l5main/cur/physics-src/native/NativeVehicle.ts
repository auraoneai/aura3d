import type { Collider } from "../Collider.js";
import {
  normalizePhysicsVehiclePose,
  normalizePhysicsWheelSpec,
  validatePhysicsVehicleAxes,
  validatePhysicsVehicleStep,
  validatePhysicsWheelCommand,
  validatePhysicsWheelTuning,
  type PhysicsVehicleController,
  type PhysicsWheelCommand,
  type PhysicsWheelSpec,
  type PhysicsWheelState
} from "../PhysicalVehicleController.js";
import type { RigidBody } from "../RigidBody.js";
import { addVec3, dotVec3, lengthVec3, normalizeVec3, rotateVec3ByQuat, scaleVec3, subVec3, validateFiniteVec3, type Vec3 } from "../Shape.js";
import { nativeApplyImpulseAtPoint, nativeCenterOfMass, nativeInverseInertia } from "./NativeMassProperties.js";

export interface NativeVehicleRayHit {
  readonly distance: number;
  readonly point: Vec3;
  /** Surface normal in world space; an inside-origin ray can report a back face. */
  readonly normal: Vec3;
  readonly collider: Collider;
  readonly body: RigidBody;
}

export interface NativeVehicleRayRequest {
  readonly chassis: RigidBody;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly maxDistance: number;
}

/** The host must ignore chassis colliders and sensors and return the closest hit. */
export interface NativeVehicleHost {
  raycast(request: NativeVehicleRayRequest): NativeVehicleRayHit | undefined;
  isActive?(body: RigidBody, collider?: Collider): boolean;
}

type MutableVec3 = [number, number, number];
interface Wheel {
  spec: PhysicsWheelSpec;
  command: Required<PhysicsWheelCommand>;
  state: PhysicsWheelState;
  rotationIncrement: number;
  ground: NativeVehicleRayHit | undefined;
}
interface WheelPlan {
  readonly state: PhysicsWheelState;
  readonly rotationIncrement?: number;
  readonly ground?: NativeVehicleRayHit;
  readonly longitudinalImpulse?: Vec3;
  readonly lateralImpulse?: Vec3;
  readonly lateralPoint?: Vec3;
}
interface WheelContact {
  readonly ground: NativeVehicleRayHit;
  readonly mount: Vec3;
  readonly length: number;
  readonly force: number;
  readonly appliedForce: number;
  readonly forward: Vec3;
  readonly side: Vec3;
}
interface BodyMotion {
  velocity: Vec3;
  angularVelocity: Vec3;
}

const EPSILON = 1e-8;
function copy(v: Vec3): MutableVec3 { return [v[0], v[1], v[2]]; }
function cross(a: Vec3, b: Vec3): MutableVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function axis(index: 0 | 1 | 2): MutableVec3 { return index === 0 ? [1, 0, 0] : index === 1 ? [0, 1, 0] : [0, 0, 1]; }
function rotateAbout(v: Vec3, around: Vec3, radians: number): Vec3 {
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  return addVec3(addVec3(scaleVec3(v, cosine), scaleVec3(cross(around, v), sine)), scaleVec3(around, dotVec3(around, v) * (1 - cosine)));
}
function pointVelocity(body: RigidBody, point: Vec3, motion?: BodyMotion): Vec3 {
  return addVec3(motion?.velocity ?? body.velocity, cross(motion?.angularVelocity ?? body.angularVelocity, subVec3(point, nativeCenterOfMass(body))));
}
function effectiveInverseMass(body: RigidBody, point: Vec3, direction: Vec3): number {
  if (body.type !== "dynamic") return 0;
  const arm = subVec3(point, nativeCenterOfMass(body));
  const angular = nativeInverseInertia(body, cross(arm, direction));
  return body.inverseMass + dotVec3(direction, cross(angular, arm));
}
function lateralInverseMass(body: RigidBody, point: Vec3, direction: Vec3): number {
  if (body.type !== "dynamic") return 0;
  const arm = subVec3(point, nativeCenterOfMass(body));
  const response = nativeInverseInertia(body, cross(arm, direction));
  return body.inverseMass + dotVec3(response, response);
}
function stageImpulse(motions: Map<RigidBody, BodyMotion>, body: RigidBody, point: Vec3, applied: Vec3): void {
  if (body.type !== "dynamic") return;
  const previous = motions.get(body) ?? { velocity: body.velocity, angularVelocity: body.angularVelocity };
  const velocity = addVec3(previous.velocity, scaleVec3(applied, body.inverseMass));
  const angularVelocity = addVec3(previous.angularVelocity, nativeInverseInertia(body, cross(subVec3(point, nativeCenterOfMass(body)), applied)));
  if (!velocity.every(Number.isFinite) || !angularVelocity.every(Number.isFinite)) throw new Error("Vehicle step produces a non-finite body velocity.");
  motions.set(body, { velocity, angularVelocity });
}
function clearedState(index: number, wheel: Wheel): PhysicsWheelState {
  return {
    index, grounded: false, contactPoint: null, contactNormal: null,
    engineForce: wheel.command.engineForce, brake: wheel.command.brake, steering: wheel.command.steering,
    suspensionLength: wheel.spec.restLength, rotation: wheel.state?.rotation ?? 0,
    frictionSlip: wheel.spec.frictionSlip ?? 10.5, suspensionForce: 0, forwardImpulse: 0, sideImpulse: 0,
    groundColliderHandle: null
  };
}
function copyState(state: PhysicsWheelState): PhysicsWheelState {
  return { ...state, contactPoint: state.contactPoint ? copy(state.contactPoint) : null, contactNormal: state.contactNormal ? copy(state.contactNormal) : null };
}

/** Suspension rays and contact impulses are computed against the host's current world. */
export function createNativeVehicle(chassis: RigidBody, host: NativeVehicleHost): PhysicsVehicleController {
  if (chassis.type !== "dynamic") throw new Error("A native vehicle requires a dynamic chassis.");
  if (!host || typeof host.raycast !== "function") throw new TypeError("Native vehicle host requires a raycast function.");
  const wheels: Wheel[] = [];
  let upAxis: 0 | 1 | 2 = 1;
  let forwardAxis: 0 | 1 | 2 = 0;
  let measuredSpeed = 0;
  let disposed = false;
  const assertActive = (): void => {
    if (disposed || (host.isActive && !host.isActive(chassis))) throw new Error("Native vehicle controller is disposed.");
  };
  const requireWheel = (index: number): Wheel => {
    assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= wheels.length) throw new RangeError(`Vehicle wheel index ${index} does not exist.`);
    return wheels[index]!;
  };
  const refreshContact = (wheel: Wheel): void => {
    if (wheel.ground && host.isActive && !host.isActive(wheel.ground.body, wheel.ground.collider)) {
      wheel.ground = undefined;
      wheel.state = clearedState(wheel.state.index, wheel);
    }
  };
  const invalidateContacts = (): void => {
    for (const wheel of wheels) {
      wheel.ground = undefined;
      wheel.state = clearedState(wheel.state.index, wheel);
    }
  };
  const queryWheel = (wheel: Wheel): WheelContact | undefined => {
    const spec = wheel.spec;
    const origin = addVec3(chassis.position, rotateVec3ByQuat(spec.connection, chassis.rotation));
    const suspensionDirection = normalizeVec3(rotateVec3ByQuat(spec.direction, chassis.rotation));
    const travel = spec.maxSuspensionTravel ?? 5;
    const maxDistance = spec.restLength + spec.radius;
    if (!Number.isFinite(maxDistance)) throw new Error("Vehicle suspension query distance must be finite.");
    const hit = host.raycast({ chassis, origin: copy(origin), direction: copy(suspensionDirection), maxDistance });
    if (!hit) return undefined;
    if (!Number.isFinite(hit.distance) || hit.distance < 0 || hit.distance > maxDistance) throw new Error("Vehicle hit distance must lie within the suspension ray.");
    if (hit.distance >= maxDistance - EPSILON) return undefined;
    validateFiniteVec3(hit.point, "vehicle contact point");
    const expectedPoint = addVec3(origin, scaleVec3(suspensionDirection, hit.distance));
    if (lengthVec3(subVec3(hit.point, expectedPoint)) > 1e-6 * Math.max(1, maxDistance, lengthVec3(origin))) {
      throw new Error("Vehicle contact point must lie on the suspension ray at the reported distance.");
    }
    validateFiniteVec3(hit.normal, "vehicle contact normal");
    if (lengthVec3(hit.normal) <= EPSILON) throw new Error("Vehicle contact normal must be non-zero.");
    if (hit.collider.sensor || hit.collider.bodyId !== hit.body.id || hit.body.id === chassis.id) throw new Error("Vehicle host returned a sensor, self or mismatched collision.");
    const normal = normalizeVec3(hit.normal);
    const normalAlignment = -dotVec3(suspensionDirection, normal);
    const ground: NativeVehicleRayHit = { ...hit, normal, point: copy(hit.point) };
    const length = clamp(hit.distance - spec.radius, spec.restLength - travel, spec.restLength + travel);
    const compression = spec.restLength - length;
    // Very shallow or back-facing contacts use a bounded normal response; the
    // public controller keeps them grounded and suppresses suspension damping.
    const inverseAlignment = normalAlignment > 0.1 ? 1 / normalAlignment : 10;
    const suspensionSpeed = normalAlignment > 0.1 ? dotVec3(pointVelocity(chassis, hit.point), normal) * inverseAlignment : 0;
    const damping = suspensionSpeed < 0 ? (spec.suspensionCompression ?? 2.3) : (spec.suspensionRelaxation ?? 4.4);
    const force = Math.max(0, chassis.mass * ((spec.suspensionStiffness ?? 20) * compression * inverseAlignment - damping * suspensionSpeed));
    const appliedForce = Math.min(force, spec.maxSuspensionForce ?? 6000);

    const up = normalizeVec3(rotateVec3ByQuat(axis(upAxis), chassis.rotation));
    const steeredAxle = rotateAbout(rotateVec3ByQuat(spec.axle, chassis.rotation), up, wheel.command.steering);
    const direction = cross(steeredAxle, normal);
    const forward = lengthVec3(direction) <= EPSILON ? [0, 0, 0] as Vec3 : normalizeVec3(direction);
    const side = lengthVec3(direction) <= EPSILON ? [0, 0, 0] as Vec3 : normalizeVec3(cross(normal, forward));
    if (!Number.isFinite(force)) throw new Error("Vehicle step produces a non-finite suspension force.");
    return { ground, mount: origin, length, force, appliedForce, forward, side };
  };
  const planWheel = (wheel: Wheel, index: number, dt: number, contact: WheelContact | undefined, motions: Map<RigidBody, BodyMotion>, groundedCount: number): WheelPlan => {
    if (!contact) return { state: clearedState(index, wheel) };
    const spec = wheel.spec;
    const { ground, length, force, forward, side } = contact;
    const hit = ground;
    const normal = ground.normal;
    // All tyres sample the same post-suspension state, before any tyre impulse.
    const tyreVelocity = subVec3(pointVelocity(chassis, hit.point, motions.get(chassis)), pointVelocity(hit.body, hit.point, motions.get(hit.body)));
    const forwardSpeed = dotVec3(tyreVelocity, forward);
    const sideSpeed = dotVec3(tyreVelocity, side);
    const forwardInverse = effectiveInverseMass(chassis, hit.point, forward) + effectiveInverseMass(hit.body, hit.point, forward);
    const sideInverse = lateralInverseMass(chassis, hit.point, side) + lateralInverseMass(hit.body, hit.point, side);
    const braking = forwardInverse > EPSILON ? clamp(forwardSpeed / forwardInverse / groundedCount, -wheel.command.brake, wheel.command.brake) : 0;
    let forwardImpulse = wheel.command.engineForce !== 0 ? wheel.command.engineForce * dt : braking;
    // These lateral stabilization and roll-response coefficients are based on
    // comparisons through the existing public vehicle interface.
    let sideImpulse = sideInverse > EPSILON ? -0.2 * sideSpeed / sideInverse * (spec.sideFrictionStiffness ?? 1) : 0;
    const limit = force * dt * (spec.frictionSlip ?? 10.5);
    if (![force, forwardImpulse, sideImpulse, limit].every(Number.isFinite)) throw new Error("Vehicle step produces a non-finite impulse.");
    const magnitude = Math.hypot(0.5 * forwardImpulse, sideImpulse);
    if (limit === 0) { forwardImpulse = 0; sideImpulse = 0; }
    else if (magnitude > limit && magnitude > 0) { const factor = limit / magnitude; forwardImpulse *= factor; sideImpulse *= factor; }
    const longitudinalImpulse = scaleVec3(forward, -forwardImpulse);
    const lateralImpulse = scaleVec3(side, sideImpulse);
    const up = normalizeVec3(rotateVec3ByQuat(axis(upAxis), chassis.rotation));
    const arm = subVec3(hit.point, nativeCenterOfMass(chassis));
    const lateralPoint = subVec3(hit.point, scaleVec3(up, 0.9 * dotVec3(arm, up)));
    if (!longitudinalImpulse.every(Number.isFinite) || !lateralImpulse.every(Number.isFinite) || !lateralPoint.every(Number.isFinite)) {
      throw new Error("Vehicle step produces a non-finite wheel state.");
    }
    return {
      ground,
      longitudinalImpulse, lateralImpulse, lateralPoint,
      state: {
        index, grounded: true, contactPoint: copy(hit.point), contactNormal: copy(normal),
        engineForce: wheel.command.engineForce, brake: wheel.command.brake, steering: wheel.command.steering,
        suspensionLength: length, rotation: wheel.state.rotation, frictionSlip: spec.frictionSlip ?? 10.5,
        suspensionForce: force, forwardImpulse, sideImpulse, groundColliderHandle: hit.collider.id
      }
    };
  };

  const controller: PhysicsVehicleController = {
    get wheelCount() { assertActive(); return wheels.length; },
    addWheel(spec) {
      assertActive();
      const copied = normalizePhysicsWheelSpec(spec);
      const wheel = { spec: copied, command: { engineForce: 0, brake: 0, steering: 0 }, rotationIncrement: 0, ground: undefined } as Wheel;
      wheel.state = clearedState(wheels.length, wheel);
      wheels.push(wheel);
      invalidateContacts();
      return controller;
    },
    setWheelTuning(index, tuning) {
      const wheel = requireWheel(index);
      validatePhysicsWheelTuning(tuning);
      const next = normalizePhysicsWheelSpec({
        ...wheel.spec,
        ...(tuning.suspensionStiffness === undefined ? {} : { suspensionStiffness: tuning.suspensionStiffness }),
        ...(tuning.suspensionCompression === undefined ? {} : { suspensionCompression: tuning.suspensionCompression }),
        ...(tuning.suspensionRelaxation === undefined ? {} : { suspensionRelaxation: tuning.suspensionRelaxation }),
        ...(tuning.maxSuspensionTravel === undefined ? {} : { maxSuspensionTravel: tuning.maxSuspensionTravel }),
        ...(tuning.maxSuspensionForce === undefined ? {} : { maxSuspensionForce: tuning.maxSuspensionForce }),
        ...(tuning.frictionSlip === undefined ? {} : { frictionSlip: tuning.frictionSlip }),
        ...(tuning.sideFrictionStiffness === undefined ? {} : { sideFrictionStiffness: tuning.sideFrictionStiffness })
      });
      wheel.spec = next;
      wheel.state = { ...wheel.state, frictionSlip: next.frictionSlip ?? 10.5 };
      return controller;
    },
    setWheelCommand(index, command) {
      const wheel = requireWheel(index);
      validatePhysicsWheelCommand(command);
      wheel.command = {
        engineForce: command.engineForce ?? wheel.command.engineForce,
        brake: command.brake ?? wheel.command.brake,
        steering: command.steering ?? wheel.command.steering
      };
      wheel.state = { ...wheel.state, ...wheel.command };
      if ((command.engineForce ?? 0) !== 0 || (command.steering ?? 0) !== 0 || (command.brake ?? 0) !== 0) chassis.wake();
      return controller;
    },
    setBrakes(brake) {
      assertActive();
      validatePhysicsWheelCommand({ brake });
      for (const wheel of wheels) { wheel.command = { ...wheel.command, brake }; wheel.state = { ...wheel.state, brake }; }
      if (brake !== 0) chassis.wake();
      return controller;
    },
    setAxes(up, forward) { assertActive(); validatePhysicsVehicleAxes(up, forward); upAxis = up; forwardAxis = forward; invalidateContacts(); return controller; },
    wheelState(index) { const wheel = requireWheel(index); refreshContact(wheel); return copyState(wheel.state); },
    wheelStates() { assertActive(); return wheels.map((wheel, index) => controller.wheelState(index)); },
    isGrounded() { return controller.groundedWheelCount() > 0; },
    groundedWheelCount() { assertActive(); for (const wheel of wheels) refreshContact(wheel); return wheels.filter((wheel) => wheel.state.grounded).length; },
    currentSpeed() { assertActive(); return measuredSpeed; },
    step(dt) {
      assertActive();
      validatePhysicsVehicleStep(dt);
      const forwardComponent = dotVec3(chassis.velocity, rotateVec3ByQuat(axis(forwardAxis), chassis.rotation));
      const speed = lengthVec3(chassis.velocity) * (forwardComponent < 0 ? -1 : 1);
      if (!Number.isFinite(speed)) throw new Error("Vehicle step produces a non-finite chassis speed.");
      // Validate every query and calculate every impulse before modifying state.
      const contacts = wheels.map((wheel) => queryWheel(wheel));
      const motions = new Map<RigidBody, BodyMotion>();
      // Suspension acts together before the sequential tyre solve, so a symmetric
      // four-wheel load cannot create artificial sideways grip and torque.
      for (const contact of contacts) {
        if (!contact) continue;
        const impulse = scaleVec3(contact.ground.normal, contact.appliedForce * dt);
        stageImpulse(motions, chassis, contact.ground.point, impulse);
      }
      const groundedCount = contacts.filter((contact) => !!contact).length;
      const plans = wheels.map((wheel, index) => planWheel(wheel, index, dt, contacts[index], motions, groundedCount));
      for (const plan of plans) {
        if (!plan.ground || !plan.longitudinalImpulse || !plan.lateralImpulse || !plan.lateralPoint) continue;
        stageImpulse(motions, chassis, plan.ground.point, plan.longitudinalImpulse);
        stageImpulse(motions, chassis, plan.lateralPoint, plan.lateralImpulse);
      }
      const rotatedPlans = plans.map((plan, index): WheelPlan => {
        const wheel = wheels[index]!;
        const contact = contacts[index];
        // Wheel rotation is an observed rolling visualization, not an independent
        // rigid body with an invented inertia. In air, retain the last per-step
        // increment with the decay observed on the existing public controller.
        const increment = contact
          ? -dotVec3(pointVelocity(chassis, contact.mount, motions.get(chassis)), contact.forward) / wheel.spec.radius * dt
          : wheel.rotationIncrement * 0.99;
        const rotation = wheel.state.rotation + increment;
        if (!Number.isFinite(increment) || !Number.isFinite(rotation)) throw new Error("Vehicle step produces a non-finite wheel rotation.");
        return { ...plan, rotationIncrement: increment, state: { ...plan.state, rotation } };
      });
      measuredSpeed = speed;
      for (const contact of contacts) {
        if (contact) nativeApplyImpulseAtPoint(chassis, scaleVec3(contact.ground.normal, contact.appliedForce * dt), contact.ground.point);
      }
      for (let index = 0; index < rotatedPlans.length; index += 1) {
        const plan = rotatedPlans[index]!;
        const wheel = wheels[index]!;
        wheel.state = plan.state;
        wheel.rotationIncrement = plan.rotationIncrement!;
        wheel.ground = plan.ground;
        if (plan.ground && plan.longitudinalImpulse && plan.lateralImpulse && plan.lateralPoint) {
          nativeApplyImpulseAtPoint(chassis, plan.longitudinalImpulse, plan.ground.point);
          nativeApplyImpulseAtPoint(chassis, plan.lateralImpulse, plan.lateralPoint);
        }
      }
    },
    position() { assertActive(); return copy(chassis.position); },
    rotation() { assertActive(); return [...chassis.rotation] as [number, number, number, number]; },
    linearVelocity() { assertActive(); return copy(chassis.velocity); },
    angularVelocity() { assertActive(); return copy(chassis.angularVelocity); },
    resetToPose(pose) {
      assertActive();
      const next = normalizePhysicsVehiclePose(pose);
      chassis.setPosition(next.position);
      chassis.setRotation(next.rotation);
      chassis.setVelocity(next.linearVelocity);
      chassis.setAngularVelocity(next.angularVelocity);
      chassis.clearForces();
      chassis.previousPosition = copy(next.position);
      chassis.previousRotation = [...next.rotation] as [number, number, number, number];
      controller.clearCommands();
      // The existing controller rebases the visible wheel angle on reset while
      // retaining the last airborne rotation increment for subsequent updates.
      wheels.forEach((wheel, index) => { wheel.ground = undefined; wheel.state = { ...clearedState(index, wheel), rotation: 0 }; });
      return controller;
    },
    clearCommands() {
      assertActive();
      for (const wheel of wheels) { wheel.command = { engineForce: 0, brake: 0, steering: 0 }; wheel.state = { ...wheel.state, ...wheel.command }; }
      return controller;
    },
    dispose() { disposed = true; }
  };
  return controller;
}
