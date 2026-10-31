/**
 * Aura Diamond 3D look table (GU47 WP-18 "Six postcards of summer baseball").
 *
 * One row per ballpark: the hour, the HDRI, the sun, the air, the grade and the signature-effect parameters. The engine
 * look preset (`baseLook`) is only the skeleton the E-A look overrides patch (`lookPlan` below turns a row into them);
 * the identity lives here. Pure data and pure functions: no engine import, no DOM, so `tests/unit/aura-diamond/` can
 * read every row.
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
  /** Ground point of the tower that carries a spot (x, z); the lamp hangs a little inside it. */
  readonly base?: readonly [number, number];
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
  /**
   * Analytic sky (DIA-E2): when set it is the park's visible sky (E-G promoted `A3D_QR_VFX_SKY` to default-on) and the
   * HDRI only lights the scene. `?sky=hdri` draws the HDRI instead (QA A/B pair).
   */
  readonly sky?:
    | { readonly model: "preetham"; readonly turbidity: number; readonly rayleigh: number }
    | { readonly model: "gradient"; readonly zenith: string; readonly horizon: string; readonly ground: string; readonly stars?: number };
  readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string; readonly intensity: number; readonly colorTemperatureK: number };
  readonly rim: false | { readonly color: string; readonly intensity: number; readonly elevationDeg: number; readonly azimuthDeg: number };
  /**
   * Scene fog (DIA-E3): exp2 with `density` per metre, or height fog when `height` is set (density is then the
   * distance term). `intensity` 0..1 caps the far field at maxOpacity 0.25 + 0.55 i (the engine's legacy cap rule).
   */
  readonly fog: false | {
    readonly color: string;
    readonly density: number;
    readonly intensity: number;
    readonly height?: { readonly density: number; readonly falloff: number; readonly start: number };
  };
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
  readonly turf: {
    readonly grass: string;
    readonly stripe: string;
    readonly clay: string;
    /** Infield roughness when not the 0.96 natural clay (DIA-M2: the Dome's sealed synthetic infield). */
    readonly clayRoughness?: number;
    readonly track: string;
    readonly trackRoughness: number;
    readonly chalk: string;
    /** Normal-map strength of the mown turf and the clay (defaults 0.6 and 0.5); Lunar's grazing sun needs them low. */
    readonly normalScale?: { readonly grass: number; readonly clay: number };
  };
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
    // Blind panel: the 0.32 warm fog read as milky haze; thinner and further out, contrast back up.
    fog: { color: "#d9a57c", density: 0.0014, intensity: 0.14 },
    exposureEv: 0.05,
    background: "#e0a070",
    accent: "#f08a4b",
    post: {
      preset: "cinematic-film",
      toneMapping: "agx",
      exposure: 1.0,
      bloom: { threshold: 0.85, intensity: 0.24 },
      grain: 0.03,
      vignette: 0.2,
      grade: { contrast: 1.16, saturation: 1.1, temperature: 0.22, tint: 0.02 },
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
    hdri: { id: "rooftop_night", intensity: 1.6, rotationDeg: 0, background: true, backgroundIntensity: 2.2 },
    sun: { elevationDeg: 52, azimuthDeg: 150, color: "#9fc2ff", intensity: 2.0, colorTemperatureK: 9000 },
    rim: false,
    fog: { color: "#1c2c44", density: 0.0045, intensity: 0.24 },
    exposureEv: 1.0,
    background: "#0b1422",
    accent: "#4fc3e8",
    post: {
      preset: "neon-night",
      toneMapping: "aces",
      exposure: 2.4,
      bloom: { threshold: 0.65, intensity: 0.42 },
      grain: 0.03,
      vignette: 0.24,
      grade: { contrast: 1.2, saturation: 1.1, temperature: -0.2, tint: 0 },
      lut: "diamond-midtown-blue-hour.cube"
    },
    turf: { grass: "#2f5a36", stripe: "#376640", clay: "#7a4b37", track: "#3a2c26", trackRoughness: 0.28, chalk: "#e6e1d2" },
    crowd: ["#4fc3e8", "#e6e1d2", "#f0b450", "#2d3e66", "#c7476a", "#58b68a", "#8f9bb3"],
    weather: { kind: "drizzle", intensity: 0.22, density: 0.35, color: "#a9c4e4" },
    signature: { splinter: "#cdb48f", flash: "#eaf0f8", flashIntensity: 1.25, gravityScale: 1 },
    landingFx: "diamond-clay-puff",
    celebration: "diamond-hr-firework"
  },
  canyon: {
    park: "canyon",
    postcard: "Canyon Rim at hard desert noon",
    timeOfDay: "high noon, sun 72 degrees",
    baseLook: "outdoor-day",
    hdri: { id: "outdoor-midday", intensity: 1.1, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    // Blind panel: the pale horizon blew the sky out to near white; a deep desert blue down to a dusty horizon.
    sky: { model: "gradient", zenith: "#2f6db4", horizon: "#9dbad6", ground: "#c9b28e" },
    sun: { elevationDeg: 72, azimuthDeg: 20, color: "#fff6e6", intensity: 3.6, colorTemperatureK: 6000 },
    rim: false,
    fog: { color: "#cdb89a", density: 0.0008, intensity: 0.18, height: { density: 0.0015, falloff: 0.06, start: 20 } },
    exposureEv: -0.15,
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
    hdri: { id: "spruit_sunrise", intensity: 0.95, rotationDeg: 0, background: true, backgroundIntensity: 1.6 },
    sun: { elevationDeg: 24, azimuthDeg: 110, color: "#ffd2a1", intensity: 2.3, colorTemperatureK: 3800 },
    rim: { color: "#b9cfe6", intensity: 0.35, elevationDeg: 30, azimuthDeg: 290 },
    fog: { color: "#e6d9c8", density: 0.003, intensity: 0.3 },
    exposureEv: 0.08,
    background: "#e9c7a6",
    accent: "#6fbf6a",
    post: {
      preset: "daylight-outdoor",
      toneMapping: "agx",
      exposure: 1.4,
      bloom: { threshold: 0.85, intensity: 0.2 },
      grain: 0.03,
      vignette: 0.18,
      grade: { contrast: 1.04, saturation: 1.06, temperature: 0.15, tint: -0.03 },
      lut: "diamond-ivy-sunrise.cube"
    },
    // Blind panel: the 24-degree sun raked the clay normals into a camouflage pattern; flatter normals like Lunar.
    turf: { grass: "#3d7a35", stripe: "#468640", clay: "#b4623c", track: "#7c4630", trackRoughness: 0.9, chalk: "#e8e2cf", normalScale: { grass: 0.35, clay: 0.15 } },
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
    exposureEv: 0.3,
    background: "#141820",
    accent: "#8f83f2",
    post: {
      preset: "arena-fight",
      toneMapping: "aces",
      exposure: 1.6,
      bloom: { threshold: 0.65, intensity: 0.36 },
      grain: 0.03,
      vignette: 0.22,
      grade: { contrast: 1.1, saturation: 0.98, temperature: 0.1, tint: 0.02 },
      lut: "diamond-dome-storm.cube"
    },
    turf: { grass: "#2f6a4a", stripe: "#357553", clay: "#5a5f6b", clayRoughness: 0.42, track: "#383c46", trackRoughness: 0.4, chalk: "#e4e3dc" },
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
    hdri: { id: "deep_space_starfield", intensity: 0.6, rotationDeg: 0, background: true, backgroundIntensity: 1 },
    sky: { model: "gradient", zenith: "#010102", horizon: "#020305", ground: "#050607", stars: 1800 },
    sun: { elevationDeg: 18, azimuthDeg: 300, color: "#f4f1ea", intensity: 6.0, colorTemperatureK: 5800 },
    rim: { color: "#6f8fb8", intensity: 1.0, elevationDeg: 35, azimuthDeg: 160 },
    fog: false,
    exposureEv: 1.0,
    background: "#020305",
    accent: "#c3cbd8",
    post: {
      preset: "space",
      toneMapping: "aces",
      exposure: 1.0,
      bloom: { threshold: 0.65, intensity: 0.3 },
      grain: 0.03,
      vignette: 0.2,
      grade: { contrast: 1.08, saturation: 0.82, temperature: -0.12, tint: 0 },
      lut: "diamond-lunar-regolith.cube"
    },
    turf: { grass: "#8e8c87", stripe: "#9a9892", clay: "#aaa79f", track: "#6f6d68", trackRoughness: 0.98, chalk: "#d9d6cc", normalScale: { grass: 0.25, clay: 0.2 } },
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
 * cold spots on the Moon. Day parks have none. Every lamp stands behind the park's own fence. Lamps stay unshadowed: E-B's
 * local casters exist from 4.7.0, but `auditArtDirection` allows one shadowed light for this genre (the key), so the two
 * shadowed Midtown banks wait on the audit handoff (lane report). The low tier keeps four lamps (PRD 6.4: four lights
 * per pixel) and no flares.
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
      rig.push({ name: `skyline-bank-${i}`, kind: "spot", position: [x * 0.92, 24, z * 0.92], target: [x * 0.12, 0, -14 + z * 0.08], color, intensity: 4.0, base: [x, z], angle: 0.62, penumbra: 0.5, distance: 180, cone: true, flare });
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
      rig.push({ name: `lunar-spot-${i}`, kind: "spot", position: [x * 0.9, 18, z * 0.9], target: [0, 0, -12], color: "#cfe2ff", intensity: 3.2, base: [x, z], angle: 0.56, penumbra: 0.35, distance: 190, cone: true, flare: false });
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
  for (const id of Object.keys(PARK_LOOKS) as ParkId[]) {
    for (const p of parkPracticals({ id, fenceCorner: 80 } as ParkSpec, "high")) out.add(p.color);
  }
  return [...out].map((h) => h.toLowerCase());
}

/* ------------------------------------------------------------------ *
 *  Look plan: what main.ts mounts for one park                        *
 * ------------------------------------------------------------------ */

/** Fog spec carried in the E-A `fog.height` override (C-21 `AuraHeightFogSpec` fields). */
export interface DiamondFogSpec {
  readonly mode: "exp2" | "height";
  readonly density: number;
  readonly heightDensity?: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
  readonly start?: number;
  readonly maxOpacity: number;
  /** The sky (HDRI or analytic) keeps its own horizon haze; fog shades geometry only. */
  readonly affectsBackground: false;
}

/** Plain-data mirror of the E-A `AuraLookOverrides` keys this game sets; main.ts hands it to `looks.preset`. */
export interface DiamondLookOverrides {
  readonly sun?: { readonly elevationDeg: number; readonly azimuthDeg: number };
  readonly exposureEv: number;
  readonly fogDensityScale?: number;
  readonly accent?: string;
  /** A colour here means "the HDRI lights but is not drawn" (E-A rule); set only when the analytic sky is the sky. */
  readonly background?: string;
  readonly hdri?: DiamondHdriId;
  readonly environmentIntensity?: number;
  readonly environmentRotationDeg?: number;
  readonly key?: { readonly color: string; readonly intensity: number };
  readonly rim?: false | { readonly color: string; readonly intensity: number; readonly azimuthDeg: number };
  readonly fog?: { readonly color: string; readonly height: DiamondFogSpec };
  readonly grade?: { readonly contrast: number; readonly saturation: number; readonly temperature: number; readonly tint: number };
  readonly post?: { readonly bloom: { readonly threshold: number; readonly intensity: number; readonly color: string } };
}

export type DiamondSkyMode = "analytic" | "hdri";

/** The analytic sky node main.ts mounts (`sky.preetham` / `sky.gradient` options). */
export type DiamondSkyPlan =
  | { readonly model: "preetham"; readonly turbidity: number; readonly rayleigh: number; readonly sun: { readonly elevationDeg: number; readonly azimuthDeg: number } }
  | {
      readonly model: "gradient";
      readonly zenith: string;
      readonly horizon: string;
      readonly ground: string;
      readonly sun?: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly color: string };
      readonly stars?: { readonly count: number; readonly brightness: number };
    };

export interface DiamondLookPlan {
  readonly park: ParkId;
  readonly variant: DiamondLookVariant;
  readonly baseLook: DiamondBaseLook;
  readonly overrides: DiamondLookOverrides;
  /** `scene().background(...)`: a hex, or "look" for the base look's own horizon colour (the 4.6.2 backdrop). */
  readonly clearColor: string;
  /** Analytic sky to mount; null means the HDRI (when the look has one) is the visible sky. */
  readonly sky: DiamondSkyPlan | null;
  /** Drawn-HDRI radiance multiplier; 1 leaves the HDRI node untouched. */
  readonly hdriBackgroundIntensity: number;
  /** `app.setOutput(...)` (C-05 output preset, operator, exposure); null keeps today's output (original look). */
  readonly output: { readonly preset: DiamondPostPreset; readonly toneMapping: DiamondToneMapping; readonly exposure: number } | null;
  /** Authored film grain (overrides the preset's, field by field); null: none (Low tier, original look). */
  readonly grain: number | null;
  readonly vignette: number;
  /** Volumetric god rays (High tier only, PRD 6.2/6.4). */
  readonly godRays: ParkLook["godRays"] | null;
  readonly weather: ParkLook["weather"] | null;
}

const fogMaxOpacity = (intensity: number): number => Math.min(0.92, Math.max(0, 0.25 + 0.55 * intensity));

/**
 * One park's look as mounted (DIA-L1, E1, E2, E3, P1). GU47: the park's HDRI lights it (one 1k file per park); parks with
 * an analytic sky draw that sky and keep the HDRI for light only; fog per park; the broadcast output preset per park.
 * Low tier drops grain and god rays and halves the drizzle, keeping palette, sky and the signature effect (PRD 6.4).
 */
export function lookPlan(parkId: ParkId, variant: DiamondLookVariant, tier: DiamondTier, skyMode: DiamondSkyMode = "analytic"): DiamondLookPlan {
  if (variant === "original") {
    const o = ORIGINAL_LOOKS[parkId];
    return {
      park: parkId,
      variant,
      baseLook: o.baseLook,
      overrides: { fogDensityScale: 0, exposureEv: o.exposureEv },
      clearColor: "look",
      sky: null,
      hdriBackgroundIntensity: 1,
      output: null,
      grain: null,
      vignette: 0.16,
      godRays: null,
      weather: null
    };
  }
  const row = PARK_LOOKS[parkId];
  const rowSky = skyMode === "analytic" ? row.sky : undefined;
  let sky: DiamondSkyPlan | null = null;
  if (rowSky?.model === "preetham") {
    sky = { model: "preetham", turbidity: rowSky.turbidity, rayleigh: rowSky.rayleigh, sun: { elevationDeg: row.sun.elevationDeg, azimuthDeg: row.sun.azimuthDeg } };
  } else if (rowSky?.model === "gradient") {
    sky = {
      model: "gradient",
      zenith: rowSky.zenith,
      horizon: rowSky.horizon,
      ground: rowSky.ground,
      // A sky with stars has no sun disc: a gradient sun above 6 degrees fades the stars (E-G sunfade rule).
      ...(rowSky.stars ? { stars: { count: rowSky.stars, brightness: 1 } } : { sun: { elevationDeg: row.sun.elevationDeg, azimuthDeg: row.sun.azimuthDeg, color: row.sun.color } })
    };
  }
  const fog: DiamondLookOverrides["fog"] = row.fog
    ? {
        color: row.fog.color,
        height: row.fog.height
          ? { mode: "height", density: row.fog.density, heightDensity: row.fog.height.density, heightFalloff: row.fog.height.falloff, heightReference: 0, start: row.fog.height.start, maxOpacity: fogMaxOpacity(row.fog.intensity), affectsBackground: false }
          : { mode: "exp2", density: row.fog.density, maxOpacity: fogMaxOpacity(row.fog.intensity), affectsBackground: false }
      }
    : undefined;
  const overrides: DiamondLookOverrides = {
    sun: { elevationDeg: row.sun.elevationDeg, azimuthDeg: row.sun.azimuthDeg },
    exposureEv: row.exposureEv,
    accent: row.accent,
    ...(sky ? { background: row.background } : {}),
    hdri: row.hdri.id,
    environmentIntensity: row.hdri.intensity,
    ...(row.hdri.rotationDeg !== 0 ? { environmentRotationDeg: row.hdri.rotationDeg } : {}),
    key: { color: row.sun.color, intensity: row.sun.intensity },
    rim: row.rim ? { color: row.rim.color, intensity: row.rim.intensity, azimuthDeg: row.rim.azimuthDeg } : false,
    // No fog row (Lunar, no atmosphere): the base look's fog goes too.
    ...(fog ? { fog } : { fogDensityScale: 0 }),
    grade: { ...row.post.grade },
    post: { bloom: { threshold: row.post.bloom.threshold, intensity: row.post.bloom.intensity, color: "#ffffff" } }
  };
  return {
    park: parkId,
    variant,
    baseLook: row.baseLook,
    overrides,
    clearColor: row.background,
    sky,
    hdriBackgroundIntensity: sky ? 1 : row.hdri.backgroundIntensity,
    output: { preset: row.post.preset, toneMapping: row.post.toneMapping, exposure: row.post.exposure },
    grain: tier === "low" ? null : row.post.grain,
    vignette: row.post.vignette,
    godRays: tier === "high" && row.godRays ? row.godRays : null,
    weather: row.weather ? (tier === "low" ? { ...row.weather, density: row.weather.density * 0.5 } : row.weather) : null
  };
}

/** `?sky=hdri` draws each park's HDRI instead of its analytic sky (QA A/B pair for DIA-E2). */
export function resolveSkyMode(search: string): DiamondSkyMode {
  return new URLSearchParams(search).get("sky") === "hdri" ? "hdri" : "analytic";
}

/** 4.6.2 HUD accent (`--amber` in index.html), kept under `?look=original`. */
export const ORIGINAL_HUD_ACCENT = "#ffb03a";

/** DIA-H1: the HUD accent per park (the park's own accent in GU47, the 4.6.2 amber under `?look=original`). */
export function hudAccent(park: ParkId, variant: DiamondLookVariant): string {
  return variant === "gu47" ? PARK_LOOKS[park].accent : ORIGINAL_HUD_ACCENT;
}
