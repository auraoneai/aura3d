import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IDOL_TRAFFIC_VARIANTS, buildIdolTrafficFleet, idolCourierNode, idolPedestrianNodes, idolPropNodes } from "../../../examples/drift-and-deliver-port/idol";
import { TRAFFIC_FLEET_KINDS } from "../../../examples/drift-and-deliver-port/art/proceduralModels";
import { buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { planProps, propNodes } from "../../../examples/drift-and-deliver-port/props";
import { buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";
import { createCar } from "../../../examples/drift-and-deliver-port/sim";

const root = resolve(__dirname, "../../..");
const manifest = JSON.parse(readFileSync(resolve(root, "aura.assets.json"), "utf8")) as { assets: { id: string; type: string; bounds?: number[] }[] };
const byId = new Map(manifest.assets.map((a) => [a.id, a]));

describe("Gridlock Courier Idol pass (render layer only)", () => {
  it("references only admitted gc* model assets", () => {
    const src = readFileSync(resolve(root, "examples/drift-and-deliver-port/idol.ts"), "utf8");
    const keys = [...new Set([...src.matchAll(/"(gc[A-Z][A-Za-z]+)"/g)].map((m) => m[1]!))];
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const k of keys) expect(byId.get(k)?.type, k).toBe("model");
  });

  it("courier keeps the car-rig runtime id and the footprint-sized body", () => {
    const json = idolCourierNode("car-rig", true, "YXZ").toJSON() as { kind: string; rotationOrder?: string; children: { kind: string; scaleMode?: string }[] };
    expect(json.kind).toBe("group");
    expect(json.rotationOrder).toBe("YXZ");
    expect(json.children[0]!.kind).toBe("model");
    expect(json.children[0]!.scaleMode).toBe("world");
    const b = byId.get("gcCourier")!.bounds!;
    // FOOTPRINT = { halfW: 0.9954, halfD: 2.142 }: the Idol body is generated at the footprint length
    expect(b[2]).toBeCloseTo(4.28, 1);
    expect(b[0]).toBeLessThan(2.2);
  });

  it("draws every traffic car exactly once, in its procedural class, across the paint variants", () => {
    const traffic = Array.from({ length: 84 }, (_, i) => ({ x: i, z: -i, yaw: i * 0.1 }));
    const fleet = buildIdolTrafficFleet(traffic, false);
    const seen = fleet.groups.flatMap((g) => g.cars).sort((a, b) => a - b);
    expect(seen).toEqual(traffic.map((_, i) => i));
    for (const g of fleet.groups) {
      for (const i of g.cars) expect(TRAFFIC_FLEET_KINDS[i % TRAFFIC_FLEET_KINDS.length]).toBe(g.kind);
      expect(g.layerIds).toEqual([g.id]);
    }
    // one instanced body per paint variant + two instanced wheel draws (tyres, rims)
    expect(fleet.nodes.length).toBe(Object.values(IDOL_TRAFFIC_VARIANTS).flat().length + 2);
  });

  it("instances every pedestrian once and swaps the near-field props and landmarks", () => {
    const blocks = buildBlocks();
    const furniture = buildFurniture(blocks);
    const peds = idolPedestrianNodes(furniture.pedestrians).map((n) => n.toJSON() as { instances?: unknown[] });
    expect(peds.reduce((s, n) => s + (n.instances?.length ?? 0), 0)).toBe(furniture.pedestrians.length);

    const car = createCar();
    const plan = planProps(furniture, blocks, buildBuildings(blocks), { x: car.x, z: car.z });
    const names = propNodes(plan, true, true).map((n) => (n.toJSON() as { name?: string }).name);
    expect(names).toContain("model-tree-idol");
    expect(names).toContain("landmark-clocktower");
    expect(names).toContain("landmark-lighthouse");
    expect(names).not.toContain("model-tree");
    expect(idolPropNodes("shelter", [{ position: [0, 0, 0], rotation: [0, 0.5, 0], scale: 1 }], false)).toBeNull();
  });
});
