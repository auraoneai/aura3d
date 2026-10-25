import { describe, expect, it } from "vitest";
import { createCueBank } from "../../../packages/audio/src/synth";
import { TONE_CUES, TONE_EVENTS } from "../../../examples/kid-goku-beyond-the-clouds-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

/** The port's original hand-written `tone()` and the original statements for the events now on the cue bank, verbatim. */
function oldTone(ctx: any, sfx: any, freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number): void {
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfx); o.start(t); o.stop(t + dur + 0.05);
}

function oldEvent(ctx: any, sfx: any, name: string, count: number, orbPitch: number): void {
  const tone = (...a: [number, number, OscillatorType, number, number?, number?]) => oldTone(ctx, sfx, ...a);
  switch (name) {
    case "jump": tone(300, 0.16, "triangle", 0.16, 0, 640); break;
    case "orb": { const n = [0, 2, 4, 7, 9][orbPitch % 5]!; const f = 660 * Math.pow(2, n / 12); tone(f, 0.18, "sine", 0.13); tone(f * 2, 0.12, "sine", 0.05, 0.02); if (count % 5 === 0) tone(f * 1.5, 0.2, "sine", 0.06, 0.05); break; }
    case "skypearl": [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.45, "triangle", 0.16, i * 0.07)); break;
    case "checkpoint": [660, 880, 1100].forEach((f, i) => tone(f, 0.4, "sine", 0.12, i * 0.09)); break;
    case "perfect": [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, "triangle", 0.15, i * 0.06)); break;
    case "jan": tone(330, 0.14, "square", 0.1); break;
    case "ken": tone(392, 0.14, "square", 0.1); break;
    case "guu": case "paa": case "choki": tone(523, 0.22, "square", 0.12); break;
    case "dodge": case "close-call": tone(660, 0.12, "triangle", 0.1, 0, 990); break;
    case "fall-start": tone(900, 0.9, "sine", 0.18, 0, 160); break;
    case "respawn": tone(300, 0.3, "triangle", 0.12, 0, 600); break;
    case "glider-ready": [880, 1175].forEach((f, i) => tone(f, 0.3, "sine", 0.1, i * 0.1)); break;
    case "glider-end": tone(900, 0.3, "sine", 0.1, 0, 400); break;
    case "glider-empty": case "glider-wait": tone(200, 0.12, "square", 0.08); break;
    case "finish": [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.9, "triangle", 0.14, i * 0.14)); break;
    case "dead": [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, "triangle", 0.16, i * 0.16)); break;
    case "screech": tone(1500, 0.5, "sawtooth", 0.1, 0, 3100); tone(1100, 0.5, "square", 0.05, 0.02, 2400); break;
    default: throw new Error(`no reference for ${name}`);
  }
}

const calls = (list: Array<{ node: string; method: string; args: unknown[] }>, node: string) => list.filter((c) => c.node === node).map((c) => [c.method, ...c.args]);

describe("Cumulus Dash tone-only events on the synth cue kit (parameter-level equivalence; not listened to)", () => {
  for (const [name, cue] of Object.entries(TONE_EVENTS)) {
    for (const [count, orbIndex] of [[1, 0], [5, 3], [10, 4]] as const) {
      if (cue !== "orb" && count !== 1) continue;
      it(`${name} (count ${count}) matches the original oscillators, glides, envelopes and timing`, async () => {
        const ref = createFakeContext("running");
        ref.ctx.currentTime = 0.5;
        oldEvent(ref.ctx, ref.ctx.destination, name, count, orbIndex);

        const f = createFakeContext("running");
        f.ctx.currentTime = 0.5;
        const bank = createCueBank({ cues: TONE_CUES, context: f.ctx, masterGain: 0.8, sfxGain: 0.7, muteKey: false });
        await bank.unlock();
        const base = f.calls.length;
        if (cue === "orb") bank.play("orb", { pitch: Math.pow(2, [0, 2, 4, 7, 9][orbIndex]! / 12), level: count });
        else bank.play(cue);

        const refOsc = ref.ofKind("osc");
        const newOsc = f.ofKind("osc");
        expect(newOsc).toHaveLength(refOsc.length);
        refOsc.forEach((o, i) => {
          const n = newOsc[i]!;
          expect(n.type).toBe(o.type);
          expect(n.started[0]).toBeCloseTo(o.started[0]!, 9);
        });
        const newCalls = f.calls.slice(base);
        const norm = (rows: unknown[][]) => rows.map((r) => r.map((v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
        expect(norm(calls(newCalls, "gain.gain"))).toEqual(norm(calls(ref.calls, "gain.gain")));
        expect(norm(calls(newCalls, "osc.frequency"))).toEqual(norm(calls(ref.calls, "osc.frequency")));
      });
    }
  }

  it("keeps every noise-bearing event and `ui` out of the bank", () => {
    for (const name of ["land", "dismount", "splash", "meat", "extend", "launch", "strike", "strike-hit", "duel-won", "hit", "rumble", "boulder", "glider-call", "glider-knocked", "ui"]) {
      expect(TONE_EVENTS[name]).toBeUndefined();
    }
  });
});
