import { describe, expect, test } from "vitest";
import { createAuraApp, instances, physics, primitives, scene } from "../../../packages/engine/src/agent-api/index";
import type { AuraAssetRef, AuraModelNode, AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

/**
 * S5-WP19-04: physics on an instanced node (`instances.model`, `instances.<primitive>`)
 * built ONE body for the whole batch, at the batch node's origin. Every instance now gets
 * its own body from its composed transform; the collider option, explicit shapes and
 * instance scale resolve per instance; and a mounted app keeps the bodies in sync with
 * `setInstances` (add / remove / update) and releases them with the node.
 */
const crate = {
  kind: "aura-asset-ref", id: "crate", type: "model", format: "glb", url: "/crate.glb",
  metadata: { boundsMetadata: { min: [-1, 0, -1], max: [1, 1, 1] } }
} as unknown as AuraAssetRef<"model">;

const down = [0, -1, 0] as const;
const bodiesOf = (world: ReturnType<typeof physics.worldFromScene>) => world.snapshot().snapshot.bodies;

describe("instanced physics: one body per instance", () => {
  test("instances.model collider 'bounds' gives each instance its own scaled bounds collider", () => {
    const source = scene()
      .add(instances.model(crate, {
        name: "crates", scaleMode: "world", collider: "bounds",
        transforms: [{ position: [0, 0, 0] }, { position: [6, 0, 0], scale: 2 }, { position: [-6, 0, 0] }]
      }))
      .add(primitives.sphere({ name: "ball", size: 0.4 }).position(6, 5, 0).physics({ type: "dynamic", mass: 1 }));
    const world = physics.worldFromScene(source, { gravity: [0, -9.81, 0], enableSleeping: false });
    try {
      const statics = bodiesOf(world).filter((body) => body.type === "static");
      expect(statics).toHaveLength(3);
      // Unit-scale instances: top at y 1; the scale-2 instance: top at y 2, half-width 2.
      expect(physics.raycast(world, [0.5, 10, 0], down)?.point[1]).toBeCloseTo(1, 3);
      expect(physics.raycast(world, [-6.5, 10, 0], down)?.point[1]).toBeCloseTo(1, 3);
      expect(physics.raycast(world, [7.5, 10, 0.5], down)?.point[1]).toBeCloseTo(2, 3);
      // Gaps between instances are empty: no batch-wide collider at the batch origin.
      expect(physics.raycast(world, [3, 10, 0], down)).toBeUndefined();
      expect(physics.raycast(world, [-3, 10, 0], down)).toBeUndefined();
      // A side ray meets the left face of the scale-2 instance at x 4.
      expect(physics.raycast(world, [2.5, 0.5, 0], [1, 0, 0])?.point[0]).toBeCloseTo(4, 3);

      for (let step = 0; step < 240; step += 1) physics.step(world, 1 / 60);
      const ball = bodiesOf(world).find((body) => body.type === "dynamic")!;
      // Ball (radius 0.2) rests on the scale-2 instance top at y 2.
      expect(ball.position[1]).toBeGreaterThan(2.1);
      expect(ball.position[1]).toBeLessThan(2.3);
    } finally {
      world.dispose();
    }
  });

  test("instances.model collider false builds no bodies; an instanced explicit shape builds one per instance", () => {
    const none = physics.worldFromScene(scene().add(instances.model(crate, { collider: false, transforms: [{}, { position: [3, 0, 0] }] })));
    const shaped = physics.worldFromScene(scene().add(instances.model(crate, {
      physics: { type: "static", shape: "box", halfExtents: [0.5, 0.5, 0.5] },
      transforms: [{ position: [0, 0.5, 0] }, { position: [3, 0.5, 0] }]
    })));
    try {
      expect(bodiesOf(none)).toHaveLength(0);
      expect(bodiesOf(shaped)).toHaveLength(2);
      expect(physics.raycast(shaped, [3, 10, 0], down)?.point[1]).toBeCloseTo(1, 3);
      expect(physics.raycast(shaped, [1.5, 10, 0], down)).toBeUndefined();
    } finally {
      none.dispose();
      shaped.dispose();
    }
  });

  test("instanced primitives drop independently and write each pose back to its own instance", () => {
    const batch = instances.box({
      name: "dice", size: [1, 1, 1],
      // Batch node offset + rotation compose with each instance transform.
      position: [0, 0, 1], rotation: [0, Math.PI / 2, 0],
      transforms: [{ position: [0, 4, 0] }, { position: [0, 8, 3] }, { position: [0, 12, -3], scale: 0.5 }]
    }).physics({ type: "dynamic", mass: 1 });
    const source = scene()
      .add(primitives.box({ name: "ground", size: [40, 1, 40] }).position(0, -0.5, 0).physics({ type: "static" }))
      .add(batch);
    const world = physics.worldFromScene(source, { gravity: [0, -9.81, 0], enableSleeping: false });
    try {
      const dynamics = () => bodiesOf(world).filter((body) => body.type === "dynamic");
      expect(dynamics()).toHaveLength(3);
      // Instance z 3 under a +90deg yaw lands at world x 3 (batch z offset 1).
      const seeded = dynamics().map((body) => body.position.map((value) => Math.round(value * 1000) / 1000));
      expect(seeded).toEqual(expect.arrayContaining([[0, 4, 1], [3, 8, 1], [-3, 12, 1]]));
      for (let step = 0; step < 360; step += 1) physics.step(world, 1 / 60);
      const rest = dynamics().map((body) => body.position);
      const byX = (x: number) => rest.find((position) => Math.abs(position[0]! - x) < 0.2)!;
      // Each die rests on the ground at its own half height (the scale-0.5 die at 0.25).
      expect(byX(0)[1]).toBeCloseTo(0.5, 1);
      expect(byX(3)[1]).toBeCloseTo(0.5, 1);
      expect(byX(-3)[1]).toBeCloseTo(0.25, 1);
    } finally {
      world.dispose();
    }
  });

  test("a mounted app keeps per-instance bodies in sync with setInstances and releases them on removal", () => {
    const app = createAuraApp(undefined as never, {
      physics: { gravity: [0, 0, 0] },
      scene: scene().add(instances.box({
        name: "posts", size: [1, 2, 1],
        transforms: [{ position: [0, 1, 0] }, { position: [4, 1, 0] }]
      }).physics({ type: "static" }).runtime({ id: "posts" }))
    });
    try {
      const hit = (x: number) => app.physics.queries.raycast([x, 10, 0], down);
      expect(hit(0)?.point[1]).toBeCloseTo(2, 3);
      expect(hit(4)?.point[1]).toBeCloseTo(2, 3);
      expect(hit(2)).toBeUndefined();
      expect(app.physics.bodies.ids()).toHaveLength(2);

      const posts = app.nodes.require("posts") as unknown as { setInstances(transforms: readonly object[]): unknown };
      // Update + add: move the second post and add a third, taller one.
      posts.setInstances([{ position: [0, 1, 0] }, { position: [8, 1, 0] }, { position: [-4, 2, 0], scale: 2 }]);
      expect(hit(4)).toBeUndefined();
      expect(hit(8)?.point[1]).toBeCloseTo(2, 3);
      expect(hit(-4)?.point[1]).toBeCloseTo(4, 3);
      expect(app.physics.bodies.ids()).toHaveLength(3);

      // Remove down to one instance, then to none.
      posts.setInstances([{ position: [8, 1, 0] }]);
      expect(hit(0)).toBeUndefined();
      expect(hit(-4)).toBeUndefined();
      expect(hit(8)?.point[1]).toBeCloseTo(2, 3);
      expect(app.physics.bodies.ids()).toHaveLength(1);
      posts.setInstances([]);
      expect(hit(8)).toBeUndefined();
      expect(app.physics.bodies.ids()).toHaveLength(0);

      // Adding to an empty batch builds bodies again.
      posts.setInstances([{ position: [1, 1, 0] }]);
      expect(hit(1)?.point[1]).toBeCloseTo(2, 3);

      // Removing the node releases every instance body.
      expect(app.nodes.remove!("posts")).toBe(true);
      expect(hit(1)).toBeUndefined();
      app.physics.step(1 / 60);
      expect(app.physics.bodies.ids()).toHaveLength(0);
    } finally {
      app.dispose();
    }
  });

  test("bindNodes writes dynamic per-instance bodies back into the batch instance transforms", () => {
    const app = createAuraApp(undefined as never, {
      physics: { gravity: [0, -9.81, 0], bindNodes: true },
      scene: scene()
        .add(primitives.box({ name: "ground", size: [40, 1, 40] }).position(0, -0.5, 0).physics({ type: "static" }))
        .add(instances.box({
          name: "dice", size: [1, 1, 1], position: [10, 0, 0],
          transforms: [{ position: [0, 3, 0] }, { position: [4, 6, 0] }]
        }).physics({ type: "dynamic", mass: 1 }).runtime({ id: "dice" }))
    });
    try {
      for (let step = 0; step < 240; step += 1) app.physics.step(1 / 60);
      const node = app.nodes.require("dice").snapshot() as unknown as AuraModelNode | AuraPrimitiveNode;
      const transforms = node.instances!;
      expect(transforms).toHaveLength(2);
      // Both dice fell to the ground; x stays in the batch's local frame (batch x 10).
      expect(transforms[0]!.position![0]).toBeCloseTo(0, 1);
      expect(transforms[0]!.position![1]).toBeCloseTo(0.5, 1);
      expect(transforms[1]!.position![0]).toBeCloseTo(4, 1);
      expect(transforms[1]!.position![1]).toBeCloseTo(0.5, 1);
      // The bodies were not rebuilt by their own write-back: still two, resting.
      expect(app.physics.queries.raycast([14, 10, 0], down)?.point[1]).toBeCloseTo(1, 1);
      expect(app.physics.bodies.ids()).toHaveLength(3);
    } finally {
      app.dispose();
    }
  });

  test("a physics instance batch rejects lookAt instead of guessing an orientation", () => {
    const source = scene().add(instances.box({ transforms: [{ position: [0, 0, 0], lookAt: [0, 0, -5] }] }).physics({ type: "static" }));
    expect(() => physics.worldFromScene(source)).toThrow(/INSTANCE_PHYSICS_UNSUPPORTED_LOOK_AT/);
  });
});
