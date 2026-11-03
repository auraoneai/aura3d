import { describe, expect, it } from "vitest";
import { createAuraApp, group, primitives, scene } from "../../../packages/engine/src";

function nestedScene(childRotation = 0, parentScale: readonly [number, number, number] = [2, 1, 1]) {
  const body = primitives.box({ name: "nested-body", size: [1, 1, 1] })
    .position(1, 0, 0)
    .rotate(0, 0, childRotation)
    .runtime({ id: "nested-body" })
    .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 });
  return scene().add(group("parent", [body], {
    position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: parentScale
  }));
}

describe("root-app nested physics transforms", () => {
  it("stages one body at the selected renderer's flattened position", () => {
    for (const [core, expected] of [[false, [4, 0, 0]], [true, [3, 2, 0]]] as const) {
      const app = createAuraApp(undefined as never, {
        scene: nestedScene(), autoStart: false,
        physics: { gravity: [0, 0, 0], bindNodes: true },
        qualityRebuild: { flags: { A3D_QR_CORE: core } }
      });
      try {
        const body = app.physics.bodies.require("nested-body");
        expect(app.physics.bodies.ids()).toHaveLength(1);
        body.position().forEach((value, axis) => expect(value).toBeCloseTo(expected[axis]!, 5));
        app.physics.step(1 / 60);
        app.nodes.require("nested-body").position.forEach((value, axis) =>
          expect(value).toBeCloseTo(body.position()[axis]!, 5));
      } finally { app.dispose(); }
    }
  });

  it("continues to accept reflected visuals with manually specified colliders", () => {
    const app = createAuraApp(undefined as never, {
      scene: nestedScene(0, [-1, 1, 1]), autoStart: false,
      qualityRebuild: { flags: { A3D_QR_CORE: true } }
    });
    try { expect(app.physics.bodies.has("nested-body")).toBe(true); }
    finally { app.dispose(); }
  });

  it("rejects sheared and singular hierarchical poses instead of staging incorrect bodies", () => {
    for (const input of [
      nestedScene(Math.PI / 4),
      nestedScene(0, [0, 1, 1])
    ]) {
      expect(() => createAuraApp(undefined as never, {
        scene: input, autoStart: false,
        qualityRebuild: { flags: { A3D_QR_CORE: true } }
      })).toThrow(/PHYSICS_UNSUPPORTED_WORLD_TRANSFORM/);
    }
  });

  it("keeps the previous scene and bodies if an unsupported replacement is rejected", () => {
    const app = createAuraApp(undefined as never, {
      scene: scene().add(primitives.box({ name: "original" })
        .runtime({ id: "original" })
        .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 })),
      autoStart: false,
      qualityRebuild: { flags: { A3D_QR_CORE: true } }
    });
    try {
      const beforeIds = app.physics.bodies.ids();
      expect(() => app.setScene(nestedScene(Math.PI / 4))).toThrow(/PHYSICS_UNSUPPORTED_WORLD_TRANSFORM/);
      expect(app.physics.bodies.ids()).toEqual(beforeIds);
      expect(app.physics.bodies.has("original")).toBe(true);
      expect(app.nodes.has("original")).toBe(true);
      expect(app.nodes.has("nested-body")).toBe(false);
    } finally { app.dispose(); }
  });
});
