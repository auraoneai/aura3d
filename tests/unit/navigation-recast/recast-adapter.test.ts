import { describe, expect, it } from "vitest";
import { createRecastNavigation } from "@aura3d/navigation-recast";

const plane = {
  positions: [-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5],
  indices: [0, 2, 1, 0, 3, 2]
} as const;

describe("optional Recast/Detour navigation adapter", () => {
  it("generates, queries, serializes, imports, and disposes a navmesh", async () => {
    const navigation = await createRecastNavigation();
    const mesh = navigation.generateSolo(plane, {});
    const path = mesh.computePath([-4, 0, -4], [4, 0, 4]);
    expect(path.success).toBe(true);
    expect(path.points.length).toBeGreaterThanOrEqual(2);

    const bytes = mesh.serialize();
    expect(bytes.byteLength).toBeGreaterThan(0);
    const imported = navigation.import(bytes);
    expect(imported.computePath([-4, 0, -4], [4, 0, 4]).success).toBe(true);

    imported.dispose();
    mesh.dispose();
    expect(imported.disposed).toBe(true);
    expect(mesh.disposed).toBe(true);
    expect(() => mesh.computePath([0, 0, 0], [1, 0, 1])).toThrow(/disposed/);
  });

  it("rejects non-finite query coordinates with an actionable error", async () => {
    const navigation = await createRecastNavigation();
    const mesh = navigation.generateSolo(plane, {});
    expect(() => mesh.computePath([Number.NaN, 0, 0], [1, 0, 1])).toThrow(/finite/);
    mesh.dispose();
  });

  it("delegates crowd movement to Detour and releases the native crowd", async () => {
    const navigation = await createRecastNavigation();
    const mesh = navigation.generateSolo(plane, {});
    const crowd = mesh.createCrowd(8, 0.5);
    const agent = crowd.addAgent([-3, 0, -3], { radius: 0.25, height: 1, maxSpeed: 2, maxAcceleration: 8 });
    expect(crowd.requestMoveTarget(agent, [3, 0, 3])).toBe(true);
    const before = crowd.positions()[0]!;
    for (let step = 0; step < 30; step += 1) crowd.update(1 / 60);
    const after = crowd.positions()[0]!;
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[2]).toBeGreaterThan(before[2]);
    crowd.dispose();
    expect(() => crowd.update(1 / 60)).toThrow(/disposed/);
    mesh.dispose();
  });

  it("builds a tile cache, applies a temporary obstacle, and serializes it", async () => {
    const navigation = await createRecastNavigation();
    const cache = navigation.generateTileCache(plane, { maxObstacles: 8 });
    const obstacle = cache.addCylinderObstacle([0, 0, 0], 0.5, 1.5);
    expect(cache.update()).toBeGreaterThan(0);
    expect(cache.serialize().byteLength).toBeGreaterThan(0);
    cache.removeObstacle(obstacle);
    expect(cache.update()).toBeGreaterThan(0);
    cache.dispose();
  });
});
