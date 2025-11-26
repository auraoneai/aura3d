/**
 * @fileoverview Memory system with knowledge persistence, decay, and importance scoring.
 * Implements realistic memory with time-based forgetting and priority management.
 * @module ai/perception/MemorySystem
 */

import { Vector3 } from '../../math/Vector3';
import { Entity } from '../../ecs/Entity';
import { Logger } from '../../core/Logger';

/**
 * Memory importance levels.
 */
export enum MemoryImportance {
  /** Low importance, forgotten quickly */
  LOW = 'low',
  /** Normal importance */
  NORMAL = 'normal',
  /** High importance, persists longer */
  HIGH = 'high',
  /** Critical importance, never forgotten naturally */
  CRITICAL = 'critical',
}

/**
 * Memory types.
 */
export enum MemoryType {
  /** Visual observation */
  VISUAL = 'visual',
  /** Audio observation */
  AUDIO = 'audio',
  /** Damage received */
  DAMAGE = 'damage',
  /** Communication/dialogue */
  COMMUNICATION = 'communication',
  /** Location/waypoint */
  LOCATION = 'location',
  /** Event/incident */
  EVENT = 'event',
  /** Generic knowledge */
  KNOWLEDGE = 'knowledge',
}

/**
 * Memory entry.
 */
export interface Memory {
  /** Unique memory ID */
  id: string;
  /** Memory type */
  type: MemoryType;
  /** Associated entity (if any) */
  entity: Entity | null;
  /** Associated position (if any) */
  position: Vector3 | null;
  /** Memory importance */
  importance: MemoryImportance;
  /** Current confidence level (0-1) */
  confidence: number;
  /** Initial confidence level */
  initialConfidence: number;
  /** Time created */
  createdTime: number;
  /** Time last accessed/refreshed */
  lastAccessedTime: number;
  /** Number of times accessed */
  accessCount: number;
  /** Memory tags for categorization */
  tags: Set<string>;
  /** Custom memory data */
  data: any;
}

/**
 * Memory system configuration.
 */
export interface MemorySystemConfig {
  /** Maximum number of memories */
  maxMemories: number;
  /** Base decay rate per second (0-1) */
  baseDecayRate: number;
  /** Decay rate multiplier for LOW importance */
  lowImportanceMultiplier: number;
  /** Decay rate multiplier for NORMAL importance */
  normalImportanceMultiplier: number;
  /** Decay rate multiplier for HIGH importance */
  highImportanceMultiplier: number;
  /** Minimum confidence before forgetting */
  forgetThreshold: number;
  /** Enable access-based reinforcement */
  enableReinforcement: boolean;
  /** Confidence boost on access */
  reinforcementBoost: number;
  /** Enable age-based pruning */
  enableAgePruning: boolean;
  /** Maximum age in milliseconds before forced pruning */
  maxAge: number;
}

/**
 * Default memory system configuration.
 */
export const DefaultMemorySystemConfig: MemorySystemConfig = {
  maxMemories: 100,
  baseDecayRate: 0.1, // 10% per second
  lowImportanceMultiplier: 2.0,
  normalImportanceMultiplier: 1.0,
  highImportanceMultiplier: 0.5,
  forgetThreshold: 0.1,
  enableReinforcement: true,
  reinforcementBoost: 0.2,
  enableAgePruning: true,
  maxAge: 60000, // 1 minute
};

/**
 * Memory statistics.
 */
export interface MemoryStats {
  /** Total memories */
  totalMemories: number;
  /** Memories by type */
  byType: Record<MemoryType, number>;
  /** Memories by importance */
  byImportance: Record<MemoryImportance, number>;
  /** Average confidence */
  avgConfidence: number;
  /** Average age in seconds */
  avgAge: number;
  /** Memories forgotten this update */
  forgottenCount: number;
}

/**
 * Memory system for AI agents.
 * Manages knowledge persistence with time decay, importance scoring, and forgetting.
 *
 * @example
 * ```typescript
 * const memory = new MemorySystem(customConfig);
 *
 * // Store memories
 * memory.remember(
 *   MemoryType.VISUAL,
 *   enemyEntity,
 *   enemyPosition,
 *   MemoryImportance.HIGH,
 *   { threat: 'high', weapon: 'rifle' }
 * );
 *
 * memory.remember(
 *   MemoryType.LOCATION,
 *   null,
 *   coverPosition,
 *   MemoryImportance.NORMAL,
 *   { type: 'cover', quality: 0.8 }
 * );
 *
 * // Update decay
 * memory.update(deltaTime);
 *
 * // Query memories
 * const enemies = memory.getMemoriesByType(MemoryType.VISUAL);
 * const important = memory.getMemoriesByImportance(MemoryImportance.HIGH);
 * const recent = memory.getRecentMemories(5000); // Last 5 seconds
 * const nearby = memory.getMemoriesNearPosition(playerPos, 10.0);
 *
 * // Search by tags
 * const threats = memory.getMemoriesByTag('threat');
 *
 * // Recall (access) memory to reinforce it
 * const enemyMemory = memory.recall(memoryId);
 * ```
 */
export class MemorySystem {
  /** System configuration */
  private config: MemorySystemConfig;

  /** All stored memories */
  private memories: Map<string, Memory>;

  /** Memories by entity */
  private memoriesByEntity: Map<Entity, Set<string>>;

  /** Memories by type */
  private memoriesByType: Map<MemoryType, Set<string>>;

  /** Memories by tag */
  private memoriesByTag: Map<string, Set<string>>;

  /** Memories forgotten this update */
  private forgottenThisUpdate: number;

  /** Logger instance */
  private logger: Logger;

  /** Memory ID counter */
  private static nextId = 0;

  /**
   * Creates a new memory system.
   *
   * @param config - System configuration
   */
  constructor(config: MemorySystemConfig = DefaultMemorySystemConfig) {
    this.config = { ...config };
    this.memories = new Map();
    this.memoriesByEntity = new Map();
    this.memoriesByType = new Map();
    this.memoriesByTag = new Map();
    this.forgottenThisUpdate = 0;
    this.logger = new Logger('MemorySystem');
  }

  /**
   * Stores a new memory.
   *
   * @param type - Memory type
   * @param entity - Associated entity
   * @param position - Associated position
   * @param importance - Memory importance
   * @param data - Custom memory data
   * @param tags - Memory tags
   * @param confidence - Initial confidence (default: 1.0)
   * @returns The created memory
   *
   * @example
   * ```typescript
   * memory.remember(
   *   MemoryType.DAMAGE,
   *   attackerEntity,
   *   attackPosition,
   *   MemoryImportance.CRITICAL,
   *   { damage: 50, weapon: 'sword' },
   *   ['combat', 'threat']
   * );
   * ```
   */
  remember(
    type: MemoryType,
    entity: Entity | null,
    position: Vector3 | null,
    importance: MemoryImportance,
    data: any = {},
    tags: string[] = [],
    confidence: number = 1.0
  ): Memory {
    const now = Date.now();

    // Enforce max memories limit
    if (this.memories.size >= this.config.maxMemories) {
      this.pruneOldestMemory();
    }

    const memory: Memory = {
      id: `mem_${MemorySystem.nextId++}`,
      type,
      entity,
      position: position ? position.clone() : null,
      importance,
      confidence: Math.max(0, Math.min(1, confidence)),
      initialConfidence: Math.max(0, Math.min(1, confidence)),
      createdTime: now,
      lastAccessedTime: now,
      accessCount: 0,
      tags: new Set(tags),
      data,
    };

    this.memories.set(memory.id, memory);

    // Index by entity
    if (entity !== null) {
      let entityMems = this.memoriesByEntity.get(entity);
      if (!entityMems) {
        entityMems = new Set();
        this.memoriesByEntity.set(entity, entityMems);
      }
      entityMems.add(memory.id);
    }

    // Index by type
    let typeMems = this.memoriesByType.get(type);
    if (!typeMems) {
      typeMems = new Set();
      this.memoriesByType.set(type, typeMems);
    }
    typeMems.add(memory.id);

    // Index by tags
    for (const tag of tags) {
      let tagMems = this.memoriesByTag.get(tag);
      if (!tagMems) {
        tagMems = new Set();
        this.memoriesByTag.set(tag, tagMems);
      }
      tagMems.add(memory.id);
    }

    return memory;
  }

  /**
   * Recalls (accesses) a memory, potentially reinforcing it.
   *
   * @param memoryId - Memory ID
   * @returns Memory or undefined
   *
   * @example
   * ```typescript
   * const mem = memory.recall(memoryId);
   * if (mem) {
   *   console.log('Recalled:', mem.data);
   * }
   * ```
   */
  recall(memoryId: string): Memory | undefined {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return undefined;
    }

    memory.lastAccessedTime = Date.now();
    memory.accessCount++;

    // Reinforce memory if enabled
    if (this.config.enableReinforcement) {
      memory.confidence = Math.min(
        memory.initialConfidence,
        memory.confidence + this.config.reinforcementBoost
      );
    }

    return memory;
  }

  /**
   * Forgets a specific memory.
   *
   * @param memoryId - Memory ID
   *
   * @example
   * ```typescript
   * memory.forget(oldMemoryId);
   * ```
   */
  forget(memoryId: string): void {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return;
    }

    this.removeMemory(memory);
  }

  /**
   * Forgets all memories of an entity.
   *
   * @param entity - Entity to forget
   */
  forgetEntity(entity: Entity): void {
    const memIds = this.memoriesByEntity.get(entity);
    if (!memIds) {
      return;
    }

    for (const memId of Array.from(memIds)) {
      this.forget(memId);
    }
  }

  /**
   * Updates memory decay and pruning.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   memorySystem.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    this.forgottenThisUpdate = 0;
    const now = Date.now();
    const toForget: string[] = [];

    for (const [id, memory] of this.memories.entries()) {
      // Critical memories don't decay
      if (memory.importance === MemoryImportance.CRITICAL) {
        continue;
      }

      // Calculate decay rate based on importance
      let decayMultiplier = this.config.normalImportanceMultiplier;
      switch (memory.importance) {
        case MemoryImportance.LOW:
          decayMultiplier = this.config.lowImportanceMultiplier;
          break;
        case MemoryImportance.HIGH:
          decayMultiplier = this.config.highImportanceMultiplier;
          break;
      }

      const decayRate = this.config.baseDecayRate * decayMultiplier;
      memory.confidence -= decayRate * deltaTime;

      // Check if should be forgotten
      if (memory.confidence < this.config.forgetThreshold) {
        toForget.push(id);
        continue;
      }

      // Age-based pruning if enabled
      // Note: CRITICAL memories are already filtered out above
      if (this.config.enableAgePruning) {
        const age = now - memory.createdTime;
        if (age > this.config.maxAge) {
          toForget.push(id);
        }
      }
    }

    // Forget marked memories
    for (const id of toForget) {
      const memory = this.memories.get(id);
      if (memory) {
        this.removeMemory(memory);
        this.forgottenThisUpdate++;
      }
    }
  }

  /**
   * Removes a memory from all indices.
   * @private
   */
  private removeMemory(memory: Memory): void {
    this.memories.delete(memory.id);

    // Remove from entity index
    if (memory.entity !== null) {
      const entityMems = this.memoriesByEntity.get(memory.entity);
      if (entityMems) {
        entityMems.delete(memory.id);
        if (entityMems.size === 0) {
          this.memoriesByEntity.delete(memory.entity);
        }
      }
    }

    // Remove from type index
    const typeMems = this.memoriesByType.get(memory.type);
    if (typeMems) {
      typeMems.delete(memory.id);
      if (typeMems.size === 0) {
        this.memoriesByType.delete(memory.type);
      }
    }

    // Remove from tag indices
    for (const tag of memory.tags) {
      const tagMems = this.memoriesByTag.get(tag);
      if (tagMems) {
        tagMems.delete(memory.id);
        if (tagMems.size === 0) {
          this.memoriesByTag.delete(tag);
        }
      }
    }
  }

  /**
   * Prunes the oldest low-confidence memory.
   * @private
   */
  private pruneOldestMemory(): void {
    let oldestId: string | null = null;
    let oldestScore = Infinity;

    for (const [id, memory] of this.memories.entries()) {
      if (memory.importance === MemoryImportance.CRITICAL) {
        continue;
      }

      // Score based on age and confidence (lower is worse)
      const age = Date.now() - memory.createdTime;
      const score = memory.confidence * 1000 - age / 1000;

      if (score < oldestScore) {
        oldestScore = score;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.forget(oldestId);
    }
  }

  /**
   * Gets all memories of a specific type.
   *
   * @param type - Memory type
   * @param minConfidence - Minimum confidence filter
   * @returns Array of memories sorted by confidence
   */
  getMemoriesByType(type: MemoryType, minConfidence: number = 0): Memory[] {
    const memIds = this.memoriesByType.get(type);
    if (!memIds) {
      return [];
    }

    const memories: Memory[] = [];
    for (const id of memIds) {
      const mem = this.memories.get(id);
      if (mem && mem.confidence >= minConfidence) {
        memories.push(mem);
      }
    }

    memories.sort((a, b) => b.confidence - a.confidence);
    return memories;
  }

  /**
   * Gets all memories of a specific importance.
   *
   * @param importance - Memory importance
   * @param minConfidence - Minimum confidence filter
   * @returns Array of memories sorted by confidence
   */
  getMemoriesByImportance(importance: MemoryImportance, minConfidence: number = 0): Memory[] {
    const memories: Memory[] = [];
    for (const mem of this.memories.values()) {
      if (mem.importance === importance && mem.confidence >= minConfidence) {
        memories.push(mem);
      }
    }

    memories.sort((a, b) => b.confidence - a.confidence);
    return memories;
  }

  /**
   * Gets all memories with a specific tag.
   *
   * @param tag - Tag to search
   * @param minConfidence - Minimum confidence filter
   * @returns Array of memories sorted by confidence
   */
  getMemoriesByTag(tag: string, minConfidence: number = 0): Memory[] {
    const memIds = this.memoriesByTag.get(tag);
    if (!memIds) {
      return [];
    }

    const memories: Memory[] = [];
    for (const id of memIds) {
      const mem = this.memories.get(id);
      if (mem && mem.confidence >= minConfidence) {
        memories.push(mem);
      }
    }

    memories.sort((a, b) => b.confidence - a.confidence);
    return memories;
  }

  /**
   * Gets all memories about a specific entity.
   *
   * @param entity - Target entity
   * @param minConfidence - Minimum confidence filter
   * @returns Array of memories sorted by confidence
   */
  getMemoriesOfEntity(entity: Entity, minConfidence: number = 0): Memory[] {
    const memIds = this.memoriesByEntity.get(entity);
    if (!memIds) {
      return [];
    }

    const memories: Memory[] = [];
    for (const id of memIds) {
      const mem = this.memories.get(id);
      if (mem && mem.confidence >= minConfidence) {
        memories.push(mem);
      }
    }

    memories.sort((a, b) => b.confidence - a.confidence);
    return memories;
  }

  /**
   * Gets recent memories within a time window.
   *
   * @param maxAge - Maximum age in milliseconds
   * @param minConfidence - Minimum confidence filter
   * @returns Array of memories sorted by time (newest first)
   */
  getRecentMemories(maxAge: number, minConfidence: number = 0): Memory[] {
    const now = Date.now();
    const memories: Memory[] = [];

    for (const mem of this.memories.values()) {
      const age = now - mem.createdTime;
      if (age <= maxAge && mem.confidence >= minConfidence) {
        memories.push(mem);
      }
    }

    memories.sort((a, b) => b.createdTime - a.createdTime);
    return memories;
  }

  /**
   * Gets memories near a position.
   *
   * @param position - Center position
   * @param radius - Search radius
   * @param minConfidence - Minimum confidence filter
   * @returns Array of memories sorted by distance
   */
  getMemoriesNearPosition(position: Vector3, radius: number, minConfidence: number = 0): Memory[] {
    const memories: Memory[] = [];

    for (const mem of this.memories.values()) {
      if (!mem.position || mem.confidence < minConfidence) {
        continue;
      }

      const distance = mem.position.distanceTo(position);
      if (distance <= radius) {
        memories.push(mem);
      }
    }

    memories.sort((a, b) => {
      const distA = a.position!.distanceTo(position);
      const distB = b.position!.distanceTo(position);
      return distA - distB;
    });

    return memories;
  }

  /**
   * Gets the most confident memory.
   *
   * @returns Memory with highest confidence or null
   */
  getMostConfidentMemory(): Memory | null {
    let best: Memory | null = null;
    let bestConfidence = 0;

    for (const mem of this.memories.values()) {
      if (mem.confidence > bestConfidence) {
        bestConfidence = mem.confidence;
        best = mem;
      }
    }

    return best;
  }

  /**
   * Clears all memories.
   */
  clearAll(): void {
    this.memories.clear();
    this.memoriesByEntity.clear();
    this.memoriesByType.clear();
    this.memoriesByTag.clear();
    this.forgottenThisUpdate = 0;
  }

  /**
   * Gets statistics about the memory system.
   */
  getStats(): MemoryStats {
    const byType: Record<MemoryType, number> = {
      [MemoryType.VISUAL]: 0,
      [MemoryType.AUDIO]: 0,
      [MemoryType.DAMAGE]: 0,
      [MemoryType.COMMUNICATION]: 0,
      [MemoryType.LOCATION]: 0,
      [MemoryType.EVENT]: 0,
      [MemoryType.KNOWLEDGE]: 0,
    };

    const byImportance: Record<MemoryImportance, number> = {
      [MemoryImportance.LOW]: 0,
      [MemoryImportance.NORMAL]: 0,
      [MemoryImportance.HIGH]: 0,
      [MemoryImportance.CRITICAL]: 0,
    };

    let totalConfidence = 0;
    let totalAge = 0;
    const now = Date.now();

    for (const mem of this.memories.values()) {
      byType[mem.type]++;
      byImportance[mem.importance]++;
      totalConfidence += mem.confidence;
      totalAge += (now - mem.createdTime) / 1000; // seconds
    }

    const count = this.memories.size;

    return {
      totalMemories: count,
      byType,
      byImportance,
      avgConfidence: count > 0 ? totalConfidence / count : 0,
      avgAge: count > 0 ? totalAge / count : 0,
      forgottenCount: this.forgottenThisUpdate,
    };
  }

  /**
   * Gets system configuration.
   */
  getConfig(): Readonly<MemorySystemConfig> {
    return this.config;
  }

  /**
   * Updates system configuration.
   */
  updateConfig(config: Partial<MemorySystemConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
