/**
 * Fixed-step presentation: interpolates the ball and chase camera between sim steps via the engine presenter,
 * steps the scrolling entities back by the unelapsed fraction, and keeps a reduced-motion steady camera.
 * Interpolated values never flow back into the sim.
 */
import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import { CONFIG, type PolarityOrbsSim } from "./sim";

export interface Shown {
  distance: number;
  tick: number;
  /** World scroll to step entities back by (the unelapsed part of the last step). */
  back: number;
  player: { x: number; y: number; z: number; rotX: number; scale: number };
  camera: { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number };
}

export const SNAP_DISTANCE = 5;
export const INTRO_SECONDS = 2;
export const CAMERA_FAR = 400;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function playerOf(sim: Pick<PolarityOrbsSim, "o">): Shown["player"] {
  const o = sim.o;
  return { x: o.laneOffset, y: 0.5 * o.ballScale, z: 0, rotX: -o.distance / 0.5, scale: o.ballScale };
}

/** Presentation-only jitter stream: never draws from the gameplay RNG. */
class Jitter {
  private s = 0x9e3779b9;
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) >>> 0;
    return this.s / 0xffffffff - 0.5;
  }
}

/**
 * Chase camera: lerps 0.1 per step towards half the player's lateral offset, look-ahead -10 z, a 2 s intro ease,
 * and damage shake from a private jitter stream. `steady` (reduced motion) drops the shake.
 */
export class CameraRig {
  prev: Shown["camera"];
  cur: Shown["camera"];
  private readonly jitter = new Jitter();

  constructor(sim: Pick<PolarityOrbsSim, "o">, public steady = false) {
    this.cur = this.target(sim, 1);
    this.prev = { ...this.cur };
  }

  reset(sim: Pick<PolarityOrbsSim, "o">): void {
    this.cur = this.target(sim, 1);
    this.prev = { ...this.cur };
  }

  private target(sim: Pick<PolarityOrbsSim, "o">, intro: number): Shown["camera"] {
    const o = sim.o;
    const e = Math.max(0, 1 - intro), e2 = e * e;
    return {
      x: 0.5 * o.laneOffset,
      y: 5.4 + 9 * e2,
      z: 9 + 8 * e2,
      lookX: o.laneOffset,
      lookY: 0.9,
      lookZ: -10
    };
  }

  /** Call once after every sim step. */
  step(sim: Pick<PolarityOrbsSim, "o">): void {
    const o = sim.o;
    const t = this.target(sim, Math.min(1, o.tick / (INTRO_SECONDS * 60)));
    const shake = this.steady ? 0 : o.shake;
    const jx = shake * this.jitter.next() * 0.5;
    const jy = shake * this.jitter.next() * 0.35;
    this.prev = this.cur;
    const c = this.cur;
    this.cur = {
      x: c.x + 0.1 * (t.x + jx - c.x),
      y: c.y + 0.1 * (t.y + jy - c.y),
      z: c.z + 0.1 * (t.z - c.z),
      lookX: c.lookX + 0.1 * (t.lookX - c.lookX),
      lookY: c.lookY + 0.1 * (t.lookY - c.lookY),
      lookZ: c.lookZ + 0.1 * (t.lookZ - c.lookZ)
    };
  }

  at(t: number): Shown["camera"] {
    const a = this.prev, b = this.cur;
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), lookX: mix(a.lookX, b.lookX, t), lookY: mix(a.lookY, b.lookY, t), lookZ: mix(a.lookZ, b.lookZ, t) };
  }
}

export function shownOf(sim: Pick<PolarityOrbsSim, "o">, camera: Shown["camera"]): Shown {
  return { distance: sim.o.distance, tick: sim.o.tick, back: 0, player: playerOf(sim), camera: { ...camera } };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.distance - a.distance;
  if (moved < 0 || moved > SNAP_DISTANCE) return { ...b, back: 0 };
  const m = <T extends Record<string, number>>(x: T, y: T): T => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(y)) out[k] = mix(x[k] as number, y[k] as number, t);
    return out as T;
  };
  return {
    distance: b.distance, tick: mix(a.tick, b.tick, t), back: (1 - t) * moved,
    player: m(a.player, b.player), camera: m(a.camera, b.camera)
  };
}

/** A read-only view of the sim with interpolated player/camera and entities stepped back; the real sim is untouched. */
export function viewOf(sim: PolarityOrbsSim, shown: Shown): PolarityOrbsSim {
  const back = shown.back;
  const shift = <T extends { z: number }>(list: readonly T[]): T[] => (back === 0 ? (list as T[]) : list.map((e) => ({ ...e, z: e.z - back })));
  return Object.create(sim, {
    o: { value: { ...sim.o, distance: sim.o.distance - back, tick: shown.tick } },
    orbs: { value: shift(sim.orbs) },
    powerups: { value: shift(sim.powerups) },
    particles: { value: shift(sim.particles) },
    rows: { value: shift(sim.rows) }
  }) as PolarityOrbsSim;
}

export function createPolarityPresenter(getSim: () => PolarityOrbsSim, rig: CameraRig): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot: () => shownOf(getSim(), rig.cur), blend: blendShown });
}

/** Speed-driven FOV (presentation only; reduced motion keeps the base FOV). */
export function chaseFov(speed: number, reducedMotion: boolean): number {
  const base = 60;
  if (reducedMotion) return base;
  const k = Math.min(1, Math.max(0, (speed - CONFIG.SPEED_INIT) / (CONFIG.MAX_SPEED - CONFIG.SPEED_INIT)));
  return base + 10 * k;
}