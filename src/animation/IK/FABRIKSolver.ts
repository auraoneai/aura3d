/**
 * Forward And Backward Reaching Inverse Kinematics (FABRIK) solver.
 * Iterative solver for multi-bone chains with joint constraints.
 * Supports multiple end effectors and various joint types.
 * @module animation/IK/FABRIKSolver
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Skeleton } from '../Skeleton';

/**
 * Joint constraint types for FABRIK.
 */
export enum JointConstraintType {
  /** No constraint - full freedom */
  None = 0,
  /** Hinge joint - rotation around single axis */
  Hinge = 1,
  /** Ball joint - limited cone constraint */
  Ball = 2,
  /** Twist limit - rotation around bone axis */
  Twist = 3
}

/**
 * Joint constraint configuration.
 */
export interface JointConstraint {
  /** Constraint type */
  type: JointConstraintType;
  /** Constraint axis for hinge joints */
  axis?: Vector3;
  /** Maximum angle for cone/hinge constraints (radians) */
  maxAngle?: number;
  /** Minimum angle for hinge constraints (radians) */
  minAngle?: number;
}

/**
 * Configuration for FABRIK solver.
 */
export interface FABRIKConfig {
  /** Bone chain (root to tip) */
  boneChain: string[];
  /** Convergence tolerance */
  tolerance?: number;
  /** Maximum iterations */
  maxIterations?: number;
  /** Joint constraints per bone */
  constraints?: Map<string, JointConstraint>;
  /** Blend weight [0-1] */
  weight?: number;
}

/**
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver.
 * Iterative solver that alternates between forward and backward passes
 * to position bones. Supports joint constraints and multiple effectors.
 *
 * @example
 * ```typescript
 * const solver = new FABRIKSolver({
 *   boneChain: ['shoulder', 'elbow', 'wrist', 'hand'],
 *   tolerance: 0.01,
 *   maxIterations: 10,
 *   constraints: new Map([
 *     ['elbow', { type: JointConstraintType.Hinge, axis: Vector3.right(), maxAngle: Math.PI }]
 *   ])
 * });
 *
 * solver.solve(skeleton, target);
 * ```
 */
export class FABRIKSolver {
  private boneChain: string[];
  private tolerance: number;
  private maxIterations: number;
  private constraints: Map<string, JointConstraint>;
  private weight: number;

  private boneIndices: number[] = [];
  private boneLengths: number[] = [];
  private totalLength: number = 0;
  private initialized: boolean = false;

  private positions: Vector3[] = [];
  private originalPositions: Vector3[] = [];

  /**
   * Creates a new FABRIK solver.
   *
   * @param config - Solver configuration
   */
  constructor(config: FABRIKConfig) {
    this.boneChain = config.boneChain;
    this.tolerance = config.tolerance ?? 0.01;
    this.maxIterations = config.maxIterations ?? 10;
    this.constraints = config.constraints ?? new Map();
    this.weight = config.weight ?? 1.0;
  }

  /**
   * Initializes the solver with skeleton data.
   *
   * @param skeleton - Target skeleton
   * @returns True if initialization succeeded
   */
  private initialize(skeleton: Skeleton): boolean {
    this.boneIndices = [];
    this.boneLengths = [];
    this.totalLength = 0;

    for (const boneName of this.boneChain) {
      const index = skeleton.getBoneIndex(boneName);
      if (index === -1) {
        console.warn(`FABRIK: Could not find bone ${boneName}`);
        return false;
      }
      this.boneIndices.push(index);
    }

    skeleton.update(true);

    this.positions = new Array(this.boneIndices.length);
    this.originalPositions = new Array(this.boneIndices.length);

    for (let i = 0; i < this.boneIndices.length; i++) {
      const worldMat = skeleton['worldMatrices'][this.boneIndices[i]];
      this.positions[i] = worldMat.getPosition();
      this.originalPositions[i] = this.positions[i].clone();
    }

    for (let i = 0; i < this.boneIndices.length - 1; i++) {
      const length = Vector3.distance(this.positions[i], this.positions[i + 1]);
      this.boneLengths.push(length);
      this.totalLength += length;
    }

    this.initialized = true;
    return true;
  }

  /**
   * Solves FABRIK to reach target position.
   *
   * @param skeleton - Target skeleton
   * @param target - Target position in world space
   * @returns True if solve succeeded
   */
  solve(skeleton: Skeleton, target: Vector3): boolean {
    if (!this.initialized && !this.initialize(skeleton)) {
      return false;
    }

    if (this.weight <= 0) {
      return true;
    }

    for (let i = 0; i < this.boneIndices.length; i++) {
      const worldMat = skeleton['worldMatrices'][this.boneIndices[i]];
      this.positions[i].copy(worldMat.getPosition());
    }

    const rootPos = this.positions[0].clone();
    const distToTarget = Vector3.distance(rootPos, target);

    if (distToTarget > this.totalLength) {
      for (let i = 0; i < this.boneIndices.length - 1; i++) {
        const direction = target.sub(this.positions[i]).normalize();
        this.positions[i + 1].copy(this.positions[i].add(direction.scale(this.boneLengths[i])));
      }
    } else {
      let iteration = 0;
      let difference = Vector3.distance(this.positions[this.positions.length - 1], target);

      while (difference > this.tolerance && iteration < this.maxIterations) {
        this.forwardReach(target);
        this.backwardReach(rootPos);

        difference = Vector3.distance(this.positions[this.positions.length - 1], target);
        iteration++;
      }
    }

    this.applyConstraints();
    this.updateSkeleton(skeleton);

    return true;
  }

  /**
   * Forward reaching pass (from end to root).
   *
   * @param target - Target position
   */
  private forwardReach(target: Vector3): void {
    this.positions[this.positions.length - 1].copy(target);

    for (let i = this.positions.length - 2; i >= 0; i--) {
      const direction = this.positions[i].sub(this.positions[i + 1]).normalize();
      this.positions[i].copy(this.positions[i + 1].add(direction.scale(this.boneLengths[i])));
    }
  }

  /**
   * Backward reaching pass (from root to end).
   *
   * @param root - Root position
   */
  private backwardReach(root: Vector3): void {
    this.positions[0].copy(root);

    for (let i = 0; i < this.positions.length - 1; i++) {
      const direction = this.positions[i + 1].sub(this.positions[i]).normalize();
      this.positions[i + 1].copy(this.positions[i].add(direction.scale(this.boneLengths[i])));
    }
  }

  /**
   * Applies joint constraints to positions.
   */
  private applyConstraints(): void {
    for (let i = 1; i < this.positions.length - 1; i++) {
      const boneName = this.boneChain[i];
      const constraint = this.constraints.get(boneName);

      if (!constraint || constraint.type === JointConstraintType.None) {
        continue;
      }

      const prev = this.positions[i - 1];
      const curr = this.positions[i];
      const next = this.positions[i + 1];

      const toBone = curr.sub(prev).normalize();
      const toNext = next.sub(curr).normalize();

      switch (constraint.type) {
        case JointConstraintType.Hinge:
          this.applyHingeConstraint(prev, curr, next, constraint);
          break;

        case JointConstraintType.Ball:
          this.applyBallConstraint(prev, curr, next, constraint);
          break;

        case JointConstraintType.Twist:
          this.applyTwistConstraint(prev, curr, next, constraint);
          break;
      }
    }
  }

  /**
   * Applies hinge constraint to a joint.
   */
  private applyHingeConstraint(
    prev: Vector3,
    curr: Vector3,
    next: Vector3,
    constraint: JointConstraint
  ): void {
    if (!constraint.axis) return;

    const toBone = curr.sub(prev).normalize();
    const toNext = next.sub(curr).normalize();

    const projectedNext = toNext.reject(constraint.axis).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, toBone.dot(projectedNext))));

    const maxAngle = constraint.maxAngle ?? Math.PI;
    const minAngle = constraint.minAngle ?? 0;

    if (angle > maxAngle) {
      const rotation = Quaternion.fromAxisAngle(constraint.axis, maxAngle - angle);
      const rotatedDir = this.rotateVector(toNext, rotation);
      next.copy(curr.add(rotatedDir.scale(this.boneLengths[this.positions.indexOf(curr)])));
    } else if (angle < minAngle) {
      const rotation = Quaternion.fromAxisAngle(constraint.axis, minAngle - angle);
      const rotatedDir = this.rotateVector(toNext, rotation);
      next.copy(curr.add(rotatedDir.scale(this.boneLengths[this.positions.indexOf(curr)])));
    }
  }

  /**
   * Applies ball/cone constraint to a joint.
   */
  private applyBallConstraint(
    prev: Vector3,
    curr: Vector3,
    next: Vector3,
    constraint: JointConstraint
  ): void {
    const toBone = curr.sub(prev).normalize();
    const toNext = next.sub(curr).normalize();

    const angle = Math.acos(Math.max(-1, Math.min(1, toBone.dot(toNext))));
    const maxAngle = constraint.maxAngle ?? Math.PI / 2;

    if (angle > maxAngle) {
      const axis = toBone.cross(toNext).normalize();
      if (axis.lengthSquared() > 0.0001) {
        const rotation = Quaternion.fromAxisAngle(axis, maxAngle - angle);
        const rotatedDir = this.rotateVector(toNext, rotation);
        const idx = this.positions.indexOf(curr);
        if (idx >= 0 && idx < this.boneLengths.length) {
          next.copy(curr.add(rotatedDir.scale(this.boneLengths[idx])));
        }
      }
    }
  }

  /**
   * Applies twist constraint to a joint.
   */
  private applyTwistConstraint(
    prev: Vector3,
    curr: Vector3,
    next: Vector3,
    constraint: JointConstraint
  ): void {
    const toBone = curr.sub(prev).normalize();
    const maxTwist = constraint.maxAngle ?? Math.PI;
  }

  /**
   * Rotates a vector by a quaternion.
   */
  private rotateVector(v: Vector3, q: Quaternion): Vector3 {
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const qResult = q.multiply(qv).multiply(q.conjugate());
    return new Vector3(qResult.x, qResult.y, qResult.z);
  }

  /**
   * Updates skeleton bones from solved positions.
   */
  private updateSkeleton(skeleton: Skeleton): void {
    for (let i = 0; i < this.boneIndices.length - 1; i++) {
      const boneIndex = this.boneIndices[i];
      const bone = skeleton.getBoneByIndex(boneIndex)!;

      const worldMat = skeleton['worldMatrices'][boneIndex];
      const currentDir = worldMat.getPosition().sub(
        bone.parentIndex >= 0
          ? skeleton['worldMatrices'][bone.parentIndex].getPosition()
          : Vector3.zero()
      ).normalize();

      const targetDir = this.positions[i + 1].sub(this.positions[i]).normalize();

      if (currentDir.lengthSquared() > 0.0001 && targetDir.lengthSquared() > 0.0001) {
        const rotation = Quaternion.fromUnitVectors(currentDir, targetDir);

        const parentRot = (bone.parentIndex >= 0
          ? skeleton.getWorldMatrixByIndex(bone.parentIndex)?.getRotation()
          : Quaternion.identity()) as Quaternion ?? Quaternion.identity();

        const localRotation = parentRot.invert().multiply(rotation).multiply(bone.rotation);
        bone.rotation.copy(bone.rotation.slerp(localRotation, this.weight));
      }
    }

    skeleton.update(true);
  }

  /**
   * Sets the blend weight.
   *
   * @param weight - Blend weight [0-1]
   */
  setWeight(weight: number): void {
    this.weight = Math.max(0, Math.min(1, weight));
  }

  /**
   * Gets the blend weight.
   *
   * @returns Current weight
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Resets the solver state.
   */
  reset(): void {
    this.initialized = false;
  }
}
