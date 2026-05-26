// @ts-nocheck
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Ray, Vector3 } from "../../../packages/math/src";
import { Geometry, pickSceneRenderableHits, pickSceneRenderables } from "../../../packages/rendering/src";
import { Renderable, Scene } from "../../../packages/scene/src";

const POINT_POSITIONS = [
  [-0.9, -0.4, -4.2],
  [-0.32, 0.28, -4.8],
  [0.18, -0.14, -4.5],
  [0.7, 0.36, -5.1],
  [1.05, -0.34, -4.7]
] as const;

describe("interactive points Three.js parity", () => {
  it("matches Three.js Raycaster point threshold hits for the CurrentRoutes picking scene", () => {
    const a3d = createA3DScene();
    const three = createThreePoints();
    const threshold = 0.12;
    const cases = [
      { label: "point-0", direction: POINT_POSITIONS[0] },
      { label: "point-2", direction: POINT_POSITIONS[2] },
      { label: "point-4", direction: POINT_POSITIONS[4] }
    ] as const;

    for (const testCase of cases) {
      const ray = new Ray(new Vector3(0, 0, 0), new Vector3(testCase.direction[0], testCase.direction[1], testCase.direction[2]));
      const a3dHit = pickSceneRenderables(
        { scene: a3d.scene, geometryLibrary: { "geometry:points": a3d.geometry } },
        ray,
        { pointRadius: threshold }
      );
      const a3dHits = pickSceneRenderableHits(
        { scene: a3d.scene, geometryLibrary: { "geometry:points": a3d.geometry } },
        ray,
        { pointRadius: threshold }
      );
      const threeHit = pickThreePoint(three.points, testCase.direction, threshold);

      expect(a3dHit?.node.name, testCase.label).toBe("pickable-points");
      expect(threeHit?.object.name, testCase.label).toBe("pickable-points");
      expect(a3dHits[0]?.geometry.topology).toBe("points");
      expect(Math.abs((a3dHit?.distance ?? 0) - (threeHit?.distance ?? 0)), testCase.label).toBeLessThan(0.18);
    }

    const missDirection = [0, 1.8, -4.4] as const;
    const a3dMiss = pickSceneRenderables(
      { scene: a3d.scene, geometryLibrary: { "geometry:points": a3d.geometry } },
      new Ray(new Vector3(0, 0, 0), new Vector3(missDirection[0], missDirection[1], missDirection[2])),
      { pointRadius: threshold }
    );
    const threeMiss = pickThreePoint(three.points, missDirection, threshold);
    expect(a3dMiss).toBeUndefined();
    expect(threeMiss).toBeUndefined();
    a3d.geometry.dispose();
  });
});

function createA3DScene(): { readonly scene: Scene; readonly geometry: Geometry } {
  const scene = new Scene();
  const node = scene.createNode("pickable-points");
  scene.root.addChild(node);
  scene.addRenderable(node, new Renderable({ geometry: "geometry:points", material: "material:point" }));
  return { scene, geometry: Geometry.points(POINT_POSITIONS) };
}

function createThreePoints(): { readonly points: THREE.Points } {
  const geometry = new THREE.BufferGeometry().setFromPoints(POINT_POSITIONS.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
  const material = new THREE.PointsMaterial({ size: 0.24, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.name = "pickable-points";
  points.updateMatrixWorld(true);
  return { points };
}

function pickThreePoint(points: THREE.Points, direction: readonly [number, number, number], threshold: number): THREE.Intersection | undefined {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(direction[0], direction[1], direction[2]).normalize()
  );
  raycaster.params.Points.threshold = threshold;
  return raycaster.intersectObject(points, false)[0];
}
