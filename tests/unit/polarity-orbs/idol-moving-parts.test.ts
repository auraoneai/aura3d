import { describe, expect, it } from "vitest";
import { BACKDROP_GROUPS, updateBackdrop } from "../../../apps/showcase-polarity-orbs/src/backdrop";

/**
 * Idol wow pass, moving parts: the Idol coil / magnet / crystals / floating islands were static assemblies in the
 * procedural version too; what moved was each backdrop group (scroll with the road, islands and crystals bob and rise
 * with the dominant polarity). Every Idol body rides its group, so this checks every group still moves over time.
 */
describe("polarity-orbs Idol backdrop groups keep moving", () => {
  it("scroll with distance, and the island / crystal groups bob over time", () => {
    const pos = new Map<string, number[]>();
    const node = (id: string) => ({ setPosition: (x: number, y: number, z: number) => { pos.set(id, [x, y, z]); } }) as never;
    updateBackdrop(node, 10, 1, 0.5, false);
    const a = new Map(pos);
    updateBackdrop(node, 30, 2.3, 0.5, false);
    for (const g of BACKDROP_GROUPS) {
      const p0 = a.get(g.id)!, p1 = pos.get(g.id)!;
      expect(p1[2], `${g.id} scrolls`).not.toBeCloseTo(p0[2]!, 3);
      if (g.kind !== "poChargeCoil" && g.kind !== "poMagnet") expect(Math.abs(p1[1]! - p0[1]!), `${g.id} bobs`).toBeGreaterThan(0.01);
    }
  });
});
