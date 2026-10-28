import { createCueBank, noteFrom } from "@aura3d/engine/audio";

// @concern audio
const note = noteFrom(523.25);

export type Cue = "pickup" | "win" | "lose";

export function createAudio() {
  const bank = createCueBank<Cue>({
    cues: {
      pickup: { layers: [{ freq: note(12), type: "triangle", dur: 0.14, gain: 0.2, slideTo: note(19) }] },
      win: {
        layers: [
          { freq: note(0), type: "sine", dur: 0.2 },
          { freq: note(4), type: "sine", dur: 0.2, delay: 0.12 },
          { freq: note(7), type: "sine", dur: 0.4, delay: 0.24 }
        ]
      },
      lose: { layers: [{ freq: 220, type: "sawtooth", dur: 0.5, gain: 0.15, slideTo: 80 }] }
    }
  });
  bank.install();
  return bank;
}
