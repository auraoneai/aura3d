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
import type { ProgramFeatures, ShaderChunk, ShaderFeature, ShaderFeatureSelectInput, ShaderHookPoint } from "../contracts/program";
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

function unchangedDataProperty(
  object: object,
  prototype: object | null,
  key: string,
  before: PropertyDescriptor | undefined
): boolean {
  const now = Object.getOwnPropertyDescriptor(object, key);
  if (before) {
    return !!now && "value" in before && "value" in now && now.value === before.value &&
      now.writable === before.writable && now.enumerable === before.enumerable && now.configurable === before.configurable;
  }
  if (now) return false;
  // Optional fields must not acquire inherited implementations. Inspect
  // descriptors rather than reading a potentially user-installed getter.
  for (let current = prototype; current; current = Object.getPrototypeOf(current)) {
    if (Object.getOwnPropertyDescriptor(current, key)) return false;
  }
  return true;
}

/**
 * Capture the actual stock objects and their producer functions, not their
 * public IDs.  Registrations are mutable at runtime, so identity alone is
 * insufficient for an optional pass which must not call an unknown producer.
 */
export function stockFeatureVerifier(features: readonly ShaderFeature[]): (feature: ShaderFeature) => boolean {
  const keys = ["id", "owner", "flag", "order", "select", "defines", "bindUniforms", "chunks", "hooks"] as const;
  const snapshots = new Map(features.map((feature) => {
    const prototype = Object.getPrototypeOf(feature) as object | null;
    const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(feature, key));
    const chunks = [...feature.chunks];
    const hooks = [...feature.hooks];
    return [feature, { prototype, descriptors, chunks, hooks }] as const;
  }));
  return (feature) => {
    const snapshot = snapshots.get(feature);
    if (!snapshot || Object.getPrototypeOf(feature) !== snapshot.prototype) return false;
    for (let i = 0; i < keys.length; i++) {
      if (!unchangedDataProperty(feature, snapshot.prototype, keys[i]!, snapshot.descriptors[i])) return false;
    }
    return stockArrayMatches(feature.chunks, snapshot.chunks) && stockArrayMatches(feature.hooks, snapshot.hooks);
  };
}

/** Inspect original stock arrays without invoking a replaced iterator/getter. */
export function stockArrayMatches(array: readonly unknown[], expected: readonly unknown[]): boolean {
  if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype ||
      Object.getOwnPropertyNames(array).length !== expected.length + 1 ||
      Object.getOwnPropertySymbols(array).length !== 0) return false;
  const length = Object.getOwnPropertyDescriptor(array, "length");
  if (!length || !("value" in length) || length.value !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(array, String(i));
    if (!entry || !("value" in entry) || entry.value !== expected[i]) return false;
  }
  return true;
}

/**
 * Snapshot stock chunks in their defining module, before registration exposes
 * them. A matching name or GLSL string alone is not producer authentication.
 */
export function stockChunkVerifier(chunks: readonly ShaderChunk[]): (chunk: ShaderChunk) => boolean {
  const keys = ["name", "owner", "stage", "glsl", "wgsl", "requires"] as const;
  const snapshots = new Map(chunks.map((chunk) => {
    const prototype = Object.getPrototypeOf(chunk) as object | null;
    const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(chunk, key));
    const requires = chunk.requires;
    return [chunk, { prototype, descriptors, requires: requires ? [...requires] : undefined }] as const;
  }));
  return (chunk) => {
    const snapshot = snapshots.get(chunk);
    if (!snapshot || Object.getPrototypeOf(chunk) !== snapshot.prototype) return false;
    for (let i = 0; i < keys.length; i++) {
      if (!unchangedDataProperty(chunk, snapshot.prototype, keys[i]!, snapshot.descriptors[i])) return false;
    }
    const requires = snapshot.descriptors[5]?.value as readonly unknown[] | undefined;
    return requires === undefined ? snapshot.requires === undefined :
      snapshot.requires !== undefined && stockArrayMatches(requires, snapshot.requires);
  };
}

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
 *
 * `observe` (selective-bloom frames only) sees each feature that actually
 * selected a bit for this draw, during the ordinary loop: nothing is
 * selected a second time, and a registered feature that selects nothing
 * contributes nothing to the program.
 */
export function selectShaderFeatureBits(
  input: ShaderFeatureSelectInput,
  observe?: (feature: ShaderFeature) => void
): Record<string, string | number | boolean> {
  const bits: Record<string, string | number | boolean> = {};
  for (const feature of shaderFeaturesFor(input.flags)) {
    if (!generatorReady(feature)) continue;
    const value = feature.select(input);
    if (value !== undefined) {
      observe?.(feature);
      bits[feature.id] = value;
    }
  }
  return bits;
}

/**
 * Per-draw uniforms of the features a record selected, written through `set`.
 * `observe` (selective-bloom frames only) sees each feature whose binder runs.
 */
export function bindShaderFeatureUniforms(
  features: ProgramFeatures["features"],
  flags: QrFlags,
  item: RenderItem,
  set: (name: string, value: UniformValue) => void,
  observe?: (feature: ShaderFeature) => void
): void {
  for (const feature of shaderFeaturesFor(flags)) {
    const value = features[feature.id];
    if (value !== undefined) {
      observe?.(feature);
      feature.bindUniforms?.(value, item, set);
    }
  }
}
