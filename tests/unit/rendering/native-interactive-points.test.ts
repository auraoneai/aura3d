import { describe, expect, it } from "vitest";
import { Ray, Vector3 } from "../../../packages/math/src";
import { Geometry, pickSceneRenderableHits, pickSceneRenderables } from "../../../packages/rendering/src";
import { Renderable, Scene } from "../../../packages/scene/src";

type Position = readonly [number, number, number];

const POINT_POSITIONS = [
  [-0.9, -0.4, -4.2],
  [-0.32, 0.28, -4.8],
  [0.18, -0.14, -4.5],
  [0.7, 0.36, -5.1],
  [1.05, -0.34, -4.7]
] as const;

describe("interactive point picking", () => {
  it("finds the expected points in the interactive scene and rejects a miss", () => {
    const { source, geometry } = createPointScene(POINT_POSITIONS);
    try {
      for (const pointIndex of [0, 2, 4] as const) {
        const direction = POINT_POSITIONS[pointIndex];
        const ray = new Ray(new Vector3(0, 0, 0), new Vector3(...direction));
        const hit = pickSceneRenderables(source, ray, { pointRadius: 0.12 });
        const hits = pickSceneRenderableHits(source, ray, { pointRadius: 0.12 });

        expect(hit?.node.name, `point-${pointIndex}`).toBe("pickable-points");
        expect(hit?.pointIndex, `point-${pointIndex}`).toBe(pointIndex);
        expect(hits).toHaveLength(1);
        expect(hits[0]?.geometry.topology).toBe("points");
        // This ray aims directly at the point, so its projected distance is its length.
        expect(hit?.distance, `point-${pointIndex}`).toBeCloseTo(Math.hypot(...direction), 5);
        direction.forEach((coordinate, axis) => {
          expect(hit?.hitPoint?.[axis]).toBeCloseTo(coordinate, 6);
        });
      }

      const miss = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1.8, -4.4));
      expect(pickSceneRenderables(source, miss, { pointRadius: 0.12 })).toBeUndefined();
    } finally {
      geometry.dispose();
    }
  });

  it("includes the radius boundary, excludes points outside it or behind the ray, and sorts hits", () => {
    const { source, geometry } = createPointScene([
      [0.125, 0, -4],
      [0.15, 0, -3],
      [0, 0, 2],
      [0.0625, 0, -2]
    ]);
    try {
      const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
      const hits = pickSceneRenderableHits(source, ray, { pointRadius: 0.125 });

      expect(hits.map((hit) => hit.pointIndex)).toEqual([3, 0]);
      expect(hits.map((hit) => hit.distance)).toEqual([2, 4]);
      expect(hits.map((hit) => hit.hitPoint)).toEqual([[0.0625, 0, -2], [0.125, 0, -4]]);
      expect(pickSceneRenderables(source, ray, { pointRadius: 0.125 })?.pointIndex).toBe(3);
      expect(pickSceneRenderableHits(source, ray, { pointRadius: 0.0625 }).map((hit) => hit.pointIndex)).toEqual([3]);
      expect(pickSceneRenderables(source, ray, { pointRadius: 0.06 })).toBeUndefined();
    } finally {
      geometry.dispose();
    }
  });

  it("measures distance along an angled ray from a translated origin", () => {
    // The ray direction is (3, 4, -12), whose length is 13. The point is
    // offset from (4, 6, -12) by (1/8, -3/32, 0), perpendicular to the ray;
    // the offset length is 5/32 and the projected distance is exactly 13.
    const { source, geometry } = createPointScene([[4.125, 5.90625, -12]]);
    try {
      const ray = new Ray(new Vector3(1, 2, 0), new Vector3(3, 4, -12));
      const hit = pickSceneRenderables(source, ray, { pointRadius: 0.1875 });

      expect(hit?.pointIndex).toBe(0);
      expect(hit?.distance).toBeCloseTo(13, 10);
      expect(hit?.hitPoint).toEqual([4.125, 5.90625, -12]);
      expect(pickSceneRenderables(source, ray, { pointRadius: 0.125 })).toBeUndefined();
    } finally {
      geometry.dispose();
    }
  });
});

function createPointScene(positions: readonly Position[]) {
  const scene = new Scene();
  const node = scene.createNode("pickable-points");
  scene.root.addChild(node);
  scene.addRenderable(node, new Renderable({ geometry: "geometry:points", material: "material:point" }));
  const geometry = Geometry.points(positions);
  return { source: { scene, geometryLibrary: { "geometry:points": geometry } }, geometry };
}
