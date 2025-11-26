import { Logger } from '../../core/Logger';

/**
 * Game event categories.
 */
export enum EventCategory {
  COMBAT = 'combat',
  MOVEMENT = 'movement',
  INTERACTION = 'interaction',
  PROGRESSION = 'progression',
  ECONOMY = 'economy',
  SOCIAL = 'social',
  CUSTOM = 'custom'
}

/**
 * Event severity/importance level.
 */
export enum EventSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Tracked game event.
 */
export interface GameEvent {
  /** Unique event ID */
  id: string;
  /** Event type/name */
  type: string;
  /** Event category */
  category: EventCategory;
  /** Event severity */
  severity: EventSeverity;
  /** Event timestamp */
  timestamp: number;
  /** Player ID (if applicable) */
  playerId?: string;
  /** Event data */
  data: Record<string, any>;
  /** Event duration (ms) */
  duration?: number;
  /** Event result (success/failure/neutral) */
  result?: 'success' | 'failure' | 'neutral';
}

/**
 * Event pattern detected by analysis.
 */
export interface EventPattern {
  /** Pattern name */
  name: string;
  /** Events matching this pattern */
  events: GameEvent[];
  /** Pattern frequency */
  frequency: number;
  /** Pattern confidence (0-1) */
  confidence: number;
  /** First occurrence */
  firstOccurrence: number;
  /** Last occurrence */
  lastOccurrence: number;
}

/**
 * Event statistics.
 */
export interface EventStats {
  /** Total event count */
  total: number;
  /** Events by category */
  byCategory: Record<string, number>;
  /** Events by type */
  byType: Record<string, number>;
  /** Events by severity */
  bySeverity: Record<string, number>;
  /** Success rate */
  successRate: number;
  /** Average event duration */
  avgDuration: number;
  /** Events per minute */
  eventsPerMinute: number;
}

/**
 * Configuration for event tracker.
 */
export interface EventTrackerConfig {
  /** Maximum number of events to retain */
  maxEvents?: number;
  /** Auto-prune events older than this (ms) */
  pruneAfter?: number;
  /** Enable pattern detection */
  enablePatternDetection?: boolean;
}

/**
 * Event Tracker.
 *
 * Tracks and analyzes game events for player behavior analysis.
 * Maintains event history and can detect patterns.
 *
 * @example
 * ```typescript
 * const tracker = new EventTracker({
 *   maxEvents: 1000,
 *   enablePatternDetection: true
 * });
 *
 * tracker.trackEvent({
 *   type: 'enemy_killed',
 *   category: EventCategory.COMBAT,
 *   severity: EventSeverity.MEDIUM,
 *   data: { enemyType: 'goblin', damage: 50 },
 *   result: 'success'
 * });
 *
 * const stats = tracker.getStats();
 * ```
 */
export class EventTracker {
  private events: GameEvent[];
  private maxEvents: number;
  private pruneAfter: number | null;
  private enablePatternDetection: boolean;
  private nextId: number;
  private logger: Logger;

  /**
   * Creates a new event tracker.
   * @param config - Configuration options
   */
  constructor(config: EventTrackerConfig = {}) {
    this.logger = new Logger('EventTracker');
    this.events = [];
    this.maxEvents = config.maxEvents ?? 1000;
    this.pruneAfter = config.pruneAfter ?? null;
    this.enablePatternDetection = config.enablePatternDetection ?? true;
    this.nextId = 1;

    this.logger.info('Event tracker initialized');
  }

  /**
   * Tracks a game event.
   * @param event - Partial event data (ID and timestamp auto-generated)
   * @returns The full event
   */
  public trackEvent(event: Omit<GameEvent, 'id' | 'timestamp'>): GameEvent {
    const fullEvent: GameEvent = {
      ...event,
      id: `event_${this.nextId++}`,
      timestamp: Date.now()
    };

    this.events.push(fullEvent);

    // Prune if necessary
    this.pruneOldEvents();

    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    this.logger.debug(`Event tracked: ${fullEvent.type} (${fullEvent.category})`);

    return fullEvent;
  }

  /**
   * Gets all tracked events.
   * @param filter - Optional filter criteria
   * @returns Array of events
   */
  public getEvents(filter?: {
    category?: EventCategory;
    type?: string;
    playerId?: string;
    severity?: EventSeverity;
    result?: 'success' | 'failure' | 'neutral';
    timeWindow?: number;
  }): GameEvent[] {
    let filtered = [...this.events];

    if (filter) {
      if (filter.category) {
        filtered = filtered.filter(e => e.category === filter.category);
      }
      if (filter.type) {
        filtered = filtered.filter(e => e.type === filter.type);
      }
      if (filter.playerId) {
        filtered = filtered.filter(e => e.playerId === filter.playerId);
      }
      if (filter.severity) {
        filtered = filtered.filter(e => e.severity === filter.severity);
      }
      if (filter.result) {
        filtered = filtered.filter(e => e.result === filter.result);
      }
      if (filter.timeWindow) {
        const cutoff = Date.now() - filter.timeWindow;
        filtered = filtered.filter(e => e.timestamp >= cutoff);
      }
    }

    return filtered;
  }

  /**
   * Gets event statistics.
   * @param timeWindow - Optional time window (ms)
   * @returns Event statistics
   */
  public getStats(timeWindow?: number): EventStats {
    const events = timeWindow
      ? this.getEvents({ timeWindow })
      : this.events;

    const byCategory: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let successCount = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const event of events) {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;

      if (event.result === 'success') {
        successCount++;
      }

      if (event.duration !== undefined) {
        totalDuration += event.duration;
        durationCount++;
      }
    }

    const successRate = events.length > 0
      ? successCount / events.length
      : 0;

    const avgDuration = durationCount > 0
      ? totalDuration / durationCount
      : 0;

    // Calculate events per minute
    let eventsPerMinute = 0;
    if (events.length > 1) {
      const timeSpan = events[events.length - 1].timestamp - events[0].timestamp;
      eventsPerMinute = (events.length / timeSpan) * 60000;
    }

    return {
      total: events.length,
      byCategory,
      byType,
      bySeverity,
      successRate,
      avgDuration,
      eventsPerMinute
    };
  }

  /**
   * Detects event patterns.
   * @param minOccurrences - Minimum occurrences to be considered a pattern
   * @returns Array of detected patterns
   */
  public detectPatterns(minOccurrences: number = 3): EventPattern[] {
    if (!this.enablePatternDetection) {
      return [];
    }

    const patterns: EventPattern[] = [];
    const sequences = this.findEventSequences(minOccurrences);

    for (const [sequence, events] of sequences.entries()) {
      if (events.length >= minOccurrences) {
        patterns.push({
          name: sequence,
          events,
          frequency: events.length,
          confidence: this.calculatePatternConfidence(events),
          firstOccurrence: events[0].timestamp,
          lastOccurrence: events[events.length - 1].timestamp
        });
      }
    }

    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Finds sequences of event types.
   * @param minOccurrences - Minimum occurrences
   * @returns Map of sequence to events
   */
  private findEventSequences(minOccurrences: number): Map<string, GameEvent[]> {
    const sequences = new Map<string, GameEvent[]>();

    // Simple pattern: same event type occurring multiple times
    const typeGroups = new Map<string, GameEvent[]>();
    for (const event of this.events) {
      if (!typeGroups.has(event.type)) {
        typeGroups.set(event.type, []);
      }
      typeGroups.get(event.type)!.push(event);
    }

    typeGroups.forEach((events, type) => {
      if (events.length >= minOccurrences) {
        sequences.set(type, events);
      }
    });

    return sequences;
  }

  /**
   * Calculates confidence score for a pattern.
   * @param events - Events in the pattern
   * @returns Confidence score (0-1)
   */
  private calculatePatternConfidence(events: GameEvent[]): number {
    if (events.length < 2) {
      return 0.5;
    }

    // Base confidence on frequency and consistency
    const frequency = events.length;
    const timeSpan = events[events.length - 1].timestamp - events[0].timestamp;
    const avgInterval = timeSpan / (events.length - 1);

    // Check consistency of intervals
    let variance = 0;
    for (let i = 1; i < events.length; i++) {
      const interval = events[i].timestamp - events[i - 1].timestamp;
      variance += Math.pow(interval - avgInterval, 2);
    }
    variance /= events.length - 1;

    const consistency = 1 / (1 + Math.sqrt(variance) / avgInterval);
    const frequencyScore = Math.min(frequency / 10, 1.0);

    return (consistency + frequencyScore) / 2;
  }

  /**
   * Prunes old events based on pruneAfter setting.
   */
  private pruneOldEvents(): void {
    if (!this.pruneAfter) {
      return;
    }

    const cutoff = Date.now() - this.pruneAfter;
    const originalLength = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= cutoff);

    const pruned = originalLength - this.events.length;
    if (pruned > 0) {
      this.logger.debug(`Pruned ${pruned} old events`);
    }
  }

  /**
   * Clears all events.
   */
  public clear(): void {
    this.events = [];
    this.logger.info('All events cleared');
  }

  /**
   * Exports events as JSON.
   * @returns JSON representation
   */
  public toJSON(): GameEvent[] {
    return [...this.events];
  }

  /**
   * Imports events from JSON.
   * @param json - JSON data
   */
  public fromJSON(json: GameEvent[]): void {
    this.events = json;
    this.logger.info('Events imported from JSON');
  }
}
