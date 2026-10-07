// PRD-07 P1-T7 — radix back-to-front order matches a reference sort, and the
// sorter reuses its last order when the camera is unchanged and nothing
// flagged `changed`.

import { describe, expect, it } from "vitest";
import { ParticleSort } from "../../../../packages/rendering/src/vfx/ParticleSort";

function mulberryLike(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const basis = (() => {
  const b = new Float32Array(12); // identity view basis (right, up, fwd, pos)
  b[0] = 1;
  b[5] = 1;
  b[10] = 1;
  return b;
})();

describe("P1-T7 particle sort", () => {
  it("orders 10,000 batches back-to-front matching a stable quantized comparator", () => {
    const rng = mulberryLike(0x5eed);
    const batches = Array.from({ length: 10_000 }, () => ({ sortDepth: rng() * 500, changed: false }));
    // The sorter quantizes to a 16-bit descending key — equal buckets keep
    // input order on both sides, so sort on the same quantized key.
    const key = (d: number) => (d <= 0 ? 0 : Math.min(65535, Math.round((Math.min(d, 4096) / 4096) * 65535)));
    const expected = batches.map((b, i) => i).sort((a, b) => key(batches[b].sortDepth) - key(batches[a].sortDepth));
    const order = new ParticleSort().sort(batches, basis);
    expect([...order]).toEqual(expected);
  });

  it("reuses the order when camera is still and nothing changed", () => {
    const sorter = new ParticleSort();
    const batches = [1, 2, 3].map((d) => ({ sortDepth: d, changed: false }));
    const first = sorter.sort(batches, basis);
    const second = sorter.sort(batches, basis);
    expect(second).toBe(first);
  });

  it("re-sorts when a batch flags changed", () => {
    const sorter = new ParticleSort();
    const batches = [1, 2, 3].map((d) => ({ sortDepth: d, changed: false }));
    sorter.sort(batches, basis);
    batches[0].changed = true;
    batches[0].sortDepth = 99;
    const order = sorter.sort(batches, basis);
    expect([...order]).toEqual([0, 2, 1]);
  });
});
