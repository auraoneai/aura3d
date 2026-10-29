import { describe, expect, it } from "vitest";
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";
import {
  nodeRotationQuaternion,
  orderedEulerToQuat,
  quatToOrderedEuler
} from "../../../packages/engine/src/agent-api/nodes/physics";
import { eulerToQuaternion } from "../../../packages/engine/src/agent-api/sceneGraph";

/**
 * anim-phys-01: `physics: { bindNodes: true }` seeded bodies with an XYZ quaternion but the
 * renderer composes node rotation as Rz·Ry·Rx ("ZYX"), so a rotated body snapped on its first
 * step ([0.5, 0.7, 0] became [0.62, 0.60, 0.38]). Seeds and write-back now use the renderer's
 * convention, honouring `rotationOrder` and `quaternion`.
 */
type Quat = readonly [number, number, number, number];
const ORDERS = ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"] as const;

const quatAngle = (a: Quat, b: Quat) => {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
};

const build = (options: Record<string, unknown>) =>
  createAuraApp(undefined as never, {
    physics: { gravity: [0, 0, 0], bindNodes: true },
    scene: scene().add(
      primitives
        .box({ name: "crate", size: [1, 1, 1], material: material.pbr({ color: "#963" }), ...options })
        .position(0, 2, 0)
        .runtime({ id: "crate" })
        .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 })
    )
  });

describe("anim-phys-01 physics rotation convention", () => {
  it("orderedEulerToQuat matches the scene graph for every order", () => {
    const euler = [0.5, 0.7, -0.3] as const;
    for (const order of ORDERS) {
      expect(quatAngle(orderedEulerToQuat(euler, order), eulerToQuaternion(euler, order))).toBeLessThan(1e-6);
    }
  });

  it("quatToOrderedEuler round-trips every order", () => {
    const euler = [0.5, 0.7, -0.3] as const;
    for (const order of ORDERS) {
      const back = quatToOrderedEuler(orderedEulerToQuat(euler, order), order);
      expect(back[0]).toBeCloseTo(euler[0], 9);
      expect(back[1]).toBeCloseTo(euler[1], 9);
      expect(back[2]).toBeCloseTo(euler[2], 9);
    }
  });

  it("nodeRotationQuaternion prefers quaternion, then rotationOrder, then ZYX", () => {
    const q: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    expect(nodeRotationQuaternion({ rotation: [1, 2, 3], quaternion: q })).toEqual(q);
    expect(quatAngle(nodeRotationQuaternion({ rotation: [0.5, 0.7, 0] }), eulerToQuaternion([0.5, 0.7, 0], "ZYX"))).toBeLessThan(1e-6);
    expect(quatAngle(nodeRotationQuaternion({ rotation: [0.5, 0.7, 0], rotationOrder: "XYZ" }), eulerToQuaternion([0.5, 0.7, 0], "XYZ"))).toBeLessThan(1e-6);
  });

  it("a two-axis rotated body keeps its orientation after a zero-gravity step", () => {
    const app = build({ rotation: [0.5, 0.7, 0] });
    app.physics.step(1 / 60);
    const rotation = app.nodes.require("crate").rotation;
    expect(rotation[0]).toBeCloseTo(0.5, 5);
    expect(rotation[1]).toBeCloseTo(0.7, 5);
    expect(rotation[2]).toBeCloseTo(0, 5);
  });

  it("keeps a non-default rotationOrder through the write-back", () => {
    const app = build({ rotation: [0.4, -0.6, 0.2], rotationOrder: "YXZ" });
    app.physics.step(1 / 60);
    const rotation = app.nodes.require("crate").rotation;
    expect(rotation[0]).toBeCloseTo(0.4, 5);
    expect(rotation[1]).toBeCloseTo(-0.6, 5);
    expect(rotation[2]).toBeCloseTo(0.2, 5);
  });
});
