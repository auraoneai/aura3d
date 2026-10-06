// PR 0b-1 carve-out (CONTRACTS.md §3.2) — C-15 model-material tint bridge, verbatim from the
// TypedGLBActor options inside createProductionRuntimeSceneRenderer; 0 changed logic lines.
import type { AuraModelNode } from "../nodes/types.js";
import { colorToLinearRgb, colorToLinearRgba } from "../colorUtils.js";
import { clamp01 } from "../sceneMath.js";

export function applyModelTintBridge(node: AuraModelNode): Record<string, unknown> {
  return node.material?.color ? {
    tint: {
      baseColor: colorToLinearRgba(node.material.color),
      replaceSurfaceTextures: true,
      ...(node.material.emissive ? { emissiveColor: colorToLinearRgb(node.material.emissive) } : {}),
      ...(node.material.emissiveIntensity === undefined ? {} : { emissiveStrength: node.material.emissiveIntensity }),
      ...(node.material.roughness === undefined ? {} : { roughness: clamp01(node.material.roughness) }),
      ...(node.material.metallic === undefined && node.material.metalness === undefined
        ? {}
        : { metallic: clamp01(node.material.metallic ?? node.material.metalness ?? 0) }),
      ...(node.material.clearcoat === undefined ? {} : { clearcoat: clamp01(node.material.clearcoat) }),
      ...(node.material.clearcoatRoughness === undefined ? {} : { clearcoatRoughness: clamp01(node.material.clearcoatRoughness) })
    }
  } : {};
}
