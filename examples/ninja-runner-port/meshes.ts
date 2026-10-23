/**
 * Procedural geometry for the course (the original streams chunked meshes and GLB props): the route
 * ribbon with its rooftop/branch gaps, terrain verges, buildings, trees, rails and the river plane. Pure
 * functions returning flat typed-array data for `geometry.dynamic`; no engine imports.
 */
import { BIOME_TONES, hexLinear, type Rgb } from "./palette";
import { COURSE_LENGTH, biomeAt, gapAt, groundFrame, pathWidth, railHeight } from "./course";
import { seededRandom } from "./sim";

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  tones: number[];
  indices: number[];
}

export class MeshBuilder {
  readonly data: MeshData = { positions: [], normals: [], uvs: [], tones: [], indices: [] };

  get vertexCount(): number { return this.data.positions.length / 3; }

  vertex(x: number, y: number, z: number, u: number, v: number, tone: Rgb): number {
    const d = this.data;
    d.positions.push(x, y, z);
    d.normals.push(0, 1, 0);
    d.uvs.push(u, v);
    d.tones.push(tone[0], tone[1], tone[2]);
    return d.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void { this.data.indices.push(a, b, c); }

  /** Area-weighted smooth normals from the triangles. */
  computeNormals(): this {
    const d = this.data;
    const n = new Float32Array(d.positions.length);
    for (let i = 0; i < d.indices.length; i += 3) {
      const ia = d.indices[i]! * 3, ib = d.indices[i + 1]! * 3, ic = d.indices[i + 2]! * 3;
      const ux = d.positions[ib]! - d.positions[ia]!, uy = d.positions[ib + 1]! - d.positions[ia + 1]!, uz = d.positions[ib + 2]! - d.positions[ia + 2]!;
      const vx = d.positions[ic]! - d.positions[ia]!, vy = d.positions[ic + 1]! - d.positions[ia + 1]!, vz = d.positions[ic + 2]! - d.positions[ia + 2]!;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [ia, ib, ic]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
      d.normals[i] = n[i]! / l; d.normals[i + 1] = n[i + 1]! / l; d.normals[i + 2] = n[i + 2]! / l;
    }
    return this;
  }

  /** Axis-aligned box (rotated about Y by `yaw`) with flat faces, `y0` at its base. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, tone: Rgb): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const corner = (lx: number, ly: number, lz: number): [number, number, number] => [cx + lx * c + lz * s, y0 + ly, cz - lx * s + lz * c];
    const hx = w / 2, hz = d / 2;
    const faces: [[number, number, number], [number, number, number], [number, number, number], [number, number, number], [number, number, number]][] = [
      [[-hx, 0, hz], [hx, 0, hz], [hx, h, hz], [-hx, h, hz], [0, 0, 1]],
      [[hx, 0, -hz], [-hx, 0, -hz], [-hx, h, -hz], [hx, h, -hz], [0, 0, -1]],
      [[hx, 0, hz], [hx, 0, -hz], [hx, h, -hz], [hx, h, hz], [1, 0, 0]],
      [[-hx, 0, -hz], [-hx, 0, hz], [-hx, h, hz], [-hx, h, -hz], [-1, 0, 0]],
      [[-hx, h, hz], [hx, h, hz], [hx, h, -hz], [-hx, h, -hz], [0, 1, 0]]
    ];
    for (const [a, b, cc, dd, n] of faces) {
      const nx = n[0] * c + n[2] * s, nz = -n[0] * s + n[2] * c;
      const base = this.vertexCount;
      for (const [p, u, v] of [[a, 0, 0], [b, 1, 0], [cc, 1, 1], [dd, 0, 1]] as const) {
        const q = corner(p[0], p[1], p[2]);
        const i = this.vertex(q[0], q[1], q[2], u, v, tone);
        this.data.normals[i * 3] = nx; this.data.normals[i * 3 + 1] = n[1]; this.data.normals[i * 3 + 2] = nz;
      }
      this.tri(base, base + 1, base + 2);
      this.tri(base, base + 2, base + 3);
    }
  }

  /** Cone or cylinder standing on `y0` (radiusTop 0 = cone), flat-shaded sides. */
  frustum(cx: number, y0: number, cz: number, radiusBottom: number, radiusTop: number, height: number, segments: number, tone: Rgb): void {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2, am = (a0 + a1) / 2;
      const base = this.vertexCount;
      const pts: [number, number, number][] = [
        [cx + Math.cos(a0) * radiusBottom, y0, cz + Math.sin(a0) * radiusBottom], [cx + Math.cos(a1) * radiusBottom, y0, cz + Math.sin(a1) * radiusBottom],
        [cx + Math.cos(a1) * radiusTop, y0 + height, cz + Math.sin(a1) * radiusTop], [cx + Math.cos(a0) * radiusTop, y0 + height, cz + Math.sin(a0) * radiusTop]
      ];
      const slope = (radiusBottom - radiusTop) / Math.max(1e-6, height);
      const nl = Math.hypot(1, slope);
      pts.forEach((p, k) => {
        const idx = this.vertex(p[0], p[1], p[2], k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0, tone);
        this.data.normals[idx * 3] = Math.cos(am) / nl; this.data.normals[idx * 3 + 1] = slope / nl; this.data.normals[idx * 3 + 2] = Math.sin(am) / nl;
      });
      this.tri(base, base + 1, base + 2);
      this.tri(base, base + 2, base + 3);
    }
  }
}

const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const TONES = Object.fromEntries(Object.entries(BIOME_TONES).map(([k, [p, v]]) => [k, [hexLinear(p), hexLinear(v)] as const]));

const toneAt = (d: number, verge: boolean): Rgb => {
  const a = TONES[biomeAt(d - 6)]!, b = TONES[biomeAt(d + 6)]!;
  const i = verge ? 1 : 0;
  return lerp3(a[i]!, b[i]!, 0.5);
};

/**
 * The route: a ribbon of `rows` quads along the course with 7 columns across the path and 4 verge columns each
 * side. Quads whose centre lies inside a gap are omitted, so the rooftop and branch gaps are real holes.
 */
export function buildRoute(step = 2): MeshData {
  const b = new MeshBuilder();
  const rows = Math.ceil((COURSE_LENGTH + 24) / step);
  const columns = (w: number): number[] => {
    const half = w / 2;
    const path = [-half, -half * 0.66, -half * 0.33, 0, half * 0.33, half * 0.66, half];
    const verge = [6, 16, 34, 70].map((o) => half + o);
    return [...verge.map((v) => -v).reverse(), ...path, ...verge];
  };
  const stride = columns(8).length;
  for (let r = 0; r <= rows; r++) {
    const d = -12 + r * step;
    const w = pathWidth(Math.max(0, d));
    columns(w).forEach((lat, c) => {
      const f = groundFrame(d, lat);
      const onPath = Math.abs(lat) <= w / 2 + 1e-6;
      const tone = onPath ? toneAt(d, false) : lerp3(toneAt(d, false), toneAt(d, true), Math.min(1, (Math.abs(lat) - w / 2) / 6));
      const edgeDrop = onPath ? 0 : -Math.min(14, (Math.abs(lat) - w / 2) * 0.16) - (biomeAt(d) === "rooftops" ? 3 : 0);
      b.vertex(f.x, f.y + edgeDrop, f.z, c / (stride - 1), d / 3, tone);
    });
  }
  for (let r = 0; r < rows; r++) {
    const mid = -12 + (r + 0.5) * step;
    if (gapAt(mid)) continue;
    for (let c = 0; c < stride - 1; c++) {
      const i = r * stride + c;
      b.tri(i, i + 1, i + stride);
      b.tri(i + 1, i + stride + 1, i + stride);
    }
  }
  return b.computeNormals().data;
}

/** Buildings along the village, backstreets and rooftops; moss-green trees through the forest; rails on the path edge. */
export function buildProps(): MeshData {
  const b = new MeshBuilder();
  const rand = seededRandom(9871);
  const wall = [hexLinear("#d8c8a6"), hexLinear("#c9b894"), hexLinear("#b8a27c"), hexLinear("#a58a68")];
  const roof = [hexLinear("#8b4f3d"), hexLinear("#6f3f33"), hexLinear("#5e4338")];
  for (let d = 20; d < 1130; d += 18 + Math.floor(rand() * 10)) {
    if (gapAt(d)) continue;
    for (const side of [-1, 1]) {
      const w = pathWidth(d);
      const lat = side * (w / 2 + 5 + rand() * 7);
      const f = groundFrame(d, lat);
      const yaw = Math.atan2(f.dx, f.dz);
      const bw = 7 + rand() * 6, bd = 7 + rand() * 7, bh = 4 + rand() * 6;
      const base = f.y - (biomeAt(d) === "rooftops" ? 3 : 0);
      b.box(f.x, base, f.z, bw, bh, bd, yaw, wall[Math.floor(rand() * wall.length)]!);
      b.box(f.x, base + bh, f.z, bw + 1.4, 0.7, bd + 1.4, yaw, roof[Math.floor(rand() * roof.length)]!);
    }
  }
  const bark = hexLinear("#4a3a2a"), leaf = [hexLinear("#2f5a30"), hexLinear("#3b6b36"), hexLinear("#24492a")];
  for (let d = 1500; d < COURSE_LENGTH - 30; d += 9 + Math.floor(rand() * 8)) {
    if (gapAt(d)) continue;
    for (const side of [-1, 1]) {
      const w = pathWidth(d);
      const lat = side * (w / 2 + 3 + rand() * 38);
      const f = groundFrame(d, lat);
      const h = 9 + rand() * 12;
      const y = f.y - Math.min(14, (Math.abs(lat) - w / 2) * 0.16);
      b.frustum(f.x, y, f.z, 0.7 + rand() * 0.5, 0.45, h, 7, bark);
      b.frustum(f.x, y + h * 0.55, f.z, 3.6 + rand() * 2.2, 0.2, h * 0.7, 8, leaf[Math.floor(rand() * leaf.length)]!);
    }
  }
  const rail = hexLinear("#6b5640");
  for (let d = 0; d < COURSE_LENGTH; d += 12) {
    if (gapAt(d)) continue;
    const w = pathWidth(d);
    const h = railHeight(d);
    for (const side of [-1, 1]) {
      const f = groundFrame(d, side * (w / 2 + 0.25));
      b.box(f.x, f.y, f.z, 0.22, Math.min(1.2, h * 0.5), 0.22, 0, rail);
    }
  }
  return b.computeNormals().data;
}

/** The river: a large flat grid below the route (vertex shader adds the waves). */
export function buildWater(): MeshData {
  const b = new MeshBuilder();
  const x0 = -260, x1 = 760, z0 = -2760, z1 = 220, nx = 40, nz = 120;
  const tone: Rgb = [0.1, 0.2, 0.2];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) b.vertex(x0 + ((x1 - x0) * i) / nx, 0, z0 + ((z1 - z0) * j) / nz, i / nx, j / nz, tone);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i;
    b.tri(a, a + nx + 1, a + 1);
    b.tri(a + 1, a + nx + 1, a + nx + 2);
  }
  return b.data;
}

/** Flat sheet for the valley waterfall veil (width x height, centred on x, standing on y). */
export function buildSheet(width: number, height: number, segmentsX = 24, segmentsY = 12): MeshData {
  const b = new MeshBuilder();
  const tone: Rgb = [1, 1, 1];
  for (let j = 0; j <= segmentsY; j++) for (let i = 0; i <= segmentsX; i++) b.vertex((i / segmentsX - 0.5) * width, (j / segmentsY) * height, 0, i / segmentsX, j / segmentsY, tone);
  for (let j = 0; j < segmentsY; j++) for (let i = 0; i < segmentsX; i++) {
    const a = j * (segmentsX + 1) + i;
    b.tri(a, a + 1, a + segmentsX + 1);
    b.tri(a + 1, a + segmentsX + 2, a + segmentsX + 1);
  }
  for (let i = 0; i < b.data.normals.length; i += 3) { b.data.normals[i] = 0; b.data.normals[i + 1] = 0; b.data.normals[i + 2] = 1; }
  return b.data;
}
