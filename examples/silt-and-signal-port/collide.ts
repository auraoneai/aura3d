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
      for (const c of colliders) {
        const push = pushOut(probe, c, radius, halfHeight);
        if (push) { pos.x += push.x; pos.z += push.z; probe.x += push.x; probe.z += push.z; touched = true; hits++; }
      }
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
