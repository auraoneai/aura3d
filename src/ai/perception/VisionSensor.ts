/**
 * @fileoverview Vision sensor with FOV cone, occlusion culling, and target tracking.
 * Implements realistic sight sensing with configurable parameters.
 * @module ai/perception/VisionSensor
 */

import { Vector3 } from '../../math/Vector3';
import { Entity } from '../../ecs/Entity';
import { ISensor } from './SensorSystem';
import { Logger } from '../../core/Logger';

/**
 * Target visibility information.
 */
export interface VisibilityInfo {
  /** Target entity */
  entity: Entity;
  /** Target position */
  position: Vector3;
  /** Visibility confidence (0-1) */
  confidence: number;
  /** Distance to target */
  distance: number;
  /** Angle to target in radians */
  angle: number;
  /** Whether target is in peripheral vision */
  isPeripheral: boolean;
  /** Whether target is occluded */
  isOccluded: boolean;
  /** Time first seen */
  firstSeenTime: number;
  /** Time last seen */
  lastSeenTime: number;
}

/**
 * Vision sensor configuration.
 */
export interface VisionConfig {
  /** Maximum view distance */
  range: number;
  /** Field of view angle in radians */
  fovAngle: number;
  /** Enable peripheral vision */
  peripheralVision: boolean;
  /** Peripheral vision angle (wider than FOV) */
  peripheralAngle: number;
  /** Enable occlusion checking */
  occlusionEnabled: boolean;
  /** Maximum raycast checks per update */
  maxRaycasts: number;
  /** Maximum targets to track */
  maxTargets: number;
  /** Minimum confidence to report target */
  minConfidence: number;
}

/**
 * Default vision configuration.
 */
export const DefaultVisionConfig: VisionConfig = {
  range: 50.0,
  fovAngle: Math.PI / 3, // 60 degrees
  peripheralVision: true,
  peripheralAngle: Math.PI / 2, // 90 degrees
  occlusionEnabled: true,
  maxRaycasts: 10,
  maxTargets: 10,
  minConfidence: 0.1,
};

/**
 * Raycast callback for occlusion testing.
 * Returns true if ray hits an obstacle.
 */
export type RaycastCallback = (from: Vector3, to: Vector3) => boolean;

/**
 * Vision sensor for AI agents.
 * Implements field of view cone, occlusion culling, and target tracking.
 *
 * @example
 * ```typescript
 * const vision = new VisionSensor(
 *   entity,
 *   agentPosition,
 *   agentForward,
 *   customConfig
 * );
 *
 * // Set raycast callback for occlusion
 * vision.setRaycastCallback((from, to) => {
 *   return physics.raycast(from, to).hasHit;
 * });
 *
 * // Update with potential targets
 * const targets = getEnemiesInArea();
 * const positions = new Map();
 * targets.forEach(t => positions.set(t, getPosition(t)));
 *
 * vision.updateTargets(targets, positions);
 *
 * // Query visible targets
 * const visible = vision.getVisibleTargets();
 * const best = vision.getBestTarget();
 * ```
 */
export class VisionSensor implements ISensor {
  /** Unique sensor ID */
  readonly id: string;

  /** Owning entity */
  readonly entity: Entity;

  /** Enabled state */
  enabled: boolean;

  /** Update frequency in seconds */
  updateFrequency: number;

  /** Time since last update */
  timeSinceUpdate: number;

  /** Update priority */
  priority: number;

  /** Sensor position */
  position: Vector3;

  /** Sensor forward direction */
  forward: Vector3;

  /** Vision configuration */
  private config: VisionConfig;

  /** Visible targets */
  private visibleTargets: Map<Entity, VisibilityInfo>;

  /** Raycast callback for occlusion */
  private raycastCallback: RaycastCallback | null;

  /** Logger instance */
  private logger: Logger;

  /** Unique ID counter */
  private static nextId = 0;

  /**
   * Creates a new vision sensor.
   *
   * @param entity - Owning entity
   * @param position - Sensor position
   * @param forward - Sensor forward direction
   * @param config - Vision configuration
   */
  constructor(
    entity: Entity,
    position: Vector3,
    forward: Vector3,
    config: VisionConfig = DefaultVisionConfig
  ) {
    this.id = `vision_${VisionSensor.nextId++}`;
    this.entity = entity;
    this.enabled = true;
    this.updateFrequency = 0.1; // 10 Hz
    this.timeSinceUpdate = 0;
    this.priority = 50;
    this.position = position.clone();
    this.forward = forward.clone().normalize();
    this.config = { ...config };
    this.visibleTargets = new Map();
    this.raycastCallback = null;
    this.logger = new Logger('VisionSensor');
  }

  /**
   * Sets the raycast callback for occlusion testing.
   *
   * @param callback - Raycast callback function
   */
  setRaycastCallback(callback: RaycastCallback): void {
    this.raycastCallback = callback;
  }

  /**
   * Updates sensor position and direction.
   *
   * @param position - New position
   * @param forward - New forward direction
   */
  updateTransform(position: Vector3, forward: Vector3): void {
    this.position = position.clone();
    this.forward = forward.clone().normalize();
  }

  /**
   * Updates visible targets.
   *
   * @param potentialTargets - Entities to check for visibility
   * @param targetPositions - Map of entity positions
   *
   * @example
   * ```typescript
   * const enemies = world.query([EnemyTag]);
   * const positions = new Map();
   * enemies.forEach(e => positions.set(e, getPosition(e)));
   * vision.updateTargets(enemies, positions);
   * ```
   */
  updateTargets(potentialTargets: Entity[], targetPositions: Map<Entity, Vector3>): void {
    const now = Date.now();
    const newVisible = new Map<Entity, VisibilityInfo>();

    let raycastCount = 0;
    let targetCount = 0;

    for (const target of potentialTargets) {
      if (targetCount >= this.config.maxTargets) {
        break;
      }

      const targetPos = targetPositions.get(target);
      if (!targetPos) {
        continue;
      }

      // Check visibility
      const visibility = this.checkVisibility(targetPos);
      if (visibility.confidence <= 0) {
        continue;
      }

      // Check occlusion if enabled
      let isOccluded = false;
      if (this.config.occlusionEnabled && raycastCount < this.config.maxRaycasts) {
        if (this.raycastCallback) {
          isOccluded = this.raycastCallback(this.position, targetPos);
          raycastCount++;
        }
      }

      // Apply occlusion penalty
      let finalConfidence = visibility.confidence;
      if (isOccluded) {
        finalConfidence *= 0.3; // 70% reduction for occluded targets
      }

      if (finalConfidence < this.config.minConfidence) {
        continue;
      }

      // Get or create visibility info
      const existing = this.visibleTargets.get(target);
      const info: VisibilityInfo = {
        entity: target,
        position: targetPos.clone(),
        confidence: finalConfidence,
        distance: visibility.distance,
        angle: visibility.angle,
        isPeripheral: visibility.isPeripheral,
        isOccluded,
        firstSeenTime: existing?.firstSeenTime || now,
        lastSeenTime: now,
      };

      newVisible.set(target, info);
      targetCount++;
    }

    this.visibleTargets = newVisible;
  }

  /**
   * Checks if a position is visible.
   * @private
   */
  private checkVisibility(targetPos: Vector3): {
    confidence: number;
    distance: number;
    angle: number;
    isPeripheral: boolean;
  } {
    const toTarget = targetPos.sub(this.position);
    const distance = toTarget.length();

    // Check range
    if (distance > this.config.range) {
      return { confidence: 0, distance, angle: 0, isPeripheral: false };
    }

    // Check FOV
    const direction = toTarget.normalize();
    const dot = this.forward.dot(direction);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

    const halfFOV = this.config.fovAngle / 2;
    const halfPeripheral = this.config.peripheralAngle / 2;

    let confidence = 0;
    let isPeripheral = false;

    if (angle <= halfFOV) {
      // In main FOV
      const distanceFactor = 1.0 - (distance / this.config.range);
      const angleFactor = 1.0 - (angle / halfFOV);
      confidence = distanceFactor * (0.5 + angleFactor * 0.5);
    } else if (this.config.peripheralVision && angle <= halfPeripheral) {
      // In peripheral vision
      isPeripheral = true;
      const distanceFactor = 1.0 - (distance / this.config.range);
      const angleFactor = 1.0 - ((angle - halfFOV) / (halfPeripheral - halfFOV));
      confidence = distanceFactor * angleFactor * 0.5;
    }

    return { confidence, distance, angle, isPeripheral };
  }

  /**
   * Updates the sensor (required by ISensor interface).
   *
   * @param deltaTime - Time since last update
   */
  update(deltaTime: number): void {
    // Age out old targets
    const now = Date.now();
    const timeout = 2000; // 2 seconds

    for (const [entity, info] of this.visibleTargets.entries()) {
      if (now - info.lastSeenTime > timeout) {
        this.visibleTargets.delete(entity);
      }
    }
  }

  /**
   * Gets all visible targets.
   *
   * @param minConfidence - Minimum confidence filter
   * @returns Array of visibility info sorted by confidence
   */
  getVisibleTargets(minConfidence?: number): VisibilityInfo[] {
    const threshold = minConfidence ?? this.config.minConfidence;
    const targets = Array.from(this.visibleTargets.values())
      .filter(info => info.confidence >= threshold);

    // Sort by confidence (highest first)
    targets.sort((a, b) => b.confidence - a.confidence);
    return targets;
  }

  /**
   * Gets the best visible target (highest confidence).
   *
   * @returns Best target or null
   */
  getBestTarget(): VisibilityInfo | null {
    let best: VisibilityInfo | null = null;
    let bestConfidence = 0;

    for (const info of this.visibleTargets.values()) {
      if (info.confidence > bestConfidence) {
        bestConfidence = info.confidence;
        best = info;
      }
    }

    return best;
  }

  /**
   * Gets visibility info for a specific entity.
   *
   * @param entity - Target entity
   * @returns Visibility info or undefined
   */
  getTargetInfo(entity: Entity): VisibilityInfo | undefined {
    return this.visibleTargets.get(entity);
  }

  /**
   * Checks if an entity is visible.
   *
   * @param entity - Target entity
   * @param minConfidence - Minimum confidence threshold
   * @returns True if visible
   */
  isTargetVisible(entity: Entity, minConfidence?: number): boolean {
    const info = this.visibleTargets.get(entity);
    if (!info) {
      return false;
    }
    const threshold = minConfidence ?? this.config.minConfidence;
    return info.confidence >= threshold;
  }

  /**
   * Gets targets within a distance range.
   *
   * @param maxDistance - Maximum distance
   * @param minDistance - Minimum distance
   * @returns Array of visibility info
   */
  getTargetsInRange(maxDistance: number, minDistance: number = 0): VisibilityInfo[] {
    return Array.from(this.visibleTargets.values())
      .filter(info => info.distance >= minDistance && info.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Gets targets in main FOV (excluding peripheral).
   *
   * @returns Array of visibility info
   */
  getTargetsInFOV(): VisibilityInfo[] {
    return Array.from(this.visibleTargets.values())
      .filter(info => !info.isPeripheral)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Gets targets in peripheral vision only.
   *
   * @returns Array of visibility info
   */
  getPeripheralTargets(): VisibilityInfo[] {
    return Array.from(this.visibleTargets.values())
      .filter(info => info.isPeripheral)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Resets sensor state.
   */
  reset(): void {
    this.visibleTargets.clear();
    this.timeSinceUpdate = 0;
  }

  /**
   * Gets sensor configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<VisionConfig> {
    return this.config;
  }

  /**
   * Updates sensor configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<VisionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets statistics about the sensor.
   */
  getStats(): {
    visibleCount: number;
    fovCount: number;
    peripheralCount: number;
    occludedCount: number;
    avgConfidence: number;
    avgDistance: number;
  } {
    const targets = Array.from(this.visibleTargets.values());
    const fovTargets = targets.filter(t => !t.isPeripheral);
    const peripheralTargets = targets.filter(t => t.isPeripheral);
    const occludedTargets = targets.filter(t => t.isOccluded);

    const avgConfidence = targets.length > 0
      ? targets.reduce((sum, t) => sum + t.confidence, 0) / targets.length
      : 0;

    const avgDistance = targets.length > 0
      ? targets.reduce((sum, t) => sum + t.distance, 0) / targets.length
      : 0;

    return {
      visibleCount: targets.length,
      fovCount: fovTargets.length,
      peripheralCount: peripheralTargets.length,
      occludedCount: occludedTargets.length,
      avgConfidence,
      avgDistance,
    };
  }
}
