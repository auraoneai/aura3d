/**
 * Pure CPU spatial indices for picking points and instances (register gaps K-02 / K-03).
 *
 * No scene, DOM or renderer dependency: positions and instance matrices go in, rays go in, hits come out.
 *
 * Both indices share one uniform grid (counting-sort CSR layout, no per-cell allocation) and one
 * Amanatides-Woo ray walk. The grid is built lazily on the first query after construction or
 * `invalidate()`, so a buffer that is written every frame but picked rarely pays nothing per write.
 *
 * Freshness contract: JavaScript cannot observe an in-place write into a `Float32Array`, so the owner of the
 * buffer calls `invalidate()` (or `update(buffer, count)`) after writing. The scene picker also compares a cheap
 * strided fingerprint as a best-effort guard; do not rely on it for a few edited elements.
 */

export type Vec3 = readonly [number, number, number];

export interface PickRay {
  readonly origin: Vec3;
  /** Normalized internally. */
  readonly direction: Vec3;
}

/** Bounded pick tolerance around the ray: `radius + slope * t` at distance `t` along the ray. */
export interface PickTolerance {
  /** World radius at the ray origin. Default 0. */
  readonly radius?: number;
  /** World radius added per unit distance along the ray (a pixel tolerance on a perspective camera). Default 0. */
  readonly slope?: number;
}

const GRID_MAX_AXIS = 1024;
const RING_LIMIT = 3;
const SQRT3 = Math.sqrt(3);

interface GridBuild {
  readonly pointsPerCell?: number;
  readonly minCellSize?: number;
}

/** Uniform grid over `count` xyz centres stored flat in `xyz`; non-finite centres are not indexed. */
class UniformGrid {
  readonly min = new Float64Array(3);
  readonly max = new Float64Array(3);
  readonly dims = new Int32Array([1, 1, 1]);
  cell = 1;
  cellStart = new Uint32Array(2);
  items = new Uint32Array(0);
  indexed = 0;
  private stamps = new Uint32Array(0);
  private stamp = 0;

  build(xyz: ArrayLike<number>, count: number, options: GridBuild): void {
    const min = this.min, max = this.max;
    min.fill(Infinity);
    max.fill(-Infinity);
    let finite = 0;
    for (let i = 0; i < count; i += 1) {
      const x = xyz[i * 3]!, y = xyz[i * 3 + 1]!, z = xyz[i * 3 + 2]!;
      if (!Number.isFinite(x + y + z)) continue;
      finite += 1;
      if (x < min[0]!) min[0] = x; if (x > max[0]!) max[0] = x;
      if (y < min[1]!) min[1] = y; if (y > max[1]!) max[1] = y;
      if (z < min[2]!) min[2] = z; if (z > max[2]!) max[2] = z;
    }
    this.indexed = finite;
    if (finite === 0) {
      min.fill(0); max.fill(0);
      this.dims.fill(1);
      this.cell = 1;
      this.cellStart = new Uint32Array(2);
      this.items = new Uint32Array(0);
      return;
    }
    const ext = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    const maxExt = Math.max(ext[0]!, ext[1]!, ext[2]!);
    const ppc = options.pointsPerCell ?? 2;
    let cell = 1;
    if (maxExt > 0) {
      const eps = maxExt * 1e-4;
      let volume = 1, active = 0;
      for (const e of ext) if (e > eps) { volume *= e; active += 1; }
      cell = Math.pow(Math.max(volume * ppc / finite, 1e-300), 1 / Math.max(active, 1));
      cell = Math.max(cell, maxExt / GRID_MAX_AXIS, options.minCellSize ?? 0);
    }
    const cap = Math.max(64, finite * 4);
    for (;;) {
      let total = 1;
      for (let a = 0; a < 3; a += 1) {
        const d = ext[a]! > 0 ? Math.min(GRID_MAX_AXIS, Math.floor(ext[a]! / cell) + 1) : 1;
        this.dims[a] = d;
        total *= d;
      }
      if (total <= cap) break;
      cell *= 1.25;
    }
    this.cell = cell;
    const cells = this.dims[0]! * this.dims[1]! * this.dims[2]!;
    const start = new Uint32Array(cells + 1);
    const cellOf = new Uint32Array(count);
    const inv = 1 / cell;
    const nx = this.dims[0]!, ny = this.dims[1]!, nz = this.dims[2]!;
    for (let i = 0; i < count; i += 1) {
      const x = xyz[i * 3]!, y = xyz[i * 3 + 1]!, z = xyz[i * 3 + 2]!;
      if (!Number.isFinite(x + y + z)) { cellOf[i] = 0xffffffff; continue; }
      const cx = Math.min(nx - 1, Math.max(0, Math.floor((x - min[0]!) * inv)));
      const cy = Math.min(ny - 1, Math.max(0, Math.floor((y - min[1]!) * inv)));
      const cz = Math.min(nz - 1, Math.max(0, Math.floor((z - min[2]!) * inv)));
      const c = (cz * ny + cy) * nx + cx;
      cellOf[i] = c;
      start[c + 1]! += 1;
    }
    for (let c = 0; c < cells; c += 1) start[c + 1]! += start[c]!;
    const fill = start.slice(0, cells);
    const items = new Uint32Array(finite);
    for (let i = 0; i < count; i += 1) {
      const c = cellOf[i]!;
      if (c === 0xffffffff) continue;
      items[fill[c]!++] = i;
    }
    this.cellStart = start;
    this.items = items;
    if (this.stamps.length !== cells) { this.stamps = new Uint32Array(cells); this.stamp = 0; }
  }

  /**
   * Visit grid cells along the ray in increasing entry distance, each with its (2k+1)^3 neighbourhood once.
   * `visit(cell, entryT)` returns `true` to stop. Cells are the clamped neighbourhood of the cell holding the ray.
   */
  walk(o: Vec3, d: Vec3, tNear: number, tFar: number, ring: number, visit: (cell: number, entryT: number) => boolean | void, shouldStop?: (entryT: number) => boolean): void {
    if (this.indexed === 0) return;
    const { min, max, dims, cell } = this;
    const margin = ring * cell;
    let t0 = tNear, t1 = tFar;
    for (let a = 0; a < 3; a += 1) {
      const lo = min[a]! - margin, hi = max[a]! + margin + cell;
      const oa = o[a]!, da = d[a]!;
      if (Math.abs(da) < 1e-12) {
        if (oa < lo || oa > hi) return;
      } else {
        let ta = (lo - oa) / da, tb = (hi - oa) / da;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) return;
      }
    }
    if (!Number.isFinite(t1)) return;
    const ix = [0, 0, 0], step = [0, 0, 0], tMax = [Infinity, Infinity, Infinity], tDelta = [Infinity, Infinity, Infinity];
    for (let a = 0; a < 3; a += 1) {
      const p = o[a]! + d[a]! * t0;
      ix[a] = Math.floor((p - min[a]!) / cell);
      const da = d[a]!;
      if (Math.abs(da) >= 1e-12) {
        step[a] = da > 0 ? 1 : -1;
        const boundary = min[a]! + (ix[a]! + (da > 0 ? 1 : 0)) * cell;
        tMax[a] = (boundary - o[a]!) / da;
        tDelta[a] = cell / Math.abs(da);
      }
    }
    const nx = dims[0]!, ny = dims[1]!, nz = dims[2]!;
    const stamps = this.stamps;
    if (++this.stamp === 0xffffffff) { stamps.fill(0); this.stamp = 1; }
    const stampId = this.stamp;
    const limit = (nx + ny + nz + 6 * ring + 8) * 2;
    let t = t0;
    for (let iter = 0; iter < limit; iter += 1) {
      if (shouldStop !== undefined && shouldStop(t)) return;
      const xl = Math.max(0, ix[0]! - ring), xh = Math.min(nx - 1, ix[0]! + ring);
      const yl = Math.max(0, ix[1]! - ring), yh = Math.min(ny - 1, ix[1]! + ring);
      const zl = Math.max(0, ix[2]! - ring), zh = Math.min(nz - 1, ix[2]! + ring);
      for (let z = zl; z <= zh; z += 1) for (let y = yl; y <= yh; y += 1) for (let x = xl; x <= xh; x += 1) {
        const c = (z * ny + y) * nx + x;
        if (stamps[c] === stampId) continue;
        stamps[c] = stampId;
        if (visit(c, t) === true) return;
      }
      const axis = tMax[0]! <= tMax[1]! ? (tMax[0]! <= tMax[2]! ? 0 : 2) : (tMax[1]! <= tMax[2]! ? 1 : 2);
      if (tMax[axis]! > t1 || !Number.isFinite(tMax[axis]!)) return;
      t = tMax[axis]!;
      ix[axis]! += step[axis]!;
      tMax[axis]! += tDelta[axis]!;
    }
  }
}

function normalizeDirection(d: Vec3): Vec3 | undefined {
  const l = Math.hypot(d[0], d[1], d[2]);
  return l > 0 && Number.isFinite(l) ? [d[0] / l, d[1] / l, d[2] / l] : undefined;
}

// ── Points ────────────────────────────────────────────────────────────────

export interface PointPickOptions extends PickTolerance {
  /** Ignore points closer than this along the ray. Default 0. */
  readonly near?: number;
  /** Ignore points farther than this along the ray. Default infinity. */
  readonly far?: number;
  /**
   * `"ray"` (default): the point with the smallest tolerance-normalized distance from the ray (the one the cursor
   * is visually closest to). `"depth"`: the point nearest the viewer among all inside the tolerance.
   */
  readonly rank?: "ray" | "depth";
}

export interface PointPickHit {
  /** Index into the position array (point number). */
  readonly index: number;
  /** The point's position in the index's space. */
  readonly point: Vec3;
  /** Distance along the (normalized) ray to the point's closest approach. */
  readonly distance: number;
  /** Perpendicular distance from the point to the ray. */
  readonly rayDistance: number;
}

export interface PointCloudIndexOptions {
  /** Target average points per grid cell. Default 2. */
  readonly pointsPerCell?: number;
  /** Lower bound for the cell edge, in position units. */
  readonly minCellSize?: number;
}

/** Lazy uniform-grid index over a flat `xyz` position array. */
export class PointCloudIndex {
  private grid = new UniformGrid();
  private built = false;
  private positionsRef: ArrayLike<number>;
  private countValue: number;
  private versionValue = 0;
  private builds = 0;

  constructor(positions: ArrayLike<number>, count: number = Math.floor(positions.length / 3), private readonly options: PointCloudIndexOptions = {}) {
    this.positionsRef = positions;
    this.countValue = Math.max(0, Math.min(count, Math.floor(positions.length / 3)));
  }

  get count(): number { return this.countValue; }
  /** Incremented on every invalidation. */
  get version(): number { return this.versionValue; }
  /** How many times the grid has been (re)built; a counter for tests and benchmarks. */
  get buildCount(): number { return this.builds; }
  get isBuilt(): boolean { return this.built; }

  /** Mark the grid stale after the position buffer was written; the next query rebuilds it. */
  invalidate(): void {
    this.built = false;
    this.versionValue += 1;
  }

  /** Point the index at a (possibly new) buffer and/or count and invalidate. */
  update(positions: ArrayLike<number> = this.positionsRef, count: number = Math.floor(positions.length / 3)): void {
    this.positionsRef = positions;
    this.countValue = Math.max(0, Math.min(count, Math.floor(positions.length / 3)));
    this.invalidate();
  }

  /** Build now (otherwise built on the first query). */
  ensureBuilt(): void {
    if (this.built) return;
    this.grid.build(this.positionsRef, this.countValue, this.options);
    this.built = true;
    this.builds += 1;
  }

  /** Nearest point to the ray inside the tolerance, or `undefined`. */
  pick(ray: PickRay, options: PointPickOptions = {}): PointPickHit | undefined {
    const d = normalizeDirection(ray.direction);
    if (!d || !Number.isFinite(ray.origin[0] + ray.origin[1] + ray.origin[2])) return undefined;
    if (this.countValue === 0) return undefined;
    this.ensureBuilt();
    const grid = this.grid;
    const o = ray.origin;
    const tNear = Math.max(0, options.near ?? 0);
    const tFarOpt = options.far ?? Infinity;
    const radius = Math.max(0, options.radius ?? 0), slope = Math.max(0, options.slope ?? 0);
    const depthRank = options.rank === "depth";
    const pos = this.positionsRef;
    let best = -1, bestScore = Infinity, bestT = 0, bestPerp = 0;

    const test = (i: number): void => {
      const px = pos[i * 3]!, py = pos[i * 3 + 1]!, pz = pos[i * 3 + 2]!;
      const vx = px - o[0], vy = py - o[1], vz = pz - o[2];
      const t = vx * d[0] + vy * d[1] + vz * d[2];
      if (t < tNear || t > tFarOpt || t !== t) return;
      const ex = vx - t * d[0], ey = vy - t * d[1], ez = vz - t * d[2];
      const perp = Math.sqrt(ex * ex + ey * ey + ez * ez);
      const allowed = radius + slope * t;
      if (!(perp <= allowed)) return;
      const score = depthRank ? t : (allowed > 0 ? perp / allowed : perp);
      if (score < bestScore || (score === bestScore && i < best)) { best = i; bestScore = score; bestT = t; bestPerp = perp; }
    };

    // Largest tolerance inside the clipped walk bounds decides the neighbourhood ring.
    const farBound = Math.min(tFarOpt, this.farBound(o));
    const rMax = radius + slope * farBound;
    const ring = Math.ceil(rMax / grid.cell);
    if (!Number.isFinite(rMax) || ring > RING_LIMIT || grid.indexed === 0) {
      // Tolerance too wide for a bounded neighbourhood: a linear scan is the correct fallback.
      for (let i = 0; i < this.countValue; i += 1) if (Number.isFinite(pos[i * 3]! + pos[i * 3 + 1]! + pos[i * 3 + 2]!)) test(i);
    } else {
      const { cellStart, items } = grid;
      const reach = (ring + 0.5) * grid.cell * SQRT3;
      grid.walk(o, d, tNear, farBound, ring, (cell) => {
        for (let k = cellStart[cell]!; k < cellStart[cell + 1]!; k += 1) test(items[k]!);
      }, depthRank ? (entryT) => best >= 0 && entryT - reach > bestT : undefined);
    }
    if (best < 0) return undefined;
    return { index: best, point: [pos[best * 3]!, pos[best * 3 + 1]!, pos[best * 3 + 2]!], distance: bestT, rayDistance: bestPerp };
  }

  /** Farthest ray parameter that can matter: distance to the grid centre plus the grid diagonal. */
  private farBound(o: Vec3): number {
    const g = this.grid;
    const diag = Math.hypot(g.max[0]! - g.min[0]!, g.max[1]! - g.min[1]!, g.max[2]! - g.min[2]!);
    return Math.hypot((g.min[0]! + g.max[0]!) / 2 - o[0], (g.min[1]! + g.max[1]!) / 2 - o[1], (g.min[2]! + g.max[2]!) / 2 - o[2]) + diag;
  }
}

// ── Instances ─────────────────────────────────────────────────────────────

/** Local-space bounds of the instanced geometry. Give `min`/`max` for exact box hits, or `radius` for spheres. */
export interface InstanceLocalBounds {
  readonly min?: Vec3;
  readonly max?: Vec3;
  /** Local bounding-sphere centre; defaults to the box centre or the origin. */
  readonly center?: Vec3;
  /** Local bounding-sphere radius; defaults to the box half-diagonal. */
  readonly radius?: number;
}

export interface InstancePickOptions {
  readonly near?: number;
  readonly far?: number;
  /** `"box"` (default when local `min`/`max` exist) tests the transformed local box; `"sphere"` the bounding sphere. */
  readonly shape?: "box" | "sphere";
}

export interface InstancePickHit {
  readonly instanceId: number;
  readonly point: Vec3;
  /** Surface normal for box hits; the direction from the sphere centre for sphere hits. */
  readonly normal: Vec3;
  readonly distance: number;
}

export interface InstanceIndexOptions {
  readonly pointsPerCell?: number;
}

/** Lazy uniform-grid index over per-instance bounding spheres built from column-major 4x4 instance matrices. */
export class InstanceIndex {
  private grid = new UniformGrid();
  private built = false;
  private matricesRef: ArrayLike<number>;
  private countValue: number;
  private spheres = new Float64Array(0);
  private centres = new Float32Array(0);
  private maxRadius = 0;
  private versionValue = 0;
  private builds = 0;
  private readonly bounds: Required<Pick<InstanceLocalBounds, "radius">> & { center: Vec3; min: Vec3 | undefined; max: Vec3 | undefined };

  constructor(matrices: ArrayLike<number>, count: number = Math.floor(matrices.length / 16), localBounds: InstanceLocalBounds = {}, private readonly options: InstanceIndexOptions = {}) {
    this.matricesRef = matrices;
    this.countValue = Math.max(0, Math.min(count, Math.floor(matrices.length / 16)));
    const { min, max } = localBounds;
    const center: Vec3 = localBounds.center ?? (min && max ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] : [0, 0, 0]);
    const radius = localBounds.radius ?? (min && max ? Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 : 0.5);
    this.bounds = { center, radius, min, max };
  }

  get count(): number { return this.countValue; }
  get version(): number { return this.versionValue; }
  get buildCount(): number { return this.builds; }
  get isBuilt(): boolean { return this.built; }

  invalidate(): void { this.built = false; this.versionValue += 1; }

  update(matrices: ArrayLike<number> = this.matricesRef, count: number = Math.floor(matrices.length / 16)): void {
    this.matricesRef = matrices;
    this.countValue = Math.max(0, Math.min(count, Math.floor(matrices.length / 16)));
    this.invalidate();
  }

  ensureBuilt(): void {
    if (this.built) return;
    const n = this.countValue, m = this.matricesRef, { center, radius } = this.bounds;
    if (this.spheres.length < n * 4) { this.spheres = new Float64Array(n * 4); this.centres = new Float32Array(n * 3); }
    let maxR = 0;
    for (let i = 0; i < n; i += 1) {
      const b = i * 16;
      const cx = m[b]! * center[0] + m[b + 4]! * center[1] + m[b + 8]! * center[2] + m[b + 12]!;
      const cy = m[b + 1]! * center[0] + m[b + 5]! * center[1] + m[b + 9]! * center[2] + m[b + 13]!;
      const cz = m[b + 2]! * center[0] + m[b + 6]! * center[1] + m[b + 10]! * center[2] + m[b + 14]!;
      const scale = Math.max(Math.hypot(m[b]!, m[b + 1]!, m[b + 2]!), Math.hypot(m[b + 4]!, m[b + 5]!, m[b + 6]!), Math.hypot(m[b + 8]!, m[b + 9]!, m[b + 10]!));
      const r = radius * scale;
      this.spheres[i * 4] = cx; this.spheres[i * 4 + 1] = cy; this.spheres[i * 4 + 2] = cz; this.spheres[i * 4 + 3] = r;
      this.centres[i * 3] = cx; this.centres[i * 3 + 1] = cy; this.centres[i * 3 + 2] = cz;
      if (Number.isFinite(r) && r > maxR) maxR = r;
    }
    this.maxRadius = maxR;
    this.grid.build(this.centres, n, { pointsPerCell: this.options.pointsPerCell ?? 2, minCellSize: Math.max(2 * maxR, 1e-9) });
    this.built = true;
    this.builds += 1;
  }

  /** Nearest instance hit by the ray, or `undefined`. */
  pick(ray: PickRay, options: InstancePickOptions = {}): InstancePickHit | undefined {
    const d = normalizeDirection(ray.direction);
    if (!d || this.countValue === 0) return undefined;
    this.ensureBuilt();
    const grid = this.grid, o = ray.origin, sp = this.spheres, m = this.matricesRef;
    const tNear = Math.max(0, options.near ?? 0), tFarOpt = options.far ?? Infinity;
    const useBox = (options.shape ?? "box") === "box" && this.bounds.min !== undefined && this.bounds.max !== undefined;
    const g = grid;
    // Bound the walk by the far side of the grid plus the largest radius.
    const diag = Math.hypot(g.max[0]! - g.min[0]!, g.max[1]! - g.min[1]!, g.max[2]! - g.min[2]!) + 2 * this.maxRadius;
    const toCentre = Math.hypot((g.min[0]! + g.max[0]!) / 2 - o[0], (g.min[1]! + g.max[1]!) / 2 - o[1], (g.min[2]! + g.max[2]!) / 2 - o[2]);
    const tFar = Math.min(tFarOpt, toCentre + diag);
    const ring = Math.max(1, Math.ceil(this.maxRadius / grid.cell));
    let best = -1, bestT = Infinity, bestN: Vec3 = [0, 0, 0];
    const reach = (ring + 0.5) * grid.cell * SQRT3 + this.maxRadius;

    const test = (i: number): void => {
      const cx = sp[i * 4]!, cy = sp[i * 4 + 1]!, cz = sp[i * 4 + 2]!, r = sp[i * 4 + 3]!;
      if (!(r >= 0)) return;
      const vx = cx - o[0], vy = cy - o[1], vz = cz - o[2];
      const tc = vx * d[0] + vy * d[1] + vz * d[2];
      const c2 = vx * vx + vy * vy + vz * vz;
      const perp2 = c2 - tc * tc;
      if (perp2 > r * r) return;
      if (tc + r < tNear || tc - r > tFar) return;
      if (!useBox) {
        const half = Math.sqrt(Math.max(0, r * r - perp2));
        let t = tc - half;
        if (t < tNear) t = tc + half;
        if (t < tNear || t > tFar) return;
        if (t < bestT || (t === bestT && i < best)) {
          best = i; bestT = t;
          const px = o[0] + d[0] * t - cx, py = o[1] + d[1] * t - cy, pz = o[2] + d[2] * t - cz;
          const l = Math.hypot(px, py, pz) || 1;
          bestN = [px / l, py / l, pz / l];
        }
        return;
      }
      const hit = rayLocalBox(m, i * 16, o, d, this.bounds.min!, this.bounds.max!, tNear, tFar);
      if (hit && (hit.t < bestT || (hit.t === bestT && i < best))) { best = i; bestT = hit.t; bestN = hit.normal; }
    };

    grid.walk(o, d, tNear, tFar, ring, (cell) => {
      for (let k = grid.cellStart[cell]!; k < grid.cellStart[cell + 1]!; k += 1) test(grid.items[k]!);
    }, (entryT) => best >= 0 && entryT - reach > bestT);
    if (best < 0) return undefined;
    return { instanceId: best, point: [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT], normal: bestN, distance: bestT };
  }
}

/**
 * Rows of the inverse of the upper-left 3x3 of the column-major matrix at `m[base..]`
 * (`[r00, r01, r02, r10, ...]`, row r maps a world vector to local coordinate r); undefined when singular.
 */
export function inverseLinear3(m: ArrayLike<number>, base = 0): readonly number[] | undefined {
  const a = m[base]!, b = m[base + 1]!, c = m[base + 2]!, e = m[base + 4]!, f = m[base + 5]!, g = m[base + 6]!, h = m[base + 8]!, i = m[base + 9]!, j = m[base + 10]!;
  const c00 = f * j - i * g, c01 = i * c - b * j, c02 = b * g - f * c;
  const det = a * c00 + e * c01 + h * c02;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-30) return undefined;
  const id = 1 / det;
  return [c00 * id, (h * g - e * j) * id, (e * i - h * f) * id, c01 * id, (a * j - h * c) * id, (h * b - a * i) * id, c02 * id, (e * c - a * g) * id, (a * f - e * b) * id];
}

/** Ray vs a local-space AABB under an affine column-major matrix at `m[base..base+16]`. */
function rayLocalBox(m: ArrayLike<number>, base: number, o: Vec3, d: Vec3, min: Vec3, max: Vec3, tNear: number, tFar: number): { t: number; normal: Vec3 } | undefined {
  const inv = inverseLinear3(m, base);
  if (!inv) return undefined;
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = inv as unknown as number[] & { length: 9 };
  const wx = o[0] - m[base + 12]!, wy = o[1] - m[base + 13]!, wz = o[2] - m[base + 14]!;
  const lo: [number, number, number] = [r00 * wx + r01 * wy + r02 * wz, r10 * wx + r11 * wy + r12 * wz, r20 * wx + r21 * wy + r22 * wz];
  const ld: [number, number, number] = [r00 * d[0] + r01 * d[1] + r02 * d[2], r10 * d[0] + r11 * d[1] + r12 * d[2], r20 * d[0] + r21 * d[1] + r22 * d[2]];
  let t0 = tNear, t1 = tFar, axisIn = -1, signIn = 0;
  for (let ax = 0; ax < 3; ax += 1) {
    const da = ld[ax]!, oa = lo[ax]!;
    if (Math.abs(da) < 1e-14) {
      if (oa < min[ax]! || oa > max[ax]!) return undefined;
      continue;
    }
    let ta = (min[ax]! - oa) / da, tb = (max[ax]! - oa) / da, sgn = -1;
    if (ta > tb) { const s = ta; ta = tb; tb = s; sgn = 1; }
    if (ta > t0) { t0 = ta; axisIn = ax; signIn = sgn; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return undefined;
  }
  // Local normal -> world normal (inverse transpose): n_w = inv^T n_l.
  let n: [number, number, number] = [0, 0, 0];
  if (axisIn >= 0) {
    const rows = [[r00, r01, r02], [r10, r11, r12], [r20, r21, r22]];
    n = [rows[axisIn]![0]! * signIn, rows[axisIn]![1]! * signIn, rows[axisIn]![2]! * signIn];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
  } else {
    n = [-d[0], -d[1], -d[2]];
  }
  return { t: t0, normal: n };
}

// ── Tolerance helper ──────────────────────────────────────────────────────

/**
 * Convert a screen-space pixel tolerance into a world {@link PickTolerance} for a ray built from a camera.
 * `ray` and `ray1` are the unit-direction rays for two NDC positions one pixel apart (vertically); the origin
 * separation gives the orthographic part and the direction separation the perspective part.
 */
export function pixelTolerance(ray: PickRay, ray1: PickRay, pixelRadius: number): Required<PickTolerance> {
  const a = normalizeDirection(ray.direction), b = normalizeDirection(ray1.direction);
  if (!a || !b || !(pixelRadius > 0)) return { radius: 0, slope: 0 };
  const slope = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * pixelRadius;
  const radius = Math.hypot(ray.origin[0] - ray1.origin[0], ray.origin[1] - ray1.origin[1], ray.origin[2] - ray1.origin[2]) * pixelRadius;
  return { radius, slope };
}
