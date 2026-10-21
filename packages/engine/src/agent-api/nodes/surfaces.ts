/**
 * threejs-parity L7/AD-15: `surfaces.mirror` — three's `Reflector`.
 *
 * Emits an additive `"surface"` scene node (same builder-cast pattern as
 * `probes.ts`). The production runtime captures the scene through the mirror
 * camera into a renderer-owned target (`PlanarReflectionCapture`, oblique
 * near-plane clip) and submits a reflector item sampling that texture.
 *
 * Mirrors are horizontal planes (`y = position[1]`), matching the engine's
 * planar-reflection capture contract.
 */

import type { AuraColor, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";

export interface AuraMirrorOptions {
  readonly name?: string;
  /** Mirror surface size `[width, depth]` in world units (default [4, 4]). */
  readonly size?: readonly [number, number];
  /** Mirror capture resolution in pixels (default 256). */
  readonly resolution?: number;
  /** Reflector tint multiplied over the captured texture (default white). */
  readonly tint?: AuraColor;
  /** Mirror plane center; `position[1]` is the reflection plane height. */
  readonly position?: AuraVec3;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export interface AuraMirrorSurfaceNode extends AuraTransformSpec {
  readonly kind: "surface";
  readonly surface: "mirror";
  readonly name?: string;
  /** Mirror extent `[width, depth]` — note: 2 elements, not a bounds vec3. */
  readonly size: readonly [number, number];
  readonly resolution: number;
  readonly tint?: AuraColor;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export function isAuraMirrorSurfaceNode(node: { readonly kind: string }): node is AuraMirrorSurfaceNode & { readonly kind: "surface" } {
  return node.kind === "surface" && (node as { surface?: string }).surface === "mirror";
}

export const surfaces = {
  /**
   * three's `new Reflector(geometry, { textureWidth, color })` — horizontal
   * mirror at `position[1]` sampling a live planar-reflection render target.
   */
  mirror: (options: AuraMirrorOptions = {}) =>
    new AuraNodeBuilder<AuraSceneNode>({
      kind: "surface",
      surface: "mirror",
      name: options.name ?? "mirror",
      position: options.position ?? [0, 0, 0],
      size: options.size ?? [4, 4],
      resolution: options.resolution ?? 256,
      ...(options.tint !== undefined ? { tint: options.tint } : {}),
      ...(options.runtime ? { runtime: options.runtime } : {})
    } as unknown as AuraSceneNode)
} as const;
