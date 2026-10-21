import { clamp } from "./Interpolation.js";
import { clamp as clampRange, euclideanModulo, lerp as lerpScalar } from "./MathUtils.js";

function hue2rgb(p: number, q: number, t: number): number {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
}

/**
 * CSS-style HSL→RGB conversion (hue in degrees, may wrap) — the canonical
 * implementation shared by `@aura3d/engine` `hsl()`/`hsla()` parsing.
 */
export function hslToRgb(hDeg: number, s: number, l: number): readonly [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/** `{h, s, l}` in 0..1 — three.js `Color.getHSL` target shape. */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Linear-space RGBA color — three.js `Color` HSL parity
 * (`setHSL`/`getHSL`/`offsetHSL`/`lerpHSL`); immutable methods.
 */
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

  /**
   * three.js `Color.setHSL` — `h, s, l` in 0..1 (hue wraps). Returns a new
   * `Color`; alpha is preserved unless `a` is given.
   */
  setHSL(h: number, s: number, l: number, a = this.a): Color {
    h = euclideanModulo(h, 1);
    s = clampRange(s, 0, 1);
    l = clampRange(l, 0, 1);
    if (s === 0) {
      return new Color(l, l, l, a);
    }
    const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
    const q = 2 * l - p;
    return new Color(
      hue2rgb(q, p, h + 1 / 3),
      hue2rgb(q, p, h),
      hue2rgb(q, p, h - 1 / 3),
      a
    );
  }

  static fromHSL(h: number, s: number, l: number, a = 1): Color {
    return new Color(0, 0, 0, a).setHSL(h, s, l, a);
  }

  /** three.js `Color.getHSL` — `{h, s, l}` in 0..1. */
  getHSL(): HSL {
    const r = this.r;
    const g = this.g;
    const b = this.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hue = 0;
    let saturation = 0;
    const lightness = (min + max) / 2;
    if (min !== max) {
      const delta = max - min;
      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
      if (max === r) {
        hue = (g - b) / delta + (g < b ? 6 : 0);
      } else if (max === g) {
        hue = (b - r) / delta + 2;
      } else {
        hue = (r - g) / delta + 4;
      }
      hue /= 6;
    }
    return { h: hue, s: saturation, l: lightness };
  }

  /** three.js `Color.offsetHSL` — adds offsets to the current HSL. */
  offsetHSL(h: number, s: number, l: number): Color {
    const hsl = this.getHSL();
    return this.setHSL(hsl.h + h, hsl.s + s, hsl.l + l);
  }

  /** three.js `Color.lerpHSL` — component-wise lerp in HSL space. */
  lerpHSL(color: Color, alpha: number): Color {
    const hslA = this.getHSL();
    const hslB = color.getHSL();
    const h = lerpScalar(hslA.h, hslB.h, alpha);
    const s = lerpScalar(hslA.s, hslB.s, alpha);
    const l = lerpScalar(hslA.l, hslB.l, alpha);
    return this.setHSL(h, s, l);
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
