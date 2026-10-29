import { describe, expect, it } from "vitest";
import { createCueBank } from "../../../packages/audio/src/synth";
import { PORT_ONLY_CUES, TONE_CUES, TONE_EVENTS } from "../../../examples/strange-orbit-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

/** The port's original hand-written `tone` and the original `cue` cases now on the cue bank, verbatim. */
function oldTone(ctx: any, master: any, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function oldCue(ctx: any, master: any, type: string, mult: number): void {
  const t = ctx.currentTime + 0.005;
  const tone = (...a: [number, number, number, OscillatorType, number, number?]) => oldTone(ctx, master, ...a);
  switch (type) {
    case "dust": {
      const base = 740 * Math.pow(1.0595, Math.min(12, Math.max(0, Math.round(Math.log2(Math.max(1, mult)) * 3))));
      tone(base, t, 0.22, "sine", 0.1);
      tone(base * 1.5, t + 0.05, 0.3, "sine", 0.07);
      break;
    }
    case "gate": tone(523, t, 0.25, "triangle", 0.1); tone(784, t + 0.09, 0.35, "triangle", 0.1); break;
    case "countdown": case "tick": tone(440, t, 0.16, "square", 0.05); break;
    case "go": tone(880, t, 0.45, "square", 0.07); tone(1320, t + 0.02, 0.5, "triangle", 0.06); break;
    case "jump": tone(300, t, 0.16, "sine", 0.1, 520); break;
    case "stunt": tone(988, t, 0.12, "triangle", 0.08); tone(1318, t + 0.08, 0.2, "triangle", 0.08); break;
    case "sling": case "gravity": tone(220, t, 0.55, "sine", 0.1, 880); break;
    case "route": tone(660, t, 0.18, "triangle", 0.07); break;
    case "resonance": tone(587, t, 0.5, "sine", 0.08); tone(880, t, 0.6, "sine", 0.06); break;
    case "lap": case "finish":
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.5, "triangle", 0.1));
      break;
    default: throw new Error(`no reference for ${type}`);
  }
}

const norm = (rows: unknown[][]) => rows.map((r) => r.map((v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
const calls = (list: Array<{ node: string; method: string; args: unknown[] }>, node: string) => norm(list.filter((c) => c.node === node).map((c) => [c.method, ...c.args]));

describe("Strange Orbit tone-only cues on the synth cue kit (parameter-level equivalence; not listened to)", () => {
  for (const [name, cue] of Object.entries(TONE_EVENTS)) {
    if (PORT_ONLY_CUES.includes(name)) continue;
    for (const mult of name === "dust" ? [1, 2, 5, 40] : [1]) {
      it(`${name}${name === "dust" ? ` (x${mult})` : ""} has the original oscillators, glides, envelopes and timing`, async () => {
        const ref = createFakeContext("running");
        ref.ctx.currentTime = 0.5;
        oldCue(ref.ctx, ref.ctx.destination, name, mult);

        const next = createFakeContext("running");
        next.ctx.currentTime = 0.5;
        const bank = createCueBank({ cues: TONE_CUES, context: next.ctx, masterGain: 0.7, sfxGain: 1, muteKey: false });
        await bank.unlock();
        const base = next.calls.length;
        expect(bank.play(cue, { level: mult })).toBe(true);
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
  }

  it("skate loop entry has its own cue, distinct from the checkpoint cue (SO-7)", () => {
    expect(TONE_EVENTS.loop).toBe("loop");
    expect(TONE_CUES.loop.layers).not.toEqual(TONE_CUES.gate.layers);
  });

  it("keeps the noise-bearing cues out of the bank", () => {
    for (const name of ["land", "launch", "hit", "lost"]) expect(TONE_EVENTS[name]).toBeUndefined();
  });
});
