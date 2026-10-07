/**
 * C-35 (PRD 14, CONTRACTS.md §3.8) — art direction types and the build-time
 * validator. Every violation is fatal; `defineArtDirection` collects them all
 * and throws one `AuraArtDirectionError` listing each.
 */

import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { GameGenre, RebuildTier } from "@aura3d/engine-runtime/contracts";

export type { GameGenre, RebuildTier };

/**
 * Mirrors C-32 `GAME_VISUAL_CATEGORIES` in tools/quality-gate/src/contracts.ts
 * (PRD 12, internal). T1.2 asserts the two lists are identical, in order.
 */
export const GAME_VISUAL_CATEGORY_LIST = [
  "environment_world",
  "modeling_assets",
  "texture_quality",
  "material_quality",
  "pbr_credibility",
  "lighting",
  "shadows",
  "ambient_lighting",
  "ibl_reflections",
  "tone_mapping",
  "color_management",
  "anti_aliasing",
  "postprocessing",
  "vfx",
  "particles",
  "animation_quality",
  "character_presentation",
  "camera",
  "composition",
  "scale_depth_perception",
  "atmospheric_effects",
  "gameplay_readability",
  "ui_hud",
  "typography",
  "polish_juice",
  "mobile_presentation",
  "overall_visual_quality"
] as const;

export type GameVisualCategory = (typeof GAME_VISUAL_CATEGORY_LIST)[number];

export const GAME_GENRES = [
  "fighting", "falling-blocks", "platformer", "racing", "golf-physics", "lander", "twin-stick",
  "orbital-puzzle", "vehicle-delivery", "rhythm-runner", "mech-fighting", "pinball", "basketball",
  "stealth", "underwater-salvage", "flight", "billiards", "arena-shooter"
] as const;

export const REBUILD_TIERS = ["S-presentation", "S-world", "F"] as const;

export type AssetRole = "hero" | "character" | "vehicle" | "enemy" | "world" | "prop" | "set-dressing" | "backdrop";

const ROLES_REQUIRING_TRIANGLE_FLOOR: readonly AssetRole[] = ["hero", "character", "vehicle", "enemy"];
const TEXTURE_SETS = ["BC", "BC+N", "BC+N+ORM", "BC+N+ORM+E"] as const;
const KITS = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9"] as const;
const RIGS = ["chase", "flight", "follow2d", "fighting", "shoulder", "orbit", "topDown", "altitude", "rail", "static"] as const;
const QUALITY_TIERS: readonly AuraQualityTier[] = ["low", "medium", "high", "ultra"];
const TEXTURE_SIZES = [512, 1024, 2048, 4096] as const;
const STANDIN_REQUEST = /^R-14-\d{2}$/;

export interface ArtReference {
  readonly file: string;
  readonly source: string;
  readonly licence: string;
  readonly why: string;
}

export interface ArtAssetRole {
  readonly role: AssetRole;
  readonly assetKey: string;
  readonly kit?: (typeof KITS)[number];
  readonly maxTriangles: number;
  readonly minTriangles?: number;
  readonly textureSet: (typeof TEXTURE_SETS)[number];
  readonly maxTextureSize: (typeof TEXTURE_SIZES)[number];
  readonly targetTexelDensity?: number;
  readonly animated?: { readonly clips: readonly string[] };
}

export interface ArtLightingDesign {
  readonly key: { readonly type: "directional" | "spot" | "rect"; readonly colorTemperatureK: number; readonly shadow: true };
  readonly fill: "ibl" | "ibl+bounce";
  readonly practicals: number;
  readonly environment: { readonly hdri?: string; readonly preset?: string; readonly background: "hdri" | "sky" | "enclosed" };
  readonly exposureEV: number;
}

export interface ArtFraming {
  readonly rig: (typeof RIGS)[number];
  readonly subjectHeightFraction: readonly [min: number, max: number];
  readonly fovDeg: readonly [min: number, max: number];
  readonly mobile: "landscape" | "portrait" | "both";
}

export interface GameArtDirection {
  readonly id: string;
  readonly genre: GameGenre;
  readonly fantasy: string;
  readonly rebuildTier: RebuildTier;
  readonly wave: 0 | 1 | 2 | 3 | 4;
  readonly references: readonly ArtReference[];
  readonly palette: { readonly primary: readonly string[]; readonly accent: string; readonly reservedObjective?: string };
  readonly lighting: ArtLightingDesign;
  readonly framing: ArtFraming;
  readonly assets: readonly ArtAssetRole[];
  readonly vfx: readonly { readonly event: string; readonly kind: string; readonly flipbook?: string }[];
  readonly audio: readonly { readonly event: string; readonly cue: string; readonly variants: number }[];
  readonly signatureEffect: string;
  readonly standIns?: readonly { readonly feature: string; readonly file: string; readonly request: string; readonly removeWhen: string }[];
  readonly criticalCategories: readonly GameVisualCategory[];
  readonly tiers: Readonly<Record<AuraQualityTier, { readonly particles: number; readonly shadowMap: number; readonly cascades: number; readonly textureMax: 1024 | 2048 | 4096 }>>;
}

/** Thrown by `defineArtDirection`; carries every violation found. */
export class AuraArtDirectionError extends Error {
  readonly violations: readonly string[];
  constructor(violations: readonly string[]) {
    super(`Art direction rejected (${violations.length} violation${violations.length === 1 ? "" : "s"}):\n${violations.map((v) => `- ${v}`).join("\n")}`);
    this.name = "AuraArtDirectionError";
    this.violations = violations;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * Validates an art direction at build time. Returns the direction unchanged on
 * success; throws `AuraArtDirectionError` listing every violation otherwise.
 * Fatal rules (PRD 14 §7.1): ≥ 3 references; `fill !== "ambient"`; the key is
 * shadowed and practicals ≤ 6; every hero/character/vehicle/enemy role sets
 * `minTriangles` (≥ 2,000 except billiards) and a texture set other than `BC`;
 * `standIns[].request` matches `R-14-NN`. Scene-level rules (ambient light,
 * shadowed-light count, unlit cards) are enforced by `auditArtDirection`.
 */
export function defineArtDirection(direction: GameArtDirection): GameArtDirection {
  const violations: string[] = [];
  const fail = (message: string): void => { violations.push(message); };

  if (typeof direction.id !== "string" || direction.id.length === 0) fail("id must be a non-empty route id");
  if (!(GAME_GENRES as readonly string[]).includes(direction.genre)) fail(`genre "${String(direction.genre)}" is not a GameGenre`);
  if (!(REBUILD_TIERS as readonly string[]).includes(direction.rebuildTier)) fail(`rebuildTier "${String(direction.rebuildTier)}" is invalid`);
  if (!Number.isInteger(direction.wave) || direction.wave < 0 || direction.wave > 4) fail(`wave must be an integer 0–4, got ${String(direction.wave)}`);
  if (typeof direction.fantasy !== "string" || direction.fantasy.length === 0 || direction.fantasy.length > 140) {
    fail(`fantasy must be one sentence of 1–140 chars, got ${typeof direction.fantasy === "string" ? direction.fantasy.length : "non-string"}`);
  }

  // References: at least three, each fully described.
  if (!Array.isArray(direction.references) || direction.references.length < 3) {
    fail(`references requires ≥ 3 entries, got ${Array.isArray(direction.references) ? direction.references.length : "non-array"}`);
  } else {
    direction.references.forEach((ref, i) => {
      if (!isRecord(ref)) { fail(`references[${i}] is not an object`); return; }
      if (typeof ref.file !== "string" || ref.file.length === 0) fail(`references[${i}].file is required`);
      if (typeof ref.source !== "string" || ref.source.length === 0) fail(`references[${i}].source is required`);
      if (typeof ref.licence !== "string" || ref.licence.length === 0) fail(`references[${i}].licence is required`);
      if (typeof ref.why !== "string" || ref.why.length < 40) fail(`references[${i}].why must name the matched property in ≥ 40 chars`);
    });
  }

  // Lighting: never ambient fill, exactly one shadowed key, practicals capped.
  const lighting = direction.lighting;
  if (!isRecord(lighting)) {
    fail("lighting block is required");
  } else {
    if ((lighting.fill as string) === "ambient") fail('lighting.fill must not be "ambient" (use "ibl" or "ibl+bounce")');
    else if (lighting.fill !== "ibl" && lighting.fill !== "ibl+bounce") fail(`lighting.fill "${String(lighting.fill)}" is invalid`);
    const key = lighting.key;
    if (!isRecord(key)) {
      fail("lighting.key is required");
    } else {
      if (key.shadow !== true) fail("lighting.key.shadow must be true (exactly one shadowed key)");
      if (key.type !== "directional" && key.type !== "spot" && key.type !== "rect") fail(`lighting.key.type "${String(key.type)}" is invalid`);
      if (typeof key.colorTemperatureK !== "number" || key.colorTemperatureK <= 0) fail("lighting.key.colorTemperatureK must be a positive number");
    }
    if (!Number.isInteger(lighting.practicals) || lighting.practicals < 0 || lighting.practicals > 6) {
      fail(`lighting.practicals must be an integer 0–6, got ${String(lighting.practicals)}`);
    }
    const env = lighting.environment;
    if (!isRecord(env)) {
      fail("lighting.environment is required");
    } else if (env.background !== "hdri" && env.background !== "sky" && env.background !== "enclosed") {
      fail(`lighting.environment.background "${String(env.background)}" is invalid`);
    }
    if (typeof lighting.exposureEV !== "number" || !Number.isFinite(lighting.exposureEV)) fail("lighting.exposureEV must be a finite number");
  }

  // Framing.
  const framing = direction.framing;
  if (!isRecord(framing)) {
    fail("framing block is required");
  } else {
    if (!(RIGS as readonly string[]).includes(framing.rig)) fail(`framing.rig "${String(framing.rig)}" is not a C-22 factory name`);
    const shf = framing.subjectHeightFraction;
    if (!Array.isArray(shf) || shf.length !== 2 || !(shf[0] > 0) || !(shf[1] <= 1) || shf[0] > shf[1]) {
      fail("framing.subjectHeightFraction must be [min,max] with 0 < min ≤ max ≤ 1");
    }
    const fov = framing.fovDeg;
    if (!Array.isArray(fov) || fov.length !== 2 || !(fov[0] >= 1) || !(fov[1] <= 179) || fov[0] > fov[1]) {
      fail("framing.fovDeg must be [min,max] with 1 ≤ min ≤ max ≤ 179");
    }
    if (framing.mobile !== "landscape" && framing.mobile !== "portrait" && framing.mobile !== "both") {
      fail(`framing.mobile "${String(framing.mobile)}" is invalid`);
    }
  }

  // Palette + signature.
  const palette = direction.palette;
  if (!isRecord(palette) || !Array.isArray(palette.primary) || palette.primary.length === 0 || typeof palette.accent !== "string" || palette.accent.length === 0) {
    fail("palette requires a non-empty primary[] and an accent");
  }
  if (typeof direction.signatureEffect !== "string" || direction.signatureEffect.length === 0) fail("signatureEffect is required (it survives every tier)");

  // Asset roles. Checked through a raw record: a direction authored in JS can
  // carry values outside the declared types, which is exactly what this
  // validator exists to catch.
  const billiards = direction.genre === "billiards";
  const assets: readonly unknown[] = Array.isArray(direction.assets) ? direction.assets : [];
  assets.forEach((item, i) => {
    if (!isRecord(item)) { fail(`assets[${i}] is not an object`); return; }
    const asset = item;
    const at = `assets[${i}]${typeof asset.assetKey === "string" ? ` (${asset.assetKey})` : ""}`;
    const role = asset.role;
    if (typeof role !== "string" || !["hero", "character", "vehicle", "enemy", "world", "prop", "set-dressing", "backdrop"].includes(role)) {
      fail(`${at}.role "${String(role)}" is invalid`);
    }
    if (typeof asset.assetKey !== "string" || asset.assetKey.length === 0) fail(`${at}.assetKey is required`);
    if (asset.kit !== undefined && !(KITS as readonly string[]).includes(asset.kit as string)) fail(`${at}.kit "${String(asset.kit)}" is invalid`);
    if (typeof asset.maxTriangles !== "number" || !(asset.maxTriangles > 0)) fail(`${at}.maxTriangles must be a positive number`);
    const minTriangles = asset.minTriangles;
    if (minTriangles !== undefined && (typeof minTriangles !== "number" || minTriangles <= 0)) fail(`${at}.minTriangles must be positive when set`);
    if (typeof minTriangles === "number" && typeof asset.maxTriangles === "number" && minTriangles > asset.maxTriangles) {
      fail(`${at}.minTriangles exceeds maxTriangles`);
    }
    if (!(TEXTURE_SETS as readonly string[]).includes(asset.textureSet as string)) fail(`${at}.textureSet "${String(asset.textureSet)}" is invalid`);
    if (!(TEXTURE_SIZES as readonly number[]).includes(asset.maxTextureSize as number)) fail(`${at}.maxTextureSize must be one of ${TEXTURE_SIZES.join("/")}`);
    if (asset.targetTexelDensity !== undefined && !(typeof asset.targetTexelDensity === "number" && asset.targetTexelDensity > 0)) {
      fail(`${at}.targetTexelDensity must be positive`);
    }
    if (asset.animated !== undefined && (!isRecord(asset.animated) || !Array.isArray(asset.animated.clips) || asset.animated.clips.length === 0)) {
      fail(`${at}.animated.clips must be a non-empty array`);
    }
    if (typeof role === "string" && (ROLES_REQUIRING_TRIANGLE_FLOOR as readonly string[]).includes(role)) {
      if (minTriangles === undefined) {
        fail(`${at} role "${role}" must set minTriangles (≥ 2,000${billiards ? " except billiard balls" : ""})`);
      } else if (!billiards && typeof minTriangles === "number" && minTriangles < 2000) {
        fail(`${at} role "${role}" minTriangles ${minTriangles} is below the 2,000 floor`);
      }
      if (asset.textureSet === "BC") fail(`${at} role "${role}" must not use textureSet "BC" (needs at least "BC+N")`);
    }
  });

  // VFX + audio cue lists.
  const vfx: readonly unknown[] = Array.isArray(direction.vfx) ? direction.vfx : [];
  vfx.forEach((item, i) => {
    if (!isRecord(item) || typeof item.event !== "string" || item.event.length === 0 || typeof item.kind !== "string" || item.kind.length === 0) {
      fail(`vfx[${i}] requires non-empty event and kind`);
    }
  });
  const audio: readonly unknown[] = Array.isArray(direction.audio) ? direction.audio : [];
  audio.forEach((item, i) => {
    if (!isRecord(item) || typeof item.event !== "string" || item.event.length === 0 || typeof item.cue !== "string" || item.cue.length === 0) {
      fail(`audio[${i}] requires non-empty event and cue`);
    } else if (!Number.isInteger(item.variants) || (item.variants as number) < 1) {
      fail(`audio[${i}].variants must be an integer ≥ 1`);
    }
  });

  // Stand-ins: the only tolerated route-local engine stubs, tagged R-14-NN.
  if (direction.standIns !== undefined) {
    if (!Array.isArray(direction.standIns)) {
      fail("standIns must be an array");
    } else {
      const standIns: readonly unknown[] = direction.standIns;
      standIns.forEach((item, i) => {
        if (!isRecord(item)) { fail(`standIns[${i}] is not an object`); return; }
        if (typeof item.feature !== "string" || item.feature.length === 0) fail(`standIns[${i}].feature is required`);
        if (typeof item.file !== "string" || item.file.length === 0) fail(`standIns[${i}].file is required`);
        if (typeof item.request !== "string" || !STANDIN_REQUEST.test(item.request)) {
          fail(`standIns[${i}].request "${String(item.request)}" must match R-14-NN`);
        }
        if (typeof item.removeWhen !== "string" || item.removeWhen.length === 0) fail(`standIns[${i}].removeWhen is required`);
      });
    }
  }

  // Critical categories must be real C-32 categories.
  const criticalCategories: readonly unknown[] = Array.isArray(direction.criticalCategories) ? direction.criticalCategories : [];
  if (!Array.isArray(direction.criticalCategories) || criticalCategories.length === 0) {
    fail("criticalCategories must name the §6.10 bold columns");
  } else {
    criticalCategories.forEach((category) => {
      if (typeof category !== "string" || !(GAME_VISUAL_CATEGORY_LIST as readonly string[]).includes(category)) {
        fail(`criticalCategories entry "${String(category)}" is not a GameVisualCategory`);
      }
    });
  }

  // Per-tier budget table.
  const tiers: unknown = direction.tiers;
  if (!isRecord(tiers)) {
    fail("tiers block is required");
  } else {
    for (const tier of QUALITY_TIERS) {
      const row = tiers[tier];
      if (!isRecord(row)) { fail(`tiers.${tier} is missing`); continue; }
      if (!Number.isInteger(row.particles) || (row.particles as number) < 0) fail(`tiers.${tier}.particles must be an integer ≥ 0`);
      if (!isPowerOfTwo(row.shadowMap as number)) fail(`tiers.${tier}.shadowMap must be a power of two`);
      if (!Number.isInteger(row.cascades) || (row.cascades as number) < 1) fail(`tiers.${tier}.cascades must be an integer ≥ 1`);
      if (![1024, 2048, 4096].includes(row.textureMax as number)) fail(`tiers.${tier}.textureMax must be 1024, 2048 or 4096`);
    }
  }

  if (violations.length > 0) throw new AuraArtDirectionError(violations);
  return direction;
}
