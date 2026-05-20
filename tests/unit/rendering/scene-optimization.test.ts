import { describe, expect, it } from "vitest";
import { Ray, Vector3 } from "../../../packages/math/src";
import {
  Geometry,
  UnlitMaterial,
  batchStaticRenderItems,
  buildStaticBoundsBvh,
  queryStaticBoundsBvh,
  raycastStaticBoundsBvh,
  selectLodLevel,
  updateStaticBoundsBvh
} from "../../../packages/rendering/src";

describe("scene optimization helpers", () => {
  it("selects LOD levels by distance before falling back to screen size and final level", () => {
    const high = Geometry.litCube(1);
    const medium = Geometry.litCube(0.75);
    const low = Geometry.litCube(0.5);
    const levels = [
      { name: "high", geometry: high, maxDistance: 12, minScreenSize: 0.2 },
      { name: "medium", geometry: medium, maxDistance: 40, minScreenSize: 0.055 },
      { name: "low", geometry: low }
    ];

    expect(selectLodLevel({ levels, distance: 8, screenSize: 0.1 })).toMatchObject({
      level: levels[0],
      levelIndex: 0,
      reason: "distance"
    });
    expect(selectLodLevel({ levels, distance: 22, screenSize: 0.08 })).toMatchObject({
      level: levels[1],
      levelIndex: 1,
      reason: "distance"
    });
    expect(selectLodLevel({ levels, distance: 60, screenSize: 0.07 })).toMatchObject({
      level: levels[1],
      levelIndex: 1,
      reason: "screen-size"
    });
    expect(selectLodLevel({ levels, distance: 90, screenSize: 0.01 })).toMatchObject({
      level: levels[2],
      levelIndex: 2,
      reason: "fallback"
    });
  });

  it("batches static render items by material/geometry key and respects GPU instance limits", () => {
    const geometry = Geometry.cube(1);
    const material = new UnlitMaterial({ name: "static" });
    const items = Array.from({ length: 130 }, (_, index) => ({
      geometry,
      material,
      modelMatrix: translatedMatrix(index, 0, 0),
      batchKey: "cube/static",
      label: `cube-${index}`
    }));

    const result = batchStaticRenderItems(items, { maxInstancesPerBatch: 64, labelPrefix: "test-batch" });

    expect(result.logicalItems).toBe(130);
    expect(result.submittedItems).toBe(3);
    expect(result.batches).toBe(3);
    expect(result.unbatchedItems).toBe(0);
    expect(result.drawCallReduction).toBe(127);
    expect(result.renderItems.map((item) => item.label)).toEqual(["test-batch-cube/static-0", "test-batch-cube/static-1", "test-batch-cube/static-2"]);
    expect(result.renderItems[0]!.instanceTransforms).toHaveLength(64 * 16);
    expect(result.renderItems[2]!.instanceTransforms).toHaveLength(2 * 16);
  });

  it("keeps one-off static render items unbatched and validates matrices", () => {
    const geometry = Geometry.cube(1);
    const material = new UnlitMaterial({ name: "single" });

    const result = batchStaticRenderItems([{
      geometry,
      material,
      modelMatrix: translatedMatrix(0, 0, 0),
      batchKey: "single",
      label: "single"
    }], { maxInstancesPerBatch: 64 });

    expect(result.submittedItems).toBe(1);
    expect(result.batches).toBe(0);
    expect(result.unbatchedItems).toBe(1);
    expect(result.renderItems[0]!.instanceTransforms).toBeUndefined();
    expect(() => batchStaticRenderItems([{
      geometry,
      material,
      modelMatrix: [1, 0, 0],
      batchKey: "invalid"
    }])).toThrow(/finite mat4/);
  });

  it("builds a static bounds BVH and rejects whole branches during broad-phase bounds queries", () => {
    const items = Array.from({ length: 16 }, (_, index) => ({
      id: `box-${index}`,
      bounds: bounds(index * 4, 0, 0, 1),
      payload: { index }
    }));

    const bvh = buildStaticBoundsBvh(items, { maxLeafSize: 2 });
    const result = queryStaticBoundsBvh(bvh, {
      bounds: { min: [0, -2, -2], max: [9, 2, 2] }
    });

    expect(bvh.diagnostics.objectCount).toBe(16);
    expect(bvh.diagnostics.bvhNodes).toBeGreaterThan(1);
    expect(bvh.diagnostics.leafNodes).toBeGreaterThan(1);
    expect(result.items.map((item) => item.id)).toEqual(["box-0", "box-1", "box-2"]);
    expect(result.diagnostics.totalObjects).toBe(16);
    expect(result.diagnostics.visibleObjects).toBe(3);
    expect(result.diagnostics.culledObjects).toBe(13);
    expect(result.diagnostics.rejectedNodes).toBeGreaterThan(0);
    expect(result.diagnostics.leafTests).toBeLessThan(16);
  });

  it("queries the static bounds BVH through a frustum-compatible intersector and reports traversal diagnostics", () => {
    const items = [
      { id: "inside-a", bounds: bounds(0, 0, 0, 1) },
      { id: "inside-b", bounds: bounds(2, 0, 0, 1) },
      { id: "outside", bounds: bounds(20, 0, 0, 1) }
    ];
    const bvh = buildStaticBoundsBvh(items, { maxLeafSize: 1 });
    const frustum = {
      intersectsBox(box: { readonly min: { readonly x: number }; readonly max: { readonly x: number } }): boolean {
        return box.max.x >= -1 && box.min.x <= 4;
      }
    };

    const result = queryStaticBoundsBvh(bvh, { frustum });

    expect(result.items.map((item) => item.id)).toEqual(["inside-a", "inside-b"]);
    expect(result.diagnostics.visibleObjects).toBe(2);
    expect(result.diagnostics.culledObjects).toBe(1);
    expect(result.diagnostics.bvhNodes).toBe(bvh.diagnostics.bvhNodes);
    expect(result.diagnostics.boundsTests).toBeGreaterThan(0);
    expect(result.diagnostics.traversalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("updates static bounds BVHs with an explicit rebuild strategy for dynamic object edits", () => {
    const original = [
      { id: "a", bounds: bounds(0, 0, 0, 1) },
      { id: "b", bounds: bounds(20, 0, 0, 1) }
    ];
    const bvh = buildStaticBoundsBvh(original, { maxLeafSize: 1 });
    const updated = [
      original[0]!,
      { id: "b", bounds: bounds(1, 0, 0, 1) }
    ];

    const result = updateStaticBoundsBvh(bvh, updated, { maxLeafSize: 1 });
    const visible = queryStaticBoundsBvh(result.bvh, { bounds: { min: [-1, -1, -1], max: [2, 1, 1] } });

    expect(result.strategy).toBe("rebuild");
    expect(result.updatedObjects).toBe(1);
    expect(visible.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("accelerates ray hits against static bounds through BVH traversal diagnostics", () => {
    const items = [
      { id: "near", bounds: bounds(0, 0, -2, 1) },
      { id: "far", bounds: bounds(0, 0, -7, 1) },
      { id: "miss", bounds: bounds(8, 0, -2, 1) }
    ];
    const bvh = buildStaticBoundsBvh(items, { maxLeafSize: 1 });
    const result = raycastStaticBoundsBvh(bvh, new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1)));

    expect(result.hits.map((hit) => hit.item.id)).toEqual(["near", "far"]);
    expect(result.hits[0]!.distance).toBeLessThan(result.hits[1]!.distance);
    expect(result.diagnostics.totalObjects).toBe(3);
    expect(result.diagnostics.hitObjects).toBe(2);
    expect(result.diagnostics.rejectedNodes).toBeGreaterThan(0);
    expect(result.diagnostics.leafTests).toBeLessThan(3);
  });
});

function translatedMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}

function bounds(x: number, y: number, z: number, size: number): { readonly min: [number, number, number]; readonly max: [number, number, number] } {
  const half = size / 2;
  return {
    min: [x - half, y - half, z - half],
    max: [x + half, y + half, z + half]
  };
}
