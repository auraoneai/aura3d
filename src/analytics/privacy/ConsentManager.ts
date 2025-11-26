/**
 * G3D Consent Manager
 * GDPR-compliant consent management
 * @module Analytics/Privacy
 */

/**
 * Consent category
 */
export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences' | 'custom';

/**
 * Consent status
 */
export interface ConsentStatus {
  /** Category name */
  category: ConsentCategory | string;
  /** Consent granted */
  granted: boolean;
  /** Timestamp when consent was given/revoked */
  timestamp: number;
  /** Consent version */
  version?: string;
}

/**
 * Consent configuration
 */
export interface ConsentConfig {
  /** Default consent for categories */
  defaultConsent: Record<string, boolean>;
  /** Storage key for consent data */
  storageKey: string;
  /** Consent expiration (ms) */
  expirationTime: number;
  /** Require explicit consent */
  requireExplicitConsent: boolean;
  /** Current consent version */
  consentVersion: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ConsentConfig = {
  defaultConsent: {
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false
  },
  storageKey: 'g3d_consent',
  expirationTime: 31536000000, // 1 year
  requireExplicitConsent: true,
  consentVersion: '1.0'
};

/**
 * Consent change event
 */
export interface ConsentChangeEvent {
  category: string;
  granted: boolean;
  previous: boolean;
}

/**
 * Consent change callback
 */
export type ConsentChangeCallback = (event: ConsentChangeEvent) => void;

/**
 * Consent Manager
 * Manages user consent for GDPR compliance
 */
export class ConsentManager {
  private static instance: ConsentManager;
  private config: ConsentConfig;
  private consents: Map<string, ConsentStatus> = new Map();
  private changeListeners: Set<ConsentChangeCallback> = new Set();

  private constructor(config?: Partial<ConsentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadConsents();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<ConsentConfig>): ConsentManager {
    if (!ConsentManager.instance) {
      ConsentManager.instance = new ConsentManager(config);
    }
    return ConsentManager.instance;
  }

  /**
   * Check if consent is granted for a category
   */
  public hasConsent(category: string): boolean {
    const consent = this.consents.get(category);

    if (!consent) {
      // Return default consent if not explicitly set
      return this.config.defaultConsent[category] ?? false;
    }

    // Check expiration
    if (this.isExpired(consent)) {
      this.revokeConsent(category);
      return false;
    }

    return consent.granted;
  }

  /**
   * Grant consent for a category
   */
  public grantConsent(category: string, version?: string): void {
    const previous = this.hasConsent(category);

    const consent: ConsentStatus = {
      category,
      granted: true,
      timestamp: Date.now(),
      version: version || this.config.consentVersion
    };

    this.consents.set(category, consent);
    this.saveConsents();

    // Notify listeners
    this.notifyChange({
      category,
      granted: true,
      previous
    });
  }

  /**
   * Revoke consent for a category
   */
  public revokeConsent(category: string): void {
    const previous = this.hasConsent(category);

    const consent: ConsentStatus = {
      category,
      granted: false,
      timestamp: Date.now(),
      version: this.config.consentVersion
    };

    this.consents.set(category, consent);
    this.saveConsents();

    // Notify listeners
    this.notifyChange({
      category,
      granted: false,
      previous
    });
  }

  /**
   * Set consent for multiple categories
   */
  public setConsents(consents: Record<string, boolean>, version?: string): void {
    for (const [category, granted] of Object.entries(consents)) {
      if (granted) {
        this.grantConsent(category, version);
      } else {
        this.revokeConsent(category);
      }
    }
  }

  /**
   * Get all consents
   */
  public getAllConsents(): Record<string, boolean> {
    const all: Record<string, boolean> = {};

    // Add default consents
    for (const [category, granted] of Object.entries(this.config.defaultConsent)) {
      all[category] = granted;
    }

    // Override with explicit consents
    for (const [category, status] of this.consents.entries()) {
      if (!this.isExpired(status)) {
        all[category] = status.granted;
      }
    }

    return all;
  }

  /**
   * Get consent status for a category
   */
  public getConsentStatus(category: string): ConsentStatus | null {
    const consent = this.consents.get(category);

    if (!consent) {
      // Return default consent status
      const defaultGranted = this.config.defaultConsent[category] ?? false;
      return {
        category,
        granted: defaultGranted,
        timestamp: Date.now(),
        version: this.config.consentVersion
      };
    }

    if (this.isExpired(consent)) {
      return null;
    }

    return { ...consent };
  }

  /**
   * Reset all consents
   */
  public resetConsents(): void {
    const categories = Array.from(this.consents.keys());
    this.consents.clear();
    this.clearStorage();

    // Notify listeners for each category
    for (const category of categories) {
      this.notifyChange({
        category,
        granted: false,
        previous: true
      });
    }
  }

  /**
   * Check if consent needs update (version changed)
   */
  public needsConsentUpdate(category: string): boolean {
    const consent = this.consents.get(category);

    if (!consent) {
      return this.config.requireExplicitConsent;
    }

    // Check version
    if (consent.version !== this.config.consentVersion) {
      return true;
    }

    // Check expiration
    if (this.isExpired(consent)) {
      return true;
    }

    return false;
  }

  /**
   * Add consent change listener
   */
  public addChangeListener(callback: ConsentChangeCallback): void {
    this.changeListeners.add(callback);
  }

  /**
   * Remove consent change listener
   */
  public removeChangeListener(callback: ConsentChangeCallback): void {
    this.changeListeners.delete(callback);
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ConsentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<ConsentConfig> {
    return { ...this.config };
  }

  /**
   * Export consent data (for data portability)
   */
  public exportConsents(): string {
    const data = {
      consents: Array.from(this.consents.entries()),
      config: this.config,
      exportedAt: Date.now()
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Import consent data
   */
  public importConsents(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if (parsed.consents) {
        this.consents = new Map(parsed.consents);
        this.saveConsents();
      }
    } catch (error) {
      console.error('Failed to import consent data:', error);
      throw new Error('Invalid consent data format');
    }
  }

  /**
   * Check if consent is expired
   */
  private isExpired(consent: ConsentStatus): boolean {
    const age = Date.now() - consent.timestamp;
    return age > this.config.expirationTime;
  }

  /**
   * Notify change listeners
   */
  private notifyChange(event: ConsentChangeEvent): void {
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Consent change listener error:', error);
      }
    }
  }

  /**
   * Load consents from storage
   */
  private loadConsents(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = localStorage.getItem(this.config.storageKey);
      if (!data) {
        return;
      }

      const parsed = JSON.parse(data);

      if (parsed.consents) {
        this.consents = new Map(parsed.consents);
      }
    } catch (error) {
      console.warn('Failed to load consent data:', error);
    }
  }

  /**
   * Save consents to storage
   */
  private saveConsents(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = {
        consents: Array.from(this.consents.entries()),
        savedAt: Date.now()
      };

      localStorage.setItem(this.config.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save consent data:', error);
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
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.warn('Failed to clear consent data:', error);
    }
  }
}
