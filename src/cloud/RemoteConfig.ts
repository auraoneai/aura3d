/**
 * G3D Remote Config
 * Remote configuration with A/B testing support
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Config value type
 */
export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Config value
 */
export interface ConfigValue {
  /** Value type */
  type: ConfigValueType;
  /** Value data */
  value: any;
  /** Default value */
  defaultValue?: any;
}

/**
 * Config parameter
 */
export interface ConfigParameter {
  /** Parameter key */
  key: string;
  /** Parameter value */
  value: ConfigValue;
  /** A/B test group (if any) */
  abTestGroup?: string;
  /** Last updated */
  lastUpdated: number;
}

/**
 * Remote config state
 */
export interface RemoteConfigState {
  /** All parameters */
  parameters: Map<string, ConfigParameter>;
  /** Last fetch time */
  lastFetch: number;
  /** Is activated */
  activated: boolean;
}

/**
 * Fetch configuration
 */
export interface FetchConfig {
  /** Cache expiration (ms) */
  cacheExpiration: number;
  /** Minimum fetch interval (ms) */
  minimumFetchInterval: number;
}

/**
 * Default fetch configuration
 */
const DEFAULT_FETCH_CONFIG: FetchConfig = {
  cacheExpiration: 43200000, // 12 hours
  minimumFetchInterval: 60000 // 1 minute
};

/**
 * Remote Config Service
 * Manages remote configuration and A/B testing
 */
export class RemoteConfig {
  private cloudManager: CloudManager;
  private state: RemoteConfigState = {
    parameters: new Map(),
    lastFetch: 0,
    activated: false
  };
  private defaultValues: Map<string, any> = new Map();
  private fetchConfig: FetchConfig;
  private readonly STORAGE_KEY = 'g3d_remote_config';

  constructor(cloudManager: CloudManager, fetchConfig?: Partial<FetchConfig>) {
    this.cloudManager = cloudManager;
    this.fetchConfig = { ...DEFAULT_FETCH_CONFIG, ...fetchConfig };
    this.loadFromStorage();
  }

  /**
   * Set default values
   */
  public setDefaults(defaults: Record<string, any>): void {
    for (const [key, value] of Object.entries(defaults)) {
      this.defaultValues.set(key, value);
    }

    console.log(`[RemoteConfig] Set ${Object.keys(defaults).length} default values`);
  }

  /**
   * Fetch remote configuration
   */
  public async fetchConfig(): Promise<void> {
    // Check minimum fetch interval
    const timeSinceLastFetch = Date.now() - this.state.lastFetch;
    if (timeSinceLastFetch < this.fetchConfig.minimumFetchInterval) {
      console.log('[RemoteConfig] Skipping fetch (too soon)');
      return;
    }

    if (!this.cloudManager.isConnected()) {
      console.warn('[RemoteConfig] Cannot fetch while offline, using cached values');
      return;
    }

    try {
      const response = await this.cloudManager.requestWithRetry<{
        parameters: Array<{ key: string; value: any; type: ConfigValueType; abTestGroup?: string }>;
        timestamp: number;
      }>('/config', { method: 'GET' });

      // Update parameters
      for (const param of response.parameters) {
        this.state.parameters.set(param.key, {
          key: param.key,
          value: {
            type: param.type,
            value: param.value
          },
          abTestGroup: param.abTestGroup,
          lastUpdated: response.timestamp
        });
      }

      this.state.lastFetch = Date.now();
      this.saveToStorage();

      console.log(`[RemoteConfig] Fetched ${response.parameters.length} parameters`);
    } catch (error: any) {
      console.error('[RemoteConfig] Fetch failed:', error);
      throw new CloudError(
        error.message || 'Failed to fetch config',
        'CONFIG_FETCH_FAILED'
      );
    }
  }

  /**
   * Activate fetched configuration
   */
  public activate(): boolean {
    if (this.state.parameters.size === 0) {
      console.warn('[RemoteConfig] No parameters to activate');
      return false;
    }

    this.state.activated = true;
    this.saveToStorage();

    console.log('[RemoteConfig] Configuration activated');
    return true;
  }

  /**
   * Fetch and activate
   */
  public async fetchAndActivate(): Promise<boolean> {
    await this.fetchConfig();
    return this.activate();
  }

  /**
   * Get string value
   */
  public getString(key: string, defaultValue?: string): string {
    const value = this.getValue(key);

    if (value !== undefined) {
      return String(value);
    }

    return defaultValue ?? this.getDefault(key, '');
  }

  /**
   * Get number value
   */
  public getNumber(key: string, defaultValue?: number): number {
    const value = this.getValue(key);

    if (value !== undefined) {
      const num = Number(value);
      return isNaN(num) ? (defaultValue ?? this.getDefault(key, 0)) : num;
    }

    return defaultValue ?? this.getDefault(key, 0);
  }

  /**
   * Get boolean value
   */
  public getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.getValue(key);

    if (value !== undefined) {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
      }
      return Boolean(value);
    }

    return defaultValue ?? this.getDefault(key, false);
  }

  /**
   * Get JSON value
   */
  public getJSON<T = any>(key: string, defaultValue?: T): T {
    const value = this.getValue(key);

    if (value !== undefined) {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as T;
        } catch (error) {
          console.warn(`[RemoteConfig] Failed to parse JSON for key "${key}"`);
        }
      }
      return value as T;
    }

    return defaultValue ?? this.getDefault(key, {} as T);
  }

  /**
   * Get all parameters
   */
  public getAll(): Record<string, any> {
    const all: Record<string, any> = {};

    // Add defaults
    for (const [key, value] of this.defaultValues.entries()) {
      all[key] = value;
    }

    // Override with remote values
    if (this.state.activated) {
      for (const [key, param] of this.state.parameters.entries()) {
        all[key] = param.value.value;
      }
    }

    return all;
  }

  /**
   * Get parameter info
   */
  public getParameterInfo(key: string): ConfigParameter | undefined {
    return this.state.parameters.get(key);
  }

  /**
   * Check if config is activated
   */
  public isActivated(): boolean {
    return this.state.activated;
  }

  /**
   * Check if cache is expired
   */
  public isCacheExpired(): boolean {
    const age = Date.now() - this.state.lastFetch;
    return age > this.fetchConfig.cacheExpiration;
  }

  /**
   * Get last fetch time
   */
  public getLastFetchTime(): number {
    return this.state.lastFetch;
  }

  /**
   * Reset config to defaults
   */
  public reset(): void {
    this.state = {
      parameters: new Map(),
      lastFetch: 0,
      activated: false
    };

    this.clearStorage();
    console.log('[RemoteConfig] Reset to defaults');
  }

  /**
   * Get A/B test group for parameter
   */
  public getABTestGroup(key: string): string | undefined {
    return this.state.parameters.get(key)?.abTestGroup;
  }

  /**
   * Get value (internal)
   */
  private getValue(key: string): any {
    if (!this.state.activated) {
      return undefined;
    }

    const param = this.state.parameters.get(key);
    return param?.value.value;
  }

  /**
   * Get default value
   */
  private getDefault<T>(key: string, fallback: T): T {
    const defaultValue = this.defaultValues.get(key);
    return defaultValue !== undefined ? defaultValue : fallback;
  }

  /**
   * Save to storage
   */
  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = {
        parameters: Array.from(this.state.parameters.entries()),
        lastFetch: this.state.lastFetch,
        activated: this.state.activated
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('[RemoteConfig] Failed to save to storage:', error);
    }
  }

  /**
   * Load from storage
   */
  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.state = {
          parameters: new Map(parsed.parameters),
          lastFetch: parsed.lastFetch,
          activated: parsed.activated
        };

        console.log(`[RemoteConfig] Loaded ${this.state.parameters.size} cached parameters`);
      }
    } catch (error) {
      console.warn('[RemoteConfig] Failed to load from storage:', error);
    }
  }

  /**
   * Clear storage
   */
  private clearStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('[RemoteConfig] Failed to clear storage:', error);
    }
  }
}
