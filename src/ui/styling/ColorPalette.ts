import { Color } from '../../math/Color';

/**
 * Defines a complete color palette with semantic color naming.
 * Used by themes to provide consistent colors across the UI.
 */
export class ColorPalette {
  /**
   * Primary brand color.
   */
  primary: Color;

  /**
   * Secondary brand color.
   */
  secondary: Color;

  /**
   * Accent color for highlights and CTAs.
   */
  accent: Color;

  /**
   * Success state color (typically green).
   */
  success: Color;

  /**
   * Warning state color (typically yellow/orange).
   */
  warning: Color;

  /**
   * Error state color (typically red).
   */
  error: Color;

  /**
   * Info state color (typically blue).
   */
  info: Color;

  /**
   * Background color (main surface).
   */
  background: Color;

  /**
   * Surface color (elevated elements).
   */
  surface: Color;

  /**
   * Primary text color.
   */
  text: Color;

  /**
   * Secondary text color (lower emphasis).
   */
  textSecondary: Color;

  /**
   * Disabled text color.
   */
  textDisabled: Color;

  /**
   * Border color.
   */
  border: Color;

  /**
   * Divider color.
   */
  divider: Color;

  /**
   * Shadow color.
   */
  shadow: Color;

  /**
   * Creates a new ColorPalette instance.
   *
   * @param colors - Object containing color values
   */
  constructor(colors: {
    primary: Color;
    secondary: Color;
    accent: Color;
    success: Color;
    warning: Color;
    error: Color;
    info: Color;
    background: Color;
    surface: Color;
    text: Color;
    textSecondary: Color;
    textDisabled: Color;
    border: Color;
    divider: Color;
    shadow: Color;
  }) {
    this.primary = colors.primary;
    this.secondary = colors.secondary;
    this.accent = colors.accent;
    this.success = colors.success;
    this.warning = colors.warning;
    this.error = colors.error;
    this.info = colors.info;
    this.background = colors.background;
    this.surface = colors.surface;
    this.text = colors.text;
    this.textSecondary = colors.textSecondary;
    this.textDisabled = colors.textDisabled;
    this.border = colors.border;
    this.divider = colors.divider;
    this.shadow = colors.shadow;
  }

  /**
   * Creates a copy of this color palette.
   *
   * @returns A new ColorPalette instance with cloned colors
   */
  clone(): ColorPalette {
    return new ColorPalette({
      primary: this.primary.clone(),
      secondary: this.secondary.clone(),
      accent: this.accent.clone(),
      success: this.success.clone(),
      warning: this.warning.clone(),
      error: this.error.clone(),
      info: this.info.clone(),
      background: this.background.clone(),
      surface: this.surface.clone(),
      text: this.text.clone(),
      textSecondary: this.textSecondary.clone(),
      textDisabled: this.textDisabled.clone(),
      border: this.border.clone(),
      divider: this.divider.clone(),
      shadow: this.shadow.clone(),
    });
  }

  /**
   * Creates a default light color palette.
   *
   * @returns A light-themed ColorPalette
   */
  static createLight(): ColorPalette {
    return new ColorPalette({
      primary: Color.fromHexString('#1976D2'),
      secondary: Color.fromHexString('#424242'),
      accent: Color.fromHexString('#FF4081'),
      success: Color.fromHexString('#4CAF50'),
      warning: Color.fromHexString('#FF9800'),
      error: Color.fromHexString('#F44336'),
      info: Color.fromHexString('#2196F3'),
      background: Color.fromHexString('#FAFAFA'),
      surface: Color.fromHexString('#FFFFFF'),
      text: Color.fromHexString('#212121'),
      textSecondary: Color.fromHexString('#757575'),
      textDisabled: Color.fromHexString('#BDBDBD'),
      border: Color.fromHexString('#E0E0E0'),
      divider: Color.fromHexString('#E0E0E0'),
      shadow: new Color(0, 0, 0, 0.2),
    });
  }

  /**
   * Creates a default dark color palette.
   *
   * @returns A dark-themed ColorPalette
   */
  static createDark(): ColorPalette {
    return new ColorPalette({
      primary: Color.fromHexString('#90CAF9'),
      secondary: Color.fromHexString('#CE93D8'),
      accent: Color.fromHexString('#FF4081'),
      success: Color.fromHexString('#66BB6A'),
      warning: Color.fromHexString('#FFA726'),
      error: Color.fromHexString('#EF5350'),
      info: Color.fromHexString('#42A5F5'),
      background: Color.fromHexString('#121212'),
      surface: Color.fromHexString('#1E1E1E'),
      text: Color.fromHexString('#FFFFFF'),
      textSecondary: Color.fromHexString('#B0B0B0'),
      textDisabled: Color.fromHexString('#666666'),
      border: Color.fromHexString('#2C2C2C'),
      divider: Color.fromHexString('#2C2C2C'),
      shadow: new Color(0, 0, 0, 0.5),
    });
  }

  /**
   * Creates a custom color palette with automatic generation of related colors.
   *
   * @param primary - Primary color
   * @param mode - 'light' or 'dark' mode
   * @returns A generated ColorPalette
   */
  static createCustom(primary: Color, mode: 'light' | 'dark' = 'light'): ColorPalette {
    const hsl = primary.toHSL();

    // Generate secondary color by shifting hue
    const secondary = Color.fromHSL((hsl.h + 0.5) % 1, hsl.s, hsl.l);

    // Generate accent color
    const accent = Color.fromHSL((hsl.h + 0.33) % 1, Math.min(hsl.s * 1.2, 1), hsl.l);

    if (mode === 'light') {
      return new ColorPalette({
        primary,
        secondary,
        accent,
        success: Color.fromHexString('#4CAF50'),
        warning: Color.fromHexString('#FF9800'),
        error: Color.fromHexString('#F44336'),
        info: Color.fromHexString('#2196F3'),
        background: Color.fromHexString('#FAFAFA'),
        surface: Color.fromHexString('#FFFFFF'),
        text: Color.fromHexString('#212121'),
        textSecondary: Color.fromHexString('#757575'),
        textDisabled: Color.fromHexString('#BDBDBD'),
        border: Color.fromHexString('#E0E0E0'),
        divider: Color.fromHexString('#E0E0E0'),
        shadow: new Color(0, 0, 0, 0.2),
      });
    } else {
      return new ColorPalette({
        primary,
        secondary,
        accent,
        success: Color.fromHexString('#66BB6A'),
        warning: Color.fromHexString('#FFA726'),
        error: Color.fromHexString('#EF5350'),
        info: Color.fromHexString('#42A5F5'),
        background: Color.fromHexString('#121212'),
        surface: Color.fromHexString('#1E1E1E'),
        text: Color.fromHexString('#FFFFFF'),
        textSecondary: Color.fromHexString('#B0B0B0'),
        textDisabled: Color.fromHexString('#666666'),
        border: Color.fromHexString('#2C2C2C'),
        divider: Color.fromHexString('#2C2C2C'),
        shadow: new Color(0, 0, 0, 0.5),
      });
    }
  }
}
