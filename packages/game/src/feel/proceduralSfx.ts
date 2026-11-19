/**
 * Zero-asset procedural WebAudio cues on the shared `AudioContextManager`. Extracted from the 30 live games' shared
 * feel kit (`apps/showcase-port-shared/feel.ts`) in 5.7.0.
 */
import { AudioContextManager } from "@aura3d/audio";

/** The built-in procedural cues: rising chimes (`pickup`, `perfect`), a falling thud (`impact`), sweeps (`boost`, `whoosh`) and a short `tick`. */
export type ProceduralSfxCue = "pickup" | "impact" | "boost" | "perfect" | "whoosh" | "tick";

/** A procedural SFX player returned by {@link createProceduralSfx}. */
export interface ProceduralSfx {
  /** Play one cue now. `intensity` scales the volume (gain clamped to 0.02..0.22 before the per-cue factor). */
  play(cue: ProceduralSfxCue, intensity?: number): void;
  /** True while muted. */
  readonly muted: boolean;
  /** Mute or unmute every later cue. */
  setMuted(next: boolean): void;
}

/**
 * Create a lightweight procedural synthesizer: one oscillator and gain envelope per cue, played on the shared
 * `AudioContextManager` context (unlocked on first use). It is a silent no-op when muted, headless (no
 * `AudioContext`), or while the page is hidden, so it is safe to call from any frame.
 *
 * @example
 * const sfx = createProceduralSfx();
 * sfx.play("pickup");
 * sfx.play("impact", 1.4);
 */
export function createProceduralSfx(): ProceduralSfx {
  let manager: AudioContextManager | null = null;
  let muted = false;

  const ensureCtx = (): (AudioContext & { createOscillator?: () => OscillatorNode }) | null => {
    if (muted || typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
    if (typeof document !== "undefined" && (document.visibilityState === "hidden" || document.hidden === true)) return null;
    if (!manager) {
      try {
        manager = AudioContextManager.shared();
      } catch {
        return null;
      }
    }
    void manager.unlock().catch(() => {});
    try {
      const ctx = manager.context as unknown as AudioContext & { createOscillator?: () => OscillatorNode };
      return typeof ctx?.createOscillator === "function" ? ctx : null;
    } catch {
      return null;
    }
  };

  const play = (cue: ProceduralSfxCue, intensity = 1): void => {
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
