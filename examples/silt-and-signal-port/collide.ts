/**
 * Collision resolution, equation for equation from the original's `hS`, `uS`, `ss` and `Bx`
 * (tests/fixtures/crayon/silt-and-signal: re-capture the bundle to read them): a rider is a column of
 * `offsets` along its heading, pushed out of round or box colliders in up to six passes per sub-step, with the
 * move split into sub-steps of at most 0.8 m.
 */
export interface Collider {
  x: number;
  z: number;
  r: number;
  bottom: number;
  top: number;
  /** box colliders carry half extents; round ones do not */
  halfX?: number;
  halfZ?: number;
}

export interface Push { x: number; z: number }
export interface CollideOptions { radius?: number; halfHeight?: number; offsets?: readonly number[]; yaw?: number; passes?: number }

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const SPATIAL_CELL_Z = 64;
const EMPTY_BUCKET = new Int32Array(0);
interface SpatialZIndex {
  readonly cells: Map<number, Int32Array>;
}
const colliderZCache = new WeakMap<readonly Collider[], SpatialZIndex>();

function getColliderZIndex(colliders: readonly Collider[]): SpatialZIndex {
  let cached = colliderZCache.get(colliders);
  if (cached) return cached;
  const builders = new Map<number, number[]>();
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i]!;
    const extZ = c.halfZ !== undefined ? c.halfZ : c.r;
    const c0 = Math.floor((c.z - extZ) / SPATIAL_CELL_Z);
    const c1 = Math.floor((c.z + extZ) / SPATIAL_CELL_Z);
    for (let cell = c0; cell <= c1; cell++) {
      let list = builders.get(cell);
      if (!list) builders.set(cell, (list = []));
      list.push(i);
    }
  }
  const cells = new Map<number, Int32Array>();
  for (const [cell, list] of builders) cells.set(cell, Int32Array.from(list));
  cached = { cells };
  colliderZCache.set(colliders, cached);
  return cached;
}

/** Visits colliders overlapping `[zMin, zMax]` in exact ascending array order without per-call allocations. */
export function visitCollidersInZBand(
  colliders: readonly Collider[],
  zMin: number,
  zMax: number,
  visit: (c: Collider) => boolean | void
): boolean {
  if (colliders.length < 32 || !Number.isFinite(zMin) || !Number.isFinite(zMax)) {
    for (let i = 0; i < colliders.length; i++) {
      if (visit(colliders[i]!) === true) return true;
    }
    return false;
  }
  const { cells } = getColliderZIndex(colliders);
  const c0 = Math.floor(zMin / SPATIAL_CELL_Z);
  const c1 = Math.floor(zMax / SPATIAL_CELL_Z);
  if (c0 === c1) {
    const bucket = cells.get(c0);
    if (!bucket) return false;
    for (let k = 0; k < bucket.length; k++) {
      if (visit(colliders[bucket[k]!]!) === true) return true;
    }
    return false;
  }
  if (c1 === c0 + 1) {
    const a = cells.get(c0) ?? EMPTY_BUCKET;
    const b = cells.get(c1) ?? EMPTY_BUCKET;
    let ia = 0;
    let ib = 0;
    while (ia < a.length && ib < b.length) {
      const idxA = a[ia]!;
      const idxB = b[ib]!;
      if (idxA < idxB) {
        ia++;
        if (visit(colliders[idxA]!) === true) return true;
      } else if (idxB < idxA) {
        ib++;
        if (visit(colliders[idxB]!) === true) return true;
      } else {
        ia++;
        ib++;
        if (visit(colliders[idxA]!) === true) return true;
      }
    }
    while (ia < a.length) {
      if (visit(colliders[a[ia++]!]!) === true) return true;
    }
    while (ib < b.length) {
      if (visit(colliders[b[ib++]!]!) === true) return true;
    }
    return false;
  }
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i]!;
    const extZ = c.halfZ !== undefined ? c.halfZ : c.r;
    if (c.z + extZ < zMin || c.z - extZ > zMax) continue;
    if (visit(c) === true) return true;
  }
  return false;
}

/** Push that moves a column (`p`, vertical half extent `halfHeight`, radius `radius`) out of `c`, or null when clear (original `uS`). */
export function pushOut(p: { x: number; y: number; z: number }, c: Collider, radius: number, halfHeight: number): Push | null {
  if (p.y + halfHeight < c.bottom || p.y - halfHeight > c.top) return null;
  let dx = p.x - c.x;
  let dz = p.z - c.z;
  if (c.halfX !== undefined && c.halfZ !== undefined) {
    const nx = clamp(dx, -c.halfX, c.halfX);
    const nz = clamp(dz, -c.halfZ, c.halfZ);
    const ox = dx - nx;
    const oz = dz - nz;
    const d = Math.hypot(ox, oz);
    if (d >= radius) return null;
    if (d > 1e-5) return { x: (ox / d) * (radius - d + 0.002), z: (oz / d) * (radius - d + 0.002) };
    const fx = c.halfX - Math.abs(dx);
    const fz = c.halfZ - Math.abs(dz);
    return fx < fz ? { x: (Math.sign(dx) || 1) * (fx + radius + 0.002), z: 0 } : { x: 0, z: (Math.sign(dz) || 1) * (fz + radius + 0.002) };
  }
  const o = Math.hypot(dx, dz);
  const a = c.r + radius;
  if (o >= a) return null;
  if (o < 1e-5) { dx = 0; dz = 1; }
  return { x: (dx / (o || 1)) * (a - o + 0.002), z: (dz / (o || 1)) * (a - o + 0.002) };
}

/** One resolution pass set at the current position; returns the number of pushes applied (original `ss`). */
export function resolve(pos: { x: number; y: number; z: number }, colliders: readonly Collider[], opts: CollideOptions = {}): number {
  const radius = opts.radius ?? 1.8, halfHeight = opts.halfHeight ?? 1, offsets = opts.offsets ?? [0], yaw = opts.yaw ?? 0, passes = opts.passes ?? 6;
  let hits = 0;
  for (let pass = 0; pass < passes; pass++) {
    let touched = false;
    for (const off of offsets) {
      const probe = { x: pos.x + Math.sin(yaw) * off, y: pos.y, z: pos.z + Math.cos(yaw) * off };
      const pad = radius + 4;
      visitCollidersInZBand(colliders, probe.z - pad, probe.z + pad, (c) => {
        const push = pushOut(probe, c, radius, halfHeight);
        if (push) {
          pos.x += push.x;
          pos.z += push.z;
          probe.x += push.x;
          probe.z += push.z;
          touched = true;
          hits++;
        }
      });
    }
    if (!touched) break;
  }
  return hits;
}

/** Sweep from `from` to the position already stored in `pos` in sub-steps of at most 0.8 m (original `Bx`). */
export function sweep(pos: { x: number; y: number; z: number }, from: { x: number; z: number }, colliders: readonly Collider[], opts: CollideOptions = {}): number {
  const dx = pos.x - from.x, dz = pos.z - from.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.8));
  pos.x = from.x;
  pos.z = from.z;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    pos.x += dx / n;
    pos.z += dz / n;
    hits += resolve(pos, colliders, opts);
  }
  return hits;
}
