// PRD-07 P4-T1 — CPU mirror of the §6.6/§8.4 fog model.
// `a3d_prd07_fog` (atmosphere/shaders/fog.glsl.ts) is the shader twin; every
// function here must agree with the GLSL within the PRD tolerances.
//
// Rendering cannot import engine contracts, so the spec is a readonly record
// whose field names mirror AuraHeightFogSpec (packages/engine/contracts/
// atmosphere.ts). The engine side passes its spec through unchanged.

import { srgbToLinearChannel } from "../ColorManagement";
import { evaluateSky, skyFrame } from "./SkyEval";

export type Vec3 = readonly [number, number, number];

/** Rendering-side mirror of the engine's AuraHeightFogSpec field set. */
export interface Prd07FogSpec {
  readonly mode?: "height" | "exp" | "exp2" | "linear" | "absorption";
  readonly color?: string | readonly number[] | "sky";
  readonly density?: number;          // legacy density → σd for exp/exp2
  readonly heightDensity?: number;    // σh
  readonly heightFalloff?: number;    // b
  readonly heightReference?: number;  // h0
  readonly start?: number;            // metres before fog starts
  readonly maxOpacity?: number;
  readonly near?: number;             // linear mode
  readonly far?: number;              // linear mode
  readonly absorption?: Vec3;         // per-channel σ (absorption mode)
  readonly sunInscatter?: number;
  readonly anisotropy?: number;       // HG g
  readonly ambientScale?: number;
  readonly affectsBackground?: boolean;
  readonly backgroundDistance?: number;
  readonly transitionSeconds?: number;
  readonly legacyOpacityCap?: boolean;
  /** Legacy scalar — only read when legacyOpacityCap restores the §11 cap. */
  readonly intensity?: number;
}

/** §6.6 C-21 frozen defaults — applied at resolve time, not by the builder. */
export const PRD07_FOG_DEFAULTS = {
  mode: "height" as const,
  sigmaD: 0.004,
  sigmaH: 0.008,
  b: 0.2,
  h0: 0,
  start: 2,
  maxOpacity: 1,
  color: "sky" as const,
  fallbackColor: [0.663, 0.737, 0.812] as Vec3, // #a9bccf linear
  anisotropy: 0.6,
  sunInscatter: 0,
  ambientScale: 1,
  affectsBackground: true,
  linearNear: 0,
  linearFar: 500
};

/** Fog modes as packed into `u_fogMode` (§8.4 + legacy-parity 6). */
export const FOG_MODE = {
  off: 0,
  height: 1,
  exp: 2,
  exp2: 3,
  linear: 4,
  absorption: 5,
  legacyParity: 6
} as const;

/**
 * Resolve-time defaulting (§6.6): `effects.fog()` with no authored fields →
 * height defaults; a legacy call that authored only `density`/`color`/
 * `intensity` keeps exp2 with that density and maxOpacity 1.
 */
export type ResolvedPrd07FogSpec = Required<Pick<Prd07FogSpec, "mode" | "density" | "start" | "maxOpacity" | "heightDensity" | "heightFalloff" | "heightReference" | "anisotropy" | "ambientScale" | "affectsBackground" | "sunInscatter">> & Prd07FogSpec;

export function resolvePrd07FogSpec(spec: Prd07FogSpec | null | undefined): ResolvedPrd07FogSpec {
  if (!spec) {
    return {
      mode: PRD07_FOG_DEFAULTS.mode,
      density: PRD07_FOG_DEFAULTS.sigmaD,
      heightDensity: PRD07_FOG_DEFAULTS.sigmaH,
      heightFalloff: PRD07_FOG_DEFAULTS.b,
      heightReference: PRD07_FOG_DEFAULTS.h0,
      start: PRD07_FOG_DEFAULTS.start,
      maxOpacity: PRD07_FOG_DEFAULTS.maxOpacity,
      color: PRD07_FOG_DEFAULTS.color,
      anisotropy: PRD07_FOG_DEFAULTS.anisotropy,
      sunInscatter: PRD07_FOG_DEFAULTS.sunInscatter,
      ambientScale: PRD07_FOG_DEFAULTS.ambientScale,
      affectsBackground: PRD07_FOG_DEFAULTS.affectsBackground
    };
  }
  const authoredSemantic =
    spec.mode !== undefined || spec.heightDensity !== undefined || spec.heightFalloff !== undefined ||
    spec.heightReference !== undefined || spec.start !== undefined || spec.absorption !== undefined ||
    spec.sunInscatter !== undefined || spec.anisotropy !== undefined || spec.near !== undefined ||
    spec.far !== undefined || spec.maxOpacity !== undefined;
  const base: { -readonly [K in keyof Prd07FogSpec]?: Prd07FogSpec[K] } = { ...spec };
  if (!authoredSemantic && spec.density !== undefined) {
    // Legacy authoring: density/color/intensity only → exp2, maxOpacity 1.
    base.mode = "exp2";
    base.maxOpacity = 1;
    // …and the legacy background behaviour: legacy exp2 never fogged the
    // background. Fogging it at camera.far turned the dark hangar backdrop of
    // prd07-volumetric-shafts (volumetricFog density 0.012) into the fog
    // colour, which the god-ray pass then blew out to white. §6.6
    // `affectsBackground` stays the default for height-mode fog.
    if (spec.affectsBackground === undefined) base.affectsBackground = false;
  } else if (!authoredSemantic) {
    base.mode = PRD07_FOG_DEFAULTS.mode;
  } else if (
    spec.mode === undefined && (spec.near !== undefined || spec.far !== undefined) &&
    spec.heightDensity === undefined && spec.heightFalloff === undefined && spec.heightReference === undefined &&
    spec.absorption === undefined
  ) {
    // GU47 phase 2 (uniform haze): an authored range with no mode is the linear fog the range describes
    // (`looks.nodes` writes `{ density: 24/far, near, far }` for every look fog override). It fell to the height
    // default, which read the 24/far density as a per-metre σd at maxOpacity 1 and washed the whole view
    // (aura-hoops-3d athens 0.075/m: 78% fog colour on the court 20 m away).
    base.mode = "linear";
  }
  if (spec.legacyOpacityCap) {
    // §11 restore: legacy cap 0.25 + intensity·0.55 clamped to 0.92.
    const intensity = Math.min(Math.max(spec.intensity ?? 0.5, 0), 1);
    base.maxOpacity = Math.min(Math.max(0.25 + intensity * 0.55, 0), 0.92);
  }
  const resolvedMode = base.mode ?? PRD07_FOG_DEFAULTS.mode;
  // §6.6: affectsBackground is only the default for vertically-bounded height fog; isotropic
  // linear / exp / exp2 / absorption fogs evaluated at camera.far wipe out the entire sky dome
  // unless the caller explicitly sets `affectsBackground: true`.
  const defaultAffectsBackground = resolvedMode === "height" ? PRD07_FOG_DEFAULTS.affectsBackground : false;
  return {
    density: PRD07_FOG_DEFAULTS.sigmaD,
    heightDensity: PRD07_FOG_DEFAULTS.sigmaH,
    heightFalloff: PRD07_FOG_DEFAULTS.b,
    heightReference: PRD07_FOG_DEFAULTS.h0,
    start: PRD07_FOG_DEFAULTS.start,
    color: PRD07_FOG_DEFAULTS.color,
    anisotropy: PRD07_FOG_DEFAULTS.anisotropy,
    sunInscatter: PRD07_FOG_DEFAULTS.sunInscatter,
    ambientScale: PRD07_FOG_DEFAULTS.ambientScale,
    ...base,
    affectsBackground: spec.affectsBackground ?? base.affectsBackground ?? defaultAffectsBackground,
    mode: resolvedMode,
    maxOpacity: base.maxOpacity ?? PRD07_FOG_DEFAULTS.maxOpacity
  };
}

/**
 * §6.6 integrated height fog: τ = σ_d·d' + σ_h·exp(-b·(c.y-h0))·d'·L(k), where
 * `k = b·v.y·d'` and `L(k) = (1 - exp(-k))/k` (→ 1 as k→0). `d' = max(d-start,0)`.
 */
export function heightFogTau(camY: number, dirY: number, distance: number, spec: Prd07FogSpec): number {
  const s = resolvePrd07FogSpec(spec);
  const d = Math.max(distance - s.start, 0);
  if (d <= 0) return 0;
  let tau = s.density * d;
  const b = s.heightFalloff;
  const k = b * dirY * d;
  const line = Math.abs(k) < 1e-4 ? 1 : (1 - Math.exp(-k)) / k;
  tau += s.heightDensity * Math.exp(-b * (camY - s.heightReference)) * d * line;
  return tau;
}

/** τ for the mode selected by spec (height/exp/exp2); volumes are added by callers. */
export function fogTau(cam: Vec3, dir: Vec3, distance: number, spec: Prd07FogSpec): number {
  const s = resolvePrd07FogSpec(spec);
  switch (s.mode) {
    case "height":
      return heightFogTau(cam[1], dir[1], distance, s);
    case "exp":
      return s.density * distance;
    case "exp2": {
      const sd = s.density * distance;
      return sd * sd;
    }
    default:
      return 0;
  }
}

/** `min(f, maxOpacity)` where f is per mode (linear uses near/far). */
export function fogAmount(cam: Vec3, worldPos: Vec3, spec: Prd07FogSpec): number {
  const s = resolvePrd07FogSpec(spec);
  const r = [worldPos[0] - cam[0], worldPos[1] - cam[1], worldPos[2] - cam[2]] as const;
  const d = Math.hypot(r[0], r[1], r[2]);
  let f: number;
  if (s.mode === "linear") {
    const near = s.near ?? PRD07_FOG_DEFAULTS.linearNear;
    const far = s.far ?? PRD07_FOG_DEFAULTS.linearFar;
    f = Math.min(Math.max((d - near) / Math.max(far - near, 1e-6), 0), 1);
  } else {
    const inv = d > 1e-5 ? 1 / d : 0;
    f = 1 - Math.exp(-fogTau(cam, [r[0] * inv, r[1] * inv, r[2] * inv], d, s));
  }
  return Math.min(f, s.maxOpacity);
}

/** Henyey-Greenstein phase (§8.4): `u_fogColor + u_sunColor · HG(mu,g) · sunInscatter`. */
export function fogInscatter(dir: Vec3, spec: Prd07FogSpec, fogColor: Vec3, sunDir: Vec3, sunColor: Vec3): Vec3 {
  const s = resolvePrd07FogSpec(spec);
  const g = s.anisotropy;
  const mu = dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2];
  const hg = (1 - g * g) / (12.5663706 * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  const scale = s.ambientScale;
  const si = s.sunInscatter ?? 0;
  return [
    fogColor[0] * scale + sunColor[0] * hg * si,
    fogColor[1] * scale + sunColor[1] * hg * si,
    fogColor[2] * scale + sunColor[2] * hg * si
  ];
}

/**
 * §6.6 `color:"sky"` — evaluate the sky's horizon radiance at `azimuth`
 * (radians, atan2(fx, fz) of the view direction) as the mean of the two
 * nearest of 8 azimuth samples. Returns null when no usable sky spec exists.
 * SkyBackgroundPass.horizonRadiance is the GPU-side twin of this table.
 */
export function skyHorizonRadiance(sky: unknown, azimuth: number): Vec3 | null {
  if (!sky) return null;
  let frame: ReturnType<typeof skyFrame>;
  try {
    frame = skyFrame(sky as Parameters<typeof skyFrame>[0]);
  } catch {
    return null;
  }
  const wrapped = ((azimuth % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const slot = (wrapped / (Math.PI * 2)) * 8;
  const i0 = Math.floor(slot) % 8;
  const i1 = (i0 + 1) % 8;
  const t = slot - Math.floor(slot);
  const at = (i: number): Vec3 => {
    const phi = (i / 8) * Math.PI * 2;
    return evaluateSky(frame, [Math.sin(phi), 0, Math.cos(phi)]) as Vec3;
  };
  const a = at(i0);
  const b = at(i1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const CSS_NAMED_FOG_COLORS: Readonly<Record<string, number>> = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff,
  beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff,
  blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00,
  chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9,
  darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00, darkorchid: 0x9932cc, darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3, deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969,
  dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080,
  green: 0x008000, greenyellow: 0xadff2f, grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4,
  indianred: 0xcd5c5c, indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080,
  lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3, lightpink: 0xffb6c1, lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa,
  lightslategray: 0x778899, lightslategrey: 0x778899, lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0,
  lime: 0x00ff00, limegreen: 0x32cd32, linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000,
  mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585, midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5,
  navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000, olivedrab: 0x6b8e23,
  orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6, palegoldenrod: 0xeee8aa, palegreen: 0x98fb98,
  paleturquoise: 0xafeeee, palevioletred: 0xdb7093, papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f,
  pink: 0xffc0cb, plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072,
  sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0,
  skyblue: 0x87ceeb, slateblue: 0x6a5acd, slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa,
  springgreen: 0x00ff7f, steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8,
  tomato: 0xff6347, transparent: 0x000000, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3,
  white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32
};

const CSS_NUM_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parseCssNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!CSS_NUM_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function splitCssColorArgs(body: string): string[] | null {
  const slashIdx = body.indexOf("/");
  const main = (slashIdx >= 0 ? body.slice(0, slashIdx) : body).trim();
  if (!main) return null;
  const parts = main.includes(",") ? main.split(",").map((p) => p.trim()) : main.split(/\s+/).filter(Boolean);
  return parts.length >= 3 ? parts.slice(0, 3) : null;
}

function parseCssRgbChannel(token: string): number | null {
  if (token.endsWith("%")) {
    const pct = parseCssNumber(token.slice(0, -1));
    return pct === null ? null : Math.min(Math.max(pct / 100, 0), 1);
  }
  const n = parseCssNumber(token);
  return n === null ? null : Math.min(Math.max(n / 255, 0), 1);
}

function parseCssHueDegrees(token: string): number | null {
  const lower = token.trim().toLowerCase();
  let scale = 1;
  let numStr = lower;
  if (lower.endsWith("deg")) { numStr = lower.slice(0, -3); scale = 1; }
  else if (lower.endsWith("grad")) { numStr = lower.slice(0, -4); scale = 0.9; }
  else if (lower.endsWith("rad")) { numStr = lower.slice(0, -3); scale = 180 / Math.PI; }
  else if (lower.endsWith("turn")) { numStr = lower.slice(0, -4); scale = 360; }
  const n = parseCssNumber(numStr);
  return n === null ? null : (((n * scale) % 360) + 360) % 360;
}

function parseCssPercentOrHundred(token: string): number | null {
  const trimmed = token.trim();
  const numStr = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
  const n = parseCssNumber(numStr);
  return n === null ? null : Math.min(Math.max(n / 100, 0), 1);
}

function hslToSrgb(hDeg: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hDeg / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hDeg < 60) { r1 = c; g1 = x; }
  else if (hDeg < 120) { r1 = x; g1 = c; }
  else if (hDeg < 180) { g1 = c; b1 = x; }
  else if (hDeg < 240) { g1 = x; b1 = c; }
  else if (hDeg < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [r1 + m, g1 + m, b1 + m];
}

function parseFogCssString(input: string): [number, number, number] | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const named = CSS_NAMED_FOG_COLORS[lower];
  if (named !== undefined) {
    return [((named >> 16) & 0xff) / 255, ((named >> 8) & 0xff) / 255, (named & 0xff) / 255];
  }
  const fnMatch = /^(rgba?|hsla?)\(([^)]*)\)$/i.exec(trimmed);
  if (fnMatch) {
    const fn = fnMatch[1]!.toLowerCase();
    const args = splitCssColorArgs(fnMatch[2]!);
    if (!args) return null;
    if (fn === "rgb" || fn === "rgba") {
      const cr = parseCssRgbChannel(args[0]!);
      const cg = parseCssRgbChannel(args[1]!);
      const cb = parseCssRgbChannel(args[2]!);
      return cr !== null && cg !== null && cb !== null ? [cr, cg, cb] : null;
    }
    const h = parseCssHueDegrees(args[0]!);
    const s = parseCssPercentOrHundred(args[1]!);
    const l = parseCssPercentOrHundred(args[2]!);
    return h !== null && s !== null && l !== null ? hslToSrgb(h, s, l) : null;
  }
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-f]{3}$/i.test(hex) || /^[0-9a-f]{4}$/i.test(hex)) {
    const r = Number.parseInt(hex[0]! + hex[0]!, 16) / 255;
    const g = Number.parseInt(hex[1]! + hex[1]!, 16) / 255;
    const b = Number.parseInt(hex[2]! + hex[2]!, 16) / 255;
    return [r, g, b];
  }
  if (/^[0-9a-f]{6}$/i.test(hex) || /^[0-9a-f]{8}$/i.test(hex)) {
    const rgbHex = hex.slice(0, 6);
    const parsed = Number.parseInt(rgbHex, 16);
    return [((parsed >> 16) & 0xff) / 255, ((parsed >> 8) & 0xff) / 255, (parsed & 0xff) / 255];
  }
  return null;
}

/**
 * §6.6 — authored color → linear fog RGB. `"sky"` resolves elsewhere (to the
 * horizon sample or `PRD07_FOG_DEFAULTS.fallbackColor`); authored values are
 * sRGB-normalized like every other authored color in the codebase.
 */
export function parseFogColor(color: Prd07FogSpec["color"] | { readonly r: number; readonly g?: number; readonly b?: number } | undefined, fallback: Vec3): Vec3 {
  if (color === undefined || color === null || color === "sky") return fallback;
  let r = 1;
  let g = 1;
  let b = 1;
  if (typeof color === "string") {
    const parsed = parseFogCssString(color);
    if (!parsed) return fallback;
    [r, g, b] = parsed;
  } else if (Array.isArray(color)) {
    r = color[0] ?? 1;
    g = color[1] ?? r;
    b = color[2] ?? g;
  } else if (typeof color === "object" && "r" in color) {
    r = color.r;
    g = color.g ?? r;
    b = color.b ?? g;
  } else {
    return fallback;
  }
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return fallback;
  return [srgbToLinearChannel(r), srgbToLinearChannel(g), srgbToLinearChannel(b)];
}

/** Absorption transmittance `T = exp(-σ·d)` per channel. */
export function absorptionTransmittance(sigma: Vec3, distance: number): Vec3 {
  return [
    Math.exp(-sigma[0] * distance),
    Math.exp(-sigma[1] * distance),
    Math.exp(-sigma[2] * distance)
  ];
}

/** Full §8.4 `a3dApplyFog` CPU mirror (volumetric term handled by P5). */
export function applyFog(
  color: Vec3,
  cam: Vec3,
  worldPos: Vec3,
  spec: Prd07FogSpec,
  fogColor: Vec3,
  sunDir: Vec3 = [0, 1, 0],
  sunColor: Vec3 = [0, 0, 0]
): Vec3 {
  const s = resolvePrd07FogSpec(spec);
  if (s.mode === "height" || s.mode === "exp" || s.mode === "exp2" || s.mode === "linear" || s.mode === "absorption") {
    const r: Vec3 = [worldPos[0] - cam[0], worldPos[1] - cam[1], worldPos[2] - cam[2]];
    const d = Math.hypot(r[0], r[1], r[2]);
    if (s.mode === "absorption") {
      const sigma = s.absorption ?? [0, 0, 0];
      const t = absorptionTransmittance(sigma as Vec3, d);
      const fc = fogColor;
      return [
        color[0] * t[0] + fc[0] * (1 - t[0]),
        color[1] * t[1] + fc[1] * (1 - t[1]),
        color[2] * t[2] + fc[2] * (1 - t[2])
      ];
    }
    const inv = d > 1e-5 ? 1 / d : 0;
    const dir: Vec3 = [r[0] * inv, r[1] * inv, r[2] * inv];
    const f = fogAmount(cam, worldPos, s);
    const sc = fogInscatter(dir, s, fogColor, sunDir, sunColor);
    return [
      color[0] * (1 - f) + sc[0] * f,
      color[1] * (1 - f) + sc[1] * f,
      color[2] * (1 - f) + sc[2] * f
    ];
  }
  return [...color] as Vec3;
}

/** Legacy `u_environmentFog*` uniform block (ShaderChunks.ts:472-514 source values). */
export interface LegacyFogUniforms {
  readonly enabled: number;          // u_environmentFogEnabled
  readonly mode: number;             // <1.5 linear, <2.5 exp, else exp2
  readonly density: number;
  readonly near: number;
  readonly far: number;
  readonly heightFalloff: number;
  readonly heightReference: number;
  readonly maxOpacity: number;
}

/**
 * Verbatim JS port of `a3dEnvironmentFogFactor` (ShaderChunks.ts:475-491). This
 * is the oracle the §8.4 legacy-parity mode (u_fogMode == 6) must match to 1e-6.
 */
export function legacyEnvironmentFogFactor(cam: Vec3, worldPos: Vec3, u: LegacyFogUniforms): number {
  if (u.enabled < 0.5) return 0;
  const distanceToCamera = Math.hypot(cam[0] - worldPos[0], cam[1] - worldPos[1], cam[2] - worldPos[2]);
  let factor = 0;
  if (u.mode < 1.5) {
    factor = (distanceToCamera - u.near) / Math.max(u.far - u.near, 0.000001);
  } else if (u.mode < 2.5) {
    factor = 1 - Math.exp(-Math.max(u.density, 0) * distanceToCamera);
  } else {
    const scaledDensity = Math.max(u.density, 0) * distanceToCamera;
    factor = 1 - Math.exp(-(scaledDensity * scaledDensity));
  }
  const heightMultiplier = u.heightFalloff > 0
    ? Math.exp(-Math.max(0, worldPos[1] - u.heightReference) * u.heightFalloff)
    : 1;
  return Math.min(Math.max(factor * heightMultiplier, 0), 1) * Math.min(Math.max(u.maxOpacity, 0), 1);
}

export interface PackedLegacyFog {
  readonly mode: "linear" | "exponential" | "exponential-squared";
  readonly density: number;
  readonly near: number;
  readonly far: number;
  readonly heightFalloff: number;
  readonly heightReference: number;
  readonly maxOpacity: number;
}

const LEGACY_MODE_NUM = { linear: 1, exponential: 2, "exponential-squared": 3 } as const;

/** Luminance weights used to collapse per-channel absorption σ for the legacy exp approximation (§6.6). */
export const ABSORPTION_LUMINANCE_WEIGHTS: Vec3 = [0.2126, 0.7152, 0.0722];

/**
 * §6.6 legacy mapping: height → exp with `density = σd + σh·exp(-b·(camY-h0))`
 * and the legacy height multiplier `falloff = b` at `heightReference = h0`.
 * Absorption → exp with the luminance-weighted σ and the fog colour at 10 m
 * (the colour term is resolved by the caller; this packs the optics only).
 */
export function packLegacy(spec: Prd07FogSpec, cameraY: number): PackedLegacyFog {
  const s = resolvePrd07FogSpec(spec);
  switch (s.mode) {
    case "height":
      return {
        mode: "exponential",
        density: s.density + s.heightDensity * Math.exp(-s.heightFalloff * (cameraY - s.heightReference)),
        near: 0,
        far: 1,
        heightFalloff: s.heightFalloff,
        heightReference: s.heightReference,
        maxOpacity: s.maxOpacity
      };
    case "exp":
      return { mode: "exponential", density: s.density, near: 0, far: 1, heightFalloff: s.heightFalloff ?? 0, heightReference: s.heightReference ?? 0, maxOpacity: s.maxOpacity };
    case "exp2":
      return { mode: "exponential-squared", density: s.density, near: 0, far: 1, heightFalloff: s.heightFalloff ?? 0, heightReference: s.heightReference ?? 0, maxOpacity: s.maxOpacity };
    case "linear":
      return { mode: "linear", density: s.density, near: s.near ?? PRD07_FOG_DEFAULTS.linearNear, far: s.far ?? PRD07_FOG_DEFAULTS.linearFar, heightFalloff: s.heightFalloff ?? 0, heightReference: s.heightReference ?? 0, maxOpacity: s.maxOpacity };
    case "absorption": {
      const sigma = s.absorption ?? [0, 0, 0];
      const lum = sigma[0] * ABSORPTION_LUMINANCE_WEIGHTS[0] + sigma[1] * ABSORPTION_LUMINANCE_WEIGHTS[1] + sigma[2] * ABSORPTION_LUMINANCE_WEIGHTS[2];
      return { mode: "exponential", density: lum, near: 0, far: 1, heightFalloff: 0, heightReference: 0, maxOpacity: s.maxOpacity };
    }
  }
}

/** Convert the legacy pack into the `u_environmentFog*` uniform block. */
export function legacyUniformsFromPacked(packed: PackedLegacyFog): LegacyFogUniforms {
  return {
    enabled: 1,
    mode: LEGACY_MODE_NUM[packed.mode],
    density: packed.density,
    near: packed.near,
    far: packed.far,
    heightFalloff: packed.heightFalloff,
    heightReference: packed.heightReference,
    maxOpacity: packed.maxOpacity
  };
}

/** Packed `a3d_prd07_fog` uniform block (§8.4 + mode-6 aliasing, see fog.glsl). */
export interface PackedFogUniforms {
  readonly fogA: readonly [number, number, number, number];  // σd, σh, b, h0 — mode 6: density, heightFalloff, heightReference, legacyMode
  readonly fogB: readonly [number, number, number, number];  // start, maxOpacity, sunInscatter, g — mode 6: near, far, maxOpacity, 0
  readonly fogColor: Vec3;
  readonly fogAbsorption: Vec3;
  readonly fogMode: number;
  readonly fogNear: number;
  readonly fogFar: number;
}

/**
 * Pack §8.4 uniforms. `v2` modes (1-5) pack the spec fields; `legacyParity`
 * packs `packLegacy` output into the same slots (aliasing documented in the
 * chunk) so PRD 07 programs evaluate the exact legacy formula — the §6.6
 * parity rule while forward geometry is on the legacy path.
 */
export function packV2(spec: Prd07FogSpec, opts: { readonly fogColor: Vec3; readonly cameraY?: number; readonly parity?: boolean }): PackedFogUniforms {
  const s = resolvePrd07FogSpec(spec);
  if (opts.parity) {
    const legacy = packLegacy(s, opts.cameraY ?? 0);
    return {
      fogA: [legacy.density, legacy.heightFalloff, legacy.heightReference, LEGACY_MODE_NUM[legacy.mode]],
      fogB: [legacy.near, legacy.far, legacy.maxOpacity, 0],
      fogColor: opts.fogColor,
      fogAbsorption: s.absorption ?? [0, 0, 0],
      fogMode: FOG_MODE.legacyParity,
      fogNear: legacy.near,
      fogFar: legacy.far
    };
  }
  return {
    fogA: [s.density, s.heightDensity, s.heightFalloff, s.heightReference],
    fogB: [s.start, s.maxOpacity, s.sunInscatter ?? 0, s.anisotropy],
    fogColor: opts.fogColor,
    fogAbsorption: s.absorption ?? [0, 0, 0],
    fogMode: FOG_MODE[s.mode === "height" ? "height" : s.mode] ?? 0,
    fogNear: s.near ?? PRD07_FOG_DEFAULTS.linearNear,
    fogFar: s.far ?? PRD07_FOG_DEFAULTS.linearFar
  };
}

/**
 * CPU mirror of the §8.4 legacy-parity branch (`u_fogMode == 6`): reads the
 * aliased `packV2(..., {parity:true})` slots through the GLSL layout.
 */
export function legacyParityFogAmount(cam: Vec3, worldPos: Vec3, packed: PackedFogUniforms): number {
  const u: LegacyFogUniforms = {
    enabled: packed.fogMode === FOG_MODE.legacyParity ? 1 : 0,
    mode: packed.fogA[3],
    density: packed.fogA[0],
    near: packed.fogB[0],
    far: packed.fogB[1],
    heightFalloff: packed.fogA[1],
    heightReference: packed.fogA[2],
    maxOpacity: packed.fogB[2]
  };
  return legacyEnvironmentFogFactor(cam, worldPos, u);
}
