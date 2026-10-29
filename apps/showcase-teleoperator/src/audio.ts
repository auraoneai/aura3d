import { createCueBank, createToneLoop, type CueSpec, type NoiseLayer, type ToneLayer, type ToneLoop } from "@aura3d/engine/audio";
import type { CueName } from "./sim";

/**
 * Grid Dispatch sound (C18): one-shot cues for contact, pickup, drop-off, earnings, a missed kerb, warnings and near
 * misses, plus an electric-motor loop whose pitch and level follow the speed (silent when the car stands still).
 * `M` or the HUD speaker button mutes everything; the choice is remembered.
 */
const tone = (freq: number, o: Partial<ToneLayer> = {}): ToneLayer => ({ freq, type: "triangle", dur: 0.16, gain: 0.12, attack: 0.01, ...o });
const noise = (o: Partial<NoiseLayer> = {}): NoiseLayer => ({ kind: "noise", dur: 0.2, gain: 0.1, freq: 1500, q: 0.9, type: "bandpass", attack: 0.04, ...o });

export const GRID_CUES: Readonly<Record<CueName, CueSpec>> = {
  collision: { layers: [tone(150, { type: "sawtooth", slideTo: 48, dur: 0.26, gain: 0.11, attack: 0.008 }), noise({ dur: 0.2, freq: 1500, slideTo: 220, gain: 0.12 })], cooldownMs: 60, priority: 3 },
  pickup: { layers: [tone(660, { dur: 0.12 }), tone(880, { dur: 0.16, delay: 0.1 })], cooldownMs: 300, priority: 2 },
  dropoff: { layers: [tone(880, { dur: 0.12 }), tone(660, { dur: 0.16, delay: 0.1 })], cooldownMs: 300, priority: 2 },
  earn: { layers: [tone(1318, { type: "sine", dur: 0.09, gain: 0.09, delay: 0.25 }), tone(1760, { type: "sine", dur: 0.14, gain: 0.09, delay: 0.33 })], cooldownMs: 400, priority: 1 },
  miss: { layers: [tone(330, { slideTo: 220, dur: 0.3, gain: 0.1 })], cooldownMs: 500, priority: 2 },
  warn: { layers: [tone(520, { type: "square", dur: 0.08, gain: 0.05 }), tone(520, { type: "square", dur: 0.08, gain: 0.05, delay: 0.14 })], cooldownMs: 700, priority: 1 },
  nearMiss: { layers: [noise({ dur: 0.35, freq: 900, slideTo: 2600, gain: 0.08, attack: 0.08 })], cooldownMs: 250, priority: 1 }
};

const MUTE_KEY = "grid-dispatch:muted";

export interface GridAudio {
  play(name: CueName, gain?: number): void;
  /** Call once per rendered frame. */
  update(speedMps: number, maxSpeedMps: number, active: boolean): void;
  toggleMute(): boolean;
  readonly muted: boolean;
}

export function createGridAudio(target: Window, onMuteChange: (muted: boolean) => void): GridAudio {
  let stored = false;
  try { stored = target.localStorage?.getItem(MUTE_KEY) === "1"; } catch { /* storage blocked */ }
  const bank = createCueBank({ cues: GRID_CUES, masterGain: 0.5, muteKey: "KeyM", muted: stored, noiseSeed: 424242 });
  const remember = (muted: boolean): void => {
    try { target.localStorage?.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* storage blocked */ }
    onMuteChange(muted);
  };
  bank.install(target, { onMuteChange: remember });
  // Detuned triangle pair plus soft tyre noise through a low-pass: a motor whine, not a fixed-pitch drone.
  const motor: ToneLoop = createToneLoop(bank as never, {
    voices: [{ type: "triangle", freq: 92, gain: 0.25 }, { type: "triangle", freq: 92, detune: 9, gain: 0.2 }, { type: "sine", freq: 184, gain: 0.08 }],
    noise: { gain: 0.0001, filter: { type: "bandpass", freq: 700, q: 0.7 } },
    filter: { type: "lowpass", freq: 900 },
    gain: 0
  });
  return {
    play(name, gain) {
      bank.play(name, gain === undefined ? {} : { gain });
    },
    update(speed, maxSpeed, active) {
      if (!bank.running) return;
      if (!motor.running) motor.start();
      const t = Math.max(0, Math.min(1, speed / Math.max(1, maxSpeed)));
      motor.set({ pitch: 1 + t * 2.4, cutoff: 700 + t * 2200, gain: active && speed > 0.3 ? 0.03 + t * 0.07 : 0, noiseGain: active ? t * 0.05 : 0 }, 0.12);
    },
    toggleMute() {
      const muted = bank.toggleMute();
      remember(muted);
      return muted;
    },
    get muted() {
      return bank.muted;
    }
  };
}
