/**
 * PRD 11 Phase 4 — `QualityGovernor` (§6.5).
 *
 * Wraps a `RenderScaleSource` and, when render scale has been pinned at the
 * effective floor with frame time still over budget, steps ONE feature down
 * in the fixed ladder order SSR → AO → froxels → shadow cascades → shadow
 * map size → bloom mips → particle budget → MSAA. Each step adopts the
 * next-lower tier's value for that feature; recovery restores steps LIFO
 * after sustained headroom. Never a whole-tier jump; never while locked.
 */

import type { AuraQualityTier, AuraQualityTierSettings } from "../contracts/quality";
import { QUALITY_TIERS, nextLowerTier, resolveTierSettings } from "../contracts/quality";
import { effectiveRenderScaleFloor, type RenderScaleSource } from "./RenderScaleController";
import { tierIndex } from "./QualityTier";

/** Feature names in ladder order (§6.5). */
export const GOVERNOR_FEATURE_ORDER = [
  "ssr",
  "ambientOcclusion",
  "volumetricFog",
  "shadow.cascades",
  "shadow.mapSize",
  "bloomMipLevels",
  "particleBudget",
  "msaaSamples"
] as const;

export type GovernorFeatureName = (typeof GOVERNOR_FEATURE_ORDER)[number];

type FeatureValue = AuraQualityTierSettings["ssr" | "volumetricFog" | "bloomMipLevels" | "particleBudget" | "msaaSamples" | "ambientOcclusion"]
  | AuraQualityTierSettings["shadow"]["cascades"]
  | AuraQualityTierSettings["shadow"]["mapSize"];

function featureValue(settings: AuraQualityTierSettings, feature: GovernorFeatureName): FeatureValue {
  if (feature === "shadow.cascades") return settings.shadow.cascades;
  if (feature === "shadow.mapSize") return settings.shadow.mapSize;
  return settings[feature];
}

function featureOverride(
  settings: AuraQualityTierSettings,
  feature: GovernorFeatureName,
  value: FeatureValue
): Partial<AuraQualityTierSettings> {
  if (feature === "shadow.cascades") {
    return { shadow: { ...settings.shadow, cascades: value as AuraQualityTierSettings["shadow"]["cascades"] } };
  }
  if (feature === "shadow.mapSize") {
    return { shadow: { ...settings.shadow, mapSize: value as AuraQualityTierSettings["shadow"]["mapSize"] } };
  }
  return { [feature]: value } as Partial<AuraQualityTierSettings>;
}

export interface GovernorStep {
  readonly direction: "down" | "up";
  readonly feature: GovernorFeatureName;
  readonly from: FeatureValue;
  readonly to: FeatureValue;
  readonly frameMsP50: number;
}

export interface QualityGovernorOptions {
  readonly tier: AuraQualityTier;
  /** Lowest tier a feature may be stepped to. Default "low". */
  readonly floor?: AuraQualityTier;
  readonly overrides?: Partial<AuraQualityTierSettings>;
  readonly mobile?: boolean;
  /** Governor budget. Mobile default is 33.3 unless the app asked for 60. */
  readonly targetFrameMs?: number;
  readonly scaleSource: RenderScaleSource;
  readonly devicePixelRatio?: number;
  readonly allowSubCssResolution?: boolean;
}

const P50_WINDOW = 60;

export class QualityGovernor {
  private readonly tier: AuraQualityTier;
  private readonly floor: AuraQualityTier;
  private readonly baseOverrides: Partial<AuraQualityTierSettings> | undefined;
  private readonly mobile: boolean;
  private readonly targetFrameMs: number;
  private readonly scaleSource: RenderScaleSource;
  private readonly floor2: number;
  private readonly steps: { feature: GovernorFeatureName; from: FeatureValue; to: FeatureValue }[] = [];
  private readonly msWindow: number[] = [];
  private readonly listeners = new Set<(step: GovernorStep) => void>();
  private floorFrames = 0;
  private underFrames = 0;
  private locked = false;
  private lastScale: number;

  constructor(options: QualityGovernorOptions) {
    this.tier = options.tier;
    this.floor = options.floor ?? "low";
    this.baseOverrides = options.overrides;
    this.mobile = options.mobile === true;
    this.targetFrameMs = options.targetFrameMs ?? (this.mobile ? 33.3 : QUALITY_TIERS[this.tier].targetFrameMs);
    this.scaleSource = options.scaleSource;
    this.floor2 = effectiveRenderScaleFloor(
      QUALITY_TIERS[this.tier].minRenderScale,
      options.devicePixelRatio ?? 1,
      options.allowSubCssResolution === true
    );
    this.lastScale = this.scaleSource.scale;
  }

  get scale(): number { return this.lastScale; }
  get effectiveFloor(): number { return this.floor2; }
  get appliedSteps(): readonly { feature: GovernorFeatureName; from: FeatureValue; to: FeatureValue }[] {
    return this.steps;
  }

  /** Settings including the governor's stepped feature overrides. */
  effectiveSettings(): AuraQualityTierSettings {
    let overrides: Partial<AuraQualityTierSettings> = { ...(this.baseOverrides ?? {}) };
    for (const step of this.steps) {
      const current = resolveTierSettings(this.tier, overrides);
      overrides = { ...overrides, ...featureOverride(current, step.feature, step.to) };
    }
    return resolveTierSettings(this.tier, overrides);
  }

  setLocked(locked: boolean): void { this.locked = locked; }
  get isLocked(): boolean { return this.locked; }

  onStep(listener: (step: GovernorStep) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(step: GovernorStep): void {
    for (const listener of this.listeners) listener(step);
  }

  private p50(): number {
    if (this.msWindow.length === 0) return 0;
    const sorted = [...this.msWindow].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  }

  /**
   * Feed one frame. `ms` should be gpuMs when available else intervalMs.
   * Returns the applied render scale.
   */
  tick(frameMs: number, gpuMs: number | null): number {
    const ms = gpuMs ?? frameMs;
    this.msWindow.push(ms);
    if (this.msWindow.length > P50_WINDOW) this.msWindow.shift();
    this.lastScale = this.scaleSource.sample(frameMs, gpuMs);
    if (this.locked) {
      this.floorFrames = 0;
      this.underFrames = 0;
      return this.lastScale;
    }

    const atFloor = this.lastScale <= this.floor2 + 1e-6;
    if (atFloor && this.p50() > this.targetFrameMs * 1.1) {
      this.floorFrames += 1;
    } else {
      this.floorFrames = 0;
    }
    const downThreshold = this.mobile ? 120 : 300;
    if (this.floorFrames >= downThreshold) {
      this.floorFrames = 0;
      this.stepDown();
      return this.lastScale;
    }

    if (ms < this.targetFrameMs * 0.7 && this.lastScale >= 1 - 1e-6) {
      this.underFrames += 1;
    } else {
      this.underFrames = 0;
    }
    if (this.underFrames >= 600) {
      this.underFrames = 0;
      this.stepUp();
    }
    return this.lastScale;
  }

  /** First feature in ladder order that can still step down, else null. */
  private stepDown(): void {
    const lower = nextLowerTier(this.tier);
    if (!lower) return;
    const lowerSettings = QUALITY_TIERS[lower];
    const floorSettings = QUALITY_TIERS[this.floor];
    const settings = this.effectiveSettings();
    for (const feature of GOVERNOR_FEATURE_ORDER) {
      const current = featureValue(settings, feature);
      const lowerValue = featureValue(lowerSettings, feature);
      const floorValue = featureValue(floorSettings, feature);
      if (current === lowerValue || current === floorValue) continue;
      const step = { feature, from: current, to: lowerValue };
      this.steps.push(step);
      this.emit({ direction: "down", feature, from: current, to: lowerValue, frameMsP50: this.p50() });
      return;
    }
  }

  private stepUp(): void {
    const last = this.steps.pop();
    if (!last) return;
    const settings = this.effectiveSettings();
    const restored = featureValue(settings, last.feature);
    this.emit({ direction: "up", feature: last.feature, from: last.to, to: restored, frameMsP50: this.p50() });
  }
}

/** Tier index for comparisons: exported for governor tests and diagnostics. */
export function governorTierIndex(tier: AuraQualityTier): number {
  return tierIndex(tier);
}
