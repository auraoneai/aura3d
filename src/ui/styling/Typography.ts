import { FontWeight } from './Style';

/**
 * Defines a typography style with font family, size, weight, and line height.
 */
export interface TypographyStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  lineHeight: number;
  letterSpacing?: number;
}

/**
 * Typography scale system providing consistent text styles.
 * Includes heading levels, body text, and utility styles.
 */
export class Typography {
  /**
   * Primary font family for body text.
   */
  fontFamily: string;

  /**
   * Secondary font family for headings.
   */
  headingFontFamily: string;

  /**
   * Monospace font family for code.
   */
  monoFontFamily: string;

  /**
   * Heading 1 style (largest heading).
   */
  h1: TypographyStyle;

  /**
   * Heading 2 style.
   */
  h2: TypographyStyle;

  /**
   * Heading 3 style.
   */
  h3: TypographyStyle;

  /**
   * Heading 4 style.
   */
  h4: TypographyStyle;

  /**
   * Heading 5 style.
   */
  h5: TypographyStyle;

  /**
   * Heading 6 style (smallest heading).
   */
  h6: TypographyStyle;

  /**
   * Body text style (default).
   */
  body: TypographyStyle;

  /**
   * Body text style (large).
   */
  bodyLarge: TypographyStyle;

  /**
   * Body text style (small).
   */
  bodySmall: TypographyStyle;

  /**
   * Caption text style.
   */
  caption: TypographyStyle;

  /**
   * Overline text style.
   */
  overline: TypographyStyle;

  /**
   * Button text style.
   */
  button: TypographyStyle;

  /**
   * Code text style.
   */
  code: TypographyStyle;

  /**
   * Creates a new Typography instance.
   *
   * @param config - Typography configuration
   */
  constructor(config: {
    fontFamily?: string;
    headingFontFamily?: string;
    monoFontFamily?: string;
    h1?: Partial<TypographyStyle>;
    h2?: Partial<TypographyStyle>;
    h3?: Partial<TypographyStyle>;
    h4?: Partial<TypographyStyle>;
    h5?: Partial<TypographyStyle>;
    h6?: Partial<TypographyStyle>;
    body?: Partial<TypographyStyle>;
    bodyLarge?: Partial<TypographyStyle>;
    bodySmall?: Partial<TypographyStyle>;
    caption?: Partial<TypographyStyle>;
    overline?: Partial<TypographyStyle>;
    button?: Partial<TypographyStyle>;
    code?: Partial<TypographyStyle>;
  } = {}) {
    this.fontFamily = config.fontFamily || 'system-ui, -apple-system, sans-serif';
    this.headingFontFamily = config.headingFontFamily || this.fontFamily;
    this.monoFontFamily = config.monoFontFamily || 'monospace';

    this.h1 = {
      fontFamily: this.headingFontFamily,
      fontSize: 96,
      fontWeight: FontWeight.Light,
      lineHeight: 1.2,
      letterSpacing: -1.5,
      ...config.h1,
    };

    this.h2 = {
      fontFamily: this.headingFontFamily,
      fontSize: 60,
      fontWeight: FontWeight.Light,
      lineHeight: 1.2,
      letterSpacing: -0.5,
      ...config.h2,
    };

    this.h3 = {
      fontFamily: this.headingFontFamily,
      fontSize: 48,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.25,
      letterSpacing: 0,
      ...config.h3,
    };

    this.h4 = {
      fontFamily: this.headingFontFamily,
      fontSize: 34,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.3,
      letterSpacing: 0.25,
      ...config.h4,
    };

    this.h5 = {
      fontFamily: this.headingFontFamily,
      fontSize: 24,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.4,
      letterSpacing: 0,
      ...config.h5,
    };

    this.h6 = {
      fontFamily: this.headingFontFamily,
      fontSize: 20,
      fontWeight: FontWeight.Medium,
      lineHeight: 1.5,
      letterSpacing: 0.15,
      ...config.h6,
    };

    this.body = {
      fontFamily: this.fontFamily,
      fontSize: 16,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.5,
      letterSpacing: 0.5,
      ...config.body,
    };

    this.bodyLarge = {
      fontFamily: this.fontFamily,
      fontSize: 18,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.5,
      letterSpacing: 0.15,
      ...config.bodyLarge,
    };

    this.bodySmall = {
      fontFamily: this.fontFamily,
      fontSize: 14,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.5,
      letterSpacing: 0.4,
      ...config.bodySmall,
    };

    this.caption = {
      fontFamily: this.fontFamily,
      fontSize: 12,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.4,
      letterSpacing: 0.4,
      ...config.caption,
    };

    this.overline = {
      fontFamily: this.fontFamily,
      fontSize: 10,
      fontWeight: FontWeight.Medium,
      lineHeight: 1.5,
      letterSpacing: 1.5,
      ...config.overline,
    };

    this.button = {
      fontFamily: this.fontFamily,
      fontSize: 14,
      fontWeight: FontWeight.Medium,
      lineHeight: 1.75,
      letterSpacing: 0.4,
      ...config.button,
    };

    this.code = {
      fontFamily: this.monoFontFamily,
      fontSize: 14,
      fontWeight: FontWeight.Normal,
      lineHeight: 1.6,
      letterSpacing: 0,
      ...config.code,
    };
  }

  /**
   * Creates a copy of this typography configuration.
   *
   * @returns A new Typography instance
   */
  clone(): Typography {
    return new Typography({
      fontFamily: this.fontFamily,
      headingFontFamily: this.headingFontFamily,
      monoFontFamily: this.monoFontFamily,
      h1: { ...this.h1 },
      h2: { ...this.h2 },
      h3: { ...this.h3 },
      h4: { ...this.h4 },
      h5: { ...this.h5 },
      h6: { ...this.h6 },
      body: { ...this.body },
      bodyLarge: { ...this.bodyLarge },
      bodySmall: { ...this.bodySmall },
      caption: { ...this.caption },
      overline: { ...this.overline },
      button: { ...this.button },
      code: { ...this.code },
    });
  }

  /**
   * Creates a default typography configuration.
   *
   * @returns A Typography instance with default values
   */
  static createDefault(): Typography {
    return new Typography();
  }

  /**
   * Scales all font sizes by a multiplier.
   *
   * @param scale - Scale multiplier (e.g., 1.2 for 20% larger)
   * @returns A new scaled Typography instance
   */
  scale(scale: number): Typography {
    return new Typography({
      fontFamily: this.fontFamily,
      headingFontFamily: this.headingFontFamily,
      monoFontFamily: this.monoFontFamily,
      h1: { ...this.h1, fontSize: this.h1.fontSize * scale },
      h2: { ...this.h2, fontSize: this.h2.fontSize * scale },
      h3: { ...this.h3, fontSize: this.h3.fontSize * scale },
      h4: { ...this.h4, fontSize: this.h4.fontSize * scale },
      h5: { ...this.h5, fontSize: this.h5.fontSize * scale },
      h6: { ...this.h6, fontSize: this.h6.fontSize * scale },
      body: { ...this.body, fontSize: this.body.fontSize * scale },
      bodyLarge: { ...this.bodyLarge, fontSize: this.bodyLarge.fontSize * scale },
      bodySmall: { ...this.bodySmall, fontSize: this.bodySmall.fontSize * scale },
      caption: { ...this.caption, fontSize: this.caption.fontSize * scale },
      overline: { ...this.overline, fontSize: this.overline.fontSize * scale },
      button: { ...this.button, fontSize: this.button.fontSize * scale },
      code: { ...this.code, fontSize: this.code.fontSize * scale },
    });
  }
}
