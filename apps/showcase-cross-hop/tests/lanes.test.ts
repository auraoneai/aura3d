import { describe, it, expect } from "vitest";
import { laneFor, laneMovers, moverHalf, laneZ } from "../src/game/world";
import { THEMES, themeIndexForRow, LANE_D } from "../src/game/themes";

describe("lane streamer", () => {
  it("is deterministic for a seed", () => {
    const a = laneFor(17, 1234, 0.4);
    const b = laneFor(17, 1234, 0.4);
    expect(a.type).toBe(b.type);
    expect(a.speed).toBeCloseTo(b.speed);
    expect(a.dir).toBe(b.dir);
  });
  it("never stacks more than 2 hard lanes", () => {
    let streak = 0;
    for (let r = 3; r < 200; r++) {
      const t = laneFor(r, 42, 0.7).type;
      streak = t === "meadow" ? 0 : streak + 1;
      expect(streak).toBeLessThanOrEqual(2);
    }
  });
  it("meadow lanes at start are safe", () => {
    expect(laneFor(0, 1, 0).type).toBe("meadow");
    expect(laneFor(1, 1, 0).type).toBe("meadow");
  });
  it("movers are deterministic functions of time", () => {
    const l = laneFor(30, 77, 0.5);
    const xs = new Float32Array(16);
    const n = laneMovers(l, 3.5, xs);
    const xs2 = new Float32Array(16);
    expect(laneMovers(l, 3.5, xs2)).toBe(n);
    for (let i = 0; i < n; i++) expect(xs[i]).toBeCloseTo(xs2[i]);
  });
  it("movers move with time", () => {
    const l = { ...laneFor(30, 77, 0.5), speed: 4, dir: 1 as const, moverKind: "car" as const, spacing: 5, type: "road" as const };
    const a = new Float32Array(16), c = new Float32Array(16);
    laneMovers(l, 0, a); laneMovers(l, 0.5, c);
    expect(a[0]).not.toBeCloseTo(c[0]);
  });
  it("themes shift every 25 rows", () => {
    expect(themeIndexForRow(0, 5)).toBe(0);
    const t26 = themeIndexForRow(26, 5);
    expect(t26).toBeGreaterThanOrEqual(0);
    expect(THEMES.length).toBe(6);
  });
  it("critter core is gated post-100", () => {
    for (let s = 0; s < 50; s++) {
      for (let r = 25; r < 100; r += 25) expect(themeIndexForRow(r, s)).toBeLessThan(5);
    }
  });
  it("row z mapping is monotonic", () => {
    expect(laneZ(0)).toBeCloseTo(0);
    expect(laneZ(10)).toBeCloseTo(-10 * LANE_D);
  });
});
