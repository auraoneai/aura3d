/**
 * Aura Diamond 3D look table (GU47 WP-18 "Six postcards of summer baseball").
 *
 * One row per ballpark: the hour, the HDRI, the sun, the air, the grade and the signature-effect parameters. The engine
 * look preset (`baseLook`) is only the skeleton the adapter in `engineCompat.ts` patches; the identity lives here.
 * Pure data and pure functions: no engine import, no DOM, so `tests/unit/aura-diamond/` can read every row.
 *
 * `?look=original` selects `ORIGINAL_LOOKS` (the 4.6.2 look, PRD section 8 reversibility). Every other value is GU47.
 */
import type { ParkId, ParkSpec, Vec3 } from "../src/rules";

/** HDRI catalogue ids this game uses (PRD 3.1 E-A `AuraHdriId`); served at `/hdri/<id>_1k.hdr` by lane E-A. */
export type DiamondHdriId = "belfast_sunset_puresky" | "rooftop_night" | "outdoor-midday" | "spruit_sunrise" | "hangar_interior" | "deep_space_starfield";
/** Engine look presets the adapter starts from (a subset of `AuraLookId`). */
export type DiamondBaseLook = "golden-hour" | "night-city" | "outdoor-day" | "overcast" | "interior-industrial" | "polar-night" | "space";
/** Engine post preset ids (`AuraPostPresetId`) each park follows. */
export type DiamondPostPreset = "cinematic-film" | "neon-night" | "daylight-outdoor" | "arena-fight" | "space";
export type DiamondToneMapping = "agx" | "aces";
export type DiamondLookVariant = "gu47" | "original";
export type DiamondTier = "low" | "medium" | "high";

export interface ParkPractical {
  readonly name: string;
  readonly kind: "spot" | "rect";
  readonly position: Vec3;
  readonly target: Vec3;
  readonly color: string;
  readonly intensity: number;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly distance?: number;
  readonly width?: number;
  readonly height?: number;
  /** Draw an additive light cone under the lamp (one draw). */
  readonly cone?: boolean;
  /** Draw a lens flare on this lamp (one sprite per element). */
  readonly flare?: boolean;
}

export interface ParkLook {
  readonly park: ParkId;
  /** Postcard title used in the identity sheet. */
  readonly postcard: string;
  readonly timeOfDay: string;
  readonly baseLook: DiamondBaseLook;
  readonly hdri: {
    readonly id: DiamondHdriId;
    /** Image-based light intensity (0..4). */
    readonly intensity: number;
    /** Aligns the HDRI sun with the key; tuned on the phase-2 capture (0 until then). */
    readonly rotationDeg: number;
    /** The HDRI is the visible sky. */
    readonly background: boolean;
    /** Background radiance multiplier (only the drawn sky, not the IBL). */
    readonly backgroundIntensity: number;
  };
  /** Analytic sky drawn over the HDRI once lane E-G's sky opt-in lands (`?sky=analytic` with `?a3d-qr=vfx.sky` until then). */
  readonly sky?:
    | { readonly model: "preetham"; readonly turbidity: number; readonly rayleigh: number }
    | { readonly model: "gradient"; readonly zenith: string; readonly horizon: string; readonly ground: string; readonly stars?: number };
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly colorTemperatureK: number };
  readonly rim: false | { readonly color: string; readonly intensity: number; readonly elevationDeg: number; readonly azimuthDeg: number };
  /** Exp2 scene fog: `density` per metre, `maxOpacity` caps the far field (engine intensity 0..1 maps to 0.25 + 0.55 i). */
  readonly fog: false | { readonly color: string; readonly density: number; readonly intensity: number };
  /** Volumetric inscatter (god rays); High tier only. */
  readonly godRays?: { readonly density: number; readonly intensity: number; readonly color: string; readonly lightPosition: Vec3 };
  readonly exposureEv: number;
  /** Clear colour behind the HDRI (seen before it loads and below the horizon). */
  readonly background: string;
  readonly accent: string;
  readonly post: {
    readonly preset: DiamondPostPreset;
    readonly toneMapping: DiamondToneMapping;
    readonly exposure: number;
    readonly bloom: { readonly threshold: number; readonly intensity: number };
    readonly grain: number;
    readonly vignette: number;
    readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
    /** Planned colour-script LUT (lane E-C binds LUTs; the file lands in wave 2). */
    readonly lut: string;
  };
  /** Field surfaces: real turf, terracotta clay, chalk and a darker warning track. */
  readonly turf: { readonly grass: string; readonly stripe: string; readonly clay: string; readonly track: string; readonly trackRoughness: number; readonly chalk: string };
  /** Shirt colours of the instanced stands, one per section (7 sections). */
  readonly crowd: readonly string[];
  readonly weather?: { readonly kind: "drizzle"; readonly intensity: number; readonly density: number; readonly color: string };
  /** Signature effect parameters: the bat-crack splinter flash. */
  readonly signature: { readonly splinter: string; readonly flash: string; readonly flashIntensity: number; readonly gravityScale: number };
  /** What a landing ball kicks up, and how a home run is celebrated (VFX pack kinds). */
  readonly landingFx: "diamond-clay-puff" | "diamond-canyon-dust" | "diamond-regolith-arc";
  readonly celebration: "diamond-hr-firework" | "diamond-dome-confetti" | "diamond-regolith-arc";
}

/** Core palette of the art direction (turf green, terracotta clay, chalk, dugout shade). */
export const DIAMOND_PALETTE = {
  primary: ["#3d7a35", "#b4623c", "#e8e2cf", "#24302a"],
  accent: "#f2a93b",
  /** The ball, and only the ball. */
  reservedObjective: "#f5f1e4"
} as const;

export const SIGNATURE_EFFECT = "bat-crack splinter flash";

export const PARK_LOOKS: Readonly<Record<ParkId, ParkLook>> = {
  sandlot: {
    park: "sandlot",
    postcard: "Harbor Sandlot at last light over the water",
    timeOfDay: "last light, sun 9 degrees above the sea",
    baseLook: "golden-hour",
    hdri: { id: "belfast_sunset_puresky", intensity: 0.9, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    sky: { model: "preetham", turbidity: 6.5, rayleigh: 2.4 },
    sun: { elevationDeg: 9, azimuthDeg: 250, color: "#ff9a52", intensity: 2.5, colorTemperatureK: 2600 },
    rim: { color: "#7fa6c9", intensity: 0.45, elevationDeg: 14, azimuthDeg: 70 },
    fog: { color: "#e7b58b", density: 0.0032, intensity: 0.32 },
    exposureEv: 0.1,
    background: "#e0a070",
    accent: "#f08a4b",
    post: {
      preset: "cinematic-film",
      toneMapping: "agx",
      exposure: 1.0,
      bloom: { threshold: 0.85, intensity: 0.24 },
      grain: 0.03,
      vignette: 0.2,
      grade: { contrast: 1.08, saturation: 1.08, temperature: 0.3, tint: 0.02 },
      lut: "diamond-harbor-last-light.cube"
    },
    turf: { grass: "#41702f", stripe: "#4b7d35", clay: "#b86a42", track: "#7a4a33", trackRoughness: 0.92, chalk: "#efe4cc" },
    crowd: ["#c8553d", "#f2c14e", "#3b7ea1", "#e8e2cf", "#7d4e8f", "#d9883f", "#2f6b5e"],
    signature: { splinter: "#d9b78a", flash: "#ffe2b0", flashIntensity: 1.0, gravityScale: 1 },
    landingFx: "diamond-clay-puff",
    celebration: "diamond-hr-firework"
  },
  skyline: {
    park: "skyline",
    postcard: "Midtown Skyline in rain-wet blue hour under sodium and LED towers",
    timeOfDay: "blue hour after rain",
    baseLook: "night-city",
    hdri: { id: "rooftop_night", intensity: 0.5, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    sun: { elevationDeg: 52, azimuthDeg: 150, color: "#9fc2ff", intensity: 0.55, colorTemperatureK: 9000 },
    rim: false,
    fog: { color: "#1c2c44", density: 0.0045, intensity: 0.38 },
    exposureEv: 0.18,
    background: "#0b1422",
    accent: "#4fc3e8",
    post: {
      preset: "neon-night",
      toneMapping: "aces",
      exposure: 1.1,
      bloom: { threshold: 0.65, intensity: 0.42 },
      grain: 0.03,
      vignette: 0.24,
      grade: { contrast: 1.12, saturation: 1.04, temperature: -0.25, tint: 0.04 },
      lut: "diamond-midtown-blue-hour.cube"
    },
    turf: { grass: "#2f5a36", stripe: "#376640", clay: "#7a4b37", track: "#3a2c26", trackRoughness: 0.28, chalk: "#e6e1d2" },
    crowd: ["#4fc3e8", "#e6e1d2", "#f0b450", "#2d3e66", "#c7476a", "#58b68a", "#8f9bb3"],
    weather: { kind: "drizzle", intensity: 0.22, density: 0.35, color: "#a9c4e4" },
    signature: { splinter: "#cdb48f", flash: "#e8f2ff", flashIntensity: 1.25, gravityScale: 1 },
    landingFx: "diamond-clay-puff",
    celebration: "diamond-hr-firework"
  },
  canyon: {
    park: "canyon",
    postcard: "Canyon Rim at hard desert noon",
    timeOfDay: "high noon, sun 72 degrees",
    baseLook: "outdoor-day",
    hdri: { id: "outdoor-midday", intensity: 1.1, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    sky: { model: "gradient", zenith: "#5d8fc4", horizon: "#e4e6df", ground: "#c9b28e" },
    sun: { elevationDeg: 72, azimuthDeg: 20, color: "#fff6e6", intensity: 3.6, colorTemperatureK: 6000 },
    rim: false,
    fog: { color: "#d7c4a6", density: 0.0026, intensity: 0.3 },
    exposureEv: -0.05,
    background: "#c7d3dc",
    accent: "#e3b448",
    post: {
      preset: "daylight-outdoor",
      toneMapping: "aces",
      exposure: 1.0,
      bloom: { threshold: 0.85, intensity: 0.16 },
      grain: 0.03,
      vignette: 0.14,
      grade: { contrast: 1.14, saturation: 0.94, temperature: 0.12, tint: 0 },
      lut: "diamond-canyon-noon.cube"
    },
    turf: { grass: "#5c6d34", stripe: "#677a3a", clay: "#b5653f", track: "#8a4f33", trackRoughness: 0.96, chalk: "#f0e8d4" },
    crowd: ["#e3b448", "#b5653f", "#5d8fc4", "#efe8d8", "#8a3f2c", "#3f6f63", "#d98e64"],
    signature: { splinter: "#e0c393", flash: "#fff4d6", flashIntensity: 0.9, gravityScale: 1 },
    landingFx: "diamond-canyon-dust",
    celebration: "diamond-hr-firework"
  },
  ivy: {
    park: "ivy",
    postcard: "Ivy Classic at spring sunrise",
    timeOfDay: "spring sunrise, sun 24 degrees",
    baseLook: "golden-hour",
    hdri: { id: "spruit_sunrise", intensity: 0.95, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    sun: { elevationDeg: 24, azimuthDeg: 110, color: "#ffd2a1", intensity: 2.3, colorTemperatureK: 3800 },
    rim: { color: "#b9cfe6", intensity: 0.35, elevationDeg: 30, azimuthDeg: 290 },
    fog: { color: "#e6d9c8", density: 0.003, intensity: 0.3 },
    exposureEv: 0.08,
    background: "#e9c7a6",
    accent: "#6fbf6a",
    post: {
      preset: "daylight-outdoor",
      toneMapping: "agx",
      exposure: 1.0,
      bloom: { threshold: 0.85, intensity: 0.2 },
      grain: 0.03,
      vignette: 0.18,
      grade: { contrast: 1.04, saturation: 1.06, temperature: 0.15, tint: -0.03 },
      lut: "diamond-ivy-sunrise.cube"
    },
    turf: { grass: "#3d7a35", stripe: "#468640", clay: "#b4623c", track: "#7c4630", trackRoughness: 0.9, chalk: "#e8e2cf" },
    crowd: ["#6fbf6a", "#b23a2e", "#e8e2cf", "#2d4f8a", "#e6a640", "#5b3d2e", "#8fb8d6"],
    signature: { splinter: "#d6b282", flash: "#fff0d2", flashIntensity: 1.0, gravityScale: 1 },
    landingFx: "diamond-clay-puff",
    celebration: "diamond-hr-firework"
  },
  dome: {
    park: "dome",
    postcard: "Typhoon Dome in a storm, god rays through the roof",
    timeOfDay: "storm outside, truss lights inside",
    baseLook: "interior-industrial",
    hdri: { id: "hangar_interior", intensity: 0.7, rotationDeg: 0, background: true, backgroundIntensity: 0.85 },
    sun: { elevationDeg: 74, azimuthDeg: 30, color: "#e9f1ff", intensity: 1.6, colorTemperatureK: 7200 },
    rim: false,
    fog: { color: "#3a4256", density: 0.004, intensity: 0.34 },
    godRays: { density: 0.004, intensity: 0.55, color: "#c9d6f2", lightPosition: [12, 58, -30] },
    exposureEv: 0.14,
    background: "#141820",
    accent: "#8f83f2",
    post: {
      preset: "arena-fight",
      toneMapping: "aces",
      exposure: 1.0,
      bloom: { threshold: 0.65, intensity: 0.36 },
      grain: 0.03,
      vignette: 0.22,
      grade: { contrast: 1.1, saturation: 0.98, temperature: 0, tint: 0.02 },
      lut: "diamond-dome-storm.cube"
    },
    turf: { grass: "#2f6a4a", stripe: "#357553", clay: "#5a5f6b", track: "#383c46", trackRoughness: 0.4, chalk: "#e4e3dc" },
    crowd: ["#8f83f2", "#e4e3dc", "#f0b44a", "#2c3550", "#d0546b", "#4fa3a0", "#a7adbd"],
    signature: { splinter: "#cfb790", flash: "#eef0ff", flashIntensity: 1.2, gravityScale: 1 },
    landingFx: "diamond-clay-puff",
    celebration: "diamond-dome-confetti"
  },
  lunar: {
    park: "lunar",
    postcard: "Lunar Park under a black sky with Earth rising",
    timeOfDay: "lunar day, black sky, Earth above the rim",
    baseLook: "space",
    hdri: { id: "deep_space_starfield", intensity: 0.15, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    sky: { model: "gradient", zenith: "#010102", horizon: "#020305", ground: "#050607", stars: 1800 },
    sun: { elevationDeg: 18, azimuthDeg: 300, color: "#f4f1ea", intensity: 3.4, colorTemperatureK: 5800 },
    rim: { color: "#6f8fb8", intensity: 0.3, elevationDeg: 35, azimuthDeg: 160 },
    fog: false,
    exposureEv: 0.0,
    background: "#020305",
    accent: "#c3cbd8",
    post: {
      preset: "space",
      toneMapping: "aces",
      exposure: 1.0,
      bloom: { threshold: 0.65, intensity: 0.3 },
      grain: 0.03,
      vignette: 0.2,
      grade: { contrast: 1.18, saturation: 0.82, temperature: -0.12, tint: 0 },
      lut: "diamond-lunar-regolith.cube"
    },
    turf: { grass: "#6b6a66", stripe: "#75736e", clay: "#8a8780", track: "#55534f", trackRoughness: 0.98, chalk: "#d9d6cc" },
    crowd: ["#c3cbd8", "#e9e6dc", "#d98a3a", "#3c4a66", "#9aa3b5", "#5e6878", "#b8a27a"],
    signature: { splinter: "#cbbf9f", flash: "#ffffff", flashIntensity: 1.1, gravityScale: 0.17 },
    landingFx: "diamond-regolith-arc",
    celebration: "diamond-regolith-arc"
  }
};

/**
 * The 4.6.2 look (`?look=original`): the park's engine look with its fog removed and the old exposure. The backdrop is the
 * look's own horizon colour, which is exactly what the old per-park hexes were.
 */
export const ORIGINAL_LOOKS: Readonly<Record<ParkId, { readonly baseLook: DiamondBaseLook; readonly exposureEv: number }>> = {
  sandlot: { baseLook: "golden-hour", exposureEv: 0.14 },
  skyline: { baseLook: "night-city", exposureEv: 0.12 },
  canyon: { baseLook: "overcast", exposureEv: 0.1 },
  ivy: { baseLook: "outdoor-day", exposureEv: 0.12 },
  dome: { baseLook: "interior-industrial", exposureEv: 0.14 },
  lunar: { baseLook: "polar-night", exposureEv: 0.16 }
};

/** `?look=original` restores the 4.6.2 look; anything else (or nothing) is the GU47 look. */
export function resolveLookVariant(search: string): DiamondLookVariant {
  return new URLSearchParams(search).get("look") === "original" ? "original" : "gu47";
}

/**
 * Quality tier for the presentation extras (PRD 6.2, 6.4): `?tier=low|medium|high` wins; otherwise a coarse pointer or a
 * narrow viewport gets `medium` (no god rays, DOF or motion blur), everything else `high`.
 */
export function resolveDiamondTier(search: string, coarsePointer: boolean, viewportWidth: number): DiamondTier {
  const t = new URLSearchParams(search).get("tier");
  if (t === "low" || t === "medium" || t === "high") return t;
  return coarsePointer || viewportWidth < 700 ? "medium" : "high";
}

/** The HDRI file this park fetches (lane E-A ships `public/hdri/<id>_1k.hdr`). */
export const hdriUrl = (id: DiamondHdriId): string => `/hdri/${id}_1k.hdr`;

/**
 * Night and indoor light rigs (DIA-L2): six tower banks at Midtown (sodium and LED), four truss panels in the Dome, four
 * cold spots on the Moon. Day parks have none. Every lamp stands behind the park's own fence. Lamps are unshadowed until
 * lane E-B ships multi-caster shadows; the low tier keeps four lamps (PRD 6.4: four lights per pixel).
 */
export function parkPracticals(park: ParkSpec, tier: DiamondTier): readonly ParkPractical[] {
  const c = park.fenceCorner;
  const rig: ParkPractical[] = [];
  if (park.id === "skyline") {
    const towers: readonly [number, number, string, boolean][] = [
      [-c * 0.74, -c * 0.6 - 8, "#ffb46a", true],
      [c * 0.74, -c * 0.6 - 8, "#d9ecff", true],
      [-c * 0.98, -c * 0.08, "#d9ecff", false],
      [c * 0.98, -c * 0.08, "#ffb46a", false],
      [-c * 0.5, 14, "#d9ecff", false],
      [c * 0.5, 14, "#d9ecff", false]
    ];
    towers.forEach(([x, z, color, flare], i) => {
      rig.push({ name: `skyline-bank-${i}`, kind: "spot", position: [x * 0.92, 24, z * 0.92], target: [x * 0.12, 0, -14 + z * 0.08], color, intensity: 2.6, angle: 0.62, penumbra: 0.5, distance: 180, cone: true, flare });
    });
  } else if (park.id === "dome") {
    for (let i = 0; i < 4; i++) {
      const x = i % 2 === 0 ? -16 : 16;
      const z = i < 2 ? -6 : -38;
      rig.push({ name: `dome-truss-${i}`, kind: "rect", position: [x, 27, z], target: [x * 0.4, 0, z], color: "#e8f0ff", intensity: 5.5, width: 16, height: 3 });
    }
  } else if (park.id === "lunar") {
    const spots: readonly [number, number][] = [[-c * 0.7, -c * 0.55 - 6], [c * 0.7, -c * 0.55 - 6], [-c * 0.48, 16], [c * 0.48, 16]];
    spots.forEach(([x, z], i) => {
      rig.push({ name: `lunar-spot-${i}`, kind: "spot", position: [x * 0.9, 18, z * 0.9], target: [0, 0, -12], color: "#cfe2ff", intensity: 1.7, angle: 0.48, penumbra: 0.35, distance: 190, cone: true, flare: false });
    });
  }
  return tier === "low" ? rig.slice(0, 4).map((p) => ({ ...p, flare: false })) : rig;
}

/** Every hex the look table authors (palette, backgrounds, fog, keys, accents, turf, crowd, signature). */
export function lookTableHexes(): readonly string[] {
  const out = new Set<string>([...DIAMOND_PALETTE.primary, DIAMOND_PALETTE.accent, DIAMOND_PALETTE.reservedObjective]);
  for (const row of Object.values(PARK_LOOKS)) {
    out.add(row.background);
    out.add(row.accent);
    out.add(row.sun.color);
    if (row.rim) out.add(row.rim.color);
    if (row.fog) out.add(row.fog.color);
    if (row.godRays) out.add(row.godRays.color);
    for (const v of Object.values(row.turf)) if (typeof v === "string") out.add(v);
    for (const v of row.crowd) out.add(v);
    out.add(row.signature.splinter);
    out.add(row.signature.flash);
    if (row.weather) out.add(row.weather.color);
    if (row.sky?.model === "gradient") {
      out.add(row.sky.zenith);
      out.add(row.sky.horizon);
      out.add(row.sky.ground);
    }
  }
  return [...out].map((h) => h.toLowerCase());
}
