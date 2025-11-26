/**
 * Foot IK solver for ground adaptation and terrain following.
 * Handles foot placement, rotation, and hip adjustment for realistic locomotion.
 * Includes smooth transitions and raycast-based ground detection.
 * @module animation/FootIKSolver
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Ray } from '../math/Ray';
import { Skeleton } from './Skeleton';
import { TwoBoneIKSolver } from './IK/TwoBoneIKSolver';

/**
 * Raycast result for ground detection.
 */
export interface RaycastHit {
  /** Hit position */
  point: Vector3;
  /** Surface normal */
  normal: Vector3;
  /** Hit distance */
  distance: number;
}

/**
 * Raycast function type for ground detection.
 */
export type RaycastFunction = (ray: Ray, maxDistance: number) => RaycastHit | null;

/**
 * Configuration for foot IK solver.
 */
export interface FootIKConfig {
  /** Left leg bones */
  leftLeg: { hip: string; knee: string; foot: string; toe?: string };
  /** Right leg bones */
  rightLeg: { hip: string; knee: string; foot: string; toe?: string };
  /** Hip/root bone for height adjustment */
  hipBone: string;
  /** Raycast function for ground detection */
  raycast: RaycastFunction;
  /** Maximum raycast distance */
  maxRayDistance?: number;
  /** Foot offset from ground */
  footOffset?: number;
  /** Hip adjustment weight [0-1] */
  hipAdjustment?: number;
  /** Transition smoothing time (seconds) */
  smoothTime?: number;
  /** Overall blend weight [0-1] */
  weight?: number;
}

/**
 * Foot state for smooth transitions.
 */
interface FootState {
  /** Current foot position */
  position: Vector3;
  /** Current foot rotation */
  rotation: Quaternion;
  /** Target foot position */
  targetPosition: Vector3;
  /** Target foot rotation */
  targetRotation: Quaternion;
  /** Interpolation velocity */
  velocity: Vector3;
  /** Is foot grounded */
  isGrounded: boolean;
}

/**
 * Foot IK solver for ground adaptation.
 * Adjusts foot placement and rotation to match ground surface.
 * Handles hip height adjustment and smooth transitions.
 *
 * @example
 * ```typescript
 * const footIK = new FootIKSolver({
 *   leftLeg: { hip: 'hip_L', knee: 'knee_L', foot: 'foot_L', toe: 'toe_L' },
 *   rightLeg: { hip: 'hip_R', knee: 'knee_R', foot: 'foot_R', toe: 'toe_R' },
 *   hipBone: 'hips',
 *   raycast: (ray, maxDist) => physicsWorld.raycast(ray, maxDist),
 *   footOffset: 0.05,
 *   hipAdjustment: 0.7
 * });
 *
 * footIK.update(skeleton, deltaTime);
 * ```
 */
export class FootIKSolver {
  private config: FootIKConfig;
  private weight: number;

  private leftLegSolver: TwoBoneIKSolver;
  private rightLegSolver: TwoBoneIKSolver;

  private leftFootState: FootState;
  private rightFootState: FootState;

  private maxRayDistance: number;
  private footOffset: number;
  private hipAdjustment: number;
  private smoothTime: number;

  private initialized: boolean = false;
  private hipIndex: number = -1;

  /**
   * Creates a new foot IK solver.
   *
   * @param config - Solver configuration
   */
  constructor(config: FootIKConfig) {
    this.config = config;
    this.weight = config.weight ?? 1.0;
    this.maxRayDistance = config.maxRayDistance ?? 2.0;
    this.footOffset = config.footOffset ?? 0.05;
    this.hipAdjustment = config.hipAdjustment ?? 0.5;
    this.smoothTime = config.smoothTime ?? 0.2;

    this.leftLegSolver = new TwoBoneIKSolver({
      rootBone: config.leftLeg.hip,
      midBone: config.leftLeg.knee,
      endBone: config.leftLeg.foot,
      poleVector: new Vector3(0, 0, 1)
    });

    this.rightLegSolver = new TwoBoneIKSolver({
      rootBone: config.rightLeg.hip,
      midBone: config.rightLeg.knee,
      endBone: config.rightLeg.foot,
      poleVector: new Vector3(0, 0, 1)
    });

    this.leftFootState = this.createFootState();
    this.rightFootState = this.createFootState();
  }

  /**
   * Creates initial foot state.
   */
  private createFootState(): FootState {
    return {
      position: Vector3.zero(),
      rotation: Quaternion.identity(),
      targetPosition: Vector3.zero(),
      targetRotation: Quaternion.identity(),
      velocity: Vector3.zero(),
      isGrounded: false
    };
  }

  /**
   * Initializes the solver with skeleton.
   *
   * @param skeleton - Target skeleton
   */
  private initialize(skeleton: Skeleton): void {
    this.hipIndex = skeleton.getBoneIndex(this.config.hipBone);

    if (this.hipIndex === -1) {
      console.warn(`FootIK: Could not find hip bone ${this.config.hipBone}`);
    }

    this.initialized = true;
  }

  /**
   * Updates foot IK for current frame.
   *
   * @param skeleton - Target skeleton
   * @param deltaTime - Time delta in seconds
   */
  update(skeleton: Skeleton, deltaTime: number): void {
    if (!this.initialized) {
      this.initialize(skeleton);
    }

    if (this.weight <= 0) {
      return;
    }

    skeleton.update(true);

    this.updateFoot(skeleton, 'left', this.leftFootState, deltaTime);
    this.updateFoot(skeleton, 'right', this.rightFootState, deltaTime);

    this.adjustHipHeight(skeleton);

    this.leftLegSolver.setWeight(this.weight);
    this.leftLegSolver.solve(skeleton, this.leftFootState.position);

    this.rightLegSolver.setWeight(this.weight);
    this.rightLegSolver.solve(skeleton, this.rightFootState.position);

    this.applyFootRotation(skeleton, 'left', this.leftFootState);
    this.applyFootRotation(skeleton, 'right', this.rightFootState);
  }

  /**
   * Updates a single foot.
   *
   * @param skeleton - Target skeleton
   * @param side - 'left' or 'right'
   * @param state - Foot state
   * @param deltaTime - Time delta
   */
  private updateFoot(
    skeleton: Skeleton,
    side: 'left' | 'right',
    state: FootState,
    deltaTime: number
  ): void {
    const legConfig = side === 'left' ? this.config.leftLeg : this.config.rightLeg;
    const footIndex = skeleton.getBoneIndex(legConfig.foot);

    if (footIndex === -1) return;

    const footWorld = skeleton['worldMatrices'][footIndex];
    const footPos = footWorld.getPosition();

    const rayOrigin = footPos.add(new Vector3(0, this.maxRayDistance * 0.5, 0));
    const rayDirection = Vector3.down();
    const ray = new Ray(rayOrigin, rayDirection);

    const hit = this.config.raycast(ray, this.maxRayDistance);

    if (hit) {
      state.targetPosition = hit.point.add(new Vector3(0, this.footOffset, 0));

      const up = Vector3.up();
      const normal = hit.normal.normalize();
      const right = up.cross(normal).normalize();
      const forward = normal.cross(right).normalize();

      state.targetRotation = this.quaternionLookRotation(forward, normal);
      state.isGrounded = true;
    } else {
      state.targetPosition = footPos;
      state.targetRotation = footWorld.getRotation();
      state.isGrounded = false;
    }

    state.position = this.smoothDamp(
      state.position,
      state.targetPosition,
      state.velocity,
      this.smoothTime,
      deltaTime
    );

    state.rotation = state.rotation.slerp(state.targetRotation, deltaTime / this.smoothTime);
  }

  /**
   * Adjusts hip height based on foot positions.
   *
   * @param skeleton - Target skeleton
   */
  private adjustHipHeight(skeleton: Skeleton): void {
    if (this.hipIndex === -1 || this.hipAdjustment <= 0) {
      return;
    }

    const hipBone = skeleton.getBoneByIndex(this.hipIndex)!;
    const hipWorld = skeleton['worldMatrices'][this.hipIndex];
    const currentHipPos = hipWorld.getPosition();

    let lowestFootHeight = currentHipPos.y;

    if (this.leftFootState.isGrounded) {
      lowestFootHeight = Math.min(lowestFootHeight, this.leftFootState.position.y);
    }

    if (this.rightFootState.isGrounded) {
      lowestFootHeight = Math.min(lowestFootHeight, this.rightFootState.position.y);
    }

    const heightDiff = lowestFootHeight - currentHipPos.y;

    if (heightDiff < 0) {
      const adjustment = heightDiff * this.hipAdjustment * this.weight;
      hipBone.position.y += adjustment;
    }
  }

  /**
   * Applies foot rotation to match ground normal.
   *
   * @param skeleton - Target skeleton
   * @param side - 'left' or 'right'
   * @param state - Foot state
   */
  private applyFootRotation(
    skeleton: Skeleton,
    side: 'left' | 'right',
    state: FootState
  ): void {
    if (!state.isGrounded) return;

    const legConfig = side === 'left' ? this.config.leftLeg : this.config.rightLeg;
    const footIndex = skeleton.getBoneIndex(legConfig.foot);

    if (footIndex === -1) return;

    const footBone = skeleton.getBoneByIndex(footIndex)!;
    const parentWorld = footBone.parentIndex >= 0
      ? skeleton['worldMatrices'][footBone.parentIndex]
      : new (require('../math/Matrix4').Matrix4)();

    const parentRot = parentWorld.getRotation();
    const localRotation = parentRot.invert().multiply(state.rotation);

    footBone.rotation.copy(footBone.rotation.slerp(localRotation, this.weight));
  }

  /**
   * Smooth damp interpolation for smooth transitions.
   */
  private smoothDamp(
    current: Vector3,
    target: Vector3,
    velocity: Vector3,
    smoothTime: number,
    deltaTime: number
  ): Vector3 {
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    const change = current.sub(target);
    const temp = velocity.add(change.scale(omega)).scale(deltaTime);

    velocity.copy(velocity.sub(temp.scale(omega)).scale(exp));

    return target.add(change.add(temp).scale(exp));
  }

  /**
   * Creates a look rotation quaternion from forward and up vectors.
   */
  private quaternionLookRotation(forward: Vector3, up: Vector3): Quaternion {
    const right = up.cross(forward).normalize();
    const newUp = forward.cross(right).normalize();

    const m00 = right.x;
    const m01 = right.y;
    const m02 = right.z;
    const m10 = newUp.x;
    const m11 = newUp.y;
    const m12 = newUp.z;
    const m20 = forward.x;
    const m21 = forward.y;
    const m22 = forward.z;

    const trace = m00 + m11 + m22;
    let qx: number, qy: number, qz: number, qw: number;

    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      qw = 0.25 * s;
      qx = (m21 - m12) / s;
      qy = (m02 - m20) / s;
      qz = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      qw = (m21 - m12) / s;
      qx = 0.25 * s;
      qy = (m01 + m10) / s;
      qz = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      qw = (m02 - m20) / s;
      qx = (m01 + m10) / s;
      qy = 0.25 * s;
      qz = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      qw = (m10 - m01) / s;
      qx = (m02 + m20) / s;
      qy = (m12 + m21) / s;
      qz = 0.25 * s;
    }

    return new Quaternion(qx, qy, qz, qw);
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
   * Sets hip adjustment amount.
   *
   * @param amount - Hip adjustment [0-1]
   */
  setHipAdjustment(amount: number): void {
    this.hipAdjustment = Math.max(0, Math.min(1, amount));
  }

  /**
   * Resets solver state.
   */
  reset(): void {
    this.initialized = false;
    this.leftFootState = this.createFootState();
    this.rightFootState = this.createFootState();
    this.leftLegSolver.reset();
    this.rightLegSolver.reset();
  }
}
