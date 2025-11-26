/**
 * Spacing scale system providing consistent spacing values.
 * Uses a 4px base unit for predictable, harmonious spacing.
 */
export class SpacingScale {
  /**
   * Base spacing unit in pixels (default: 4).
   */
  baseUnit: number;

  /**
   * Extra small spacing (0.5 units).
   */
  xs: number;

  /**
   * Small spacing (1 unit).
   */
  sm: number;

  /**
   * Medium spacing (2 units).
   */
  md: number;

  /**
   * Large spacing (3 units).
   */
  lg: number;

  /**
   * Extra large spacing (4 units).
   */
  xl: number;

  /**
   * 2x extra large spacing (6 units).
   */
  xxl: number;

  /**
   * 3x extra large spacing (8 units).
   */
  xxxl: number;

  /**
   * Zero spacing.
   */
  none: number;

  /**
   * Creates a new SpacingScale instance.
   *
   * @param baseUnit - Base spacing unit in pixels (default: 4)
   */
  constructor(baseUnit: number = 4) {
    this.baseUnit = baseUnit;
    this.none = 0;
    this.xs = baseUnit * 0.5;
    this.sm = baseUnit * 1;
    this.md = baseUnit * 2;
    this.lg = baseUnit * 3;
    this.xl = baseUnit * 4;
    this.xxl = baseUnit * 6;
    this.xxxl = baseUnit * 8;
  }

  /**
   * Gets spacing value by multiplying base unit.
   *
   * @param units - Number of base units
   * @returns Spacing value in pixels
   *
   * @example
   * ```typescript
   * const spacing = new SpacingScale(4);
   * const value = spacing.unit(3); // 12px
   * ```
   */
  unit(units: number): number {
    return this.baseUnit * units;
  }

  /**
   * Creates a copy of this spacing scale.
   *
   * @returns A new SpacingScale instance
   */
  clone(): SpacingScale {
    return new SpacingScale(this.baseUnit);
  }

  /**
   * Creates a default spacing scale with 4px base unit.
   *
   * @returns A SpacingScale instance
   */
  static createDefault(): SpacingScale {
    return new SpacingScale(4);
  }

  /**
   * Creates a compact spacing scale with 2px base unit.
   *
   * @returns A SpacingScale instance
   */
  static createCompact(): SpacingScale {
    return new SpacingScale(2);
  }

  /**
   * Creates a comfortable spacing scale with 8px base unit.
   *
   * @returns A SpacingScale instance
   */
  static createComfortable(): SpacingScale {
    return new SpacingScale(8);
  }

  /**
   * Scales all spacing values by a multiplier.
   *
   * @param scale - Scale multiplier
   * @returns A new scaled SpacingScale instance
   */
  scale(scale: number): SpacingScale {
    return new SpacingScale(this.baseUnit * scale);
  }
}
