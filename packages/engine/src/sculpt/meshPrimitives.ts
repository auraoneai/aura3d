/**
 * `@aura3d/engine/sculpt` kernel module: Mesh primitives: rigid transforms, flat shading, bevelled boxes, lathe, tube sweeps, polygon extrusion, lofts, icospheres and raw-mesh merging.
 * Re-exported unchanged through `proceduralKernel.ts`; split out of the 5.5.6 kernel with no behaviour change.
 */
import { cross3, dot3, fbm3, lerp3, norm3, sub3, type RawMesh, type TransformOpts, type V2, type V3, type V4 } from "./kernelMath.js";

// ---------------------------------------------------------------------------
// Rigid Transform & Shading Helpers
// ---------------------------------------------------------------------------

/**
 * Rigid + non-uniform transform (`pos`, Euler XYZ `rot` in radians, `scale`)
 * with inverse-transpose normal transform and automatic negative-determinant winding flip.
 */
export function transformMesh(src: RawMesh, opts: TransformOpts = {}): RawMesh {
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
  return {
    positions,
    normals,
    uvs: src.uvs.slice(),
    indices,
    ...(src.colors ? { colors: src.colors.slice() } : {}),
    ...(src.analyticNormals ? { analyticNormals: true } : {})
  };
}

/** Splits shared vertices into crisp per-triangle flat normals. */
export function toFlatShaded(src: RawMesh): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] | undefined = src.colors ? [] : undefined;
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
    if (colors && src.colors) {
      const c0 = (i0 / 3) * 4, c1 = (i1 / 3) * 4, c2 = (i2 / 3) * 4;
      colors.push(
        src.colors[c0] ?? 1, src.colors[c0 + 1] ?? 1, src.colors[c0 + 2] ?? 1, src.colors[c0 + 3] ?? 1,
        src.colors[c1] ?? 1, src.colors[c1 + 1] ?? 1, src.colors[c1 + 2] ?? 1, src.colors[c1 + 3] ?? 1,
        src.colors[c2] ?? 1, src.colors[c2 + 1] ?? 1, src.colors[c2 + 2] ?? 1, src.colors[c2 + 3] ?? 1
      );
    }
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, uvs, indices, ...(colors ? { colors } : {}) };
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

// ---------------------------------------------------------------------------
// Core Curved, Bevelled, Revolved, Swept & Lofted Surface Builders
// ---------------------------------------------------------------------------

/** Chamfered 3D box (`wx * wy * wz` centered at origin) with 45-degree specular bevels. */
export function bevelBoxMesh(wx: number, wy: number, wz: number, bevel = 0.03): RawMesh {
  const hx = Math.max(1e-4, wx * 0.5);
  const hy = Math.max(1e-4, wy * 0.5);
  const hz = Math.max(1e-4, wz * 0.5);
  const b = Math.min(Math.max(0, bevel), hx * 0.42, hy * 0.42, hz * 0.42);
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

  pushQuadCCW(out, [-ix, -iy, hz], [ix, -iy, hz], [ix, iy, hz], [-ix, iy, hz]);
  pushQuadCCW(out, [ix, -iy, -hz], [-ix, -iy, -hz], [-ix, iy, -hz], [ix, iy, -hz]);
  pushQuadCCW(out, [hx, -iy, iz], [hx, -iy, -iz], [hx, iy, -iz], [hx, iy, iz]);
  pushQuadCCW(out, [-hx, -iy, -iz], [-hx, -iy, iz], [-hx, iy, iz], [-hx, iy, -iz]);
  pushQuadCCW(out, [-ix, hy, iz], [ix, hy, iz], [ix, hy, -iz], [-ix, hy, -iz]);
  pushQuadCCW(out, [-ix, -hy, -iz], [ix, -hy, -iz], [ix, -hy, iz], [-ix, -hy, iz]);

  pushQuadCCW(out, [ix, -iy, hz], [hx, -iy, iz], [hx, iy, iz], [ix, iy, hz]);
  pushQuadCCW(out, [hx, -iy, -iz], [ix, -iy, -hz], [ix, iy, -hz], [hx, iy, -iz]);
  pushQuadCCW(out, [-ix, -iy, -hz], [-hx, -iy, -iz], [-hx, iy, -iz], [-ix, iy, -hz]);
  pushQuadCCW(out, [-hx, -iy, iz], [-ix, -iy, hz], [-ix, iy, hz], [-hx, iy, iz]);

  pushQuadCCW(out, [-ix, iy, hz], [ix, iy, hz], [ix, hy, iz], [-ix, hy, iz]);
  pushQuadCCW(out, [ix, iy, -hz], [-ix, iy, -hz], [-ix, hy, -iz], [ix, hy, -iz]);
  pushQuadCCW(out, [hx, iy, iz], [hx, iy, -iz], [ix, hy, -iz], [ix, hy, iz]);
  pushQuadCCW(out, [-hx, iy, -iz], [-hx, iy, iz], [-ix, hy, iz], [-ix, hy, -iz]);

  pushQuadCCW(out, [-ix, -hy, iz], [ix, -hy, iz], [ix, -iy, hz], [-ix, -iy, hz]);
  pushQuadCCW(out, [ix, -hy, -iz], [-ix, -hy, -iz], [-ix, -iy, -hz], [ix, -iy, -hz]);
  pushQuadCCW(out, [ix, -hy, iz], [ix, -hy, -iz], [hx, -iy, -iz], [hx, -iy, iz]);
  pushQuadCCW(out, [-ix, -hy, -iz], [-ix, -hy, iz], [-hx, -iy, iz], [-hx, -iy, -iz]);

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

/** Revolved lathe surface around `+Y` from bottom-to-top profile `[radius, y][]`. */
export function latheMesh(
  profile: readonly V2[],
  radialSegments = 16,
  flatShaded = false
): RawMesh {
  const segs = Math.max(3, Math.floor(radialSegments));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = profile.length;
  if (rows < 2) return { positions, normals, uvs, indices };

  for (let j = 0; j < rows; j += 1) {
    const [rawR, y] = profile[j]!;
    const r = Math.max(0, rawR);
    const prev = profile[Math.max(0, j - 1)]!;
    const next = profile[Math.min(rows - 1, j + 1)]!;
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dr, dy) || 1;
    const nr = dy / len;
    const ny = -dr / len;
    const v = j / Math.max(1, rows - 1);

    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      const phi = u * Math.PI * 2;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      positions.push(r * sp, y, r * cp);
      if (r < 1e-5) {
        normals.push(0, ny >= 0 ? 1 : -1, 0);
      } else {
        normals.push(nr * sp, ny, nr * cp);
      }
      uvs.push(u, v);
    }
  }

  const stride = segs + 1;
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/** Swept 3D tube along spine `[x, y, z, radius][]` with parallel-transport frames and end caps. */
export function tubeSweepMesh(
  spine: readonly V4[],
  radialSegments = 8,
  flatShaded = false
): RawMesh {
  const segs = Math.max(3, Math.floor(radialSegments));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const nPts = spine.length;
  if (nPts < 2) return { positions, normals, uvs, indices };
  let up: [number, number, number] = [0, 1, 0];

  for (let j = 0; j < nPts; j += 1) {
    const cur = spine[j]!;
    const prev = spine[Math.max(0, j - 1)]!;
    const next = spine[Math.min(nPts - 1, j + 1)]!;
    const tang = norm3([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
    if (Math.abs(dot3(tang, up)) > 0.95) {
      up = Math.abs(tang[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    }
    const side = norm3(cross3(up, tang));
    const binorm = norm3(cross3(tang, side));
    up = binorm;

    const r = Math.max(0, cur[3]);
    const v = j / Math.max(1, nPts - 1);
    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = side[0] * ca + binorm[0] * sa;
      const ny = side[1] * ca + binorm[1] * sa;
      const nz = side[2] * ca + binorm[2] * sa;
      positions.push(cur[0] + nx * r, cur[1] + ny * r, cur[2] + nz * r);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }

  const stride = segs + 1;
  for (let j = 0; j < nPts - 1; j += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      indices.push(a, d, c, a, c, b);
    }
  }

  const first = spine[0]!;
  if (first[3] > 1e-4) {
    const cIdx = positions.length / 3;
    const next = spine[1]!;
    const n0 = norm3([first[0] - next[0], first[1] - next[1], first[2] - next[2]]);
    positions.push(first[0], first[1], first[2]);
    normals.push(n0[0], n0[1], n0[2]);
    uvs.push(0.5, 0.5);
    for (let i = 0; i < segs; i += 1) indices.push(cIdx, i, i + 1);
  }
  const last = spine[nPts - 1]!;
  if (last[3] > 1e-4) {
    const cIdx = positions.length / 3;
    const prev = spine[nPts - 2]!;
    const n1 = norm3([last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]]);
    positions.push(last[0], last[1], last[2]);
    normals.push(n1[0], n1[1], n1[2]);
    uvs.push(0.5, 0.5);
    const ring = (nPts - 1) * stride;
    for (let i = 0; i < segs; i += 1) indices.push(cIdx, ring + i + 1, ring + i);
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/** 2D polygon ear-clipping triangulation (handles convex & concave rings; auto-normalizes CCW). */
function triangulatePolygon2D(ringIn: readonly V2[]): { readonly ring: V2[]; readonly tris: [number, number, number][] } {
  const cleaned: V2[] = [];
  for (const pt of ringIn) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-6) cleaned.push([pt[0], pt[1]]);
  }
  if (cleaned.length > 2) {
    const first = cleaned[0]!, last = cleaned[cleaned.length - 1]!;
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) cleaned.pop();
  }
  if (cleaned.length < 3) return { ring: cleaned, tris: [] };

  let signedArea2 = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = cleaned[i]!, b = cleaned[(i + 1) % cleaned.length]!;
    signedArea2 += a[0] * b[1] - b[0] * a[1];
  }
  const ring = signedArea2 >= 0 ? cleaned : [...cleaned].reverse();

  const avail = ring.map((_, idx) => idx);
  const tris: [number, number, number][] = [];
  const cross2 = (a: V2, b: V2, c: V2): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const ptInTri = (p: V2, a: V2, b: V2, c: V2): boolean =>
    cross2(a, b, p) >= -1e-7 && cross2(b, c, p) >= -1e-7 && cross2(c, a, p) >= -1e-7;

  let guard = avail.length * avail.length + 16;
  while (avail.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    for (let i = 0; i < avail.length; i += 1) {
      const i0 = avail[(i - 1 + avail.length) % avail.length]!;
      const i1 = avail[i]!;
      const i2 = avail[(i + 1) % avail.length]!;
      const a = ring[i0]!, b = ring[i1]!, c = ring[i2]!;
      if (cross2(a, b, c) <= 1e-7) continue;
      let blocked = false;
      for (const other of avail) {
        if (other === i0 || other === i1 || other === i2) continue;
        if (ptInTri(ring[other]!, a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        tris.push([i0, i1, i2]);
        avail.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      tris.push([avail[0]!, avail[1]!, avail[2]!]);
      avail.splice(1, 1);
    }
  }
  if (avail.length === 3) tris.push([avail[0]!, avail[1]!, avail[2]!]);
  return { ring, tris };
}

function insetRing2D(ring: readonly V2[], bevel: number): V2[] {
  let cx = 0, cy = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; }
  cx /= Math.max(1, ring.length);
  cy /= Math.max(1, ring.length);

  return ring.map((p, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length]!;
    const next = ring[(i + 1) % ring.length]!;
    const e0 = norm3([p[0] - prev[0], p[1] - prev[1], 0]);
    const e1 = norm3([next[0] - p[0], next[1] - p[1], 0]);
    // Inward normal for CCW ring is (-ey, ex)
    const n0: V2 = [-e0[1], e0[0]];
    const n1: V2 = [-e1[1], e1[0]];
    let bx = n0[0] + n1[0];
    let by = n0[1] + n1[1];
    const bl = Math.hypot(bx, by);
    if (bl > 1e-4) {
      bx /= bl;
      by /= bl;
    } else {
      const toC = norm3([cx - p[0], cy - p[1], 0]);
      bx = toC[0];
      by = toC[1];
    }
    const maxDist = Math.hypot(cx - p[0], cy - p[1]) * 0.45;
    const d = Math.min(bevel, maxDist);
    return [p[0] + bx * d, p[1] + by * d] as const;
  });
}

/**
 * Extrudes a 2D polygon (`ccwRing` in XY, convex or concave) across `Z in [-height/2, +height/2]`
 * with optional 45-degree front/back specular bevels.
 */
export function extrudePolygonMesh(
  ccwRing: readonly V2[],
  height: number,
  bevel = 0,
  flatShaded = false
): RawMesh {
  const out: RawMesh = { positions: [], normals: [], uvs: [], indices: [] };
  const { ring, tris } = triangulatePolygon2D(ccwRing);
  const n = ring.length;
  if (n < 3) return out;

  const hz = Math.max(1e-4, height * 0.5);
  const b = Math.min(Math.max(0, bevel), hz * 0.42);
  const innerRing = b > 1e-4 ? insetRing2D(ring, b) : ring;
  const zOuter = hz - b;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);

  // Front cap (+hz) & Back cap (-hz)
  const frontBase = out.positions.length / 3;
  for (const [x, y] of innerRing) {
    out.positions.push(x, y, hz);
    out.normals.push(0, 0, 1);
    out.uvs.push((x - minX) / spanX, (y - minY) / spanY);
  }
  for (const [i0, i1, i2] of tris) {
    out.indices.push(frontBase + i0, frontBase + i1, frontBase + i2);
  }

  const backBase = out.positions.length / 3;
  for (const [x, y] of innerRing) {
    out.positions.push(x, y, -hz);
    out.normals.push(0, 0, -1);
    out.uvs.push((x - minX) / spanX, (y - minY) / spanY);
  }
  for (const [i0, i1, i2] of tris) {
    out.indices.push(backBase + i0, backBase + i2, backBase + i1);
  }

  // Side walls + optional front/back bevel chamfers
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const c = ring[(i + 1) % n]!;
    pushQuadCCW(out, [a[0], a[1], -zOuter], [c[0], c[1], -zOuter], [c[0], c[1], zOuter], [a[0], a[1], zOuter]);
    if (b > 1e-4) {
      const ia = innerRing[i]!;
      const ic = innerRing[(i + 1) % n]!;
      pushQuadCCW(out, [a[0], a[1], zOuter], [c[0], c[1], zOuter], [ic[0], ic[1], hz], [ia[0], ia[1], hz]);
      pushQuadCCW(out, [c[0], c[1], -zOuter], [a[0], a[1], -zOuter], [ia[0], ia[1], -hz], [ic[0], ic[1], -hz]);
    }
  }

  return flatShaded ? toFlatShaded(out) : out;
}

/**
 * Lofts an ordered list of equal-count 3D cross-section rings (`sections`) into a smooth
 * hull (fuselages, car bodies, boat hulls, stadium bowls, wings) with automatic outward winding.
 */
export function loftSectionsMesh(
  sections: readonly (readonly V3[])[],
  capEnds = true,
  flatShaded = false
): RawMesh {
  const numSec = sections.length;
  if (numSec < 2) return { positions: [], normals: [], uvs: [], indices: [] };
  const ringLen = sections[0]!.length;
  if (ringLen < 3) return { positions: [], normals: [], uvs: [], indices: [] };

  const centroids: V3[] = sections.map((ring) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    return [cx / ringLen, cy / ringLen, cz / ringLen];
  });

  // Determine whether index progression (i -> i+1) combined with section progression (s -> s+1) points outward
  let orientVotes = 0;
  for (let s = 0; s < numSec - 1; s += 1) {
    const r0 = sections[s]!;
    const r1 = sections[s + 1]!;
    const midC = lerp3(centroids[s]!, centroids[s + 1]!, 0.5);
    for (let i = 0; i < ringLen; i += 1) {
      const nextI = (i + 1) % ringLen;
      const a = r0[i]!;
      const b = r0[nextI]!;
      const d = r1[i]!;
      const n = cross3(sub3(b, a), sub3(d, a));
      const outward = sub3(a, midC);
      orientVotes += dot3(n, outward);
    }
  }
  const reverseWinding = orientVotes < 0;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = ringLen + 1;

  for (let s = 0; s < numSec; s += 1) {
    const ring = sections[s]!;
    const v = s / Math.max(1, numSec - 1);
    for (let i = 0; i <= ringLen; i += 1) {
      const p = ring[i % ringLen]!;
      positions.push(p[0], p[1], p[2]);
      uvs.push(i / ringLen, v);
    }
  }

  for (let s = 0; s < numSec - 1; s += 1) {
    for (let i = 0; i < ringLen; i += 1) {
      const a = s * stride + i;
      const b = a + 1;
      const c = (s + 1) * stride + i + 1;
      const d = (s + 1) * stride + i;
      if (reverseWinding) {
        indices.push(a, d, c, a, c, b);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  // Smooth area-weighted vertex normals across the lofted skin, seam-welded at i=0 / i=ringLen
  const normals = new Array<number>(positions.length).fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!, i1 = indices[t + 1]!, i2 = indices[t + 2]!;
    const p0: V3 = [positions[i0 * 3]!, positions[i0 * 3 + 1]!, positions[i0 * 3 + 2]!];
    const p1: V3 = [positions[i1 * 3]!, positions[i1 * 3 + 1]!, positions[i1 * 3 + 2]!];
    const p2: V3 = [positions[i2 * 3]!, positions[i2 * 3 + 1]!, positions[i2 * 3 + 2]!];
    const fn = cross3(sub3(p1, p0), sub3(p2, p0));
    for (const vi of [i0, i1, i2]) {
      normals[vi * 3]! += fn[0];
      normals[vi * 3 + 1]! += fn[1];
      normals[vi * 3 + 2]! += fn[2];
    }
  }
  for (let s = 0; s < numSec; s += 1) {
    const first = s * stride;
    const last = first + ringLen;
    const sx = normals[first * 3]! + normals[last * 3]!;
    const sy = normals[first * 3 + 1]! + normals[last * 3 + 1]!;
    const sz = normals[first * 3 + 2]! + normals[last * 3 + 2]!;
    normals[first * 3] = sx; normals[first * 3 + 1] = sy; normals[first * 3 + 2] = sz;
    normals[last * 3] = sx; normals[last * 3 + 1] = sy; normals[last * 3 + 2] = sz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nl = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= nl;
    normals[i + 1]! /= nl;
    normals[i + 2]! /= nl;
  }

  if (capEnds) {
    const addCap = (ring: readonly V3[], center: V3, axisOut: V3): void => {
      const cIdx = positions.length / 3;
      const nOut = norm3(axisOut);
      positions.push(center[0], center[1], center[2]);
      normals.push(nOut[0], nOut[1], nOut[2]);
      uvs.push(0.5, 0.5);
      const ringStart = positions.length / 3;
      for (let i = 0; i < ringLen; i += 1) {
        const p = ring[i]!;
        positions.push(p[0], p[1], p[2]);
        normals.push(nOut[0], nOut[1], nOut[2]);
        uvs.push(0.5 + 0.5 * Math.cos((i / ringLen) * Math.PI * 2), 0.5 + 0.5 * Math.sin((i / ringLen) * Math.PI * 2));
      }
      for (let i = 0; i < ringLen; i += 1) {
        const a = ringStart + i;
        const b = ringStart + ((i + 1) % ringLen);
        const triN = cross3(sub3(ring[i]!, center), sub3(ring[(i + 1) % ringLen]!, center));
        if (dot3(triN, nOut) >= 0) {
          indices.push(cIdx, a, b);
        } else {
          indices.push(cIdx, b, a);
        }
      }
    };
    addCap(sections[0]!, centroids[0]!, sub3(centroids[0]!, centroids[1]!));
    addCap(sections[numSec - 1]!, centroids[numSec - 1]!, sub3(centroids[numSec - 1]!, centroids[numSec - 2]!));
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/** Subdivided faceted icosphere with optional deterministic `fbm3` displacement. */
export function icosphereFacetMesh(
  radius: number,
  detail: 0 | 1 | 2 = 1,
  noiseAmp = 0,
  seed = 1
): RawMesh {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: [number, number, number][] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ] as const
  ).map((v) => norm3(v));

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (let d = 0; d < detail; d += 1) {
    const midCache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midCache.get(k);
      if (hit !== undefined) return hit;
      const va = verts[a]!, vb = verts[b]!;
      const idx = verts.length;
      verts.push(norm3([(va[0] + vb[0]) * 0.5, (va[1] + vb[1]) * 0.5, (va[2] + vb[2]) * 0.5]));
      midCache.set(k, idx);
      return idx;
    };
    const nextFaces: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const v of verts) {
    const disp = noiseAmp > 0 ? 1 + (fbm3(v[0] * 1.9 + 3.1, v[1] * 1.9 - 1.7, v[2] * 1.9 + 5.3, seed) - 0.5) * 2 * noiseAmp : 1;
    const r = radius * disp;
    positions.push(v[0] * r, v[1] * r, v[2] * r);
    normals.push(v[0], v[1], v[2]);
    uvs.push(0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(Math.max(-1, Math.min(1, v[1]))) / Math.PI);
  }
  for (const [a, b, c] of faces) indices.push(a, b, c);
  return toFlatShaded({ positions, normals, uvs, indices });
}

/** Smooth-shaded organic icosphere with area-weighted vertex normals and optional upward botanical normal bias. */
export function icosphereSmoothMesh(
  radius: number,
  detail: 0 | 1 | 2 = 2,
  noiseAmp = 0.08,
  seed = 1,
  upwardNormalBias = 0
): RawMesh {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: [number, number, number][] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ] as const
  ).map((v) => norm3(v));

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (let d = 0; d < detail; d += 1) {
    const midCache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midCache.get(k);
      if (hit !== undefined) return hit;
      const va = verts[a]!, vb = verts[b]!;
      const idx = verts.length;
      verts.push(norm3([(va[0] + vb[0]) * 0.5, (va[1] + vb[1]) * 0.5, (va[2] + vb[2]) * 0.5]));
      midCache.set(k, idx);
      return idx;
    };
    const nextFaces: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const positions: number[] = [];
  const normals = new Array<number>(verts.length * 3).fill(0);
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const v of verts) {
    const disp = noiseAmp > 0 ? 1 + (fbm3(v[0] * 1.7 + 3.1, v[1] * 1.7 - 1.7, v[2] * 1.7 + 5.3, seed) - 0.5) * 2 * noiseAmp : 1;
    const r = radius * disp;
    positions.push(v[0] * r, v[1] * r, v[2] * r);
    uvs.push(0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(Math.max(-1, Math.min(1, v[1]))) / Math.PI);
  }
  for (const [a, b, c] of faces) {
    indices.push(a, b, c);
    const p0: V3 = [positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!];
    const p1: V3 = [positions[b * 3]!, positions[b * 3 + 1]!, positions[b * 3 + 2]!];
    const p2: V3 = [positions[c * 3]!, positions[c * 3 + 1]!, positions[c * 3 + 2]!];
    const fn = cross3(sub3(p1, p0), sub3(p2, p0));
    for (const vi of [a, b, c]) {
      normals[vi * 3]! += fn[0];
      normals[vi * 3 + 1]! += fn[1];
      normals[vi * 3 + 2]! += fn[2];
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = norm3([normals[i]!, normals[i + 1]!, normals[i + 2]!]);
    const biased = norm3([n[0], n[1] + upwardNormalBias, n[2]]);
    normals[i] = biased[0];
    normals[i + 1] = biased[1];
    normals[i + 2] = biased[2];
  }
  return { positions, normals, uvs, indices };
}

export function mergeRawMeshesToRaw(meshes: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hasAnyColors = meshes.some((m) => Boolean(m.colors && m.colors.length > 0));
  const colors: number[] | undefined = hasAnyColors ? [] : undefined;
  for (const m of meshes) {
    const vOff = positions.length / 3;
    const vCount = m.positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    if (colors) {
      if (m.colors && m.colors.length >= vCount * 4) {
        for (let i = 0; i < vCount * 4; i += 1) colors.push(m.colors[i]!);
      } else {
        for (let i = 0; i < vCount; i += 1) colors.push(1, 1, 1, 1);
      }
    }
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  const hasAnalyticNormals = meshes.some((m) => Boolean(m.analyticNormals));
  return {
    positions,
    normals,
    uvs,
    indices,
    ...(colors ? { colors } : {}),
    ...(hasAnalyticNormals ? { analyticNormals: true } : {})
  };
}
