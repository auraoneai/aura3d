import { describe, expect, it } from "vitest";
import { createAuraApp, material, primitives, scene } from "@aura3d/engine";

/**
 * `physics: { bindNodes: true }`: stepping `app.physics` moves the bodies declared on nodes; with the
 * option, dynamic bodies on nodes that carry `.runtime({ id })` also write their pose back to that node.
 * Off (the default) a route's own node movement is never overwritten.
 */
const build = (bindNodes: boolean | undefined) =>
  createAuraApp(undefined as never, {
    physics: { gravity: [0, -9.81, 0], ...(bindNodes === undefined ? {} : { bindNodes }) },
    scene: scene()
      .add(
        primitives.box({ name: "ground", size: [10, 0.5, 10], material: material.pbr({ color: "#556" }) })
          .position(0, -0.25, 0)
          .runtime({ id: "ground" })
          .physics({ type: "static", shape: "box", halfExtents: [5, 0.25, 5] })
      )
      .add(
        primitives.sphere({ name: "ball", size: 0.6, material: material.pbr({ color: "#e44" }) })
          .position(0, 3, 0)
          .runtime({ id: "ball" })
          .physics({ type: "dynamic", shape: "sphere", radius: 0.3, mass: 1, restitution: 0 })
      )
      .add(
        primitives.box({ name: "unhandled crate", size: [1, 1, 1], material: material.pbr({ color: "#963" }) })
          .position(2, 3, 0)
          .physics({ type: "dynamic", shape: "box", halfExtents: [0.5, 0.5, 0.5], mass: 1 })
      )
  });

const settle = (app: ReturnType<typeof build>) => {
  for (let step = 0; step < 300; step += 1) app.physics.step(1 / 60);
};

describe("physics.bindNodes", () => {
  it("writes the dynamic body's pose back to its runtime node", () => {
    const app = build(true);
    settle(app);
    const ball = app.nodes.require("ball");
    expect(ball.position[1]).toBeGreaterThan(0.3 - 0.03);
    expect(ball.position[1]).toBeLessThan(0.3 + 0.03);
    expect(ball.position[1]).toBeCloseTo(app.physics.bodies.require("ball").position()[1], 4);
  });

  it("leaves static nodes where they were declared", () => {
    const app = build(true);
    settle(app);
    expect(app.nodes.require("ground").position[1]).toBeCloseTo(-0.25, 6);
  });

  it("does nothing for a body whose node has no runtime id, and does not throw", () => {
    const app = build(true);
    expect(() => settle(app)).not.toThrow();
    expect(app.physics.bodies.require("unhandled crate").position()[1]).toBeLessThan(0.55);
  });

  it("is off by default: bodies move, the node does not", () => {
    for (const option of [undefined, false] as const) {
      const app = build(option);
      settle(app);
      expect(app.physics.bodies.require("ball").position()[1]).toBeLessThan(0.33);
      // The node stays at its declared height (a headless frame may nudge it by a hair), nowhere near the floor.
      expect(app.nodes.require("ball").position[1]).toBeGreaterThan(2.9);
    }
  });

  it("keeps step()'s collision events", () => {
    const app = build(true);
    let begins = 0;
    for (let step = 0; step < 300; step += 1) {
      for (const event of app.physics.step(1 / 60)) if (event.phase === "begin") begins += 1;
    }
    expect(begins).toBeGreaterThan(0);
  });
});
