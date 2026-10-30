/**
 * GU47 WP-11 TT-AN1 / TT-A4 (partial): the World Tour crowd on the E-H crowd kit (`createCrowd`).
 *
 * 240 seated spectators on the existing bleacher tiers, drawn as two instanced crowds (2 draws): bodies (shirt colour per
 * seat) and heads (skin tone per seat; dark hair on the back and top, face in front, so the head's yaw reads at the
 * broadcast distance). The heads turn toward the ball with a per-seat lag of 80-200 ms (first-order follow, clamped to a
 * neck range around the body's facing) and the crowd stands on a cheer. The pose meshes are procedural stand-ins built
 * here; the four WP-36 seated humanoids replace `SPECTATOR_BODY_POSES` (`loadCrowdPoses(asset, { poses })`) without
 * touching the follow logic (lane report: asset needs). Presentation only: reads the ball position, writes nothing back.
 */
import { createCrowd, material, type AuraCrowd, type AuraCrowdTarget, type AuraCustomGeometrySpec } from "@aura3d/engine";

export const CROWD_IDS = { bodies: "crowd-bodies", heads: "crowd-heads" } as const;

/** Seat rows on the existing bleacher tiers (view/spectators.ts boxes): rear tiers 1-2 and both side stands. */
interface SeatRow { readonly count: number; readonly from: readonly [number, number, number]; readonly to: readonly [number, number, number]; readonly yaw: number }
const SEAT_ROWS: readonly SeatRow[] = [
  // Rear tier 1 (top 0.9 m) and tier 2 (top 1.65 m, two rows), facing the court (+Z, yaw 0).
  { count: 32, from: [-8.85, 0.9, -12.25], to: [8.85, 0.9, -12.25], yaw: 0 },
  { count: 32, from: [-9.3, 1.65, -13.3], to: [9.3, 1.65, -13.3], yaw: 0 },
  { count: 32, from: [-9.3, 1.65, -13.95], to: [9.3, 1.65, -13.95], yaw: 0 },
  // Side stands (top 1.1 m, two rows each), facing the court (+X on the left, -X on the right).
  { count: 36, from: [-8.8, 1.1, -9.4], to: [-8.8, 1.1, 7.8], yaw: Math.PI / 2 },
  { count: 36, from: [-9.6, 1.1, -9.4], to: [-9.6, 1.1, 7.8], yaw: Math.PI / 2 },
  { count: 36, from: [8.8, 1.1, -9.4], to: [8.8, 1.1, 7.8], yaw: -Math.PI / 2 },
  { count: 36, from: [9.6, 1.1, -9.4], to: [9.6, 1.1, 7.8], yaw: -Math.PI / 2 }
];

export const CROWD_SEAT_COUNT = SEAT_ROWS.reduce((n, row) => n + row.count, 0);
/** Head centre above the seat surface (metres). */
export const HEAD_HEIGHT = 0.66;
/** Neck range: a head turns at most this far from its body's facing (radians). */
export const NECK_LIMIT = (80 * Math.PI) / 180;
/** Per-seat follow lag range (seconds), PRD TT-AN1. */
export const FOLLOW_LAG = [0.08, 0.2] as const;
/** Standing rise on a cheer (metres) and its smoothing time (seconds). */
export const STAND_RISE = 0.22;

/** Saturated shirts (no out-call red, no ball yellow): TT-A4 ">= 30 saturated seats in frame". */
const SHIRTS = ["#e0533c", "#2f7fd8", "#22a06b", "#f2a33a", "#8d5bd8", "#e8e2d0", "#1f3c88", "#d94f8a", "#2bb3b1", "#c96f2e"] as const;
const SKIN = ["#f1c7a5", "#d9a47c", "#b27a52", "#8a5a3b", "#5f3d27", "#e8b896"] as const;

/** Deterministic hash in [0, 1) for seat `i` (no Math.random: the crowd is identical on every load). */
export function seatNoise(i: number, salt = 0): number {
  let h = (i + 1) * 374761393 + salt * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

export interface CrowdSeat { readonly position: readonly [number, number, number]; readonly yaw: number }

/** Every seat position (seat surface) and the body's facing, row by row. */
export function crowdSeats(): CrowdSeat[] {
  const seats: CrowdSeat[] = [];
  for (const row of SEAT_ROWS) {
    for (let k = 0; k < row.count; k++) {
      const t = row.count === 1 ? 0.5 : k / (row.count - 1);
      const jitter = (seatNoise(seats.length, 7) - 0.5) * 0.06;
      seats.push({
        position: [row.from[0] + (row.to[0] - row.from[0]) * t + (row.yaw === 0 ? jitter : 0), row.from[1], row.from[2] + (row.to[2] - row.from[2]) * t + (row.yaw === 0 ? 0 : jitter)],
        yaw: row.yaw
      });
    }
  }
  return seats;
}

type Rgb = readonly [number, number, number];
const WHITE: Rgb = [1, 1, 1];
const HAIR: Rgb = [0.16, 0.12, 0.1];

/** Box from `min` to `max` with one colour per face (+X, -X, +Y, -Y, +Z, -Z), appended to the buffers. */
function pushBox(out: { p: number[]; n: number[]; c: number[]; i: number[] }, min: Rgb, max: Rgb, faces: readonly Rgb[]): void {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const quads: readonly { n: Rgb; v: readonly Rgb[] }[] = [
    { n: [1, 0, 0], v: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] }
  ];
  quads.forEach((quad, f) => {
    const base = out.p.length / 3;
    const color = faces[f] ?? WHITE;
    for (const v of quad.v) {
      out.p.push(v[0], v[1], v[2]);
      out.n.push(quad.n[0], quad.n[1], quad.n[2]);
      out.c.push(color[0], color[1], color[2], 1);
    }
    out.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
}

function geometry(boxes: readonly { min: Rgb; max: Rgb; faces: readonly Rgb[] }[]): AuraCustomGeometrySpec {
  const out = { p: [] as number[], n: [] as number[], c: [] as number[], i: [] as number[] };
  for (const b of boxes) pushBox(out, b.min, b.max, b.faces);
  return {
    kind: "aura-custom-geometry",
    positions: new Float32Array(out.p),
    normals: new Float32Array(out.n),
    colors: new Float32Array(out.c),
    indices: new Uint16Array(out.i)
  } as unknown as AuraCustomGeometrySpec;
}

const all = (c: Rgb): Rgb[] => [c, c, c, c, c, c];

/** Seated body (origin on the seat surface, facing +Z): torso, thighs forward, shins down. White: the shirt is the instance colour. */
export const SPECTATOR_BODY_POSES: readonly AuraCustomGeometrySpec[] = [
  geometry([
    { min: [-0.17, 0.0, -0.12], max: [0.17, 0.5, 0.1], faces: all(WHITE) },
    { min: [-0.16, 0.0, 0.08], max: [0.16, 0.13, 0.44], faces: all([0.42, 0.44, 0.5]) },
    { min: [-0.15, -0.42, 0.36], max: [0.15, 0.0, 0.48], faces: all([0.36, 0.38, 0.44]) }
  ])
];

/** Head (origin at its centre, facing +Z): face skin-white in front, hair on the back, top and upper sides. */
export const SPECTATOR_HEAD_POSES: readonly AuraCustomGeometrySpec[] = [
  geometry([
    { min: [-0.105, -0.12, -0.1], max: [0.105, 0.12, 0.1], faces: [WHITE, WHITE, HAIR, WHITE, WHITE, HAIR] },
    { min: [-0.112, 0.06, -0.108], max: [0.112, 0.135, 0.06], faces: all(HAIR) }
  ])
];

/** Yaw that faces from a seat to a point on the court (yaw 0 = +Z). */
export function yawToward(sx: number, sz: number, tx: number, tz: number): number {
  return Math.atan2(tx - sx, tz - sz);
}

/** Wraps an angle into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  else if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

export interface WorldTourCrowd {
  readonly bodies: AuraCrowd;
  readonly heads: AuraCrowd;
  readonly count: number;
  /** Per-seat follow lag (seconds). */
  readonly lag: Float32Array;
  /** Advances the head follow and the cheer stand; allocation-free. `dt` in seconds. */
  follow(ballX: number, ballZ: number, dt: number, cheering: boolean, reducedMotion?: boolean): void;
  /** Pushes the instance matrices to the app (2 draws). */
  update(target: AuraCrowdTarget, timeSeconds: number): number;
  /** Mean signed head yaw relative to each body's facing (radians): the TT-AN1 probe. */
  meanHeadYaw(): number;
  /** Current stand factor 0..1. */
  standing(): number;
}

/** Builds the World Tour crowd (two `createCrowd` crowds over the same seats). */
export function createWorldTourCrowd(): WorldTourCrowd {
  const seats = crowdSeats();
  const count = seats.length;
  const scaleOf = (i: number): number => 0.94 + seatNoise(i, 2) * 0.12;
  const bodies = createCrowd({
    id: CROWD_IDS.bodies,
    poses: [...SPECTATOR_BODY_POSES],
    spectators: seats.map((seat, i) => ({ position: [...seat.position] as [number, number, number], yaw: seat.yaw, color: SHIRTS[Math.floor(seatNoise(i, 1) * SHIRTS.length)]!, scale: scaleOf(i) })),
    material: material.pbr({ color: "#ffffff", roughness: 0.82 }),
    castShadow: false
  });
  const heads = createCrowd({
    id: CROWD_IDS.heads,
    poses: [...SPECTATOR_HEAD_POSES],
    spectators: seats.map((seat, i) => ({ position: [seat.position[0], seat.position[1] + HEAD_HEIGHT * scaleOf(i), seat.position[2]] as [number, number, number], yaw: seat.yaw, color: SKIN[Math.floor(seatNoise(i, 3) * SKIN.length)]!, scale: scaleOf(i) })),
    material: material.pbr({ color: "#ffffff", roughness: 0.7 }),
    castShadow: false
  });
  const baseYaw = new Float32Array(count);
  const seatX = new Float32Array(count);
  const seatY = new Float32Array(count);
  const seatZ = new Float32Array(count);
  const lag = new Float32Array(count);
  const scale = new Float32Array(count);
  seats.forEach((seat, i) => {
    baseYaw[i] = seat.yaw;
    seatX[i] = seat.position[0];
    seatY[i] = seat.position[1];
    seatZ[i] = seat.position[2];
    lag[i] = FOLLOW_LAG[0] + seatNoise(i, 4) * (FOLLOW_LAG[1] - FOLLOW_LAG[0]);
    scale[i] = scaleOf(i);
  });
  let stand = 0;
  let lastStand = -1;

  return {
    bodies,
    heads,
    count,
    lag,
    follow(ballX, ballZ, dt, cheering, reducedMotion = false) {
      const step = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
      for (let i = 0; i < count; i++) {
        const rel = wrapAngle(yawToward(seatX[i]!, seatZ[i]!, ballX, ballZ) - baseYaw[i]!);
        const target = Math.max(-NECK_LIMIT, Math.min(NECK_LIMIT, rel));
        const current = wrapAngle(heads.yaws[i]! - baseYaw[i]!);
        const k = step > 0 ? 1 - Math.exp(-step / lag[i]!) : 0;
        heads.yaws[i] = baseYaw[i]! + current + (target - current) * k;
      }
      heads.markDirty();
      // Stand on a cheer (reduced motion: no rise, PRD §6.3 secondary motion to 0).
      const want = cheering && !reducedMotion ? 1 : 0;
      stand += (want - stand) * (step > 0 ? 1 - Math.exp(-step / 0.25) : 0);
      if (Math.abs(stand - lastStand) > 1e-4) {
        lastStand = stand;
        const rise = stand * STAND_RISE;
        for (let i = 0; i < count; i++) {
          const lift = rise * scale[i]!;
          bodies.positions[i * 3 + 1] = seatY[i]! + lift;
          heads.positions[i * 3 + 1] = seatY[i]! + HEAD_HEIGHT * scale[i]! + lift;
        }
        bodies.markDirty();
        heads.markDirty();
      }
    },
    update(target, timeSeconds) {
      return bodies.update(target, timeSeconds) + heads.update(target, timeSeconds);
    },
    meanHeadYaw() {
      let sum = 0;
      for (let i = 0; i < count; i++) sum += wrapAngle(heads.yaws[i]! - baseYaw[i]!);
      return count > 0 ? sum / count : 0;
    },
    standing: () => stand
  };
}
