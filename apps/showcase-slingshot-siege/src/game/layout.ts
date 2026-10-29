/**
 * Slingshot Siege — pure helpers shared by the route and its unit tests:
 * pool-slot assignment, the quaternion → Euler conversion the renderer
 * expects, and the aspect-aware camera fit.
 */
import type { LevelSpec, PieceSpec } from "./levels";

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

// ------------------------------------------------------------- pool slots --

export type PoolKind = "block" | "crate" | "barrel" | "plank";

export interface PoolSizes {
  readonly blocks: number;
  readonly crates: number;
  readonly barrels: number;
  readonly planks: number;
}

export interface PoolSlot {
  readonly kind: PoolKind;
  readonly slot: number;
}

/**
 * One pooled node per piece. Every pool keeps its own counter (nodes are no
 * longer indexed by piece index). Prop pieces (crate, barrel, plank) use their
 * pool. Wood blocks alternate between the crate and plank GLB pools, so they
 * read as wood; stone, glass, ice and obsidian blocks use the stone-bridge
 * block pool. A full pool falls back to the block pool; `null` means the level
 * does not fit at all.
 */
export function assignPoolSlots(pieces: readonly Pick<PieceSpec, "visual" | "material">[], pool: PoolSizes): (PoolSlot | null)[] {
  const used: Record<PoolKind, number> = { block: 0, crate: 0, barrel: 0, plank: 0 };
  const cap: Record<PoolKind, number> = { block: pool.blocks, crate: pool.crates, barrel: pool.barrels, plank: pool.planks };
  let woodBlocks = 0;
  return pieces.map((p) => {
    let order: readonly PoolKind[];
    if (p.visual === "crate" || p.visual === "barrel" || p.visual === "plank") order = [p.visual, "block"];
    else if (p.material === "wood") order = (woodBlocks++ % 2 === 0 ? ["crate", "plank", "block"] : ["plank", "crate", "block"]);
    else order = ["block"];
    for (const kind of order) {
      if (used[kind] < cap[kind]) {
        const slot = used[kind];
        used[kind] += 1;
        return { kind, slot };
      }
    }
    return null;
  });
}

/** Largest number of block-pool nodes any level needs. */
export function maxBlockSlots(levels: readonly LevelSpec[], pool: PoolSizes): number {
  let max = 0;
  for (const level of levels) {
    const slots = assignPoolSlots(level.pieces, { ...pool, blocks: Number.MAX_SAFE_INTEGER });
    max = Math.max(max, slots.filter((s) => s?.kind === "block").length);
  }
  return max;
}

// ----------------------------------------------------------------- rotation --

/**
 * Quaternion [x,y,z,w] → Euler for the runtime handle. Node rotations are
 * composed in "ZYX" order (R = Rz·Ry·Rx, `compiler/sceneGraph.ts`), so this is
 * the matching inverse, read off the rotation matrix like the engine's own
 * `quaternionToEulerZYX`, including the gimbal-lock branch.
 */
export function quatToEulerZYX(q: Quat): [number, number, number] {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - w * z);
  const m21 = 2 * (x * y + w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const m31 = 2 * (x * z - w * y);
  const m32 = 2 * (y * z + w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(-Math.min(1, Math.max(-1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
  return [0, ey, Math.atan2(-m12, m22)];
}

/** Euler (ZYX order, R = Rz·Ry·Rx) → quaternion. Test helper and inverse of `quatToEulerZYX`. */
export function eulerZYXToQuat(e: Vec3): [number, number, number, number] {
  const [x, y, z] = e;
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 - c1 * s2 * s3,
    c1 * s2 * c3 + s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3
  ];
}

export function rotQ(q: Quat, v: Vec3): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

// ------------------------------------------------------------------ camera --

/**
 * Pull the camera back along its view line until a horizontal half-width of
 * `halfWidth` world units around the target fits the screen. Landscape poses
 * already fit, so they come back unchanged; portrait screens (aspect < 1)
 * get a longer distance instead of a fixed vertical FOV that crops the sling
 * and the fort. `exact` sets the distance both ways (closer on wide screens).
 */
export function fitHalfWidth(pos: Vec3, tgt: Vec3, fovDeg: number, aspect: number, halfWidth: number, exact = false): [number, number, number] {
  const d: [number, number, number] = [pos[0] - tgt[0], pos[1] - tgt[1], pos[2] - tgt[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const tanH = Math.tan((fovDeg * Math.PI) / 360) * Math.max(0.05, aspect);
  const need = halfWidth / tanH;
  if (!exact && need <= len) return [pos[0], pos[1], pos[2]];
  const k = need / len;
  return [tgt[0] + d[0] * k, tgt[1] + d[1] * k, tgt[2] + d[2] * k];
}

/** Rotate an eye position around the target by a yaw (about +Y) and lift it by a pitch offset. */
export function orbitAround(pos: Vec3, tgt: Vec3, yaw: number, pitch: number): [number, number, number] {
  const dx = pos[0] - tgt[0];
  const dy = pos[1] - tgt[1];
  const dz = pos[2] - tgt[2];
  const flat = Math.hypot(dx, dz);
  const dist = Math.hypot(flat, dy) || 1;
  const baseYaw = Math.atan2(dx, dz);
  const basePitch = Math.atan2(dy, flat);
  const p = Math.min(1.2, Math.max(0.02, basePitch + pitch));
  const y = baseYaw + yaw;
  const fl = Math.cos(p) * dist;
  return [tgt[0] + Math.sin(y) * fl, tgt[1] + Math.sin(p) * dist, tgt[2] + Math.cos(y) * fl];
}
