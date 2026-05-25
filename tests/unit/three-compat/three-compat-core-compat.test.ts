import { describe, expect, it } from "vitest";
import {
  AmbientLightCompat,
  AxesHelperCompat,
  CameraHelperCompat,
  DirectionalLightCompat,
  DirectionalLightHelperCompat,
  GridHelperCompat,
  GroupCompat,
  HelperLineSegmentsCompat,
  MeshCompat,
  OrthographicCameraCompat,
  PerspectiveCameraCompat,
  PointLightCompat,
  RaycasterCompat,
  RectAreaLightCompat,
  SceneCompat,
  SkeletonHelperCompat,
  SpotLightCompat,
  Vector3Compat
} from "../../../packages/three-compat/src";

describe("V5 Three.js core compatibility", () => {
  it("supports a migrated Three.js-style scene graph with cameras, lights, helpers, and raycasting", () => {
    const scene = new SceneCompat();
    const group = new GroupCompat();
    const mesh = new MeshCompat({ type: "BoxGeometry" }, { type: "MeshStandardMaterial" });
    mesh.name = "migrated-box";
    mesh.position.set(0, 0, -5);

    const perspective = new PerspectiveCameraCompat(60, 16 / 9, 0.1, 100);
    const orthographic = new OrthographicCameraCompat(-4, 4, 3, -3, 0.1, 100);
    perspective.updateProjectionMatrix();
    orthographic.updateProjectionMatrix();

    const axes = new AxesHelperCompat(2);
    const grid = new GridHelperCompat(10, 10);
    const cameraHelper = new CameraHelperCompat(perspective);
    const direction = new DirectionalLightCompat();
    const directionalHelper = new DirectionalLightHelperCompat(direction, 2);
    group.add(mesh);
    const skeletonHelper = new SkeletonHelperCompat(group);

    scene.add(
      perspective,
      orthographic,
      new AmbientLightCompat(),
      direction,
      new PointLightCompat(),
      new SpotLightCompat(),
      new RectAreaLightCompat(),
      axes,
      grid,
      cameraHelper,
      directionalHelper,
      skeletonHelper,
      group
    );

    const visited: string[] = [];
    scene.traverse((object) => visited.push(object.type));
    const raycaster = new RaycasterCompat();
    raycaster.set(new Vector3Compat(0, 0, 0), new Vector3Compat(0, 0, -1));
    const intersections = raycaster.intersectObject(scene, true);

    expect(visited).toEqual(expect.arrayContaining(["Scene", "PerspectiveCamera", "OrthographicCamera", "AmbientLight", "DirectionalLight", "PointLight", "SpotLight", "RectAreaLight", "AxesHelper", "GridHelper", "CameraHelper", "DirectionalLightHelper", "SkeletonHelper", "Group", "Mesh"]));
    expect(intersections[0]?.object).toBe(mesh);
    expect(intersections[0]?.distance).toBeGreaterThan(0);
    expect(scene.children.length).toBeGreaterThanOrEqual(10);
    expect(axes).toBeInstanceOf(HelperLineSegmentsCompat);
    expect(axes.geometry.getAttribute("position")?.array).toHaveLength(18);
    expect(grid.geometry.getAttribute("position")?.array.length).toBeGreaterThan(100);
    expect(cameraHelper.geometry.drawRange.count).toBe(cameraHelper.lines.length * 2);
    expect(directionalHelper.material.type).toBe("LineBasicMaterial");
    expect(skeletonHelper.lines.length).toBeGreaterThan(0);
  });
});
