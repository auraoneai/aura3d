// tests/qr/prd14/bank-shot/audio-map.test.ts — §14.4 strike cue map.
import { describe, expect, it } from "vitest";
import { strikeAudioMap } from "../../../../apps/showcase-bank-shot/src/v2/audio-map";

describe("bank-shot strikeAudioMap", () => {
  it("maps 1 m/s and 4 m/s strikes ≥ 6 dB apart", () => {
    const soft = strikeAudioMap(1);
    const hard = strikeAudioMap(4);
    expect(hard.gainDb - soft.gainDb).toBeGreaterThanOrEqual(6);
  });

  it("is monotonic in gain and pitch across the speed domain", () => {
    let prev = strikeAudioMap(0);
    for (const speed of [1.2, 2, 3, 4, 5.2, 8]) {
      const cur = strikeAudioMap(speed);
      expect(cur.gainDb).toBeGreaterThanOrEqual(prev.gainDb);
      expect(cur.pitchSemitones).toBeGreaterThanOrEqual(prev.pitchSemitones);
      prev = cur;
    }
  });

  it("clamps inside the authored range at both ends", () => {
    expect(strikeAudioMap(-5)).toEqual(strikeAudioMap(0));
    expect(strikeAudioMap(99)).toEqual(strikeAudioMap(5.2));
    expect(strikeAudioMap(5.2).gainDb).toBe(-4);
    expect(strikeAudioMap(1.2).pitchSemitones).toBe(-2);
  });

  it("always selects the cue-strike cue", () => {
    expect(strikeAudioMap(2.5).cue).toBe("cue-strike");
  });
});
