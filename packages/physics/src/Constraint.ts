import { addVec3, normalizeVec3, rotateVec3ByQuat, subVec3, validateFiniteVec3, type Vec3 } from "./Shape.js";
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
    if (descriptor.bodyA.id === descriptor.bodyB.id) {
      throw new Error("Constraint requires two different bodies.");
    }
    this.localAnchorA = descriptor.localAnchorA ?? [0, 0, 0];
    this.localAnchorB = descriptor.localAnchorB ?? [0, 0, 0];
    validateFiniteVec3(this.localAnchorA, "constraint localAnchorA");
    validateFiniteVec3(this.localAnchorB, "constraint localAnchorB");
    this.axis = normalizeVec3(descriptor.axis ?? [1, 0, 0]);
    this.type = descriptor.type;
    this.bodyA = descriptor.bodyA;
    this.bodyB = descriptor.bodyB;
    const anchorA = this.anchorAWorld();
    const anchorB = this.anchorBWorld();
    this.restOffset = subVec3(anchorB, anchorA);
    this.restLength = descriptor.restLength ?? Math.hypot(this.restOffset[0], this.restOffset[1], this.restOffset[2]);
    this.stiffness = descriptor.stiffness ?? 1;
    this.damping = descriptor.damping ?? 0;
    this.motorSpeedValue = descriptor.motorSpeed ?? 0;
    this.maxMotorTorque = descriptor.maxMotorTorque ?? Infinity;
    this.limits = descriptor.limits;
    if (this.limits && !(this.limits[0] <= this.limits[1])) {
      throw new Error("Constraint limits must be ordered [lower, upper].");
    }
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
  }

  /** `motorised-hinge` only: change the driven speed at runtime. */
  setMotorSpeed(speed: number): void {
    if (!Number.isFinite(speed)) throw new Error("Constraint motorSpeed must be finite.");
    this.motorSpeedValue = speed;
  }

  motorSpeed(): number {
    return this.motorSpeedValue;
  }

  /** Turn the constraint off without destroying it. */
  setEnabled(enabled: boolean): void {
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
