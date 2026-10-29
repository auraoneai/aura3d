// Pip's Big Leap per-world motion (audit 2026-10-29 row P1).
import { describe, expect, it } from "vitest";
import { deriveWorldMotion, validationFacts } from "../../../apps/showcase-pips-big-leap/src/game/motion";
import { WORLDS, worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

// The shipped feel. The P1 fix changes what the validator is fed, never the tuning.
const SHIPPED: Record<string, readonly [number, number, number]> = {
  academy: [-32, 13.4, 5.2],
  w1: [-32, 13.4, 5.3],
  w2: [-31.7871, 10.1719, 5.4],
  w3: [-32, 12.4687, 5.4],
  w4: [-27.832, 9.6, 5.4],
  w5: [-32, 13.4, 5.5],
  w6: [-18, 13.4, 4.9]
};

describe("pips-big-leap motion validation (P1)", () => {
  it("keeps the shipped gravity, jump velocity and run speed in every world", () => {
    for (const w of WORLDS) {
      const t = deriveWorldMotion(w).tuning;
      const [g, j, s] = SHIPPED[w.id]!;
      expect(t.gravity).toBeCloseTo(g, 3);
      expect(t.jumpVelocity).toBeCloseTo(j, 3);
      expect(t.moveSpeed).toBeCloseTo(s, 3);
    }
  });

  it("passes the engine motion report in every world", () => {
    for (const w of WORLDS) {
      const m = deriveWorldMotion(w);
      const failed = m.report.checks.filter((c) => !c.passes).map((c) => `${w.id}: ${c.detail}`);
      expect(failed).toEqual([]);
      expect(m.report.passes).toBe(true);
    }
  });

  it("every spring launches higher than the rise it is placed under", () => {
    for (const w of WORLDS) {
      for (const edge of deriveWorldMotion(w).springEdges) {
        expect(edge.springApex, `${w.id} ${edge.from}->${edge.to}`).toBeGreaterThanOrEqual(edge.rise * 1.15);
      }
    }
  });

  it("feeds the validator edge-to-edge positions, so gaps are the real XZ gaps", () => {
    const w1 = worldSpec("w1");
    const { facts } = validationFacts(w1, 15.6, -32);
    // start (z 0, d 8) -> log-1 (z -5.8, d 2.8): real gap 5.8 - 4 - 1.4 = 0.4 m.
    const gap = facts[1]!.x - (facts[0]!.x + facts[0]!.width);
    expect(gap).toBeCloseTo(0.4, 3);
  });
});
