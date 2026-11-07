/**
 * Shape Shift Sprint audio: kit `createGameSound` at 124 BPM with a candy-pop arpeggio bed and one
 * cue per game event (match/perfect/morph/hit/shield/wildcard/x2/milestone/gameover). Cues are derived
 * from sim-state diffs (`diffSounds`), never fired from the sim; silent until the first user gesture;
 * mute is persisted by main.ts under `splatSiblings.shape-shift-sprint.mute`.
 */
import { noteFrom, type CueSpec } from "@aura3d/engine/audio";
import { createGameSound, type GameSound, type GameSoundOptions, type SoundEvent } from "../../../examples/shared/runner-kit/index";

const note = noteFrom(523.25); // C5

export const BPM = 124;

/** Bright major-pentatonic arp (semitones above C5) and a soft sine bass, one step per eighth note. */
const ARP = [0, 4, 7, 12, 9, 7, 4, 2, 0, 7, 4, 9, 12, 16, 12, 7];
const BASS = [-12, -8, -5, -10];
/** Combo ladder for the match pitch. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export type CueName = "match" | "perfect" | "morph" | "hit" | "shield" | "wildcard" | "x2" | "milestone" | "gameover";
export const CUE_NAMES: readonly CueName[] = ["match", "perfect", "morph", "hit", "shield", "wildcard", "x2", "milestone", "gameover"];

export interface FrameState {
  phase: string;
  lives: number;
  combo: number;
  score: number;
  shapeIndex: number;
  shieldActive: boolean;
  wildcardTimer: number;
  scoreX2Timer: number;
  milestone: number;
  /** Whether the combo gain this frame was a perfect fit (read from the sim's fresh popups by main). */
  perfect: boolean;
}

/** Derives cue events from consecutive sim states (pure; unit-tested). */
export function diffSounds(prev: FrameState | null, next: FrameState): SoundEvent<CueName>[] {
  const out: SoundEvent<CueName>[] = [];
  if (!prev) return out;
  if (next.phase === "bursting" && prev.phase !== "bursting") out.push({ sound: "gameover", level: 0 });
  if (next.phase !== "playing") return out;
  if (next.milestone > prev.milestone) out.push({ sound: "milestone", level: 0 });
  if (next.lives < prev.lives) out.push({ sound: "hit", level: 0 });
  else if (prev.shieldActive && !next.shieldActive && next.lives === prev.lives) out.push({ sound: "shield", level: 1 });
  else if (next.combo > prev.combo) out.push({ sound: next.perfect ? "perfect" : "match", level: next.combo });
  if (next.shapeIndex !== prev.shapeIndex && next.lives === prev.lives) out.push({ sound: "morph", level: next.shapeIndex });
  if (next.shieldActive && !prev.shieldActive) out.push({ sound: "shield", level: 0 });
  if (next.wildcardTimer > 0 && prev.wildcardTimer <= 0) out.push({ sound: "wildcard", level: 0 });
  if (next.scoreX2Timer > 0 && prev.scoreX2Timer <= 0) out.push({ sound: "x2", level: 0 });
  return out;
}

const ladder = (level: number): number => note(LADDER[Math.min(LADDER.length - 1, Math.max(0, level))] as number);

export const CUES: Record<CueName, CueSpec> = {
  match: { layers: ({ level }) => [{ freq: ladder(level), type: "triangle", dur: 0.15, gain: 0.2, slideTo: ladder(level) * 1.5 }] },
  perfect: {
    layers: ({ level }) => [
      { freq: ladder(level), type: "triangle", dur: 0.18, gain: 0.2, slideTo: ladder(level) * 1.5 },
      { freq: ladder(level) * 2, type: "sine", dur: 0.24, gain: 0.14, delay: 0.02, slideTo: ladder(level) * 3 },
      { kind: "noise", dur: 0.16, gain: 0.05, freq: 4600, type: "highpass", slideTo: 9200 }
    ]
  },
  morph: {
    layers: [
      { freq: 340, type: "square", dur: 0.12, gain: 0.1, slideTo: 680 },
      { freq: 510, type: "sine", dur: 0.2, gain: 0.13, delay: 0.05, slideTo: 1020 },
      { kind: "noise", dur: 0.14, gain: 0.05, freq: 3000, q: 2, delay: 0.02 }
    ]
  },
  hit: {
    layers: [
      { freq: 180, type: "sawtooth", dur: 0.3, gain: 0.2, slideTo: 52 },
      { kind: "noise", dur: 0.24, gain: 0.11, freq: 420, q: 0.7, slideTo: 100 }
    ],
    duckMusic: 0.5
  },
  shield: {
    layers: ({ level }) => level > 0
      ? [{ freq: 430, type: "square", dur: 0.15, gain: 0.12, slideTo: 780 }, { kind: "noise", dur: 0.18, gain: 0.07, freq: 2400, q: 3 }]
      : [{ freq: 540, type: "sine", dur: 0.2, gain: 0.15, slideTo: 1080 }, { freq: 810, type: "triangle", dur: 0.22, gain: 0.1, delay: 0.05, slideTo: 1620 }]
  },
  wildcard: {
    layers: [0, 5, 10].map((semis, i) => ({ freq: note(semis), type: "sine" as const, dur: 0.2, gain: 0.13, delay: 0.05 * i, slideTo: note(semis + 7) }))
  },
  x2: {
    layers: [
      { freq: note(7), type: "triangle", dur: 0.14, gain: 0.16 },
      { freq: note(12), type: "triangle", dur: 0.22, gain: 0.16, delay: 0.09, slideTo: note(19) }
    ]
  },
  milestone: {
    layers: [0, 4, 7, 12].map((semis, i) => ({ freq: note(semis), type: "triangle" as const, dur: 0.3, gain: 0.18, delay: 0.06 * i, slideTo: 1.5 * note(semis) }))
  },
  gameover: {
    layers: [
      { freq: 240, type: "sawtooth", dur: 0.5, gain: 0.22, slideTo: 40 },
      { kind: "noise", dur: 0.5, gain: 0.17, freq: 850, q: 0.6, slideTo: 90 },
      { freq: note(0), type: "triangle", dur: 0.3, gain: 0.13, delay: 0.4, slideTo: note(-3) },
      { freq: note(-5), type: "triangle", dur: 0.5, gain: 0.13, delay: 0.62, slideTo: note(-12) }
    ],
    priority: 1,
    duckMusic: { amount: 0.8, ms: 900 }
  }
};

export function soundOptions(): GameSoundOptions<CueName> {
  return {
    cues: CUES,
    bpm: BPM,
    noiseSeed: 0x53517b,
    sequence: (n, at, eighth, voice) => {
      voice({ type: "triangle", freq: note(ARP[n % ARP.length] as number), at, dur: 0.85 * eighth, gain: 0.055 });
      if (n % 2 === 0) voice({ type: "sine", freq: note(BASS[(n / 2) % BASS.length] as number), at, dur: 1.7 * eighth, gain: 0.085 });
    }
  };
}

export function createShapeSound(): GameSound<CueName> {
  return createGameSound<CueName>(soundOptions());
}