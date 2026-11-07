/**
 * Fixed-step presentation: the sim scrolls obstacles toward a fixed hopper; the hopper's y and the chase camera
 * interpolate between the last two steps on high-refresh displays. Interpolated values never feed back into the sim.
 */
import { createFixedStepPresenter, type FixedStepPresenter } from "@aura3d/engine/game";
import { CONFIG, type BeatHopperSim, type Pose } from "./sim";

export interface CameraPose {
  x: number; y: number; z: number;
  lookX: number; lookY: number; lookZ: number;
}

export interface Shown {
  t: number;
  dist: number;
  y: number;
  pose: Pose;
  camera: CameraPose;
}

/** A restart jumps the distance back to zero and must not smear. */
export const SNAP_DISTANCE = 5;

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Chase camera: lerps 0.1 per step towards a rig behind and above the hopper, looking 10 m ahead; a 2 s intro
 * eases in from higher and farther. Shake is added at read time only (presentation, never the sim).
 */
export class ChaseCamera {
  prev: CameraPose;
  cur: CameraPose;
  constructor(sim: BeatHopperSim) {
    this.cur = this.target(sim, true);
    this.prev = { ...this.cur };
  }
  private target(sim: BeatHopperSim, intro: boolean): CameraPose {
    const o = sim.o;
    const e = intro ? Math.max(0, 1 - o.t / 2) : 0;
    const e2 = e * e;
    return { x: 0, y: o.y * 0.35 + 4.6 + 7 * e2, z: 8.5 + 7 * e2, lookX: 0, lookY: 1 + o.y * 0.3, lookZ: -10 };
  }
  reset(sim: BeatHopperSim): void {
    this.cur = this.target(sim, true);
    this.prev = { ...this.cur };
  }
  /** Call once after every sim step. */
  step(sim: BeatHopperSim): void {
    const t = this.target(sim, sim.o.phase === "playing" && sim.o.t < 2);
    this.prev = this.cur;
    const c = this.cur;
    this.cur = {
      x: c.x + 0.1 * (t.x - c.x), y: c.y + 0.1 * (t.y - c.y), z: c.z + 0.1 * (t.z - c.z),
      lookX: c.lookX + 0.1 * (t.lookX - c.lookX), lookY: c.lookY + 0.1 * (t.lookY - c.lookY), lookZ: c.lookZ + 0.1 * (t.lookZ - c.lookZ)
    };
  }
  /** Camera between the last two steps; damage shake rides on `shakeAt` unless reduced motion asks for steady. */
  at(t: number, sim: BeatHopperSim, reducedMotion: boolean): CameraPose {
    const a = this.prev, b = this.cur;
    const pose: CameraPose = {
      x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t),
      lookX: mix(a.lookX, b.lookX, t), lookY: mix(a.lookY, b.lookY, t), lookZ: mix(a.lookZ, b.lookZ, t)
    };
    const since = sim.o.t - sim.o.shakeAt;
    if (!reducedMotion && since >= 0 && since < 0.4) {
      const k = (0.4 - since) * 0.55;
      pose.x += Math.sin(since * 61) * k;
      pose.y += Math.cos(since * 73) * k * 0.6;
    }
    return pose;
  }
}

export function shownOf(sim: BeatHopperSim, camera: CameraPose): Shown {
  return { t: sim.o.t, dist: sim.o.dist, y: sim.o.y, pose: sim.o.pose, camera: { ...camera } };
}

export function blendShown(a: Shown, b: Shown, t: number): Shown {
  const moved = b.dist - a.dist;
  if (moved < 0 || moved > SNAP_DISTANCE || b.t < a.t) return { ...b, camera: { ...b.camera } };
  const m = (x: CameraPose, y: CameraPose): CameraPose => ({
    x: mix(x.x, y.x, t), y: mix(x.y, y.y, t), z: mix(x.z, y.z, t),
    lookX: mix(x.lookX, y.lookX, t), lookY: mix(x.lookY, y.lookY, t), lookZ: mix(x.lookZ, y.lookZ, t)
  });
  return { t: mix(a.t, b.t, t), dist: b.dist, y: mix(a.y, b.y, t), pose: b.pose, camera: m(a.camera, b.camera) };
}

export function createBeatPresenter(snapshot: () => Shown): FixedStepPresenter<Shown> {
  return createFixedStepPresenter<Shown>({ snapshot, blend: blendShown });
}

/** Title/results poses (presentation only): a slow orbit around the hopper on the results card. */
export function cardPose(phase: string, seconds: number): CameraPose | null {
  if (phase === "splash") return { x: 5.5, y: 4.2, z: 9.5, lookX: 0, lookY: 1.2, lookZ: -8 };
  if (phase === "gameOver") {
    const a = seconds * 0.22;
    return { x: Math.sin(a) * 7, y: 4.4, z: Math.cos(a) * 7 + 2, lookX: 0, lookY: 1, lookZ: -4 };
  }
  return null;
}

/** Squash-and-stretch of the hopper read from the presented pose (duck folds to 0.6 height). */
export function poseScale(pose: Pose, vy: number): { sx: number; sy: number; sz: number } {
  if (pose === "duck") return { sx: 1.2, sy: 0.6, sz: 1.2 };
  if (pose === "air") {
    const k = Math.min(0.18, Math.abs(vy) * 0.02);
    return { sx: 1 - k * 0.5, sy: 1 + k, sz: 1 - k * 0.5 };
  }
  return { sx: 1, sy: 1, sz: 1 };
}

/** Beat pulse ring spawn helper: seconds since the last judgement, or null when nothing fresh. */
export function freshJudgement(sim: BeatHopperSim, lastAt: number): { kind: "perfect" | "good" | "miss"; at: number } | null {
  const j = sim.o.lastJudge;
  if (j.kind === null || j.at <= lastAt || sim.o.t - j.at > CONFIG.GOOD_WINDOW) return null;
  return { kind: j.kind, at: j.at };
}