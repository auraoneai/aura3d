// Pure helpers for the separate FC flood-head diagnostic. They do not change
// the scene, camera, gameplay, QA crop publication or luma acceptance bands.

import type { QaCrop, V3 } from "./qaCrops";

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Independent projection through the engine's *presented* column-major VP matrix. */
export function matrixProject(m: readonly number[], p: V3): [number, number] | null {
  if (m.length !== 16 || !m.every(Number.isFinite)) throw new Error("invalid presented view-projection matrix");
  const x = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!;
  const y = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!;
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  return w > 0.05 ? [(x / w + 1) / 2, (1 - y / w) / 2] : null;
}

/** Reproject all eight box corners, with the same clipping/rounding contract as FC's published crops. */
export function matrixBox(m: readonly number[], min: V3, max: V3, name: string): QaCrop | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    const point = matrixProject(m, [x, y, z]);
    if (!point) return null;
    left = Math.min(left, point[0]); top = Math.min(top, point[1]);
    right = Math.max(right, point[0]); bottom = Math.max(bottom, point[1]);
  }
  left = Math.max(0, left); top = Math.max(0, top);
  right = Math.min(1, right); bottom = Math.min(1, bottom);
  if (right - left < 1e-3 || bottom - top < 1e-3) return null;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return { name, x: r4(left), y: r4(top), w: r4(right - left), h: r4(bottom - top) };
}

/**
 * Pixel centres inside projected GLB triangles wholly above `minY`, intersected
 * with the actual sampled crop. This is only a geometry mask; it says nothing
 * about loading, depth occlusion, rendered pixels, or a frame's luma.
 */
export function headTriangleMask(input: {
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
  readonly modelMatrix: ArrayLike<number>;
  readonly viewProjection: readonly number[];
  readonly minY: number;
  readonly canvas: PixelRect;
  readonly crop: PixelRect;
}): number[] {
  const { positions, indices, modelMatrix: m, viewProjection, minY, canvas, crop } = input;
  if (m.length !== 16 || positions.length % 3 || indices.length % 3 ||
      !Number.isInteger(crop.x) || !Number.isInteger(crop.y) ||
      !Number.isInteger(crop.w) || !Number.isInteger(crop.h) || crop.w <= 0 || crop.h <= 0 ||
      crop.w * crop.h > 4_000_000 || canvas.w <= 0 || canvas.h <= 0 || !Number.isFinite(minY)) {
    throw new Error("invalid head geometry or crop");
  }
  const vertices: (readonly [number, number] | null)[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    const world: V3 = [
      m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
      m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
      m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
    ];
    const p = world[1] >= minY ? matrixProject(viewProjection, world) : null;
    vertices.push(p ? [canvas.x + p[0] * canvas.w, canvas.y + p[1] * canvas.h] : null);
  }
  const mask = new Uint8Array(crop.w * crop.h);
  const edge = (a: readonly number[], b: readonly number[], x: number, y: number) =>
    (x - a[0]!) * (b[1]! - a[1]!) - (y - a[1]!) * (b[0]! - a[0]!);
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]!], b = vertices[indices[i + 1]!], c = vertices[indices[i + 2]!];
    if (!a || !b || !c) continue;
    const area = edge(a, b, c[0], c[1]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(crop.x, Math.floor(Math.min(a[0], b[0], c[0])));
    const x1 = Math.min(crop.x + crop.w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(crop.y, Math.floor(Math.min(a[1], b[1], c[1])));
    const y1 = Math.min(crop.y + crop.h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ab = edge(a, b, x + 0.5, y + 0.5);
      const bc = edge(b, c, x + 0.5, y + 0.5);
      const ca = edge(c, a, x + 0.5, y + 0.5);
      if ((ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0)) {
        mask[(y - crop.y) * crop.w + x - crop.x] = 1;
      }
    }
  }
  const result: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) result.push(i);
  return result;
}

/**
 * A conservative on/off/on control on the same crop pixels. The "off" image
 * alone is not proof: the baseline and restored images must agree, while the
 * control must differ in pixels covered by real head triangles.
 */
export function compareHeadControl(
  on: ArrayLike<number>, off: ArrayLike<number>, restored: ArrayLike<number>, mask: readonly number[]
): { maskPixels: number; stableChangedPixels: number; unstablePixels: number; requiredChangedPixels: number; supported: boolean } {
  if (on.length !== off.length || on.length !== restored.length || on.length % 4 ||
      mask.some((p) => !Number.isInteger(p) || p < 0 || p >= on.length / 4)) {
    throw new Error("invalid head-control pixels or mask");
  }
  let stableChangedPixels = 0, unstablePixels = 0;
  for (const p of mask) {
    const i = p * 4;
    const diff = (a: ArrayLike<number>, b: ArrayLike<number>) =>
      Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!));
    const baseline = diff(on, restored);
    if (baseline > 3) unstablePixels++;
    if (baseline <= 3 && diff(on, off) >= 8 && diff(restored, off) >= 8) stableChangedPixels++;
  }
  const requiredChangedPixels = Math.max(3, Math.ceil(mask.length * 0.01));
  const supported = mask.length >= 9 && unstablePixels <= Math.max(1, Math.floor(mask.length * 0.05)) &&
    stableChangedPixels >= requiredChangedPixels;
  return { maskPixels: mask.length, stableChangedPixels, unstablePixels, requiredChangedPixels, supported };
}
