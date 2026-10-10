/**
 * `program/FeatureSelect.ts` (PRD-01 §6.4, C-02, T0-05) — per-draw
 * `ShaderFeature.select` + `bindUniforms`.
 *
 * Kept out of `MaterialFeatures.ts`: that module is imported by `Material.ts`,
 * and a value import of `contracts/program` there closes an import cycle
 * through `PBRMaterial`.
 */

import type { QrFlags } from "../contracts/core";
import type { ProgramFeatures, ShaderFeatureSelectInput } from "../contracts/program";
import { shaderFeaturesFor } from "../contracts/program";
import type { RenderItem } from "../contracts/renderItem";
import type { UniformValue } from "../RenderDevice";

/**
 * Every registered feature active under `input.flags` contributes its bit
 * under its id when `select` returns a value. ForwardPass (draw key) and the
 * Renderer warmup merge this into the forward record's `features`, so equal
 * inputs give equal keys.
 */
export function selectShaderFeatureBits(input: ShaderFeatureSelectInput): Record<string, string | number | boolean> {
  const bits: Record<string, string | number | boolean> = {};
  for (const feature of shaderFeaturesFor(input.flags)) {
    const value = feature.select(input);
    if (value !== undefined) bits[feature.id] = value;
  }
  return bits;
}

/** Per-draw uniforms of the features a record selected, written through `set`. */
export function bindShaderFeatureUniforms(
  features: ProgramFeatures["features"],
  flags: QrFlags,
  item: RenderItem,
  set: (name: string, value: UniformValue) => void
): void {
  for (const feature of shaderFeaturesFor(flags)) {
    const value = features[feature.id];
    if (value !== undefined) feature.bindUniforms?.(value, item, set);
  }
}
