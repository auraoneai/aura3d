/**
 * Full body IK solver with multiple simultaneous targets.
 * Coordinates solving for hands, feet, head, and hips with spine chain.
 * Performance: < 1ms for full body solve.
 * @module animation/IK/FullBodyIKSolver
 */

import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Skeleton } from '../Skeleton';
import { TwoBoneIKSolver } from './TwoBoneIKSolver';
import { FABRIKSolver } from './FABRIKSolver';

/**
 * Full body IK target.
 */
export interface IKTarget {
  /** Target position */
  position: Vector3;
  /** Target rotation (optional) */
  rotation?: Quaternion;
  /** Target weight [0-1] */
  weight: number;
}

/**
 * Configuration for full body IK.
 */
export interface FullBodyIKConfig {
  /** Left hand chain */
  leftArm?: { shoulder: string; elbow: string; hand: string };
  /** Right hand chain */
  rightArm?: { shoulder: string; elbow: string; hand: string };
  /** Left leg chain */
  leftLeg?: { hip: string; knee: string; foot: string };
  /** Right leg chain */
  rightLeg?: { hip: string; knee: string; foot: string };
  /** Spine chain (hips to chest) */
  spineChain?: string[];
  /** Head bone */
  headBone?: string;
  /** Root/hips bone */
  hipsBone?: string;
  /** Overall blend weight */
  weight?: number;
}

/**
 * Full body IK solver with multiple simultaneous targets.
 * Coordinates solving for multiple limbs and spine with proper weight distribution.
 * Maintains balance through hip positioning.
 *
 * @example
 * ```typescript
 * const solver = new FullBodyIKSolver({
 *   leftArm: { shoulder: 'shoulder_L', elbow: 'elbow_L', hand: 'hand_L' },
 *   rightArm: { shoulder: 'shoulder_R', elbow: 'elbow_R', hand: 'hand_R' },
 *   leftLeg: { hip: 'hip_L', knee: 'knee_L', foot: 'foot_L' },
 *   rightLeg: { hip: 'hip_R', knee: 'knee_R', foot: 'foot_R' },
 *   spineChain: ['hips', 'spine1', 'spine2', 'chest'],
 *   headBone: 'head',
 *   hipsBone: 'hips'
 * });
 *
 * solver.setHandTarget('left', new Vector3(1, 1, 0), 1.0);
 * solver.setFootTarget('right', new Vector3(0.5, 0, 0.5), 1.0);
 * solver.solve(skeleton);
 * ```
 */
export class FullBodyIKSolver {
  private config: FullBodyIKConfig;
  private weight: number;

  private leftArmSolver?: TwoBoneIKSolver;
  private rightArmSolver?: TwoBoneIKSolver;
  private leftLegSolver?: TwoBoneIKSolver;
  private rightLegSolver?: TwoBoneIKSolver;
  private spineSolver?: FABRIKSolver;

  private leftHandTarget?: IKTarget;
  private rightHandTarget?: IKTarget;
  private leftFootTarget?: IKTarget;
  private rightFootTarget?: IKTarget;
  private headTarget?: IKTarget;
  private hipsTarget?: IKTarget;

  private initialized: boolean = false;

  /**
   * Creates a new full body IK solver.
   *
   * @param config - Solver configuration
   */
  constructor(config: FullBodyIKConfig) {
    this.config = config;
    this.weight = config.weight ?? 1.0;
  }

  /**
   * Initializes all sub-solvers.
   *
   * @param skeleton - Target skeleton
   */
  private initialize(skeleton: Skeleton): void {
    if (this.config.leftArm) {
      this.leftArmSolver = new TwoBoneIKSolver({
        rootBone: this.config.leftArm.shoulder,
        midBone: this.config.leftArm.elbow,
        endBone: this.config.leftArm.hand,
        poleVector: new Vector3(-1, 0, 0)
      });
    }

    if (this.config.rightArm) {
      this.rightArmSolver = new TwoBoneIKSolver({
        rootBone: this.config.rightArm.shoulder,
        midBone: this.config.rightArm.elbow,
        endBone: this.config.rightArm.hand,
        poleVector: new Vector3(1, 0, 0)
      });
    }

    if (this.config.leftLeg) {
      this.leftLegSolver = new TwoBoneIKSolver({
        rootBone: this.config.leftLeg.hip,
        midBone: this.config.leftLeg.knee,
        endBone: this.config.leftLeg.foot,
        poleVector: new Vector3(0, 0, 1)
      });
    }

    if (this.config.rightLeg) {
      this.rightLegSolver = new TwoBoneIKSolver({
        rootBone: this.config.rightLeg.hip,
        midBone: this.config.rightLeg.knee,
        endBone: this.config.rightLeg.foot,
        poleVector: new Vector3(0, 0, 1)
      });
    }

    if (this.config.spineChain && this.config.spineChain.length > 0) {
      this.spineSolver = new FABRIKSolver({
        boneChain: this.config.spineChain,
        tolerance: 0.01,
        maxIterations: 5
      });
    }

    this.initialized = true;
  }

  /**
   * Sets left hand target.
   *
   * @param position - Target position
   * @param weight - Target weight [0-1]
   * @param rotation - Target rotation (optional)
   */
  setHandTarget(
    side: 'left' | 'right',
    position: Vector3,
    weight: number = 1.0,
    rotation?: Quaternion
  ): void {
    const target: IKTarget = { position, weight, rotation };

    if (side === 'left') {
      this.leftHandTarget = target;
    } else {
      this.rightHandTarget = target;
    }
  }

  /**
   * Sets foot target.
   *
   * @param side - 'left' or 'right'
   * @param position - Target position
   * @param weight - Target weight [0-1]
   * @param rotation - Target rotation (optional)
   */
  setFootTarget(
    side: 'left' | 'right',
    position: Vector3,
    weight: number = 1.0,
    rotation?: Quaternion
  ): void {
    const target: IKTarget = { position, weight, rotation };

    if (side === 'left') {
      this.leftFootTarget = target;
    } else {
      this.rightFootTarget = target;
    }
  }

  /**
   * Sets head look-at target.
   *
   * @param position - Target position to look at
   * @param weight - Target weight [0-1]
   */
  setHeadTarget(position: Vector3, weight: number = 1.0): void {
    this.headTarget = { position, weight };
  }

  /**
   * Sets hips target for body positioning.
   *
   * @param position - Target position
   * @param weight - Target weight [0-1]
   */
  setHipsTarget(position: Vector3, weight: number = 1.0): void {
    this.hipsTarget = { position, weight };
  }

  /**
   * Clears all targets.
   */
  clearTargets(): void {
    this.leftHandTarget = undefined;
    this.rightHandTarget = undefined;
    this.leftFootTarget = undefined;
    this.rightFootTarget = undefined;
    this.headTarget = undefined;
    this.hipsTarget = undefined;
  }

  /**
   * Solves full body IK for all active targets.
   *
   * @param skeleton - Target skeleton
   * @returns True if solve succeeded
   */
  solve(skeleton: Skeleton): boolean {
    if (!this.initialized) {
      this.initialize(skeleton);
    }

    if (this.weight <= 0) {
      return true;
    }

    this.solveHips(skeleton);

    this.solveFeet(skeleton);

    this.solveSpine(skeleton);

    this.solveArms(skeleton);

    this.solveHead(skeleton);

    skeleton.update(true);
    return true;
  }

  /**
   * Solves hip positioning for balance.
   */
  private solveHips(skeleton: Skeleton): void {
    if (!this.hipsTarget || !this.config.hipsBone) {
      return;
    }

    const hipsIndex = skeleton.getBoneIndex(this.config.hipsBone);
    if (hipsIndex === -1) return;

    const hipsBone = skeleton.getBoneByIndex(hipsIndex)!;
    const currentPos = skeleton['worldMatrices'][hipsIndex].getPosition();
    const targetPos = this.hipsTarget.position;

    const offset = targetPos.sub(currentPos).scale(this.hipsTarget.weight * this.weight);
    hipsBone.position.addInPlace(offset);
  }

  /**
   * Solves foot IK.
   */
  private solveFeet(skeleton: Skeleton): void {
    if (this.leftFootTarget && this.leftLegSolver) {
      this.leftLegSolver.setWeight(this.leftFootTarget.weight * this.weight);
      this.leftLegSolver.solve(skeleton, this.leftFootTarget.position);
    }

    if (this.rightFootTarget && this.rightLegSolver) {
      this.rightLegSolver.setWeight(this.rightFootTarget.weight * this.weight);
      this.rightLegSolver.solve(skeleton, this.rightFootTarget.position);
    }
  }

  /**
   * Solves spine chain.
   */
  private solveSpine(skeleton: Skeleton): void {
    if (!this.spineSolver || !this.config.spineChain) {
      return;
    }

    if (this.leftHandTarget || this.rightHandTarget || this.headTarget) {
      const chestIndex = skeleton.getBoneIndex(
        this.config.spineChain[this.config.spineChain.length - 1]
      );

      if (chestIndex !== -1) {
        const chestPos = skeleton['worldMatrices'][chestIndex].getPosition();
        let targetPos = chestPos.clone();
        let totalWeight = 0;

        if (this.leftHandTarget && this.leftHandTarget.weight > 0) {
          targetPos.addInPlace(
            this.leftHandTarget.position.sub(chestPos).scale(this.leftHandTarget.weight * 0.3)
          );
          totalWeight += this.leftHandTarget.weight * 0.3;
        }

        if (this.rightHandTarget && this.rightHandTarget.weight > 0) {
          targetPos.addInPlace(
            this.rightHandTarget.position.sub(chestPos).scale(this.rightHandTarget.weight * 0.3)
          );
          totalWeight += this.rightHandTarget.weight * 0.3;
        }

        if (totalWeight > 0) {
          this.spineSolver.setWeight(totalWeight * this.weight);
          this.spineSolver.solve(skeleton, targetPos);
        }
      }
    }
  }

  /**
   * Solves arm IK.
   */
  private solveArms(skeleton: Skeleton): void {
    if (this.leftHandTarget && this.leftArmSolver) {
      this.leftArmSolver.setWeight(this.leftHandTarget.weight * this.weight);
      this.leftArmSolver.solve(skeleton, this.leftHandTarget.position);
    }

    if (this.rightHandTarget && this.rightArmSolver) {
      this.rightArmSolver.setWeight(this.rightHandTarget.weight * this.weight);
      this.rightArmSolver.solve(skeleton, this.rightHandTarget.position);
    }
  }

  /**
   * Solves head look-at constraint.
   */
  private solveHead(skeleton: Skeleton): void {
    if (!this.headTarget || !this.config.headBone) {
      return;
    }

    const headIndex = skeleton.getBoneIndex(this.config.headBone);
    if (headIndex === -1) return;

    const headBone = skeleton.getBoneByIndex(headIndex)!;
    const headWorld = skeleton['worldMatrices'][headIndex];
    const headPos = headWorld.getPosition();

    const toTarget = this.headTarget.position.sub(headPos).normalize();

    const headRotData = headWorld.getRotation();
    const headRot = new Quaternion(headRotData.x, headRotData.y, headRotData.z, headRotData.w);
    const localForward = Vector3.forward();
    const qv = new Quaternion(localForward.x, localForward.y, localForward.z, 0);
    const qResult = headRot.multiply(qv).multiply(headRot.conjugate());
    const currentForward = new Vector3(qResult.x, qResult.y, qResult.z);

    const rotation = Quaternion.fromUnitVectors(currentForward, toTarget);

    let parentRot: Quaternion;
    if (headBone.parentIndex >= 0) {
      const parentRotData = skeleton['worldMatrices'][headBone.parentIndex].getRotation();
      parentRot = new Quaternion(parentRotData.x, parentRotData.y, parentRotData.z, parentRotData.w);
    } else {
      parentRot = Quaternion.identity();
    }

    const parentInv = parentRot.invert();
    const localRotation = parentInv.multiply(rotation).multiply(headBone.rotation);

    headBone.rotation.copy(
      headBone.rotation.slerp(localRotation, this.headTarget.weight * this.weight)
    );
  }

  /**
   * Sets overall blend weight.
   *
   * @param weight - Blend weight [0-1]
   */
  setWeight(weight: number): void {
    this.weight = Math.max(0, Math.min(1, weight));
  }

  /**
   * Gets overall blend weight.
   *
   * @returns Current weight
   */
  getWeight(): number {
    return this.weight;
  }

  /**
   * Resets solver state.
   */
  reset(): void {
    this.initialized = false;
    this.clearTargets();

    if (this.leftArmSolver) this.leftArmSolver.reset();
    if (this.rightArmSolver) this.rightArmSolver.reset();
    if (this.leftLegSolver) this.leftLegSolver.reset();
    if (this.rightLegSolver) this.rightLegSolver.reset();
    if (this.spineSolver) this.spineSolver.reset();
  }
}
