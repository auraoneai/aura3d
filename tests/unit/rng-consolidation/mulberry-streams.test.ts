import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../packages/math/src/Random.js";
import { createCountedRng } from "../../../packages/engine/src/qa/index.js";
import { createRng } from "../../../apps/showcase-roadster-rush/src/native/rng.js";
import { mulberry32 as dotDash } from "../../../apps/showcase-dot-dash-3d/src/game/grid.js";
import { seededRandom as heatsink } from "../../../examples/heatsink-port/rng.js";
import { GameRng } from "../../../examples/splat-rush-port/rng.js";

// The inline generators the games used before consolidation, kept here as the golden reference.
function legacySigned(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function legacyUnsigned(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = [0, 1, 7, 42, 4242, 0x51a7, 0x9e3779b1, 0xffffffff, 123456789, -5];

describe("consolidated mulberry32 streams are bit-identical to the inline copies", () => {
  it("createCountedRng matches both legacy forms over 2000 draws per seed", () => {
    for (const seed of SEEDS) {
      const a = createCountedRng(seed);
      const s = legacySigned(seed);
      const u = legacyUnsigned(seed);
      for (let i = 0; i < 2000; i++) {
        const v = a.next();
        expect(v).toBe(s());
        expect(v).toBe(u());
      }
      expect(a.draws).toBe(2000);
      expect(a.count).toBe(2000);
    }
  });

  it("each migrated game stream equals the legacy stream", () => {
    for (const seed of SEEDS) {
      const ref = legacyUnsigned(seed);
      const rr = createRng(seed);
      const dd = dotDash(seed);
      const hs = heatsink(seed);
      const sr = new GameRng(seed);
      for (let i = 0; i < 500; i++) {
        const v = ref();
        expect(rr.next()).toBe(v);
        expect(dd()).toBe(v);
        expect(hs()).toBe(v);
        expect(sr.next()).toBe(v);
      }
      expect(sr.count).toBe(500);
    }
  });

  it("SeededRandom.draws counts nextUint32 draws without changing the sequence", () => {
    const a = new SeededRandom(99);
    const b = new SeededRandom(99);
    const seq = [a.nextFloat(), a.int(0, 10), a.range(1, 2)];
    expect(a.draws).toBe(3);
    expect([b.nextFloat(), b.int(0, 10), b.range(1, 2)]).toEqual(seq);
    expect(a.clone().draws).toBe(3);
  });
});
