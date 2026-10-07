/**
 * Lane prd02 mask builders (PRD-02 §16.4 note). Masks are derived from the
 * scene spec, never hand-drawn:
 *
 *  - `shadow-receiver`: pixels where the three-side render with shadows on vs
 *    the `no-shadows` broken control differs by > 8 luma (built at capture time).
 *  - `sky`: rows above the horizon line, projected analytically from the spec
 *    camera.
 *  - `metal`: projected screen discs of the metal (metalness 1) spheres (06).
 *  - `subject`: union of projected object bounding-sphere discs.
 *  - `silhouette-edge`: one-pixel dilation ring around `subject`.
 *
 * Everything here is pure math on `ImageSize`-sized byte masks so the same code
 * runs in vitest (node) and inside the lane page (bundled by vite).
 */
import type { MaskId } from "../../shared/contracts";
import type { CameraSpec, SceneSpec, Vec3 } from "../../shared/types";

export interface ImageSize { readonly width: number; readonly height: number }

/** 0|255 per pixel, row-major. */
export type MaskBuffer = Uint8Array;

export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export function emptyMask(size: ImageSize): MaskBuffer {
  return new Uint8Array(size.width * size.height);
}

function subtract(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}

/** Pinhole projection of a world point into normalized uv (v down from top). */
export function projectWorldToUv(camera: CameraSpec, aspect: number, world: Vec3): readonly [number, number] | null {
  const forward = normalize(subtract(camera.target, camera.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const delta = subtract(world, camera.position);
  const depth = delta[0] * forward[0] + delta[1] * forward[1] + delta[2] * forward[2];
  if (depth <= camera.near) return null;
  const x = delta[0] * right[0] + delta[1] * right[1] + delta[2] * right[2];
  const y = delta[0] * up[0] + delta[1] * up[1] + delta[2] * up[2];
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const u = 0.5 + x / (2 * depth * tanV * aspect);
  const v = 0.5 - y / (2 * depth * tanV);
  return [u, v];
}

/**
 * Sky mask: rows above the horizon. The horizon is projected by pushing a
 * point far along the camera's horizontal forward direction at camera height.
 */
export function skyMask(spec: SceneSpec, size: ImageSize): MaskBuffer {
  const camera = spec.camera;
  const forward = normalize(subtract(camera.target, camera.position));
  const flat = normalize([forward[0], 0, forward[2]]);
  const horizonPoint: Vec3 = [
    camera.position[0] + flat[0] * 1000,
    camera.position[1],
    camera.position[2] + flat[2] * 1000
  ];
  const projected = projectWorldToUv(camera, size.width / size.height, horizonPoint);
  // Degenerate camera (looking straight up/down): sky fills everything or nothing.
  const horizonV = projected ? projected[1] : forward[1] > 0 ? 1 : 0;
  const mask = emptyMask(size);
  const horizonRow = Math.max(0, Math.min(size.height, Math.round(horizonV * size.height)));
  for (let y = 0; y < horizonRow; y += 1) {
    mask.fill(255, y * size.width, (y + 1) * size.width);
  }
  return mask;
}

/** Projected disc for a world-space bounding sphere, in pixels. */
export function projectDisc(
  camera: CameraSpec,
  size: ImageSize,
  center: Vec3,
  worldRadius: number
): { readonly x: number; readonly y: number; readonly r: number } | null {
  const aspect = size.width / size.height;
  const uv = projectWorldToUv(camera, aspect, center);
  if (!uv) return null;
  const forward = normalize(subtract(camera.target, camera.position));
  const delta = subtract(center, camera.position);
  const depth = delta[0] * forward[0] + delta[1] * forward[1] + delta[2] * forward[2];
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const rNorm = worldRadius / (depth * tanV);
  return { x: uv[0] * size.width, y: uv[1] * size.height, r: rNorm * size.height * 0.5 };
}

export function fillDisc(mask: MaskBuffer, size: ImageSize, x: number, y: number, r: number): void {
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(size.height - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py += 1) {
    for (let px = Math.max(0, Math.floor(x - r)); px <= Math.min(size.width - 1, Math.ceil(x + r)); px += 1) {
      const dx = px - x;
      const dy = py - y;
      if (dx * dx + dy * dy <= r2) mask[py * size.width + px] = 255;
    }
  }
}

/** Object bounding-sphere radius from its spec (world units). */
function objectRadius(size: Vec3, scale: number | Vec3 | undefined): number {
  const s = scale === undefined ? 1 : typeof scale === "number" ? scale : Math.max(scale[0], scale[1], scale[2]);
  return 0.5 * Math.hypot(size[0], size[1], size[2]) * s;
}

/** `metal`: projected discs of every metalness-1 object. */
export function metalMask(spec: SceneSpec, size: ImageSize): MaskBuffer {
  const mask = emptyMask(size);
  for (const object of spec.objects) {
    if (object.kind !== "primitive" || object.material.metalness < 1) continue;
    const radius = objectRadius(object.size, object.scale);
    const disc = projectDisc(spec.camera, size, object.position, radius);
    if (disc) fillDisc(mask, size, disc.x, disc.y, disc.r);
  }
  return mask;
}

/** `subject`: union of projected object discs (ground planes excluded). */
export function objectIdMask(spec: SceneSpec, size: ImageSize): MaskBuffer {
  const mask = emptyMask(size);
  for (const object of spec.objects) {
    if (object.kind === "primitive" && object.shape === "plane") continue;
    if (object.kind === "particles") {
      const disc = projectDisc(spec.camera, size, object.center, object.radius + 0.5);
      if (disc) fillDisc(mask, size, disc.x, disc.y, disc.r);
      continue;
    }
    if (object.kind === "model") {
      // Typed model bounds are not in the spec; use a 1-unit stand-in disc.
      const scale = object.scale === undefined ? 1 : typeof object.scale === "number" ? object.scale : Math.max(...object.scale);
      const disc = projectDisc(spec.camera, size, object.position, scale * 1.0);
      if (disc) fillDisc(mask, size, disc.x, disc.y, disc.r);
      continue;
    }
    if (object.kind === "instanced") {
      // Bounding disc over all transform positions.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const transform of object.transforms) {
        const [x, y, z] = transform.position;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const radius = 0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) + 0.5;
      const disc = projectDisc(spec.camera, size, [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2], radius);
      if (disc) fillDisc(mask, size, disc.x, disc.y, disc.r);
      continue;
    }
    const radius = objectRadius(object.size, object.scale);
    const disc = projectDisc(spec.camera, size, object.position, radius);
    if (disc) fillDisc(mask, size, disc.x, disc.y, disc.r);
  }
  return mask;
}

/** `silhouette-edge`: 1 px dilation ring around a subject mask. */
export function silhouetteEdgeMask(subject: MaskBuffer, size: ImageSize): MaskBuffer {
  const mask = emptyMask(size);
  const { width, height } = size;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (subject[y * width + x]) continue;
      const onEdge =
        (x > 0 && subject[y * width + x - 1]) ||
        (x < width - 1 && subject[y * width + x + 1]) ||
        (y > 0 && subject[(y - 1) * width + x]) ||
        (y < height - 1 && subject[(y + 1) * width + x]);
      if (onEdge) mask[y * width + x] = 255;
    }
  }
  return mask;
}

export function invertMask(mask: MaskBuffer): MaskBuffer {
  const out = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) out[index] = mask[index] ? 0 : 255;
  return out;
}

export function intersectMasks(a: MaskBuffer, b: MaskBuffer): MaskBuffer {
  const out = new Uint8Array(a.length);
  for (let index = 0; index < a.length; index += 1) out[index] = a[index] && b[index] ? 255 : 0;
  return out;
}

export function maskPixelCount(mask: MaskBuffer): number {
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) count += 1;
  return count;
}

/**
 * `shadow-receiver`: where the three-side shadowed vs `no-shadows` renders
 * differ by > 8 luma. Built at capture time from decoded pixels.
 */
export function shadowReceiverMask(shadowOn: PixelBuffer, shadowOff: PixelBuffer, lumaThreshold = 8): MaskBuffer {
  const count = Math.min(shadowOn.width * shadowOn.height, shadowOff.width * shadowOff.height);
  const mask = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const o = index * 4;
    const la = 0.299 * shadowOn.data[o]! + 0.587 * shadowOn.data[o + 1]! + 0.114 * shadowOn.data[o + 2]!;
    const lb = 0.299 * shadowOff.data[o]! + 0.587 * shadowOff.data[o + 1]! + 0.114 * shadowOff.data[o + 2]!;
    if (Math.abs(la - lb) > lumaThreshold) mask[index] = 255;
  }
  return mask;
}

/**
 * Analytic masks derivable from the spec alone. `shadow-receiver` is excluded:
 * it needs the broken-control render at capture time.
 */
export function analyticMasks(spec: SceneSpec, size: ImageSize): Partial<Record<MaskId, MaskBuffer>> {
  const declared = spec.masks ?? [];
  const out: Partial<Record<MaskId, MaskBuffer>> = {};
  if (declared.includes("sky")) out.sky = skyMask(spec, size);
  if (declared.includes("metal")) out.metal = metalMask(spec, size);
  if (declared.includes("object-id") || declared.includes("silhouette-edge")) out["object-id"] = objectIdMask(spec, size);
  if (declared.includes("silhouette-edge") && out["object-id"]) out["silhouette-edge"] = silhouetteEdgeMask(out["object-id"], size);
  return out;
}
