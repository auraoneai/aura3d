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
   * Handle of the collider this tyre is resting on, or `null` in the air.
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
