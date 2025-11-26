/**
 * G3D Analytics Provider Interface
 * Base interface for analytics providers
 * @module Analytics/Providers
 */

/**
 * Analytics provider interface
 * All analytics providers must implement this interface
 */
export interface IAnalyticsProvider {
  /**
   * Initialize the provider
   */
  init(): Promise<void>;

  /**
   * Track an event
   * @param eventName - Event name
   * @param params - Event parameters
   */
  track(eventName: string, params?: Record<string, any>): Promise<void>;

  /**
   * Identify a user
   * @param userId - User ID
   * @param properties - User properties
   */
  identify(userId: string, properties?: Record<string, any>): Promise<void>;

  /**
   * Flush any pending events
   */
  flush(): Promise<void>;

  /**
   * Dispose and cleanup the provider
   */
  dispose(): void;
}

/**
 * Base analytics provider
 * Provides common functionality for analytics providers
 */
export abstract class BaseAnalyticsProvider implements IAnalyticsProvider {
  protected initialized: boolean = false;
  protected debug: boolean = false;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  /**
   * Initialize the provider
   */
  public abstract init(): Promise<void>;

  /**
   * Track an event
   */
  public abstract track(eventName: string, params?: Record<string, any>): Promise<void>;

  /**
   * Identify a user
   */
  public abstract identify(userId: string, properties?: Record<string, any>): Promise<void>;

  /**
   * Flush pending events
   */
  public abstract flush(): Promise<void>;

  /**
   * Dispose provider
   */
  public abstract dispose(): void;

  /**
   * Check if provider is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Log debug message
   */
  protected log(message: string, data?: any): void {
    if (this.debug) {
      if (data) {
        console.log(`[${this.constructor.name}] ${message}`, data);
      } else {
        console.log(`[${this.constructor.name}] ${message}`);
      }
    }
  }

  /**
   * Log error
   */
  protected logError(message: string, error?: any): void {
    if (error) {
      console.error(`[${this.constructor.name}] ${message}`, error);
    } else {
      console.error(`[${this.constructor.name}] ${message}`);
    }
  }

  /**
   * Ensure provider is initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.constructor.name} is not initialized`);
    }
  }

  /**
   * Sanitize event parameters
   */
  protected sanitizeParams(params?: Record<string, any>): Record<string, any> {
    if (!params) {
      return {};
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      // Skip undefined and null values
      if (value === undefined || value === null) {
        continue;
      }

      // Handle different types
      if (typeof value === 'object' && !Array.isArray(value)) {
        // Nested object - flatten or stringify
        sanitized[key] = JSON.stringify(value);
      } else if (Array.isArray(value)) {
        // Array - stringify
        sanitized[key] = JSON.stringify(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate event name
   */
  protected validateEventName(eventName: string): boolean {
    if (!eventName || typeof eventName !== 'string') {
      this.logError('Invalid event name');
      return false;
    }

    if (eventName.length === 0) {
      this.logError('Event name cannot be empty');
      return false;
    }

    return true;
  }

  /**
   * Validate user ID
   */
  protected validateUserId(userId: string): boolean {
    if (!userId || typeof userId !== 'string') {
      this.logError('Invalid user ID');
      return false;
    }

    if (userId.length === 0) {
      this.logError('User ID cannot be empty');
      return false;
    }

    return true;
  }
}
