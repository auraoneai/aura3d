/**
 * C-06 color parsing (PRD-01) — the single parser. Grammar per PRD-01 §15
 * Phase 1 "Color parser": `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 * `rgb()/rgba()` (comma and space syntax), `hsl()/hsla()`, the 148 CSS named
 * colors, and numbers `0xRRGGBB` / `0xRRGGBBAA`. `parseAuraColor` returns
 * linear-light RGBA (exact piecewise sRGB transfer via
 * `@aura3d/rendering` ColorManagement); `parseAuraColorSrgb` returns the
 * sRGB-encoded RGBA. Invalid input throws `AuraColorParseError` carrying the
 * input — callers decide fallback policy (C-36 `COLOR_PARSE_FAILED` wiring is
 * the compiler file's job after the Q-15-7 move).
 */

import { srgbToLinearChannel } from "@aura3d/rendering";
import { hslToRgb as hslToRgbMath } from "@aura3d/math";

export type AuraColorInput = string | number;

export const COLOR_INVALID = "COLOR_INVALID";

let currentColorUse: string | undefined;

/** Run `work` while naming the option/node being parsed, so a `COLOR_INVALID` error says where the value was used. */
export function withColorUse<T>(where: string, work: () => T): T {
  const previous = currentColorUse;
  currentColorUse = where;
  try { return work(); } finally { currentColorUse = previous; }
}

/**
 * Typed error for a colour value no CSS form matches. `code` is `COLOR_INVALID`; `input` is the offending value;
 * `where` names the option or node (when the call site knows it). Never silently replaced by a fallback colour.
 */
export class AuraColorParseError extends Error {
  readonly code = COLOR_INVALID;
  readonly where: string | undefined;
  constructor(public readonly input: unknown, where?: string) {
    const place = where ?? currentColorUse;
    super(`AuraColorParseError:${String(input)}${place ? ` (used in ${place})` : ""}; COLOR_INVALID: use #rgb, #rrggbb, #rrggbbaa, rgb(), hsl(), oklch(), a CSS colour name, or a 0xRRGGBB number`);
    this.name = "AuraColorParseError";
    this.where = place;
  }
}

/** Validate a colour option at its API entry so the error names the option (`material.pbr({ color })`). Non-colour values pass through. */
export function assertAuraColorOption(value: unknown, where: string): void {
  if (value === undefined || (typeof value !== "string" && typeof value !== "number")) return;
  try { parseAuraColorSrgb(value); } catch (error) {
    // Name the whole authored value, not the inner token that failed (`rgb(1, 2, x)`, not `x`).
    if (error instanceof AuraColorParseError) throw new AuraColorParseError(value, where);
    throw error;
  }
}

const HEX6 = /^#[0-9a-f]{6}$/i;

/**
 * Normalise an authored colour to `#rrggbb` for consumers that only read six-digit hex (sky, fog, volumetric fog,
 * effect ramps). `#rrggbb` strings, arrays and non-colour values pass through unchanged (so existing hex scenes stay
 * byte-identical); every other CSS form is parsed and re-encoded; an invalid value throws `COLOR_INVALID` naming `where`.
 */
export function auraColorToHex<T>(value: T, where: string): T | string {
  if (typeof value === "string" ? HEX6.test(value) : typeof value !== "number") return value;
  let rgba: readonly [number, number, number, number];
  try { rgba = parseAuraColorSrgb(value as unknown as AuraColorInput); } catch (error) {
    if (error instanceof AuraColorParseError) throw new AuraColorParseError(value, where);
    throw error;
  }
  const byte = (channel: number): string => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0");
  return `#${byte(rgba[0])}${byte(rgba[1])}${byte(rgba[2])}`;
}

/** The 148 CSS named colors (sRGB hex, alpha 1). */
const NAMED_COLORS: Readonly<Record<string, number>> = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4,
  azure: 0xf0ffff, beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000,
  blanchedalmond: 0xffebcd, blue: 0x0000ff, blueviolet: 0x8a2be2, brown: 0xa52a2a,
  burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00, chocolate: 0xd2691e,
  coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9, darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f, darkorange: 0xff8c00, darkorchid: 0x9932cc,
  darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f, darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3,
  deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969,
  dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22,
  fuchsia: 0xff00ff, gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700,
  goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000, greenyellow: 0xadff2f,
  grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c,
  indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6,
  lightcoral: 0xf08080, lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90, lightgrey: 0xd3d3d3, lightpink: 0xffb6c1, lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899, lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32,
  linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000, mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db, mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585,
  midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5,
  navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000,
  olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093,
  papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb,
  plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513,
  salmon: 0xfa8072, sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee,
  sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd,
  slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f,
  steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8,
  tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3,
  white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32
};

const CSS_NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parseStrictNumber(token: string): number {
  const t = token.trim();
  if (!CSS_NUMBER_RE.test(t)) throw new AuraColorParseError(token);
  const value = Number(t);
  if (!Number.isFinite(value)) throw new AuraColorParseError(token);
  return value;
}

function isNoneToken(token: string): boolean {
  return token.trim().toLowerCase() === "none";
}

function parseChannel(token: string): number {
  const t = token.trim();
  if (isNoneToken(t)) return 0;
  if (t.endsWith("%")) {
    const pct = parseStrictNumber(t.slice(0, -1));
    return Math.max(0, Math.min(1, pct / 100));
  }
  const value = parseStrictNumber(t);
  return Math.max(0, Math.min(1, value / 255));
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const t = token.trim();
  if (isNoneToken(t)) return 0;
  if (t.endsWith("%")) {
    const pct = parseStrictNumber(t.slice(0, -1));
    return Math.max(0, Math.min(1, pct / 100));
  }
  const value = parseStrictNumber(t);
  return Math.max(0, Math.min(1, value));
}

function splitFunctionArgs(body: string): string[] {
  // Comma syntax: rgb(r, g, b[, a]); space syntax: rgb(r g b / a).
  let args: string[];
  if (body.includes(",")) {
    args = body.split(",").map((part) => part.trim());
  } else {
    const slash = body.split("/").map((part) => part.trim());
    if (slash.length > 2) throw new AuraColorParseError(body);
    args = slash[0].split(/\s+/).filter((part) => part.length > 0);
    if (slash.length > 1) args.push(slash[1]);
  }
  // `Number("")` is 0: an empty channel (`rgb(1,,2)`) must not silently read as black.
  if (args.some((part) => part.length === 0)) throw new AuraColorParseError(body);
  return args;
}

/** CSS hue: bare degrees, `none` (`0`), or `deg` / `turn` / `rad` / `grad`. */
function parseHue(token: string): number {
  const t = token.trim().toLowerCase();
  if (t === "none") return 0;
  if (t.endsWith("deg")) return parseStrictNumber(t.slice(0, -3));
  if (t.endsWith("grad")) return parseStrictNumber(t.slice(0, -4)) * 0.9;
  if (t.endsWith("rad")) return (parseStrictNumber(t.slice(0, -3)) * 180) / Math.PI;
  if (t.endsWith("turn")) return parseStrictNumber(t.slice(0, -4)) * 360;
  return parseStrictNumber(t);
}

function parsePercentOrHundredNumber(token: string): number {
  const t = token.trim();
  if (isNoneToken(t)) return 0;
  const raw = t.endsWith("%") ? parseStrictNumber(t.slice(0, -1)) : parseStrictNumber(t);
  return raw / 100;
}

function parseNumberOrScaledPercent(token: string, pctScale: number): number {
  const t = token.trim();
  if (isNoneToken(t)) return 0;
  return t.endsWith("%") ? (parseStrictNumber(t.slice(0, -1)) / 100) * pctScale : parseStrictNumber(t);
}

function signedSrgbToLinear(channel: number): number {
  if (channel < 0) return -srgbToLinearChannel(-channel);
  return srgbToLinearChannel(channel);
}

function linearToClampedSrgbChannel(value: number): number {
  const x = Math.max(0, Math.min(1, value));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

type ParsedColor =
  | { readonly kind: "srgb"; readonly rgba: readonly [number, number, number, number] }
  | { readonly kind: "linear"; readonly rgba: readonly [number, number, number, number] };

/** `hsl()`/`hsla()` conversion — delegates to `@aura3d/math`'s canonical HSL→RGB (SM-04). */
function hslToRgb(hDeg: number, s: number, l: number, a: number): readonly [number, number, number, number] {
  const [r, g, b] = hslToRgbMath(hDeg, s, l);
  return [r, g, b, a];
}

function hwbToRgb(hDeg: number, w: number, b: number, a: number): readonly [number, number, number, number] {
  const wn = Math.max(0, w);
  const bn = Math.max(0, b);
  if (wn + bn >= 1) {
    const gray = wn / (wn + bn);
    return [gray, gray, gray, a];
  }
  const [r, g, bl] = hslToRgbMath(hDeg, 1, 0.5);
  const scale = 1 - wn - bn;
  return [r * scale + wn, g * scale + wn, bl * scale + wn, a];
}

function oklabToLinearSrgb(l: number, A: number, B: number, a: number): readonly [number, number, number, number] {
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    a
  ];
}

function parseOklchLinear(name: string, body: string): readonly [number, number, number, number] {
  const args = splitFunctionArgs(body);
  if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
  const l = Math.max(0, Math.min(1, parseNumberOrScaledPercent(args[0]!, 1)));
  const c = Math.max(0, parseNumberOrScaledPercent(args[1]!, 0.4));
  const hue = parseHue(args[2]!);
  const h = (hue * Math.PI) / 180;
  return oklabToLinearSrgb(l, c * Math.cos(h), c * Math.sin(h), parseAlpha(args[3]));
}

function parseOklabLinear(name: string, body: string): readonly [number, number, number, number] {
  const args = splitFunctionArgs(body);
  if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
  const l = Math.max(0, Math.min(1, parseNumberOrScaledPercent(args[0]!, 1)));
  const A = parseNumberOrScaledPercent(args[1]!, 0.4);
  const B = parseNumberOrScaledPercent(args[2]!, 0.4);
  return oklabToLinearSrgb(l, A, B, parseAlpha(args[3]));
}

/**
 * CSS Color 4 `color(<colorspace> c1 c2 c3 [/ a])`. Supports `display-p3`, `srgb`, `srgb-linear`, `a98-rgb`,
 * `rec2020`, and `xyz` / `xyz-d65`, preserving wide-gamut linear Rec.709 coordinates in `parseAuraColor` /
 * `parseAuraColorLinear` while clamping to `[0, 1]` sRGB in `parseAuraColorSrgb`.
 */
function parseColorSpaceFunction(body: string): ParsedColor {
  if (body.includes(",")) throw new AuraColorParseError(`color(${body})`);
  const slash = body.split("/").map((part) => part.trim());
  if (slash.length > 2 || (slash.length === 2 && slash[1]!.length === 0)) throw new AuraColorParseError(`color(${body})`);
  const tokens = slash[0]!.split(/\s+/).filter((part) => part.length > 0);
  if (tokens.length !== 4) throw new AuraColorParseError(`color(${body})`);
  const space = tokens[0]!.toLowerCase();
  const c0 = parseNumberOrScaledPercent(tokens[1]!, 1);
  const c1 = parseNumberOrScaledPercent(tokens[2]!, 1);
  const c2 = parseNumberOrScaledPercent(tokens[3]!, 1);
  const alpha = parseAlpha(slash[1]);
  if (space === "srgb") {
    if (c0 >= 0 && c0 <= 1 && c1 >= 0 && c1 <= 1 && c2 >= 0 && c2 <= 1) {
      return { kind: "srgb", rgba: [c0, c1, c2, alpha] };
    }
    return { kind: "linear", rgba: [signedSrgbToLinear(c0), signedSrgbToLinear(c1), signedSrgbToLinear(c2), alpha] };
  }
  if (space === "srgb-linear") {
    return { kind: "linear", rgba: [c0, c1, c2, alpha] };
  }
  if (space === "display-p3") {
    // Exact D65 Display-P3 -> Linear Rec.709 matrix matching `packages/rendering/src/post/shaders/displayGrade.glsl.ts`.
    const lr = signedSrgbToLinear(c0);
    const lg = signedSrgbToLinear(c1);
    const lb = signedSrgbToLinear(c2);
    return {
      kind: "linear",
      rgba: [
        1.2249401762805596 * lr - 0.2249401762805601 * lg,
        -0.0420569547096882 * lr + 1.042056954709688 * lg,
        -0.0196375545903344 * lr - 0.0786360455506318 * lg + 1.0982736001409663 * lb,
        alpha
      ]
    };
  }
  if (space === "a98-rgb") {
    const decodeA98 = (v: number): number => (v < 0 ? -((-v) ** (563 / 256)) : v ** (563 / 256));
    const lr = decodeA98(c0), lg = decodeA98(c1), lb = decodeA98(c2);
    return {
      kind: "linear",
      rgba: [
        1.3983557489578196 * lr - 0.39835574895781975 * lg,
        lg,
        -0.04292884889122026 * lg + 1.0429288488912203 * lb,
        alpha
      ]
    };
  }
  if (space === "rec2020") {
    const decode2020 = (v: number): number => {
      const s = v < 0 ? -1 : 1;
      const a = Math.abs(v);
      const alpha2020 = 1.09929682680944;
      const beta2020 = 0.018053968510807;
      return s * (a < beta2020 * 4.5 ? a / 4.5 : ((a + alpha2020 - 1) / alpha2020) ** (1 / 0.45));
    };
    const lr = decode2020(c0), lg = decode2020(c1), lb = decode2020(c2);
    return {
      kind: "linear",
      rgba: [
        1.6604910021084355 * lr - 0.5876411387885495 * lg - 0.07284986331988574 * lb,
        -0.12455047452159074 * lr + 1.1328998971259603 * lg - 0.008349422604369515 * lb,
        -0.01815076335490526 * lr - 0.10057889800800739 * lg + 1.1187296613629127 * lb,
        alpha
      ]
    };
  }
  if (space === "xyz" || space === "xyz-d65") {
    return {
      kind: "linear",
      rgba: [
        3.2404541621141054 * c0 - 1.5371385127977166 * c1 - 0.4985314095560162 * c2,
        -0.9692660305051868 * c0 + 1.8760108454466942 * c1 + 0.04155601753034984 * c2,
        0.0556434309591147 * c0 - 0.2040259135167538 * c1 + 1.0572251882231791 * c2,
        alpha
      ]
    };
  }
  throw new AuraColorParseError(`color(${body})`);
}

function parseFunctionColor(name: string, body: string): ParsedColor {
  if (name === "color") return parseColorSpaceFunction(body);
  if (name === "oklch") return { kind: "linear", rgba: parseOklchLinear(name, body) };
  if (name === "oklab") return { kind: "linear", rgba: parseOklabLinear(name, body) };
  const args = splitFunctionArgs(body);
  if (name === "rgb" || name === "rgba") {
    if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
    return { kind: "srgb", rgba: [parseChannel(args[0]!), parseChannel(args[1]!), parseChannel(args[2]!), parseAlpha(args[3])] };
  }
  if (name === "hsl" || name === "hsla") {
    if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
    const hDeg = parseHue(args[0]!);
    const s = parsePercentOrHundredNumber(args[1]!);
    const l = parsePercentOrHundredNumber(args[2]!);
    const a = parseAlpha(args[3]);
    return { kind: "srgb", rgba: hslToRgb(hDeg, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)), a) };
  }
  if (name === "hwb") {
    if (body.includes(",")) throw new AuraColorParseError(`${name}(${body})`);
    if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
    const hDeg = parseHue(args[0]!);
    const w = parsePercentOrHundredNumber(args[1]!);
    const b = parsePercentOrHundredNumber(args[2]!);
    const a = parseAlpha(args[3]);
    return { kind: "srgb", rgba: hwbToRgb(hDeg, w, b, a) };
  }
  throw new AuraColorParseError(`${name}(${body})`);
}

function parseHex(body: string): readonly [number, number, number, number] {
  switch (body.length) {
    case 3:
      return [
        parseInt(body[0] + body[0], 16) / 255,
        parseInt(body[1] + body[1], 16) / 255,
        parseInt(body[2] + body[2], 16) / 255,
        1
      ];
    case 4:
      return [
        parseInt(body[0] + body[0], 16) / 255,
        parseInt(body[1] + body[1], 16) / 255,
        parseInt(body[2] + body[2], 16) / 255,
        parseInt(body[3] + body[3], 16) / 255
      ];
    case 6: {
      const v = Number.parseInt(body, 16);
      return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, 1];
    }
    case 8: {
      const v = Number.parseInt(body, 16);
      const rgb = v >>> 8;
      return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255, (v & 0xff) / 255];
    }
    default:
      throw new AuraColorParseError(`#${body}`);
  }
}

function parseRawAuraColor(color: AuraColorInput): ParsedColor {
  if (typeof color === "number" && Number.isFinite(color) && color >= 0) {
    const v = color >>> 0;
    // 0xRRGGBBAA when the top byte is non-zero-opaque meaningful; heuristic:
    // treat > 0xFFFFFF as RGBA, else RGB (matches the PR 0a stub semantics).
    if (color > 0xffffff) {
      return { kind: "srgb", rgba: [((v >> 24) & 0xff) / 255, ((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255] };
    }
    return { kind: "srgb", rgba: [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, 1] };
  }
  if (typeof color !== "string") throw new AuraColorParseError(color);
  const input = color.trim();
  const hexMatch = /^#([0-9a-f]+)$/i.exec(input);
  if (hexMatch) return { kind: "srgb", rgba: parseHex(hexMatch[1]!) };
  const fnMatch = /^(rgb|rgba|hsl|hsla|hwb|oklch|oklab|color)\((.+)\)$/i.exec(input);
  if (fnMatch) {
    // Report the whole authored value, not the inner token that failed.
    try { return parseFunctionColor(fnMatch[1]!.toLowerCase(), fnMatch[2]!); } catch { throw new AuraColorParseError(color); }
  }
  if (input.toLowerCase() === "transparent") return { kind: "srgb", rgba: [0, 0, 0, 0] };
  const named = NAMED_COLORS[input.toLowerCase()];
  if (named !== undefined) {
    return { kind: "srgb", rgba: [((named >> 16) & 0xff) / 255, ((named >> 8) & 0xff) / 255, (named & 0xff) / 255, 1] };
  }
  throw new AuraColorParseError(color);
}

/** sRGB-encoded [r,g,b,a] each clamped to 0..1. Throws AuraColorParseError on unknown input. */
export function parseAuraColorSrgb(color: AuraColorInput): readonly [number, number, number, number] {
  const parsed = parseRawAuraColor(color);
  if (parsed.kind === "srgb") return parsed.rgba;
  const [r, g, b, a] = parsed.rgba;
  return [linearToClampedSrgbChannel(r), linearToClampedSrgbChannel(g), linearToClampedSrgbChannel(b), a];
}

/**
 * Unclamped linear Rec.709 / linear-sRGB RGBA — sRGB forms pass through the exact piecewise transfer, while wide-gamut
 * forms (`color(display-p3 ...)`, `color(rec2020 ...)`, `color(srgb-linear ...)`, `oklch(...)`, `oklab(...)`) preserve
 * out-of-sRGB-gamut linear Rec.709 coordinates (`< 0` or `> 1`) for wide-gamut Display-P3 / HDR rendering.
 */
export function parseAuraColorLinear(color: AuraColorInput): readonly [number, number, number, number] {
  const parsed = parseRawAuraColor(color);
  if (parsed.kind === "linear") return parsed.rgba;
  const [r, g, b, a] = parsed.rgba;
  return [srgbToLinearChannel(r), srgbToLinearChannel(g), srgbToLinearChannel(b), a];
}

/** Linear-light RGBA — delegates to {@link parseAuraColorLinear}, preserving wide-gamut linear Rec.709 coordinates. */
export function parseAuraColor(color: AuraColorInput): readonly [number, number, number, number] {
  return parseAuraColorLinear(color);
}
