/**
 * Feature extraction from game state for ML model input.
 * Converts game observations (positions, velocities, etc.) into tensor format.
 * @module FeatureExtractor
 */

import { Vector3 } from '../../math/Vector3';
import { ONNXTensor } from './ONNXRuntimeWrapper';
import { createTensor, vectorToTensor, concatenate } from './TensorUtils';

/**
 * Game state observation for ML input.
 */
export interface Observation {
  /** Agent's current position */
  position: Vector3;
  /** Agent's current velocity */
  velocity: Vector3;
  /** Agent's forward direction */
  forward: Vector3;
  /** Target position (if applicable) */
  target?: Vector3;
  /** Distance to target */
  targetDistance?: number;
  /** Nearby entity positions */
  nearbyEntities?: Vector3[];
  /** Health value [0, 1] */
  health?: number;
  /** Energy/stamina value [0, 1] */
  energy?: number;
  /** Custom scalar features */
  customFeatures?: number[];
}

/**
 * Feature extraction configuration.
 */
export interface FeatureExtractorConfig {
  /** Include position in features */
  includePosition?: boolean;
  /** Include velocity in features */
  includeVelocity?: boolean;
  /** Include forward direction in features */
  includeForward?: boolean;
  /** Include target information in features */
  includeTarget?: boolean;
  /** Maximum number of nearby entities to include */
  maxNearbyEntities?: number;
  /** Include health in features */
  includeHealth?: boolean;
  /** Include energy in features */
  includeEnergy?: boolean;
  /** Normalize position by this value */
  positionScale?: number;
  /** Normalize velocity by this value */
  velocityScale?: number;
  /** Normalize distance by this value */
  distanceScale?: number;
}

/**
 * Feature extractor for converting game observations to ML-ready tensors.
 * Handles normalization, padding, and feature concatenation.
 */
export class FeatureExtractor {
  private readonly config: Required<FeatureExtractorConfig>;
  private featureSize: number = 0;

  /**
   * Creates a new feature extractor.
   * @param config - Extractor configuration
   */
  constructor(config: FeatureExtractorConfig = {}) {
    this.config = {
      includePosition: config.includePosition ?? true,
      includeVelocity: config.includeVelocity ?? true,
      includeForward: config.includeForward ?? true,
      includeTarget: config.includeTarget ?? true,
      maxNearbyEntities: config.maxNearbyEntities ?? 5,
      includeHealth: config.includeHealth ?? true,
      includeEnergy: config.includeEnergy ?? true,
      positionScale: config.positionScale ?? 100.0,
      velocityScale: config.velocityScale ?? 10.0,
      distanceScale: config.distanceScale ?? 100.0,
    };

    this.calculateFeatureSize();
  }

  /**
   * Calculates the total feature size based on configuration.
   */
  private calculateFeatureSize(): void {
    let size = 0;

    if (this.config.includePosition) size += 3;
    if (this.config.includeVelocity) size += 3;
    if (this.config.includeForward) size += 3;
    if (this.config.includeTarget) size += 4; // position (3) + distance (1)
    if (this.config.includeHealth) size += 1;
    if (this.config.includeEnergy) size += 1;

    // Nearby entities: each contributes 3 features (position)
    size += this.config.maxNearbyEntities * 3;

    this.featureSize = size;
  }

  /**
   * Gets the total number of features extracted.
   * @returns Feature vector size
   */
  getFeatureSize(): number {
    return this.featureSize;
  }

  /**
   * Extracts features from a single observation.
   * @param observation - Game state observation
   * @returns Feature tensor [1, featureSize]
   */
  extract(observation: Observation): ONNXTensor {
    const features: number[] = [];

    // Position features
    if (this.config.includePosition) {
      const pos = observation.position;
      features.push(
        pos.x / this.config.positionScale,
        pos.y / this.config.positionScale,
        pos.z / this.config.positionScale
      );
    }

    // Velocity features
    if (this.config.includeVelocity) {
      const vel = observation.velocity;
      features.push(
        vel.x / this.config.velocityScale,
        vel.y / this.config.velocityScale,
        vel.z / this.config.velocityScale
      );
    }

    // Forward direction features (already normalized)
    if (this.config.includeForward) {
      const fwd = observation.forward.normalize();
      features.push(fwd.x, fwd.y, fwd.z);
    }

    // Target features
    if (this.config.includeTarget) {
      if (observation.target) {
        const target = observation.target;
        features.push(
          target.x / this.config.positionScale,
          target.y / this.config.positionScale,
          target.z / this.config.positionScale
        );

        // Distance to target
        const distance = observation.targetDistance ??
          Vector3.distance(observation.position, target);
        features.push(distance / this.config.distanceScale);
      } else {
        // No target: use zeros
        features.push(0, 0, 0, 0);
      }
    }

    // Health feature
    if (this.config.includeHealth) {
      features.push(observation.health ?? 1.0);
    }

    // Energy feature
    if (this.config.includeEnergy) {
      features.push(observation.energy ?? 1.0);
    }

    // Nearby entities (padded to maxNearbyEntities)
    const nearbyEntities = observation.nearbyEntities ?? [];
    for (let i = 0; i < this.config.maxNearbyEntities; i++) {
      if (i < nearbyEntities.length) {
        const entity = nearbyEntities[i];
        features.push(
          entity.x / this.config.positionScale,
          entity.y / this.config.positionScale,
          entity.z / this.config.positionScale
        );
      } else {
        // Padding for missing entities
        features.push(0, 0, 0);
      }
    }

    // Custom features
    if (observation.customFeatures) {
      features.push(...observation.customFeatures);
    }

    return createTensor(features, [1, features.length], 'float32');
  }

  /**
   * Extracts features from a batch of observations.
   * @param observations - Array of observations
   * @returns Batched feature tensor [batchSize, featureSize]
   */
  extractBatch(observations: Observation[]): ONNXTensor {
    if (observations.length === 0) {
      throw new Error('Cannot extract features from empty batch');
    }

    const batchTensors = observations.map((obs) => this.extract(obs));
    return concatenate(batchTensors, 0);
  }

  /**
   * Extracts spatial features for nearby entities.
   * Returns relative positions and distances.
   * @param agentPosition - Agent's position
   * @param entities - Nearby entity positions
   * @param maxEntities - Maximum entities to include
   * @returns Feature tensor [1, maxEntities * 4] (relative pos + distance)
   */
  extractSpatialFeatures(
    agentPosition: Vector3,
    entities: Vector3[],
    maxEntities: number = 10
  ): ONNXTensor {
    const features: number[] = [];

    for (let i = 0; i < maxEntities; i++) {
      if (i < entities.length) {
        const entity = entities[i];
        const relative = entity.sub(agentPosition);
        const distance = relative.length();

        features.push(
          relative.x / this.config.positionScale,
          relative.y / this.config.positionScale,
          relative.z / this.config.positionScale,
          distance / this.config.distanceScale
        );
      } else {
        // Padding
        features.push(0, 0, 0, 0);
      }
    }

    return createTensor(features, [1, maxEntities * 4], 'float32');
  }

  /**
   * Extracts temporal features from a history of observations.
   * Uses recent observations to capture temporal dynamics.
   * @param observations - History of observations (most recent last)
   * @param maxHistory - Maximum history length to use
   * @returns Temporal feature tensor
   */
  extractTemporalFeatures(
    observations: Observation[],
    maxHistory: number = 4
  ): ONNXTensor {
    const historyLength = Math.min(observations.length, maxHistory);
    const allFeatures: number[] = [];

    // Extract from most recent observations
    for (let i = 0; i < maxHistory; i++) {
      const index = observations.length - maxHistory + i;
      if (index >= 0) {
        const obs = observations[index];
        const features = this.extract(obs);
        allFeatures.push(...Array.from(features.data as Float32Array));
      } else {
        // Padding with zeros for missing history
        const emptyFeatures = new Array(this.featureSize).fill(0);
        allFeatures.push(...emptyFeatures);
      }
    }

    return createTensor(allFeatures, [1, maxHistory * this.featureSize], 'float32');
  }

  /**
   * Extracts direction and distance features to a target.
   * @param from - Starting position
   * @param to - Target position
   * @returns Feature tensor [1, 4] (direction + distance)
   */
  extractTargetFeatures(from: Vector3, to: Vector3): ONNXTensor {
    const direction = to.sub(from).normalize();
    const distance = Vector3.distance(from, to);

    return createTensor(
      [
        direction.x,
        direction.y,
        direction.z,
        distance / this.config.distanceScale,
      ],
      [1, 4],
      'float32'
    );
  }

  /**
   * Creates an observation from basic game state.
   * Convenience method for simple scenarios.
   * @param position - Agent position
   * @param velocity - Agent velocity
   * @param forward - Agent forward direction
   * @param target - Optional target position
   * @returns Observation object
   */
  static createObservation(
    position: Vector3,
    velocity: Vector3,
    forward: Vector3,
    target?: Vector3
  ): Observation {
    const observation: Observation = {
      position,
      velocity,
      forward,
    };

    if (target) {
      observation.target = target;
      observation.targetDistance = Vector3.distance(position, target);
    }

    return observation;
  }

  /**
   * Creates a minimal observation with just position.
   * @param position - Agent position
   * @returns Minimal observation
   */
  static createMinimalObservation(position: Vector3): Observation {
    return {
      position,
      velocity: Vector3.zero(),
      forward: Vector3.forward(),
    };
  }
}
