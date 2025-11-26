/**
 * G3D Locale Definition
 * Defines locale properties and formatting rules
 * @module Localization
 */

/**
 * Text direction
 */
export type TextDirection = 'ltr' | 'rtl';

/**
 * Number format options
 */
export interface NumberFormatOptions {
  /** Decimal separator */
  decimalSeparator: string;
  /** Thousands separator */
  thousandsSeparator: string;
  /** Decimal places */
  decimalPlaces: number;
  /** Currency symbol */
  currencySymbol?: string;
  /** Currency position */
  currencyPosition: 'before' | 'after';
}

/**
 * Date format options
 */
export interface DateFormatOptions {
  /** Short date format */
  short: string;
  /** Medium date format */
  medium: string;
  /** Long date format */
  long: string;
  /** Full date format */
  full: string;
  /** Time format */
  time: string;
}

/**
 * Locale definition
 */
export class Locale {
  /** Locale code (e.g., 'en-US', 'fr-FR') */
  public readonly code: string;

  /** Display name (e.g., 'English (United States)') */
  public readonly displayName: string;

  /** Native name (e.g., 'English') */
  public readonly nativeName: string;

  /** Text direction */
  public readonly direction: TextDirection;

  /** Number format options */
  public readonly numberFormat: NumberFormatOptions;

  /** Date format options */
  public readonly dateFormat: DateFormatOptions;

  constructor(
    code: string,
    displayName: string,
    nativeName?: string,
    direction?: TextDirection,
    numberFormat?: Partial<NumberFormatOptions>,
    dateFormat?: Partial<DateFormatOptions>
  ) {
    this.code = code;
    this.displayName = displayName;
    this.nativeName = nativeName || displayName;
    this.direction = direction || this.detectDirection(code);
    this.numberFormat = this.createNumberFormat(code, numberFormat);
    this.dateFormat = this.createDateFormat(code, dateFormat);
  }

  /**
   * Get language code (without region)
   */
  public getLanguageCode(): string {
    return this.code.split('-')[0];
  }

  /**
   * Get region code
   */
  public getRegionCode(): string | undefined {
    const parts = this.code.split('-');
    return parts.length > 1 ? parts[1] : undefined;
  }

  /**
   * Check if this is an RTL locale
   */
  public isRTL(): boolean {
    return this.direction === 'rtl';
  }

  /**
   * Format number
   */
  public formatNumber(value: number, decimals?: number): string {
    const places = decimals ?? this.numberFormat.decimalPlaces;
    const fixed = value.toFixed(places);
    const parts = fixed.split('.');

    // Add thousands separator
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, this.numberFormat.thousandsSeparator);

    // Join with decimal separator
    return parts.join(this.numberFormat.decimalSeparator);
  }

  /**
   * Format currency
   */
  public formatCurrency(value: number, currencySymbol?: string): string {
    const symbol = currencySymbol || this.numberFormat.currencySymbol || '$';
    const formatted = this.formatNumber(value, 2);

    if (this.numberFormat.currencyPosition === 'before') {
      return `${symbol}${formatted}`;
    } else {
      return `${formatted}${symbol}`;
    }
  }

  /**
   * Format percentage
   */
  public formatPercentage(value: number, decimals: number = 0): string {
    return `${this.formatNumber(value, decimals)}%`;
  }

  /**
   * Detect text direction from locale code
   */
  private detectDirection(code: string): TextDirection {
    const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi'];
    const lang = code.split('-')[0];
    return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
  }

  /**
   * Create number format with defaults
   */
  private createNumberFormat(
    code: string,
    options?: Partial<NumberFormatOptions>
  ): NumberFormatOptions {
    // Get default format for locale
    const defaults = this.getDefaultNumberFormat(code);

    return {
      ...defaults,
      ...options
    };
  }

  /**
   * Create date format with defaults
   */
  private createDateFormat(
    code: string,
    options?: Partial<DateFormatOptions>
  ): DateFormatOptions {
    // Get default format for locale
    const defaults = this.getDefaultDateFormat(code);

    return {
      ...defaults,
      ...options
    };
  }

  /**
   * Get default number format for locale
   */
  private getDefaultNumberFormat(code: string): NumberFormatOptions {
    const lang = code.split('-')[0];

    // European format (France, Germany, etc.)
    if (['fr', 'de', 'es', 'it', 'pt'].includes(lang)) {
      return {
        decimalSeparator: ',',
        thousandsSeparator: '.',
        decimalPlaces: 2,
        currencySymbol: '€',
        currencyPosition: 'after'
      };
    }

    // Default to US format
    return {
      decimalSeparator: '.',
      thousandsSeparator: ',',
      decimalPlaces: 2,
      currencySymbol: '$',
      currencyPosition: 'before'
    };
  }

  /**
   * Get default date format for locale
   */
  private getDefaultDateFormat(code: string): DateFormatOptions {
    const lang = code.split('-')[0];

    // US format
    if (lang === 'en' && code.includes('US')) {
      return {
        short: 'M/d/yyyy',
        medium: 'MMM d, yyyy',
        long: 'MMMM d, yyyy',
        full: 'EEEE, MMMM d, yyyy',
        time: 'h:mm a'
      };
    }

    // European format (most countries)
    return {
      short: 'd/M/yyyy',
      medium: 'd MMM yyyy',
      long: 'd MMMM yyyy',
      full: 'EEEE, d MMMM yyyy',
      time: 'HH:mm'
    };
  }

  /**
   * Create common locales
   */
  public static createCommonLocales(): Locale[] {
    return [
      new Locale('en-US', 'English (United States)', 'English'),
      new Locale('en-GB', 'English (United Kingdom)', 'English'),
      new Locale('es-ES', 'Spanish (Spain)', 'Español'),
      new Locale('es-MX', 'Spanish (Mexico)', 'Español'),
      new Locale('fr-FR', 'French (France)', 'Français'),
      new Locale('de-DE', 'German (Germany)', 'Deutsch'),
      new Locale('it-IT', 'Italian (Italy)', 'Italiano'),
      new Locale('pt-BR', 'Portuguese (Brazil)', 'Português'),
      new Locale('pt-PT', 'Portuguese (Portugal)', 'Português'),
      new Locale('ru-RU', 'Russian (Russia)', 'Русский'),
      new Locale('zh-CN', 'Chinese (Simplified)', '简体中文'),
      new Locale('zh-TW', 'Chinese (Traditional)', '繁體中文'),
      new Locale('ja-JP', 'Japanese (Japan)', '日本語'),
      new Locale('ko-KR', 'Korean (South Korea)', '한국어'),
      new Locale('ar-SA', 'Arabic (Saudi Arabia)', 'العربية', 'rtl'),
      new Locale('he-IL', 'Hebrew (Israel)', 'עברית', 'rtl'),
      new Locale('hi-IN', 'Hindi (India)', 'हिन्दी'),
      new Locale('th-TH', 'Thai (Thailand)', 'ไทย'),
      new Locale('vi-VN', 'Vietnamese (Vietnam)', 'Tiếng Việt'),
      new Locale('id-ID', 'Indonesian (Indonesia)', 'Bahasa Indonesia'),
      new Locale('pl-PL', 'Polish (Poland)', 'Polski'),
      new Locale('nl-NL', 'Dutch (Netherlands)', 'Nederlands'),
      new Locale('sv-SE', 'Swedish (Sweden)', 'Svenska'),
      new Locale('tr-TR', 'Turkish (Turkey)', 'Türkçe'),
      new Locale('cs-CZ', 'Czech (Czech Republic)', 'Čeština'),
      new Locale('el-GR', 'Greek (Greece)', 'Ελληνικά'),
      new Locale('ro-RO', 'Romanian (Romania)', 'Română'),
      new Locale('hu-HU', 'Hungarian (Hungary)', 'Magyar'),
      new Locale('da-DK', 'Danish (Denmark)', 'Dansk'),
      new Locale('fi-FI', 'Finnish (Finland)', 'Suomi'),
      new Locale('no-NO', 'Norwegian (Norway)', 'Norsk')
    ];
  }
}
