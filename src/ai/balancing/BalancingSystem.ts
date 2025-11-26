import { Logger } from '../../core/Logger';
import { DifficultyMetrics, MetricType, MetricStats } from './DifficultyMetrics';
import { AppliedBalanceChange, BalanceChangeType } from './AppliedBalanceChange';

/**
 * Difficulty level.
 */
export enum DifficultyLevel {
  VERY_EASY = 'very_easy',
  EASY = 'easy',
  NORMAL = 'normal',
  HARD = 'hard',
  VERY_HARD = 'very_hard'
}

/**
 * Adjustment strategy for difficulty.
 */
export enum AdjustmentStrategy {
  /** Gradual adjustments over time */
  GRADUAL = 'gradual',
  /** Immediate large adjustments */
  IMMEDIATE = 'immediate',
  /** Predictive adjustments based on trends */
  PREDICTIVE = 'predictive',
  /** No automatic adjustments */
  MANUAL = 'manual'
}

/**
 * Balance adjustment rule.
 */
export interface BalanceRule {
  /** Rule name */
  name: string;
  /** Metric type to monitor */
  metricType: MetricType;
  /** Threshold value */
  threshold: number;
  /** Comparison operator */
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
  /** Balance change to apply */
  changeType: BalanceChangeType;
  /** Target to affect */
  target: string;
  /** Multiplier to apply */
  multiplier: number;
  /** Cooldown between applications (ms) */
  cooldown: number;
  /** Last time this rule was triggered */
  lastTriggered: number;
}

/**
 * Configuration for balancing system.
 */
export interface BalancingSystemConfig {
  /** Adjustment strategy */
  strategy?: AdjustmentStrategy;
  /** Update interval for checking metrics (ms) */
  updateInterval?: number;
  /** Enable automatic adjustments */
  autoAdjust?: boolean;
  /** Minimum time between adjustments (ms) */
  adjustmentCooldown?: number;
  /** Gradual adjustment step size (for gradual strategy) */
  gradualStepSize?: number;
  /** Balance rules */
  rules?: BalanceRule[];
}

/**
 * Dynamic Difficulty Balancing System.
 *
 * Automatically adjusts game difficulty based on player performance metrics.
 * Supports multiple adjustment strategies and customizable rules.
 *
 * @example
 * ```typescript
 * const balancing = new BalancingSystem({
 *   strategy: AdjustmentStrategy.GRADUAL,
 *   autoAdjust: true,
 *   updateInterval: 5000
 * });
 *
 * balancing.addRule({
 *   name: 'reduce_enemy_health_on_struggling',
 *   metricType: MetricType.DEATH_RATE,
 *   threshold: 0.5,
 *   operator: 'gt',
 *   changeType: BalanceChangeType.ENEMY_HEALTH,
 *   target: 'enemy',
 *   multiplier: 0.9,
 *   cooldown: 30000
 * });
 *
 * balancing.start();
 * ```
 */
export class BalancingSystem {
  private metrics: DifficultyMetrics;
  private changes: AppliedBalanceChange;
  private strategy: AdjustmentStrategy;
  private updateInterval: number;
  private autoAdjust: boolean;
  private adjustmentCooldown: number;
  private gradualStepSize: number;
  private rules: BalanceRule[];
  private lastAdjustment: number;
  private updateTimer: any;
  private running: boolean;
  private logger: Logger;

  /**
   * Creates a new balancing system.
   * @param config - Configuration options
   */
  constructor(config: BalancingSystemConfig = {}) {
    this.logger = new Logger('BalancingSystem');
    this.metrics = new DifficultyMetrics();
    this.changes = new AppliedBalanceChange();
    this.strategy = config.strategy ?? AdjustmentStrategy.GRADUAL;
    this.updateInterval = config.updateInterval ?? 5000;
    this.autoAdjust = config.autoAdjust ?? true;
    this.adjustmentCooldown = config.adjustmentCooldown ?? 10000;
    this.gradualStepSize = config.gradualStepSize ?? 0.05;
    this.rules = config.rules ?? [];
    this.lastAdjustment = 0;
    this.updateTimer = null;
    this.running = false;

    this.logger.info(`Balancing system initialized with ${this.strategy} strategy`);
  }

  /**
   * Starts the balancing system.
   */
  public start(): void {
    if (this.running) {
      this.logger.warn('Balancing system already running');
      return;
    }

    this.running = true;
    this.updateTimer = setInterval(() => this.update(), this.updateInterval);
    this.logger.info('Balancing system started');
  }

  /**
   * Stops the balancing system.
   */
  public stop(): void {
    if (!this.running) {
      this.logger.warn('Balancing system not running');
      return;
    }

    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.logger.info('Balancing system stopped');
  }

  /**
   * Update cycle - checks metrics and applies adjustments.
   */
  private update(): void {
    if (!this.autoAdjust) {
      return;
    }

    const now = Date.now();
    if (now - this.lastAdjustment < this.adjustmentCooldown) {
      return;
    }

    // Evaluate all rules
    for (const rule of this.rules) {
      if (now - rule.lastTriggered < rule.cooldown) {
        continue;
      }

      if (this.evaluateRule(rule)) {
        this.applyRule(rule);
        rule.lastTriggered = now;
        this.lastAdjustment = now;
      }
    }
  }

  /**
   * Evaluates whether a rule should be triggered.
   * @param rule - The rule to evaluate
   * @returns True if rule should be triggered
   */
  private evaluateRule(rule: BalanceRule): boolean {
    const stats = this.metrics.getStats(rule.metricType);
    if (!stats) {
      return false;
    }

    const value = stats.mean;

    switch (rule.operator) {
      case 'lt':
        return value < rule.threshold;
      case 'lte':
        return value <= rule.threshold;
      case 'gt':
        return value > rule.threshold;
      case 'gte':
        return value >= rule.threshold;
      case 'eq':
        return Math.abs(value - rule.threshold) < 0.001;
      default:
        return false;
    }
  }

  /**
   * Applies a balance rule.
   * @param rule - The rule to apply
   */
  private applyRule(rule: BalanceRule): void {
    let multiplier = rule.multiplier;

    // Adjust multiplier based on strategy
    if (this.strategy === AdjustmentStrategy.GRADUAL) {
      // Make smaller adjustments
      const direction = multiplier > 1.0 ? 1 : -1;
      multiplier = 1.0 + (direction * this.gradualStepSize);
    }

    // Apply the change
    this.applyBalanceChange(
      rule.changeType,
      rule.target,
      multiplier,
      `Rule triggered: ${rule.name}`
    );

    this.logger.info(`Applied rule: ${rule.name} (multiplier: ${multiplier})`);
  }

  /**
   * Applies a balance change.
   * @param type - Change type
   * @param target - Target identifier
   * @param multiplier - Multiplier to apply
   * @param reason - Reason for change
   * @returns Change ID
   */
  public applyBalanceChange(
    type: BalanceChangeType,
    target: string,
    multiplier: number,
    reason: string
  ): string {
    // Get current value (simplified - in real use, would query game state)
    const currentValue = this.getCurrentValue(type, target);
    const newValue = currentValue * multiplier;

    return this.changes.recordChange({
      type,
      target,
      originalValue: currentValue,
      newValue,
      reason,
      canRollback: true
    });
  }

  /**
   * Gets the current value for a balance parameter.
   * In a real implementation, this would query the actual game state.
   * @param type - Balance change type
   * @param target - Target identifier
   * @returns Current value
   */
  private getCurrentValue(type: BalanceChangeType, target: string): number {
    // Apply cumulative multiplier from existing changes
    const baseValue = 100; // Simplified base value
    const cumulativeMultiplier = this.changes.getCumulativeMultiplier(target, type);
    return baseValue * cumulativeMultiplier;
  }

  /**
   * Records a performance metric.
   * @param type - Metric type
   * @param value - Metric value
   * @param context - Optional context
   */
  public recordMetric(
    type: MetricType,
    value: number,
    context?: Record<string, any>
  ): void {
    this.metrics.recordMetric(type, value, context);
  }

  /**
   * Gets statistics for a metric.
   * @param type - Metric type
   * @returns Metric statistics
   */
  public getMetricStats(type: MetricType): MetricStats | null {
    return this.metrics.getStats(type);
  }

  /**
   * Adds a balance rule.
   * @param rule - The rule to add (lastTriggered will be set to 0)
   */
  public addRule(rule: Omit<BalanceRule, 'lastTriggered'>): void {
    this.rules.push({
      ...rule,
      lastTriggered: 0
    });
    this.logger.debug(`Added rule: ${rule.name}`);
  }

  /**
   * Removes a rule by name.
   * @param name - Rule name
   * @returns True if removed
   */
  public removeRule(name: string): boolean {
    const index = this.rules.findIndex(r => r.name === name);
    if (index >= 0) {
      this.rules.splice(index, 1);
      this.logger.debug(`Removed rule: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Gets all rules.
   * @returns Array of rules
   */
  public getRules(): BalanceRule[] {
    return [...this.rules];
  }

  /**
   * Manually triggers a difficulty adjustment.
   * @param level - Target difficulty level
   */
  public setDifficulty(level: DifficultyLevel): void {
    const multipliers = this.getDifficultyMultipliers(level);

    for (const [type, multiplier] of Object.entries(multipliers)) {
      this.applyBalanceChange(
        type as BalanceChangeType,
        'global',
        multiplier,
        `Manual difficulty set to ${level}`
      );
    }

    this.logger.info(`Difficulty manually set to ${level}`);
  }

  /**
   * Gets multipliers for a difficulty level.
   * @param level - Difficulty level
   * @returns Multipliers for various balance types
   */
  private getDifficultyMultipliers(level: DifficultyLevel): Partial<Record<BalanceChangeType, number>> {
    const presets: Record<DifficultyLevel, Partial<Record<BalanceChangeType, number>>> = {
      [DifficultyLevel.VERY_EASY]: {
        [BalanceChangeType.ENEMY_HEALTH]: 0.5,
        [BalanceChangeType.ENEMY_DAMAGE]: 0.5,
        [BalanceChangeType.RESOURCE_DROP_RATE]: 2.0
      },
      [DifficultyLevel.EASY]: {
        [BalanceChangeType.ENEMY_HEALTH]: 0.75,
        [BalanceChangeType.ENEMY_DAMAGE]: 0.75,
        [BalanceChangeType.RESOURCE_DROP_RATE]: 1.5
      },
      [DifficultyLevel.NORMAL]: {
        [BalanceChangeType.ENEMY_HEALTH]: 1.0,
        [BalanceChangeType.ENEMY_DAMAGE]: 1.0,
        [BalanceChangeType.RESOURCE_DROP_RATE]: 1.0
      },
      [DifficultyLevel.HARD]: {
        [BalanceChangeType.ENEMY_HEALTH]: 1.5,
        [BalanceChangeType.ENEMY_DAMAGE]: 1.25,
        [BalanceChangeType.RESOURCE_DROP_RATE]: 0.75
      },
      [DifficultyLevel.VERY_HARD]: {
        [BalanceChangeType.ENEMY_HEALTH]: 2.0,
        [BalanceChangeType.ENEMY_DAMAGE]: 1.5,
        [BalanceChangeType.RESOURCE_DROP_RATE]: 0.5
      }
    };

    return presets[level];
  }

  /**
   * Resets all balance changes.
   */
  public reset(): void {
    this.changes.rollbackAll();
    this.lastAdjustment = 0;
    this.logger.info('Balancing system reset');
  }

  /**
   * Gets the metrics tracker.
   * @returns Difficulty metrics instance
   */
  public getMetrics(): DifficultyMetrics {
    return this.metrics;
  }

  /**
   * Gets the changes tracker.
   * @returns Applied balance change instance
   */
  public getChanges(): AppliedBalanceChange {
    return this.changes;
  }

  /**
   * Gets whether the system is running.
   * @returns True if running
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Gets the current adjustment strategy.
   * @returns Adjustment strategy
   */
  public getStrategy(): AdjustmentStrategy {
    return this.strategy;
  }

  /**
   * Sets the adjustment strategy.
   * @param strategy - New strategy
   */
  public setStrategy(strategy: AdjustmentStrategy): void {
    this.strategy = strategy;
    this.logger.debug(`Strategy changed to ${strategy}`);
  }
}
