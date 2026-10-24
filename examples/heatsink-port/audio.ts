/**
 * HEATSINK sound: the strike layer's cues, synthesised in code on the shared cue bank (no samples, no original audio).
 * The context is created only from a user gesture (`install` listens for the first one) so autoplay policies and
 * headless runs stay quiet; M toggles mute.
 */
import { AudioContextManager, createCueBank, type CueSpec } from "@aura3d/engine/audio";
import type { Race } from "./race";

export const CUES = {
  fire: { cooldownMs: 55, maxConcurrent: 4, layers: [{ freq: 1040, slideTo: 380, type: "square" as const, dur: 0.07, gain: 0.05, attack: 0.002 }, { kind: "noise" as const, type: "highpass" as const, freq: 3200, dur: 0.04, gain: 0.05 }] },
  hit: { cooldownMs: 40, layers: [{ freq: 220, slideTo: 140, type: "sawtooth" as const, dur: 0.09, gain: 0.1, attack: 0.002 }, { kind: "noise" as const, type: "bandpass" as const, freq: 1800, q: 2, dur: 0.07, gain: 0.12 }] },
  kill: {
    priority: 2,
    layers: ({ level }) => [
      { freq: 160, slideTo: 55, type: "sawtooth" as const, dur: 0.34, gain: 0.2, attack: 0.003 },
      { kind: "noise" as const, type: "lowpass" as const, freq: 900, slideTo: 200, dur: 0.38, gain: 0.35 },
      { freq: 660 * Math.pow(2, Math.min(8, Math.max(0, level - 1)) / 12), type: "triangle" as const, dur: 0.22, gain: 0.12, attack: 0.01, delay: 0.05 }
    ]
  },
  barrel: { priority: 3, layers: [{ freq: 90, slideTo: 36, type: "sine" as const, dur: 0.6, gain: 0.45, attack: 0.002 }, { kind: "noise" as const, type: "lowpass" as const, freq: 600, slideTo: 120, dur: 0.7, gain: 0.5 }] },
  overheat: { cooldownMs: 400, layers: [{ freq: 300, slideTo: 90, type: "square" as const, dur: 0.25, gain: 0.07 }] },
  medal: { priority: 3, layers: [523, 659, 784, 1046].map((freq, i) => ({ freq, type: "triangle" as const, dur: 0.35, gain: 0.16, attack: 0.01, delay: i * 0.11 })) }
} satisfies Record<string, CueSpec>;

export interface HeatsinkAudio {
  /** play the cues for the strike events not yet heard; call once per rendered frame */
  update(race: Race): void;
  /** forget the event cursor (a new race clears the event list) */
  reset(): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
}

export function createHeatsinkAudio(): HeatsinkAudio {
  const manager = new AudioContextManager();
  const bank = createCueBank({ cues: CUES, manager, masterGain: 0.7, sfxGain: 1, noiseSeed: 0x2f6e2b1 });
  bank.install();
  let seen = 0;
  let locked = false;
  return {
    update(race) {
      const events = race.ops.events;
      if (seen > events.length) seen = 0;
      for (; seen < events.length; seen++) {
        const ev = events[seen]!;
        if (ev.type === "fire") bank.play("fire");
        else if (ev.type === "hit") bank.play("hit");
        else if (ev.type === "kill") bank.play("kill", { level: race.ops.chain });
        else if (ev.type === "barrel") bank.play("barrel");
        else if (ev.type === "medal" && ev.detail !== "none") bank.play("medal");
      }
      const now = race.player.gunLocked;
      if (now && !locked) bank.play("overheat");
      locked = now;
    },
    reset() { seen = 0; locked = false; },
    get muted() { return bank.muted; },
    setMuted(muted) { bank.setMuted(muted); }
  };
}
