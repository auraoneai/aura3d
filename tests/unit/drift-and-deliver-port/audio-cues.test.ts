import { describe, expect, it } from "vitest";
import { createCueBank } from "../../../packages/audio/src/synth";
import { CUES, chimeNotes } from "../../../examples/drift-and-deliver-port/audio";
import { createFakeContext } from "../audio-synth/mockContext";

/** The port's original hand-written chime and thud, kept verbatim as the reference the cue-bank cues must match. */
function oldChime(ctx: any, master: any, kind: "coin" | "star" | "heart", combo: number): void {
  chimeNotes(kind, combo).forEach((hz, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = kind === "heart" ? "triangle" : "sine";
    o.frequency.value = hz;
    const t = ctx.currentTime + i * 0.065;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  });
}

function oldNoise(ctx: any, seconds: number): { data: Float32Array } {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let a = 0x2f6e2b1;
  for (let i = 0; i < data.length; i++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    data[i] = (a / 4294967296) * 2 - 1;
  }
  return buffer;
}

function oldThud(ctx: any, master: any, noise: any): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 260;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.4);
}

const gainCalls = (calls: Array<{ node: string; method: string; args: unknown[] }>) => calls.filter((c) => c.node === "gain.gain").map((c) => [c.method, ...c.args]);

async function runNew(play: (bank: ReturnType<typeof createCueBank<keyof typeof CUES>>) => void) {
  const f = createFakeContext("running");
  f.ctx.currentTime = 0.5;
  const bank = createCueBank({ cues: CUES, context: f.ctx, masterGain: 0.8, sfxGain: 1, noiseSeed: 0x2f6e2b1, muteKey: false });
  await bank.unlock();
  const baseline = f.calls.length;
  play(bank);
  return { f, calls: f.calls.slice(baseline) };
}

describe("Drift & Deliver one-shot cues on the synth cue kit (parameter-level equivalence; not listened to)", () => {
  for (const kind of ["coin", "star", "heart"] as const) {
    for (const combo of [1, 2, 5, 9]) {
      it(`chime ${kind} at combo ${combo} has the original oscillators, pitches, envelopes and timing`, async () => {
        const ref = createFakeContext("running");
        ref.ctx.currentTime = 0.5;
        oldChime(ref.ctx, ref.ctx.destination, kind, combo);

        const name = kind === "star" ? "chimeStar" : kind === "heart" ? "chimeHeart" : "chimeCoin";
        const next = await runNew((bank) => bank.play(name, { level: combo }));

        const refOsc = ref.ofKind("osc");
        const newOsc = next.f.ofKind("osc");
        expect(newOsc).toHaveLength(refOsc.length);
        refOsc.forEach((o, i) => {
          const n = newOsc[i]!;
          expect(n.type).toBe(o.type);
          expect(n.frequency.value).toBeCloseTo(o.frequency.value, 9);
          expect(n.started[0]).toBeCloseTo(o.started[0]!, 9);
        });
        expect(gainCalls(next.calls)).toEqual(gainCalls(ref.calls));
      });
    }
  }

  it("thud has the original lowpass 260 Hz noise burst, 0.6 to 0.0001 over 0.35 s, and the same noise samples", async () => {
    const ref = createFakeContext("running");
    ref.ctx.currentTime = 0.5;
    const oldBuffer = oldNoise(ref.ctx, 2);
    oldThud(ref.ctx, ref.ctx.destination, oldBuffer);

    const next = await runNew((bank) => bank.play("thud"));
    const refFilter = ref.ofKind("filter")[0]!;
    const newFilter = next.f.ofKind("filter")[0]!;
    expect(newFilter.type).toBe(refFilter.type);
    expect(newFilter.frequency.value).toBe(refFilter.frequency.value);
    // the original never set Q, so the real BiquadFilterNode default (1) applied; the kit sets it explicitly
    expect(refFilter.Q.value).toBe(0);
    expect(newFilter.Q.value).toBe(1);
    expect(gainCalls(next.calls)).toEqual(gainCalls(ref.calls));
    expect(next.f.ofKind("source")[0]!.started[0]).toBe(ref.ofKind("source")[0]!.started[0]);

    const newBuffer = next.f.ofKind("source")[0]!.buffer as { data: Float32Array };
    expect(Array.from(newBuffer.data)).toEqual(Array.from(oldBuffer.data.subarray(0, newBuffer.data.length)));
  });

  it("documents the only timing difference: voices stop 10 ms later than the old code, after the envelope reached silence", async () => {
    const ref = createFakeContext("running");
    ref.ctx.currentTime = 0.5;
    oldChime(ref.ctx, ref.ctx.destination, "coin", 1);
    const next = await runNew((bank) => bank.play("chimeCoin", { level: 1 }));
    const oldStop = ref.ofKind("osc")[0]!.stopped[0]!;
    const newStop = next.f.ofKind("osc")[0]!.stopped[0]!;
    expect(newStop - oldStop).toBeCloseTo(0.01, 9);
  });
});
