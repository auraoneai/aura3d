import { describe, expect, it } from "vitest";
import { createAuraRuntimeNodeRegistry, withRuntimeWorldMatrixMemo } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { groups } from "../../../packages/engine/src/agent-api/nodes/groups";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { flattenNodesWithLineWorldMatrices } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const fixture = () => {
  const authored = scene().add(groups.create("scaled", [
    groups.create("rotated", [effects.fogVolume({ position: [1, 0, 0] }).runtime({ id: "fog" })],
      { position: [0, 1, 0], rotation: [0, Math.PI / 4, 0] }).runtime({ id: "rotated" })
  ], { position: [2, 0, 0], scale: [2, 1, -3] }).runtime({ id: "scaled" })).toJSON() as AuraSceneSnapshot;
  const flat = { ...authored, nodes: flattenNodesWithLineWorldMatrices(authored.nodes) };
  const registry = createAuraRuntimeNodeRegistry(flat, {}, authored);
  const outer = authored.nodes[0];
  if (!outer || outer.kind !== "group" || outer.children[0]?.kind !== "group") throw new Error("Expected nested groups");
  const node = outer.children[0].children[0]!;
  const world = () => Array.from(registry.atmosphereNodeState(node)!.worldMatrix);
  return { registry, node, world };
};

describe("frame-scoped runtime world-matrix memo", () => {
  it("returns the same composed matrices as an unmemoized query and hands out independent copies", () => {
    const { registry, node, world } = fixture();
    const expected = world();
    withRuntimeWorldMatrixMemo(() => {
      expect(world()).toEqual(expected);
      const first = registry.atmosphereNodeState(node)!.worldMatrix;
      first[0] = 999;
      first[12] = -999;
      expect(world()).toEqual(expected);
      // Nested scopes share the outer memo.
      withRuntimeWorldMatrixMemo(() => expect(world()).toEqual(expected));
    });
    expect(world()).toEqual(expected);
    registry.dispose();
  });

  it("recomposes after any ancestor or node transform edit inside the scope", () => {
    const { registry, world } = fixture();
    withRuntimeWorldMatrixMemo(() => {
      const before = world();
      registry.require("scaled").setPosition(5, 0, 0);
      const moved = world();
      expect(moved[12]! - before[12]!).toBeCloseTo(3, 5);
      registry.require("rotated").setRotation(0, 0, 0);
      const unrotated = world();
      expect(unrotated[8]).toBeCloseTo(0, 5);
      registry.require("fog").setScale([1, 2, 0.5]);
      expect(world()[5]).toBeCloseTo(2, 5);
    });
    // The scoped results match a fresh composition of the final state.
    const inside = withRuntimeWorldMatrixMemo(() => world());
    expect(world()).toEqual(inside);
    registry.dispose();
  });
});

