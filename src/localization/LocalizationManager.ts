/**
 * G3D Localization Manager
 * Manages locales, string lookup, and hot-swapping
 * @module Localization
 */

import { Locale } from './Locale';
import { StringTable } from './StringTable';

/**
 * Localization configuration
 */
export interface LocalizationConfig {
  /** Default locale code */
  defaultLocale: string;
  /** Fallback locale code */
  fallbackLocale: string;
  /** Auto-detect user locale */
  autoDetect: boolean;
  /** Storage key for persisting locale */
  storageKey: string;
  /** Enable hot-swap */
  enableHotSwap: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LocalizationConfig = {
  defaultLocale: 'en-US',
  fallbackLocale: 'en-US',
  autoDetect: true,
  storageKey: 'g3d_locale',
  enableHotSwap: true
};

/**
 * Locale change callback
 */
export type LocaleChangeCallback = (locale: Locale) => void;

/**
 * Missing key callback
 */
export type MissingKeyCallback = (key: string, locale: string) => string | undefined;

/**
 * Localization Manager
 * Central manager for localization
 */
export class LocalizationManager {
  private static instance: LocalizationManager;
  private config: LocalizationConfig;
  private locales: Map<string, Locale> = new Map();
  private stringTables: Map<string, StringTable> = new Map();
  private currentLocale: Locale | null = null;
  private changeListeners: Set<LocaleChangeCallback> = new Set();
  private missingKeyHandler?: MissingKeyCallback;

  private constructor(config?: Partial<LocalizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.autoDetect) {
      const detected = this.detectUserLocale();
      if (detected) {
        this.config.defaultLocale = detected;
      }
    }

    // Try to load saved locale
    this.loadSavedLocale();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<LocalizationConfig>): LocalizationManager {
    if (!LocalizationManager.instance) {
      LocalizationManager.instance = new LocalizationManager(config);
    }
    return LocalizationManager.instance;
  }

  /**
   * Register a locale
   */
  public registerLocale(locale: Locale): void {
    this.locales.set(locale.code, locale);
    console.log(`[Localization] Registered locale: ${locale.code} (${locale.displayName})`);

    // Set as current if it's the default and no current locale
    if (!this.currentLocale && locale.code === this.config.defaultLocale) {
      this.setLocale(locale.code);
    }
  }

  /**
   * Register string table for a locale
   */
  public registerStringTable(localeCode: string, stringTable: StringTable): void {
    this.stringTables.set(localeCode, stringTable);
    console.log(`[Localization] Registered string table for: ${localeCode}`);
  }

  /**
   * Set current locale
   */
  public setLocale(localeCode: string): boolean {
    const locale = this.locales.get(localeCode);

    if (!locale) {
      console.warn(`[Localization] Locale not found: ${localeCode}`);
      return false;
    }

    const previousLocale = this.currentLocale;
    this.currentLocale = locale;

    // Save to storage
    this.saveLocale(localeCode);

    // Notify listeners
    if (previousLocale?.code !== localeCode) {
      this.notifyLocaleChange(locale);
    }

    console.log(`[Localization] Switched to locale: ${localeCode}`);
    return true;
  }

  /**
   * Get current locale
   */
  public getCurrentLocale(): Locale | null {
    return this.currentLocale;
  }

  /**
   * Get locale by code
   */
  public getLocale(localeCode: string): Locale | undefined {
    return this.locales.get(localeCode);
  }

  /**
   * Get all registered locales
   */
  public getAvailableLocales(): Locale[] {
    return Array.from(this.locales.values());
  }

  /**
   * Get localized string
   */
  public getString(key: string, params?: Record<string, any>): string {
    if (!this.currentLocale) {
      return this.handleMissingKey(key, 'no-locale');
    }

    // Try current locale
    const currentTable = this.stringTables.get(this.currentLocale.code);
    if (currentTable) {
      const value = currentTable.get(key, params);
      if (value !== undefined) {
        return value;
      }
    }

    // Try fallback locale
    if (this.currentLocale.code !== this.config.fallbackLocale) {
      const fallbackTable = this.stringTables.get(this.config.fallbackLocale);
      if (fallbackTable) {
        const value = fallbackTable.get(key, params);
        if (value !== undefined) {
          console.warn(`[Localization] Using fallback for key: ${key}`);
          return value;
        }
      }
    }

    // Key not found
    return this.handleMissingKey(key, this.currentLocale.code);
  }

  /**
   * Get localized string (shorthand)
   */
  public t(key: string, params?: Record<string, any>): string {
    return this.getString(key, params);
  }

  /**
   * Check if key exists
   */
  public hasKey(key: string): boolean {
    if (!this.currentLocale) {
      return false;
    }

    const table = this.stringTables.get(this.currentLocale.code);
    if (table && table.has(key)) {
      return true;
    }

    // Check fallback
    if (this.currentLocale.code !== this.config.fallbackLocale) {
      const fallbackTable = this.stringTables.get(this.config.fallbackLocale);
      return fallbackTable?.has(key) ?? false;
    }

    return false;
  }

  /**
   * Get all keys for current locale
   */
  public getKeys(): string[] {
    if (!this.currentLocale) {
      return [];
    }

    const table = this.stringTables.get(this.currentLocale.code);
    return table?.getKeys() ?? [];
  }

  /**
   * Hot-swap locale (update strings without page reload)
   */
  public async hotSwapLocale(localeCode: string): Promise<boolean> {
    if (!this.config.enableHotSwap) {
      console.warn('[Localization] Hot-swap is disabled');
      return false;
    }

    return this.setLocale(localeCode);
  }

  /**
   * Set missing key handler
   */
  public setMissingKeyHandler(handler: MissingKeyCallback): void {
    this.missingKeyHandler = handler;
  }

  /**
   * Add locale change listener
   */
  public onLocaleChange(callback: LocaleChangeCallback): () => void {
    this.changeListeners.add(callback);

    // Immediately call with current locale
    if (this.currentLocale) {
      callback(this.currentLocale);
    }

    // Return unsubscribe function
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  /**
   * Get locale direction (LTR/RTL)
   */
  public getDirection(): 'ltr' | 'rtl' {
    return this.currentLocale?.direction ?? 'ltr';
  }

  /**
   * Check if current locale is RTL
   */
  public isRTL(): boolean {
    return this.getDirection() === 'rtl';
  }

  /**
   * Get locale code
   */
  public getLocaleCode(): string {
    return this.currentLocale?.code ?? this.config.defaultLocale;
  }

  /**
   * Get language code (without region)
   */
  public getLanguageCode(): string {
    const code = this.getLocaleCode();
    return code.split('-')[0];
  }

  /**
   * Get region code
   */
  public getRegionCode(): string | undefined {
    const code = this.getLocaleCode();
    const parts = code.split('-');
    return parts.length > 1 ? parts[1] : undefined;
  }

  /**
   * Handle missing key
   */
  private handleMissingKey(key: string, locale: string): string {
    console.warn(`[Localization] Missing key: ${key} (locale: ${locale})`);

    if (this.missingKeyHandler) {
      const result = this.missingKeyHandler(key, locale);
      if (result !== undefined) {
        return result;
      }
    }

    // Return key in brackets as fallback
    return `[${key}]`;
  }

  /**
   * Notify locale change
   */
  private notifyLocaleChange(locale: Locale): void {
    for (const listener of this.changeListeners) {
      try {
        listener(locale);
      } catch (error) {
        console.error('[Localization] Locale change listener error:', error);
      }
    }
  }

  /**
   * Detect user locale
   */
  private detectUserLocale(): string | null {
    if (typeof navigator === 'undefined') {
      return null;
    }

    // Try navigator.language first
    if (navigator.language) {
      return navigator.language;
    }

    // Fallback to navigator.languages
    if (navigator.languages && navigator.languages.length > 0) {
      return navigator.languages[0];
    }

    return null;
  }

  /**
   * Save locale to storage
   */
  private saveLocale(localeCode: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.config.storageKey, localeCode);
    } catch (error) {
      console.warn('[Localization] Failed to save locale:', error);
    }
  }

  /**
   * Load saved locale
   */
  private loadSavedLocale(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const saved = localStorage.getItem(this.config.storageKey);
      if (saved) {
        this.config.defaultLocale = saved;
      }
    } catch (error) {
      console.warn('[Localization] Failed to load saved locale:', error);
    }
  }

  /**
   * Reset to default locale
   */
  public reset(): void {
    this.setLocale(this.config.defaultLocale);
  }
}
