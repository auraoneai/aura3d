/**
 * PRD-10 §7.1.2 — biome rigs and environment defaults.
 *
 * `BIOME_RIGS` encodes the §6.3 table verbatim: sky (C-21 `AuraSkySpec`),
 * environment source (C-09), sun/key, shadows (C-11), fog (C-21
 * `AuraHeightFogSpec`), post (C-13 preset + overrides). Where the table omits
 * a value (e.g. sun azimuth, interior key intensity), the value is marked
 * "lane default" inline; it is tuned only via §16 visual review.
 *
 * Rules every rig enforces (§6.3):
 * - `ambientPolicy: "ibl-only"` — a biome never relies on a flat ambient.
 * - Shadow strength 1.0 (contrast comes from IBL fill).
 * - Fog colour `"sky"` = derived from the sky horizon at the view azimuth.
 * - Every rig has a Low-tier variant: 1 cascade fewer, half shadow distance,
 *   no volumetric, 128² PMREM (applied by `describeBiome`).
 */
import type { AuraSkySpec, AuraHeightFogSpec } from "../../contracts/atmosphere.js"; // C-21
import type { AuraPostPresetId } from "../../contracts/post.js"; // C-13
import type { AuraColor, AuraAssetRef } from "../index.js";
import type { AuraBiomeId, AuraBiomeRig } from "../../contracts/world.js"; // C-26
import type { AuraTiered, AuraWorldNodeBase, AuraWorldQualityTier } from "./types.js";

export interface AuraBiomeSunSpec {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly intensity: number;
  readonly colorTemperatureK?: number;
  readonly color?: AuraColor;
  readonly castShadow?: boolean;
}

export type AuraBiomeEnvironmentSpec =
  | { readonly source: "sky-capture"; readonly intensity: number; readonly faceSize: AuraTiered<64 | 128 | 256> }
  | { readonly source: "hdri"; readonly hdri: AuraAssetRef<"texture">; readonly intensity: number; readonly rotationDeg: number }
  | { readonly source: "room"; readonly colorTemperatureK: number; readonly intensity: number }
  | { readonly source: "space-bake"; readonly intensity: number };

export interface AuraBiomePostOverrides {
  readonly exposureEv?: number;
  readonly bloomThreshold?: number;
  readonly bloomStrength?: number;
  readonly grade?: "neutral" | "warm" | "cool" | "teal-orange" | "low-contrast";
}

/** Superset of the frozen C-26 `AuraBiomeRig`: every C-26 field keeps its contract type. */
export interface AuraBiomeRigDetail extends AuraBiomeRig {
  readonly sky: AuraSkySpec | null; // C-21
  readonly fog: AuraHeightFogSpec | null; // C-21
  readonly post: AuraPostPresetId; // C-13 (frozen id); EV/bloom/grade in postOverrides
  readonly environment: AuraBiomeEnvironmentSpec["source"];
  readonly environmentSpec: AuraBiomeEnvironmentSpec;
  readonly sunDetail: AuraBiomeSunSpec | null;
  readonly shadows: {
    readonly cascades: AuraTiered<1 | 2 | 3 | 4>;
    readonly maxDistance: AuraTiered<number>;
    readonly strength: number;
    readonly softness: number;
  };
  readonly postOverrides: AuraBiomePostOverrides;
  readonly practicalScale: number; // multiplier for emissive/lights tagged practical
  readonly ambientPolicy: "ibl-only";
}

export interface AuraBiomeOverrides {
  readonly sun?: Partial<AuraBiomeSunSpec>;
  readonly environment?: Partial<AuraBiomeEnvironmentSpec>;
  readonly fog?: Partial<AuraHeightFogSpec> | null;
  readonly post?: AuraBiomePostOverrides & { readonly preset?: AuraPostPresetId };
  readonly practicalScale?: number;
}

export interface AuraBiomeNode extends AuraWorldNodeBase {
  readonly kind: "biome";
  readonly biome: AuraBiomeId;
  readonly scope?: "all" | "environment";
  readonly overrides?: AuraBiomeOverrides;
}

export interface AuraTimeOfDayOptions extends AuraWorldNodeBase {
  readonly hour: number; // 0..24
  readonly mode?: "solar" | "arc"; // default "solar"
  readonly latitudeDeg?: number;
  readonly dayOfYear?: number;
  readonly northOffsetDeg?: number;
  readonly maxElevationDeg?: number; // arc mode
  readonly keyframes?: readonly {
    readonly hour: number;
    readonly biome: AuraBiomeId;
    readonly overrides?: AuraBiomeOverrides;
  }[];
  readonly ibl?: {
    readonly recapture?: boolean;
    readonly thresholdDeg?: number;
    readonly crossfadeSeconds?: number;
  };
  readonly stars?: boolean; // forwarded to C-21 AuraSkySpec.stars
}

export interface AuraTimeOfDayNode extends AuraWorldNodeBase {
  readonly kind: "time-of-day";
  readonly options: AuraTimeOfDayOptions;
}

/** Depth-recursive freeze for the shipped rig data. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const SKY_CAPTURE = (intensity: number, faceSize: AuraTiered<64 | 128 | 256> = { low: 64, medium: 128, high: 128, ultra: 256 }): AuraBiomeEnvironmentSpec => ({
  source: "sky-capture",
  intensity,
  faceSize
});

/**
 * §6.3 rig table. Azimuths and intensities the table does not specify are lane
 * defaults; adjust them only through the §16 visual review.
 */
export const BIOME_RIGS: Readonly<Record<AuraBiomeId, AuraBiomeRigDetail>> = deepFreeze({
  "outdoor-day": {
    id: "outdoor-day",
    sky: { model: "preetham", turbidity: 2.5, sun: { elevationDeg: 48, azimuthDeg: 135, intensity: 3.5 }, clouds: { coverage: 0.35 } },
    environment: "sky-capture",
    environmentSpec: SKY_CAPTURE(1.0), // HDRI `outdoor-day-meadow-2k` optional at admission
    sun: { elevationDeg: 48, azimuthDeg: 135, intensity: 3.5, colorTemperatureK: 5800 },
    sunDetail: { elevationDeg: 48, azimuthDeg: 135, intensity: 3.5, colorTemperatureK: 5800, castShadow: true },
    shadows: { cascades: 3, maxDistance: 120, strength: 1.0, softness: 1 },
    fog: { color: "sky", density: 0.0025, heightFalloff: 0.08 },
    post: "daylight-outdoor",
    postOverrides: { bloomThreshold: 1.2, bloomStrength: 0.04, grade: "neutral" },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "golden-hour": {
    id: "golden-hour",
    sky: { model: "preetham", turbidity: 4, sun: { elevationDeg: 9, azimuthDeg: 250, intensity: 3.0 }, mieDirectionalG: 0.8 },
    environment: "sky-capture", // HDRI candidate (venice_sunset / industrial_sunset_puresky) pending admission
    environmentSpec: SKY_CAPTURE(1.0),
    sun: { elevationDeg: 9, azimuthDeg: 250, intensity: 3.0, colorTemperatureK: 3300 }, // azimuth: lane default
    sunDetail: { elevationDeg: 9, azimuthDeg: 250, intensity: 3.0, colorTemperatureK: 3300, castShadow: true },
    shadows: { cascades: 3, maxDistance: 150, strength: 1.0, softness: 1 },
    fog: { color: "sky", density: 0.004, sunInscatter: 1.0 },
    post: "daylight-outdoor",
    postOverrides: { exposureEv: 0.3, bloomThreshold: 1.0, bloomStrength: 0.06, grade: "warm" },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  overcast: {
    id: "overcast",
    sky: { model: "gradient", zenith: "#9aa6b2", horizon: "#c9cfd4" }, // cloud coverage 0.9 is a C-21 preetham-only field; coverage lands with PRD 07's sky
    environment: "sky-capture",
    environmentSpec: SKY_CAPTURE(1.2),
    sun: { elevationDeg: 60, azimuthDeg: 135, intensity: 1.0, colorTemperatureK: 6500 }, // diffuse sky dominates; elevation/azimuth: lane defaults
    sunDetail: { elevationDeg: 60, azimuthDeg: 135, intensity: 1.0, colorTemperatureK: 6500, castShadow: true },
    shadows: { cascades: 2, maxDistance: 80, strength: 0.85, softness: 2 }, // PCSS radius ×2
    fog: { color: "sky", density: 0.006 },
    post: "daylight-outdoor",
    postOverrides: { exposureEv: 0.2, grade: "low-contrast" },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "night-city": {
    id: "night-city",
    sky: { model: "gradient", zenith: "#03050c", horizon: "#1a1f3a", horizonGlow: 0.6 }, // city glow band
    environment: "sky-capture", // HDRI candidate (Poly Haven night street) pending admission; emissive-card capture also allowed
    environmentSpec: SKY_CAPTURE(0.6, { low: 64, medium: 128, high: 128, ultra: 256 }),
    sun: { elevationDeg: 35, azimuthDeg: 210, intensity: 0.25, colorTemperatureK: 7500 }, // moon; elevation/azimuth: lane defaults
    sunDetail: { elevationDeg: 35, azimuthDeg: 210, intensity: 0.25, colorTemperatureK: 7500, castShadow: true },
    shadows: { cascades: 2, maxDistance: 60, strength: 1.0, softness: 1 }, // + point/spot shadows for ≤4 hero lights (PRD 02)
    fog: { color: "#1a2238", density: 0.012 },
    post: "neon-night",
    postOverrides: { exposureEv: 0.8, bloomThreshold: 0.9, bloomStrength: 0.12, grade: "teal-orange" },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "polar-night": {
    id: "polar-night",
    sky: { model: "gradient", zenith: "#060a16", horizon: "#1b2a44", stars: { enabled: true, auroraBand: true } }, // aurora layer pending Q-07-2 (C-21)
    environment: "sky-capture",
    environmentSpec: SKY_CAPTURE(0.5),
    sun: { elevationDeg: 40, azimuthDeg: 190, intensity: 0.35, colorTemperatureK: 8000 }, // moon; elevation/azimuth: lane defaults
    sunDetail: { elevationDeg: 40, azimuthDeg: 190, intensity: 0.35, colorTemperatureK: 8000, castShadow: true },
    shadows: { cascades: 2, maxDistance: 80, strength: 1.0, softness: 1 },
    fog: { color: "#1b2a44", density: 0.008 },
    post: "neon-night",
    postOverrides: { exposureEv: 0.6, bloomThreshold: 0.9 },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "alpine-snow": {
    id: "alpine-snow",
    sky: { model: "preetham", turbidity: 2, sun: { elevationDeg: 22, azimuthDeg: 200, intensity: 3.2 } }, // azimuth: lane default
    environment: "sky-capture",
    environmentSpec: SKY_CAPTURE(1.1),
    sun: { elevationDeg: 22, azimuthDeg: 200, intensity: 3.2, colorTemperatureK: 6000 },
    sunDetail: { elevationDeg: 22, azimuthDeg: 200, intensity: 3.2, colorTemperatureK: 6000, castShadow: true },
    shadows: { cascades: 3, maxDistance: 150, strength: 1.0, softness: 1 },
    fog: { color: "sky", density: 0.003, heightFalloff: 0.05 },
    post: "daylight-outdoor",
    postOverrides: { exposureEv: -0.2, bloomThreshold: 1.3 }, // snow albedo
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "interior-warm": {
    id: "interior-warm",
    sky: null, // enclosed
    environment: "room",
    environmentSpec: { source: "room", colorTemperatureK: 2900, intensity: 0.8 },
    sun: { elevationDeg: 65, azimuthDeg: 90, intensity: 2.0, colorTemperatureK: 2700 }, // key spot stand-in; intensity: lane default
    sunDetail: { elevationDeg: 65, azimuthDeg: 90, intensity: 2.0, colorTemperatureK: 2700, castShadow: true },
    shadows: { cascades: 1, maxDistance: 30, strength: 1.0, softness: 1 }, // spot/point shadows on key lights (C-11)
    fog: { density: 0.01, heightFalloff: 0.4 }, // haze
    post: "cinematic-film",
    postOverrides: { exposureEv: 0.4, bloomThreshold: 1.0 },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "interior-neutral": {
    id: "interior-neutral",
    sky: null,
    environment: "room",
    environmentSpec: { source: "room", colorTemperatureK: 4500, intensity: 1.0 },
    sun: undefined,
    sunDetail: null, // ceiling grid area/point lights
    shadows: { cascades: 1, maxDistance: 20, strength: 1.0, softness: 1 }, // spot/point shadows on 2 hero lights
    fog: { density: 0 },
    post: "product-studio",
    postOverrides: { exposureEv: 0 },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  "interior-industrial": {
    id: "interior-industrial",
    sky: null,
    environment: "room",
    environmentSpec: { source: "room", colorTemperatureK: 5600, intensity: 1.1 }, // large-window softbox
    sun: { elevationDeg: 35, azimuthDeg: 250, intensity: 2.0, colorTemperatureK: 5600 }, // "window" key through openings; elevation/azimuth: lane defaults
    sunDetail: { elevationDeg: 35, azimuthDeg: 250, intensity: 2.0, colorTemperatureK: 5600, castShadow: true },
    shadows: { cascades: 1, maxDistance: 60, strength: 1.0, softness: 1 },
    fog: { density: 0.015 }, // dust; volumetric via C-21 AuraVolumetricFogSpec when real
    post: "cinematic-film",
    postOverrides: { exposureEv: 0.2, grade: "cool" },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  space: {
    id: "space",
    sky: null, // background = SpaceSkyBake cube
    environment: "space-bake",
    environmentSpec: { source: "space-bake", intensity: 0.35 },
    sun: { elevationDeg: 15, azimuthDeg: 90, intensity: 4.0, colorTemperatureK: 5778 }, // elevation/azimuth: lane defaults
    sunDetail: { elevationDeg: 15, azimuthDeg: 90, intensity: 4.0, colorTemperatureK: 5778, castShadow: true },
    shadows: { cascades: 2, maxDistance: 60, strength: 1.0, softness: 1 }, // hero bodies only
    fog: null,
    post: "space",
    postOverrides: { exposureEv: 0.5, bloomThreshold: 1.0, bloomStrength: 0.08 },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  },
  underwater: {
    id: "underwater",
    sky: { model: "gradient", zenith: "#2a8fb0", horizon: "#0e3548", ground: "#021018" }, // depth-graded: surface -> deep
    environment: "sky-capture",
    environmentSpec: SKY_CAPTURE(0.6, { low: 64, medium: 128, high: 128, ultra: 256 }),
    sun: { elevationDeg: 75, azimuthDeg: 135, intensity: 1.5, colorTemperatureK: 6500 }, // "surface sun" with caustics (§8.7); elevation: lane default
    sunDetail: { elevationDeg: 75, azimuthDeg: 135, intensity: 1.5, colorTemperatureK: 6500, castShadow: true },
    shadows: { cascades: 1, maxDistance: 40, strength: 1.0, softness: 1 },
    fog: { mode: "absorption", color: "#0e3548", density: 0.035, absorption: [0.4, 0.15, 0.1] }, // colour by depth
    post: "underwater",
    postOverrides: { exposureEv: 0.3, bloomThreshold: 1.1 },
    practicalScale: 1.0,
    ambientPolicy: "ibl-only"
  }
});

const TIER_ORDER: readonly AuraWorldQualityTier[] = ["low", "medium", "high", "ultra"];

/** Resolve an `AuraTiered` value against a quality tier (exact, else nearest lower, else lowest defined). */
export function resolveTiered<T>(value: AuraTiered<T>, tier: AuraWorldQualityTier): T {
  if (value === null || typeof value !== "object") return value;
  const v = value as { readonly low?: T; readonly medium?: T; readonly high?: T; readonly ultra?: T };
  const index = TIER_ORDER.indexOf(tier);
  for (let i = index; i >= 0; i -= 1) {
    const candidate = v[TIER_ORDER[i]!];
    if (candidate !== undefined) return candidate;
  }
  for (let i = index + 1; i < TIER_ORDER.length; i += 1) {
    const candidate = v[TIER_ORDER[i]!];
    if (candidate !== undefined) return candidate;
  }
  throw new Error(`BIOME_TIERED_EMPTY:${tier}`);
}

const lowTierCache = new Map<AuraBiomeId, AuraBiomeRigDetail>();

/**
 * Low-tier variant rule (§6.3): 1 cascade fewer, half shadow distance, no
 * volumetric (rigs carry no volumetric fields at this stage), 128² PMREM
 * (sky-capture faceSize resolves to 64 on Low).
 */
function toLowTier(rig: AuraBiomeRigDetail): AuraBiomeRigDetail {
  const cached = lowTierCache.get(rig.id);
  if (cached) return cached;
  const cascades = Math.max(1, resolveTiered(rig.shadows.cascades, "low") - 1) as 1 | 2 | 3;
  const environmentSpec: AuraBiomeEnvironmentSpec =
    rig.environmentSpec.source === "sky-capture"
      ? { ...rig.environmentSpec, faceSize: 64 }
      : rig.environmentSpec;
  const low: AuraBiomeRigDetail = deepFreeze({
    ...rig,
    environmentSpec,
    shadows: {
      cascades,
      maxDistance: resolveTiered(rig.shadows.maxDistance, "low") / 2,
      strength: rig.shadows.strength,
      softness: rig.shadows.softness
    }
  });
  lowTierCache.set(rig.id, low);
  return low;
}

/** Pure, deterministic, frozen — the same object reference every call. */
export function describeBiome(id: AuraBiomeId, tier: AuraWorldQualityTier = "high"): AuraBiomeRigDetail {
  const rig = BIOME_RIGS[id];
  if (!rig) throw new Error(`BIOME_UNKNOWN:${id}`);
  if (tier === "low") return toLowTier(rig);
  return rig;
}

export function listBiomes(): readonly AuraBiomeId[] {
  return Object.keys(BIOME_RIGS) as AuraBiomeId[];
}

// `world.biome(id, overrides)` / `environments.outdoor|room|space|underwater`
// return AuraNodeBuilder<AuraBiomeNode> — they land with the node handlers in
// Phase 2, once PR 0b-1 carves the world node kinds into the AuraSceneNode
// union (index.ts is a shared file; qr-request pending).
