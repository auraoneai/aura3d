/**
 * C-27 — QualityTier settings (CONTRACTS.md). Provider: PRD 11. Flag: A3D_QR_TIERS.
 * Engine re-export lives in packages/engine/src/contracts/quality re-exports? —
 * consumers import from @aura3d/rendering/contracts.
 */

export type AuraQualityTier = "low" | "medium" | "high" | "ultra";
export type AuraFeatureLevel = "off" | "low" | "medium" | "high";
export interface AuraQualityTierSettings {
  readonly maxPixelRatio: number; readonly minRenderScale: number; readonly targetFrameMs: number;
  readonly msaaSamples: 0 | 4; readonly postAntiAlias: "fxaa" | "none" | "taa";
  readonly shadow: { readonly mapSize: 1024 | 2048 | 4096; readonly cascades: 1 | 2 | 3 | 4; readonly filter: "pcf2" | "pcf3" | "pcf5"; readonly localShadowLights: number; readonly contact: boolean };
  readonly maxLightsPerPixel: 4 | 8 | 16 | 32;
  readonly ambientOcclusion: AuraFeatureLevel; readonly ssr: AuraFeatureLevel; readonly bloomMipLevels: 3 | 5 | 6;
  readonly volumetricFog: "analytic" | "froxel-medium" | "froxel-high";
  readonly froxelGrid: readonly [number, number, number] | null;
  readonly particleBudget: number; readonly softParticles: boolean; readonly lodBias: number;
  readonly primitiveSegments: "half" | "full"; readonly maxTextureSize: 1024 | 2048 | 4096; readonly textureBudgetBytes: number;
  readonly anisotropy: 2 | 4 | 8 | 16; readonly environmentSize: 128 | 256 | 512 | 1024; readonly drawBudget: number;
}

const MiB = 1024 * 1024;

/**
 * Frozen QUALITY_TIERS: PRD 11 §6.3 table values with the R9, R10 and R11
 * corrections. `targetFrameMs` uses the desktop value; the governor applies
 * 33.3 on mobile.
 */
export const QUALITY_TIERS: Readonly<Record<AuraQualityTier, AuraQualityTierSettings>> = {
  low: {
    maxPixelRatio: 1, minRenderScale: 0.5, targetFrameMs: 16.7,
    msaaSamples: 0, postAntiAlias: "fxaa",
    shadow: { mapSize: 1024, cascades: 1, filter: "pcf2", localShadowLights: 0, contact: false },
    maxLightsPerPixel: 4,
    ambientOcclusion: "off", ssr: "off", bloomMipLevels: 3,
    volumetricFog: "analytic", froxelGrid: null,
    particleBudget: 2000, softParticles: false, lodBias: 2.0,
    primitiveSegments: "half", maxTextureSize: 1024, textureBudgetBytes: 128 * MiB,
    anisotropy: 4, environmentSize: 128, drawBudget: 150
  },
  medium: {
    maxPixelRatio: 1.5, minRenderScale: 0.6, targetFrameMs: 16.7,
    msaaSamples: 4, postAntiAlias: "none",
    shadow: { mapSize: 2048, cascades: 2, filter: "pcf3", localShadowLights: 1, contact: false },
    maxLightsPerPixel: 8,
    ambientOcclusion: "low", ssr: "off", bloomMipLevels: 5,
    volumetricFog: "analytic", froxelGrid: null,
    particleBudget: 10000, softParticles: true, lodBias: 1.5,
    primitiveSegments: "full", maxTextureSize: 2048, textureBudgetBytes: 256 * MiB,
    anisotropy: 8, environmentSize: 256, drawBudget: 300
  },
  high: {
    maxPixelRatio: 2, minRenderScale: 0.7, targetFrameMs: 16.7,
    msaaSamples: 4, postAntiAlias: "none",
    shadow: { mapSize: 2048, cascades: 3, filter: "pcf5", localShadowLights: 2, contact: false },
    maxLightsPerPixel: 16,
    ambientOcclusion: "medium", ssr: "medium", bloomMipLevels: 6,
    volumetricFog: "froxel-medium", froxelGrid: [160, 90, 64],
    particleBudget: 50000, softParticles: true, lodBias: 1.0,
    primitiveSegments: "full", maxTextureSize: 4096, textureBudgetBytes: 512 * MiB,
    anisotropy: 16, environmentSize: 512, drawBudget: 600
  },
  ultra: {
    maxPixelRatio: 3, minRenderScale: 0.75, targetFrameMs: 16.7,
    msaaSamples: 4, postAntiAlias: "taa",
    shadow: { mapSize: 4096, cascades: 4, filter: "pcf5", localShadowLights: 4, contact: true },
    maxLightsPerPixel: 32,
    ambientOcclusion: "high", ssr: "high", bloomMipLevels: 6,
    volumetricFog: "froxel-high", froxelGrid: [240, 135, 128],
    particleBudget: 100000, softParticles: true, lodBias: 0.75,
    primitiveSegments: "full", maxTextureSize: 4096, textureBudgetBytes: 1024 * MiB,
    anisotropy: 16, environmentSize: 1024, drawBudget: 1500
  }
};

const VALIDATORS: { [K in keyof AuraQualityTierSettings]-?: (v: unknown) => v is AuraQualityTierSettings[K] } = {
  maxPixelRatio: (v): v is number => typeof v === "number" && v > 0 && v <= 8,
  minRenderScale: (v): v is number => typeof v === "number" && v > 0 && v <= 1,
  targetFrameMs: (v): v is number => typeof v === "number" && v > 0 && v < 1000,
  msaaSamples: (v): v is 0 | 4 => v === 0 || v === 4,
  postAntiAlias: (v): v is "fxaa" | "none" | "taa" => v === "fxaa" || v === "none" || v === "taa",
  shadow: (v): v is AuraQualityTierSettings["shadow"] =>
    typeof v === "object" && v !== null &&
    [1024, 2048, 4096].includes((v as { mapSize: number }).mapSize) &&
    [1, 2, 3, 4].includes((v as { cascades: number }).cascades) &&
    ["pcf2", "pcf3", "pcf5"].includes((v as { filter: string }).filter) &&
    typeof (v as { localShadowLights: number }).localShadowLights === "number" &&
    typeof (v as { contact: boolean }).contact === "boolean",
  maxLightsPerPixel: (v): v is 4 | 8 | 16 | 32 => v === 4 || v === 8 || v === 16 || v === 32,
  ambientOcclusion: (v): v is AuraFeatureLevel => v === "off" || v === "low" || v === "medium" || v === "high",
  ssr: (v): v is AuraFeatureLevel => v === "off" || v === "low" || v === "medium" || v === "high",
  bloomMipLevels: (v): v is 3 | 5 | 6 => v === 3 || v === 5 || v === 6,
  volumetricFog: (v): v is "analytic" | "froxel-medium" | "froxel-high" => v === "analytic" || v === "froxel-medium" || v === "froxel-high",
  froxelGrid: (v): v is readonly [number, number, number] | null =>
    v === null || (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && n > 0)),
  particleBudget: (v): v is number => typeof v === "number" && v >= 0,
  softParticles: (v): v is boolean => typeof v === "boolean",
  lodBias: (v): v is number => typeof v === "number" && v >= 0 && v <= 4,
  primitiveSegments: (v): v is "half" | "full" => v === "half" || v === "full",
  maxTextureSize: (v): v is 1024 | 2048 | 4096 => v === 1024 || v === 2048 || v === 4096,
  textureBudgetBytes: (v): v is number => typeof v === "number" && v > 0,
  anisotropy: (v): v is 2 | 4 | 8 | 16 => v === 2 || v === 4 || v === 8 || v === 16,
  environmentSize: (v): v is 128 | 256 | 512 | 1024 => v === 128 || v === 256 || v === 512 || v === 1024,
  drawBudget: (v): v is number => typeof v === "number" && v > 0
};

/** Validates every override key; any invalid value throws QUALITY_OVERRIDE_INVALID:<field>. */
export function resolveTierSettings(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): AuraQualityTierSettings {
  const base = QUALITY_TIERS[tier];
  if (!overrides) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides) as (keyof AuraQualityTierSettings)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (!VALIDATORS[key](value)) throw new Error(`QUALITY_OVERRIDE_INVALID:${key}`);
    out[key] = value;
  }
  return out as unknown as AuraQualityTierSettings;
}

export function nextLowerTier(tier: AuraQualityTier): AuraQualityTier | null {
  return tier === "ultra" ? "high" : tier === "high" ? "medium" : tier === "medium" ? "low" : null;
}

export interface AuraTierDecision { readonly tier: AuraQualityTier; readonly source: "explicit" | "url" | "cache" | "classified" | "calibrated" | "default"; readonly reason: string; }
export interface AuraQualityController {
  readonly tier: AuraQualityTier; readonly settings: AuraQualityTierSettings; readonly decision: AuraTierDecision;
  set(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): Promise<void>;
  lock(): void; unlock(): void; forceRenderScale(scale: number | "floor" | null): void;
  onChange(l: (e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void): () => void;
}

/**
 * PR 0a stub controller: "auto" resolves to "high" on desktop and "medium" when
 * matchMedia("(pointer: coarse)"), decision.source "default". set() updates
 * settings and emits onChange; consumers re-read settings at their next
 * resolve. forceRenderScale records the request (the engine seam applies it
 * through the existing canvas sizing in PR 0b).
 */
export class StubQualityController implements AuraQualityController {
  private current: AuraQualityTier;
  private overrides: Partial<AuraQualityTierSettings> | undefined;
  private locked = false;
  private scale: number | "floor" | null = null;
  private readonly listeners = new Set<(e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void>();
  public readonly decision: AuraTierDecision;

  constructor(requested: AuraQualityTier | "auto" = "auto", overrides?: Partial<AuraQualityTierSettings>, coarsePointer = false) {
    this.current = requested === "auto" ? (coarsePointer ? "medium" : "high") : requested;
    this.overrides = overrides;
    this.decision = { tier: this.current, source: "default", reason: requested === "auto" ? "auto" : "explicit" };
  }

  get tier(): AuraQualityTier { return this.current; }
  get settings(): AuraQualityTierSettings { return resolveTierSettings(this.current, this.overrides); }

  async set(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): Promise<void> {
    if (this.locked) return;
    if (this.tier === tier && overrides === this.overrides) return;
    const from = this.current;
    if (overrides) resolveTierSettings(tier, overrides);
    this.current = tier;
    if (overrides !== undefined) this.overrides = overrides;
    for (const listener of this.listeners) listener({ from, to: tier, reason: "set" });
  }

  lock(): void { this.locked = true; }
  unlock(): void { this.locked = false; }
  forceRenderScale(scale: number | "floor" | null): void { this.scale = scale; }
  get renderScale(): number | "floor" | null { return this.scale; }
  onChange(l: (e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
}
