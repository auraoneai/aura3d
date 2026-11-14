/**
 * `@aura3d/engine/sculpt` kernel module: Linear-space vertex colouring, cavity AO baking, smooth subdivision, welded normals and Taubin fairing.
 * Re-exported unchanged through `proceduralKernel.ts`; split out of the 5.5.6 kernel with no behaviour change.
 */
import { lerp3, type RawMesh, type V2, type V3, type V4 } from "./kernelMath.js";

// ---------------------------------------------------------------------------
// Linear-Space Vertex Coloring, Cavity AO, Smooth Subdivision & Sculpting
// ---------------------------------------------------------------------------

/** Converts an sRGB `[0, 1]` channel to linear light `[0, 1]`. */
export function srgbToLinearChannel(c01: number): number {
  const c = Math.max(0, Math.min(1, c01));
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parses `#rgb`, `#rrggbb`, or `#rrggbbaa` into linear-space `[r, g, b, a]`. */
export function srgbHexToLinearRgba(hex: string, alpha = 1): [number, number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  let r = 1, g = 1, b = 1, a = alpha;
  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16) / 255;
    g = parseInt(clean[1]! + clean[1]!, 16) / 255;
    b = parseInt(clean[2]! + clean[2]!, 16) / 255;
  } else if (clean.length === 6 || clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
    if (clean.length === 8) {
      a = (parseInt(clean.slice(6, 8), 16) / 255) * alpha;
    }
  }
  return [
    srgbToLinearChannel(Number.isFinite(r) ? r : 1),
    srgbToLinearChannel(Number.isFinite(g) ? g : 1),
    srgbToLinearChannel(Number.isFinite(b) ? b : 1),
    Math.max(0, Math.min(1, Number.isFinite(a) ? a : 1))
  ];
}

/** Paints or modulates per-vertex linear RGBA colors on a `RawMesh`. */
export function paintMeshColors(
  src: RawMesh,
  colorOrSampler: string | V3 | V4 | ((pos: V3, norm: V3, uv: V2, vertexIndex: number) => V3 | V4),
  multiplyExisting = true
): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  const colors = new Array<number>(vCount * 4);
  const toRgba = (c: V3 | V4): V4 =>
    c.length === 3
      ? [srgbToLinearChannel(c[0]), srgbToLinearChannel(c[1]), srgbToLinearChannel(c[2]), 1]
      : [c[0], c[1], c[2], Number.isFinite(c[3]) ? c[3] : 1];
  const sampler = typeof colorOrSampler === "function" ? colorOrSampler : null;
  const constRgba: V4 | null =
    typeof colorOrSampler === "string"
      ? srgbHexToLinearRgba(colorOrSampler)
      : typeof colorOrSampler === "function"
        ? null
        : toRgba(colorOrSampler);

  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const u2 = i * 2;
    const c4 = i * 4;
    const rgba = constRgba ?? toRgba(
      sampler!(
        [src.positions[p3]!, src.positions[p3 + 1]!, src.positions[p3 + 2]!],
        [src.normals[p3] ?? 0, src.normals[p3 + 1] ?? 1, src.normals[p3 + 2] ?? 0],
        [src.uvs[u2] ?? 0, src.uvs[u2 + 1] ?? 0],
        i
      )
    );
    if (multiplyExisting && src.colors && src.colors.length >= c4 + 4) {
      colors[c4] = src.colors[c4]! * rgba[0];
      colors[c4 + 1] = src.colors[c4 + 1]! * rgba[1];
      colors[c4 + 2] = src.colors[c4 + 2]! * rgba[2];
      colors[c4 + 3] = src.colors[c4 + 3]! * rgba[3];
    } else {
      colors[c4] = rgba[0];
      colors[c4 + 1] = rgba[1];
      colors[c4 + 2] = rgba[2];
      colors[c4 + 3] = rgba[3];
    }
  }
  return { ...src, colors };
}

/**
 * Bakes smooth crevice concavity + ground-hemisphere ambient occlusion into
 * linear-space vertex `colors` so sculpted meshes read with depth and contact grounding.
 */
export function bakeMeshCavityAO(src: RawMesh, strength = 0.2): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  if (vCount === 0 || strength <= 0) return src;
  const clampedStrength = Math.max(0, Math.min(0.65, strength));

  let minY = Infinity, maxY = -Infinity;
  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  const weldPos: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!;
    const y = src.positions[i * 3 + 1]!;
    const z = src.positions[i * 3 + 2]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const key = `${Math.round(x * 2000)}|${Math.round(y * 2000)}|${Math.round(z * 2000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = weldPos.length;
      weldMap.set(key, w);
      weldPos.push([x, y, z]);
    }
    vertToWeld[i] = w;
  }

  const adj = Array.from({ length: weldPos.length }, () => new Set<number>());
  for (let i = 0; i < src.indices.length; i += 3) {
    const a = vertToWeld[src.indices[i]!]!;
    const b = vertToWeld[src.indices[i + 1]!]!;
    const c = vertToWeld[src.indices[i + 2]!]!;
    if (a !== b) { adj[a]!.add(b); adj[b]!.add(a); }
    if (b !== c) { adj[b]!.add(c); adj[c]!.add(b); }
    if (c !== a) { adj[c]!.add(a); adj[a]!.add(c); }
  }

  const spanY = Math.max(0.05, maxY - minY);
  const weldCount = weldPos.length;
  let weldConcavity = new Float32Array(weldCount);
  const weldNormalAccum: [number, number, number][] = Array.from({ length: weldCount }, () => [0, 0, 0]);
  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const acc = weldNormalAccum[vertToWeld[i]!]!;
    acc[0] += src.normals[p3] ?? 0;
    acc[1] += src.normals[p3 + 1] ?? 1;
    acc[2] += src.normals[p3 + 2] ?? 0;
  }
  for (let w = 0; w < weldCount; w += 1) {
    const neighbors = adj[w]!;
    if (neighbors.size === 0) continue;
    const [px, py, pz] = weldPos[w]!;
    const nAcc = weldNormalAccum[w]!;
    const nl = Math.hypot(nAcc[0], nAcc[1], nAcc[2]) || 1;
    const nx = nAcc[0] / nl, ny = nAcc[1] / nl, nz = nAcc[2] / nl;
    let sx = 0, sy = 0, sz = 0, edgeSum = 0;
    for (const nb of neighbors) {
      const np = weldPos[nb]!;
      sx += np[0]; sy += np[1]; sz += np[2];
      edgeSum += Math.hypot(np[0] - px, np[1] - py, np[2] - pz);
    }
    const inv = 1 / neighbors.size;
    const dx = sx * inv - px;
    const dy = sy * inv - py;
    const dz = sz * inv - pz;
    const avgEdge = Math.max(1e-4, edgeSum * inv);
    // When neighbors sit in front of the vertex along its surface normal (`dot > 0`), the vertex sits in a concave pocket/fold.
    weldConcavity[w] = Math.max(0, Math.min(1, ((dx * nx + dy * ny + dz * nz) / avgEdge) * 1.25));
  }
  // Smooth discrete 1-ring concavity across 2 neighbor-averaging passes so triangulation rings never speckle vertex colors.
  for (let pass = 0; pass < 2; pass += 1) {
    const nextConcavity = new Float32Array(weldCount);
    for (let w = 0; w < weldCount; w += 1) {
      const neighbors = adj[w]!;
      if (neighbors.size === 0) {
        nextConcavity[w] = weldConcavity[w]!;
        continue;
      }
      let sum = 0;
      for (const nb of neighbors) sum += weldConcavity[nb]!;
      nextConcavity[w] = weldConcavity[w]! * 0.45 + (sum / neighbors.size) * 0.55;
    }
    weldConcavity = nextConcavity;
  }

  const colors = new Array<number>(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const c4 = i * 4;
    const py = src.positions[p3 + 1]!;
    const ny = src.normals[p3 + 1] ?? 1;
    const concavity = weldConcavity[vertToWeld[i]!]!;
    const groundBounce = Math.max(0, Math.min(0.42, (0.2 - ny) * 0.34));
    const baseContact = Math.max(0, Math.min(0.32, (1 - (py - minY) / (spanY * 0.45)) * 0.24));
    const occ = Math.max(0, Math.min(1, concavity * 0.58 + groundBounce + baseContact));
    const shade = 1 - clampedStrength * occ;
    const r0 = src.colors?.[c4] ?? 1;
    const g0 = src.colors?.[c4 + 1] ?? 1;
    const b0 = src.colors?.[c4 + 2] ?? 1;
    const a0 = src.colors?.[c4 + 3] ?? 1;
    colors[c4] = r0 * shade;
    colors[c4 + 1] = g0 * shade;
    colors[c4 + 2] = b0 * shade;
    colors[c4 + 3] = a0;
  }
  return { ...src, colors };
}

/**
 * Position-welded Loop-style smooth triangle subdivision (`iterations` clamped to `1..3`).
 * Turns low-poly cages into smooth organic heads, bodies, creatures, helmets, fairings, and foliage
 * while preserving UV/color seams and open boundary rims.
 */
export function subdivideSmoothMesh(src: RawMesh, iterations = 1, smoothWeight = 0.56): RawMesh {
  const passes = Math.max(0, Math.min(3, Math.floor(iterations)));
  if (passes === 0 || src.indices.length < 3) return src;
  const weight = Math.max(0, Math.min(1, smoothWeight));

  let cur = src;
  for (let pass = 0; pass < passes; pass += 1) {
    const vCount = Math.floor(cur.positions.length / 3);
    const hasColors = Boolean(cur.colors && cur.colors.length >= vCount * 4);

    // 1. Weld coincident 3D positions so seams deform together without cracking.
    const weldMap = new Map<string, number>();
    const vertToWeld = new Int32Array(vCount);
    const weldPos: [number, number, number][] = [];
    for (let i = 0; i < vCount; i += 1) {
      const x = cur.positions[i * 3]!;
      const y = cur.positions[i * 3 + 1]!;
      const z = cur.positions[i * 3 + 2]!;
      const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
      let w = weldMap.get(key);
      if (w === undefined) {
        w = weldPos.length;
        weldMap.set(key, w);
        weldPos.push([x, y, z]);
      }
      vertToWeld[i] = w;
    }

    // 2. Collect welded edge opposite vertices & boundary adjacency for Loop weights.
    const wEdgeOpps = new Map<string, number[]>();
    const wNeighbors = Array.from({ length: weldPos.length }, () => new Set<number>());
    const wEdgeKey = (u: number, v: number): string => (u < v ? `${u}:${v}` : `${v}:${u}`);
    for (let i = 0; i < cur.indices.length; i += 3) {
      const wa = vertToWeld[cur.indices[i]!]!;
      const wb = vertToWeld[cur.indices[i + 1]!]!;
      const wc = vertToWeld[cur.indices[i + 2]!]!;
      if (wa === wb || wb === wc || wc === wa) continue;
      wNeighbors[wa]!.add(wb); wNeighbors[wa]!.add(wc);
      wNeighbors[wb]!.add(wa); wNeighbors[wb]!.add(wc);
      wNeighbors[wc]!.add(wa); wNeighbors[wc]!.add(wb);
      const reg = (u: number, v: number, opp: number): void => {
        const k = wEdgeKey(u, v);
        let list = wEdgeOpps.get(k);
        if (!list) wEdgeOpps.set(k, (list = []));
        list.push(opp);
      };
      reg(wa, wb, wc);
      reg(wb, wc, wa);
      reg(wc, wa, wb);
    }

    const wBoundaryNeighbors = Array.from({ length: weldPos.length }, () => [] as number[]);
    for (const [k, opps] of wEdgeOpps) {
      if (opps.length === 1) {
        const sep = k.indexOf(":");
        const u = Number(k.slice(0, sep));
        const v = Number(k.slice(sep + 1));
        wBoundaryNeighbors[u]!.push(v);
        wBoundaryNeighbors[v]!.push(u);
      }
    }

    // 3. Relax welded control vertices.
    const relaxedWeldPos: [number, number, number][] = new Array(weldPos.length);
    for (let w = 0; w < weldPos.length; w += 1) {
      const p = weldPos[w]!;
      const bnd = wBoundaryNeighbors[w]!;
      if (bnd.length >= 2) {
        const b0 = weldPos[bnd[0]!]!, b1 = weldPos[bnd[1]!]!;
        const tx = p[0] * 0.75 + (b0[0] + b1[0]) * 0.125;
        const ty = p[1] * 0.75 + (b0[1] + b1[1]) * 0.125;
        const tz = p[2] * 0.75 + (b0[2] + b1[2]) * 0.125;
        relaxedWeldPos[w] = lerp3(p, [tx, ty, tz], weight);
      } else if (bnd.length === 0 && wNeighbors[w]!.size >= 3) {
        const nbs = wNeighbors[w]!;
        let sx = 0, sy = 0, sz = 0;
        for (const nb of nbs) {
          const np = weldPos[nb]!;
          sx += np[0]; sy += np[1]; sz += np[2];
        }
        const k = nbs.size;
        const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
        const factor = k * beta;
        const tx = p[0] * (1 - factor) + sx * beta;
        const ty = p[1] * (1 - factor) + sy * beta;
        const tz = p[2] * (1 - factor) + sz * beta;
        relaxedWeldPos[w] = lerp3(p, [tx, ty, tz], weight);
      } else {
        relaxedWeldPos[w] = [p[0], p[1], p[2]];
      }
    }

    // 4. Build subdivided vertex & index buffers, splitting each triangle into 4.
    const positions: number[] = new Array(vCount * 3);
    const uvs: number[] = cur.uvs.slice(0, vCount * 2);
    while (uvs.length < vCount * 2) uvs.push(0);
    const colors: number[] | undefined = hasColors ? cur.colors!.slice(0, vCount * 4) : undefined;
    for (let i = 0; i < vCount; i += 1) {
      const rp = relaxedWeldPos[vertToWeld[i]!]!;
      positions[i * 3] = rp[0];
      positions[i * 3 + 1] = rp[1];
      positions[i * 3 + 2] = rp[2];
    }

    const midCache = new Map<string, number>();
    const getMidpoint = (i0: number, i1: number): number => {
      const key = i0 < i1 ? `${i0}:${i1}` : `${i1}:${i0}`;
      const hit = midCache.get(key);
      if (hit !== undefined) return hit;

      const w0 = vertToWeld[i0]!, w1 = vertToWeld[i1]!;
      const p0 = weldPos[w0]!, p1 = weldPos[w1]!;
      let mx = (p0[0] + p1[0]) * 0.5;
      let my = (p0[1] + p1[1]) * 0.5;
      let mz = (p0[2] + p1[2]) * 0.5;
      if (w0 !== w1) {
        const opps = wEdgeOpps.get(wEdgeKey(w0, w1));
        if (opps && opps.length === 2) {
          const o0 = weldPos[opps[0]!]!, o1 = weldPos[opps[1]!]!;
          const lx = (p0[0] + p1[0]) * 0.375 + (o0[0] + o1[0]) * 0.125;
          const ly = (p0[1] + p1[1]) * 0.375 + (o0[1] + o1[1]) * 0.125;
          const lz = (p0[2] + p1[2]) * 0.375 + (o0[2] + o1[2]) * 0.125;
          mx = mx + (lx - mx) * weight;
          my = my + (ly - my) * weight;
          mz = mz + (lz - mz) * weight;
        }
      }

      const idx = positions.length / 3;
      positions.push(mx, my, mz);
      uvs.push(
        ((cur.uvs[i0 * 2] ?? 0) + (cur.uvs[i1 * 2] ?? 0)) * 0.5,
        ((cur.uvs[i0 * 2 + 1] ?? 0) + (cur.uvs[i1 * 2 + 1] ?? 0)) * 0.5
      );
      if (colors && cur.colors) {
        const c0 = i0 * 4, c1 = i1 * 4;
        colors.push(
          (cur.colors[c0]! + cur.colors[c1]!) * 0.5,
          (cur.colors[c0 + 1]! + cur.colors[c1 + 1]!) * 0.5,
          (cur.colors[c0 + 2]! + cur.colors[c1 + 2]!) * 0.5,
          (cur.colors[c0 + 3]! + cur.colors[c1 + 3]!) * 0.5
        );
      }
      midCache.set(key, idx);
      return idx;
    };

    const indices: number[] = [];
    for (let i = 0; i < cur.indices.length; i += 3) {
      const a = cur.indices[i]!;
      const b = cur.indices[i + 1]!;
      const c = cur.indices[i + 2]!;
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      indices.push(
        a, ab, ca,
        ab, b, bc,
        ca, bc, c,
        ab, bc, ca
      );
    }

    // 5. Recompute smooth area-weighted normals across welded positions.
    const newVCount = positions.length / 3;
    const nWeldMap = new Map<string, number>();
    const nVertToWeld = new Int32Array(newVCount);
    const accumNormals: [number, number, number][] = [];
    for (let i = 0; i < newVCount; i += 1) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
      const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
      let w = nWeldMap.get(key);
      if (w === undefined) {
        w = accumNormals.length;
        nWeldMap.set(key, w);
        accumNormals.push([0, 0, 0]);
      }
      nVertToWeld[i] = w;
    }
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]! * 3, i1 = indices[i + 1]! * 3, i2 = indices[i + 2]! * 3;
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
        const acc = accumNormals[nVertToWeld[indices[i + k]!]!]!;
        acc[0] += fnx;
        acc[1] += fny;
        acc[2] += fnz;
      }
    }
    const normals = new Array<number>(newVCount * 3);
    for (let i = 0; i < newVCount; i += 1) {
      const acc = accumNormals[nVertToWeld[i]!]!;
      const nl = Math.hypot(acc[0], acc[1], acc[2]) || 1;
      normals[i * 3] = acc[0] / nl;
      normals[i * 3 + 1] = acc[1] / nl;
      normals[i * 3 + 2] = acc[2] / nl;
    }

    cur = { positions, normals, uvs, indices, ...(colors ? { colors } : {}) };
  }
  return cur;
}

/** Recomputes smooth position-welded area-weighted vertex normals on `src`. */
export function recomputeSmoothWeldedNormals(src: RawMesh): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  if (vCount === 0 || src.indices.length < 3) return src;
  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  const accumNormals: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!, y = src.positions[i * 3 + 1]!, z = src.positions[i * 3 + 2]!;
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
    const e1x = src.positions[i1]! - src.positions[i0]!;
    const e1y = src.positions[i1 + 1]! - src.positions[i0 + 1]!;
    const e1z = src.positions[i1 + 2]! - src.positions[i0 + 2]!;
    const e2x = src.positions[i2]! - src.positions[i0]!;
    const e2y = src.positions[i2 + 1]! - src.positions[i0 + 1]!;
    const e2z = src.positions[i2 + 2]! - src.positions[i0 + 2]!;
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
    positions: src.positions.slice(),
    normals,
    uvs: src.uvs.slice(),
    indices: src.indices.slice(),
    ...(src.colors ? { colors: src.colors.slice() } : {})
  };
}

/**
 * Volume-preserving Taubin (`lambda` shrink + `mu` inflate) surface fairing across welded vertices.
 * Eliminates concentric subdivision ripples, lathe ring ridges, and polygon creases without shrinking silhouettes.
 */
export function taubinSmoothMesh(
  src: RawMesh,
  iterations = 4,
  lambda = 0.48,
  mu = -0.505
): RawMesh {
  const passes = Math.max(0, Math.min(20, Math.floor(iterations)));
  const vCount = Math.floor(src.positions.length / 3);
  if (passes === 0 || vCount < 4 || src.indices.length < 3) return src;

  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  let weldPos: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!, y = src.positions[i * 3 + 1]!, z = src.positions[i * 3 + 2]!;
    const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = weldPos.length;
      weldMap.set(key, w);
      weldPos.push([x, y, z]);
    }
    vertToWeld[i] = w;
  }

  const wCount = weldPos.length;
  const edgeCounts = new Map<string, number>();
  const neighbors = Array.from({ length: wCount }, () => new Set<number>());
  const eKey = (u: number, v: number): string => (u < v ? `${u}:${v}` : `${v}:${u}`);
  for (let i = 0; i < src.indices.length; i += 3) {
    const a = vertToWeld[src.indices[i]!]!;
    const b = vertToWeld[src.indices[i + 1]!]!;
    const c = vertToWeld[src.indices[i + 2]!]!;
    if (a === b || b === c || c === a) continue;
    neighbors[a]!.add(b); neighbors[a]!.add(c);
    neighbors[b]!.add(a); neighbors[b]!.add(c);
    neighbors[c]!.add(a); neighbors[c]!.add(b);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = eKey(u, v);
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
    }
  }
  const isBoundary = new Uint8Array(wCount);
  for (const [k, cnt] of edgeCounts) {
    if (cnt === 1) {
      const sep = k.indexOf(":");
      isBoundary[Number(k.slice(0, sep))] = 1;
      isBoundary[Number(k.slice(sep + 1))] = 1;
    }
  }

  const stepLaplacian = (cur: [number, number, number][], factor: number): [number, number, number][] => {
    const next = new Array<[number, number, number]>(wCount);
    for (let w = 0; w < wCount; w += 1) {
      const p = cur[w]!;
      const nbs = neighbors[w]!;
      if (isBoundary[w] || nbs.size < 2) {
        next[w] = [p[0], p[1], p[2]];
        continue;
      }
      let sx = 0, sy = 0, sz = 0;
      for (const nb of nbs) {
        const np = cur[nb]!;
        sx += np[0]; sy += np[1]; sz += np[2];
      }
      const inv = 1 / nbs.size;
      next[w] = [
        p[0] + factor * (sx * inv - p[0]),
        p[1] + factor * (sy * inv - p[1]),
        p[2] + factor * (sz * inv - p[2])
      ];
    }
    return next;
  };

  for (let it = 0; it < passes; it += 1) {
    weldPos = stepLaplacian(weldPos, lambda);
    weldPos = stepLaplacian(weldPos, mu);
  }

  const positions = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const wp = weldPos[vertToWeld[i]!]!;
    positions[i * 3] = wp[0];
    positions[i * 3 + 1] = wp[1];
    positions[i * 3 + 2] = wp[2];
  }
  return recomputeSmoothWeldedNormals({
    positions,
    normals: src.normals,
    uvs: src.uvs,
    indices: src.indices,
    ...(src.colors ? { colors: src.colors } : {})
  });
}
