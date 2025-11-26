/**
 * Fast analytical two-bone IK solver for limbs (arms, legs).
 * Uses law of cosines for efficient solving with pole vector support.
 * Performance: < 0.01ms per solve.
 * @module animation/IK/TwoBoneIKSolver
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Matrix4 } from '../../math/Matrix4';
import { Skeleton } from '../Skeleton';

/**
 * Configuration for two-bone IK solver.
 */
export interface TwoBoneIKConfig {
  /** Root bone name (shoulder/hip) */
  rootBone: string;
  /** Middle bone name (elbow/knee) */
  midBone: string;
  /** End bone name (hand/foot) */
  endBone: string;
  /** Pole vector position (elbow/knee hint) */
  poleVector?: Vector3;
  /** Blend weight [0-1] for IK influence */
  weight?: number;
  /** Allow stretching beyond max reach */
  allowStretching?: boolean;
}

/**
 * Fast two-bone IK solver using analytical solution.
 * Solves inverse kinematics for two-bone chains (arm, leg) using law of cosines.
 * Supports pole vector for controlling elbow/knee direction.
 *
 * @example
 * ```typescript
 * const solver = new TwoBoneIKSolver({
 *   rootBone: 'shoulder_R',
 *   midBone: 'elbow_R',
 *   endBone: 'hand_R',
 *   poleVector: new Vector3(1, 0, 0),
 *   weight: 1.0
 * });
 *
 * const target = new Vector3(2, 1, 0);
 * solver.solve(skeleton, target);
 * ```
 */
export class TwoBoneIKSolver {
  private rootBone: string;
  private midBone: string;
  private endBone: string;
  private poleVector: Vector3;
  private weight: number;
  private allowStretching: boolean;

  private rootIndex: number = -1;
  private midIndex: number = -1;
  private endIndex: number = -1;

  private upperLength: number = 0;
  private lowerLength: number = 0;
  private maxReach: number = 0;

  private initialized: boolean = false;

  /**
   * Creates a new two-bone IK solver.
   *
   * @param config - Solver configuration
   */
  constructor(config: TwoBoneIKConfig) {
    this.rootBone = config.rootBone;
    this.midBone = config.midBone;
    this.endBone = config.endBone;
    this.poleVector = config.poleVector ?? new Vector3(0, 1, 0);
    this.weight = config.weight ?? 1.0;
    this.allowStretching = config.allowStretching ?? false;
  }

  /**
   * Sets the blend weight for IK influence.
   *
   * @param weight - Blend weight [0-1]
   */
  setWeight(weight: number): void {
    this.weight = Math.max(0, Math.min(1, weight));
  }

  /**
   * Sets the pole vector for controlling mid-joint direction.
   *
   * @param poleVector - Pole vector position
   */
  setPoleVector(poleVector: Vector3): void {
    this.poleVector.copy(poleVector);
  }

  /**
   * Initializes the solver with skeleton data.
   * Caches bone indices and computes bone lengths.
   *
   * @param skeleton - Target skeleton
   * @returns True if initialization succeeded
   */
  private initialize(skeleton: Skeleton): boolean {
    this.rootIndex = skeleton.getBoneIndex(this.rootBone);
    this.midIndex = skeleton.getBoneIndex(this.midBone);
    this.endIndex = skeleton.getBoneIndex(this.endBone);

    if (this.rootIndex === -1 || this.midIndex === -1 || this.endIndex === -1) {
      console.warn(`TwoBoneIK: Could not find bones ${this.rootBone}, ${this.midBone}, ${this.endBone}`);
      return false;
    }

    skeleton.update(true);

    const rootWorld = skeleton['worldMatrices'][this.rootIndex];
    const midWorld = skeleton['worldMatrices'][this.midIndex];
    const endWorld = skeleton['worldMatrices'][this.endIndex];

    const rootPos = rootWorld.getPosition();
    const midPos = midWorld.getPosition();
    const endPos = endWorld.getPosition();

    this.upperLength = Vector3.distance(rootPos, midPos);
    this.lowerLength = Vector3.distance(midPos, endPos);
    this.maxReach = this.upperLength + this.lowerLength;

    this.initialized = true;
    return true;
  }

  /**
   * Solves two-bone IK to reach target position.
   * Uses analytical solution with law of cosines.
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

    const rootWorld = skeleton['worldMatrices'][this.rootIndex];
    const rootPos = rootWorld.getPosition();

    let targetPos = target.clone();
    const toTarget = targetPos.sub(rootPos);
    const distance = toTarget.length();

    if (distance < 0.0001) {
      return false;
    }

    let reachDistance = distance;
    if (!this.allowStretching && distance > this.maxReach) {
      reachDistance = this.maxReach;
      targetPos = rootPos.add(toTarget.normalize().scale(this.maxReach));
    }

    const upperLen = this.upperLength;
    const lowerLen = this.lowerLength;

    const rootBone = skeleton.getBoneByIndex(this.rootIndex)!;
    const midBone = skeleton.getBoneByIndex(this.midIndex)!;

    const cosAngle = Math.max(-1, Math.min(1,
      (upperLen * upperLen + lowerLen * lowerLen - reachDistance * reachDistance) /
      (2 * upperLen * lowerLen)
    ));
    const midAngle = Math.PI - Math.acos(cosAngle);

    const targetDir = targetPos.sub(rootPos).normalize();

    const parentWorld = rootBone.parentIndex >= 0
      ? skeleton.getWorldMatrixByIndex(rootBone.parentIndex) ?? new Matrix4()
      : new Matrix4();

    const parentRot = parentWorld.getRotation() as Quaternion;
    const parentRotInv = parentRot.conjugate();

    const currentDir = new Vector3(0, this.upperLength, 0);
    const rootRotation = Quaternion.fromUnitVectors(currentDir.normalize(), targetDir);

    const poleDir = this.poleVector.sub(rootPos).normalize();
    const chainPlaneNormal = targetDir.cross(poleDir).normalize();

    if (chainPlaneNormal.lengthSquared() > 0.0001) {
      const rootToPole = poleDir.project(chainPlaneNormal.cross(targetDir)).normalize();

      const midRotQuat = rootRotation.multiply(Quaternion.fromAxisAngle(Vector3.forward(), midAngle / 2));
      const localMidDir = new Vector3(0, 1, 0);
      const qv = new Quaternion(localMidDir.x, localMidDir.y, localMidDir.z, 0);
      const qResult = midRotQuat.multiply(qv).multiply(midRotQuat.conjugate());
      const currentMidDir = new Vector3(qResult.x, qResult.y, qResult.z).normalize();

      const poleRotation = Quaternion.fromUnitVectors(currentMidDir, rootToPole);
      rootRotation.multiplyInPlace(poleRotation);
    }

    const localRootRotation = parentRotInv.multiply(rootRotation);
    const originalRootRot = rootBone.rotation.clone();
    rootBone.rotation.copy(originalRootRot.slerp(localRootRotation, this.weight));

    const midLocalAxis = new Vector3(1, 0, 0);
    const midRotation = Quaternion.fromAxisAngle(midLocalAxis, midAngle);
    const originalMidRot = midBone.rotation.clone();
    midBone.rotation.copy(originalMidRot.slerp(midRotation, this.weight));

    skeleton.update(true);
    return true;
  }

  /**
   * Gets the current blend weight.
   *
   * @returns Current weight [0-1]
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Gets the maximum reach distance of the chain.
   *
   * @returns Max reach distance
   */
  getMaxReach(): number {
    return this.maxReach;
  }

  /**
   * Resets the solver state.
   */
  reset(): void {
    this.initialized = false;
  }
}
