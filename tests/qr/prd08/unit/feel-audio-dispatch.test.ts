/**
 * A-10: feel `audio` channel dispatches to the bound `GameSound.play` with
 * rate jitter ∈ [1−pitchJitter, 1+pitchJitter] and the event position;
 * `executed.audio` only counts calls that returned a real VoiceHandle.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAuraFeelBus } from "../../../../packages/engine/src/agent-api/feel/extension.js";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index.js";

const fakeApp = () => ({}) as unknown as AuraApp;

// Each bus registers a global prd08.screenFeel contributor — dispose between uses.
const liveBuses: { dispose?: () => void }[] = [];
const makeBus: typeof createAuraFeelBus = (...args) => {
  const bus = createAuraFeelBus(...args);
  liveBuses.push(bus as { dispose?: () => void });
  return bus;
};
afterEach(() => {
  while (liveBuses.length) liveBuses.pop()!.dispose?.();
});

describe("A-10 feel audio channel → GameSound.play", () => {
  it("passes pitch jitter rate in [1−j, 1+j] and the emit position", () => {
    const plays: { cue: string; rate?: number; position?: readonly number[] }[] = [];
    const feel = makeBus(fakeApp(), {
      sound: {
        play: (cue: string, o?: { position?: readonly [number, number, number]; rate?: number }) => {
          plays.push({ cue, rate: o?.rate, position: o?.position });
          return { id: "v1" }; // VoiceHandle
        },
        proof: () => ({ contextState: "running" })
      }
    });
    feel.define("ding", { audio: { cue: "coin", pitchJitter: 0.05 } });
    for (let i = 0; i < 40; i += 1) {
      feel.emit("ding", { position: [1, 2, 3] });
    }
    expect(plays).toHaveLength(40);
    for (const p of plays) {
      expect(p.rate).toBeGreaterThanOrEqual(0.95);
      expect(p.rate).toBeLessThanOrEqual(1.05);
      expect(p.position).toEqual([1, 2, 3]);
    }
    expect(feel.evidence().executed.audio).toBe(40);
  });

  it("executed.audio counts only real VoiceHandles (null/''none'' → 0)", () => {
    const nullPlay = makeBus(fakeApp(), {
      sound: { play: () => null, proof: () => ({ contextState: "running" }) }
    });
    nullPlay.define("x", { audio: { cue: "a" } });
    nullPlay.emit("x");
    expect(nullPlay.evidence().executed.audio ?? 0).toBe(0);
    nullPlay.dispose();
    liveBuses.length = 0;

    const stubCtx = makeBus(fakeApp(), {
      sound: { play: () => ({ id: "v" }), proof: () => ({ contextState: "none" }) }
    });
    stubCtx.define("x", { audio: { cue: "a" } });
    stubCtx.emit("x");
    expect(stubCtx.evidence().executed.audio ?? 0).toBe(0);
  });

  it("I-6: haptics:false removes the haptics provider (executed stays 0)", () => {
    const feel = makeBus(fakeApp(), { haptics: false });
    feel.define("buzz", { haptics: { strong: 0.5, ms: 40 } });
    feel.emit("buzz");
    expect(feel.evidence().executed.haptics ?? 0).toBe(0);
  });
});
