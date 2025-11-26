import { Logger } from '../../core/Logger';

/**
 * Types of balance changes.
 */
export enum BalanceChangeType {
  ENEMY_HEALTH = 'enemy_health',
  ENEMY_DAMAGE = 'enemy_damage',
  ENEMY_SPAWN_RATE = 'enemy_spawn_rate',
  PLAYER_DAMAGE = 'player_damage',
  PLAYER_HEALTH = 'player_health',
  RESOURCE_DROP_RATE = 'resource_drop_rate',
  EXPERIENCE_MULTIPLIER = 'experience_multiplier',
  TIMER_DURATION = 'timer_duration',
  CHECKPOINT_FREQUENCY = 'checkpoint_frequency',
  HINT_FREQUENCY = 'hint_frequency',
  CUSTOM = 'custom'
}

/**
 * Represents a single balance change that was applied.
 */
export interface BalanceChange {
  /** Unique ID for this change */
  id: string;
  /** Type of balance change */
  type: BalanceChangeType;
  /** Target entity or system affected */
  target: string;
  /** Original value before change */
  originalValue: number;
  /** New value after change */
  newValue: number;
  /** Multiplier applied (newValue = originalValue * multiplier) */
  multiplier: number;
  /** Timestamp when applied */
  appliedAt: number;
  /** Reason for the change */
  reason: string;
  /** Whether this change can be rolled back */
  canRollback: boolean;
}

/**
 * Configuration for balance change tracking.
 */
export interface AppliedBalanceChangeConfig {
  /** Maximum number of changes to track */
  maxHistorySize?: number;
  /** Auto-rollback changes after duration (ms) */
  autoRollbackAfter?: number;
}

/**
 * Applied Balance Change Tracker.
 *
 * Tracks all balance changes applied to the game, allowing for inspection,
 * rollback, and analysis of difficulty adjustments.
 *
 * @example
 * ```typescript
 * const tracker = new AppliedBalanceChange();
 *
 * const changeId = tracker.recordChange({
 *   type: BalanceChangeType.ENEMY_HEALTH,
 *   target: 'goblin',
 *   originalValue: 100,
 *   newValue: 80,
 *   reason: 'Player struggling'
 * });
 *
 * // Later, rollback if needed
 * tracker.rollback(changeId);
 * ```
 */
export class AppliedBalanceChange {
  private changes: Map<string, BalanceChange>;
  private history: BalanceChange[];
  private maxHistorySize: number;
  private autoRollbackAfter: number | null;
  private nextId: number;
  private logger: Logger;

  /**
   * Creates a new balance change tracker.
   * @param config - Configuration options
   */
  constructor(config: AppliedBalanceChangeConfig = {}) {
    this.logger = new Logger('AppliedBalanceChange');
    this.changes = new Map();
    this.history = [];
    this.maxHistorySize = config.maxHistorySize ?? 100;
    this.autoRollbackAfter = config.autoRollbackAfter ?? null;
    this.nextId = 1;

    this.logger.info('Balance change tracker initialized');
  }

  /**
   * Records a balance change.
   * @param change - Partial change data (ID and timestamp will be auto-generated)
   * @returns The change ID
   */
  public recordChange(change: Omit<BalanceChange, 'id' | 'appliedAt' | 'multiplier'>): string {
    const id = `change_${this.nextId++}`;
    const multiplier = change.originalValue !== 0
      ? change.newValue / change.originalValue
      : 1.0;

    const fullChange: BalanceChange = {
      ...change,
      id,
      multiplier,
      appliedAt: Date.now(),
      canRollback: change.canRollback ?? true
    };

    this.changes.set(id, fullChange);
    this.history.push(fullChange);

    // Trim history if needed
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    this.logger.info(`Balance change recorded: ${change.type} on ${change.target} (${change.originalValue} -> ${change.newValue})`);

    // Schedule auto-rollback if configured
    if (this.autoRollbackAfter && fullChange.canRollback) {
      setTimeout(() => this.rollback(id), this.autoRollbackAfter);
    }

    return id;
  }

  /**
   * Gets a balance change by ID.
   * @param id - Change ID
   * @returns The balance change, or null if not found
   */
  public getChange(id: string): BalanceChange | null {
    return this.changes.get(id) || null;
  }

  /**
   * Gets all active changes.
   * @returns Array of active changes
   */
  public getActiveChanges(): BalanceChange[] {
    return Array.from(this.changes.values());
  }

  /**
   * Gets change history.
   * @returns Array of historical changes
   */
  public getHistory(): BalanceChange[] {
    return [...this.history];
  }

  /**
   * Gets changes by type.
   * @param type - Balance change type
   * @returns Array of matching changes
   */
  public getChangesByType(type: BalanceChangeType): BalanceChange[] {
    return this.getActiveChanges().filter(c => c.type === type);
  }

  /**
   * Gets changes affecting a specific target.
   * @param target - Target identifier
   * @returns Array of matching changes
   */
  public getChangesByTarget(target: string): BalanceChange[] {
    return this.getActiveChanges().filter(c => c.target === target);
  }

  /**
   * Rolls back a balance change.
   * @param id - Change ID
   * @returns True if rolled back successfully
   */
  public rollback(id: string): boolean {
    const change = this.changes.get(id);

    if (!change) {
      this.logger.warn(`Cannot rollback: change ${id} not found`);
      return false;
    }

    if (!change.canRollback) {
      this.logger.warn(`Cannot rollback: change ${id} is marked as non-rollbackable`);
      return false;
    }

    this.changes.delete(id);
    this.logger.info(`Rolled back change ${id}: ${change.type} on ${change.target}`);

    return true;
  }

  /**
   * Rolls back all changes of a specific type.
   * @param type - Balance change type
   * @returns Number of changes rolled back
   */
  public rollbackByType(type: BalanceChangeType): number {
    const changes = this.getChangesByType(type);
    let count = 0;

    for (const change of changes) {
      if (this.rollback(change.id)) {
        count++;
      }
    }

    this.logger.info(`Rolled back ${count} changes of type ${type}`);
    return count;
  }

  /**
   * Rolls back all changes affecting a target.
   * @param target - Target identifier
   * @returns Number of changes rolled back
   */
  public rollbackByTarget(target: string): number {
    const changes = this.getChangesByTarget(target);
    let count = 0;

    for (const change of changes) {
      if (this.rollback(change.id)) {
        count++;
      }
    }

    this.logger.info(`Rolled back ${count} changes for target ${target}`);
    return count;
  }

  /**
   * Rolls back all active changes.
   * @returns Number of changes rolled back
   */
  public rollbackAll(): number {
    const changes = this.getActiveChanges();
    let count = 0;

    for (const change of changes) {
      if (this.rollback(change.id)) {
        count++;
      }
    }

    this.logger.info(`Rolled back all ${count} changes`);
    return count;
  }

  /**
   * Gets the cumulative multiplier for a target and type.
   * @param target - Target identifier
   * @param type - Balance change type
   * @returns Cumulative multiplier
   */
  public getCumulativeMultiplier(target: string, type: BalanceChangeType): number {
    const changes = this.getActiveChanges().filter(
      c => c.target === target && c.type === type
    );

    return changes.reduce((mult, change) => mult * change.multiplier, 1.0);
  }

  /**
   * Gets statistics about active changes.
   * @returns Statistics object
   */
  public getStats(): {
    totalActive: number;
    byType: Record<string, number>;
    byTarget: Record<string, number>;
    averageMultiplier: number;
  } {
    const changes = this.getActiveChanges();
    const byType: Record<string, number> = {};
    const byTarget: Record<string, number> = {};
    let totalMultiplier = 0;

    for (const change of changes) {
      byType[change.type] = (byType[change.type] || 0) + 1;
      byTarget[change.target] = (byTarget[change.target] || 0) + 1;
      totalMultiplier += change.multiplier;
    }

    return {
      totalActive: changes.length,
      byType,
      byTarget,
      averageMultiplier: changes.length > 0 ? totalMultiplier / changes.length : 1.0
    };
  }

  /**
   * Clears all active changes (does not affect history).
   */
  public clearActive(): void {
    this.changes.clear();
    this.logger.info('All active changes cleared');
  }

  /**
   * Clears history.
   */
  public clearHistory(): void {
    this.history = [];
    this.logger.info('History cleared');
  }

  /**
   * Exports changes as JSON.
   * @returns JSON representation
   */
  public toJSON(): {
    active: BalanceChange[];
    history: BalanceChange[];
  } {
    return {
      active: this.getActiveChanges(),
      history: this.history
    };
  }

  /**
   * Imports changes from JSON.
   * @param json - JSON data
   */
  public fromJSON(json: {
    active: BalanceChange[];
    history: BalanceChange[];
  }): void {
    this.changes.clear();
    this.history = [];

    for (const change of json.active) {
      this.changes.set(change.id, change);
    }

    this.history = json.history;
    this.logger.info('Balance changes imported from JSON');
  }
}
