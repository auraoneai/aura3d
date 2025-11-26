/**
 * Motion feature extraction for pose and trajectory matching.
 * Extracts discriminative features from animation poses for fast matching.
 * @module animation/MotionFeatures
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { Skeleton } from './Skeleton';

/**
 * Trajectory sample point for future prediction.
 */
export interface TrajectorySample {
  /** Position relative to character root */
  position: Vector3;
  /** Facing direction (normalized) */
  direction: Vector3;
}

/**
 * Complete pose features for a single frame.
 */
export interface PoseFeatures {
  /** Root position in world space */
  rootPosition: Vector3;
  /** Root velocity in world space */
  rootVelocity: Vector3;
  /** Root rotation (facing direction) */
  rootRotation: Quaternion;
  /** Bone positions relative to root */
  bonePositions: Vector3[];
  /** Bone velocities relative to root */
  boneVelocities: Vector3[];
  /** Future trajectory samples */
  trajectory: TrajectorySample[];
}

/**
 * Configuration for feature extraction.
 */
export interface FeatureConfig {
  /** Bone indices to include in features */
  featureBones?: number[];
  /** Trajectory prediction times (seconds into future) */
  trajectoryTimes?: number[];
  /** Whether to include bone velocities */
  includeVelocities?: boolean;
  /** Feature weights for matching */
  weights?: FeatureWeights;
}

/**
 * Weights for different feature components in matching.
 */
export interface FeatureWeights {
  /** Weight for pose matching */
  pose: number;
  /** Weight for trajectory matching */
  trajectory: number;
  /** Weight for velocity matching */
  velocity: number;
}

/**
 * Default feature weights for balanced matching.
 */
export const DEFAULT_FEATURE_WEIGHTS: FeatureWeights = {
  pose: 1.0,
  trajectory: 1.0,
  velocity: 0.5
};

/**
 * Extracts motion features from animation poses.
 * Features include bone positions, velocities, and future trajectory predictions.
 *
 * @example
 * ```typescript
 * const extractor = new MotionFeatureExtractor({
 *   featureBones: [0, 1, 2, 3], // Hip, spine, head, etc.
 *   trajectoryTimes: [0.33, 0.66, 1.0], // Predict 0.33s, 0.66s, 1s ahead
 *   includeVelocities: true
 * });
 *
 * // Extract features from current pose
 * const features = extractor.extractPoseFeatures(skeleton, rootVelocity, trajectory);
 *
 * // Convert to flat feature vector for KD-tree
 * const featureVector = extractor.featuresToVector(features);
 * ```
 */
export class MotionFeatureExtractor {
  /**
   * Bone indices to extract features from.
   */
  private readonly featureBones: number[];

  /**
   * Trajectory prediction times.
   */
  private readonly trajectoryTimes: number[];

  /**
   * Whether to include velocity features.
   */
  private readonly includeVelocities: boolean;

  /**
   * Feature weights for matching cost computation.
   */
  private readonly weights: FeatureWeights;

  /**
   * Cached feature vector size.
   */
  private readonly featureVectorSize: number;

  /**
   * Creates a feature extractor.
   *
   * @param config - Feature extraction configuration
   *
   * @example
   * ```typescript
   * const extractor = new MotionFeatureExtractor({
   *   featureBones: [0, 1, 2, 3, 4, 5],
   *   trajectoryTimes: [0.2, 0.4, 0.6],
   *   includeVelocities: true,
   *   weights: { pose: 1.0, trajectory: 1.5, velocity: 0.5 }
   * });
   * ```
   */
  constructor(config: FeatureConfig = {}) {
    this.featureBones = config.featureBones ?? [0, 1, 2, 3, 4, 5];
    this.trajectoryTimes = config.trajectoryTimes ?? [0.33, 0.66, 1.0];
    this.includeVelocities = config.includeVelocities ?? true;
    this.weights = config.weights ?? DEFAULT_FEATURE_WEIGHTS;

    const positionFeatures = this.featureBones.length * 3;
    const velocityFeatures = this.includeVelocities ? this.featureBones.length * 3 : 0;
    const trajectoryFeatures = this.trajectoryTimes.length * 6;

    this.featureVectorSize = positionFeatures + velocityFeatures + trajectoryFeatures;
  }

  /**
   * Gets the size of feature vectors produced by this extractor.
   *
   * @returns Feature vector dimension count
   *
   * @example
   * ```typescript
   * console.log(`Feature vector has ${extractor.getFeatureVectorSize()} dimensions`);
   * ```
   */
  getFeatureVectorSize(): number {
    return this.featureVectorSize;
  }

  /**
   * Extracts pose features from a skeleton.
   *
   * @param skeleton - Skeleton in current pose
   * @param rootVelocity - Root velocity in world space
   * @param trajectory - Future trajectory samples
   * @returns Extracted pose features
   *
   * @example
   * ```typescript
   * const features = extractor.extractPoseFeatures(
   *   skeleton,
   *   new Vector3(1, 0, 0),
   *   [
   *     { position: new Vector3(1, 0, 0), direction: new Vector3(1, 0, 0) },
   *     { position: new Vector3(2, 0, 0), direction: new Vector3(1, 0, 0) }
   *   ]
   * );
   * ```
   */
  extractPoseFeatures(
    skeleton: Skeleton,
    rootVelocity: Vector3,
    trajectory: TrajectorySample[]
  ): PoseFeatures {
    skeleton.update();

    const rootBone = skeleton.getBoneByIndex(0);
    if (!rootBone) {
      throw new Error('Skeleton has no root bone');
    }

    const rootPosition = rootBone.position.clone();
    const rootRotation = rootBone.rotation.clone();

    const bonePositions: Vector3[] = [];
    const boneVelocities: Vector3[] = [];

    for (const boneIdx of this.featureBones) {
      const bone = skeleton.getBoneByIndex(boneIdx);
      if (!bone) {
        bonePositions.push(Vector3.zero());
        if (this.includeVelocities) {
          boneVelocities.push(Vector3.zero());
        }
        continue;
      }

      const worldMatrix = skeleton.getWorldMatrix(bone.name);
      if (worldMatrix) {
        const worldPos = worldMatrix.getPosition();
        const relativePos = worldPos.sub(rootPosition);
        bonePositions.push(relativePos);
      } else {
        bonePositions.push(Vector3.zero());
      }

      if (this.includeVelocities) {
        boneVelocities.push(Vector3.zero());
      }
    }

    return {
      rootPosition,
      rootVelocity,
      rootRotation,
      bonePositions,
      boneVelocities,
      trajectory
    };
  }

  /**
   * Converts pose features to flat feature vector.
   *
   * @param features - Pose features to convert
   * @returns Flat Float32Array suitable for KD-tree
   *
   * @example
   * ```typescript
   * const vector = extractor.featuresToVector(features);
   * const nearest = kdTree.nearest(vector);
   * ```
   */
  featuresToVector(features: PoseFeatures): Float32Array {
    const vector = new Float32Array(this.featureVectorSize);
    let offset = 0;

    for (const pos of features.bonePositions) {
      vector[offset++] = pos.x;
      vector[offset++] = pos.y;
      vector[offset++] = pos.z;
    }

    if (this.includeVelocities) {
      for (const vel of features.boneVelocities) {
        vector[offset++] = vel.x;
        vector[offset++] = vel.y;
        vector[offset++] = vel.z;
      }
    }

    for (const sample of features.trajectory) {
      vector[offset++] = sample.position.x;
      vector[offset++] = sample.position.y;
      vector[offset++] = sample.position.z;
      vector[offset++] = sample.direction.x;
      vector[offset++] = sample.direction.y;
      vector[offset++] = sample.direction.z;
    }

    return vector;
  }

  /**
   * Converts flat feature vector back to pose features.
   *
   * @param vector - Flat feature vector
   * @returns Reconstructed pose features
   *
   * @example
   * ```typescript
   * const features = extractor.vectorToFeatures(storedVector);
   * ```
   */
  vectorToFeatures(vector: Float32Array): PoseFeatures {
    let offset = 0;

    const bonePositions: Vector3[] = [];
    for (let i = 0; i < this.featureBones.length; i++) {
      bonePositions.push(
        new Vector3(vector[offset], vector[offset + 1], vector[offset + 2])
      );
      offset += 3;
    }

    const boneVelocities: Vector3[] = [];
    if (this.includeVelocities) {
      for (let i = 0; i < this.featureBones.length; i++) {
        boneVelocities.push(
          new Vector3(vector[offset], vector[offset + 1], vector[offset + 2])
        );
        offset += 3;
      }
    }

    const trajectory: TrajectorySample[] = [];
    for (let i = 0; i < this.trajectoryTimes.length; i++) {
      const position = new Vector3(vector[offset], vector[offset + 1], vector[offset + 2]);
      offset += 3;
      const direction = new Vector3(vector[offset], vector[offset + 1], vector[offset + 2]);
      offset += 3;
      trajectory.push({ position, direction });
    }

    return {
      rootPosition: Vector3.zero(),
      rootVelocity: Vector3.zero(),
      rootRotation: Quaternion.identity(),
      bonePositions,
      boneVelocities,
      trajectory
    };
  }

  /**
   * Computes weighted matching cost between two feature vectors.
   *
   * @param a - First feature vector
   * @param b - Second feature vector
   * @returns Weighted cost (lower is better match)
   *
   * @example
   * ```typescript
   * const cost = extractor.computeMatchingCost(currentFeatures, candidateFeatures);
   * if (cost < bestCost) {
   *   bestCost = cost;
   *   bestMatch = candidateIndex;
   * }
   * ```
   */
  computeMatchingCost(a: Float32Array, b: Float32Array): number {
    let poseCost = 0;
    let trajectoryCost = 0;
    let velocityCost = 0;

    const poseFeatureCount = this.featureBones.length * 3;
    const velocityFeatureCount = this.includeVelocities ? this.featureBones.length * 3 : 0;

    for (let i = 0; i < poseFeatureCount; i++) {
      const diff = a[i] - b[i];
      poseCost += diff * diff;
    }

    if (this.includeVelocities) {
      for (let i = poseFeatureCount; i < poseFeatureCount + velocityFeatureCount; i++) {
        const diff = a[i] - b[i];
        velocityCost += diff * diff;
      }
    }

    const trajectoryStart = poseFeatureCount + velocityFeatureCount;
    for (let i = trajectoryStart; i < this.featureVectorSize; i++) {
      const diff = a[i] - b[i];
      trajectoryCost += diff * diff;
    }

    return (
      this.weights.pose * poseCost +
      this.weights.trajectory * trajectoryCost +
      this.weights.velocity * velocityCost
    );
  }

  /**
   * Computes velocity features from two consecutive poses.
   *
   * @param currentPose - Current pose features
   * @param previousPose - Previous pose features
   * @param deltaTime - Time between poses (seconds)
   * @returns Updated current pose with velocity features
   *
   * @example
   * ```typescript
   * const featuresWithVelocity = extractor.computeVelocities(
   *   currentFeatures,
   *   previousFeatures,
   *   0.033 // 30 FPS
   * );
   * ```
   */
  computeVelocities(
    currentPose: PoseFeatures,
    previousPose: PoseFeatures,
    deltaTime: number
  ): PoseFeatures {
    const velocities: Vector3[] = [];

    for (let i = 0; i < this.featureBones.length; i++) {
      if (i < currentPose.bonePositions.length && i < previousPose.bonePositions.length) {
        const delta = currentPose.bonePositions[i].sub(previousPose.bonePositions[i]);
        const velocity = delta.scale(1.0 / deltaTime);
        velocities.push(velocity);
      } else {
        velocities.push(Vector3.zero());
      }
    }

    const rootVelocity = currentPose.rootPosition
      .sub(previousPose.rootPosition)
      .scale(1.0 / deltaTime);

    return {
      ...currentPose,
      rootVelocity,
      boneVelocities: velocities
    };
  }

  /**
   * Normalizes feature vector for consistent matching.
   *
   * @param vector - Feature vector to normalize
   * @returns Normalized feature vector
   *
   * @example
   * ```typescript
   * const normalized = extractor.normalizeFeatures(rawFeatures);
   * ```
   */
  normalizeFeatures(vector: Float32Array): Float32Array {
    const normalized = new Float32Array(vector.length);
    let sumSq = 0;

    for (let i = 0; i < vector.length; i++) {
      sumSq += vector[i] * vector[i];
    }

    const magnitude = Math.sqrt(sumSq);
    if (magnitude > 1e-6) {
      for (let i = 0; i < vector.length; i++) {
        normalized[i] = vector[i] / magnitude;
      }
    }

    return normalized;
  }
}
