/**
 * Procedural locomotion generator for walking, running, and strafing.
 * Generates realistic leg and arm movement based on velocity and direction.
 * Includes foot placement, stride length, and natural weight shifting.
 * @module animation/LocomotionGenerator
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Skeleton } from './Skeleton';

/**
 * Locomotion gait types.
 */
export enum LocomotionGait {
  /** Walking gait */
  Walk = 0,
  /** Running gait */
  Run = 1,
  /** Sprinting gait */
  Sprint = 2,
  /** Sneaking gait */
  Sneak = 3
}

/**
 * Configuration for locomotion generator.
 */
export interface LocomotionConfig {
  /** Left leg bones */
  leftLeg: { hip: string; knee: string; foot: string };
  /** Right leg bones */
  rightLeg: { hip: string; knee: string; foot: string };
  /** Left arm bones (optional) */
  leftArm?: { shoulder: string; elbow: string; hand: string };
  /** Right arm bones (optional) */
  rightArm?: { shoulder: string; elbow: string; hand: string };
  /** Hip/root bone */
  hipBone: string;
  /** Spine bone */
  spineBone?: string;
  /** Stride length multiplier */
  strideLength?: number;
  /** Step height */
  stepHeight?: number;
  /** Hip sway amount */
  hipSway?: number;
  /** Spine rotation amount */
  spineRotation?: number;
  /** Arm swing amount */
  armSwing?: number;
}

/**
 * Leg state for procedural locomotion.
 */
interface LegState {
  /** Current phase [0-1] */
  phase: number;
  /** Foot position */
  footPosition: Vector3;
  /** Is planted */
  isPlanted: boolean;
  /** Step start position */
  stepStart: Vector3;
  /** Step target position */
  stepTarget: Vector3;
}

/**
 * Procedural locomotion generator.
 * Generates walking and running animations based on character velocity.
 * Creates natural-looking leg movement, arm swing, and body motion.
 *
 * @example
 * ```typescript
 * const locomotion = new LocomotionGenerator({
 *   leftLeg: { hip: 'hip_L', knee: 'knee_L', foot: 'foot_L' },
 *   rightLeg: { hip: 'hip_R', knee: 'knee_R', foot: 'foot_R' },
 *   leftArm: { shoulder: 'shoulder_L', elbow: 'elbow_L', hand: 'hand_L' },
 *   rightArm: { shoulder: 'shoulder_R', elbow: 'elbow_R', hand: 'hand_R' },
 *   hipBone: 'hips',
 *   spineBone: 'spine',
 *   strideLength: 1.0,
 *   stepHeight: 0.15
 * });
 *
 * const velocity = new Vector3(0, 0, 2); // Moving forward at 2 m/s
 * locomotion.update(skeleton, velocity, deltaTime);
 * ```
 */
export class LocomotionGenerator {
  private config: LocomotionConfig;

  private leftLegState: LegState;
  private rightLegState: LegState;

  private cycleTime: number = 0;
  private currentGait: LocomotionGait = LocomotionGait.Walk;
  private strideLength: number;
  private stepHeight: number;
  private hipSway: number;
  private spineRotation: number;
  private armSwing: number;

  private initialized: boolean = false;

  /**
   * Creates a new locomotion generator.
   *
   * @param config - Generator configuration
   */
  constructor(config: LocomotionConfig) {
    this.config = config;
    this.strideLength = config.strideLength ?? 0.7;
    this.stepHeight = config.stepHeight ?? 0.15;
    this.hipSway = config.hipSway ?? 0.05;
    this.spineRotation = config.spineRotation ?? 0.1;
    this.armSwing = config.armSwing ?? 0.3;

    this.leftLegState = {
      phase: 0,
      footPosition: Vector3.zero(),
      isPlanted: true,
      stepStart: Vector3.zero(),
      stepTarget: Vector3.zero()
    };

    this.rightLegState = {
      phase: 0.5,
      footPosition: Vector3.zero(),
      isPlanted: true,
      stepStart: Vector3.zero(),
      stepTarget: Vector3.zero()
    };
  }

  /**
   * Updates locomotion animation.
   *
   * @param skeleton - Target skeleton
   * @param velocity - Movement velocity (world space)
   * @param deltaTime - Time delta in seconds
   */
  update(skeleton: Skeleton, velocity: Vector3, deltaTime: number): void {
    if (!this.initialized) {
      this.initialize(skeleton);
    }

    const speed = velocity.length();

    if (speed < 0.01) {
      return;
    }

    this.updateGait(speed);

    const frequency = this.getFrequency();
    this.cycleTime += deltaTime * frequency;

    if (this.cycleTime > 1.0) {
      this.cycleTime -= 1.0;
    }

    this.leftLegState.phase = this.cycleTime;
    this.rightLegState.phase = (this.cycleTime + 0.5) % 1.0;

    const moveDirection = velocity.normalize();

    this.updateLeg(skeleton, 'left', this.leftLegState, moveDirection, speed);
    this.updateLeg(skeleton, 'right', this.rightLegState, moveDirection, speed);

    this.updateHipMotion(skeleton);

    this.updateSpineRotation(skeleton, moveDirection);

    if (this.config.leftArm && this.config.rightArm) {
      this.updateArmSwing(skeleton);
    }

    skeleton.update(true);
  }

  /**
   * Initializes the generator.
   */
  private initialize(skeleton: Skeleton): void {
    skeleton.update(true);

    const leftFootIndex = skeleton.getBoneIndex(this.config.leftLeg.foot);
    const rightFootIndex = skeleton.getBoneIndex(this.config.rightLeg.foot);

    if (leftFootIndex !== -1) {
      this.leftLegState.footPosition = skeleton['worldMatrices'][leftFootIndex].getPosition();
      this.leftLegState.stepStart = this.leftLegState.footPosition.clone();
      this.leftLegState.stepTarget = this.leftLegState.footPosition.clone();
    }

    if (rightFootIndex !== -1) {
      this.rightLegState.footPosition = skeleton['worldMatrices'][rightFootIndex].getPosition();
      this.rightLegState.stepStart = this.rightLegState.footPosition.clone();
      this.rightLegState.stepTarget = this.rightLegState.footPosition.clone();
    }

    this.initialized = true;
  }

  /**
   * Updates gait based on speed.
   */
  private updateGait(speed: number): void {
    if (speed < 0.5) {
      this.currentGait = LocomotionGait.Sneak;
    } else if (speed < 2.0) {
      this.currentGait = LocomotionGait.Walk;
    } else if (speed < 4.0) {
      this.currentGait = LocomotionGait.Run;
    } else {
      this.currentGait = LocomotionGait.Sprint;
    }
  }

  /**
   * Gets step frequency based on gait.
   */
  private getFrequency(): number {
    switch (this.currentGait) {
      case LocomotionGait.Sneak:
        return 1.0;
      case LocomotionGait.Walk:
        return 2.0;
      case LocomotionGait.Run:
        return 3.0;
      case LocomotionGait.Sprint:
        return 4.0;
      default:
        return 2.0;
    }
  }

  /**
   * Updates a single leg.
   */
  private updateLeg(
    skeleton: Skeleton,
    side: 'left' | 'right',
    state: LegState,
    moveDirection: Vector3,
    speed: number
  ): void {
    const legConfig = side === 'left' ? this.config.leftLeg : this.config.rightLeg;
    const hipIndex = skeleton.getBoneIndex(legConfig.hip);
    const kneeIndex = skeleton.getBoneIndex(legConfig.knee);
    const footIndex = skeleton.getBoneIndex(legConfig.foot);

    if (hipIndex === -1 || kneeIndex === -1 || footIndex === -1) {
      return;
    }

    const hipBone = skeleton.getBoneByIndex(hipIndex)!;
    const hipWorld = skeleton['worldMatrices'][hipIndex];
    const hipPos = hipWorld.getPosition();

    const strideDistance = this.strideLength * speed * 0.5;

    const stanceDuration = 0.6;
    const swingDuration = 0.4;

    if (state.phase < stanceDuration) {
      state.isPlanted = true;
    } else {
      if (state.isPlanted) {
        state.stepStart = state.footPosition.clone();

        const lateralOffset = side === 'left' ? -0.1 : 0.1;
        const lateral = moveDirection.cross(Vector3.up()).normalize().scale(lateralOffset);

        state.stepTarget = hipPos.add(moveDirection.scale(strideDistance)).add(lateral);
        state.isPlanted = false;
      }

      const swingPhase = (state.phase - stanceDuration) / swingDuration;
      const smoothPhase = this.smoothStep(swingPhase);

      state.footPosition = state.stepStart.lerp(state.stepTarget, smoothPhase);

      const heightCurve = Math.sin(swingPhase * Math.PI);
      state.footPosition.y += heightCurve * this.stepHeight;
    }

    const hipToFoot = state.footPosition.sub(hipPos);
    const footBone = skeleton.getBoneByIndex(footIndex)!;

    const targetDir = hipToFoot.normalize();
    const hipRot = hipWorld.getRotation();
    const localDown = new Vector3(0, -1, 0);
    const qv = new Quaternion(localDown.x, localDown.y, localDown.z, 0);
    const qResult = hipRot.multiply(qv).multiply(hipRot.conjugate());
    const currentDir = new Vector3(qResult.x, qResult.y, qResult.z);

    if (currentDir.lengthSquared() > 0.0001) {
      const rotation = Quaternion.fromUnitVectors(currentDir, targetDir);
      const parentRot = hipBone.parentIndex >= 0
        ? skeleton['worldMatrices'][hipBone.parentIndex].getRotation()
        : Quaternion.identity();

      const localRotation = parentRot.invert().multiply(rotation).multiply(hipBone.rotation);
      hipBone.rotation = hipBone.rotation.slerp(localRotation, 0.5);
    }
  }

  /**
   * Updates hip swaying motion.
   */
  private updateHipMotion(skeleton: Skeleton): void {
    const hipIndex = skeleton.getBoneIndex(this.config.hipBone);
    if (hipIndex === -1) return;

    const hipBone = skeleton.getBoneByIndex(hipIndex)!;

    const swayPhase = this.cycleTime * Math.PI * 2;
    const sway = Math.sin(swayPhase) * this.hipSway;

    const verticalBob = Math.abs(Math.sin(swayPhase * 2)) * this.hipSway * 0.5;

    hipBone.position.x += sway;
    hipBone.position.y -= verticalBob;
  }

  /**
   * Updates spine rotation for natural walking motion.
   */
  private updateSpineRotation(skeleton: Skeleton, moveDirection: Vector3): void {
    if (!this.config.spineBone) return;

    const spineIndex = skeleton.getBoneIndex(this.config.spineBone);
    if (spineIndex === -1) return;

    const spineBone = skeleton.getBoneByIndex(spineIndex)!;

    const rotationPhase = this.cycleTime * Math.PI * 2;
    const twist = Math.sin(rotationPhase) * this.spineRotation;

    const spineRotation = Quaternion.fromEuler(0, twist, 0, 'XYZ');
    spineBone.rotation = spineBone.rotation.multiply(spineRotation);
  }

  /**
   * Updates arm swing motion.
   */
  private updateArmSwing(skeleton: Skeleton): void {
    if (!this.config.leftArm || !this.config.rightArm) return;

    const leftShoulderIndex = skeleton.getBoneIndex(this.config.leftArm.shoulder);
    const rightShoulderIndex = skeleton.getBoneIndex(this.config.rightArm.shoulder);

    if (leftShoulderIndex === -1 || rightShoulderIndex === -1) return;

    const leftShoulder = skeleton.getBoneByIndex(leftShoulderIndex)!;
    const rightShoulder = skeleton.getBoneByIndex(rightShoulderIndex)!;

    const swingPhase = this.cycleTime * Math.PI * 2;

    const leftSwing = Math.sin(swingPhase + Math.PI) * this.armSwing;
    const rightSwing = Math.sin(swingPhase) * this.armSwing;

    const leftRotation = Quaternion.fromEuler(leftSwing, 0, 0, 'XYZ');
    const rightRotation = Quaternion.fromEuler(rightSwing, 0, 0, 'XYZ');

    leftShoulder.rotation = leftShoulder.rotation.multiply(leftRotation);
    rightShoulder.rotation = rightShoulder.rotation.multiply(rightRotation);
  }

  /**
   * Smooth step interpolation.
   */
  private smoothStep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  /**
   * Sets stride length multiplier.
   *
   * @param length - Stride length
   */
  setStrideLength(length: number): void {
    this.strideLength = Math.max(0, length);
  }

  /**
   * Sets step height.
   *
   * @param height - Step height
   */
  setStepHeight(height: number): void {
    this.stepHeight = Math.max(0, height);
  }

  /**
   * Sets arm swing amount.
   *
   * @param amount - Arm swing amount
   */
  setArmSwing(amount: number): void {
    this.armSwing = Math.max(0, amount);
  }

  /**
   * Resets the generator state.
   */
  reset(): void {
    this.initialized = false;
    this.cycleTime = 0;
    this.leftLegState.phase = 0;
    this.rightLegState.phase = 0.5;
  }
}
