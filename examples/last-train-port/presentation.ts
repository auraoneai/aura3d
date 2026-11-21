import { createSnapshotInterpolator, type SnapshotInterpolator } from "@aura3d/engine/game";
import type { SimState } from "./sim";

/** What the renderer reads of one simulation step that moves continuously: where the tram is on the leg, how fast, and how it rolls. */
export interface Shown {
  leg: number;
  distance: number;
  speed: number;
  roll: number;
}

/** Arriving, a new service or a night swap restarts the distance; a step never moves the tram backwards by more than this. */
export const BACKWARD_SNAP = 0.5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(sim: Pick<SimState, "leg" | "distance" | "speed" | "roll">): Shown {
  return { leg: sim.leg, distance: sim.distance, speed: sim.speed, roll: sim.roll };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  if (a.leg !== b.leg || b.distance < a.distance - BACKWARD_SNAP) return b;
  return { leg: b.leg, distance: mix(a.distance, b.distance, t), speed: mix(a.speed, b.speed, t), roll: mix(a.roll, b.roll, t) };
}

/** The sim the world runtime reads, with the presented tram pose in place of the latest step (the real sim is untouched). */
export function viewOf(sim: SimState, shown: Shown): SimState {
  return { ...sim, distance: shown.distance, speed: shown.speed, roll: shown.roll };
}

export function createTramPresenter(getSim: () => Pick<SimState, "leg" | "distance" | "speed" | "roll">): SnapshotInterpolator<Shown> {
  return createSnapshotInterpolator<Shown>({
    create: () => ({ leg: 0, distance: 0, speed: 0, roll: 0 }),
    snapshot(out) {
      const s = getSim();
      const dst = out ?? { leg: 0, distance: 0, speed: 0, roll: 0 };
      dst.leg = s.leg;
      dst.distance = s.distance;
      dst.speed = s.speed;
      dst.roll = s.roll;
      return dst;
    },
    blend(a, b, t, out) {
      const dst = out ?? { leg: 0, distance: 0, speed: 0, roll: 0 };
      dst.leg = b.leg;
      dst.distance = mix(a.distance, b.distance, t);
      dst.speed = mix(a.speed, b.speed, t);
      dst.roll = mix(a.roll, b.roll, t);
      return dst;
    },
    snap: (a, b) => a.leg !== b.leg || b.distance < a.distance - BACKWARD_SNAP
  });
}
