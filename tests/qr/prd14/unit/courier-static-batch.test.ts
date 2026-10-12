import { describe, expect, test } from "vitest";
import { type AuraNodeInput, type AuraSceneNode, primitives } from "@aura3d/engine";
import { batchStaticPrimitives } from "../../../../apps/showcase-courier-rush/src/v2/scene/batch";
import { courierWorldNodes } from "../../../../apps/showcase-courier-rush/src/v2/scene/world";
const json = (n: AuraNodeInput): AuraSceneNode => "toJSON" in n ? n.toJSON() : n;

describe("courier static dressing batching", () => {
  test("preserves transforms, material and shadow settings", () => {
    const material = { color: "#abcdef" };
    const originals = [1, 2].map(x => primitives.box({ material, castShadow: false }).position(x, 3, 4).rotate(0, 0.2, 0).scale([1, 2, 3]).toJSON());
    const result = batchStaticPrimitives(originals, "test");
    expect(result.folded).toBe(2);
    expect(result.batches).toBe(1);
    const node = json(result.nodes[0]!);
    expect(node).toMatchObject({ material, castShadow: false, receiveShadow: true, instances: originals.map(({position, rotation, scale}) => ({position, rotation, scale})) });
  });
  test("retains runtime, custom geometry, transparency and unknown attributes", () => {
    const base = primitives.box().toJSON();
    const nodes = [
      {...base, runtime: { id: "moving" }},
      {...base, geometry: { positions: [0, 0, 0] }},
      {...base, material: { opacity: 0.5 }},
      {...base, customAttributes: { uv2: [0, 1] }},
      {...base, quaternion: [0, 0, 0, 1]},
      {...base, scale: -1},
    ] as unknown as AuraNodeInput[];
    const result = batchStaticPrimitives([...nodes, ...nodes], "test");
    expect(result.folded).toBe(0);
    expect(result.nodes).toEqual([...nodes, ...nodes]);
  });
  test("keeps parent boundaries and runtime groups intact", () => {
    const children = [primitives.box().toJSON(), primitives.box().toJSON()];
    const group = { kind: "group", scale: 6, children } as const;
    const runtimeGroup = {...group, runtime: { id: "rig" }} as unknown as AuraSceneNode;
    const result = batchStaticPrimitives([group, runtimeGroup], "test");
    expect(result.batches).toBe(1);
    expect(json(result.nodes[0]!)).toMatchObject({kind: "group", scale: 6});
    expect(result.nodes[1]).toBe(runtimeGroup);
  });
  test("actual world emits static batches while retaining movable traffic", () => {
    const world = courierWorldNodes();
    const flattened: AuraSceneNode[] = [];
    const walk = (node: AuraSceneNode) => { flattened.push(node); if (node.kind === "group") node.children.forEach(walk); };
    world.nodes.map(json).forEach(walk);
    expect(flattened.some(node => node.name?.startsWith("courier static batch"))).toBe(true);
    expect(world.trafficCarNames).toHaveLength(8);
    for (const name of world.trafficCarNames) expect(flattened.some(node => "runtime" in node && node.runtime?.id === name)).toBe(true);
  });
});
