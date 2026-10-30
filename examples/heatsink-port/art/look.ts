/**
 * GU47 WP-29 (G19) look table for Ion Circuit (heatsink-port): one row per variant (PRD §3.2 item 2).
 *
 * - `twilight` (default): the alien blue-hour canyon. Teal haze, violet aurora, a magenta-to-amber sunset band at the
 *   sun azimuth, a large ringed planet, cyan mineral veins; each district tints the fog toward its HUD colour.
 * - `original` (`?look=original`): today's look, value for value (lit scale 0.26, the 52-degree engine key, the neutral
 *   room, bloom 0.6/1.0, grade 1.05/1.08/1.0). Every shader term the twilight row adds is zero here.
 *
 * Pure data plus a parser: the sim never reads it (PRD D8).
 */
export type HeatsinkLookId = "twilight" | "original";
export const HEATSINK_LOOK_IDS: readonly HeatsinkLookId[] = ["twilight", "original"];

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

/** the identity palette (PRD WP-29 Identity), sRGB hex */
export const PALETTE = {
  tealHaze: "#0f3a40",
  violet: "#9f8cff",
  magenta: "#ff5ab4",
  amber: "#ffb02e",
  copper: "#c8743a",
  ionCyan: "#40e0ff"
} as const;

export interface HeatsinkLookRow {
  readonly id: HeatsinkLookId;
  readonly timeOfDay: string;
  /** primary visible environment: the authored dome (no HDRI background) */
  readonly sky: {
    readonly kind: "aurora-dome";
    /** 0 = today's dome; 1 = the twilight band, crescent planet, ring shadow, twinkle and teal below the horizon */
    readonly twilight: number;
    /** planet angular radius scale (1 = today's 0.17) */
    readonly planetScale: number;
    /** aurora strength (the map's `alien.aurora`) */
    readonly aurora: number;
    /** magenta-to-amber band colours (linear) */
    readonly bandLow: Rgb;
    readonly bandHigh: Rgb;
  };
  /** the engine key light: matches the shader sun in the twilight row (IC-03) */
  readonly key: {
    readonly position: Vec3;
    readonly color: string;
    readonly intensity: number;
    readonly cascades: number;
    readonly maxDistance: number;
    readonly droneCasts: boolean;
  };
  /** the lit models' hemisphere next to the IBL (the custom shaders evaluate their own `lit()`) */
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  /** IBL for the lit GLBs; background always off (the authored dome is the visible sky) */
  readonly environment:
    | { readonly kind: "neutral"; readonly intensity: number }
    | { readonly kind: "hdri"; readonly hdri: "sunset-dramatic"; readonly intensity: number; readonly rotationDeg: number };
  /** the custom shaders' `lit()` (IC-01): scale, warm sunset bounce from below the sun side, violet top fill */
  readonly lit: { readonly scale: number; readonly bounce: Rgb; readonly topFill: Rgb; readonly roadAlbedo: number };
  /** fog: the base haze colour and how far each district's HUD colour pulls it (IC-06) */
  readonly fog: { readonly color: Rgb; readonly districtMix: number; readonly districtMetres: number };
  /** obsidian-glass causeway (IC-10): 0 = today's asphalt */
  readonly causeway: { readonly glass: number; readonly veinHdr: number; readonly seams: number };
  readonly bloom: { readonly intensity: number; readonly threshold: number };
  /** IC-09: `shadows` / `highlights` are the E-C grade multipliers (1 = neutral; an rgb triple split-tones) */
  readonly grade: { readonly exposure: number; readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number; readonly shadows: number | Rgb; readonly highlights: number | Rgb };
  /** IC-08 post stack; `null` fields are not mounted (today's look mounts none of them) */
  readonly post: {
    readonly ao: boolean;
    readonly motionBlur: number | null;
    readonly chromaticAberration: number | null;
    readonly grain: number | null;
    readonly vignette: number | null;
    readonly godRays: number | null;
  };
  /** signature effect: the ion wake (IC-18) */
  readonly wake: { readonly enabled: boolean; readonly seconds: number; readonly segments: number; readonly cruise: Rgb; readonly cruiseTail: Rgb; readonly afterburner: Rgb; readonly width: number };
  /** camera feel (IC-22): bank roll cap in degrees, countdown sweep on/off */
  readonly camera: { readonly rollDeg: number; readonly countdownSweep: boolean };
  /** IC-02: glow-pool gain in the custom shaders (0 = none) and moving point lights for the lit GLBs (0..2) */
  readonly glow: { readonly pools: number; readonly points: number };
  /** IC-20 spores, IC-24 lane beacons, IC-21 arch chase */
  readonly dressing: { readonly spores: number; readonly beacons: boolean; readonly archChase: boolean; readonly lichen: number };
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearOf = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
};

/** the map's shader sun direction (`VESPER.lighting.sky.sunDir`), about 15.5 degrees up */
export const SHADER_SUN_DIR: Vec3 = [0.55, 0.23, -0.62];
/** IC-03: the engine key along the shader sun, ~400 m out */
export const TWILIGHT_KEY_POSITION: Vec3 = [220, 92, -248];
/** sun azimuth (degrees, atan2(z, x)) the HDRI is rotated to */
export const SUN_AZIMUTH_DEG = (Math.atan2(SHADER_SUN_DIR[2], SHADER_SUN_DIR[0]) * 180) / Math.PI;

export const LOOKS: Readonly<Record<HeatsinkLookId, HeatsinkLookRow>> = {
  twilight: {
    id: "twilight",
    timeOfDay: "alien blue hour, sun 15 degrees up behind a magenta-to-amber band",
    sky: { kind: "aurora-dome", twilight: 1, planetScale: 1.6, aurora: 1.35, bandLow: linearOf(PALETTE.amber), bandHigh: linearOf(PALETTE.magenta) },
    key: { position: TWILIGHT_KEY_POSITION, color: "#ffe0dc", intensity: 2.9, cascades: 3, maxDistance: 220, droneCasts: true },
    hemisphere: { sky: "#8a7cd8", ground: "#3a2418", intensity: 0.8 },
    environment: { kind: "hdri", hdri: "sunset-dramatic", intensity: 0.7, rotationDeg: SUN_AZIMUTH_DEG },
    lit: { scale: 0.45, bounce: [0.30, 0.13, 0.06], topFill: [0.16, 0.12, 0.34], roadAlbedo: 0.34 },
    /* the haze stays the map's `atmosphere.low` (linear; sRGB ~#457b7f) so the distance does not go dark; #0f3a40 is the deep haze below the horizon in the dome */
    fog: { color: [0.06, 0.19, 0.21], districtMix: 0.3, districtMetres: 120 },
    causeway: { glass: 1, veinHdr: 1.7, seams: 1 },
    bloom: { intensity: 0.6, threshold: 1.0 },
    /* IC-09 split tone: teal shadows, amber highlights, a touch cooler overall so the warm band stays the only warm field */
    grade: { exposure: 1.05, contrast: 1.08, saturation: 1.08, temperature: -0.04, tint: 0.02, shadows: [0.92, 1.03, 1.06], highlights: [1.06, 1.0, 0.9] },
    post: { ao: true, motionBlur: 0.35, chromaticAberration: 0.0012, grain: 0.025, vignette: 0.28, godRays: 0.35 },
    wake: { enabled: true, seconds: 1.2, segments: 60, cruise: linearOf(PALETTE.ionCyan), cruiseTail: linearOf(PALETTE.violet), afterburner: linearOf(PALETTE.amber), width: 0.9 },
    camera: { rollDeg: 6, countdownSweep: true },
    glow: { pools: 1, points: 2 },
    dressing: { spores: 300, beacons: true, archChase: true, lichen: 1 }
  },
  original: {
    id: "original",
    timeOfDay: "teal night (4.6.x look)",
    sky: { kind: "aurora-dome", twilight: 0, planetScale: 1, aurora: 1, bandLow: [0, 0, 0], bandHigh: [0, 0, 0] },
    key: { position: [180, 260, -120], color: "#ffd9b0", intensity: 2.6, cascades: 2, maxDistance: 160, droneCasts: false },
    hemisphere: { sky: "#6fa8d8", ground: "#2a1a10", intensity: 1.1 },
    environment: { kind: "neutral", intensity: 1.0 },
    lit: { scale: 0.26, bounce: [0, 0, 0], topFill: [0, 0, 0], roadAlbedo: 0.23 },
    fog: { color: [0.06, 0.19, 0.21], districtMix: 0, districtMetres: 120 },
    causeway: { glass: 0, veinHdr: 0, seams: 0 },
    bloom: { intensity: 0.6, threshold: 1.0 },
    grade: { exposure: 1.05, contrast: 1.08, saturation: 1.0, temperature: 0, tint: 0, shadows: 1, highlights: 1 },
    post: { ao: false, motionBlur: null, chromaticAberration: null, grain: null, vignette: null, godRays: null },
    wake: { enabled: false, seconds: 1.2, segments: 60, cruise: [0, 0, 0], cruiseTail: [0, 0, 0], afterburner: [0, 0, 0], width: 0 },
    camera: { rollDeg: 0, countdownSweep: false },
    glow: { pools: 0, points: 0 },
    dressing: { spores: 0, beacons: false, archChase: false, lichen: 0 }
  }
};

/** `?look=original|twilight`; anything else (or no param) is the default `twilight` */
export function lookFromSearch(search: string | null | undefined): HeatsinkLookRow {
  const id = new URLSearchParams(search ?? "").get("look");
  return id === "original" ? LOOKS.original : LOOKS.twilight;
}

/**
 * Low tier (PRD §6.4, WP-29 Budget): the palette, sky and ion wake stay; GTAO, motion blur, god rays, grain and CA go,
 * cascades drop to 1. Applied on coarse pointers or `quality=low`, and by the fps governor (fps < 30 for 3 s).
 */
export function lowTier(row: HeatsinkLookRow): HeatsinkLookRow {
  return {
    ...row,
    key: { ...row.key, cascades: 1, maxDistance: Math.min(row.key.maxDistance, 140) },
    post: { ...row.post, ao: false, motionBlur: null, godRays: null, grain: null, chromaticAberration: null },
    glow: { ...row.glow, points: Math.min(row.glow.points, 1) },
    dressing: { ...row.dressing, spores: Math.min(row.dressing.spores, 120) }
  };
}

/**
 * Reduced motion (PRD §6.3): no roll, no countdown sweep (a cut), no motion blur, no CA or vignette pulse, spores
 * halved. The FOV kick cap (6 degrees) and shake removal stay in `world.ts` (HP-13).
 */
export function reducedMotionLook(row: HeatsinkLookRow): HeatsinkLookRow {
  return {
    ...row,
    camera: { rollDeg: 0, countdownSweep: false },
    post: { ...row.post, motionBlur: null, chromaticAberration: null },
    dressing: { ...row.dressing, spores: Math.floor(row.dressing.spores / 2) }
  };
}

/** IC-06: the fog colour of one district: the base haze pulled `districtMix` toward the district HUD colour */
export function districtFog(row: HeatsinkLookRow, hudHex: string): Rgb {
  const hud = linearOf(hudHex);
  const k = row.fog.districtMix;
  return [row.fog.color[0] + (hud[0] - row.fog.color[0]) * k, row.fog.color[1] + (hud[1] - row.fog.color[1]) * k, row.fog.color[2] + (hud[2] - row.fog.color[2]) * k];
}

/** IC-06: per-metre approach rate; after `districtMetres` the fog is ~95% of the way to the new district colour */
export function fogApproach(row: HeatsinkLookRow, metres: number): number {
  return 1 - Math.exp((-3 * Math.max(0, metres)) / Math.max(1, row.fog.districtMetres));
}

/** runtime post switches (engine post effect names) for the reduced-motion and low-fps states; empty under `original` */
export function postToggles(row: HeatsinkLookRow | undefined, state: { readonly reducedMotion: boolean; readonly lowFps: boolean }): readonly (readonly [string, boolean])[] {
  if (!row) return [];
  const out: (readonly [string, boolean])[] = [];
  if (row.post.motionBlur !== null) out.push(["motionBlur", !state.reducedMotion && !state.lowFps]);
  if (row.post.chromaticAberration !== null) out.push(["chromaticAberration", !state.reducedMotion && !state.lowFps]);
  if (row.post.godRays !== null) out.push(["volumetricFog", !state.lowFps]);
  return out;
}
