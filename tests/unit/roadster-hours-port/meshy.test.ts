import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LEVELS, levelLayout } from "../../../examples/roadster-hours-port/course";
import { MESHY_MODELS } from "../../../examples/roadster-hours-port/meshy.baked";
import { hasMeshy, meshyGeometry, registerMeshyForTest } from "../../../examples/roadster-hours-port/meshy";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

const bin = (key: string): ArrayBuffer => {
  const b = readFileSync(resolve("examples/roadster-hours-port/assets/meshy", `${key}.bin`));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("roadster-hours-port generated (Meshy) models", () => {
  const keys = Object.keys(MESHY_MODELS);

  it("falls back to the baked cars until the models are loaded", () => {
    for (const key of keys) expect(hasMeshy(key)).toBe(false);
    expect(buildWorld(0).vehicleCount).toBeGreaterThan(20);
  });

  it("decodes every baked model: indices in range, normals unit length, vehicles inside the unit box, props height 1 on y = 0", () => {
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      registerMeshyForTest(key, bin(key));
      const g = meshyGeometry(key)!;
      const model = MESHY_MODELS[key]!;
      expect(g.positions.length / 3, `${key} vertices`).toBe(model.vertices);
      expect(g.uvs.length / 2).toBe(model.vertices);
      expect(g.indices.length / 3, `${key} triangles`).toBe(model.triangles);
      let maxIndex = 0;
      for (const i of g.indices) maxIndex = Math.max(maxIndex, i);
      expect(maxIndex).toBeLessThan(model.vertices);
      for (let v = 0; v < g.normals.length; v += 3) expect(Math.hypot(g.normals[v]!, g.normals[v + 1]!, g.normals[v + 2]!)).toBeCloseTo(1, 1);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < g.positions.length; v += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c]!, g.positions[v + c]!); hi[c] = Math.max(hi[c]!, g.positions[v + c]!); }
      if (model.kind === "vehicle") {
        for (let c = 0; c < 3; c++) { expect(lo[c]).toBeCloseTo(-0.5, 2); expect(hi[c]).toBeCloseTo(0.5, 2); }
      } else {
        expect(lo[1]).toBeCloseTo(0, 2);
        expect(hi[1]).toBeCloseTo(1, 2);
      }
    }
  });

  it("budgets: traffic models stay light, the hero car and every prop stay inside their triangle budgets", () => {
    for (const key of keys) {
      const m = MESHY_MODELS[key]!;
      const limit = key === "roadster" ? 40000 : m.kind === "vehicle" ? 6000 : 8000;
      expect(m.triangles, `${key} triangles`).toBeLessThanOrEqual(limit);
    }
  });

  it("builds every route with the generated models: batched vehicles per model, no throw, slot bookkeeping intact", () => {
    LEVELS.forEach((level, i) => {
      const world = buildWorld(i);
      const lineup = levelLayout(level).vehicles.length;
      expect(world.vehicleCount).toBe(lineup + level.traffic.length);
      expect(world.vehicleSlots).toBeGreaterThanOrEqual(world.vehicleCount);
      expect(world.vehicleMeshes).toBeGreaterThanOrEqual(3);
    });
  });
});
