/**
 * PRD-06 T2.8 (§9.7) — device-side half of the shader warm-up seam. The
 * engine's `prd06.animation` actor extension defers the actual compile to a
 * `Prd06ShaderWarmupCompiler`; this factory produces the default one through
 * C-02 `ProgramCacheLike.precompile` fed by PRD-01 §6.4
 * `collectWarmupFeatures` — the canonical "warm-then-block" expansion
 * (forward + depth/distance for casters, tier + next-lower-tier variants,
 * deduped by `programKey`), with velocity rows appended when the post lane's
 * TAA path is on. The C-28-stub semantics (resolve after a synchronous
 * compile) come free inside `precompile`; real `device.compileAsync`
 * (KHR_parallel_shader_compile) is the GPU/tiers lane's — neither
 * RenderDevice.ts nor the device subclasses are touched.
 */

import type { ProgramFeatures } from "../contracts/program";
import type { QrFlags } from "../contracts/core";
import type { RenderDevice } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";
import { QUALITY_TIERS, type AuraQualityTier, type AuraQualityTierSettings } from "../contracts/quality";
import { collectWarmupFeatures } from "../program/ProgramWarmup";
import { normalizeProgramFeatures } from "../program/ProgramFeatures";
import { rendererProgramCache } from "./qrSubFlags";

export interface Prd06ShaderWarmupOptions {
  readonly device: RenderDevice;
  readonly flags: QrFlags;
  readonly tier: AuraQualityTier;
  /** Settings for `material.programFeatures` — defaults to `QUALITY_TIERS[tier]`. */
  readonly tierSettings?: AuraQualityTierSettings;
  /** Scene axes for the expansion (light buckets present, environments). */
  readonly lights?: readonly ProgramFeatures["lights"][];
  readonly environments?: readonly ProgramFeatures["environment"][];
  /** Include `pass:"velocity"` rows — set when the app's TAA/velocity pass is on. */
  readonly velocity?: boolean;
}

export function createPrd06ProgramCacheWarmup(options: Prd06ShaderWarmupOptions): (items: readonly RenderItem[]) => Promise<void> {
  return async (items) => {
    const materials: Partial<ProgramFeatures>[] = [];
    for (const item of items) {
      const material = item.material;
      if (!material) continue;
      const record = "programFeatures" in material && typeof material.programFeatures === "function"
        ? material.programFeatures({ flags: options.flags, tier: options.tierSettings ?? QUALITY_TIERS[options.tier] })
        : {};
      // Instancing is item-driven (attribute matrices are the only generated
      // path) — same merge ForwardPass applies on top of the material record.
      materials.push(item.instanceTransforms
        ? { ...record, instancing: { color: item.instanceColors !== undefined } }
        : record);
    }
    const features = collectWarmupFeatures(
      { materials, lights: options.lights, environments: options.environments },
      options.tier
    );
    if (options.velocity) {
      for (const base of [...features]) {
        features.push(normalizeProgramFeatures({ ...base, pass: "velocity" }));
      }
    }
    if (features.length === 0) return;
    await rendererProgramCache(options.device, options.flags).precompile(features);
  };
}
