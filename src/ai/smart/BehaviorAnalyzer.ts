import { Logger } from '../../core/Logger';
import { EventTracker, GameEvent, EventCategory } from './EventTracker';
import { PlayerProfile, Playstyle, SkillLevel } from './PlayerProfile';

/**
 * Analyzed behavior insight.
 */
export interface BehaviorInsight {
  /** Insight type */
  type: string;
  /** Description */
  description: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Supporting evidence */
  evidence: string[];
  /** Recommended actions */
  recommendations: string[];
}

/**
 * Play session analysis.
 */
export interface SessionAnalysis {
  /** Session duration (ms) */
  duration: number;
  /** Total events */
  eventCount: number;
  /** Success rate */
  successRate: number;
  /** Dominant playstyle detected */
  dominantPlaystyle: Playstyle;
  /** Skill level estimate */
  skillEstimate: SkillLevel;
  /** Insights discovered */
  insights: BehaviorInsight[];
}

/**
 * Configuration for behavior analyzer.
 */
export interface BehaviorAnalyzerConfig {
  /** Minimum events for reliable analysis */
  minEventsForAnalysis?: number;
  /** Time window for session analysis (ms) */
  sessionWindow?: number;
  /** Enable advanced pattern detection */
  enableAdvancedPatterns?: boolean;
}

/**
 * Behavior Analyzer.
 *
 * Analyzes player behavior from tracked events and updates player profiles.
 * Detects playstyles, skill levels, and provides insights.
 *
 * @example
 * ```typescript
 * const analyzer = new BehaviorAnalyzer({
 *   minEventsForAnalysis: 10,
 *   enableAdvancedPatterns: true
 * });
 *
 * const session = analyzer.analyzeSession(eventTracker, profile);
 * const insights = analyzer.generateInsights(eventTracker, profile);
 * ```
 */
export class BehaviorAnalyzer {
  private minEventsForAnalysis: number;
  private sessionWindow: number;
  private enableAdvancedPatterns: boolean;
  private logger: Logger;

  /**
   * Creates a new behavior analyzer.
   * @param config - Configuration options
   */
  constructor(config: BehaviorAnalyzerConfig = {}) {
    this.logger = new Logger('BehaviorAnalyzer');
    this.minEventsForAnalysis = config.minEventsForAnalysis ?? 10;
    this.sessionWindow = config.sessionWindow ?? 300000; // 5 minutes
    this.enableAdvancedPatterns = config.enableAdvancedPatterns ?? true;

    this.logger.info('Behavior analyzer initialized');
  }

  /**
   * Analyzes a play session.
   * @param eventTracker - Event tracker with session events
   * @param profile - Player profile to update
   * @returns Session analysis
   */
  public analyzeSession(eventTracker: EventTracker, profile: PlayerProfile): SessionAnalysis {
    const events = eventTracker.getEvents({ timeWindow: this.sessionWindow });

    if (events.length < this.minEventsForAnalysis) {
      this.logger.warn('Insufficient events for session analysis');
      return {
        duration: 0,
        eventCount: 0,
        successRate: 0,
        dominantPlaystyle: Playstyle.BALANCED,
        skillEstimate: SkillLevel.BEGINNER,
        insights: []
      };
    }

    const duration = this.calculateSessionDuration(events);
    const successRate = this.calculateSuccessRate(events);
    const dominantPlaystyle = this.detectPlaystyle(events);
    const skillEstimate = this.estimateSkillLevel(events);
    const insights = this.generateInsights(eventTracker, profile);

    // Update profile
    profile.addPlaytime(duration);
    profile.incrementSessionCount();
    profile.setPlaystyle(dominantPlaystyle);

    this.logger.info(`Session analyzed: ${events.length} events, ${(successRate * 100).toFixed(1)}% success`);

    return {
      duration,
      eventCount: events.length,
      successRate,
      dominantPlaystyle,
      skillEstimate,
      insights
    };
  }

  /**
   * Calculates session duration from events.
   * @param events - Array of events
   * @returns Duration in milliseconds
   */
  private calculateSessionDuration(events: GameEvent[]): number {
    if (events.length < 2) {
      return 0;
    }
    return events[events.length - 1].timestamp - events[0].timestamp;
  }

  /**
   * Calculates success rate from events.
   * @param events - Array of events
   * @returns Success rate (0-1)
   */
  private calculateSuccessRate(events: GameEvent[]): number {
    const resultsEvents = events.filter(e => e.result !== undefined);
    if (resultsEvents.length === 0) {
      return 0.5;
    }

    const successes = resultsEvents.filter(e => e.result === 'success').length;
    return successes / resultsEvents.length;
  }

  /**
   * Detects player's playstyle from events.
   * @param events - Array of events
   * @returns Detected playstyle
   */
  private detectPlaystyle(events: GameEvent[]): Playstyle {
    const stats = this.calculateEventStats(events);

    // Combat heavy = aggressive
    if (stats.combatRatio > 0.6 && stats.avgEventRate > 5) {
      return Playstyle.AGGRESSIVE;
    }

    // Low combat, high exploration = exploration
    if (stats.combatRatio < 0.3 && stats.movementRatio > 0.5) {
      return Playstyle.EXPLORATION;
    }

    // High success rate, low combat = stealth
    if (stats.successRate > 0.7 && stats.combatRatio < 0.4) {
      return Playstyle.STEALTH;
    }

    // Fast completion, focused = speedrun
    if (stats.avgEventRate > 10 && stats.progressionRatio > 0.3) {
      return Playstyle.SPEEDRUN;
    }

    // High interaction rate = completionist
    if (stats.interactionRatio > 0.4) {
      return Playstyle.COMPLETIONIST;
    }

    // Moderate combat, high defense = defensive
    if (stats.combatRatio > 0.3 && stats.successRate > 0.6) {
      return Playstyle.DEFENSIVE;
    }

    return Playstyle.BALANCED;
  }

  /**
   * Estimates skill level from events.
   * @param events - Array of events
   * @returns Estimated skill level
   */
  private estimateSkillLevel(events: GameEvent[]): SkillLevel {
    const stats = this.calculateEventStats(events);

    // Combine multiple factors
    let skillScore = 0;

    // Success rate contributes
    skillScore += stats.successRate * 0.4;

    // Event rate (higher = more experienced)
    const normalizedRate = Math.min(stats.avgEventRate / 10, 1.0);
    skillScore += normalizedRate * 0.3;

    // Complexity (variety of event types)
    const typeVariety = stats.uniqueEventTypes / Math.max(events.length, 1);
    skillScore += typeVariety * 0.3;

    if (skillScore < 0.2) return SkillLevel.BEGINNER;
    if (skillScore < 0.4) return SkillLevel.NOVICE;
    if (skillScore < 0.6) return SkillLevel.INTERMEDIATE;
    if (skillScore < 0.8) return SkillLevel.ADVANCED;
    return SkillLevel.EXPERT;
  }

  /**
   * Calculates various statistics from events.
   * @param events - Array of events
   * @returns Event statistics
   */
  private calculateEventStats(events: GameEvent[]): {
    combatRatio: number;
    movementRatio: number;
    interactionRatio: number;
    progressionRatio: number;
    successRate: number;
    avgEventRate: number;
    uniqueEventTypes: number;
  } {
    if (events.length === 0) {
      return {
        combatRatio: 0,
        movementRatio: 0,
        interactionRatio: 0,
        progressionRatio: 0,
        successRate: 0,
        avgEventRate: 0,
        uniqueEventTypes: 0
      };
    }

    const categoryCount = new Map<EventCategory, number>();
    const uniqueTypes = new Set<string>();
    let successCount = 0;

    for (const event of events) {
      categoryCount.set(event.category, (categoryCount.get(event.category) || 0) + 1);
      uniqueTypes.add(event.type);
      if (event.result === 'success') {
        successCount++;
      }
    }

    const total = events.length;
    const combatRatio = (categoryCount.get(EventCategory.COMBAT) || 0) / total;
    const movementRatio = (categoryCount.get(EventCategory.MOVEMENT) || 0) / total;
    const interactionRatio = (categoryCount.get(EventCategory.INTERACTION) || 0) / total;
    const progressionRatio = (categoryCount.get(EventCategory.PROGRESSION) || 0) / total;
    const successRate = successCount / total;

    const duration = events[events.length - 1].timestamp - events[0].timestamp;
    const avgEventRate = (events.length / duration) * 60000; // Events per minute

    return {
      combatRatio,
      movementRatio,
      interactionRatio,
      progressionRatio,
      successRate,
      avgEventRate,
      uniqueEventTypes: uniqueTypes.size
    };
  }

  /**
   * Generates behavioral insights.
   * @param eventTracker - Event tracker
   * @param profile - Player profile
   * @returns Array of insights
   */
  public generateInsights(eventTracker: EventTracker, profile: PlayerProfile): BehaviorInsight[] {
    const insights: BehaviorInsight[] = [];
    const events = eventTracker.getEvents({ timeWindow: this.sessionWindow });

    if (events.length < this.minEventsForAnalysis) {
      return insights;
    }

    // Skill-based insights
    const skillInsights = this.generateSkillInsights(events, profile);
    insights.push(...skillInsights);

    // Playstyle insights
    const playstyleInsights = this.generatePlaystyleInsights(events, profile);
    insights.push(...playstyleInsights);

    // Performance insights
    const performanceInsights = this.generatePerformanceInsights(events);
    insights.push(...performanceInsights);

    this.logger.debug(`Generated ${insights.length} insights`);
    return insights;
  }

  /**
   * Generates skill-related insights.
   * @param events - Array of events
   * @param profile - Player profile
   * @returns Array of insights
   */
  private generateSkillInsights(events: GameEvent[], profile: PlayerProfile): BehaviorInsight[] {
    const insights: BehaviorInsight[] = [];
    const combatEvents = events.filter(e => e.category === EventCategory.COMBAT);

    if (combatEvents.length > 5) {
      const combatSuccess = combatEvents.filter(e => e.result === 'success').length;
      const combatRate = combatSuccess / combatEvents.length;

      if (combatRate > 0.8) {
        insights.push({
          type: 'high_combat_skill',
          description: 'Player demonstrates high combat proficiency',
          confidence: Math.min(combatEvents.length / 20, 1.0),
          evidence: [`${(combatRate * 100).toFixed(1)}% combat success rate`],
          recommendations: ['Consider increasing enemy difficulty', 'Introduce more challenging enemies']
        });
      } else if (combatRate < 0.4) {
        insights.push({
          type: 'struggling_combat',
          description: 'Player struggling with combat encounters',
          confidence: Math.min(combatEvents.length / 20, 1.0),
          evidence: [`${(combatRate * 100).toFixed(1)}% combat success rate`],
          recommendations: ['Reduce enemy difficulty', 'Provide combat tutorials', 'Increase health drops']
        });
      }
    }

    return insights;
  }

  /**
   * Generates playstyle-related insights.
   * @param events - Array of events
   * @param profile - Player profile
   * @returns Array of insights
   */
  private generatePlaystyleInsights(events: GameEvent[], profile: PlayerProfile): BehaviorInsight[] {
    const insights: BehaviorInsight[] = [];
    const stats = this.calculateEventStats(events);

    if (stats.interactionRatio > 0.5) {
      insights.push({
        type: 'completionist_tendency',
        description: 'Player shows completionist tendencies',
        confidence: 0.7,
        evidence: [`${(stats.interactionRatio * 100).toFixed(1)}% interaction events`],
        recommendations: ['Add collectibles', 'Include achievement system', 'Provide exploration rewards']
      });
    }

    if (stats.avgEventRate > 10) {
      insights.push({
        type: 'fast_paced_player',
        description: 'Player prefers fast-paced gameplay',
        confidence: 0.75,
        evidence: [`${stats.avgEventRate.toFixed(1)} events per minute`],
        recommendations: ['Reduce waiting times', 'Increase action density', 'Add time-based challenges']
      });
    }

    return insights;
  }

  /**
   * Generates performance-related insights.
   * @param events - Array of events
   * @returns Array of insights
   */
  private generatePerformanceInsights(events: GameEvent[]): BehaviorInsight[] {
    const insights: BehaviorInsight[] = [];
    const stats = this.calculateEventStats(events);

    if (stats.successRate > 0.85) {
      insights.push({
        type: 'high_performance',
        description: 'Player performing exceptionally well',
        confidence: 0.8,
        evidence: [`${(stats.successRate * 100).toFixed(1)}% overall success rate`],
        recommendations: ['Increase difficulty', 'Introduce advanced mechanics', 'Add challenge modes']
      });
    } else if (stats.successRate < 0.3) {
      insights.push({
        type: 'low_performance',
        description: 'Player experiencing difficulty',
        confidence: 0.8,
        evidence: [`${(stats.successRate * 100).toFixed(1)}% overall success rate`],
        recommendations: ['Decrease difficulty', 'Provide hints', 'Add checkpoints', 'Offer tutorials']
      });
    }

    return insights;
  }

  /**
   * Updates player profile based on recent events.
   * @param eventTracker - Event tracker
   * @param profile - Player profile to update
   */
  public updateProfile(eventTracker: EventTracker, profile: PlayerProfile): void {
    const events = eventTracker.getEvents({ timeWindow: this.sessionWindow });

    if (events.length < this.minEventsForAnalysis) {
      return;
    }

    // Update combat skill
    const combatEvents = events.filter(e => e.category === EventCategory.COMBAT);
    if (combatEvents.length > 0) {
      const combatSuccess = combatEvents.filter(e => e.result === 'success').length;
      const combatSkill = combatSuccess / combatEvents.length;
      profile.updateSkill('combat', combatSkill, combatEvents.length);
    }

    // Update movement skill
    const movementEvents = events.filter(e => e.category === EventCategory.MOVEMENT);
    if (movementEvents.length > 0) {
      const movementSuccess = movementEvents.filter(e => e.result === 'success').length;
      const movementSkill = movementSuccess / movementEvents.length;
      profile.updateSkill('movement', movementSkill, movementEvents.length);
    }

    // Detect and add patterns
    if (this.enableAdvancedPatterns) {
      const patterns = eventTracker.detectPatterns(3);
      for (const pattern of patterns) {
        profile.addPattern({
          name: pattern.name,
          description: `Repeated pattern: ${pattern.name}`,
          frequency: pattern.frequency,
          confidence: pattern.confidence
        });
      }
    }

    this.logger.debug('Profile updated from event analysis');
  }
}
