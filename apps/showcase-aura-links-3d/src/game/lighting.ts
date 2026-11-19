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
  | "kloppenheim_06_puresky"
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
  readonly near: number;
  readonly far: number;
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
    // GU47 phase 2: spruit_sunrise drew a pylon skyline behind the dunes and its 161k sun texel blew the trees out to
    // white; belfast_sunset_puresky then read as a grey-pink overcast under the haar (blind panel 0-3 vs 4.6.2:
    // "heavy grey-white fog, muddy, grass desaturated"). Blind-panel fix: the kloppenheim_06 pure sky (blue sky, low
    // cold sun, peak 19.6 at 4.9 deg elevation, brightest texel u 0.612 = 57.8 deg in the engine frame).
    hdri: { id: "kloppenheim_06_puresky", intensity: 0.6, drawn: true, sunAzimuthInHdriDeg: 57.8, want2k: false },
    sun: { azimuthDeg: 95, elevationDeg: 12 },
    // GU47 phase 4 (shadows): at 12 deg the 3.1 key put only 0.64 on flat turf against a full-strength sky, so the
    // golfer's and the trees' cast shadows did not read (shadow map sampled, 3 cascades: run g10p4-x1); a stronger low
    // sun over a 0.6 sky keeps the turf level and gives the shadows contrast
    key: { color: "#ffe0bd", intensity: 5.2, colorTemperatureK: 4200 },
    rim: { color: "#b8d2e6", intensity: 0.22, azimuthDeg: 275 },
    exposureEv: 0,
    background: "#9fb8cc",
    // blind-panel fix: the haar is only a low ground breath now (any visible fog washed the trees, sky and tee out)
    fog: { color: "#a9bfcf", mode: "height", near: 150, far: 500, density: 0.00035, maxOpacity: 0.08, heightDensity: 0.0028, heightFalloff: 0.22, heightReference: 0 },
    godRays: null,
    grade: { contrast: 1.08, saturation: 1.12, temperature: -0.04, tint: 0 },
    bloom: { intensity: 0.22, threshold: 0.86, scatter: 0.6 },
    vignette: { intensity: 0.14, color: "#0d1a22" },
    grain: null,
    accent: "#4fd6a0",
    palette: ["#5f7d6a", "#c4cfd6", "#d6c39a"],
    // phase 2: no wisps; 0.18-0.42 m soft sprites riding the ball read as white floating dots in the tee frame
    ambientParticles: null,
    sunFlare: false,
    flagFlutter: 0.28
  },
  mapleHollow: {
    course: "mapleHollow",
    place: "parkland maples over still ponds",
    timeOfDay: "warm late afternoon",
    base: "golden-hour",
    hdri: { id: "autumn_field_puresky", intensity: 0.62, drawn: true, sunAzimuthInHdriDeg: 53.6, want2k: true },
    sun: { azimuthDeg: 235, elevationDeg: 30 },
    // GU47 phase 4 (shadows): stronger sun over a dimmer sky, as St Auroras
    key: { color: "#ffc58a", intensity: 3.9, colorTemperatureK: 3900 },
    rim: { color: "#9db7d6", intensity: 0.22, azimuthDeg: 55 },
    exposureEv: 0,
    background: "#d7b48c",
    fog: { color: "#d9b48a", mode: "exp2", near: 150, far: 500, density: 0.0012, maxOpacity: 0.22 },
    godRays: null,
    // GU47 phase 3: the 4.7.0 frame read as a cool noon; warmer late-afternoon grade
    grade: { contrast: 1.08, saturation: 1.14, temperature: 0.3, tint: 0.02 },
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
    hdri: { id: "industrial_sunset_puresky", intensity: 0.6, drawn: true, sunAzimuthInHdriDeg: 53.6, want2k: false },
    sun: { azimuthDeg: 265, elevationDeg: 7 },
    // GU47 phase 4 (shadows): stronger sun over a dimmer sky
    key: { color: "#ff9a5a", intensity: 3.4, colorTemperatureK: 2600 },
    rim: { color: "#8e86c9", intensity: 0.22, azimuthDeg: 85 },
    exposureEv: 0.15,
    background: "#5a3a35",
    fog: { color: "#6b5348", mode: "height", near: 150, far: 480, density: 0.0018, maxOpacity: 0.26, heightDensity: 0.008, heightFalloff: 0.16, heightReference: 0 },
    godRays: { density: 0.26, intensity: 0.24, color: "#ffb27a" },
    // GU47 phase 3: the 4.7.0 frame read as a grey overcast over brown ground, not a dusk crater; warmer and richer grade
    grade: { contrast: 1.14, saturation: 1.16, temperature: 0.4, tint: 0.03 },
    bloom: { intensity: 0.5, threshold: 0.68, scatter: 0.66 },
    vignette: { intensity: 0.18, color: "#140806" },
    grain: null,
    accent: "#f5a02b",
    palette: ["#2b2522", "#7a6a4a", "#d8541f"],
    ambientParticles: "embers",
    sunFlare: false,
    flagFlutter: 0.22
  },
  cloudTerrace: {
    course: "cloudTerrace",
    place: "alpine terraces above a cloud sea",
    timeOfDay: "hard cobalt noon",
    base: "alpine-snow",
    hdri: { id: "outdoor-midday", intensity: 0.8, drawn: true, sunAzimuthInHdriDeg: 49.4, want2k: true },
    sun: { azimuthDeg: 160, elevationDeg: 62 },
    // GU47 phase 4 (shadows): a harder noon sun over a dimmer sky (luma band LINKS-03 re-measured on the recapture)
    key: { color: "#fffaf0", intensity: 3.7, colorTemperatureK: 5800 },
    rim: { color: "#d6e8ff", intensity: 0.18, azimuthDeg: 340 },
    // GU47 phase 3: -0.1 EV gave mean luma 198 and a washed white sky and mint tee (PRD LINKS-03 band: mean 145-175,
    // clip <= 0.02); thinner haze and more saturation bring back the cobalt noon; -0.5 EV still gave 183.5 (run
    // g10p3-r3-2), so -0.95 EV
    exposureEv: -0.95,
    background: "#4f86d9",
    fog: { color: "#bcd6f2", mode: "exp2", near: 140, far: 560, density: 0.0005, maxOpacity: 0.16 },
    godRays: null,
    grade: { contrast: 1.14, saturation: 1.16, temperature: -0.04, tint: 0 },
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
    // GU47 phase 3: a floodlit venue reads bright on the grass (4.7.0: mean 35.6, p95 69, darkFrac 0.32 against the PRD
    // LINKS-16 band mean 35-70, p95 >= 170, darkFrac <= 0.25): a stronger flood bank, a lifted navy sky
    key: { color: "#fff1dc", intensity: NEON_FLOOD_INTENSITY * 1.5, colorTemperatureK: 4800 },
    rim: { color: "#7f9dff", intensity: 0.7, azimuthDeg: 300 },
    exposureEv: 0.3,
    background: "#14244f",
    fog: { color: "#0b1532", mode: "exp2", near: 150, far: 480, density: 0.0014, maxOpacity: 0.26 },
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
    // GU47 phase 3: the starfield at 0.25 drew a flat black sky (darkFrac 0.39 vs the PRD LINKS-16 <= 0.35) and 0.6 still
    // did (0.386, run g10p3-r4-2): the 1k file's median texel is 2e-4 and its 70th percentile 7e-3 linear, so the star
    // field only reaches the frame at about 4x; its IBL stays a faint fill (mean texel about 0.01 x 4)
    hdri: { id: "deep_space_starfield", intensity: 4, drawn: true, sunAzimuthInHdriDeg: null, want2k: true },
    // 2026-11-18 owner (real GPU): "is it supposed to be this dark?" The old sun (azimuth 40, ahead-right of every tee:
    // all holes play toward +Z) backlit the tee 46 deg off the view axis, so with no sky fill the ball, the golfer and
    // every crater wall facing the camera were lit only by the blue earthshine (tee frames: turf mean display luma 0.27,
    // the ball a dark blue-grey disc). The harsh unfiltered sun now stands behind the camera's right shoulder (195 deg,
    // still 25 deg high, so the shadows run long and black ahead-left of the golfer and the ball) and is stronger;
    // `expectedDisplayLuminance` puts the regolith at 0.35 -> 0.52 and the ball's camera face at 0.26 -> 0.84
    // (tests/unit/aura-links-3d/course-exposure.test.ts).
    sun: { azimuthDeg: 195, elevationDeg: 25 },
    key: { color: "#ffffff", intensity: 6.0, colorTemperatureK: 5900 },
    // earthshine: a faint blue fill from the Earth's side, no shadow (LINKS-16)
    // GU47 phase 3: 0.25 left the golfer a black silhouette against the lit regolith; 0.75 modelled the figure from the
    // Earth's side while the sun backlit it. With the sun behind the camera the earthshine is the edge light from the
    // far side (azimuth 15, opposite the sun) and drops to 0.4 so the regolith reads neutral grey, not blue.
    rim: { color: "#7fa6ff", intensity: 0.4, azimuthDeg: 15 },
    // 0.15 -> 0.9 EV (with the 3.6 -> 6.0 key): the sunlit regolith at mid-high luminance; the starfield sky stays
    // black (its median texel is 2e-4), only its stars gain
    exposureEv: 0.9,
    background: "#000000",
    fog: null,
    godRays: null,
    grade: { contrast: 1.18, saturation: 0.9, temperature: 0, tint: 0 },
    // threshold 0.82 -> 1.0: the brighter white ball and regolith highlights must not bloom (no air to scatter light)
    bloom: { intensity: 0.3, threshold: 1.0, scatter: 0.5 },
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

/**
 * GU47 phase 3: the floodlit and lunar tees showed parallel shadow-acne bands across the flat tee deck and turf (Neon Bay
 * key 45 deg over 3 cascades to the camera far plane; Mare 25 deg; runs g10p3-r4-2 and g10p3-r8-2, software WebGL2).
 * Those two rows pull the cascades in to 140 m and double the normal offset (engine default 1.5 texels); the day courses
 * showed no acne and keep the engine defaults.
 */
export function keyShadowTuning(course: CourseId): { readonly normalBias?: number; readonly maxDistance?: number } {
  return course === "neonBay" || course === "mareCourse"
    ? { normalBias: 3, maxDistance: 140 }
    : { normalBias: 1.8, maxDistance: 140 };
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

/* ------------------------------------------------------------------ *
 *  Derived exposure metric of a GU47 look row (unit tested per course) *
 * ------------------------------------------------------------------ */

/**
 * Upward diffuse irradiance / pi of each course HDRI at environment intensity 1 (linear RGB): the cosine-weighted
 * integral of the upper hemisphere of the served `/hdri/<id>_1k.hdr` (packages/create-aura3d/hdri), divided by pi, so
 * `albedo x this x intensity` is the outgoing radiance of flat ground under the IBL (the renderer's diffuse IBL is
 * `irradiance x albedo / pi`). Measured offline on 2026-11-18 (RGBE decode, every texel, sun included).
 */
export const HDRI_UP_IRRADIANCE: Readonly<Record<LinksHdriId, V3>> = {
  kloppenheim_06_puresky: [0.658, 0.827, 1.105],
  autumn_field_puresky: [1.639, 1.606, 1.598],
  industrial_sunset_puresky: [0.722, 0.878, 1.158],
  "outdoor-midday": [0.658, 0.827, 1.105],
  rooftop_night: [0.399, 0.321, 0.439],
  deep_space_starfield: [0.004, 0.005, 0.006]
};

/** Elevation the engine gives a rim a look override adds (no look preset this game uses authors its own rim). */
export const LOOK_RIM_ELEVATION_DEG = 35;

/**
 * Scene-linear factor from the Lambert estimate to what the real-GPU tee frames show (2026-11-18 sweep, mean display luma
 * of the turf right of the golfer): AO, the grade, the vignette, the turf masks and normal relief and the AgX matrices
 * take about 1.15 EV off the estimate on the four day courses (St Auroras -1.15, Maple -1.40, Cinder -1.16, Cloud -0.92).
 */
export const FRAME_CALIBRATION = 0.45;

/**
 * AgX (the app's `toneMapping: "agx"`) on a grey scene-linear value, as display (sRGB-encoded) 0..1: log2 encoding over
 * [-12.47, +4.03] EV, the AgX default-contrast sigmoid polynomial (three.js / Blender AgX), whose output is already the
 * display encoding (its 2.2 linearise and the sRGB encode cancel to within 1-2%).
 */
export function agxDisplay(x: number): number {
  const n = Math.min(1, Math.max(0, (Math.log2(Math.max(x, 1e-10)) + 12.47393) / 16.5));
  const n2 = n * n, n4 = n2 * n2;
  return Math.min(1, Math.max(0, 15.5 * n4 * n2 - 40.14 * n4 * n + 31.96 * n4 - 6.868 * n2 * n + 0.4298 * n2 + 0.1191 * n - 0.00232));
}

/**
 * Normal of the face the address camera sees (every hole plays toward +Z, `lineYaw` about 0; the address and aim cams
 * sit behind the ball and about 25 deg above it): it faces back up the line, tilted 25 deg toward the sky.
 */
export const SUBJECT_FACE_NORMAL: V3 = [0, Math.sin((25 * Math.PI) / 180), -Math.cos((25 * Math.PI) / 180)];

const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * Scene-linear luminance a surface of `albedo` with normal `normal` leaves under a look row, before exposure: Lambert of
 * the key (`I x color x max(0, n.L) / pi`, the renderer's direct diffuse), the rim (at LOOK_RIM_ELEVATION_DEG) and the
 * HDRI (HDRI_UP_IRRADIANCE x intensity, scaled by (1 + n.y) / 2 for a face that sees only part of the sky). Shadows,
 * AO and practicals (Neon Bay's mast spots, Cinder's lava glow) are left out.
 */
export function rowSurfaceRadiance(row: CourseLookRow, albedo: string, normal: readonly number[] = [0, 1, 0]): number {
  const a = linearRgb(albedo);
  const out: V3 = [0, 0, 0];
  const dirLight = (color: string, intensity: number, elevationDeg: number, azimuthDeg: number) => {
    const nl = Math.max(0, dot3(normal, anglesToPosition(elevationDeg, azimuthDeg, 1)));
    const c = linearRgb(color);
    for (let i = 0; i < 3; i++) out[i] += (a[i]! * c[i]! * intensity * nl) / Math.PI;
  };
  dirLight(row.key.color, row.key.intensity, row.sun.elevationDeg, row.sun.azimuthDeg);
  if (row.rim) dirLight(row.rim.color, row.rim.intensity, LOOK_RIM_ELEVATION_DEG, row.rim.azimuthDeg);
  const env = HDRI_UP_IRRADIANCE[row.hdri.id];
  const skyView = (1 + (normal[1] ?? 1)) / 2;
  for (let i = 0; i < 3; i++) out[i] += a[i]! * env[i]! * row.hdri.intensity * skyView;
  return luminance(out);
}

/**
 * The derived exposure metric of a course look: the expected display luminance (sRGB 0..1) of a surface in the tee frame,
 *
 *   display = agxDisplay(FRAME_CALIBRATION x 2^exposureEv x rowSurfaceRadiance(row, albedo, normal))
 *
 * Ground: the course fairway colour with an upward normal. Subject: the golf ball (#fcfdfa) on SUBJECT_FACE_NORMAL, the
 * face the camera sees, so a key that backlights the tee (Mare's old 40 deg sun, 46 deg off the view axis) shows up
 * as a dark ball even when the turf itself is lit.
 */
export function expectedDisplayLuminance(row: CourseLookRow, albedo: string, normal: readonly number[] = [0, 1, 0]): number {
  return agxDisplay(FRAME_CALIBRATION * 2 ** row.exposureEv * rowSurfaceRadiance(row, albedo, normal));
}

/** A course whose sky is black (Mare: airless, no fog, black clear colour): sky-only frames must be avoided. */
export function hasBlackSky(row: CourseLookRow): boolean {
  return row.fog === null && luminance(linearRgb(row.background)) < 0.002;
}
