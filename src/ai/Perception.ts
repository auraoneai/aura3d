/**
 * @fileoverview AI perception system for sensing and awareness.
 * Implements sight, hearing, and memory decay for AI agents.
 * @module ai/Perception
 */

import { Vector3 } from '../math/Vector3';
import { Entity } from '../ecs/Entity';

/**
 * Types of stimuli that can be perceived.
 */
export enum StimulusType {
  /** Visual stimulus (seen) */
  SIGHT = 'sight',
  /** Auditory stimulus (heard) */
  SOUND = 'sound',
  /** Damage taken */
  DAMAGE = 'damage',
  /** Touch/collision */
  TOUCH = 'touch',
}

/**
 * Perceived stimulus data.
 */
export interface Stimulus {
  /** Type of stimulus */
  type: StimulusType;
  /** Position of stimulus */
  position: Vector3;
  /** Source entity (if any) */
  source: Entity | null;
  /** Intensity (0-1) */
  intensity: number;
  /** Timestamp when perceived */
  timestamp: number;
  /** Additional metadata */
  metadata?: any;
}

/**
 * Memory of a perceived target.
 *
 * @example
 * ```typescript
 * const memory: PerceptionMemory = {
 *   entity: enemyEntity,
 *   lastSeenPosition: new Vector3(10, 0, 5),
 *   lastSeenTime: Date.now(),
 *   confidence: 1.0,
 *   stimuli: [sightStimulus, soundStimulus],
 *   metadata: { threat: 'high' }
 * };
 * ```
 */
export interface PerceptionMemory {
  /** Target entity */
  entity: Entity;
  /** Last known position */
  lastSeenPosition: Vector3;
  /** Last known velocity */
  lastSeenVelocity: Vector3;
  /** Timestamp of last perception */
  lastSeenTime: number;
  /** Confidence level (0-1, decays over time) */
  confidence: number;
  /** History of stimuli */
  stimuli: Stimulus[];
  /** Custom metadata */
  metadata?: any;
}

/**
 * Sight configuration.
 */
export interface SightConfig {
  /** Maximum view distance */
  range: number;
  /** Field of view angle in radians */
  fovAngle: number;
  /** Enable peripheral vision (reduced confidence) */
  peripheralVision: boolean;
  /** Peripheral vision angle (wider than fovAngle) */
  peripheralAngle: number;
  /** Maximum number of targets to track */
  maxTargets: number;
  /** Update frequency in seconds */
  updateFrequency: number;
}

/**
 * Hearing configuration.
 */
export interface HearingConfig {
  /** Maximum hearing distance */
  range: number;
  /** Minimum sound intensity to detect (0-1) */
  threshold: number;
  /** Enable directional hearing */
  directional: boolean;
  /** Maximum number of sounds to track */
  maxSounds: number;
}

/**
 * Perception system configuration.
 */
export interface PerceptionConfig {
  /** Sight configuration */
  sight: SightConfig;
  /** Hearing configuration */
  hearing: HearingConfig;
  /** Memory decay rate (confidence loss per second) */
  memoryDecayRate: number;
  /** Minimum confidence before forgetting */
  forgetThreshold: number;
  /** Maximum memory entries */
  maxMemories: number;
}

/**
 * Default perception configuration.
 */
export const DefaultPerceptionConfig: PerceptionConfig = {
  sight: {
    range: 50.0,
    fovAngle: Math.PI / 3, // 60 degrees
    peripheralVision: true,
    peripheralAngle: Math.PI / 2, // 90 degrees
    maxTargets: 10,
    updateFrequency: 0.1, // 10 Hz
  },
  hearing: {
    range: 30.0,
    threshold: 0.1,
    directional: true,
    maxSounds: 5,
  },
  memoryDecayRate: 0.2, // Lose 20% confidence per second
  forgetThreshold: 0.1,
  maxMemories: 20,
};

/**
 * Perception component for AI agents.
 * Handles sight sensing, hearing sensing, and memory of perceived targets.
 *
 * @example
 * ```typescript
 * // Create perception component
 * const perception = new Perception(agentPosition, agentForward);
 * perception.config.sight.range = 40.0;
 * perception.config.hearing.range = 25.0;
 *
 * // Query potential targets
 * const potentialTargets = [enemy1, enemy2, enemy3];
 * const targetPositions = new Map([
 *   [enemy1, pos1],
 *   [enemy2, pos2],
 *   [enemy3, pos3],
 * ]);
 *
 * // Update perception
 * perception.updateSight(potentialTargets, targetPositions, deltaTime);
 *
 * // Emit sound event
 * perception.hearSound(
 *   new Vector3(20, 0, 10),
 *   0.8,
 *   null
 * );
 *
 * // Check what's visible
 * const visibleTargets = perception.getVisibleTargets();
 * const bestTarget = perception.getBestTarget();
 *
 * // Update memory decay
 * perception.updateMemory(deltaTime);
 * ```
 */
export class Perception {
  /** Agent position */
  position: Vector3;

  /** Agent forward direction (heading) */
  forward: Vector3;

  /** Perception configuration */
  config: PerceptionConfig;

  /** Memory of perceived targets */
  private memories: Map<Entity, PerceptionMemory>;

  /** Recent stimuli (for history) */
  private recentStimuli: Stimulus[];

  /** Maximum recent stimuli to keep */
  private maxRecentStimuli: number;

  /** Time accumulator for update frequency */
  private updateTimer: number;

  /**
   * Creates a new perception component.
   *
   * @param position - Agent position
   * @param forward - Agent forward direction
   * @param config - Perception configuration
   */
  constructor(
    position: Vector3,
    forward: Vector3,
    config: PerceptionConfig = DefaultPerceptionConfig
  ) {
    this.position = position.clone();
    this.forward = forward.clone().normalize();
    this.config = { ...config };
    this.memories = new Map();
    this.recentStimuli = [];
    this.maxRecentStimuli = 20;
    this.updateTimer = 0;
  }

  /**
   * Updates sight perception for potential targets.
   *
   * @param potentialTargets - Array of entities to check
   * @param targetPositions - Map of entity positions
   * @param deltaTime - Time since last update
   *
   * @example
   * ```typescript
   * const enemies = world.query([EnemyTag]);
   * const positions = new Map();
   * for (const enemy of enemies) {
   *   const transform = world.getComponent(enemy, Transform);
   *   positions.set(enemy, transform.position);
   * }
   *
   * perception.updateSight(enemies, positions, deltaTime);
   * ```
   */
  updateSight(
    potentialTargets: Entity[],
    targetPositions: Map<Entity, Vector3>,
    deltaTime: number
  ): void {
    this.updateTimer += deltaTime;

    if (this.updateTimer < this.config.sight.updateFrequency) {
      return;
    }

    this.updateTimer = 0;

    const now = Date.now();
    const sightConfig = this.config.sight;
    let seenCount = 0;

    for (const target of potentialTargets) {
      if (seenCount >= sightConfig.maxTargets) break;

      const targetPos = targetPositions.get(target);
      if (!targetPos) continue;

      // Check if target is visible
      const visibility = this.checkVisibility(targetPos);

      if (visibility > 0) {
        seenCount++;

        // Create or update memory
        const memory = this.memories.get(target) || this.createMemory(target);
        memory.lastSeenPosition = targetPos.clone();
        memory.lastSeenTime = now;
        memory.confidence = Math.min(1.0, memory.confidence + 0.5);

        // Add stimulus
        const stimulus: Stimulus = {
          type: StimulusType.SIGHT,
          position: targetPos.clone(),
          source: target,
          intensity: visibility,
          timestamp: now,
        };

        memory.stimuli.push(stimulus);
        this.addRecentStimulus(stimulus);

        this.memories.set(target, memory);
      }
    }
  }

  /**
   * Checks visibility of a position.
   * Returns confidence (0-1) based on FOV and distance.
   * @private
   */
  private checkVisibility(targetPos: Vector3): number {
    const toTarget = targetPos.sub(this.position);
    const distance = toTarget.length();

    // Check range
    if (distance > this.config.sight.range) {
      return 0;
    }

    // Check FOV
    const direction = toTarget.normalize();
    const angle = Math.acos(this.forward.dot(direction));

    const fovAngle = this.config.sight.fovAngle / 2;
    const peripheralAngle = this.config.sight.peripheralAngle / 2;

    if (angle <= fovAngle) {
      // In main FOV - full confidence
      const distanceFactor = 1.0 - (distance / this.config.sight.range);
      return distanceFactor;
    } else if (this.config.sight.peripheralVision && angle <= peripheralAngle) {
      // In peripheral vision - reduced confidence
      const distanceFactor = 1.0 - (distance / this.config.sight.range);
      const angleFactor = 1.0 - ((angle - fovAngle) / (peripheralAngle - fovAngle));
      return distanceFactor * angleFactor * 0.5;
    }

    return 0;
  }

  /**
   * Processes a sound stimulus.
   *
   * @param position - Sound position
   * @param intensity - Sound intensity (0-1)
   * @param source - Source entity (optional)
   *
   * @example
   * ```typescript
   * // Gunshot sound
   * perception.hearSound(
   *   gunPosition,
   *   1.0,
   *   shooterEntity
   * );
   *
   * // Footstep sound
   * perception.hearSound(
   *   footstepPosition,
   *   0.3,
   *   walkerEntity
   * );
   * ```
   */
  hearSound(position: Vector3, intensity: number, source: Entity | null = null): void {
    const distance = this.position.distanceTo(position);

    // Check range
    if (distance > this.config.hearing.range) {
      return;
    }

    // Calculate perceived intensity with distance falloff
    const distanceFactor = 1.0 - (distance / this.config.hearing.range);
    const perceivedIntensity = intensity * distanceFactor;

    // Check threshold
    if (perceivedIntensity < this.config.hearing.threshold) {
      return;
    }

    // Apply directional hearing
    let finalIntensity = perceivedIntensity;
    if (this.config.hearing.directional) {
      const toSound = position.sub(this.position).normalize();
      const directionFactor = (this.forward.dot(toSound) + 1) / 2; // 0-1
      finalIntensity *= 0.5 + directionFactor * 0.5; // Min 50% intensity
    }

    const now = Date.now();

    // Create stimulus
    const stimulus: Stimulus = {
      type: StimulusType.SOUND,
      position: position.clone(),
      source,
      intensity: finalIntensity,
      timestamp: now,
    };

    this.addRecentStimulus(stimulus);

    // Update or create memory if source is known
    if (source) {
      const memory = this.memories.get(source) || this.createMemory(source);
      memory.lastSeenPosition = position.clone();
      memory.lastSeenTime = now;
      memory.confidence = Math.min(1.0, memory.confidence + finalIntensity * 0.5);
      memory.stimuli.push(stimulus);
      this.memories.set(source, memory);
    }
  }

  /**
   * Processes a damage stimulus.
   *
   * @param position - Damage position
   * @param intensity - Damage intensity (0-1)
   * @param source - Damage source entity
   *
   * @example
   * ```typescript
   * perception.receiveDamage(
   *   hitPosition,
   *   damageAmount / maxHealth,
   *   attackerEntity
   * );
   * ```
   */
  receiveDamage(position: Vector3, intensity: number, source: Entity | null): void {
    const now = Date.now();

    const stimulus: Stimulus = {
      type: StimulusType.DAMAGE,
      position: position.clone(),
      source,
      intensity,
      timestamp: now,
    };

    this.addRecentStimulus(stimulus);

    // Damage always updates memory with high confidence
    if (source) {
      const memory = this.memories.get(source) || this.createMemory(source);
      memory.lastSeenPosition = position.clone();
      memory.lastSeenTime = now;
      memory.confidence = 1.0;
      memory.stimuli.push(stimulus);
      this.memories.set(source, memory);
    }
  }

  /**
   * Updates memory decay.
   *
   * @param deltaTime - Time since last update
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   perception.updateMemory(deltaTime);
   * }
   * ```
   */
  updateMemory(deltaTime: number): void {
    const now = Date.now();
    const entitiesToForget: Entity[] = [];

    for (const [entity, memory] of this.memories) {
      // Decay confidence over time
      const timeSinceLastSeen = (now - memory.lastSeenTime) / 1000;
      memory.confidence -= this.config.memoryDecayRate * deltaTime;

      // Forget if confidence too low
      if (memory.confidence < this.config.forgetThreshold) {
        entitiesToForget.push(entity);
        continue;
      }

      // Predict position based on velocity
      if (memory.lastSeenVelocity.lengthSquared() > 0) {
        memory.lastSeenPosition.addInPlace(
          memory.lastSeenVelocity.scale(deltaTime)
        );
      }

      // Trim old stimuli
      memory.stimuli = memory.stimuli.filter(
        (s) => now - s.timestamp < 10000 // Keep last 10 seconds
      );
    }

    // Remove forgotten entities
    for (const entity of entitiesToForget) {
      this.memories.delete(entity);
    }

    // Enforce max memories limit
    if (this.memories.size > this.config.maxMemories) {
      // Remove least confident memories
      const sorted = Array.from(this.memories.entries())
        .sort((a, b) => a[1].confidence - b[1].confidence);

      const toRemove = this.memories.size - this.config.maxMemories;
      for (let i = 0; i < toRemove; i++) {
        this.memories.delete(sorted[i][0]);
      }
    }
  }

  /**
   * Creates a new memory entry.
   * @private
   */
  private createMemory(entity: Entity): PerceptionMemory {
    return {
      entity,
      lastSeenPosition: new Vector3(),
      lastSeenVelocity: new Vector3(),
      lastSeenTime: Date.now(),
      confidence: 0,
      stimuli: [],
    };
  }

  /**
   * Adds a stimulus to recent history.
   * @private
   */
  private addRecentStimulus(stimulus: Stimulus): void {
    this.recentStimuli.push(stimulus);
    if (this.recentStimuli.length > this.maxRecentStimuli) {
      this.recentStimuli.shift();
    }
  }

  /**
   * Gets all visible targets (confidence > threshold).
   *
   * @param minConfidence - Minimum confidence threshold
   * @returns Array of entity-memory pairs
   */
  getVisibleTargets(minConfidence: number = 0.5): Array<[Entity, PerceptionMemory]> {
    const visible: Array<[Entity, PerceptionMemory]> = [];

    for (const [entity, memory] of this.memories) {
      if (memory.confidence >= minConfidence) {
        visible.push([entity, memory]);
      }
    }

    return visible.sort((a, b) => b[1].confidence - a[1].confidence);
  }

  /**
   * Gets the best target (highest confidence).
   *
   * @returns Entity and memory, or null if none
   */
  getBestTarget(): [Entity, PerceptionMemory] | null {
    let best: [Entity, PerceptionMemory] | null = null;
    let bestConfidence = 0;

    for (const [entity, memory] of this.memories) {
      if (memory.confidence > bestConfidence) {
        bestConfidence = memory.confidence;
        best = [entity, memory];
      }
    }

    return best;
  }

  /**
   * Gets memory for a specific entity.
   *
   * @param entity - Target entity
   * @returns Memory or undefined
   */
  getMemory(entity: Entity): PerceptionMemory | undefined {
    return this.memories.get(entity);
  }

  /**
   * Checks if an entity is known.
   *
   * @param entity - Target entity
   * @returns True if entity is in memory
   */
  hasMemory(entity: Entity): boolean {
    return this.memories.has(entity);
  }

  /**
   * Gets recent stimuli of a specific type.
   *
   * @param type - Stimulus type
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of stimuli
   */
  getRecentStimuli(type?: StimulusType, maxAge: number = 5000): Stimulus[] {
    const now = Date.now();
    return this.recentStimuli.filter((s) => {
      const ageCheck = now - s.timestamp <= maxAge;
      const typeCheck = !type || s.type === type;
      return ageCheck && typeCheck;
    });
  }

  /**
   * Clears all memories.
   */
  clearMemories(): void {
    this.memories.clear();
  }

  /**
   * Clears recent stimuli.
   */
  clearStimuli(): void {
    this.recentStimuli.length = 0;
  }

  /**
   * Gets statistics about perception.
   */
  getStats(): {
    memoryCount: number;
    visibleCount: number;
    recentStimuliCount: number;
  } {
    const visible = this.getVisibleTargets().length;

    return {
      memoryCount: this.memories.size,
      visibleCount: visible,
      recentStimuliCount: this.recentStimuli.length,
    };
  }
}
