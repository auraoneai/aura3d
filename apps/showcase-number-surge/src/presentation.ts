/**
 * Number Surge presentation: fixed-step interpolation over the pure sim. The
 * renderer reads blended poses only; interpolated values never flow back into
 * the sim. Entities live in a scrolling frame and are stepped back by the
 * unelapsed fraction of the last step (Splat pattern).
 */
import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import { LOOK } from "./look";
import type { GameState, NumberSurgeSim } from "./sim";

export interface CamPose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

export interface Shown {
  distance: number;
  time: number;
  laneOffset: number;
  /** World-space distance to step the scrolling entities back (unelapsed part of the last step). */
  back: number;
  cam: CamPose;
}

/** A restart jumps the distance back to zero; never smear across it. */
export const SNAP_DISTANCE = 5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Chase camera: lerped 0.1 per sim step toward the ball's lane, look-ahead −10 z,
 * plus a decaying shake on damage/smash (presentation only — the sim never sees it).
 */
export class ChaseCamera {
  prev: CamPose;
  cur: CamPose;
  private shake = 0;
  private shakeT = 0;

  constructor() {
    this.cur = { x: 0, y: LOOK.camera.height, z: LOOK.camera.back, lookX: 0, lookY: 1, lookZ: LOOK.camera.lookAheadZ };
    this.prev = { ...this.cur };
  }

  reset(): void {
    this.cur = { x: 0, y: LOOK.camera.height, z: LOOK.camera.back, lookX: 0, lookY: 1, lookZ: LOOK.camera.lookAheadZ };
    this.prev = { ...this.cur };
    this.shake = 0;
    this.shakeT = 0;
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** Call once after every sim step. `jitter` is a presentation-only random source (never the gameplay RNG). */
  step(o: GameState, jitter: () => number): void {
    const c = LOOK.camera;
    const tx = 0.45 * o.laneOffset;
    this.prev = { ...this.cur };
    this.shakeT += 1 / 60;
    this.shake = Math.max(0, this.shake - 2.4 / 60);
    const s = this.shake;
    this.cur = {
      x: this.cur.x + c.lerp * (tx - this.cur.x) + (jitter() - 0.5) * s * 0.6,
      y: this.cur.y + c.lerp * (c.height - this.cur.y) + (jitter() - 0.5) * s * 0.4,
      z: this.cur.z + c.lerp * (c.back - this.cur.z),
      lookX: o.laneOffset * 0.6,
      lookY: 1,
      lookZ: c.lookAheadZ
    };
  }

  at(t: number): CamPose {
    const a = this.prev, b = this.cur;
    return {
      x: mix(a.x, b.x, t),
      y: mix(a.y, b.y, t),
      z: mix(a.z, b.z, t),
      lookX: mix(a.lookX, b.lookX, t),
      lookY: mix(a.lookY, b.lookY, t),
      lookZ: mix(a.lookZ, b.lookZ, t)
    };
  }
}

/** Steady camera for reduced motion: same chase target, no shake (C8). */
export class SteadyCamera extends ChaseCamera {
  override addShake(): void {
    // reduced motion: no camera shake
  }

  override step(o: GameState): void {
    super.step(o, () => 0.5);
  }
}

export function shownOf(sim: NumberSurgeSim, cam: CamPose): Shown {
  return { distance: sim.o.distance, time: sim.o.time, laneOffset: sim.o.laneOffset, back: 0, cam: { ...cam } };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.distance - a.distance;
  if (moved < 0 || moved > SNAP_DISTANCE) return { ...b, back: 0, cam: { ...b.cam } };
  return {
    distance: b.distance,
    time: mix(a.time, b.time, t),
    laneOffset: mix(a.laneOffset, b.laneOffset, t),
    back: (1 - t) * moved,
    cam: {
      x: mix(a.cam.x, b.cam.x, t),
      y: mix(a.cam.y, b.cam.y, t),
      z: mix(a.cam.z, b.cam.z, t),
      lookX: mix(a.cam.lookX, b.cam.lookX, t),
      lookY: mix(a.cam.lookY, b.cam.lookY, t),
      lookZ: mix(a.cam.lookZ, b.cam.lookZ, t)
    }
  };
}

export function createNumberSurgePresenter(getSim: () => NumberSurgeSim, getCam: () => CamPose): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getSim(), getCam()), blend: blendShown });
}