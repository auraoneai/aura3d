/**
 * G3D Batching Analytics Provider
 * Wraps another provider with batching and compression
 * @module Analytics/Providers
 */

import { BaseAnalyticsProvider, IAnalyticsProvider } from './AnalyticsProvider';

/**
 * Batching configuration
 */
export interface BatchingConfig {
  /** Maximum batch size */
  maxBatchSize: number;
  /** Maximum wait time before flush (ms) */
  maxWaitTime: number;
  /** Enable compression */
  compress: boolean;
  /** Compression threshold (bytes) */
  compressionThreshold: number;
  /** Auto-flush on visibility change */
  flushOnVisibilityChange: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BatchingConfig = {
  maxBatchSize: 50,
  maxWaitTime: 30000, // 30 seconds
  compress: false,
  compressionThreshold: 1024, // 1KB
  flushOnVisibilityChange: true
};

/**
 * Batched event
 */
interface BatchedEvent {
  type: 'track' | 'identify';
  eventName?: string;
  userId?: string;
  params?: Record<string, any>;
  timestamp: number;
}

/**
 * Batching Analytics Provider
 * Wraps another provider with intelligent batching
 */
export class BatchingProvider extends BaseAnalyticsProvider {
  private wrappedProvider: IAnalyticsProvider;
  private config: BatchingConfig;
  private eventQueue: BatchedEvent[] = [];
  private batchTimer: number | null = null;
  private totalEventsSent: number = 0;
  private totalBatchesSent: number = 0;

  constructor(
    provider: IAnalyticsProvider,
    config?: Partial<BatchingConfig>,
    debug: boolean = false
  ) {
    super(debug);
    this.wrappedProvider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.flushOnVisibilityChange) {
      this.setupVisibilityListener();
    }
  }

  /**
   * Initialize provider
   */
  public async init(): Promise<void> {
    this.log('Initializing Batching Analytics Provider');
    await this.wrappedProvider.init();
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

    const event: BatchedEvent = {
      type: 'track',
      eventName,
      params: this.sanitizeParams(params),
      timestamp: Date.now()
    };

    this.addToBatch(event);
  }

  /**
   * Identify a user
   */
  public async identify(userId: string, properties?: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    if (!this.validateUserId(userId)) {
      return;
    }

    const event: BatchedEvent = {
      type: 'identify',
      userId,
      params: this.sanitizeParams(properties),
      timestamp: Date.now()
    };

    this.addToBatch(event);
  }

  /**
   * Flush pending events
   */
  public async flush(): Promise<void> {
    await this.flushBatch();
    await this.wrappedProvider.flush();
  }

  /**
   * Dispose provider
   */
  public dispose(): void {
    this.log('Disposing Batching Analytics Provider');
    this.log(`Total events sent: ${this.totalEventsSent} in ${this.totalBatchesSent} batches`);

    // Flush remaining events
    this.flush().catch(error => {
      this.logError('Failed to flush during dispose', error);
    });

    // Clear timer
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Remove visibility listener
    if (typeof document !== 'undefined' && this.config.flushOnVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.wrappedProvider.dispose();
    this.initialized = false;
  }

  /**
   * Get batch statistics
   */
  public getStats(): {
    queueSize: number;
    totalEventsSent: number;
    totalBatchesSent: number;
    averageBatchSize: number;
  } {
    return {
      queueSize: this.eventQueue.length,
      totalEventsSent: this.totalEventsSent,
      totalBatchesSent: this.totalBatchesSent,
      averageBatchSize: this.totalBatchesSent > 0
        ? this.totalEventsSent / this.totalBatchesSent
        : 0
    };
  }

  /**
   * Get wrapped provider
   */
  public getWrappedProvider(): IAnalyticsProvider {
    return this.wrappedProvider;
  }

  /**
   * Add event to batch
   */
  private addToBatch(event: BatchedEvent): void {
    this.eventQueue.push(event);

    this.log(`Added event to batch (${this.eventQueue.length}/${this.config.maxBatchSize})`);

    // Check if batch is full
    if (this.eventQueue.length >= this.config.maxBatchSize) {
      this.flushBatch();
      return;
    }

    // Start timer if not already running
    if (this.batchTimer === null) {
      this.batchTimer = window.setTimeout(() => {
        this.flushBatch();
      }, this.config.maxWaitTime);
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

    // Compress if enabled
    let processedEvents = events;
    if (this.config.compress) {
      processedEvents = await this.compressEvents(events);
    }

    // Send events to wrapped provider
    for (const event of processedEvents) {
      try {
        if (event.type === 'track' && event.eventName) {
          await this.wrappedProvider.track(event.eventName, event.params);
        } else if (event.type === 'identify' && event.userId) {
          await this.wrappedProvider.identify(event.userId, event.params);
        }
      } catch (error) {
        this.logError('Failed to send event', error);
      }
    }

    // Update statistics
    this.totalEventsSent += events.length;
    this.totalBatchesSent++;

    this.log(`Batch sent successfully. Total: ${this.totalEventsSent} events in ${this.totalBatchesSent} batches`);
  }

  /**
   * Compress events (merge similar events)
   */
  private async compressEvents(events: BatchedEvent[]): Promise<BatchedEvent[]> {
    const serialized = JSON.stringify(events);
    const sizeBytes = new Blob([serialized]).size;

    // Only compress if above threshold
    if (sizeBytes < this.config.compressionThreshold) {
      return events;
    }

    this.log(`Compressing batch (${sizeBytes} bytes)`);

    // Group events by type and name
    const groups = new Map<string, BatchedEvent[]>();

    for (const event of events) {
      const key = `${event.type}_${event.eventName || event.userId || 'unknown'}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    // Merge events in each group
    const compressed: BatchedEvent[] = [];

    for (const [key, groupEvents] of groups.entries()) {
      if (groupEvents.length === 1) {
        compressed.push(groupEvents[0]);
        continue;
      }

      // Check if events can be merged (same params)
      const canMerge = this.canMergeEvents(groupEvents);

      if (canMerge) {
        // Create merged event with count
        const merged = {
          ...groupEvents[0],
          params: {
            ...groupEvents[0].params,
            _count: groupEvents.length,
            _timestamps: groupEvents.map(e => e.timestamp)
          }
        };
        compressed.push(merged);
      } else {
        // Cannot merge, add all events
        compressed.push(...groupEvents);
      }
    }

    const compressedSize = new Blob([JSON.stringify(compressed)]).size;
    const savings = ((1 - compressedSize / sizeBytes) * 100).toFixed(1);

    this.log(`Compressed ${events.length} events to ${compressed.length} (${savings}% reduction)`);

    return compressed;
  }

  /**
   * Check if events can be merged
   */
  private canMergeEvents(events: BatchedEvent[]): boolean {
    if (events.length === 0) {
      return false;
    }

    const first = events[0];

    // Check if all events have identical parameters
    for (let i = 1; i < events.length; i++) {
      if (!this.areParamsEqual(first.params, events[i].params)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two parameter objects are equal
   */
  private areParamsEqual(
    params1?: Record<string, any>,
    params2?: Record<string, any>
  ): boolean {
    const str1 = JSON.stringify(params1 || {});
    const str2 = JSON.stringify(params2 || {});
    return str1 === str2;
  }

  /**
   * Setup visibility change listener
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      // Page is hidden, flush batch
      this.log('Page hidden, flushing batch');
      this.flushBatch().catch(error => {
        this.logError('Failed to flush on visibility change', error);
      });
    }
  };
}
