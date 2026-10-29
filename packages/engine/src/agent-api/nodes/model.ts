// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetDefinition, AuraAssetRef, AuraModelOptions, AuraModelNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { defineAuraAssets } from "./assets.js";
import { material } from "./material.js";
import { physics } from "./physics.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { formatIgnoredOptions, unreadOptionKeys } from "./optionDiagnostics.js";

/**
 * Every top-level option `model()` reads, plus the transform extras it forwards to the node
 * (the render path reads `renderOrder`, `frustumCulled`, `layers`, `userData`; the scene graph
 * reads `rotationOrder`, `quaternion`). `lod` and `collider` are typed but not applied by
 * `model()`: `false` (the default behaviour) is accepted, any other value is OPTION_IGNORED
 * (anim-phys-06).
 */
export const MODEL_OPTION_KEYS: readonly string[] = [
  "name", "position", "rotation", "scale", "lookAt", "rotationOrder", "quaternion",
  "renderOrder", "frustumCulled", "layers", "userData",
  "material", "castShadow", "receiveShadow", "visible", "role", "scaleMode",
  "targetHeight", "targetMaxDimension", "targetLength", "physics", "hiddenNodeNames",
  "materialOverrides", "variant", "wrinkle"
];

/** Typed model options that are honoured only when `false` (nothing to build). */
const MODEL_FALSE_ONLY_KEYS: readonly string[] = ["lod", "collider"];

/** Builder label and readable keys for the OPTION_IGNORED note; `instances.model` passes its own. */
export interface ModelOptionGuard {
  readonly builder: string;
  readonly validKeys: readonly string[];
}

function modelIgnoredOptions(options: AuraModelOptions, guard: ModelOptionGuard): { readonly ignoredOptions?: readonly string[] } {
  const record = options as Record<string, unknown>;
  const unread = unreadOptionKeys(options, [...guard.validKeys, ...MODEL_FALSE_ONLY_KEYS]);
  const falseOnly = MODEL_FALSE_ONLY_KEYS.filter((key) => !guard.validKeys.includes(key) && record[key] !== undefined && record[key] !== false);
  const all = [...unread, ...falseOnly];
  return all.length === 0 ? {} : { ignoredOptions: [formatIgnoredOptions(guard.builder, all, guard.validKeys)] };
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
  const ignored = modelIgnoredOptions(options, guard);
  return new AuraNodeBuilder({
    kind: "model",
    asset,
    name: options.name,
    position: options.position,
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
    physics: options.physics,
    hiddenNodeNames: options.hiddenNodeNames,
    ...(options.materialOverrides !== undefined ? { materialOverrides: options.materialOverrides } : {}),
    ...(options.variant !== undefined ? { variant: options.variant } : {}),
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
    url: new URL("./assets/humanoid-fixture.glb", import.meta.url).href,
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
