/** Tiny merged-mesh builder and procedural primitives for the Cloud Runner scenery (pure, deterministic). */
import type { V3 } from "./course";

export class Mesh {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  get vertexCount(): number { return this.positions.length / 3; }
  vertex(p: V3, n: V3, uv: readonly [number, number], c: readonly [number, number, number]): number {
    const i = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(uv[0], uv[1]);
    this.colors.push(c[0], c[1], c[2], 1);
    return i;
  }
  tri(a: number, b: number, c: number): void { this.indices.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.indices.push(a, b, c, a, c, d); }
  /** Append `other` rotated about Y by `yaw`, tilted by `tilt` about X, scaled non-uniformly, moved to `pos`. */
  append(other: Mesh, pos: V3, scale: V3 | number = 1, yaw = 0, tilt = 0, tint?: readonly [number, number, number]): void {
    const sc: V3 = typeof scale === "number" ? [scale, scale, scale] : scale;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const base = this.vertexCount;
    for (let i = 0; i < other.vertexCount; i++) {
      let x = other.positions[i * 3]! * sc[0], y = other.positions[i * 3 + 1]! * sc[1], z = other.positions[i * 3 + 2]! * sc[2];
      let nx = other.normals[i * 3]!, ny = other.normals[i * 3 + 1]!, nz = other.normals[i * 3 + 2]!;
      const y1 = y * ct - z * st, z1 = y * st + z * ct; y = y1; z = z1;
      const ny1 = ny * ct - nz * st, nz1 = ny * st + nz * ct; ny = ny1; nz = nz1;
      const x2 = x * cy + z * sy, z2 = -x * sy + z * cy;
      const nx2 = nx * cy + nz * sy, nz2 = -nx * sy + nz * cy;
      this.positions.push(x2 + pos[0], y + pos[1], z2 + pos[2]);
      this.normals.push(nx2, ny, nz2);
      this.uvs.push(other.uvs[i * 2]!, other.uvs[i * 2 + 1]!);
      const r = other.colors[i * 4]!, g = other.colors[i * 4 + 1]!, b = other.colors[i * 4 + 2]!;
      this.colors.push(tint ? r * tint[0] : r, tint ? g * tint[1] : g, tint ? b * tint[2] : b, 1);
    }
    for (const idx of other.indices) this.indices.push(base + idx);
  }
  /** Recompute smooth vertex normals from the triangles. */
  computeNormals(): void {
    const n = new Float32Array(this.positions.length);
    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i]!, b = this.indices[i + 1]!, c = this.indices[i + 2]!;
      const ax = this.positions[b * 3]! - this.positions[a * 3]!, ay = this.positions[b * 3 + 1]! - this.positions[a * 3 + 1]!, az = this.positions[b * 3 + 2]! - this.positions[a * 3 + 2]!;
      const bx = this.positions[c * 3]! - this.positions[a * 3]!, by = this.positions[c * 3 + 1]! - this.positions[a * 3 + 1]!, bz = this.positions[c * 3 + 2]! - this.positions[a * 3 + 2]!;
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (const v of [a, b, c]) { n[v * 3] += nx; n[v * 3 + 1] += ny; n[v * 3 + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
      this.normals[i] = n[i]! / l; this.normals[i + 1] = n[i + 1]! / l; this.normals[i + 2] = n[i + 2]! / l;
    }
  }
}

export const hex = (h: string): [number, number, number] => {
  const v = parseInt(h.replace("#", ""), 16);
  const lin = (c: number): number => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
};
export const mix3 = (a: readonly [number, number, number], b: readonly [number, number, number], k: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const mul3 = (a: readonly [number, number, number], k: number): [number, number, number] => [a[0] * k, a[1] * k, a[2] * k];

/** Icosphere, `subdiv` 0..2, radius 1, optional per-vertex radial jitter for lumpy blobs and rocks. */
export function icosphere(subdiv: number, color: readonly [number, number, number], jitter = 0, rnd: () => number = Math.random, flatBottom = false): Mesh {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(([x, y, z]) => { const l = Math.hypot(x!, y!, z!); return [x! / l, y! / l, z! / l] as V3; });
  let faces: [number, number, number][] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const p = verts[a]!, q = verts[b]!;
      const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const l = Math.hypot(m[0], m[1], m[2]);
      verts.push([m[0] / l, m[1] / l, m[2] / l]);
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = next;
  }
  const mesh = new Mesh();
  const radii = verts.map((v) => 1 + (rnd() - 0.5) * 2 * jitter + 0 * v[0]);
  verts = verts.map((v, i) => { const r = radii[i]!; const y = flatBottom ? Math.max(v[1], -0.35) : v[1]; return [v[0] * r, y * r, v[2] * r] as V3; });
  for (const v of verts) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    mesh.vertex(v, [v[0] / l, v[1] / l, v[2] / l], [Math.atan2(v[2], v[0]) / (2 * Math.PI) + 0.5, v[1] * 0.5 + 0.5], color);
  }
  for (const [a, b, c] of faces) mesh.tri(a, b, c);
  mesh.computeNormals();
  return mesh;
}

/** Closed tapered cylinder along +Y from y=0 to y=h. */
export function cylinder(sides: number, r0: number, r1: number, h: number, color: readonly [number, number, number], color2?: readonly [number, number, number]): Mesh {
  const mesh = new Mesh();
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const slope = (r0 - r1) / h;
    const nl = Math.hypot(1, slope);
    mesh.vertex([c * r0, 0, s * r0], [c / nl, slope / nl, s / nl], [i / sides, 0], color);
    mesh.vertex([c * r1, h, s * r1], [c / nl, slope / nl, s / nl], [i / sides, 1], color2 ?? color);
  }
  for (let i = 0; i < sides; i++) { const a = i * 2; mesh.tri(a, a + 1, a + 3); mesh.tri(a, a + 3, a + 2); }
  const cap = mesh.vertex([0, h, 0], [0, 1, 0], [0.5, 0.5], color2 ?? color);
  for (let i = 0; i < sides; i++) mesh.tri(cap, i * 2 + 1, (i + 1) * 2 + 1);
  return mesh;
}

export function box(w: number, h: number, d: number, color: readonly [number, number, number]): Mesh {
  const mesh = new Mesh();
  const f = (n: V3, u: V3, v: V3): void => {
    const o: V3 = [n[0] * w / 2, n[1] * h / 2, n[2] * d / 2];
    const corner = (su: number, sv: number): V3 => [o[0] + u[0] * su * w / 2 + v[0] * sv * w / 2, o[1] + u[1] * su * h / 2 + v[1] * sv * h / 2, o[2] + u[2] * su * d / 2 + v[2] * sv * d / 2];
    const a = mesh.vertex(corner(-1, -1), n, [0, 0], color), b = mesh.vertex(corner(1, -1), n, [1, 0], color), c = mesh.vertex(corner(1, 1), n, [1, 1], color), e = mesh.vertex(corner(-1, 1), n, [0, 1], color);
    mesh.quad(a, b, c, e);
  };
  f([0, 0, 1], [1, 0, 0], [0, 1, 0]); f([0, 0, -1], [-1, 0, 0], [0, 1, 0]);
  f([1, 0, 0], [0, 0, -1], [0, 1, 0]); f([-1, 0, 0], [0, 0, 1], [0, 1, 0]);
  f([0, 1, 0], [1, 0, 0], [0, 0, -1]); f([0, -1, 0], [1, 0, 0], [0, 0, 1]);
  return mesh;
}
