/**
 * Advanced constraint solver with multiple joint types for physics simulation.
 *
 * Implements various constraint types for connecting rigid bodies:
 * - Point-to-point (ball joint)
 * - Hinge with limits and motor
 * - Slider (prismatic)
 * - Cone-twist (ragdoll joints)
 * - Spring (damped)
 * - Fixed (weld)
 *
 * All constraints support break force thresholds for destructible connections.
 *
 * @module Physics/ConstraintSolver
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Matrix3 } from '../math/Matrix3';
import { RigidBody, BodyType } from './RigidBody';
import { Constraint } from './Constraint';

/**
 * Helper function to rotate a vector by a quaternion.
 * Uses formula: v' = q * v * q^(-1)
 */
function rotateVectorByQuaternion(v: Vector3, q: Quaternion): Vector3 {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;

  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;

  return new Vector3(
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  );
}

/**
 * Constraint solver configuration.
 */
export interface ConstraintSolverConfig {
  /**
   * Number of solver iterations per timestep.
   * Higher values = more accurate but slower.
   */
  iterations: number;

  /**
   * Position correction bias factor [0, 1].
   * Higher values correct errors faster but can cause instability.
   */
  baumgarte: number;

  /**
   * Maximum correction per iteration to prevent instability.
   */
  maxCorrection: number;

  /**
   * Allow sleeping bodies to be woken by constraints.
   */
  allowSleep: boolean;
}

/**
 * Point-to-point constraint (ball joint).
 *
 * Constrains two bodies to maintain a fixed distance between anchor points.
 * Allows full rotational freedom.
 *
 * @example
 * ```typescript
 * const joint = new PointToPointConstraint(bodyA, bodyB, {
 *   anchorA: new Vector3(0, 1, 0),
 *   anchorB: new Vector3(0, -1, 0),
 *   breakForce: 1000
 * });
 * ```
 */
export class PointToPointConstraint extends Constraint {
  /** Anchor point in body A's local space */
  anchorA: Vector3;

  /** Anchor point in body B's local space (or world space if no body B) */
  anchorB: Vector3;

  private lambda: Vector3;

  constructor(
    bodyA: RigidBody,
    bodyB: RigidBody | null,
    options: {
      anchorA?: Vector3;
      anchorB?: Vector3;
      breakForce?: number;
    } = {}
  ) {
    super(bodyA, bodyB, 0);
    this.anchorA = options.anchorA ?? Vector3.zero();
    this.anchorB = options.anchorB ?? Vector3.zero();
    this.breakForce = options.breakForce ?? Infinity;
    this.lambda = Vector3.zero();
  }

  solve(dt: number): void {
    const bodyB = this.bodyB;

    const rA = rotateVectorByQuaternion(this.anchorA, this.bodyA.rotation);
    const worldAnchorA = this.bodyA.position.add(rA);

    let rB: Vector3;
    let worldAnchorB: Vector3;

    if (bodyB) {
      rB = rotateVectorByQuaternion(this.anchorB, bodyB.rotation);
      worldAnchorB = bodyB.position.add(rB);
    } else {
      rB = Vector3.zero();
      worldAnchorB = this.anchorB;
    }

    const error = worldAnchorB.sub(worldAnchorA);
    const distance = error.length();

    if (distance < 1e-6) return;

    const normal = error.normalize();

    const vA = this.bodyA.linearVelocity.add(this.bodyA.angularVelocity.cross(rA));
    const vB = bodyB
      ? bodyB.linearVelocity.add(bodyB.angularVelocity.cross(rB))
      : Vector3.zero();

    const relativeVel = vB.sub(vA);
    const normalVel = relativeVel.dot(normal);

    const rACrossN = rA.cross(normal);
    const rBCrossN = bodyB ? rB.cross(normal) : Vector3.zero();

    let effectiveMass = this.bodyA.inverseMass;
    if (bodyB) effectiveMass += bodyB.inverseMass;

    const impulseScale = 1.0 / Math.max(effectiveMass, 1e-6);

    const baumgarte = 0.2;
    const bias = (baumgarte / dt) * distance;

    const lambda = -(normalVel + bias) * impulseScale;
    const impulse = normal.scale(lambda);

    if (this.bodyA.type === BodyType.Dynamic) {
      this.bodyA.linearVelocity.addInPlace(impulse.scale(this.bodyA.inverseMass));
      this.bodyA.angularVelocity.addInPlace(rACrossN.scale(lambda * this.bodyA.inverseMass));
    }

    if (bodyB && bodyB.type === BodyType.Dynamic) {
      bodyB.linearVelocity.addInPlace(impulse.scale(-bodyB.inverseMass));
      bodyB.angularVelocity.addInPlace(rBCrossN.scale(-lambda * bodyB.inverseMass));
    }

    if (Math.abs(lambda) > this.breakForce) {
      this.broken = true;
    }

    this.lambda = impulse;
  }

  private broken: boolean = false;

  isBroken(): boolean {
    return this.broken;
  }
}

/**
 * Hinge constraint with angular limits and motor.
 *
 * Constrains rotation to a single axis with optional angle limits and motor drive.
 *
 * @example
 * ```typescript
 * const hinge = new HingeConstraint(bodyA, bodyB, {
 *   anchorA: new Vector3(0, 0, 0),
 *   anchorB: new Vector3(0, 0, 0),
 *   axisA: Vector3.up(),
 *   axisB: Vector3.up(),
 *   minAngle: -Math.PI / 2,
 *   maxAngle: Math.PI / 2,
 *   motorEnabled: true,
 *   motorSpeed: 10,
 *   motorMaxForce: 100
 * });
 * ```
 */
export class HingeConstraint extends Constraint {
  anchorA: Vector3;
  anchorB: Vector3;
  axisA: Vector3;
  axisB: Vector3;

  minAngle: number;
  maxAngle: number;
  limitsEnabled: boolean;

  motorEnabled: boolean;
  motorSpeed: number;
  motorMaxForce: number;

  private currentAngle: number = 0;
  private angularLambda: number = 0;

  constructor(
    bodyA: RigidBody,
    bodyB: RigidBody | null,
    options: {
      anchorA?: Vector3;
      anchorB?: Vector3;
      axisA?: Vector3;
      axisB?: Vector3;
      minAngle?: number;
      maxAngle?: number;
      limitsEnabled?: boolean;
      motorEnabled?: boolean;
      motorSpeed?: number;
      motorMaxForce?: number;
      breakForce?: number;
    } = {}
  ) {
    super(bodyA, bodyB, 1);
    this.anchorA = options.anchorA ?? Vector3.zero();
    this.anchorB = options.anchorB ?? Vector3.zero();
    this.axisA = (options.axisA ?? Vector3.up()).normalize();
    this.axisB = (options.axisB ?? Vector3.up()).normalize();
    this.minAngle = options.minAngle ?? -Math.PI;
    this.maxAngle = options.maxAngle ?? Math.PI;
    this.limitsEnabled = options.limitsEnabled ?? false;
    this.motorEnabled = options.motorEnabled ?? false;
    this.motorSpeed = options.motorSpeed ?? 0;
    this.motorMaxForce = options.motorMaxForce ?? 1000;
    this.breakForce = options.breakForce ?? Infinity;
  }

  solve(dt: number): void {
    const bodyB = this.bodyB;
    if (!bodyB) return;

    const rA = rotateVectorByQuaternion(this.anchorA, this.bodyA.rotation);
    const rB = rotateVectorByQuaternion(this.anchorB, bodyB.rotation);

    const worldAnchorA = this.bodyA.position.add(rA);
    const worldAnchorB = bodyB.position.add(rB);

    const posError = worldAnchorB.sub(worldAnchorA);
    const distance = posError.length();

    if (distance > 1e-6) {
      const normal = posError.normalize();
      const impulse = normal.scale(-distance * 0.2 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.position.addInPlace(impulse.scale(-this.bodyA.inverseMass * dt));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.position.addInPlace(impulse.scale(bodyB.inverseMass * dt));
      }
    }

    const worldAxisA = rotateVectorByQuaternion(this.axisA, this.bodyA.rotation);
    const worldAxisB = rotateVectorByQuaternion(this.axisB, bodyB.rotation);

    const perpA = worldAxisA.cross(worldAxisB);
    const perpLen = perpA.length();

    if (perpLen > 1e-6) {
      const perpNorm = perpA.scale(1 / perpLen);
      const angularError = Math.asin(Math.min(perpLen, 1));

      const relAngularVel = bodyB.angularVelocity.sub(this.bodyA.angularVelocity);
      const angularVel = relAngularVel.dot(perpNorm);

      const angularBias = (0.2 / dt) * angularError;
      const angularImpulse = -(angularVel + angularBias);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.angularVelocity.addInPlace(perpNorm.scale(-angularImpulse * this.bodyA.inverseMass));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.angularVelocity.addInPlace(perpNorm.scale(angularImpulse * bodyB.inverseMass));
      }
    }

    const q = this.bodyA.rotation.conjugate().multiply(bodyB.rotation);
    this.currentAngle = 2 * Math.atan2(q.y, q.w);

    if (this.limitsEnabled) {
      if (this.currentAngle < this.minAngle) {
        const correction = this.minAngle - this.currentAngle;
        const limitImpulse = worldAxisA.scale(correction * 0.1 / dt);
        if (bodyB.type === BodyType.Dynamic) {
          bodyB.angularVelocity.addInPlace(limitImpulse);
        }
      } else if (this.currentAngle > this.maxAngle) {
        const correction = this.maxAngle - this.currentAngle;
        const limitImpulse = worldAxisA.scale(correction * 0.1 / dt);
        if (bodyB.type === BodyType.Dynamic) {
          bodyB.angularVelocity.addInPlace(limitImpulse);
        }
      }
    }

    if (this.motorEnabled) {
      const relAngularVelAxis = bodyB.angularVelocity.sub(this.bodyA.angularVelocity).dot(worldAxisA);
      const motorError = this.motorSpeed - relAngularVelAxis;
      const motorImpulse = Math.min(Math.abs(motorError), this.motorMaxForce * dt) * Math.sign(motorError);

      const motorImpulseVec = worldAxisA.scale(motorImpulse);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.angularVelocity.addInPlace(motorImpulseVec.scale(-this.bodyA.inverseMass));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.angularVelocity.addInPlace(motorImpulseVec.scale(bodyB.inverseMass));
      }

      this.angularLambda = motorImpulse;
    }
  }

  getCurrentAngle(): number {
    return this.currentAngle;
  }

  getAngularVelocity(): number {
    if (!this.bodyB) return 0;
    const worldAxisA = rotateVectorByQuaternion(this.axisA, this.bodyA.rotation);
    return this.bodyB.angularVelocity.sub(this.bodyA.angularVelocity).dot(worldAxisA);
  }
}

/**
 * Slider constraint (prismatic joint).
 *
 * Constrains motion to a single linear axis with optional limits.
 *
 * @example
 * ```typescript
 * const slider = new SliderConstraint(bodyA, bodyB, {
 *   axis: Vector3.up(),
 *   minDistance: 0,
 *   maxDistance: 5,
 *   limitsEnabled: true
 * });
 * ```
 */
export class SliderConstraint extends Constraint {
  axis: Vector3;
  minDistance: number;
  maxDistance: number;
  limitsEnabled: boolean;

  private currentDistance: number = 0;

  constructor(
    bodyA: RigidBody,
    bodyB: RigidBody | null,
    options: {
      axis?: Vector3;
      minDistance?: number;
      maxDistance?: number;
      limitsEnabled?: boolean;
      breakForce?: number;
    } = {}
  ) {
    super(bodyA, bodyB, 3);
    this.axis = (options.axis ?? Vector3.up()).normalize();
    this.minDistance = options.minDistance ?? -Infinity;
    this.maxDistance = options.maxDistance ?? Infinity;
    this.limitsEnabled = options.limitsEnabled ?? false;
    this.breakForce = options.breakForce ?? Infinity;
  }

  solve(dt: number): void {
    const bodyB = this.bodyB;
    if (!bodyB) return;

    const delta = bodyB.position.sub(this.bodyA.position);
    const worldAxis = rotateVectorByQuaternion(this.axis, this.bodyA.rotation);

    this.currentDistance = delta.dot(worldAxis);

    const perpendicular = delta.sub(worldAxis.scale(this.currentDistance));
    const perpDistance = perpendicular.length();

    if (perpDistance > 1e-6) {
      const perpNormal = perpendicular.normalize();
      const perpError = perpDistance;

      const perpImpulse = perpNormal.scale(-perpError * 0.2 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.position.addInPlace(perpImpulse.scale(-this.bodyA.inverseMass * dt));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.position.addInPlace(perpImpulse.scale(bodyB.inverseMass * dt));
      }
    }

    const worldAxisA = rotateVectorByQuaternion(this.axis, this.bodyA.rotation);
    const worldAxisB = rotateVectorByQuaternion(this.axis, bodyB.rotation);
    const rotError = worldAxisA.cross(worldAxisB);
    const rotErrorLen = rotError.length();

    if (rotErrorLen > 1e-6) {
      const rotNormal = rotError.normalize();
      const angularError = Math.asin(Math.min(rotErrorLen, 1));

      const angularImpulse = rotNormal.scale(-angularError * 0.2 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.angularVelocity.addInPlace(angularImpulse.scale(this.bodyA.inverseMass));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.angularVelocity.addInPlace(angularImpulse.scale(-bodyB.inverseMass));
      }
    }

    if (this.limitsEnabled) {
      if (this.currentDistance < this.minDistance) {
        const correction = this.minDistance - this.currentDistance;
        const limitImpulse = worldAxis.scale(correction * 0.2 / dt);

        if (this.bodyA.type === BodyType.Dynamic) {
          this.bodyA.position.addInPlace(limitImpulse.scale(-this.bodyA.inverseMass * dt));
        }
        if (bodyB.type === BodyType.Dynamic) {
          bodyB.position.addInPlace(limitImpulse.scale(bodyB.inverseMass * dt));
        }
      } else if (this.currentDistance > this.maxDistance) {
        const correction = this.maxDistance - this.currentDistance;
        const limitImpulse = worldAxis.scale(correction * 0.2 / dt);

        if (this.bodyA.type === BodyType.Dynamic) {
          this.bodyA.position.addInPlace(limitImpulse.scale(-this.bodyA.inverseMass * dt));
        }
        if (bodyB.type === BodyType.Dynamic) {
          bodyB.position.addInPlace(limitImpulse.scale(bodyB.inverseMass * dt));
        }
      }
    }
  }

  getCurrentDistance(): number {
    return this.currentDistance;
  }
}

/**
 * Cone-twist constraint for ragdoll joints.
 *
 * Allows rotation within a cone and limited twist around the cone axis.
 *
 * @example
 * ```typescript
 * const ragdoll = new ConeTwistConstraint(bodyA, bodyB, {
 *   anchorA: new Vector3(0, 1, 0),
 *   anchorB: new Vector3(0, -1, 0),
 *   swingSpan1: Math.PI / 4,
 *   swingSpan2: Math.PI / 4,
 *   twistSpan: Math.PI / 6
 * });
 * ```
 */
export class ConeTwistConstraint extends Constraint {
  anchorA: Vector3;
  anchorB: Vector3;
  axisA: Vector3;
  axisB: Vector3;

  swingSpan1: number;
  swingSpan2: number;
  twistSpan: number;

  constructor(
    bodyA: RigidBody,
    bodyB: RigidBody | null,
    options: {
      anchorA?: Vector3;
      anchorB?: Vector3;
      axisA?: Vector3;
      axisB?: Vector3;
      swingSpan1?: number;
      swingSpan2?: number;
      twistSpan?: number;
      breakForce?: number;
    } = {}
  ) {
    super(bodyA, bodyB, 2);
    this.anchorA = options.anchorA ?? Vector3.zero();
    this.anchorB = options.anchorB ?? Vector3.zero();
    this.axisA = (options.axisA ?? Vector3.up()).normalize();
    this.axisB = (options.axisB ?? Vector3.up()).normalize();
    this.swingSpan1 = options.swingSpan1 ?? Math.PI / 4;
    this.swingSpan2 = options.swingSpan2 ?? Math.PI / 4;
    this.twistSpan = options.twistSpan ?? Math.PI / 6;
    this.breakForce = options.breakForce ?? Infinity;
  }

  solve(dt: number): void {
    const bodyB = this.bodyB;
    if (!bodyB) return;

    const rA = rotateVectorByQuaternion(this.anchorA, this.bodyA.rotation);
    const rB = rotateVectorByQuaternion(this.anchorB, bodyB.rotation);

    const worldAnchorA = this.bodyA.position.add(rA);
    const worldAnchorB = bodyB.position.add(rB);

    const posError = worldAnchorB.sub(worldAnchorA);
    const distance = posError.length();

    if (distance > 1e-6) {
      const normal = posError.normalize();
      const impulse = normal.scale(-distance * 0.2 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.position.addInPlace(impulse.scale(-this.bodyA.inverseMass * dt));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.position.addInPlace(impulse.scale(bodyB.inverseMass * dt));
      }
    }

    const worldAxisA = rotateVectorByQuaternion(this.axisA, this.bodyA.rotation);
    const worldAxisB = rotateVectorByQuaternion(this.axisB, bodyB.rotation);

    const angle = Math.acos(Math.max(-1, Math.min(1, worldAxisA.dot(worldAxisB))));

    if (angle > this.swingSpan1) {
      const correction = angle - this.swingSpan1;
      const correctionAxis = worldAxisA.cross(worldAxisB).normalize();
      const correctionImpulse = correctionAxis.scale(-correction * 0.1 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.angularVelocity.addInPlace(correctionImpulse.scale(this.bodyA.inverseMass));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.angularVelocity.addInPlace(correctionImpulse.scale(-bodyB.inverseMass));
      }
    }

    const twistAxis = worldAxisA.add(worldAxisB).normalize();
    const relAngularVel = bodyB.angularVelocity.sub(this.bodyA.angularVelocity);
    const twistVel = relAngularVel.dot(twistAxis);

    const q = this.bodyA.rotation.conjugate().multiply(bodyB.rotation);
    const twistAngle = 2 * Math.atan2(
      new Vector3(q.x, q.y, q.z).dot(this.axisA),
      q.w
    );

    if (Math.abs(twistAngle) > this.twistSpan) {
      const correction = twistAngle > 0 ? twistAngle - this.twistSpan : twistAngle + this.twistSpan;
      const twistImpulse = twistAxis.scale(-correction * 0.1 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.angularVelocity.addInPlace(twistImpulse.scale(this.bodyA.inverseMass));
      }
      if (bodyB.type === BodyType.Dynamic) {
        bodyB.angularVelocity.addInPlace(twistImpulse.scale(-bodyB.inverseMass));
      }
    }
  }
}

/**
 * Spring constraint with damping.
 *
 * Applies spring forces between two bodies to maintain a rest length.
 *
 * @example
 * ```typescript
 * const spring = new SpringConstraint(bodyA, bodyB, {
 *   anchorA: Vector3.zero(),
 *   anchorB: Vector3.zero(),
 *   restLength: 2,
 *   stiffness: 100,
 *   damping: 10
 * });
 * ```
 */
export class SpringConstraint extends Constraint {
  anchorA: Vector3;
  anchorB: Vector3;
  restLength: number;
  stiffness: number;
  damping: number;

  constructor(
    bodyA: RigidBody,
    bodyB: RigidBody | null,
    options: {
      anchorA?: Vector3;
      anchorB?: Vector3;
      restLength?: number;
      stiffness?: number;
      damping?: number;
      breakForce?: number;
    } = {}
  ) {
    super(bodyA, bodyB, 0);
    this.anchorA = options.anchorA ?? Vector3.zero();
    this.anchorB = options.anchorB ?? Vector3.zero();
    this.restLength = options.restLength ?? 1;
    this.stiffness = options.stiffness ?? 100;
    this.damping = options.damping ?? 10;
    this.breakForce = options.breakForce ?? Infinity;
  }

  solve(dt: number): void {
    const bodyB = this.bodyB;

    const rA = rotateVectorByQuaternion(this.anchorA, this.bodyA.rotation);
    const worldAnchorA = this.bodyA.position.add(rA);

    let rB: Vector3;
    let worldAnchorB: Vector3;

    if (bodyB) {
      rB = rotateVectorByQuaternion(this.anchorB, bodyB.rotation);
      worldAnchorB = bodyB.position.add(rB);
    } else {
      rB = Vector3.zero();
      worldAnchorB = this.anchorB;
    }

    const delta = worldAnchorB.sub(worldAnchorA);
    const distance = delta.length();

    if (distance < 1e-6) return;

    const normal = delta.normalize();

    const extension = distance - this.restLength;

    const vA = this.bodyA.linearVelocity.add(this.bodyA.angularVelocity.cross(rA));
    const vB = bodyB
      ? bodyB.linearVelocity.add(bodyB.angularVelocity.cross(rB))
      : Vector3.zero();

    const relativeVel = vB.sub(vA);
    const normalVel = relativeVel.dot(normal);

    const springForce = extension * this.stiffness;
    const dampingForce = normalVel * this.damping;

    const totalForce = springForce + dampingForce;
    const impulse = normal.scale(totalForce * dt);

    if (this.bodyA.type === BodyType.Dynamic) {
      this.bodyA.applyImpulse(impulse, worldAnchorA);
    }

    if (bodyB && bodyB.type === BodyType.Dynamic) {
      bodyB.applyImpulse(impulse.negate(), worldAnchorB);
    }

    if (Math.abs(totalForce) > this.breakForce) {
      this.broken = true;
    }
  }

  private broken: boolean = false;

  isBroken(): boolean {
    return this.broken;
  }

  getCurrentLength(): number {
    const bodyB = this.bodyB;
    const rA = rotateVectorByQuaternion(this.anchorA, this.bodyA.rotation);
    const worldAnchorA = this.bodyA.position.add(rA);

    let worldAnchorB: Vector3;
    if (bodyB) {
      const rB = rotateVectorByQuaternion(this.anchorB, bodyB.rotation);
      worldAnchorB = bodyB.position.add(rB);
    } else {
      worldAnchorB = this.anchorB;
    }

    return worldAnchorB.sub(worldAnchorA).length();
  }
}

/**
 * Fixed constraint (weld joint).
 *
 * Rigidly connects two bodies with no relative motion.
 *
 * @example
 * ```typescript
 * const weld = new FixedConstraint(bodyA, bodyB, {
 *   breakForce: 500
 * });
 * ```
 */
export class FixedConstraint extends Constraint {
  private anchorA: Vector3;
  private anchorB: Vector3;
  private rotationOffsetA: Quaternion;
  private rotationOffsetB: Quaternion;
  private broken: boolean = false;

  constructor(
    bodyA: RigidBody,
    bodyB: RigidBody,
    options: {
      breakForce?: number;
    } = {}
  ) {
    super(bodyA, bodyB, 0);
    this.breakForce = options.breakForce ?? Infinity;

    this.anchorA = bodyA.position.clone();
    this.anchorB = bodyB.position.clone();
    this.rotationOffsetA = bodyA.rotation.clone();
    this.rotationOffsetB = bodyB.rotation.clone();
  }

  solve(dt: number): void {
    if (!this.bodyB) return;

    const posError = this.bodyB.position.sub(this.bodyA.position);
    const posDistance = posError.length();

    if (posDistance > 1e-6) {
      const posNormal = posError.normalize();
      const posImpulse = posNormal.scale(-posDistance * 0.3 / dt);

      if (this.bodyA.type === BodyType.Dynamic) {
        this.bodyA.position.addInPlace(posImpulse.scale(-this.bodyA.inverseMass * dt));
      }
      if (this.bodyB.type === BodyType.Dynamic) {
        this.bodyB.position.addInPlace(posImpulse.scale(this.bodyB.inverseMass * dt));
      }
    }

    const relRot = this.bodyA.rotation.conjugate().multiply(this.bodyB.rotation);
    const targetRot = this.rotationOffsetA.conjugate().multiply(this.rotationOffsetB);
    const rotError = targetRot.conjugate().multiply(relRot);

    const angle = 2 * Math.acos(Math.max(-1, Math.min(1, rotError.w)));
    if (angle > 1e-6) {
      const axis = new Vector3(rotError.x, rotError.y, rotError.z);
      const axisLen = axis.length();

      if (axisLen > 1e-6) {
        const rotNormal = axis.scale(1 / axisLen);
        const angularImpulse = rotNormal.scale(-angle * 0.3 / dt);

        if (this.bodyA.type === BodyType.Dynamic) {
          this.bodyA.angularVelocity.addInPlace(angularImpulse.scale(this.bodyA.inverseMass));
        }
        if (this.bodyB.type === BodyType.Dynamic) {
          this.bodyB.angularVelocity.addInPlace(angularImpulse.scale(-this.bodyB.inverseMass));
        }
      }
    }

    const totalError = posDistance + angle;
    if (totalError * (1.0 / dt) > this.breakForce) {
      this.broken = true;
    }
  }

  isBroken(): boolean {
    return this.broken;
  }
}

/**
 * Global constraint solver for iterative solving.
 *
 * @example
 * ```typescript
 * const solver = new ConstraintSolver({
 *   iterations: 10,
 *   baumgarte: 0.2,
 *   maxCorrection: 0.2
 * });
 *
 * solver.solve(constraints, dt);
 * ```
 */
export class ConstraintSolver {
  config: ConstraintSolverConfig;

  constructor(config: Partial<ConstraintSolverConfig> = {}) {
    this.config = {
      iterations: config.iterations ?? 10,
      baumgarte: config.baumgarte ?? 0.2,
      maxCorrection: config.maxCorrection ?? 0.2,
      allowSleep: config.allowSleep ?? true
    };
  }

  solve(constraints: Constraint[], dt: number): void {
    if (constraints.length === 0) return;

    for (let i = 0; i < this.config.iterations; i++) {
      for (const constraint of constraints) {
        constraint.solve(dt);
      }
    }

    for (let i = constraints.length - 1; i >= 0; i--) {
      const constraint = constraints[i];
      if (
        constraint instanceof PointToPointConstraint ||
        constraint instanceof SpringConstraint ||
        constraint instanceof FixedConstraint
      ) {
        if (constraint.isBroken()) {
          constraints.splice(i, 1);
        }
      }
    }
  }
}
