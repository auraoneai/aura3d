/**
 * @fileoverview Proximity sensor for range-based detection and trigger zones.
 * Implements efficient spatial queries for nearby entities.
 * @module ai/perception/ProximitySensor
 */

import { Vector3 } from '../../math/Vector3';
import { Entity } from '../../ecs/Entity';
import { ISensor } from './SensorSystem';
import { Logger } from '../../core/Logger';

/**
 * Proximity detection information.
 */
export interface ProximityInfo {
  /** Detected entity */
  entity: Entity;
  /** Entity position */
  position: Vector3;
  /** Distance to entity */
  distance: number;
  /** Direction to entity */
  direction: Vector3;
  /** Time first detected */
  firstDetectedTime: number;
  /** Time last detected */
  lastDetectedTime: number;
  /** Whether entity entered range this frame */
  justEntered: boolean;
  /** Whether entity will leave range next frame */
  isLeaving: boolean;
}

/**
 * Proximity trigger zone.
 */
export interface TriggerZone {
  /** Zone name/ID */
  name: string;
  /** Center position (relative to sensor) */
  center: Vector3;
  /** Zone radius */
  radius: number;
  /** Entities currently in zone */
  entities: Set<Entity>;
  /** Enabled state */
  enabled: boolean;
}

/**
 * Proximity sensor configuration.
 */
export interface ProximityConfig {
  /** Detection range */
  range: number;
  /** Enable trigger zones */
  enableZones: boolean;
  /** Maximum entities to track */
  maxEntities: number;
  /** Check only in front of sensor */
  frontFacingOnly: boolean;
  /** Front facing angle (if enabled) */
  frontAngle: number;
}

/**
 * Default proximity configuration.
 */
export const DefaultProximityConfig: ProximityConfig = {
  range: 20.0,
  enableZones: false,
  maxEntities: 20,
  frontFacingOnly: false,
  frontAngle: Math.PI, // 180 degrees
};

/**
 * Proximity sensor for AI agents.
 * Implements range-based detection and trigger zones for spatial awareness.
 *
 * @example
 * ```typescript
 * const proximity = new ProximitySensor(
 *   entity,
 *   agentPosition,
 *   agentForward,
 *   customConfig
 * );
 *
 * // Create trigger zones
 * proximity.addTriggerZone('close', new Vector3(), 5.0);
 * proximity.addTriggerZone('medium', new Vector3(), 10.0);
 * proximity.addTriggerZone('far', new Vector3(), 20.0);
 *
 * // Update with potential entities
 * const entities = getEntitiesInArea();
 * const positions = new Map();
 * entities.forEach(e => positions.set(e, getPosition(e)));
 *
 * proximity.updateDetection(entities, positions);
 *
 * // Query detected entities
 * const nearby = proximity.getNearbyEntities();
 * const closest = proximity.getClosestEntity();
 * const inZone = proximity.getEntitiesInZone('close');
 *
 * // Check events
 * const entered = proximity.getEntitiesEntered();
 * const left = proximity.getEntitiesLeft();
 * ```
 */
export class ProximitySensor implements ISensor {
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

  /** Proximity configuration */
  private config: ProximityConfig;

  /** Detected entities */
  private detectedEntities: Map<Entity, ProximityInfo>;

  /** Previous frame's entities (for enter/exit detection) */
  private previousEntities: Set<Entity>;

  /** Trigger zones */
  private triggerZones: Map<string, TriggerZone>;

  /** Logger instance */
  private logger: Logger;

  /** Unique ID counter */
  private static nextId = 0;

  /**
   * Creates a new proximity sensor.
   *
   * @param entity - Owning entity
   * @param position - Sensor position
   * @param forward - Sensor forward direction
   * @param config - Proximity configuration
   */
  constructor(
    entity: Entity,
    position: Vector3,
    forward: Vector3,
    config: ProximityConfig = DefaultProximityConfig
  ) {
    this.id = `proximity_${ProximitySensor.nextId++}`;
    this.entity = entity;
    this.enabled = true;
    this.updateFrequency = 0.1; // 10 Hz
    this.timeSinceUpdate = 0;
    this.priority = 30;
    this.position = position.clone();
    this.forward = forward.clone().normalize();
    this.config = { ...config };
    this.detectedEntities = new Map();
    this.previousEntities = new Set();
    this.triggerZones = new Map();
    this.logger = new Logger('ProximitySensor');
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
   * Updates proximity detection.
   *
   * @param potentialEntities - Entities to check
   * @param entityPositions - Map of entity positions
   *
   * @example
   * ```typescript
   * const entities = world.query([Transform]);
   * const positions = new Map();
   * entities.forEach(e => {
   *   const pos = world.getComponent(e, Transform).position;
   *   positions.set(e, pos);
   * });
   * proximity.updateDetection(entities, positions);
   * ```
   */
  updateDetection(potentialEntities: Entity[], entityPositions: Map<Entity, Vector3>): void {
    const now = Date.now();
    const newDetected = new Map<Entity, ProximityInfo>();

    // Save previous entities for enter/exit detection
    this.previousEntities = new Set(this.detectedEntities.keys());

    let count = 0;
    for (const targetEntity of potentialEntities) {
      // Skip self
      if (targetEntity === this.entity) {
        continue;
      }

      if (count >= this.config.maxEntities) {
        break;
      }

      const targetPos = entityPositions.get(targetEntity);
      if (!targetPos) {
        continue;
      }

      // Check if in range
      const toTarget = targetPos.sub(this.position);
      const distance = toTarget.length();

      if (distance > this.config.range) {
        continue;
      }

      // Check front-facing constraint
      if (this.config.frontFacingOnly) {
        const direction = toTarget.normalize();
        const angle = Math.acos(Math.max(-1, Math.min(1, this.forward.dot(direction))));
        if (angle > this.config.frontAngle / 2) {
          continue;
        }
      }

      // Get or create proximity info
      const existing = this.detectedEntities.get(targetEntity);
      const justEntered = !this.previousEntities.has(targetEntity);

      const direction = distance > 0.001 ? toTarget.scale(1.0 / distance) : new Vector3();

      const info: ProximityInfo = {
        entity: targetEntity,
        position: targetPos.clone(),
        distance,
        direction,
        firstDetectedTime: existing?.firstDetectedTime || now,
        lastDetectedTime: now,
        justEntered,
        isLeaving: false,
      };

      newDetected.set(targetEntity, info);
      count++;
    }

    // Mark entities that will leave
    for (const [e, info] of this.detectedEntities.entries()) {
      if (!newDetected.has(e)) {
        info.isLeaving = true;
      }
    }

    this.detectedEntities = newDetected;

    // Update trigger zones if enabled
    if (this.config.enableZones) {
      this.updateTriggerZones();
    }
  }

  /**
   * Updates trigger zones with current entities.
   * @private
   */
  private updateTriggerZones(): void {
    for (const zone of this.triggerZones.values()) {
      if (!zone.enabled) {
        continue;
      }

      zone.entities.clear();
      const zoneWorldPos = this.position.add(zone.center);

      for (const [entity, info] of this.detectedEntities.entries()) {
        const distToZone = info.position.distanceTo(zoneWorldPos);
        if (distToZone <= zone.radius) {
          zone.entities.add(entity);
        }
      }
    }
  }

  /**
   * Adds a trigger zone.
   *
   * @param name - Zone name/ID
   * @param center - Center position relative to sensor
   * @param radius - Zone radius
   * @returns The created zone
   *
   * @example
   * ```typescript
   * // Create concentric zones
   * proximity.addTriggerZone('danger', new Vector3(), 3.0);
   * proximity.addTriggerZone('warning', new Vector3(), 8.0);
   * proximity.addTriggerZone('aware', new Vector3(), 15.0);
   * ```
   */
  addTriggerZone(name: string, center: Vector3, radius: number): TriggerZone {
    const zone: TriggerZone = {
      name,
      center: center.clone(),
      radius,
      entities: new Set(),
      enabled: true,
    };

    this.triggerZones.set(name, zone);
    return zone;
  }

  /**
   * Removes a trigger zone.
   *
   * @param name - Zone name
   */
  removeTriggerZone(name: string): void {
    this.triggerZones.delete(name);
  }

  /**
   * Gets a trigger zone by name.
   *
   * @param name - Zone name
   * @returns Zone or undefined
   */
  getTriggerZone(name: string): TriggerZone | undefined {
    return this.triggerZones.get(name);
  }

  /**
   * Enables or disables a trigger zone.
   *
   * @param name - Zone name
   * @param enabled - Enabled state
   */
  setZoneEnabled(name: string, enabled: boolean): void {
    const zone = this.triggerZones.get(name);
    if (zone) {
      zone.enabled = enabled;
    }
  }

  /**
   * Gets entities in a specific trigger zone.
   *
   * @param name - Zone name
   * @returns Array of entities
   */
  getEntitiesInZone(name: string): Entity[] {
    const zone = this.triggerZones.get(name);
    return zone ? Array.from(zone.entities) : [];
  }

  /**
   * Checks if an entity is in a trigger zone.
   *
   * @param name - Zone name
   * @param entity - Entity to check
   * @returns True if in zone
   */
  isEntityInZone(name: string, entity: Entity): boolean {
    const zone = this.triggerZones.get(name);
    return zone ? zone.entities.has(entity) : false;
  }

  /**
   * Updates the sensor (required by ISensor interface).
   *
   * @param deltaTime - Time since last update
   */
  update(deltaTime: number): void {
    // Clear enter/exit flags after one frame
    for (const info of this.detectedEntities.values()) {
      info.justEntered = false;
      info.isLeaving = false;
    }
  }

  /**
   * Gets all detected entities.
   *
   * @returns Array of proximity info sorted by distance
   */
  getNearbyEntities(): ProximityInfo[] {
    const entities = Array.from(this.detectedEntities.values());
    entities.sort((a, b) => a.distance - b.distance);
    return entities;
  }

  /**
   * Gets the closest detected entity.
   *
   * @returns Closest entity info or null
   */
  getClosestEntity(): ProximityInfo | null {
    let closest: ProximityInfo | null = null;
    let minDistance = Infinity;

    for (const info of this.detectedEntities.values()) {
      if (info.distance < minDistance) {
        minDistance = info.distance;
        closest = info;
      }
    }

    return closest;
  }

  /**
   * Gets proximity info for a specific entity.
   *
   * @param entity - Target entity
   * @returns Proximity info or undefined
   */
  getEntityInfo(entity: Entity): ProximityInfo | undefined {
    return this.detectedEntities.get(entity);
  }

  /**
   * Checks if an entity is detected.
   *
   * @param entity - Target entity
   * @returns True if detected
   */
  isEntityDetected(entity: Entity): boolean {
    return this.detectedEntities.has(entity);
  }

  /**
   * Gets entities within a distance range.
   *
   * @param maxDistance - Maximum distance
   * @param minDistance - Minimum distance
   * @returns Array of proximity info
   */
  getEntitiesInRange(maxDistance: number, minDistance: number = 0): ProximityInfo[] {
    return Array.from(this.detectedEntities.values())
      .filter(info => info.distance >= minDistance && info.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Gets entities that just entered detection range this frame.
   *
   * @returns Array of proximity info
   */
  getEntitiesEntered(): ProximityInfo[] {
    return Array.from(this.detectedEntities.values())
      .filter(info => info.justEntered);
  }

  /**
   * Gets entities that left detection range this frame.
   *
   * @returns Array of entities
   */
  getEntitiesLeft(): Entity[] {
    const left: Entity[] = [];
    for (const entity of this.previousEntities) {
      if (!this.detectedEntities.has(entity)) {
        left.push(entity);
      }
    }
    return left;
  }

  /**
   * Gets the number of detected entities.
   *
   * @returns Entity count
   */
  getEntityCount(): number {
    return this.detectedEntities.size;
  }

  /**
   * Checks if any entities are detected.
   *
   * @returns True if entities detected
   */
  hasEntities(): boolean {
    return this.detectedEntities.size > 0;
  }

  /**
   * Resets sensor state.
   */
  reset(): void {
    this.detectedEntities.clear();
    this.previousEntities.clear();
    for (const zone of this.triggerZones.values()) {
      zone.entities.clear();
    }
    this.timeSinceUpdate = 0;
  }

  /**
   * Gets sensor configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<ProximityConfig> {
    return this.config;
  }

  /**
   * Updates sensor configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<ProximityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets statistics about the sensor.
   */
  getStats(): {
    detectedCount: number;
    avgDistance: number;
    closestDistance: number;
    enteredCount: number;
    leftCount: number;
    zoneCount: number;
  } {
    const entities = Array.from(this.detectedEntities.values());
    const entered = this.getEntitiesEntered();
    const left = this.getEntitiesLeft();

    const avgDistance = entities.length > 0
      ? entities.reduce((sum, e) => sum + e.distance, 0) / entities.length
      : 0;

    const closest = this.getClosestEntity();
    const closestDistance = closest ? closest.distance : 0;

    return {
      detectedCount: entities.length,
      avgDistance,
      closestDistance,
      enteredCount: entered.length,
      leftCount: left.length,
      zoneCount: this.triggerZones.size,
    };
  }
}
