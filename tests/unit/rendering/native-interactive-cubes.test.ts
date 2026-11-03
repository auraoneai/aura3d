import { describe, expect, it } from "vitest";
import { Ray, Vector3 } from "../../../packages/math/src";
import { Geometry, pickSceneRenderableHits, pickSceneRenderables } from "../../../packages/rendering/src";
import { Renderable, Scene } from "../../../packages/scene/src";

type Position = readonly [number, number, number];

const CUBE_SIZE = 0.46;
const CUBE_POSITIONS = [
  [-1.8, 0.7, -5.2],
  [-0.75, 0.2, -4.45],
  [0, 0.62, -5.9],
  [0.82, -0.1, -4.8],
  [1.72, 0.48, -5.35],
  [-1.22, -0.82, -5.6],
  [0.34, -0.94, -4.9],
  [1.46, -0.78, -5.95]
] as const;

describe("interactive cube picking", () => {
  it("finds the expected nearest cube and its front-face intersection in the interactive scene", () => {
    const { source, geometry } = createCubeScene(CUBE_POSITIONS);
    try {
      for (const cubeIndex of [0, 1, 3, 4, 6] as const) {
        const direction = CUBE_POSITIONS[cubeIndex];
        const ray = new Ray(new Vector3(0, 0, 0), new Vector3(...direction));
        const hit = pickSceneRenderables(source, ray);
        const label = `cube-${cubeIndex + 1}`;

        // The ray goes through the cube center; its z component dominates, so
        // it first crosses the front plane z = center.z + half the cube size.
        const entryFraction = (Math.abs(direction[2]) - CUBE_SIZE / 2) / Math.abs(direction[2]);
        expect(hit?.node.name, label).toBe(label);
        expect(hit?.distance, label).toBeCloseTo(Math.hypot(...direction) * entryFraction, 5);
        direction.forEach((coordinate, axis) => {
          expect(hit?.hitPoint?.[axis], label).toBeCloseTo(coordinate * entryFraction, 5);
        });
      }

      const miss = new Ray(new Vector3(0, 0, 0), new Vector3(0, 3, -5));
      expect(pickSceneRenderables(source, miss)).toBeUndefined();
    } finally {
      geometry.dispose();
    }
  });

  it("orders overlapping targets by their entry distance and ignores cubes behind the ray", () => {
    const { source, geometry } = createCubeScene([
      [0, 0, -4],
      [0, 0, -2],
      [0, 0, -6],
      [0, 0, 2]
    ]);
    try {
      const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
      const hits = pickSceneRenderableHits(source, ray);

      expect(hits.map((hit) => hit.node.name)).toEqual(["cube-2", "cube-1", "cube-3"]);
      [1.77, 3.77, 5.77].forEach((distance, index) => {
        expect(hits[index]?.distance).toBeCloseTo(distance, 5);
        expect(hits[index]?.hitPoint?.[2]).toBeCloseTo(-distance, 5);
      });
      expect(pickSceneRenderables(source, ray)?.node.name).toBe("cube-2");
    } finally {
      geometry.dispose();
    }
  });

  it("finds a side-face entry and rejects a ray outside the cube bounds", () => {
    const { source, geometry } = createCubeScene([[2, 0, -4]]);
    try {
      const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, -2.25));
      const hit = pickSceneRenderables(source, ray);

      // The ray reaches x = 2 - 0.23 while z = -3.9825, inside the z bounds.
      expect(hit?.node.name).toBe("cube-1");
      expect(hit?.distance).toBeCloseTo(1.77 * Math.hypot(1, 2.25), 5);
      expect(hit?.hitPoint?.[0]).toBeCloseTo(1.77, 5);
      expect(hit?.hitPoint?.[2]).toBeCloseTo(-3.9825, 5);
      const miss = new Ray(new Vector3(0, 0.24, 0), new Vector3(1, 0, -2.25));
      expect(pickSceneRenderables(source, miss)).toBeUndefined();
    } finally {
      geometry.dispose();
    }
  });
});

function createCubeScene(positions: readonly Position[]) {
  const scene = new Scene();
  positions.forEach((position, index) => {
    const node = scene.createNode(`cube-${index + 1}`);
    node.transform.setPosition(position[0], position[1], position[2]);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
  });
  const geometry = Geometry.cube(CUBE_SIZE);
  return { source: { scene, geometryLibrary: { "geometry:cube": geometry } }, geometry };
}
