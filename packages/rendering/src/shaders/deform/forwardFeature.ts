/**
 * PRD-06 T2.2 — the forward `prd06.deform` C-02 `ShaderFeature`
 * (PRD-06 §269, §1145, §1222).
 *
 * `select` produces the deform program key per item:
 *   `skin4` | `skin8`            — joint-palette skinning (4/8 influences)
 *   `morph<B>[n][t]`             — §8.2 bucket {4,8,16,32}, `n`/`t` when the
 *                                  packed set carries normal/tangent deltas
 *   `|k<K>`                      — `A3D_MORPH_MAX_ACTIVE` (C-27 tier cap)
 * Combined with `|` (e.g. `skin8|morph16n|k32`); a rigid item returns
 * `undefined` so it keeps the base program.
 *
 * `defines` emits `A3D_SKINNING`, `A3D_MORPH` (bucket), `A3D_MORPH_NORMALS`,
 * `A3D_MORPH_TANGENTS`, `A3D_HAS_TANGENT` and `A3D_MORPH_MAX_ACTIVE` parsed
 * back out of the key. A `true` stamp (the pre-select MaterialFeatures record)
 * contributes the chunks/hook with no defines — a compile-clean passthrough
 * until the per-item select consumer lands (qr-request Q-01-4).
 *
 * `bindUniforms` binds the shared bone-texture palette (`bindBoneTexture`,
 * same cache entry as the forward/draw-time bind so depth and velocity see
 * this frame's upload) plus the morph array texture and the packed top-K
 * active list when the item carries morphs.
 *
 * Draw-time consumption note: nothing in the forward path calls
 * `select`/`bindUniforms` per item yet (Q-01-4). The lane-side consumer is
 * `applyGpuMorphUniforms` in `forward/Deform.ts`, which delegates to
 * `bindPrd06MorphTextureUniforms` when the bound program declares
 * `u_morphTexture` — its K comes from the program's own reflected
 * `u_morphActiveIndex4` array bound, which equals the `A3D_MORPH_MAX_ACTIVE`
 * it was compiled with.
 */

import type { AuraQualityTierSettings } from "../../contracts/quality.js";
import type { QrFlags, QrFlagName } from "../../contracts/core.js";
import type { RenderItem } from "../../contracts/renderItem.js";
import {
  registerShaderFeature,
  type ShaderFeature,
  type ShaderFeatureSelectInput
} from "../../contracts/program.js";
import type { UniformValue, RenderShaderProgram } from "../../RenderDevice.js";
import type { Geometry } from "../../Geometry.js";
import type { MorphTargetDelta } from "../../MorphTarget.js";
import { TextureBinding } from "../../TextureBinding.js";
import type { SkinningPaletteTextureCache } from "../../SkinningPaletteTextureCache.js";
import { bindBoneTexture } from "../../SkinningUniforms.js";
import { morphTargetBucket, type MorphTargetTextureResult, type MorphTextureLimits } from "../../resources/MorphTargetTexture.js";

/** §970: morph bits join the key only under the GPU-morph sub-flag. */
const GPU_MORPH_FLAG: QrFlagName = "A3D_QR_ANIMATION_GPU_MORPH";

/**
 * C-27 active-morph caps (§285/§699): 8 Low / 16 Medium / 32 High / 64 Ultra.
 * `AuraQualityTierSettings` carries no tier name, so `maxLightsPerPixel`
 * (4/8/16/32, unique per stock tier) discriminates; custom overrides keep the
 * nearest lower cap. Q-11-2 allows PRD-06 constants keyed by tier until the
 * C-27 contract lands.
 */
export function morphMaxActiveForTier(tier: AuraQualityTierSettings): number {
  const d = tier.maxLightsPerPixel;
  return d >= 32 ? 64 : d >= 16 ? 32 : d >= 8 ? 16 : 8;
}

/**
 * The morph segment of the select key (`morph<B>[n][t]|k<K>`), or null when
 * the item carries no morph data or the GPU-morph flag is off (CPU morph then
 * stays responsible — T2.3).
 */
function selectMorphSegment(item: RenderItem, tier: AuraQualityTierSettings, flags: QrFlags): string | null {
  const targets = item.morphTargets;
  if (!targets || targets.length === 0) return null;
  if (!flags.on(GPU_MORPH_FLAG)) return null;
  const bucket = morphTargetBucket(Math.min(targets.length, 32));
  if (!bucket) return null;
  const hasNormals = targets.some((t) => (t.normals?.length ?? 0) > 0);
  const hasTangents = targets.some((t) => (t.tangents?.length ?? 0) > 0);
  return `morph${bucket}${hasNormals ? "n" : ""}${hasTangents ? "t" : ""}|k${morphMaxActiveForTier(tier)}`;
}

/** The `prd06.deform` feature key for an item, or undefined when rigid. */
export function selectPrd06DeformValue(
  item: RenderItem,
  pass: ShaderFeatureSelectInput["pass"],
  tier: AuraQualityTierSettings,
  flags: QrFlags
): string | undefined {
  if (pass !== "forward") return undefined;
  const parts: string[] = [];
  const skinning = item.skinning;
  if (skinning) parts.push(skinning.extraInfluences ? "skin8" : "skin4");
  const morph = selectMorphSegment(item, tier, flags);
  if (morph) parts.push(morph);
  return parts.length > 0 ? parts.join("|") : undefined;
}

export interface Prd06DeformKey {
  readonly influences: 4 | 8 | null;
  readonly morphBucket: 4 | 8 | 16 | 32 | null;
  readonly morphNormals: boolean;
  readonly morphTangents: boolean;
  readonly morphMaxActive: number | null;
}

/** Parse a select-produced key back into its parts. Unknown segments are ignored. */
export function parsePrd06DeformKey(value: string): Prd06DeformKey {
  let influences: 4 | 8 | null = null;
  let morphBucket: Prd06DeformKey["morphBucket"] = null;
  let morphNormals = false;
  let morphTangents = false;
  let morphMaxActive: number | null = null;
  for (const segment of value.split("|")) {
    if (segment === "skin4" || segment === "skin8") {
      influences = segment === "skin8" ? 8 : 4;
      continue;
    }
    const morph = /^morph(4|8|16|32)(n?)(t?)$/.exec(segment);
    if (morph) {
      morphBucket = Number(morph[1]) as Prd06DeformKey["morphBucket"];
      morphNormals = morph[2] === "n";
      morphTangents = morph[3] === "t";
      continue;
    }
    const k = /^k(\d+)$/.exec(segment);
    if (k) morphMaxActive = Number(k[1]);
  }
  return { influences, morphBucket, morphNormals, morphTangents, morphMaxActive };
}

/** `defines` for a select-produced key; `true` (pre-select stamp) contributes no defines. */
export function prd06DeformDefines(value: string | number | boolean): Readonly<Record<string, string | number | true>> {
  if (typeof value !== "string") return {};
  const key = parsePrd06DeformKey(value);
  const defines: Record<string, string | number | true> = {};
  if (key.influences) defines.A3D_SKINNING = key.influences;
  if (key.morphBucket) {
    defines.A3D_MORPH = key.morphBucket;
    defines.A3D_MORPH_MAX_ACTIVE = key.morphMaxActive ?? 32;
    if (key.morphNormals) defines.A3D_MORPH_NORMALS = true;
    if (key.morphTangents) {
      defines.A3D_MORPH_TANGENTS = true;
      defines.A3D_HAS_TANGENT = true;
    }
  }
  return defines;
}

/* ----------------------------------------------------- morph texture bind */

/** Build function injected at registration — the C-18 provider (flag-deferring). */
type MorphTextureBuilder = (
  geometry: Geometry,
  targets: readonly MorphTargetDelta[],
  limits: MorphTextureLimits,
  format?: "rgba16f" | "rgba32f"
) => MorphTargetTextureResult;

/**
 * Conservative bind-time texture limits. `MorphTextureLimits` normally derives
 * from tier device caps; at uniform-bind time only the compiled program is
 * visible, so the WebGL2 baseline-safe `{4096, 32}` applies (the builder
 * falls back to CPU when exceeded — `applyGpuMorphUniforms` then reports the
 * CPU path). 32 layers is the §8.2 bucket ceiling.
 */
export const PRD06_MORPH_TEXTURE_LIMITS: MorphTextureLimits = { maxTextureSize: 4096, maxArrayLayers: 32 };

// `var` + lazy init: the lane barrel → Deform → forwardFeature import cycle
// (forwardFeature → SkinningUniforms → ForwardPass → Deform → lanes/prd06)
// can call `createPrd06DeformFeature` before this module body finishes —
// `let`/`const` bindings would sit in TDZ, and an `= null` initializer would
// clobber the value registration already assigned. Uninitialized `var` hoists
// safely in both cases.
var morphTextureBuilder: MorphTextureBuilder | null | undefined;
var morphTextureCache: WeakMap<Geometry, { targets: readonly MorphTargetDelta[]; result: MorphTargetTextureResult }> | undefined;

/** WeakMap: geometry → last-built result. Rebuilds only when the targets array identity changes. */
function morphTextureFor(item: RenderItem): MorphTargetTextureResult | undefined {
  const targets = item.morphTargets;
  if (!targets || targets.length === 0 || !morphTextureBuilder) return undefined;
  morphTextureCache ??= new WeakMap();
  const cached = morphTextureCache.get(item.geometry);
  if (cached && cached.targets === targets) return cached.result;
  const result = morphTextureBuilder(item.geometry, targets, PRD06_MORPH_TEXTURE_LIMITS);
  morphTextureCache.set(item.geometry, { targets, result });
  return result;
}

/**
 * §8.2 top-K packing: non-zero weights sorted by |w| desc, first `maxActive`,
 * padded to a multiple of 4 with index 0 / weight 0. Returns the packed index
 * and weight arrays (`maxActive` floats each — K/4 vec4 slots on the wire).
 */
export function packActiveMorphs(
  weights: readonly number[] | Float32Array,
  targetCount: number,
  maxActive: number,
  previousWeights?: Float32Array
): { indices: Float32Array; current: Float32Array; previous: Float32Array | null; count: number } {
  const order: number[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    if (Math.abs(weights[i] ?? 0) > 0) order.push(i);
  }
  order.sort((a, b) => Math.abs(weights[b] ?? 0) - Math.abs(weights[a] ?? 0));
  const count = Math.min(order.length, maxActive);
  const padded = Math.ceil(Math.max(count, 4) / 4) * 4;
  const size = Math.min(padded, Math.ceil(maxActive / 4) * 4);
  const indices = new Float32Array(size);
  const current = new Float32Array(size);
  const previous = previousWeights ? new Float32Array(size) : null;
  for (let k = 0; k < count; k += 1) {
    const target = order[k]!;
    indices[k] = target;
    current[k] = weights[target] ?? 0;
    if (previous && previousWeights) previous[k] = previousWeights[target] ?? 0;
  }
  return { indices, current, previous, count };
}

/**
 * Bind the §8.2 morph uniforms onto `uniforms`. Returns false when the item
 * has no morphs, no builder is registered, or the texture build fell back to
 * CPU (caller then takes the CPU path). `maxActive` is the compiled
 * `A3D_MORPH_MAX_ACTIVE` — the program's own `u_morphActiveIndex4` array bound.
 */
export function bindPrd06MorphTextureUniforms(
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): boolean {
  if (!shader.reflection.uniforms.has("u_morphTexture")) return false;
  if (!item.morphTargets || !item.morphWeights) return false;
  const result = morphTextureFor(item);
  if (!result || "fallback" in result) return false;
  const arrayBound = shader.reflection.uniformDetails.get("u_morphActiveIndex4")?.arraySize;
  const maxActive = arrayBound !== null && arrayBound !== undefined && arrayBound > 0 ? arrayBound * 4 : 32;
  const packed = packActiveMorphs(item.morphWeights, result.targetCount, maxActive, item.previousMorphWeights);
  uniforms.set("u_morphTexture", new TextureBinding({ name: "u_morphTexture", texture: result.texture }));
  uniforms.set("u_morphStride", result.stride);
  uniforms.set("u_morphTexWidth", result.texture.width);
  uniforms.set("u_morphActiveCount", packed.count);
  uniforms.set("u_morphActiveIndex4", packed.indices);
  uniforms.set("u_morphActiveWeight4", packed.current);
  if (packed.previous) uniforms.set("u_morphPrevWeight4", packed.previous);
  return true;
}

/* ------------------------------------------------------------------ feature */

export function createPrd06DeformFeature(cache: SkinningPaletteTextureCache, buildMorphTexture: MorphTextureBuilder): ShaderFeature {
  morphTextureBuilder = buildMorphTexture;
  return {
    id: "prd06.deform",
    owner: "prd06",
    flag: "A3D_QR_ANIMATION",
    // hookSplice pairs chunks[i] with hooks[i] (one chunk per hook index):
    // skinning_common lands at `vertex:pars` (dragging morph_texture behind it
    // via `requires`), a3d_prd06_deform lands at `vertex:deform` — helpers
    // declared before the function that calls them.
    chunks: ["a3d_prd06_skinning_common", "a3d_prd06_deform"],
    hooks: ["vertex:pars", "vertex:deform"],
    select(input: ShaderFeatureSelectInput): string | undefined {
      return selectPrd06DeformValue(input.item, input.pass, input.tier, input.flags);
    },
    defines(value: string | number | boolean): Readonly<Record<string, string | number | true>> {
      return prd06DeformDefines(value);
    },
    bindUniforms(value: string | number | boolean, item: RenderItem, set: (name: string, v: UniformValue) => void): void {
      if (item.skinning) bindBoneTexture(set, cache, item);
      const key = typeof value === "string" ? parsePrd06DeformKey(value) : null;
      if (!key || key.morphBucket === null) return;
      const result = morphTextureFor(item);
      if (!result || "fallback" in result || !item.morphWeights) return;
      const maxActive = key.morphMaxActive ?? 32;
      const packed = packActiveMorphs(item.morphWeights, result.targetCount, maxActive, item.previousMorphWeights);
      set("u_morphTexture", new TextureBinding({ name: "u_morphTexture", texture: result.texture }));
      set("u_morphStride", result.stride);
      set("u_morphTexWidth", result.texture.width);
      set("u_morphActiveCount", packed.count);
      set("u_morphActiveIndex4", packed.indices);
      set("u_morphActiveWeight4", packed.current);
      if (packed.previous) set("u_morphPrevWeight4", packed.previous);
    }
  };
}

/** Registers the forward feature; returns the C-02 registry disposer. Idempotent per call site. */
export function registerPrd06DeformFeature(cache: SkinningPaletteTextureCache, buildMorphTexture: MorphTextureBuilder): () => void {
  return registerShaderFeature(createPrd06DeformFeature(cache, buildMorphTexture));
}
