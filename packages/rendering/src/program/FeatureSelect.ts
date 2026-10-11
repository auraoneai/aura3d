/**
 * `program/FeatureSelect.ts` (PRD-01 §6.4, C-02, T0-05) — per-draw
 * `ShaderFeature.select` + `bindUniforms`, and the generated-path
 * compatibility rule for registered features.
 *
 * Kept out of `MaterialFeatures.ts`: that module is imported by `Material.ts`,
 * and a value import of `contracts/program` there closes an import cycle
 * through `PBRMaterial`.
 */

import type { QrFlags } from "../contracts/core";
import type { ProgramFeatures, ShaderFeature, ShaderFeatureSelectInput, ShaderHookPoint } from "../contracts/program";
import { shaderChunk, shaderFeaturesFor } from "../contracts/program";
import type { RenderItem } from "../contracts/renderItem";
import type { UniformValue } from "../RenderDevice";

/** Hooks whose chunks are global-scope declarations (mirrors ProgramGenerator). */
export const DECLARATION_HOOKS: ReadonlySet<ShaderHookPoint> = new Set<ShaderHookPoint>(["vertex:pars", "vertex:deform", "fragment:pars"]);

const TOP_LEVEL_UNIFORM = /^\s*uniform\s/m;
const FUNCTION_DEFINITION = /^\s*(?:void|float|int|uint|bool|[iu]?vec[234]|mat[234](?:x[234])?|[A-Z]\w*)\s+\w+\s*\([^;{]*\)\s*\{/m;
const STRUCT_DEFINITION = /^\s*struct\s+\w+\s*\{/m;

/** A call chunk is statements only: it may run inside `main()`. */
export function isCallChunkGlsl(glsl: string): boolean {
  return !TOP_LEVEL_UNIFORM.test(glsl) && !FUNCTION_DEFINITION.test(glsl) && !STRUCT_DEFINITION.test(glsl);
}

/**
 * Why a registered feature cannot run on the generated (C-02) path, or
 * undefined when it can. Body-hook chunks must be call chunks (unless the
 * same feature also declares that chunk at a declaration hook), and a
 * `vertex:deform` contributor must define `a3dDeform(...)`, which the
 * generator calls canonically (C-18).
 */
export function featureGeneratorIncompatibility(feature: ShaderFeature): string | undefined {
  const chunkAt = (i: number) => feature.chunks[Math.min(i, feature.chunks.length - 1)];
  for (let i = 0; i < feature.hooks.length; i++) {
    const hook = feature.hooks[i]!;
    const name = chunkAt(i);
    if (name === undefined) continue;
    const chunk = shaderChunk(name);
    if (!chunk) return `chunk ${name} is not registered`;
    if (hook === "vertex:deform" && !/\bvoid\s+a3dDeform\s*\(/.test(chunk.glsl)) {
      return `vertex:deform chunk ${name} does not define a3dDeform()`;
    }
    if (DECLARATION_HOOKS.has(hook)) continue;
    const declaredElsewhere = feature.hooks.some((h, j) => DECLARATION_HOOKS.has(h) && chunkAt(j) === name);
    if (!declaredElsewhere && !isCallChunkGlsl(chunk.glsl)) {
      return `${hook} chunk ${name} has global declarations (needs a pars/call split)`;
    }
  }
  return undefined;
}

const verdicts = new WeakMap<ShaderFeature, string | null>();
const warned = new Set<string>();

function generatorReady(feature: ShaderFeature): boolean {
  let verdict = verdicts.get(feature);
  if (verdict === undefined) {
    verdict = featureGeneratorIncompatibility(feature) ?? null;
    verdicts.set(feature, verdict);
  }
  if (verdict !== null && !warned.has(feature.id)) {
    warned.add(feature.id);
    console.warn(`[prd01] ShaderFeature "${feature.id}" (${feature.owner}) is skipped on the generated-program path: ${verdict}`);
  }
  return verdict === null;
}

/**
 * Every registered feature active under `input.flags` that can run on the
 * generated path contributes its bit under its id when `select` returns a
 * value. ForwardPass (draw key) and the Renderer warmup merge this into the
 * forward record's `features`, so equal inputs give equal keys.
 */
export function selectShaderFeatureBits(input: ShaderFeatureSelectInput): Record<string, string | number | boolean> {
  const bits: Record<string, string | number | boolean> = {};
  for (const feature of shaderFeaturesFor(input.flags)) {
    if (!generatorReady(feature)) continue;
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
