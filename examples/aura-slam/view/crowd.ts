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

type Buffers = { p: number[]; n: number[]; c: number[]; i: number[] };

/**
 * GU47 phase 4 (sibling judge vs aura-diamond-3d: "the same blocky voxel crowd"): a low-poly ellipsoid (lat-long, smooth
 * normals) centred at `c` with radii `r`; `colorAt(ny, nz)` colours each vertex from its unit normal (hair cap vs face).
 */
function pushEllipsoid(out: Buffers, c: Rgb, r: Rgb, colorAt: (ny: number, nz: number) => Rgb, seg = 10, rings = 7): void {
  const base = out.p.length / 3;
  for (let j = 0; j <= rings; j++) {
    const v = (j / rings) * Math.PI;
    for (let k = 0; k <= seg; k++) {
      const u = (k / seg) * 2 * Math.PI;
      const nx = Math.sin(v) * Math.sin(u);
      const ny = Math.cos(v);
      const nz = Math.sin(v) * Math.cos(u);
      out.p.push(c[0] + nx * r[0], c[1] + ny * r[1], c[2] + nz * r[2]);
      const ln = Math.hypot(nx / r[0], ny / r[1], nz / r[2]) || 1;
      out.n.push(nx / r[0] / ln, ny / r[1] / ln, nz / r[2] / ln);
      const col = colorAt(ny, nz);
      out.c.push(col[0], col[1], col[2], 1);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < seg; k++) {
      const a = base + j * (seg + 1) + k;
      const b = a + seg + 1;
      out.i.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

/**
 * GU47 phase 4: a tapered octagonal prism (y from `y0` to `y1`, half-widths `w0`/`w1` in x and `d0`/`d1` in z) with smooth
 * side normals and a capped top: the seated torso reads as shoulders over a waist instead of a box.
 */
function pushTaperedPrism(out: Buffers, cx: number, cz: number, y0: number, y1: number, w0: number, w1: number, d0: number, d1: number, color: Rgb, sides = 8): void {
  const base = out.p.length / 3;
  for (const [y, w, d] of [[y0, w0, d0], [y1, w1, d1]] as const) {
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * 2 * Math.PI + Math.PI / sides;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      out.p.push(cx + sx * w, y, cz + sz * d);
      const ln = Math.hypot(sx / w, sz / d) || 1;
      out.n.push(sx / w / ln, 0, sz / d / ln);
      out.c.push(color[0], color[1], color[2], 1);
    }
  }
  for (let k = 0; k < sides; k++) {
    const a = base + k;
    const b = base + sides + 1 + k;
    out.i.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // Top cap (shoulder line), a fan around its centre.
  const centre = out.p.length / 3;
  out.p.push(cx, y1, cz);
  out.n.push(0, 1, 0);
  out.c.push(color[0], color[1], color[2], 1);
  const ring = out.p.length / 3;
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * 2 * Math.PI + Math.PI / sides;
    out.p.push(cx + Math.sin(a) * w1, y1, cz + Math.cos(a) * d1);
    out.n.push(0, 1, 0);
    out.c.push(color[0], color[1], color[2], 1);
  }
  for (let k = 0; k < sides; k++) out.i.push(centre, ring + k, ring + k + 1);
}

function finish(out: Buffers): AuraCustomGeometrySpec {
  return {
    kind: "aura-custom-geometry",
    positions: new Float32Array(out.p),
    normals: new Float32Array(out.n),
    colors: new Float32Array(out.c),
    indices: new Uint16Array(out.i)
  } as unknown as AuraCustomGeometrySpec;
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

/** Trousers (multiplied by the shirt instance colour, so a dark neutral). */
const LEGS: Rgb = [0.4, 0.42, 0.48];

/**
 * Seated body (origin on the seat surface, facing +Z). White parts take the shirt (instance) colour. GU47 phase 4: a tapered
 * octagonal torso (shoulders 0.2 m, waist 0.15 m), sleeves hanging at the sides and rounded thighs replace the three boxes,
 * so the stands read as seated people instead of voxel blocks; the shins stay boxes (hidden by the tier in front).
 */
export const SPECTATOR_BODY_POSES: readonly AuraCustomGeometrySpec[] = [
  (() => {
    const out: Buffers = { p: [], n: [], c: [], i: [] };
    // Tapered upper torso + rib/shoulder flare + V-collar accent.
    pushTaperedPrism(out, 0, -0.015, 0.02, 0.49, 0.145, 0.205, 0.095, 0.115, WHITE, 8);
    pushTaperedPrism(out, 0, -0.01, 0.48, 0.54, 0.11, 0.075, 0.085, 0.068, [0.92, 0.92, 0.94], 6);
    // Rounded deltoid shoulder caps + relaxed upper arms + forearms resting forward on lap.
    for (const side of [-1, 1]) {
      pushEllipsoid(out, [side * 0.21, 0.44, -0.01], [0.058, 0.055, 0.058], () => WHITE, 6, 4);
      pushTaperedPrism(out, side * 0.225, 0.01, 0.19, 0.43, 0.042, 0.048, 0.045, 0.052, WHITE, 6);
      pushEllipsoid(out, [side * 0.175, 0.16, 0.13], [0.038, 0.036, 0.11], () => [0.86, 0.72, 0.62], 6, 4);
      pushEllipsoid(out, [side * 0.088, 0.07, 0.25], [0.076, 0.068, 0.195], () => LEGS, 6, 4);
    }
    pushBox(out, [-0.145, -0.4, 0.35], [0.145, 0.02, 0.46], all([0.34, 0.36, 0.43]));
    return finish(out);
  })()
];

/**
 * Head (origin at its centre, facing +Z): sculpted cranium + neck base, skin-white face front, hair cap over crown and back.
 */
export const SPECTATOR_HEAD_POSES: readonly AuraCustomGeometrySpec[] = [
  (() => {
    const out: Buffers = { p: [], n: [], c: [], i: [] };
    pushEllipsoid(out, [0, 0.005, 0], [0.1, 0.125, 0.105], (ny, nz) => (ny > 0.42 || nz < -0.22 ? HAIR : WHITE), 12, 8);
    pushTaperedPrism(out, 0, -0.012, -0.14, -0.06, 0.048, 0.044, 0.048, 0.044, WHITE, 6);
    return finish(out);
  })()
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
