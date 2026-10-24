/**
 * Small synthesised sound effects on the shared `@aura3d/engine/audio` cue bank: pickups, jump, landing, hits,
 * surge and flight whooshes. Everything is a one-shot with a short envelope and there is no continuous bed.
 * The context is created on the first key press or click so browsers allow it. The cue definitions are the
 * original hand-written tone and noise calls expressed as layers; `tests/unit/saiyan-snake-way-port/sfx-kit.test.ts`
 * replays the original implementation and this one against the same fake context and compares the automation.
 */
import { createCueBank, type CueSpec, type NoiseLayer, type SynthContext, type ToneLayer } from "@aura3d/engine/audio";

export interface Sfx {
  unlock(): void;
  toggleMute(): boolean;
  pickup(chain: number): void;
  jump(): void;
  land(): void;
  hit(): void;
  surge(rung: number): void;
  whoosh(): void;
  fall(): void;
  fanfare(): void;
}

export type SfxCue = "pickup" | "jump" | "land" | "hit" | "surge" | "whoosh" | "fall" | "fanfare";

const tone = (freq: number, to: number, dur: number, type: OscillatorType, gain: number, delay = 0): ToneLayer => ({
  freq,
  slideTo: to,
  dur,
  type,
  gain,
  delay,
  attack: 0.012
});

const noise = (dur: number, from: number, to: number, gain: number, delay = 0): NoiseLayer => ({
  kind: "noise",
  dur,
  freq: from,
  slideTo: to,
  gain,
  delay,
  q: 0.9,
  type: "bandpass",
  attack: dur * 0.25,
  loop: true
});

export const SFX_CUES: Readonly<Record<SfxCue, CueSpec>> = {
  pickup: {
    layers: ({ level }) => {
      const base = 660 * Math.pow(2, Math.min(level, 12) / 12);
      return [tone(base, base * 1.5, 0.12, "triangle", 0.1), tone(base * 2, base * 2.4, 0.09, "sine", 0.05, 0.04)];
    }
  },
  jump: { layers: [tone(280, 520, 0.16, "square", 0.04), noise(0.14, 900, 2200, 0.05)] },
  land: { layers: [tone(140, 70, 0.1, "sine", 0.12), noise(0.08, 500, 200, 0.05)] },
  hit: { layers: [tone(180, 55, 0.28, "sawtooth", 0.1), noise(0.22, 1400, 180, 0.12)] },
  surge: {
    layers: ({ level }) => [noise(0.5, 300, 3200, 0.12 + level * 0.015), tone(120, 340 + level * 40, 0.45, "sawtooth", 0.05)]
  },
  whoosh: { layers: [noise(0.7, 400, 2600, 0.1)] },
  fall: { layers: [tone(520, 70, 1.2, "sine", 0.1), noise(1.1, 2400, 200, 0.07)] },
  fanfare: { layers: [523, 659, 784, 1047].map((f, i) => tone(f, f * 1.01, 0.4, "triangle", 0.09, i * 0.12)) }
};

export function createSfx(options: { readonly context?: SynthContext } = {}): Sfx {
  const bank = createCueBank<SfxCue>({
    cues: SFX_CUES,
    masterGain: 0.5,
    sfxGain: 1,
    muteKey: false,
    noiseSeed: 1234567,
    ...(options.context ? { context: options.context } : {})
  });
  return {
    unlock() { void bank.unlock(); },
    toggleMute: () => bank.toggleMute(),
    pickup(chain) { bank.play("pickup", { level: chain }); },
    jump() { bank.play("jump"); },
    land() { bank.play("land"); },
    hit() { bank.play("hit"); },
    surge(rung) { bank.play("surge", { level: rung }); },
    whoosh() { bank.play("whoosh"); },
    fall() { bank.play("fall"); },
    fanfare() { bank.play("fanfare"); }
  };
}
