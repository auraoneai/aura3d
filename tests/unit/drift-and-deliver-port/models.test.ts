import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODEL_ASSETS,
  PROP_BELOW,
  TRAFFIC_MODEL,
  buildProceduralModelAssembly,
  carModel,
  propTransform,
  trafficInstances,
  type ModelKey
} from "../../../examples/drift-and-deliver-port/models";
import { buildFurniture } from "../../../examples/drift-and-deliver-port/city";
import { NEAR, planProps } from "../../../examples/drift-and-deliver-port/props";
import { buildBlocks, buildBuildings } from "../../../examples/drift-and-deliver-port/world";
import { createCar } from "../../../examples/drift-and-deliver-port/sim";

const portDir = resolve(__dirname, "../../../examples/drift-and-deliver-port");
const showcaseDir = resolve(__dirname, "../../../apps/showcase-drift-and-deliver-port");

function findGlbFiles(rootDir: string): string[] {
  if (!existsSync(rootDir)) return [];
  const found: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (entry.toLowerCase().endsWith(".glb")) {
        found.push(full);
      }
    }
  }
  return found;
}

describe("harbor drift 100% procedural @aura3d/engine models", () => {
  it("ships zero .glb files on disk and zero .glb asset URLs in models.ts or aura-assets.ts", () => {
    expect(findGlbFiles(portDir)).toEqual([]);
    expect(findGlbFiles(showcaseDir)).toEqual([]);

    const modelsSrc = readFileSync(resolve(portDir, "models.ts"), "utf8");
    const auraAssetsSrc = readFileSync(resolve(showcaseDir, "src/aura-assets.ts"), "utf8");
    expect(modelsSrc).not.toMatch(/\.glb\b/i);
    expect(modelsSrc).not.toMatch(/\bdefineModelAssets\b/);
    expect(modelsSrc).not.toMatch(/\binstances\.model\b/);
    expect(auraAssetsSrc).not.toMatch(/\.glb\b/i);
  });

  it("builds multi-material, grounded (minY = 0), well-proportioned procedural geometry for all 14 ModelKeys", () => {
    const keys = Object.keys(MODEL_ASSETS) as ModelKey[];
    expect(keys.length).toBe(14);

    let totalTris = 0;
    for (const key of keys) {
      const descriptor = MODEL_ASSETS[key];
      expect(descriptor.procedural, key).toBe(true);

      const assembly = buildProceduralModelAssembly(key);
      expect(assembly.slots.length, `${key} slots`).toBeGreaterThanOrEqual(2);
      const usedMats = new Set(assembly.slots.map((s) => s.materialIndex));
      expect(usedMats.size, `${key} distinct materials`).toBeGreaterThanOrEqual(2);
      for (const idx of usedMats) {
        expect(assembly.materials[idx], `${key} material[${idx}]`).toBeDefined();
      }

      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      let modelTris = 0;
      for (const slot of assembly.slots) {
        const { positions, normals, indices } = slot.mesh;
        expect(positions.length, `${key} positions`).toBeGreaterThan(0);
        expect(normals.length, `${key} normals`).toBe(positions.length);
        expect(indices.length % 3, `${key} triangle indices`).toBe(0);
        modelTris += indices.length / 3;

        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i]!;
          const y = positions[i + 1]!;
          const z = positions[i + 2]!;
          expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `${key} finite vertex`).toBe(true);
          min[0] = Math.min(min[0]!, x);
          min[1] = Math.min(min[1]!, y);
          min[2] = Math.min(min[2]!, z);
          max[0] = Math.max(max[0]!, x);
          max[1] = Math.max(max[1]!, y);
          max[2] = Math.max(max[2]!, z);

          const nLen = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
          expect(nLen, `${key} unit normal`).toBeGreaterThan(0.95);
          expect(nLen, `${key} unit normal`).toBeLessThan(1.05);
        }
      }

      totalTris += modelTris;
      const spanX = max[0]! - min[0]!;
      const spanY = max[1]! - min[1]!;
      const spanZ = max[2]! - min[2]!;
      const longest = Math.max(spanX, spanY, spanZ);

      // Grounded on y = 0 with zero floating offset or underground overhang
      expect(min[1]!, `${key} grounded minY`).toBeGreaterThanOrEqual(-0.02);
      expect(min[1]!, `${key} grounded minY`).toBeLessThanOrEqual(0.02);

      // Realistic world-metre proportions aligned to targetMetres
      expect(longest, `${key} longest span`).toBeGreaterThan(assembly.targetMetres * 0.82);
      expect(longest, `${key} longest span`).toBeLessThan(assembly.targetMetres * 1.18);

      if (descriptor.category === "vehicle") {
        expect(spanZ, `${key} +Z length > width`).toBeGreaterThan(spanX * 1.6);
      }
    }

    expect(totalTris).toBeLessThan(60_000);
  });

  it("defaults procedural carModel to ZYX Euler rotation order and supports YXZ & instanced fleet nodes", () => {
    const defaultSedan = carModel("sedan-orig", "sedan", false).toJSON();
    expect(defaultSedan.rotationOrder).toBe("ZYX");

    const shiftCourier = carModel("courier-shift", "courier", true, "YXZ").toJSON();
    expect(shiftCourier.rotationOrder).toBe("YXZ");

    const inst = trafficInstances(
      "traffic-sedan",
      "sedan",
      true,
      [{ position: [0, 0, 0], rotation: [0, 0, 0] }],
      true,
      true
    ).toJSON();
    expect(inst.children.length).toBe(6);
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
    const tris =
      count("lamp") * 5700 +
      count("signal") * 4100 +
      count("tree") * 1800 +
      count("palm") * 2700 +
      count("hydrant") * 3800 +
      count("shelter") * 7600;
    expect(tris).toBeLessThan(4_000_000);
  });
});
