import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";

interface TrafficLike {
  vehicles: { id: string; x: number; z: number }[];
  skyCars: { id: string; x: number; y: number; z: number }[];
}
interface GameLike {
  player: { position: { x: number; y: number; z: number } };
  traffic: TrafficLike;
  time: number;
}

/** What the freeway sync reads of one simulation step that moves continuously: the car, the traffic and the sky lane. */
export interface Shown {
  time: number;
  player: { x: number; y: number; z: number };
  vehicles: { id: string; x: number; z: number }[];
  skyCars: { id: string; x: number; y: number; z: number }[];
}

/** A step moves anything a few metres at most; a run restart or a recycled slot jumps further and must not smear. */
export const SNAP_DISTANCE = 12;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(g: GameLike): Shown {
  const p = g.player.position;
  return {
    time: g.time,
    player: { x: p.x, y: p.y, z: p.z },
    vehicles: g.traffic.vehicles.map((v) => ({ id: v.id, x: v.x, z: v.z })),
    skyCars: g.traffic.skyCars.map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z }))
  };
}

/** Blend lists by id: an entity in both steps interpolates unless it jumped (a recycled slot), a new one appears where it is. */
function blendById<T extends { id: string }>(a: readonly T[], b: readonly T[], t: number, keys: readonly (keyof T)[], zKey: keyof T): T[] {
  const before = new Map<string, T>();
  for (const item of a) before.set(item.id, item);
  return b.map((item) => {
    const prev = before.get(item.id);
    if (!prev || Math.abs((item[zKey] as number) - (prev[zKey] as number)) > SNAP_DISTANCE) return item;
    const out = { ...item };
    for (const k of keys) (out as Record<keyof T, unknown>)[k] = mix(prev[k] as number, item[k] as number, t);
    return out;
  });
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (Math.abs(b.player.z - a.player.z) > SNAP_DISTANCE) return b;
  return {
    time: mix(a.time, b.time, t),
    player: { x: mix(a.player.x, b.player.x, t), y: mix(a.player.y, b.player.y, t), z: mix(a.player.z, b.player.z, t) },
    vehicles: blendById(a.vehicles, b.vehicles, t, ["x", "z"], "z"),
    skyCars: blendById(a.skyCars, b.skyCars, t, ["x", "y", "z"], "z")
  };
}

/**
 * The game the freeway sync reads, with the presented poses in place of the latest step. The real game is untouched:
 * the sync's autopilot and QA actions must run against it, only the drawing reads the view.
 */
export function viewOf<G extends GameLike>(g: G, shown: Shown): G {
  const vehicles = new Map<string, Shown["vehicles"][number]>();
  for (const v of shown.vehicles) vehicles.set(v.id, v);
  const skyCars = new Map<string, Shown["skyCars"][number]>();
  for (const s of shown.skyCars) skyCars.set(s.id, s);
  const player = Object.create(g.player, { position: { value: { ...g.player.position, ...shown.player } } });
  const traffic = Object.create(g.traffic, {
    vehicles: { value: g.traffic.vehicles.map((v) => { const m = vehicles.get(v.id); return m ? { ...v, x: m.x, z: m.z } : v; }) },
    skyCars: { value: g.traffic.skyCars.map((s) => { const m = skyCars.get(s.id); return m ? { ...s, x: m.x, y: m.y, z: m.z } : s; }) }
  });
  return Object.create(g, { player: { value: player }, traffic: { value: traffic }, time: { value: shown.time } }) as G;
}

export function createRoadsterPresenter(getGame: () => GameLike): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getGame()), blend: blendShown });
}

/** GU47 AO-AN1: the lean a lane change shows, in radians (6 degrees). */
export const DISPLAY_LEAN_MAX = (6 * Math.PI) / 180;

/**
 * Roll to draw for the hero: the simulation's bank (up to about 22 degrees, it also drives the barrel roll) is capped at a
 * 6-degree lean for lane changes; a barrel roll keeps its full turn. Read-only: the simulation's own value is untouched.
 */
export function displayRoll(simRoll: number, rolling: boolean): number {
  if (rolling || !Number.isFinite(simRoll)) return Number.isFinite(simRoll) ? simRoll : 0;
  return Math.max(-DISPLAY_LEAN_MAX, Math.min(DISPLAY_LEAN_MAX, simRoll));
}

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number
];

function wrapRadians(angle: number): number {
  let a = (angle + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Builds the natural vehicle local-to-world 3x3 rotation matrix `R_y(yaw) * R_x(pitch) * R_z(roll)`
 * (yaw heading around world `+Y`, pitch nose around yawed `+X`, bank/barrel-roll around body `+Z`).
 */
export function bodyMatrixFromYXZ(pitch: number, yaw: number, roll: number): Mat3 {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp
  ];
}

/** Multiplies two row-major 3x3 rotation matrices `a * b`. */
export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}

/** Transforms `local` offset by `m` and adds `root`. */
export function rotateOffsetByMat3(
  root: readonly [number, number, number],
  m: Mat3,
  local: readonly [number, number, number]
): [number, number, number] {
  return [
    root[0] + m[0] * local[0] + m[1] * local[1] + m[2] * local[2],
    root[1] + m[3] * local[0] + m[4] * local[1] + m[5] * local[2],
    root[2] + m[6] * local[0] + m[7] * local[1] + m[8] * local[2]
  ];
}

/**
 * Decomposes a 3x3 rotation matrix into `@aura3d/engine`'s `"ZYX"` Euler angles `[rx, ry, rz]`
 * (`R = R_z(rz) * R_y(ry) * R_x(rx)`), selecting the continuous branch closest to `preferYaw`
 * with gimbal-lock handling so simultaneous pitch + yaw + barrel-roll never flips or shears.
 */
export function eulerZYXFromMat3(m: Mat3, preferYaw = 0): [number, number, number] {
  const sinY = Math.max(-1, Math.min(1, -m[6]));
  if (Math.abs(m[6]) >= 0.999999) {
    return [0, Math.asin(sinY), Math.atan2(-m[1], m[4])];
  }
  const ryA = Math.asin(sinY);
  const rxA = Math.atan2(m[7], m[8]);
  const rzA = Math.atan2(m[3], m[0]);

  const ryB = sinY >= 0 ? Math.PI - ryA : -Math.PI - ryA;
  const rxB = Math.atan2(-m[7], -m[8]);
  const rzB = Math.atan2(-m[3], -m[0]);

  const costA = Math.abs(rxA) + Math.abs(rzA) + 0.35 * Math.abs(wrapRadians(ryA - preferYaw));
  const costB = Math.abs(rxB) + Math.abs(rzB) + 0.35 * Math.abs(wrapRadians(ryB - preferYaw));
  return costB < costA ? [rxB, ryB, rzB] : [rxA, ryA, rzA];
}

/** Converts vehicle `(pitch, yaw, roll)` (`"YXZ"` body attitude) to `@aura3d/engine` `"ZYX"` `[rx, ry, rz]`. */
export function eulerZYXFromYXZ(pitch: number, yaw: number, roll: number): [number, number, number] {
  return eulerZYXFromMat3(bodyMatrixFromYXZ(pitch, yaw, roll), yaw);
}

const LOCAL_ROT_X_POS_HALF_PI: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
const LOCAL_ROT_X_PI: Mat3 = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const LOCAL_ROT_Z_POS_HALF_PI: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const LOCAL_ROT_Z_NEG_HALF_PI: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];

export const HERO_PLUME_LOCAL_MATS = {
  rear: LOCAL_ROT_X_POS_HALF_PI,
  down: LOCAL_ROT_X_PI,
  sideLeft: LOCAL_ROT_Z_POS_HALF_PI,
  sideRight: LOCAL_ROT_Z_NEG_HALF_PI
} as const;

