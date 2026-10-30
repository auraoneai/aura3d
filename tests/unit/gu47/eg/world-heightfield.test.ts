/**
 * GU47 E-G (WP-7 item 4): `world` is exported from the `@aura3d/engine` root,
 * and `world.scatter` / `world.grass` accept a heightfield sampler
 * `(x, z) => y`.
 */
import { describe, expect, it } from "vitest";
import { world as rootWorld } from "../../../../packages/engine/src/public/index";
import {
  planScatterInstances,
  scatterInstanceTransform,
  world,
  type AuraHeightfieldSampler,
  type AuraScatterOptions
} from "../../../../packages/engine/src/agent-api/world/index";
import { terrainRecordFor, terrainRecordIds } from "../../../../packages/engine/src/agent-api/world/terrain";

const AREA = {
  kind: "area" as const,
  shape: { kind: "polygon" as const, points: [[0, 0], [64, 0], [64, 64], [0, 64]] as const },
  y: 0
};

const hills: AuraHeightfieldSampler = (x, z) => 2 + Math.sin(x * 0.1) * 1.5 + z * 0.05;

function options(over: Partial<AuraScatterOptions> = {}): AuraScatterOptions {
  return {
    surface: AREA,
    seed: 7,
    layers: [{ density: 4, minDistance: 4, assets: [{ asset: { id: "tree-a" } as never }, { asset: { id: "rock-b" } as never }] }],
    ...over
  };
}

describe("GU47 E-G world export", () => {
  it("the root entry exports the same world namespace", () => {
    expect(rootWorld).toBe(world);
    for (const key of ["terrain", "water", "scatter", "grass", "useAppFlags"] as const) {
      expect(typeof rootWorld[key]).toBe("function");
    }
  });
});

describe("GU47 E-G world.scatter({ heightAt })", () => {
  // Placements sit `sink * scale` (default sink 0.05) below the sampled ground.
  const ground = (p: { readonly y: number; readonly scale: number }): number => p.y + 0.05 * p.scale;

  it("places every instance at the sampled height; the x/z plan is unchanged", () => {
    const flat = planScatterInstances(options());
    const sampled = planScatterInstances(options({ heightAt: hills }));
    expect(sampled.length).toBe(flat.length);
    expect(sampled.length).toBeGreaterThan(0);
    for (let i = 0; i < sampled.length; i += 1) {
      const p = sampled[i]!;
      expect(p.x).toBe(flat[i]!.x);
      expect(p.z).toBe(flat[i]!.z);
      expect(ground(p)).toBeCloseTo(hills(p.x, p.z), 5);
      expect(ground(flat[i]!)).toBeCloseTo(0, 6);
    }
  });

  it("layer height and slope rules read the sampler", () => {
    const steep: AuraHeightfieldSampler = (x) => (x < 32 ? 0 : (x - 32) * 2);
    const plan = planScatterInstances(options({
      heightAt: steep,
      layers: [{ density: 6, minDistance: 3, slopeDeg: [0, 10], assets: [{ asset: { id: "grass-tuft" } as never }] }]
    }));
    expect(plan.length).toBeGreaterThan(0);
    // slope of 2 m/m ≈ 63° east of x = 32 → nothing placed there (cell edge tolerance 0.5 m).
    expect(plan.every((p) => p.x < 32.5)).toBe(true);
    const high = planScatterInstances(options({
      heightAt: hills,
      layers: [{ density: 6, minDistance: 3, height: [3, 10], assets: [{ asset: { id: "pine" } as never }] }]
    }));
    expect(high.length).toBeGreaterThan(0);
    expect(high.every((p) => ground(p) >= 3 - 1e-6)).toBe(true);
  });

  it("a non-finite sample reads as 0 instead of poisoning the plan", () => {
    const plan = planScatterInstances(options({ heightAt: () => Number.NaN }));
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((p) => Math.abs(ground(p)) < 1e-6)).toBe(true);
  });

  it("the result carries instances.model transforms per asset in plan order", () => {
    const result = world.scatter(options({ heightAt: hills }));
    const plan = planScatterInstances(options({ heightAt: hills }));
    const total = Object.values(result.transforms).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(result.instanceCount);
    expect(Object.keys(result.transforms).sort()).toEqual(Object.keys(result.perAsset).sort());
    const firstTree = plan.find((p) => p.assetIndex === 0)!;
    expect(result.transforms["tree-a"]![0]).toEqual(scatterInstanceTransform(firstTree));
    const t = scatterInstanceTransform(firstTree);
    expect(t.position).toEqual([firstTree.x, firstTree.y, firstTree.z]);
    expect(t.rotation).toEqual([0, (firstTree.yawDeg * Math.PI) / 180, 0]);
    expect(t.scale).toBe(firstTree.scale);
  });
});

describe("GU47 E-G world.grass({ heightAt, bounds })", () => {
  it("bakes the sampler into a sampling-only height grid the blades read", () => {
    const node = world.grass({ id: "gu47-meadow", heightAt: hills, bounds: { min: [-10, -20], max: [30, 20] }, resolution: 33 }).toJSON();
    const terrain = node.options.terrain;
    expect(terrain.id).toBe("gu47-meadow.heightfield");
    for (const [x, z] of [[-10, -20], [30, 20], [10, 0], [-10, 20]] as const) {
      expect(terrain.heightAt(x, z)).toBeCloseTo(hills(x, z), 3);
    }
    const record = terrainRecordFor(terrain.id);
    expect(record?.samplingOnly).toBe(true);
    expect(record?.grid).not.toBeNull();
    // Never listed → the terrain pass never draws it and it is not a scene terrain.
    expect(terrainRecordIds()).not.toContain(terrain.id);
  });

  it("a terrain handle still works as before and stays listed", () => {
    const t = world.terrain({
      id: "gu47-listed-terrain",
      height: { kind: "procedural", seed: 3 },
      size: [32, 32],
      layers: [{ name: "grass-meadow", preset: "grass-meadow" }]
    });
    const node = world.grass({ terrain: t.handle }).toJSON();
    expect(node.options.terrain).toBe(t.handle);
    expect(terrainRecordIds()).toContain("gu47-listed-terrain");
  });

  it("rejects empty bounds", () => {
    expect(() => world.grass({ heightAt: hills, bounds: { min: [0, 0], max: [0, 10] } })).toThrow(/bounds/);
  });
});
