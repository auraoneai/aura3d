/**
 * Procedural geometry for the course (the original streams chunked meshes and GLB props): the route
 * ribbon with its rooftop/branch gaps and terrain verges, the town floor, the river plane and the falls sheet. Pure
 * functions returning flat typed-array data for `geometry.dynamic`; no engine imports.
 */
import { BIOME_TONES, hexLinear, type Rgb } from "./palette";
import { COURSE_LENGTH, biomeAt, gapAt, groundFrame, pathWidth, routeFrame } from "./course";

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

const VERGE_OFFSETS = [6, 16, 34, 70, 140, 260] as const;

/** How far the verge falls below the path edge `out` metres away: gentle in the village and forest, steep over the river, valley and rooftops. */
export function vergeDrop(d: number, out: number): number {
  if (out <= 0) return 0;
  const biome = biomeAt(Math.max(0, d));
  if (biome === "village" || biome === "alley" || biome === "stairs") return -Math.min(2.2, out * 0.05);
  if (biome === "forest_entry" || biome === "forest") return -Math.min(3, out * 0.05);
  return -Math.min(14, out * 0.16) - (biome === "rooftops" ? 3 : 0);
}

/** Ground height of the route surface at (distance, lateral): the verge falls away from the path edge. */
export function surfaceY(d: number, lat: number): number {
  return groundFrame(d, lat).y + vergeDrop(d, Math.abs(lat) - pathWidth(Math.max(0, d)) / 2);
}

interface Ribbon { data: MeshData; rows: number; stride: number }

/** Signed curvature of the route at `d` (positive = turning toward +lateral), from the tangent change over 6 m. */
function curvature(d: number): number {
  const a = routeFrame(d - 3), b = routeFrame(d + 3), t = routeFrame(d);
  return ((b.dx - a.dx) * -t.dz + (b.dz - a.dz) * t.dx) / 6;
}

/** Far verge columns on the inside of a bend would fold over themselves; pull them in to 80% of the bend radius. */
function foldFree(d: number, lat: number): number {
  const k = curvature(d);
  if (lat * k <= 0 || Math.abs(k) < 1e-6) return lat;
  const cap = 0.8 / Math.abs(k);
  return Math.abs(lat) > cap ? Math.sign(lat) * cap : lat;
}

/** The route ribbon: 7 columns across the path and `VERGE_OFFSETS.length` verge columns each side; gap quads are omitted. */
function ribbon(step: number): Ribbon {
  const b = new MeshBuilder();
  const rows = Math.ceil((COURSE_LENGTH + 24) / step);
  const columns = (w: number): number[] => {
    const half = w / 2;
    const path = [-half, -half * 0.66, -half * 0.33, 0, half * 0.33, half * 0.66, half];
    const verge = VERGE_OFFSETS.map((o) => half + o);
    return [...verge.map((v) => -v).reverse(), ...path, ...verge];
  };
  const stride = columns(8).length;
  for (let r = 0; r <= rows; r++) {
    const d = -12 + r * step;
    const w = pathWidth(Math.max(0, d));
    columns(w).forEach((lat0, c) => {
      const onPath = Math.abs(lat0) <= w / 2 + 1e-6;
      const lat = onPath ? lat0 : foldFree(d, lat0);
      const f = groundFrame(d, lat);
      const tone = onPath ? toneAt(d, false) : lerp3(toneAt(d, false), toneAt(d, true), Math.min(1, (Math.abs(lat) - w / 2) / 6));
      const edgeDrop = onPath ? 0 : vergeDrop(d, Math.abs(lat) - w / 2);
      b.vertex(f.x, f.y + edgeDrop, f.z, lat / 4, d / 4, tone);
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
  return { data: b.computeNormals().data, rows, stride };
}

/** The route as one mesh with per-vertex tones (used by the shader-based fallback and the tests). */
export function buildRoute(step = 2): MeshData { return ribbon(step).data; }

export interface RouteGroup { readonly biome: string; readonly zone: "path" | "verge"; readonly mesh: MeshData }

/**
 * The route split by biome and surface (path or verge) so each group can take a flat lit PBR colour; normals come
 * from the whole ribbon, so shading is continuous across group borders.
 */
export function buildRouteGroups(step = 2): RouteGroup[] {
  const { data, rows, stride } = ribbon(step);
  const first = VERGE_OFFSETS.length, last = first + 6;
  const lists = new Map<string, number[]>();
  for (let r = 0; r < rows; r++) {
    const mid = -12 + (r + 0.5) * step;
    if (gapAt(mid)) continue;
    const biome = biomeAt(Math.max(0, mid));
    for (let c = 0; c < stride - 1; c++) {
      const zone = c >= first && c < last ? "path" : "verge";
      const key = `${biome}|${zone}`;
      let list = lists.get(key);
      if (!list) lists.set(key, list = []);
      const i = r * stride + c;
      list.push(i, i + 1, i + stride, i + 1, i + stride + 1, i + stride);
    }
  }
  return [...lists.entries()].map(([key, tris]) => {
    const [biome, zone] = key.split("|") as [string, "path" | "verge"];
    const remap = new Map<number, number>();
    const mesh: MeshData = { positions: [], normals: [], uvs: [], tones: [], indices: [] };
    for (const old of tris) {
      let n = remap.get(old);
      if (n === undefined) {
        n = remap.size;
        remap.set(old, n);
        mesh.positions.push(data.positions[old * 3]!, data.positions[old * 3 + 1]!, data.positions[old * 3 + 2]!);
        mesh.normals.push(data.normals[old * 3]!, data.normals[old * 3 + 1]!, data.normals[old * 3 + 2]!);
        mesh.uvs.push(data.uvs[old * 2]!, data.uvs[old * 2 + 1]!);
        mesh.tones.push(data.tones[old * 3]!, data.tones[old * 3 + 1]!, data.tones[old * 3 + 2]!);
      }
      mesh.indices.push(n);
    }
    return { biome, zone, mesh };
  });
}

/** The street the rooftop run looks down on: a flat strip along the route between `from` and `to`, `half` metres each side. */
export function buildTownFloor(from: number, to: number, half: number, y: number, step = 24): MeshData {
  const b = new MeshBuilder();
  const rows = Math.ceil((to - from) / step);
  for (let r = 0; r <= rows; r++) {
    const d = from + r * step;
    for (const lat of [-half, 0, half]) { const f = groundFrame(d, lat); b.vertex(f.x, y, f.z, f.x / 5, f.z / 5, [1, 1, 1]); }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
    const i = r * 3 + c;
    b.tri(i, i + 1, i + 3);
    b.tri(i + 1, i + 4, i + 3);
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
