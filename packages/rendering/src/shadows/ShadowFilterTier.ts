/**
 * PRD-2 WP-3 — PCF tap-count tiers (32 / 16 / 8).
 *
 * The forward shadow shaders loop over `u_shadowPcfSampleCount` kernel samples, so the cost of
 * a shadow lookup is the kernel length. A tap tier is a cap on that length: a kernel with more
 * taps than the tier is replaced by a Poisson-disk kernel of exactly `tier` taps whose RMS
 * offset matches the source kernel (same penumbra width); a kernel at or below the cap is
 * returned unchanged (same object), so scenes whose kernel is already within the cap render
 * byte-identically.
 *
 * Tier selection (`resolveShadowPcfTapTier`) is opt-in at every step, so a render that asks for
 * nothing keeps the authored kernel (tier 32, reason "default", a no-op for every kernel):
 *   - an explicit request wins;
 *   - `qualityDefault: true` maps the quality tier low -> 8, medium -> 16, high / ultra -> 32.
 *     The flag-path bridge kernel is 9 taps, so only `low` changes pixels (9 -> 8); the engine
 *     therefore passes it only when the author opted in (`shadowQualityTapTierEnabled`);
 *   - `denseDefault: true` sends dense instanced shadow casters (>= DENSE_SHADOW_CASTER_INSTANCES,
 *     the same threshold as the auto-cascade cap) to the lowest tier, never raising the quality
 *     tier's own cap (`denseShadowTapTierEnabled`).
 */
import { createPoissonDiskShadowKernel, type ShadowFilterKernel } from "../ShadowMap";

export type ShadowPcfTapTier = 32 | 16 | 8;

export const SHADOW_PCF_TAP_TIERS: readonly ShadowPcfTapTier[] = [32, 16, 8];

/** Shadow-casting instances at or above which a scene counts as dense (matches the auto-cascade cap in the engine). */
export const DENSE_SHADOW_CASTER_INSTANCES = 8192;

/** Tap-count cap per C-27 quality tier. */
export const QUALITY_TIER_SHADOW_PCF_TAPS: Readonly<Record<"low" | "medium" | "high" | "ultra", ShadowPcfTapTier>> = {
  low: 8,
  medium: 16,
  high: 32,
  ultra: 32
};

export type ShadowPcfTapTierReason = "explicit" | "dense-instanced-casters" | "quality-tier" | "default";

export interface ShadowPcfTapTierDecision {
  readonly tier: ShadowPcfTapTier;
  readonly reason: ShadowPcfTapTierReason;
  /** Shadow-casting instance count the decision saw (0 when not measured). */
  readonly casterInstances: number;
}

export function isShadowPcfTapTier(value: unknown): value is ShadowPcfTapTier {
  return value === 32 || value === 16 || value === 8;
}

export function resolveShadowPcfTapTier(input: {
  readonly quality?: string;
  readonly casterInstances?: number;
  readonly requested?: number;
  /** Apply the quality-tier cap (only when true; unset keeps the authored kernel). */
  readonly qualityDefault?: boolean;
  /** Apply the dense-scene cap (only when true; unset keeps the authored kernel). */
  readonly denseDefault?: boolean;
} = {}): ShadowPcfTapTierDecision {
  const casterInstances = input.casterInstances !== undefined && Number.isFinite(input.casterInstances) ? Math.max(0, input.casterInstances) : 0;
  if (input.requested !== undefined) {
    if (!isShadowPcfTapTier(input.requested)) {
      throw new RangeError(`Shadow PCF tap tier must be 32, 16 or 8, got ${String(input.requested)}`);
    }
    return { tier: input.requested, reason: "explicit", casterInstances };
  }
  const quality = input.qualityDefault === true && input.quality !== undefined && input.quality in QUALITY_TIER_SHADOW_PCF_TAPS
    ? QUALITY_TIER_SHADOW_PCF_TAPS[input.quality as keyof typeof QUALITY_TIER_SHADOW_PCF_TAPS]
    : undefined;
  if (input.denseDefault === true && casterInstances >= DENSE_SHADOW_CASTER_INSTANCES) {
    return { tier: Math.min(quality ?? 8, 8) as ShadowPcfTapTier, reason: "dense-instanced-casters", casterInstances };
  }
  if (quality !== undefined) return { tier: quality, reason: "quality-tier", casterInstances };
  return { tier: 32, reason: "default", casterInstances };
}

const tiered = new WeakMap<ShadowFilterKernel, Map<ShadowPcfTapTier, ShadowFilterKernel>>();

function rmsOffset(samples: readonly { readonly x: number; readonly y: number }[]): number {
  let sum = 0;
  for (const sample of samples) sum += sample.x * sample.x + sample.y * sample.y;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/**
 * Cap `kernel` at `tier` taps. Returns `kernel` itself when `tier` is undefined, the kernel is
 * unfiltered, or it already has at most `tier` taps. Results are cached per kernel object so the
 * per-draw uniform path allocates nothing after the first frame.
 */
export function applyShadowPcfTapTier(kernel: ShadowFilterKernel, tier: ShadowPcfTapTier | undefined): ShadowFilterKernel {
  if (tier === undefined || kernel.mode === "none" || kernel.samples.length <= tier) return kernel;
  let byTier = tiered.get(kernel);
  const cached = byTier?.get(tier);
  if (cached) return cached;
  const unit = createPoissonDiskShadowKernel(tier, 1);
  const unitRms = rmsOffset(unit);
  const sourceRms = rmsOffset(kernel.samples);
  const radius = Math.min(8, Math.max(1e-3, unitRms > 0 && sourceRms > 0 ? sourceRms / unitRms : kernel.radius));
  const reduced: ShadowFilterKernel = {
    mode: kernel.mode,
    distribution: "poisson",
    radius,
    samples: createPoissonDiskShadowKernel(tier, radius)
  };
  if (!byTier) {
    byTier = new Map();
    tiered.set(kernel, byTier);
  }
  byTier.set(tier, reduced);
  return reduced;
}
