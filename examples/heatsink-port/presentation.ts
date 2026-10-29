import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { Race } from "./race";

/** What the renderer reads of one simulation step that moves continuously: the drone pose and the bolts in flight. */
export interface Shown {
  position: { x: number; y: number; z: number };
  s: number;
  theta: number;
  pitch: number;
  lean: number;
  v: number;
  bolts: { alive: boolean; x: number; y: number; z: number }[];
}

/** A step moves the drone a few metres at most; a respawn or restart jumps further and must not smear. */
export const SNAP_DISTANCE = 30;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const emptyShown = (bolts: number): Shown => ({
  position: { x: 0, y: 0, z: 0 }, s: 0, theta: 0, pitch: 0, lean: 0, v: 0,
  bolts: Array.from({ length: bolts }, () => ({ alive: false, x: 0, y: 0, z: 0 }))
});

/** the presented state of the latest step, written into `out` when given (the presenter reuses a small pool, HP-18) */
export function shownOf(race: Pick<Race, "player" | "ops">, out?: Shown): Shown {
  const p = race.player;
  const src = race.ops.bolts;
  const o = out ?? emptyShown(src.length);
  o.position.x = p.position.x; o.position.y = p.position.y; o.position.z = p.position.z;
  o.s = p.s; o.theta = p.theta; o.pitch = p.pitch; o.lean = p.lean; o.v = p.v;
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
  o.position.x = mix(a.position.x, b.position.x, t); o.position.y = mix(a.position.y, b.position.y, t); o.position.z = mix(a.position.z, b.position.z, t);
  o.s = mix(a.s, b.s, t); o.theta = mix(a.theta, b.theta, t); o.pitch = mix(a.pitch, b.pitch, t); o.lean = mix(a.lean, b.lean, t); o.v = mix(a.v, b.v, t);
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
  const pl = c.player as unknown as { s: number; theta: number; pitch: number; lean: number; v: number };
  c.player.position.x = shown.position.x; c.player.position.y = shown.position.y; c.player.position.z = shown.position.z;
  pl.s = shown.s; pl.theta = shown.theta; pl.pitch = shown.pitch; pl.lean = shown.lean; pl.v = shown.v;
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
