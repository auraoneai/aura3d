/**
 * @fileoverview Stimulus system for registration, propagation, and filtering.
 * Manages sensory events and broadcasts them to interested sensors.
 * @module ai/perception/StimulusSystem
 */

import { Vector3 } from '../../math/Vector3';
import { Entity } from '../../ecs/Entity';
import { Logger } from '../../core/Logger';

/**
 * Stimulus categories.
 */
export enum StimulusCategory {
  /** Visual stimulus */
  VISUAL = 'visual',
  /** Audio stimulus */
  AUDIO = 'audio',
  /** Tactile stimulus */
  TACTILE = 'tactile',
  /** Damage stimulus */
  DAMAGE = 'damage',
  /** Generic stimulus */
  GENERIC = 'generic',
}

/**
 * Stimulus data.
 */
export interface Stimulus {
  /** Unique stimulus ID */
  id: string;
  /** Stimulus category */
  category: StimulusCategory;
  /** Stimulus position */
  position: Vector3;
  /** Source entity (if any) */
  source: Entity | null;
  /** Base intensity (0-1) */
  intensity: number;
  /** Maximum propagation range */
  range: number;
  /** Time created */
  timestamp: number;
  /** Stimulus tags for filtering */
  tags: Set<string>;
  /** Custom stimulus data */
  data: any;
}

/**
 * Stimulus listener interface.
 */
export interface StimulusListener {
  /** Listener ID */
  id: string;
  /** Owning entity */
  entity: Entity;
  /** Listener position */
  position: Vector3;
  /** Categories to listen for */
  categories: Set<StimulusCategory>;
  /** Tags to filter by (empty = all tags) */
  filterTags: Set<string>;
  /** Maximum detection range */
  range: number;
  /** Callback when stimulus is received */
  onStimulus: (stimulus: Stimulus, distance: number, attenuation: number) => void;
}

/**
 * Stimulus system configuration.
 */
export interface StimulusSystemConfig {
  /** Enable spatial hashing for optimization */
  enableSpatialHash: boolean;
  /** Cell size for spatial hashing */
  cellSize: number;
  /** Maximum stimuli to keep in history */
  maxHistory: number;
  /** History retention time in milliseconds */
  historyDuration: number;
  /** Enable debug logging */
  debugLogging: boolean;
}

/**
 * Default stimulus system configuration.
 */
export const DefaultStimulusSystemConfig: StimulusSystemConfig = {
  enableSpatialHash: true,
  cellSize: 50.0,
  maxHistory: 100,
  historyDuration: 10000, // 10 seconds
  debugLogging: false,
};

/**
 * Stimulus statistics.
 */
export interface StimulusStats {
  /** Active stimuli count */
  activeStimuli: number;
  /** Total listeners */
  totalListeners: number;
  /** Stimuli propagated this frame */
  propagatedThisFrame: number;
  /** Listeners notified this frame */
  listenersNotified: number;
  /** Stimuli by category */
  byCategory: Record<StimulusCategory, number>;
}

/**
 * Stimulus system for AI perception.
 * Manages stimulus registration, propagation, and listener notification with spatial optimization.
 *
 * @example
 * ```typescript
 * const stimulusSystem = new StimulusSystem();
 *
 * // Register listeners
 * stimulusSystem.addListener({
 *   id: 'agent_vision',
 *   entity: agentEntity,
 *   position: agentPosition,
 *   categories: new Set([StimulusCategory.VISUAL]),
 *   filterTags: new Set(['enemy', 'movement']),
 *   range: 50.0,
 *   onStimulus: (stimulus, distance, attenuation) => {
 *     console.log('Saw something:', stimulus.data);
 *   }
 * });
 *
 * // Emit stimuli
 * stimulusSystem.emitStimulus(
 *   StimulusCategory.AUDIO,
 *   gunPosition,
 *   shooterEntity,
 *   1.0,
 *   100.0,
 *   ['gunshot', 'loud'],
 *   { weapon: 'rifle' }
 * );
 *
 * // Update propagation
 * stimulusSystem.update(deltaTime);
 *
 * // Query history
 * const recent = stimulusSystem.getRecentStimuli(StimulusCategory.AUDIO);
 * const nearby = stimulusSystem.getStimuliNearPosition(playerPos, 20.0);
 * ```
 */
export class StimulusSystem {
  /** System configuration */
  private config: StimulusSystemConfig;

  /** Active stimuli */
  private stimuli: Map<string, Stimulus>;

  /** Registered listeners */
  private listeners: Map<string, StimulusListener>;

  /** Spatial hash for listeners (if enabled) */
  private spatialHash: Map<string, Set<string>>;

  /** Stimuli propagated this frame */
  private propagatedThisFrame: number;

  /** Listeners notified this frame */
  private listenersNotified: number;

  /** Logger instance */
  private logger: Logger;

  /** Stimulus ID counter */
  private static nextId = 0;

  /**
   * Creates a new stimulus system.
   *
   * @param config - System configuration
   */
  constructor(config: StimulusSystemConfig = DefaultStimulusSystemConfig) {
    this.config = { ...config };
    this.stimuli = new Map();
    this.listeners = new Map();
    this.spatialHash = new Map();
    this.propagatedThisFrame = 0;
    this.listenersNotified = 0;
    this.logger = new Logger('StimulusSystem');
  }

  /**
   * Emits a stimulus into the system.
   *
   * @param category - Stimulus category
   * @param position - Stimulus position
   * @param source - Source entity
   * @param intensity - Base intensity (0-1)
   * @param range - Maximum propagation range
   * @param tags - Stimulus tags
   * @param data - Custom stimulus data
   * @returns The emitted stimulus
   *
   * @example
   * ```typescript
   * // Gunshot sound
   * stimulusSystem.emitStimulus(
   *   StimulusCategory.AUDIO,
   *   gunPos,
   *   shooter,
   *   1.0,
   *   100.0,
   *   ['gunshot', 'combat'],
   *   { weapon: 'rifle', damage: 50 }
   * );
   * ```
   */
  emitStimulus(
    category: StimulusCategory,
    position: Vector3,
    source: Entity | null,
    intensity: number,
    range: number,
    tags: string[] = [],
    data: any = {}
  ): Stimulus {
    const stimulus: Stimulus = {
      id: `stimulus_${StimulusSystem.nextId++}`,
      category,
      position: position.clone(),
      source,
      intensity: Math.max(0, Math.min(1, intensity)),
      range,
      timestamp: Date.now(),
      tags: new Set(tags),
      data,
    };

    this.stimuli.set(stimulus.id, stimulus);

    // Immediately propagate to listeners
    this.propagateStimulus(stimulus);

    if (this.config.debugLogging) {
      this.logger.debug(
        `Emitted ${category} stimulus at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}) ` +
        `range=${range.toFixed(1)} intensity=${intensity.toFixed(2)}`
      );
    }

    return stimulus;
  }

  /**
   * Propagates a stimulus to relevant listeners.
   * @private
   */
  private propagateStimulus(stimulus: Stimulus): void {
    this.propagatedThisFrame++;

    // Get potential listeners
    const potentialListeners = this.config.enableSpatialHash
      ? this.getSpatialListeners(stimulus.position, stimulus.range)
      : Array.from(this.listeners.values());

    for (const listener of potentialListeners) {
      // Check category filter
      if (!listener.categories.has(stimulus.category)) {
        continue;
      }

      // Check tag filter
      if (listener.filterTags.size > 0) {
        let hasMatchingTag = false;
        for (const tag of listener.filterTags) {
          if (stimulus.tags.has(tag)) {
            hasMatchingTag = true;
            break;
          }
        }
        if (!hasMatchingTag) {
          continue;
        }
      }

      // Check range
      const distance = listener.position.distanceTo(stimulus.position);
      const maxRange = Math.min(stimulus.range, listener.range);

      if (distance > maxRange) {
        continue;
      }

      // Calculate attenuation
      const attenuation = 1.0 - (distance / maxRange);

      // Notify listener
      try {
        listener.onStimulus(stimulus, distance, attenuation);
        this.listenersNotified++;
      } catch (error) {
        this.logger.error(`Error in stimulus listener ${listener.id}:`, error);
      }
    }
  }

  /**
   * Gets listeners near a position using spatial hash.
   * @private
   */
  private getSpatialListeners(position: Vector3, range: number): StimulusListener[] {
    const listeners: StimulusListener[] = [];
    const cellSize = this.config.cellSize;

    // Calculate cell range to check
    const minX = Math.floor((position.x - range) / cellSize);
    const maxX = Math.floor((position.x + range) / cellSize);
    const minZ = Math.floor((position.z - range) / cellSize);
    const maxZ = Math.floor((position.z + range) / cellSize);

    const seenListeners = new Set<string>();

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const cellKey = `${x},${z}`;
        const cellListeners = this.spatialHash.get(cellKey);

        if (cellListeners) {
          for (const listenerId of cellListeners) {
            if (!seenListeners.has(listenerId)) {
              seenListeners.add(listenerId);
              const listener = this.listeners.get(listenerId);
              if (listener) {
                listeners.push(listener);
              }
            }
          }
        }
      }
    }

    return listeners;
  }

  /**
   * Adds a stimulus listener.
   *
   * @param listener - Listener to add
   *
   * @example
   * ```typescript
   * stimulusSystem.addListener({
   *   id: 'agent_hearing',
   *   entity: agent,
   *   position: agentPos,
   *   categories: new Set([StimulusCategory.AUDIO]),
   *   filterTags: new Set(),
   *   range: 30.0,
   *   onStimulus: (stim, dist, atten) => {
   *     agent.hearSound(stim, atten);
   *   }
   * });
   * ```
   */
  addListener(listener: StimulusListener): void {
    this.listeners.set(listener.id, listener);

    if (this.config.enableSpatialHash) {
      this.addToSpatialHash(listener);
    }

    if (this.config.debugLogging) {
      this.logger.debug(`Added listener ${listener.id} for entity ${listener.entity}`);
    }
  }

  /**
   * Removes a stimulus listener.
   *
   * @param listenerId - Listener ID
   */
  removeListener(listenerId: string): void {
    const listener = this.listeners.get(listenerId);
    if (!listener) {
      return;
    }

    if (this.config.enableSpatialHash) {
      this.removeFromSpatialHash(listener);
    }

    this.listeners.delete(listenerId);

    if (this.config.debugLogging) {
      this.logger.debug(`Removed listener ${listenerId}`);
    }
  }

  /**
   * Updates a listener's position.
   *
   * @param listenerId - Listener ID
   * @param position - New position
   */
  updateListenerPosition(listenerId: string, position: Vector3): void {
    const listener = this.listeners.get(listenerId);
    if (!listener) {
      return;
    }

    if (this.config.enableSpatialHash) {
      this.removeFromSpatialHash(listener);
      listener.position = position.clone();
      this.addToSpatialHash(listener);
    } else {
      listener.position = position.clone();
    }
  }

  /**
   * Adds listener to spatial hash.
   * @private
   */
  private addToSpatialHash(listener: StimulusListener): void {
    const cellKey = this.getCellKey(listener.position);
    let cell = this.spatialHash.get(cellKey);
    if (!cell) {
      cell = new Set();
      this.spatialHash.set(cellKey, cell);
    }
    cell.add(listener.id);
  }

  /**
   * Removes listener from spatial hash.
   * @private
   */
  private removeFromSpatialHash(listener: StimulusListener): void {
    const cellKey = this.getCellKey(listener.position);
    const cell = this.spatialHash.get(cellKey);
    if (cell) {
      cell.delete(listener.id);
      if (cell.size === 0) {
        this.spatialHash.delete(cellKey);
      }
    }
  }

  /**
   * Gets spatial hash cell key for position.
   * @private
   */
  private getCellKey(position: Vector3): string {
    const x = Math.floor(position.x / this.config.cellSize);
    const z = Math.floor(position.z / this.config.cellSize);
    return `${x},${z}`;
  }

  /**
   * Updates the stimulus system.
   *
   * @param deltaTime - Time since last update in seconds
   */
  update(deltaTime: number): void {
    this.propagatedThisFrame = 0;
    this.listenersNotified = 0;

    // Clean up old stimuli
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, stimulus] of this.stimuli.entries()) {
      const age = now - stimulus.timestamp;
      if (age > this.config.historyDuration) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.stimuli.delete(id);
    }

    // Enforce max history limit
    if (this.stimuli.size > this.config.maxHistory) {
      const sorted = Array.from(this.stimuli.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

      const excess = this.stimuli.size - this.config.maxHistory;
      for (let i = 0; i < excess; i++) {
        this.stimuli.delete(sorted[i]![0]);
      }
    }
  }

  /**
   * Gets recent stimuli of a specific category.
   *
   * @param category - Stimulus category
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of stimuli sorted by time (newest first)
   */
  getRecentStimuli(category?: StimulusCategory, maxAge?: number): Stimulus[] {
    const now = Date.now();
    const age = maxAge ?? this.config.historyDuration;

    const stimuli = Array.from(this.stimuli.values())
      .filter(s => {
        const ageCheck = now - s.timestamp <= age;
        const categoryCheck = !category || s.category === category;
        return ageCheck && categoryCheck;
      });

    stimuli.sort((a, b) => b.timestamp - a.timestamp);
    return stimuli;
  }

  /**
   * Gets stimuli near a position.
   *
   * @param position - Center position
   * @param radius - Search radius
   * @param category - Optional category filter
   * @returns Array of stimuli sorted by distance
   */
  getStimuliNearPosition(
    position: Vector3,
    radius: number,
    category?: StimulusCategory
  ): Stimulus[] {
    const stimuli = Array.from(this.stimuli.values())
      .filter(s => {
        const distance = s.position.distanceTo(position);
        const distCheck = distance <= radius;
        const categoryCheck = !category || s.category === category;
        return distCheck && categoryCheck;
      });

    stimuli.sort((a, b) => {
      const distA = a.position.distanceTo(position);
      const distB = b.position.distanceTo(position);
      return distA - distB;
    });

    return stimuli;
  }

  /**
   * Gets stimuli with a specific tag.
   *
   * @param tag - Tag to search
   * @param maxAge - Maximum age in milliseconds
   * @returns Array of stimuli
   */
  getStimuliByTag(tag: string, maxAge?: number): Stimulus[] {
    const now = Date.now();
    const age = maxAge ?? this.config.historyDuration;

    return Array.from(this.stimuli.values())
      .filter(s => s.tags.has(tag) && now - s.timestamp <= age)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clears all stimuli history.
   */
  clearStimuli(): void {
    this.stimuli.clear();
  }

  /**
   * Clears all listeners.
   */
  clearListeners(): void {
    this.listeners.clear();
    this.spatialHash.clear();
  }

  /**
   * Clears everything.
   */
  clearAll(): void {
    this.clearStimuli();
    this.clearListeners();
  }

  /**
   * Gets statistics about the system.
   */
  getStats(): StimulusStats {
    const byCategory: Record<StimulusCategory, number> = {
      [StimulusCategory.VISUAL]: 0,
      [StimulusCategory.AUDIO]: 0,
      [StimulusCategory.TACTILE]: 0,
      [StimulusCategory.DAMAGE]: 0,
      [StimulusCategory.GENERIC]: 0,
    };

    for (const stimulus of this.stimuli.values()) {
      byCategory[stimulus.category]++;
    }

    return {
      activeStimuli: this.stimuli.size,
      totalListeners: this.listeners.size,
      propagatedThisFrame: this.propagatedThisFrame,
      listenersNotified: this.listenersNotified,
      byCategory,
    };
  }

  /**
   * Gets system configuration.
   */
  getConfig(): Readonly<StimulusSystemConfig> {
    return this.config;
  }

  /**
   * Updates system configuration.
   */
  updateConfig(config: Partial<StimulusSystemConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
