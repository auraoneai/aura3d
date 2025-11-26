/**
 * G3D Analytics Manager
 * Coordinates analytics providers, event routing, and batching
 * @module Analytics
 */

import { IAnalyticsProvider } from './providers/AnalyticsProvider';
import { ConsentManager } from './privacy/ConsentManager';

/**
 * Analytics event structure
 */
export interface AnalyticsEvent {
  /** Event name */
  name: string;
  /** Event parameters */
  params?: Record<string, any>;
  /** Event timestamp */
  timestamp: number;
  /** User ID associated with event */
  userId?: string;
  /** Session ID */
  sessionId?: string;
}

/**
 * Batching configuration
 */
export interface BatchingConfig {
  /** Enable batching */
  enabled: boolean;
  /** Maximum batch size before automatic flush */
  maxBatchSize: number;
  /** Maximum time (ms) to wait before flushing */
  maxWaitTime: number;
  /** Maximum retry attempts for failed batches */
  maxRetries: number;
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** Enable analytics */
  enabled: boolean;
  /** Debug mode (verbose logging) */
  debug: boolean;
  /** Batching configuration */
  batching: BatchingConfig;
  /** Enable offline queue */
  offlineQueue: boolean;
  /** Maximum offline queue size */
  maxOfflineEvents: number;
  /** Require consent before tracking */
  requireConsent: boolean;
}

/**
 * Default analytics configuration
 */
const DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: true,
  debug: false,
  batching: {
    enabled: true,
    maxBatchSize: 50,
    maxWaitTime: 30000, // 30 seconds
    maxRetries: 3
  },
  offlineQueue: true,
  maxOfflineEvents: 1000,
  requireConsent: true
};

/**
 * Analytics Manager
 * Central hub for analytics tracking and provider management
 */
export class AnalyticsManager {
  private static instance: AnalyticsManager;
  private providers: Map<string, IAnalyticsProvider> = new Map();
  private config: AnalyticsConfig;
  private consentManager: ConsentManager;
  private eventQueue: AnalyticsEvent[] = [];
  private offlineQueue: AnalyticsEvent[] = [];
  private batchTimeout: number | null = null;
  private isOnline: boolean = true;
  private initialized: boolean = false;

  private constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.consentManager = ConsentManager.getInstance();
    this.setupOnlineListener();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<AnalyticsConfig>): AnalyticsManager {
    if (!AnalyticsManager.instance) {
      AnalyticsManager.instance = new AnalyticsManager(config);
    }
    return AnalyticsManager.instance;
  }

  /**
   * Initialize analytics manager
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.log('Analytics already initialized');
      return;
    }

    this.log('Initializing Analytics Manager');

    // Initialize all providers
    const initPromises = Array.from(this.providers.values()).map(provider =>
      provider.init().catch(error => {
        console.error('Failed to initialize provider:', error);
      })
    );

    await Promise.all(initPromises);

    // Process offline queue if online
    if (this.isOnline && this.offlineQueue.length > 0) {
      this.processOfflineQueue();
    }

    this.initialized = true;
    this.log('Analytics Manager initialized');
  }

  /**
   * Register an analytics provider
   */
  public registerProvider(name: string, provider: IAnalyticsProvider): void {
    if (this.providers.has(name)) {
      console.warn(`Provider "${name}" already registered, replacing`);
    }

    this.providers.set(name, provider);
    this.log(`Registered provider: ${name}`);

    // Initialize immediately if manager is already initialized
    if (this.initialized) {
      provider.init().catch(error => {
        console.error(`Failed to initialize provider "${name}":`, error);
      });
    }
  }

  /**
   * Unregister an analytics provider
   */
  public unregisterProvider(name: string): void {
    const provider = this.providers.get(name);
    if (provider) {
      provider.dispose();
      this.providers.delete(name);
      this.log(`Unregistered provider: ${name}`);
    }
  }

  /**
   * Get a registered provider
   */
  public getProvider(name: string): IAnalyticsProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Track an analytics event
   */
  public track(eventName: string, params?: Record<string, any>): void {
    if (!this.config.enabled) {
      return;
    }

    // Check consent
    if (this.config.requireConsent && !this.consentManager.hasConsent('analytics')) {
      this.log(`Event "${eventName}" blocked: no consent`);
      return;
    }

    const event: AnalyticsEvent = {
      name: eventName,
      params: params || {},
      timestamp: Date.now()
    };

    this.log(`Tracking event: ${eventName}`, params);

    // Handle offline mode
    if (!this.isOnline && this.config.offlineQueue) {
      this.addToOfflineQueue(event);
      return;
    }

    // Add to batch queue
    if (this.config.batching.enabled) {
      this.addToBatch(event);
    } else {
      this.sendEvent(event);
    }
  }

  /**
   * Identify a user
   */
  public identify(userId: string, properties?: Record<string, any>): void {
    if (!this.config.enabled) {
      return;
    }

    if (this.config.requireConsent && !this.consentManager.hasConsent('analytics')) {
      this.log(`Identify blocked: no consent`);
      return;
    }

    this.log(`Identifying user: ${userId}`, properties);

    this.providers.forEach(provider => {
      provider.identify(userId, properties).catch(error => {
        console.error('Failed to identify user:', error);
      });
    });
  }

  /**
   * Flush all pending events immediately
   */
  public async flush(): Promise<void> {
    this.log('Flushing analytics');

    // Flush batch queue
    if (this.eventQueue.length > 0) {
      await this.flushBatch();
    }

    // Flush all providers
    const flushPromises = Array.from(this.providers.values()).map(provider =>
      provider.flush().catch(error => {
        console.error('Failed to flush provider:', error);
      })
    );

    await Promise.all(flushPromises);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AnalyticsConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('Configuration updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<AnalyticsConfig> {
    return { ...this.config };
  }

  /**
   * Clear all queued events
   */
  public clearQueue(): void {
    this.eventQueue = [];
    this.offlineQueue = [];
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.log('Event queues cleared');
  }

  /**
   * Dispose analytics manager
   */
  public dispose(): void {
    this.log('Disposing Analytics Manager');

    // Flush pending events
    this.flush().catch(error => {
      console.error('Failed to flush during dispose:', error);
    });

    // Dispose all providers
    this.providers.forEach(provider => provider.dispose());
    this.providers.clear();

    // Clear queues
    this.clearQueue();

    // Remove online listener
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    this.initialized = false;
  }

  /**
   * Add event to batch queue
   */
  private addToBatch(event: AnalyticsEvent): void {
    this.eventQueue.push(event);

    // Check if batch is full
    if (this.eventQueue.length >= this.config.batching.maxBatchSize) {
      this.flushBatch();
      return;
    }

    // Set timeout for automatic flush
    if (this.batchTimeout === null) {
      this.batchTimeout = window.setTimeout(() => {
        this.flushBatch();
      }, this.config.batching.maxWaitTime);
    }
  }

  /**
   * Flush batch queue
   */
  private async flushBatch(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    // Clear timeout
    if (this.batchTimeout !== null) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Get events to send
    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    this.log(`Flushing batch: ${eventsToSend.length} events`);

    // Send to all providers
    for (const event of eventsToSend) {
      await this.sendEvent(event);
    }
  }

  /**
   * Send event to all providers
   */
  private async sendEvent(event: AnalyticsEvent): Promise<void> {
    const promises = Array.from(this.providers.values()).map(provider =>
      provider.track(event.name, event.params).catch(error => {
        console.error('Provider track error:', error);
      })
    );

    await Promise.all(promises);
  }

  /**
   * Add event to offline queue
   */
  private addToOfflineQueue(event: AnalyticsEvent): void {
    if (this.offlineQueue.length >= this.config.maxOfflineEvents) {
      // Remove oldest event
      this.offlineQueue.shift();
    }

    this.offlineQueue.push(event);
    this.log(`Added to offline queue (${this.offlineQueue.length} events)`);
  }

  /**
   * Process offline queue when back online
   */
  private async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) {
      return;
    }

    this.log(`Processing offline queue: ${this.offlineQueue.length} events`);

    const eventsToProcess = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const event of eventsToProcess) {
      if (this.config.batching.enabled) {
        this.addToBatch(event);
      } else {
        await this.sendEvent(event);
      }
    }
  }

  /**
   * Setup online/offline listeners
   */
  private setupOnlineListener(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.isOnline = navigator.onLine;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  /**
   * Handle online event
   */
  private handleOnline = (): void => {
    this.isOnline = true;
    this.log('Connection restored');
    this.processOfflineQueue();
  };

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    this.isOnline = false;
    this.log('Connection lost');
  };

  /**
   * Log debug message
   */
  private log(message: string, data?: any): void {
    if (this.config.debug) {
      if (data) {
        console.log(`[Analytics] ${message}`, data);
      } else {
        console.log(`[Analytics] ${message}`);
      }
    }
  }
}
