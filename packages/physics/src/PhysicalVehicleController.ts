import type { Vec3 } from "./Shape.js";

/**
 * Contract area 6 — a physical, suspension-backed vehicle.
 *
 * This file deliberately names no solver. Aura3D already had arcade vehicle
 * helpers, but they integrate authored speed/steer curves and never claim tyre,
 * mass or suspension semantics, so a route that wants a vehicle that is actually
 * planted had nothing public to build on. This is the neutral surface for that:
 * wheels are described in chassis-local space, drive input is per-wheel, and the
 * grounding state a game needs for drift/airborne feedback is readable.
 *
 * The implementation is bridged from `PhysicsWorld`, which is the only module
 * allowed to reach the backend.
 */

/** Where a wheel sits on the chassis and how its suspension pushes. */
export interface PhysicsWheelSpec {
  /** Wheel mount point, chassis-local. */
  readonly connection: Vec3;
  /** Suspension travel direction, chassis-local — usually straight down. */
  readonly direction: Vec3;
  /** Wheel spin axis, chassis-local — usually across the car. */
  readonly axle: Vec3;
  /** Natural spring length in metres. */
  readonly restLength: number;
  readonly radius: number;
  readonly suspensionStiffness?: number;
  readonly suspensionCompression?: number;
  readonly suspensionRelaxation?: number;
  readonly maxSuspensionTravel?: number;
  readonly maxSuspensionForce?: number;
  /**
   * Tyre traction. Larger grips harder; smaller lets the tyre break loose.
   *
   * This is the direction the solver defines, and it is the opposite of what a
   * "slip constant" sounds like. A drift or handbrake is therefore a *reduction*
   * of this value; raising it to "make it slide" does the reverse and produces a
   * car that will not step out at all.
   */
  readonly frictionSlip?: number;
  readonly sideFrictionStiffness?: number;
}

export interface PhysicsWheelTuning {
  readonly suspensionStiffness?: number;
  readonly suspensionCompression?: number;
  readonly suspensionRelaxation?: number;
  readonly maxSuspensionTravel?: number;
  readonly maxSuspensionForce?: number;
  readonly frictionSlip?: number;
  readonly sideFrictionStiffness?: number;
}

/**
 * Per-wheel drive input for one step. Only the supplied fields are written, so
 * steering does not disturb throttle. `engineForce` is newtons, `brake` is an
 * impulse-scale scalar, `steering` is radians.
 */
export interface PhysicsWheelCommand {
  readonly engineForce?: number;
  readonly brake?: number;
  readonly steering?: number;
}

export interface PhysicsWheelState {
  readonly index: number;
  /** False means this wheel is in the air and contributes no force. */
  readonly grounded: boolean;
  readonly contactPoint: Vec3 | null;
  readonly contactNormal: Vec3 | null;
  readonly engineForce: number;
  readonly brake: number;
  readonly steering: number;
  readonly suspensionLength: number;
  readonly rotation: number;
  readonly frictionSlip: number;
  /** Force the spring is carrying right now. All four at zero means the car is not supported. */
  readonly suspensionForce: number;
  /** Tyre impulse along its rolling direction: the drive and braking traction actually realized. */
  readonly forwardImpulse: number;
  /** Tyre impulse across its rolling direction: the lateral grip realized. This is the honest slip signal. */
  readonly sideImpulse: number;
  /**
   * The owning world's `Collider.id` for the surface under this tyre, or
   * `null` when airborne or when the collider has been removed.
   *
   * A game registers the road and verge colliders and reads this to decide
   * "on asphalt" from the thing physically holding the car, instead of sampling
   * its own copy of the track and drifting away from the art.
   */
  readonly groundColliderHandle: number | null;
}

/** Full physical state to put a chassis back into. Reset is not valid without all of it. */
export interface PhysicsVehiclePose {
  readonly position: Vec3;
  /** Defaults to upright. */
  readonly rotation?: readonly [number, number, number, number];
  /** Defaults to zero. A respawn that keeps the old velocity drives off the spawn point. */
  readonly linearVelocity?: Vec3;
  /** Defaults to zero. */
  readonly angularVelocity?: Vec3;
}

/** Chassis-local axis index: 0 = x, 1 = y, 2 = z. */
export type PhysicsVehicleAxis = 0 | 1 | 2;

export interface PhysicsVehicleController {
  readonly wheelCount: number;
  addWheel(spec: PhysicsWheelSpec): this;
  setWheelTuning(index: number, tuning: PhysicsWheelTuning): this;
  setWheelCommand(index: number, command: PhysicsWheelCommand): this;
  /** Same brake on every wheel — the handbrake and full-stop case. */
  setBrakes(brake: number): this;
  /** Chassis-local up axis. Getting this wrong makes the car hover or sink. */
  setAxes(up: PhysicsVehicleAxis, forward: PhysicsVehicleAxis): this;
  wheelState(index: number): PhysicsWheelState;
  wheelStates(): readonly PhysicsWheelState[];
  /** True while any tyre is on the ground — the airborne/drift test. */
  isGrounded(): boolean;
  groundedWheelCount(): number;
  /** Signed speed along the chassis forward axis. */
  currentSpeed(): number;
  /** Advances the suspension and tyre model. Call once per fixed step, before the world step. */
  step(dt: number): void;
  /**
   * The transform authority, read back.
   *
   * A game renders from these (or from the equivalent `RigidBody` fields the world
   * syncs after `step`) and never writes the chassis to chase an authored pose.
   */
  position(): Vec3;
  rotation(): readonly [number, number, number, number];
  linearVelocity(): Vec3;
  angularVelocity(): Vec3;
  /**
   * Put the chassis into a complete physical state and release every drive input.
   *
   * This is the reset a restart needs: position, rotation, both velocities, the sleep
   * state, and the throttle/brake/steering that would otherwise resume on frame one.
   * Moving the rendered mesh alone leaves the solver driving the old state.
   */
  resetToPose(pose: PhysicsVehiclePose): this;
  /** Zero engine force, brake and steering on every wheel, leaving the chassis where it is. */
  clearCommands(): this;
  dispose(): void;
}

const WHEEL_TUNING_KEYS = [
  "suspensionStiffness",
  "suspensionCompression",
  "suspensionRelaxation",
  "maxSuspensionTravel",
  "maxSuspensionForce",
  "frictionSlip",
  "sideFrictionStiffness"
] as const;
const WHEEL_SPEC_KEYS = ["connection", "direction", "axle", "restLength", "radius", ...WHEEL_TUNING_KEYS] as const;
const WHEEL_COMMAND_KEYS = ["engineForce", "brake", "steering"] as const;
const VEHICLE_POSE_KEYS = ["position", "rotation", "linearVelocity", "angularVelocity"] as const;

function validateKeys(value: object, allowed: readonly string[], label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unsupported ${label} option '${key}'.`);
  }
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

function vector(value: Vec3, label: string): [number, number, number] {
  if (value == null || value.length !== 3 || !Array.from(value).every(Number.isFinite)) {
    throw new TypeError(`${label} must be a finite 3D vector.`);
  }
  return [value[0], value[1], value[2]];
}

function direction(value: Vec3, label: string): [number, number, number] {
  const v = vector(value, label);
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length <= 1e-8) throw new RangeError(`${label} must be non-zero.`);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Validate the complete tuning update before any native wheel is modified. */
export function validatePhysicsWheelTuning(tuning: PhysicsWheelTuning): void {
  validateKeys(tuning, WHEEL_TUNING_KEYS, "wheel tuning");
  for (const key of WHEEL_TUNING_KEYS) {
    const value = tuning[key];
    if (value !== undefined) {
      // The current optional backend requires a strictly positive grip value.
      if (key === "frictionSlip") positive(value, key);
      else nonNegative(value, key);
    }
  }
}

/**
 * Return a validated, detached wheel descriptor with unit suspension and axle
 * vectors. Validation happens before registration, so an invalid tuning value
 * cannot leave an extra wheel attached to the chassis.
 */
export function normalizePhysicsWheelSpec(spec: PhysicsWheelSpec): PhysicsWheelSpec {
  validateKeys(spec, WHEEL_SPEC_KEYS, "wheel");
  const connection = vector(spec.connection, "wheel connection");
  const suspension = direction(spec.direction, "wheel direction");
  const axle = direction(spec.axle, "wheel axle");
  const alignment = Math.abs(suspension[0] * axle[0] + suspension[1] * axle[1] + suspension[2] * axle[2]);
  if (alignment >= 1 - 1e-6) throw new RangeError("wheel direction and axle must not be parallel.");
  positive(spec.restLength, "suspension rest length");
  positive(spec.radius, "wheel radius");
  const tuning: Record<string, number> = {};
  for (const key of WHEEL_TUNING_KEYS) {
    const value = spec[key];
    if (value !== undefined) tuning[key] = value;
  }
  validatePhysicsWheelTuning(tuning);
  return { ...spec, connection, direction: suspension, axle };
}

/** Validate all supplied controls before applying any one of them. */
export function validatePhysicsWheelCommand(command: PhysicsWheelCommand): void {
  validateKeys(command, WHEEL_COMMAND_KEYS, "wheel command");
  if (command.engineForce !== undefined) finite(command.engineForce, "engineForce");
  if (command.brake !== undefined) nonNegative(command.brake, "brake");
  if (command.steering !== undefined) finite(command.steering, "steering");
}

/** Validate both axes together before either axis is changed. */
export function validatePhysicsVehicleAxes(up: PhysicsVehicleAxis, forward: PhysicsVehicleAxis): void {
  if (!Number.isInteger(up) || up < 0 || up > 2 || !Number.isInteger(forward) || forward < 0 || forward > 2) {
    throw new RangeError("Vehicle axes must be 0 (x), 1 (y), or 2 (z).");
  }
  if (up === forward) throw new RangeError("Vehicle up and forward axes must differ.");
}

export function validatePhysicsVehicleStep(dt: number): void {
  positive(dt, "vehicle step dt");
}

/**
 * Validate a complete respawn before changing the chassis. Omitting rotation
 * restores an upright orientation; omitting velocities clears old momentum.
 */
export function normalizePhysicsVehiclePose(pose: PhysicsVehiclePose): Required<PhysicsVehiclePose> {
  validateKeys(pose, VEHICLE_POSE_KEYS, "vehicle pose");
  const position = vector(pose.position, "vehicle reset position");
  const inputRotation = pose.rotation === undefined ? [0, 0, 0, 1] : pose.rotation;
  if (inputRotation == null || inputRotation.length !== 4 || !Array.from(inputRotation).every(Number.isFinite)) {
    throw new TypeError("vehicle reset rotation must be a finite quaternion.");
  }
  const length = Math.hypot(...inputRotation);
  if (!Number.isFinite(length) || length <= 1e-8) throw new RangeError("vehicle reset rotation must be non-zero.");
  return {
    position,
    rotation: [inputRotation[0] / length, inputRotation[1] / length, inputRotation[2] / length, inputRotation[3] / length],
    linearVelocity: vector(pose.linearVelocity === undefined ? [0, 0, 0] : pose.linearVelocity, "vehicle reset linear velocity"),
    angularVelocity: vector(pose.angularVelocity === undefined ? [0, 0, 0] : pose.angularVelocity, "vehicle reset angular velocity")
  };
}
