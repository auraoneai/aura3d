// @concern audio
export type Cue = "pickup" | "win" | "lose";

export function createAudio() {
  let context: AudioContext | undefined;
  // Browsers keep an AudioContext suspended until a user gesture; the first one creates and resumes it.
  const unlock = (): void => {
    context ??= new AudioContext();
    void context.resume();
  };
  addEventListener("pointerdown", unlock);
  addEventListener("keydown", unlock);

  const tone = (freq: number, type: OscillatorType, dur: number, gain: number, delay = 0, slideTo?: number): void => {
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const amp = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    oscillator.connect(amp).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + dur + 0.02);
  };
  const cues: Record<Cue, () => void> = {
    pickup: () => tone(1046.5, "triangle", 0.14, 0.2, 0, 1568),
    win: () => {
      tone(523.25, "sine", 0.2, 0.2);
      tone(659.25, "sine", 0.2, 0.2, 0.12);
      tone(783.99, "sine", 0.4, 0.2, 0.24);
    },
    lose: () => tone(220, "sawtooth", 0.5, 0.15, 0, 80)
  };
  return {
    play: (cue: Cue) => cues[cue](),
    dispose() {
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
      void context?.close();
    }
  };
}
