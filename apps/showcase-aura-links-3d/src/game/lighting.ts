/**
 * lighting.ts — the per-course look table for Aura Links 3D (GU47 WP-20,
 * "golf-broadcast postcard tour"): one row per course with its own hour,
 * sun, key, HDRI, atmosphere, grade, post and HUD accent, plus the fill
 * lights the courses author. Pure data, no engine imports, so the light
 * budget and the identity rules are unit tested.
 *
 * Rows name the NEW engine controls exactly as PRD §3.1 types them (E-A look
 * overrides `hdri`, `environmentIntensity`, `environmentRotationDeg`, `key`,
 * `rim`, `fog`, `grade`, `post`; E-C `godRayDensity`, grade temperature).
 * `art/engineCompat.ts` maps a row onto today's 4.6.x APIs; `game/lookRig.ts`
 * builds the scene nodes from it.
 */

import type { CourseId, CourseSpec, LookId } from "./types";

type V3 = [number, number, number];

export interface CourseFill {
  readonly ambient: string;
  /** 0 = no ambient authored (every HDRI course: the environment is the fill, PRD §3.2) */
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
 * Course fill lights. Since 4.5.0 the hemisphere counts in the ambient term
 * on the no-HDRI looks (audit LIGHT-03): with the 4.3.7 values Neon Bay's
 * ambient term grew 2.29x and Mare's 4.09x (luminance of the linear sum).
 * Both are scaled so the ambient-plus-hemisphere term matches the 4.3.7
 * ambient the courses were tuned against (0.32/2.293 and 0.38/2.293 for
 * Neon Bay, 0.26/4.089 and 0.34/4.089 for Mare). HDRI looks author no
 * hemisphere (`hemiI: 0`), so the engine change that feeds it next to an
 * environment (LIGHT-05) cannot shift those courses.
 *
 * GU47 LINKS-01: the four HDRI courses author no ambient either (the HDRI is
 * the fill; no ambient-flattens) and take their rim from the look table,
 * opposite their own sun. Neon Bay and Mare keep the calibrated ambient and
 * hemisphere until their catalogue HDRIs land (GU47(E-A): rooftop_night and
 * deep_space_starfield become their IBL fill; then drop ambient + hemisphere).
 */
export function courseFill(course: CourseSpec): CourseFill {
  if (course.look === "night-city") {
    return {
      ambient: "#3b4a6e", ambientI: 0.14, sky: "#4269a8", ground: "#151a28", hemiI: 0.166, rim: "#7f9dff", rimI: 0.3, rimPos: [-22, 20, -30],
      flood: { color: "#fff1dc", intensity: NEON_FLOOD_INTENSITY, position: [10, 26, -18] }
    };
  }
  if (course.look === "space") {
    return { ambient: "#3d4354", ambientI: 0.064, sky: "#7d8ba6", ground: "#191b20", hemiI: 0.083, rim: "#dbe7ff", rimI: 0.35, rimPos: [-18, 26, -34] };
  }
  const row = COURSE_LOOKS[course.id];
  const rim = row.rim === "legacy" ? null : row.rim;
  return {
    ambient: "#000000",
    ambientI: 0,
    sky: "#000000",
    ground: "#000000",
    hemiI: 0,
    rim: rim?.color ?? "#d7e6f2",
    rimI: rim?.intensity ?? 0,
    rimPos: rim ? anglesToPosition(rim.elevationDeg, rim.azimuthDeg, 30) : [-24, 18, -30]
  };
}

/** Neon Bay floodlight intensity (see CourseFill.flood) */
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

/** HDRI catalogue ids this game uses: members of the PRD §3.1 E-A `AuraHdriId` union (served at `/hdri/<id>_1k.hdr`). */
export type LinksHdriId =
  | "spruit_sunrise"
  | "autumn_field_puresky"
  | "industrial_sunset_puresky"
  | "outdoor-midday"
  | "rooftop_night"
  | "deep_space_starfield";

/** Ambient particle family per course (LINKS-18). */
export type CourseAmbientParticles = "wisps" | "leaves" | "embers" | "spindrift" | "moths";

export interface CourseFog {
  readonly color: string;
  /** exp2 density per metre (the flag-off forward fog reads it directly) */
  readonly density: number;
  /** 0..1, sets the fog's max opacity (0.25 + 0.55 x intensity) */
  readonly intensity: number;
  /** height-fog terms (PRD §3.1 `AuraHeightFogSpec`); read once A3D_QR_VFX_FOG is on (GU47(E-B/E-G)) */
  readonly height?: { readonly heightDensity: number; readonly heightFalloff: number; readonly heightReference: number };
}

export interface CourseLookRow {
  readonly course: CourseId;
  /** identity sheet: place and hour (PRD WP-20 identity line) */
  readonly timeOfDay: string;
  /**
   * Engine look preset the row builds on in GU47 wave 1. The 5 override keys cannot pick an HDRI, so Maple Hollow
   * moves to the golden-hour preset (warm kloppenheim sky) to break the three-way HDRI share; every other course keeps
   * its preset. GU47(E-A): with the `hdri` override the base only supplies defaults the row does not set.
   */
  readonly base: LookId;
  /** PRD LINKS-02 HDRI; `sunAzimuthInHdriDeg` is measured in phase 2 (brightest texel) so the rotation can match the sun */
  readonly hdri: {
    readonly id: LinksHdriId;
    readonly size: "1k" | "2k";
    readonly intensity: number;
    readonly background: boolean;
    readonly sunAzimuthInHdriDeg: number | null;
  };
  /** own sun (LINKS-01); null keeps the preset's key direction (Neon Bay's moon) */
  readonly sun: { readonly azimuthDeg: number; readonly elevationDeg: number } | null;
  readonly key: { readonly color: string; readonly intensity: number; readonly colorTemperatureK: number };
  /** "legacy" keeps the calibrated night/space rim in courseFill */
  readonly rim: { readonly color: string; readonly intensity: number; readonly azimuthDeg: number; readonly elevationDeg: number } | "legacy";
  readonly exposureEv: number;
  /** horizon-matched backdrop colour (the look `background` override) */
  readonly background: string;
  /** LINKS-03 atmosphere; null = no fog node (Mare is airless) */
  readonly fog: CourseFog | null;
  /** LINKS-03 god rays: GU47(E-C/E-F) `effects.volumetricFog({ godRayDensity })`, High tier only */
  readonly godRays: { readonly density: number; readonly intensity: number; readonly color: string } | null;
  /** LINKS-04 grade: contrast/saturation reach pixels today; temperature/tint after E-C's grade writer */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number; readonly radius: number };
  readonly vignette: { readonly intensity: number; readonly color: string } | null;
  /** film grain (Maple only, LINKS-04); never on Low */
  readonly grain: { readonly intensity: number; readonly size: number } | null;
  /** HUD accent (LINKS-14): hues >= 30 deg apart, >= 4.5:1 on the HUD panel */
  readonly accent: string;
  /** identity palette, three base tones (PRD §3.2) */
  readonly palette: readonly [string, string, string];
  readonly ambientParticles: CourseAmbientParticles | null;
  /** LINKS-18 sun flare (lens flare node at the sun direction) */
  readonly sunFlare: boolean;
  /** flag flutter scale from wind (LINKS-13); 0 = stiff (Mare has no air) */
  readonly flagFlutter: number;
}

export const COURSE_LOOKS: Readonly<Record<CourseId, CourseLookRow>> = {
  stAuroras: {
    course: "stAuroras",
    timeOfDay: "cold sunrise, sea haar over marram dunes",
    base: "outdoor-day",
    hdri: { id: "spruit_sunrise", size: "1k", intensity: 0.92, background: true, sunAzimuthInHdriDeg: null },
    sun: { azimuthDeg: 95, elevationDeg: 12 },
    key: { color: "#ffd6ae", intensity: 2.9, colorTemperatureK: 3600 },
    rim: { color: "#b8d2e6", intensity: 0.24, azimuthDeg: 275, elevationDeg: 20 },
    exposureEv: 0.2,
    background: "#b9c7d0",
    fog: { color: "#c4cfd6", density: 0.0062, intensity: 0.42, height: { heightDensity: 0.05, heightFalloff: 0.16, heightReference: 0 } },
    godRays: null,
    grade: { contrast: 0.97, saturation: 0.86, temperature: -0.12, tint: 0.02 },
    bloom: { intensity: 0.3, threshold: 0.8, radius: 0.4 },
    vignette: { intensity: 0.1, color: "#0d1a22" },
    grain: null,
    accent: "#4fd6a0",
    palette: ["#5f7d6a", "#c4cfd6", "#d6c39a"],
    ambientParticles: "wisps",
    sunFlare: true,
    flagFlutter: 1.25
  },
  mapleHollow: {
    course: "mapleHollow",
    timeOfDay: "warm late afternoon, maples over still ponds",
    base: "golden-hour",
    hdri: { id: "autumn_field_puresky", size: "2k", intensity: 1.0, background: true, sunAzimuthInHdriDeg: null },
    sun: { azimuthDeg: 235, elevationDeg: 30 },
    key: { color: "#ffc58a", intensity: 2.7, colorTemperatureK: 3900 },
    rim: { color: "#9db7d6", intensity: 0.22, azimuthDeg: 55, elevationDeg: 20 },
    exposureEv: 0,
    background: "#d7b48c",
    fog: { color: "#d9b48a", density: 0.0034, intensity: 0.26 },
    godRays: null,
    grade: { contrast: 1.06, saturation: 1.1, temperature: 0.18, tint: 0 },
    bloom: { intensity: 0.36, threshold: 0.74, radius: 0.42 },
    vignette: { intensity: 0.14, color: "#1d1208" },
    grain: { intensity: 0.045, size: 1.4 },
    accent: "#ff5c7f",
    palette: ["#3f6b3a", "#b8452c", "#e3c48f"],
    ambientParticles: "leaves",
    sunFlare: false,
    flagFlutter: 0.5
  },
  cinderRim: {
    course: "cinderRim",
    timeOfDay: "dusk on a basalt crater, lava light and god rays",
    base: "golden-hour",
    hdri: { id: "industrial_sunset_puresky", size: "1k", intensity: 0.8, background: true, sunAzimuthInHdriDeg: null },
    sun: { azimuthDeg: 265, elevationDeg: 7 },
    key: { color: "#ff9a5a", intensity: 2.5, colorTemperatureK: 2600 },
    rim: { color: "#8e86c9", intensity: 0.22, azimuthDeg: 85, elevationDeg: 22 },
    exposureEv: 0.15,
    background: "#5a3a35",
    fog: { color: "#6b5348", density: 0.005, intensity: 0.38, height: { heightDensity: 0.03, heightFalloff: 0.12, heightReference: 0 } },
    godRays: { density: 0.92, intensity: 0.5, color: "#ffb27a" },
    grade: { contrast: 1.12, saturation: 1.04, temperature: 0.25, tint: 0 },
    bloom: { intensity: 0.5, threshold: 0.68, radius: 0.46 },
    vignette: { intensity: 0.18, color: "#140806" },
    grain: null,
    accent: "#f5a02b",
    palette: ["#2b2522", "#7a6a4a", "#d8541f"],
    ambientParticles: "embers",
    sunFlare: true,
    flagFlutter: 0.8
  },
  cloudTerrace: {
    course: "cloudTerrace",
    timeOfDay: "hard cobalt noon above a cloud sea",
    base: "alpine-snow",
    hdri: { id: "outdoor-midday", size: "2k", intensity: 1.1, background: true, sunAzimuthInHdriDeg: null },
    sun: { azimuthDeg: 160, elevationDeg: 62 },
    key: { color: "#fffaf0", intensity: 3.3, colorTemperatureK: 5800 },
    rim: { color: "#d6e8ff", intensity: 0.18, azimuthDeg: 340, elevationDeg: 20 },
    exposureEv: -0.1,
    background: "#4f86d9",
    fog: { color: "#bcd6f2", density: 0.0012, intensity: 0.1 },
    godRays: null,
    grade: { contrast: 1.12, saturation: 1.06, temperature: -0.04, tint: 0 },
    bloom: { intensity: 0.24, threshold: 0.86, radius: 0.36 },
    vignette: null,
    grain: null,
    accent: "#4d8bff",
    palette: ["#6d9a58", "#e8f2f8", "#2f5fae"],
    ambientParticles: "spindrift",
    sunFlare: false,
    flagFlutter: 1.4
  },
  neonBay: {
    course: "neonBay",
    timeOfDay: "wet floodlit harbour night in teal and magenta",
    base: "night-city",
    hdri: { id: "rooftop_night", size: "1k", intensity: 0.6, background: false, sunAzimuthInHdriDeg: null },
    sun: null,
    key: { color: "#7d9dd4", intensity: 0.7, colorTemperatureK: 9000 },
    rim: "legacy",
    exposureEv: 0.08,
    background: "#0a1430",
    fog: { color: "#0b1532", density: 0.004, intensity: 0.3 },
    godRays: null,
    grade: { contrast: 1.14, saturation: 1.18, temperature: -0.08, tint: 0.06 },
    bloom: { intensity: 0.62, threshold: 0.62, radius: 0.5 },
    vignette: { intensity: 0.2, color: "#05030f" },
    grain: null,
    accent: "#19e0ff",
    palette: ["#0a1430", "#1f6a52", "#ff3fd2"],
    ambientParticles: "moths",
    sunFlare: false,
    flagFlutter: 0.6
  },
  mareCourse: {
    course: "mareCourse",
    timeOfDay: "airless black-sky regolith under an earthrise",
    base: "space",
    hdri: { id: "deep_space_starfield", size: "2k", intensity: 0.25, background: true, sunAzimuthInHdriDeg: null },
    sun: { azimuthDeg: 40, elevationDeg: 25 },
    key: { color: "#ffffff", intensity: 3.6, colorTemperatureK: 5900 },
    rim: "legacy",
    exposureEv: 0.15,
    background: "#000000",
    fog: null,
    godRays: null,
    grade: { contrast: 1.18, saturation: 0.9, temperature: 0, tint: 0 },
    bloom: { intensity: 0.3, threshold: 0.82, radius: 0.38 },
    vignette: { intensity: 0.16, color: "#000000" },
    grain: null,
    accent: "#a98dff",
    palette: ["#000000", "#8e9096", "#3d6fd8"],
    ambientParticles: null,
    sunFlare: false,
    flagFlutter: 0
  }
};

/** Mare's earthshine: a faint blue fill from the Earth disc's direction, no shadow (LINKS-16). */
export const MARE_EARTHSHINE = { color: "#7fa6ff", intensity: 0.18, azimuthDeg: 220, elevationDeg: 20 } as const;

/** Neon Bay's two floodlight masts behind the green (LINKS-16); shadowed once E-B ships multi-caster shadows. */
export const NEON_MAST_SPOTS = { color: "#d8f1ff", intensity: 3.6, angle: 0.85, penumbra: 0.5, distance: 90, height: 11 } as const;

/** Cinder Rim's lava glow: one point light per lava hazard, at most three (LINKS-16). */
export const CINDER_LAVA_LIGHT = { color: "#ff6a2a", intensity: 2.2, distance: 16, maxPerHole: 3 } as const;

/** Key-light shadow per presentation tier (LINKS-01: PCSS with 3 cascades; PRD §6.4 Low: 1 cascade, PCF). */
export function keyShadowFor(tier: "low" | "high"): { readonly filter: "pcss" | "pcf"; readonly cascades: 1 | 3; readonly mapSize: 1024 | 2048 } {
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

/** Unit vector toward the course key light: its own sun, else the preset key it keeps (Neon Bay's moon at 55/210). */
export function keyDirection(row: CourseLookRow): V3 {
  const angles = row.sun ?? PRESET_KEY_ANGLES[row.base] ?? { azimuthDeg: 35, elevationDeg: 48 };
  const p = anglesToPosition(angles.elevationDeg, angles.azimuthDeg, 1);
  const len = Math.hypot(p[0], p[1], p[2]) || 1;
  return [p[0] / len, p[1] / len, p[2] / len];
}

/** The engine presets' own key angles (lookPresets.ts), for rows that keep them. */
const PRESET_KEY_ANGLES: Partial<Record<LookId, { readonly azimuthDeg: number; readonly elevationDeg: number }>> = {
  "night-city": { azimuthDeg: 210, elevationDeg: 55 },
  space: { azimuthDeg: 45, elevationDeg: 30 },
  "outdoor-day": { azimuthDeg: 35, elevationDeg: 48 },
  "golden-hour": { azimuthDeg: 35, elevationDeg: 12 },
  "alpine-snow": { azimuthDeg: 35, elevationDeg: 48 }
};

/** HDRI rotation that puts the HDRI's sun on the course sun (0 until phase 2 measures the HDRI's sun azimuth). */
export function hdriRotationDeg(row: CourseLookRow): number {
  if (row.sun === null || row.hdri.sunAzimuthInHdriDeg === null) return 0;
  const r = (row.sun.azimuthDeg - row.hdri.sunAzimuthInHdriDeg) % 360;
  return r < 0 ? r + 360 : r;
}

/** URL the E-A catalogue serves an HDRI at (`public/hdri/<id>_<size>.hdr`; 404 until E-A merges, by design). */
export function hdriUrl(row: CourseLookRow): string {
  return `/hdri/${row.hdri.id}_${row.hdri.size}.hdr`;
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
