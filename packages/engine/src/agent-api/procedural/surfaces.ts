import { finishGeometry, normalize3 } from "./finish.js";
import { assertFinite, assertInt, newBuffers, type ProceduralColor, type ProceduralGeometry, type ProceduralVec3 } from "./types.js";

export interface ParametricSurfaceOptions {
  /** Maps (u, v), both in [0, 1], to a point. Must be deterministic. */
  readonly fn: (u: number, v: number) => ProceduralVec3;
  readonly uSegments?: number;
  readonly vSegments?: number;
  /** u = 0 and u = 1 are the same curve (tubes, spheres). Normals are continuous across the seam. */
  readonly wrapU?: boolean;
  /** v = 0 and v = 1 are the same curve (tori). */
  readonly wrapV?: boolean;
  /** Reverse the facing. The default faces along du x dv. */
  readonly flip?: boolean;
}

/**
 * Parametric surface (three.js ParametricGeometry equivalent): a (u, v) grid with analytic-quality normals from
 * central differences of `fn`, pole-safe, with grid UVs. Combine with seeded noise for rocks, blobs and organic shells.
 */
export function parametricSurface(options: ParametricSurfaceOptions): ProceduralGeometry {
  const us = options.uSegments ?? 32, vs = options.vSegments ?? 32;
  assertInt(us, "uSegments", 1); assertInt(vs, "vSegments", 1);
  const { fn } = options;
  const h = 1e-3;
  const eval3 = (u: number, v: number): ProceduralVec3 => {
    const p = fn(u, v);
    if (!(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]))) throw new RangeError("procedural: parametric fn returned a non-finite point");
    return p;
  };
  const wrap = (x: number): number => ((x % 1) + 1) % 1;
  const normalAt = (u: number, v: number): [number, number, number] => {
    for (const nudge of [0, 4, 16]) {
      const eps = h * (nudge === 0 ? 1 : nudge);
      // Move away from the exact seam/pole so degenerate derivatives resolve.
      const uu = nudge === 0 ? u : Math.min(1 - eps, Math.max(eps, u)), vv = nudge === 0 ? v : Math.min(1 - eps, Math.max(eps, v));
      const ua = options.wrapU ? wrap(uu - eps) : Math.max(0, uu - eps), ub = options.wrapU ? wrap(uu + eps) : Math.min(1, uu + eps);
      const va = options.wrapV ? wrap(vv - eps) : Math.max(0, vv - eps), vb = options.wrapV ? wrap(vv + eps) : Math.min(1, vv + eps);
      const pu0 = eval3(ua, vv), pu1 = eval3(ub, vv), pv0 = eval3(uu, va), pv1 = eval3(uu, vb);
      const du = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]], dv = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
      const nx = du[1]! * dv[2]! - du[2]! * dv[1]!, ny = du[2]! * dv[0]! - du[0]! * dv[2]!, nz = du[0]! * dv[1]! - du[1]! * dv[0]!;
      if (Math.hypot(nx, ny, nz) > 1e-14) {
        const n = normalize3(nx, ny, nz);
        return options.flip ? [-n[0], -n[1], -n[2]] : n;
      }
    }
    return [0, 1, 0];
  };
  const b = newBuffers();
  const row = us + 1;
  const pos: ProceduralVec3[] = [];
  for (let j = 0; j <= vs; j += 1) {
    for (let i = 0; i <= us; i += 1) {
      const u = i / us, v = j / vs;
      const p = eval3(u, v);
      pos.push(p);
      b.positions.push(p[0], p[1], p[2]);
      b.normals.push(...normalAt(u, v));
      b.uvs.push(u, v);
    }
  }
  const area2 = (a: number, c: number, d: number): number => {
    const p = pos[a]!, q = pos[c]!, r = pos[d]!;
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  const tri = (a: number, c: number, d: number): void => {
    if (area2(a, c, d) <= 1e-18) return; // pole collapse
    if (options.flip) b.indices.push(a, d, c); else b.indices.push(a, c, d);
  };
  for (let j = 0; j < vs; j += 1) {
    for (let i = 0; i < us; i += 1) {
      const v00 = j * row + i, v10 = v00 + 1, v01 = v00 + row, v11 = v01 + 1;
      tri(v00, v10, v01);
      tri(v10, v11, v01);
    }
  }
  return finishGeometry(b);
}

export interface HeightfieldOptions {
  /** Height in world units at world (x, z). Called for every vertex and for the normal stencil. Must be deterministic. */
  readonly heightAt: (x: number, z: number) => number;
  /** Extent in x and z (centred on the origin). A number means a square. Default 32. */
  readonly size?: number | readonly [number, number];
  /** Quads along x and z. A number means square. Default 96. */
  readonly segments?: number | readonly [number, number];
  /** Per-vertex RGBA from position, height and slope (0 flat, 1 vertical). Adds a colors attribute. */
  readonly colorAt?: (x: number, z: number, height: number, slope: number) => ProceduralColor;
  /** Close the terrain into a watertight solid slab: skirt walls down to this y plus a bottom face. Must be below every height. */
  readonly base?: number;
  /** RGBA of the skirt walls and bottom when `base` and `colorAt` are set. Default a dark earth tone. */
  readonly skirtColor?: ProceduralColor;
  /** UV repeats across the whole terrain. Default 1. */
  readonly uvRepeat?: number;
}

/**
 * Heightfield mesh from a height function: shared vertices, slope-aware normals from central differences of
 * `heightAt` (seamless across tiles), optional per-vertex colour by height/slope and an optional solid slab skirt.
 * Pair `heightAt` with `createFbm2D(seed)` for deterministic terrain.
 */
export function heightfieldGeometry(options: HeightfieldOptions): ProceduralGeometry {
  const size = options.size ?? 32;
  const [w, d] = typeof size === "number" ? [size, size] : size;
  const seg = options.segments ?? 96;
  const [nx, nz] = typeof seg === "number" ? [seg, seg] : seg;
  assertFinite(w, "size.x"); assertFinite(d, "size.z");
  if (!(w > 0 && d > 0)) throw new RangeError("procedural: heightfield size must be positive");
  assertInt(nx, "segments.x", 1); assertInt(nz, "segments.z", 1);
  const repeat = options.uvRepeat ?? 1;
  const { heightAt, colorAt } = options;
  const e = Math.min(w / nx, d / nz) * 0.5;
  const b = newBuffers();
  const colors: number[] = [];
  const W = nx + 1;
  const hs: number[] = [];
  let minH = Infinity;
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      const x = (i / nx - 0.5) * w, z = (j / nz - 0.5) * d;
      const y = heightAt(x, z);
      assertFinite(y, "heightAt result");
      hs.push(y);
      minH = Math.min(minH, y);
      const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      const n = normalize3(-gx, 1, -gz);
      b.positions.push(x, y, z);
      b.normals.push(n[0], n[1], n[2]);
      b.uvs.push((i / nx) * repeat, (j / nz) * repeat);
      if (colorAt) colors.push(...colorAt(x, z, y, 1 - n[1]));
    }
  }
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const v = j * W + i;
      b.indices.push(v, v + W, v + 1, v + 1, v + W, v + W + 1);
    }
  }
  if (options.base !== undefined) {
    const base = options.base;
    assertFinite(base, "base");
    if (!(base < minH)) throw new RangeError(`procedural: heightfield base (${base}) must be below the lowest height (${minH})`);
    const skirt = options.skirtColor ?? [0.24, 0.19, 0.15, 1];
    const wall = (ids: number[], n: ProceduralVec3): void => {
      for (let q = 0; q < ids.length - 1; q += 1) {
        const p = ids[q]!, r = ids[q + 1]!;
        const at = b.positions.length / 3;
        for (const id of [p, r]) {
          const x = b.positions[id * 3]!, y = b.positions[id * 3 + 1]!, z = b.positions[id * 3 + 2]!;
          b.positions.push(x, base, z, x, y, z);
          b.normals.push(n[0], n[1], n[2], n[0], n[1], n[2]);
          b.uvs.push((x / w + 0.5) * repeat, 0, (x / w + 0.5) * repeat, (y - base) / w);
          if (colorAt) colors.push(...skirt, ...skirt);
        }
        // vertices: p_bot, p_top, r_bot, r_top
        b.indices.push(at, at + 2, at + 1, at + 2, at + 3, at + 1);
      }
    };
    const range = (n: number): number[] => Array.from({ length: n + 1 }, (_, k) => k);
    wall(range(nx).reverse().map((i) => i), [0, 0, -1]);            // minZ, x descending
    wall(range(nx).map((i) => nz * W + i), [0, 0, 1]);              // maxZ, x ascending
    wall(range(nz).map((j) => j * W), [-1, 0, 0]);                  // minX, z ascending
    wall(range(nz).reverse().map((j) => j * W + nx), [1, 0, 0]);    // maxX, z descending
    // Bottom face: a fan from the centre over the same perimeter vertices the walls use (no T-junctions).
    const perimeter: Array<[number, number]> = [];
    for (let j = 0; j < nz; j += 1) perimeter.push([w / 2, (j / nz - 0.5) * d]);
    for (let i = nx; i > 0; i -= 1) perimeter.push([(i / nx - 0.5) * w, d / 2]);
    for (let j = nz; j > 0; j -= 1) perimeter.push([-w / 2, (j / nz - 0.5) * d]);
    for (let i = 0; i < nx; i += 1) perimeter.push([(i / nx - 0.5) * w, -d / 2]);
    const at = b.positions.length / 3;
    b.positions.push(0, base, 0);
    b.normals.push(0, -1, 0);
    b.uvs.push(0.5, 0.5);
    if (colorAt) colors.push(...skirt);
    for (const [x, z] of perimeter) {
      b.positions.push(x, base, z);
      b.normals.push(0, -1, 0);
      b.uvs.push(x / w + 0.5, z / d + 0.5);
      if (colorAt) colors.push(...skirt);
    }
    for (let k = 0; k < perimeter.length; k += 1) b.indices.push(at, at + 1 + k, at + 1 + ((k + 1) % perimeter.length));
  }
  return finishGeometry(b, colorAt ? { colors } : {});
}
