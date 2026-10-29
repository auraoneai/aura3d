/**
 * Thermal Drift sound (audit C22): one cue bank on the page's AudioContextManager, a throttle-driven engine loop and
 * a boost whoosh on the bank's sfx bus, hit and pickup cues, M to mute, and unlock on the first gesture.
 * Presentation only: it never touches the simulation. The engine bed sits at 90-300 Hz under a low-pass and fades
 * out whenever the race is not running, so no fixed-level drone plays under a menu (lessons: game-audio buzz).
 */
import { AudioContextManager, createCueBank, createToneLoop, type CueSpec, type ToneLayer } from "@aura3d/engine/audio";
import type { SimEvent } from "./sim";

const tone = (freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): ToneLayer =>
  ({ freq, dur, type, gain, attack: 0.008, delay, ...(slideTo !== undefined ? { slideTo } : {}) });

export const CUES = {
  laser: { layers: [tone(620, 0.09, "sawtooth", 0.05, 145)], cooldownMs: 60, maxConcurrent: 3 },
  shock: { layers: [tone(220, 0.38, "triangle", 0.12, 42), { kind: "noise", dur: 0.3, gain: 0.08, freq: 600, slideTo: 120 }], priority: 1 },
  chime: { layers: ({ level }) => [tone(level || 540, 0.18, "sine", 0.07, (level || 540) * 1.45)] },
  tick: { layers: [tone(440, 0.16, "square", 0.05)] },
  go: { layers: [tone(880, 0.45, "square", 0.06), tone(1320, 0.5, "triangle", 0.05, undefined, 0.02)], priority: 1 },
  lap: { layers: [523, 659, 784].map((f, i) => tone(f, 0.35, "triangle", 0.08, undefined, i * 0.09)) },
  finish: { layers: [523, 659, 784, 1047].map((f, i) => tone(f, 0.5, "triangle", 0.09, undefined, i * 0.11)), priority: 1 },
  takedown: { layers: [tone(820, 0.2, "triangle", 0.08, 1200), { kind: "noise", dur: 0.25, gain: 0.07, freq: 900, slideTo: 200 }], priority: 1 },
  hit: { layers: [tone(330, 0.08, "square", 0.04, 220)], cooldownMs: 80 },
  damage: { layers: [tone(160, 0.28, "sawtooth", 0.09, 60), { kind: "noise", dur: 0.22, gain: 0.1, freq: 500, slideTo: 90 }], priority: 1, cooldownMs: 120 },
  scrape: { layers: [{ kind: "noise", dur: 0.35, gain: 0.07, freq: 2400, q: 1.4, slideTo: 1200 }], cooldownMs: 250 },
  warning: { layers: [tone(980, 0.12, "square", 0.05), tone(980, 0.12, "square", 0.05, undefined, 0.18)], priority: 1, cooldownMs: 400 },
  pickup: { layers: [tone(660, 0.12, "triangle", 0.07), tone(990, 0.16, "triangle", 0.06, undefined, 0.07)] },
  whoosh: { layers: [{ kind: "noise", dur: 0.45, gain: 0.06, freq: 700, q: 0.8, slideTo: 2600, attack: 0.08 }], cooldownMs: 300 },
  lose: { layers: [tone(392, 0.3, "triangle", 0.08), tone(311, 0.45, "triangle", 0.08, undefined, 0.22)], priority: 1 }
} satisfies Record<string, CueSpec>;
export type CueName = keyof typeof CUES;

/** Which cue a simulation event plays (null: silent). */
export function cueForEvent(event: SimEvent): { cue: CueName; level?: number } | null {
  switch (event.type) {
    case "countdown": return { cue: "tick" };
    case "go": return { cue: "go" };
    case "lap": return { cue: "lap" };
    case "finish": return { cue: event.result.outcome === "eliminated" ? "lose" : "finish" };
    case "takedown": return { cue: "takedown" };
    case "hit": return { cue: "hit" };
    case "incoming": return { cue: "warning" };
    case "evaded": return { cue: "chime", level: 720 };
    case "damage": return { cue: "damage" };
    case "scrape": return { cue: "scrape" };
    case "bump": return { cue: "damage" };
    case "pickup": return { cue: "pickup" };
    case "barrel": return { cue: "damage" };
    case "destroyed": return { cue: "lose" };
    case "respawn": return { cue: "chime", level: 440 };
    case "eliminated": return event.player ? null : { cue: "chime", level: 300 };
    case "overheat": return { cue: "warning" };
    case "shock": return { cue: "shock" };
    case "roll": return { cue: "whoosh" };
    case "mine": return { cue: "chime", level: 440 };
    case "missile": return { cue: "chime", level: 660 };
    case "item": return { cue: "chime", level: 780 };
    case "laser": return { cue: "laser" };
    default: return null;
  }
}

export interface EngineFrame {
  readonly racing: boolean;
  readonly speedKmh: number;
  readonly boosting: boolean;
}

export interface ThermalDriftAudio {
  install(): void;
  unlock(): void;
  toggleMute(): boolean;
  readonly muted: boolean;
  events(events: readonly SimEvent[]): void;
  play(cue: CueName, level?: number): void;
  update(frame: EngineFrame): void;
}

export function createThermalDriftAudio(onMuteChange?: (muted: boolean) => void): ThermalDriftAudio {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return { install() {}, unlock() {}, toggleMute: () => true, muted: true, events() {}, play() {}, update() {} };
  }
  const bank = createCueBank({ cues: CUES, manager: new AudioContextManager(), masterGain: 0.7, sfxGain: 1, muteKey: "KeyM" });
  const engine = createToneLoop(bank, {
    voices: [{ type: "sawtooth", freq: 92, gain: 0.5 }, { type: "triangle", freq: 138, detune: 7, gain: 0.35 }, { type: "sine", freq: 184, gain: 0.25 }],
    filter: { type: "lowpass", freq: 700 },
    noise: { gain: 0, filter: { type: "bandpass", freq: 1200 } },
    gain: 0
  });
  let boostWas = false;
  const ensureEngine = (): void => { if (!engine.running && bank.context) engine.start(); };
  return {
    install() {
      bank.install(window, { onMuteChange: (m: boolean) => onMuteChange?.(m) });
    },
    unlock() {
      void bank.unlock().then(() => ensureEngine());
    },
    toggleMute() {
      const m = bank.toggleMute();
      onMuteChange?.(m);
      return m;
    },
    get muted() { return bank.muted; },
    events(events) {
      for (const e of events) {
        const c = cueForEvent(e);
        if (c) bank.play(c.cue, c.level !== undefined ? { level: c.level } : undefined);
      }
    },
    play(cue, level) {
      bank.play(cue, level !== undefined ? { level } : undefined);
    },
    update(frame) {
      ensureEngine();
      if (!engine.running) return;
      const rev = Math.min(1.6, Math.max(0.6, frame.speedKmh / 560));
      engine.set({
        pitch: rev,
        cutoff: 500 + rev * 900 + (frame.boosting ? 600 : 0),
        gain: frame.racing ? 0.05 + rev * 0.03 : 0.0001,
        noiseGain: frame.racing && frame.boosting ? 0.035 : 0
      }, 0.08);
      if (frame.racing && frame.boosting && !boostWas) bank.play("whoosh");
      boostWas = frame.racing && frame.boosting;
    }
  };
}
