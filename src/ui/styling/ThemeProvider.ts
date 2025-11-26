import { Theme, ThemeMode } from './Theme';
import { Logger } from '../../core/Logger';

const logger = Logger.create('ThemeProvider');

/**
 * Callback type for theme change notifications.
 */
export type ThemeChangeCallback = (theme: Theme) => void;

/**
 * Theme context provider that manages the current theme and notifies listeners of changes.
 * Supports theme switching at runtime and persistent theme preference storage.
 */
export class ThemeProvider {
  private static instance: ThemeProvider | null = null;
  private currentTheme: Theme;
  private listeners: Set<ThemeChangeCallback> = new Set();
  private storageKey: string = 'g3d-theme-preference';

  /**
   * Creates a new ThemeProvider instance.
   *
   * @param defaultTheme - Initial theme to use
   */
  private constructor(defaultTheme: Theme) {
    this.currentTheme = defaultTheme;
    this.loadThemePreference();
  }

  /**
   * Gets the singleton ThemeProvider instance.
   * Creates a new instance with default light theme if none exists.
   *
   * @returns The ThemeProvider instance
   */
  static getInstance(): ThemeProvider {
    if (!ThemeProvider.instance) {
      ThemeProvider.instance = new ThemeProvider(Theme.createLight());
    }
    return ThemeProvider.instance;
  }

  /**
   * Initializes the ThemeProvider with a specific theme.
   * Should be called once at application startup.
   *
   * @param theme - Initial theme to use
   */
  static initialize(theme: Theme): void {
    if (ThemeProvider.instance) {
      logger.warn('ThemeProvider already initialized, replacing existing instance');
    }
    ThemeProvider.instance = new ThemeProvider(theme);
  }

  /**
   * Gets the current theme.
   *
   * @returns Current Theme instance
   */
  getTheme(): Theme {
    return this.currentTheme;
  }

  /**
   * Sets the current theme and notifies all listeners.
   *
   * @param theme - New theme to apply
   */
  setTheme(theme: Theme): void {
    const previousTheme = this.currentTheme;
    this.currentTheme = theme;
    this.saveThemePreference();

    logger.info(`Theme changed from "${previousTheme.name}" to "${theme.name}"`);

    this.notifyListeners();
  }

  /**
   * Toggles between light and dark mode.
   */
  toggleMode(): void {
    const newTheme = this.currentTheme.toggleMode();
    this.setTheme(newTheme);
  }

  /**
   * Sets the theme mode explicitly.
   *
   * @param mode - Theme mode to set
   */
  setMode(mode: ThemeMode): void {
    if (this.currentTheme.mode === mode) {
      return;
    }
    this.toggleMode();
  }

  /**
   * Registers a callback to be invoked when the theme changes.
   *
   * @param callback - Function to call on theme change
   * @returns Unsubscribe function
   */
  subscribe(callback: ThemeChangeCallback): () => void {
    this.listeners.add(callback);
    logger.debug(`Theme listener registered, total listeners: ${this.listeners.size}`);

    return () => {
      this.listeners.delete(callback);
      logger.debug(`Theme listener unregistered, remaining listeners: ${this.listeners.size}`);
    };
  }

  /**
   * Notifies all registered listeners of the current theme.
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentTheme);
      } catch (error) {
        logger.error('Error in theme change listener', error);
      }
    }
  }

  /**
   * Loads theme preference from localStorage if available.
   */
  private loadThemePreference(): void {
    if (typeof localStorage === 'undefined') {
      logger.debug('localStorage not available, skipping theme preference load');
      return;
    }

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const preference = JSON.parse(stored) as { mode: ThemeMode };
        if (preference.mode !== this.currentTheme.mode) {
          logger.info(`Loaded theme preference: ${preference.mode}`);
          this.setMode(preference.mode);
        }
      }
    } catch (error) {
      logger.error('Failed to load theme preference', error);
    }
  }

  /**
   * Saves current theme preference to localStorage if available.
   */
  private saveThemePreference(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const preference = { mode: this.currentTheme.mode };
      localStorage.setItem(this.storageKey, JSON.stringify(preference));
      logger.debug(`Saved theme preference: ${preference.mode}`);
    } catch (error) {
      logger.error('Failed to save theme preference', error);
    }
  }

  /**
   * Resets the theme provider to default state.
   * Primarily used for testing.
   */
  static reset(): void {
    if (ThemeProvider.instance) {
      ThemeProvider.instance.listeners.clear();
      ThemeProvider.instance = null;
    }
  }

  /**
   * Gets the current theme mode.
   *
   * @returns Current ThemeMode
   */
  getMode(): ThemeMode {
    return this.currentTheme.mode;
  }

  /**
   * Checks if the current theme is dark mode.
   *
   * @returns True if dark mode, false otherwise
   */
  isDarkMode(): boolean {
    return this.currentTheme.mode === ThemeMode.Dark;
  }

  /**
   * Checks if the current theme is light mode.
   *
   * @returns True if light mode, false otherwise
   */
  isLightMode(): boolean {
    return this.currentTheme.mode === ThemeMode.Light;
  }
}
