import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { SplatRushSim } from "./sim";

/**
 * Splat Rush scrolls its world toward a fixed ball: the road, gates, power-ups and splatters advance by one shared
 * `move` per step. The ball, camera and clock interpolate between the last two steps; the scrolling entities are shown
 * stepped back by the part of the last step that has not elapsed yet (they are re-created at the far end, so matching
 * entities between steps by index would tear the road whenever a segment is recycled).
 */
export interface Shown {
  distance: number;
  elapsed: number;
  /** How far the world scrolled in the last step (a world-space distance), scaled by the unelapsed fraction. */
  back: number;
  player: { x: number; y: number; z: number; rotX: number; scale: number };
  camera: { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number };
}

/** A step scrolls the world a fraction of a unit; a restart jumps the distance back to zero and must not smear. */
export const SNAP_DISTANCE = 5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(sim: Pick<SplatRushSim, "o" | "elapsed" | "player" | "camera">): Shown {
  const { player: p, camera: c } = sim;
  return {
    distance: sim.o.distance, elapsed: sim.elapsed, back: 0,
    player: { x: p.x, y: p.y, z: p.z, rotX: p.rotX, scale: p.scale },
    camera: { x: c.x, y: c.y, z: c.z, lookX: c.lookX, lookY: c.lookY, lookZ: c.lookZ }
  };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.distance - a.distance;
  if (moved < 0 || moved > SNAP_DISTANCE) return { ...b, back: 0 };
  const m = <T extends Record<string, number>>(x: T, y: T): T => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(y)) out[k] = mix(x[k]!, y[k]!, t);
    return out as T;
  };
  return {
    distance: b.distance, elapsed: mix(a.elapsed, b.elapsed, t), back: (1 - t) * moved,
    player: m(a.player, b.player), camera: m(a.camera, b.camera)
  };
}

/** The sim the world runtime reads, with the presented ball and camera and the scrolling entities stepped back (the real sim is untouched). */
export function viewOf(sim: SplatRushSim, shown: Shown): SplatRushSim {
  const back = shown.back;
  const shift = <T extends { z: number }>(list: readonly T[]): T[] => (back === 0 ? (list as T[]) : list.map((e) => ({ ...e, z: e.z - back })));
  return Object.create(sim, {
    o: { value: { ...sim.o, distance: sim.o.distance - back } },
    elapsed: { value: shown.elapsed },
    player: { value: { ...sim.player, ...shown.player } },
    camera: { value: { ...shown.camera } },
    segments: { value: shift(sim.segments) },
    gates: { value: shift(sim.gates) },
    powerups: { value: shift(sim.powerups) },
    splatters: { value: shift(sim.splatters) }
  }) as SplatRushSim;
}

export function createSplatPresenter(getSim: () => Pick<SplatRushSim, "o" | "elapsed" | "player" | "camera">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getSim()), blend: blendShown });
}
