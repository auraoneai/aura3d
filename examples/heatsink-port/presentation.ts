import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { Race } from "./race";

export interface ShownBot {
  position: { x: number; y: number; z: number };
  s: number;
  x?: number;
  y?: number;
  theta: number;
  pitch?: number;
  lean?: number;
  v: number;
}

/** What the renderer reads of one simulation step that moves continuously: the drone pose and the bolts in flight. */
export interface Shown {
  position: { x: number; y: number; z: number };
  s: number;
  theta: number;
  pitch: number;
  lean: number;
  v: number;
  trackLength?: number;
  x?: number;
  yW?: number;
  vyW?: number;
  steerVal?: number;
  accelSm?: number;
  heat?: number;
  ab?: number;
  burstT?: number;
  landT?: number;
  hyperT?: number;
  turboT?: number;
  abEnv?: number;
  rjEnv?: number;
  burstEnv?: number;
  bots?: ShownBot[];
  bolts: { alive: boolean; x: number; y: number; z: number }[];
}

/** A step moves the drone a few metres at most; a respawn or restart jumps further and must not smear. */
export const SNAP_DISTANCE = 30;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const mixMod = (a: number, b: number, t: number, len?: number): number => {
  if (len !== undefined && len > 0) {
    let ds = b - a;
    ds -= len * Math.round(ds / len);
    const w = (a + ds * t) % len;
    return w < 0 ? w + len : w;
  }
  return mix(a, b, t);
};

const mixAngle = (a: number, b: number, t: number): number => {
  let d = b - a;
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  return a + d * t;
};

const mixOpt = (a: number | undefined, b: number | undefined, t: number): number | undefined =>
  a !== undefined && b !== undefined ? mix(a, b, t) : (b ?? a);

const emptyShown = (bolts: number): Shown => ({
  position: { x: 0, y: 0, z: 0 }, s: 0, theta: 0, pitch: 0, lean: 0, v: 0,
  bolts: Array.from({ length: bolts }, () => ({ alive: false, x: 0, y: 0, z: 0 }))
});

/** the presented state of the latest step, written into `out` when given (the presenter reuses a small pool, HP-18) */
export function shownOf(
  race: Pick<Race, "player" | "ops"> & { readonly track?: { readonly length: number }; readonly bots?: readonly ShownBot[] },
  out?: Shown
): Shown {
  const p = race.player;
  const src = race.ops.bolts;
  const o = out ?? emptyShown(src.length);
  o.position.x = p.position.x; o.position.y = p.position.y; o.position.z = p.position.z;
  o.s = p.s; o.theta = p.theta; o.pitch = p.pitch; o.lean = p.lean; o.v = p.v;
  o.trackLength = race.track?.length ?? p.track?.length;
  o.x = p.x; o.yW = p.yW; o.vyW = p.vyW;
  o.steerVal = p.steerVal; o.accelSm = p.accelSm;
  o.heat = p.heat; o.ab = p.ab;
  o.burstT = p.burstT; o.landT = p.landT; o.hyperT = p.hyperT; o.turboT = p.turboT;
  o.abEnv = p.abEnv; o.rjEnv = p.rjEnv; o.burstEnv = p.burstEnv;
  if (race.bots) {
    const bots = o.bots ?? (o.bots = []);
    for (let i = 0; i < race.bots.length; i++) {
      const sb = race.bots[i]!;
      const db = bots[i] ?? (bots[i] = { position: { x: 0, y: 0, z: 0 }, s: 0, theta: 0, v: 0 });
      db.position.x = sb.position.x; db.position.y = sb.position.y; db.position.z = sb.position.z;
      db.s = sb.s; db.x = sb.x; db.y = sb.y; db.theta = sb.theta; db.pitch = sb.pitch; db.lean = sb.lean; db.v = sb.v;
    }
    bots.length = race.bots.length;
  } else if (o.bots) {
    o.bots.length = 0;
  }
  for (let i = 0; i < src.length; i++) {
    const b = src[i]!;
    const d = o.bolts[i] ?? (o.bolts[i] = { alive: false, x: 0, y: 0, z: 0 });
    d.alive = b.alive; d.x = b.x; d.y = b.y; d.z = b.z;
  }
  o.bolts.length = src.length;
  return o;
}

const copyShown = (from: Shown, out: Shown): Shown => {
  out.position.x = from.position.x; out.position.y = from.position.y; out.position.z = from.position.z;
  out.s = from.s; out.theta = from.theta; out.pitch = from.pitch; out.lean = from.lean; out.v = from.v;
  out.trackLength = from.trackLength;
  out.x = from.x; out.yW = from.yW; out.vyW = from.vyW;
  out.steerVal = from.steerVal; out.accelSm = from.accelSm;
  out.heat = from.heat; out.ab = from.ab;
  out.burstT = from.burstT; out.landT = from.landT; out.hyperT = from.hyperT; out.turboT = from.turboT;
  out.abEnv = from.abEnv; out.rjEnv = from.rjEnv; out.burstEnv = from.burstEnv;
  if (from.bots) {
    const bots = out.bots ?? (out.bots = []);
    for (let i = 0; i < from.bots.length; i++) {
      const sb = from.bots[i]!;
      const db = bots[i] ?? (bots[i] = { position: { x: 0, y: 0, z: 0 }, s: 0, theta: 0, v: 0 });
      db.position.x = sb.position.x; db.position.y = sb.position.y; db.position.z = sb.position.z;
      db.s = sb.s; db.x = sb.x; db.y = sb.y; db.theta = sb.theta; db.pitch = sb.pitch; db.lean = sb.lean; db.v = sb.v;
    }
    bots.length = from.bots.length;
  } else if (out.bots) {
    out.bots.length = 0;
  }
  for (let i = 0; i < from.bolts.length; i++) {
    const b = from.bolts[i]!;
    const d = out.bolts[i] ?? (out.bolts[i] = { alive: false, x: 0, y: 0, z: 0 });
    d.alive = b.alive; d.x = b.x; d.y = b.y; d.z = b.z;
  }
  out.bolts.length = from.bolts.length;
  return out;
};

/** blend two steps; `out` (optional) receives the result so a caller can reuse one object per frame */
export function blendShown(a: Shown, b: Shown, t: number, out?: Shown): Shown {
  const jump = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.position.z - a.position.z);
  if (jump > SNAP_DISTANCE) return out ? copyShown(b, out) : b;
  const o = out ?? emptyShown(b.bolts.length);
  const len = b.trackLength ?? a.trackLength;
  o.trackLength = len;
  o.position.x = mix(a.position.x, b.position.x, t); o.position.y = mix(a.position.y, b.position.y, t); o.position.z = mix(a.position.z, b.position.z, t);
  o.s = mixMod(a.s, b.s, t, len);
  o.theta = mixAngle(a.theta, b.theta, t);
  o.pitch = mix(a.pitch, b.pitch, t); o.lean = mix(a.lean, b.lean, t); o.v = mix(a.v, b.v, t);
  o.x = mixOpt(a.x, b.x, t); o.yW = mixOpt(a.yW, b.yW, t); o.vyW = mixOpt(a.vyW, b.vyW, t);
  o.steerVal = mixOpt(a.steerVal, b.steerVal, t); o.accelSm = mixOpt(a.accelSm, b.accelSm, t);
  o.heat = mixOpt(a.heat, b.heat, t); o.ab = mixOpt(a.ab, b.ab, t);
  o.burstT = mixOpt(a.burstT, b.burstT, t); o.landT = mixOpt(a.landT, b.landT, t);
  o.hyperT = mixOpt(a.hyperT, b.hyperT, t); o.turboT = mixOpt(a.turboT, b.turboT, t);
  o.abEnv = mixOpt(a.abEnv, b.abEnv, t); o.rjEnv = mixOpt(a.rjEnv, b.rjEnv, t); o.burstEnv = mixOpt(a.burstEnv, b.burstEnv, t);
  if (b.bots) {
    const bots = o.bots ?? (o.bots = []);
    for (let i = 0; i < b.bots.length; i++) {
      const nb = b.bots[i]!;
      const pb = a.bots?.[i];
      const db = bots[i] ?? (bots[i] = { position: { x: 0, y: 0, z: 0 }, s: 0, theta: 0, v: 0 });
      const smoothBot = pb && Math.hypot(nb.position.x - pb.position.x, nb.position.y - pb.position.y, nb.position.z - pb.position.z) <= SNAP_DISTANCE;
      if (smoothBot) {
        db.position.x = mix(pb.position.x, nb.position.x, t); db.position.y = mix(pb.position.y, nb.position.y, t); db.position.z = mix(pb.position.z, nb.position.z, t);
        db.s = mixMod(pb.s, nb.s, t, len);
        db.x = mixOpt(pb.x, nb.x, t); db.y = mixOpt(pb.y, nb.y, t);
        db.theta = mixAngle(pb.theta, nb.theta, t);
        db.pitch = mixOpt(pb.pitch, nb.pitch, t); db.lean = mixOpt(pb.lean, nb.lean, t);
        db.v = mix(pb.v, nb.v, t);
      } else {
        db.position.x = nb.position.x; db.position.y = nb.position.y; db.position.z = nb.position.z;
        db.s = nb.s; db.x = nb.x; db.y = nb.y; db.theta = nb.theta; db.pitch = nb.pitch; db.lean = nb.lean; db.v = nb.v;
      }
    }
    bots.length = b.bots.length;
  } else if (o.bots) {
    o.bots.length = 0;
  }
  for (let i = 0; i < b.bolts.length; i++) {
    const bolt = b.bolts[i]!;
    const prev = a.bolts[i];
    const d = o.bolts[i] ?? (o.bolts[i] = { alive: false, x: 0, y: 0, z: 0 });
    const smooth = prev && prev.alive && bolt.alive && Math.hypot(bolt.x - prev.x, bolt.y - prev.y, bolt.z - prev.z) <= SNAP_DISTANCE;
    d.alive = bolt.alive;
    d.x = smooth ? mix(prev.x, bolt.x, t) : bolt.x;
    d.y = smooth ? mix(prev.y, bolt.y, t) : bolt.y;
    d.z = smooth ? mix(prev.z, bolt.z, t) : bolt.z;
  }
  o.bolts.length = b.bolts.length;
  return o;
}

interface ViewCache {
  race: Race;
  view: Race;
  player: Race["player"] & { position: { x: number; y: number; z: number } };
  bolts: Race["ops"]["bolts"];
}
let viewCache: ViewCache | null = null;

/**
 * The race the world runtime reads, with the presented drone and bolts in place of the latest step (the real race is
 * untouched). The view objects are built once per race and refreshed in place each frame (HP-18).
 */
export function viewOf(race: Race, shown: Shown): Race {
  let c = viewCache;
  if (!c || c.race !== race || c.bolts.length !== race.ops.bolts.length) {
    const player = Object.create(race.player) as ViewCache["player"];
    player.position = { x: 0, y: 0, z: 0 };
    const bolts = race.ops.bolts.map((b) => ({ ...b }));
    const ops = Object.create(race.ops, { bolts: { value: bolts } });
    const view = Object.create(race, { player: { value: player }, ops: { value: ops } }) as Race;
    c = viewCache = { race, view, player, bolts };
  }
  const pl = c.player as unknown as Record<string, number>;
  c.player.position.x = shown.position.x; c.player.position.y = shown.position.y; c.player.position.z = shown.position.z;
  pl.s = shown.s; pl.theta = shown.theta; pl.pitch = shown.pitch; pl.lean = shown.lean; pl.v = shown.v;
  if (shown.x !== undefined) pl.x = shown.x;
  if (shown.yW !== undefined) pl.yW = shown.yW;
  if (shown.vyW !== undefined) pl.vyW = shown.vyW;
  if (shown.steerVal !== undefined) pl.steerVal = shown.steerVal;
  if (shown.accelSm !== undefined) pl.accelSm = shown.accelSm;
  if (shown.heat !== undefined) pl.heat = shown.heat;
  if (shown.ab !== undefined) pl.ab = shown.ab;
  if (shown.burstT !== undefined) pl.burstT = shown.burstT;
  if (shown.landT !== undefined) pl.landT = shown.landT;
  if (shown.hyperT !== undefined) pl.hyperT = shown.hyperT;
  if (shown.turboT !== undefined) pl.turboT = shown.turboT;
  if (shown.abEnv !== undefined) pl.abEnv = shown.abEnv;
  if (shown.rjEnv !== undefined) pl.rjEnv = shown.rjEnv;
  if (shown.burstEnv !== undefined) pl.burstEnv = shown.burstEnv;
  const real = race.ops.bolts;
  for (let i = 0; i < real.length; i++) {
    const r = real[i]!, d = c.bolts[i]!, sh = shown.bolts[i];
    Object.assign(d, r);
    if (sh?.alive && r.alive) { d.x = sh.x; d.y = sh.y; d.z = sh.z; }
  }
  return c.view;
}

export function createHeatsinkPresenter(getRace: () => Pick<Race, "player" | "ops">): FixedStepPresenter<Shown> {
  /* four snapshots in rotation: the interpolator holds the last two, `present` may take a third */
  const pool = [0, 1, 2, 3].map(() => emptyShown(0));
  let next = 0;
  const blended = emptyShown(0);
  return createFixedStepPresenter<Shown>({
    snapshot: () => shownOf(getRace(), pool[next++ % pool.length]),
    blend: (a, b, t) => blendShown(a, b, t, blended)
  });
}

/** Pure visual articulation state for the quad-rotor ducted fans, vector airbrakes, and twin ion nozzles. */
export interface CraftArticulationState {
  rotorAngle: number;
  flapPitch: number;
  flapRoll: number;
  nozzleScale?: number;
}

export function stepCraftArticulation(
  state: CraftArticulationState,
  dt: number,
  speed01: number,
  boostActive: boolean | number,
  brakingOrDrifting: boolean,
  steer: number
): { rotorAngle: number; flapPitch: number; flapRoll: number; nozzleScale: number } {
  const clampedDt = Math.min(0.1, Math.max(0, dt));
  const boostLevel = typeof boostActive === "number" ? Math.min(1, Math.max(0, boostActive)) : (boostActive ? 1 : 0);
  const clampedSpeed = Math.min(1, Math.max(0, speed01));
  const rpmRad = 44 + 52 * clampedSpeed + 30 * boostLevel;
  state.rotorAngle = (state.rotorAngle + rpmRad * clampedDt) % (Math.PI * 200);
  const targetPitch = brakingOrDrifting ? 0.52 : 0.06 + 0.08 * clampedSpeed;
  const targetRoll = Math.max(-1, Math.min(1, steer)) * 0.22;
  const k = 1 - Math.exp(-clampedDt * 14);
  state.flapPitch += (targetPitch - state.flapPitch) * k;
  state.flapRoll += (targetRoll - state.flapRoll) * k;
  const baseNozzle = 0.88 + 0.28 * clampedSpeed;
  const targetNozzle = baseNozzle + (1.32 - baseNozzle) * boostLevel;
  const nk = 1 - Math.exp(-clampedDt * 10);
  const prevNozzle = state.nozzleScale ?? targetNozzle;
  const nozzleScale = prevNozzle + (targetNozzle - prevNozzle) * nk;
  state.nozzleScale = nozzleScale;
  return { rotorAngle: state.rotorAngle, flapPitch: state.flapPitch, flapRoll: state.flapRoll, nozzleScale };
}
