import { Box3, Matrix4, Sphere, Vector3 } from "@aura3d/math";
import {
  Bounds3,
  DirectionalLight,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Renderable,
  Scene,
  SpotLight
} from "@aura3d/scene";
import { describe, expect, it } from "vitest";

function expectCloseArray(actual: readonly number[], expected: readonly number[], precision = 8): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], precision);
  }
}

describe("scene cameras and frustums", () => {
  it("uses public math projection semantics while keeping tuple camera contracts", () => {
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 2, near: 0.5, far: 50 });
    camera.updateCameraMatrices();

    expectCloseArray(camera.projectionMatrix, Matrix4.perspective(Math.PI / 2, 2, 0.5, 50).elements);
    expect(camera.frustumPlanes).toHaveLength(6);
    expect(camera.frustum.containsPoint(new Vector3(0, 0, -5))).toBe(true);
    expect(camera.frustum.intersectsSphere(new Sphere(new Vector3(0, 0, -10), 1))).toBe(true);
    expect(camera.frustum.intersectsBox(new Box3(new Vector3(-1, -1, -3), new Vector3(1, 1, -2)))).toBe(true);
  });

  it("rejects invalid perspective parameters and viewport sizes", () => {
    expect(() => new PerspectiveCamera({ fovYRadians: 0 }).computeProjectionMatrix()).toThrow(/perspective/i);
    const camera = new PerspectiveCamera();
    expect(() => camera.resize(0, 100)).toThrow(/resize/i);
    expect(() => camera.setViewport({ x: 0, y: 0, width: 0, height: 1 })).toThrow(/viewport/i);
  });

  it("keeps projection matrices and frustums fresh after perspective resize", () => {
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 1, near: 0.5, far: 50 });
    camera.updateCameraMatrices();
    const before = [...camera.projectionMatrix];

    camera.resize(1200, 600);

    expect(camera.aspect).toBe(2);
    expect(camera.projectionMatrix).not.toEqual(before);
    expectCloseArray(camera.projectionMatrix, Matrix4.perspective(Math.PI / 2, 2, 0.5, 50).elements);
    expect(camera.frustum.intersectsBox(new Box3(new Vector3(-1, -1, -3), new Vector3(1, 1, -2)))).toBe(true);
  });

  it("refreshes parent rig transforms before updating camera view matrices", () => {
    const scene = new Scene();
    const rig = scene.createNode("camera-rig");
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 100 });
    scene.root.addChild(rig);
    rig.addChild(camera);
    camera.transform.setPosition(0, 0, 5);
    scene.updateWorldTransforms();
    camera.updateCameraMatrices();
    const before = [...camera.viewMatrix];

    rig.transform.setPosition(4, 0, 0);
    camera.updateCameraMatrices();

    expect(camera.transform.worldMatrix[12]).toBeCloseTo(4);
    expect(camera.transform.worldMatrix[14]).toBeCloseTo(5);
    expect(camera.viewMatrix).not.toEqual(before);
    expect(camera.viewMatrix[12]).toBeCloseTo(-4);
    expect(camera.viewMatrix[14]).toBeCloseTo(-5);
    expect(camera.transform.isDirty()).toBe(false);
  });

  it("updates orthographic projection after zoom and resize", () => {
    const camera = new OrthographicCamera({ left: -2, right: 2, bottom: -1, top: 1, near: 0.1, far: 10, zoom: 2 });
    camera.updateCameraMatrices();
    expectCloseArray(camera.projectionMatrix, Matrix4.orthographic(-1, 1, -0.5, 0.5, 0.1, 10).elements);

    camera.resize(800, 400);

    expect(camera.left).toBe(-2);
    expect(camera.right).toBe(2);
    expectCloseArray(camera.projectionMatrix, Matrix4.orthographic(-1, 1, -0.5, 0.5, 0.1, 10).elements);
    expect(() => {
      camera.zoom = 0;
      camera.computeProjectionMatrix();
    }).toThrow(/zoom/i);
  });

  it("supports orthographic resize modes that preserve authored framing", () => {
    const horizontal = new OrthographicCamera({ left: -4, right: 4, bottom: -1, top: 1, resizeMode: "fit-horizontal" });
    horizontal.resize(800, 400);
    expect(horizontal.left).toBe(-4);
    expect(horizontal.right).toBe(4);
    expect(horizontal.bottom).toBe(-2);
    expect(horizontal.top).toBe(2);

    const preserve = new OrthographicCamera({ left: -6, right: 6, bottom: -2, top: 2, resizeMode: "preserve-frustum" });
    preserve.resize(800, 800);
    expect(preserve.left).toBe(-6);
    expect(preserve.right).toBe(6);
    expect(preserve.bottom).toBe(-6);
    expect(preserve.top).toBe(6);
  });
});

describe("scene bounds, lights, and renderable contracts", () => {
  it("transforms bounds using public math-compatible matrices", () => {
    const scene = new Scene();
    const node = scene.createNode("bounds");
    node.transform.setPosition(5, 0, 0).setScale(-2, 3, 1);
    scene.root.addChild(node);
    scene.updateWorldTransforms();

    const bounds = Bounds3.fromCenterSize([0, 0, 0], [2, 2, 2]).transform(node.transform.worldMatrix);

    expect(bounds.min).toEqual([3, -3, -1]);
    expect(bounds.max).toEqual([7, 3, 1]);
    expect(bounds.toMathBox().containsPoint(new Vector3(5, 0, 0))).toBe(true);
  });

  it("validates light data and derives direction/range bounds from transforms", () => {
    const directional = new DirectionalLight();
    directional.transform.setRotation(0, 0, 0, 1);
    directional.updateWorldTransform();
    expect(directional.getDirection()).toEqual([-0, -0, -1]);
    expect(() => {
      directional.intensity = -1;
    }).toThrow(/intensity/i);

    const point = new PointLight();
    point.range = 4;
    point.transform.setPosition(1, 2, 3);
    point.updateWorldTransform();
    expect(point.getWorldBounds().min).toEqual([-3, -2, -1]);
    expect(point.getWorldBounds().max).toEqual([5, 6, 7]);
    expect(() => {
      point.range = 0;
    }).toThrow(/range/i);

    const spot = new SpotLight();
    expect(() => {
      spot.angle = Math.PI;
    }).toThrow(/angle/i);
    expect(() => {
      spot.penumbra = 2;
    }).toThrow(/penumbra/i);
  });

  it("rejects incomplete renderable handles", () => {
    expect(() => new Renderable({ geometry: "", material: "mat" })).toThrow(/geometry/i);
    expect(() => new Renderable({ geometry: "geo", material: "" })).toThrow(/material/i);
  });
});
