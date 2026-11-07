import type { AuraMaterialSpec } from "./types.js";

/**
 * Marks a spec built by `material.studioMetal` / `material.studioGlass`. The scene builder reads it to bind the structured
 * `softbox` environment when no `environments.*` node is authored, and the app turns physical transmission on for
 * studio glass. It is a symbol key (not a typed option): it survives object spread, never reaches the renderer or JSON,
 * and adds nothing to `AuraMaterialSpec`.
 */
export const AURA_STUDIO_MATERIAL: unique symbol = Symbol.for("aura3d.studioMaterial") as never;

export function markStudioMaterial(spec: AuraMaterialSpec): AuraMaterialSpec {
  (spec as { [AURA_STUDIO_MATERIAL]?: "softbox" })[AURA_STUDIO_MATERIAL] = "softbox";
  return spec;
}

export function isStudioMaterial(material: unknown): boolean {
  return typeof material === "object" && material !== null && (material as { [AURA_STUDIO_MATERIAL]?: unknown })[AURA_STUDIO_MATERIAL] === "softbox";
}
