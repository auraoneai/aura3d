/**
 * Cyclic Coordinate Descent (CCD) IK solver.
 * Iterative solver that rotates each joint toward the target sequentially.
 * Supports damping, joint limits, and optional root motion.
 * @module animation/IK/CCDSolver
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Skeleton } from '../Skeleton';

/**
 * Joint limit configuration for CCD.
 */
export interface JointLimit {
  /** Minimum rotation angle (radians) */
  min: Vector3;
  /** Maximum rotation angle (radians) */
  max: Vector3;
}

/**
 * Configuration for CCD solver.
 */
export interface CCDConfig {
  /** Bone chain (root to tip) */
  boneChain: string[];
  /** Convergence tolerance */
  tolerance?: number;
  /** Maximum iterations */
  maxIterations?: number;
  /** Damping factor [0-1] for stability */
  damping?: number;
  /** Joint limits per bone */
  jointLimits?: Map<string, JointLimit>;
  /** Allow root bone to move */
  enableRootMotion?: boolean;
  /** Blend weight [0-1] */
  weight?: number;
}

/**
 * CCD (Cyclic Coordinate Descent) IK solver.
 * Iteratively rotates each joint from tip to root to reach target.
 * Simple but effective solver with damping for stability.
 *
 * @example
 * ```typescript
 * const solver = new CCDSolver({
 *   boneChain: ['shoulder', 'elbow', 'wrist', 'hand'],
 *   tolerance: 0.01,
 *   maxIterations: 20,
 *   damping: 0.8,
 *   enableRootMotion: false
 * });
 *
 * solver.solve(skeleton, target);
 * ```
 */
export class CCDSolver {
  private boneChain: string[];
  private tolerance: number;
  private maxIterations: number;
  private damping: number;
  private jointLimits: Map<string, JointLimit>;
  private enableRootMotion: boolean;
  private weight: number;

  private boneIndices: number[] = [];
  private initialized: boolean = false;

  /**
   * Creates a new CCD solver.
   *
   * @param config - Solver configuration
   */
  constructor(config: CCDConfig) {
    this.boneChain = config.boneChain;
    this.tolerance = config.tolerance ?? 0.01;
    this.maxIterations = config.maxIterations ?? 20;
    this.damping = config.damping ?? 0.5;
    this.jointLimits = config.jointLimits ?? new Map();
    this.enableRootMotion = config.enableRootMotion ?? false;
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

    for (const boneName of this.boneChain) {
      const index = skeleton.getBoneIndex(boneName);
      if (index === -1) {
        console.warn(`CCD: Could not find bone ${boneName}`);
        return false;
      }
      this.boneIndices.push(index);
    }

    this.initialized = true;
    return true;
  }

  /**
   * Solves CCD to reach target position.
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

    skeleton.update(true);

    const endEffectorIndex = this.boneIndices[this.boneIndices.length - 1];
    let iteration = 0;

    while (iteration < this.maxIterations) {
      skeleton.update(true);

      const endEffectorPos = skeleton['worldMatrices'][endEffectorIndex].getPosition();
      const distanceToTarget = Vector3.distance(endEffectorPos, target);

      if (distanceToTarget < this.tolerance) {
        break;
      }

      const startIndex = this.enableRootMotion ? 0 : 1;

      for (let i = this.boneIndices.length - 2; i >= startIndex; i--) {
        this.solveBone(skeleton, i, target);
      }

      iteration++;
    }

    return true;
  }

  /**
   * Solves a single bone rotation toward target.
   *
   * @param skeleton - Target skeleton
   * @param chainIndex - Index in bone chain
   * @param target - Target position
   */
  private solveBone(skeleton: Skeleton, chainIndex: number, target: Vector3): void {
    const boneIndex = this.boneIndices[chainIndex];
    const endEffectorIndex = this.boneIndices[this.boneIndices.length - 1];

    const bone = skeleton.getBoneByIndex(boneIndex)!;
    const boneWorld = skeleton['worldMatrices'][boneIndex];
    const endEffectorWorld = skeleton['worldMatrices'][endEffectorIndex];

    const bonePos = boneWorld.getPosition();
    const endEffectorPos = endEffectorWorld.getPosition();

    const toEndEffector = endEffectorPos.sub(bonePos);
    const toTarget = target.sub(bonePos);

    const endEffectorDist = toEndEffector.length();
    const targetDist = toTarget.length();

    if (endEffectorDist < 0.0001 || targetDist < 0.0001) {
      return;
    }

    const currentDir = toEndEffector.normalize();
    const targetDir = toTarget.normalize();

    const dotProduct = currentDir.dot(targetDir);
    if (dotProduct > 0.9999) {
      return;
    }

    let rotation = Quaternion.fromUnitVectors(currentDir, targetDir);

    rotation = Quaternion.identity().slerp(rotation, this.damping);

    const parentWorld = bone.parentIndex >= 0
      ? skeleton['worldMatrices'][bone.parentIndex]
      : new (require('../../math/Matrix4').Matrix4)();

    const parentRot = parentWorld.getRotation();
    const worldRot = parentRot.multiply(bone.rotation);
    const newWorldRot = rotation.multiply(worldRot);
    const newLocalRot = parentRot.invert().multiply(newWorldRot);

    const boneName = this.boneChain[chainIndex];
    const limit = this.jointLimits.get(boneName);

    if (limit) {
      this.applyJointLimits(newLocalRot, limit);
    }

    bone.rotation.copy(bone.rotation.slerp(newLocalRot, this.weight));

    skeleton.update(true);
  }

  /**
   * Applies joint limits to a rotation.
   *
   * @param rotation - Rotation to constrain
   * @param limit - Joint limit
   */
  private applyJointLimits(rotation: Quaternion, limit: JointLimit): void {
    const euler = rotation.toEuler('XYZ');

    euler.x = Math.max(limit.min.x, Math.min(limit.max.x, euler.x));
    euler.y = Math.max(limit.min.y, Math.min(limit.max.y, euler.y));
    euler.z = Math.max(limit.min.z, Math.min(limit.max.z, euler.z));

    rotation.setFromEuler(euler.x, euler.y, euler.z, 'XYZ');
  }

  /**
   * Sets the damping factor.
   *
   * @param damping - Damping [0-1]
   */
  setDamping(damping: number): void {
    this.damping = Math.max(0, Math.min(1, damping));
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
   * Gets the damping factor.
   *
   * @returns Current damping
   */
  getDamping(): number {
    return this.damping;
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
   * Enables or disables root motion.
   *
   * @param enable - Enable root motion
   */
  setEnableRootMotion(enable: boolean): void {
    this.enableRootMotion = enable;
  }

  /**
   * Resets the solver state.
   */
  reset(): void {
    this.initialized = false;
  }
}
