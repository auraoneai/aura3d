/**
 * Drift & Deliver port: a tiny indexed-mesh builder (quads, boxes, prisms) used by the city and the vehicles.
 * Colours are written as linear floats; callers pass sRGB hex.
 */
export type V3 = readonly [number, number, number];

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export const createMesh = (): MeshData => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export type Rgb = readonly [number, number, number];

export function linearToSrgb(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export const PALETTE_SLOTS = 128;

/** Solid colours as texels of a small strip: PBR materials here ignore vertex colours, so solid-coloured geometry samples this. */
export class Palette {
  private readonly keys: string[] = [];
  slotOf(c: Rgb): number {
    const hex = `#${[0, 1, 2].map((i) => Math.round(linearToSrgb(c[i]!) * 255).toString(16).padStart(2, "0")).join("")}`;
    let slot = this.keys.indexOf(hex);
    if (slot < 0) {
      if (this.keys.length >= PALETTE_SLOTS) throw new Error(`palette overflow: more than ${PALETTE_SLOTS} solid colours`);
      slot = this.keys.push(hex) - 1;
    }
    return slot;
  }
  get hexes(): readonly string[] {
    return this.keys;
  }
}

/** Rewrites every vertex UV to the palette texel of its vertex colour (u = slot centre, v = 0.5). */
export function bakePaletteUVs(m: { colors: number[]; uvs: number[] }, palette: Palette): void {
  const n = m.colors.length / 4;
  for (let i = 0; i < n; i++) {
    const slot = palette.slotOf([m.colors[i * 4]!, m.colors[i * 4 + 1]!, m.colors[i * 4 + 2]!]);
    m.uvs[i * 2] = (slot + 0.5) / PALETTE_SLOTS;
    m.uvs[i * 2 + 1] = 0.5;
  }
}

export function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export function scaleRgb(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A quad `o`, `o+u`, `o+u+v`, `o+v` with the normal `cross(u, v)`; UVs run `uv0`..`uv1`. */
export function quad(m: MeshData, o: V3, u: V3, v: V3, color: Rgb, uv0: readonly [number, number] = [0, 0], uv1: readonly [number, number] = [1, 1]): void {
  const n = norm(cross(u, v));
  const base = m.positions.length / 3;
  const pts: V3[] = [o, [o[0] + u[0], o[1] + u[1], o[2] + u[2]], [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]], [o[0] + v[0], o[1] + v[1], o[2] + v[2]]];
  const tc: [number, number][] = [[uv0[0], uv0[1]], [uv1[0], uv0[1]], [uv1[0], uv1[1]], [uv0[0], uv1[1]]];
  pts.forEach((p, i) => {
    m.positions.push(p[0], p[1], p[2]);
    m.normals.push(n[0], n[1], n[2]);
    m.uvs.push(tc[i]![0], tc[i]![1]);
    m.colors.push(color[0], color[1], color[2], 1);
  });
  m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** A triangle `a, b, c` (counter-clockwise seen from the normal side). */
export function tri(m: MeshData, a: V3, b: V3, c: V3, color: Rgb): void {
  const n = norm(cross(sub(b, a), sub(c, a)));
  const base = m.positions.length / 3;
  for (const p of [a, b, c]) {
    m.positions.push(p[0], p[1], p[2]);
    m.normals.push(n[0], n[1], n[2]);
    m.uvs.push(0, 0);
    m.colors.push(color[0], color[1], color[2], 1);
  }
  m.indices.push(base, base + 1, base + 2);
}

export interface BoxFaces {
  /** Face colours; `top` is also used for the lid. The bottom is never emitted. */
  side: Rgb;
  top: Rgb;
}

/** An axis-aligned box without a bottom, plain-coloured (UVs 0..1 per face). */
export function box(m: MeshData, cx: number, y0: number, cz: number, hw: number, h: number, hd: number, c: BoxFaces): void {
  const y1 = y0 + h;
  quad(m, [cx - hw, y0, cz + hd], [2 * hw, 0, 0], [0, h, 0], c.side);
  quad(m, [cx + hw, y0, cz - hd], [-2 * hw, 0, 0], [0, h, 0], c.side);
  quad(m, [cx + hw, y0, cz + hd], [0, 0, -2 * hd], [0, h, 0], c.side);
  quad(m, [cx - hw, y0, cz - hd], [0, 0, 2 * hd], [0, h, 0], c.side);
  quad(m, [cx - hw, y1, cz + hd], [2 * hw, 0, 0], [0, 0, -2 * hd], c.top);
}

/** A regular prism with `sides` faces (no bottom), plain-coloured: water tanks, drums, columns. */
export function prism(m: MeshData, cx: number, y0: number, cz: number, radius: number, h: number, sides: number, side: Rgb, top: Rgb): void {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0: V3 = [cx + Math.sin(a0) * radius, y0, cz + Math.cos(a0) * radius];
    const p1: V3 = [cx + Math.sin(a1) * radius, y0, cz + Math.cos(a1) * radius];
    // u runs along the angle, so cross(u, up) points away from the axis
    quad(m, p0, [p1[0] - p0[0], 0, p1[2] - p0[2]], [0, h, 0], side);
    tri(m, [cx, y0 + h, cz], [p0[0], y0 + h, p0[2]], [p1[0], y0 + h, p1[2]], top);
  }
}

/** A box rotated by `yaw` about +y (local x -> (cos, 0, -sin), local z -> (sin, 0, cos)), without a bottom. */
export function orientedBox(m: MeshData, cx: number, y0: number, cz: number, yaw: number, hw: number, h: number, hd: number, side: Rgb, top: Rgb): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const X: V3 = [c, 0, -s];
  const Z: V3 = [s, 0, c];
  const at = (sx: number, sz: number, y: number): V3 => [cx + sx * hw * X[0] + sz * hd * Z[0], y, cz + sx * hw * X[2] + sz * hd * Z[2]];
  const sc = (v: V3, k: number): V3 => [v[0] * k, 0, v[2] * k];
  quad(m, at(-1, 1, y0), sc(X, 2 * hw), [0, h, 0], side);
  quad(m, at(1, -1, y0), sc(X, -2 * hw), [0, h, 0], side);
  quad(m, at(1, 1, y0), sc(Z, -2 * hd), [0, h, 0], side);
  quad(m, at(-1, -1, y0), sc(Z, 2 * hd), [0, h, 0], side);
  quad(m, at(-1, 1, y0 + h), sc(X, 2 * hw), sc(Z, -2 * hd), top);
}

/** A cylinder lying along the x axis (a wheel): `sides` quads around, caps at both ends. */
export function prismX(m: MeshData, cx: number, cy: number, cz: number, radius: number, halfWidth: number, sides: number, side: Rgb, cap: Rgb): void {
  const ring = (a: number): [number, number] => [cy + Math.sin(a) * radius, cz + Math.cos(a) * radius];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const [y0, z0] = ring(a0);
    const [y1, z1] = ring(a1);
    quad(m, [cx - halfWidth, y0, z0], [2 * halfWidth, 0, 0], [0, y1 - y0, z1 - z0], side);
    tri(m, [cx + halfWidth, cy, cz], [cx + halfWidth, y1, z1], [cx + halfWidth, y0, z0], cap);
    tri(m, [cx - halfWidth, cy, cz], [cx - halfWidth, y0, z0], [cx - halfWidth, y1, z1], cap);
  }
}

/** A low-poly blob (two cones back to back): tree crowns. */
export function blob(m: MeshData, cx: number, cy: number, cz: number, radius: number, halfHeight: number, sides: number, color: Rgb): void {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0: V3 = [cx + Math.sin(a0) * radius, cy, cz + Math.cos(a0) * radius];
    const p1: V3 = [cx + Math.sin(a1) * radius, cy, cz + Math.cos(a1) * radius];
    tri(m, [cx, cy + halfHeight, cz], p0, p1, color);
    tri(m, [cx, cy - halfHeight, cz], p1, p0, color);
  }
}

/** Merge `src` into `dst`. */
export function append(dst: MeshData, src: MeshData): void {
  const base = dst.positions.length / 3;
  for (const v of src.positions) dst.positions.push(v);
  for (const v of src.normals) dst.normals.push(v);
  for (const v of src.uvs) dst.uvs.push(v);
  for (const v of src.colors) dst.colors.push(v);
  for (const i of src.indices) dst.indices.push(i + base);
}

export const triangleCount = (m: MeshData): number => m.indices.length / 3;

export interface MeshBounds {
  min: V3;
  max: V3;
}

export function bounds(m: MeshData): MeshBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, m.positions[i + k]!);
      max[k] = Math.max(max[k]!, m.positions[i + k]!);
    }
  }
  return { min, max };
}

export function toArrays(m: MeshData): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; colors: Float32Array; indices: Uint32Array } {
  return { positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs: Float32Array.from(m.uvs), colors: Float32Array.from(m.colors), indices: Uint32Array.from(m.indices) };
}
