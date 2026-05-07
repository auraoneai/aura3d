import { addVec3, dotVec3, normalizeVec3, scaleVec3, subVec3, validateFiniteVec3, type Vec3 } from "./Shape.js";
import type { RigidBody } from "./RigidBody.js";

export type ConstraintType = "fixed" | "hinge" | "slider" | "spring";

export type ConstraintDescriptor = {
  readonly type: ConstraintType;
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly localAnchorA?: Vec3;
  readonly localAnchorB?: Vec3;
  readonly restLength?: number;
  readonly stiffness?: number;
  readonly axis?: Vec3;
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
    if (!Number.isFinite(this.restLength) || this.restLength < 0) {
      throw new Error("Constraint restLength must be finite and non-negative.");
    }
    if (!Number.isFinite(this.stiffness) || this.stiffness < 0 || this.stiffness > 1) {
      throw new Error("Constraint stiffness must be in the [0, 1] range.");
    }
  }

  solve(): void {
    if (this.stiffness === 0) {
      return;
    }
    if (this.type === "fixed") {
      const currentOffset = subVec3(this.anchorBWorld(), this.anchorAWorld());
      this.applyError(subVec3(currentOffset, this.restOffset));
      this.applyVelocityError(subVec3(this.bodyB.velocity, this.bodyA.velocity));
    } else if (this.type === "hinge") {
      this.applyError(subVec3(this.anchorBWorld(), this.anchorAWorld()));
      this.applyVelocityError(subVec3(this.bodyB.velocity, this.bodyA.velocity));
    } else if (this.type === "slider") {
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
      this.applyVelocityError(scaleVec3(axis, dotVec3(relativeVelocity, axis) * Math.min(1, this.stiffness)));
    }
  }

  private anchorAWorld(): Vec3 {
    return addVec3(this.bodyA.position, this.localAnchorA);
  }

  private anchorBWorld(): Vec3 {
    return addVec3(this.bodyB.position, this.localAnchorB);
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
