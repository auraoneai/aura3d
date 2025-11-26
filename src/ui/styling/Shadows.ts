import { Color } from '../../math/Color';
import { Shadow } from './Style';

/**
 * Shadow definitions for creating depth in UI.
 * Provides elevation levels from 0 (flat) to 24 (highest).
 */
export class Shadows {
  /**
   * Shadow color (typically black with transparency).
   */
  shadowColor: Color;

  /**
   * No shadow (elevation 0).
   */
  elevation0: Shadow | null;

  /**
   * Elevation level 1 (subtle).
   */
  elevation1: Shadow;

  /**
   * Elevation level 2.
   */
  elevation2: Shadow;

  /**
   * Elevation level 3.
   */
  elevation3: Shadow;

  /**
   * Elevation level 4.
   */
  elevation4: Shadow;

  /**
   * Elevation level 6.
   */
  elevation6: Shadow;

  /**
   * Elevation level 8.
   */
  elevation8: Shadow;

  /**
   * Elevation level 12.
   */
  elevation12: Shadow;

  /**
   * Elevation level 16.
   */
  elevation16: Shadow;

  /**
   * Elevation level 24 (highest).
   */
  elevation24: Shadow;

  /**
   * Creates a new Shadows instance.
   *
   * @param shadowColor - Base shadow color (default: black with 20% opacity)
   */
  constructor(shadowColor?: Color) {
    this.shadowColor = shadowColor || new Color(0, 0, 0, 0.2);

    this.elevation0 = null;

    this.elevation1 = {
      offsetX: 0,
      offsetY: 1,
      blur: 3,
      spread: 0,
      color: this.shadowColor.clone().set(0, 0, 0, 0.12),
    };

    this.elevation2 = {
      offsetX: 0,
      offsetY: 2,
      blur: 4,
      spread: 0,
      color: this.shadowColor.clone().set(0, 0, 0, 0.14),
    };

    this.elevation3 = {
      offsetX: 0,
      offsetY: 3,
      blur: 6,
      spread: 0,
      color: this.shadowColor.clone().set(0, 0, 0, 0.16),
    };

    this.elevation4 = {
      offsetX: 0,
      offsetY: 4,
      blur: 8,
      spread: 0,
      color: this.shadowColor.clone().set(0, 0, 0, 0.18),
    };

    this.elevation6 = {
      offsetX: 0,
      offsetY: 6,
      blur: 10,
      spread: 0,
      color: this.shadowColor.clone().set(0, 0, 0, 0.2),
    };

    this.elevation8 = {
      offsetX: 0,
      offsetY: 8,
      blur: 12,
      spread: 1,
      color: this.shadowColor.clone().set(0, 0, 0, 0.22),
    };

    this.elevation12 = {
      offsetX: 0,
      offsetY: 12,
      blur: 17,
      spread: 2,
      color: this.shadowColor.clone().set(0, 0, 0, 0.24),
    };

    this.elevation16 = {
      offsetX: 0,
      offsetY: 16,
      blur: 24,
      spread: 2,
      color: this.shadowColor.clone().set(0, 0, 0, 0.26),
    };

    this.elevation24 = {
      offsetX: 0,
      offsetY: 24,
      blur: 38,
      spread: 3,
      color: this.shadowColor.clone().set(0, 0, 0, 0.28),
    };
  }

  /**
   * Gets a shadow by elevation level.
   *
   * @param level - Elevation level (0, 1, 2, 3, 4, 6, 8, 12, 16, or 24)
   * @returns Shadow object or null for elevation 0
   */
  getElevation(level: 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 | 24): Shadow | null {
    switch (level) {
      case 0: return this.elevation0;
      case 1: return this.elevation1;
      case 2: return this.elevation2;
      case 3: return this.elevation3;
      case 4: return this.elevation4;
      case 6: return this.elevation6;
      case 8: return this.elevation8;
      case 12: return this.elevation12;
      case 16: return this.elevation16;
      case 24: return this.elevation24;
      default: return this.elevation1;
    }
  }

  /**
   * Creates a copy of this shadow configuration.
   *
   * @returns A new Shadows instance
   */
  clone(): Shadows {
    return new Shadows(this.shadowColor.clone());
  }

  /**
   * Creates a default shadow configuration for light mode.
   *
   * @returns A Shadows instance
   */
  static createLight(): Shadows {
    return new Shadows(new Color(0, 0, 0, 0.2));
  }

  /**
   * Creates a shadow configuration for dark mode.
   *
   * @returns A Shadows instance with darker shadows
   */
  static createDark(): Shadows {
    return new Shadows(new Color(0, 0, 0, 0.5));
  }

  /**
   * Creates a custom shadow with specified parameters.
   *
   * @param offsetX - Horizontal offset
   * @param offsetY - Vertical offset
   * @param blur - Blur radius
   * @param spread - Spread radius
   * @param color - Shadow color
   * @param inset - Whether the shadow is inset
   * @returns Shadow object
   */
  static createCustom(
    offsetX: number,
    offsetY: number,
    blur: number,
    spread: number,
    color: Color,
    inset?: boolean
  ): Shadow {
    return { offsetX, offsetY, blur, spread, color, inset };
  }
}
