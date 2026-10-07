/**
 * Lane prd06 barrel — owned by lane 06 (CONTRACTS.md §3.8). Provides the C-18
 * real implementations (palette cache + morph texture), registers the
 * `a3d_prd06_*` shader chunks and the `prd06.deform` C-02/C-11 features, and
 * resolves lane flags for code paths that run without engine flag installation.
 */

import { defineContractSlot, type ContractSlot, type QrFlagName, type QrFlagValue, type QrFlags } from "../contracts/core.js";
import { registerShaderChunk } from "../contracts/program.js";
import { rendererQrFlags } from "../renderer/FrameGraph.js";
import { Texture } from "../Texture.js";
import { SkinningPaletteTextureCache, type SkinningPaletteTextureCacheLike } from "../SkinningPaletteTextureCache.js";
import { buildMorphTargetTexture, type MorphTargetTextureResult } from "../resources/MorphTargetTexture.js";
import type { Geometry } from "../Geometry.js";
import type { MorphTargetDelta } from "../MorphTarget.js";
import type { MorphTextureLimits } from "../resources/MorphTargetTexture.js";
import type { RenderDevice } from "../RenderDevice.js";
import { A3D_PRD06_SKINNING_COMMON_GLSL } from "../shaders/deform/skinning.glsl.js";
import { A3D_PRD06_MORPH_TEXTURE_GLSL } from "../shaders/deform/morph.glsl.js";
import { A3D_PRD06_DEFORM_GLSL } from "../shaders/deform/deform.glsl.js";
import { registerPrd06DeformDepthFeature } from "../shaders/deform/depthFeature.js";
import { registerPrd06DeformFeature } from "../shaders/deform/forwardFeature.js";
import { registerSkinnedBoundsProvider } from "../contracts/shadows.js";
import { prd06SkinnedBounds } from "../renderer/SkinnedBounds.js";

/* ------------------------------------------------------------------ flags */

/**
 * PRD-06 flag reads. Primary source is `setRendererQrFlags` (the engine installs
 * resolved flags for renderer internals; qr-request Q-15-4 pending — until it
 * lands the renderer is never wired, so this falls back to the same URL/env
 * semantics `resolveQrFlags` defines: `?a3d-qr=` first, then `A3D_QR` /
 * `VITE_A3D_QR`, then per-flag `A3D_QR_<NAME>`). Registry default: off.
 */
let fallbackFlags: QrFlags | null = null;

const SHORT_LANE: Readonly<Record<string, QrFlagName>> = {
  core: "A3D_QR_CORE",
  lighting: "A3D_QR_LIGHTING",
  post: "A3D_QR_POST",
  materials: "A3D_QR_MATERIALS",
  assets: "A3D_QR_ASSETS",
  animation: "A3D_QR_ANIMATION",
  vfx: "A3D_QR_VFX",
  camera: "A3D_QR_CAMERA",
  game: "A3D_QR_GAME",
  world: "A3D_QR_WORLD",
  tiers: "A3D_QR_TIERS",
  webgpu: "A3D_QR_WEBGPU",
  looks: "A3D_QR_LOOKS",
  compiler: "A3D_QR_COMPILER",
  strict: "A3D_QR_STRICT"
};

function shortFlagName(token: string): QrFlagName | null {
  const lower = token.toLowerCase();
  if (lower in SHORT_LANE) return SHORT_LANE[lower];
  const sub = lower.split(/[._]/);
  if (sub.length === 2 && sub[0]! in SHORT_LANE) {
    return `A3D_QR_${sub[0]!.toUpperCase()}_${sub[1]!.toUpperCase()}` as QrFlagName;
  }
  return null;
}

function applyFlagList(values: Record<string, QrFlagValue>, list: string): void {
  const trimmed = list.trim();
  if (trimmed === "all") {
    for (const flag of Object.values(SHORT_LANE)) values[flag] ??= true;
    return;
  }
  if (trimmed === "none" || trimmed === "") {
    for (const flag of Object.values(SHORT_LANE)) values[flag] ??= false;
    return;
  }
  for (const token of trimmed.split(",")) {
    const t = token.trim();
    if (!t) continue;
    const negated = t.startsWith("-");
    const body = negated ? t.slice(1) : t;
    const eq = body.indexOf("=");
    const name = shortFlagName(eq >= 0 ? body.slice(0, eq) : body);
    if (!name) continue;
    values[name] ??= negated ? false : eq >= 0 ? body.slice(eq + 1) : true;
  }
}

function readEnv(): Readonly<Record<string, string | undefined>> {
  const proc = typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }) : undefined;
  return proc?.env ?? {};
}

function resolveEnvironmentFlags(): QrFlags {
  const values: Record<string, QrFlagValue> = {};
  const loc = typeof location !== "undefined" ? new URL(location.href) : null;
  const urlList = loc?.searchParams.get("a3d-qr");
  if (urlList !== null && urlList !== undefined) applyFlagList(values, urlList);
  const env = readEnv();
  const envList = env.A3D_QR ?? env.VITE_A3D_QR;
  if (envList !== undefined) applyFlagList(values, envList);
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith("A3D_QR_") || raw === undefined) continue;
    values[name as QrFlagName] ??= raw === "0" || raw === "off" || raw === "false" ? false : raw === "1" || raw === "on" || raw === "true" ? true : raw;
  }
  const frozen = Object.freeze(values) as Readonly<Partial<Record<QrFlagName, QrFlagValue>>>;
  return {
    values: frozen,
    on(name: QrFlagName): boolean {
      const v = frozen[name];
      return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== "";
    }
  };
}

/** Resolved lane flags: installed renderer flags win; URL/env fallback otherwise. */
export function prd06QrFlags(): QrFlags {
  const installed = rendererQrFlags();
  if (Object.keys(installed.values).length > 0) return installed;
  fallbackFlags ??= resolveEnvironmentFlags();
  return fallbackFlags;
}

export function prd06FlagsOn(name: QrFlagName): boolean {
  return prd06QrFlags().on(name);
}

/* ------------------------------------------- C-18 deformation resources */

/**
 * Flag-off semantics (PR 0a): palettes allocate per draw, morph stays CPU.
 * The stub cache honours the C-18 shape while allocating fresh textures on
 * every `acquire` — exactly what `createSkinningPaletteTexture` did.
 */
class UncachedSkinningPalettes implements SkinningPaletteTextureCacheLike {
  acquire(_device: RenderDevice, _key: object, _jointCount: number): { readonly current: Texture; readonly previous: Texture } {
    throw new Error("PRD06_PENDING: skinning palette cache requires A3D_QR_ANIMATION");
  }
  upload(_key: object, _matrices: Float32Array): void {}
  swap(_key: object): void {}
  release(_key: object): void {}
  diagnostics(): { readonly textures: number; readonly bytes: number; readonly createdThisFrame: number } {
    return { textures: 0, bytes: 0, createdThisFrame: 0 };
  }
}

export interface DeformResources {
  /** Shared per-skin palette cache (forward + depth + velocity bind the same pair). */
  readonly skinningPalettes: SkinningPaletteTextureCacheLike;
  buildMorphTargetTexture(
    geometry: Geometry,
    targets: readonly MorphTargetDelta[],
    limits: MorphTextureLimits,
    format?: "rgba16f" | "rgba32f"
  ): MorphTargetTextureResult;
}

/**
 * C-18 slot declared in the lane barrel: `contracts/deform.ts` (owner 01)
 * carries the PR-0a stub types and the divergent `DEFORM_CHUNKS` record —
 * qr-request Q-01-CCR-06-6 asks owner 01 to move/re-point this declaration.
 */
export const deformResources: ContractSlot<DeformResources> = defineContractSlot<DeformResources>(
  "C-18",
  "prd06",
  "A3D_QR_ANIMATION",
  {
    skinningPalettes: new UncachedSkinningPalettes(),
    buildMorphTargetTexture: () => ({ fallback: "cpu", reason: "PRD06_PENDING" })
  }
);

/** One process-wide cache: forward binds and depth variants share it (§9.1). */
export const skinningPaletteCache = new SkinningPaletteTextureCache();

/**
 * §970 (T2.1): the real `buildMorphTargetTexture` is provided under
 * `A3D_QR_ANIMATION_GPU_MORPH` — the sub-flag off (alias
 * `renderer.morph: "cpu"`) returns the C-18 cpu fallback so
 * `resolveRenderGeometry` stays on the persistent-VBO path (T2.3). The read
 * defers to call time so app-installed flags win over import-order.
 */
const buildMorphTargetTextureProvided: DeformResources["buildMorphTargetTexture"] = (geometry, targets, limits, format) =>
  prd06FlagsOn("A3D_QR_ANIMATION_GPU_MORPH")
    ? buildMorphTargetTexture(geometry, targets, limits, format)
    : { fallback: "cpu", reason: "A3D_QR_ANIMATION_GPU_MORPH off" };

deformResources.provide({
  skinningPalettes: skinningPaletteCache,
  buildMorphTargetTexture: buildMorphTargetTextureProvided
});

/* --------------------------------------------------------- forward feature */

// T2.2 (PRD-06 §269/§1145): the forward `prd06.deform` C-02 feature. Registered
// unconditionally — the registry entry's `A3D_QR_ANIMATION` flag gates
// contribution through `shaderFeaturesFor(flags)`, so flag-off programs stay
// byte-identical and import order cannot strand the registration. The morph
// builder keeps its GPU_MORPH deferral: with the sub-flag off, `select` emits
// no morph segment and `bindUniforms` falls back to CPU morphs.
registerPrd06DeformFeature(skinningPaletteCache, buildMorphTargetTextureProvided);

/* ------------------------------------------------- deform shader chunks */

registerShaderChunk({
  name: "a3d_prd06_skinning_common",
  owner: "prd06",
  glsl: A3D_PRD06_SKINNING_COMMON_GLSL,
  stage: "vertex"
});
registerShaderChunk({
  name: "a3d_prd06_morph_texture",
  owner: "prd06",
  glsl: A3D_PRD06_MORPH_TEXTURE_GLSL,
  stage: "vertex"
});
registerShaderChunk({
  name: "a3d_prd06_deform",
  owner: "prd06",
  glsl: A3D_PRD06_DEFORM_GLSL,
  stage: "vertex",
  requires: ["a3d_prd06_skinning_common", "a3d_prd06_morph_texture"]
});

// `buildMorphTargetTexture` collides with the PR-0a contracts/deform stub export;
// reach the real impl through `deformResources.get(flags)` or the direct module.
export {
  morphTargetBucket,
  MORPH_TARGET_COUNT_BUCKETS,
  type MorphTargetTextureResult,
  type MorphTextureLimits
} from "../resources/MorphTargetTexture.js";
export { applySkinningUniformsCached, bindBoneTexture, bindBoneTextureForSkinning, paletteKeyOf } from "../SkinningUniforms.js";

/* --------------------------------------- T0.13 depth variant + bounds provider */

// Registered through the C-11 registries only while
// `A3D_QR_ANIMATION_SKINNED_SHADOWS` resolves on — flag-off keeps the lane's
// registries untouched (DepthPass consumption is C-11 real, Q-02-1).
if (prd06FlagsOn("A3D_QR_ANIMATION_SKINNED_SHADOWS")) {
  registerPrd06DeformDepthFeature(skinningPaletteCache);
  registerSkinnedBoundsProvider(prd06SkinnedBounds);
}
