/**
 * @fileoverview Central sensor management system with update scheduling and LOD.
 * Manages sensor updates, performance budgets, and level-of-detail optimizations.
 * @module ai/perception/SensorSystem
 */

import { Logger } from '../../core/Logger';
import { Entity } from '../../ecs/Entity';
import { VisionSensor } from './VisionSensor';
import { HearingSensor } from './HearingSensor';
import { ProximitySensor } from './ProximitySensor';

/**
 * Sensor interface that all sensors must implement.
 */
export interface ISensor {
  /** Unique sensor identifier */
  id: string;
  /** Owning entity */
  entity: Entity;
  /** Enabled state */
  enabled: boolean;
  /** Update frequency in seconds */
  updateFrequency: number;
  /** Time since last update */
  timeSinceUpdate: number;
  /** Update priority (higher = more important) */
  priority: number;
  /** Update the sensor */
  update(deltaTime: number): void;
  /** Reset sensor state */
  reset(): void;
}

/**
 * Level of detail for sensor updates.
 */
export enum SensorLOD {
  /** High detail, full update rate */
  HIGH = 'high',
  /** Medium detail, reduced update rate */
  MEDIUM = 'medium',
  /** Low detail, minimal updates */
  LOW = 'low',
  /** No updates, sensor disabled */
  DISABLED = 'disabled',
}

/**
 * LOD configuration for sensors.
 */
export interface LODConfig {
  /** Distance threshold for HIGH LOD */
  highDistance: number;
  /** Distance threshold for MEDIUM LOD */
  mediumDistance: number;
  /** Distance threshold for LOW LOD */
  lowDistance: number;
  /** Update frequency multiplier for MEDIUM LOD */
  mediumMultiplier: number;
  /** Update frequency multiplier for LOW LOD */
  lowMultiplier: number;
}

/**
 * Sensor system configuration.
 */
export interface SensorSystemConfig {
  /** Maximum update time per frame in milliseconds */
  maxUpdateTimeMs: number;
  /** Enable LOD system */
  enableLOD: boolean;
  /** LOD configuration */
  lod: LODConfig;
  /** Enable sensor pooling */
  enablePooling: boolean;
  /** Maximum sensors per frame */
  maxSensorsPerFrame: number;
}

/**
 * Default sensor system configuration.
 */
export const DefaultSensorSystemConfig: SensorSystemConfig = {
  maxUpdateTimeMs: 5.0,
  enableLOD: true,
  lod: {
    highDistance: 30.0,
    mediumDistance: 60.0,
    lowDistance: 100.0,
    mediumMultiplier: 2.0,
    lowMultiplier: 4.0,
  },
  enablePooling: true,
  maxSensorsPerFrame: 100,
};

/**
 * Performance statistics for sensor system.
 */
export interface SensorStats {
  /** Total registered sensors */
  totalSensors: number;
  /** Active sensors this frame */
  activeSensors: number;
  /** Sensors updated this frame */
  updatedSensors: number;
  /** Update time in milliseconds */
  updateTimeMs: number;
  /** LOD distribution */
  lodDistribution: Record<SensorLOD, number>;
}

/**
 * Central sensor management system.
 * Handles sensor registration, update scheduling, LOD, and performance budgeting.
 *
 * @example
 * ```typescript
 * const sensorSystem = new SensorSystem();
 *
 * // Register sensors
 * const visionSensor = new VisionSensor(entity, position, forward);
 * sensorSystem.registerSensor(visionSensor);
 *
 * const hearingSensor = new HearingSensor(entity, position);
 * sensorSystem.registerSensor(hearingSensor);
 *
 * // Update all sensors
 * sensorSystem.update(deltaTime);
 *
 * // Query sensors
 * const entitySensors = sensorSystem.getSensorsForEntity(entity);
 * const allVision = sensorSystem.getSensorsByType(VisionSensor);
 *
 * // Performance stats
 * const stats = sensorSystem.getStats();
 * console.log(`Updated ${stats.updatedSensors} sensors in ${stats.updateTimeMs}ms`);
 * ```
 */
export class SensorSystem {
  /** System configuration */
  private config: SensorSystemConfig;

  /** All registered sensors */
  private sensors: Map<string, ISensor>;

  /** Sensors grouped by entity */
  private sensorsByEntity: Map<Entity, Set<string>>;

  /** Update queue sorted by priority */
  private updateQueue: ISensor[];

  /** Time accumulator for performance tracking */
  private updateTimeMs: number;

  /** Sensors updated this frame */
  private updatedThisFrame: number;

  /** LOD levels by sensor */
  private lodLevels: Map<string, SensorLOD>;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new sensor system.
   *
   * @param config - System configuration
   */
  constructor(config: SensorSystemConfig = DefaultSensorSystemConfig) {
    this.config = { ...config };
    this.sensors = new Map();
    this.sensorsByEntity = new Map();
    this.updateQueue = [];
    this.updateTimeMs = 0;
    this.updatedThisFrame = 0;
    this.lodLevels = new Map();
    this.logger = new Logger('SensorSystem');
  }

  /**
   * Registers a sensor with the system.
   *
   * @param sensor - Sensor to register
   *
   * @example
   * ```typescript
   * const vision = new VisionSensor(entity, position, forward);
   * sensorSystem.registerSensor(vision);
   * ```
   */
  registerSensor(sensor: ISensor): void {
    if (this.sensors.has(sensor.id)) {
      this.logger.warn(`Sensor ${sensor.id} already registered`);
      return;
    }

    this.sensors.set(sensor.id, sensor);

    // Add to entity mapping
    let entitySensors = this.sensorsByEntity.get(sensor.entity);
    if (!entitySensors) {
      entitySensors = new Set();
      this.sensorsByEntity.set(sensor.entity, entitySensors);
    }
    entitySensors.add(sensor.id);

    // Initialize LOD
    this.lodLevels.set(sensor.id, SensorLOD.HIGH);

    this.logger.debug(`Registered sensor ${sensor.id} for entity ${sensor.entity}`);
  }

  /**
   * Unregisters a sensor from the system.
   *
   * @param sensorId - ID of sensor to unregister
   *
   * @example
   * ```typescript
   * sensorSystem.unregisterSensor(vision.id);
   * ```
   */
  unregisterSensor(sensorId: string): void {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      return;
    }

    this.sensors.delete(sensorId);
    this.lodLevels.delete(sensorId);

    // Remove from entity mapping
    const entitySensors = this.sensorsByEntity.get(sensor.entity);
    if (entitySensors) {
      entitySensors.delete(sensorId);
      if (entitySensors.size === 0) {
        this.sensorsByEntity.delete(sensor.entity);
      }
    }

    this.logger.debug(`Unregistered sensor ${sensorId}`);
  }

  /**
   * Unregisters all sensors for an entity.
   *
   * @param entity - Entity to clear sensors for
   */
  unregisterEntitySensors(entity: Entity): void {
    const sensorIds = this.sensorsByEntity.get(entity);
    if (!sensorIds) {
      return;
    }

    for (const sensorId of Array.from(sensorIds)) {
      this.unregisterSensor(sensorId);
    }
  }

  /**
   * Updates all sensors based on priority and performance budget.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   sensorSystem.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    const startTime = performance.now();
    this.updatedThisFrame = 0;

    // Build update queue
    this.buildUpdateQueue(deltaTime);

    // Update LOD if enabled
    if (this.config.enableLOD) {
      this.updateLOD();
    }

    // Process sensors within time budget
    const maxTime = this.config.maxUpdateTimeMs;
    const maxSensors = this.config.maxSensorsPerFrame;

    for (const sensor of this.updateQueue) {
      // Check budget constraints
      if (this.updatedThisFrame >= maxSensors) {
        break;
      }

      const elapsed = performance.now() - startTime;
      if (elapsed >= maxTime) {
        break;
      }

      // Check if sensor needs update
      if (!sensor.enabled) {
        continue;
      }

      const lod = this.lodLevels.get(sensor.id) || SensorLOD.HIGH;
      if (lod === SensorLOD.DISABLED) {
        continue;
      }

      sensor.timeSinceUpdate += deltaTime;

      // Apply LOD frequency multiplier
      let updateFreq = sensor.updateFrequency;
      if (lod === SensorLOD.MEDIUM) {
        updateFreq *= this.config.lod.mediumMultiplier;
      } else if (lod === SensorLOD.LOW) {
        updateFreq *= this.config.lod.lowMultiplier;
      }

      if (sensor.timeSinceUpdate >= updateFreq) {
        sensor.update(deltaTime);
        sensor.timeSinceUpdate = 0;
        this.updatedThisFrame++;
      }
    }

    this.updateTimeMs = performance.now() - startTime;
  }

  /**
   * Builds the sensor update queue sorted by priority.
   * @private
   */
  private buildUpdateQueue(deltaTime: number): void {
    this.updateQueue = Array.from(this.sensors.values());

    // Sort by priority (higher first), then by time since update
    this.updateQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.timeSinceUpdate - a.timeSinceUpdate;
    });
  }

  /**
   * Updates LOD levels for all sensors based on distance.
   * @private
   */
  private updateLOD(): void {
    const config = this.config.lod;

    for (const sensor of this.sensors.values()) {
      // Calculate distance metric (can be overridden per sensor type)
      const distance = this.calculateSensorDistance(sensor);

      let lod: SensorLOD;
      if (distance < config.highDistance) {
        lod = SensorLOD.HIGH;
      } else if (distance < config.mediumDistance) {
        lod = SensorLOD.MEDIUM;
      } else if (distance < config.lowDistance) {
        lod = SensorLOD.LOW;
      } else {
        lod = SensorLOD.DISABLED;
      }

      this.lodLevels.set(sensor.id, lod);
    }
  }

  /**
   * Calculates distance metric for LOD.
   * Can be overridden to use custom distance calculations.
   * @private
   */
  private calculateSensorDistance(sensor: ISensor): number {
    // Default: use priority as distance metric (inverse relationship)
    // Lower priority = higher distance
    return 100.0 - sensor.priority;
  }

  /**
   * Sets LOD level for a specific sensor.
   *
   * @param sensorId - Sensor ID
   * @param lod - LOD level
   */
  setLOD(sensorId: string, lod: SensorLOD): void {
    this.lodLevels.set(sensorId, lod);
  }

  /**
   * Gets LOD level for a sensor.
   *
   * @param sensorId - Sensor ID
   * @returns Current LOD level
   */
  getLOD(sensorId: string): SensorLOD {
    return this.lodLevels.get(sensorId) || SensorLOD.HIGH;
  }

  /**
   * Gets a sensor by ID.
   *
   * @param sensorId - Sensor ID
   * @returns Sensor or undefined
   */
  getSensor(sensorId: string): ISensor | undefined {
    return this.sensors.get(sensorId);
  }

  /**
   * Gets all sensors for an entity.
   *
   * @param entity - Entity to query
   * @returns Array of sensors
   */
  getSensorsForEntity(entity: Entity): ISensor[] {
    const sensorIds = this.sensorsByEntity.get(entity);
    if (!sensorIds) {
      return [];
    }

    const sensors: ISensor[] = [];
    for (const id of sensorIds) {
      const sensor = this.sensors.get(id);
      if (sensor) {
        sensors.push(sensor);
      }
    }
    return sensors;
  }

  /**
   * Gets all sensors of a specific type.
   *
   * @param type - Sensor constructor
   * @returns Array of sensors of that type
   */
  getSensorsByType<T extends ISensor>(type: new (...args: any[]) => T): T[] {
    const results: T[] = [];
    for (const sensor of this.sensors.values()) {
      if (sensor instanceof type) {
        results.push(sensor as T);
      }
    }
    return results;
  }

  /**
   * Enables or disables a sensor.
   *
   * @param sensorId - Sensor ID
   * @param enabled - Enabled state
   */
  setSensorEnabled(sensorId: string, enabled: boolean): void {
    const sensor = this.sensors.get(sensorId);
    if (sensor) {
      sensor.enabled = enabled;
    }
  }

  /**
   * Resets a sensor to initial state.
   *
   * @param sensorId - Sensor ID
   */
  resetSensor(sensorId: string): void {
    const sensor = this.sensors.get(sensorId);
    if (sensor) {
      sensor.reset();
    }
  }

  /**
   * Resets all sensors.
   */
  resetAll(): void {
    for (const sensor of this.sensors.values()) {
      sensor.reset();
    }
  }

  /**
   * Clears all registered sensors.
   */
  clear(): void {
    this.sensors.clear();
    this.sensorsByEntity.clear();
    this.updateQueue = [];
    this.lodLevels.clear();
    this.updatedThisFrame = 0;
    this.updateTimeMs = 0;
  }

  /**
   * Gets performance statistics.
   *
   * @returns Performance stats
   */
  getStats(): SensorStats {
    const lodDistribution: Record<SensorLOD, number> = {
      [SensorLOD.HIGH]: 0,
      [SensorLOD.MEDIUM]: 0,
      [SensorLOD.LOW]: 0,
      [SensorLOD.DISABLED]: 0,
    };

    let activeSensors = 0;
    for (const sensor of this.sensors.values()) {
      if (sensor.enabled) {
        activeSensors++;
      }

      const lod = this.lodLevels.get(sensor.id) || SensorLOD.HIGH;
      lodDistribution[lod]++;
    }

    return {
      totalSensors: this.sensors.size,
      activeSensors,
      updatedSensors: this.updatedThisFrame,
      updateTimeMs: this.updateTimeMs,
      lodDistribution,
    };
  }

  /**
   * Gets system configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<SensorSystemConfig> {
    return this.config;
  }

  /**
   * Updates system configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<SensorSystemConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
