import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Bounds3,
  PerspectiveCamera,
  Renderable,
  Scene,
  SceneNode,
  deserializeScene,
  quatFromEuler,
  serializeScene
} from "../src/index.js";

test("scene hierarchy propagates nested transforms deterministically", () => {
  const scene = new Scene();
  const parent = scene.createNode("parent");
  const child = scene.createNode("child");
  parent.transform.setPosition(2, 0, 0);
  child.transform.setPosition(0, 3, 0);
  scene.root.addChild(parent);
  parent.addChild(child);

  scene.updateWorldTransforms();

  assert.equal(child.transform.worldMatrix[12], 2);
  assert.equal(child.transform.worldMatrix[13], 3);
  assert.equal(child.transform.worldMatrix[14], 0);
});

test("scene hierarchy rejects self-parenting and cycles", () => {
  const parent = new SceneNode({ name: "parent" });
  const child = new SceneNode({ name: "child" });
  parent.addChild(child);

  assert.throws(() => parent.addChild(parent), /cannot be parented to itself/);
  assert.throws(() => child.addChild(parent), /cycle rejected/);
});

test("scene traversal snapshots children when nodes are removed during traversal", () => {
  const scene = new Scene();
  const a = scene.createNode("a");
  const b = scene.createNode("b");
  scene.root.addChild(a);
  scene.root.addChild(b);
  const visited: string[] = [];

  scene.traverse((node) => {
    visited.push(node.name);
    if (node === a) scene.root.removeChild(b);
  });

  assert.deepEqual(visited, ["root", "a", "b"]);
});

test("bounds transform handles negative scale", () => {
  const node = new SceneNode();
  node.transform.setPosition(5, 0, 0).setScale(-2, 3, 1);
  node.updateWorldTransform();

  const world = Bounds3.fromCenterSize([0, 0, 0], [2, 2, 2]).transform(node.transform.worldMatrix);

  assert.deepEqual(world.min, [3, -3, -1]);
  assert.deepEqual(world.max, [7, 3, 1]);
});

test("perspective camera produces view projection and frustum planes", () => {
  const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 1, near: 1, far: 100 });
  camera.transform.setPosition(0, 0, 10);
  camera.updateCameraMatrices();

  assert.equal(camera.frustumPlanes.length, 6);
  assert.equal(camera.viewMatrix[14], -10);
  assert.ok(Math.abs(camera.projectionMatrix[0] - 1) < 1e-8);
  assert.throws(() => new PerspectiveCamera({ fovYRadians: 0 }).computeProjectionMatrix(), /fov/);
});

test("directional camera-space contracts are independent from controls", () => {
  const camera = new PerspectiveCamera();
  camera.transform.setRotation(...quatFromEuler(0, Math.PI / 4, 0));
  camera.updateCameraMatrices();

  assert.equal(camera.viewport.width, 1);
  assert.equal(camera.viewport.height, 1);
  assert.throws(() => camera.setViewport({ x: 0, y: 0, width: 0, height: 1 }), /positive/);
});

test("scene collects renderables, cameras, and lights without mutation", () => {
  const scene = new Scene();
  const node = scene.createNode("mesh");
  const camera = scene.createPerspectiveCamera();
  const light = scene.createLight("directional");
  scene.root.addChild(node);
  scene.root.addChild(camera);
  scene.root.addChild(light);
  scene.addRenderable(node, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));

  const before = node.transform.worldMatrix.slice();
  const renderables = scene.collectRenderables();

  assert.equal(renderables.length, 1);
  assert.equal(scene.collectCameras().length, 1);
  assert.equal(scene.collectLights().length, 1);
  assert.deepEqual(node.transform.worldMatrix, before);
});

test("scene serialization roundtrips a simple hierarchy", () => {
  const scene = new Scene();
  const parent = scene.createNode("parent");
  const child = scene.createNode("child");
  parent.addChild(child);
  scene.root.addChild(parent);

  const restored = deserializeScene(serializeScene(scene));

  assert.deepEqual(restored.findByName("child").map((node) => node.name), ["child"]);
  assert.equal(restored.root.children[0].children[0].name, "child");
});
