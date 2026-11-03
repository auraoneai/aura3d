import { Color as ImmutableColor } from "../../Color.js";
import { Matrix3 } from "./Matrix3.js";

export interface HSL { h: number; s: number; l: number }
export interface RGB { r: number; g: number; b: number }
export interface ColorLike { readonly r: number; readonly g: number; readonly b: number }

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

export const NoColorSpace = "";
export const SRGBColorSpace = "srgb";
export const LinearSRGBColorSpace = "srgb-linear";
export const LinearTransfer = "linear";
export const SRGBTransfer = "srgb";

// Color names and 24-bit values are the opaque keyword facts from W3C CSS
// Color Module Level 4, Candidate Recommendation Draft 29 October 2026, §6.1:
// https://www.w3.org/TR/2026/CRD-css-color-4-20261029/#named-colors
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

// W3C CSS Color 4, section 10 and Appendix B: sRGB's transfer functions
// extend by reflection for negative, out-of-gamut channel values.
// https://www.w3.org/TR/2026/CRD-css-color-4-20261029/#predefined-sRGB
// https://www.w3.org/TR/2026/CRD-css-color-4-20261029/#color-conversion-code
export function SRGBToLinear(value: number): number {
  const magnitude = Math.abs(value);
  return magnitude <= 0.04045
    ? value / 12.92
    : Math.sign(value) * ((magnitude + 0.055) / 1.055) ** 2.4;
}

export function LinearToSRGB(value: number): number {
  const magnitude = Math.abs(value);
  return magnitude <= 0.0031308
    ? value * 12.92
    : Math.sign(value) * (1.055 * magnitude ** (1 / 2.4) - 0.055);
}

// CIE XYZ D65 matrices and chromaticities specified in CSS Color 4 Appendix B.
// Both built-in spaces have the same primaries; only their transfer differs.
const toXYZ = new Matrix3(
  506752 / 1228815, 87881 / 245763, 12673 / 70218,
  87098 / 409605, 175762 / 245763, 12673 / 175545,
  7918 / 409605, 87881 / 737289, 1001167 / 1053270
);
const fromXYZ = new Matrix3(
  12831 / 3959, -329 / 214, -1974 / 3959,
  -851781 / 878810, 1648619 / 878810, 36519 / 878810,
  705 / 12673, -2585 / 12673, 705 / 667
);
const primaries = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06] as const;
const whitePoint = [0.3127, 0.329] as const;
const luminance = [87098 / 409605, 175762 / 245763, 12673 / 175545] as const;

function definition(name: string, spaces: Record<string, ColorSpaceDefinition>): ColorSpaceDefinition {
  if (!Object.hasOwn(spaces, name)) throw new RangeError(`Unknown color space: ${name}`);
  return spaces[name];
}

function checkTransfer(transfer: string): void {
  if (transfer !== LinearTransfer && transfer !== SRGBTransfer) {
    throw new RangeError(`Unsupported color transfer: ${transfer}`);
  }
}

export const ColorManagement = {
  enabled: true,
  workingColorSpace: LinearSRGBColorSpace,
  spaces: {
    [LinearSRGBColorSpace]: {
      primaries, whitePoint, transfer: LinearTransfer, toXYZ, fromXYZ,
      luminanceCoefficients: luminance,
      workingColorSpaceConfig: { unpackColorSpace: SRGBColorSpace },
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace, toneMappingMode: "standard" }
    },
    [SRGBColorSpace]: {
      primaries, whitePoint, transfer: SRGBTransfer, toXYZ, fromXYZ,
      luminanceCoefficients: luminance,
      outputColorSpaceConfig: { drawingBufferColorSpace: SRGBColorSpace, toneMappingMode: "standard" }
    }
  } as Record<string, ColorSpaceDefinition>,

  convert<T extends Color>(color: T, sourceColorSpace: string, targetColorSpace: string): T {
    if (!this.enabled || !sourceColorSpace || !targetColorSpace || sourceColorSpace === targetColorSpace) return color;
    const source = definition(sourceColorSpace, this.spaces);
    const target = definition(targetColorSpace, this.spaces);
    checkTransfer(source.transfer);
    checkTransfer(target.transfer);
    if (source.transfer === SRGBTransfer) color.convertSRGBToLinear();
    if (source.toXYZ !== target.toXYZ || source.fromXYZ !== target.fromXYZ) {
      color.applyMatrix3(source.toXYZ).applyMatrix3(target.fromXYZ);
    }
    if (target.transfer === SRGBTransfer) color.convertLinearToSRGB();
    return color;
  },

  workingToColorSpace<T extends Color>(color: T, targetColorSpace: string): T {
    return this.convert(color, this.workingColorSpace, targetColorSpace);
  },

  colorSpaceToWorking<T extends Color>(color: T, sourceColorSpace: string): T {
    return this.convert(color, sourceColorSpace, this.workingColorSpace);
  },

  getPrimaries(colorSpace: string): readonly number[] {
    return definition(colorSpace, this.spaces).primaries;
  },

  getTransfer(colorSpace: string): string {
    return colorSpace === NoColorSpace ? LinearTransfer : definition(colorSpace, this.spaces).transfer;
  },

  getToneMappingMode(colorSpace: string): string {
    return definition(colorSpace, this.spaces).outputColorSpaceConfig?.toneMappingMode ?? "standard";
  },

  getLuminanceCoefficients<T extends { fromArray(array: ArrayLike<number>): T }>(target: T, colorSpace?: string): T {
    return target.fromArray(definition(colorSpace ?? this.workingColorSpace, this.spaces).luminanceCoefficients);
  },

  define(colorSpaces: Record<string, ColorSpaceDefinition>): void {
    Object.assign(this.spaces, colorSpaces);
  }
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizedHue(hue: number): number {
  return ((hue % 1) + 1) % 1;
}

function hslToChannels(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = normalizedHue(hue) * 6;
  const s = clamp01(saturation);
  const l = clamp01(lightness);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(h % 2 - 1));
  const offset = l - chroma / 2;
  let red = 0, green = 0, blue = 0;
  if (h < 1) [red, green] = [chroma, secondary];
  else if (h < 2) [red, green] = [secondary, chroma];
  else if (h < 3) [green, blue] = [chroma, secondary];
  else if (h < 4) [green, blue] = [secondary, chroma];
  else if (h < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];
  return [red + offset, green + offset, blue + offset];
}

const numericToken = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%)?$/i;
function numberToken(token: string, divisor = 1): number | undefined {
  if (token.toLowerCase() === "none") return 0;
  const match = numericToken.exec(token);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return match[2] ? value / 100 : value / divisor;
}

function hueToken(token: string): number | undefined {
  if (token.toLowerCase() === "none") return 0;
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/i.exec(token);
  if (!match) return undefined;
  const angle = Number(match[1]);
  if (!Number.isFinite(angle)) return undefined;
  switch (match[2]?.toLowerCase()) {
    case "turn": return angle;
    case "rad": return angle / (2 * Math.PI);
    case "grad": return angle / 400;
    default: return angle / 360;
  }
}

// Split CSS legacy comma syntax and modern space/slash syntax without treating
// malformed mixtures or extra components as valid colors.
function colorArguments(input: string): string[] | undefined {
  const text = input.trim();
  if (!text) return undefined;
  if (text.includes(",")) {
    if (text.includes("/")) return undefined;
    const parts = text.split(",").map(part => part.trim());
    return (parts.length === 3 || parts.length === 4) && parts.every(Boolean) ? parts : undefined;
  }
  const sides = text.split("/");
  if (sides.length > 2) return undefined;
  const components = sides[0].trim().split(/\s+/);
  if (components.length !== 3) return undefined;
  if (sides.length === 2) {
    const alpha = sides[1].trim();
    if (!alpha || /\s/.test(alpha)) return undefined;
    components.push(alpha);
  }
  return components;
}

export class Color {
  static NAMES: Readonly<Record<string, number>> = COLOR_KEYWORDS;
  readonly isColor: boolean = true;
  r = 1;
  g = 1;
  b = 1;

  constructor(r?: ColorLike | number | string, g?: number, b?: number) {
    if (r !== undefined) this.set(r, g, b);
  }

  fromImmutable(color: ColorLike): this { return this.copy(color); }
  toImmutable(alpha = 1): ImmutableColor { return new ImmutableColor(this.r, this.g, this.b, alpha); }

  set(r: ColorLike | number | string, g?: number, b?: number): this {
    if (typeof r === "number") {
      return g !== undefined && b !== undefined ? this.setRGB(r, g, b) : this.setHex(r);
    }
    return typeof r === "string" ? this.setStyle(r) : this.copy(r);
  }

  setScalar(scalar: number): this { this.r = scalar; this.g = scalar; this.b = scalar; return this; }

  setHex(hex: number, colorSpace = SRGBColorSpace): this {
    const value = Math.floor(hex);
    this.r = ((value >> 16) & 255) / 255;
    this.g = ((value >> 8) & 255) / 255;
    this.b = (value & 255) / 255;
    return ColorManagement.colorSpaceToWorking(this, colorSpace);
  }

  setRGB(r: number, g: number, b: number, colorSpace = ColorManagement.workingColorSpace): this {
    this.r = r; this.g = g; this.b = b;
    return ColorManagement.colorSpaceToWorking(this, colorSpace);
  }

  setHSL(h: number, s: number, l: number, colorSpace = ColorManagement.workingColorSpace): this {
    const [r, g, b] = hslToChannels(h, s, l);
    return this.setRGB(r, g, b, colorSpace);
  }

  setStyle(style: string, colorSpace = SRGBColorSpace): this {
    const text = style.trim();
    const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text);
    if (hex) {
      const digits = hex[1];
      const rgb = digits.length <= 4 ? digits.slice(0, 3).split("").map(char => char + char).join("") : digits.slice(0, 6);
      return this.setHex(Number.parseInt(rgb, 16), colorSpace);
    }
    const functional = /^([a-z]+)\(([\s\S]*)\)$/i.exec(text);
    if (!functional) return this.setColorName(text, colorSpace);
    const kind = functional[1].toLowerCase();
    let body = functional[2];
    let inputSpace = colorSpace;
    if (kind === "color") {
      const prefix = /^\s*([a-z][a-z\d-]*)\s+(.+)$/i.exec(body);
      if (!prefix || !Object.hasOwn(ColorManagement.spaces, prefix[1].toLowerCase())) return this;
      inputSpace = prefix[1].toLowerCase();
      body = prefix[2];
      if (body.includes(",")) return this;
    }
    if (!["rgb", "rgba", "hsl", "hsla", "color"].includes(kind)) return this;
    const parts = colorArguments(body);
    if (!parts || (parts.length === 4 && numberToken(parts[3]) === undefined)) return this;
    const legacy = body.includes(",");
    if (legacy && parts.some(part => part.toLowerCase() === "none")) return this;
    if (kind === "hsl" || kind === "hsla") {
      const h = hueToken(parts[0]);
      if (legacy && (!parts[1].endsWith("%") || !parts[2].endsWith("%"))) return this;
      // Modern HSL accepts numbers on the same 0..100 scale as percentages.
      const s = numberToken(parts[1], 100);
      const l = numberToken(parts[2], 100);
      return h === undefined || s === undefined || l === undefined ? this : this.setHSL(h, s, l, colorSpace);
    }
    if (legacy && kind !== "color") {
      const percentages = parts.slice(0, 3).map(part => part.endsWith("%"));
      if (percentages.some(value => value !== percentages[0])) return this;
    }
    const divisor = kind === "color" ? 1 : 255;
    const r = numberToken(parts[0], divisor), g = numberToken(parts[1], divisor), b = numberToken(parts[2], divisor);
    if (r === undefined || g === undefined || b === undefined) return this;
    return this.setRGB(kind === "color" ? r : clamp01(r), kind === "color" ? g : clamp01(g), kind === "color" ? b : clamp01(b), inputSpace);
  }

  setColorName(name: string, colorSpace = SRGBColorSpace): this {
    const key = name.trim().toLowerCase();
    return Object.hasOwn(Color.NAMES, key) ? this.setHex(Color.NAMES[key], colorSpace) : this;
  }

  clone(): this {
    const Constructor = this.constructor as new () => this;
    return new Constructor().copy(this);
  }

  copy(color: ColorLike): this { this.r = color.r; this.g = color.g; this.b = color.b; return this; }
  copySRGBToLinear(color: ColorLike): this {
    this.r = SRGBToLinear(color.r); this.g = SRGBToLinear(color.g); this.b = SRGBToLinear(color.b); return this;
  }
  copyLinearToSRGB(color: ColorLike): this {
    this.r = LinearToSRGB(color.r); this.g = LinearToSRGB(color.g); this.b = LinearToSRGB(color.b); return this;
  }
  convertSRGBToLinear(): this { return this.copySRGBToLinear(this); }
  convertLinearToSRGB(): this { return this.copyLinearToSRGB(this); }

  getHex(colorSpace = SRGBColorSpace): number {
    const color = ColorManagement.workingToColorSpace(this.clone(), colorSpace);
    const r = Math.round(clamp01(color.r) * 255), g = Math.round(clamp01(color.g) * 255), b = Math.round(clamp01(color.b) * 255);
    return (r << 16) | (g << 8) | b;
  }
  getHexString(colorSpace = SRGBColorSpace): string { return this.getHex(colorSpace).toString(16).padStart(6, "0"); }

  getHSL(target: HSL, colorSpace = ColorManagement.workingColorSpace): HSL {
    const { r, g, b } = ColorManagement.workingToColorSpace(this.clone(), colorSpace);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (delta !== 0) {
      // CSS Color 4 §7.2 defines behavior for out-of-gamut values where the
      // saturation denominator can vanish or become negative.
      s = Math.abs(l) <= 1e-5 || Math.abs(1 - l) < 1e-5 ? 0 : (max - l) / Math.min(l, 1 - l);
      if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h /= 6;
      if (s < 0) { h = normalizedHue(h + 0.5); s = -s; }
      if (s <= 1e-5) { h = 0; s = 0; }
    }
    target.h = h; target.s = s; target.l = l;
    return target;
  }

  getRGB(target: RGB, colorSpace = ColorManagement.workingColorSpace): RGB {
    const color = ColorManagement.workingToColorSpace(this.clone(), colorSpace);
    target.r = color.r; target.g = color.g; target.b = color.b;
    return target;
  }

  getStyle(colorSpace = SRGBColorSpace): string {
    const { r, g, b } = ColorManagement.workingToColorSpace(this.clone(), colorSpace);
    if (colorSpace === SRGBColorSpace || colorSpace === NoColorSpace) {
      return `rgb(${Math.round(clamp01(r) * 255)},${Math.round(clamp01(g) * 255)},${Math.round(clamp01(b) * 255)})`;
    }
    return `color(${colorSpace} ${r} ${g} ${b})`;
  }

  offsetHSL(h: number, s: number, l: number): this {
    const current = this.getHSL({ h: 0, s: 0, l: 0 });
    return this.setHSL(current.h + h, current.s + s, current.l + l);
  }
  add(color: ColorLike): this { this.r += color.r; this.g += color.g; this.b += color.b; return this; }
  addColors(color1: ColorLike, color2: ColorLike): this {
    this.r = color1.r + color2.r; this.g = color1.g + color2.g; this.b = color1.b + color2.b; return this;
  }
  addScalar(s: number): this { this.r += s; this.g += s; this.b += s; return this; }
  sub(color: ColorLike): this { this.r = Math.max(0, this.r - color.r); this.g = Math.max(0, this.g - color.g); this.b = Math.max(0, this.b - color.b); return this; }
  multiply(color: ColorLike): this { this.r *= color.r; this.g *= color.g; this.b *= color.b; return this; }
  multiplyScalar(s: number): this { this.r *= s; this.g *= s; this.b *= s; return this; }
  lerp(color: ColorLike, alpha: number): this {
    this.r += (color.r - this.r) * alpha; this.g += (color.g - this.g) * alpha; this.b += (color.b - this.b) * alpha; return this;
  }
  lerpColors(color1: ColorLike, color2: ColorLike, alpha: number): this {
    const r = color1.r + (color2.r - color1.r) * alpha;
    const g = color1.g + (color2.g - color1.g) * alpha;
    const b = color1.b + (color2.b - color1.b) * alpha;
    return this.setRGB(r, g, b);
  }
  lerpHSL(color: Color, alpha: number): this {
    const a = this.getHSL({ h: 0, s: 0, l: 0 });
    const b = color.getHSL({ h: 0, s: 0, l: 0 });
    return this.setHSL(a.h + (b.h - a.h) * alpha, a.s + (b.s - a.s) * alpha, a.l + (b.l - a.l) * alpha);
  }
  setFromVector3(v: { readonly x: number; readonly y: number; readonly z: number }): this { this.r = v.x; this.g = v.y; this.b = v.z; return this; }
  applyMatrix3(m: { readonly elements: ArrayLike<number> }): this {
    const e = m.elements, r = this.r, g = this.g, b = this.b;
    this.r = e[0] * r + e[3] * g + e[6] * b;
    this.g = e[1] * r + e[4] * g + e[7] * b;
    this.b = e[2] * r + e[5] * g + e[8] * b;
    return this;
  }
  equals(color: ColorLike): boolean { return this.r === color.r && this.g === color.g && this.b === color.b; }
  fromArray(array: ArrayLike<number>, offset = 0): this { this.r = array[offset]; this.g = array[offset + 1]; this.b = array[offset + 2]; return this; }
  toArray(array: number[] = [], offset = 0): number[] { array[offset] = this.r; array[offset + 1] = this.g; array[offset + 2] = this.b; return array; }
  fromBufferAttribute(attribute: { getX(index: number): number; getY(index: number): number; getZ(index: number): number }, index: number): this {
    this.r = attribute.getX(index); this.g = attribute.getY(index); this.b = attribute.getZ(index); return this;
  }
  toJSON(): number { return this.getHex(); }
  *[Symbol.iterator](): Generator<number, void, undefined> { yield this.r; yield this.g; yield this.b; }
}
