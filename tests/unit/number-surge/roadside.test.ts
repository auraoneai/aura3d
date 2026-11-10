import { describe, expect, it } from "vitest";
import { DIMS } from "../../../apps/showcase-number-surge/src/meshes";
import { ROADSIDE, ROADSIDE_KINDS, ROADSIDE_SPAN, roadsidePose } from "../../../apps/showcase-number-surge/src/roadside";
import { NumberSurgeSim } from "../../../apps/showcase-number-surge/src/sim";
import { buildWorld } from "../../../apps/showcase-number-surge/src/world";

describe("number surge Meshy roadside dressing", () => {
  it("every piece stays clear of the road and never hides (parked at a tiny scale instead)", () => {
    const halfRoad = DIMS.ROAD_WIDTH / 2;
    for (const p of ROADSIDE) {
      for (let travelled = 0; travelled < ROADSIDE_SPAN * 2; travelled += 3.7) {
        const pose = roadsidePose(p, travelled, travelled * 0.1);
        // fitted width at full scale is at most about the model height (dice: 2.5x), centred on x
        const halfWidth = p.kind === "nsFloatingDice" ? p.height * 1.25 : p.kind === "nsNumeralSeven" ? p.height * 0.29 : p.height * 0.32;
        expect(Math.abs(pose.x) - halfWidth * pose.scale).toBeGreaterThan(halfRoad + 1);
        expect(pose.scale).toBeGreaterThanOrEqual(0.001);
        expect(pose.z).toBeLessThan(10);
      }
    }
  });

  it("batches all pieces into 4 GPU-instanced model nodes (one per asset kind) with positive scales", () => {
    const world = buildWorld({ sim: new NumberSurgeSim(7), aspect: 16 / 9 });
    const nodes = world.scene.toJSON().nodes as unknown as { kind: string; name?: string; instances?: { scale?: number | number[] }[] }[];
    const models = nodes.filter((n) => n.kind === "model");
    expect(models.map((n) => n.name).sort()).toEqual(ROADSIDE_KINDS.map((k) => `roadside-${k}`).sort());
    const totalInstances = models.reduce((sum, m) => sum + (m.instances?.length ?? 0), 0);
    expect(totalInstances).toBe(ROADSIDE.length);
    for (const m of models) {
      for (const inst of m.instances ?? []) {
        const s = typeof inst.scale === "number" ? inst.scale : (inst.scale?.[0] ?? 1);
        expect(s).toBeGreaterThan(0);
      }
    }
  });
});
