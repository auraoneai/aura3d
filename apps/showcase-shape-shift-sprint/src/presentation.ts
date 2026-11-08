/**
 * Fixed-step presentation: the world scrolls toward a fixed player, so scrolling entities are shown
 * stepped back by the unelapsed fraction of the last step while the player and camera interpolate.
 * Interpolated values are never fed back into the sim. The chase camera lives here (the sim has none):
 * 0.1-per-step lerp, look-ahead -10 z, 2 s intro ease; shake is a pure function of the sim clock.
 */
import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import { drainPopups } from "../../../examples/shared/runner-kit/index";
import type { ShapeShiftSim } from "./sim";

export interface CameraPose { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number }

export interface Shown {
  distance: number;
  elapsed: number;
  /** How far the world scrolled in the last step, scaled by the unelapsed fraction. */
  back: number;
  player: { x: number; y: number; z: number; rotX: number; scale: number };
  camera: CameraPose;
}

/** A restart jumps the distance back to zero and must not smear. */
export const SNAP_DISTANCE = 5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Chase camera without shake; call `step` once after every sim step, `at(t)` for the blended pose. */
export class ChaseCamera {
  prev: CameraPose;
  cur: CameraPose;
  constructor() {
    this.cur = { x: 0, y: 14, z: 17, lookX: 0, lookY: 0.55, lookZ: -10 };
    this.prev = { ...this.cur };
  }
  reset(): void {
    this.cur = { x: 0, y: 14, z: 17, lookX: 0, lookY: 0.55, lookZ: -10 };
    this.prev = { ...this.cur };
  }
  step(sim: Pick<ShapeShiftSim, "o" | "player">): void {
    const p = sim.player;
    const e = Math.max(0, 1 - sim.o.introT / 2), e2 = e * e;
    const tx = 0.5 * p.x, ty = p.y + 5 + 9 * e2, tz = p.z + 9 + 8 * e2;
    this.prev = this.cur;
    const c = this.cur;
    this.cur = {
      x: c.x + 0.1 * (tx - c.x), y: c.y + 0.1 * (ty - c.y), z: c.z + 0.1 * (tz - c.z),
      lookX: p.x, lookY: p.y, lookZ: p.z - 10
    };
  }
  at(t: number): CameraPose {
    const a = this.prev, b = this.cur;
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), lookX: mix(a.lookX, b.lookX, t), lookY: mix(a.lookY, b.lookY, t), lookZ: mix(a.lookZ, b.lookZ, t) };
  }
}

/** Deterministic damage shake (presentation only; never consumes RNG draws). */
export function shakeOffset(elapsed: number, shakeTimer: number): { x: number; y: number } {
  if (shakeTimer <= 0) return { x: 0, y: 0 };
  const k = shakeTimer / 0.4;
  return { x: Math.sin(elapsed * 47) * 0.22 * k, y: Math.cos(elapsed * 61) * 0.14 * k };
}

export function shownOf(sim: Pick<ShapeShiftSim, "o" | "elapsed" | "player">, camera: CameraPose): Shown {
  const p = sim.player;
  return {
    distance: sim.o.distance, elapsed: sim.elapsed, back: 0,
    player: { x: p.x, y: p.y, z: p.z, rotX: p.rotX, scale: p.scale },
    camera: { ...camera }
  };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.distance - a.distance;
  if (moved < 0 || moved > SNAP_DISTANCE) return { ...b, back: 0 };
  const m = <T extends Record<string, number>>(x: T, y: T): T => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(y)) out[k] = mix(x[k] as number, y[k] as number, t);
    return out as T;
  };
  const pose = (x: CameraPose, y: CameraPose): CameraPose => ({
    x: mix(x.x, y.x, t), y: mix(x.y, y.y, t), z: mix(x.z, y.z, t),
    lookX: mix(x.lookX, y.lookX, t), lookY: mix(x.lookY, y.lookY, t), lookZ: mix(x.lookZ, y.lookZ, t)
  });
  return {
    distance: b.distance, elapsed: mix(a.elapsed, b.elapsed, t), back: (1 - t) * moved,
    player: m(a.player, b.player), camera: pose(a.camera, b.camera)
  };
}

/** The sim the world reads: presented player/camera, scrolling entities stepped back (the real sim is untouched). */
export function viewOf(sim: ShapeShiftSim, shown: Shown): ShapeShiftSim {
  const back = shown.back;
  const shift = <T extends { z: number }>(list: readonly T[]): T[] => (back === 0 ? (list as T[]) : list.map((e) => ({ ...e, z: e.z - back })));
  return Object.create(sim, {
    o: { value: { ...sim.o, distance: sim.o.distance - back } },
    elapsed: { value: shown.elapsed },
    scroll: { value: sim.scroll - back },
    player: { value: { ...sim.player, ...shown.player } },
    rows: { value: shift(sim.rows) },
    tokens: { value: shift(sim.tokens) },
    segments: { value: shift(sim.segments) }
  }) as ShapeShiftSim;
}

export function createShapePresenter(snapshot: () => Shown): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot, blend: blendShown });
}

export { drainPopups };