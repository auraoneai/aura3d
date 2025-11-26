import { Logger } from '../../core/Logger';
import { EventTracker, EventTrackerConfig, GameEvent, EventCategory } from './EventTracker';
import { PlayerProfile, PlayerProfileConfig } from './PlayerProfile';
import { BehaviorAnalyzer, BehaviorAnalyzerConfig } from './BehaviorAnalyzer';
import { DifficultyAdjuster, DifficultyAdjusterConfig } from './DifficultyAdjuster';
import { ContentGenerator, ContentGeneratorConfig, ContentType } from './ContentGenerator';
import { AdaptiveAI, AdaptiveAIConfig } from './AdaptiveAI';

/**
 * Configuration for smart systems framework.
 */
export interface SmartSystemsConfig {
  /** Player ID */
  playerId: string;
  /** Event tracker configuration */
  eventTracker?: EventTrackerConfig;
  /** Player profile configuration */
  playerProfile?: PlayerProfileConfig;
  /** Behavior analyzer configuration */
  behaviorAnalyzer?: BehaviorAnalyzerConfig;
  /** Difficulty adjuster configuration */
  difficultyAdjuster?: DifficultyAdjusterConfig;
  /** Content generator configuration */
  contentGenerator?: ContentGeneratorConfig;
  /** Adaptive AI configuration */
  adaptiveAI?: AdaptiveAIConfig;
  /** Enable all subsystems */
  enableAll?: boolean;
}

/**
 * Smart Systems Framework Manager.
 *
 * Central manager that coordinates all smart systems:
 * - Event tracking and analysis
 * - Player profiling
 * - Behavior analysis
 * - Dynamic difficulty adjustment
 * - Procedural content generation
 * - Adaptive AI
 *
 * Provides a unified interface for intelligent, adaptive game systems.
 *
 * @example
 * ```typescript
 * const smart = new SmartSystemsFramework({
 *   playerId: 'player_123',
 *   enableAll: true
 * });
 *
 * smart.start();
 *
 * // Track player actions
 * smart.trackEvent({
 *   type: 'enemy_killed',
 *   category: EventCategory.COMBAT,
 *   severity: EventSeverity.MEDIUM,
 *   data: { enemyType: 'goblin' },
 *   result: 'success'
 * });
 *
 * // Generate adaptive content
 * const quest = smart.generateContent({ type: ContentType.QUEST });
 *
 * // Get AI behavior
 * const aiBehavior = smart.getAIBehavior();
 * ```
 */
export class SmartSystemsFramework {
  private eventTracker: EventTracker;
  private playerProfile: PlayerProfile;
  private behaviorAnalyzer: BehaviorAnalyzer;
  private difficultyAdjuster: DifficultyAdjuster;
  private contentGenerator: ContentGenerator;
  private adaptiveAI: AdaptiveAI;
  private running: boolean;
  private logger: Logger;

  /**
   * Creates a new smart systems framework.
   * @param config - Configuration options
   */
  constructor(config: SmartSystemsConfig) {
    this.logger = new Logger('SmartSystemsFramework');
    this.running = false;

    // Initialize subsystems
    this.eventTracker = new EventTracker(config.eventTracker);

    this.playerProfile = new PlayerProfile({
      playerId: config.playerId,
      ...config.playerProfile
    });

    this.behaviorAnalyzer = new BehaviorAnalyzer(config.behaviorAnalyzer);
    this.difficultyAdjuster = new DifficultyAdjuster(config.difficultyAdjuster);
    this.contentGenerator = new ContentGenerator(config.contentGenerator);
    this.adaptiveAI = new AdaptiveAI(config.adaptiveAI);

    this.logger.info(`Smart systems framework initialized for player ${config.playerId}`);
  }

  /**
   * Starts all smart systems.
   */
  public start(): void {
    if (this.running) {
      this.logger.warn('Smart systems already running');
      return;
    }

    this.running = true;

    // Start adaptive systems
    this.difficultyAdjuster.start(this.playerProfile, this.eventTracker, this.behaviorAnalyzer);
    this.adaptiveAI.start(this.playerProfile, this.eventTracker);

    this.logger.info('Smart systems started');
  }

  /**
   * Stops all smart systems.
   */
  public stop(): void {
    if (!this.running) {
      this.logger.warn('Smart systems not running');
      return;
    }

    this.running = false;

    this.difficultyAdjuster.stop();
    this.adaptiveAI.stop();

    this.logger.info('Smart systems stopped');
  }

  /**
   * Tracks a game event.
   * @param event - Event data
   * @returns The tracked event
   */
  public trackEvent(event: Omit<GameEvent, 'id' | 'timestamp'>): GameEvent {
    const trackedEvent = this.eventTracker.trackEvent(event);

    // Periodically update profile based on events
    if (this.eventTracker.getEvents().length % 10 === 0) {
      this.behaviorAnalyzer.updateProfile(this.eventTracker, this.playerProfile);
    }

    return trackedEvent;
  }

  /**
   * Analyzes the current play session.
   * @returns Session analysis
   */
  public analyzeSession() {
    return this.behaviorAnalyzer.analyzeSession(this.eventTracker, this.playerProfile);
  }

  /**
   * Generates behavioral insights.
   * @returns Array of insights
   */
  public getInsights() {
    return this.behaviorAnalyzer.generateInsights(this.eventTracker, this.playerProfile);
  }

  /**
   * Generates adaptive content.
   * @param params - Generation parameters
   * @returns Generated content
   */
  public generateContent(params: { type: ContentType; difficulty?: any; constraints?: any; seed?: number }) {
    return this.contentGenerator.generateContent(this.playerProfile, params);
  }

  /**
   * Gets current difficulty adjustment.
   * @returns Difficulty adjustment parameters
   */
  public getDifficultyAdjustment() {
    return this.difficultyAdjuster.getAdjustment();
  }

  /**
   * Gets current AI behavior parameters.
   * @returns AI behavior parameters
   */
  public getAIBehavior() {
    return this.adaptiveAI.getBehaviorParams();
  }

  /**
   * Gets the player profile.
   * @returns Player profile
   */
  public getProfile(): PlayerProfile {
    return this.playerProfile;
  }

  /**
   * Gets the event tracker.
   * @returns Event tracker
   */
  public getEventTracker(): EventTracker {
    return this.eventTracker;
  }

  /**
   * Gets the behavior analyzer.
   * @returns Behavior analyzer
   */
  public getBehaviorAnalyzer(): BehaviorAnalyzer {
    return this.behaviorAnalyzer;
  }

  /**
   * Gets the difficulty adjuster.
   * @returns Difficulty adjuster
   */
  public getDifficultyAdjuster(): DifficultyAdjuster {
    return this.difficultyAdjuster;
  }

  /**
   * Gets the content generator.
   * @returns Content generator
   */
  public getContentGenerator(): ContentGenerator {
    return this.contentGenerator;
  }

  /**
   * Gets the adaptive AI.
   * @returns Adaptive AI
   */
  public getAdaptiveAI(): AdaptiveAI {
    return this.adaptiveAI;
  }

  /**
   * Resets all systems to default state.
   */
  public reset(): void {
    this.eventTracker.clear();
    this.difficultyAdjuster.reset();
    this.adaptiveAI.reset();
    this.logger.info('All smart systems reset');
  }

  /**
   * Exports all data as JSON.
   * @returns JSON representation
   */
  public toJSON(): any {
    return {
      profile: this.playerProfile.toJSON(),
      events: this.eventTracker.toJSON(),
      difficulty: this.difficultyAdjuster.getAdjustment(),
      aiBehavior: this.adaptiveAI.getBehaviorParams()
    };
  }

  /**
   * Imports data from JSON.
   * @param json - JSON data
   */
  public fromJSON(json: any): void {
    if (json.profile) {
      this.playerProfile.fromJSON(json.profile);
    }
    if (json.events) {
      this.eventTracker.fromJSON(json.events);
    }
    if (json.difficulty) {
      this.difficultyAdjuster.setAdjustment(json.difficulty);
    }
    if (json.aiBehavior) {
      this.adaptiveAI.setBehaviorParams(json.aiBehavior);
    }
    this.logger.info('Smart systems data imported');
  }

  /**
   * Gets statistics about all systems.
   * @returns Statistics object
   */
  public getStats(): {
    profile: any;
    events: any;
    insights: number;
    difficulty: any;
    ai: any;
  } {
    const session = this.analyzeSession();
    const insights = this.getInsights();

    return {
      profile: {
        skillLevel: this.playerProfile.getSkillLevel(),
        playstyle: this.playerProfile.getPlaystyle(),
        totalPlaytime: this.playerProfile.getTotalPlaytime(),
        sessionCount: this.playerProfile.getSessionCount()
      },
      events: this.eventTracker.getStats(),
      insights: insights.length,
      difficulty: this.difficultyAdjuster.getAdjustment(),
      ai: this.adaptiveAI.getBehaviorParams()
    };
  }

  /**
   * Gets whether the framework is running.
   * @returns True if running
   */
  public isRunning(): boolean {
    return this.running;
  }
}
