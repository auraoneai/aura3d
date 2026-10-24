import { describe, expect, it } from "vitest";
import { createSfx, type Sfx } from "../../../examples/saiyan-snake-way-port/sfx";
import { createFakeContext } from "../audio-synth/mockContext";
import { createLegacySfx } from "./legacy-sfx";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const CASES: ReadonlyArray<readonly [string, (s: Sfx) => void]> = [
  ["pickup chain 0", (s) => s.pickup(0)],
  ["pickup chain 5", (s) => s.pickup(5)],
  ["pickup chain 20 (clamped to 12)", (s) => s.pickup(20)],
  ["jump", (s) => s.jump()],
  ["land", (s) => s.land()],
  ["hit", (s) => s.hit()],
  ["surge rung 1", (s) => s.surge(1)],
  ["surge rung 4", (s) => s.surge(4)],
  ["whoosh", (s) => s.whoosh()],
  ["fall", (s) => s.fall()],
  ["fanfare", (s) => s.fanfare()]
];

async function run(make: (f: ReturnType<typeof createFakeContext>) => Sfx, play: (s: Sfx) => void) {
  const f = createFakeContext("running");
  f.ctx.currentTime = 1;
  const sfx = make(f);
  sfx.unlock();
  await flush();
  f.calls.length = 0;
  play(sfx);
  return f;
}

describe("Serpentine Sky Run sfx on the cue bank matches the original hand-written synth", () => {
  for (const [name, play] of CASES) {
    it(`${name}: identical oscillator, filter and gain automation`, async () => {
      const legacy = await run((f) => createLegacySfx(f.ctx), play);
      const kit = await run((f) => createSfx({ context: f.ctx }), play);

      // Every setValueAtTime / exponentialRamp / setTarget call, with its arguments and order, is the same.
      expect(kit.calls).toEqual(legacy.calls);
      expect(kit.calls.length).toBeGreaterThan(0);

      for (const kind of ["osc", "source", "filter"]) expect(kit.ofKind(kind).length).toBe(legacy.ofKind(kind).length);
      kit.ofKind("osc").forEach((osc, i) => {
        const old = legacy.ofKind("osc")[i]!;
        expect(osc.type).toBe(old.type);
        expect(osc.started).toEqual(old.started);
        // The kit stops a tone 10 ms after the old code did: the envelope is already at its floor by then.
        expect(osc.stopped[0]).toBeCloseTo((old.stopped[0] as number) + 0.01, 9);
      });
      kit.ofKind("filter").forEach((filter, i) => {
        const old = legacy.ofKind("filter")[i]!;
        expect(filter.type).toBe(old.type);
        expect(filter.Q.value).toBe(old.Q.value);
      });
      kit.ofKind("source").forEach((source, i) => {
        const old = legacy.ofKind("source")[i]!;
        expect(source.started).toEqual(old.started);
        expect(source.stopped).toEqual(old.stopped);
      });
    });
  }

  it("keeps the 0.5 master level and starts unmuted; toggleMute reports the new state", async () => {
    const f = createFakeContext("running");
    const sfx = createSfx({ context: f.ctx });
    sfx.unlock();
    await flush();
    const gains = f.ofKind("gain").map((g) => g.gain.value);
    expect(gains[0]).toBe(0.5);
    expect(gains[2]).toBe(1);
    expect(sfx.toggleMute()).toBe(true);
    expect(sfx.toggleMute()).toBe(false);
  });

  it("stays silent until the context is running", async () => {
    const f = createFakeContext("suspended");
    const sfx = createSfx({ context: f.ctx });
    sfx.jump();
    expect(f.ofKind("osc")).toHaveLength(0);
  });
});
