/**
 * G3D Console Analytics Provider
 * Logs analytics events to console for debugging
 * @module Analytics/Providers
 */

import { BaseAnalyticsProvider } from './AnalyticsProvider';

/**
 * Console provider configuration
 */
export interface ConsoleProviderConfig {
  /** Enable colored output */
  colors: boolean;
  /** Include timestamps */
  timestamps: boolean;
  /** Filter by event types (empty = all) */
  eventFilter: string[];
  /** Group related events */
  groupEvents: boolean;
  /** Show full parameters */
  showFullParams: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConsoleProviderConfig = {
  colors: true,
  timestamps: true,
  eventFilter: [],
  groupEvents: false,
  showFullParams: true
};

/**
 * Console Analytics Provider
 * Logs analytics events to console for debugging purposes
 */
export class ConsoleProvider extends BaseAnalyticsProvider {
  private config: ConsoleProviderConfig;
  private currentUser: string | null = null;
  private eventCount: number = 0;

  constructor(config?: Partial<ConsoleProviderConfig>) {
    super(true); // Always debug mode for console provider
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize provider
   */
  public async init(): Promise<void> {
    this.log('Initializing Console Analytics Provider');
    this.initialized = true;
    this.logBanner();
  }

  /**
   * Track an event
   */
  public async track(eventName: string, params?: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    if (!this.validateEventName(eventName)) {
      return;
    }

    // Check filter
    if (this.config.eventFilter.length > 0 && !this.config.eventFilter.includes(eventName)) {
      return;
    }

    this.eventCount++;

    const timestamp = new Date().toISOString();
    const sanitized = this.sanitizeParams(params);

    if (this.config.groupEvents) {
      console.group(this.formatEventName(eventName));
      this.logEventDetails(eventName, sanitized, timestamp);
      console.groupEnd();
    } else {
      this.logEvent(eventName, sanitized, timestamp);
    }
  }

  /**
   * Identify a user
   */
  public async identify(userId: string, properties?: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    if (!this.validateUserId(userId)) {
      return;
    }

    this.currentUser = userId;

    const timestamp = new Date().toISOString();
    const sanitized = this.sanitizeParams(properties);

    if (this.config.colors) {
      console.log(
        `%c[IDENTIFY]%c ${userId}`,
        'background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold',
        'color: #4CAF50; font-weight: bold'
      );
    } else {
      console.log(`[IDENTIFY] ${userId}`);
    }

    if (this.config.timestamps) {
      console.log(`  Timestamp: ${timestamp}`);
    }

    if (Object.keys(sanitized).length > 0) {
      console.log('  Properties:', sanitized);
    }

    console.log('');
  }

  /**
   * Flush pending events
   */
  public async flush(): Promise<void> {
    this.log(`Flushed ${this.eventCount} events`);
  }

  /**
   * Dispose provider
   */
  public dispose(): void {
    this.log(`Disposing Console Provider - Total events: ${this.eventCount}`);
    this.initialized = false;
  }

  /**
   * Get event count
   */
  public getEventCount(): number {
    return this.eventCount;
  }

  /**
   * Reset event count
   */
  public resetEventCount(): void {
    this.eventCount = 0;
  }

  /**
   * Log banner
   */
  private logBanner(): void {
    if (this.config.colors) {
      console.log(
        '%c G3D Analytics - Console Provider ',
        'background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; font-size: 14px; font-weight: bold; border-radius: 4px'
      );
    } else {
      console.log('=== G3D Analytics - Console Provider ===');
    }
    console.log('');
  }

  /**
   * Format event name for display
   */
  private formatEventName(eventName: string): string {
    if (this.config.colors) {
      return `%c[EVENT]%c ${eventName}`;
    }
    return `[EVENT] ${eventName}`;
  }

  /**
   * Log event
   */
  private logEvent(eventName: string, params: Record<string, any>, timestamp: string): void {
    if (this.config.colors) {
      console.log(
        `%c[EVENT]%c ${eventName}`,
        'background: #2196F3; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold',
        'color: #2196F3; font-weight: bold'
      );
    } else {
      console.log(`[EVENT] ${eventName}`);
    }

    this.logEventDetails(eventName, params, timestamp);
    console.log('');
  }

  /**
   * Log event details
   */
  private logEventDetails(eventName: string, params: Record<string, any>, timestamp: string): void {
    if (this.config.timestamps) {
      console.log(`  Timestamp: ${timestamp}`);
    }

    if (this.currentUser) {
      console.log(`  User: ${this.currentUser}`);
    }

    if (Object.keys(params).length > 0) {
      if (this.config.showFullParams) {
        console.log('  Parameters:', params);
      } else {
        const keys = Object.keys(params);
        console.log(`  Parameters: ${keys.length} properties (${keys.join(', ')})`);
      }
    }

    console.log(`  Event #${this.eventCount}`);
  }
}
