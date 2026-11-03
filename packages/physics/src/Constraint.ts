import { addVec3, cloneVec3, normalizeVec3, rotateVec3ByQuat, subVec3, validateFiniteVec3, type Vec3 } from "./Shape.js";
import type { RigidBody } from "./RigidBody.js";

export type ConstraintType = "fixed" | "hinge" | "slider" | "spring" | "ball-socket" | "motorised-hinge";

export type ConstraintDescriptor = {
  readonly type: ConstraintType;
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly localAnchorA?: Vec3;
  readonly localAnchorB?: Vec3;
  readonly restLength?: number;
  readonly stiffness?: number;
  /** World-space axis at creation, for hinge and slider joints. */
  readonly axis?: Vec3;
  /** Spring damping ratio, `spring` only. */
  readonly damping?: number;
  /** Target angular speed in rad/s, `motorised-hinge` only. */
  readonly motorSpeed?: number;
  /** Maximum torque the motor may apply, `motorised-hinge` only. */
  readonly maxMotorTorque?: number;
  /** Angular limits in radians, hinge kinds only. */
  readonly limits?: readonly [number, number];
};

export class Constraint {
  readonly type: ConstraintType;
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly localAnchorA: Vec3;
  readonly localAnchorB: Vec3;
  readonly restOffset: Vec3;
  readonly restLength: number;
  readonly stiffness: number;
  readonly axis: Vec3;
  readonly damping: number;
  readonly maxMotorTorque: number;
  readonly limits: readonly [number, number] | undefined;
  private motorSpeedValue: number;
  private enabled = true;

  constructor(descriptor: ConstraintDescriptor) {
    if (!descriptor || !descriptor.bodyA || !descriptor.bodyB) {
      throw new Error("Constraint requires two bodies.");
    }
    if (!["fixed", "hinge", "slider", "spring", "ball-socket", "motorised-hinge"].includes(descriptor.type)) {
      throw new Error(`Unknown constraint type '${String(descriptor.type)}'.`);
    }
    if (descriptor.bodyA === descriptor.bodyB) {
      throw new Error("Constraint requires two different bodies.");
    }
    validateConstraintOptions(descriptor);
    const localAnchorA = descriptor.localAnchorA ?? [0, 0, 0];
    const localAnchorB = descriptor.localAnchorB ?? [0, 0, 0];
    validateFiniteVec3(localAnchorA, "constraint localAnchorA");
    validateFiniteVec3(localAnchorB, "constraint localAnchorB");
    this.localAnchorA = Object.freeze(cloneVec3(localAnchorA));
    this.localAnchorB = Object.freeze(cloneVec3(localAnchorB));
    const axis = descriptor.axis ?? [1, 0, 0];
    validateFiniteVec3(axis, "constraint axis");
    this.axis = Object.freeze(normalizeVec3(axis));
    this.type = descriptor.type;
    this.bodyA = descriptor.bodyA;
    this.bodyB = descriptor.bodyB;
    const anchorA = this.anchorAWorld();
    const anchorB = this.anchorBWorld();
    this.restOffset = Object.freeze(subVec3(anchorB, anchorA));
    this.restLength = descriptor.restLength ?? Math.hypot(this.restOffset[0], this.restOffset[1], this.restOffset[2]);
    this.stiffness = descriptor.stiffness ?? 1;
    this.damping = descriptor.damping ?? 0;
    this.motorSpeedValue = descriptor.motorSpeed ?? 0;
    this.maxMotorTorque = descriptor.maxMotorTorque ?? Infinity;
    this.limits = descriptor.limits ? Object.freeze([descriptor.limits[0], descriptor.limits[1]]) : undefined;
    if (descriptor.type === "motorised-hinge" && descriptor.motorSpeed === undefined) {
      throw new Error("A motorised-hinge constraint requires motorSpeed.");
    }
    if (!Number.isFinite(this.damping) || this.damping < 0) {
      throw new Error("Constraint damping must be finite and non-negative.");
    }
    if (!Number.isFinite(this.restLength) || this.restLength < 0) {
      throw new Error("Constraint restLength must be finite and non-negative.");
    }
    if (!Number.isFinite(this.stiffness) || this.stiffness < 0 || this.stiffness > 1) {
      throw new Error("Constraint stiffness must be in the [0, 1] range.");
    }
    if (!Number.isFinite(this.motorSpeedValue)) {
      throw new Error("Constraint motorSpeed must be finite.");
    }
    if (typeof this.maxMotorTorque !== "number" || Number.isNaN(this.maxMotorTorque) || this.maxMotorTorque < 0) {
      throw new Error("Constraint maxMotorTorque must be non-negative.");
    }
  }

  /** `motorised-hinge` only: change the driven speed at runtime. */
  setMotorSpeed(speed: number): void {
    if (this.type !== "motorised-hinge") {
      throw new Error(`setMotorSpeed is only valid on a motorised-hinge constraint, not '${this.type}'.`);
    }
    if (!Number.isFinite(speed)) throw new Error("Constraint motorSpeed must be finite.");
    this.motorSpeedValue = speed;
  }

  motorSpeed(): number {
    return this.motorSpeedValue;
  }

  /** Turn the constraint off without destroying it. */
  setEnabled(enabled: boolean): void {
    if (typeof enabled !== "boolean") throw new Error("Constraint enabled must be a boolean.");
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private anchorAWorld(): Vec3 {
    return addVec3(this.bodyA.position, rotateVec3ByQuat(this.localAnchorA, this.bodyA.rotation));
  }

  private anchorBWorld(): Vec3 {
    return addVec3(this.bodyB.position, rotateVec3ByQuat(this.localAnchorB, this.bodyB.rotation));
  }
}

/** Reject settings that the selected native joint cannot apply. */
function validateConstraintOptions(descriptor: ConstraintDescriptor): void {
  const type = descriptor.type;
  for (const key of ["restLength", "stiffness", "damping", "motorSpeed", "maxMotorTorque"] as const) {
    if (descriptor[key] !== undefined && typeof descriptor[key] !== "number") {
      throw new Error(`Constraint ${key} must be a number.`);
    }
  }
  if (descriptor.axis !== undefined && type !== "hinge" && type !== "slider" && type !== "motorised-hinge") {
    throw new Error(`Constraint axis is only supported on hinge, slider and motorised-hinge constraints, not '${type}'.`);
  }
  for (const key of ["restLength", "stiffness", "damping"] as const) {
    if (descriptor[key] !== undefined && type !== "spring") {
      throw new Error(`Constraint ${key} is only supported on spring constraints, not '${type}'.`);
    }
  }
  for (const key of ["motorSpeed", "maxMotorTorque"] as const) {
    if (descriptor[key] !== undefined && type !== "motorised-hinge") {
      throw new Error(`Constraint ${key} is only supported on motorised-hinge constraints, not '${type}'.`);
    }
  }
  if (descriptor.limits !== undefined) {
    if (type !== "hinge" && type !== "motorised-hinge") {
      throw new Error(`Constraint limits are only supported on hinge constraints, not '${type}'.`);
    }
    const limits = descriptor.limits;
    if (!limits || limits.length !== 2 || !Number.isFinite(limits[0]) || !Number.isFinite(limits[1]) || limits[0] > limits[1]) {
      throw new Error("Constraint limits must be finite and ordered [lower, upper].");
    }
  }
}
