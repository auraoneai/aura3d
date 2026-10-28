import { clamp, euclideanModulo, lerp } from "../MathUtils.js";
import { Color as ImmutableColor } from "../Color.js";
import { Matrix3 } from "./Matrix3.js";

export const NoColorSpace = "";
export const SRGBColorSpace = "srgb";
export const LinearSRGBColorSpace = "srgb-linear";
export const LinearTransfer = "linear";
export const SRGBTransfer = "srgb";

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Anything with `r`, `g`, `b` channels, including the immutable `@aura3d/math` Color. */
export interface ColorLike {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ColorSpaceDefinition {
  primaries: readonly number[];
  whitePoint?: readonly number[];
  transfer: string;
  toXYZ: Matrix3;
  fromXYZ: Matrix3;
  luminanceCoefficients: readonly number[];
  workingColorSpaceConfig?: { unpackColorSpace: string };
  outputColorSpaceConfig?: { drawingBufferColorSpace: string; toneMappingMode?: string };
}

export function SRGBToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

export function LinearToSRGB(c: number): number {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}

const LINEAR_REC709_TO_XYZ = new Matrix3().set(
  0.4123908, 0.3575843, 0.1804808,
  0.2126390, 0.7151687, 0.0721923,
  0.0193308, 0.1191948, 0.9505322
);

const XYZ_TO_LINEAR_REC709 = new Matrix3().set(
  3.2409699, -1.5373832, -0.4986108,
  -0.9692436, 1.8759675, 0.0415551,
  0.0556301, -0.2039770, 1.0569715
);

const REC709_PRIMARIES = [0.640, 0.330, 0.300, 0.600, 0.150, 0.060];
const REC709_LUMINANCE_COEFFICIENTS = [0.2126, 0.7152, 0.0722];
const D65 = [0.3127, 0.3290];

/**
 * three r185 `ColorManagement`: sRGB and linear-sRGB spaces, the linear-sRGB
 * working space, and the same `convert` / `workingToColorSpace` /
 * `colorSpaceToWorking` helpers. Additional spaces can be added with `define`.
 */
export const ColorManagement = {
  enabled: true,
  workingColorSpace: LinearSRGBColorSpace as string,
  spaces: {} as Record<string, ColorSpaceDefinition>,

  convert<T extends Color>(color: T, sourceColorSpace: string, targetColorSpace: string): T {
    if (this.enabled === false || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
      return color;
    }

    const source = this.spaces[sourceColorSpace]!;
    const target = this.spaces[targetColorSpace]!;

    if (source.transfer === SRGBTransfer) {
      color.r = SRGBToLinear(color.r);
      color.g = SRGBToLinear(color.g);
      color.b = SRGBToLinear(color.b);
    }

    if (source.primaries !== target.primaries) {
      color.applyMatrix3(source.toXYZ);
      color.applyMatrix3(target.fromXYZ);
    }

    if (target.transfer === SRGBTransfer) {
      color.r = LinearToSRGB(color.r);
      color.g = LinearToSRGB(color.g);
      color.b = LinearToSRGB(color.b);
    }

    return color;
  },

  workingToColorSpace<T extends Color>(color: T, targetColorSpace: string): T {
    return this.convert(color, this.workingColorSpace, targetColorSpace);
  },

  colorSpaceToWorking<T extends Color>(color: T, sourceColorSpace: string): T {
    return this.convert(color, sourceColorSpace, this.workingColorSpace);
  },

  getPrimaries(colorSpace: string): readonly number[] {
    return this.spaces[colorSpace]!.primaries;
  },

  getTransfer(colorSpace: string): string {
    if (colorSpace === NoColorSpace) return LinearTransfer;
    return this.spaces[colorSpace]!.transfer;
  },

  getToneMappingMode(colorSpace: string): string {
    return this.spaces[colorSpace]!.outputColorSpaceConfig?.toneMappingMode || "standard";
  },

  getLuminanceCoefficients<T extends { fromArray(array: ArrayLike<number>): T }>(target: T, colorSpace?: string): T {
    return target.fromArray(this.spaces[colorSpace ?? this.workingColorSpace]!.luminanceCoefficients);
  },

  define(colorSpaces: Record<string, ColorSpaceDefinition>): void {
    Object.assign(this.spaces, colorSpaces);
  }
};

ColorManagement.define({
  [LinearSRGBColorSpace]: {
    primaries: REC709_PRIMARIES,
    whitePoint: D65,
    transfer: LinearTransfer,
    toXYZ: LINEAR_REC709_TO_XYZ,
    fromXYZ: XYZ_TO_LINEAR_REC709,
    luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
    workingColorSpaceConfig: { unpackColorSpace: SRGBColorSpace },
    outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
  },
  [SRGBColorSpace]: {
    primaries: REC709_PRIMARIES,
    whitePoint: D65,
    transfer: SRGBTransfer,
    toXYZ: LINEAR_REC709_TO_XYZ,
    fromXYZ: XYZ_TO_LINEAR_REC709,
    luminanceCoefficients: REC709_LUMINANCE_COEFFICIENTS,
    outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace }
  }
});

export const COLOR_KEYWORDS: Readonly<Record<string, number>> = {
  aliceblue: 0xF0F8FF, antiquewhite: 0xFAEBD7, aqua: 0x00FFFF, aquamarine: 0x7FFFD4, azure: 0xF0FFFF,
  beige: 0xF5F5DC, bisque: 0xFFE4C4, black: 0x000000, blanchedalmond: 0xFFEBCD, blue: 0x0000FF, blueviolet: 0x8A2BE2,
  brown: 0xA52A2A, burlywood: 0xDEB887, cadetblue: 0x5F9EA0, chartreuse: 0x7FFF00, chocolate: 0xD2691E,
  coral: 0xFF7F50, cornflowerblue: 0x6495ED, cornsilk: 0xFFF8DC, crimson: 0xDC143C, cyan: 0x00FFFF,
  darkblue: 0x00008B, darkcyan: 0x008B8B, darkgoldenrod: 0xB8860B, darkgray: 0xA9A9A9, darkgreen: 0x006400,
  darkgrey: 0xA9A9A9, darkkhaki: 0xBDB76B, darkmagenta: 0x8B008B, darkolivegreen: 0x556B2F, darkorange: 0xFF8C00,
  darkorchid: 0x9932CC, darkred: 0x8B0000, darksalmon: 0xE9967A, darkseagreen: 0x8FBC8F, darkslateblue: 0x483D8B,
  darkslategray: 0x2F4F4F, darkslategrey: 0x2F4F4F, darkturquoise: 0x00CED1, darkviolet: 0x9400D3,
  deeppink: 0xFF1493, deepskyblue: 0x00BFFF, dimgray: 0x696969, dimgrey: 0x696969, dodgerblue: 0x1E90FF,
  firebrick: 0xB22222, floralwhite: 0xFFFAF0, forestgreen: 0x228B22, fuchsia: 0xFF00FF, gainsboro: 0xDCDCDC,
  ghostwhite: 0xF8F8FF, gold: 0xFFD700, goldenrod: 0xDAA520, gray: 0x808080, green: 0x008000, greenyellow: 0xADFF2F,
  grey: 0x808080, honeydew: 0xF0FFF0, hotpink: 0xFF69B4, indianred: 0xCD5C5C, indigo: 0x4B0082, ivory: 0xFFFFF0,
  khaki: 0xF0E68C, lavender: 0xE6E6FA, lavenderblush: 0xFFF0F5, lawngreen: 0x7CFC00, lemonchiffon: 0xFFFACD,
  lightblue: 0xADD8E6, lightcoral: 0xF08080, lightcyan: 0xE0FFFF, lightgoldenrodyellow: 0xFAFAD2,
  lightgray: 0xD3D3D3, lightgreen: 0x90EE90, lightgrey: 0xD3D3D3, lightpink: 0xFFB6C1, lightsalmon: 0xFFA07A,
  lightseagreen: 0x20B2AA, lightskyblue: 0x87CEFA, lightslategray: 0x778899, lightslategrey: 0x778899,
  lightsteelblue: 0xB0C4DE, lightyellow: 0xFFFFE0, lime: 0x00FF00, limegreen: 0x32CD32, linen: 0xFAF0E6,
  magenta: 0xFF00FF, maroon: 0x800000, mediumaquamarine: 0x66CDAA, mediumblue: 0x0000CD, mediumorchid: 0xBA55D3,
  mediumpurple: 0x9370DB, mediumseagreen: 0x3CB371, mediumslateblue: 0x7B68EE, mediumspringgreen: 0x00FA9A,
  mediumturquoise: 0x48D1CC, mediumvioletred: 0xC71585, midnightblue: 0x191970, mintcream: 0xF5FFFA,
  mistyrose: 0xFFE4E1, moccasin: 0xFFE4B5, navajowhite: 0xFFDEAD, navy: 0x000080, oldlace: 0xFDF5E6, olive: 0x808000,
  olivedrab: 0x6B8E23, orange: 0xFFA500, orangered: 0xFF4500, orchid: 0xDA70D6, palegoldenrod: 0xEEE8AA,
  palegreen: 0x98FB98, paleturquoise: 0xAFEEEE, palevioletred: 0xDB7093, papayawhip: 0xFFEFD5, peachpuff: 0xFFDAB9,
  peru: 0xCD853F, pink: 0xFFC0CB, plum: 0xDDA0DD, powderblue: 0xB0E0E6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xFF0000, rosybrown: 0xBC8F8F, royalblue: 0x4169E1, saddlebrown: 0x8B4513, salmon: 0xFA8072,
  sandybrown: 0xF4A460, seagreen: 0x2E8B57, seashell: 0xFFF5EE, sienna: 0xA0522D, silver: 0xC0C0C0,
  skyblue: 0x87CEEB, slateblue: 0x6A5ACD, slategray: 0x708090, slategrey: 0x708090, snow: 0xFFFAFA,
  springgreen: 0x00FF7F, steelblue: 0x4682B4, tan: 0xD2B48C, teal: 0x008080, thistle: 0xD8BFD8, tomato: 0xFF6347,
  turquoise: 0x40E0D0, violet: 0xEE82EE, wheat: 0xF5DEB3, white: 0xFFFFFF, whitesmoke: 0xF5F5F5, yellow: 0xFFFF00,
  yellowgreen: 0x9ACD32,
};

const _hslA: HSL = { h: 0, s: 0, l: 0 };
const _hslB: HSL = { h: 0, s: 0, l: 0 };

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

/**
 * Mutable three.js-compatible RGB color in the linear-sRGB working space.
 * Every modifier mutates `this` and returns `this`, exactly like three r185
 * `Color`. `fromImmutable` / `toImmutable` cross into the immutable,
 * linear-space `@aura3d/math` Color (alpha is 1 on the way out and ignored on the way in).
 */
export class Color {
  static NAMES: Readonly<Record<string, number>> = COLOR_KEYWORDS;

  declare readonly isColor: true;

  r = 1;
  g = 1;
  b = 1;

  constructor(r?: ColorLike | number | string, g?: number, b?: number) {
    this.set(r as number, g, b);
  }

  /** Copy the linear channels of an immutable `@aura3d/math` Color (alpha is dropped). */
  fromImmutable(c: ColorLike): this {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    return this;
  }

  /** Snapshot as an immutable `@aura3d/math` Color with alpha 1 (throws on non-finite channels, like that class). */
  toImmutable(alpha = 1): ImmutableColor {
    return new ImmutableColor(this.r, this.g, this.b, alpha);
  }

  set(r: ColorLike | number | string, g?: number, b?: number): this {
    if (g === undefined && b === undefined) {
      // r is THREE.Color, hex or string
      const value = r;
      if (value && typeof value === "object") {
        this.copy(value);
      } else if (typeof value === "number") {
        this.setHex(value);
      } else if (typeof value === "string") {
        this.setStyle(value);
      }
    } else {
      this.setRGB(r as number, g as number, b as number);
    }
    return this;
  }

  setScalar(scalar: number): this {
    this.r = scalar;
    this.g = scalar;
    this.b = scalar;
    return this;
  }

  setHex(hex: number, colorSpace: string = SRGBColorSpace): this {
    hex = Math.floor(hex);

    this.r = ((hex >> 16) & 255) / 255;
    this.g = ((hex >> 8) & 255) / 255;
    this.b = (hex & 255) / 255;

    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }

  setRGB(r: number, g: number, b: number, colorSpace: string = ColorManagement.workingColorSpace): this {
    this.r = r;
    this.g = g;
    this.b = b;

    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }

  setHSL(h: number, s: number, l: number, colorSpace: string = ColorManagement.workingColorSpace): this {
    // h,s,l ranges are in 0.0 - 1.0
    h = euclideanModulo(h, 1);
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);

    if (s === 0) {
      this.r = this.g = this.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;

      this.r = hue2rgb(q, p, h + 1 / 3);
      this.g = hue2rgb(q, p, h);
      this.b = hue2rgb(q, p, h - 1 / 3);
    }

    ColorManagement.colorSpaceToWorking(this, colorSpace);
    return this;
  }

  setStyle(style: string, colorSpace: string = SRGBColorSpace): this {
    function handleAlpha(string: string | undefined): void {
      if (string === undefined) return;
      if (parseFloat(string) < 1) {
        console.warn(`THREE.Color: Alpha component of ${style} will be ignored.`);
      }
    }

    let m: RegExpExecArray | null;

    if ((m = /^(\w+)\(([^)]*)\)/.exec(style))) {
      // rgb / hsl
      let color: RegExpExecArray | null;
      const name = m[1];
      const components = m[2]!;

      switch (name) {
        case "rgb":
        case "rgba":
          if ((color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components))) {
            // rgb(255,0,0) rgba(255,0,0,0.5)
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(255, parseInt(color[1]!, 10)) / 255,
              Math.min(255, parseInt(color[2]!, 10)) / 255,
              Math.min(255, parseInt(color[3]!, 10)) / 255,
              colorSpace
            );
          }

          if ((color = /^\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components))) {
            // rgb(100%,0%,0%) rgba(100%,0%,0%,0.5)
            handleAlpha(color[4]);
            return this.setRGB(
              Math.min(100, parseInt(color[1]!, 10)) / 100,
              Math.min(100, parseInt(color[2]!, 10)) / 100,
              Math.min(100, parseInt(color[3]!, 10)) / 100,
              colorSpace
            );
          }
          break;

        case "hsl":
        case "hsla":
          if ((color = /^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)%\s*,\s*(\d*\.?\d+)%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components))) {
            // hsl(120,50%,50%) hsla(120,50%,50%,0.5)
            handleAlpha(color[4]);
            return this.setHSL(
              parseFloat(color[1]!) / 360,
              parseFloat(color[2]!) / 100,
              parseFloat(color[3]!) / 100,
              colorSpace
            );
          }
          break;

        default:
          console.warn(`THREE.Color: Unknown color model ${style}`);
      }
    } else if ((m = /^#([A-Fa-f\d]+)$/.exec(style))) {
      // hex color
      const hex = m[1]!;
      const size = hex.length;

      if (size === 3) {
        // #ff0
        return this.setRGB(
          parseInt(hex.charAt(0), 16) / 15,
          parseInt(hex.charAt(1), 16) / 15,
          parseInt(hex.charAt(2), 16) / 15,
          colorSpace
        );
      } else if (size === 6) {
        // #ff0000
        return this.setHex(parseInt(hex, 16), colorSpace);
      } else {
        console.warn(`THREE.Color: Invalid hex color ${style}`);
      }
    } else if (style && style.length > 0) {
      return this.setColorName(style, colorSpace);
    }

    return this;
  }

  setColorName(style: string, colorSpace: string = SRGBColorSpace): this {
    // color keywords
    const hex = COLOR_KEYWORDS[style.toLowerCase()];

    if (hex !== undefined) {
      // red
      this.setHex(hex, colorSpace);
    } else {
      // unknown color
      console.warn(`THREE.Color: Unknown color ${style}`);
    }

    return this;
  }

  clone(): this {
    return new (this.constructor as new (r: number, g: number, b: number) => this)(this.r, this.g, this.b);
  }

  copy(color: ColorLike): this {
    this.r = color.r;
    this.g = color.g;
    this.b = color.b;
    return this;
  }

  copySRGBToLinear(color: ColorLike): this {
    this.r = SRGBToLinear(color.r);
    this.g = SRGBToLinear(color.g);
    this.b = SRGBToLinear(color.b);
    return this;
  }

  copyLinearToSRGB(color: ColorLike): this {
    this.r = LinearToSRGB(color.r);
    this.g = LinearToSRGB(color.g);
    this.b = LinearToSRGB(color.b);
    return this;
  }

  convertSRGBToLinear(): this {
    this.copySRGBToLinear(this);
    return this;
  }

  convertLinearToSRGB(): this {
    this.copyLinearToSRGB(this);
    return this;
  }

  getHex(colorSpace: string = SRGBColorSpace): number {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);
    return (
      Math.round(clamp(_color.r * 255, 0, 255)) * 65536 +
      Math.round(clamp(_color.g * 255, 0, 255)) * 256 +
      Math.round(clamp(_color.b * 255, 0, 255))
    );
  }

  getHexString(colorSpace: string = SRGBColorSpace): string {
    return `000000${this.getHex(colorSpace).toString(16)}`.slice(-6);
  }

  getHSL(target: HSL, colorSpace: string = ColorManagement.workingColorSpace): HSL {
    // h,s,l ranges are in 0.0 - 1.0
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);

    const r = _color.r;
    const g = _color.g;
    const b = _color.b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    let hue = Number.NaN; // three leaves `hue` undefined when no channel matches max (NaN input); undefined / 6 is NaN
    let saturation: number;
    const lightness = (min + max) / 2.0;

    if (min === max) {
      hue = 0;
      saturation = 0;
    } else {
      const delta = max - min;

      saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);

      switch (max) {
        case r: hue = (g - b) / delta + (g < b ? 6 : 0); break;
        case g: hue = (b - r) / delta + 2; break;
        case b: hue = (r - g) / delta + 4; break;
      }

      hue /= 6;
    }

    target.h = hue;
    target.s = saturation;
    target.l = lightness;

    return target;
  }

  getRGB(target: RGB, colorSpace: string = ColorManagement.workingColorSpace): RGB {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);

    target.r = _color.r;
    target.g = _color.g;
    target.b = _color.b;

    return target;
  }

  getStyle(colorSpace: string = SRGBColorSpace): string {
    ColorManagement.workingToColorSpace(_color.copy(this), colorSpace);

    const r = _color.r;
    const g = _color.g;
    const b = _color.b;

    if (colorSpace !== SRGBColorSpace) {
      // Requires CSS Color Module Level 4 (https://www.w3.org/TR/css-color-4/).
      return `color(${colorSpace} ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)})`;
    }

    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }

  offsetHSL(h: number, s: number, l: number): this {
    this.getHSL(_hslA);
    return this.setHSL(_hslA.h + h, _hslA.s + s, _hslA.l + l);
  }

  add(color: ColorLike): this {
    this.r += color.r;
    this.g += color.g;
    this.b += color.b;
    return this;
  }

  addColors(color1: ColorLike, color2: ColorLike): this {
    this.r = color1.r + color2.r;
    this.g = color1.g + color2.g;
    this.b = color1.b + color2.b;
    return this;
  }

  addScalar(s: number): this {
    this.r += s;
    this.g += s;
    this.b += s;
    return this;
  }

  sub(color: ColorLike): this {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);
    return this;
  }

  multiply(color: ColorLike): this {
    this.r *= color.r;
    this.g *= color.g;
    this.b *= color.b;
    return this;
  }

  multiplyScalar(s: number): this {
    this.r *= s;
    this.g *= s;
    this.b *= s;
    return this;
  }

  lerp(color: ColorLike, alpha: number): this {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }

  lerpColors(color1: ColorLike, color2: ColorLike, alpha: number): this {
    this.r = color1.r + (color2.r - color1.r) * alpha;
    this.g = color1.g + (color2.g - color1.g) * alpha;
    this.b = color1.b + (color2.b - color1.b) * alpha;
    return this;
  }

  lerpHSL(color: Color, alpha: number): this {
    this.getHSL(_hslA);
    color.getHSL(_hslB);

    const h = lerp(_hslA.h, _hslB.h, alpha);
    const s = lerp(_hslA.s, _hslB.s, alpha);
    const l = lerp(_hslA.l, _hslB.l, alpha);

    this.setHSL(h, s, l);
    return this;
  }

  setFromVector3(v: { readonly x: number; readonly y: number; readonly z: number }): this {
    this.r = v.x;
    this.g = v.y;
    this.b = v.z;
    return this;
  }

  applyMatrix3(m: { readonly elements: ArrayLike<number> }): this {
    const r = this.r;
    const g = this.g;
    const b = this.b;
    const e = m.elements;

    this.r = e[0]! * r + e[3]! * g + e[6]! * b;
    this.g = e[1]! * r + e[4]! * g + e[7]! * b;
    this.b = e[2]! * r + e[5]! * g + e[8]! * b;

    return this;
  }

  equals(c: ColorLike): boolean {
    return c.r === this.r && c.g === this.g && c.b === this.b;
  }

  fromArray(array: ArrayLike<number>, offset = 0): this {
    this.r = array[offset]!;
    this.g = array[offset + 1]!;
    this.b = array[offset + 2]!;
    return this;
  }

  toArray(array: number[] = [], offset = 0): number[] {
    array[offset] = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }

  fromBufferAttribute(attribute: { getX(index: number): number; getY(index: number): number; getZ(index: number): number }, index: number): this {
    this.r = attribute.getX(index);
    this.g = attribute.getY(index);
    this.b = attribute.getZ(index);
    return this;
  }

  toJSON(): number {
    return this.getHex();
  }

  *[Symbol.iterator](): Generator<number, void, undefined> {
    yield this.r;
    yield this.g;
    yield this.b;
  }
}

(Color.prototype as { isColor: boolean }).isColor = true;

const _color = new Color();
