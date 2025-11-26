/**
 * G3D Cloud Manager
 * Central coordinator for cloud services
 * @module Cloud
 */

import { Authentication } from './Authentication';
import { CloudSave } from './CloudSave';
import { Leaderboards } from './Leaderboards';
import { Achievements } from './Achievements';
import { RemoteConfig } from './RemoteConfig';
import { Matchmaking } from './Matchmaking';
import { ContentDelivery } from './ContentDelivery';

/**
 * Cloud service status
 */
export type ServiceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Cloud configuration
 */
export interface CloudConfig {
  /** API endpoint */
  apiEndpoint: string;
  /** API key */
  apiKey: string;
  /** App ID */
  appId: string;
  /** Enable offline mode */
  offlineMode: boolean;
  /** Auto-connect on init */
  autoConnect: boolean;
  /** Connection timeout (ms) */
  connectionTimeout: number;
  /** Retry configuration */
  retry: {
    enabled: boolean;
    maxAttempts: number;
    initialDelay: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<CloudConfig> = {
  offlineMode: true,
  autoConnect: true,
  connectionTimeout: 10000,
  retry: {
    enabled: true,
    maxAttempts: 3,
    initialDelay: 1000
  }
};

/**
 * Cloud error
 */
export class CloudError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

/**
 * Cloud Manager
 * Coordinates all cloud services
 */
export class CloudManager {
  private static instance: CloudManager;
  private config: CloudConfig;
  private status: ServiceStatus = 'disconnected';
  private isOnline: boolean = true;

  // Services
  public readonly auth: Authentication;
  public readonly cloudSave: CloudSave;
  public readonly leaderboards: Leaderboards;
  public readonly achievements: Achievements;
  public readonly remoteConfig: RemoteConfig;
  public readonly matchmaking: Matchmaking;
  public readonly cdn: ContentDelivery;

  private constructor(config: CloudConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as CloudConfig;

    // Initialize services
    this.auth = new Authentication(this);
    this.cloudSave = new CloudSave(this);
    this.leaderboards = new Leaderboards(this);
    this.achievements = new Achievements(this);
    this.remoteConfig = new RemoteConfig(this);
    this.matchmaking = new Matchmaking(this);
    this.cdn = new ContentDelivery(this);

    // Setup online/offline detection
    this.setupOnlineDetection();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: CloudConfig): CloudManager {
    if (!CloudManager.instance && config) {
      CloudManager.instance = new CloudManager(config);
    }
    if (!CloudManager.instance) {
      throw new Error('CloudManager not initialized. Call getInstance with config first.');
    }
    return CloudManager.instance;
  }

  /**
   * Initialize cloud services
   */
  public async initialize(): Promise<void> {
    console.log('[CloudManager] Initializing cloud services...');

    if (this.config.autoConnect) {
      await this.connect();
    }

    // Initialize remote config first
    await this.remoteConfig.fetchConfig();

    console.log('[CloudManager] Cloud services initialized');
  }

  /**
   * Connect to cloud services
   */
  public async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.status = 'connecting';
    console.log('[CloudManager] Connecting to cloud services...');

    try {
      // Test connection
      await this.testConnection();

      this.status = 'connected';
      console.log('[CloudManager] Connected to cloud services');
    } catch (error) {
      this.status = 'error';
      console.error('[CloudManager] Failed to connect:', error);

      if (!this.config.offlineMode) {
        throw new CloudError(
          'Failed to connect to cloud services',
          'CONNECTION_FAILED'
        );
      }
    }
  }

  /**
   * Disconnect from cloud services
   */
  public disconnect(): void {
    console.log('[CloudManager] Disconnecting from cloud services...');
    this.status = 'disconnected';
  }

  /**
   * Get connection status
   */
  public getStatus(): ServiceStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Check if offline mode is active
   */
  public isOfflineMode(): boolean {
    return !this.isOnline || this.status !== 'connected';
  }

  /**
   * Make API request
   */
  public async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.isOnline && !this.config.offlineMode) {
      throw new CloudError('No internet connection', 'OFFLINE');
    }

    const url = `${this.config.apiEndpoint}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      'X-App-ID': this.config.appId,
      ...options.headers
    };

    // Add auth token if available
    const token = this.auth.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.connectionTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new CloudError(
          error.message || `HTTP ${response.status}`,
          error.code || 'REQUEST_FAILED',
          response.status
        );
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeout);

      if (error.name === 'AbortError') {
        throw new CloudError('Request timeout', 'TIMEOUT');
      }

      if (error instanceof CloudError) {
        throw error;
      }

      throw new CloudError(
        error.message || 'Request failed',
        'REQUEST_FAILED'
      );
    }
  }

  /**
   * Make API request with retry
   */
  public async requestWithRetry<T = any>(
    endpoint: string,
    options: RequestInit = {},
    attempt: number = 1
  ): Promise<T> {
    try {
      return await this.request<T>(endpoint, options);
    } catch (error: any) {
      if (
        this.config.retry.enabled &&
        attempt < this.config.retry.maxAttempts &&
        this.isRetryableError(error)
      ) {
        const delay = this.config.retry.initialDelay * Math.pow(2, attempt - 1);
        console.log(`[CloudManager] Retrying request (${attempt}/${this.config.retry.maxAttempts}) in ${delay}ms...`);

        await this.sleep(delay);
        return this.requestWithRetry<T>(endpoint, options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): Readonly<CloudConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<CloudConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Test connection to cloud services
   */
  private async testConnection(): Promise<void> {
    await this.request('/health', { method: 'GET' });
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: CloudError): boolean {
    const retryableCodes = ['TIMEOUT', 'NETWORK_ERROR', 'SERVER_ERROR'];
    const retryableStatus = [408, 429, 500, 502, 503, 504];

    return (
      retryableCodes.includes(error.code) ||
      (error.statusCode !== undefined && retryableStatus.includes(error.statusCode))
    );
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup online/offline detection
   */
  private setupOnlineDetection(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.isOnline = navigator.onLine;

    window.addEventListener('online', () => {
      console.log('[CloudManager] Connection restored');
      this.isOnline = true;
      this.connect();
    });

    window.addEventListener('offline', () => {
      console.log('[CloudManager] Connection lost');
      this.isOnline = false;
      this.status = 'disconnected';
    });
  }

  /**
   * Dispose cloud manager
   */
  public dispose(): void {
    console.log('[CloudManager] Disposing cloud services...');
    this.disconnect();
    this.auth.dispose();
    this.cloudSave.dispose();
    this.matchmaking.dispose();
  }
}
