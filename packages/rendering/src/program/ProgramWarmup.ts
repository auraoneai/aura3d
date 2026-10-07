/**
 * `program/ProgramWarmup.ts` (PRD-01 §6.4) — "warm-then-block" precompile.
 *
 * `collectWarmupFeatures` expands the scene's distinct feature records across
 * the dimensions that change generated code: the forward + depth/distance
 * passes for casters, the present light buckets, shadow receiver bits per
 * tier, and the current tier plus `nextLowerTier` variants (C-27: a runtime
 * downgrade must not compile mid-frame). Records are deduped by canonical
 * `programKey`; `precompile` hands the list to the cache, whose pending
 * entries `app.ready()` awaits via the C-38 `output`/`precompile` surface.
 */

import type { ProgramFeatures, ProgramCacheLike } from "../contracts/program";
import { nextLowerTier, QUALITY_TIERS, type AuraQualityTier } from "../contracts/quality";
import { normalizeProgramFeatures } from "./ProgramFeatures";
import { programKey } from "./ProgramKey";

export interface WarmupInput {
  /** One feature record per material/shader variant in the mounted scene. */
  readonly materials: readonly Partial<ProgramFeatures>[];
  /** Light buckets present in the scene (each may produce a distinct key). */
  readonly lights?: readonly ProgramFeatures["lights"][];
  readonly shadows?: readonly ProgramFeatures["shadows"][];
  readonly environments?: readonly ProgramFeatures["environment"][];
  /** Include `pass:"depth"` variants for shadow casters (default true). */
  readonly includeDepth?: boolean;
}

/** Tier-dependent feature fields (what `nextLowerTier` changes in generated code). */
function tierShadowSettings(tier: AuraQualityTier): ProgramFeatures["shadows"] {
  const shadow = QUALITY_TIERS[tier].shadow;
  // `filter` is the kernel width ("pcf2"/"pcf3"/"pcf5"); taps = width².
  const width = shadow.filter === "pcf5" ? 5 : shadow.filter === "pcf3" ? 3 : 2;
  // C-11 `pcfTaps` is the frozen union 1|4|9 — pcf5 clamps to 9 pending a contract revision.
  return { cascades: shadow.cascades, pcfTaps: Math.min(9, width * width) as 1 | 4 | 9, localShadows: shadow.localShadowLights, contact: shadow.contact };
}

export function collectWarmupFeatures(input: WarmupInput, tier: AuraQualityTier): ProgramFeatures[] {
  const seen = new Set<string>();
  const out: ProgramFeatures[] = [];
  const push = (partial: Partial<ProgramFeatures>) => {
    const normalized = normalizeProgramFeatures(partial);
    const key = programKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  const lightBuckets = input.lights && input.lights.length > 0 ? input.lights : [normalizeProgramFeatures({}).lights];
  const environments = input.environments && input.environments.length > 0 ? input.environments : [normalizeProgramFeatures({}).environment];
  const shadowSets = input.shadows && input.shadows.length > 0
    ? input.shadows
    : [tierShadowSettings(tier), ...(nextLowerTier(tier) ? [tierShadowSettings(nextLowerTier(tier)!)] : [])];

  for (const material of input.materials) {
    for (const lights of lightBuckets) {
      for (const environment of environments) {
        for (const shadows of shadowSets) {
          const base: Partial<ProgramFeatures> = { ...material, lights, shadows, environment, pass: "forward" };
          push(base);
          if (input.includeDepth !== false && material.lighting !== "unlit") {
            push({ ...material, lights, shadows, environment: "none", pass: "depth", fog: "none", lighting: "unlit" });
          }
        }
      }
    }
  }
  return out;
}

export interface WarmupResult {
  readonly compiled: number;
  readonly pending: number;
  readonly failed: number;
}

export class ProgramWarmup {
  constructor(private readonly cache: ProgramCacheLike) {}

  /** Kick precompile for a material set at the current tier (includes next-lower). */
  warm(input: WarmupInput, tier: AuraQualityTier): Promise<void> {
    return this.cache.precompile(collectWarmupFeatures(input, tier));
  }

  result(): WarmupResult {
    const stats = this.cache.stats();
    return { compiled: stats.compiled, pending: stats.pending, failed: stats.failed };
  }
}
