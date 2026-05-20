// @ts-nocheck
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Ray, Vector3 } from "../../../packages/math/src";
import { Geometry, pickSceneRenderables } from "../../../packages/rendering/src";
import { Renderable, Scene } from "../../../packages/scene/src";

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

describe("interactive cubes Three.js parity", () => {
  it("matches Three.js Raycaster nearest-cube hits for the V8 picking scene", () => {
    const g3d = createG3DScene();
    const three = createThreeScene();
    const cases = [
      { label: "cube-1", direction: CUBE_POSITIONS[0] },
      { label: "cube-2", direction: CUBE_POSITIONS[1] },
      { label: "cube-4", direction: CUBE_POSITIONS[3] },
      { label: "cube-5", direction: CUBE_POSITIONS[4] },
      { label: "cube-7", direction: CUBE_POSITIONS[6] }
    ] as const;

    for (const testCase of cases) {
      const g3dHit = pickSceneRenderables(
        { scene: g3d.scene, geometryLibrary: { "geometry:cube": g3d.geometry } },
        new Ray(new Vector3(0, 0, 0), new Vector3(testCase.direction[0], testCase.direction[1], testCase.direction[2]))
      );
      const threeHit = pickThreeNearestCube(three.cubes, testCase.direction);

      expect(g3dHit?.node.name, testCase.label).toBe(testCase.label);
      expect(threeHit?.object.name, testCase.label).toBe(testCase.label);
      expect(g3dHit?.node.name, testCase.label).toBe(threeHit?.object.name);
      expect(g3dHit?.distance ?? 0, testCase.label).toBeGreaterThan(0);
      expect(threeHit?.distance ?? 0, testCase.label).toBeGreaterThan(0);
      expect(Math.abs((g3dHit?.distance ?? 0) - (threeHit?.distance ?? 0)), testCase.label).toBeLessThan(0.2);
    }

    const g3dMiss = pickSceneRenderables(
      { scene: g3d.scene, geometryLibrary: { "geometry:cube": g3d.geometry } },
      new Ray(new Vector3(0, 0, 0), new Vector3(0, 3, -5))
    );
    const threeMiss = pickThreeNearestCube(three.cubes, [0, 3, -5]);
    expect(g3dMiss).toBeUndefined();
    expect(threeMiss).toBeUndefined();
    g3d.geometry.dispose();
  });
});

function createG3DScene(): { readonly scene: Scene; readonly geometry: Geometry } {
  const scene = new Scene();
  CUBE_POSITIONS.forEach((position, index) => {
    const node = scene.createNode(`cube-${index + 1}`);
    node.transform.setPosition(position[0], position[1], position[2]);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
  });
  return { scene, geometry: Geometry.cube(0.46) };
}

function createThreeScene(): { readonly cubes: readonly THREE.Mesh[] } {
  const geometry = new THREE.BoxGeometry(0.46, 0.46, 0.46);
  const material = new THREE.MeshBasicMaterial();
  const cubes = CUBE_POSITIONS.map((position, index) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `cube-${index + 1}`;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  return { cubes };
}

function pickThreeNearestCube(cubes: readonly THREE.Mesh[], direction: readonly [number, number, number]): THREE.Intersection | undefined {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(direction[0], direction[1], direction[2]).normalize()
  );
  return raycaster.intersectObjects(cubes, false)[0];
}
