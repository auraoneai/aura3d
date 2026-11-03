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

// Reproduced from ../independent/mutable/Color.ts, which cites W3C CSS Color
// Module Level 4 named-color data (Candidate Recommendation Draft 29 October 2026, §6.1):
// https://www.w3.org/TR/2026/CRD-css-color-4-20261029/#named-colors
// Keep a separate object so runtime mutations of public Color.NAMES do not
// affect the internal candidate's table, or vice versa.
export const COLOR_KEYWORDS: Readonly<Record<string, number>> = {
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
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
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
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
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
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
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
