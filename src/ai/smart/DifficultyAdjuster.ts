import { Logger } from '../../core/Logger';
import { PlayerProfile, SkillLevel } from './PlayerProfile';
import { BehaviorAnalyzer, BehaviorInsight } from './BehaviorAnalyzer';
import { EventTracker } from './EventTracker';

/**
 * Difficulty adjustment parameters.
 */
export interface DifficultyAdjustment {
  /** Enemy health multiplier */
  enemyHealth: number;
  /** Enemy damage multiplier */
  enemyDamage: number;
  /** Enemy count multiplier */
  enemyCount: number;
  /** Resource drop rate multiplier */
  resourceDropRate: number;
  /** Experience multiplier */
  experienceMultiplier: number;
  /** Timer duration multiplier */
  timerMultiplier: number;
  /** Checkpoint frequency multiplier */
  checkpointMultiplier: number;
}

/**
 * Configuration for difficulty adjuster.
 */
export interface DifficultyAdjusterConfig {
  /** Enable automatic adjustments */
  autoAdjust?: boolean;
  /** Adjustment update interval (ms) */
  updateInterval?: number;
  /** Smoothing factor for gradual adjustments (0-1) */
  smoothingFactor?: number;
  /** Minimum time between adjustments (ms) */
  minAdjustmentInterval?: number;
}

/**
 * Difficulty Adjuster.
 *
 * Dynamically adjusts game difficulty based on player profile and behavior.
 * Uses player skill level, playstyle, and behavioral insights to compute
 * appropriate difficulty parameters.
 *
 * @example
 * ```typescript
 * const adjuster = new DifficultyAdjuster({
 *   autoAdjust: true,
 *   updateInterval: 10000
 * });
 *
 * adjuster.start(profile, eventTracker, analyzer);
 *
 * const adjustment = adjuster.getAdjustment();
 * applyDifficultySettings(adjustment);
 * ```
 */
export class DifficultyAdjuster {
  private currentAdjustment: DifficultyAdjustment;
  private targetAdjustment: DifficultyAdjustment;
  private autoAdjust: boolean;
  private updateInterval: number;
  private smoothingFactor: number;
  private minAdjustmentInterval: number;
  private lastAdjustment: number;
  private updateTimer: any;
  private running: boolean;
  private logger: Logger;

  /**
   * Creates a new difficulty adjuster.
   * @param config - Configuration options
   */
  constructor(config: DifficultyAdjusterConfig = {}) {
    this.logger = new Logger('DifficultyAdjuster');
    this.autoAdjust = config.autoAdjust ?? true;
    this.updateInterval = config.updateInterval ?? 10000;
    this.smoothingFactor = config.smoothingFactor ?? 0.2;
    this.minAdjustmentInterval = config.minAdjustmentInterval ?? 30000;
    this.lastAdjustment = 0;
    this.updateTimer = null;
    this.running = false;

    // Initialize with neutral adjustments
    this.currentAdjustment = this.getNeutralAdjustment();
    this.targetAdjustment = this.getNeutralAdjustment();

    this.logger.info('Difficulty adjuster initialized');
  }

  /**
   * Gets neutral (1.0x) adjustment values.
   * @returns Neutral adjustment
   */
  private getNeutralAdjustment(): DifficultyAdjustment {
    return {
      enemyHealth: 1.0,
      enemyDamage: 1.0,
      enemyCount: 1.0,
      resourceDropRate: 1.0,
      experienceMultiplier: 1.0,
      timerMultiplier: 1.0,
      checkpointMultiplier: 1.0
    };
  }

  /**
   * Starts automatic difficulty adjustment.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @param analyzer - Behavior analyzer
   */
  public start(
    profile: PlayerProfile,
    eventTracker: EventTracker,
    analyzer: BehaviorAnalyzer
  ): void {
    if (this.running) {
      this.logger.warn('Difficulty adjuster already running');
      return;
    }

    this.running = true;
    this.updateTimer = setInterval(() => {
      this.update(profile, eventTracker, analyzer);
    }, this.updateInterval);

    this.logger.info('Difficulty adjuster started');
  }

  /**
   * Stops automatic difficulty adjustment.
   */
  public stop(): void {
    if (!this.running) {
      this.logger.warn('Difficulty adjuster not running');
      return;
    }

    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    this.logger.info('Difficulty adjuster stopped');
  }

  /**
   * Update cycle - computes and applies adjustments.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @param analyzer - Behavior analyzer
   */
  private update(
    profile: PlayerProfile,
    eventTracker: EventTracker,
    analyzer: BehaviorAnalyzer
  ): void {
    if (!this.autoAdjust) {
      return;
    }

    const now = Date.now();
    if (now - this.lastAdjustment < this.minAdjustmentInterval) {
      return;
    }

    // Compute target adjustment
    this.targetAdjustment = this.computeAdjustment(profile, eventTracker, analyzer);

    // Apply smoothing
    this.smoothAdjustment();

    this.lastAdjustment = now;
    this.logger.debug('Difficulty adjusted');
  }

  /**
   * Computes difficulty adjustment based on player data.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @param analyzer - Behavior analyzer
   * @returns Computed adjustment
   */
  private computeAdjustment(
    profile: PlayerProfile,
    eventTracker: EventTracker,
    analyzer: BehaviorAnalyzer
  ): DifficultyAdjustment {
    const adjustment = this.getNeutralAdjustment();

    // Base adjustment on skill level
    const skillMultiplier = this.getSkillMultiplier(profile.getSkillLevel());
    adjustment.enemyHealth *= skillMultiplier;
    adjustment.enemyDamage *= skillMultiplier;

    // Adjust based on combat skill
    const combatSkill = profile.getSkill('combat');
    if (combatSkill) {
      if (combatSkill.level > 0.7) {
        // High skill - increase difficulty
        adjustment.enemyHealth *= 1.2;
        adjustment.enemyCount *= 1.1;
        adjustment.resourceDropRate *= 0.9;
      } else if (combatSkill.level < 0.3) {
        // Low skill - decrease difficulty
        adjustment.enemyHealth *= 0.8;
        adjustment.enemyDamage *= 0.8;
        adjustment.resourceDropRate *= 1.2;
      }
    }

    // Adjust based on insights
    const insights = analyzer.generateInsights(eventTracker, profile);
    this.applyInsightAdjustments(adjustment, insights);

    // Adjust based on playstyle
    const playstyle = profile.getPlaystyle();
    this.applyPlaystyleAdjustments(adjustment, playstyle);

    return adjustment;
  }

  /**
   * Gets base multiplier for skill level.
   * @param skillLevel - Player skill level
   * @returns Multiplier value
   */
  private getSkillMultiplier(skillLevel: SkillLevel): number {
    switch (skillLevel) {
      case SkillLevel.BEGINNER:
        return 0.7;
      case SkillLevel.NOVICE:
        return 0.85;
      case SkillLevel.INTERMEDIATE:
        return 1.0;
      case SkillLevel.ADVANCED:
        return 1.2;
      case SkillLevel.EXPERT:
        return 1.4;
      default:
        return 1.0;
    }
  }

  /**
   * Applies adjustments based on behavioral insights.
   * @param adjustment - Adjustment to modify
   * @param insights - Behavioral insights
   */
  private applyInsightAdjustments(
    adjustment: DifficultyAdjustment,
    insights: BehaviorInsight[]
  ): void {
    for (const insight of insights) {
      switch (insight.type) {
        case 'high_performance':
          adjustment.enemyHealth *= 1.15;
          adjustment.enemyDamage *= 1.1;
          adjustment.experienceMultiplier *= 1.2;
          break;

        case 'low_performance':
          adjustment.enemyHealth *= 0.85;
          adjustment.enemyDamage *= 0.85;
          adjustment.resourceDropRate *= 1.3;
          adjustment.checkpointMultiplier *= 1.2;
          break;

        case 'struggling_combat':
          adjustment.enemyHealth *= 0.8;
          adjustment.enemyDamage *= 0.8;
          adjustment.resourceDropRate *= 1.4;
          break;

        case 'high_combat_skill':
          adjustment.enemyHealth *= 1.2;
          adjustment.enemyCount *= 1.15;
          break;

        case 'fast_paced_player':
          adjustment.timerMultiplier *= 1.2;
          adjustment.enemyCount *= 1.1;
          break;
      }
    }
  }

  /**
   * Applies adjustments based on playstyle.
   * @param adjustment - Adjustment to modify
   * @param playstyle - Player playstyle
   */
  private applyPlaystyleAdjustments(
    adjustment: DifficultyAdjustment,
    playstyle: string
  ): void {
    switch (playstyle) {
      case 'aggressive':
        adjustment.enemyCount *= 1.2;
        adjustment.resourceDropRate *= 0.9;
        break;

      case 'defensive':
        adjustment.enemyDamage *= 0.9;
        adjustment.checkpointMultiplier *= 1.1;
        break;

      case 'stealth':
        adjustment.enemyCount *= 0.8;
        adjustment.enemyDamage *= 1.1;
        break;

      case 'exploration':
        adjustment.timerMultiplier *= 1.3;
        adjustment.resourceDropRate *= 1.1;
        break;

      case 'speedrun':
        adjustment.timerMultiplier *= 0.9;
        adjustment.experienceMultiplier *= 1.2;
        break;

      case 'completionist':
        adjustment.experienceMultiplier *= 1.1;
        adjustment.resourceDropRate *= 1.1;
        break;
    }
  }

  /**
   * Smoothly interpolates current adjustment toward target.
   */
  private smoothAdjustment(): void {
    const alpha = this.smoothingFactor;

    this.currentAdjustment.enemyHealth = this.lerp(
      this.currentAdjustment.enemyHealth,
      this.targetAdjustment.enemyHealth,
      alpha
    );
    this.currentAdjustment.enemyDamage = this.lerp(
      this.currentAdjustment.enemyDamage,
      this.targetAdjustment.enemyDamage,
      alpha
    );
    this.currentAdjustment.enemyCount = this.lerp(
      this.currentAdjustment.enemyCount,
      this.targetAdjustment.enemyCount,
      alpha
    );
    this.currentAdjustment.resourceDropRate = this.lerp(
      this.currentAdjustment.resourceDropRate,
      this.targetAdjustment.resourceDropRate,
      alpha
    );
    this.currentAdjustment.experienceMultiplier = this.lerp(
      this.currentAdjustment.experienceMultiplier,
      this.targetAdjustment.experienceMultiplier,
      alpha
    );
    this.currentAdjustment.timerMultiplier = this.lerp(
      this.currentAdjustment.timerMultiplier,
      this.targetAdjustment.timerMultiplier,
      alpha
    );
    this.currentAdjustment.checkpointMultiplier = this.lerp(
      this.currentAdjustment.checkpointMultiplier,
      this.targetAdjustment.checkpointMultiplier,
      alpha
    );
  }

  /**
   * Linear interpolation.
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor (0-1)
   * @returns Interpolated value
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Gets the current difficulty adjustment.
   * @returns Current adjustment
   */
  public getAdjustment(): DifficultyAdjustment {
    return { ...this.currentAdjustment };
  }

  /**
   * Manually sets difficulty adjustment.
   * @param adjustment - New adjustment values
   */
  public setAdjustment(adjustment: Partial<DifficultyAdjustment>): void {
    this.currentAdjustment = {
      ...this.currentAdjustment,
      ...adjustment
    };
    this.targetAdjustment = { ...this.currentAdjustment };
    this.logger.debug('Difficulty adjustment manually set');
  }

  /**
   * Resets difficulty to neutral.
   */
  public reset(): void {
    this.currentAdjustment = this.getNeutralAdjustment();
    this.targetAdjustment = this.getNeutralAdjustment();
    this.lastAdjustment = 0;
    this.logger.info('Difficulty reset to neutral');
  }

  /**
   * Gets whether the adjuster is running.
   * @returns True if running
   */
  public isRunning(): boolean {
    return this.running;
  }
}
