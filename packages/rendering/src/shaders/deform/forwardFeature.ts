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
 * this frame's upload) plus the morph array texture and the complete active
 * list when it fits the shader's capacity. Larger sets take the CPU path.
 *
 * The forward path selects and binds the feature per item. Its final morph
 * dispatch also calls `bindPrd06MorphTextureUniforms`, which reads the
 * compiled program's reflected `u_morphActiveIndex4` bound before binding.
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
import type { Texture } from "../../Texture.js";
import { TextureBinding } from "../../TextureBinding.js";
import type { SkinningPaletteTextureCache } from "../../SkinningPaletteTextureCache.js";
import { bindBoneTexture } from "../../SkinningUniforms.js";
import { planMorphTargetTexture, type MorphTargetTextureResult, type MorphTextureLimits } from "../../resources/MorphTargetTexture.js";

/** §970: morph bits join the key only under the GPU-morph sub-flag. */
const GPU_MORPH_FLAG: QrFlagName = "A3D_QR_ANIMATION_GPU_MORPH";

/** Conservative array-texture limits used for both selection and binding. */
export const PRD06_MORPH_TEXTURE_LIMITS: MorphTextureLimits = { maxTextureSize: 4096, maxArrayLayers: 32 };

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
  const layout = planMorphTargetTexture(item.geometry, targets, PRD06_MORPH_TEXTURE_LIMITS);
  if ("fallback" in layout) return null;
  const maxActive = morphMaxActiveForTier(tier);
  if (!morphWeightsFit(item.morphWeights, item.previousMorphWeights, targets.length, maxActive)) return null;
  // The registered provider can also decline (for example when its runtime
  // flag is disabled). Decide before choosing the shader: feature binding
  // happens before the draw can switch to CPU-deformed geometry.
  const result = morphTextureFor(item);
  if (!result || "fallback" in result) return null;
  return `morph${layout.bucket}${layout.hasNormals ? "n" : ""}${layout.hasTangents ? "t" : ""}|k${maxActive}`;
}

/** Every active current or previous target must fit; omission changes the pose or velocity. */
function morphWeightsFit(
  weights: readonly number[] | Float32Array | undefined,
  previousWeights: Float32Array | undefined,
  targetCount: number,
  maxActive: number
): boolean {
  let active = 0;
  for (let i = 0; i < targetCount; i += 1) {
    const current = weights?.[i] ?? 0;
    const previous = previousWeights?.[i] ?? 0;
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
      throw new Error(`Morph weights must be finite (target ${i})`);
    }
    if (current !== 0 || previous !== 0) active += 1;
  }
  return active <= maxActive;
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

// `var` + lazy init: the lane barrel → Deform → forwardFeature import cycle
// (forwardFeature → SkinningUniforms → ForwardPass → Deform → lanes/prd06)
// can call `createPrd06DeformFeature` before this module body finishes —
// `let`/`const` bindings would sit in TDZ, and an `= null` initializer would
// clobber the value registration already assigned. Uninitialized `var` hoists
// safely in both cases.
var morphTextureBuilder: MorphTextureBuilder | null | undefined;
var morphTextureCache: WeakMap<Geometry, { targets: readonly MorphTargetDelta[]; result: MorphTargetTextureResult }> | undefined;
var liveMorphTextures: Set<Texture> | undefined;

/** WeakMap: geometry → last-built result. Rebuilds only when the targets array identity changes. */
function morphTextureFor(item: RenderItem): MorphTargetTextureResult | undefined {
  const targets = item.morphTargets;
  if (!targets || targets.length === 0 || !morphTextureBuilder) return undefined;
  morphTextureCache ??= new WeakMap();
  const cached = morphTextureCache.get(item.geometry);
  if (cached && cached.targets === targets) return cached.result;
  if (cached !== undefined && "texture" in cached.result) {
    cached.result.texture.dispose();
    liveMorphTextures?.delete(cached.result.texture);
  }
  const result = morphTextureBuilder(item.geometry, targets, PRD06_MORPH_TEXTURE_LIMITS);
  // A provider can become available after a flag change; do not retain a
  // fallback as if it were a permanent property of this geometry.
  if ("fallback" in result) {
    morphTextureCache.delete(item.geometry);
    return result;
  }
  morphTextureCache.set(item.geometry, { targets, result });
  if ("texture" in result) {
    liveMorphTextures ??= new Set();
    liveMorphTextures.add(result.texture);
  }
  return result;
}

/**
 * §16 S3 — public acquire seam: build-or-return the §8.2 morph array texture
 * for an item, exactly the call the feature's `bindUniforms` makes per frame.
 * Exported so teardown paths and the lifecycle spec's acquisition step use
 * the same cache the feature binds from (no second morph-texture source).
 */
export function ensureMorphTargetTexture(item: RenderItem): MorphTargetTextureResult | undefined {
  return morphTextureFor(item);
}

/**
 * §16 S3 — actor teardown frees its morph array texture: the cached
 * `Texture` is disposed (dropping it from the WebGL2 live-texture count) and
 * the geometry's cache entry cleared so a later load rebuilds fresh. Mirrors
 * `releasePalette`'s seam — `GLTFSceneAnimationRuntime.dispose` and the
 * `prd06.animation` actor-extension dispose call it per renderable geometry.
 */
export function releaseMorphTargetTexture(geometry: Geometry): void {
  const cached = morphTextureCache?.get(geometry);
  if (cached === undefined) return;
  if ("texture" in cached.result) {
    cached.result.texture.dispose();
    liveMorphTextures?.delete(cached.result.texture);
  }
  morphTextureCache?.delete(geometry);
}

/** §16 S3 counter — live (non-disposed) morph array textures + bytes. */
export function morphTextureDiagnostics(): { readonly textures: number; readonly bytes: number } {
  let bytes = 0;
  let textures = 0;
  for (const texture of liveMorphTextures ?? []) {
    if (texture.disposed) continue;
    textures += 1;
    bytes += texture.byteLength;
  }
  return { textures, bytes };
}

/**
 * §8.2 top-K packing: non-zero current or previous weights sorted by current
 * |w| (then previous |w|), first `maxActive`,
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
    if (Math.abs(weights[i] ?? 0) > 0 || Math.abs(previousWeights?.[i] ?? 0) > 0) order.push(i);
  }
  order.sort((a, b) => Math.abs(weights[b] ?? 0) - Math.abs(weights[a] ?? 0)
    || Math.abs(previousWeights?.[b] ?? 0) - Math.abs(previousWeights?.[a] ?? 0));
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
  const arrayBound = shader.reflection.uniformDetails.get("u_morphActiveIndex4")?.arraySize;
  const maxActive = arrayBound !== null && arrayBound !== undefined && arrayBound > 0 ? arrayBound * 4 : 32;
  if (!morphWeightsFit(item.morphWeights, item.previousMorphWeights, item.morphTargets.length, maxActive)) return false;
  const result = morphTextureFor(item);
  if (!result || "fallback" in result) return false;
  const packed = packActiveMorphs(item.morphWeights, result.targetCount, maxActive, item.previousMorphWeights);
  uniforms.set("u_morphTexture", new TextureBinding({ name: "u_morphTexture", texture: result.texture }));
  uniforms.set("u_morphStride", result.stride);
  uniforms.set("u_morphTexWidth", result.texture.width);
  uniforms.set("u_morphActiveCount", packed.count);
  uniforms.set("u_morphActiveIndex4", packed.indices);
  uniforms.set("u_morphActiveWeight4", packed.current);
  if (shader.reflection.uniforms.has("u_morphPrevWeight4")) {
    uniforms.set("u_morphPrevWeight4", packed.previous ?? new Float32Array(packed.current.length));
  }
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
      const maxActive = key.morphMaxActive ?? 32;
      if (item.morphTargets && item.morphWeights &&
          !morphWeightsFit(item.morphWeights, item.previousMorphWeights, item.morphTargets.length, maxActive)) {
        throw new Error("Morph weights exceed the selected GPU shader capacity; CPU deformation is required");
      }
      const result = morphTextureFor(item);
      if (result && "fallback" in result) {
        throw new Error(`Morph texture requires CPU deformation: ${result.reason}`);
      }
      if (!result || !item.morphWeights) return;
      const packed = packActiveMorphs(item.morphWeights, result.targetCount, maxActive, item.previousMorphWeights);
      set("u_morphTexture", new TextureBinding({ name: "u_morphTexture", texture: result.texture }));
      set("u_morphStride", result.stride);
      set("u_morphTexWidth", result.texture.width);
      set("u_morphActiveCount", packed.count);
      set("u_morphActiveIndex4", packed.indices);
      set("u_morphActiveWeight4", packed.current);
      set("u_morphPrevWeight4", packed.previous ?? new Float32Array(packed.current.length));
    }
  };
}

/** Registers the forward feature; returns the C-02 registry disposer. Idempotent per call site. */
export function registerPrd06DeformFeature(cache: SkinningPaletteTextureCache, buildMorphTexture: MorphTextureBuilder): () => void {
  return registerShaderFeature(createPrd06DeformFeature(cache, buildMorphTexture));
}
