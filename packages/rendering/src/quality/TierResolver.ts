/**
 * PRD 11 Phase 4 — `TierResolver` (§6.4).
 *
 * `detect(probe)` runs steps 1-3 once (hard floors → class table → signal
 * adjustment) and returns `{ tier, confidence, reasons, maxPixelRatio }`.
 * Step 4 (30 calibration frames) is `calibrateTierDecision`; step 5
 * persistence is `readCachedTierDecision` / `writeCachedTierDecision`, keyed
 * per §6.4 on `(unmaskedRenderer || "masked", engineVersion, screen, dpr)`.
 */

import type { DeviceProbe } from "../contracts/device";
import type { AuraTierDecision, AuraQualityTier } from "../contracts/quality";
import { QUALITY_TIERS, nextLowerTier } from "../contracts/quality";
import {
  DEVICE_CLASS_TABLE_VERSION,
  MASKED_APPLE_RENDERER,
  SOFTWARE_RENDERER_PATTERN,
  classifyRendererString
} from "./DeviceClasses";
import { nextHigherTier } from "./QualityTier";

export type TierConfidence = "high" | "low";

export interface TierClassification {
  readonly tier: AuraQualityTier;
  readonly confidence: TierConfidence;
  readonly reasons: readonly string[];
  /** Effective DPR cap after the §6.4 step-3 4 MP backing-area clamp. */
  readonly maxPixelRatio: number;
  readonly matchedClass: string | null;
}

const MP_LIMIT = 4_000_000;

/** Largest DPR ≤ tier.maxPixelRatio keeping width·height·dpr² ≤ 4 MP (≥ 1). */
function dprForArea(width: number, height: number, tier: AuraQualityTier): number {
  const cap = QUALITY_TIERS[tier].maxPixelRatio;
  const area = width * height;
  if (area <= 0) return cap;
  const dpr = Math.min(cap, Math.sqrt(MP_LIMIT / area));
  return Math.max(1, dpr);
}

export class TierResolver {
  /**
   * §6.4 detection on a C-28 `DeviceProbe`. Pure — no DOM, no timing.
   */
  detect(probe: DeviceProbe): TierClassification {
    const reasons: string[] = [];
    const renderer = probe.unmaskedRenderer ?? probe.rendererString ?? "";
    const mobile = probe.mobile === true;

    // Step 1 — hard floors.
    if (!probe.floatColorBuffer && !probe.halfFloatColorBuffer) {
      reasons.push("no-float-color-buffer");
      return { tier: "low", confidence: "high", reasons, maxPixelRatio: 1, matchedClass: "hard-floor" };
    }
    if (probe.maxTextureSize < 4096) {
      reasons.push(`maxTextureSize:${probe.maxTextureSize}`);
      return { tier: "low", confidence: "high", reasons, maxPixelRatio: 1, matchedClass: "hard-floor" };
    }
    if (SOFTWARE_RENDERER_PATTERN.test(renderer)) {
      reasons.push(`software-renderer:${renderer}`);
      return { tier: "low", confidence: "high", reasons, maxPixelRatio: 1, matchedClass: "software" };
    }

    // Step 2 — class table. Masked strings resolve to Medium / confidence low.
    let tier: AuraQualityTier = "medium";
    let confidence: TierConfidence = "low";
    let matchedClass: string | null = null;
    if (renderer === MASKED_APPLE_RENDERER) {
      reasons.push("masked-renderer:apple-gpu");
      matchedClass = "masked-apple";
    } else {
      const classified = classifyRendererString(renderer);
      if (classified.matched !== null) {
        tier = classified.tier;
        confidence = "high";
        matchedClass = classified.matched;
        reasons.push(`class:${classified.matched}`);
      } else {
        reasons.push("unclassified-renderer");
      }
    }

    // Step 3 — signal adjustment (mobile only): weak CPU/RAM lowers one tier.
    if (mobile) {
      const cores = probe.hardwareConcurrency;
      const memory = probe.deviceMemoryGB;
      if ((cores !== null && cores <= 4) || (memory !== null && memory <= 4)) {
        const lowered = nextLowerTier(tier);
        if (lowered) {
          reasons.push(`signal:${cores !== null && cores <= 4 ? "cores" : "memory"}`);
          tier = lowered;
        }
      }
    }

    // Backing-area clamp: > 4 MP at the tier cap on Low/Medium lowers DPR,
    // not the tier (§6.4 step 3).
    const width = probe.screen[0] || 0;
    const height = probe.screen[1] || 0;
    let maxPixelRatio = QUALITY_TIERS[tier].maxPixelRatio;
    if (tierIndexOf(tier) <= tierIndexOf("medium") && width * height * maxPixelRatio * maxPixelRatio > MP_LIMIT) {
      const clamped = dprForArea(width, height, tier);
      if (clamped < maxPixelRatio) {
        reasons.push(`dpr-area-clamp:${clamped.toFixed(2)}`);
        maxPixelRatio = clamped;
      }
    }

    return { tier, confidence, reasons, maxPixelRatio, matchedClass };
  }
}

function tierIndexOf(tier: AuraQualityTier): number {
  return tier === "low" ? 0 : tier === "medium" ? 1 : tier === "high" ? 2 : 3;
}

// ---------------------------------------------------------------------------
// §6.4 step 4 — calibration frames.

export interface CalibrationInput {
  /** p50 rAF interval over the first ~30 frames. */
  readonly p50IntervalMs: number;
  /** p50 GPU ms when a timer query exists, else null. */
  readonly p50GpuMs: number | null;
}

export interface CalibrationResult {
  readonly tier: AuraQualityTier;
  readonly calibrated: boolean;
  readonly reason: string;
}

/**
 * Calibration over the first rendered frames (§6.4 step 4). Lowering uses
 * either signal; raising requires GPU samples (rAF is vsync-capped) and only
 * applies when confidence was low.
 */
export function calibrateTierDecision(
  classification: TierClassification,
  input: CalibrationInput,
  targetFrameMs: number
): CalibrationResult {
  const p50 = input.p50GpuMs ?? input.p50IntervalMs;
  if (p50 > targetFrameMs * 1.25) {
    const lowered = nextLowerTier(classification.tier);
    if (lowered) {
      return { tier: lowered, calibrated: true, reason: `calibration-down:p50>${(targetFrameMs * 1.25).toFixed(1)}` };
    }
  }
  if (input.p50GpuMs !== null && input.p50GpuMs < targetFrameMs * 0.5 && classification.confidence === "low") {
    const raised = nextHigherTier(classification.tier);
    if (raised) {
      return { tier: raised, calibrated: true, reason: `calibration-up:p50<${(targetFrameMs * 0.5).toFixed(1)}` };
    }
  }
  return { tier: classification.tier, calibrated: false, reason: "calibration-none" };
}

// ---------------------------------------------------------------------------
// §6.4 step 5 — persistence.

export const QUALITY_CACHE_KEY = "aura3d.quality.v1";

export interface TierDecisionCacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function qualityDecisionCacheKey(probe: DeviceProbe, engineVersion: string): string {
  const renderer = probe.unmaskedRenderer ?? "masked";
  const [w, h] = probe.screen;
  return `${renderer}|${engineVersion}|${w}x${h}x${probe.devicePixelRatio}`;
}

interface CachedDecision {
  readonly v: number;
  readonly table: number;
  readonly tier: AuraQualityTier;
  readonly reason: string;
}

export function readCachedTierDecision(
  storage: TierDecisionCacheStorage | null,
  key: string
): AuraTierDecision | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(QUALITY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, CachedDecision>;
    const hit = parsed[key];
    if (!hit || hit.v !== 1 || hit.table !== DEVICE_CLASS_TABLE_VERSION) return null;
    if (hit.tier !== "low" && hit.tier !== "medium" && hit.tier !== "high" && hit.tier !== "ultra") return null;
    return { tier: hit.tier, source: "cache", reason: hit.reason };
  } catch {
    return null;
  }
}

export function writeCachedTierDecision(
  storage: TierDecisionCacheStorage | null,
  key: string,
  decision: AuraTierDecision
): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(QUALITY_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, CachedDecision>) : {};
    parsed[key] = { v: 1, table: DEVICE_CLASS_TABLE_VERSION, tier: decision.tier, reason: decision.reason };
    storage.setItem(QUALITY_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Quota / serialisation failures are non-fatal: the next boot re-detects.
  }
}
