import { Color } from '../../math/Color';
import { BorderRadius, BorderStyle, Border } from './Style';

/**
 * Border radius presets for consistent rounded corners.
 */
export class BorderRadii {
  /**
   * No radius (sharp corners).
   */
  none: number;

  /**
   * Small radius (subtle rounding).
   */
  sm: number;

  /**
   * Medium radius (default).
   */
  md: number;

  /**
   * Large radius (prominent rounding).
   */
  lg: number;

  /**
   * Extra large radius.
   */
  xl: number;

  /**
   * Full radius (pill/circle shape).
   */
  full: number;

  /**
   * Creates a new BorderRadii instance.
   *
   * @param config - Configuration object with radius values
   */
  constructor(config?: {
    none?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    full?: number;
  }) {
    this.none = config?.none ?? 0;
    this.sm = config?.sm ?? 2;
    this.md = config?.md ?? 4;
    this.lg = config?.lg ?? 8;
    this.xl = config?.xl ?? 16;
    this.full = config?.full ?? 9999;
  }

  /**
   * Creates a BorderRadius object for all corners.
   *
   * @param radius - Radius value
   * @returns BorderRadius object
   */
  all(radius: number): BorderRadius {
    return {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    };
  }

  /**
   * Creates a BorderRadius object for top corners only.
   *
   * @param radius - Radius value
   * @returns BorderRadius object
   */
  top(radius: number): BorderRadius {
    return {
      topLeft: radius,
      topRight: radius,
      bottomRight: 0,
      bottomLeft: 0,
    };
  }

  /**
   * Creates a BorderRadius object for bottom corners only.
   *
   * @param radius - Radius value
   * @returns BorderRadius object
   */
  bottom(radius: number): BorderRadius {
    return {
      topLeft: 0,
      topRight: 0,
      bottomRight: radius,
      bottomLeft: radius,
    };
  }

  /**
   * Creates a BorderRadius object for left corners only.
   *
   * @param radius - Radius value
   * @returns BorderRadius object
   */
  left(radius: number): BorderRadius {
    return {
      topLeft: radius,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: radius,
    };
  }

  /**
   * Creates a BorderRadius object for right corners only.
   *
   * @param radius - Radius value
   * @returns BorderRadius object
   */
  right(radius: number): BorderRadius {
    return {
      topLeft: 0,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: 0,
    };
  }

  /**
   * Creates a copy of this border radii configuration.
   *
   * @returns A new BorderRadii instance
   */
  clone(): BorderRadii {
    return new BorderRadii({
      none: this.none,
      sm: this.sm,
      md: this.md,
      lg: this.lg,
      xl: this.xl,
      full: this.full,
    });
  }

  /**
   * Creates a default border radii configuration.
   *
   * @returns A BorderRadii instance
   */
  static createDefault(): BorderRadii {
    return new BorderRadii();
  }

  /**
   * Scales all border radii by a multiplier.
   *
   * @param scale - Scale multiplier
   * @returns A new scaled BorderRadii instance
   */
  scale(scale: number): BorderRadii {
    return new BorderRadii({
      none: this.none,
      sm: this.sm * scale,
      md: this.md * scale,
      lg: this.lg * scale,
      xl: this.xl * scale,
      full: this.full,
    });
  }
}

/**
 * Border width presets for consistent border sizes.
 */
export class BorderWidths {
  /**
   * No border.
   */
  none: number;

  /**
   * Thin border.
   */
  thin: number;

  /**
   * Medium border (default).
   */
  medium: number;

  /**
   * Thick border.
   */
  thick: number;

  /**
   * Creates a new BorderWidths instance.
   *
   * @param config - Configuration object with width values
   */
  constructor(config?: {
    none?: number;
    thin?: number;
    medium?: number;
    thick?: number;
  }) {
    this.none = config?.none ?? 0;
    this.thin = config?.thin ?? 1;
    this.medium = config?.medium ?? 2;
    this.thick = config?.thick ?? 4;
  }

  /**
   * Creates a Border object with the specified width, style, and color.
   *
   * @param width - Border width
   * @param style - Border style
   * @param color - Border color
   * @returns Border object
   */
  create(width: number, style: BorderStyle, color: Color): Border {
    return { width, style, color };
  }

  /**
   * Creates a copy of this border widths configuration.
   *
   * @returns A new BorderWidths instance
   */
  clone(): BorderWidths {
    return new BorderWidths({
      none: this.none,
      thin: this.thin,
      medium: this.medium,
      thick: this.thick,
    });
  }

  /**
   * Creates a default border widths configuration.
   *
   * @returns A BorderWidths instance
   */
  static createDefault(): BorderWidths {
    return new BorderWidths();
  }

  /**
   * Scales all border widths by a multiplier.
   *
   * @param scale - Scale multiplier
   * @returns A new scaled BorderWidths instance
   */
  scale(scale: number): BorderWidths {
    return new BorderWidths({
      none: this.none,
      thin: this.thin * scale,
      medium: this.medium * scale,
      thick: this.thick * scale,
    });
  }
}
