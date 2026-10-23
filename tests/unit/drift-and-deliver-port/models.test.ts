import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_ASSETS, PROP_BELOW, propTransform, TRAFFIC_MODEL, type ModelKey } from "../../../examples/drift-and-deliver-port/models";
import { buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { planProps, NEAR } from "../../../examples/drift-and-deliver-port/props";
import { buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";
import { createCar } from "../../../examples/drift-and-deliver-port/sim";

const dir = resolve(__dirname, "../../../examples/drift-and-deliver-port/assets/models");

describe("drift-and-deliver generated models", () => {
  it("every declared hash is the sha256 of the shipped GLB and the URL is same-origin", () => {
    for (const [key, asset] of Object.entries(MODEL_ASSETS) as [ModelKey, (typeof MODEL_ASSETS)[ModelKey]][]) {
      const bytes = readFileSync(resolve(dir, `${key}.glb`));
      expect(asset.hash, key).toBe(`sha256-${createHash("sha256").update(bytes).digest("hex")}`);
      expect(asset.url.startsWith("http"), key).toBe(false);
      expect(bytes.subarray(0, 4).toString("ascii"), key).toBe("glTF");
    }
  });

  it("keeps the shipped model bytes within the per-game budget", () => {
    const total = Object.keys(MODEL_ASSETS).reduce((s, k) => s + readFileSync(resolve(dir, `${k}.glb`)).length, 0);
    expect(total).toBeLessThan(18 * 1024 * 1024);
  });

  it("maps every traffic kind to a model", () => {
    expect(Object.values(TRAFFIC_MODEL).sort()).toEqual(["hatch", "sedan", "truck", "van"]);
  });

  it("stands props on the ground: the lowest point of the scaled model is y = 0", () => {
    const t = propTransform("tree", 10, 20, 0.5, 4);
    expect(t.position[0]).toBe(10);
    expect(t.position[2]).toBe(20);
    expect(t.position[1] - PROP_BELOW.tree * t.scale).toBeCloseTo(0, 9);
    expect(propTransform("watertank", 0, 0, 0, 3.4, 50).position[1]).toBeCloseTo(50 + PROP_BELOW.watertank * (3.4 / 1.9), 9);
  });

  it("plans a bounded near-field of prop instances and the landmarks", () => {
    const blocks = buildBlocks();
    const buildings = buildBuildings(blocks);
    const car = createCar();
    const furniture = buildFurniture(blocks);
    const plan = planProps(furniture, blocks, buildings, { x: car.x, z: car.z });
    const count = (k: Parameters<typeof plan.placements.get>[0]) => plan.placements.get(k)?.length ?? 0;
    expect(count("clocktower")).toBe(1);
    expect(count("lighthouse")).toBe(1);
    expect(count("watertank")).toBeGreaterThan(0);
    expect(count("lamp")).toBeGreaterThan(50);
    expect(count("lamp")).toBeLessThan(furniture.lamps.length);
    expect(count("tree") + count("palm")).toBeGreaterThan(50);
    // everything the models replace is skipped by the procedural props, nothing else
    const near = (x: number, z: number) => Math.hypot(x - car.x, z - car.z) < NEAR.lamp;
    expect(plan.skip.lamp?.(car.x, car.z)).toBe(true);
    expect(plan.skip.lamp?.(car.x + 5000, car.z)).toBe(false);
    expect(furniture.lamps.filter((p) => near(p.x, p.z)).length).toBe(count("lamp"));
    // total instanced triangles stay in budget (lamp 5.7k, signal 4.1k, tree 1.8k, palm 2.7k, hydrant 3.8k, shelter 7.6k)
    const tris = count("lamp") * 5700 + count("signal") * 4100 + count("tree") * 1800 + count("palm") * 2700 + count("hydrant") * 3800 + count("shelter") * 7600;
    expect(tris).toBeLessThan(4_000_000);
  });
});
