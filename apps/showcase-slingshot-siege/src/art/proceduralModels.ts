/**
 * Slingshot Siege — 100% Native `@aura3d/engine` Multi-Material Procedural 3D Models.
 *
 * Replaces every single-mesh Meshy clay GLB and every raw primitive placeholder
 * (striped roundedBox cliff blocks, single-cone grass spikes, flat cylinder island
 * pancakes, grey cube flag pedestal) with sculpted, multi-part, multi-material
 * procedural 3D geometry built from scratch in `@aura3d/engine` (zero `three` imports).
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";

type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }> & { readonly visible?: boolean };
import type { AmmoId } from "../game/ammo";
import type { ChapterLook } from "../game/look";

// ---------------------------------------------------------------------------
// Low-level procedural mesh kernel (CCW outward winding, strict typed arrays)
// ---------------------------------------------------------------------------

export interface RawMesh {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

type V3 = readonly [number, number, number];
type V2 = readonly [number, number];

function sub3(a: V3, b: V3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: V3, b: V3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function norm3(v: V3): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function hash01(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x: number, y: number, z: number, seed = 1): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number =>
    hash01(
      Math.imul(ix + dx, 73856093) ^
      Math.imul(iy + dy, 19349663) ^
      Math.imul(iz + dz, 83492791) ^
      Math.imul(seed, 2654435761)
    );
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ux;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ux;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ux;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

function fbm3(x: number, y: number, z: number, seed = 1): number {
  return (
    noise3(x, y, z, seed) * 0.55 +
    noise3(x * 2.07, y * 2.07, z * 2.07, seed + 17) * 0.3 +
    noise3(x * 4.13, y * 4.13, z * 4.13, seed + 43) * 0.15
  );
}

interface TransformOpts {
  readonly pos?: V3;
  readonly rot?: V3; // Euler XYZ radians
  readonly scale?: number | V3;
}

function transformMesh(src: RawMesh, opts: TransformOpts = {}): RawMesh {
  const px = opts.pos?.[0] ?? 0;
  const py = opts.pos?.[1] ?? 0;
  const pz = opts.pos?.[2] ?? 0;
  const rx = opts.rot?.[0] ?? 0;
  const ry = opts.rot?.[1] ?? 0;
  const rz = opts.rot?.[2] ?? 0;
  const sx = typeof opts.scale === "number" ? opts.scale : (opts.scale?.[0] ?? 1);
  const sy = typeof opts.scale === "number" ? opts.scale : (opts.scale?.[1] ?? 1);
  const sz = typeof opts.scale === "number" ? opts.scale : (opts.scale?.[2] ?? 1);

  const cx = Math.cos(rx), snx = Math.sin(rx);
  const cy = Math.cos(ry), sny = Math.sin(ry);
  const cz = Math.cos(rz), snz = Math.sin(rz);

  const rotVec = (vx: number, vy: number, vz: number): [number, number, number] => {
    // X -> Y -> Z
    const y1 = vy * cx - vz * snx;
    const z1 = vy * snx + vz * cx;
    const x2 = vx * cy + z1 * sny;
    const z2 = -vx * sny + z1 * cy;
    const x3 = x2 * cz - y1 * snz;
    const y3 = x2 * snz + y1 * cz;
    return [x3, y3, z2];
  };

  const positions = new Array<number>(src.positions.length);
  const normals = new Array<number>(src.normals.length);
  const invSx = 1 / (Math.abs(sx) > 1e-6 ? sx : 1);
  const invSy = 1 / (Math.abs(sy) > 1e-6 ? sy : 1);
  const invSz = 1 / (Math.abs(sz) > 1e-6 ? sz : 1);

  for (let i = 0; i < src.positions.length; i += 3) {
    const [ox, oy, oz] = rotVec(src.positions[i]! * sx, src.positions[i + 1]! * sy, src.positions[i + 2]! * sz);
    positions[i] = ox + px;
    positions[i + 1] = oy + py;
    positions[i + 2] = oz + pz;

    const [nx, ny, nz] = rotVec(src.normals[i]! * invSx, src.normals[i + 1]! * invSy, src.normals[i + 2]! * invSz);
    const nl = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / nl;
    normals[i + 1] = ny / nl;
    normals[i + 2] = nz / nl;
  }

  const flip = sx * sy * sz < 0;
  const indices = src.indices.slice();
  if (flip) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = tmp;
    }
  }
  return { positions, normals, uvs: src.uvs.slice(), indices };
}

function toFlatShaded(src: RawMesh): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < src.indices.length; i += 3) {
    const i0 = src.indices[i]! * 3;
    const i1 = src.indices[i + 1]! * 3;
    const i2 = src.indices[i + 2]! * 3;
    const p0: V3 = [src.positions[i0]!, src.positions[i0 + 1]!, src.positions[i0 + 2]!];
    const p1: V3 = [src.positions[i1]!, src.positions[i1 + 1]!, src.positions[i1 + 2]!];
    const p2: V3 = [src.positions[i2]!, src.positions[i2 + 1]!, src.positions[i2 + 2]!];
    const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
    const base = positions.length / 3;
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    const u0 = (i0 / 3) * 2, u1 = (i1 / 3) * 2, u2 = (i2 / 3) * 2;
    uvs.push(
      src.uvs[u0] ?? 0, src.uvs[u0 + 1] ?? 0,
      src.uvs[u1] ?? 0, src.uvs[u1 + 1] ?? 0,
      src.uvs[u2] ?? 0, src.uvs[u2 + 1] ?? 0
    );
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, uvs, indices };
}

function pushQuadCCW(out: RawMesh, p0: V3, p1: V3, p2: V3, p3: V3, uvScale = 1): void {
  const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
  const base = out.positions.length / 3;
  out.positions.push(
    p0[0], p0[1], p0[2],
    p1[0], p1[1], p1[2],
    p2[0], p2[1], p2[2],
    p3[0], p3[1], p3[2]
  );
  for (let k = 0; k < 4; k += 1) out.normals.push(n[0], n[1], n[2]);
  out.uvs.push(0, 0, uvScale, 0, uvScale, uvScale, 0, uvScale);
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushTriCCW(out: RawMesh, p0: V3, p1: V3, p2: V3): void {
  const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
  const base = out.positions.length / 3;
  out.positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  out.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  out.uvs.push(0, 0, 1, 0, 0.5, 1);
  out.indices.push(base, base + 1, base + 2);
}

/**
 * Chamfered 3D box (`wx * wy * wz` centered at origin) with 45-degree edge bevels so
 * every timber beam, stone course, merlon, and crate rail catches crisp specular light.
 */
export function bevelBoxMesh(wx: number, wy: number, wz: number, bevel = 0.03): RawMesh {
  const hx = wx * 0.5, hy = wy * 0.5, hz = wz * 0.5;
  const b = Math.min(bevel, hx * 0.42, hy * 0.42, hz * 0.42);
  const ix = hx - b, iy = hy - b, iz = hz - b;
  const out: RawMesh = { positions: [], normals: [], uvs: [], indices: [] };

  if (b <= 1e-4) {
    pushQuadCCW(out, [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]);
    pushQuadCCW(out, [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]);
    pushQuadCCW(out, [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]);
    pushQuadCCW(out, [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]);
    pushQuadCCW(out, [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]);
    pushQuadCCW(out, [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]);
    return out;
  }

  // 6 primary faces
  pushQuadCCW(out, [-ix, -iy, hz], [ix, -iy, hz], [ix, iy, hz], [-ix, iy, hz]); // +Z
  pushQuadCCW(out, [ix, -iy, -hz], [-ix, -iy, -hz], [-ix, iy, -hz], [ix, iy, -hz]); // -Z
  pushQuadCCW(out, [hx, -iy, iz], [hx, -iy, -iz], [hx, iy, -iz], [hx, iy, iz]); // +X
  pushQuadCCW(out, [-hx, -iy, -iz], [-hx, -iy, iz], [-hx, iy, iz], [-hx, iy, -iz]); // -X
  pushQuadCCW(out, [-ix, hy, iz], [ix, hy, iz], [ix, hy, -iz], [-ix, hy, -iz]); // +Y
  pushQuadCCW(out, [-ix, -hy, -iz], [ix, -hy, -iz], [ix, -hy, iz], [-ix, -hy, iz]); // -Y

  // 4 vertical edge bevels
  pushQuadCCW(out, [ix, -iy, hz], [hx, -iy, iz], [hx, iy, iz], [ix, iy, hz]); // +X+Z
  pushQuadCCW(out, [hx, -iy, -iz], [ix, -iy, -hz], [ix, iy, -hz], [hx, iy, -iz]); // +X-Z
  pushQuadCCW(out, [-ix, -iy, -hz], [-hx, -iy, -iz], [-hx, iy, -iz], [-ix, iy, -hz]); // -X-Z
  pushQuadCCW(out, [-hx, -iy, iz], [-ix, -iy, hz], [-ix, iy, hz], [-hx, iy, iz]); // -X+Z

  // 4 top edge bevels
  pushQuadCCW(out, [-ix, iy, hz], [ix, iy, hz], [ix, hy, iz], [-ix, hy, iz]); // +Y+Z
  pushQuadCCW(out, [ix, iy, -hz], [-ix, iy, -hz], [-ix, hy, -iz], [ix, hy, -iz]); // +Y-Z
  pushQuadCCW(out, [hx, iy, iz], [hx, iy, -iz], [ix, hy, -iz], [ix, hy, iz]); // +Y+X
  pushQuadCCW(out, [-hx, iy, -iz], [-hx, iy, iz], [-ix, hy, iz], [-ix, hy, -iz]); // +Y-X

  // 4 bottom edge bevels
  pushQuadCCW(out, [-ix, -hy, iz], [ix, -hy, iz], [ix, -iy, hz], [-ix, -iy, hz]); // -Y+Z
  pushQuadCCW(out, [ix, -hy, -iz], [-ix, -hy, -iz], [-ix, -iy, -hz], [ix, -iy, -hz]); // -Y-Z
  pushQuadCCW(out, [ix, -hy, iz], [ix, -hy, -iz], [hx, -iy, -iz], [hx, -iy, iz]); // -Y+X
  pushQuadCCW(out, [-ix, -hy, -iz], [-ix, -hy, iz], [-hx, -iy, iz], [-hx, -iy, -iz]); // -Y-X

  // 8 corner triangles
  pushTriCCW(out, [ix, iy, hz], [hx, iy, iz], [ix, hy, iz]);
  pushTriCCW(out, [hx, iy, -iz], [ix, iy, -hz], [ix, hy, -iz]);
  pushTriCCW(out, [-ix, iy, -hz], [-hx, iy, -iz], [-ix, hy, -iz]);
  pushTriCCW(out, [-hx, iy, iz], [-ix, iy, hz], [-ix, hy, iz]);

  pushTriCCW(out, [hx, -iy, iz], [ix, -iy, hz], [ix, -hy, iz]);
  pushTriCCW(out, [ix, -iy, -hz], [hx, -iy, -iz], [ix, -hy, -iz]);
  pushTriCCW(out, [-hx, -iy, -iz], [-ix, -iy, -hz], [-ix, -hy, -iz]);
  pushTriCCW(out, [-ix, -iy, hz], [-hx, -iy, iz], [-ix, -hy, iz]);

  return out;
}

/**
 * Revolved lathe surface around +Y from bottom-to-top profile `[radius, y][]`.
 */
export function latheMesh(profile: readonly V2[], radialSegs = 16, flatShaded = false): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = profile.length;

  for (let j = 0; j < rows; j += 1) {
    const [r, y] = profile[j]!;
    const prev = profile[Math.max(0, j - 1)]!;
    const next = profile[Math.min(rows - 1, j + 1)]!;
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dr, dy) || 1;
    // Outward 2D normal in (r, y) plane is (dy, -dr) when profile goes bottom -> top
    const nr = dy / len;
    const ny = -dr / len;
    const v = j / Math.max(1, rows - 1);

    for (let i = 0; i <= radialSegs; i += 1) {
      const u = i / radialSegs;
      const phi = u * Math.PI * 2;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      // x = r * sin(phi), z = r * cos(phi) -> as phi increases 0..2pi, goes +Z -> +X -> -Z -> -X (CCW from +Y!)
      positions.push(r * sp, y, r * cp);
      if (r < 1e-5) {
        normals.push(0, ny >= 0 ? 1 : -1, 0);
      } else {
        normals.push(nr * sp, ny, nr * cp);
      }
      uvs.push(u, v);
    }
  }

  const stride = radialSegs + 1;
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < radialSegs; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      // Check outward winding: at phi=0 (z=+r), a=(0,y0,r), b=(dx,y0,r), c=(dx,y1,r), d=(0,y1,r)
      // (b-a) x (c-a) = (+x, 0, 0) x (+x, +y, 0) = (0, 0, +xy) -> +Z outward!
      indices.push(a, b, c, a, c, d);
    }
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/**
 * Swept 3D tube along spine `[x, y, z, radius][]` with parallel-transport frames.
 */
export function tubeSweepMesh(
  spine: readonly (readonly [number, number, number, number])[],
  radialSegs = 8,
  flatShaded = false
): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const nPts = spine.length;
  let up: [number, number, number] = [0, 1, 0];

  for (let j = 0; j < nPts; j += 1) {
    const cur = spine[j]!;
    const prev = spine[Math.max(0, j - 1)]!;
    const next = spine[Math.min(nPts - 1, j + 1)]!;
    const tang = norm3([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
    if (Math.abs(tang[0] * up[0] + tang[1] * up[1] + tang[2] * up[2]) > 0.96) {
      up = [0, 0, 1];
    }
    const side = norm3(cross3(up, tang));
    const binorm = norm3(cross3(tang, side));
    up = binorm;

    const r = cur[3];
    const v = j / Math.max(1, nPts - 1);
    for (let i = 0; i <= radialSegs; i += 1) {
      const u = i / radialSegs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // side * sa + binorm * ca: (side x binorm) = tang, check outward:
      // d/da = side * ca - binorm * sa; d/dj = tang; (d/da) x tang at a=0: side x tang = -binorm (inward), so reverse order in indices!
      const nx = side[0] * ca + binorm[0] * sa;
      const ny = side[1] * ca + binorm[1] * sa;
      const nz = side[2] * ca + binorm[2] * sa;
      positions.push(cur[0] + nx * r, cur[1] + ny * r, cur[2] + nz * r);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }

  const stride = radialSegs + 1;
  for (let j = 0; j < nPts - 1; j += 1) {
    for (let i = 0; i < radialSegs; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      indices.push(a, d, c, a, c, b);
    }
  }

  // Cap ends if radius > 0
  const first = spine[0]!;
  if (first[3] > 1e-4) {
    const cIdx = positions.length / 3;
    const next = spine[1] ?? first;
    const n0 = norm3([first[0] - next[0], first[1] - next[1], first[2] - next[2]]);
    positions.push(first[0], first[1], first[2]);
    normals.push(n0[0], n0[1], n0[2]);
    uvs.push(0.5, 0.5);
    for (let i = 0; i < radialSegs; i += 1) indices.push(cIdx, i, i + 1);
  }
  const last = spine[nPts - 1]!;
  if (last[3] > 1e-4) {
    const cIdx = positions.length / 3;
    const prev = spine[nPts - 2] ?? last;
    const n1 = norm3([last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]]);
    positions.push(last[0], last[1], last[2]);
    normals.push(n1[0], n1[1], n1[2]);
    uvs.push(0.5, 0.5);
    const ring = (nPts - 1) * stride;
    for (let i = 0; i < radialSegs; i += 1) indices.push(cIdx, ring + i + 1, ring + i);
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/**
 * Extruded convex/star-shaped 2D polygon `poly` (CCW in XY) along Z in `[-depth/2, +depth/2]`.
 */
export function extrudeStarPolygonMesh(poly: readonly V2[], depth: number, center: V2 = [0, 0]): RawMesh {
  const out: RawMesh = { positions: [], normals: [], uvs: [], indices: [] };
  const hz = depth * 0.5;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    // Front (+Z)
    pushTriCCW(out, [center[0], center[1], hz], [a[0], a[1], hz], [b[0], b[1], hz]);
    // Back (-Z)
    pushTriCCW(out, [center[0], center[1], -hz], [b[0], b[1], -hz], [a[0], a[1], -hz]);
    // Side wall
    pushQuadCCW(out, [a[0], a[1], -hz], [b[0], b[1], -hz], [b[0], b[1], hz], [a[0], a[1], hz]);
  }
  return out;
}

function computePositionsBounds(positions: Float32Array): { min: V3; max: V3 } | undefined {
  if (positions.length < 3) return undefined;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function mergeRawMeshes(parts: readonly RawMesh[]): AuraCustomGeometrySpec {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const p of parts) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    for (let k = 0; k < p.indices.length; k += 1) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
    vOff += p.positions.length / 3;
    iOff += p.indices.length;
  }

  return geometry.define({ positions, normals, uvs, indices, bounds: computePositionsBounds(positions) });
}

export interface MultiMatSlot {
  readonly mesh: RawMesh;
  readonly materialIndex: number;
}

export function buildGroupedGeometrySpec(slots: readonly MultiMatSlot[]): AuraCustomGeometrySpec {
  const byMat = new Map<number, RawMesh[]>();
  for (const s of slots) {
    let list = byMat.get(s.materialIndex);
    if (!list) byMat.set(s.materialIndex, (list = []));
    list.push(s.mesh);
  }
  const sorted = [...byMat.entries()].sort(([a], [b]) => a - b);

  let totalVerts = 0;
  let totalIdx = 0;
  for (const [, list] of sorted) {
    for (const m of list) {
      totalVerts += m.positions.length / 3;
      totalIdx += m.indices.length;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  let vOff = 0;
  let iOff = 0;
  for (const [materialIndex, list] of sorted) {
    const start = iOff;
    for (const m of list) {
      positions.set(m.positions, vOff * 3);
      normals.set(m.normals, vOff * 3);
      uvs.set(m.uvs, vOff * 2);
      for (let k = 0; k < m.indices.length; k += 1) {
        indices[iOff + k] = m.indices[k]! + vOff;
      }
      vOff += m.positions.length / 3;
      iOff += m.indices.length;
    }
    groups.push({ start, count: iOff - start, materialIndex });
  }

  return geometry.define({ positions, normals, uvs, indices, groups, bounds: computePositionsBounds(positions) });
}

// ---------------------------------------------------------------------------
// Shared Craft Materials Palette (Multi-Lobe PBR, zero ambient-fill violations)
// ---------------------------------------------------------------------------

export const CRAFT_MATS = {
  seasonedOak: material.physical({
    name: "seasoned siege oak",
    color: "#8a5a32",
    roughness: 0.64,
    metallic: 0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.28,
    normal: material.proceduralTextures.fabric({ scale: 16, strength: 0.38, contrast: 0.66 }),
    envMapIntensity: 1.22
  }),
  darkWalnut: material.physical({
    name: "aged dark walnut",
    color: "#4f321c",
    roughness: 0.7,
    metallic: 0,
    clearcoat: 0.26,
    clearcoatRoughness: 0.34,
    normal: material.proceduralTextures.fabric({ scale: 18, strength: 0.34, contrast: 0.65 })
  }),
  cratePine: material.physical({
    name: "chamfered crate pine",
    color: "#c8965a",
    roughness: 0.62,
    metallic: 0,
    clearcoat: 0.32,
    clearcoatRoughness: 0.26,
    normal: material.proceduralTextures.fabric({ scale: 15, strength: 0.34, contrast: 0.64 }),
    envMapIntensity: 1.2
  }),
  forgedIron: material.studioMetal({
    name: "forged blackened iron",
    color: "#3d4450",
    roughness: 0.28,
    envMapIntensity: 1.45
  }),
  navalBrass: material.studioMetal({
    name: "turned naval brass",
    color: "#e2ba5a",
    roughness: 0.22,
    envMapIntensity: 1.55
  }),
  ashlarStone: material.ceramic({
    name: "coursed ashlar limestone",
    color: "#dfd8c8",
    roughness: 0.74,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    envMapIntensity: 1.15
  }),
  quoinStone: material.ceramic({
    name: "dressed quoin stone",
    color: "#c1b8a5",
    roughness: 0.78,
    clearcoat: 0.16,
    clearcoatRoughness: 0.42
  }),
  whitewashPlaster: material.ceramic({
    name: "coastal whitewash masonry",
    color: "#f2ede2",
    roughness: 0.74,
    clearcoat: 0.2,
    clearcoatRoughness: 0.38
  }),
  slateRoof: material.ceramic({
    name: "coastal slate tiles",
    color: "#36495c",
    roughness: 0.46,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.28
  }),
  terracottaRoof: material.ceramic({
    name: "terracotta ridge tiles",
    color: "#b84a35",
    roughness: 0.52,
    clearcoat: 0.42,
    clearcoatRoughness: 0.26
  }),
  lighthouseRed: material.lacquer({
    name: "lighthouse crimson stripe",
    color: "#cf352b",
    roughness: 0.26,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08
  }),
  sailCanvas: material.fabric({
    name: "stitched windmill canvas",
    color: "#f7efe0",
    roughness: 0.82,
    sheen: 0.45,
    sheenColor: "#fff8eb"
  }),
  hempRope: material.fabric({
    name: "braided hemp line",
    color: "#bfa074",
    roughness: 0.88,
    sheen: 0.3,
    sheenColor: "#e6d0a8"
  }),
  amberWindow: material.physical({
    name: "warm lantern window",
    color: "#ffcf7c",
    roughness: 0.18,
    metallic: 0,
    clearcoat: 0.9,
    emissive: "#ff9e38",
    emissiveIntensity: 1.35,
    practical: true
  }),
  pineBark: material.physical({
    name: "monterey pine bark",
    color: "#5d4029",
    roughness: 0.86,
    metallic: 0,
    normal: material.proceduralTextures.fabric({ scale: 20, strength: 0.45, contrast: 0.72 })
  }),
  pineFoliage: material.physical({
    name: "coastal cypress needles",
    color: "#2d5c3b",
    roughness: 0.68,
    metallic: 0,
    sheen: 0.28,
    sheenColor: "#8ec479",
    clearcoat: 0.16,
    clearcoatRoughness: 0.44
  }),
  cliffTurfCap: material.physical({
    name: "headland meadow cap",
    color: "#5f8c49",
    roughness: 0.8,
    metallic: 0,
    sheen: 0.3,
    sheenColor: "#b8d982"
  }),
  cloudFluff: material.physical({
    name: "coastal cumulus puff",
    color: "#fffcf5",
    roughness: 0.92,
    metallic: 0,
    sheen: 0.45,
    sheenColor: "#ffffff"
  })
} as const;

// ---------------------------------------------------------------------------
// 1. Sculpted Terraced Coastal Island & Faceted Limestone Sea-Cliffs
// ---------------------------------------------------------------------------

/**
 * Organic scalloped coastal plateau mesh (unit diameter ~1.0, height ~1.0 centered at Y=0)
 * so existing `.scale([18, 0.35, 14])` / `stage-ground*` transforms & `setMaterial` hooks work seamlessly!
 */
export function buildTerracedIslandSpec(seed: number, lobeAmp = 0.06, cliffFacet = true): AuraCustomGeometrySpec {
  const segs = 56;
  const rings = 5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Ring profile from bottom skirt -> stepped cliff wall -> beveled rim -> gently crowned meadow
  const ringProfile: readonly { rFrac: number; y: number; jitter: number }[] = [
    { rFrac: 0.96, y: -0.55, jitter: 1.0 },
    { rFrac: 1.02, y: -0.18, jitter: 1.15 },
    { rFrac: 0.98, y: 0.22, jitter: 0.95 },
    { rFrac: 0.92, y: 0.47, jitter: 0.65 },
    { rFrac: 0.55, y: 0.52, jitter: 0.25 }
  ];

  const radAt = (angle: number, jitterScale: number): number => {
    const wave =
      Math.sin(angle * 3 + seed * 1.1) * 0.42 +
      Math.cos(angle * 5 - seed * 0.7) * 0.31 +
      Math.sin(angle * 9 + seed * 2.3) * 0.27;
    return 0.5 * (1 + wave * lobeAmp * jitterScale);
  };

  for (let rIdx = 0; rIdx < rings; rIdx += 1) {
    const rp = ringProfile[rIdx]!;
    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      const phi = u * Math.PI * 2;
      const rad = radAt(phi, rp.jitter) * rp.rFrac;
      const x = Math.sin(phi) * rad;
      const z = Math.cos(phi) * rad;
      const crown = rIdx >= 3 ? Math.sin(phi * 2 + seed) * 0.015 : 0;
      positions.push(x, rp.y + crown, z);
      const outN = rIdx >= 3 ? norm3([x * 0.15, 1, z * 0.15]) : norm3([Math.sin(phi), 0.22, Math.cos(phi)]);
      normals.push(outN[0], outN[1], outN[2]);
      uvs.push(0.5 + x, 0.5 + z);
    }
  }

  const stride = segs + 1;
  for (let rIdx = 0; rIdx < rings - 1; rIdx += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = rIdx * stride + i;
      const b = a + 1;
      const c = (rIdx + 1) * stride + i + 1;
      const d = (rIdx + 1) * stride + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Center cap fan
  const topRing = (rings - 1) * stride;
  const cIdx = positions.length / 3;
  positions.push(0, 0.54, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 0; i < segs; i += 1) {
    indices.push(cIdx, topRing + i, topRing + i + 1);
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  const finalMesh = cliffFacet ? toFlatShaded(raw) : raw;
  return mergeRawMeshes([finalMesh]);
}

/**
 * Faceted, stepped coastal limestone cliff crag (replaces the zebra `roundedBox` blocks!).
 * Flat-shaded angular dihedral rock faces + horizontal sedimentary ledges.
 */
export function buildFacetedSeaCliffMesh(seed = 11): RawMesh {
  const segs = 14;
  const tiers: readonly { y: number; r: number; ledge: number }[] = [
    { y: -0.52, r: 0.62, ledge: 1.0 },
    { y: -0.24, r: 0.58, ledge: 1.08 },
    { y: -0.02, r: 0.49, ledge: 0.96 },
    { y: 0.18, r: 0.46, ledge: 1.04 },
    { y: 0.38, r: 0.37, ledge: 0.92 },
    { y: 0.50, r: 0.28, ledge: 0.78 }
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let t = 0; t < tiers.length; t += 1) {
    const tier = tiers[t]!;
    for (let i = 0; i <= segs; i += 1) {
      const idx = i % segs;
      const phi = (idx / segs) * Math.PI * 2;
      const sx = Math.sin(phi), cz = Math.cos(phi);
      const n = fbm3(sx * 1.8 + seed, tier.y * 2.4, cz * 1.8 - seed, seed);
      const ridge = 0.74 + n * 0.52;
      const rx = sx * tier.r * tier.ledge * ridge;
      const rz = cz * tier.r * tier.ledge * (0.82 + (1 - n) * 0.36);
      const yJit = (hash01(seed * 31 + t * 17 + idx * 13) - 0.5) * 0.05;
      positions.push(rx, tier.y + yJit, rz);
      normals.push(sx, 0.25, cz);
      uvs.push(i / segs, t / (tiers.length - 1));
    }
  }

  const stride = segs + 1;
  for (let t = 0; t < tiers.length - 1; t += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = t * stride + i;
      const b = a + 1;
      const c = (t + 1) * stride + i + 1;
      const d = (t + 1) * stride + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  const topStart = (tiers.length - 1) * stride;
  const topCenter = positions.length / 3;
  positions.push(0, 0.53, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 0; i < segs; i += 1) {
    indices.push(topCenter, topStart + i, topStart + i + 1);
  }

  // Secondary flanking rock pinnacle for asymmetric coastal silhouette
  const spire = transformMesh(
    latheMesh(
      [
        [0.28, -0.5],
        [0.25, -0.1],
        [0.18, 0.22],
        [0.1, 0.42],
        [0.0, 0.48]
      ],
      7,
      true
    ),
    { pos: [0.34, -0.04, 0.14], rot: [0.06, 0.8, -0.08], scale: [1.1, 0.95, 0.9] }
  );

  const mainFlat = toFlatShaded({ positions, normals, uvs, indices });
  return {
    positions: [...mainFlat.positions, ...spire.positions],
    normals: [...mainFlat.normals, ...spire.normals],
    uvs: [...mainFlat.uvs, ...spire.uvs],
    indices: [
      ...mainFlat.indices,
      ...spire.indices.map((idx) => idx + mainFlat.positions.length / 3)
    ]
  };
}

export function buildCliffTurfCapSpec(seed = 11): AuraCustomGeometrySpec {
  const segs = 14;
  const rings: readonly { y: number; r: number; ledge: number }[] = [
    { y: 0.37, r: 0.39, ledge: 0.96 },
    { y: 0.46, r: 0.36, ledge: 0.92 },
    { y: 0.52, r: 0.24, ledge: 0.78 }
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let t = 0; t < rings.length; t += 1) {
    const tier = rings[t]!;
    for (let i = 0; i <= segs; i += 1) {
      const idx = i % segs;
      const phi = (idx / segs) * Math.PI * 2;
      const sx = Math.sin(phi), cz = Math.cos(phi);
      const n = fbm3(sx * 1.8 + seed, 0.42 * 2.4, cz * 1.8 - seed, seed);
      const ridge = 0.74 + n * 0.52;
      const rx = sx * tier.r * tier.ledge * ridge;
      const rz = cz * tier.r * tier.ledge * (0.82 + (1 - n) * 0.36);
      positions.push(rx, tier.y, rz);
      const outN = norm3([sx * 0.45, 0.88, cz * 0.45]);
      normals.push(outN[0], outN[1], outN[2]);
      uvs.push(i / segs, t / (rings.length - 1));
    }
  }
  const stride = segs + 1;
  for (let t = 0; t < rings.length - 1; t += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = t * stride + i;
      const b = a + 1;
      const c = (t + 1) * stride + i + 1;
      const d = (t + 1) * stride + i;
      indices.push(a, b, c, a, c, d);
    }
  }
  const topStart = (rings.length - 1) * stride;
  const topCenter = positions.length / 3;
  positions.push(0, 0.55, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 0.5);
  for (let i = 0; i < segs; i += 1) {
    indices.push(topCenter, topStart + i, topStart + i + 1);
  }
  return mergeRawMeshes([{ positions, normals, uvs, indices }]);
}

// ---------------------------------------------------------------------------
// 2. Heavy Oak, Forged-Iron & Naval-Brass Siege Slingshot Rig
// ---------------------------------------------------------------------------

export function buildSiegeSlingshotRigNode(position: V3, rotationY: number, runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // Materials: 0 = quoinStone, 1 = seasonedOak, 2 = forgedIron, 3 = navalBrass, 4 = hempRope
  // Stepped stone foundation plinth
  parts.push({ mesh: transformMesh(bevelBoxMesh(1.45, 0.22, 1.35, 0.04), { pos: [0, -0.22, 0] }), materialIndex: 0 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(1.18, 0.16, 1.08, 0.03), { pos: [0, -0.04, 0] }), materialIndex: 0 });

  // Twin heavy oak longitudinal skids + mortised cross-beams
  for (const sz of [-0.36, 0.36]) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(1.12, 0.14, 0.14, 0.025), { pos: [0, 0.1, sz] }), materialIndex: 1 });
    // Angled A-frame brace struts
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.11, 0.62, 0.11, 0.02), { pos: [-0.24, 0.34, sz * 0.68], rot: [sz * 0.28, 0, -0.46] }),
      materialIndex: 1
    });
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.11, 0.58, 0.11, 0.02), { pos: [0.24, 0.32, sz * 0.68], rot: [sz * 0.28, 0, 0.48] }),
      materialIndex: 1
    });
    // Forged iron gusset brackets + rivets
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.24, 0.16, 0.16, 0.015), { pos: [0, 0.12, sz] }), materialIndex: 2 });
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.15, 0.16, 0.015), { pos: [-0.46, 0.1, sz] }), materialIndex: 2 });
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.18, 0.15, 0.16, 0.015), { pos: [0.46, 0.1, sz] }), materialIndex: 2 });
  }
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.22, 0.16, 0.88, 0.025), { pos: [0, 0.14, 0] }), materialIndex: 1 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.12, 0.86, 0.02), { pos: [-0.44, 0.11, 0] }), materialIndex: 1 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.16, 0.12, 0.86, 0.02), { pos: [0.44, 0.11, 0] }), materialIndex: 1 });

  // Rear brass tension winch drum + iron ratchet gear + coiled hemp rope
  const winchDrum = transformMesh(
    latheMesh([[0.0, -0.28], [0.11, -0.28], [0.085, -0.22], [0.085, 0.22], [0.11, 0.28], [0.0, 0.28]], 14),
    { pos: [-0.44, 0.26, 0], rot: [Math.PI * 0.5, 0, 0] }
  );
  parts.push({ mesh: winchDrum, materialIndex: 3 });
  const ropeCoil = transformMesh(
    latheMesh([[0.095, -0.18], [0.105, -0.09], [0.102, 0], [0.106, 0.09], [0.095, 0.18]], 14),
    { pos: [-0.44, 0.26, 0], rot: [Math.PI * 0.5, 0, 0] }
  );
  parts.push({ mesh: ropeCoil, materialIndex: 4 });
  // Ratchet wheel + crank handle
  parts.push({
    mesh: transformMesh(latheMesh([[0, -0.025], [0.17, -0.025], [0.17, 0.025], [0, 0.025]], 10, true), {
      pos: [-0.44, 0.26, 0.34],
      rot: [Math.PI * 0.5, 0, 0]
    }),
    materialIndex: 2
  });

  // Central socket collar + bronze binding rings
  parts.push({
    mesh: transformMesh(latheMesh([[0.17, 0.18], [0.15, 0.42], [0.13, 0.56], [0, 0.56]], 14), { pos: [0, 0, 0] }),
    materialIndex: 2
  });
  parts.push({
    mesh: transformMesh(latheMesh([[0.155, 0.44], [0.165, 0.48], [0.155, 0.52]], 16), { pos: [0, 0, 0] }),
    materialIndex: 3
  });

  const spec = buildGroupedGeometrySpec(parts);
  return geometry.multiMaterial(
    spec,
    [CRAFT_MATS.quoinStone, CRAFT_MATS.seasonedOak, CRAFT_MATS.forgedIron, CRAFT_MATS.navalBrass, CRAFT_MATS.hempRope],
    { name: "slingshot-base", position, rotation: [0, rotationY, 0], castShadow: true, receiveShadow: true }
  ).runtime({ id: runtimeId, tags: ["sling"] });
}

/**
 * Sculpted laminated-oak Y-fork yoke + bronze prong tip ferrules anchored in world coordinates
 * so prongs terminate cleanly at `FORK_TIPS` (`[-7.79, 1.89, +/-0.22]`).
 */
export function buildSlingshotYokeNode(): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // Materials: 0 = seasonedOak, 1 = navalBrass, 2 = hempRope
  // Stem rising from catapult collar [-7.4, 0.85, 0] to crotch [-7.5, 1.38, 0]
  parts.push({
    mesh: tubeSweepMesh(
      [
        [-7.4, 0.78, 0, 0.115],
        [-7.43, 1.06, 0, 0.102],
        [-7.49, 1.36, 0, 0.096]
      ],
      12
    ),
    materialIndex: 0
  });
  // Left & Right swept fork arms curving out to FORK_TIPS [-7.79, 1.89, ±0.22]
  for (const sgn of [-1, 1]) {
    parts.push({
      mesh: tubeSweepMesh(
        [
          [-7.49, 1.33, sgn * 0.02, 0.082],
          [-7.58, 1.52, sgn * 0.13, 0.072],
          [-7.70, 1.73, sgn * 0.20, 0.064],
          [-7.79, 1.93, sgn * 0.22, 0.056]
        ],
        12
      ),
      materialIndex: 0
    });
    // Brass prong tip cap & band groove at [-7.79, 1.89, ±0.22]
    parts.push({
      mesh: transformMesh(
        latheMesh([[0.0, -0.05], [0.068, -0.05], [0.058, 0.0], [0.072, 0.05], [0.045, 0.09], [0, 0.10]], 12),
        { pos: [-7.79, 1.89, sgn * 0.22], rot: [sgn * 0.1, 0, 0.42] }
      ),
      materialIndex: 1
    });
  }
  // Hemp crotch lashing wrap
  parts.push({
    mesh: transformMesh(latheMesh([[0.102, -0.07], [0.112, 0], [0.102, 0.07]], 14), { pos: [-7.48, 1.34, 0], rot: [0, 0, 0.22] }),
    materialIndex: 2
  });

  const spec = buildGroupedGeometrySpec(parts);
  return geometry.multiMaterial(
    spec,
    [CRAFT_MATS.seasonedOak, CRAFT_MATS.navalBrass, CRAFT_MATS.hempRope],
    { name: "sling-driftwood-yoke", castShadow: true, receiveShadow: true }
  );
}

// ---------------------------------------------------------------------------
// 3. Stone Launch Bastion, Arched Causeway Bridge & Fortress Plinths
// ---------------------------------------------------------------------------

export function buildLaunchBastionNode(): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = seasonedOak, 3 = forgedIron
  parts.push({
    mesh: transformMesh(
      latheMesh([[1.85, -0.35], [1.72, 0.12], [1.58, 0.34], [1.64, 0.42], [0.0, 0.42]], 10, true),
      { pos: [-7.4, 0, 0] }
    ),
    materialIndex: 0
  });
  // Corner stone quoins & steps leading up from the turf
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.34, 0.44, 0.26, 0.03), {
        pos: [-7.4 + Math.sin(a) * 1.56, 0.16, Math.cos(a) * 1.56],
        rot: [0, a, 0]
      }),
      materialIndex: 1
    });
  }
  // Recessed plank firing deck + iron corner bollards
  for (let p = -3; p <= 3; p += 1) {
    parts.push({
      mesh: transformMesh(bevelBoxMesh(2.2, 0.05, 0.28, 0.012), { pos: [-7.4, 0.43, p * 0.31] }),
      materialIndex: 2
    });
  }
  for (const [bx, bz] of [[-8.55, -1.05], [-8.55, 1.05], [-6.25, -1.05], [-6.25, 1.05]] as const) {
    parts.push({
      mesh: transformMesh(latheMesh([[0.09, 0], [0.075, 0.22], [0.1, 0.28], [0, 0.32]], 10), { pos: [bx, 0.42, bz] }),
      materialIndex: 3
    });
  }

  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone, CRAFT_MATS.seasonedOak, CRAFT_MATS.forgedIron],
    { name: "launch-knoll-and-bridge", castShadow: true, receiveShadow: true }
  ).runtime({ id: "launch-knoll", tags: ["stage"] });
}

export function buildArchedStoneBridgeNode(): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = seasonedOak
  // Arched deck + 2 cutwater piers + low stone parapets at [0.2, 0.02, -2.4]
  for (let s = -4; s <= 4; s += 1) {
    const t = s / 4;
    const x = t * 1.65;
    const archY = 0.34 + (1 - t * t) * 0.26;
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.42, 0.12, 1.18, 0.02), { pos: [x, archY, 0], rot: [0, 0, -t * 0.16] }),
      materialIndex: 2
    });
    for (const pz of [-0.56, 0.56]) {
      parts.push({
        mesh: transformMesh(bevelBoxMesh(0.4, 0.22, 0.14, 0.025), { pos: [x, archY + 0.13, pz], rot: [0, 0, -t * 0.16] }),
        materialIndex: 0
      });
    }
  }
  for (const px of [-1.45, 0, 1.45]) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.38, 0.56, 1.32, 0.035), { pos: [px, 0.14, 0] }), materialIndex: 1 });
  }
  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone, CRAFT_MATS.seasonedOak],
    { name: "prop-stone-bridge", position: [0.2, 0.02, -2.4], rotation: [0, 0.12, 0], castShadow: true, receiveShadow: true }
  );
}

export function buildFortressFoundationNode(): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // Stepped ashlar plinth under the fort at [7.2, 0, 0], top strictly at y <= 0.0 so fort blocks rest cleanly!
  parts.push({ mesh: transformMesh(bevelBoxMesh(5.8, 0.26, 4.4, 0.045), { pos: [0, -0.14, 0] }), materialIndex: 0 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(6.3, 0.22, 4.9, 0.045), { pos: [0, -0.28, 0] }), materialIndex: 1 });
  for (let i = -3; i <= 3; i += 1) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.42, 0.28, 4.52, 0.03), { pos: [i * 0.88, -0.15, 0] }), materialIndex: 1 });
  }
  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone],
    { name: "fortress-pad", position: [7.2, 0, 0], castShadow: true, receiveShadow: true }
  ).runtime({ id: "fortress-pad", tags: ["stage"] });
}

/**
 * Replaces the plain grey `fortress-flag-bastion` cube at `[7.2, 0.55, -0.6]` with a
 * crenelated stone keep pedestal + corner quoins + merlons!
 */
export function buildFlagBastionNode(): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  parts.push({ mesh: transformMesh(bevelBoxMesh(1.26, 0.22, 1.26, 0.035), { pos: [0, 0.11, 0] }), materialIndex: 1 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(1.06, 0.78, 1.06, 0.035), { pos: [0, 0.56, 0] }), materialIndex: 0 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(1.22, 0.14, 1.22, 0.03), { pos: [0, 1.0, 0] }), materialIndex: 1 });
  // 8 crenelation merlons around the top parapet
  for (const [mx, mz] of [
    [-0.46, -0.46], [0, -0.46], [0.46, -0.46],
    [-0.46, 0.46], [0, 0.46], [0.46, 0.46],
    [-0.46, 0], [0.46, 0]
  ] as const) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.24, 0.18, 0.24, 0.025), { pos: [mx, 1.15, mz] }), materialIndex: 1 });
  }
  // Iron ring + oak mast socket
  parts.push({ mesh: transformMesh(latheMesh([[0.22, 1.06], [0.18, 1.24], [0, 1.24]], 12), { pos: [0, 0, 0] }), materialIndex: 2 });

  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.ashlarStone, CRAFT_MATS.quoinStone, CRAFT_MATS.forgedIron],
    { name: "fortress-flag-bastion", position: [7.2, 0, -0.6], castShadow: true, receiveShadow: true }
  );
}

// ---------------------------------------------------------------------------
// 4. Medieval Coastal Architecture: Watchtower, Gatehouse, Windmills, Landmarks
// ---------------------------------------------------------------------------

export function buildWatchtowerNode(runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = slateRoof, 3 = darkWalnut, 4 = navalBrass, 5 = amberWindow
  // Tapered octagonal masonry tower shaft
  parts.push({
    mesh: latheMesh(
      [
        [1.18, -0.2],
        [1.08, 0.35],
        [0.92, 1.65],
        [0.86, 2.75],
        [1.06, 2.95],
        [1.06, 3.22],
        [0.0, 3.22]
      ],
      8,
      true
    ),
    materialIndex: 0
  });
  // Stone string-course bands + 8 parapet merlons
  parts.push({ mesh: latheMesh([[1.12, 0.32], [1.14, 0.44], [0.96, 0.48]], 8, true), materialIndex: 1 });
  parts.push({ mesh: latheMesh([[0.90, 2.72], [1.10, 2.92], [1.10, 3.04], [0.90, 3.04]], 8, true), materialIndex: 1 });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.32, 0.28, 0.2, 0.025), {
        pos: [Math.sin(a) * 0.96, 3.34, Math.cos(a) * 0.96],
        rot: [0, a, 0]
      }),
      materialIndex: 1
    });
  }
  // Steep conical slate roof + timber rafters + brass weathervane finial
  parts.push({
    mesh: latheMesh([[1.16, 3.36], [0.76, 4.05], [0.34, 4.68], [0.0, 5.12]], 12, true),
    materialIndex: 2
  });
  parts.push({
    mesh: latheMesh([[0.05, 5.05], [0.03, 5.48], [0.09, 5.56], [0.0, 5.66]], 10),
    materialIndex: 4
  });
  // Timber door + warm glowing guardroom lancet windows
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.52, 0.88, 0.18, 0.02), { pos: [0, 0.48, 1.02] }), materialIndex: 3 });
  for (const a of [-0.55, 0.45, 1.6]) {
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.46, 0.14, 0.015), {
        pos: [Math.sin(a) * 0.89, 2.15, Math.cos(a) * 0.89],
        rot: [0, a, 0]
      }),
      materialIndex: 5
    });
  }

  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [
      CRAFT_MATS.ashlarStone,
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.slateRoof,
      CRAFT_MATS.darkWalnut,
      CRAFT_MATS.navalBrass,
      CRAFT_MATS.amberWindow
    ],
    { name: runtimeId, position: [-12.4, 0, 4.2], rotation: [0, 0.5, 0], castShadow: true, receiveShadow: true }
  ).runtime({ id: runtimeId, tags: ["dressing"] });
}

export function buildGatehouseNode(runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // 0 = ashlarStone, 1 = quoinStone, 2 = terracottaRoof, 3 = darkWalnut, 4 = forgedIron, 5 = amberWindow
  // Twin flanking turrets + central portcullis gatehouse span
  for (const tx of [-1.25, 1.25]) {
    parts.push({
      mesh: transformMesh(
        latheMesh([[0.76, -0.2], [0.70, 0.4], [0.64, 2.35], [0.76, 2.52], [0.76, 2.74], [0, 2.74]], 8, true),
        { pos: [tx, 0, 0] }
      ),
      materialIndex: 0
    });
    parts.push({
      mesh: transformMesh(latheMesh([[0.82, 2.72], [0.46, 3.35], [0.0, 3.85]], 8, true), { pos: [tx, 0, 0] }),
      materialIndex: 2
    });
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.22, 0.42, 0.14, 0.015), { pos: [tx, 1.72, 0.64] }),
      materialIndex: 5
    });
  }
  // Central gatehouse bridge wall + battlement parapet + gable roof
  parts.push({ mesh: transformMesh(bevelBoxMesh(1.9, 1.45, 1.08, 0.035), { pos: [0, 1.65, 0] }), materialIndex: 0 });
  for (const sx of [-0.72, 0.72]) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.46, 1.1, 1.08, 0.03), { pos: [sx, 0.55, 0] }), materialIndex: 1 });
  }
  for (let m = -2; m <= 2; m += 1) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.24, 0.24, 0.22, 0.02), { pos: [m * 0.36, 2.48, 0.48] }), materialIndex: 1 });
  }
  // Recessed dark timber gate + wrought-iron portcullis bars
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.98, 1.18, 0.22, 0.02), { pos: [0, 0.58, 0.12] }), materialIndex: 3 });
  for (let b = -2; b <= 2; b += 1) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.045, 1.15, 0.045, 0.008), { pos: [b * 0.18, 0.58, 0.34] }), materialIndex: 4 });
  }
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.05, 0.05, 0.008), { pos: [0, 0.88, 0.34] }), materialIndex: 4 });
  parts.push({ mesh: transformMesh(bevelBoxMesh(0.96, 0.05, 0.05, 0.008), { pos: [0, 0.48, 0.34] }), materialIndex: 4 });

  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [
      CRAFT_MATS.ashlarStone,
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.terracottaRoof,
      CRAFT_MATS.darkWalnut,
      CRAFT_MATS.forgedIron,
      CRAFT_MATS.amberWindow
    ],
    { name: runtimeId, position: [9.8, 0, -2.4], rotation: [0, -0.45, 0], castShadow: true, receiveShadow: true }
  ).runtime({ id: runtimeId, tags: ["dressing"] });
}

/**
 * Dutch coastal smock windmill tower (`prop-windmill` with static sails, or `v-mill-m-pole` tower body).
 */
export function buildWindmillNode(
  name: string,
  runtimeId: string,
  tags: readonly string[],
  position: V3,
  rotationY: number,
  scaleVal: number,
  includeStaticSails: boolean
): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // 0 = quoinStone, 1 = whitewashPlaster, 2 = slateRoof, 3 = seasonedOak, 4 = sailCanvas, 5 = navalBrass, 6 = amberWindow
  parts.push({
    mesh: latheMesh([[0.72, -0.12], [0.66, 0.48], [0.58, 0.54], [0, 0.54]], 8, true),
    materialIndex: 0
  });
  parts.push({
    mesh: latheMesh([[0.60, 0.50], [0.48, 1.45], [0.40, 2.22], [0, 2.22]], 8, true),
    materialIndex: 1
  });
  // Timber gallery balcony ring + 8 vertical handrail posts + arched cottage doorway
  parts.push({
    mesh: latheMesh([[0.58, 0.88], [0.76, 0.90], [0.76, 0.96], [0.58, 0.96]], 8, true),
    materialIndex: 3
  });
  parts.push({
    mesh: latheMesh([[0.70, 1.12], [0.75, 1.12], [0.75, 1.16], [0.70, 1.16]], 8, true),
    materialIndex: 3
  });
  for (let p = 0; p < 8; p += 1) {
    const pa = (p / 8) * Math.PI * 2;
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.045, 0.22, 0.045, 0.008), {
        pos: [Math.sin(pa) * 0.72, 1.04, Math.cos(pa) * 0.72]
      }),
      materialIndex: 3
    });
  }
  parts.push({
    mesh: transformMesh(bevelBoxMesh(0.28, 0.46, 0.14, 0.02), { pos: [0, 0.23, 0.64] }),
    materialIndex: 3
  });
  // Terracotta domed cap roof + brass finial
  parts.push({
    mesh: latheMesh([[0.46, 2.18], [0.43, 2.42], [0.29, 2.66], [0.09, 2.78], [0, 2.82]], 14),
    materialIndex: 2
  });
  parts.push({
    mesh: latheMesh([[0.03, 2.80], [0.06, 2.88], [0, 2.95]], 10),
    materialIndex: 5
  });
  parts.push({
    mesh: transformMesh(bevelBoxMesh(0.18, 0.32, 0.1, 0.015), { pos: [0, 1.45, 0.45] }),
    materialIndex: 6
  });

  if (includeStaticSails) {
    // Turned brass hub + 4 Dutch lattice-framed cream-canvas sails
    parts.push({
      mesh: transformMesh(latheMesh([[0, -0.14], [0.13, -0.12], [0.11, 0.14], [0, 0.19]], 14), {
        pos: [0, 2.32, 0.48],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 5
    });
    for (let b = 0; b < 4; b += 1) {
      const ang = b * Math.PI * 0.5 + 0.38;
      const rotZ = ang - Math.PI * 0.5;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const spar = transformMesh(bevelBoxMesh(0.065, 1.48, 0.055, 0.01), {
        pos: [ca * 0.74, 2.32 + sa * 0.74, 0.56],
        rot: [0, 0, rotZ]
      });
      const outerRail = transformMesh(bevelBoxMesh(0.04, 1.18, 0.04, 0.008), {
        pos: [ca * 0.84 - sa * 0.33, 2.32 + sa * 0.84 + ca * 0.33, 0.57],
        rot: [0, 0, rotZ]
      });
      const sail = transformMesh(bevelBoxMesh(0.30, 1.14, 0.018, 0.005), {
        pos: [ca * 0.84 - sa * 0.17, 2.32 + sa * 0.84 + ca * 0.17, 0.585],
        rot: [0, 0.12, rotZ]
      });
      parts.push({ mesh: spar, materialIndex: 3 }, { mesh: outerRail, materialIndex: 3 }, { mesh: sail, materialIndex: 4 });
      for (const rungR of [0.32, 0.56, 0.80, 1.04, 1.28]) {
        parts.push({
          mesh: transformMesh(bevelBoxMesh(0.36, 0.032, 0.042, 0.006), {
            pos: [ca * rungR - sa * 0.16, 2.32 + sa * rungR + ca * 0.16, 0.572],
            rot: [0, 0, rotZ]
          }),
          materialIndex: 3
        });
      }
    }
  }

  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.whitewashPlaster,
      CRAFT_MATS.terracottaRoof,
      CRAFT_MATS.seasonedOak,
      CRAFT_MATS.sailCanvas,
      CRAFT_MATS.navalBrass,
      CRAFT_MATS.amberWindow
    ],
    { name, position, rotation: [0, rotationY, 0], scale: scaleVal, castShadow: true, receiveShadow: true }
  ).runtime({ id: runtimeId, tags: [...tags] });
}

export function buildWindmillSailBladeNode(name: string, runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  // Centered on Y in [-0.5, +0.5] so main.ts `setScale([0.22, bladeLength * 1.1, 0.12])` fits cleanly
  const parts: MultiMatSlot[] = [
    { mesh: bevelBoxMesh(0.24, 1.0, 0.24, 0.03), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.35, 0.86, 0.12, 0.02), { pos: [0.68, 0.04, 0.06] }), materialIndex: 1 }
  ];
  for (const ry of [-0.34, -0.1, 0.14, 0.38]) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(1.42, 0.045, 0.16, 0.01), { pos: [0.66, ry, 0.04] }), materialIndex: 0 });
  }
  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.seasonedOak, CRAFT_MATS.sailCanvas],
    { name, position: [0, -120, 0], castShadow: true, receiveShadow: true }
  ).runtime({ id: runtimeId, tags: ["windmill"] });
}

/**
 * Far-horizon coastal landmarks (replaces `sling_seaStackIsland` + all 5 `sling_*` Meshy horizon blobs!).
 */
export function buildSeaStackLighthouseLandmark(
  name: string,
  position: V3,
  rotationY: number,
  scaleVal: number,
  runtimeId?: string
): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [];
  // 0 = quoinStone, 1 = cliffTurfCap, 2 = whitewashPlaster, 3 = lighthouseRed, 4 = forgedIron, 5 = amberWindow
  parts.push({ mesh: transformMesh(buildFacetedSeaCliffMesh(31), { scale: [2.4, 1.5, 1.8] }), materialIndex: 0 });
  parts.push({
    mesh: transformMesh(latheMesh([[0.72, 0.58], [0.64, 0.72], [0.22, 0.8], [0, 0.82]], 9, true), { pos: [-0.15, 0.02, 0] }),
    materialIndex: 1
  });
  // Striped red-and-white coastal lighthouse perched on the sea-stack!
  const lx = -0.18, lz = 0.05;
  parts.push({ mesh: transformMesh(latheMesh([[0.22, 0.72], [0.19, 1.08]], 10), { pos: [lx, 0, lz] }), materialIndex: 2 });
  parts.push({ mesh: transformMesh(latheMesh([[0.19, 1.08], [0.165, 1.42]], 10), { pos: [lx, 0, lz] }), materialIndex: 3 });
  parts.push({ mesh: transformMesh(latheMesh([[0.165, 1.42], [0.145, 1.74]], 10), { pos: [lx, 0, lz] }), materialIndex: 2 });
  parts.push({ mesh: transformMesh(latheMesh([[0.145, 1.74], [0.21, 1.80], [0.21, 1.85], [0.13, 1.85]], 10), { pos: [lx, 0, lz] }), materialIndex: 4 });
  parts.push({ mesh: transformMesh(latheMesh([[0.125, 1.85], [0.125, 2.08]], 10), { pos: [lx, 0, lz] }), materialIndex: 5 });
  parts.push({ mesh: transformMesh(latheMesh([[0.15, 2.08], [0.09, 2.22], [0, 2.32]], 10), { pos: [lx, 0, lz] }), materialIndex: 3 });

  const builder = geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [
      CRAFT_MATS.quoinStone,
      CRAFT_MATS.cliffTurfCap,
      CRAFT_MATS.whitewashPlaster,
      CRAFT_MATS.lighthouseRed,
      CRAFT_MATS.forgedIron,
      CRAFT_MATS.amberWindow
    ],
    { name, position, rotation: [0, rotationY, 0], scale: scaleVal, castShadow: false, receiveShadow: false }
  );
  return runtimeId ? builder.runtime({ id: runtimeId, tags: ["backdrop"] }) : builder;
}

export function buildChapterBackdropLandmark(
  key: string,
  id: string,
  position: V3,
  rotationY: number,
  scaleVal: number,
  visible: boolean
): AuraNodeBuilder<AuraGroupNode> {
  if (key.includes("lighthouse")) {
    const b = buildSeaStackLighthouseLandmark(id, position, rotationY, scaleVal * 0.42, id);
    return visible ? b : new (b.constructor as typeof AuraNodeBuilder<AuraGroupNode>)({ ...b.toJSON(), visible: false });
  }
  const parts: MultiMatSlot[] = [];
  // Sculpted rock islet base
  parts.push({ mesh: transformMesh(buildFacetedSeaCliffMesh(key.length * 13), { scale: [1.8, 0.9, 1.4] }), materialIndex: 0 });
  if (key.includes("quarryCrane")) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(0.12, 1.4, 0.12, 0.02), { pos: [0, 0.95, 0] }), materialIndex: 2 });
    parts.push({ mesh: transformMesh(bevelBoxMesh(1.3, 0.09, 0.09, 0.015), { pos: [0.42, 1.42, 0], rot: [0, 0, 0.42] }), materialIndex: 2 });
  } else if (key.includes("greenhouse")) {
    parts.push({ mesh: transformMesh(latheMesh([[0.65, 0.42], [0.62, 0.85], [0.38, 1.2], [0, 1.32]], 10, true), {}), materialIndex: 3 });
  } else if (key.includes("curtainWall")) {
    parts.push({ mesh: transformMesh(bevelBoxMesh(1.8, 0.72, 0.34, 0.03), { pos: [0, 0.68, 0] }), materialIndex: 0 });
    for (const tx of [-0.85, 0.85]) {
      parts.push({ mesh: transformMesh(latheMesh([[0.28, 0.35], [0.25, 1.25], [0, 1.55]], 8, true), { pos: [tx, 0, 0] }), materialIndex: 1 });
    }
  } else {
    // Crystal crater
    for (const [cx, cz, tilt, h] of [[-0.25, 0.1, 0.25, 1.25], [0.2, -0.1, -0.22, 1.45], [0.05, 0.24, 0.12, 1.05]] as const) {
      parts.push({
        mesh: transformMesh(latheMesh([[0.16, 0.35], [0.14, h], [0, h + 0.28]], 6, true), { pos: [cx, 0, cz], rot: [tilt, 0, -tilt] }),
        materialIndex: 3
      });
    }
  }
  const built = geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.quoinStone, CRAFT_MATS.slateRoof, CRAFT_MATS.seasonedOak, CRAFT_MATS.amberWindow],
    { name: id, position, rotation: [0, rotationY, 0], scale: scaleVal * 0.45, castShadow: false, receiveShadow: false }
  ).runtime({ id, tags: ["backdrop"] });
  return new (built.constructor as typeof AuraNodeBuilder<AuraGroupNode>)({ ...built.toJSON(), visible });
}

// ---------------------------------------------------------------------------
// 5. Pooled Fortress Props, Coastal Monterey Pines, Beach Dressing & Sky Clouds
// ---------------------------------------------------------------------------

/**
 * Chamfered siege crate with recessed face panels, raised frame rails, and diagonal cross-braces.
 * Sized `1.56m` cube so `scale = 0.38` matches the `2 * 0.3 = 0.60m` physics collider cleanly!
 */
export function buildProceduralCrateSpec(): AuraCustomGeometrySpec {
  const parts: RawMesh[] = [bevelBoxMesh(1.36, 1.36, 1.36, 0.03)];
  const r = 0.74;
  // 12 outer frame rails
  for (const sy of [-r, r]) {
    for (const sz of [-r, r]) parts.push(transformMesh(bevelBoxMesh(1.58, 0.12, 0.12, 0.02), { pos: [0, sy, sz] }));
    for (const sx of [-r, r]) parts.push(transformMesh(bevelBoxMesh(0.12, 0.12, 1.58, 0.02), { pos: [sx, sy, 0] }));
  }
  for (const sx of [-r, r]) {
    for (const sz of [-r, r]) parts.push(transformMesh(bevelBoxMesh(0.12, 1.58, 0.12, 0.02), { pos: [sx, 0, sz] }));
  }
  // Diagonal cross-braces on front/back/left/right faces
  for (const sz of [-0.71, 0.71]) {
    parts.push(transformMesh(bevelBoxMesh(1.62, 0.1, 0.06, 0.015), { pos: [0, 0, sz], rot: [0, 0, Math.PI * 0.25] }));
  }
  for (const sx of [-0.71, 0.71]) {
    parts.push(transformMesh(bevelBoxMesh(0.06, 0.1, 1.62, 0.015), { pos: [sx, 0, 0], rot: [Math.PI * 0.25, 0, 0] }));
  }
  return mergeRawMeshes(parts);
}

/**
 * Coopered bulged oak barrel (`height = 1.42m`, `radius = 0.62m` so `scale = 0.42` -> `0.60m` collider!).
 */
export function buildProceduralBarrelSpec(): AuraCustomGeometrySpec {
  const barrel = latheMesh(
    [
      [0.0, -0.71],
      [0.48, -0.71],
      [0.52, -0.66],
      [0.60, -0.34],
      [0.64, 0.0],
      [0.60, 0.34],
      [0.52, 0.66],
      [0.48, 0.71],
      [0.0, 0.71]
    ],
    16,
    true
  );
  return mergeRawMeshes([barrel]);
}

/**
 * Dual forged-iron / crimson keg hoops matching `BARREL_BAND_POOL_ID` transform!
 */
export function buildBarrelHoopsSpec(): AuraCustomGeometrySpec {
  const h1 = latheMesh([[0.64, -0.58], [0.68, -0.58], [0.69, -0.38], [0.65, -0.38]], 16);
  const h2 = latheMesh([[0.65, 0.12], [0.69, 0.12], [0.68, 0.32], [0.64, 0.32]], 16);
  return mergeRawMeshes([h1, h2]);
}

/**
 * Chamfered structural siege timber plank with carved tenon ends.
 */
export function buildProceduralPlankSpec(): AuraCustomGeometrySpec {
  const beam = bevelBoxMesh(1.65, 0.36, 0.42, 0.035);
  const bL = transformMesh(bevelBoxMesh(0.09, 0.40, 0.46, 0.018), { pos: [-0.64, 0, 0] });
  const bR = transformMesh(bevelBoxMesh(0.09, 0.40, 0.46, 0.018), { pos: [0.64, 0, 0] });
  return mergeRawMeshes([beam, bL, bR]);
}

/**
 * Multi-blade coastal marram grass tuft (7 arched blades — replaces the 40 green traffic cones!).
 */
export function buildSeaGrassClumpSpec(): AuraCustomGeometrySpec {
  const blades: RawMesh[] = [];
  for (let i = 0; i < 7; i += 1) {
    const yaw = (i / 7) * Math.PI * 2 + 0.3;
    const lean = 0.22 + (i % 3) * 0.16;
    const h = 0.85 + (i % 2) * 0.22;
    const blade = tubeSweepMesh(
      [
        [0, 0, 0, 0.06],
        [Math.sin(yaw) * lean * 0.35, h * 0.45, Math.cos(yaw) * lean * 0.35, 0.042],
        [Math.sin(yaw) * lean, h, Math.cos(yaw) * lean, 0.008]
      ],
      4,
      true
    );
    blades.push(blade);
  }
  return mergeRawMeshes(blades);
}

/**
 * Fluted coastal fan-scallop shell (`dressing-shells`).
 */
export function buildScallopShellSpec(): AuraCustomGeometrySpec {
  const ribs: RawMesh[] = [];
  for (let i = -3; i <= 3; i += 1) {
    const a = i * 0.22;
    ribs.push(
      tubeSweepMesh(
        [
          [0, 0, -0.42, 0.08],
          [Math.sin(a) * 0.38, 0.18, 0.05, 0.11],
          [Math.sin(a) * 0.72, 0.04, Math.cos(a) * 0.52, 0.07]
        ],
        5,
        true
      )
    );
  }
  return mergeRawMeshes(ribs);
}

/**
 * Gnarled sun-bleached forked driftwood log (`dressing-driftwood`, oriented along Y to match `tilt: pi/2`).
 */
export function buildDriftwoodSpec(): AuraCustomGeometrySpec {
  const main = tubeSweepMesh(
    [
      [0, -0.5, 0, 0.14],
      [0.05, -0.15, 0.03, 0.12],
      [-0.04, 0.22, -0.02, 0.10],
      [0.03, 0.5, 0.02, 0.07]
    ],
    7,
    true
  );
  const stub = tubeSweepMesh(
    [
      [-0.02, 0.08, 0, 0.08],
      [0.24, 0.28, 0.08, 0.045]
    ],
    6,
    true
  );
  return mergeRawMeshes([main, stub]);
}

/**
 * Turned coastal quay bollard post (`dressing-rope-posts`).
 */
export function buildQuayBollardSpec(): AuraCustomGeometrySpec {
  return mergeRawMeshes([
    latheMesh(
      [
        [0.62, -0.5],
        [0.54, -0.35],
        [0.44, 0.22],
        [0.58, 0.30],
        [0.42, 0.38],
        [0.52, 0.46],
        [0.0, 0.52]
      ],
      10,
      true
    )
  ]);
}

/**
 * Slatted wooden coastal lobster trap with arched ribs (`dressing-lobster-pots`).
 */
export function buildLobsterPotSpec(): AuraCustomGeometrySpec {
  const parts: RawMesh[] = [bevelBoxMesh(1.0, 0.12, 1.0, 0.02)];
  for (const px of [-0.42, 0, 0.42]) {
    parts.push(
      tubeSweepMesh(
        [
          [px, -0.44, -0.46, 0.045],
          [px, 0.36, -0.36, 0.045],
          [px, 0.5, 0, 0.045],
          [px, 0.36, 0.36, 0.045],
          [px, -0.44, 0.46, 0.045]
        ],
        6,
        true
      )
    );
  }
  for (const slatY of [-0.18, 0.12, 0.36]) {
    parts.push(transformMesh(bevelBoxMesh(0.98, 0.05, 0.04, 0.008), { pos: [0, slatY, 0.43] }));
    parts.push(transformMesh(bevelBoxMesh(0.98, 0.05, 0.04, 0.008), { pos: [0, slatY, -0.43] }));
  }
  return mergeRawMeshes(parts);
}

/**
 * Wind-swept Coastal Monterey Pine (2 paired `instances.custom` draws: curved bark trunks + 4-tier layered cypress canopies!).
 */
export function buildCoastalPinesNodes(
  transforms: readonly { readonly position: V3; readonly rotation: V3; readonly scale: number }[],
  row: ChapterLook
): readonly AuraNodeBuilder<AuraPrimitiveNode>[] {
  const trunkParts: RawMesh[] = [
    tubeSweepMesh(
      [
        [0, -0.2, 0, 0.62],
        [0.18, 1.8, 0.08, 0.42],
        [-0.14, 4.2, -0.06, 0.28],
        [0.22, 6.8, 0.12, 0.16],
        [0.32, 8.8, 0.15, 0.06]
      ],
      8,
      true
    ),
    tubeSweepMesh([[0.05, 3.8, 0, 0.2], [1.35, 4.9, 0.4, 0.07]], 6, true),
    tubeSweepMesh([[-0.08, 5.2, 0, 0.17], [-1.25, 6.3, -0.3, 0.06]], 6, true)
  ];

  const canopyParts: RawMesh[] = [
    transformMesh(latheMesh([[0.0, 3.8], [3.1, 4.2], [2.4, 5.2], [0.6, 5.9], [0, 6.1]], 9, true), { pos: [0.05, 0, 0] }),
    transformMesh(latheMesh([[0.0, 5.3], [2.5, 5.7], [1.9, 6.7], [0.4, 7.3], [0, 7.5]], 9, true), { pos: [-0.15, 0, -0.1] }),
    transformMesh(latheMesh([[0.0, 6.8], [1.9, 7.1], [1.35, 8.0], [0.3, 8.5], [0, 8.7]], 8, true), { pos: [0.22, 0, 0.12] }),
    transformMesh(latheMesh([[0.0, 8.0], [1.25, 8.3], [0.75, 9.1], [0, 9.6]], 8, true), { pos: [0.32, 0, 0.14] }),
    transformMesh(latheMesh([[0.0, 4.5], [1.45, 4.8], [0.95, 5.5], [0, 5.8]], 8, true), { pos: [1.35, 0, 0.4] }),
    transformMesh(latheMesh([[0.0, 5.9], [1.35, 6.2], [0.85, 6.9], [0, 7.2]], 8, true), { pos: [-1.2, 0, -0.3] })
  ];

  const isNight = row.chapter === 5;
  const foliageMat = material.physical({
    name: "coastal pine canopy",
    color: isNight ? "#1c382c" : "#2e613d",
    roughness: 0.68,
    metallic: 0,
    sheen: 0.3,
    sheenColor: isNight ? "#4f7a68" : "#9bd47f",
    clearcoat: 0.15,
    clearcoatRoughness: 0.44
  });

  return [
    instances.custom(mergeRawMeshes(trunkParts), {
      name: "island-trees",
      material: CRAFT_MATS.pineBark,
      transforms,
      castShadow: true,
      receiveShadow: true
    }).runtime({ id: "island-trees", tags: ["cloud"] }),
    instances.custom(mergeRawMeshes(canopyParts), {
      name: "island-tree-canopies",
      material: foliageMat,
      transforms,
      castShadow: true,
      receiveShadow: true,
      wind: { assetHeight: 9.5 }
    })
  ];
}

/**
 * Stylized billowing horizon cumulus clouds so the sky reads like a handcrafted coastal diorama.
 */
export function buildHorizonCloudsNode(row: ChapterLook): AuraNodeBuilder<AuraPrimitiveNode> {
  const puff = (x: number, y: number, z: number, r: number, sy = 0.82): RawMesh =>
    transformMesh(
      latheMesh(
        [
          [0, -r * 0.34],
          [r * 0.74, -r * 0.28],
          [r * 0.98, -r * 0.06],
          [r, r * 0.22],
          [r * 0.84, r * 0.58],
          [r * 0.48, r * 0.86],
          [0, r * 0.96]
        ],
        16,
        false
      ),
      { pos: [x, y, z], scale: [1, sy, 1] }
    );
  const cloudSpec = mergeRawMeshes([
    puff(0, 0.12, 0, 1.05, 0.88),
    puff(-0.98, -0.08, 0.16, 0.78, 0.78),
    puff(1.04, -0.05, -0.1, 0.84, 0.82),
    puff(0.36, 0.42, 0.18, 0.72, 0.92),
    puff(-0.44, 0.30, -0.14, 0.66, 0.86),
    puff(-1.62, -0.18, 0.06, 0.52, 0.72),
    puff(1.68, -0.16, 0.08, 0.56, 0.74)
  ]);
  const isNight = row.chapter === 5;
  const isSunset = row.chapter === 4;
  const cloudColor: AuraColor = isNight ? "#41547a" : isSunset ? "#ffdfc4" : "#ffffff";
  const transforms: AuraTransformSpec[] = [
    { position: [-21.5, 10.8, -32], rotation: [0, 0.22, 0], scale: [3.6, 1.75, 2.0] },
    { position: [-6.8, 8.6, -27], rotation: [0, -0.35, 0], scale: [2.2, 1.15, 1.4] },
    { position: [3.4, 11.9, -35], rotation: [0, 0.14, 0], scale: [4.4, 2.05, 2.4] },
    { position: [17.8, 9.4, -29], rotation: [0, -0.28, 0], scale: [2.9, 1.45, 1.7] }
  ];
  return instances.custom(cloudSpec, {
    name: "horizon-cumulus-clouds",
    material: material.physical({
      name: "horizon cumulus",
      color: cloudColor,
      roughness: 0.92,
      metallic: 0,
      sheen: 0.65,
      sheenColor: isSunset ? "#fff0de" : "#ffffff",
      emissive: isNight ? "#24324d" : isSunset ? "#ffc89e" : "#fffcf5",
      emissiveIntensity: 0.09
    }),
    transforms,
    castShadow: false,
    receiveShadow: false
  });
}

// ---------------------------------------------------------------------------
// 6. Multi-Material Procedural Characters: Hero Siege Birds & Raider Bosses
// ---------------------------------------------------------------------------

const AMMO_PALETTE: Readonly<Record<AmmoId, { body: string; crest: string; emissive?: string }>> = {
  pebble: { body: "#f7f2e7", crest: "#e2483d" },
  stone: { body: "#7f96b3", crest: "#46515e" },
  triple: { body: "#3daee8", crest: "#ffcf4d" },
  squid: { body: "#8c5ce6", crest: "#5ef2c8" },
  ember: { body: "#f25c22", crest: "#ffd24c", emissive: "#ff5c1c" }
};

/**
 * Crisp stylized Hero Siege Bird (`geometry.multiMaterial` with 6 distinct physical materials:
 * glossy plumage, cream breast patch, curved orange beak, jet-black eyes, white specular eye-catch + brows,
 * and bespoke per-ammo headgear!). Forward axis `+Z` so `rotationY = Math.PI * 0.5` faces `+X` toward the fort!
 */
export function buildHeroSiegeBirdNode(
  name: string,
  ammo: AmmoId,
  position: V3,
  rotationY: number,
  scaleVal: number,
  runtimeId: string,
  tag: string
): AuraNodeBuilder<AuraGroupNode> {
  const pal = AMMO_PALETTE[ammo] ?? AMMO_PALETTE.pebble;
  const parts: MultiMatSlot[] = [];
  // Slots: 0 = main plumage, 1 = cream breast/eye whites, 2 = orange beak/talons, 3 = jet eyes/brows, 4 = ammo headgear

  // Plump aerodynamic seabird body
  parts.push({
    mesh: transformMesh(
      latheMesh(
        [
          [0, -0.42],
          [0.32, -0.38],
          [0.52, -0.16],
          [0.56, 0.12],
          [0.46, 0.42],
          [0.26, 0.62],
          [0, 0.68]
        ],
        16
      ),
      { pos: [0, 0.36, 0], scale: [0.95, 1.0, 1.06] }
    ),
    materialIndex: 0
  });
  // Cream belly shield
  parts.push({
    mesh: transformMesh(
      latheMesh([[0, -0.32], [0.34, -0.22], [0.41, 0.08], [0.28, 0.34], [0, 0.42]], 12),
      { pos: [0, 0.31, 0.22], scale: [0.86, 0.92, 0.68] }
    ),
    materialIndex: 1
  });
  // Swept layered wings + fanned tail feathers
  for (const sgn of [-1, 1]) {
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.16, 0.36, 0.58, 0.045), {
        pos: [sgn * 0.5, 0.42, -0.05],
        rot: [0.18, sgn * -0.18, sgn * -0.22]
      }),
      materialIndex: 0
    });
    // Expressive fierce eyes + furrowed brow ridges
    parts.push({
      mesh: transformMesh(latheMesh([[0, -0.11], [0.11, -0.04], [0.11, 0.04], [0, 0.11]], 10), {
        pos: [sgn * 0.2, 0.62, 0.44]
      }),
      materialIndex: 1
    });
    parts.push({
      mesh: transformMesh(latheMesh([[0, -0.065], [0.065, 0], [0, 0.065]], 10), {
        pos: [sgn * 0.21, 0.62, 0.51]
      }),
      materialIndex: 3
    });
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.24, 0.065, 0.12, 0.015), {
        pos: [sgn * 0.2, 0.73, 0.47],
        rot: [0.12, 0, sgn * 0.32]
      }),
      materialIndex: 3
    });
  }
  // Fanned tail feathers
  for (const ta of [-0.32, 0, 0.32]) {
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.16, 0.07, 0.38, 0.02), {
        pos: [Math.sin(ta) * 0.16, 0.42, -0.62],
        rot: [0.28, ta, 0]
      }),
      materialIndex: 3
    });
  }
  // Hooked golden-orange seabird beak
  parts.push({
    mesh: tubeSweepMesh(
      [
        [0, 0.52, 0.46, 0.16],
        [0, 0.50, 0.72, 0.10],
        [0, 0.41, 0.90, 0.02]
      ],
      8,
      true
    ),
    materialIndex: 2
  });

  // Bespoke per-ammo headgear
  if (ammo === "stone") {
    // Riveted iron kettle-helm
    parts.push({
      mesh: transformMesh(latheMesh([[0.52, 0.72], [0.62, 0.76], [0.46, 0.84], [0.34, 1.04], [0, 1.12]], 12, true), {}),
      materialIndex: 4
    });
  } else if (ammo === "ember") {
    // Blazing 5-point cinder crown
    for (let c = 0; c < 5; c += 1) {
      const ca = (c / 5) * Math.PI * 2;
      parts.push({
        mesh: transformMesh(bevelBoxMesh(0.11, 0.28, 0.09, 0.02), {
          pos: [Math.sin(ca) * 0.24, 1.04, Math.cos(ca) * 0.24],
          rot: [Math.cos(ca) * 0.22, ca, -Math.sin(ca) * 0.22]
        }),
        materialIndex: 4
      });
    }
  } else {
    // Swept crest / headband plume
    parts.push({
      mesh: tubeSweepMesh(
        [
          [0, 0.96, 0.12, 0.09],
          [0, 1.14, -0.08, 0.07],
          [0, 1.08, -0.34, 0.02]
        ],
        7,
        true
      ),
      materialIndex: 4
    });
  }

  const mats: AuraMaterialSpec[] = [
    material.lacquer({ name: `gull plumage ${ammo}`, color: pal.body, roughness: 0.28, clearcoat: 0.72, clearcoatRoughness: 0.14 }),
    material.ceramic({ name: "gull cream", color: "#fffbf2", roughness: 0.45, clearcoat: 0.3 }),
    material.lacquer({ name: "gull beak", color: "#ff9b1f", roughness: 0.22, clearcoat: 0.9 }),
    material.lacquer({ name: "gull obsidian eye", color: "#1c2029", roughness: 0.08, clearcoat: 1 }),
    pal.emissive
      ? material.physical({
          name: "ember crown",
          color: pal.crest,
          roughness: 0.2,
          clearcoat: 0.9,
          emissive: pal.emissive,
          emissiveIntensity: 1.2,
          practical: true
        })
      : material.studioMetal({ name: `gull crest ${ammo}`, color: pal.crest, roughness: 0.26 })
  ];

  return geometry.multiMaterial(buildGroupedGeometrySpec(parts), mats, {
    name,
    position,
    rotation: [0, rotationY, 0],
    scale: scaleVal,
    castShadow: true,
    receiveShadow: true
  }).runtime({ id: runtimeId, tags: [tag] });
}

/**
 * Armored Raider Boar-Knight Boss (`gullPartId(g, "body")`) stationed inside the fortress!
 * Plump emerald/teal armored brigand silhouette with upturned snout, curved ivory tusks,
 * riveted iron kettle-helm (or gilded king crown on slot 0!), and round oak buckler shield!
 */
export function buildRaiderBossNode(slot: number, runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const isKing = slot === 0;
  const parts: MultiMatSlot[] = [];
  // Slots: 0 = emerald boar hide, 1 = snout/belly, 2 = ivory tusks/eyes, 3 = dark pupils/brows, 4 = iron/gold helm, 5 = oak shield

  // Round brigand torso/head seated at y = 0..1.02 so `scale = 0.54` + `off = [0, -0.26, 0]` plants feet cleanly!
  parts.push({
    mesh: transformMesh(
      latheMesh(
        [
          [0, 0.0],
          [0.42, 0.05],
          [0.58, 0.28],
          [0.56, 0.62],
          [0.38, 0.88],
          [0, 0.98]
        ],
        16
      ),
      { scale: [1.04, 1.0, 0.98] }
    ),
    materialIndex: 0
  });
  // Prominent upturned boar snout + nostrils
  parts.push({
    mesh: transformMesh(latheMesh([[0, -0.12], [0.24, -0.08], [0.22, 0.1], [0, 0.12]], 12), {
      pos: [0, 0.44, 0.52],
      rot: [Math.PI * 0.46, 0, 0],
      scale: [1.18, 1.0, 0.86]
    }),
    materialIndex: 1
  });
  // Curved ivory tusks + bulging eyes + fierce brows + cupped ears
  for (const sgn of [-1, 1]) {
    parts.push({
      mesh: tubeSweepMesh(
        [
          [sgn * 0.22, 0.36, 0.48, 0.055],
          [sgn * 0.32, 0.46, 0.62, 0.04],
          [sgn * 0.28, 0.58, 0.60, 0.012]
        ],
        7,
        true
      ),
      materialIndex: 2
    });
    parts.push({
      mesh: transformMesh(latheMesh([[0, -0.11], [0.11, 0], [0, 0.11]], 10), { pos: [sgn * 0.24, 0.64, 0.44] }),
      materialIndex: 2
    });
    parts.push({
      mesh: transformMesh(latheMesh([[0, -0.06], [0.06, 0], [0, 0.06]], 8), { pos: [sgn * 0.24, 0.64, 0.52] }),
      materialIndex: 3
    });
    parts.push({
      mesh: transformMesh(bevelBoxMesh(0.22, 0.065, 0.1, 0.015), {
        pos: [sgn * 0.24, 0.75, 0.46],
        rot: [0, 0, sgn * -0.28]
      }),
      materialIndex: 3
    });
  }

  if (isKing) {
    // Gilded Raider King Crown!
    parts.push({ mesh: latheMesh([[0.34, 0.86], [0.42, 1.06], [0.36, 1.12], [0, 1.02]], 10, true), materialIndex: 4 });
    for (let p = 0; p < 6; p += 1) {
      const pa = (p / 6) * Math.PI * 2;
      parts.push({
        mesh: transformMesh(bevelBoxMesh(0.11, 0.24, 0.08, 0.018), {
          pos: [Math.sin(pa) * 0.36, 1.16, Math.cos(pa) * 0.36],
          rot: [0, pa, 0]
        }),
        materialIndex: 4
      });
    }
  } else {
    // Riveted Iron Siege Kettle-Helm + spike finial
    parts.push({
      mesh: latheMesh([[0.64, 0.76], [0.68, 0.80], [0.50, 0.86], [0.42, 1.08], [0.08, 1.18], [0, 1.30]], 12, true),
      materialIndex: 4
    });
  }

  // Side buckler shield with iron boss
  parts.push({
    mesh: transformMesh(latheMesh([[0, -0.05], [0.34, -0.04], [0.34, 0.04], [0, 0.08]], 12, true), {
      pos: [0.56, 0.42, 0.12],
      rot: [0, 0, -Math.PI * 0.45]
    }),
    materialIndex: 5
  });

  const mats: AuraMaterialSpec[] = [
    material.lacquer({ name: "raider boar hide", color: isKing ? "#4b8c3b" : "#569844", roughness: 0.34, clearcoat: 0.62 }),
    material.ceramic({ name: "raider snout", color: "#84bd5e", roughness: 0.48, clearcoat: 0.32 }),
    material.ceramic({ name: "raider ivory", color: "#fffaf0", roughness: 0.28, clearcoat: 0.55 }),
    material.lacquer({ name: "raider pupil", color: "#1a1d24", roughness: 0.08, clearcoat: 1 }),
    isKing ? CRAFT_MATS.navalBrass : CRAFT_MATS.forgedIron,
    CRAFT_MATS.seasonedOak
  ];

  return geometry.multiMaterial(buildGroupedGeometrySpec(parts), mats, {
    name: runtimeId,
    position: [0, -120, 0],
    rotation: [0, -Math.PI * 0.45, 0],
    scale: [0.54, 0.54, 0.54],
    castShadow: true,
    receiveShadow: true
  }).runtime({ id: runtimeId, tags: ["gull"] });
}

export function buildPlankScatterNode(runtimeId: string): AuraNodeBuilder<AuraGroupNode> {
  const parts: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(1.15, 0.09, 0.24, 0.018), { pos: [0, 0.05, 0], rot: [0, 0.15, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.05, 0.09, 0.22, 0.018), { pos: [0.12, 0.13, 0.16], rot: [0.06, -0.42, 0.08] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.88, 0.08, 0.20, 0.016), { pos: [-0.18, 0.05, -0.24], rot: [0, 0.68, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.14, 0.12, 0.28, 0.015), { pos: [0.35, 0.06, 0.02], rot: [0, 0.15, 0] }), materialIndex: 1 }
  ];
  return geometry.multiMaterial(
    buildGroupedGeometrySpec(parts),
    [CRAFT_MATS.seasonedOak, CRAFT_MATS.forgedIron],
    { name: runtimeId, position: [5.2, 0.02, 2.1], rotation: [0, 0.7, 0], castShadow: true, receiveShadow: true }
  ).runtime({ id: runtimeId, tags: ["dressing"] });
}

export { group };
