import type { Bounds3 } from "@aura3d/rendering";

export type Vec3 = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

export function modelMatrix(
  position: Vec3,
  scale: Vec3 = [1, 1, 1],
  rotation: Vec3 = [0, 0, 0]
): Float32Array {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  const r00 = cy * cz;
  const r01 = sx * sy * cz + cx * sz;
  const r02 = -cx * sy * cz + sx * sz;
  const r10 = -cy * sz;
  const r11 = -sx * sy * sz + cx * cz;
  const r12 = cx * sy * sz + sx * cz;
  const r20 = sy;
  const r21 = -sx * cy;
  const r22 = cx * cy;

  return new Float32Array([
    r00 * scale[0], r01 * scale[0], r02 * scale[0], 0,
    r10 * scale[1], r11 * scale[1], r12 * scale[1], 0,
    r20 * scale[2], r21 * scale[2], r22 * scale[2], 0,
    position[0], position[1], position[2], 1
  ]);
}

export function writeModelMatrix(
  target: Float32Array,
  offset: number,
  position: Vec3,
  scale: Vec3 = [1, 1, 1],
  rotation: Vec3 = [0, 0, 0]
): void {
  target.set(modelMatrix(position, scale, rotation), offset);
}

export function colorFromHex(hex: string, alpha = 1): Rgba {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha
  ];
}

export function palette(t: number, alpha = 1): Rgba {
  const angle = Math.PI * 2 * t;
  return [
    clamp01(0.52 + 0.43 * Math.cos(angle)),
    clamp01(0.52 + 0.43 * Math.cos(angle + 2.18)),
    clamp01(0.52 + 0.43 * Math.cos(angle + 4.22)),
    alpha
  ];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function hash01(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function bounds(min: Vec3, max: Vec3): Bounds3 {
  return { min, max };
}

export function formatNumber(value: number): string {
  if (value >= 1000) return `${Math.round(value).toLocaleString()}`;
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}
