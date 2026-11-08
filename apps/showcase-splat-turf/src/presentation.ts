/**
 * Fixed-step presentation for Splat Turf: the world scrolls toward a fixed ball, so scrolling batches are
 * stepped back by the unelapsed part of the last step while the ball and camera interpolate. The chase
 * camera lives here (presentation only): 0.1-per-step lerp, look-ahead -10 z, intro ease over the first 2 s.
 */
import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import type { SplatTurfSim } from "./sim";

export interface Shown {
  distance: number;
  time: number;
  laneOffset: number;
  /** World-space scroll not yet elapsed in the last step (scrolling batches step back by this). */
  back: number;
}

/** A restart jumps the distance back to zero and must not smear. */
export const SNAP_DISTANCE = 5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function shownOf(sim: Pick<SplatTurfSim, "o">): Shown {
  return { distance: sim.o.distance, time: sim.o.time, laneOffset: sim.o.laneOffset, back: 0 };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.distance - a.distance;
  if (moved < 0 || moved > SNAP_DISTANCE) return { ...b, back: 0 };
  return {
    distance: b.distance,
    time: mix(a.time, b.time, t),
    laneOffset: mix(a.laneOffset, b.laneOffset, t),
    back: (1 - t) * moved
  };
}

export function createTurfPresenter(getSim: () => Pick<SplatTurfSim, "o">): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getSim()), blend: blendShown });
}

export interface CameraPose { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number }

/**
 * Chase camera without shake (the world adds shake only when motion is full). Same 0.1 lerp on every
 * step, so reduced-motion frames match the full-motion pose whenever no shake is running.
 */
export class ChaseCamera {
  prev: CameraPose;
  cur: CameraPose;

  constructor(sim: Pick<SplatTurfSim, "o">) {
    this.cur = ChaseCamera.target(sim);
    this.prev = { ...this.cur };
  }

  private static target(sim: Pick<SplatTurfSim, "o">): CameraPose {
    const o = sim.o;
    const intro = Math.max(0, 1 - o.time / 2);
    const title = o.phase === "splash" ? 1 : 0;
    const lift = intro * intro * 4 + title * 3;
    return {
      x: 0.5 * o.laneOffset, y: 5 + lift, z: 9 + lift,
      lookX: o.laneOffset, lookY: 0.5, lookZ: -10
    };
  }

  reset(sim: Pick<SplatTurfSim, "o">): void {
    this.cur = ChaseCamera.target(sim);
    this.prev = { ...this.cur };
  }

  /** Call once after every sim step. */
  step(sim: Pick<SplatTurfSim, "o">): void {
    const t = ChaseCamera.target(sim);
    this.prev = this.cur;
    const c = this.cur;
    this.cur = {
      x: c.x + 0.1 * (t.x - c.x), y: c.y + 0.1 * (t.y - c.y), z: c.z + 0.1 * (t.z - c.z),
      lookX: c.lookX + 0.1 * (t.lookX - c.lookX), lookY: c.lookY + 0.1 * (t.lookY - c.lookY), lookZ: c.lookZ + 0.1 * (t.lookZ - c.lookZ)
    };
  }

  at(t: number): CameraPose {
    const a = this.prev, b = this.cur;
    return {
      x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t),
      lookX: mix(a.lookX, b.lookX, t), lookY: mix(a.lookY, b.lookY, t), lookZ: mix(a.lookZ, b.lookZ, t)
    };
  }
}