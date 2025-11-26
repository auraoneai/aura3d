/**
 * G3D Custom Analytics Provider
 * Sends analytics data to custom HTTP endpoints
 * @module Analytics/Providers
 */

import { BaseAnalyticsProvider } from './AnalyticsProvider';

/**
 * HTTP request method
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Enable retry */
  enabled: boolean;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay (ms) */
  initialDelay: number;
  /** Maximum delay (ms) */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Custom provider configuration
 */
export interface CustomProviderConfig {
  /** Endpoint URL */
  endpoint: string;
  /** HTTP method */
  method: HttpMethod;
  /** Custom headers */
  headers: Record<string, string>;
  /** Batch events */
  batch: boolean;
  /** Batch size */
  batchSize: number;
  /** Batch timeout (ms) */
  batchTimeout: number;
  /** Retry configuration */
  retry: RetryConfig;
  /** Include credentials */
  credentials: boolean;
  /** Custom payload transformer */
  transformPayload?: (eventName: string, params?: Record<string, any>) => any;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Omit<CustomProviderConfig, 'endpoint'> = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  batch: true,
  batchSize: 50,
  batchTimeout: 30000,
  retry: {
    enabled: true,
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  },
  credentials: false
};

/**
 * Event payload
 */
interface EventPayload {
  event: string;
  params?: Record<string, any>;
  timestamp: number;
  userId?: string;
}

/**
 * Custom Analytics Provider
 * Sends analytics events to custom HTTP endpoints with retry logic
 */
export class CustomProvider extends BaseAnalyticsProvider {
  private config: CustomProviderConfig;
  private eventQueue: EventPayload[] = [];
  private batchTimer: number | null = null;
  private currentUserId?: string;

  constructor(endpoint: string, config?: Partial<Omit<CustomProviderConfig, 'endpoint'>>) {
    super(config?.retry?.enabled ?? true);
    this.config = { ...DEFAULT_CONFIG, ...config, endpoint };
  }

  /**
   * Initialize provider
   */
  public async init(): Promise<void> {
    this.log('Initializing Custom Analytics Provider');
    this.log(`Endpoint: ${this.config.endpoint}`);

    // Validate endpoint
    try {
      new URL(this.config.endpoint);
    } catch (error) {
      throw new Error(`Invalid endpoint URL: ${this.config.endpoint}`);
    }

    this.initialized = true;
  }

  /**
   * Track an event
   */
  public async track(eventName: string, params?: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    if (!this.validateEventName(eventName)) {
      return;
    }

    const payload: EventPayload = {
      event: eventName,
      params: this.sanitizeParams(params),
      timestamp: Date.now(),
      userId: this.currentUserId
    };

    if (this.config.batch) {
      this.addToBatch(payload);
    } else {
      await this.sendEvent(payload);
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

    this.currentUserId = userId;

    const payload: EventPayload = {
      event: 'identify',
      params: {
        userId,
        ...this.sanitizeParams(properties)
      },
      timestamp: Date.now()
    };

    await this.sendEvent(payload);
  }

  /**
   * Flush pending events
   */
  public async flush(): Promise<void> {
    if (this.eventQueue.length > 0) {
      await this.flushBatch();
    }
  }

  /**
   * Dispose provider
   */
  public dispose(): void {
    this.log('Disposing Custom Analytics Provider');

    // Flush remaining events
    if (this.eventQueue.length > 0) {
      this.flush().catch(error => {
        this.logError('Failed to flush events during dispose', error);
      });
    }

    // Clear batch timer
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.initialized = false;
  }

  /**
   * Update endpoint
   */
  public setEndpoint(endpoint: string): void {
    try {
      new URL(endpoint);
      this.config.endpoint = endpoint;
      this.log(`Updated endpoint: ${endpoint}`);
    } catch (error) {
      throw new Error(`Invalid endpoint URL: ${endpoint}`);
    }
  }

  /**
   * Update headers
   */
  public setHeaders(headers: Record<string, string>): void {
    this.config.headers = { ...this.config.headers, ...headers };
  }

  /**
   * Add event to batch
   */
  private addToBatch(payload: EventPayload): void {
    this.eventQueue.push(payload);

    // Check if batch is full
    if (this.eventQueue.length >= this.config.batchSize) {
      this.flushBatch();
      return;
    }

    // Start batch timer if not already running
    if (this.batchTimer === null) {
      this.batchTimer = window.setTimeout(() => {
        this.flushBatch();
      }, this.config.batchTimeout);
    }
  }

  /**
   * Flush batch
   */
  private async flushBatch(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    // Clear timer
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get events to send
    const events = [...this.eventQueue];
    this.eventQueue = [];

    this.log(`Flushing batch: ${events.length} events`);

    // Send batch
    await this.sendBatch(events);
  }

  /**
   * Send single event
   */
  private async sendEvent(payload: EventPayload): Promise<void> {
    const body = this.config.transformPayload
      ? this.config.transformPayload(payload.event, payload.params)
      : payload;

    await this.sendRequest([body]);
  }

  /**
   * Send batch of events
   */
  private async sendBatch(events: EventPayload[]): Promise<void> {
    const body = this.config.transformPayload
      ? events.map(e => this.config.transformPayload!(e.event, e.params))
      : events;

    await this.sendRequest(body);
  }

  /**
   * Send HTTP request with retry
   */
  private async sendRequest(body: any, attempt: number = 1): Promise<void> {
    try {
      const response = await fetch(this.config.endpoint, {
        method: this.config.method,
        headers: this.config.headers,
        body: JSON.stringify(body),
        credentials: this.config.credentials ? 'include' : 'omit'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.log(`Successfully sent ${Array.isArray(body) ? body.length : 1} events`);
    } catch (error) {
      this.logError(`Failed to send events (attempt ${attempt})`, error);

      // Retry if enabled
      if (this.config.retry.enabled && attempt < this.config.retry.maxAttempts) {
        const delay = this.calculateRetryDelay(attempt);
        this.log(`Retrying in ${delay}ms...`);

        await this.sleep(delay);
        await this.sendRequest(body, attempt + 1);
      } else {
        throw error;
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.config.retry.initialDelay * Math.pow(this.config.retry.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.retry.maxDelay);
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
