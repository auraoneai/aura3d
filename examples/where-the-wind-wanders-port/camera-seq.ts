/**
 * WW47-C1: the two camera sequences. A 6 s intro crane from a high view over the valley (the belltower in frame) down to
 * the follow pose at the start, and an 8 s finale orbit rising round the bell once it has rung. The follow camera is
 * suspended while a sequence runs; any key skips it on the next frame; reduced motion skips both (a cut).
 * Presentation only: the sim never reads these poses.
 */
import { BELL, CAMERA_OFFSET, START } from "./sim";
import { terrainHeight } from "./terrain";

export type Vec3 = [number, number, number];
export interface CameraPose { readonly position: Vec3; readonly target: Vec3; readonly fov: number }
export type SequenceId = "intro" | "finale";

export const INTRO_SECONDS = 6;
export const FINALE_SECONDS = 8;
/** Finale orbit: radius round the bell (clear of the tower's 4.6 m frame and the nearest trees) and the rise. */
export const FINALE_RADIUS = 12;
export const FINALE_HEIGHT: readonly [number, number] = [5.5, 11];

const smooth = (t: number): number => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** The follow pose the intro ends on: the world's look target at the start and the follow offset. */
export function followPoseAtStart(fov: number): CameraPose {
  const target: Vec3 = [START.x + 2, terrainHeight(START.x, START.z) + 1.8, START.z - 3.5];
  return { position: [target[0] + CAMERA_OFFSET.x, target[1] + CAMERA_OFFSET.y, target[2] + CAMERA_OFFSET.z], target, fov };
}

/** Intro frame 0: high over the south of the valley, looking along it toward the bell in the east. */
export const INTRO_FROM: CameraPose = { position: [-8, 24, 46], target: [22, 2, 2], fov: 46 };

/** `end` is the follow pose on screen when the crane lands (so the hand-over to the follow camera has no jump). */
export function introPose(t: number, end: CameraPose = followPoseAtStart(43)): CameraPose {
  const fov = end.fov;
  const k = smooth(t / INTRO_SECONDS);
  // the crane swings down on a slight arc: height falls faster than the distance closes
  const pos = mix3(INTRO_FROM.position, end.position, k);
  pos[1] = mix(INTRO_FROM.position[1], end.position[1], Math.sqrt(k));
  return { position: pos, target: mix3(INTRO_FROM.target, end.target, k), fov: mix(INTRO_FROM.fov, fov, k) };
}

/** Seconds the finale takes to leave and to rejoin the follow pose. */
export const FINALE_BLEND = 1.5;

/** The orbit alone: from the west, half a turn round the bell, rising over the dusk valley. */
export function finaleOrbit(t: number, fov: number): CameraPose {
  const k = smooth(t / FINALE_SECONDS);
  const by = terrainHeight(BELL.x, BELL.z);
  const angle = Math.PI * (0.85 + 0.55 * k);
  const position: Vec3 = [BELL.x + Math.cos(angle) * FINALE_RADIUS, by + mix(FINALE_HEIGHT[0], FINALE_HEIGHT[1], k), BELL.z + Math.sin(angle) * FINALE_RADIUS * 0.9 + 3];
  return { position, target: [BELL.x, by + 2.6, BELL.z], fov };
}

/** The finale as shown: blends in from the follow pose and back out to it, so neither end cuts. */
export function finalePose(t: number, follow: CameraPose): CameraPose {
  const orbit = finaleOrbit(t, follow.fov);
  const w = Math.min(smooth(t / FINALE_BLEND), smooth((FINALE_SECONDS - t) / FINALE_BLEND));
  return { position: mix3(follow.position, orbit.position, w), target: mix3(follow.target, orbit.target, w), fov: follow.fov };
}

export interface CameraSequencer {
  start(id: SequenceId): void;
  skip(): void;
  /** Advance; returns the pose to show, or null when no sequence runs (the follow camera drives). `follow` is this frame's follow pose. */
  update(dt: number, follow: CameraPose): CameraPose | null;
  readonly active: SequenceId | null;
  readonly elapsed: number;
}

export function createCameraSequencer(options: { readonly reducedMotion: () => boolean }): CameraSequencer {
  let active: SequenceId | null = null, elapsed = 0;
  return {
    get active() { return active; },
    get elapsed() { return elapsed; },
    start(id) { if (options.reducedMotion()) { active = null; return; } active = id; elapsed = 0; },
    skip() { active = null; },
    update(dt, follow) {
      if (!active) return null;
      elapsed += Math.max(0, dt);
      const length = active === "intro" ? INTRO_SECONDS : FINALE_SECONDS;
      if (elapsed >= length) { active = null; return null; }
      return active === "intro" ? introPose(elapsed, follow) : finalePose(elapsed, follow);
    }
  };
}
