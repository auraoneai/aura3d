/**
 * G3D Date Formatter
 * Date and time formatting with Intl.DateTimeFormat
 * @module Localization
 */

/**
 * Date format preset
 */
export type DateFormatPreset = 'short' | 'medium' | 'long' | 'full';

/**
 * Time format preset
 */
export type TimeFormatPreset = 'short' | 'medium' | 'long';

/**
 * Relative time unit
 */
export type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/**
 * Date Formatter
 * Formats dates and times for different locales
 */
export class DateFormatter {
  private locale: string;
  private timeZone?: string;

  constructor(locale: string = 'en-US', timeZone?: string) {
    this.locale = locale;
    this.timeZone = timeZone;
  }

  /**
   * Set locale
   */
  public setLocale(locale: string): void {
    this.locale = locale;
  }

  /**
   * Set time zone
   */
  public setTimeZone(timeZone: string): void {
    this.timeZone = timeZone;
  }

  /**
   * Format date with preset
   */
  public format(date: Date | number, preset: DateFormatPreset = 'medium'): string {
    const options = this.getPresetOptions(preset);
    return this.formatWithOptions(date, options);
  }

  /**
   * Format date with custom options
   */
  public formatWithOptions(
    date: Date | number,
    options: Intl.DateTimeFormatOptions
  ): string {
    const formatter = new Intl.DateTimeFormat(this.locale, {
      timeZone: this.timeZone,
      ...options
    });

    return formatter.format(typeof date === 'number' ? date : date.getTime());
  }

  /**
   * Format date (date only)
   */
  public formatDate(date: Date | number, preset: DateFormatPreset = 'medium'): string {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: preset === 'short' ? 'numeric' : preset === 'medium' ? 'short' : 'long',
      day: 'numeric'
    };

    return this.formatWithOptions(date, options);
  }

  /**
   * Format time (time only)
   */
  public formatTime(date: Date | number, preset: TimeFormatPreset = 'short'): string {
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: 'numeric',
      second: preset === 'long' ? 'numeric' : undefined
    };

    return this.formatWithOptions(date, options);
  }

  /**
   * Format date and time
   */
  public formatDateTime(
    date: Date | number,
    datePreset: DateFormatPreset = 'medium',
    timePreset: TimeFormatPreset = 'short'
  ): string {
    const dateOptions = this.getPresetOptions(datePreset);
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: 'numeric',
      second: timePreset === 'long' ? 'numeric' : undefined
    };

    return this.formatWithOptions(date, { ...dateOptions, ...timeOptions });
  }

  /**
   * Format relative time (e.g., "2 days ago", "in 3 hours")
   */
  public formatRelative(date: Date | number, now: Date | number = Date.now()): string {
    const nowTime = typeof now === 'number' ? now : now.getTime();
    const targetTime = typeof date === 'number' ? date : date.getTime();
    const diffMs = targetTime - nowTime;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    // Determine unit and value
    let value: number;
    let unit: RelativeTimeUnit;

    if (Math.abs(diffYear) >= 1) {
      value = diffYear;
      unit = 'year';
    } else if (Math.abs(diffMonth) >= 1) {
      value = diffMonth;
      unit = 'month';
    } else if (Math.abs(diffWeek) >= 1) {
      value = diffWeek;
      unit = 'week';
    } else if (Math.abs(diffDay) >= 1) {
      value = diffDay;
      unit = 'day';
    } else if (Math.abs(diffHour) >= 1) {
      value = diffHour;
      unit = 'hour';
    } else if (Math.abs(diffMin) >= 1) {
      value = diffMin;
      unit = 'minute';
    } else {
      value = diffSec;
      unit = 'second';
    }

    return this.formatRelativeTime(value, unit);
  }

  /**
   * Format relative time with specific unit
   */
  public formatRelativeTime(value: number, unit: RelativeTimeUnit): string {
    if (typeof Intl.RelativeTimeFormat !== 'undefined') {
      const formatter = new Intl.RelativeTimeFormat(this.locale, { numeric: 'auto' });
      return formatter.format(value, unit);
    }

    // Fallback for browsers without RelativeTimeFormat
    return this.formatRelativeTimeFallback(value, unit);
  }

  /**
   * Format month name
   */
  public formatMonth(month: number, format: 'short' | 'long' = 'long'): string {
    const date = new Date(2000, month, 1);
    const options: Intl.DateTimeFormatOptions = {
      month: format
    };

    return this.formatWithOptions(date, options);
  }

  /**
   * Format weekday name
   */
  public formatWeekday(weekday: number, format: 'short' | 'long' = 'long'): string {
    // Get a date that falls on the specified weekday (0 = Sunday)
    const date = new Date(2000, 0, 2 + weekday); // Jan 2, 2000 is a Sunday
    const options: Intl.DateTimeFormatOptions = {
      weekday: format
    };

    return this.formatWithOptions(date, options);
  }

  /**
   * Format year
   */
  public formatYear(year: number): string {
    const date = new Date(year, 0, 1);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric'
    };

    return this.formatWithOptions(date, options);
  }

  /**
   * Format ISO 8601 date
   */
  public formatISO(date: Date | number): string {
    const d = typeof date === 'number' ? new Date(date) : date;
    return d.toISOString();
  }

  /**
   * Parse date string
   */
  public parse(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Get preset options
   */
  private getPresetOptions(preset: DateFormatPreset): Intl.DateTimeFormatOptions {
    switch (preset) {
      case 'short':
        return {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        };

      case 'medium':
        return {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        };

      case 'long':
        return {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        };

      case 'full':
        return {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        };

      default:
        return {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        };
    }
  }

  /**
   * Format relative time fallback (for older browsers)
   */
  private formatRelativeTimeFallback(value: number, unit: RelativeTimeUnit): string {
    const abs = Math.abs(value);
    const suffix = value < 0 ? 'ago' : 'from now';
    const unitName = abs === 1 ? unit : `${unit}s`;

    if (value === 0) {
      if (unit === 'second' || unit === 'minute') {
        return 'just now';
      }
      return `this ${unit}`;
    }

    return `${abs} ${unitName} ${suffix}`;
  }

  /**
   * Create formatter for specific locale
   */
  public static create(locale: string, timeZone?: string): DateFormatter {
    return new DateFormatter(locale, timeZone);
  }
}
