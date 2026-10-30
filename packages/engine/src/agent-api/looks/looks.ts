// PRD-13 T1.2/T1.3 — the `looks` authoring surface (PRD §7.1). `looks.preset`
// returns an `AuraGroupNode` named `aura-look:<id>` whose children are today's
// builders (v0), or an `AuraLookNode` under forced/provided v1 (compiled by the
// C-36 NodeHandler in T1.13). Overrides are clamped per C-34. `appOptions`
// carries the v0 renderer settings so they live in the engine, not in authored
// code. Nothing here is flag-gated itself — the expansion choice consults each
// required slot's `provided`/`flag` (CONTRACTS §5.2 sources 2–4).

import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";
import { environmentProbeFactorySlot } from "@aura3d/rendering/contracts";
import type {
  AuraAssetRef,
  AuraColor,
  AuraCreateAppOptions,
  AuraGroupNode,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraVec3
} from "../index.js";
import { AuraNodeBuilder, defineAuraAssets, effects, environments, lights } from "../index.js";
import type { AuraHdriId, AuraLookDiagnostics, AuraLookId, AuraLookNode, AuraLookOverrides } from "../../contracts/looks.js";
import type { AuraDirectionalShadowOptions } from "../../contracts/lighting.js";
import type { AuraHeightFogSpec } from "../../contracts/atmosphere.js";
import type { AuraPostPresetId } from "../../contracts/post.js";
import { worldQueriesSlot } from "../../contracts/world.js";
import { appExtensionsAll } from "../../contracts/app.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { lookPresets, type AuraLookPreset } from "./lookPresets.js";
import { authoredLookIds } from "./lookLint.js";

export interface AuraLookBuildOptions {
  /** Default "auto": v1 iff every required slot is provided and its flag is on. */
  readonly expansion?: "v0" | "v1" | "auto";
  /** Pass the app's flags when they are set in code (else URL/env resolved). */
  readonly flags?: QrFlags;
}

type MissingContract = AuraLookDiagnostics["missingContracts"][number];
type LookFlag = QrFlagName;

interface LookContractRequirement {
  readonly key: MissingContract;
  readonly flag: LookFlag;
  /** Extra flags the capability also needs on (ANDed with `flag`). */
  readonly alsoFlags?: readonly LookFlag[];
  /** Slot `provided` (or the app-extension equivalent when no slot exists). */
  provided(): boolean;
}

/** A PR 0a app extension is "provided" once a non-prd15 lane registers it. */
function appExtensionProvided(member: "lighting" | "post" | "output" | "quality"): boolean {
  return appExtensionsAll().some((entry) => entry.member === member && entry.owner !== "prd15");
}

/**
 * The five contracts a v1 expansion needs (C-34 missingContracts). Slots exist
 * today only for C-09 and C-26; the other three read the C-38 app-extension
 * registry (a non-prd15 entry = a real provider landed). `stubLookContractRequirements`
 * is the test seam for §7.1's "test doubles for the slots".
 */
const lookContractRequirements: readonly LookContractRequirement[] = [
  {
    key: "environments.preset", // C-09
    flag: "A3D_QR_LIGHTING",
    provided: () => environmentProbeFactorySlot.provided
  },
  {
    key: "lights.hemisphere", // C-10
    flag: "A3D_QR_LIGHTING",
    provided: () => appExtensionProvided("lighting")
  },
  {
    key: "output.preset", // C-13 + C-05
    flag: "A3D_QR_POST",
    alsoFlags: ["A3D_QR_CORE"],
    provided: () => appExtensionProvided("post") && appExtensionProvided("output")
  },
  {
    key: "world.biome", // C-26
    flag: "A3D_QR_WORLD",
    provided: () => worldQueriesSlot.provided
  },
  {
    key: "quality.auto", // C-27
    flag: "A3D_QR_TIERS",
    provided: () => appExtensionProvided("quality")
  }
];

/** Test seam: mark the named contracts provided; returns a restore function. */
export function stubLookContractRequirements(provided: readonly MissingContract[]): () => void {
  const set = new Set(provided);
  const originals = lookContractRequirements.map((req) => req.provided);
  const mutable = lookContractRequirements as unknown as { provided: () => boolean }[];
  lookContractRequirements.forEach((req, index) => {
    mutable[index].provided = () => set.has(req.key);
  });
  return () => {
    lookContractRequirements.forEach((req, index) => {
      mutable[index].provided = originals[index];
    });
  };
}

function resolveFlags(options?: AuraLookBuildOptions): QrFlags {
  if (options?.flags) return options.flags;
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const url = typeof location !== "undefined" ? location.href : undefined;
  return resolveQrFlags({ url, env });
}

/** A3D_QR_LOOKS_EXPANSION=v0|v1|auto (C-34 keeps A3D_LOOK_EXPANSION as alias). */
function expansionOverride(options: AuraLookBuildOptions | undefined, flags: QrFlags): "v0" | "v1" | "auto" {
  if (options?.expansion) return options.expansion;
  const env = typeof process !== "undefined" ? process.env : undefined;
  const raw = env?.A3D_QR_LOOKS_EXPANSION ?? env?.A3D_LOOK_EXPANSION ?? flags.values["A3D_QR_LOOKS_EXPANSION"];
  return raw === "v1" || raw === "v0" ? raw : "auto";
}

export interface ResolvedLookExpansion {
  readonly expansion: "v1-contracts" | "v0-current-engine";
  readonly missingContracts: readonly MissingContract[];
}

export function resolveLookExpansion(options?: AuraLookBuildOptions): ResolvedLookExpansion {
  const flags = resolveFlags(options);
  const mode = expansionOverride(options, flags);
  if (mode === "v0") return { expansion: "v0-current-engine", missingContracts: [] };
  const missing = lookContractRequirements
    .filter(
      (req) =>
        !(req.provided() && flags.on(req.flag) && (req.alsoFlags ?? []).every((flag) => flags.on(flag)))
    )
    .map((req) => req.key);
  if (mode === "v1" || missing.length === 0) {
    return { expansion: "v1-contracts", missingContracts: missing };
  }
  return { expansion: "v0-current-engine", missingContracts: missing };
}

// ---------------------------------------------------------------------------
// Overrides (T1.3): clamped per C-34. sun.azimuthDeg wraps into [0,360),
// elevationDeg clamps to [-90,90], exposureEv to [-2,2], fogDensityScale to
// [0,3]. `accent`/`background` pass through unchanged.
// GU47 E-A keys: environmentIntensity [0,4]; environmentRotationDeg and the
// rim azimuth wrap into [0,360); key/rim intensity [0,20]; fog near/far
// [0,100000]; grade contrast/saturation [0,3], temperature/tint [-1,1]; bloom
// intensity [0,4], threshold [0,64], knee/scatter [0,1], clampLuminance [0,64].
// A non-finite GU47 number is dropped (the preset value stays); an unknown
// HDRI or post preset id throws (LOOK_HDRI_UNKNOWN / LOOK_POST_UNKNOWN).
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** GU47 clamp: undefined for an unset or non-finite value, else clamped into [min, max]. */
const clampFinite = (value: number | undefined, min: number, max: number): number | undefined =>
  value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;

/** Degrees wrapped into [0, 360); non-finite → 0 (the C-34 azimuth rule). */
const wrapDegrees = (value: number): number => {
  const deg = Number.isFinite(value) ? value % 360 : 0;
  return deg < 0 ? deg + 360 : deg;
};

/** Copy without the undefined fields, so clamped overrides carry only what was set. */
function definedFields<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

type LookPostOverride = NonNullable<AuraLookOverrides["post"]>;
type LookBloomOptions = Exclude<Exclude<LookPostOverride, string>["bloom"], false | undefined>;

/** The C-13 post preset ids (`AuraPostPresetId`); `satisfies` keeps the table exhaustive. */
const LOOK_POST_PRESET_IDS = {
  "product-studio": true,
  "daylight-outdoor": true,
  "neon-night": true,
  space: true,
  underwater: true,
  "arena-fight": true,
  "cinematic-film": true
} as const satisfies Record<AuraPostPresetId, true>;

function clampLookBloom(bloom: LookBloomOptions): LookBloomOptions {
  return definedFields({
    intensity: clampFinite(bloom.intensity, 0, 4),
    threshold: clampFinite(bloom.threshold, 0, 64),
    knee: clampFinite(bloom.knee, 0, 1),
    scatter: clampFinite(bloom.scatter, 0, 1),
    color: bloom.color,
    clampLuminance: clampFinite(bloom.clampLuminance, 0, 64)
  });
}

function clampLookPost(post: LookPostOverride): LookPostOverride {
  if (typeof post === "string") {
    if (!Object.prototype.hasOwnProperty.call(LOOK_POST_PRESET_IDS, post)) throw new Error(`LOOK_POST_UNKNOWN:${post}`);
    return post;
  }
  const bloom: false | LookBloomOptions | undefined = post.bloom === false ? false : post.bloom ? clampLookBloom(post.bloom) : undefined;
  return bloom === undefined ? {} : { bloom };
}

export function clampLookOverrides(overrides: AuraLookOverrides | undefined): AuraLookOverrides | undefined {
  if (overrides === undefined) return undefined;
  const out: { -readonly [K in keyof AuraLookOverrides]: AuraLookOverrides[K] } = {};
  if (overrides.sun) {
    const sun: { azimuthDeg?: number; elevationDeg?: number } = {};
    if (overrides.sun.azimuthDeg !== undefined) sun.azimuthDeg = wrapDegrees(overrides.sun.azimuthDeg);
    if (overrides.sun.elevationDeg !== undefined) sun.elevationDeg = clamp(overrides.sun.elevationDeg, -90, 90);
    out.sun = sun;
  }
  if (overrides.exposureEv !== undefined) out.exposureEv = clamp(overrides.exposureEv, -2, 2);
  if (overrides.fogDensityScale !== undefined) out.fogDensityScale = clamp(overrides.fogDensityScale, 0, 3);
  if (overrides.accent !== undefined) out.accent = overrides.accent;
  if (overrides.background !== undefined) out.background = overrides.background;
  // GU47 E-A keys.
  if (overrides.hdri !== undefined) {
    if (typeof overrides.hdri === "string" && !(lookHdriIds as readonly string[]).includes(overrides.hdri)) {
      throw new Error(`LOOK_HDRI_UNKNOWN:${overrides.hdri}`);
    }
    out.hdri = overrides.hdri;
  }
  const environmentIntensity = clampFinite(overrides.environmentIntensity, 0, 4);
  if (environmentIntensity !== undefined) out.environmentIntensity = environmentIntensity;
  if (overrides.environmentRotationDeg !== undefined && Number.isFinite(overrides.environmentRotationDeg)) {
    out.environmentRotationDeg = wrapDegrees(overrides.environmentRotationDeg);
  }
  if (overrides.key) {
    out.key = definedFields({ color: overrides.key.color, intensity: clampFinite(overrides.key.intensity, 0, 20), shadow: overrides.key.shadow });
  }
  if (overrides.rim !== undefined) {
    const rim = overrides.rim;
    out.rim = rim === false
      ? false
      : definedFields({
        color: rim.color,
        intensity: clampFinite(rim.intensity, 0, 20),
        azimuthDeg: rim.azimuthDeg !== undefined && Number.isFinite(rim.azimuthDeg) ? wrapDegrees(rim.azimuthDeg) : undefined
      });
  }
  if (overrides.fog) {
    out.fog = definedFields({
      color: overrides.fog.color,
      near: clampFinite(overrides.fog.near, 0, 100000),
      far: clampFinite(overrides.fog.far, 0, 100000),
      height: overrides.fog.height
    });
  }
  if (overrides.grade) {
    out.grade = definedFields({
      contrast: clampFinite(overrides.grade.contrast, 0, 3),
      saturation: clampFinite(overrides.grade.saturation, 0, 3),
      temperature: clampFinite(overrides.grade.temperature, -1, 1),
      tint: clampFinite(overrides.grade.tint, -1, 1),
      lut: overrides.grade.lut
    });
  }
  if (overrides.post !== undefined) out.post = clampLookPost(overrides.post);
  return out;
}

/** Directional key position from sun angles (same basis as lookPresets). */
function sunPosition(elevationDeg: number, azimuthDeg: number, distance = 24): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [
    Number((distance * Math.cos(el) * Math.sin(az)).toFixed(3)),
    Number((distance * Math.sin(el)).toFixed(3)),
    Number((distance * Math.cos(el) * Math.cos(az)).toFixed(3))
  ];
}

/** Derive the preset's sun angles back from its stored key position. */
function sunAngles(position: readonly [number, number, number]): { elevationDeg: number; azimuthDeg: number } {
  const [x, y, z] = position;
  const distance = Math.hypot(x, y, z) || 1;
  return {
    elevationDeg: (Math.asin(y / distance) * 180) / Math.PI,
    azimuthDeg: (Math.atan2(x, z) * 180) / Math.PI
  };
}

/**
 * Canonical typed refs for the §7.1.1 HDRI corpus files. The scaffold copies
 * `fixtures/environment-corpus/hdri/<file>.hdr` into each template's `public/`
 * and admits it via `aura3d assets add --type texture` under the same id —
 * so the engine can reference it by name at authoring time.
 */
// Built lazily on first use — a module-level `defineAuraAssets` here runs
// during `agent-api/index.ts` import evaluation (via promptRecipes → looks)
// and hits `auraAssetRefBrand`'s TDZ.
type LookHdriAssets = ReturnType<typeof buildLookHdriAssets>;
let lookHdriAssetsCache: LookHdriAssets | undefined;
function buildLookHdriAssets() {
  return defineAuraAssets({
    autumnFieldPuresky1k: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" },
    kloppenheim06Puresky1k: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_06_puresky_1k.hdr" },
    studioSmall081k: { type: "texture", format: "hdr", url: "/hdri/studio_small_08_1k.hdr" },
    // GU47 E-A catalogue: 1k copies of the corpus and library HDRIs
    // (`aura3d assets optimize --hdri 1k`; licences in public/hdri/ATTRIBUTION.md).
    belfastSunsetPuresky1k: { type: "texture", format: "hdr", url: "/hdri/belfast_sunset_puresky_1k.hdr" },
    industrialSunsetPuresky1k: { type: "texture", format: "hdr", url: "/hdri/industrial_sunset_puresky_1k.hdr" },
    spruitSunrise1k: { type: "texture", format: "hdr", url: "/hdri/spruit_sunrise_1k.hdr" },
    veniceSunset1k: { type: "texture", format: "hdr", url: "/hdri/venice_sunset_1k.hdr" },
    rooftopNight1k: { type: "texture", format: "hdr", url: "/hdri/rooftop_night_1k.hdr" },
    cobblestoneStreetNight1k: { type: "texture", format: "hdr", url: "/hdri/cobblestone_street_night_1k.hdr" },
    hangarInterior1k: { type: "texture", format: "hdr", url: "/hdri/hangar_interior_1k.hdr" },
    warmBar1k: { type: "texture", format: "hdr", url: "/hdri/warm_bar_1k.hdr" },
    museumOfHistory1k: { type: "texture", format: "hdr", url: "/hdri/museum_of_history_1k.hdr" },
    kloppenheim021k: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_02_1k.hdr" },
    deepSpaceStarfield1k: { type: "texture", format: "hdr", url: "/hdri/deep_space_starfield_1k.hdr" },
    outdoorMidday1k: { type: "texture", format: "hdr", url: "/hdri/outdoor-midday_1k.hdr" },
    sunsetDramatic1k: { type: "texture", format: "hdr", url: "/hdri/sunset-dramatic_1k.hdr" },
    indoorWorkshop1k: { type: "texture", format: "hdr", url: "/hdri/indoor-workshop_1k.hdr" },
    // A3D_QR_LOOKS only: Poly Haven qwantani_night_puresky (CC0), the
    // aura.library.json `night-2k` entry.
    night2k: { type: "texture", format: "hdr", url: "/hdri/night-2k.hdr" }
  });
}
function lookHdriAssets(): LookHdriAssets {
  return (lookHdriAssetsCache ??= buildLookHdriAssets());
}

const HDRI_ASSET = {
  get autumn_field_puresky_1k() { return lookHdriAssets().autumnFieldPuresky1k; },
  get kloppenheim_06_puresky_1k() { return lookHdriAssets().kloppenheim06Puresky1k; },
  get studio_small_08_1k() { return lookHdriAssets().studioSmall081k; },
  get belfast_sunset_puresky_1k() { return lookHdriAssets().belfastSunsetPuresky1k; },
  get industrial_sunset_puresky_1k() { return lookHdriAssets().industrialSunsetPuresky1k; },
  get spruit_sunrise_1k() { return lookHdriAssets().spruitSunrise1k; },
  get venice_sunset_1k() { return lookHdriAssets().veniceSunset1k; },
  get rooftop_night_1k() { return lookHdriAssets().rooftopNight1k; },
  get cobblestone_street_night_1k() { return lookHdriAssets().cobblestoneStreetNight1k; },
  get hangar_interior_1k() { return lookHdriAssets().hangarInterior1k; },
  get warm_bar_1k() { return lookHdriAssets().warmBar1k; },
  get museum_of_history_1k() { return lookHdriAssets().museumOfHistory1k; },
  get kloppenheim_02_1k() { return lookHdriAssets().kloppenheim021k; },
  get deep_space_starfield_1k() { return lookHdriAssets().deepSpaceStarfield1k; },
  get "outdoor-midday_1k"() { return lookHdriAssets().outdoorMidday1k; },
  get "sunset-dramatic_1k"() { return lookHdriAssets().sunsetDramatic1k; },
  get "indoor-workshop_1k"() { return lookHdriAssets().indoorWorkshop1k; },
  get "night-2k"() { return lookHdriAssets().night2k; }
} as const;

/**
 * GU47 E-A: every `AuraHdriId`, in catalogue order. Each ships as `public/hdri/<id>_1k.hdr` (served at
 * `/hdri/<id>_1k.hdr`); the `satisfies` table keeps this list and the union in step.
 */
const LOOK_HDRI_ID_TABLE = {
  autumn_field_puresky: true,
  kloppenheim_06_puresky: true,
  studio_small_08: true,
  belfast_sunset_puresky: true,
  industrial_sunset_puresky: true,
  spruit_sunrise: true,
  venice_sunset: true,
  rooftop_night: true,
  cobblestone_street_night: true,
  hangar_interior: true,
  warm_bar: true,
  museum_of_history: true,
  kloppenheim_02: true,
  deep_space_starfield: true,
  "outdoor-midday": true,
  "sunset-dramatic": true,
  "indoor-workshop": true
} as const satisfies Record<AuraHdriId, true>;
export const lookHdriIds = Object.keys(LOOK_HDRI_ID_TABLE) as readonly AuraHdriId[];
export type { AuraHdriId } from "../../contracts/looks.js";

/** The served URL of a catalogue HDRI (`/hdri/<id>_1k.hdr`). */
export function lookHdriUrl(id: AuraHdriId): string {
  return `/hdri/${id}_1k.hdr`;
}

/** The look's HDRI texture for an override: a catalogue id resolves to its typed 1k ref; a ref passes through. */
function resolveLookHdri(hdri: AuraHdriId | AuraAssetRef<"texture">): { readonly texture: AuraAssetRef<"texture">; readonly label: string } {
  if (typeof hdri === "string") return { texture: HDRI_ASSET[`${hdri}_1k`], label: `${hdri}_1k` };
  return { texture: hdri, label: hdri.id };
}

/**
 * A3D_QR_LOOKS (flag on) upgrades to the v0 expansion. Flag off keeps the
 * frozen §7.1.1 v0 values byte-identical (13-S9 flag-off identity).
 * The §7.1 dark looks had no HDRI at all, so with the flag on they had no IBL
 * (look/no-ibl) and dielectrics/metals showed no specular. They now get a
 * real night-sky HDRI at a low intensity. `background: false` keeps the
 * authored dark backdrop where a starry sky would be wrong (an indoor arcade).
 * space and underwater stay without an HDRI: the corpus has no admitted
 * licensed deep-space or underwater probe, and a sky probe would light them
 * wrongly.
 */
interface LookQrUpgrade {
  readonly hdri: keyof typeof HDRI_ASSET;
  readonly environmentIntensity: number;
  readonly background: boolean;
}
// Measured on gpu-l4 (qr-prd13-looks-capture 38148101893): the night-2k
// upgrade made night-city (cinematic-scene) and neon-arcade
// (three-compat-postprocess-scene) darker with fewer highlights (mean 14.5 ->
// 7.2, p99 205 -> 171, detail 7.6 -> 5.5), i.e. worse than the engine-default
// environment they fell back to. Withdrawn until a probe beats flag-off; the
// table and plumbing stay for the next measured candidate.
const LOOK_QR_UPGRADES: Partial<Record<AuraLookId, LookQrUpgrade>> = {};

/** HDRI files a look references (flag-aware); template scaffolds copy these. */
export function lookHdriFiles(id: AuraLookId, flags: QrFlags = resolveFlags()): readonly string[] {
  const upgrade = flags.on("A3D_QR_LOOKS") ? LOOK_QR_UPGRADES[id] : undefined;
  const hdri = upgrade?.hdri ?? describeOrThrow(id).v0.hdri;
  return hdri === null ? [] : [`${hdri}.hdr`];
}

type LookV0 = AuraLookPreset["v0"];
type LookKeyShadow = true | AuraDirectionalShadowOptions;

/**
 * A look's v0 rig after overrides: the preset's §7.1.1 values with every C-34 and GU47 E-A override folded in, which is
 * exactly what `v0Children` emits. An unset override leaves the preset's value, and so the emitted node, unchanged.
 */
interface LookRig {
  /** The HDRI the look emits (null: its procedural fill, or nothing). `background` undefined = the builder default (drawn). */
  readonly hdri: { readonly texture: AuraAssetRef<"texture">; readonly label: string; readonly background?: boolean } | null;
  readonly environmentIntensity: number;
  /** Radians about +Y (environmentRotationDeg); undefined = unrotated. */
  readonly environmentRotation?: number;
  readonly fill?: LookV0["fill"];
  readonly key: { readonly position: AuraVec3; readonly intensity: number; readonly color: AuraColor; readonly shadow: LookKeyShadow };
  readonly rim?: { readonly position: AuraVec3; readonly intensity: number; readonly color: AuraColor };
  /**
   * near/far are the look range (the density is 24/far, scaled by fogDensityScale). `range` is set when the fog
   * override authored near/far (they then ride on the node for the C-21 linear mode); `height` makes it a C-21 height fog.
   */
  readonly fog?: { readonly color: AuraColor; readonly near: number; readonly far: number; readonly range: boolean; readonly height?: AuraHeightFogSpec };
  readonly background: AuraColor;
  readonly effects: LookV0["effects"];
  /** temperature/tint/lut are emitted only when defined (the v2 grade reads them, E-C). */
  readonly grade: { readonly contrast: number; readonly saturation: number; readonly temperature?: number; readonly tint?: number; readonly lut?: AuraAssetRef<"lut"> };
  /** undefined: the look's default bloom node; false: none; options: a retuned bloom node. */
  readonly bloom?: false | LookBloomOptions;
  /** The `output.preset` child (C-13 id); undefined: no child. */
  readonly outputPreset?: AuraPostPresetId;
}

/** Elevation of a rim a look override adds when the preset has none (the character-showcase rim). */
const ADDED_RIM_ELEVATION_DEG = 35;
const ADDED_RIM_INTENSITY = 1.4;
/** Range of a fog a look override adds when the preset has none: 24/200 = the engine fog's own 0.12 density. */
const ADDED_FOG_FAR = 200;

function overrideEnvironment(
  preset: AuraLookPreset,
  overrides: AuraLookOverrides | undefined,
  flags: QrFlags
): Pick<LookRig, "hdri" | "environmentIntensity"> {
  const v0 = preset.v0;
  const intensity = overrides?.environmentIntensity;
  if (overrides?.hdri !== undefined) {
    // A no-HDRI look declares environmentIntensity 0 (a fill lights it); an HDRI it gains starts at 1.
    return { hdri: resolveLookHdri(overrides.hdri), environmentIntensity: intensity ?? (v0.hdri === null ? 1 : v0.environmentIntensity) };
  }
  const upgrade = flags.on("A3D_QR_LOOKS") ? LOOK_QR_UPGRADES[preset.id] : undefined;
  if (upgrade !== undefined) {
    return {
      hdri: { texture: HDRI_ASSET[upgrade.hdri], label: upgrade.hdri, background: upgrade.background },
      environmentIntensity: intensity ?? upgrade.environmentIntensity
    };
  }
  return {
    hdri: v0.hdri === null ? null : { texture: HDRI_ASSET[v0.hdri], label: v0.hdri },
    environmentIntensity: intensity ?? v0.environmentIntensity
  };
}

function overrideRim(preset: AuraLookPreset, overrides: AuraLookOverrides | undefined, key: LookRig["key"]): LookRig["rim"] {
  const base = preset.v0.rim;
  const rim = overrides?.rim;
  if (rim === false) return undefined;
  const accent = overrides?.accent;
  if (rim === undefined) return base ? { ...base, color: accent ?? base.color } : undefined;
  if (base) {
    const angles = sunAngles(base.position);
    return {
      position: rim.azimuthDeg !== undefined ? sunPosition(angles.elevationDeg, rim.azimuthDeg) : base.position,
      intensity: rim.intensity ?? base.intensity,
      color: rim.color ?? accent ?? base.color
    };
  }
  // A rim on a look without one: opposite the key unless an azimuth is given, in the look's accent colour.
  const keyAzimuth = sunAngles(key.position).azimuthDeg;
  return {
    position: sunPosition(ADDED_RIM_ELEVATION_DEG, rim.azimuthDeg ?? wrapDegrees(keyAzimuth + 180)),
    intensity: rim.intensity ?? ADDED_RIM_INTENSITY,
    color: rim.color ?? accent ?? preset.palette.accent
  };
}

function overrideFog(preset: AuraLookPreset, overrides: AuraLookOverrides | undefined, background: AuraColor): LookRig["fog"] {
  const base = preset.v0.fog;
  const fog = overrides?.fog;
  if (base === undefined && fog === undefined) return undefined;
  let near = fog?.near ?? base?.near ?? 0;
  let far = Math.max(near, fog?.far ?? base?.far ?? ADDED_FOG_FAR);
  if (overrides?.fogDensityScale !== undefined) {
    // near/far stored in the preset: density scales inversely with range.
    const scale = Math.max(overrides.fogDensityScale, 1e-3);
    near /= scale;
    far /= scale;
  }
  return {
    color: fog?.color ?? base?.color ?? background,
    near,
    far,
    range: fog?.near !== undefined || fog?.far !== undefined,
    ...(fog?.height !== undefined ? { height: fog.height } : {})
  };
}

function applyOverrides(preset: AuraLookPreset, overrides: AuraLookOverrides | undefined, flags: QrFlags): LookRig {
  const v0 = preset.v0;
  let keyPosition = v0.key.position;
  if (overrides?.sun) {
    const base = sunAngles(v0.key.position);
    keyPosition = sunPosition(overrides.sun.elevationDeg ?? base.elevationDeg, overrides.sun.azimuthDeg ?? base.azimuthDeg);
  }
  const key: LookRig["key"] = {
    position: keyPosition,
    intensity: overrides?.key?.intensity ?? v0.key.intensity,
    color: overrides?.key?.color ?? v0.key.color,
    shadow: overrides?.key?.shadow ?? true
  };
  const colourBackground = overrides?.background !== undefined && overrides.background !== "look" ? overrides.background : undefined;
  const background = colourBackground ?? v0.background;
  const post = overrides?.post;
  const grade = overrides?.grade;
  const environment = overrideEnvironment(preset, overrides, flags);
  const tint = grade?.tint ?? v0.grade.tint;
  return {
    ...environment,
    // GU47 E-A: a colour background replaces the look's sky, so the look HDRI lights the scene without being drawn
    // behind it (the FC studio-HDRI-as-sky defect).
    ...(colourBackground !== undefined && environment.hdri !== null ? { hdri: { ...environment.hdri, background: false } } : {}),
    ...(overrides?.environmentRotationDeg !== undefined ? { environmentRotation: (overrides.environmentRotationDeg * Math.PI) / 180 } : {}),
    ...(v0.fill !== undefined ? { fill: v0.fill } : {}),
    key,
    rim: overrideRim(preset, overrides, key),
    fog: overrideFog(preset, overrides, background),
    background,
    effects: v0.effects,
    grade: {
      contrast: grade?.contrast ?? v0.grade.contrast,
      saturation: grade?.saturation ?? v0.grade.saturation,
      // GU47 E-A: the preset's declared white balance is emitted (it reaches pixels through E-C's v2 grade writer).
      temperature: grade?.temperature ?? v0.grade.temperature,
      ...(tint !== undefined ? { tint } : {}),
      ...(grade?.lut !== undefined ? { lut: grade.lut } : {})
    },
    ...(post !== undefined && typeof post !== "string" && post.bloom !== undefined ? { bloom: post.bloom } : {}),
    // GU47 E-A: the preset's declared post preset rides as the `output.preset` child; a `post` id override replaces it.
    outputPreset: typeof post === "string" ? post : preset.post
  };
}

/** Append authored keys a builder does not copy (the v2 bridge reads only `postAuthored` fields). */
function withAuthoredFields<T extends AuraSceneNode>(node: T, fields: Readonly<Record<string, unknown>>): T {
  const defined = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (defined.length === 0) return node;
  const authored = (node as { postAuthored?: readonly string[] }).postAuthored ?? [];
  return {
    ...node,
    ...Object.fromEntries(defined),
    postAuthored: [...authored, ...defined.map(([field]) => field).filter((field) => !authored.includes(field))]
  } as T;
}

/**
 * GU47 E-A: the look's post preset as an `output.preset` child. An empty group, so no compile path draws or drops it;
 * the post pipeline reads it through `lookOutputPreset` when the app authors no `output.preset` (E-C applies it).
 */
function lookOutputPresetNode(preset: AuraPostPresetId): AuraSceneNode {
  return { kind: "group", name: "look output preset", children: [], output: { preset }, lookOutput: true } as AuraGroupNode;
}

/** Flat v0 children for a preset (the group's contents, and `looks.nodes`). */
function v0Children(preset: AuraLookPreset, overrides: AuraLookOverrides | undefined, flags: QrFlags): AuraSceneNode[] {
  const rig = applyOverrides(preset, overrides, flags);
  const children: AuraSceneNode[] = [];
  if (rig.hdri !== null) {
    children.push(
      environments.hdri({
        name: `look hdri ${rig.hdri.label}`,
        intensity: rig.environmentIntensity,
        texture: rig.hdri.texture,
        ...(rig.environmentRotation !== undefined ? { rotation: rig.environmentRotation } : {}),
        ...(rig.hdri.background !== undefined ? { background: rig.hdri.background } : {})
      }).toJSON()
    );
  } else if (rig.fill !== undefined) {
    // No HDRI: a faint procedural fill, so the look is not lit by its key light alone.
    const fill = rig.fill.preset === "night" ? environments.nightCinematic : rig.fill.preset === "neutral" ? environments.neutral : environments.studio;
    const intensity = overrides?.environmentIntensity ?? rig.fill.intensity;
    // `lookFill` lets the scene drop the fill when it authors an ambient light (lookFill.ts).
    children.push({ ...fill({ name: `look fill ${rig.fill.preset}`, intensity }).toJSON(), lookFill: true } as AuraSceneNode);
  }
  children.push(
    lights.directional({
      name: "look key light",
      position: rig.key.position,
      intensity: rig.key.intensity,
      color: rig.key.color,
      shadow: rig.key.shadow
    }).toJSON()
  );
  if (rig.rim) {
    children.push(
      lights.directional({
        name: "look rim light",
        position: rig.rim.position,
        intensity: rig.rim.intensity,
        color: rig.rim.color
      }).toJSON()
    );
  }
  if (rig.fog && (overrides?.fogDensityScale ?? 1) > 0) {
    const height = rig.fog.height;
    const fog: Record<string, unknown> = {
      name: "look fog",
      // C-21 height-fog fields ride on the node (compiler/fog.ts resolves them under A3D_QR_VFX_FOG).
      ...(height !== undefined ? { ...height, mode: height.mode ?? "height" } : {}),
      color: rig.fog.color,
      // Base density derived from the preset range; fogDensityScale applies on top.
      density: height?.density ?? 24 / Math.max(rig.fog.far, 1),
      ...(rig.fog.range ? { near: rig.fog.near, far: rig.fog.far } : {})
    };
    // The C-21 `mode` names differ from AuraEffectNode's anti-alias `mode`; effects.fog copies every field as data.
    children.push(effects.fog(fog as Parameters<typeof effects.fog>[0]).toJSON());
  }
  if (rig.effects.includes("colorGrade")) {
    // `lookGrade` lets an authored grade next to the look take precedence field by field (lookGrade.ts).
    const grade = effects.colorGrade({
      name: "look color grade",
      contrast: rig.grade.contrast,
      saturation: rig.grade.saturation,
      exposure: Math.pow(2, overrides?.exposureEv ?? 0)
    }).toJSON();
    children.push({
      // temperature/tint/lut: GU47(E-C) the v2 grade writer reads them; effects.colorGrade does not copy them yet.
      ...withAuthoredFields(grade, { temperature: rig.grade.temperature, tint: rig.grade.tint, lut: rig.grade.lut }),
      lookGrade: true
    } as AuraSceneNode);
  }
  if (rig.effects.includes("ambientOcclusion")) {
    children.push(effects.ambientOcclusion({ name: "look ambient occlusion" }).toJSON());
  }
  if (rig.effects.includes("bloom") && rig.bloom !== false) {
    const bloom = rig.bloom;
    const color = bloom?.color ?? overrides?.accent;
    const node = effects.bloom({
      name: "look bloom",
      ...(color ? { color } : {}),
      ...(bloom?.intensity !== undefined ? { intensity: bloom.intensity } : {}),
      ...(bloom?.threshold !== undefined ? { threshold: bloom.threshold } : {}),
      ...(bloom?.scatter !== undefined ? { scatter: bloom.scatter } : {})
    }).toJSON();
    // knee/clampLuminance are v2 bloom fields effects.bloom does not copy (GU47(E-C)).
    children.push(withAuthoredFields(node, { knee: bloom?.knee, clampLuminance: bloom?.clampLuminance }));
  }
  if (rig.outputPreset !== undefined) children.push(lookOutputPresetNode(rig.outputPreset));
  // "antiAlias-msaa" is a renderer setting, not a node — it flows through
  // looks.appOptions().renderer, never as an authored fxaa node.
  return children;
}

function describeOrThrow(id: AuraLookId): AuraLookPreset {
  const preset = lookPresets[id];
  if (preset === undefined) throw new Error(`LOOK_UNKNOWN:${id}`);
  return preset;
}

/** Flat v0 children for a look id (same list the `aura-look:<id>` group
 *  carries). The C-36 `look` NodeHandler emits these when it falls back
 *  (T1.13); exported for it, not part of the authoring surface. */
export function expandLookChildren(
  id: AuraLookId,
  overrides?: AuraLookOverrides,
  flags: QrFlags = resolveFlags()
): readonly AuraSceneNode[] {
  return v0Children(describeOrThrow(id), clampLookOverrides(overrides), flags);
}

/**
 * GU47 E-A: the post preset the last look in `nodes` declares through its `output.preset` child (v0 `aura-look:<id>`
 * groups at any depth and v1 `look` nodes), or undefined. GU47(E-C): the post pipeline applies it when the app authors
 * no `output.preset`.
 */
export function lookOutputPreset(nodes: readonly AuraSceneNode[]): AuraPostPresetId | undefined {
  let found: AuraPostPresetId | undefined;
  const visit = (list: readonly AuraSceneNode[]): void => {
    for (const node of list) {
      const raw = node as unknown as {
        readonly kind?: string;
        readonly look?: AuraLookId;
        readonly overrides?: AuraLookOverrides;
        readonly children?: readonly AuraSceneNode[];
        readonly output?: { readonly preset?: AuraPostPresetId };
        readonly lookOutput?: boolean;
      };
      if (raw.kind === "look" && typeof raw.look === "string" && Object.prototype.hasOwnProperty.call(lookPresets, raw.look)) {
        // Same rule as the v0 child (a valid `post` id override, else the preset's post), without expanding the look.
        const post = raw.overrides?.post;
        found = typeof post === "string" && Object.prototype.hasOwnProperty.call(LOOK_POST_PRESET_IDS, post) ? post : lookPresets[raw.look].post;
      } else if (raw.kind === "group") {
        if (raw.lookOutput === true && raw.output?.preset !== undefined) found = raw.output.preset;
        visit(raw.children ?? []);
      }
    }
  };
  visit(nodes);
  return found;
}

function presetImpl(
  id: AuraLookId,
  overrides?: AuraLookOverrides,
  options?: AuraLookBuildOptions
): AuraNodeBuilder<AuraGroupNode> | AuraLookNode {
  const preset = describeOrThrow(id);
  const clamped = clampLookOverrides(overrides);
  const expansion = resolveLookExpansion(options);
  if (expansion.expansion === "v1-contracts") {
    return { kind: "look", look: id, ...(clamped ? { overrides: clamped } : {}) };
  }
  return new AuraNodeBuilder<AuraGroupNode>({
    kind: "group",
    name: `aura-look:${id}`,
    // The look's horizon-matched background rides on the group so consumers
    // (the C-36 handler, diagnostics, lint, template authors via
    // `looks.describe(id).v0.background`) read it without re-deriving.
    background:
      clamped?.background !== undefined && clamped.background !== "look"
        ? clamped.background
        : preset.v0.background,
    children: v0Children(preset, clamped, resolveFlags(options))
  } as AuraGroupNode);
}

export const looks = {
  /**
   * v0 → AuraGroupNode "aura-look:<id>" with today's env/light/effect children
   * (the documented, flag-off shape — `scene().add(looks.preset(id))`).
   * v1 → the AuraLookNode the C-36 NodeHandler compiles (T1.13). v1 needs every
   * required contract provided and its flag on; forced v1 emits the node even
   * when slots are stubbed (the handler then records `capability-degraded`).
   * Callers that pass `options` get the union type (v1 emission is opt-in).
   */
  preset: presetImpl as {
    (id: AuraLookId, overrides?: AuraLookOverrides): AuraNodeBuilder<AuraGroupNode>;
    (
      id: AuraLookId,
      overrides: AuraLookOverrides | undefined,
      options: AuraLookBuildOptions
    ): AuraNodeBuilder<AuraGroupNode> | AuraLookNode;
  },

  /** Flat v0 children (same list the group carries). */
  nodes(id: AuraLookId, overrides?: AuraLookOverrides): readonly AuraNodeBuilder<AuraSceneNode>[] {
    const preset = describeOrThrow(id);
    return v0Children(preset, clampLookOverrides(overrides), resolveFlags()).map((node) => new AuraNodeBuilder(node));
  },

  /** v0 only: renderer quality + DPR cap live here, not in authored code.
   *  Returns {} when the expansion resolves to v1 (C-27 takes over, §7.1). */
  appOptions(id: AuraLookId, options?: AuraLookBuildOptions): Pick<AuraCreateAppOptions, "pixelRatio" | "renderer"> {
    describeOrThrow(id);
    if (resolveLookExpansion(options).expansion === "v1-contracts") return {};
    const dpr = typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
    return {
      renderer: { qualityProfile: "production" },
      pixelRatio: Math.min(dpr, 2)
    };
  },

  list(): readonly AuraLookId[] {
    return Object.keys(lookPresets) as AuraLookId[];
  },

  describe(id: AuraLookId): AuraLookPreset {
    return describeOrThrow(id);
  },

  /**
   * Which look a snapshot actually carries (§7.1 source labels). Authored
   * nodes win; `biome-default`/`neutral-env` are runtime-applied states the
   * C-31 assembly reports — until then the source is `none` and the id
   * `"engine-default"`. T1.3: a second authored look makes the last one win.
   */
  resolveDefault(snapshot: AuraSceneSnapshot): {
    readonly id: AuraLookId | "engine-default";
    readonly source: "authored" | "biome-default" | "neutral-env" | "none";
  } {
    const ids = authoredLookIds(snapshot);
    if (ids.length > 0) return { id: ids[ids.length - 1], source: "authored" };
    return { id: "engine-default", source: "none" };
  }
} as const;

export type LooksApi = typeof looks;
