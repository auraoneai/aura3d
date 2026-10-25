import { describe, expect, it } from "vitest";
import { createCueBank } from "../../../packages/audio/src/synth";
import { CUES, type Cue } from "../../../examples/last-train-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

/** The port's original hand-written `tone` and `cue`, kept verbatim as the reference the cue-bank cues must match. */
function oldTone(ctx: any, master: any, freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = "sine", slideTo?: number): void {
  const at = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(master);
  o.start(at); o.stop(at + dur + 0.05);
}

function oldCue(ctx: any, master: any, cue: Cue): void {
  const tone = (...a: [number, number, number, number?, OscillatorType?, number?]) => oldTone(ctx, master, ...a);
  switch (cue) {
    case "doors": tone(880, 0.5, 0.12); tone(1175, 0.7, 0.1, 0.18); break;
    case "depart": tone(523, 0.22, 0.1); tone(523, 0.22, 0.1, 0.3); tone(392, 0.5, 0.08, 0.6, "triangle"); break;
    case "arrive": tone(659, 0.4, 0.1); tone(523, 0.4, 0.1, 0.22); tone(784, 0.8, 0.09, 0.45); break;
    case "fare": tone(1568, 0.16, 0.09, 0, "triangle"); tone(2093, 0.3, 0.07, 0.07, "triangle"); break;
    case "tip": [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.22, 0.06, i * 0.06, "triangle")); break;
    case "lost": tone(330, 0.5, 0.12, 0, "sawtooth", 196); break;
    case "complete": [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.7, 0.09, i * 0.12)); break;
  }
}

const norm = (rows: unknown[][]) => rows.map((r) => r.map((v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
const calls = (list: Array<{ node: string; method: string; args: unknown[] }>, node: string) => norm(list.filter((c) => c.node === node).map((c) => [c.method, ...c.args]));

describe("Last Train event cues on the synth cue kit (parameter-level equivalence; not listened to)", () => {
  for (const cue of Object.keys(CUES) as Cue[]) {
    it(`${cue} has the original oscillators, glides, envelopes and timing`, async () => {
      const ref = createFakeContext("running");
      ref.ctx.currentTime = 0.5;
      oldCue(ref.ctx, ref.ctx.destination, cue);

      const next = createFakeContext("running");
      next.ctx.currentTime = 0.5;
      const bank = createCueBank({ cues: CUES, context: next.ctx, masterGain: 0.85, sfxGain: 1, muteKey: false });
      await bank.unlock();
      const base = next.calls.length;
      expect(bank.play(cue)).toBe(true);
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

  it("covers every cue", () => {
    expect(Object.keys(CUES).sort()).toEqual(["arrive", "complete", "depart", "doors", "fare", "lost", "tip"]);
  });
});
