/**
 * threejs-parity AD-15 (P2): `lights.lensFlare` — three's `Lensflare` /
 * `LensflareElement` (examples/jsm/objects/Lensflare.js).
 *
 * Emits an additive `"lensflare"` scene node. The production runtime
 * (`compiler/lensFlare.ts`) projects the light through the frame's camera and
 * submits one camera-facing additive sprite per element, placed with three's
 * exact screen-space rule:
 *
 *   ndc(element) = ndc(light) + (-2 · ndc(light)) · element.distance
 *   size(element) = element.size px            (square, device pixels)
 *
 * so `distance: 0` sits on the light and `distance: 1` is its mirror through
 * the screen centre. Deviations from three (documented, not hidden):
 * - three fades the flare with a GPU occlusion query against the depth buffer.
 *   The production pass exposes no depth readback to the scene compiler, so
 *   `occlusion: "frustum"` (default) hides the flare when the light is behind
 *   the camera and fades it toward the screen edge instead; geometry that
 *   occludes the light on screen does NOT dim the flare. `"none"` draws it
 *   whenever the light is in front of the camera.
 * - Elements draw through the sprite path (`A3D_PARITY_LINES`, default-on):
 *   additive blend, no depth test, no depth write.
 */

import type { AuraColor, AuraSceneNode, AuraTextureRef, AuraTransformSpec, AuraVec3 } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { AuraRuntimeError } from "../compiler/errors.js";

export interface AuraLensFlareElement {
  /** Flare texture (a `texture.*` handle). Omitted → a generated soft radial glow. */
  readonly texture?: AuraTextureRef;
  /** Square size in device pixels (three's `LensflareElement.size`). */
  readonly size: number;
  /** 0 = on the light, 1 = mirrored through the screen centre (three's `distance`). */
  readonly distance: number;
  /** Tint multiplied over the texture (default white). */
  readonly color?: AuraColor;
}

export type AuraLensFlareOcclusion = "frustum" | "none";

export interface AuraLensFlareOptions {
  readonly name?: string;
  /** World position of the light source. Ignored when `light` resolves. */
  readonly position?: AuraVec3;
  /** Name of an authored `lights.*` node whose position is the source. */
  readonly light?: string;
  /** Defaults to three's webgl_lensflares example layout (one large glow + four small discs). */
  readonly elements?: readonly AuraLensFlareElement[];
  /** See module doc. Default `"frustum"`. */
  readonly occlusion?: AuraLensFlareOcclusion;
  /** Fraction of the half-screen over which the flare fades out toward the edge (0 = hard cut). Default 0.15. */
  readonly edgeFade?: number;
  /** Multiplies every element colour (default 1). */
  readonly intensity?: number;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export interface AuraLensFlareNode extends AuraTransformSpec {
  readonly kind: "lensflare";
  readonly name?: string;
  readonly light?: string;
  readonly elements: readonly AuraLensFlareElement[];
  readonly occlusion: AuraLensFlareOcclusion;
  readonly edgeFade: number;
  readonly intensity: number;
  readonly runtime?: import("./types.js").AuraRuntimeNodeSpec;
}

export function isAuraLensFlareNode(node: { readonly kind: string }): node is AuraLensFlareNode {
  return node.kind === "lensflare";
}

/** three's webgl_lensflares layout, sizes in pixels. */
export const DEFAULT_LENS_FLARE_ELEMENTS: readonly AuraLensFlareElement[] = [
  { size: 700, distance: 0 },
  { size: 60, distance: 0.6, color: "#ffd9b0" },
  { size: 70, distance: 0.7, color: "#b0d0ff" },
  { size: 120, distance: 0.9, color: "#ffe9c4" },
  { size: 70, distance: 1, color: "#c4d8ff" }
];

function invalid(message: string): never {
  throw new AuraRuntimeError("invalid-lens-flare", `lights.lensFlare: ${message}`);
}

export function assertAuraLensFlareOptions(options: AuraLensFlareOptions): void {
  if (options.elements !== undefined) {
    if (!Array.isArray(options.elements) || options.elements.length === 0) invalid("`elements` must be a non-empty array");
    options.elements.forEach((element, index) => {
      if (element === null || typeof element !== "object") invalid(`elements[${index}] must be an object`);
      if (!Number.isFinite(element.size) || element.size <= 0) invalid(`elements[${index}].size must be a positive finite number of pixels`);
      if (!Number.isFinite(element.distance)) invalid(`elements[${index}].distance must be a finite number`);
      if (element.texture !== undefined && element.texture.kind !== "aura-texture-ref") invalid(`elements[${index}].texture must be a texture.* handle`);
    });
  }
  if (options.occlusion !== undefined && options.occlusion !== "frustum" && options.occlusion !== "none") {
    invalid(`occlusion must be "frustum" or "none", got ${String(options.occlusion)}`);
  }
  if (options.edgeFade !== undefined && (!Number.isFinite(options.edgeFade) || options.edgeFade < 0 || options.edgeFade > 1)) {
    invalid("edgeFade must be a number in [0, 1]");
  }
  if (options.intensity !== undefined && (!Number.isFinite(options.intensity) || options.intensity < 0)) {
    invalid("intensity must be a non-negative finite number");
  }
  if (options.light !== undefined && (typeof options.light !== "string" || options.light.length === 0)) {
    invalid("`light` must be the name of an authored light node");
  }
}

export function createLensFlareNode(options: AuraLensFlareOptions = {}): AuraNodeBuilder<AuraSceneNode> {
  assertAuraLensFlareOptions(options);
  return new AuraNodeBuilder<AuraSceneNode>({
    kind: "lensflare",
    name: options.name ?? "lens flare",
    position: options.position ?? [0, 0, 0],
    ...(options.light !== undefined ? { light: options.light } : {}),
    elements: options.elements ?? DEFAULT_LENS_FLARE_ELEMENTS,
    occlusion: options.occlusion ?? "frustum",
    edgeFade: options.edgeFade ?? 0.15,
    intensity: options.intensity ?? 1,
    ...(options.runtime ? { runtime: options.runtime } : {})
  } as unknown as AuraSceneNode);
}

// ── Pure placement math (no renderer; unit-tested against three's formula) ──

export interface LensFlareCamera {
  readonly mode?: string;
  readonly fov?: number;
  readonly orthographicSize?: number;
}

export interface LensFlareCameraFrame {
  readonly eye: AuraVec3;
  readonly target: AuraVec3;
  readonly up?: AuraVec3;
}

export interface LensFlareBasis {
  readonly forward: AuraVec3;
  readonly right: AuraVec3;
  readonly up: AuraVec3;
}

const sub = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: AuraVec3, b: AuraVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: AuraVec3): AuraVec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

export function lensFlareCameraBasis(frame: LensFlareCameraFrame): LensFlareBasis {
  const forward = normalize(sub(frame.target, frame.eye));
  const worldUp = frame.up ?? [0, 1, 0];
  // Looking straight along the up axis degenerates the cross product; fall back to +Z.
  let right = cross(forward, worldUp);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = cross(forward, [0, 0, 1]);
  right = normalize(right);
  return { forward, right, up: cross(right, forward) };
}

const isOrthographic = (camera: LensFlareCamera): boolean => camera.mode === "orthographic" || camera.mode === "isometric";

/**
 * World position → NDC `[-1,1]²` and view depth (distance along the view
 * direction). `null` when the point is not in front of the camera.
 */
export function projectLensFlareSource(
  world: AuraVec3,
  frame: LensFlareCameraFrame,
  camera: LensFlareCamera,
  aspect: number
): { readonly ndc: readonly [number, number]; readonly depth: number } | null {
  const basis = lensFlareCameraBasis(frame);
  const v = sub(world, frame.eye);
  const depth = dot(v, basis.forward);
  if (!(depth > 1e-6)) return null;
  const x = dot(v, basis.right);
  const y = dot(v, basis.up);
  if (isOrthographic(camera)) {
    const halfHeight = Math.max(1e-4, camera.orthographicSize ?? 1.4);
    return { ndc: [x / (halfHeight * aspect), y / halfHeight], depth };
  }
  const tanHalf = Math.tan(((camera.fov ?? 45) * Math.PI) / 360);
  return { ndc: [x / (depth * tanHalf * aspect), y / (depth * tanHalf)], depth };
}

export interface LensFlarePlacement {
  readonly index: number;
  /** Element centre in NDC (three's `screenPosition` uniform). */
  readonly ndc: readonly [number, number];
  /** Square size in device pixels. */
  readonly sizePx: number;
  /** three's `scale.y` uniform: `size / viewport.height` (half-height of the quad in NDC units × 1). */
  readonly sizeNdc: number;
  readonly distance: number;
}

/**
 * three's `Lensflare.onBeforeRender` placement:
 *   vecX = -positionScreen.x * 2; vecY = -positionScreen.y * 2
 *   screenPosition.x = positionScreen.x + vecX * element.distance
 *   scale.y = element.size / viewport.height
 */
export function placeLensFlareElements(
  lightNdc: readonly [number, number],
  elements: readonly { readonly size: number; readonly distance: number }[],
  viewportHeightPx: number
): LensFlarePlacement[] {
  const vecX = -lightNdc[0] * 2;
  const vecY = -lightNdc[1] * 2;
  const height = Math.max(1, viewportHeightPx);
  return elements.map((element, index) => ({
    index,
    ndc: [lightNdc[0] + vecX * element.distance, lightNdc[1] + vecY * element.distance] as const,
    sizePx: element.size,
    sizeNdc: element.size / height,
    distance: element.distance
  }));
}

/** Flare opacity factor in [0,1]: 0 when the light is off-screen, ramping up over `edgeFade` of the half-screen. */
export function lensFlareVisibility(lightNdc: readonly [number, number], occlusion: AuraLensFlareOcclusion, edgeFade: number): number {
  if (occlusion === "none") return 1;
  const edge = Math.max(Math.abs(lightNdc[0]), Math.abs(lightNdc[1]));
  if (edge >= 1) return 0;
  if (edgeFade <= 0) return 1;
  return Math.min(1, Math.max(0, (1 - edge) / edgeFade));
}

/**
 * World-space centre and uniform scale for a camera-facing sprite that lands
 * on `ndc` with a square size of `sizePx`, for the sprite shader's
 * `sizeAttenuation: false` convention (perspective scale is multiplied by view
 * depth; orthographic scale is in world units).
 */
export function lensFlareSpriteTransform(
  ndc: readonly [number, number],
  sizePx: number,
  frame: LensFlareCameraFrame,
  camera: LensFlareCamera,
  aspect: number,
  viewportHeightPx: number,
  planeDistance: number
): { readonly position: AuraVec3; readonly scale: number } {
  const basis = lensFlareCameraBasis(frame);
  const fraction = sizePx / Math.max(1, viewportHeightPx);
  if (isOrthographic(camera)) {
    const halfHeight = Math.max(1e-4, camera.orthographicSize ?? 1.4);
    const px = ndc[0] * halfHeight * aspect;
    const py = ndc[1] * halfHeight;
    return {
      position: [
        frame.eye[0] + basis.forward[0] * planeDistance + basis.right[0] * px + basis.up[0] * py,
        frame.eye[1] + basis.forward[1] * planeDistance + basis.right[1] * px + basis.up[1] * py,
        frame.eye[2] + basis.forward[2] * planeDistance + basis.right[2] * px + basis.up[2] * py
      ],
      scale: 2 * halfHeight * fraction
    };
  }
  const tanHalf = Math.tan(((camera.fov ?? 45) * Math.PI) / 360);
  const px = ndc[0] * tanHalf * aspect * planeDistance;
  const py = ndc[1] * tanHalf * planeDistance;
  return {
    position: [
      frame.eye[0] + basis.forward[0] * planeDistance + basis.right[0] * px + basis.up[0] * py,
      frame.eye[1] + basis.forward[1] * planeDistance + basis.right[1] * px + basis.up[1] * py,
      frame.eye[2] + basis.forward[2] * planeDistance + basis.right[2] * px + basis.up[2] * py
    ],
    // The sprite shader multiplies scale by view depth; a screen fraction f of the
    // viewport height is 2·tan(fov/2)·f of the view-space height at unit depth.
    scale: 2 * tanHalf * fraction
  };
}
