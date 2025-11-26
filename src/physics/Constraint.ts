/**
 * Physics constraints and joints.
 */

import { Vector3 } from '../math/Vector3';
import { RigidBody } from './RigidBody';

export enum ConstraintType {
  Fixed = 0,
  Hinge = 1,
  BallSocket = 2,
  Slider = 3
}

export abstract class Constraint {
  bodyA: RigidBody;
  bodyB: RigidBody | null;
  type: ConstraintType;
  breakForce: number;

  constructor(bodyA: RigidBody, bodyB: RigidBody | null, type: ConstraintType) {
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.type = type;
    this.breakForce = Infinity;
  }

  abstract solve(dt: number): void;
}

export class FixedConstraint extends Constraint {
  private anchorA: Vector3;
  private anchorB: Vector3;

  constructor(bodyA: RigidBody, bodyB: RigidBody, anchorA: Vector3, anchorB: Vector3) {
    super(bodyA, bodyB, ConstraintType.Fixed);
    this.anchorA = anchorA;
    this.anchorB = anchorB;
  }

  solve(dt: number): void {
    // Simplified constraint solver
    if (!this.bodyB) return;

    const worldAnchorA = this.bodyA.position.add(this.anchorA);
    const worldAnchorB = this.bodyB.position.add(this.anchorB);
    const error = worldAnchorB.sub(worldAnchorA);

    const correction = error.scale(0.2);
    if (this.bodyA.type === 0) this.bodyA.position.addInPlace(correction.scale(0.5));
    if (this.bodyB.type === 0) this.bodyB.position.addInPlace(correction.scale(-0.5));
  }
}

export class HingeConstraint extends Constraint {
  axis: Vector3;
  anchorA: Vector3;
  anchorB: Vector3;
  motorEnabled: boolean;
  motorSpeed: number;
  motorMaxForce: number;

  constructor(bodyA: RigidBody, bodyB: RigidBody, anchor: Vector3, axis: Vector3) {
    super(bodyA, bodyB, ConstraintType.Hinge);
    this.axis = axis.normalize();
    this.anchorA = anchor.clone();
    this.anchorB = anchor.clone();
    this.motorEnabled = false;
    this.motorSpeed = 0;
    this.motorMaxForce = 1000;
  }

  solve(dt: number): void {
    // Simplified hinge constraint
  }
}
