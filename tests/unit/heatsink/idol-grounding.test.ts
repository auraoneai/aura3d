/** Idol wow pass grounding sweep: every Idol track-side anchor stands on the same base as the grounded procedural fit. */
import { describe, expect, it } from "vitest";
import { buildIdolSceneryNode, hasIdolScenery } from "../../../apps/showcase-heatsink/src/art/idolModels";
import { SCENERY_ANCHORS } from "../../../apps/showcase-heatsink/src/data";

describe("Thermal Drift Idol anchors are grounded", () => {
  it("mounts each Idol anchor at its baseY with the grounded GLB at the group origin (no lift, no sink)", () => {
    const idol = SCENERY_ANCHORS.filter(hasIdolScenery);
    expect(idol.length).toBeGreaterThan(5);
    for (const anchor of idol) {
      const g = buildIdolSceneryNode(anchor, false).toJSON() as unknown as { position: number[]; children: { position?: number[]; asset?: { bounds?: number[] } }[] };
      expect(g.position[1], anchor.id).toBe(anchor.baseY);
      expect(g.children[0]!.position?.[1] ?? 0, anchor.id).toBe(0);
      // the admitted GLB is grounded at y = 0 and fits the anchor's footprint
      expect(Math.max(...(g.children[0]!.asset?.bounds ?? [0])), anchor.id).toBeLessThanOrEqual(anchor.maxDim * 1.05);
    }
  });
});
