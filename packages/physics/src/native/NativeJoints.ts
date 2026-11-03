import { Constraint } from "../Constraint.js";
import type { Quat, RigidBody } from "../RigidBody.js";
import { addVec3, dotVec3, lengthVec3, rotateVec3ByQuat, scaleVec3, subVec3, type Vec3 } from "../Shape.js";
import { nativeApplyAngularImpulse, nativeApplyImpulseAtPoint, nativeCenterOfMass, nativeInverseInertia } from "./NativeMassProperties.js";

type MutableQuat = [number, number, number, number];

type JointState = {
  readonly constraint: Constraint;
  readonly anchorA: Vec3;
  readonly axisA: Vec3;
  readonly axisB: Vec3;
  readonly relativeRotation: Quat;
  motorImpulse: number;
  springImpulse: number;
  previousTwist: number;
  twist: number;
};

declare const jointSnapshotBrand: unique symbol;

/** Opaque, solver-owned checkpoint of mutable joint-step bookkeeping. @internal */
export interface NativeJointSolverSnapshot {
  readonly [jointSnapshotBrand]: true;
}

type SavedJointState = {
  readonly state: JointState;
  readonly motorImpulse: number;
  readonly springImpulse: number;
  readonly previousTwist: number;
  readonly twist: number;
};

type SavedSolverState = {
  readonly revision: number;
  readonly stepDt: number | undefined;
  readonly joints: readonly SavedJointState[];
};

/** Options needed to preserve the distinction between absent and explicit anchors. */
export interface NativeJointOptions {
  /**
   * Preserve the initial offset of a fixed joint. When omitted, a fixed joint
   * with two zero anchors preserves it; pass false for explicitly authored zero anchors.
   */
  readonly preserveOffset?: boolean;
}

/**
 * Iterative velocity-constraint solver for Aura-owned rigid-body state.
 *
 * For each simulation substep call `beginStep(dt)` once, then `solve(dt)` for
 * every solver iteration with that same full substep duration. The caller owns
 * integration and collision response. In particular, a motor's accumulated
 * angular impulse is bounded across the complete substep, not per iteration.
 * Joints retain their initial local frames until removed or cleared.
 *
 * This isolated solver is not registered as a production physics backend.
 */
export class NativeJointSolver {
  private readonly joints = new Map<Constraint, JointState>();
  private readonly snapshots = new WeakMap<NativeJointSolverSnapshot, SavedSolverState>();
  private revision = 0;
  private stepDt: number | undefined;
  private disposed = false;

  add(constraint: Constraint, options: NativeJointOptions = {}): void {
    this.assertActive();
    if (!(constraint instanceof Constraint)) throw new TypeError("Native joint solver requires a Constraint.");
    if (this.joints.has(constraint)) throw new Error("Constraint is already registered with the native joint solver.");
    if (options.preserveOffset !== undefined && typeof options.preserveOffset !== "boolean") {
      throw new TypeError("Joint preserveOffset must be a boolean.");
    }
    const a = constraint.bodyA;
    const b = constraint.bodyB;
    const preserveOffset = options.preserveOffset ?? (constraint.type === "fixed" &&
      isZero(constraint.localAnchorA) && isZero(constraint.localAnchorB));
    if (preserveOffset && constraint.type !== "fixed") throw new Error("preserveOffset is supported only for fixed joints.");
    const anchorA = preserveOffset
      ? addVec3(constraint.localAnchorA, rotateVec3ByQuat(constraint.restOffset, inverse(a.rotation)))
      : constraint.localAnchorA;
    this.joints.set(constraint, {
      constraint,
      anchorA,
      axisA: rotateVec3ByQuat(constraint.axis, inverse(a.rotation)),
      axisB: rotateVec3ByQuat(constraint.axis, inverse(b.rotation)),
      relativeRotation: multiply(inverse(a.rotation), b.rotation),
      motorImpulse: 0,
      springImpulse: 0,
      previousTwist: 0,
      twist: 0
    });
    this.revision += 1;
  }

  remove(constraint: Constraint): void {
    this.assertActive();
    if (this.joints.delete(constraint)) this.revision += 1;
  }

  /**
   * Capture only solver bookkeeping for world-step rollback. The caller owns
   * body poses and velocities and must restore those separately. Tokens remain
   * valid only on this solver while its registered joint set is unchanged.
   */
  snapshotState(): NativeJointSolverSnapshot {
    this.assertActive();
    const token = Object.freeze({}) as NativeJointSolverSnapshot;
    this.snapshots.set(token, {
      revision: this.revision,
      stepDt: this.stepDt,
      joints: Array.from(this.joints.values(), (state) => ({
        state,
        motorImpulse: state.motorImpulse,
        springImpulse: state.springImpulse,
        previousTwist: state.previousTwist,
        twist: state.twist
      }))
    });
    return token;
  }

  /** Restore a checkpoint after its caller has rolled back body state. */
  restoreState(token: NativeJointSolverSnapshot): void {
    this.assertActive();
    const saved = token && typeof token === "object" ? this.snapshots.get(token) : undefined;
    if (!saved) throw new Error("Native joint snapshot does not belong to this solver.");
    if (saved.revision !== this.revision) throw new Error("Cannot restore native joint snapshot: the joint set changed.");
    // Check the entire snapshot before mutating any state.
    for (const entry of saved.joints) {
      if (this.joints.get(entry.state.constraint) !== entry.state) {
        throw new Error("Cannot restore native joint snapshot: the joint set changed.");
      }
    }
    this.stepDt = saved.stepDt;
    for (const entry of saved.joints) {
      entry.state.motorImpulse = entry.motorImpulse;
      entry.state.springImpulse = entry.springImpulse;
      entry.state.previousTwist = entry.previousTwist;
      entry.state.twist = entry.twist;
    }
  }

  /** Begin one outer simulation substep before its iterative solve. */
  beginStep(dt: number): void {
    this.assertActive();
    validateDt(dt);
    this.stepDt = dt;
    for (const state of this.joints.values()) {
      state.motorImpulse = 0;
      state.springImpulse = 0;
      if (state.constraint.type !== "hinge" && state.constraint.type !== "motorised-hinge") continue;
      const rawTwist = jointTwist(state);
      let delta = rawTwist - state.previousTwist;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      state.twist += delta;
      state.previousTwist = rawTwist;
    }
  }

  /** Solve one iteration. Must be preceded by `beginStep` with the same dt. */
  solve(dt: number): void {
    this.assertActive();
    validateDt(dt);
    if (this.stepDt === undefined || dt !== this.stepDt) {
      throw new Error("Call beginStep(dt) once per substep before solving its joint iterations.");
    }
    for (const state of this.joints.values()) {
      const joint = state.constraint;
      if (!joint.isEnabled()) continue;
      if (joint.type === "spring") {
        solveSpring(state, dt);
        continue;
      }
      const axis = unit(rotateVec3ByQuat(state.axisA, joint.bodyA.rotation));
      const [tangentA, tangentB] = tangentBasis(axis);
      const a = anchorWorld(joint.bodyA, state.anchorA);
      const b = anchorWorld(joint.bodyB, joint.localAnchorB);
      const error = subVec3(b, a);
      const linearAxes: readonly Vec3[] = joint.type === "slider" ? [tangentA, tangentB] : WORLD_AXES;
      for (const direction of linearAxes) solveLinear(joint.bodyA, joint.bodyB, a, b, direction, dotVec3(error, direction), dt);
      if (joint.type === "fixed" || joint.type === "slider") {
        const rotationError = relativeRotationError(state);
        for (const direction of WORLD_AXES) solveAngular(joint.bodyA, joint.bodyB, direction, dotVec3(rotationError, direction), dt);
      } else if (joint.type === "hinge" || joint.type === "motorised-hinge") {
        const otherAxis = unit(rotateVec3ByQuat(state.axisB, joint.bodyB.rotation));
        const swingError = axisAlignmentError(axis, otherAxis, tangentA);
        for (const direction of [tangentA, tangentB]) solveAngular(joint.bodyA, joint.bodyB, direction, dotVec3(swingError, direction), dt);
        if (joint.type === "motorised-hinge") solveMotor(state, axis, dt);
        solveLimit(state, axis, dt);
      }
    }
  }

  clear(): void {
    this.assertActive();
    this.joints.clear();
    this.stepDt = undefined;
    this.revision += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.joints.clear();
    this.stepDt = undefined;
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Native joint solver is disposed.");
  }
}

const WORLD_AXES: readonly Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const BIAS = 0.2;
const EPS = 1e-12;

function validateDt(dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) throw new Error("Native joint substep dt must be finite and positive.");
}

function solveLinear(a: RigidBody, b: RigidBody, pointA: Vec3, pointB: Vec3, direction: Vec3, error: number, dt: number): void {
  const denominator = linearMass(a, b, pointA, pointB, direction);
  if (denominator <= EPS) return;
  const speed = dotVec3(subVec3(velocityAt(b, pointB), velocityAt(a, pointA)), direction);
  const impulse = -(speed + BIAS * error / dt) / denominator;
  applyLinearPair(a, b, pointA, pointB, scaleVec3(direction, impulse));
}

function solveAngular(a: RigidBody, b: RigidBody, direction: Vec3, error: number, dt: number): void {
  const denominator = angularMass(a, b, direction);
  if (denominator <= EPS) return;
  const speed = dotVec3(subVec3(angularVelocity(b), angularVelocity(a)), direction);
  applyAngularPair(a, b, scaleVec3(direction, -(speed + BIAS * error / dt) / denominator));
}

function solveMotor(state: JointState, axis: Vec3, dt: number): void {
  const { constraint: joint } = state;
  const a = joint.bodyA;
  const b = joint.bodyB;
  const denominator = angularMass(a, b, axis);
  if (denominator <= EPS) return;
  const speed = dotVec3(subVec3(angularVelocity(b), angularVelocity(a)), axis);
  const requested = (joint.motorSpeed() - speed) / denominator;
  const budget = joint.maxMotorTorque * dt;
  const next = clamp(state.motorImpulse + requested, -budget, budget);
  const increment = next - state.motorImpulse;
  state.motorImpulse = next;
  applyAngularPair(a, b, scaleVec3(axis, increment));
}

function solveLimit(state: JointState, axis: Vec3, dt: number): void {
  const { constraint: joint } = state;
  if (!joint.limits) return;
  const denominator = angularMass(joint.bodyA, joint.bodyB, axis);
  if (denominator <= EPS) return;
  const speed = dotVec3(subVec3(angularVelocity(joint.bodyB), angularVelocity(joint.bodyA)), axis);
  const predicted = state.twist + speed * dt;
  const [lower, upper] = joint.limits;
  let target = speed;
  if (state.twist < lower) target = Math.max(0, BIAS * (lower - state.twist) / dt);
  else if (predicted < lower) target = (lower - state.twist) / dt;
  else if (state.twist > upper) target = Math.min(0, BIAS * (upper - state.twist) / dt);
  else if (predicted > upper) target = (upper - state.twist) / dt;
  if (target !== speed) applyAngularPair(joint.bodyA, joint.bodyB, scaleVec3(axis, (target - speed) / denominator));
}

function solveSpring(state: JointState, dt: number): void {
  const joint = state.constraint;
  const a = anchorWorld(joint.bodyA, state.anchorA);
  const b = anchorWorld(joint.bodyB, joint.localAnchorB);
  const separation = subVec3(b, a);
  const distance = lengthVec3(separation);
  const direction: Vec3 = distance > EPS ? scaleVec3(separation, 1 / distance) : [1, 0, 0];
  // Public spring values are normalized game controls. Match their documented
  // physical scale while solving the spring implicitly for timestep stability.
  const stiffness = joint.stiffness * 100;
  const damping = joint.damping * 10;
  const softness = dt * (damping + dt * stiffness);
  if (softness <= EPS) return;
  const gamma = 1 / softness;
  const beta = dt * stiffness / (damping + dt * stiffness);
  const denominator = linearMass(joint.bodyA, joint.bodyB, a, b, direction) + gamma;
  if (denominator <= EPS) return;
  const speed = dotVec3(subVec3(velocityAt(joint.bodyB, b), velocityAt(joint.bodyA, a)), direction);
  const impulse = -(speed + beta * (distance - joint.restLength) / dt + gamma * state.springImpulse) / denominator;
  state.springImpulse += impulse;
  applyLinearPair(joint.bodyA, joint.bodyB, a, b, scaleVec3(direction, impulse));
}

function linearMass(a: RigidBody, b: RigidBody, pointA: Vec3, pointB: Vec3, direction: Vec3): number {
  const ra = subVec3(pointA, nativeCenterOfMass(a));
  const rb = subVec3(pointB, nativeCenterOfMass(b));
  const angularA = cross(nativeInverseInertia(a, cross(ra, direction)), ra);
  const angularB = cross(nativeInverseInertia(b, cross(rb, direction)), rb);
  return a.inverseMass + b.inverseMass + dotVec3(direction, addVec3(angularA, angularB));
}

function angularMass(a: RigidBody, b: RigidBody, direction: Vec3): number {
  return dotVec3(direction, addVec3(nativeInverseInertia(a, direction), nativeInverseInertia(b, direction)));
}

function velocityAt(body: RigidBody, point: Vec3): Vec3 {
  if (body.type === "static") return [0, 0, 0];
  return addVec3(body.velocity, cross(body.angularVelocity, subVec3(point, nativeCenterOfMass(body))));
}

function angularVelocity(body: RigidBody): Vec3 {
  return body.type === "static" ? [0, 0, 0] : body.angularVelocity;
}

function applyLinearPair(a: RigidBody, b: RigidBody, pointA: Vec3, pointB: Vec3, impulse: Vec3): void {
  if (lengthVec3(impulse) <= EPS) return;
  nativeApplyImpulseAtPoint(a, scaleVec3(impulse, -1), pointA);
  nativeApplyImpulseAtPoint(b, impulse, pointB);
}

function applyAngularPair(a: RigidBody, b: RigidBody, impulse: Vec3): void {
  if (lengthVec3(impulse) <= EPS) return;
  nativeApplyAngularImpulse(a, scaleVec3(impulse, -1));
  nativeApplyAngularImpulse(b, impulse);
}

function anchorWorld(body: RigidBody, local: Vec3): Vec3 {
  return addVec3(body.position, rotateVec3ByQuat(local, body.rotation));
}

function relativeRotationError(state: JointState): Vec3 {
  const target = multiply(state.constraint.bodyA.rotation, state.relativeRotation);
  let delta = multiply(state.constraint.bodyB.rotation, inverse(target));
  if (delta[3] < 0) delta = [-delta[0], -delta[1], -delta[2], -delta[3]];
  const length = Math.hypot(delta[0], delta[1], delta[2]);
  if (length <= EPS) return [0, 0, 0];
  const magnitude = 2 * Math.atan2(length, delta[3]) / length;
  return [delta[0] * magnitude, delta[1] * magnitude, delta[2] * magnitude];
}

function jointTwist(state: JointState): number {
  const target = multiply(state.constraint.bodyA.rotation, state.relativeRotation);
  const delta = multiply(state.constraint.bodyB.rotation, inverse(target));
  const axis = unit(rotateVec3ByQuat(state.axisA, state.constraint.bodyA.rotation));
  let angle = 2 * Math.atan2(delta[0] * axis[0] + delta[1] * axis[1] + delta[2] * axis[2], delta[3]);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function axisAlignmentError(a: Vec3, b: Vec3, fallback: Vec3): Vec3 {
  const normal = cross(a, b);
  const magnitude = lengthVec3(normal);
  const cosine = clamp(dotVec3(a, b), -1, 1);
  if (magnitude <= EPS) return cosine < 0 ? scaleVec3(fallback, Math.PI) : [0, 0, 0];
  return scaleVec3(normal, Math.atan2(magnitude, cosine) / magnitude);
}

function tangentBasis(axis: Vec3): readonly [Vec3, Vec3] {
  const reference: Vec3 = Math.abs(axis[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const first = unit(cross(axis, reference));
  return [first, cross(axis, first)];
}

function unit(value: Vec3): Vec3 {
  const magnitude = lengthVec3(value);
  if (!Number.isFinite(magnitude) || magnitude <= EPS) throw new Error("Native joint axis must be finite and non-zero.");
  return scaleVec3(value, 1 / magnitude);
}

function inverse(q: Quat): MutableQuat { return [-q[0], -q[1], -q[2], q[3]]; }
function multiply(a: Quat, b: Quat): MutableQuat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
function isZero(value: Vec3): boolean { return value[0] === 0 && value[1] === 0 && value[2] === 0; }
