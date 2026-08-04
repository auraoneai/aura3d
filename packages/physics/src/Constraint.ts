import { addVec3, dotVec3, normalizeVec3, rotateVec3ByQuat, scaleVec3, subVec3, validateFiniteVec3, type Vec3 } from "./Shape.js";
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

  solve(): void {
    if (this.stiffness === 0 || !this.enabled) {
      return;
    }
    if (this.type === "ball-socket") {
      // A ball-socket holds the two anchors coincident and leaves all three rotational
      // degrees of freedom free. That is exactly the positional half of `fixed` without
      // the relative-orientation term, so it is a distinct joint, not an alias.
      this.applyError(subVec3(this.anchorBWorld(), this.anchorAWorld()));
      this.applyVelocityError(subVec3(this.bodyB.velocity, this.bodyA.velocity));
      return;
    }
    if (this.type === "motorised-hinge") {
      // Hold the anchors together, then drive relative rotation about the hinge axis
      // toward `motorSpeed`, bounded by `maxMotorTorque`.
      this.applyError(subVec3(this.anchorBWorld(), this.anchorAWorld()));
      this.applyVelocityError(subVec3(this.bodyB.velocity, this.bodyA.velocity));
      this.driveMotor();
      return;
    }
    if (this.type === "fixed") {
      // A fixed joint removes all six degrees of freedom, so relative rotation is locked for
      // the same reason as the slider: an unconstrained spin swings the anchor and leaks into
      // the positional solve.
      this.lockRelativeRotation();
      const currentOffset = subVec3(this.anchorBWorld(), this.anchorAWorld());
      this.applyError(subVec3(currentOffset, this.restOffset));
      this.applyVelocityError(subVec3(this.bodyB.velocity, this.bodyA.velocity));
    } else if (this.type === "hinge") {
      this.applyError(subVec3(this.anchorBWorld(), this.anchorAWorld()));
      this.applyVelocityError(subVec3(this.bodyB.velocity, this.bodyA.velocity));
    } else if (this.type === "slider") {
      /*
       * A slider is a *prismatic* joint: one translational degree of freedom, and **zero
       * rotational** ones. Locking rotation is not a refinement, it is what makes the
       * translation constraint work at all.
       *
       * The anchor is carried on each body's local frame, so `anchorBWorld` is
       * `position + rotate(localAnchor, rotation)`. If the body is free to spin, that anchor
       * swings, the positional solve reads the swing as off-axis error, and it *translates*
       * the body to cancel it. Rotation therefore leaks into position.
       *
       * Measured before this fix, in the clean-room physics puzzle: a block on a slider
       * given a single along-axis impulse ended up 0.478 off its axis in z and 0.780 higher
       * in y — it flew off the rail. It held fine at rest, which is why an isolated
       * resting-body test passed while the interactive case failed.
       */
      this.lockRelativeRotation();
      const currentOffset = subVec3(this.anchorBWorld(), this.anchorAWorld());
      const projected = scaleVec3(this.axis, dotVec3(currentOffset, this.axis));
      this.applyError(subVec3(currentOffset, projected));
      const relativeVelocity = subVec3(this.bodyB.velocity, this.bodyA.velocity);
      const projectedVelocity = scaleVec3(this.axis, dotVec3(relativeVelocity, this.axis));
      this.applyVelocityError(subVec3(relativeVelocity, projectedVelocity));
    } else if (this.type === "spring") {
      const currentOffset = subVec3(this.anchorBWorld(), this.anchorAWorld());
      const currentLength = Math.hypot(currentOffset[0], currentOffset[1], currentOffset[2]);
      if (currentLength <= 1e-9) {
        return;
      }
      const lengthError = currentLength - this.restLength;
      this.applyError(scaleVec3(currentOffset, lengthError / currentLength));
      const relativeVelocity = subVec3(this.bodyB.velocity, this.bodyA.velocity);
      const axis = scaleVec3(currentOffset, 1 / currentLength);
      // Damping removes energy along the spring axis so a loaded spring settles instead of
      // oscillating forever. `damping` 0 preserves the previous behaviour exactly.
      const damped = Math.min(1, this.stiffness + this.damping);
      this.applyVelocityError(scaleVec3(axis, dotVec3(relativeVelocity, axis) * damped));
    }
  }

  /**
   * Drive relative rotation about the hinge axis toward the target speed.
   *
   * Applied as equal-and-opposite angular impulses so total angular momentum is conserved
   * when both bodies are dynamic, and so a motor against a static anchor still turns the
   * dynamic side.
   */
  private driveMotor(): void {
    const axis = this.axis;
    const relativeAngular = subVec3(this.bodyB.angularVelocity, this.bodyA.angularVelocity);
    const currentSpeed = dotVec3(relativeAngular, axis);
    const speedError = this.motorSpeedValue - currentSpeed;
    if (Math.abs(speedError) <= 1e-9) return;
    const correction = speedError * this.stiffness;
    const bounded = Math.sign(correction) * Math.min(Math.abs(correction), this.maxMotorTorque);
    if (this.bodyB.inverseMass > 0) {
      this.bodyB.setAngularVelocity(addVec3(this.bodyB.angularVelocity, scaleVec3(axis, bounded)));
    }
    if (this.bodyA.inverseMass > 0) {
      this.bodyA.setAngularVelocity(subVec3(this.bodyA.angularVelocity, scaleVec3(axis, bounded)));
    }
  }

  /**
   * Remove relative angular velocity between the two bodies.
   *
   * Used by the joint types that allow no relative rotation. Applied as equal-and-opposite
   * changes weighted by inverse mass so a joint to a static anchor stops the dynamic side
   * outright, and a joint between two dynamic bodies conserves angular momentum.
   */
  private lockRelativeRotation(): void {
    const relative = subVec3(this.bodyB.angularVelocity, this.bodyA.angularVelocity);
    if (Math.abs(relative[0]) + Math.abs(relative[1]) + Math.abs(relative[2]) <= 1e-9) return;
    const inverseMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
    if (inverseMassSum <= 0) return;
    const correction = scaleVec3(relative, this.stiffness);
    if (this.bodyB.inverseMass > 0) {
      const share = this.bodyA.inverseMass > 0 ? this.bodyB.inverseMass / inverseMassSum : 1;
      this.bodyB.setAngularVelocity(subVec3(this.bodyB.angularVelocity, scaleVec3(correction, share)));
    }
    if (this.bodyA.inverseMass > 0) {
      const share = this.bodyB.inverseMass > 0 ? this.bodyA.inverseMass / inverseMassSum : 1;
      this.bodyA.setAngularVelocity(addVec3(this.bodyA.angularVelocity, scaleVec3(correction, share)));
    }
  }

  private anchorAWorld(): Vec3 {
    return addVec3(this.bodyA.position, rotateVec3ByQuat(this.localAnchorA, this.bodyA.rotation));
  }

  private anchorBWorld(): Vec3 {
    return addVec3(this.bodyB.position, rotateVec3ByQuat(this.localAnchorB, this.bodyB.rotation));
  }

  private applyError(error: Vec3): void {
    const inverseMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
    if (inverseMassSum <= 0) {
      return;
    }
    const weightedError = scaleVec3(error, this.stiffness);
    if (this.bodyA.inverseMass > 0) {
      this.bodyA.setPosition(addVec3(this.bodyA.position, scaleVec3(weightedError, this.bodyA.inverseMass / inverseMassSum)));
    }
    if (this.bodyB.inverseMass > 0) {
      this.bodyB.setPosition(subVec3(this.bodyB.position, scaleVec3(weightedError, this.bodyB.inverseMass / inverseMassSum)));
    }
  }

  private applyVelocityError(errorVelocity: Vec3): void {
    const inverseMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
    if (inverseMassSum <= 0) {
      return;
    }
    const correctionImpulse = scaleVec3(errorVelocity, -this.stiffness / inverseMassSum);
    if (this.bodyA.inverseMass > 0) {
      this.bodyA.applyImpulse(scaleVec3(correctionImpulse, -1));
    }
    if (this.bodyB.inverseMass > 0) {
      this.bodyB.applyImpulse(correctionImpulse);
    }
  }
}
