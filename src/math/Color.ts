import { EPSILON, nearlyEqual, clamp } from './MathConstants';

/**
 * Represents an RGB/RGBA color with support for color space conversions.
 *
 * Colors are stored internally in linear color space with values typically in [0, 1] range,
 * though HDR values exceeding 1.0 are supported. Alpha is always in [0, 1] range.
 *
 * @example
 * ```typescript
 * // Create colors
 * const red = new Color(1, 0, 0);
 * const blue = Color.fromHex(0x0000FF);
 * const green = Color.fromHexString('#00FF00');
 *
 * // Color operations
 * const purple = red.add(blue);
 * const darkRed = red.scale(0.5);
 *
 * // Color space conversions
 * const srgb = purple.toSRGB();
 * const linear = srgb.toLinear();
 *
 * // Format conversions
 * const hex = red.toHex(); // 0xFF0000
 * const css = red.toCSSString(); // "rgb(255, 0, 0)"
 * ```
 */
export class Color {
  /**
   * Red component in linear color space [0, 1] (can exceed 1 for HDR)
   */
  r: number;

  /**
   * Green component in linear color space [0, 1] (can exceed 1 for HDR)
   */
  g: number;

  /**
   * Blue component in linear color space [0, 1] (can exceed 1 for HDR)
   */
  b: number;

  /**
   * Alpha component [0, 1]
   */
  a: number;

  /**
   * Creates a new Color instance.
   *
   * @param r - Red component (default: 1)
   * @param g - Green component (default: 1)
   * @param b - Blue component (default: 1)
   * @param a - Alpha component (default: 1)
   *
   * @example
   * ```typescript
   * const white = new Color();
   * const red = new Color(1, 0, 0);
   * const semiTransparent = new Color(1, 1, 1, 0.5);
   * ```
   */
  constructor(r: number = 1, g: number = 1, b: number = 1, a: number = 1) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  /**
   * Adds another color to this color and returns a new Color.
   *
   * @param c - Color to add
   * @returns New color with added components
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const green = new Color(0, 1, 0);
   * const yellow = red.add(green); // (1, 1, 0)
   * ```
   */
  add(c: Color): Color {
    return new Color(this.r + c.r, this.g + c.g, this.b + c.b, this.a + c.a);
  }

  /**
   * Subtracts another color from this color and returns a new Color.
   *
   * @param c - Color to subtract
   * @returns New color with subtracted components
   *
   * @example
   * ```typescript
   * const white = new Color(1, 1, 1);
   * const red = new Color(1, 0, 0);
   * const cyan = white.sub(red); // (0, 1, 1)
   * ```
   */
  sub(c: Color): Color {
    return new Color(this.r - c.r, this.g - c.g, this.b - c.b, this.a - c.a);
  }

  /**
   * Multiplies this color by another color component-wise and returns a new Color.
   *
   * @param c - Color to multiply by
   * @returns New color with multiplied components
   *
   * @example
   * ```typescript
   * const color = new Color(1, 0.5, 0.25);
   * const half = new Color(0.5, 0.5, 0.5);
   * const result = color.multiply(half); // (0.5, 0.25, 0.125)
   * ```
   */
  multiply(c: Color): Color {
    return new Color(this.r * c.r, this.g * c.g, this.b * c.b, this.a * c.a);
  }

  /**
   * Scales this color by a scalar value and returns a new Color.
   *
   * @param s - Scalar value to multiply by
   * @returns New scaled color
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const darkRed = red.scale(0.5); // (0.5, 0, 0)
   * const hdrRed = red.scale(2.0); // (2, 0, 0) - HDR value
   * ```
   */
  scale(s: number): Color {
    return new Color(this.r * s, this.g * s, this.b * s, this.a);
  }

  /**
   * Linearly interpolates between this color and another color.
   *
   * @param c - Target color
   * @param t - Interpolation factor [0, 1]
   * @returns New interpolated color
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const blue = new Color(0, 0, 1);
   * const purple = red.lerp(blue, 0.5); // (0.5, 0, 0.5)
   * ```
   */
  lerp(c: Color, t: number): Color {
    return new Color(
      this.r + (c.r - this.r) * t,
      this.g + (c.g - this.g) * t,
      this.b + (c.b - this.b) * t,
      this.a + (c.a - this.a) * t
    );
  }

  /**
   * Converts from sRGB to linear color space and returns a new Color.
   * Uses gamma correction with approximation: pow(x, 2.2)
   *
   * @returns New color in linear color space
   *
   * @example
   * ```typescript
   * const srgb = new Color(0.5, 0.5, 0.5);
   * const linear = srgb.toLinear(); // ~(0.214, 0.214, 0.214)
   * ```
   */
  toLinear(): Color {
    return new Color(
      this._srgbToLinear(this.r),
      this._srgbToLinear(this.g),
      this._srgbToLinear(this.b),
      this.a
    );
  }

  /**
   * Converts from linear to sRGB color space and returns a new Color.
   * Uses gamma correction with approximation: pow(x, 1/2.2)
   *
   * @returns New color in sRGB color space
   *
   * @example
   * ```typescript
   * const linear = new Color(0.214, 0.214, 0.214);
   * const srgb = linear.toSRGB(); // ~(0.5, 0.5, 0.5)
   * ```
   */
  toSRGB(): Color {
    return new Color(
      this._linearToSRGB(this.r),
      this._linearToSRGB(this.g),
      this._linearToSRGB(this.b),
      this.a
    );
  }

  /**
   * Converts to premultiplied alpha and returns a new Color.
   * RGB components are multiplied by the alpha value.
   *
   * @returns New color with premultiplied alpha
   *
   * @example
   * ```typescript
   * const color = new Color(1, 0.5, 0.25, 0.5);
   * const premul = color.toPremultipliedAlpha(); // (0.5, 0.25, 0.125, 0.5)
   * ```
   */
  toPremultipliedAlpha(): Color {
    return new Color(this.r * this.a, this.g * this.a, this.b * this.a, this.a);
  }

  /**
   * Converts from premultiplied alpha to unpremultiplied and returns a new Color.
   * RGB components are divided by the alpha value (if non-zero).
   *
   * @returns New color with unpremultiplied alpha
   *
   * @example
   * ```typescript
   * const premul = new Color(0.5, 0.25, 0.125, 0.5);
   * const unpremul = premul.toUnpremultipliedAlpha(); // (1, 0.5, 0.25, 0.5)
   * ```
   */
  toUnpremultipliedAlpha(): Color {
    if (this.a < EPSILON) {
      return new Color(this.r, this.g, this.b, this.a);
    }
    const invAlpha = 1 / this.a;
    return new Color(this.r * invAlpha, this.g * invAlpha, this.b * invAlpha, this.a);
  }

  /**
   * Sets this color from a hexadecimal value.
   *
   * @param hex - Hex value (0xRRGGBB or 0xRRGGBBAA)
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.setHex(0xFF0000); // Red
   * color.setHex(0xFF0000FF); // Red with full alpha
   * ```
   */
  setHex(hex: number): this {
    if (hex > 0xFFFFFF) {
      // 0xRRGGBBAA format
      this.r = ((hex >> 24) & 0xFF) / 255;
      this.g = ((hex >> 16) & 0xFF) / 255;
      this.b = ((hex >> 8) & 0xFF) / 255;
      this.a = (hex & 0xFF) / 255;
    } else {
      // 0xRRGGBB format
      this.r = ((hex >> 16) & 0xFF) / 255;
      this.g = ((hex >> 8) & 0xFF) / 255;
      this.b = (hex & 0xFF) / 255;
      this.a = 1;
    }
    return this;
  }

  /**
   * Sets this color from HSL values.
   *
   * @param h - Hue [0, 1]
   * @param s - Saturation [0, 1]
   * @param l - Lightness [0, 1]
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.setHSL(0, 1, 0.5); // Pure red
   * color.setHSL(0.333, 1, 0.5); // Pure green
   * ```
   */
  setHSL(h: number, s: number, l: number): this {
    h = ((h % 1) + 1) % 1; // Wrap to [0, 1]
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);

    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      this.r = this._hueToRGB(p, q, h + 1 / 3);
      this.g = this._hueToRGB(p, q, h);
      this.b = this._hueToRGB(p, q, h - 1 / 3);
    }
    return this;
  }

  /**
   * Sets this color from HSV values.
   *
   * @param h - Hue [0, 1]
   * @param s - Saturation [0, 1]
   * @param v - Value [0, 1]
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.setHSV(0, 1, 1); // Pure red
   * color.setHSV(0.667, 1, 1); // Pure blue
   * ```
   */
  setHSV(h: number, s: number, v: number): this {
    h = ((h % 1) + 1) % 1; // Wrap to [0, 1]
    s = clamp(s, 0, 1);
    v = clamp(v, 0, 1);

    if (s === 0) {
      this.r = this.g = this.b = v;
    } else {
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);

      switch (i % 6) {
        case 0: this.r = v; this.g = t; this.b = p; break;
        case 1: this.r = q; this.g = v; this.b = p; break;
        case 2: this.r = p; this.g = v; this.b = t; break;
        case 3: this.r = p; this.g = q; this.b = v; break;
        case 4: this.r = t; this.g = p; this.b = v; break;
        case 5: this.r = v; this.g = p; this.b = q; break;
      }
    }
    return this;
  }

  /**
   * Sets RGB components of this color.
   *
   * @param r - Red component
   * @param g - Green component
   * @param b - Blue component
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.setRGB(1, 0, 0); // Red
   * ```
   */
  setRGB(r: number, g: number, b: number): this {
    this.r = r;
    this.g = g;
    this.b = b;
    return this;
  }

  /**
   * Sets this color based on color temperature in Kelvin.
   * Uses Planckian locus approximation.
   *
   * @param kelvin - Color temperature in Kelvin (1000-40000)
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.setTemperature(2700); // Warm incandescent
   * color.setTemperature(6500); // Daylight
   * color.setTemperature(9000); // Cool blue
   * ```
   */
  setTemperature(kelvin: number): this {
    kelvin = clamp(kelvin, 1000, 40000);
    const temp = kelvin / 100;

    // Red
    if (temp <= 66) {
      this.r = 1;
    } else {
      const red = temp - 60;
      this.r = clamp(1.292936186 * Math.pow(red, -0.1332047592), 0, 1);
    }

    // Green
    if (temp <= 66) {
      const green = temp;
      this.g = clamp(0.390081579 * Math.log(green) - 0.631841444, 0, 1);
    } else {
      const green = temp - 60;
      this.g = clamp(1.129890861 * Math.pow(green, -0.0755148492), 0, 1);
    }

    // Blue
    if (temp >= 66) {
      this.b = 1;
    } else if (temp <= 19) {
      this.b = 0;
    } else {
      const blue = temp - 10;
      this.b = clamp(0.543206789 * Math.log(blue) - 1.196254089, 0, 1);
    }

    return this;
  }

  /**
   * Converts this color to a hexadecimal number.
   *
   * @returns Hex value (0xRRGGBB or 0xRRGGBBAA if alpha < 1)
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const hex = red.toHex(); // 0xFF0000
   * ```
   */
  toHex(): number {
    const r = Math.round(clamp(this.r, 0, 1) * 255);
    const g = Math.round(clamp(this.g, 0, 1) * 255);
    const b = Math.round(clamp(this.b, 0, 1) * 255);

    if (this.a < 1) {
      const a = Math.round(clamp(this.a, 0, 1) * 255);
      return (r << 24) | (g << 16) | (b << 8) | a;
    }
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Converts this color to a hexadecimal string.
   *
   * @returns Hex string ("#RRGGBB" or "#RRGGBBAA" if alpha < 1)
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const hex = red.toHexString(); // "#FF0000"
   * ```
   */
  toHexString(): string {
    const r = Math.round(clamp(this.r, 0, 1) * 255);
    const g = Math.round(clamp(this.g, 0, 1) * 255);
    const b = Math.round(clamp(this.b, 0, 1) * 255);

    if (this.a < 1) {
      const a = Math.round(clamp(this.a, 0, 1) * 255);
      return `#${this._toHexByte(r)}${this._toHexByte(g)}${this._toHexByte(b)}${this._toHexByte(a)}`;
    }
    return `#${this._toHexByte(r)}${this._toHexByte(g)}${this._toHexByte(b)}`;
  }

  /**
   * Converts this color to HSL values.
   *
   * @returns Object with h, s, l values in [0, 1]
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const hsl = red.toHSL(); // { h: 0, s: 1, l: 0.5 }
   * ```
   */
  toHSL(): { h: number; s: number; l: number } {
    const r = clamp(this.r, 0, 1);
    const g = clamp(this.g, 0, 1);
    const b = clamp(this.b, 0, 1);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
      return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h: number;
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;

    return { h, s, l };
  }

  /**
   * Converts this color to HSV values.
   *
   * @returns Object with h, s, v values in [0, 1]
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const hsv = red.toHSV(); // { h: 0, s: 1, v: 1 }
   * ```
   */
  toHSV(): { h: number; s: number; v: number } {
    const r = clamp(this.r, 0, 1);
    const g = clamp(this.g, 0, 1);
    const b = clamp(this.b, 0, 1);

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;

    if (max === min) {
      return { h: 0, s: 0, v };
    }

    const d = max - min;
    const s = max === 0 ? 0 : d / max;

    let h: number;
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;

    return { h, s, v };
  }

  /**
   * Converts this color to a CSS string.
   *
   * @returns CSS string ("rgb(r, g, b)" or "rgba(r, g, b, a)")
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const css = red.toCSSString(); // "rgb(255, 0, 0)"
   *
   * const transparent = new Color(1, 0, 0, 0.5);
   * const css2 = transparent.toCSSString(); // "rgba(255, 0, 0, 0.5)"
   * ```
   */
  toCSSString(): string {
    const r = Math.round(clamp(this.r, 0, 1) * 255);
    const g = Math.round(clamp(this.g, 0, 1) * 255);
    const b = Math.round(clamp(this.b, 0, 1) * 255);

    if (this.a < 1) {
      return `rgba(${r}, ${g}, ${b}, ${this.a})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Adds another color to this color in-place.
   *
   * @param c - Color to add
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(0.5, 0.5, 0.5);
   * color.addInPlace(new Color(0.25, 0.25, 0.25)); // (0.75, 0.75, 0.75)
   * ```
   */
  addInPlace(c: Color): this {
    this.r += c.r;
    this.g += c.g;
    this.b += c.b;
    this.a += c.a;
    return this;
  }

  /**
   * Subtracts another color from this color in-place.
   *
   * @param c - Color to subtract
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(1, 1, 1);
   * color.subInPlace(new Color(0.5, 0.5, 0.5)); // (0.5, 0.5, 0.5)
   * ```
   */
  subInPlace(c: Color): this {
    this.r -= c.r;
    this.g -= c.g;
    this.b -= c.b;
    this.a -= c.a;
    return this;
  }

  /**
   * Multiplies this color by another color component-wise in-place.
   *
   * @param c - Color to multiply by
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(1, 0.5, 0.25);
   * color.multiplyInPlace(new Color(0.5, 0.5, 0.5)); // (0.5, 0.25, 0.125)
   * ```
   */
  multiplyInPlace(c: Color): this {
    this.r *= c.r;
    this.g *= c.g;
    this.b *= c.b;
    this.a *= c.a;
    return this;
  }

  /**
   * Scales this color by a scalar value in-place.
   *
   * @param s - Scalar value to multiply by
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(1, 0.5, 0.25);
   * color.scaleInPlace(2); // (2, 1, 0.5)
   * ```
   */
  scaleInPlace(s: number): this {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }

  /**
   * Linearly interpolates between this color and another color in-place.
   *
   * @param c - Target color
   * @param t - Interpolation factor [0, 1]
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(1, 0, 0);
   * color.lerpInPlace(new Color(0, 0, 1), 0.5); // (0.5, 0, 0.5)
   * ```
   */
  lerpInPlace(c: Color, t: number): this {
    this.r += (c.r - this.r) * t;
    this.g += (c.g - this.g) * t;
    this.b += (c.b - this.b) * t;
    this.a += (c.a - this.a) * t;
    return this;
  }

  /**
   * Converts from sRGB to linear color space in-place.
   *
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(0.5, 0.5, 0.5);
   * color.toLinearInPlace(); // ~(0.214, 0.214, 0.214)
   * ```
   */
  toLinearInPlace(): this {
    this.r = this._srgbToLinear(this.r);
    this.g = this._srgbToLinear(this.g);
    this.b = this._srgbToLinear(this.b);
    return this;
  }

  /**
   * Converts from linear to sRGB color space in-place.
   *
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color(0.214, 0.214, 0.214);
   * color.toSRGBInPlace(); // ~(0.5, 0.5, 0.5)
   * ```
   */
  toSRGBInPlace(): this {
    this.r = this._linearToSRGB(this.r);
    this.g = this._linearToSRGB(this.g);
    this.b = this._linearToSRGB(this.b);
    return this;
  }

  /**
   * Sets all components of this color.
   *
   * @param r - Red component
   * @param g - Green component
   * @param b - Blue component
   * @param a - Alpha component (default: 1)
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.set(1, 0, 0, 0.5); // Semi-transparent red
   * ```
   */
  set(r: number, g: number, b: number, a: number = 1): this {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
    return this;
  }

  /**
   * Creates a copy of this color.
   *
   * @returns New color with same values
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const redCopy = red.clone();
   * ```
   */
  clone(): Color {
    return new Color(this.r, this.g, this.b, this.a);
  }

  /**
   * Copies values from another color to this color.
   *
   * @param c - Color to copy from
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color1 = new Color(1, 0, 0);
   * const color2 = new Color();
   * color2.copy(color1); // color2 is now red
   * ```
   */
  copy(c: Color): this {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    this.a = c.a;
    return this;
  }

  /**
   * Checks if this color is equal to another color.
   *
   * @param c - Color to compare with
   * @param epsilon - Tolerance for comparison (default: EPSILON)
   * @returns True if colors are equal within epsilon
   *
   * @example
   * ```typescript
   * const color1 = new Color(1, 0, 0);
   * const color2 = new Color(1.0001, 0, 0);
   * const equal = color1.equals(color2, 0.001); // true
   * ```
   */
  equals(c: Color, epsilon: number = EPSILON): boolean {
    return (
      nearlyEqual(this.r, c.r, epsilon) &&
      nearlyEqual(this.g, c.g, epsilon) &&
      nearlyEqual(this.b, c.b, epsilon) &&
      nearlyEqual(this.a, c.a, epsilon)
    );
  }

  /**
   * Converts this color to an array [r, g, b, a].
   *
   * @returns Array of color components
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0, 1);
   * const arr = red.toArray(); // [1, 0, 0, 1]
   * ```
   */
  toArray(): [number, number, number, number] {
    return [this.r, this.g, this.b, this.a];
  }

  /**
   * Sets this color from an array of values.
   *
   * @param arr - Array containing color components
   * @param offset - Offset in array to start reading from (default: 0)
   * @returns This color for chaining
   *
   * @example
   * ```typescript
   * const color = new Color();
   * color.fromArray([1, 0, 0, 1]); // Red
   * color.fromArray([0, 1, 0, 0, 1], 1); // Green, reading from offset 1
   * ```
   */
  fromArray(arr: ArrayLike<number>, offset: number = 0): this {
    this.r = arr[offset];
    this.g = arr[offset + 1];
    this.b = arr[offset + 2];
    this.a = arr[offset + 3] !== undefined ? arr[offset + 3] : 1;
    return this;
  }

  /**
   * Converts this color to a JSON object.
   *
   * @returns Object with r, g, b, a properties
   *
   * @example
   * ```typescript
   * const red = new Color(1, 0, 0);
   * const json = red.toJSON(); // { r: 1, g: 0, b: 0, a: 1 }
   * ```
   */
  toJSON(): { r: number; g: number; b: number; a: number } {
    return { r: this.r, g: this.g, b: this.b, a: this.a };
  }

  /**
   * Calculates the perceptual luminance of this color.
   * Uses the formula: 0.2126*R + 0.7152*G + 0.0722*B
   *
   * @returns Luminance value [0, 1] (or higher for HDR)
   *
   * @example
   * ```typescript
   * const white = new Color(1, 1, 1);
   * const lum = white.luminance(); // 1.0
   *
   * const red = new Color(1, 0, 0);
   * const redLum = red.luminance(); // 0.2126
   * ```
   */
  luminance(): number {
    return 0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b;
  }

  /**
   * Creates a white color.
   *
   * @returns New white color (1, 1, 1, 1)
   *
   * @example
   * ```typescript
   * const white = Color.white();
   * ```
   */
  static white(): Color {
    return new Color(1, 1, 1, 1);
  }

  /**
   * Creates a black color.
   *
   * @returns New black color (0, 0, 0, 1)
   *
   * @example
   * ```typescript
   * const black = Color.black();
   * ```
   */
  static black(): Color {
    return new Color(0, 0, 0, 1);
  }

  /**
   * Creates a red color.
   *
   * @returns New red color (1, 0, 0, 1)
   *
   * @example
   * ```typescript
   * const red = Color.red();
   * ```
   */
  static red(): Color {
    return new Color(1, 0, 0, 1);
  }

  /**
   * Creates a green color.
   *
   * @returns New green color (0, 1, 0, 1)
   *
   * @example
   * ```typescript
   * const green = Color.green();
   * ```
   */
  static green(): Color {
    return new Color(0, 1, 0, 1);
  }

  /**
   * Creates a blue color.
   *
   * @returns New blue color (0, 0, 1, 1)
   *
   * @example
   * ```typescript
   * const blue = Color.blue();
   * ```
   */
  static blue(): Color {
    return new Color(0, 0, 1, 1);
  }

  /**
   * Creates a yellow color.
   *
   * @returns New yellow color (1, 1, 0, 1)
   *
   * @example
   * ```typescript
   * const yellow = Color.yellow();
   * ```
   */
  static yellow(): Color {
    return new Color(1, 1, 0, 1);
  }

  /**
   * Creates a cyan color.
   *
   * @returns New cyan color (0, 1, 1, 1)
   *
   * @example
   * ```typescript
   * const cyan = Color.cyan();
   * ```
   */
  static cyan(): Color {
    return new Color(0, 1, 1, 1);
  }

  /**
   * Creates a magenta color.
   *
   * @returns New magenta color (1, 0, 1, 1)
   *
   * @example
   * ```typescript
   * const magenta = Color.magenta();
   * ```
   */
  static magenta(): Color {
    return new Color(1, 0, 1, 1);
  }

  /**
   * Creates a transparent color.
   *
   * @returns New transparent color (0, 0, 0, 0)
   *
   * @example
   * ```typescript
   * const transparent = Color.transparent();
   * ```
   */
  static transparent(): Color {
    return new Color(0, 0, 0, 0);
  }

  /**
   * Creates a color from a hexadecimal value.
   *
   * @param hex - Hex value (0xRRGGBB or 0xRRGGBBAA)
   * @returns New color
   *
   * @example
   * ```typescript
   * const red = Color.fromHex(0xFF0000);
   * const semiRed = Color.fromHex(0xFF000080);
   * ```
   */
  static fromHex(hex: number): Color {
    return new Color().setHex(hex);
  }

  /**
   * Creates a color from a hexadecimal string.
   * Supports formats: "#RGB", "#RRGGBB", "#RRGGBBAA"
   *
   * @param hex - Hex string
   * @returns New color
   *
   * @example
   * ```typescript
   * const red = Color.fromHexString('#F00');
   * const green = Color.fromHexString('#00FF00');
   * const blue = Color.fromHexString('#0000FFFF');
   * ```
   */
  static fromHexString(hex: string): Color {
    hex = hex.trim();
    if (hex[0] === '#') {
      hex = hex.substring(1);
    }

    const color = new Color();

    if (hex.length === 3) {
      // #RGB
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      color.set(r, g, b, 1);
    } else if (hex.length === 6) {
      // #RRGGBB
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      color.set(r, g, b, 1);
    } else if (hex.length === 8) {
      // #RRGGBBAA
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = parseInt(hex.substring(6, 8), 16) / 255;
      color.set(r, g, b, a);
    }

    return color;
  }

  /**
   * Creates a color from a CSS color string.
   * Supports: hex (#RGB, #RRGGBB, #RRGGBBAA), rgb(), rgba(), hsl(), hsla(), and named colors.
   *
   * @param css - CSS color string
   * @returns New color
   *
   * @example
   * ```typescript
   * const red1 = Color.fromCSS('#FF0000');
   * const red2 = Color.fromCSS('rgb(255, 0, 0)');
   * const red3 = Color.fromCSS('rgba(255, 0, 0, 1)');
   * const red4 = Color.fromCSS('hsl(0, 100%, 50%)');
   * const red5 = Color.fromCSS('red');
   * ```
   */
  static fromCSS(css: string): Color {
    css = css.trim().toLowerCase();

    // Hex format
    if (css[0] === '#') {
      return Color.fromHexString(css);
    }

    // Named colors
    if (CSS_COLORS[css]) {
      return Color.fromHex(CSS_COLORS[css]);
    }

    // rgb() or rgba()
    const rgbMatch = css.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]) / 255;
      const g = parseInt(rgbMatch[2]) / 255;
      const b = parseInt(rgbMatch[3]) / 255;
      const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
      return new Color(r, g, b, a);
    }

    // hsl() or hsla()
    const hslMatch = css.match(/^hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (hslMatch) {
      const h = parseFloat(hslMatch[1]) / 360;
      const s = parseFloat(hslMatch[2]) / 100;
      const l = parseFloat(hslMatch[3]) / 100;
      const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
      const color = new Color();
      color.setHSL(h, s, l);
      color.a = a;
      return color;
    }

    // Default to white if parsing fails
    return Color.white();
  }

  /**
   * Creates a color from HSL values.
   *
   * @param h - Hue [0, 1]
   * @param s - Saturation [0, 1]
   * @param l - Lightness [0, 1]
   * @returns New color
   *
   * @example
   * ```typescript
   * const red = Color.fromHSL(0, 1, 0.5);
   * const green = Color.fromHSL(0.333, 1, 0.5);
   * ```
   */
  static fromHSL(h: number, s: number, l: number): Color {
    return new Color().setHSL(h, s, l);
  }

  /**
   * Creates a color from HSV values.
   *
   * @param h - Hue [0, 1]
   * @param s - Saturation [0, 1]
   * @param v - Value [0, 1]
   * @returns New color
   *
   * @example
   * ```typescript
   * const red = Color.fromHSV(0, 1, 1);
   * const blue = Color.fromHSV(0.667, 1, 1);
   * ```
   */
  static fromHSV(h: number, s: number, v: number): Color {
    return new Color().setHSV(h, s, v);
  }

  /**
   * Creates a color from color temperature in Kelvin.
   *
   * @param kelvin - Color temperature in Kelvin (1000-40000)
   * @returns New color
   *
   * @example
   * ```typescript
   * const warm = Color.fromTemperature(2700);
   * const daylight = Color.fromTemperature(6500);
   * const cool = Color.fromTemperature(9000);
   * ```
   */
  static fromTemperature(kelvin: number): Color {
    return new Color().setTemperature(kelvin);
  }

  /**
   * Converts a single sRGB component to linear space.
   *
   * @param c - Component value in sRGB space
   * @returns Component value in linear space
   */
  private _srgbToLinear(c: number): number {
    if (c < 0) return 0;
    return Math.pow(c, 2.2);
  }

  /**
   * Converts a single linear component to sRGB space.
   *
   * @param c - Component value in linear space
   * @returns Component value in sRGB space
   */
  private _linearToSRGB(c: number): number {
    if (c < 0) return 0;
    return Math.pow(c, 1 / 2.2);
  }

  /**
   * Helper for HSL to RGB conversion.
   *
   * @param p - First parameter
   * @param q - Second parameter
   * @param t - Hue parameter
   * @returns RGB component value
   */
  private _hueToRGB(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  /**
   * Converts a byte value to a two-character hex string.
   *
   * @param value - Byte value (0-255)
   * @returns Two-character hex string
   */
  private _toHexByte(value: number): string {
    return value.toString(16).padStart(2, '0').toUpperCase();
  }
}

/**
 * Basic CSS named colors mapping.
 * Includes the most commonly used named colors.
 */
const CSS_COLORS: { [key: string]: number } = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgrey: 0xa9a9a9,
  darkgreen: 0x006400,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  grey: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgrey: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};
