/**
 * PRD 11 Phase 4 — real `AuraQualityController` (C-27) behind
 * `A3D_QR_TIERS`. Replaces the PR 0a `StubQualityController` in the engine
 * `quality` extension when the flag is on.
 *
 * Lifecycle: constructed from the app's `quality` option (explicit tier or
 * "auto"). `attachProbe(probe)` runs `TierResolver.detect` (or returns the
 * persisted §6.4-step-5 decision), builds the `QualityGovernor` and starts
 * the 30-frame calibration window. `tickFrame(intervalMs, gpuMs)` is fed by
 * the `prd11.governor` frame contributor each rendered frame; after the
 * window it applies `calibrateTierDecision` once and then just ticks the
 * governor.
 */

import type { DeviceProbe } from "../contracts/device";
import type {
  AuraQualityController,
  AuraQualityTier,
  AuraQualityTierSettings,
  AuraTierDecision
} from "../contracts/quality";
import { QUALITY_TIERS, resolveTierSettings } from "../contracts/quality";
import {
  TierResolver,
  calibrateTierDecision,
  qualityDecisionCacheKey,
  readCachedTierDecision,
  writeCachedTierDecision,
  type TierClassification,
  type TierDecisionCacheStorage
} from "./TierResolver";
import { QualityGovernor, type GovernorStep } from "./QualityGovernor";
import { createRenderScaleController } from "./RenderScaleController";
import { isQualityTier } from "./QualityTier";

const CALIBRATION_FRAMES = 30;

export interface AuraQualityControllerEnv {
  readonly coarsePointer?: boolean;
  readonly storage?: TierDecisionCacheStorage | null;
  readonly engineVersion?: string;
  readonly mobile?: boolean;
  readonly targetFrameRate?: number;
  /** `adaptive: false` (C-27 option): detection still runs; no governor is built. */
  readonly adaptive?: boolean;
}

export interface QualityDiagnostics {
  readonly decision: AuraTierDecision;
  readonly classification: TierClassification | null;
  readonly confidence: "high" | "low" | null;
  readonly reasons: readonly string[];
  readonly governorSteps: readonly GovernorStep[];
  readonly renderScale: number | null;
  readonly locked: boolean;
  readonly unmaskedRenderer: string | null;
}

export class AuraQuality implements AuraQualityController {
  private currentTier: AuraQualityTier;
  private overrides: Partial<AuraQualityTierSettings> | undefined;
  private locked = false;
  private forcedScale: number | "floor" | null = null;
  private governor: QualityGovernor | null = null;
  private classification: TierClassification | null = null;
  private probe: DeviceProbe | null = null;
  private env: AuraQualityControllerEnv;
  private decisionValue: AuraTierDecision;
  private readonly listeners = new Set<(e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void>();
  private readonly stepLog: GovernorStep[] = [];
  private calibrationMs: { interval: number[]; gpu: (number | null)[] } = { interval: [], gpu: [] };
  private calibrated = false;

  constructor(requested: AuraQualityTier | "auto" = "auto", overrides?: Partial<AuraQualityTierSettings>, env: AuraQualityControllerEnv = {}) {
    this.env = env;
    this.currentTier = requested === "auto" ? (env.coarsePointer ? "medium" : "high") : requested;
    this.overrides = overrides;
    this.decisionValue = {
      tier: this.currentTier,
      source: requested === "auto" ? "default" : "explicit",
      reason: requested === "auto" ? "auto-pending-probe" : "explicit"
    };
  }

  get tier(): AuraQualityTier { return this.currentTier; }
  get decision(): AuraTierDecision { return this.decisionValue; }
  get settings(): AuraQualityTierSettings {
    return this.governor ? this.governor.effectiveSettings() : resolveTierSettings(this.currentTier, this.overrides);
  }
  get isLocked(): boolean { return this.locked; }
  get renderScale(): number | null {
    return this.forcedScale === "floor" ? this.governor?.effectiveFloor ?? null : this.forcedScale ?? this.governor?.scale ?? null;
  }
  get governorSteps(): readonly GovernorStep[] { return this.stepLog; }

  /**
   * Run §6.4 detection (or reuse the persisted decision) and build the
   * governor. Called once the `RenderDevice.probe` exists; idempotent.
   */
  attachProbe(probe: DeviceProbe): void {
    if (this.probe === probe) return;
    this.probe = probe;
    if (this.decisionValue.source === "explicit") {
      this.buildGovernor();
      return;
    }
    const storage = this.env.storage ?? null;
    const key = qualityDecisionCacheKey(probe, this.env.engineVersion ?? "dev");
    const cached = readCachedTierDecision(storage, key);
    if (cached) {
      this.setTierInternal(cached.tier, cached);
      this.buildGovernor();
      return;
    }
    this.classification = new TierResolver().detect(probe);
    const source: AuraTierDecision["source"] = "classified";
    this.setTierInternal(this.classification.tier, {
      tier: this.classification.tier,
      source,
      reason: this.classification.reasons.join(",") || "classified"
    });
    this.buildGovernor();
  }

  private setTierInternal(tier: AuraQualityTier, decision: AuraTierDecision): void {
    const from = this.currentTier;
    this.currentTier = tier;
    this.decisionValue = decision;
    if (from !== tier) {
      for (const listener of this.listeners) listener({ from, to: tier, reason: decision.reason });
    }
  }

  private buildGovernor(): void {
    if (this.env.adaptive === false) {
      this.governor = null;
      return;
    }
    const probe = this.probe;
    const mobile = probe?.mobile === true || this.env.mobile === true;
    const targetFrameMs = mobile && this.env.targetFrameRate !== 60
      ? 33.3
      : QUALITY_TIERS[this.currentTier].targetFrameMs;
    const settings = resolveTierSettings(this.currentTier, this.overrides);
    const dpr = probe?.devicePixelRatio ?? 1;
    const governor = new QualityGovernor({
      tier: this.currentTier,
      mobile,
      targetFrameMs,
      overrides: this.overrides,
      devicePixelRatio: dpr,
      scaleSource: createRenderScaleController({
        targetFrameMs,
        minScale: settings.minRenderScale,
        initialScale: 1
      })
    });
    governor.onStep((step) => {
      this.stepLog.push(step);
      if (this.stepLog.length > 64) this.stepLog.shift();
      for (const listener of this.listeners) {
        listener({ from: this.currentTier, to: this.currentTier, reason: `governor:${step.direction}:${step.feature}` });
      }
    });
    this.governor = governor;
  }

  /**
   * Feed one rendered frame (from `prd11.governor` contributor). Runs the
   * §6.4-step-4 calibration during the first 30 frames, then governor ticks.
   */
  tickFrame(intervalMs: number, gpuMs: number | null): void {
    if (!this.calibrated && this.decisionValue.source === "classified" && this.classification) {
      this.calibrationMs.interval.push(intervalMs);
      this.calibrationMs.gpu.push(gpuMs);
      if (this.calibrationMs.interval.length >= CALIBRATION_FRAMES) {
        this.calibrated = true;
        const median = (xs: number[]) => {
          const s = [...xs].sort((a, b) => a - b);
          return s[Math.floor(s.length * 0.5)] ?? 0;
        };
        const gpuSamples = this.calibrationMs.gpu.filter((v): v is number => v !== null);
        const result = calibrateTierDecision(this.classification, {
          p50IntervalMs: median(this.calibrationMs.interval),
          p50GpuMs: gpuSamples.length > 0 ? median(gpuSamples) : null
        }, QUALITY_TIERS[this.currentTier].targetFrameMs);
        if (result.calibrated) {
          const probe = this.probe;
          this.setTierInternal(result.tier, { tier: result.tier, source: "calibrated", reason: result.reason });
          this.buildGovernor();
          if (probe) {
            writeCachedTierDecision(this.env.storage ?? null, qualityDecisionCacheKey(probe, this.env.engineVersion ?? "dev"), this.decisionValue);
          }
        }
      }
      // Governor engages only after the calibration window closes (§6.4/§6.5).
      return;
    }
    this.governor?.tick(intervalMs, gpuMs);
  }

  async set(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): Promise<void> {
    if (this.locked) return;
    if (!isQualityTier(tier)) throw new Error(`QUALITY_OVERRIDE_INVALID:tier`);
    if (overrides) resolveTierSettings(tier, overrides); // validate eagerly
    const from = this.currentTier;
    this.currentTier = tier;
    if (overrides !== undefined) this.overrides = overrides;
    this.decisionValue = { tier, source: "explicit", reason: "set" };
    this.buildGovernor();
    if (from !== tier) {
      for (const listener of this.listeners) listener({ from, to: tier, reason: "set" });
    }
  }

  lock(): void {
    this.locked = true;
    this.governor?.setLocked(true);
  }
  unlock(): void {
    this.locked = false;
    this.governor?.setLocked(false);
  }

  forceRenderScale(scale: number | "floor" | null): void {
    this.forcedScale = scale;
  }

  onChange(l: (e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  /** C-31 `quality` section data (rich fields ride alongside the contract). */
  diagnostics(): QualityDiagnostics {
    return {
      decision: this.decisionValue,
      classification: this.classification,
      confidence: this.classification?.confidence ?? null,
      reasons: this.classification?.reasons ?? [],
      governorSteps: this.stepLog,
      renderScale: this.renderScale,
      locked: this.locked,
      unmaskedRenderer: this.probe?.unmaskedRenderer ?? null
    };
  }
}

// ---------------------------------------------------------------------------
// Engine↔renderer bus: the `quality` extension registers its controller here;
// the `prd11.governor` frame contributor attaches the first device probe it
// sees and ticks every registered controller once per frame.

const liveControllers = new Set<AuraQuality>();
const controllerDevices = new WeakMap<AuraQuality, unknown>();

export function registerAuraQualityController(controller: AuraQuality): () => void {
  liveControllers.add(controller);
  return () => { liveControllers.delete(controller); };
}

/**
 * Called by the lane's governor frame contributor each frame. Attaches the
 * device probe to any controller that lacks one, then ticks all controllers
 * with the frame's timings.
 */
export function prd11TickQualityControllers(probe: DeviceProbe | undefined, intervalMs: number, gpuMs: number | null): void {
  for (const controller of liveControllers) {
    if (probe && !controllerDevices.has(controller)) {
      controllerDevices.set(controller, probe);
      controller.attachProbe(probe);
    }
    controller.tickFrame(intervalMs, gpuMs);
  }
}

/** C-31 `quality` diagnostics: latest registered controller, if any. */
export function prd11LatestQualityDiagnostics(): QualityDiagnostics | null {
  let latest: AuraQuality | null = null;
  for (const controller of liveControllers) latest = controller;
  return latest ? latest.diagnostics() : null;
}
