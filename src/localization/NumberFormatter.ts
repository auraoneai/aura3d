/**
 * G3D Number Formatter
 * Number formatting with Intl.NumberFormat
 * @module Localization
 */

/**
 * Number format style
 */
export type NumberFormatStyle = 'decimal' | 'percent' | 'currency';

/**
 * Compact notation
 */
export type CompactNotation = 'short' | 'long';

/**
 * Number Formatter
 * Formats numbers, percentages, and currency for different locales
 */
export class NumberFormatter {
  private locale: string;

  constructor(locale: string = 'en-US') {
    this.locale = locale;
  }

  /**
   * Set locale
   */
  public setLocale(locale: string): void {
    this.locale = locale;
  }

  /**
   * Format number
   */
  public format(value: number, options?: Intl.NumberFormatOptions): string {
    const formatter = new Intl.NumberFormat(this.locale, options);
    return formatter.format(value);
  }

  /**
   * Format decimal number
   */
  public formatDecimal(
    value: number,
    minimumFractionDigits: number = 0,
    maximumFractionDigits: number = 2
  ): string {
    return this.format(value, {
      style: 'decimal',
      minimumFractionDigits,
      maximumFractionDigits
    });
  }

  /**
   * Format percentage
   */
  public formatPercent(
    value: number,
    minimumFractionDigits: number = 0,
    maximumFractionDigits: number = 0
  ): string {
    return this.format(value / 100, {
      style: 'percent',
      minimumFractionDigits,
      maximumFractionDigits
    });
  }

  /**
   * Format currency
   */
  public formatCurrency(
    value: number,
    currency: string = 'USD',
    options?: Partial<Intl.NumberFormatOptions>
  ): string {
    return this.format(value, {
      style: 'currency',
      currency,
      ...options
    });
  }

  /**
   * Format with compact notation (1K, 1M, 1B, etc.)
   */
  public formatCompact(
    value: number,
    notation: CompactNotation = 'short'
  ): string {
    if (typeof Intl.NumberFormat.prototype.format === 'function') {
      try {
        return this.format(value, {
          notation: 'compact',
          compactDisplay: notation
        } as any);
      } catch (error) {
        // Fallback if compact notation not supported
        return this.formatCompactFallback(value, notation);
      }
    }

    return this.formatCompactFallback(value, notation);
  }

  /**
   * Format with custom precision
   */
  public formatPrecision(value: number, precision: number): string {
    return this.format(value, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });
  }

  /**
   * Format with grouping separators
   */
  public formatWithGrouping(value: number, useGrouping: boolean = true): string {
    return this.format(value, {
      useGrouping
    });
  }

  /**
   * Format integer (no decimals)
   */
  public formatInteger(value: number): string {
    return this.format(Math.floor(value), {
      maximumFractionDigits: 0
    });
  }

  /**
   * Format with sign (always show + or -)
   */
  public formatWithSign(value: number): string {
    return this.format(value, {
      signDisplay: 'always'
    } as any);
  }

  /**
   * Format scientific notation
   */
  public formatScientific(value: number): string {
    return this.format(value, {
      notation: 'scientific'
    } as any);
  }

  /**
   * Format engineering notation
   */
  public formatEngineering(value: number): string {
    return this.format(value, {
      notation: 'engineering'
    } as any);
  }

  /**
   * Format file size (bytes)
   */
  public formatFileSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);

    return `${this.formatDecimal(value, 0, decimals)} ${sizes[i]}`;
  }

  /**
   * Format duration (milliseconds to human readable)
   */
  public formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format range
   */
  public formatRange(start: number, end: number): string {
    if (typeof (Intl.NumberFormat.prototype as any).formatRange === 'function') {
      try {
        const formatter = new Intl.NumberFormat(this.locale) as any;
        return formatter.formatRange(start, end);
      } catch (error) {
        return `${this.format(start)}–${this.format(end)}`;
      }
    }

    return `${this.format(start)}–${this.format(end)}`;
  }

  /**
   * Parse formatted number string to number
   */
  public parse(formattedNumber: string): number {
    // Remove grouping separators and parse
    const cleaned = formattedNumber.replace(/[,\s]/g, '');
    return parseFloat(cleaned);
  }

  /**
   * Format compact notation fallback
   */
  private formatCompactFallback(value: number, notation: CompactNotation): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (abs >= 1e12) {
      return `${sign}${this.formatDecimal(abs / 1e12, 0, 1)}T`;
    } else if (abs >= 1e9) {
      return `${sign}${this.formatDecimal(abs / 1e9, 0, 1)}B`;
    } else if (abs >= 1e6) {
      return `${sign}${this.formatDecimal(abs / 1e6, 0, 1)}M`;
    } else if (abs >= 1e3) {
      return `${sign}${this.formatDecimal(abs / 1e3, 0, 1)}K`;
    } else {
      return this.format(value);
    }
  }

  /**
   * Format ordinal number (1st, 2nd, 3rd, etc.)
   */
  public formatOrdinal(number: number): string {
    const mod10 = number % 10;
    const mod100 = number % 100;

    let suffix = 'th';

    if (mod10 === 1 && mod100 !== 11) {
      suffix = 'st';
    } else if (mod10 === 2 && mod100 !== 12) {
      suffix = 'nd';
    } else if (mod10 === 3 && mod100 !== 13) {
      suffix = 'rd';
    }

    return `${number}${suffix}`;
  }

  /**
   * Format as fraction
   */
  public formatFraction(numerator: number, denominator: number): string {
    return `${this.formatInteger(numerator)}/${this.formatInteger(denominator)}`;
  }

  /**
   * Format as ratio
   */
  public formatRatio(value1: number, value2: number): string {
    return `${this.formatInteger(value1)}:${this.formatInteger(value2)}`;
  }

  /**
   * Create formatter for specific locale
   */
  public static create(locale: string): NumberFormatter {
    return new NumberFormatter(locale);
  }
}
