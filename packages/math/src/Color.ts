import { clamp } from "./Interpolation.js";

export class Color {
  constructor(
    readonly r = 1,
    readonly g = 1,
    readonly b = 1,
    readonly a = 1
  ) {
    for (const channel of [r, g, b, a]) {
      if (!Number.isFinite(channel)) throw new RangeError("Color channels must be finite.");
    }
  }

  static fromSRGB(r: number, g: number, b: number, a = 1): Color {
    return new Color(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), a);
  }

  toSRGB(): Color {
    return new Color(linearToSrgb(this.r), linearToSrgb(this.g), linearToSrgb(this.b), this.a);
  }

  clamp01(): Color {
    return new Color(clamp(this.r), clamp(this.g), clamp(this.b), clamp(this.a));
  }

  lerp(to: Color, t: number): Color {
    return new Color(
      this.r + (to.r - this.r) * t,
      this.g + (to.g - this.g) * t,
      this.b + (to.b - this.b) * t,
      this.a + (to.a - this.a) * t
    );
  }

  equals(color: Color, epsilon = 1e-10): boolean {
    return Math.abs(this.r - color.r) <= epsilon && Math.abs(this.g - color.g) <= epsilon && Math.abs(this.b - color.b) <= epsilon && Math.abs(this.a - color.a) <= epsilon;
  }
}

export function srgbToLinear(value: number): number {
  const v = clamp(value);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(value: number): number {
  const v = clamp(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
