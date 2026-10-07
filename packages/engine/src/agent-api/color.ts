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

export type AuraColorInput = string | number;

export class AuraColorParseError extends Error {
  constructor(public readonly input: unknown) {
    super(`AuraColorParseError:${String(input)}`);
    this.name = "AuraColorParseError";
  }
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

function parseChannel(token: string): number {
  const t = token.trim();
  if (t.endsWith("%")) {
    const pct = Number(t.slice(0, -1));
    if (!Number.isFinite(pct)) throw new AuraColorParseError(token);
    return Math.max(0, Math.min(1, pct / 100));
  }
  const value = Number(t);
  if (!Number.isFinite(value)) throw new AuraColorParseError(token);
  return Math.max(0, Math.min(1, value / 255));
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const t = token.trim();
  if (t.endsWith("%")) {
    const pct = Number(t.slice(0, -1));
    if (!Number.isFinite(pct)) throw new AuraColorParseError(token);
    return Math.max(0, Math.min(1, pct / 100));
  }
  const value = Number(t);
  if (!Number.isFinite(value)) throw new AuraColorParseError(token);
  return Math.max(0, Math.min(1, value));
}

function splitFunctionArgs(body: string): string[] {
  // Comma syntax: rgb(r, g, b[, a]); space syntax: rgb(r g b / a).
  if (body.includes(",")) {
    return body.split(",").map((part) => part.trim());
  }
  const slash = body.split("/").map((part) => part.trim());
  const first = slash[0].split(/\s+/).filter((part) => part.length > 0);
  if (slash.length > 1) first.push(slash[1]);
  return first;
}

function parseFunctionColor(name: string, body: string): readonly [number, number, number, number] {
  const args = splitFunctionArgs(body);
  if (name === "rgb" || name === "rgba") {
    if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
    return [parseChannel(args[0]), parseChannel(args[1]), parseChannel(args[2]), parseAlpha(args[3])];
  }
  if (name === "hsl" || name === "hsla") {
    if (args.length !== 3 && args.length !== 4) throw new AuraColorParseError(`${name}(${body})`);
    const hRaw = args[0].trim();
    const hDeg = hRaw.endsWith("deg") ? Number(hRaw.slice(0, -3)) : hRaw.endsWith("turn") ? Number(hRaw.slice(0, -4)) * 360 : Number(hRaw);
    const s = args[1].trim().endsWith("%") ? Number(args[1].trim().slice(0, -1)) / 100 : Number(args[1]);
    const l = args[2].trim().endsWith("%") ? Number(args[2].trim().slice(0, -1)) / 100 : Number(args[2]);
    if (!Number.isFinite(hDeg) || !Number.isFinite(s) || !Number.isFinite(l)) throw new AuraColorParseError(`${name}(${body})`);
    const a = parseAlpha(args[3]);
    return hslToRgb(hDeg, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)), a);
  }
  throw new AuraColorParseError(`${name}(${body})`);
}

function hslToRgb(hDeg: number, s: number, l: number, a: number): readonly [number, number, number, number] {
  const h = ((hDeg % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3), a];
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

/** sRGB-encoded [r,g,b,a] each 0..1. Throws AuraColorParseError on unknown input. */
export function parseAuraColorSrgb(color: AuraColorInput): readonly [number, number, number, number] {
  if (typeof color === "number" && Number.isFinite(color)) {
    const v = color >>> 0;
    // 0xRRGGBBAA when the top byte is non-zero-opaque meaningful; heuristic:
    // treat > 0xFFFFFF as RGBA, else RGB (matches the PR 0a stub semantics).
    if (color > 0xffffff) {
      return [((v >> 24) & 0xff) / 255, ((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
    }
    return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, 1];
  }
  if (typeof color !== "string") throw new AuraColorParseError(color);
  const input = color.trim();
  const hexMatch = /^#([0-9a-f]+)$/i.exec(input);
  if (hexMatch) return parseHex(hexMatch[1]);
  const fnMatch = /^(rgb|rgba|hsl|hsla)\((.+)\)$/i.exec(input);
  if (fnMatch) return parseFunctionColor(fnMatch[1].toLowerCase(), fnMatch[2]);
  const named = NAMED_COLORS[input.toLowerCase()];
  if (named !== undefined) {
    return [((named >> 16) & 0xff) / 255, ((named >> 8) & 0xff) / 255, (named & 0xff) / 255, 1];
  }
  throw new AuraColorParseError(color);
}

/** Linear-light RGBA — sRGB channels passed through the exact piecewise transfer. */
export function parseAuraColor(color: AuraColorInput): readonly [number, number, number, number] {
  const [r, g, b, a] = parseAuraColorSrgb(color);
  return [srgbToLinearChannel(r), srgbToLinearChannel(g), srgbToLinearChannel(b), a];
}
