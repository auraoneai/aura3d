import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, ScenePhysicsBridge, interpolateRotation } from "../../../packages/physics/src/index.js";

test("scene physics bridge pulls dynamic body rotation into bound nodes", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const body = world.createRigidBody({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
  const node = {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number]
  };
  const bridge = new ScenePhysicsBridge();

  bridge.bind({ bodyId: body.id, node });
  body.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  bridge.pullDynamic(world, 1);

  assert.equal(node.position[0], 0);
  assert.ok(Math.abs(node.rotation[1] - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(node.rotation[3] - Math.SQRT1_2) < 1e-6);
});

test("scene physics bridge pushes kinematic node rotation into bodies", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const body = world.createRigidBody({ type: "kinematic", position: [0, 0, 0], rotation: [0, 0, 0, 1] });
  const bridge = new ScenePhysicsBridge();
  const node = {
    getWorldPosition: () => [1, 2, 3] as const,
    getWorldQuaternion: () => [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const
  };

  bridge.bind({ bodyId: body.id, node, mode: "kinematic" });
  bridge.pushKinematic(world);

  assert.deepEqual(body.position, [1, 2, 3]);
  assert.ok(Math.abs(body.rotation[2] - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(body.rotation[3] - Math.SQRT1_2) < 1e-6);
});

test("scene physics rotation interpolation normalizes and takes the shortest quaternion path", () => {
  const rotation = interpolateRotation([0, 0, 0, 1], [0, 0, 0, -1], 0.5);
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);

  assert.ok(Math.abs(length - 1) < 1e-9);
  assert.deepEqual(rotation, [0, 0, 0, 1]);
});
