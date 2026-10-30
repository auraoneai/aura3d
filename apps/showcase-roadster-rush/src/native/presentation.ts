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
