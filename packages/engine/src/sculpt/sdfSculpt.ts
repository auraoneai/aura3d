/**
 * `@aura3d/engine/sculpt` kernel module: Organic sculpting: humanoid/anatomical limbs, mesh deformation, implicit-SDF primitives and dual surface-nets extraction, hair locks, draped garments, stylized heads and streamlined hulls.
 * Re-exported unchanged through `proceduralKernel.ts`; split out of the 5.5.6 kernel with no behaviour change.
 */
import { catmullRomSpline3, cross3, dot3, norm3, sub3, type RawMesh, type V3, type V4 } from "./kernelMath.js";
import { icosphereSmoothMesh, loftSectionsMesh, tubeSweepMesh } from "./meshPrimitives.js";
import { taubinSmoothMesh } from "./meshFairing.js";

/**
 * Sweeps an anatomical limb (`[x, y, z, radius]` control joints) along a smooth Catmull-Rom spine
 * with natural muscle-belly contour and smooth dome joint end-caps so bent joints never gap or need external sphere balls.
 */
export function sculptHumanoidLimbMesh(
  joints: readonly V4[],
  radialSegments = 14,
  muscleBulge = 0.14
): RawMesh {
  if (joints.length < 2) return tubeSweepMesh(joints, radialSegments, false);
  const pts3 = joints.map((j): V3 => [j[0], j[1], j[2]]);
  const spine = catmullRomSpline3(pts3, 5, false);
  const dense: V4[] = [];
  const startR = joints[0]![3];
  const endR = joints[joints.length - 1]![3];
  const startDir = norm3(sub3(spine[1] ?? pts3[1]!, spine[0]!));
  const endDir = norm3(sub3(spine[spine.length - 1]!, spine[spine.length - 2] ?? pts3[0]!));
  // Smooth two-ring dome cap so joints overlap naturally without exposed sphere balls
  dense.push([
    spine[0]![0] - startDir[0] * startR * 0.68,
    spine[0]![1] - startDir[1] * startR * 0.68,
    spine[0]![2] - startDir[2] * startR * 0.68,
    startR * 0.32
  ]);
  dense.push([
    spine[0]![0] - startDir[0] * startR * 0.34,
    spine[0]![1] - startDir[1] * startR * 0.34,
    spine[0]![2] - startDir[2] * startR * 0.34,
    startR * 0.78
  ]);
  for (let i = 0; i < spine.length; i += 1) {
    const t = spine.length > 1 ? i / (spine.length - 1) : 0;
    const fIdx = t * (joints.length - 1);
    const j0 = Math.min(joints.length - 1, Math.floor(fIdx));
    const j1 = Math.min(joints.length - 1, j0 + 1);
    const ft = fIdx - j0;
    const baseR = joints[j0]![3] + (joints[j1]![3] - joints[j0]![3]) * ft;
    const belly = 1 + muscleBulge * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.12)));
    dense.push([spine[i]![0], spine[i]![1], spine[i]![2], baseR * belly]);
  }
  dense.push([
    spine[spine.length - 1]![0] + endDir[0] * endR * 0.34,
    spine[spine.length - 1]![1] + endDir[1] * endR * 0.34,
    spine[spine.length - 1]![2] + endDir[2] * endR * 0.34,
    endR * 0.78
  ]);
  dense.push([
    spine[spine.length - 1]![0] + endDir[0] * endR * 0.68,
    spine[spine.length - 1]![1] + endDir[1] * endR * 0.68,
    spine[spine.length - 1]![2] + endDir[2] * endR * 0.68,
    endR * 0.32
  ]);
  return tubeSweepMesh(dense, Math.max(10, radialSegments), false);
}

/** Returns a valid empty `RawMesh`. */
export function emptyMesh(): RawMesh {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/**
 * Deforms a `RawMesh` via a custom vertex mapper `(pos, norm, vertexIndex) => newPos`
 * and recomputes smooth welded area-weighted normals so organic sculpts shade seamlessly.
 */
export function deformMesh(
  src: RawMesh,
  mapper: (pos: V3, norm: V3, vertexIndex: number) => V3
): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  if (vCount === 0) return src;
  const positions = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const mapped = mapper(
      [src.positions[p3]!, src.positions[p3 + 1]!, src.positions[p3 + 2]!],
      [src.normals[p3] ?? 0, src.normals[p3 + 1] ?? 1, src.normals[p3 + 2] ?? 0],
      i
    );
    positions[p3] = mapped[0];
    positions[p3 + 1] = mapped[1];
    positions[p3 + 2] = mapped[2];
  }
  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  const accumNormals: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
    const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = accumNormals.length;
      weldMap.set(key, w);
      accumNormals.push([0, 0, 0]);
    }
    vertToWeld[i] = w;
  }
  for (let i = 0; i < src.indices.length; i += 3) {
    const i0 = src.indices[i]! * 3, i1 = src.indices[i + 1]! * 3, i2 = src.indices[i + 2]! * 3;
    const e1x = positions[i1]! - positions[i0]!;
    const e1y = positions[i1 + 1]! - positions[i0 + 1]!;
    const e1z = positions[i1 + 2]! - positions[i0 + 2]!;
    const e2x = positions[i2]! - positions[i0]!;
    const e2y = positions[i2 + 1]! - positions[i0 + 1]!;
    const e2z = positions[i2 + 2]! - positions[i0 + 2]!;
    const fnx = e1y * e2z - e1z * e2y;
    const fny = e1z * e2x - e1x * e2z;
    const fnz = e1x * e2y - e1y * e2x;
    for (let k = 0; k < 3; k += 1) {
      const acc = accumNormals[vertToWeld[src.indices[i + k]!]!]!;
      acc[0] += fnx;
      acc[1] += fny;
      acc[2] += fnz;
    }
  }
  const normals = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const acc = accumNormals[vertToWeld[i]!]!;
    const nl = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    normals[i * 3] = acc[0] / nl;
    normals[i * 3 + 1] = acc[1] / nl;
    normals[i * 3 + 2] = acc[2] / nl;
  }
  return {
    positions,
    normals,
    uvs: src.uvs.slice(),
    indices: src.indices.slice(),
    ...(src.colors ? { colors: src.colors.slice() } : {})
  };
}

/**
 * Lofts an asymmetric anatomical limb (quad/calf, deltoid/bicep, forearm) with distinct lateral `rx`
 * and anterior-posterior `rz` cross-sections plus calf/bicep peak bias (`peakT`), eliminating cylindrical "PVC-pipe" limbs.
 */
export function sculptAnatomicalLimbMesh(
  stations: readonly {
    readonly pos: V3;
    readonly rx: number;
    readonly rz: number;
    readonly zOffset?: number;
  }[],
  opts: {
    readonly ringPoints?: number;
    readonly capEnds?: boolean;
    readonly muscleBiasZ?: number;
    readonly peakT?: number;
  } = {}
): RawMesh {
  const ringPts = Math.max(12, Math.floor(opts.ringPoints ?? 16));
  const capEnds = opts.capEnds ?? true;
  const biasZ = opts.muscleBiasZ ?? 0;
  const peakT = opts.peakT ?? 0.38;
  if (stations.length < 2) return emptyMesh();

  const rings: V3[][] = [];
  const pushRing = (pos: V3, rx: number, rz: number, zOff: number): void => {
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Slight flattened medial/lateral muscle plane (`|cos|^0.92`) for organic athletic silhouette
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.92) * rx;
      const sz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.94) * rz + zOff;
      ring.push([pos[0] + sx, pos[1], pos[2] + sz]);
    }
    rings.push(ring);
  };

  if (capEnds) {
    const s0 = stations[0]!;
    const s1 = stations[1]!;
    const dir = norm3(sub3(s1.pos, s0.pos));
    const capSpan = (s0.rx + s0.rz) * 0.32;
    pushRing(
      [s0.pos[0] - dir[0] * capSpan, s0.pos[1] - dir[1] * capSpan, s0.pos[2] - dir[2] * capSpan],
      s0.rx * 0.38,
      s0.rz * 0.38,
      (s0.zOffset ?? 0) * 0.5
    );
    pushRing(
      [s0.pos[0] - dir[0] * capSpan * 0.45, s0.pos[1] - dir[1] * capSpan * 0.45, s0.pos[2] - dir[2] * capSpan * 0.45],
      s0.rx * 0.82,
      s0.rz * 0.82,
      (s0.zOffset ?? 0) * 0.85
    );
  }

  for (let i = 0; i < stations.length; i += 1) {
    const st = stations[i]!;
    const t = stations.length > 1 ? i / (stations.length - 1) : 0;
    const bell = Math.exp(-Math.pow((t - peakT) / 0.32, 2));
    pushRing(st.pos, st.rx, st.rz, (st.zOffset ?? 0) + biasZ * bell);
  }

  if (capEnds) {
    const sn = stations[stations.length - 1]!;
    const sp = stations[stations.length - 2]!;
    const dir = norm3(sub3(sn.pos, sp.pos));
    const capSpan = (sn.rx + sn.rz) * 0.32;
    pushRing(
      [sn.pos[0] + dir[0] * capSpan * 0.45, sn.pos[1] + dir[1] * capSpan * 0.45, sn.pos[2] + dir[2] * capSpan * 0.45],
      sn.rx * 0.82,
      sn.rz * 0.82,
      (sn.zOffset ?? 0) * 0.85
    );
    pushRing(
      [sn.pos[0] + dir[0] * capSpan, sn.pos[1] + dir[1] * capSpan, sn.pos[2] + dir[2] * capSpan],
      sn.rx * 0.38,
      sn.rz * 0.38,
      (sn.zOffset ?? 0) * 0.5
    );
  }

  return taubinSmoothMesh(loftSectionsMesh(rings, true), 2, 0.44, -0.46);
}

// ---------------------------------------------------------------------------
// Organic Implicit SDF Surface-Nets, Taubin Fairing, Hair Locks & Garments
// ---------------------------------------------------------------------------


/** Polynomial smooth-minimum (`C^1` organic fillet) for implicit SDF sculpting. */
export function sminPoly(a: number, b: number, k: number): number {
  if (k <= 1e-6) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/** Polynomial smooth-maximum (`C^1` organic carving/subtraction) for implicit SDF sculpting. */
export function smaxPoly(a: number, b: number, k: number): number {
  return -sminPoly(-a, -b, k);
}

/**
 * Cubic smooth-minimum (`C^2` blend, max dip `k / 6`): softer, crease-free fillets than {@link sminPoly}
 * for hair masses and facial/muscle blending. Falls back to `Math.min` when `k <= 1e-5`.
 */
export function sminCubic(a: number, b: number, k: number): number {
  if (k <= 1e-5) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * h * k * (1 / 6);
}

/** Cubic smooth-maximum (`C^2` carving/intersection), the mirror of {@link sminCubic}. */
export function smaxCubic(a: number, b: number, k: number): number {
  return -sminCubic(-a, -b, k);
}

/** Approximate signed distance to an axis-aligned ellipsoid centered at `center` with semi-axes `radii`. */
export function sdfEllipsoid(p: V3, center: V3, radii: V3): number {
  const rx = Math.max(1e-4, radii[0]);
  const ry = Math.max(1e-4, radii[1]);
  const rz = Math.max(1e-4, radii[2]);
  const qx = (p[0] - center[0]) / rx;
  const qy = (p[1] - center[1]) / ry;
  const qz = (p[2] - center[2]) / rz;
  const k0 = Math.hypot(qx, qy, qz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(qx / rx, qy / ry, qz / rz) || 1;
  return (k0 * (k0 - 1)) / k1;
}

/** Exact signed distance to a smoothly tapered capsule from `a` (radius `ra`) to `b` (radius `rb`). */
export function sdfTaperedCapsule(p: V3, a: V3, b: V3, ra: number, rb: number): number {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  if (l2 < 1e-8) return Math.hypot(pax, pay, paz) - Math.max(ra, rb);
  const rba = rb - ra;
  const papa = pax * pax + pay * pay + paz * paz;
  const paba = (pax * bax + pay * bay + paz * baz) / l2;
  const x = Math.sqrt(Math.max(0, papa - paba * paba * l2));
  const cax = Math.max(0, x - (paba < 0.5 ? ra : rb));
  const cay = Math.abs(paba - 0.5) - 0.5;
  const k = rba * rba + l2;
  const f = Math.max(0, Math.min(1, (rba * (x - ra) + paba * l2) / k));
  const cbx = x - ra - f * rba;
  const cby = paba - f;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.max(0, Math.min(cax * cax + cay * cay * l2, cbx * cbx + cby * cby * l2)));
}

/**
 * Extracts a smooth, watertight, closed 2-manifold organic mesh from an implicit SDF (`evaluate(x, y, z) < 0` inside)
 * using dual Surface-Nets + volume-preserving Taubin fairing + analytic SDF gradient normals.
 * Ideal for unified creature/mascot bodies where head, brow sockets, torso, and haunches blend seamlessly.
 */
export function sculptOrganicSdfMesh(opts: {
  readonly boundsMin: V3;
  readonly boundsMax: V3;
  readonly resolution?: number | readonly [number, number, number];
  readonly evaluate: (x: number, y: number, z: number) => number;
  readonly taubinIterations?: number;
  readonly projectToIso?: number;
}): RawMesh {
  const res = typeof opts.resolution === "number"
    ? [opts.resolution, opts.resolution, opts.resolution] as const
    : (opts.resolution ?? [32, 32, 32] as const);
  const nx = Math.max(8, Math.min(72, Math.floor(res[0])));
  const ny = Math.max(8, Math.min(72, Math.floor(res[1])));
  const nz = Math.max(8, Math.min(72, Math.floor(res[2])));

  const rawSpanX = Math.max(1e-3, opts.boundsMax[0] - opts.boundsMin[0]);
  const rawSpanY = Math.max(1e-3, opts.boundsMax[1] - opts.boundsMin[1]);
  const rawSpanZ = Math.max(1e-3, opts.boundsMax[2] - opts.boundsMin[2]);
  const dx = rawSpanX / (nx - 4);
  const dy = rawSpanY / (ny - 4);
  const dz = rawSpanZ / (nz - 4);
  const ox = opts.boundsMin[0] - 2 * dx;
  const oy = opts.boundsMin[1] - 2 * dy;
  const oz = opts.boundsMin[2] - 2 * dz;

  const gxCount = nx + 1;
  const gyCount = ny + 1;
  const gzCount = nz + 1;
  const strideY = gxCount;
  const strideZ = gxCount * gyCount;
  const field = new Float32Array(gxCount * gyCount * gzCount);
  const posThresh = Math.min(dx, dy, dz) * 0.5;

  for (let k = 0; k < gzCount; k += 1) {
    const z = oz + k * dz;
    const onZ = k === 0 || k === nz;
    for (let j = 0; j < gyCount; j += 1) {
      const y = oy + j * dy;
      const onYZ = onZ || j === 0 || j === ny;
      const rowBase = k * strideZ + j * strideY;
      for (let i = 0; i < gxCount; i += 1) {
        if (onYZ || i === 0 || i === nx) {
          field[rowBase + i] = posThresh;
        } else {
          field[rowBase + i] = opts.evaluate(ox + i * dx, y, z);
        }
      }
    }
  }

  // 12 cube edges as pairs of corner offsets [x0,y0,z0, x1,y1,z1]
  const CUBE_EDGES: readonly [number, number, number, number, number, number][] = [
    [0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]
  ];

  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const cellIndex = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  const positions: number[] = [];

  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        let mask = 0;
        for (let cz = 0; cz < 2; cz += 1) {
          for (let cy = 0; cy < 2; cy += 1) {
            for (let cx = 0; cx < 2; cx += 1) {
              const bit = cx | (cy << 1) | (cz << 2);
              if (field[(k + cz) * strideZ + (j + cy) * strideY + (i + cx)]! < 0) {
                mask |= 1 << bit;
              }
            }
          }
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, crossings = 0;
        for (const [ax, ay, az, bx, by, bz] of CUBE_EDGES) {
          const fa = field[(k + az) * strideZ + (j + ay) * strideY + (i + ax)]!;
          const fb = field[(k + bz) * strideZ + (j + by) * strideY + (i + bx)]!;
          if ((fa < 0) === (fb < 0)) continue;
          const t = fa / (fa - fb);
          sx += ox + (i + ax + (bx - ax) * t) * dx;
          sy += oy + (j + ay + (by - ay) * t) * dy;
          sz += oz + (k + az + (bz - az) * t) * dz;
          crossings += 1;
        }
        const vIdx = positions.length / 3;
        cellVert[cellIndex(i, j, k)] = vIdx;
        const inv = 1 / Math.max(1, crossings);
        positions.push(sx * inv, sy * inv, sz * inv);
      }
    }
  }

  if (positions.length === 0) return emptyMesh();

  const indices: number[] = [];
  const emitQuad = (c00: number, c10: number, c11: number, c01: number, flip: boolean): void => {
    if (c00 < 0 || c10 < 0 || c11 < 0 || c01 < 0) return;
    if (flip) {
      indices.push(c00, c01, c11, c00, c11, c10);
    } else {
      indices.push(c00, c10, c11, c00, c11, c01);
    }
  };

  // +X grid edges
  for (let k = 1; k < nz; k += 1) {
    for (let j = 1; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const f0 = field[k * strideZ + j * strideY + i]!;
        const f1 = field[k * strideZ + j * strideY + (i + 1)]!;
        if ((f0 < 0) === (f1 < 0)) continue;
        emitQuad(
          cellVert[cellIndex(i, j - 1, k - 1)]!,
          cellVert[cellIndex(i, j, k - 1)]!,
          cellVert[cellIndex(i, j, k)]!,
          cellVert[cellIndex(i, j - 1, k)]!,
          f0 >= 0
        );
      }
    }
  }
  // +Y grid edges
  for (let k = 1; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 1; i < nx; i += 1) {
        const f0 = field[k * strideZ + j * strideY + i]!;
        const f1 = field[k * strideZ + (j + 1) * strideY + i]!;
        if ((f0 < 0) === (f1 < 0)) continue;
        emitQuad(
          cellVert[cellIndex(i - 1, j, k - 1)]!,
          cellVert[cellIndex(i - 1, j, k)]!,
          cellVert[cellIndex(i, j, k)]!,
          cellVert[cellIndex(i, j, k - 1)]!,
          f0 >= 0
        );
      }
    }
  }
  // +Z grid edges
  for (let k = 0; k < nz; k += 1) {
    for (let j = 1; j < ny; j += 1) {
      for (let i = 1; i < nx; i += 1) {
        const f0 = field[k * strideZ + j * strideY + i]!;
        const f1 = field[(k + 1) * strideZ + j * strideY + i]!;
        if ((f0 < 0) === (f1 < 0)) continue;
        emitQuad(
          cellVert[cellIndex(i - 1, j - 1, k)]!,
          cellVert[cellIndex(i, j - 1, k)]!,
          cellVert[cellIndex(i, j, k)]!,
          cellVert[cellIndex(i - 1, j, k)]!,
          f0 >= 0
        );
      }
    }
  }

  const vTotal = positions.length / 3;
  const cxMid = (opts.boundsMin[0] + opts.boundsMax[0]) * 0.5;
  const cyMid = (opts.boundsMin[1] + opts.boundsMax[1]) * 0.5;
  const czMid = (opts.boundsMin[2] + opts.boundsMax[2]) * 0.5;
  const uvs = new Array<number>(vTotal * 2);
  const dummyNormals = new Array<number>(vTotal * 3).fill(0);
  for (let i = 0; i < vTotal; i += 1) {
    const dir = norm3([positions[i * 3]! - cxMid, positions[i * 3 + 1]! - cyMid, positions[i * 3 + 2]! - czMid]);
    uvs[i * 2] = 0.5 + Math.atan2(dir[2], dir[0]) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, dir[1]))) / Math.PI;
    dummyNormals[i * 3 + 1] = 1;
  }

  let mesh: RawMesh = { positions, normals: dummyNormals, uvs, indices };
  const taubinPasses = Math.max(7, opts.taubinIterations ?? 7);
  mesh = taubinSmoothMesh(mesh, taubinPasses, 0.48, -0.503);

  const projStrength = opts.projectToIso === undefined ? 0.94 : Math.max(0, Math.min(1, opts.projectToIso));
  const minCell = Math.min(dx, dy, dz);
  const eps = minCell * 0.32;
  const evalGrad = (x: number, y: number, z: number): [number, number, number, number] => {
    const gx = opts.evaluate(x + eps, y, z) - opts.evaluate(x - eps, y, z);
    const gy = opts.evaluate(x, y + eps, z) - opts.evaluate(x, y - eps, z);
    const gz = opts.evaluate(x, y, z + eps) - opts.evaluate(x, y, z - eps);
    const gl = Math.hypot(gx, gy, gz) || 1;
    return [gx / gl, gy / gl, gz / gl, gl / (2 * eps)];
  };

  if (projStrength > 0) {
    // Build 1-ring adjacency on the Surface-Nets vertex graph (already 1 unique vertex per active cell!).
    const adj = Array.from({ length: vTotal }, () => new Set<number>());
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i]!;
      const b = mesh.indices[i + 1]!;
      const c = mesh.indices[i + 2]!;
      if (a !== b && b !== c && c !== a) {
        adj[a]!.add(b); adj[a]!.add(c);
        adj[b]!.add(a); adj[b]!.add(c);
        adj[c]!.add(a); adj[c]!.add(b);
      }
    }

    let curPos = mesh.positions.slice();
    const maxStep = minCell * 0.55;
    // 5 coupled passes of tangential umbrella relaxation (`I - n⊗n`) + exact analytic Newton `f(p) = 0` projection:
    // slides vertices smoothly across voxel slice boundaries without shrinking volume, eliminating all marching-cubes terraces!
    for (let pass = 0; pass < 5; pass += 1) {
      const relaxed = curPos.slice();
      for (let i = 0; i < vTotal; i += 1) {
        const nbs = adj[i]!;
        if (nbs.size < 2) continue;
        const px = curPos[i * 3]!, py = curPos[i * 3 + 1]!, pz = curPos[i * 3 + 2]!;
        const [nxG, nyG, nzG] = evalGrad(px, py, pz);
        let sx = 0, sy = 0, sz = 0;
        for (const nb of nbs) {
          sx += curPos[nb * 3]!;
          sy += curPos[nb * 3 + 1]!;
          sz += curPos[nb * 3 + 2]!;
        }
        const inv = 1 / nbs.size;
        const ux = sx * inv - px;
        const uy = sy * inv - py;
        const uz = sz * inv - pz;
        const nDot = ux * nxG + uy * nyG + uz * nzG;
        const tx = ux - nDot * nxG;
        const ty = uy - nDot * nyG;
        const tz = uz - nDot * nzG;
        relaxed[i * 3] = px + tx * 0.52;
        relaxed[i * 3 + 1] = py + ty * 0.52;
        relaxed[i * 3 + 2] = pz + tz * 0.52;
      }
      for (let i = 0; i < vTotal; i += 1) {
        let px = relaxed[i * 3]!, py = relaxed[i * 3 + 1]!, pz = relaxed[i * 3 + 2]!;
        const fVal = opts.evaluate(px, py, pz);
        const [nxG, nyG, nzG, slope] = evalGrad(px, py, pz);
        const step = Math.max(-maxStep, Math.min(maxStep, (-fVal / Math.max(0.25, slope)) * projStrength));
        px += nxG * step;
        py += nyG * step;
        pz += nzG * step;
        relaxed[i * 3] = px;
        relaxed[i * 3 + 1] = py;
        relaxed[i * 3 + 2] = pz;
      }
      curPos = relaxed;
    }
    mesh = { ...mesh, positions: curPos };
  }

  // Use exact C^1 analytic SDF gradient normals so voxel-grid triangulation never imprints specular streaks!
  const finalNormals = new Array<number>(vTotal * 3);
  for (let i = 0; i < vTotal; i += 1) {
    const px = mesh.positions[i * 3]!, py = mesh.positions[i * 3 + 1]!, pz = mesh.positions[i * 3 + 2]!;
    const [gx, gy, gz, slope] = evalGrad(px, py, pz);
    const blended = slope > 1e-4
      ? norm3([gx, gy, gz])
      : norm3([mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!]);
    finalNormals[i * 3] = blended[0];
    finalNormals[i * 3 + 1] = blended[1];
    finalNormals[i * 3 + 2] = blended[2];
  }
  return { ...mesh, normals: finalNormals, analyticNormals: true };
}

/**
 * Sculpts a smooth, curved, crescent/teardrop stylized 3D hair lock or plume along a quadratic/Catmull-Rom arc
 * (`root -> mid -> tip`), eliminating rigid geometric cone-spikes on anime, martial-arts, and athletic heroes.
 */
export function sculptCurvedHairLockMesh(opts: {
  readonly root: V3;
  readonly mid: V3;
  readonly tip: V3;
  readonly width: number;
  readonly thickness?: number;
  readonly segments?: number;
  readonly radialSegments?: number;
}): RawMesh {
  const segs = Math.max(5, Math.floor(opts.segments ?? 9));
  const ringPts = Math.max(8, Math.floor(opts.radialSegments ?? 12));
  const wMax = Math.max(0.004, opts.width * 0.5);
  const tMax = Math.max(0.003, (opts.thickness ?? opts.width * 0.58) * 0.5);
  const spine = catmullRomSpline3([opts.root, opts.mid, opts.tip], Math.max(3, Math.ceil(segs / 2)), false);
  if (spine.length < 2) return emptyMesh();

  let refUp: V3 = [0, 1, 0];
  const rings: V3[][] = [];
  for (let j = 0; j < spine.length; j += 1) {
    const u = j / (spine.length - 1);
    const cur = spine[j]!;
    const prev = spine[Math.max(0, j - 1)]!;
    const next = spine[Math.min(spine.length - 1, j + 1)]!;
    const tang = norm3(sub3(next, prev));
    if (Math.abs(dot3(tang, refUp)) > 0.94) {
      refUp = Math.abs(tang[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    }
    const side = norm3(cross3(refUp, tang));
    const binorm = norm3(cross3(tang, side));
    refUp = binorm;

    // Fuller root & mid-belly tapering smoothly to a soft rounded tip (`u = 1`)
    const env = u < 0.12
      ? 0.62 + (u / 0.12) * 0.38
      : Math.pow(Math.max(0.04, 1 - (u - 0.12) / 0.88), 0.78) * (1 + 0.18 * Math.sin(Math.PI * u));
    const rx = wMax * env;
    const ry = tMax * env;
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Soft dorsal ridge (`sa > 0`) + tucked underside (`sa < 0`) for sculpted lock volume
      const localX = ca * rx;
      const localY = (sa >= 0 ? Math.pow(sa, 0.85) : -Math.pow(-sa, 1.15) * 0.72) * ry + ca * ca * ry * -0.14;
      ring.push([
        cur[0] + side[0] * localX + binorm[0] * localY,
        cur[1] + side[1] * localX + binorm[1] * localY,
        cur[2] + side[2] * localX + binorm[2] * localY
      ]);
    }
    rings.push(ring);
  }
  return taubinSmoothMesh(loftSectionsMesh(rings, true, false), 2, 0.42, -0.44);
}

/**
 * Lofts a smooth flowing garment (hooded cloak, martial-arts gi tunic, tailored jersey, flared skirt/shorts)
 * with soft organic cloth folds and Taubin surface fairing — eliminates stiff traffic-cone / cylinder clothing.
 */
export function sculptDrapedGarmentMesh(
  stations: readonly {
    readonly y: number;
    readonly rx: number;
    readonly rz: number;
    readonly x?: number;
    readonly z?: number;
    readonly folds?: number;
    readonly foldAmp?: number;
    readonly superellipseN?: number;
  }[],
  opts: {
    readonly ringPoints?: number;
    readonly capEnds?: boolean;
    readonly smoothPasses?: number;
  } = {}
): RawMesh {
  if (stations.length < 2) return emptyMesh();
  const ringPts = Math.max(14, Math.floor(opts.ringPoints ?? 24));
  const rings: V3[][] = stations.map((st) => {
    const nExp = 2 / Math.max(1.2, st.superellipseN ?? 2.15);
    const folds = Math.max(0, Math.floor(st.folds ?? 0));
    const foldAmp = st.foldAmp ?? 0;
    const cx = st.x ?? 0;
    const cz = st.z ?? 0;
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pleat = folds > 0 ? 1 + foldAmp * Math.sin(a * folds + st.y * 2.2) : 1;
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), nExp) * st.rx * pleat;
      const sz = Math.sign(sa) * Math.pow(Math.abs(sa), nExp) * st.rz * pleat;
      ring.push([cx + sx, st.y, cz + sz]);
    }
    return ring;
  });
  const lofted = loftSectionsMesh(rings, opts.capEnds ?? true, false);
  const smoothPasses = opts.smoothPasses ?? 3;
  return smoothPasses > 0 ? taubinSmoothMesh(lofted, smoothPasses, 0.44, -0.46) : lofted;
}

/**
 * Sculpted stylized 3D character head (`+Z` forward, `+Y` up) with cranium fullness, cheekbones,
 * tapered jawline/chin, subtle brow ridge, and nose bridge — replaces raw egg/sphere heads.
 */
export function sculptStylizedHeadMesh(
  radius: number,
  opts: {
    readonly jawTaper?: number;
    readonly cheekFullness?: number;
    readonly noseBridge?: number;
    readonly browRidge?: number;
    readonly subdivisions?: 0 | 1 | 2;
    readonly seed?: number;
  } = {}
): RawMesh {
  const jawTaper = opts.jawTaper ?? 0.24;
  const cheek = opts.cheekFullness ?? 0.08;
  const nose = opts.noseBridge ?? 0.18;
  const brow = opts.browRidge ?? 0.09;
  const base = icosphereSmoothMesh(radius, opts.subdivisions ?? 2, 0, opts.seed ?? 17);
  const deformed = deformMesh(base, ([x, y, z]) => {
    const nx = x / Math.max(1e-5, radius);
    const ny = y / Math.max(1e-5, radius);
    const nz = z / Math.max(1e-5, radius);
    // Taper lower jaw (`ny < 0`), fuller cranium (`ny > 0.15`), defined chin (`ny < -0.45, nz > 0.25`)
    const lower = Math.max(0, -ny);
    const jawScaleX = 1 - jawTaper * Math.pow(lower, 1.25);
    const craniumX = ny > 0.1 ? 1 + 0.04 * Math.sin(Math.min(1, (ny - 0.1) / 0.9) * Math.PI) : 1;
    const cheekBump =
      cheek *
      Math.exp(-Math.pow((ny + 0.08) / 0.28, 2)) *
      Math.exp(-Math.pow((Math.abs(nx) - 0.62) / 0.32, 2)) *
      Math.max(0, nz + 0.2);
    const chinForward =
      nz > 0
        ? 0.09 * Math.exp(-Math.pow((ny + 0.72) / 0.24, 2)) * Math.exp(-Math.pow(nx / 0.36, 2))
        : 0;
    const browBump =
      nz > 0.2
        ? brow * Math.exp(-Math.pow((ny - 0.22) / 0.16, 2)) * Math.exp(-Math.pow(nx / 0.58, 2))
        : 0;
    const noseBump =
      nz > 0.35
        ? nose * Math.exp(-Math.pow((ny + 0.04) / 0.24, 2)) * Math.exp(-Math.pow(nx / 0.19, 2))
        : 0;
    const occiput = nz < -0.2 && ny > -0.15 ? 0.06 * Math.exp(-Math.pow((ny - 0.18) / 0.45, 2)) : 0;
    return [
      x * jawScaleX * craniumX + Math.sign(x) * cheekBump * radius * 0.45,
      y * 1.08,
      z * 0.98 + (chinForward + browBump + noseBump - occiput) * radius
    ];
  });
  return taubinSmoothMesh(deformed, 3, 0.44, -0.46);
}

/**
 * Lofts a smooth aerodynamic superellipse fuselage / cowling / hull along `Z` (`-length/2 .. +length/2`)
 * for sleek bikes, racers, pods, drones, hoverboards, and watercraft.
 */
export function sculptStreamlinedHullMesh(
  length: number,
  width: number,
  height: number,
  opts: {
    readonly noseSharpness?: number;
    readonly tailTaper?: number;
    readonly canopyBulge?: number;
    readonly undersideFlat?: number;
    readonly stations?: number;
    readonly ringPoints?: number;
  } = {}
): RawMesh {
  const noseSharp = opts.noseSharpness ?? 0.68;
  const tailTaper = opts.tailTaper ?? 0.42;
  const canopyBulge = opts.canopyBulge ?? 0.22;
  const underFlat = Math.max(0, Math.min(0.85, opts.undersideFlat ?? 0.45));
  const stations = Math.max(7, Math.floor(opts.stations ?? 13));
  const ringPts = Math.max(10, Math.floor(opts.ringPoints ?? 18));
  const halfL = length * 0.5;
  const halfW = width * 0.5;
  const halfH = height * 0.5;

  const rings: V3[][] = [];
  for (let s = 0; s < stations; s += 1) {
    const t = s / (stations - 1); // 0 = rear (-halfL), 1 = nose (+halfL)
    const z = -halfL + t * length;
    const edgePin = s === 0 || s === stations - 1;
    const foreEnv = Math.pow(Math.max(0.002, 1 - t), noseSharp * 0.72);
    const aftEnv = Math.pow(Math.max(0.002, t), tailTaper * 0.65);
    const env = edgePin ? 0.04 : Math.min(1.12, foreEnv * aftEnv * 2.15);
    const rx = Math.max(0.004, halfW * env);
    const ry = Math.max(0.004, halfH * env);
    const hump = canopyBulge * halfH * Math.exp(-(((t - 0.58) / 0.24) ** 2));
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.86) * rx;
      let sy = Math.sign(sa) * Math.pow(Math.abs(sa), 0.88) * ry;
      if (sy < 0) sy *= 1 - underFlat * 0.55;
      else sy += hump * sa;
      ring.push([sx, sy, z]);
    }
    rings.push(ring);
  }
  return taubinSmoothMesh(loftSectionsMesh(rings, true), 2, 0.44, -0.46);
}
