/**
 * G3D Pluralization
 * CLDR plural rules for different languages
 * @module Localization
 */

/**
 * Plural category (CLDR standard)
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * Plural rule function
 */
export type PluralRuleFunction = (count: number) => PluralCategory;

/**
 * Ordinal category (for 1st, 2nd, 3rd, etc.)
 */
export type OrdinalCategory = '0' | '1' | '2' | '3' | '4' | 'other';

/**
 * Ordinal rule function
 */
export type OrdinalRuleFunction = (number: number) => OrdinalCategory;

/**
 * Pluralization
 * Handles plural forms for different languages
 */
export class Pluralization {
  private static cardinalRules: Map<string, PluralRuleFunction> = new Map();
  private static ordinalRules: Map<string, OrdinalRuleFunction> = new Map();

  /**
   * Get plural category for a number
   */
  public static getCardinalCategory(count: number, locale: string): PluralCategory {
    const lang = locale.split('-')[0];
    const rule = this.cardinalRules.get(lang) || this.defaultCardinalRule;
    return rule(count);
  }

  /**
   * Get ordinal category for a number
   */
  public static getOrdinalCategory(number: number, locale: string): OrdinalCategory {
    const lang = locale.split('-')[0];
    const rule = this.ordinalRules.get(lang) || this.defaultOrdinalRule;
    return rule(number);
  }

  /**
   * Select plural form
   * Example: selectPlural(5, locale, { one: '1 item', other: '{count} items' }, { count: 5 })
   */
  public static selectPlural(
    count: number,
    locale: string,
    forms: Partial<Record<PluralCategory, string>>,
    params?: Record<string, any>
  ): string {
    const category = this.getCardinalCategory(count, locale);
    let template = forms[category] || forms.other || '';

    // Substitute parameters
    if (params) {
      template = template.replace(/\{([^}]+)\}/g, (match, key) => {
        const value = params[key];
        return value !== undefined ? String(value) : match;
      });
    }

    return template;
  }

  /**
   * Format ordinal number (1st, 2nd, 3rd, etc.)
   */
  public static formatOrdinal(number: number, locale: string): string {
    const category = this.getOrdinalCategory(number, locale);
    const lang = locale.split('-')[0];

    // English ordinals
    if (lang === 'en') {
      const suffixes: Record<string, string> = {
        '1': 'st',
        '2': 'nd',
        '3': 'rd',
        'other': 'th'
      };
      return `${number}${suffixes[category] || suffixes.other}`;
    }

    // Default: just return the number
    return String(number);
  }

  /**
   * Default cardinal rule (English)
   */
  private static defaultCardinalRule: PluralRuleFunction = (count: number): PluralCategory => {
    if (count === 1) return 'one';
    return 'other';
  };

  /**
   * Default ordinal rule (English)
   */
  private static defaultOrdinalRule: OrdinalRuleFunction = (n: number): OrdinalCategory => {
    const mod10 = n % 10;
    const mod100 = n % 100;

    if (mod10 === 1 && mod100 !== 11) return '1';
    if (mod10 === 2 && mod100 !== 12) return '2';
    if (mod10 === 3 && mod100 !== 13) return '3';
    return 'other';
  };

  /**
   * Initialize common plural rules
   */
  public static initialize(): void {
    // English (one, other)
    this.cardinalRules.set('en', (n: number) => {
      if (n === 1) return 'one';
      return 'other';
    });

    // French (one, other)
    this.cardinalRules.set('fr', (n: number) => {
      if (n === 0 || n === 1) return 'one';
      return 'other';
    });

    // Spanish (one, other)
    this.cardinalRules.set('es', (n: number) => {
      if (n === 1) return 'one';
      return 'other';
    });

    // German (one, other)
    this.cardinalRules.set('de', (n: number) => {
      if (n === 1) return 'one';
      return 'other';
    });

    // Russian (one, few, many, other)
    this.cardinalRules.set('ru', (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;

      if (mod10 === 1 && mod100 !== 11) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'few';
      if (mod10 === 0 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 11 && mod100 <= 14)) return 'many';
      return 'other';
    });

    // Polish (one, few, many, other)
    this.cardinalRules.set('pl', (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;

      if (n === 1) return 'one';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'few';
      if (
        (n !== 1 && mod10 >= 0 && mod10 <= 1) ||
        (mod10 >= 5 && mod10 <= 9) ||
        (mod100 >= 12 && mod100 <= 14)
      ) {
        return 'many';
      }
      return 'other';
    });

    // Czech (one, few, many, other)
    this.cardinalRules.set('cs', (n: number) => {
      if (n === 1) return 'one';
      if (n >= 2 && n <= 4) return 'few';
      return 'other';
    });

    // Arabic (zero, one, two, few, many, other)
    this.cardinalRules.set('ar', (n: number) => {
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (n % 100 >= 3 && n % 100 <= 10) return 'few';
      if (n % 100 >= 11 && n % 100 <= 99) return 'many';
      return 'other';
    });

    // Welsh (zero, one, two, few, many, other)
    this.cardinalRules.set('cy', (n: number) => {
      if (n === 0) return 'zero';
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (n === 3) return 'few';
      if (n === 6) return 'many';
      return 'other';
    });

    // Chinese, Japanese, Korean (other only)
    const asianRule = (): PluralCategory => 'other';
    this.cardinalRules.set('zh', asianRule);
    this.cardinalRules.set('ja', asianRule);
    this.cardinalRules.set('ko', asianRule);
    this.cardinalRules.set('th', asianRule);
    this.cardinalRules.set('vi', asianRule);

    // Turkish (one, other)
    this.cardinalRules.set('tr', (n: number) => {
      if (n === 1) return 'one';
      return 'other';
    });

    // Initialize ordinal rules
    this.initializeOrdinalRules();
  }

  /**
   * Initialize ordinal rules
   */
  private static initializeOrdinalRules(): void {
    // English ordinals
    this.ordinalRules.set('en', (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;

      if (mod10 === 1 && mod100 !== 11) return '1';
      if (mod10 === 2 && mod100 !== 12) return '2';
      if (mod10 === 3 && mod100 !== 13) return '3';
      return 'other';
    });

    // Spanish ordinals
    this.ordinalRules.set('es', (): OrdinalCategory => 'other');

    // French ordinals
    this.ordinalRules.set('fr', (n: number): OrdinalCategory => {
      if (n === 1) return '1';
      return 'other';
    });

    // Italian ordinals
    this.ordinalRules.set('it', (n: number): OrdinalCategory => {
      if (n === 11 || n === 8 || n === 80 || n === 800) return 'other';
      return 'other';
    });
  }

  /**
   * Register custom cardinal rule
   */
  public static registerCardinalRule(language: string, rule: PluralRuleFunction): void {
    this.cardinalRules.set(language, rule);
  }

  /**
   * Register custom ordinal rule
   */
  public static registerOrdinalRule(language: string, rule: OrdinalRuleFunction): void {
    this.ordinalRules.set(language, rule);
  }
}

// Initialize default rules
Pluralization.initialize();
