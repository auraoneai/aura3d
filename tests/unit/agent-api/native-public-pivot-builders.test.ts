import { describe, expect, it } from "vitest";
import { group, groups, distanceLod } from "../../../packages/engine/src/agent-api/nodes/groups";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { model } from "../../../packages/engine/src/agent-api/nodes/model";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";

const asset = { kind: "asset", type: "model", key: "pivot-model", url: "/pivot-model.glb", format: "glb" } as unknown as AuraAssetRef<"model">;
const transforms = [{ position: [1, 0, 0] as const }];

describe("public pivot builder descriptors", () => {
  it("copies an explicit pivot for primitives, models and groups without adding ignored-option diagnostics", () => {
    const pivot: [number, number, number] = [1, -2, 3];
    const primitive = primitives.box({ pivot, position: [5, 0, 0], scale: 2 }).toJSON();
    const imported = model(asset, { pivot, rotation: [0, 0.5, 0] }).toJSON();
    const parent = group("parent", [primitives.sphere()], { pivot, rotation: [0, 0, 1] }).toJSON();
    pivot[0] = 99;
    for (const node of [primitive, imported, parent]) expect(node.pivot).toEqual([1, -2, 3]);
    expect(primitive.ignoredOptions).toBeUndefined();
    expect(imported.ignoredOptions).toBeUndefined();
    expect(parent.children).toHaveLength(1);
    expect(primitive).toMatchObject({ position: [5, 0, 0], scale: 2 });
    expect(imported.rotation).toEqual([0, 0.5, 0]);
  });

  it("preserves explicit signed zero while omitting pivot entirely when absent", () => {
    const zero: [number, number, number] = [-0, 0, 0];
    const cases = [
      [primitives.box().toJSON(), primitives.box({ pivot: undefined }).toJSON(), primitives.box({ pivot: zero }).toJSON()],
      [model(asset).toJSON(), model(asset, { pivot: undefined }).toJSON(), model(asset, { pivot: zero }).toJSON()],
      [group("g").toJSON(), group("g", [], { pivot: undefined }).toJSON(), group("g", [], { pivot: zero }).toJSON()]
    ] as const;
    for (const [absent, undefinedPivot, explicit] of cases) {
      expect(absent).not.toHaveProperty("pivot");
      expect(undefinedPivot).toEqual(absent);
      expect(explicit.pivot).toEqual(zero);
      expect(Object.is(explicit.pivot?.[0], -0)).toBe(true);
      expect(explicit.pivot).not.toBe(zero);
    }
  });

  it("forwards top-level pivots through instance and LOD builders without claiming render support", () => {
    const pivot: [number, number, number] = [0, 2, 0];
    const instancedBox = instances.box({ transforms, pivot }).toJSON();
    const instancedModel = instances.model(asset, { transforms, pivot }).toJSON();
    const primitiveLod = distanceLod({ pivot, levels: [{ name: "near", primitive: "box" }] }).toJSON();
    const groupedLod = groups.lod({ pivot, levels: [{ children: [primitives.box()] }] }).toJSON();
    pivot[1] = 9;
    for (const node of [instancedBox, instancedModel, primitiveLod, groupedLod]) expect(node.pivot).toEqual([0, 2, 0]);
    expect(instancedBox.ignoredOptions).toContainEqual(expect.stringContaining("INSTANCE_PIVOT_CULLING_DISABLED"));
    expect(instancedModel.ignoredOptions).toContainEqual(expect.stringContaining("INSTANCE_PIVOT_CULLING_DISABLED"));
    expect(instancedBox.frustumCulled).toBe(false);
    expect(instancedModel.frustumCulled).toBe(false);
  });

  it("continues to diagnose other unread options without reporting pivot as ignored", () => {
    const primitive = primitives.box({ pivot: [1, 2, 3], unknownThing: true } as never).toJSON();
    const imported = model(asset, { pivot: [1, 2, 3], unknownThing: true } as never).toJSON();
    for (const node of [primitive, imported]) {
      expect(node.ignoredOptions?.[0]).toContain('option "unknownThing"');
      expect(node.ignoredOptions?.[0]).not.toContain('option "pivot"');
      expect(node.ignoredOptions?.[0]).toContain("pivot");
    }
  });

  it.each([
    ["null", null], ["number", 1], ["string", "1,2,3"], ["short", [1, 2]], ["long", [1, 2, 3, 4]],
    ["sparse", new Array(3)], ["NaN", [0, Number.NaN, 0]], ["infinite", [0, Infinity, 0]],
    ["non-number", ["1", 2, 3]], ["typed array", new Float32Array([1, 2, 3])]
  ])("rejects a malformed %s pivot on every public builder", (_description, pivot) => {
    const builders = [
      () => primitives.box({ pivot } as never),
      () => model(asset, { pivot } as never),
      () => group("g", [], { pivot } as never),
      () => groups.lod({ pivot, levels: [{ children: [primitives.box()] }] } as never),
      () => distanceLod({ pivot, levels: [{ name: "near", primitive: "box" }] } as never),
      () => instances.box({ transforms, pivot } as never),
      () => instances.model(asset, { transforms, pivot } as never)
    ];
    for (const build of builders) {
      expect(build).toThrow(RangeError);
      expect(build).toThrow(/PIVOT_INVALID/);
    }
  });
});
