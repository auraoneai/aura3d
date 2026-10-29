/**
 * Saltwind Highway chase-camera director (pure, unit tested). The camera stays framed on the road (eye behind the car on the
 * road frame, look ahead of it), and this module smooths the framing offsets on that frame, adds per-event trauma shake and
 * FOV kicks (ported from the original's per-event table), and asks for a cut on begin and on every recover.
 *
 * Smoothing runs on the road-frame offsets (lateral position, height), never on world positions: an exponential follow of
 * a target moving at 70 m/s would trail it by metres, while the arc position along the road needs no smoothing at all.
 */
import type { Run, RunEvent as SimEvent } from "./sim";


export interface CameraFrame {
  /** Lateral and height offsets of the eye and look target on the road frame (metres). */
  eyeL: number;
  eyeH: number;
  lookL: number;
  lookH: number;
  /** Degrees added to the base FOV (speed opening plus kicks). */
  fovKick: number;
  /** Eye offset from shake, in camera right/up units (metres); zero under reduced motion. */
  shakeRight: number;
  shakeUp: number;
  /** Snap instead of smoothing this frame. */
  cut: boolean;
}

export interface CameraDirectorOptions {
  /** Per-second exponential rates (audit C7: eye 9, look 12, fov 4). */
  readonly eyeRate?: number;
  readonly lookRate?: number;
  readonly fovRate?: number;
  readonly reducedMotion?: boolean;
}

export interface CameraDirector {
  step(run: Pick<Run, "l" | "h" | "v" | "grounded" | "phase" | "boosting" | "nitro">, events: readonly SimEvent[], dt: number): CameraFrame;
  /** Next step snaps (begin, route change). */
  cut(): void;
  setReducedMotion(on: boolean): void;
  readonly trauma: number;
}

const approach = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Trauma and FOV kick per sim event (original game table, fixture game-qAzJLoNH.js:625-636). */
export function eventKick(e: SimEvent): { trauma: number; fov: number } {
  switch (e.type) {
    case "launch": return e.kicker ? { trauma: e.big ? 0.3 : 0.18, fov: e.big ? 6 : 3.5 } : { trauma: 0, fov: 0 };
    case "roll": return { trauma: 0.12, fov: 0 };
    case "land": { const s = typeof e.strength === "number" ? e.strength : 0.3; return { trauma: 0.2 + 0.42 * s, fov: -3 * s }; }
    case "landingFlare": return { trauma: 0.18, fov: 0 };
    case "checkpoint": return { trauma: 0.1, fov: 2 };
    case "impact": return { trauma: 0.55, fov: 0 };
    case "recover": return { trauma: 0.45, fov: 0 };
    case "closePass": return { trauma: 0.1, fov: 0 };
    case "trick": return { trauma: 0.1, fov: 2 };
    case "lineup": return { trauma: e.big ? 0.2 : 0.12, fov: e.big ? 4 : 2.5 };
    case "hop": case "trailer": return { trauma: 0.15, fov: 2 };
    case "nitro": return { trauma: e.level === 3 ? 0.35 : 0.15, fov: e.level === 3 ? 7 : 4 };
    default: return { trauma: 0, fov: 0 };
  }
}

export function createCameraDirector(options: CameraDirectorOptions = {}): CameraDirector {
  const eyeRate = options.eyeRate ?? 9, lookRate = options.lookRate ?? 12, fovRate = options.fovRate ?? 4;
  let reduced = !!options.reducedMotion;
  let live = false;
  let trauma = 0, kick = 0, time = 0, wasBoosting = false;
  const frame: CameraFrame = { eyeL: 0, eyeH: 0, lookL: 0, lookH: 0, fovKick: 0, shakeRight: 0, shakeUp: 0, cut: true };
  return {
    get trauma() { return trauma; },
    cut() { live = false; },
    setReducedMotion(on: boolean) { reduced = on; if (on) { trauma = 0; kick = 0; } },
    step(run, events, dt) {
      const wantEyeL = run.l * 0.8;
      const wantEyeH = run.h + 3.1 + (run.grounded ? 0 : Math.min(2.5, run.h * 0.05));
      const wantLookL = run.l * 0.9;
      const wantLookH = run.h + 1.1;
      let cut = !live;
      for (const e of events) {
        if (e.type === "recover") cut = true;
        const k = eventKick(e);
        trauma += k.trauma;
        if (k.fov > 0) kick = Math.max(kick, k.fov);
        else kick += k.fov;
      }
      const boosting = run.phase === "running" && (run.boosting || run.nitro > 0);
      if (boosting && !wasBoosting) { trauma += 0.2; kick = Math.max(kick, 4); }
      wasBoosting = boosting;
      trauma = clamp(trauma, 0, 1);
      if (reduced) { trauma = 0; kick = 0; }
      const speedFov = (run.v / 74) * 8;
      if (cut) {
        frame.eyeL = wantEyeL; frame.eyeH = wantEyeH; frame.lookL = wantLookL; frame.lookH = wantLookH; frame.fovKick = speedFov + kick;
      } else {
        frame.eyeL = approach(frame.eyeL, wantEyeL, eyeRate, dt);
        frame.eyeH = approach(frame.eyeH, wantEyeH, eyeRate, dt);
        frame.lookL = approach(frame.lookL, wantLookL, lookRate, dt);
        frame.lookH = approach(frame.lookH, wantLookH, lookRate, dt);
        frame.fovKick = approach(frame.fovKick, speedFov + kick, fovRate, dt);
      }
      time += dt;
      const amp = reduced ? 0 : trauma * trauma * 0.62 + (run.grounded ? clamp((run.v - 28) / 46, 0, 1) ** 2 * 0.05 : 0);
      frame.shakeRight = (Math.sin(time * 41.3) * 0.6 + Math.sin(time * 23.7 + 1.3) * 0.4) * amp * 0.5;
      frame.shakeUp = (Math.sin(time * 37.1 + 0.7) * 0.6 + Math.sin(time * 19.3 + 2.1) * 0.4) * amp * 0.5;
      trauma = Math.max(0, trauma - dt * 1.3);
      kick = approach(kick, 0, 3, dt);
      frame.cut = cut;
      live = true;
      return frame;
    }
  };
}
