/**
 * Shared 120/144 Hz feel, real-time hit-stop, camera trauma/FOV kick, and procedural WebAudio SFX kit
 * built strictly on `@aura3d/engine/game` primitives (`createHitStop`, `createCameraShake`).
 */
import { createCameraShake, createHitStop } from "@aura3d/engine/game";

export interface ImpactRig {
  /** Trigger a real-time hit-stop freeze (seconds, e.g. 0.045) + trauma shake [0..1] + FOV kick (degrees). */
  trigger(options: { freezeSeconds?: number; trauma?: number; fovKickDeg?: number }): void;
  /** Advance on REAL frame `dt` (never game-frozen `dt`) and return scaled `simDt`, camera shake offset, and FOV delta. */
  step(realDt: number): {
    readonly simDt: number;
    readonly frozen: boolean;
    readonly shakeOffset: readonly [number, number, number];
    readonly shakeRoll: number;
    readonly fovDeltaDeg: number;
  };
  reset(): void;
}

export function createImpactRig(options: { reducedMotion?: boolean } = {}): ImpactRig {
  const hitStop = createHitStop(0);
  const cameraShake = createCameraShake({ decayPerSecond: 1.8, maxOffset: 0.22, maxRoll: 0.04 });
  let fovKick = 0;
  const reduced = options.reducedMotion ?? (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);

  return {
    trigger({ freezeSeconds = 0, trauma = 0, fovKickDeg = 0 }) {
      if (freezeSeconds > 0) hitStop.trigger(Math.min(freezeSeconds, 0.14) * 1000);
      if (!reduced && trauma > 0) cameraShake.add(Math.min(trauma, 1));
      if (!reduced && fovKickDeg !== 0) fovKick = Math.max(-8, Math.min(10, fovKick + fovKickDeg));
    },
    step(realDt: number) {
      const clampedDt = Math.min(Math.max(realDt, 0), 0.1);
      const wasActive = hitStop.active;
      hitStop.update(clampedDt);
      const scale = wasActive || hitStop.active ? hitStop.timeScale() : 1;
      const simDt = clampedDt * scale;
      const shake = cameraShake.update(clampedDt);
      fovKick *= Math.exp(-clampedDt * 9.5);
      if (Math.abs(fovKick) < 0.01) fovKick = 0;
      const shakeOffset: [number, number, number] = reduced ? [0, 0, 0] : [shake.x, shake.y, 0];
      return {
        simDt,
        frozen: (wasActive || hitStop.active) && clampedDt > 0,
        shakeOffset,
        shakeRoll: reduced ? 0 : shake.roll,
        fovDeltaDeg: reduced ? 0 : fovKick
      };
    },
    reset() {
      hitStop.update(10);
      cameraShake.update(10);
      fovKick = 0;
    }
  };
}

export type ProceduralCue = "pickup" | "impact" | "boost" | "perfect" | "whoosh" | "tick";

/** Lightweight zero-asset WebAudio procedural synthesizer with mute toggle and graceful headless no-op. */
export function createProceduralSfx() {
  let ctx: AudioContext | null = null;
  let muted = false;

  const ensureCtx = (): AudioContext | null => {
    if (muted || typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) {
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  };

  const play = (cue: ProceduralCue, intensity = 1): void => {
    const audio = ensureCtx();
    if (!audio) return;
    const now = audio.currentTime;
    const gain = audio.createGain();
    const osc = audio.createOscillator();
    const vol = Math.min(0.22, Math.max(0.02, 0.12 * intensity));

    if (cue === "pickup" || cue === "perfect") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(cue === "perfect" ? 587.33 : 493.88, now);
      osc.frequency.exponentialRampToValueAtTime(cue === "perfect" ? 1174.66 : 880, now + 0.11);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (cue === "impact") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      gain.gain.setValueAtTime(vol * 1.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } else if (cue === "boost" || cue === "whoosh") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(cue === "boost" ? 210 : 320, now);
      osc.frequency.exponentialRampToValueAtTime(cue === "boost" ? 680 : 140, now + 0.22);
      gain.gain.setValueAtTime(vol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(720, now);
      gain.gain.setValueAtTime(vol * 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  };

  return {
    play,
    get muted() {
      return muted;
    },
    setMuted(next: boolean) {
      muted = next;
    }
  };
}
