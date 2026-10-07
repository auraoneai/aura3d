import { describe, expect, it } from "vitest";
import { VoicePool } from "../../../packages/audio/src/game-sound/Voice";
import { mulberry32, VariantPicker } from "../../../packages/audio/src/game-sound/rng";
import { FakeContext, FakeNode, FakeSource } from "./fake-context";

const dest = () => new FakeNode("bus");

const makePool = (cap = 32, seed = 42) => {
  const ctx = new FakeContext();
  let ms = 0;
  const pool = new VoicePool({
    ctx,
    rng: mulberry32(seed),
    voiceCap: cap,
    now: () => ms,
    bufferFor: () => ({ duration: 0.5, length: 24000, sampleRate: 48_000, numberOfChannels: 1 } as AudioBuffer)
  });
  return { ctx, pool, tick: (d: number) => (ms += d) };
};

const cue = (extra: Record<string, unknown> = {}) => ({
  bus: "sfx",
  asset: [{ url: "a.opus.webm" }, { url: "b.opus.webm" }, { url: "c.opus.webm" }],
  maxVoices: 4,
  cooldownMs: 30,
  ...extra
});

describe("VoicePool (PRD-09 §6.8)", () => {
  it("variant sequence for seed 42 has no immediate repeats and covers all variants", () => {
    const picker = new VariantPicker(3, mulberry32(42));
    const seq = Array.from({ length: 12 }, () => picker.next());
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(new Set(seq)).toEqual(new Set([0, 1, 2]));
    // Deterministic for the same seed.
    const again = new VariantPicker(3, mulberry32(42));
    expect(Array.from({ length: 12 }, () => again.next())).toEqual(seq);
    // Different seed → different order.
    const other = new VariantPicker(3, mulberry32(7));
    expect(Array.from({ length: 12 }, () => other.next())).not.toEqual(seq);
  });

  it("per-cue maxVoices steals the oldest voice of the same cue", () => {
    const { pool, tick } = makePool();
    const first = pool.allocate("hit", cue({ maxVoices: 2 }), dest()).record!;
    tick(50);
    const second = pool.allocate("hit", cue({ maxVoices: 2 }), dest()).record!;
    tick(50);
    const third = pool.allocate("hit", cue({ maxVoices: 2 }), dest());
    expect(third.stolen).toBe(first);
    expect((first.source as FakeSource).stopped).toBe(1);
    expect(pool.liveCount).toBe(2);
    tick(50);
    const fourth = pool.allocate("hit", cue({ maxVoices: 2 }), dest());
    expect(fourth.stolen).toBe(second);
  });

  it("cooldown drops plays inside the window and counts them", () => {
    const { pool, tick } = makePool();
    expect(pool.allocate("x", cue(), dest()).dropped).toBe(false);
    expect(pool.allocate("x", cue(), dest()).dropped).toBe(true);
    tick(20);
    expect(pool.allocate("x", cue(), dest()).dropped).toBe(true);
    tick(15); // 35 ms > 30 cooldown
    expect(pool.allocate("x", cue(), dest()).dropped).toBe(false);
    expect(pool.stats.cooldownDrops).toBe(2);
  });

  it("global cap evicts ambient before normal; equal priority drops incoming", () => {
    const { pool, tick } = makePool(3);
    const ambient1 = pool.allocate("amb1", cue({ priority: "ambient", maxVoices: 9, cooldownMs: 0 }), dest()).record!;
    tick(1);
    pool.allocate("norm1", cue({ priority: "normal", maxVoices: 9, cooldownMs: 0 }), dest());
    tick(1);
    pool.allocate("norm2", cue({ priority: "normal", maxVoices: 9, cooldownMs: 0 }), dest());
    tick(1);
    // Cap=3. Incoming normal → evicts the ambient.
    const r = pool.allocate("crit", cue({ priority: "normal", maxVoices: 9, cooldownMs: 0 }), dest());
    expect(r.evicted).toBe(ambient1);
    // Now all live are 'normal'; incoming normal drops.
    const dropped = pool.allocate("x", cue({ priority: "normal", maxVoices: 9, cooldownMs: 0 }), dest());
    expect(dropped.dropped).toBe(true);
    // Incoming critical evicts a normal.
    const crit = pool.allocate("c", cue({ priority: "critical", maxVoices: 9, cooldownMs: 0 }), dest());
    expect(crit.evicted).toBeTruthy();
    expect(crit.dropped).toBe(false);
  });

  it("pitch/gain jitter: rate and gain differ per voice deterministically", () => {
    const a = makePool(32, 42);
    const b = makePool(32, 42);
    const ra = a.pool.allocate("j", cue({ gainJitterDb: 1.5, pitchJitterSemitones: 0.6 }), dest()).record!;
    const rb = b.pool.allocate("j", cue({ gainJitterDb: 1.5, pitchJitterSemitones: 0.6 }), dest()).record!;
    expect((ra.source as FakeSource).playbackRate.value).toBe((rb.source as FakeSource).playbackRate.value);
    expect((ra.gain as unknown as { gain: { value: number } }).gain.value).toBe(
      (rb.gain as unknown as { gain: { value: number } }).gain.value
    );
    a.tick(50);
    const ra2 = a.pool.allocate("j", cue({ gainJitterDb: 1.5, pitchJitterSemitones: 0.6 }), dest()).record!;
    expect((ra2.source as FakeSource).playbackRate.value).not.toBe(
      (ra.source as FakeSource).playbackRate.value
    );
  });
});
