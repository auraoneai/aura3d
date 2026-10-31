/**
 * H47-C1 / H47-P2: broadcast camera language for the new look.
 *
 * - A 6 s rail fly-in per court with letterbox bars (`introRail`, `railPose`). The sim is held while it runs and any key or
 *   pointer skips it on the next frame; reduced motion and the measurement paths never start it.
 * - A 2.4 s replay of the last 0.96 s of play at 0.4x after a Jam dunk (`replaySourceTime`, `replayPose`), drawn from the
 *   presenter's recorded poses. Depth of field and motion blur are enabled only while an intro or replay runs (`postFor`).
 * - The long-lens live camera (fov 30-34, eye lower than the 4.6 chase) and the FOV kick on makes (`LIVE_CAM`, `MAKE_FOV_KICK`).
 *
 * Pure functions plus one small state machine (`createBroadcast`), so the timing and the rail geometry are unit tested.
 */
import type { CourtId } from "./courtRigs";

export type V3 = [number, number, number];

export interface CameraPose {
  readonly eye: V3;
  readonly target: V3;
  readonly fov: number;
}

export const INTRO_SECONDS = 6;
export const REPLAY_SECONDS = 2.4;
export const REPLAY_RATE = 0.4;
/** Seconds of recorded play a replay covers (2.4 s at 0.4x). */
export const REPLAY_SOURCE_SECONDS = REPLAY_SECONDS * REPLAY_RATE;

/**
 * Long-lens live camera: fov 32 on the chase, 34 on the shot cam (4.6: 38 and 44). The eye stands farther out so the
 * framing holds with the narrower lens. The shot cam is 2 m lower (4.9 -> 2.9 m); the chase eye drops 0.8 m (3.0 -> 2.2 m)
 * because a lower chase eye puts the dribbling hand and the ball on the same pixels (see updateCamera in main.ts).
 */
export const LIVE_CAM = {
  chase: { offset: [6.7, 2.2, 5.0] as V3, targetOffset: [-0.2, 1.0, -0.9] as V3, fov: 32 },
  shot: { offset: [9.1, 2.9, 6.2] as V3, fov: 34 }
} as const;

/** FOV kick on a made basket (degrees, decays with the existing camera punch). */
export const MAKE_FOV_KICK = 3;

/**
 * Per-court fly-in rails: four eyes from high and wide down to the broadcast spot behind the sideline, looking at the
 * court centre. Every eye stays at least 3 m from the court's poles (rucker floods, shanghai lamps, venice palms) and the
 * first and last eyes stand >= 8 m apart.
 */
const INTRO_RAILS: Readonly<Record<CourtId, readonly V3[]>> = {
  rucker: [[-24, 16, -16], [-16, 12, 16], [-6, 6.5, 19], [0, 5.2, 16.5]],
  venice: [[0, 12, -26], [20, 8, -6], [20, 6.5, 4], [0, 5.2, 16.5]],
  athens: [[26, 18, 4], [16, 10, 18], [4, 6, 19], [0, 5.2, 16.5]],
  manila: [[-8, 7.4, -14], [-6, 6.2, -2], [-4, 5.4, 12], [0, 5.2, 16.5]],
  shanghai: [[18, 14, 24], [4, 9, 26], [-6, 6, 19], [0, 5.2, 16.5]],
  orbit: [[0, 26, -30], [-22, 14, -4], [-10, 7, 16], [0, 5.2, 16.5]]
};
const INTRO_TARGET: V3 = [0, 1.4, 3.4];
const INTRO_FOV: readonly [number, number] = [48, 34];

export function introRail(court: CourtId): readonly V3[] {
  return INTRO_RAILS[court];
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Camera pose on the court's rail at `seconds` into the intro (Catmull-Rom through the points, eased). */
export function railPose(court: CourtId, seconds: number): CameraPose {
  const pts = INTRO_RAILS[court];
  const u = smooth(Math.max(0, Math.min(1, seconds / INTRO_SECONDS)));
  const seg = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)));
  const t = u * (pts.length - 1) - seg;
  const p = (i: number): V3 => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  const a = p(seg - 1), b = p(seg), c = p(seg + 1), d = p(seg + 2);
  const eye: V3 = [catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t), catmull(a[2], b[2], c[2], d[2], t)];
  return { eye, target: [...INTRO_TARGET] as V3, fov: INTRO_FOV[0] + (INTRO_FOV[1] - INTRO_FOV[0]) * u };
}

/** Recorded-play time (seconds before the replay began, negative) a replay frame shows. */
export function replaySourceTime(replaySeconds: number): number {
  const r = Math.max(0, Math.min(REPLAY_SECONDS, replaySeconds));
  return -REPLAY_SOURCE_SECONDS + r * REPLAY_RATE;
}

/** Replay camera: low under the rim on the baseline side, swinging 40 degrees round the ball, fov 28. */
export function replayPose(replaySeconds: number, ball: V3, rim: V3): CameraPose {
  const u = Math.max(0, Math.min(1, replaySeconds / REPLAY_SECONDS));
  const a = -0.35 + u * 0.7;
  const r = 5.2;
  const eye: V3 = [rim[0] + Math.sin(a) * r, 1.3, rim[2] + 1.6 + Math.cos(a) * r];
  return { eye, target: [ball[0] * 0.6 + rim[0] * 0.4, Math.max(1.6, ball[1]), ball[2] * 0.6 + rim[2] * 0.4], fov: 28 };
}

export interface BroadcastPost {
  readonly depthOfField: boolean;
  readonly motionBlur: boolean;
  /** Focus distance in metres while DOF is on. */
  readonly focusDistance?: number;
}

export type BroadcastShot = { readonly kind: "intro"; readonly court: CourtId; t: number } | { readonly kind: "replay"; t: number };

export interface BroadcastOptions {
  /** Reduced motion, `?intro=0`, `?look=original` or a measurement path: intros and replays never start. */
  readonly disabled: boolean;
}

export interface Broadcast {
  readonly shot: BroadcastShot | null;
  readonly active: boolean;
  startIntro(court: CourtId): boolean;
  startReplay(): boolean;
  /** Ends the running shot; the caller resumes the live camera on the same frame. */
  skip(): void;
  /** Advance by real seconds; returns the shot that ran this frame (null once finished). */
  update(realSeconds: number): BroadcastShot | null;
  post(eye?: V3, focus?: V3): BroadcastPost;
}

export function createBroadcast(options: BroadcastOptions): Broadcast {
  let shot: BroadcastShot | null = null;
  return {
    get shot() { return shot; },
    get active() { return shot !== null; },
    startIntro(court) {
      if (options.disabled) return false;
      shot = { kind: "intro", court, t: 0 };
      return true;
    },
    startReplay() {
      if (options.disabled) return false;
      shot = { kind: "replay", t: 0 };
      return true;
    },
    skip() { shot = null; },
    update(realSeconds) {
      if (!shot) return null;
      // Wall-clock seconds, capped at 1 s a frame (GU47 phase 2: a 0.1 s cap stretched the 6 s intro to a minute at 1-2 fps).
      shot.t += Math.max(0, Math.min(1, realSeconds));
      const end = shot.kind === "intro" ? INTRO_SECONDS : REPLAY_SECONDS;
      if (shot.t >= end) { shot = null; return null; }
      return shot;
    },
    post(eye, focus) {
      if (!shot) return { depthOfField: false, motionBlur: false };
      const focusDistance = eye && focus ? Math.hypot(eye[0] - focus[0], eye[1] - focus[1], eye[2] - focus[2]) : undefined;
      return { depthOfField: true, motionBlur: shot.kind === "intro", ...(focusDistance !== undefined ? { focusDistance } : {}) };
    }
  };
}

/** Letterbox bars (DOM, 10% of the height each) shown while a broadcast shot runs. */
export function createLetterbox(stage: HTMLElement): { show(on: boolean): void } {
  const bars = ["top", "bottom"].map((edge) => {
    const el = document.createElement("div");
    el.className = `hoops-bar hoops-bar-${edge}`;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `position:fixed;left:0;right:0;${edge}:0;height:10vh;background:#0b0c0e;pointer-events:none;z-index:9;transform:scaleY(0);transform-origin:${edge};transition:transform 240ms ease-out;`;
    stage.appendChild(el);
    return el;
  });
  let shown = false;
  return {
    show(on) {
      if (on === shown) return;
      shown = on;
      for (const el of bars) el.style.transform = on ? "scaleY(1)" : "scaleY(0)";
    }
  };
}

/** One recorded presenter step (athlete and ball poses) for the replay ring. */
export interface ReplayFrame {
  readonly time: number;
  readonly athletes: readonly { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number }[];
  readonly ball: V3;
}

/** Fixed-capacity ring of recorded steps; `at(sourceTime)` picks the step nearest `latest.time + sourceTime`. */
export class ReplayRing {
  private readonly frames: ReplayFrame[] = [];
  constructor(private readonly capacity: number) {}

  push(frame: ReplayFrame): void {
    this.frames.push(frame);
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  get size(): number { return this.frames.length; }

  clear(): void { this.frames.length = 0; }

  /** Freeze a copy for one replay (the live ring keeps recording after the replay ends). */
  snapshot(): ReplayRing {
    const copy = new ReplayRing(this.capacity);
    for (const f of this.frames) copy.push(f);
    return copy;
  }

  at(sourceTime: number): ReplayFrame | undefined {
    const last = this.frames[this.frames.length - 1];
    if (!last) return undefined;
    const want = last.time + sourceTime;
    let best = this.frames[0]!;
    for (const f of this.frames) if (Math.abs(f.time - want) < Math.abs(best.time - want)) best = f;
    return best;
  }
}
