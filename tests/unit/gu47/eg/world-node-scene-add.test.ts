/**
 * GU47 E-G phase 2 (receipt `water`): `world.*` builders are not
 * `AuraNodeBuilder`s, so `scene().add(world.water(...))` used to push the
 * builder object itself. Its `name` was then the builder's `name()` method and
 * `createPerformanceEvidence` threw `name.includes is not a function` from
 * `createAuraApp`. `scene.add` / `group` children now unwrap any builder.
 */
import { describe, expect, it } from "vitest";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { group } from "../../../../packages/engine/src/agent-api/nodes/groups";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { world } from "../../../../packages/engine/src/agent-api/world/index";
import { createPerformanceEvidence } from "../../../../packages/engine/src/agent-api/performanceEvidence";
import { flattenSceneSnapshot, normalizeSceneSnapshot } from "../../../../packages/engine/src/agent-api/sceneMath";

const lake = () => world.water({ kind: "lake", shape: { kind: "circle", center: [0, -8], radius: 7 }, waves: "calm" } as never);

describe("GU47 E-G world nodes in scene().add", () => {
  it("scene.add stores the plain water node, not the builder", () => {
    const snapshot = scene().add(primitives.box({ name: "column" })).add(lake() as never).toJSON();
    const water = snapshot.nodes.find((node) => (node.kind as string) === "water") as unknown as Record<string, unknown>;
    expect(water).toBeDefined();
    expect(typeof water.name).toBe("string");
    expect(water.options).toBeDefined();
    expect(() => createPerformanceEvidence(flattenSceneSnapshot(normalizeSceneSnapshot(snapshot)))).not.toThrow();
  });

  it("group children unwrap world builders too", () => {
    const node = group("pond", [lake() as never]).toJSON();
    const child = node.children[0] as unknown as Record<string, unknown>;
    expect(child.kind).toBe("water");
    expect(typeof child.name).toBe("string");
  });

  it("performance evidence ignores a non-string name instead of throwing", () => {
    const nodes = [{ kind: "water", id: "w", name: (() => "x") as unknown as string }] as never;
    expect(() => createPerformanceEvidence({ nodes } as never)).not.toThrow();
  });
});
