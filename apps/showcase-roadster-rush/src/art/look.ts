/**
 * GU47 WP-12 "Blue-hour skyway": the Apex Overdrive look table (PRD §3.2 item 2), one row per time of day. Pure data:
 * main.ts reads it every time-of-day bucket, the art-direction audit test mirrors the scene from it, and the identity sheet
 * (evidence/game-upgrades-47/roadster-rush/identity.md) quotes it. The simulation's time of day runs 0 (sunset) to 1 (night);
 * `apexLookAt(tod)` blends the three rows (sunset 0, dusk 0.5, night 1) exactly as the sky dome blends its stops.
 *
 * Identity (PRD §6.1 G02): an elevated five-lane skyway between glass tower tops in the last minutes of sunset, haze 25 m below
 * the deck, a low tangerine sun dead ahead backlighting traffic under a cobalt-to-violet zenith. Palette charcoal #22232a,
 * tangerine #ff8a3d, cobalt #1f3fa8; cyan #4df0ff only for the player and the sky lane, red #ff2a3c only for rivals. Night is
 * sodium lamps and red tail-light rivers, no magenta.
 */

/** The identity palette. Every colour the scene authors comes from here or from a look row. */
export const APEX_PALETTE = {
  charcoal: "#22232a",
  tangerine: "#ff8a3d",
  cobalt: "#1f3fa8",
  /** Player and sky lane only. */
  cyan: "#4df0ff",
  /** Rivals only (sky-lane interceptors, their trails and halos). */
  rival: "#ff2a3c",
  /** Night street lighting (low-pressure sodium). */
  sodium: "#ffb04a",
  /** Tail-light rivers and brake bars. */
  tail: "#ff3a2a",
  /** Bolt pickups (warm gold, distinct from the sodium lamps by brightness and shape). */
  bolt: "#ffc61f"
} as const;

export type ApexVariant = "sunset" | "dusk" | "night";

/** E-A catalogue id of the IBL (secondary environment: the dome is the visible sky). */
export const APEX_IBL_HDRI = "industrial_sunset_puresky" as const;
/**
 * IBL rotation (deg): turns the HDRI's own low sun toward the dome's sun azimuth (175 deg, dead ahead) so reflections and the
 * disc agree. Differs from every other game that lists industrial_sunset (identity sheet, PRD §6.1 last paragraph).
 * Phase 2: confirm against a capture of the hero's paint.
 */
export const APEX_IBL_ROTATION_DEG = 205;

/** The look preset and its overrides at boot (AO-L1); the runtime rows below retune it per time of day (AO-L2). */
export const APEX_SUN = { elevationDeg: 7, azimuthDeg: 175 } as const;
export const APEX_FOG_DENSITY_SCALE = 0.7;
/** golden-hour fog range 30/180 divided by the 0.7 density scale (AO-E3: near 43, far 257). */
export const APEX_FOG_RANGE = { near: 30 / APEX_FOG_DENSITY_SCALE, far: 180 / APEX_FOG_DENSITY_SCALE } as const;

/** Own grade (AO-P1): one grade stage, written through the look's grade override. */
export const APEX_GRADE = { contrast: 1.12, saturation: 1.08 } as const;
/** Racer bloom (AO-P2): intensity / threshold / scatter for the corona, brake bars, plumes and lamps. */
export const APEX_BLOOM = { intensity: 0.55, threshold: 0.85, scatter: 0.5 } as const;
/** High-tier post (AO-P3, AO-P4): motion blur strength and god-ray density; both off on reduced motion or below High. */
export const APEX_MOTION_BLUR = 0.22;
export const APEX_GOD_RAY_DENSITY = 0.06;
/** Output-overlay flashes (AO-P4): crash warm, rocket cyan; peak never above 0.3 (PRD §6.3 reduced flash). */
export const APEX_FLASH_PEAK = 0.3;

export interface ApexLookRow {
  readonly id: ApexVariant;
  /** Simulation time of day this row is exact at. */
  readonly tod: number;
  /** Visible sky: the custom blue-hour dome (src/art/sky.ts); the HDRI is IBL only. */
  readonly sky: "apex-bluehour-dome";
  readonly hdri: typeof APEX_IBL_HDRI;
  readonly environmentIntensity: number;
  /** Key: the look's one shadowed directional. Elevation is where the dome draws the disc. */
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  /** Camera-side fill (unshadowed directional from behind the chase camera), replaces the old ambient (AO-L1). */
  readonly fill: { readonly color: string; readonly intensity: number };
  /** Fog colour follows the time of day; near/far stay the AO-E3 range. */
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  readonly post: "cinematic-film";
  /** White balance after E-C (temperature/tint in [-1, 1]); contrast/saturation are APEX_GRADE. */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly scatter: number };
  /** Dome palette (sRGB hex): horizon band, mid, zenith, sun tint, under-horizon city glow. */
  readonly dome: { readonly horizon: string; readonly mid: string; readonly top: string; readonly sun: string; readonly glow: string };
  /** Signature effect: backlit skyway traffic above a haze floor. */
  readonly signature: {
    /** Haze-floor colour (the city 25 m below the deck) and its lit-window speck strength. */
    readonly hazeColor: string;
    readonly windowSpecks: number;
    /** Sodium practicals (AO-L3) scale: 0 at sunset, 1 at night. */
    readonly sodium: number;
    /** Headlight practicals (AO-L3), on from dusk. */
    readonly headlights: number;
    /** Tail-light / brake-bar emissive gain (red rivers at night). */
    readonly tailGain: number;
  };
}

export const APEX_LOOK: readonly [ApexLookRow, ApexLookRow, ApexLookRow] = [
  {
    id: "sunset",
    tod: 0,
    sky: "apex-bluehour-dome",
    hdri: APEX_IBL_HDRI,
    environmentIntensity: 1.0,
    sun: { elevationDeg: 7, azimuthDeg: 175, color: "#ff9a4f", intensity: 3.1 },
    fill: { color: "#8ea2e0", intensity: 0.6 },
    fog: { color: "#c98a6a", ...APEX_FOG_RANGE },
    post: "cinematic-film",
    grade: { ...APEX_GRADE, temperature: 0.18, tint: 0.02 },
    bloom: { ...APEX_BLOOM },
    dome: { horizon: "#ff8a3d", mid: "#6a4fa8", top: "#1f3fa8", sun: "#ffb066", glow: "#ff7a3a" },
    signature: { hazeColor: "#6f6a86", windowSpecks: 0.25, sodium: 0, headlights: 0, tailGain: 1 }
  },
  {
    id: "dusk",
    tod: 0.5,
    sky: "apex-bluehour-dome",
    hdri: APEX_IBL_HDRI,
    environmentIntensity: 0.55,
    sun: { elevationDeg: 3.5, azimuthDeg: 175, color: "#ff6a3a", intensity: 1.7 },
    fill: { color: "#6f84d0", intensity: 0.45 },
    fog: { color: "#4a4778", ...APEX_FOG_RANGE },
    post: "cinematic-film",
    grade: { ...APEX_GRADE, temperature: 0.02, tint: 0.03 },
    bloom: { ...APEX_BLOOM },
    dome: { horizon: "#f2703a", mid: "#3c2f86", top: "#14246e", sun: "#ff7a3e", glow: "#ff8a3d" },
    signature: { hazeColor: "#3a3a62", windowSpecks: 0.6, sodium: 0.35, headlights: 1, tailGain: 1.35 }
  },
  {
    id: "night",
    tod: 1,
    sky: "apex-bluehour-dome",
    hdri: APEX_IBL_HDRI,
    environmentIntensity: 0.18,
    sun: { elevationDeg: 3.5, azimuthDeg: 175, color: "#8ea4d8", intensity: 0.35 },
    fill: { color: "#4a5aa0", intensity: 0.42 },
    fog: { color: "#151a2c", ...APEX_FOG_RANGE },
    post: "cinematic-film",
    grade: { ...APEX_GRADE, temperature: -0.06, tint: 0 },
    bloom: { ...APEX_BLOOM },
    dome: { horizon: "#40281e", mid: "#121a46", top: "#060a1e", sun: "#9fb4e8", glow: "#ffa040" },
    signature: { hazeColor: "#16161f", windowSpecks: 1, sodium: 1, headlights: 1, tailGain: 1.7 }
  }
];

export const APEX_VARIANTS: readonly ApexVariant[] = APEX_LOOK.map((row) => row.id);

type V3 = [number, number, number];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** sRGB hex to 0..1 components. */
export function hexToUnit(hex: string): V3 {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function unitToHex(c: V3): string {
  const to = (v: number): string => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`;
}

/** Blend two sRGB hex colours (component-wise in sRGB, as the dome blends its stops). */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToUnit(a);
  const y = hexToUnit(b);
  const k = clamp01(t);
  return unitToHex([lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)]);
}

/** The resolved look at one time of day (row blend). */
export interface ApexLookFrame {
  readonly tod: number;
  /** Nearest row (the variant a capture at this time of day names). */
  readonly variant: ApexVariant;
  readonly environmentIntensity: number;
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number };
  /** Unit vector toward the sun (Y up; azimuth clockwise from +Z, the look-preset convention). */
  readonly sunDir: V3;
  readonly fill: { readonly color: string; readonly intensity: number };
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  readonly grade: { readonly temperature: number; readonly tint: number };
  readonly dome: ApexLookRow["dome"];
  readonly signature: ApexLookRow["signature"];
}

/** Toward-the-sun unit vector for elevation/azimuth in degrees (same convention as the look preset's `sun`). */
export function sunDirection(elevationDeg: number, azimuthDeg: number): V3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** Blend the look rows at a simulation time of day (0 sunset .. 1 night). */
export function apexLookAt(todRaw: number): ApexLookFrame {
  const tod = clamp01(Number.isFinite(todRaw) ? todRaw : 0);
  const upper = tod <= 0.5 ? 1 : 2;
  const a = APEX_LOOK[upper - 1]!;
  const b = APEX_LOOK[upper]!;
  const k = (tod - a.tod) / (b.tod - a.tod);
  const elevationDeg = lerp(a.sun.elevationDeg, b.sun.elevationDeg, k);
  const azimuthDeg = lerp(a.sun.azimuthDeg, b.sun.azimuthDeg, k);
  const variant = tod < 0.25 ? "sunset" : tod < 0.75 ? "dusk" : "night";
  return {
    tod,
    variant,
    environmentIntensity: lerp(a.environmentIntensity, b.environmentIntensity, k),
    sun: { elevationDeg, azimuthDeg, color: mixHex(a.sun.color, b.sun.color, k), intensity: lerp(a.sun.intensity, b.sun.intensity, k) },
    sunDir: sunDirection(elevationDeg, azimuthDeg),
    fill: { color: mixHex(a.fill.color, b.fill.color, k), intensity: lerp(a.fill.intensity, b.fill.intensity, k) },
    fog: { color: mixHex(a.fog.color, b.fog.color, k), near: lerp(a.fog.near, b.fog.near, k), far: lerp(a.fog.far, b.fog.far, k) },
    grade: { temperature: lerp(a.grade.temperature, b.grade.temperature, k), tint: lerp(a.grade.tint, b.grade.tint, k) },
    dome: {
      horizon: mixHex(a.dome.horizon, b.dome.horizon, k),
      mid: mixHex(a.dome.mid, b.dome.mid, k),
      top: mixHex(a.dome.top, b.dome.top, k),
      sun: mixHex(a.dome.sun, b.dome.sun, k),
      glow: mixHex(a.dome.glow, b.dome.glow, k)
    },
    signature: {
      hazeColor: mixHex(a.signature.hazeColor, b.signature.hazeColor, k),
      windowSpecks: lerp(a.signature.windowSpecks, b.signature.windowSpecks, k),
      sodium: lerp(a.signature.sodium, b.signature.sodium, k),
      headlights: lerp(a.signature.headlights, b.signature.headlights, k),
      tailGain: lerp(a.signature.tailGain, b.signature.tailGain, k)
    }
  };
}

/**
 * Time of day each capture variant pins: `?tod=sunset|dusk|night` (or a number 0..1; NEW, this lane) sets the presented time of
 * day only, like the quick bar's Sunset / Dusk / Night buttons; sunset is the boot view. The simulation is untouched.
 */
export const APEX_VARIANT_TOD: Readonly<Record<ApexVariant, number>> = { sunset: 0, dusk: 0.5, night: 1 };

/** `?tod=` value to a presented time of day: a variant name or a number in [0, 1]; anything else is null (follow the run). */
export function parseTodParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const key = raw.trim().toLowerCase();
  if (key in APEX_VARIANT_TOD) return APEX_VARIANT_TOD[key as ApexVariant];
  const n = Number(key);
  return Number.isFinite(n) ? clamp01(n) : null;
}

/**
 * Practical lights the scene mounts besides the key (art direction `practicals`): the camera-side fill, three sodium spots
 * that ride the pole rows ahead, and the hero's two headlights. Six, the C-35 cap.
 */
export const APEX_PRACTICALS = {
  fill: 1,
  sodiumSpots: 3,
  headlights: 2
} as const;
export const APEX_PRACTICAL_COUNT = APEX_PRACTICALS.fill + APEX_PRACTICALS.sodiumSpots + APEX_PRACTICALS.headlights;
