import { describe, expect, it } from "vitest";
import { GameRng } from "../../../examples/shared/runner-kit/rng";

describe("runner-kit GameRng", () => {
  it("same seed produces the identical draw stream", () => {
    const a = new GameRng(42), b = new GameRng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
    expect(a.count).toBe(1000);
    expect(b.count).toBe(1000);
  });

  it("counts every draw and starts at zero", () => {
    const rng = new GameRng(7);
    expect(rng.count).toBe(0);
    rng.next();
    rng.next();
    expect(rng.count).toBe(2);
  });

  it("different seeds diverge", () => {
    const a = new GameRng(1), b = new GameRng(2);
    const drawsA = Array.from({ length: 32 }, () => a.next());
    const drawsB = Array.from({ length: 32 }, () => b.next());
    expect(drawsA).not.toEqual(drawsB);
  });

  it("draws stay in [0, 1)", () => {
    const rng = new GameRng(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});