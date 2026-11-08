/**
 * Splat Turf audio: kit `createGameSound` at 112 BPM with a bright marimba-ish bed. One cue per game
 * event, derived from state diffs (`diffSounds`, pure and unit-tested); silent until the first user
 * gesture unlocks it. The noise buffer is seeded by the kit — no Math.random anywhere.
 */
import { createGameSound, type GameSound, type SoundEvent } from "../../../examples/shared/runner-kit/index";
import { noteFrom, type CueSpec, type SynthContext } from "@aura3d/engine/audio";

export const BPM = 112;

const note = noteFrom(523.25); // C5
const ARP = [0, 4, 7, 12, 9, 7, 4, 2, 0, 4, 7, 11, 9, 7, 5, 2];
const BASS = [-12, -8, -5, -7];
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16];

export type TurfCue = "can" | "solvent" | "eraser" | "stretch" | "finish" | "gameover" | "start" | "milestone" | "burst";

/** The state slice the sound diff reads (counters the sim already keeps). */
export interface FrameState {
  phase: string;
  cansGrabbed: number;
  solventHits: number;
  eraserHits: number;
  stretches: number;
  milestones: number;
  combo: number;
}

export function diffSounds(prev: FrameState | null, next: FrameState): SoundEvent<TurfCue>[] {
  const out: SoundEvent<TurfCue>[] = [];
  if (!prev) return out;
  if (prev.phase === "splash" && next.phase === "playing") out.push({ sound: "start", level: 0 });
  if (next.phase === "bursting" && prev.phase !== "bursting") out.push({ sound: "burst", level: 0 });
  if (next.phase === "gameOver" && prev.phase !== "gameOver") out.push({ sound: "gameover", level: 0 });
  if (next.phase === "finished" && prev.phase !== "finished") out.push({ sound: "finish", level: 0 });
  if (next.phase !== "playing" && next.phase !== "bursting") return out;
  if (next.cansGrabbed > prev.cansGrabbed) out.push({ sound: "can", level: 0 });
  if (next.solventHits > prev.solventHits) out.push({ sound: "solvent", level: 0 });
  if (next.eraserHits > prev.eraserHits) out.push({ sound: "eraser", level: 0 });
  if (next.stretches > prev.stretches) out.push({ sound: "stretch", level: next.combo });
  if (next.milestones > prev.milestones) out.push({ sound: "milestone", level: 0 });
  return out;
}

const ladder = (level: number): number => note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);

export const CUES: Record<TurfCue, CueSpec> = {
  can: {
    layers: [
      { freq: 620, type: "sine", dur: 0.2, gain: 0.17, slideTo: 1240 },
      { freq: 930, type: "triangle", dur: 0.24, gain: 0.11, delay: 0.05, slideTo: 1860 }
    ]
  },
  solvent: {
    layers: [
      { kind: "noise", dur: 0.4, gain: 0.16, freq: 2600, q: 1.2, slideTo: 500 },
      { freq: 340, type: "sawtooth", dur: 0.3, gain: 0.12, slideTo: 90 }
    ],
    duckMusic: 0.5
  },
  eraser: {
    layers: [
      { kind: "noise", dur: 0.3, gain: 0.14, freq: 900, q: 0.8, slideTo: 220 },
      { freq: 210, type: "square", dur: 0.24, gain: 0.1, slideTo: 60 }
    ],
    duckMusic: 0.5
  },
  stretch: {
    layers: ({ level }) => [
      { freq: ladder(level), type: "triangle", dur: 0.16, gain: 0.18, slideTo: ladder(level) * 1.5 },
      { freq: ladder(level) * 2, type: "sine", dur: 0.22, gain: 0.12, delay: 0.04 }
    ]
  },
  finish: {
    layers: [0, 4, 7, 12, 16].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.34, gain: 0.17, delay: 0.09 * i, slideTo: 1.25 * note(semis) })),
    priority: 1
  },
  gameover: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.28, gain: 0.14, slideTo: note(-3) },
      { freq: note(-5), type: "triangle", dur: 0.5, gain: 0.14, delay: 0.22, slideTo: note(-12) }
    ],
    priority: 1
  },
  start: {
    layers: [
      { freq: note(0), type: "triangle", dur: 0.12, gain: 0.14 },
      { freq: note(7), type: "triangle", dur: 0.12, gain: 0.14, delay: 0.09 },
      { freq: note(12), type: "sine", dur: 0.26, gain: 0.16, delay: 0.18, slideTo: note(19) }
    ]
  },
  milestone: {
    layers: [0, 4, 7, 12].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.3, gain: 0.18, delay: 0.06 * i, slideTo: 1.5 * note(semis) }))
  },
  burst: {
    layers: [
      { freq: 250, type: "sawtooth", dur: 0.5, gain: 0.22, slideTo: 40 },
      { kind: "noise", dur: 0.55, gain: 0.18, freq: 900, q: 0.6, slideTo: 80 }
    ],
    priority: 1,
    duckMusic: { amount: 0.8, ms: 900 }
  }
};

/** `context` is for tests and offline rendering; in the page the shared AudioContextManager owns it. */
export function createTurfSound(options: { context?: SynthContext } = {}): GameSound<TurfCue> {
  return createGameSound<TurfCue>({
    cues: CUES,
    bpm: BPM,
    noiseSeed: 0x5a1c7e3,
    ...(options.context ? { context: options.context } : {}),
    sequence: (n, at, eighth, voice) => {
      voice({ type: "triangle", freq: note(ARP[n % ARP.length] as number), at, dur: 0.85 * eighth, gain: 0.055 });
      if (n % 2 === 0) voice({ type: "sine", freq: note(BASS[(n / 2) % BASS.length] as number), at, dur: 1.7 * eighth, gain: 0.085 });
    }
  });
}