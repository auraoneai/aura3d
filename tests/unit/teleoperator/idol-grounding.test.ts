import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAuraApp } from "@aura3d/engine";
import { SIDEWALK_TOP_Y, TREE_BASE_Y } from "../../../apps/showcase-teleoperator/src/art/idolModels";
import { ROAD_STRIPS, buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";
import { SIDEWALK_Y, WALKERS, walkerPose } from "../../../apps/showcase-teleoperator/src/walkers";

/** Idol grounding: nothing floats. Grid Dispatch's avenue is flat (road y 0, sidewalk slabs 0.18 m tall). */
describe("Grid Dispatch Idol grounding", () => {
  it("the sidewalk constant matches the sidewalk slabs actually mounted", () => {
    for (const id of ["sf-sidewalk-left", "sf-sidewalk-right"]) {
      const strip = ROAD_STRIPS.find((s) => s.id === id)!;
      expect(strip.y * 2).toBeCloseTo(SIDEWALK_TOP_Y, 6);
    }
  });
  it("street trees sink 0.1-0.2 m into the sidewalk; people stand on it; ground-level landmarks sit at road level", () => {
    const sink = SIDEWALK_TOP_Y - TREE_BASE_Y;
    expect(sink).toBeGreaterThanOrEqual(0.1);
    expect(sink).toBeLessThanOrEqual(0.2);
    expect(readFileSync("apps/showcase-teleoperator/src/main.ts", "utf8")).toMatch(/streetTreeInstanceTransform\(\[rx\(12\.2\), ry\(TREE_BASE_Y\)/);
    expect(SIDEWALK_Y).toBe(SIDEWALK_TOP_Y);
    for (const w of WALKERS) expect(Math.abs(walkerPose(w, 3, 0).x)).toBeGreaterThan(11); // on the slab (x 10.95-19.45)
    const app = createAuraApp(undefined, { scene: buildGridDispatchScene("golden"), autoStart: false });
    const nodes = (app.scene as unknown as { nodes: { name?: string; position?: number[] }[] }).nodes;
    for (const id of ["sf-ferry-clocktower", "sf-pyramid-tower"]) expect(nodes.find((n) => n.name === id)?.position?.[1], id).toBe(0);
    app.dispose?.();
  });
});
