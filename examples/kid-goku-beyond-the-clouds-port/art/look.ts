/**
 * GU47 WP-35 look table for Cumulus Dash ("Storm-washed sky plateau", PRD §3.2 item 2). One row per variant:
 *
 * - `storm-washed` (default): mid-morning just after a mountain squall. One sun (28 deg, side-front, #ffe2b8) drives the
 *   sky disc, the custom scenery light, the look key and its shadow (CD-01); spruit_sunrise IBL at 0.8 behind a custom
 *   post-storm dome (CD-04, CD-05); cool unshadowed back rim (CD-03); haze #9fb8cf at 0.0032 with height fog in the gorges
 *   (CD-07); one grade node (CD-08).
 * - `original` (`?look=original`): today's look, value for value (outdoor-day, fog scale 0, the authored sun and
 *   hemisphere, the old sky). Kept so before/after captures and regressions can compare against it.
 *
 * Pure data and maths: no engine imports, so the unit tests read it in Node.
 */

export type CumulusLookId = "storm-washed" | "original";
export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

/** Identity palette (PRD WP-35 Identity line). Amber is the only accent: sky pearls and the pearl HUD icons. */
export const CUMULUS_PALETTE = {
  cobalt: "#2f6fb8",
  sandstone: "#b5643c",
  sage: "#6f8f4a",
  amber: "#ffb347",
  /** Supporting tones (not accents): storm-tower slate, silver lining, rain-washed horizon, haze and the sun. */
  slate: "#56637a",
  silver: "#eef3f8",
  horizon: "#c6d6e3",
  haze: "#9fb8cf",
  sun: "#ffe2b8",
  rim: "#9fc8ff",
  /** Reserved for the run's objective markers (checkpoint pennants): a warm red no scenery uses. */
  objective: "#d9341f"
} as const;

/** Unit direction toward the sun for look-style angles (azimuth from +Z toward +X, elevation above the horizon). */
export function sunDirection(elevationDeg: number, azimuthDeg: number): Vec3 {
  const el = (elevationDeg * Math.PI) / 180, az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** Display hex to the linear values the custom shaders return (the port's `lin` convention: pow 2.2). */
export function linHex(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [Math.pow(((n >> 16) & 255) / 255, 2.2), Math.pow(((n >> 8) & 255) / 255, 2.2), Math.pow((n & 255) / 255, 2.2)];
}

export interface CumulusSkyRow {
  readonly top: Rgb; readonly mid: Rgb; readonly horizon: Rgb;
  readonly cloudLight: Rgb; readonly cloudShade: Rgb; readonly sunTint: Rgb;
  /** Direction of the sun disc in the dome (unit). */
  readonly sunDir: Vec3;
  /** 0 = the original dome; > 0 draws the post-storm features (rainbow, storm towers, rain curtains). */
  readonly rainbow: number; readonly towers: number; readonly rain: number;
}

export interface CumulusLookRow {
  readonly id: CumulusLookId;
  readonly timeOfDay: string;
  /** Look preset the row starts from and the HDRI override (null keeps the preset's). */
  readonly preset: "outdoor-day";
  readonly hdri: "spruit_sunrise" | null;
  readonly environmentIntensity: number | null;
  readonly environmentRotationDeg: number | null;
  /** The one shadowed key: angles, colour, intensity, cascades. */
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly cascades: 3 | 4; readonly maxDistance: number; readonly filter: "pcf" | "pcss" };
  /** Shadow sun position the original row authored as a separate light (null = the look key carries the shadow). */
  readonly authoredSunPos: Vec3 | null;
  /** Hemisphere fill the original row authored (null = IBL fill only, no ambient). */
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number } | null;
  readonly rim: { readonly color: string; readonly intensity: number; readonly azimuthDeg: number } | null;
  /** Scenery shader light (direction toward the sun, colour, rim tint, hemisphere fill). */
  readonly scenery: { readonly sunDir: Vec3; readonly sunColor: Rgb; readonly rimColor: Rgb; readonly skyFill: Rgb; readonly groundFill: Rgb; readonly receiveShadow: boolean; /** Lit share left inside the sun shadow (default 0.32). */ readonly shadowFloor?: number; /** Albedo multipliers per surface (GU47 phase 3: rain-washed sage meadow). */ readonly tones?: { readonly grass?: Rgb } };
  readonly fog: { readonly color: string; readonly haze: Rgb; readonly density: number; readonly lookScale: number; readonly gorgeHeight: { readonly heightDensity: number; readonly heightFalloff: number; readonly heightReference: number } | null };
  readonly sky: CumulusSkyRow;
  readonly grade: { readonly exposure: number; readonly contrast: number; readonly saturation: number; readonly temperature?: number; readonly tint?: number; readonly lift?: Rgb; readonly gain?: Rgb };
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  readonly vignette: { readonly intensity: number; readonly smoothness: number };
  readonly signature: { readonly rainbowDeg: readonly [number, number]; readonly towerCount: number; readonly silverLining: number };
  /** CD-14: sky-pearl brightness multiplier (HDR, above the bloom threshold) and the hero's PBR rim (CD-03, E-D). */
  readonly pearlGlow: number;
  /** CD-12 track: PBR tint and roughness of the road deck, and whether rain puddles are laid on it. */
  /** CD-17: hero-tree wind (E-G instance wind; null = static) and the two cloud drift rates (sky dome, cloud sea below). */
  readonly wind: { readonly strength: number; readonly gustStrength: number; readonly directionDeg: number } | null;
  readonly cloudDrift: { readonly sky: number; readonly sea: number };
  readonly road: { readonly color: string; readonly roughness: number; readonly puddles: boolean };
  readonly heroRim: { readonly color: string; readonly power: number; readonly intensity: number } | null;
}

const lin = (r: number, g: number, b: number): Rgb => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];

/** The storm-washed sun: 28 deg up, side-front of the run's prevailing heading (today's azimuth, so the bends keep their light). */
export const STORM_SUN = { elevationDeg: 28, azimuthDeg: 52 } as const;
const STORM_DIR = sunDirection(STORM_SUN.elevationDeg, STORM_SUN.azimuthDeg);

export const CUMULUS_LOOK: readonly [CumulusLookRow, CumulusLookRow] = [
  {
    id: "storm-washed",
    timeOfDay: "mid-morning, just after a squall (sun 28 deg)",
    preset: "outdoor-day",
    hdri: "spruit_sunrise",
    environmentIntensity: 0.8,
    environmentRotationDeg: 140,
    sun: { ...STORM_SUN, color: CUMULUS_PALETTE.sun, intensity: 3.2, cascades: 4, maxDistance: 160, filter: "pcss" },
    authoredSunPos: null,
    hemisphere: null,
    rim: { color: CUMULUS_PALETTE.rim, intensity: 0.8, azimuthDeg: STORM_SUN.azimuthDeg + 180 },
    scenery: { sunDir: STORM_DIR, sunColor: [1.0, 0.86, 0.68], rimColor: lin(0.62, 0.78, 1.0), skyFill: lin(0.5, 0.62, 0.8), groundFill: lin(0.5, 0.4, 0.3), receiveShadow: true, shadowFloor: 0.22, tones: { grass: [0.94, 0.84, 0.9] } },
    fog: { color: CUMULUS_PALETTE.haze, haze: linHex(CUMULUS_PALETTE.haze), density: 0.0032, lookScale: 1, gorgeHeight: { heightDensity: 0.05, heightFalloff: 0.12, heightReference: -12 } },
    sky: {
      top: linHex(CUMULUS_PALETTE.cobalt), mid: lin(0.36, 0.6, 0.86), horizon: linHex(CUMULUS_PALETTE.horizon),
      cloudLight: lin(1.0, 0.98, 0.95), cloudShade: lin(0.5, 0.56, 0.68), sunTint: [0.9, 0.62, 0.34],
      sunDir: STORM_DIR, rainbow: 0.42, towers: 1, rain: 0.55
    },
    grade: { exposure: 1.0, contrast: 1.08, saturation: 1.12, temperature: 0.08, tint: 0, lift: [-0.004, 0.0, 0.012], gain: [1.03, 1.0, 0.97] },
    bloom: { intensity: 0.32, threshold: 0.9 },
    vignette: { intensity: 0.2, smoothness: 0.7 },
    signature: { rainbowDeg: [40, 42], towerCount: 3, silverLining: 1 },
    pearlGlow: 1.55,
    wind: { strength: 0.45, gustStrength: 0.4, directionDeg: 232 },
    cloudDrift: { sky: 1, sea: 0.45 },
    road: { color: "#d9c4b4", roughness: 0.72, puddles: true },
    heroRim: { color: CUMULUS_PALETTE.rim, power: 3, intensity: 0.6 }
  },
  {
    id: "original",
    timeOfDay: "midday (sun 52 deg), the 4.6 look",
    preset: "outdoor-day",
    hdri: null,
    environmentIntensity: null,
    environmentRotationDeg: null,
    sun: { elevationDeg: 51.9, azimuthDeg: 51.6, color: "#fff0cf", intensity: 3.2, cascades: 3, maxDistance: 120, filter: "pcf" },
    authoredSunPos: [48, 78, 38],
    hemisphere: { sky: "#bcd6f2", ground: "#8a7448", intensity: 0.7 },
    rim: null,
    scenery: { sunDir: [0.46, 0.8, 0.4], sunColor: [1.0, 0.82, 0.58], rimColor: [1.0, 0.86, 0.6], skyFill: lin(0.5, 0.64, 0.84), groundFill: lin(0.5, 0.42, 0.3), receiveShadow: false },
    fog: { color: "#a8c9e8", haze: lin(0.66, 0.79, 0.91), density: 0.0026, lookScale: 0, gorgeHeight: null },
    sky: {
      top: lin(0.12, 0.38, 0.8), mid: lin(0.3, 0.6, 0.92), horizon: lin(0.78, 0.89, 0.96),
      cloudLight: lin(1.0, 0.98, 0.94), cloudShade: lin(0.62, 0.68, 0.84), sunTint: [0.9, 0.55, 0.22],
      sunDir: [0.5, 0.42, -0.76], rainbow: 0, towers: 0, rain: 0
    },
    grade: { exposure: 1.02, contrast: 1.07, saturation: 1.16 },
    bloom: { intensity: 0.38, threshold: 0.88 },
    vignette: { intensity: 0.2, smoothness: 0.7 },
    signature: { rainbowDeg: [0, 0], towerCount: 0, silverLining: 0 },
    pearlGlow: 1,
    wind: null,
    cloudDrift: { sky: 1, sea: 1 },
    road: { color: "#ffffff", roughness: 1, puddles: false },
    heroRim: null
  }
];

/** `?look=original` selects today's look; anything else (or no param) is the storm-washed default. */
export function lookIdFrom(search: string | undefined): CumulusLookId {
  return search && /[?&]look=original(&|$)/.test(search) ? "original" : "storm-washed";
}

export function lookRow(id: CumulusLookId): CumulusLookRow {
  return id === "original" ? CUMULUS_LOOK[1] : CUMULUS_LOOK[0];
}

/** The row this page boots with (Node and tests: storm-washed). */
export const ACTIVE_LOOK: CumulusLookRow = lookRow(lookIdFrom(typeof location === "undefined" ? undefined : location.search));

/** World position of a directional light along `dir` at `distance` (the look key and shadow sun share it). */
export function sunPosition(dir: Vec3, distance = 100): Vec3 {
  return [dir[0] * distance, dir[1] * distance, dir[2] * distance];
}

/** Angle between two directions in degrees. */
export function angleDeg(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a[0], a[1], a[2]) || 1, lb = Math.hypot(b[0], b[1], b[2]) || 1;
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}
