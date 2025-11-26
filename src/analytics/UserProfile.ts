/**
 * G3D User Profile
 * Manages user identity, properties, cohorts, and A/B test groups
 * @module Analytics
 */

import { EventTracker } from './EventTracker';

/**
 * User properties
 */
export interface UserProperties {
  /** User ID */
  userId?: string;
  /** Anonymous ID */
  anonymousId: string;
  /** Email address */
  email?: string;
  /** Display name */
  name?: string;
  /** Account creation date */
  createdAt?: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** User language */
  language?: string;
  /** User country */
  country?: string;
  /** User timezone */
  timezone?: string;
  /** Custom properties */
  custom: Record<string, any>;
}

/**
 * Cohort definition
 */
export interface Cohort {
  /** Cohort ID */
  id: string;
  /** Cohort name */
  name: string;
  /** Assignment date */
  assignedAt: number;
  /** Cohort properties */
  properties?: Record<string, any>;
}

/**
 * A/B test variant
 */
export interface ABTestVariant {
  /** Test ID */
  testId: string;
  /** Test name */
  testName: string;
  /** Variant ID */
  variantId: string;
  /** Variant name */
  variantName: string;
  /** Assignment date */
  assignedAt: number;
  /** Variant properties */
  properties?: Record<string, any>;
}

/**
 * User profile configuration
 */
export interface UserProfileConfig {
  /** Enable user tracking */
  enabled: boolean;
  /** Persist user data */
  persistUser: boolean;
  /** Storage key */
  storageKey: string;
  /** Auto-generate anonymous ID */
  autoGenerateAnonymousId: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: UserProfileConfig = {
  enabled: true,
  persistUser: true,
  storageKey: 'g3d_user_profile',
  autoGenerateAnonymousId: true
};

/**
 * User Profile
 * Manages user identity and properties
 */
export class UserProfile {
  private static instance: UserProfile;
  private eventTracker: EventTracker;
  private config: UserProfileConfig;
  private properties: UserProperties;
  private cohorts: Map<string, Cohort> = new Map();
  private abTests: Map<string, ABTestVariant> = new Map();

  private constructor(eventTracker?: EventTracker, config?: Partial<UserProfileConfig>) {
    this.eventTracker = eventTracker || new EventTracker();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize properties
    this.properties = {
      anonymousId: this.generateAnonymousId(),
      lastSeen: Date.now(),
      custom: {}
    };

    // Try to load persisted data
    if (this.config.persistUser) {
      this.loadPersistedProfile();
    }

    // Detect and set default properties
    this.detectUserProperties();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    eventTracker?: EventTracker,
    config?: Partial<UserProfileConfig>
  ): UserProfile {
    if (!UserProfile.instance) {
      UserProfile.instance = new UserProfile(eventTracker, config);
    }
    return UserProfile.instance;
  }

  /**
   * Set user ID
   */
  public setUserId(userId: string): void {
    const previousUserId = this.properties.userId;
    this.properties.userId = userId;
    this.properties.lastSeen = Date.now();

    if (!this.properties.createdAt) {
      this.properties.createdAt = Date.now();
    }

    this.persist();

    // Track identify event
    if (previousUserId !== userId) {
      this.eventTracker.track('user_identified', {
        user_id: userId,
        previous_user_id: previousUserId,
        anonymous_id: this.properties.anonymousId
      });
    }
  }

  /**
   * Get user ID
   */
  public getUserId(): string | undefined {
    return this.properties.userId;
  }

  /**
   * Get anonymous ID
   */
  public getAnonymousId(): string {
    return this.properties.anonymousId;
  }

  /**
   * Set user property
   */
  public setProperty(key: string, value: any): void {
    // Check if it's a standard property
    if (key in this.properties && key !== 'custom') {
      (this.properties as any)[key] = value;
    } else {
      // Add to custom properties
      this.properties.custom[key] = value;
    }

    this.properties.lastSeen = Date.now();
    this.persist();

    // Track property change
    this.eventTracker.track('user_property_set', {
      property_key: key,
      property_value: value,
      user_id: this.properties.userId
    });
  }

  /**
   * Set multiple user properties
   */
  public setProperties(properties: Record<string, any>): void {
    for (const [key, value] of Object.entries(properties)) {
      if (key in this.properties && key !== 'custom') {
        (this.properties as any)[key] = value;
      } else {
        this.properties.custom[key] = value;
      }
    }

    this.properties.lastSeen = Date.now();
    this.persist();

    // Track properties change
    this.eventTracker.track('user_properties_set', {
      properties_count: Object.keys(properties).length,
      user_id: this.properties.userId
    });
  }

  /**
   * Get user property
   */
  public getProperty(key: string): any {
    if (key in this.properties && key !== 'custom') {
      return (this.properties as any)[key];
    }
    return this.properties.custom[key];
  }

  /**
   * Get all user properties
   */
  public getProperties(): Readonly<UserProperties> {
    return { ...this.properties, custom: { ...this.properties.custom } };
  }

  /**
   * Remove user property
   */
  public removeProperty(key: string): void {
    if (key in this.properties.custom) {
      delete this.properties.custom[key];
      this.persist();
    }
  }

  /**
   * Assign user to cohort
   */
  public assignCohort(cohortId: string, cohortName: string, properties?: Record<string, any>): void {
    const cohort: Cohort = {
      id: cohortId,
      name: cohortName,
      assignedAt: Date.now(),
      properties
    };

    this.cohorts.set(cohortId, cohort);
    this.persist();

    // Track cohort assignment
    this.eventTracker.track('cohort_assigned', {
      cohort_id: cohortId,
      cohort_name: cohortName,
      user_id: this.properties.userId,
      ...properties
    });
  }

  /**
   * Remove user from cohort
   */
  public removeCohort(cohortId: string): void {
    if (this.cohorts.has(cohortId)) {
      this.cohorts.delete(cohortId);
      this.persist();

      this.eventTracker.track('cohort_removed', {
        cohort_id: cohortId,
        user_id: this.properties.userId
      });
    }
  }

  /**
   * Get user cohorts
   */
  public getCohorts(): Cohort[] {
    return Array.from(this.cohorts.values());
  }

  /**
   * Check if user is in cohort
   */
  public isInCohort(cohortId: string): boolean {
    return this.cohorts.has(cohortId);
  }

  /**
   * Assign user to A/B test variant
   */
  public assignABTest(
    testId: string,
    testName: string,
    variantId: string,
    variantName: string,
    properties?: Record<string, any>
  ): void {
    const variant: ABTestVariant = {
      testId,
      testName,
      variantId,
      variantName,
      assignedAt: Date.now(),
      properties
    };

    this.abTests.set(testId, variant);
    this.persist();

    // Track A/B test assignment
    this.eventTracker.track('ab_test_assigned', {
      test_id: testId,
      test_name: testName,
      variant_id: variantId,
      variant_name: variantName,
      user_id: this.properties.userId,
      ...properties
    });
  }

  /**
   * Get A/B test variant for user
   */
  public getABTestVariant(testId: string): ABTestVariant | undefined {
    return this.abTests.get(testId);
  }

  /**
   * Get all A/B test assignments
   */
  public getABTests(): ABTestVariant[] {
    return Array.from(this.abTests.values());
  }

  /**
   * Remove A/B test assignment
   */
  public removeABTest(testId: string): void {
    if (this.abTests.has(testId)) {
      this.abTests.delete(testId);
      this.persist();
    }
  }

  /**
   * Auto-assign A/B test variant based on user ID hash
   */
  public autoAssignABTest(
    testId: string,
    testName: string,
    variants: Array<{ id: string; name: string; weight: number }>
  ): ABTestVariant {
    // Check if already assigned
    const existing = this.abTests.get(testId);
    if (existing) {
      return existing;
    }

    // Calculate hash from user/anonymous ID
    const id = this.properties.userId || this.properties.anonymousId;
    const hash = this.hashString(id + testId);

    // Select variant based on weighted distribution
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    const normalizedHash = hash % totalWeight;

    let cumulativeWeight = 0;
    let selectedVariant = variants[0];

    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (normalizedHash < cumulativeWeight) {
        selectedVariant = variant;
        break;
      }
    }

    // Assign variant
    this.assignABTest(testId, testName, selectedVariant.id, selectedVariant.name);

    return this.abTests.get(testId)!;
  }

  /**
   * Reset user profile (clear all data)
   */
  public reset(): void {
    this.properties = {
      anonymousId: this.generateAnonymousId(),
      lastSeen: Date.now(),
      custom: {}
    };

    this.cohorts.clear();
    this.abTests.clear();

    this.clearPersistedProfile();
    this.detectUserProperties();

    this.eventTracker.track('user_reset', {
      anonymous_id: this.properties.anonymousId
    });
  }

  /**
   * Merge anonymous user with identified user
   */
  public alias(newUserId: string): void {
    const previousAnonymousId = this.properties.anonymousId;
    const previousUserId = this.properties.userId;

    this.setUserId(newUserId);

    this.eventTracker.track('user_alias', {
      previous_anonymous_id: previousAnonymousId,
      previous_user_id: previousUserId,
      new_user_id: newUserId
    });
  }

  /**
   * Generate anonymous ID
   */
  private generateAnonymousId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15);
    return `anon_${timestamp}_${random}${random2}`;
  }

  /**
   * Hash string to number (simple hash for A/B testing)
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Detect user properties from browser
   */
  private detectUserProperties(): void {
    if (typeof navigator === 'undefined') {
      return;
    }

    // Detect language
    if (!this.properties.language) {
      this.properties.language = navigator.language || (navigator as any).userLanguage;
    }

    // Detect timezone
    if (!this.properties.timezone) {
      try {
        this.properties.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch (error) {
        // Timezone detection not supported
      }
    }

    // Platform info
    this.properties.custom.platform = navigator.platform;
    this.properties.custom.user_agent = navigator.userAgent;
  }

  /**
   * Persist user profile to storage
   */
  private persist(): void {
    if (!this.config.persistUser || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = {
        properties: this.properties,
        cohorts: Array.from(this.cohorts.entries()),
        abTests: Array.from(this.abTests.entries())
      };
      localStorage.setItem(this.config.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist user profile:', error);
    }
  }

  /**
   * Load persisted user profile
   */
  private loadPersistedProfile(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const data = localStorage.getItem(this.config.storageKey);
      if (!data) {
        return;
      }

      const parsed = JSON.parse(data);

      if (parsed.properties) {
        this.properties = parsed.properties;
      }

      if (parsed.cohorts) {
        this.cohorts = new Map(parsed.cohorts);
      }

      if (parsed.abTests) {
        this.abTests = new Map(parsed.abTests);
      }
    } catch (error) {
      console.warn('Failed to load persisted user profile:', error);
    }
  }

  /**
   * Clear persisted user profile
   */
  private clearPersistedProfile(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.warn('Failed to clear persisted user profile:', error);
    }
  }

  /**
   * Dispose user profile
   */
  public dispose(): void {
    this.persist();
  }
}
