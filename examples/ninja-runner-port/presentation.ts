import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { SimState } from "./sim";

/** The moving parts of one simulation step: the runner, enemies that approach or drop in, projectiles and shurikens. */
export interface Shown {
  s: number;
  x: number;
  y: number;
  speed: number;
  movers: { id: number; s: number; lane: number; y: number }[];
  projectiles: { id: number; s: number; x: number; y: number }[];
  shurikens: { id: number; s: number; x: number }[];
}

/** The runner moves a fraction of a unit per step; a restart jumps the whole course length and must not smear. */
export const SNAP_DISTANCE = 12;

export function shownOf(z: SimState): Shown {
  const movers: Shown["movers"] = [];
  for (const e of z.entities) if (e.alive && (e.approach || e.dropIn)) movers.push({ id: e.id, s: e.s, lane: e.lane, y: e.y });
  return {
    s: z.s, x: z.x, y: z.y, speed: z.speed, movers,
    projectiles: z.projectiles.filter((p) => p.alive).map((p) => ({ id: p.id, s: p.s, x: p.x, y: p.y })),
    shurikens: z.shurikens.map((h) => ({ id: h.id, s: h.s, x: h.x }))
  };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Blend lists by id: an item present in both steps interpolates, a new one appears where it is. */
function blendById<T extends { id: number }>(a: readonly T[], b: readonly T[], t: number, keys: readonly (keyof T)[]): T[] {
  const before = new Map<number, T>();
  for (const item of a) before.set(item.id, item);
  return b.map((item) => {
    const prev = before.get(item.id);
    if (!prev) return item;
    const out = { ...item };
    for (const k of keys) (out as Record<keyof T, unknown>)[k] = mix(prev[k] as number, item[k] as number, t);
    return out;
  });
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (Math.abs(b.s - a.s) > SNAP_DISTANCE) return b;
  return {
    s: mix(a.s, b.s, t), x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), speed: mix(a.speed, b.speed, t),
    movers: blendById(a.movers, b.movers, t, ["s", "lane", "y"]),
    projectiles: blendById(a.projectiles, b.projectiles, t, ["s", "x", "y"]),
    shurikens: blendById(a.shurikens, b.shurikens, t, ["s", "x"])
  };
}

/** The sim the world runtime reads, with the presented poses in place of the latest step (the real state is untouched). */
export function viewOf(z: SimState, shown: Shown): SimState {
  const movers = new Map<number, Shown["movers"][number]>();
  for (const m of shown.movers) movers.set(m.id, m);
  const projectiles = new Map<number, Shown["projectiles"][number]>();
  for (const p of shown.projectiles) projectiles.set(p.id, p);
  const shurikens = new Map<number, Shown["shurikens"][number]>();
  for (const h of shown.shurikens) shurikens.set(h.id, h);
  return {
    ...z,
    s: shown.s, x: shown.x, y: shown.y, speed: shown.speed,
    entities: z.entities.map((e) => {
      const m = movers.get(e.id);
      return m ? { ...e, s: m.s, lane: m.lane, y: m.y } : e;
    }),
    projectiles: z.projectiles.map((p) => {
      const m = projectiles.get(p.id);
      return m ? { ...p, s: m.s, x: m.x, y: m.y } : p;
    }),
    shurikens: z.shurikens.map((h) => {
      const m = shurikens.get(h.id);
      return m ? { ...h, s: m.s, x: m.x } : h;
    })
  };
}

export function createNinjaPresenter(getState: () => SimState): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getState()), blend: blendShown });
}
