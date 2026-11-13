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
import {
  icosphereSmoothMesh,
  latheMesh,
  loftSectionsMesh,
  transformMesh,
  tubeSweepMesh,
  type RawMesh,
  type V3
} from "../../../apps/showcase-port-shared/proceduralKernel";

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

type Buffers = { p: number[]; n: number[]; c: number[]; i: number[] };

function pushRawMesh(
  out: Buffers,
  mesh: RawMesh,
  colorAt: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => Rgb
): void {
  const base = out.p.length / 3;
  const vCount = mesh.positions.length / 3;
  for (let v = 0; v < vCount; v += 1) {
    const px = mesh.positions[v * 3]!;
    const py = mesh.positions[v * 3 + 1]!;
    const pz = mesh.positions[v * 3 + 2]!;
    const rx = mesh.normals[v * 3]!;
    const ry = mesh.normals[v * 3 + 1]!;
    const rz = mesh.normals[v * 3 + 2]!;
    const ln = Math.hypot(rx, ry, rz);
    const nx = ln > 1e-6 ? rx / ln : 0;
    const ny = ln > 1e-6 ? ry / ln : 1;
    const nz = ln > 1e-6 ? rz / ln : 0;
    out.p.push(px, py, pz);
    out.n.push(nx, ny, nz);
    const col = colorAt(px, py, pz, nx, ny, nz);
    out.c.push(col[0], col[1], col[2], 1);
  }
  for (let k = 0; k < mesh.indices.length; k += 1) {
    out.i.push(base + mesh.indices[k]!);
  }
}

function crowdEllipseXZ(cx: number, y: number, cz: number, rx: number, rz: number, segs: number): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz]);
  }
  return ring;
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

/** Trousers & sneaker accents (multiplied by the shirt instance colour). */
const LEGS: Rgb = [0.38, 0.41, 0.48];
const COLLAR: Rgb = [0.94, 0.94, 0.97];
const FOREARM_SKIN: Rgb = [0.86, 0.72, 0.62];
const SHOE_WHITE: Rgb = [0.93, 0.94, 0.96];

/**
 * Articulated seated spectator body (origin on the seat surface, facing +Z, <= 340 tris so 240 seats draw cleanly in 1 batch).
 * Sculpted V-taper polo torso + turned collar + articulated bent arms/forearms resting on lap + separated thighs, calves & sneakers.
 */
export const SPECTATOR_BODY_POSES: readonly AuraCustomGeometrySpec[] = [
  (() => {
    const out: Buffers = { p: [], n: [], c: [], i: [] };
    const torso = loftSectionsMesh([
      crowdEllipseXZ(0, 0.02, -0.01, 0.148, 0.102, 8),
      crowdEllipseXZ(0, 0.18, -0.015, 0.138, 0.095, 8),
      crowdEllipseXZ(0, 0.38, -0.012, 0.188, 0.114, 8),
      crowdEllipseXZ(0, 0.49, -0.008, 0.155, 0.098, 8)
    ], true, true);
    pushRawMesh(out, torso, () => WHITE);

    const collar = transformMesh(latheMesh([[0.068, 0.48], [0.105, 0.505], [0.078, 0.545]], 8, false), { pos: [0, 0, -0.008] });
    pushRawMesh(out, collar, () => COLLAR);

    for (const side of [-1, 1] as const) {
      const arm = tubeSweepMesh([
        [side * 0.182, 0.44, -0.01, 0.048],
        [side * 0.215, 0.26, 0.03, 0.04],
        [side * 0.165, 0.165, 0.16, 0.035],
        [side * 0.105, 0.148, 0.245, 0.033]
      ], 5, true);
      pushRawMesh(out, arm, (_x, y, z) => (y > 0.28 && z < 0.08 ? WHITE : FOREARM_SKIN));

      const leg = tubeSweepMesh([
        [side * 0.092, 0.065, 0.03, 0.068],
        [side * 0.098, 0.055, 0.33, 0.058],
        [side * 0.098, -0.28, 0.375, 0.046],
        [side * 0.098, -0.355, 0.455, 0.044]
      ], 5, true);
      pushRawMesh(out, leg, (_x, y, z) => (y < -0.29 && z > 0.39 ? SHOE_WHITE : LEGS));
    }
    return finish(out);
  })()
];

/**
 * Smooth icosphere cranium + lathe neck (`<= 360` tris): face front (`WHITE` -> instance skin tone), hair cap over crown & back (`HAIR`).
 */
export const SPECTATOR_HEAD_POSES: readonly AuraCustomGeometrySpec[] = [
  (() => {
    const out: Buffers = { p: [], n: [], c: [], i: [] };
    const cranium = transformMesh(icosphereSmoothMesh(0.106, 2, 0.015, 7), {
      pos: [0, 0.006, 0],
      scale: [0.94, 1.15, 1.0]
    });
    pushRawMesh(out, cranium, (_x, _y, _z, _nx, ny, nz) => (ny > 0.42 || nz < -0.22 ? HAIR : WHITE));
    const neck = transformMesh(latheMesh([[0.048, -0.14], [0.044, -0.065], [0, -0.06]], 6, false), { pos: [0, 0, -0.012] });
    pushRawMesh(out, neck, () => WHITE);
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
      let headMoved = false;
      for (let i = 0; i < count; i++) {
        const rel = wrapAngle(yawToward(seatX[i]!, seatZ[i]!, ballX, ballZ) - baseYaw[i]!);
        const target = Math.max(-NECK_LIMIT, Math.min(NECK_LIMIT, rel));
        const current = wrapAngle(heads.yaws[i]! - baseYaw[i]!);
        const k = step > 0 ? 1 - Math.exp(-step / lag[i]!) : 0;
        const delta = (target - current) * k;
        if (Math.abs(delta) > 1e-4) headMoved = true;
        heads.yaws[i] = baseYaw[i]! + current + delta;
      }
      if (headMoved) heads.markDirty();
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
