/** Hz of a MIDI note number (69 = A4 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Hz of a note `semitones` above (or below) `baseHz`. */
export function semitoneHz(baseHz: number, semitones: number): number {
  return baseHz * Math.pow(2, semitones / 12);
}

/** Builds `(semitones) => Hz` rooted at `baseHz`, e.g. `const note = noteFrom(523.25)`. */
export function noteFrom(baseHz: number): (semitones: number) => number {
  return (semitones) => semitoneHz(baseHz, semitones);
}

/** Semitone offsets of common scales, handy for pitch ladders that climb with a combo. */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10]
} as const;

/** Semitones for scale degree `degree` (may exceed the scale length: it wraps up by octaves, negative wraps down). */
export function scaleSemitones(scale: readonly number[], degree: number): number {
  const len = scale.length;
  const octave = Math.floor(degree / len);
  const index = ((degree % len) + len) % len;
  return (scale[index] as number) + 12 * octave;
}

/** Linear congruential generator in [-1, 1): deterministic noise that never touches `Math.random`. */
export function createNoiseSource(seed = 0x2f6e2b1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  };
}
