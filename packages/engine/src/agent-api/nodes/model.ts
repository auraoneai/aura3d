// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetDefinition, AuraAssetRef, AuraModelOptions, AuraModelNode } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { defineAuraAssets } from "./assets.js";
import { material } from "./material.js";
import { physics } from "./physics.js";

export function model<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: AuraModelOptions = {}
): AuraNodeBuilder<AuraModelNode> {
  return new AuraNodeBuilder({
    kind: "model",
    asset,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
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

export const builtInCharacterAssets = defineAuraAssets({
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
      license: "Aura3D bundled soldier fixture from the existing repository corpus"
    }
  }
} as const);
