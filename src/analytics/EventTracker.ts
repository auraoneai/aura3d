/**
 * G3D Event Tracker
 * Handles custom event tracking with validation and rate limiting
 * @module Analytics
 */

import { AnalyticsManager } from './AnalyticsManager';

/**
 * Event validation rules
 */
export interface EventValidationRules {
  /** Allowed event name pattern (regex) */
  namePattern?: RegExp;
  /** Maximum parameter count */
  maxParams?: number;
  /** Maximum parameter value length */
  maxValueLength?: number;
  /** Required parameters */
  requiredParams?: string[];
  /** Allowed parameter types */
  allowedTypes?: Set<string>;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Enable rate limiting */
  enabled: boolean;
  /** Maximum events per window */
  maxEventsPerWindow: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Action when limit exceeded: 'drop' or 'queue' */
  onLimitExceeded: 'drop' | 'queue';
}

/**
 * Event metadata
 */
export interface EventMetadata {
  /** Event category */
  category?: string;
  /** Event label */
  label?: string;
  /** Event value */
  value?: number;
  /** Custom dimensions */
  dimensions?: Record<string, string>;
  /** Custom metrics */
  metrics?: Record<string, number>;
}

/**
 * Default validation rules
 */
const DEFAULT_VALIDATION_RULES: EventValidationRules = {
  namePattern: /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/,
  maxParams: 25,
  maxValueLength: 100,
  requiredParams: [],
  allowedTypes: new Set(['string', 'number', 'boolean', 'undefined'])
};

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  enabled: true,
  maxEventsPerWindow: 100,
  windowMs: 60000, // 1 minute
  onLimitExceeded: 'drop'
};

/**
 * Event Tracker
 * Provides event tracking with validation and rate limiting
 */
export class EventTracker {
  private analytics: AnalyticsManager;
  private validationRules: EventValidationRules;
  private rateLimitConfig: RateLimitConfig;
  private eventTimestamps: number[] = [];
  private queuedEvents: Array<{ name: string; params: Record<string, any> }> = [];
  private rateLimitTimer: number | null = null;

  constructor(
    analytics?: AnalyticsManager,
    validationRules?: Partial<EventValidationRules>,
    rateLimitConfig?: Partial<RateLimitConfig>
  ) {
    this.analytics = analytics || AnalyticsManager.getInstance();
    this.validationRules = { ...DEFAULT_VALIDATION_RULES, ...validationRules };
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMIT, ...rateLimitConfig };
  }

  /**
   * Track a custom event
   */
  public track(eventName: string, params?: Record<string, any>): boolean {
    // Validate event
    const validation = this.validateEvent(eventName, params);
    if (!validation.isValid) {
      console.warn(`Event validation failed: ${validation.error}`);
      return false;
    }

    // Check rate limit
    if (!this.checkRateLimit()) {
      if (this.rateLimitConfig.onLimitExceeded === 'queue') {
        this.queueEvent(eventName, params || {});
        return true;
      } else {
        console.warn('Rate limit exceeded, event dropped');
        return false;
      }
    }

    // Add timestamp for rate limiting
    this.recordEventTimestamp();

    // Track event
    this.analytics.track(eventName, params);
    return true;
  }

  /**
   * Track event with metadata
   */
  public trackWithMetadata(
    eventName: string,
    metadata: EventMetadata,
    additionalParams?: Record<string, any>
  ): boolean {
    const params = {
      ...additionalParams,
      event_category: metadata.category,
      event_label: metadata.label,
      event_value: metadata.value,
      ...metadata.dimensions,
      ...metadata.metrics
    };

    return this.track(eventName, params);
  }

  /**
   * Track multiple events in batch
   */
  public trackBatch(events: Array<{ name: string; params?: Record<string, any> }>): number {
    let successCount = 0;

    for (const event of events) {
      if (this.track(event.name, event.params)) {
        successCount++;
      }
    }

    return successCount;
  }

  /**
   * Track timed event (start)
   */
  public startTiming(eventName: string): () => void {
    const startTime = performance.now();

    // Return a function to end timing
    return () => {
      const duration = performance.now() - startTime;
      this.track(`${eventName}_timing`, {
        duration_ms: Math.round(duration),
        timestamp: Date.now()
      });
    };
  }

  /**
   * Track page view
   */
  public trackPageView(pageName: string, additionalParams?: Record<string, any>): boolean {
    return this.track('page_view', {
      page_name: pageName,
      page_url: typeof window !== 'undefined' ? window.location.href : undefined,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
      ...additionalParams
    });
  }

  /**
   * Track screen view (for games/apps)
   */
  public trackScreenView(screenName: string, screenClass?: string): boolean {
    return this.track('screen_view', {
      screen_name: screenName,
      screen_class: screenClass || screenName
    });
  }

  /**
   * Track user action
   */
  public trackAction(
    action: string,
    category: string,
    label?: string,
    value?: number
  ): boolean {
    return this.track('user_action', {
      action,
      category,
      label,
      value
    });
  }

  /**
   * Track error
   */
  public trackError(
    error: Error | string,
    fatal: boolean = false,
    context?: Record<string, any>
  ): boolean {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    return this.track('error', {
      error_message: errorMessage,
      error_stack: errorStack,
      fatal,
      ...context
    });
  }

  /**
   * Track exception
   */
  public trackException(description: string, fatal: boolean = false): boolean {
    return this.track('exception', {
      description,
      fatal
    });
  }

  /**
   * Update validation rules
   */
  public updateValidationRules(rules: Partial<EventValidationRules>): void {
    this.validationRules = { ...this.validationRules, ...rules };
  }

  /**
   * Update rate limit configuration
   */
  public updateRateLimitConfig(config: Partial<RateLimitConfig>): void {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
  }

  /**
   * Get current rate limit status
   */
  public getRateLimitStatus(): {
    eventsInWindow: number;
    limit: number;
    windowMs: number;
    isLimited: boolean;
  } {
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;
    const eventsInWindow = this.eventTimestamps.filter(ts => ts >= windowStart).length;

    return {
      eventsInWindow,
      limit: this.rateLimitConfig.maxEventsPerWindow,
      windowMs: this.rateLimitConfig.windowMs,
      isLimited: eventsInWindow >= this.rateLimitConfig.maxEventsPerWindow
    };
  }

  /**
   * Clear rate limit state
   */
  public clearRateLimitState(): void {
    this.eventTimestamps = [];
    this.queuedEvents = [];
    if (this.rateLimitTimer !== null) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
  }

  /**
   * Validate event
   */
  private validateEvent(
    eventName: string,
    params?: Record<string, any>
  ): { isValid: boolean; error?: string } {
    // Validate event name
    if (!eventName || typeof eventName !== 'string') {
      return { isValid: false, error: 'Event name must be a non-empty string' };
    }

    if (this.validationRules.namePattern && !this.validationRules.namePattern.test(eventName)) {
      return {
        isValid: false,
        error: `Event name "${eventName}" does not match pattern ${this.validationRules.namePattern}`
      };
    }

    // Validate parameters
    if (params) {
      // Check parameter count
      const paramCount = Object.keys(params).length;
      if (this.validationRules.maxParams && paramCount > this.validationRules.maxParams) {
        return {
          isValid: false,
          error: `Too many parameters: ${paramCount} (max: ${this.validationRules.maxParams})`
        };
      }

      // Check required parameters
      if (this.validationRules.requiredParams) {
        for (const requiredParam of this.validationRules.requiredParams) {
          if (!(requiredParam in params)) {
            return {
              isValid: false,
              error: `Missing required parameter: ${requiredParam}`
            };
          }
        }
      }

      // Validate parameter values
      for (const [key, value] of Object.entries(params)) {
        // Check type
        const valueType = typeof value;
        if (this.validationRules.allowedTypes && !this.validationRules.allowedTypes.has(valueType)) {
          return {
            isValid: false,
            error: `Invalid type for parameter "${key}": ${valueType}`
          };
        }

        // Check string length
        if (typeof value === 'string' && this.validationRules.maxValueLength) {
          if (value.length > this.validationRules.maxValueLength) {
            return {
              isValid: false,
              error: `Parameter "${key}" exceeds max length: ${value.length} > ${this.validationRules.maxValueLength}`
            };
          }
        }
      }
    }

    return { isValid: true };
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(): boolean {
    if (!this.rateLimitConfig.enabled) {
      return true;
    }

    // Clean old timestamps
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;
    this.eventTimestamps = this.eventTimestamps.filter(ts => ts >= windowStart);

    // Check limit
    return this.eventTimestamps.length < this.rateLimitConfig.maxEventsPerWindow;
  }

  /**
   * Record event timestamp for rate limiting
   */
  private recordEventTimestamp(): void {
    this.eventTimestamps.push(Date.now());
  }

  /**
   * Queue event for later processing
   */
  private queueEvent(eventName: string, params: Record<string, any>): void {
    this.queuedEvents.push({ name: eventName, params });

    // Set timer to process queue
    if (this.rateLimitTimer === null) {
      this.rateLimitTimer = window.setTimeout(() => {
        this.processQueuedEvents();
      }, this.rateLimitConfig.windowMs);
    }
  }

  /**
   * Process queued events
   */
  private processQueuedEvents(): void {
    this.rateLimitTimer = null;

    if (this.queuedEvents.length === 0) {
      return;
    }

    const eventsToProcess = [...this.queuedEvents];
    this.queuedEvents = [];

    for (const event of eventsToProcess) {
      this.track(event.name, event.params);
    }
  }
}
