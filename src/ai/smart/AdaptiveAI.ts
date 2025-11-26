import { Logger } from '../../core/Logger';
import { PlayerProfile, Playstyle, SkillLevel } from './PlayerProfile';
import { EventTracker, EventCategory } from './EventTracker';

/**
 * AI behavior mode.
 */
export enum AIBehaviorMode {
  PASSIVE = 'passive',
  BALANCED = 'balanced',
  AGGRESSIVE = 'aggressive',
  TACTICAL = 'tactical',
  ADAPTIVE = 'adaptive'
}

/**
 * AI adaptation strategy.
 */
export enum AdaptationStrategy {
  /** Mirror player's playstyle */
  MIRROR = 'mirror',
  /** Counter player's playstyle */
  COUNTER = 'counter',
  /** Exploit player weaknesses */
  EXPLOIT = 'exploit',
  /** Match player skill level */
  MATCH_SKILL = 'match_skill',
  /** Challenge player strengths */
  CHALLENGE = 'challenge'
}

/**
 * AI behavior parameters.
 */
export interface AIBehaviorParams {
  /** Aggression level (0-1) */
  aggression: number;
  /** Defensiveness (0-1) */
  defensiveness: number;
  /** Tactical awareness (0-1) */
  tacticalAwareness: number;
  /** Reaction speed multiplier */
  reactionSpeed: number;
  /** Accuracy (0-1) */
  accuracy: number;
  /** Use of abilities/skills (0-1) */
  abilityUsage: number;
  /** Teamwork/coordination (0-1) */
  coordination: number;
}

/**
 * Configuration for adaptive AI.
 */
export interface AdaptiveAIConfig {
  /** Initial behavior mode */
  initialMode?: AIBehaviorMode;
  /** Adaptation strategy */
  strategy?: AdaptationStrategy;
  /** Update interval for adaptation (ms) */
  updateInterval?: number;
  /** Enable real-time adaptation */
  enableRealtimeAdaptation?: boolean;
  /** Smoothing factor for parameter changes (0-1) */
  smoothingFactor?: number;
}

/**
 * Adaptive AI.
 *
 * AI system that adapts its behavior based on player profile and actions.
 * Can mirror, counter, or challenge the player to create engaging encounters.
 *
 * @example
 * ```typescript
 * const ai = new AdaptiveAI({
 *   strategy: AdaptationStrategy.COUNTER,
 *   enableRealtimeAdaptation: true
 * });
 *
 * ai.start(profile, eventTracker);
 *
 * const params = ai.getBehaviorParams();
 * applyAIBehavior(enemyAI, params);
 * ```
 */
export class AdaptiveAI {
  private currentParams: AIBehaviorParams;
  private targetParams: AIBehaviorParams;
  private mode: AIBehaviorMode;
  private strategy: AdaptationStrategy;
  private updateInterval: number;
  private enableRealtimeAdaptation: boolean;
  private smoothingFactor: number;
  private updateTimer: any;
  private running: boolean;
  private logger: Logger;

  /**
   * Creates a new adaptive AI.
   * @param config - Configuration options
   */
  constructor(config: AdaptiveAIConfig = {}) {
    this.logger = new Logger('AdaptiveAI');
    this.mode = config.initialMode ?? AIBehaviorMode.BALANCED;
    this.strategy = config.strategy ?? AdaptationStrategy.MATCH_SKILL;
    this.updateInterval = config.updateInterval ?? 5000;
    this.enableRealtimeAdaptation = config.enableRealtimeAdaptation ?? true;
    this.smoothingFactor = config.smoothingFactor ?? 0.1;
    this.updateTimer = null;
    this.running = false;

    // Initialize with balanced parameters
    this.currentParams = this.getBalancedParams();
    this.targetParams = this.getBalancedParams();

    this.logger.info(`Adaptive AI initialized with ${this.strategy} strategy`);
  }

  /**
   * Gets balanced AI parameters.
   * @returns Balanced parameters
   */
  private getBalancedParams(): AIBehaviorParams {
    return {
      aggression: 0.5,
      defensiveness: 0.5,
      tacticalAwareness: 0.5,
      reactionSpeed: 1.0,
      accuracy: 0.5,
      abilityUsage: 0.5,
      coordination: 0.5
    };
  }

  /**
   * Starts adaptive AI system.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   */
  public start(profile: PlayerProfile, eventTracker: EventTracker): void {
    if (this.running) {
      this.logger.warn('Adaptive AI already running');
      return;
    }

    this.running = true;

    if (this.enableRealtimeAdaptation) {
      this.updateTimer = setInterval(() => {
        this.update(profile, eventTracker);
      }, this.updateInterval);
    }

    // Initial adaptation
    this.update(profile, eventTracker);

    this.logger.info('Adaptive AI started');
  }

  /**
   * Stops adaptive AI system.
   */
  public stop(): void {
    if (!this.running) {
      this.logger.warn('Adaptive AI not running');
      return;
    }

    this.running = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    this.logger.info('Adaptive AI stopped');
  }

  /**
   * Update cycle - adapts AI behavior.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   */
  private update(profile: PlayerProfile, eventTracker: EventTracker): void {
    // Compute target parameters based on strategy
    this.targetParams = this.computeAdaptiveParams(profile, eventTracker);

    // Smooth transition
    this.smoothParameters();

    this.logger.debug('AI behavior adapted');
  }

  /**
   * Computes adaptive parameters based on player data.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @returns Computed parameters
   */
  private computeAdaptiveParams(
    profile: PlayerProfile,
    eventTracker: EventTracker
  ): AIBehaviorParams {
    let params = this.getBalancedParams();

    switch (this.strategy) {
      case AdaptationStrategy.MIRROR:
        params = this.mirrorPlayer(profile, eventTracker);
        break;

      case AdaptationStrategy.COUNTER:
        params = this.counterPlayer(profile, eventTracker);
        break;

      case AdaptationStrategy.EXPLOIT:
        params = this.exploitWeaknesses(profile, eventTracker);
        break;

      case AdaptationStrategy.MATCH_SKILL:
        params = this.matchSkillLevel(profile);
        break;

      case AdaptationStrategy.CHALLENGE:
        params = this.challengePlayer(profile);
        break;
    }

    return params;
  }

  /**
   * Mirrors player's playstyle.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @returns Mirrored parameters
   */
  private mirrorPlayer(profile: PlayerProfile, eventTracker: EventTracker): AIBehaviorParams {
    const params = this.getBalancedParams();
    const playstyle = profile.getPlaystyle();

    switch (playstyle) {
      case Playstyle.AGGRESSIVE:
        params.aggression = 0.8;
        params.defensiveness = 0.3;
        params.reactionSpeed = 1.2;
        break;

      case Playstyle.DEFENSIVE:
        params.aggression = 0.3;
        params.defensiveness = 0.8;
        params.tacticalAwareness = 0.7;
        break;

      case Playstyle.STEALTH:
        params.aggression = 0.4;
        params.tacticalAwareness = 0.8;
        params.abilityUsage = 0.7;
        break;

      case Playstyle.SPEEDRUN:
        params.aggression = 0.7;
        params.reactionSpeed = 1.3;
        params.coordination = 0.8;
        break;
    }

    return params;
  }

  /**
   * Counters player's playstyle.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @returns Counter parameters
   */
  private counterPlayer(profile: PlayerProfile, eventTracker: EventTracker): AIBehaviorParams {
    const params = this.getBalancedParams();
    const playstyle = profile.getPlaystyle();

    switch (playstyle) {
      case Playstyle.AGGRESSIVE:
        // Counter aggression with defense and tactics
        params.aggression = 0.3;
        params.defensiveness = 0.8;
        params.tacticalAwareness = 0.7;
        params.coordination = 0.8;
        break;

      case Playstyle.DEFENSIVE:
        // Counter defense with aggression
        params.aggression = 0.8;
        params.defensiveness = 0.3;
        params.reactionSpeed = 1.2;
        break;

      case Playstyle.STEALTH:
        // Counter stealth with awareness
        params.tacticalAwareness = 0.9;
        params.accuracy = 0.8;
        params.coordination = 0.7;
        break;

      case Playstyle.SPEEDRUN:
        // Counter speed with obstacles and tactics
        params.tacticalAwareness = 0.8;
        params.abilityUsage = 0.8;
        params.coordination = 0.9;
        break;
    }

    return params;
  }

  /**
   * Exploits player weaknesses.
   * @param profile - Player profile
   * @param eventTracker - Event tracker
   * @returns Exploit parameters
   */
  private exploitWeaknesses(
    profile: PlayerProfile,
    eventTracker: EventTracker
  ): AIBehaviorParams {
    const params = this.getBalancedParams();
    const combatSkill = profile.getSkill('combat');

    if (combatSkill) {
      if (combatSkill.level < 0.4) {
        // Exploit low combat skill
        params.aggression = 0.7;
        params.reactionSpeed = 1.1;
        params.accuracy = 0.7;
      }
    }

    // Check recent events for patterns
    const events = eventTracker.getEvents({
      timeWindow: 60000,
      category: EventCategory.COMBAT
    });

    const failures = events.filter(e => e.result === 'failure').length;
    const total = events.length;

    if (total > 5 && failures / total > 0.5) {
      // Player struggling - push harder
      params.aggression = 0.8;
      params.coordination = 0.8;
    }

    return params;
  }

  /**
   * Matches player skill level.
   * @param profile - Player profile
   * @returns Matched parameters
   */
  private matchSkillLevel(profile: PlayerProfile): AIBehaviorParams {
    const params = this.getBalancedParams();
    const skillLevel = profile.getSkillLevel();

    const skillMultiplier = this.getSkillMultiplier(skillLevel);

    params.accuracy = 0.4 + skillMultiplier * 0.4;
    params.reactionSpeed = 0.8 + skillMultiplier * 0.4;
    params.tacticalAwareness = 0.3 + skillMultiplier * 0.5;
    params.abilityUsage = 0.3 + skillMultiplier * 0.5;
    params.coordination = 0.3 + skillMultiplier * 0.5;

    return params;
  }

  /**
   * Challenges player strengths.
   * @param profile - Player profile
   * @returns Challenge parameters
   */
  private challengePlayer(profile: PlayerProfile): AIBehaviorParams {
    const params = this.matchSkillLevel(profile);

    // Increase all parameters slightly above player's level
    params.aggression += 0.1;
    params.accuracy += 0.1;
    params.reactionSpeed += 0.1;
    params.tacticalAwareness += 0.1;
    params.abilityUsage += 0.1;
    params.coordination += 0.1;

    // Clamp to valid range
    this.clampParams(params);

    return params;
  }

  /**
   * Gets skill multiplier from skill level.
   * @param skillLevel - Player skill level
   * @returns Multiplier (0-1)
   */
  private getSkillMultiplier(skillLevel: SkillLevel): number {
    switch (skillLevel) {
      case SkillLevel.BEGINNER:
        return 0.2;
      case SkillLevel.NOVICE:
        return 0.4;
      case SkillLevel.INTERMEDIATE:
        return 0.6;
      case SkillLevel.ADVANCED:
        return 0.8;
      case SkillLevel.EXPERT:
        return 1.0;
      default:
        return 0.5;
    }
  }

  /**
   * Smoothly interpolates current parameters toward target.
   */
  private smoothParameters(): void {
    const alpha = this.smoothingFactor;

    this.currentParams.aggression = this.lerp(
      this.currentParams.aggression,
      this.targetParams.aggression,
      alpha
    );
    this.currentParams.defensiveness = this.lerp(
      this.currentParams.defensiveness,
      this.targetParams.defensiveness,
      alpha
    );
    this.currentParams.tacticalAwareness = this.lerp(
      this.currentParams.tacticalAwareness,
      this.targetParams.tacticalAwareness,
      alpha
    );
    this.currentParams.reactionSpeed = this.lerp(
      this.currentParams.reactionSpeed,
      this.targetParams.reactionSpeed,
      alpha
    );
    this.currentParams.accuracy = this.lerp(
      this.currentParams.accuracy,
      this.targetParams.accuracy,
      alpha
    );
    this.currentParams.abilityUsage = this.lerp(
      this.currentParams.abilityUsage,
      this.targetParams.abilityUsage,
      alpha
    );
    this.currentParams.coordination = this.lerp(
      this.currentParams.coordination,
      this.targetParams.coordination,
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
   * Clamps parameters to valid ranges.
   * @param params - Parameters to clamp
   */
  private clampParams(params: AIBehaviorParams): void {
    params.aggression = Math.max(0, Math.min(1, params.aggression));
    params.defensiveness = Math.max(0, Math.min(1, params.defensiveness));
    params.tacticalAwareness = Math.max(0, Math.min(1, params.tacticalAwareness));
    params.reactionSpeed = Math.max(0.5, Math.min(2, params.reactionSpeed));
    params.accuracy = Math.max(0, Math.min(1, params.accuracy));
    params.abilityUsage = Math.max(0, Math.min(1, params.abilityUsage));
    params.coordination = Math.max(0, Math.min(1, params.coordination));
  }

  /**
   * Gets current AI behavior parameters.
   * @returns Current parameters
   */
  public getBehaviorParams(): AIBehaviorParams {
    return { ...this.currentParams };
  }

  /**
   * Manually sets behavior parameters.
   * @param params - New parameters
   */
  public setBehaviorParams(params: Partial<AIBehaviorParams>): void {
    this.currentParams = {
      ...this.currentParams,
      ...params
    };
    this.clampParams(this.currentParams);
    this.targetParams = { ...this.currentParams };
    this.logger.debug('AI parameters manually set');
  }

  /**
   * Sets the behavior mode.
   * @param mode - New behavior mode
   */
  public setMode(mode: AIBehaviorMode): void {
    this.mode = mode;

    switch (mode) {
      case AIBehaviorMode.PASSIVE:
        this.currentParams.aggression = 0.2;
        break;
      case AIBehaviorMode.BALANCED:
        this.currentParams = this.getBalancedParams();
        break;
      case AIBehaviorMode.AGGRESSIVE:
        this.currentParams.aggression = 0.9;
        break;
      case AIBehaviorMode.TACTICAL:
        this.currentParams.tacticalAwareness = 0.9;
        break;
    }

    this.targetParams = { ...this.currentParams };
    this.logger.debug(`AI mode set to ${mode}`);
  }

  /**
   * Gets the current behavior mode.
   * @returns Behavior mode
   */
  public getMode(): AIBehaviorMode {
    return this.mode;
  }

  /**
   * Sets the adaptation strategy.
   * @param strategy - New strategy
   */
  public setStrategy(strategy: AdaptationStrategy): void {
    this.strategy = strategy;
    this.logger.debug(`Adaptation strategy set to ${strategy}`);
  }

  /**
   * Gets the adaptation strategy.
   * @returns Adaptation strategy
   */
  public getStrategy(): AdaptationStrategy {
    return this.strategy;
  }

  /**
   * Resets AI to default balanced state.
   */
  public reset(): void {
    this.currentParams = this.getBalancedParams();
    this.targetParams = this.getBalancedParams();
    this.logger.info('AI reset to balanced state');
  }

  /**
   * Gets whether the AI is running.
   * @returns True if running
   */
  public isRunning(): boolean {
    return this.running;
  }
}
