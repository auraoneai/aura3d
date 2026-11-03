/**
 * threejs-parity L7/AD-15: `surfaces.mirror` — three's `Reflector` — and
 * `surfaces.glass` — three's `Refractor`.
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

export interface AuraGlassOptions {
  readonly name?: string;
  /** Pane size `[width, height]` in world units (default [3, 2]); the pane lies in the XY plane. */
  readonly size?: readonly [number, number];
  /** Pane centre. */
  readonly position?: AuraVec3;
  /** Background capture resolution in pixels (default 128). */
  readonly resolution?: number;
  /** Glass thickness in world units; drives Beer-Lambert transmittance (default 0.05). */
  readonly thickness?: number;
  /** 0..1 roughness; drives the blur of the refracted background (default 0.1). */
  readonly roughness?: number;
  /** Absorption coefficient per unit thickness (default 0.35). */
  readonly absorption?: number;
  /** Tint multiplied over the refracted background (default white). */
  readonly tint?: AuraColor;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export interface AuraGlassSurfaceNode extends AuraTransformSpec {
  readonly kind: "surface";
  readonly surface: "glass";
  readonly name?: string;
  /** Pane extent `[width, height]` in the XY plane. */
  readonly size: readonly [number, number];
  readonly resolution: number;
  readonly thickness: number;
  readonly roughness: number;
  readonly absorption: number;
  readonly tint?: AuraColor;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export function isAuraGlassSurfaceNode(node: { readonly kind: string }): node is AuraGlassSurfaceNode & { readonly kind: "surface" } {
  return node.kind === "surface" && (node as { surface?: string }).surface === "glass";
}

const positiveFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`surfaces.glass ${label} must be finite and positive.`);
  return value;
};

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
    } as unknown as AuraSceneNode),
  /**
   * three's `new Refractor(geometry, { textureWidth, color })` — a vertical
   * glass pane (XY plane, facing ±Z) that captures its own background every
   * frame: the scene behind the pane is rendered from the viewer through an
   * off-axis frustum fitted to the pane, then tinted by thickness
   * (Beer-Lambert) and blurred by roughness (`GlassRefractionCapture`). No
   * lower-level capture has to be supplied.
   */
  glass: (options: AuraGlassOptions = {}) => {
    const size = options.size ?? [3, 2];
    positiveFinite(size[0], "width");
    positiveFinite(size[1], "height");
    const resolution = options.resolution ?? 128;
    if (!Number.isInteger(resolution) || resolution <= 0) throw new RangeError("surfaces.glass resolution must be a positive integer.");
    const thickness = options.thickness ?? 0.05;
    if (!Number.isFinite(thickness) || thickness < 0) throw new RangeError("surfaces.glass thickness must be finite and non-negative.");
    const roughness = options.roughness ?? 0.1;
    if (!Number.isFinite(roughness) || roughness < 0 || roughness > 1) throw new RangeError("surfaces.glass roughness must be in [0, 1].");
    const absorption = options.absorption ?? 0.35;
    if (!Number.isFinite(absorption) || absorption < 0) throw new RangeError("surfaces.glass absorption must be finite and non-negative.");
    return new AuraNodeBuilder<AuraSceneNode>({
      kind: "surface",
      surface: "glass",
      name: options.name ?? "glass",
      position: options.position ?? [0, 1, 0],
      size: [size[0], size[1]],
      resolution,
      thickness,
      roughness,
      absorption,
      ...(options.tint !== undefined ? { tint: options.tint } : {}),
      ...(options.runtime ? { runtime: options.runtime } : {})
    } as unknown as AuraSceneNode);
  }
} as const;
