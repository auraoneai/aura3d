/**
 * @fileoverview Hearing sensor with sound propagation and distance attenuation.
 * Implements realistic audio perception with directional hearing and occlusion.
 * @module ai/perception/HearingSensor
 */

import { Vector3 } from '../../math/Vector3';
import { Entity } from '../../ecs/Entity';
import { ISensor } from './SensorSystem';
import { Logger } from '../../core/Logger';

/**
 * Sound event types.
 */
export enum SoundType {
  /** Generic sound */
  GENERIC = 'generic',
  /** Footstep sound */
  FOOTSTEP = 'footstep',
  /** Gunshot sound */
  GUNSHOT = 'gunshot',
  /** Explosion sound */
  EXPLOSION = 'explosion',
  /** Voice/speech sound */
  VOICE = 'voice',
  /** Impact sound */
  IMPACT = 'impact',
  /** Mechanical sound */
  MECHANICAL = 'mechanical',
}

/**
 * Sound event information.
 */
export interface SoundEvent {
  /** Unique event ID */
  id: string;
  /** Sound type */
  type: SoundType;
  /** Sound position */
  position: Vector3;
  /** Source entity (if any) */
  source: Entity | null;
  /** Base intensity (0-1) */
  baseIntensity: number;
  /** Perceived intensity after attenuation (0-1) */
  perceivedIntensity: number;
  /** Distance to sound */
  distance: number;
  /** Direction to sound */
  direction: Vector3;
  /** Whether sound is occluded */
  isOccluded: boolean;
  /** Time sound was heard */
  timestamp: number;
  /** Custom metadata */
  metadata?: any;
}

/**
 * Hearing sensor configuration.
 */
export interface HearingConfig {
  /** Maximum hearing distance */
  range: number;
  /** Minimum intensity threshold (0-1) */
  threshold: number;
  /** Enable directional hearing */
  directional: boolean;
  /** Directional hearing strength (0-1) */
  directionalStrength: number;
  /** Enable occlusion checking */
  occlusionEnabled: boolean;
  /** Occlusion attenuation factor */
  occlusionAttenuation: number;
  /** Distance attenuation exponent (higher = faster falloff) */
  attenuationExponent: number;
  /** Maximum sounds to track */
  maxSounds: number;
  /** Sound memory duration in milliseconds */
  memoryDuration: number;
}

/**
 * Default hearing configuration.
 */
export const DefaultHearingConfig: HearingConfig = {
  range: 30.0,
  threshold: 0.1,
  directional: true,
  directionalStrength: 0.5,
  occlusionEnabled: true,
  occlusionAttenuation: 0.7,
  attenuationExponent: 2.0,
  maxSounds: 10,
  memoryDuration: 3000, // 3 seconds
};

/**
 * Occlusion callback for sound propagation.
 * Returns occlusion factor (0 = fully occluded, 1 = no occlusion).
 */
export type OcclusionCallback = (from: Vector3, to: Vector3) => number;

/**
 * Hearing sensor for AI agents.
 * Implements sound propagation, distance attenuation, and directional hearing.
 *
 * @example
 * ```typescript
 * const hearing = new HearingSensor(
 *   entity,
 *   agentPosition,
 *   agentForward,
 *   customConfig
 * );
 *
 * // Set occlusion callback
 * hearing.setOcclusionCallback((from, to) => {
 *   const hit = physics.raycast(from, to);
 *   return hit.hasHit ? 0.3 : 1.0; // 70% reduction through walls
 * });
 *
 * // Register sound events
 * hearing.hearSound(
 *   SoundType.GUNSHOT,
 *   gunPosition,
 *   1.0,
 *   shooterEntity
 * );
 *
 * hearing.hearSound(
 *   SoundType.FOOTSTEP,
 *   footstepPosition,
 *   0.3,
 *   walkerEntity
 * );
 *
 * // Query heard sounds
 * const recentSounds = hearing.getRecentSounds();
 * const loudest = hearing.getLoudestSound();
 * const gunshots = hearing.getSoundsByType(SoundType.GUNSHOT);
 * ```
 */
export class HearingSensor implements ISensor {
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

  /** Hearing configuration */
  private config: HearingConfig;

  /** Heard sound events */
  private heardSounds: Map<string, SoundEvent>;

  /** Occlusion callback */
  private occlusionCallback: OcclusionCallback | null;

  /** Logger instance */
  private logger: Logger;

  /** Event ID counter */
  private static nextEventId = 0;

  /** Unique ID counter */
  private static nextId = 0;

  /**
   * Creates a new hearing sensor.
   *
   * @param entity - Owning entity
   * @param position - Sensor position
   * @param forward - Sensor forward direction
   * @param config - Hearing configuration
   */
  constructor(
    entity: Entity,
    position: Vector3,
    forward: Vector3,
    config: HearingConfig = DefaultHearingConfig
  ) {
    this.id = `hearing_${HearingSensor.nextId++}`;
    this.entity = entity;
    this.enabled = true;
    this.updateFrequency = 0.05; // 20 Hz
    this.timeSinceUpdate = 0;
    this.priority = 40;
    this.position = position.clone();
    this.forward = forward.clone().normalize();
    this.config = { ...config };
    this.heardSounds = new Map();
    this.occlusionCallback = null;
    this.logger = new Logger('HearingSensor');
  }

  /**
   * Sets the occlusion callback for sound propagation.
   *
   * @param callback - Occlusion callback function
   */
  setOcclusionCallback(callback: OcclusionCallback): void {
    this.occlusionCallback = callback;
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
   * Processes a sound event.
   *
   * @param type - Sound type
   * @param position - Sound position
   * @param intensity - Base intensity (0-1)
   * @param source - Source entity (optional)
   * @param metadata - Custom metadata
   *
   * @example
   * ```typescript
   * // Loud gunshot
   * hearing.hearSound(SoundType.GUNSHOT, gunPos, 1.0, shooter);
   *
   * // Quiet footstep
   * hearing.hearSound(SoundType.FOOTSTEP, footPos, 0.2, walker);
   * ```
   */
  hearSound(
    type: SoundType,
    position: Vector3,
    intensity: number,
    source: Entity | null = null,
    metadata?: any
  ): void {
    if (!this.enabled) {
      return;
    }

    const toSound = position.sub(this.position);
    const distance = toSound.length();

    // Check range
    if (distance > this.config.range) {
      return;
    }

    // Calculate distance attenuation
    const distanceFactor = 1.0 - Math.pow(
      distance / this.config.range,
      this.config.attenuationExponent
    );
    let perceivedIntensity = intensity * distanceFactor;

    // Apply directional hearing
    const direction = distance > 0.001 ? toSound.scale(1.0 / distance) : new Vector3();
    if (this.config.directional) {
      const dot = this.forward.dot(direction);
      const directionFactor = (dot + 1.0) / 2.0; // 0-1
      const minFactor = 1.0 - this.config.directionalStrength;
      const finalFactor = minFactor + directionFactor * this.config.directionalStrength;
      perceivedIntensity *= finalFactor;
    }

    // Check occlusion
    let isOccluded = false;
    if (this.config.occlusionEnabled && this.occlusionCallback) {
      const occlusionFactor = this.occlusionCallback(this.position, position);
      if (occlusionFactor < 1.0) {
        isOccluded = true;
        perceivedIntensity *= occlusionFactor * (1.0 - this.config.occlusionAttenuation) +
                              this.config.occlusionAttenuation;
      }
    }

    // Check threshold
    if (perceivedIntensity < this.config.threshold) {
      return;
    }

    // Enforce max sounds limit
    if (this.heardSounds.size >= this.config.maxSounds) {
      // Remove oldest sound
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      for (const [id, sound] of this.heardSounds.entries()) {
        if (sound.timestamp < oldestTime) {
          oldestTime = sound.timestamp;
          oldestId = id;
        }
      }
      if (oldestId) {
        this.heardSounds.delete(oldestId);
      }
    }

    // Create sound event
    const event: SoundEvent = {
      id: `sound_${HearingSensor.nextEventId++}`,
      type,
      position: position.clone(),
      source,
      baseIntensity: intensity,
      perceivedIntensity,
      distance,
      direction,
      isOccluded,
      timestamp: Date.now(),
      metadata,
    };

    this.heardSounds.set(event.id, event);
  }

  /**
   * Updates the sensor (required by ISensor interface).
   *
   * @param deltaTime - Time since last update
   */
  update(deltaTime: number): void {
    // Remove old sound events
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, sound] of this.heardSounds.entries()) {
      if (now - sound.timestamp > this.config.memoryDuration) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.heardSounds.delete(id);
    }
  }

  /**
   * Gets all recent sound events.
   *
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of sound events sorted by time (newest first)
   */
  getRecentSounds(maxAge?: number): SoundEvent[] {
    const now = Date.now();
    const age = maxAge ?? this.config.memoryDuration;

    const sounds = Array.from(this.heardSounds.values())
      .filter(sound => now - sound.timestamp <= age);

    // Sort by timestamp (newest first)
    sounds.sort((a, b) => b.timestamp - a.timestamp);
    return sounds;
  }

  /**
   * Gets the loudest sound event.
   *
   * @param maxAge - Maximum age in milliseconds
   * @returns Loudest sound or null
   */
  getLoudestSound(maxAge?: number): SoundEvent | null {
    const sounds = this.getRecentSounds(maxAge);
    if (sounds.length === 0) {
      return null;
    }

    return sounds.reduce((loudest, current) =>
      current.perceivedIntensity > loudest.perceivedIntensity ? current : loudest
    );
  }

  /**
   * Gets the closest sound event.
   *
   * @param maxAge - Maximum age in milliseconds
   * @returns Closest sound or null
   */
  getClosestSound(maxAge?: number): SoundEvent | null {
    const sounds = this.getRecentSounds(maxAge);
    if (sounds.length === 0) {
      return null;
    }

    return sounds.reduce((closest, current) =>
      current.distance < closest.distance ? current : closest
    );
  }

  /**
   * Gets sounds of a specific type.
   *
   * @param type - Sound type
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of sound events
   */
  getSoundsByType(type: SoundType, maxAge?: number): SoundEvent[] {
    return this.getRecentSounds(maxAge)
      .filter(sound => sound.type === type);
  }

  /**
   * Gets sounds from a specific source entity.
   *
   * @param source - Source entity
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of sound events
   */
  getSoundsBySource(source: Entity, maxAge?: number): SoundEvent[] {
    return this.getRecentSounds(maxAge)
      .filter(sound => sound.source === source);
  }

  /**
   * Gets sounds within a distance range.
   *
   * @param maxDistance - Maximum distance
   * @param minDistance - Minimum distance
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of sound events sorted by distance
   */
  getSoundsInRange(
    maxDistance: number,
    minDistance: number = 0,
    maxAge?: number
  ): SoundEvent[] {
    return this.getRecentSounds(maxAge)
      .filter(sound => sound.distance >= minDistance && sound.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Gets sounds above an intensity threshold.
   *
   * @param minIntensity - Minimum perceived intensity
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of sound events sorted by intensity
   */
  getSoundsAboveIntensity(minIntensity: number, maxAge?: number): SoundEvent[] {
    return this.getRecentSounds(maxAge)
      .filter(sound => sound.perceivedIntensity >= minIntensity)
      .sort((a, b) => b.perceivedIntensity - a.perceivedIntensity);
  }

  /**
   * Checks if a sound of a specific type was recently heard.
   *
   * @param type - Sound type
   * @param maxAge - Maximum age in milliseconds
   * @returns True if sound was heard
   */
  hasHeardSound(type: SoundType, maxAge?: number): boolean {
    return this.getSoundsByType(type, maxAge).length > 0;
  }

  /**
   * Gets a specific sound event by ID.
   *
   * @param id - Sound event ID
   * @returns Sound event or undefined
   */
  getSoundById(id: string): SoundEvent | undefined {
    return this.heardSounds.get(id);
  }

  /**
   * Resets sensor state.
   */
  reset(): void {
    this.heardSounds.clear();
    this.timeSinceUpdate = 0;
  }

  /**
   * Gets sensor configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<HearingConfig> {
    return this.config;
  }

  /**
   * Updates sensor configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<HearingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets statistics about the sensor.
   */
  getStats(): {
    totalSounds: number;
    soundsByType: Record<SoundType, number>;
    avgIntensity: number;
    avgDistance: number;
    occludedCount: number;
  } {
    const sounds = Array.from(this.heardSounds.values());

    const soundsByType: Record<SoundType, number> = {
      [SoundType.GENERIC]: 0,
      [SoundType.FOOTSTEP]: 0,
      [SoundType.GUNSHOT]: 0,
      [SoundType.EXPLOSION]: 0,
      [SoundType.VOICE]: 0,
      [SoundType.IMPACT]: 0,
      [SoundType.MECHANICAL]: 0,
    };

    let totalIntensity = 0;
    let totalDistance = 0;
    let occludedCount = 0;

    for (const sound of sounds) {
      soundsByType[sound.type]++;
      totalIntensity += sound.perceivedIntensity;
      totalDistance += sound.distance;
      if (sound.isOccluded) {
        occludedCount++;
      }
    }

    return {
      totalSounds: sounds.length,
      soundsByType,
      avgIntensity: sounds.length > 0 ? totalIntensity / sounds.length : 0,
      avgDistance: sounds.length > 0 ? totalDistance / sounds.length : 0,
      occludedCount,
    };
  }
}
