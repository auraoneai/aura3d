import { describe, expect, it } from "vitest";
import { createCueBank } from "../../../packages/audio/src/synth";
import { TONE_CUES, midiToHz } from "../../../examples/ninja-runner-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

const SCALE = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77] as const;

/** The port's original hand-written `tone` and the original statements for the effects now on the cue bank, verbatim. */
function oldTone(ctx: any, out: any, freq: number, duration: number, type: OscillatorType, volume: number, to?: number, delay = 0): void {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.012, duration / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + duration + 0.05);
}

function oldPlay(ctx: any, out: any, name: string, run: number): void {
  const tone = (...a: [number, number, OscillatorType, number, number?, number?]) => oldTone(ctx, out, ...a);
  switch (name) {
    case "pickup": tone(midiToHz(SCALE[4 + run]!), 0.22, "sine", 0.22); tone(midiToHz(SCALE[4 + run]!) * 2, 0.16, "triangle", 0.07); break;
    case "unlock": [0, 2, 4, 7].forEach((s, i) => tone(midiToHz(SCALE[4 + s % 8]!), 0.4, "triangle", 0.22, undefined, i * 0.1)); break;
    case "win": [0, 2, 4, 5, 7, 9].forEach((s, i) => tone(midiToHz(SCALE[3 + s % 9]!), 0.55, "triangle", 0.24, undefined, i * 0.14)); break;
    case "lose": tone(220, 1.1, "triangle", 0.3, 55); tone(165, 1.2, "sine", 0.28, 40, 0.15); break;
    case "warn": tone(880, 0.1, "square", 0.1); tone(660, 0.12, "square", 0.1, undefined, 0.12); break;
    default: throw new Error(`no reference for ${name}`);
  }
}

const norm = (rows: unknown[][]) => rows.map((r) => r.map((v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
const calls = (list: Array<{ node: string; method: string; args: unknown[] }>, node: string) => norm(list.filter((c) => c.node === node).map((c) => [c.method, ...c.args]));

describe("Ninja Runner tone-only effects on the synth cue kit (parameter-level equivalence; not listened to)", () => {
  for (const [name, run] of [["pickup", 0], ["pickup", 3], ["pickup", 7], ["unlock", 0], ["win", 0], ["lose", 0], ["warn", 0]] as const) {
    it(`${name}${name === "pickup" ? ` (run ${run})` : ""} has the original oscillators, glides, envelopes and timing`, async () => {
      const ref = createFakeContext("running");
      ref.ctx.currentTime = 0.5;
      oldPlay(ref.ctx, ref.ctx.destination, name, run);

      const next = createFakeContext("running");
      next.ctx.currentTime = 0.5;
      const bank = createCueBank({ cues: TONE_CUES, context: next.ctx, masterGain: 0.55, sfxGain: 0.9, muteKey: false });
      await bank.unlock();
      const base = next.calls.length;
      expect(bank.play(name, { level: run })).toBe(true);
      const newCalls = next.calls.slice(base);

      const refOsc = ref.ofKind("osc"), newOsc = next.ofKind("osc");
      expect(newOsc).toHaveLength(refOsc.length);
      refOsc.forEach((o, i) => {
        expect(newOsc[i]!.type).toBe(o.type);
        expect(newOsc[i]!.started[0]).toBeCloseTo(o.started[0]!, 9);
        // the kit stops a voice 20 ms earlier than the original, after the envelope has reached 0.0001
        expect(o.stopped[0]! - newOsc[i]!.stopped[0]!).toBeCloseTo(0.02, 9);
      });
      expect(calls(newCalls, "gain.gain")).toEqual(calls(ref.calls, "gain.gain"));
      expect(calls(newCalls, "osc.frequency")).toEqual(calls(ref.calls, "osc.frequency"));
    });
  }

  it("keeps every noise-bearing effect and `click` out of the bank", () => {
    expect(Object.keys(TONE_CUES).sort()).toEqual(["lose", "pickup", "unlock", "warn", "win"]);
  });
});
