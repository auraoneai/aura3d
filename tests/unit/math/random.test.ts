import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../packages/math/src/Random";

describe("SeededRandom §7.6 additions (PRD-09 1744)", () => {
  it("fixed sequences for seed 42", () => {
    const r = new SeededRandom(42);
    const seq = Array.from({ length: 5 }, () => r.nextUint32());
    const r2 = new SeededRandom(42);
    expect(Array.from({ length: 5 }, () => r2.nextUint32())).toEqual(seq);
  });

  it("int(min, maxExclusive) stays in range and is deterministic", () => {
    const r = new SeededRandom(7);
    for (let i = 0; i < 200; i++) {
      const v = r.int(3, 10);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(new SeededRandom(7).int(0, 6)).toBe(new SeededRandom(7).int(0, 6));
    expect(() => new SeededRandom(1).int(5, 5)).toThrow(RangeError);
  });

  it("pick draws members only; empty throws", () => {
    const r = new SeededRandom(11);
    const items = ["a", "b", "c", "d"];
    for (let i = 0; i < 50; i++) expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it("shuffle is a permutation of the input", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const copy = [...input];
    const out = new SeededRandom(99).shuffle(copy);
    expect(out).toBe(copy);
    expect([...copy].sort((a, b) => a - b)).toEqual(input);
    expect(copy).not.toEqual(input); // 30 elements: a no-op shuffle is ~impossible
  });

  it("fork(label) diverges across labels and is stable per label", () => {
    const a1 = new SeededRandom(42).fork("a").nextUint32();
    const a2 = new SeededRandom(42).fork("a").nextUint32();
    const b = new SeededRandom(42).fork("b").nextUint32();
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    const s = Array.from({ length: 4 }, () => new SeededRandom(5).fork("music").nextFloat());
    const s2 = Array.from({ length: 4 }, () => new SeededRandom(5).fork("music").nextFloat());
    expect(s).toEqual(s2);
  });
});
