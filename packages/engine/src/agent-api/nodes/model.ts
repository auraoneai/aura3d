// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetDefinition, AuraAssetRef, AuraModelOptions, AuraModelNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { defineAuraAssets } from "./assets.js";
import { material } from "./material.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { formatIgnoredOptions, unreadOptionKeys } from "./optionDiagnostics.js";
import { currentWorkerAssets } from "@aura3d/core";
import { assertValidPivot } from "../pivotGuard.js";

/**
 * Every top-level option `model()` reads, plus the transform extras it forwards to the node
 * (the render path reads `renderOrder`, `frustumCulled`, `layers`, `userData`; the scene graph
 * reads `rotationOrder`, `quaternion`). LOD and collider settings are retained on the
 * model snapshot; the renderer and physics bridge consume them independently.
 */
export const MODEL_OPTION_KEYS: readonly string[] = [
  "name", "position", "pivot", "rotation", "scale", "lookAt", "rotationOrder", "quaternion",
  "renderOrder", "frustumCulled", "layers", "userData",
  "material", "castShadow", "receiveShadow", "visible", "role", "scaleMode",
  "targetHeight", "targetMaxDimension", "targetLength", "physics", "hiddenNodeNames",
  "nodeTransforms", "materialOverrides", "variant", "wrinkle", "lod", "collider"
];

/** Builder label and readable keys for the OPTION_IGNORED note; `instances.model` passes its own. */
export interface ModelOptionGuard {
  readonly builder: string;
  readonly validKeys: readonly string[];
}

function modelIgnoredOptions(options: AuraModelOptions, guard: ModelOptionGuard): { readonly ignoredOptions?: readonly string[] } {
  const all = unreadOptionKeys(options, guard.validKeys);
  return all.length === 0 ? {} : { ignoredOptions: [formatIgnoredOptions(guard.builder, all, guard.validKeys)] };
}

function modelOptionError(message: string): never {
  const error = new Error(`MODEL_OPTION_UNSUPPORTED: ${message}`);
  Object.assign(error, { code: "MODEL_OPTION_UNSUPPORTED" });
  throw error;
}

function validateModelOptions(asset: AuraAssetRef<"model">, options: AuraModelOptions): void {
  validateModelColliderOption(asset, options);
  const lod = options.lod;
  if (lod !== undefined && lod !== false && lod !== "auto") {
    if (!lod || typeof lod !== "object" || "levels" in lod) {
      modelOptionError("model.lod accepts false, 'auto', or an MSFT_lod policy with bias and crossFadeSeconds; use distanceLod for authored primitive levels");
    }
    for (const key of Object.keys(lod)) {
      if (key !== "bias" && key !== "crossFadeSeconds") modelOptionError(`unknown model.lod field '${key}'`);
    }
    if (lod.bias !== undefined && (!Number.isFinite(lod.bias) || lod.bias <= 0)) {
      modelOptionError("model.lod.bias must be a finite positive number");
    }
    if (lod.crossFadeSeconds !== undefined && (!Number.isFinite(lod.crossFadeSeconds) || lod.crossFadeSeconds < 0)) {
      modelOptionError("model.lod.crossFadeSeconds must be a finite non-negative number");
    }
  }
}

/** `collider` is shared by model() and instances.model() (one bounds collider per instance there). */
function validateModelColliderOption(asset: AuraAssetRef<"model">, options: AuraModelOptions): void {
  const collider = options.collider;
  if (collider !== undefined && collider !== false && collider !== "auto" && collider !== "bounds") {
    modelOptionError("model.collider accepts false, 'auto', or 'bounds'");
  }
  if (collider === "auto" && asset.colliderUrl) {
    modelOptionError("model.collider 'auto' cannot load a collider sidecar in the synchronous scene physics bridge; use 'bounds' or an explicit physics shape");
  }
  if (collider && options.physics && (options.physics.shape !== undefined || options.physics.halfExtents !== undefined || options.physics.radius !== undefined || options.physics.halfHeight !== undefined)) {
    modelOptionError("model.collider cannot be combined with an explicit physics shape");
  }
}


export function model<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: AuraModelOptions = {}
): AuraNodeBuilder<AuraModelNode> {
  return buildModel(asset, options, { builder: "model", validKeys: MODEL_OPTION_KEYS });
}

/** `model()` with the OPTION_IGNORED label and key list of the calling builder. */
export function buildModel<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: AuraModelOptions,
  guard: ModelOptionGuard
): AuraNodeBuilder<AuraModelNode> {
  assertValidPivot(options.pivot);
  const pivot = options.pivot === undefined ? undefined : [...options.pivot] as [number, number, number];
  // instances.model has its own per-instance LOD contract; do not reinterpret it
  // as an imported-model MSFT_lod policy.
  if (guard.builder === "model") validateModelOptions(asset, options);
  else if (guard.builder === "instances.model") validateModelColliderOption(asset, options);
  const colliderBuilder = guard.builder === "model" || guard.builder === "instances.model";
  const ignored = modelIgnoredOptions(options, guard);
  return new AuraNodeBuilder({
    kind: "model",
    asset,
    name: options.name,
    position: options.position,
    ...(pivot === undefined ? {} : { pivot }),
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    // Transform extras, as `primitive()` forwards them; spread only when set so node JSON is unchanged otherwise.
    ...(options.rotationOrder !== undefined ? { rotationOrder: options.rotationOrder } : {}),
    ...(options.quaternion !== undefined ? { quaternion: options.quaternion } : {}),
    ...(options.renderOrder !== undefined ? { renderOrder: options.renderOrder } : {}),
    ...(options.frustumCulled !== undefined ? { frustumCulled: options.frustumCulled } : {}),
    ...(options.layers !== undefined ? { layers: options.layers } : {}),
    ...(options.userData !== undefined ? { userData: options.userData } : {}),
    ...ignored,
    material: options.material,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
    visible: options.visible ?? true,
    role: options.role,
    scaleMode: options.scaleMode,
    targetHeight: options.targetHeight,
    targetMaxDimension: options.targetMaxDimension,
    targetLength: options.targetLength,
    physics: options.physics ?? (colliderBuilder && options.collider ? { type: "static" } : undefined),
    hiddenNodeNames: options.hiddenNodeNames,
    ...(options.nodeTransforms !== undefined ? { nodeTransforms: options.nodeTransforms } : {}),
    ...(options.materialOverrides !== undefined ? { materialOverrides: options.materialOverrides } : {}),
    ...(options.variant !== undefined ? { variant: options.variant } : {}),
    ...(guard.builder === "model" && options.lod !== undefined ? { lod: options.lod } : {}),
    ...(colliderBuilder && options.collider !== undefined ? { collider: options.collider } : {}),
    wrinkle: options.wrinkle
  });
}

export function unsafeModelUrl(url: string, options: Omit<AuraAssetDefinition, "type" | "format" | "url"> = {}): AuraAssetRef<"model", "unsafe"> {
  const format = url.toLowerCase().endsWith(".gltf") ? "gltf" : "glb";
  return defineAuraAssets({
    unsafe: {
      ...options,
      type: "model",
      format,
      url,
      metadata: {
        ...(options.metadata ?? {}),
        license: options.metadata?.license ?? "unknown"
      }
    }
  }).unsafe;
}

export const builtInCharacterAssets = lazyNamespace(() => defineAuraAssets({
  humanoid: {
    type: "model",
    format: "glb",
    url: currentWorkerAssets()?.humanoid ?? new URL("../assets/humanoid-fixture.glb", import.meta.url).href,
    bounds: [0.7, 1.7, 0.6],
    hash: "sha256-dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b",
    metadata: {
      materials: ["skinned soldier body", "uniform armor", "visor"],
      // Exactly the clips authored in humanoid-fixture.glb (guarded by a GLB-parsing test); do not add names that are not in the binary.
      animations: ["Idle", "Run", "TPose", "Walk"],
      textures: ["embedded soldier/vanguard textures"],
      license: "Aura3D bundled soldier fixture from the existing repository corpus",
      // Bundled with the engine package and addressed by hash; served from the package origin, so its
      // URL is http(s) in a browser. Marks it as trusted for the production bridge (see createAssetProvenance).
      provenance: { builtIn: true }
    }
  }
} as const));
