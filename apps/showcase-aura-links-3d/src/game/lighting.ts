/**
 * lighting.ts — the per-course look table for Aura Links 3D (GU47 WP-20,
 * "golf-broadcast postcard tour") and the 4.6.2 fill rig `?look=original`
 * keeps. Pure data, no engine imports, so the light budget and the identity
 * rules are unit tested (tests/unit/aura-links-3d).
 *
 * One row per course (the six `?course=` variants): place and hour, its own
 * HDRI from the E-A catalogue (`/hdri/<id>_1k.hdr`), its own sun and one
 * shadowed key, a rim instead of an ambient fill, fog, grade, bloom, post,
 * HUD accent and signature-effect parameters. `game/lookRig.ts` turns a row
 * into the E-A look overrides (`hdri`, `environmentIntensity`,
 * `environmentRotationDeg`, `key`, `rim`, `fog`, `grade`, `post`) and the
 * course's practicals, so the row names are those overrides' fields.
 */

import type { CourseId, CourseSpec, LookId } from "./types";

type V3 = [number, number, number];

/* ------------------------------------------------------------------ *
 *  4.6.2 fill rig (`?look=original`, PRD §8 reversibility)            *
 * ------------------------------------------------------------------ */

export interface CourseFill {
  readonly ambient: string;
  readonly ambientI: number;
  readonly sky: string;
  readonly ground: string;
  /** 0 = no hemisphere authored */
  readonly hemiI: number;
  readonly rim: string;
  readonly rimI: number;
  readonly rimPos: V3;
  /**
   * Floodlight key for the floodlit night course (Neon Bay). The night-city
   * look's only key is a 0.7 blue moon, which left the dark-green turf at a
   * mean luma of 2.3 (96% of pixels at 8 or below, audit-fix E2 frames).
   * This high, warm-white directional from behind the tee lights the whole
   * hole the way stadium floodlights would; it casts no shadow (the moon
   * keeps the shadow and the contact-shadow mask).
   */
  readonly flood?: { readonly color: string; readonly intensity: number; readonly position: V3 };
}

/**
 * Course fill lights of the 4.6.2 rig (still mounted by `?look=original`).
 * Since 4.5.0 the hemisphere counts in the ambient term on the no-HDRI looks
 * (audit LIGHT-03): with the 4.3.7 values Neon Bay's ambient term grew 2.29x
 * and Mare's 4.09x (luminance of the linear sum). Both are scaled so the
 * ambient-plus-hemisphere term matches the 4.3.7 ambient the courses were
 * tuned against (0.32/2.293 and 0.38/2.293 for Neon Bay, 0.26/4.089 and
 * 0.34/4.089 for Mare). HDRI looks author no hemisphere (`hemiI: 0`), so the
 * engine change that feeds it next to an environment (LIGHT-05) cannot shift
 * those courses. The GU47 look (`COURSE_LOOKS`) authors no ambient at all.
 */
export function courseFill(course: CourseSpec): CourseFill {
  const theme = course.dressing.theme;
  return course.look === "night-city"
    ? {
        ambient: "#3b4a6e", ambientI: 0.14, sky: "#4269a8", ground: "#151a28", hemiI: 0.166, rim: "#7f9dff", rimI: 0.3, rimPos: [-22, 20, -30],
        flood: { color: "#fff1dc", intensity: NEON_FLOOD_INTENSITY, position: [10, 26, -18] }
      }
    : course.look === "space"
      ? { ambient: "#3d4354", ambientI: 0.064, sky: "#7d8ba6", ground: "#191b20", hemiI: 0.083, rim: "#dbe7ff", rimI: 0.35, rimPos: [-18, 26, -34] }
      : theme === "alpine"
        ? { ambient: "#dce8f4", ambientI: 0.16, sky: "#cfe6f4", ground: "#697681", hemiI: 0, rim: "#d9ecff", rimI: 0.22, rimPos: [-24, 18, -30] }
        : theme === "volcanic"
          ? { ambient: "#6b4a3d", ambientI: 0.18, sky: "#a86a4e", ground: "#2a1e1a", hemiI: 0, rim: "#ff9a5c", rimI: 0.28, rimPos: [-26, 16, -28] }
          : course.look === "golden-hour"
            ? { ambient: "#e3bd91", ambientI: 0.14, sky: "#f0c28a", ground: "#4b3b2c", hemiI: 0, rim: "#9fb6ce", rimI: 0.24, rimPos: [-22, 15, -26] }
            : { ambient: "#c9dcea", ambientI: 0.13, sky: "#b9d3e6", ground: "#3d5434", hemiI: 0, rim: "#d7e6f2", rimI: 0.22, rimPos: [-24, 18, -30] };
}

/** Neon Bay floodlight intensity (see CourseFill.flood); the GU47 row makes this light the course key. */
export const NEON_FLOOD_INTENSITY = 3.0;

/**
 * Contact-shadow strength per course. The mask darkens only the
 * shadow-casting key light (audit LIGHT-09); the night-city key is 0.7, so
 * Neon Bay runs the mask at full strength to keep balls and feet grounded.
 */
export function contactShadowIntensity(course: CourseSpec): number {
  return course.look === "night-city" ? 1 : 0.62;
}

/* ------------------------------------------------------------------ *
 *  GU47 look table (one row per course variant)                       *
 * ------------------------------------------------------------------ */

/** The E-A catalogue HDRIs this game uses (members of `AuraHdriId`, served at `/hdri/<id>_1k.hdr`). */
export type LinksHdriId =
  | "spruit_sunrise"
  | "autumn_field_puresky"
  | "industrial_sunset_puresky"
  | "outdoor-midday"
  | "rooftop_night"
  | "deep_space_starfield";

/** Ambient particle family per course (LINKS-18). */
export type CourseAmbientParticles = "wisps" | "leaves" | "embers" | "spindrift" | "moths";

/**
 * Course fog as a C-21 fog spec (the E-A `fog.height` override carries it onto the look's fog node). `mode: "height"`
 * is the low-lying haar/ash (density + heightDensity * exp(-heightFalloff * (y - heightReference))); `"exp2"` an even
 * haze. `maxOpacity` is always authored, so the flag-on resolver never falls back to its fully opaque default.
 */
export interface CourseFog {
  readonly color: string;
  readonly mode: "height" | "exp2";
  readonly density: number;
  readonly maxOpacity: number;
  readonly heightDensity?: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
}

export interface CourseLookRow {
  readonly course: CourseId;
  /** identity sheet: the place and the hour (PRD WP-20 identity line) */
  readonly place: string;
  readonly timeOfDay: string;
  /** engine look preset the row overrides (supplies only what the row leaves unset: AO, MSAA, the post preset id) */
  readonly base: LookId;
  /**
   * LINKS-02: the course's own catalogue HDRI. `drawn: false` = IBL only behind a colour backdrop (Neon Bay's navy).
   * `sunAzimuthInHdriDeg`: the HDRI's brightest texel in the engine's azimuth frame (measured offline from the 1k
   * file, see `hdriRotationDeg`); null when the HDRI has no sun. `want2k`: the PRD names a 2k copy (E-A handoff).
   */
  readonly hdri: {
    readonly id: LinksHdriId;
    readonly intensity: number;
    readonly drawn: boolean;
    readonly sunAzimuthInHdriDeg: number | null;
    readonly want2k: boolean;
  };
  /** LINKS-01: the key's direction: the course's own sun (Neon Bay: the floodlight bank behind the tee) */
  readonly sun: { readonly azimuthDeg: number; readonly elevationDeg: number };
  /** the one shadowed key (PRD §3.2) */
  readonly key: { readonly color: string; readonly intensity: number; readonly colorTemperatureK: number };
  /** the E-A rim (no ambient fill anywhere); Mare's is the earthshine (LINKS-16) */
  readonly rim: { readonly color: string; readonly intensity: number; readonly azimuthDeg: number } | null;
  readonly exposureEv: number;
  /** clear colour behind the sky; also the look backdrop when the HDRI is not drawn */
  readonly background: string;
  /** LINKS-03 atmosphere; null = no fog node (Mare is airless) */
  readonly fog: CourseFog | null;
  /** LINKS-03 god rays (`effects.volumetricFog({ godRayDensity })`, Medium+ tiers; the engine drops S4 below Medium) */
  readonly godRays: { readonly density: number; readonly intensity: number; readonly color: string } | null;
  /** LINKS-04 grade (temperature/tint reach pixels through E-C's v2 grade writer) */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  /** LINKS-04 bloom (the E-A `post.bloom` override) */
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly scatter: number };
  /** LINKS-04 per-course vignette (the old blanket vignette is gone) */
  readonly vignette: { readonly intensity: number; readonly color: string } | null;
  /** film grain (Maple only, LINKS-04); the engine drops it on Low */
  readonly grain: { readonly intensity: number; readonly size: number } | null;
  /** HUD accent (LINKS-14): hues >= 30 deg apart, >= 4.5:1 on the HUD panel */
  readonly accent: string;
  /** identity palette, three base tones (PRD §3.2) */
  readonly palette: readonly [string, string, string];
  readonly ambientParticles: CourseAmbientParticles | null;
  /** LINKS-18 sun flare (lens flare far out along the sun direction), High only */
  readonly sunFlare: boolean;
  /** flag flutter per m/s of wind (LINKS-13); 0 = stiff (Mare has no air) */
  readonly flagFlutter: number;
}

/**
 * The six course looks. Sun angles are PRD LINKS-01's; HDRIs are PRD LINKS-02's (1k catalogue copies until E-A ships
 * the 2k files the PRD names, see the lane report); `sunAzimuthInHdriDeg` comes from the brightest texel of each 1k
 * file (spruit 54.3 at 7.9 deg elevation, autumn field 53.6 at 29, industrial sunset 53.6 at 4, outdoor-midday 49.4
 * at 4.7, rooftop night 242.4 at 4 (a street light); the starfield has no sun).
 */
export const COURSE_LOOKS: Readonly<Record<CourseId, CourseLookRow>> = {
  stAuroras: {
    course: "stAuroras",
    place: "marram dunes and a lighthouse on a cold northern shore",
    timeOfDay: "cold sunrise, sea haar rolling in",
    base: "outdoor-day",
    hdri: { id: "spruit_sunrise", intensity: 0.92, drawn: true, sunAzimuthInHdriDeg: 54.3, want2k: false },
    sun: { azimuthDeg: 95, elevationDeg: 12 },
    key: { color: "#ffd6ae", intensity: 2.9, colorTemperatureK: 3600 },
    rim: { color: "#b8d2e6", intensity: 0.24, azimuthDeg: 275 },
    exposureEv: 0.2,
    background: "#b9c7d0",
    fog: { color: "#c4cfd6", mode: "height", density: 0.004, maxOpacity: 0.62, heightDensity: 0.05, heightFalloff: 0.16, heightReference: 0 },
    godRays: null,
    grade: { contrast: 0.97, saturation: 0.86, temperature: -0.12, tint: 0.02 },
    bloom: { intensity: 0.3, threshold: 0.8, scatter: 0.6 },
    vignette: { intensity: 0.1, color: "#0d1a22" },
    grain: null,
    accent: "#4fd6a0",
    palette: ["#5f7d6a", "#c4cfd6", "#d6c39a"],
    ambientParticles: "wisps",
    sunFlare: true,
    flagFlutter: 0.28
  },
  mapleHollow: {
    course: "mapleHollow",
    place: "parkland maples over still ponds",
    timeOfDay: "warm late afternoon",
    base: "golden-hour",
    hdri: { id: "autumn_field_puresky", intensity: 1.0, drawn: true, sunAzimuthInHdriDeg: 53.6, want2k: true },
    sun: { azimuthDeg: 235, elevationDeg: 30 },
    key: { color: "#ffc58a", intensity: 2.7, colorTemperatureK: 3900 },
    rim: { color: "#9db7d6", intensity: 0.22, azimuthDeg: 55 },
    exposureEv: 0,
    background: "#d7b48c",
    fog: { color: "#d9b48a", mode: "exp2", density: 0.0034, maxOpacity: 0.4 },
    godRays: null,
    grade: { contrast: 1.06, saturation: 1.1, temperature: 0.18, tint: 0 },
    bloom: { intensity: 0.36, threshold: 0.74, scatter: 0.62 },
    vignette: { intensity: 0.14, color: "#1d1208" },
    grain: { intensity: 0.045, size: 1.4 },
    // lifted from #ff5c7f so it holds 4.5:1 on the HUD panel over the warm Maple sky
    accent: "#ff7a95",
    palette: ["#3f6b3a", "#b8452c", "#e3c48f"],
    ambientParticles: "leaves",
    sunFlare: false,
    flagFlutter: 0.14
  },
  cinderRim: {
    course: "cinderRim",
    place: "a basalt crater rim above lava pools",
    timeOfDay: "dusk, lava light and god rays through ash",
    base: "golden-hour",
    hdri: { id: "industrial_sunset_puresky", intensity: 0.8, drawn: true, sunAzimuthInHdriDeg: 53.6, want2k: false },
    sun: { azimuthDeg: 265, elevationDeg: 7 },
    key: { color: "#ff9a5a", intensity: 2.5, colorTemperatureK: 2600 },
    rim: { color: "#8e86c9", intensity: 0.22, azimuthDeg: 85 },
    exposureEv: 0.15,
    background: "#5a3a35",
    fog: { color: "#6b5348", mode: "height", density: 0.005, maxOpacity: 0.55, heightDensity: 0.03, heightFalloff: 0.12, heightReference: 0 },
    godRays: { density: 0.6, intensity: 0.5, color: "#ffb27a" },
    grade: { contrast: 1.12, saturation: 1.04, temperature: 0.25, tint: 0 },
    bloom: { intensity: 0.5, threshold: 0.68, scatter: 0.66 },
    vignette: { intensity: 0.18, color: "#140806" },
    grain: null,
    accent: "#f5a02b",
    palette: ["#2b2522", "#7a6a4a", "#d8541f"],
    ambientParticles: "embers",
    sunFlare: true,
    flagFlutter: 0.22
  },
  cloudTerrace: {
    course: "cloudTerrace",
    place: "alpine terraces above a cloud sea",
    timeOfDay: "hard cobalt noon",
    base: "alpine-snow",
    hdri: { id: "outdoor-midday", intensity: 1.1, drawn: true, sunAzimuthInHdriDeg: 49.4, want2k: true },
    sun: { azimuthDeg: 160, elevationDeg: 62 },
    key: { color: "#fffaf0", intensity: 3.3, colorTemperatureK: 5800 },
    rim: { color: "#d6e8ff", intensity: 0.18, azimuthDeg: 340 },
    exposureEv: -0.1,
    background: "#4f86d9",
    fog: { color: "#bcd6f2", mode: "exp2", density: 0.0012, maxOpacity: 0.3 },
    godRays: null,
    grade: { contrast: 1.12, saturation: 1.06, temperature: -0.04, tint: 0 },
    bloom: { intensity: 0.24, threshold: 0.86, scatter: 0.55 },
    vignette: null,
    grain: null,
    // lifted from #4d8bff so it holds 4.5:1 on the HUD panel over the cobalt sky
    accent: "#6fa0ff",
    palette: ["#6d9a58", "#e8f2f8", "#2f5fae"],
    ambientParticles: "spindrift",
    sunFlare: false,
    flagFlutter: 0.3
  },
  neonBay: {
    course: "neonBay",
    place: "a wet harbour front under a neon skyline",
    timeOfDay: "floodlit night in teal and magenta",
    base: "night-city",
    // IBL only (PRD LINKS-02): the navy backdrop stays the visible sky
    hdri: { id: "rooftop_night", intensity: 0.6, drawn: false, sunAzimuthInHdriDeg: 242.4, want2k: false },
    // the floodlight bank behind the tee becomes the shadowed key (the 4.6.2 flood stood at azimuth 151, elevation 52,
    // 11 deg from Cloud Terrace's noon sun; swung to 120/45 it keeps >= 25 deg from every course's sun); the moon is the rim
    sun: { azimuthDeg: 120, elevationDeg: 45 },
    key: { color: "#fff1dc", intensity: NEON_FLOOD_INTENSITY, colorTemperatureK: 4800 },
    rim: { color: "#7f9dff", intensity: 0.5, azimuthDeg: 300 },
    exposureEv: 0.08,
    background: "#0a1430",
    fog: { color: "#0b1532", mode: "exp2", density: 0.004, maxOpacity: 0.5 },
    godRays: null,
    grade: { contrast: 1.14, saturation: 1.18, temperature: -0.08, tint: 0.06 },
    bloom: { intensity: 0.62, threshold: 0.62, scatter: 0.7 },
    vignette: { intensity: 0.2, color: "#05030f" },
    grain: null,
    accent: "#19e0ff",
    palette: ["#0a1430", "#1f6a52", "#ff3fd2"],
    ambientParticles: "moths",
    sunFlare: false,
    flagFlutter: 0.3
  },
  mareCourse: {
    course: "mareCourse",
    place: "the regolith of a lunar mare",
    timeOfDay: "airless black-sky day under an earthrise",
    base: "space",
    hdri: { id: "deep_space_starfield", intensity: 0.25, drawn: true, sunAzimuthInHdriDeg: null, want2k: true },
    sun: { azimuthDeg: 40, elevationDeg: 25 },
    key: { color: "#ffffff", intensity: 3.6, colorTemperatureK: 5900 },
    // earthshine: a faint blue fill from the Earth's side, no shadow (LINKS-16)
    rim: { color: "#7fa6ff", intensity: 0.25, azimuthDeg: 220 },
    exposureEv: 0.15,
    background: "#000000",
    fog: null,
    godRays: null,
    grade: { contrast: 1.18, saturation: 0.9, temperature: 0, tint: 0 },
    bloom: { intensity: 0.3, threshold: 0.82, scatter: 0.5 },
    vignette: { intensity: 0.16, color: "#000000" },
    grain: null,
    accent: "#a98dff",
    palette: ["#000000", "#8e9096", "#3d6fd8"],
    ambientParticles: null,
    sunFlare: false,
    flagFlutter: 0
  }
};

/**
 * Neon Bay's two floodlight masts behind the green (LINKS-16), at the lamp-pylon heads (7.2 m; the WP-36 floodlight
 * mast model raises them); spot cones in the navy fog.
 */
export const NEON_MAST_SPOTS = { color: "#d8f1ff", intensity: 3.6, angle: 0.85, penumbra: 0.5, distance: 90, height: 7.2 } as const;

/** Cinder Rim's lava glow: one point light per lava pool, at most three (LINKS-16). */
export const CINDER_LAVA_LIGHT = { color: "#ff6a2a", intensity: 2.2, distance: 16, maxPerHole: 3 } as const;

/** Presentation tier the game builds for (PRD §6.4): Low = 1 cascade PCF, no grain, no god rays, no flare, no particles. */
export type LinksTier = "low" | "high";

/** Key-light shadow per presentation tier (LINKS-01: PCSS with 3 cascades; PRD §6.4 Low: 1 cascade, PCF). */
export function keyShadowFor(tier: LinksTier): { readonly filter: "pcss" | "pcf"; readonly cascades: 1 | 3; readonly mapSize: 1024 | 2048 } {
  return tier === "low" ? { filter: "pcf", cascades: 1, mapSize: 1024 } : { filter: "pcss", cascades: 3, mapSize: 2048 };
}

/** Light position from elevation/azimuth (same basis as the engine looks: azimuth clockwise from +Z, Y up). */
export function anglesToPosition(elevationDeg: number, azimuthDeg: number, distance = 24): V3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [
    Number((distance * Math.cos(el) * Math.sin(az)).toFixed(3)),
    Number((distance * Math.sin(el)).toFixed(3)),
    Number((distance * Math.cos(el) * Math.cos(az)).toFixed(3))
  ];
}

/** Unit vector toward the course key light. */
export function keyDirection(row: CourseLookRow): V3 {
  const p = anglesToPosition(row.sun.elevationDeg, row.sun.azimuthDeg, 1);
  const len = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / len, p[1] / len, p[2] / len];
}

/**
 * E-A `environmentRotationDeg` that turns the HDRI's sun onto the course key's azimuth. The engine samples an equirect
 * map at u = atan2(d.z, d.x) / 2pi + 0.5 + rotation (turns), so a texel's azimuth moves by +rotation x 360 deg. The
 * HDRI's sun azimuth is measured in the same frame (brightest texel); phase 2 checks the drawn sun against the shadows.
 */
export function hdriRotationDeg(row: CourseLookRow): number {
  if (row.hdri.sunAzimuthInHdriDeg === null) return 0;
  const r = (row.sun.azimuthDeg - row.hdri.sunAzimuthInHdriDeg) % 360;
  return Number((r < 0 ? r + 360 : r).toFixed(1));
}

/** URL the E-A catalogue serves a row's HDRI at. */
export function hdriUrl(row: CourseLookRow): string {
  return `/hdri/${row.hdri.id}_1k.hdr`;
}

/** Wind-driven flag flutter amplitude scale (LINKS-13): 0 on Mare, 0 under reduced motion. */
export function flagFlutterAmplitude(row: CourseLookRow, windSpeed: number, reducedMotion: boolean): number {
  if (reducedMotion || row.flagFlutter <= 0) return 0;
  return Math.min(2.5, 0.35 + row.flagFlutter * Math.max(0, windSpeed));
}

/* ------------------------------------------------------------------ *
 *  Colour helpers (identity tests: hue spacing, HUD contrast)         *
 * ------------------------------------------------------------------ */

/** hue of a #rrggbb colour in degrees [0, 360) */
export function hueDeg(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const deg = h * 60;
  return deg < 0 ? deg + 360 : deg;
}

/** smallest angle between two hues, degrees */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(linearRgb(a)), lb = luminance(linearRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ *
 *  Light budget (used by the unit test)                               *
 * ------------------------------------------------------------------ */

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** linear RGB of a #rrggbb colour */
export function linearRgb(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

const luminance = (c: V3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Lambert estimate of the light leaving flat fairway turf: albedo times each
 * directional's colour, intensity and sin(elevation), plus the ambient and
 * the hemisphere sky colour. Linear luminance, before exposure and tone map.
 */
export function fairwayRadiance(
  fairway: string,
  directionals: readonly { readonly color: string; readonly intensity: number; readonly position: readonly number[] }[],
  ambient: { readonly color: string; readonly intensity: number }[] = []
): number {
  const a = linearRgb(fairway);
  const out: V3 = [0, 0, 0];
  for (const d of directionals) {
    const [x, y, z] = d.position as V3;
    const sinEl = Math.max(0, y / Math.hypot(x, y, z));
    const c = linearRgb(d.color);
    for (let i = 0; i < 3; i++) out[i] += a[i]! * c[i]! * d.intensity * sinEl;
  }
  for (const l of ambient) {
    const c = linearRgb(l.color);
    for (let i = 0; i < 3; i++) out[i] += a[i]! * c[i]! * l.intensity;
  }
  return luminance(out);
}
