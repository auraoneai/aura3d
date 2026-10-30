/**
 * GU47 E-G (WP-7 items 6 and 7): `instanceColorTarget` on the `instances.*`
 * options (stamped on the node for E-D's renderer) and
 * `instances.model({ lights })` per-instance point lights.
 */
import { describe, expect, it } from "vitest";
import { instances, instanceLightNodes } from "../../../../packages/engine/src/agent-api/nodes/instances";
import type { AuraAssetRef, AuraTransformSpec } from "../../../../packages/engine/src/agent-api/nodes/types";

const asset = { kind: "asset", type: "model", key: "lamp", url: "/lamp.glb", format: "glb" } as unknown as AuraAssetRef<"model">;
const transforms: AuraTransformSpec[] = [
  { position: [0, 0, 0] },
  { position: [10, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [0, 0, 10], scale: 2 }
];
type Loose = Record<string, unknown>;
const json = (builder: { toJSON(): unknown }): Loose => builder.toJSON() as Loose;

describe("GU47 E-G instanceColorTarget", () => {
  it("is stamped on instanced primitive, custom and model nodes and is not reported as ignored", () => {
    const box = json(instances.box({ transforms, colors: ["#f00", "#0f0", "#00f"], instanceColorTarget: "emissive" }));
    expect(box.instanceColorTarget).toBe("emissive");
    expect(box.ignoredOptions).toBeUndefined();
    const custom = json(instances.custom(
      { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } as never,
      { transforms, instanceColorTarget: "both" }
    ));
    expect(custom.instanceColorTarget).toBe("both");
    expect(custom.ignoredOptions).toBeUndefined();
    const model = json(instances.model(asset, { transforms, colors: ["#fff", "#fff", "#fff"], instanceColorTarget: "emissive" }));
    expect(model.instanceColorTarget).toBe("emissive");
    expect(model.ignoredOptions).toBeUndefined();
  });

  it("is absent when not authored (node JSON unchanged)", () => {
    expect(Object.keys(json(instances.box({ transforms })))).not.toContain("instanceColorTarget");
    expect(Object.keys(json(instances.model(asset, { transforms })))).not.toContain("instanceColorTarget");
  });
});

describe("GU47 E-G instances.model({ lights })", () => {
  const spec = { offset: [1, 3, 0] as const, color: "#ffcc88", power: 60, distance: 8 };

  it("returns a group of the instanced model plus one point light per instance", () => {
    const group = json(instances.model(asset, { name: "lamp posts", transforms, lights: spec }));
    expect(group.kind).toBe("group");
    const children = group.children as Loose[];
    expect(children).toHaveLength(1 + transforms.length);
    expect(children[0]).toMatchObject({ kind: "model", name: "lamp posts" });
    expect((children[0] as { instances: unknown[] }).instances).toHaveLength(3);
    for (const light of children.slice(1)) {
      expect(light).toMatchObject({ kind: "light", light: "point", color: "#ffcc88", power: 60, distance: 8 });
    }
  });

  it("puts each light at position + R(rotation) * (scale * offset)", () => {
    const [a, b, c] = instanceLightNodes("lamp", transforms, spec) as unknown as { position: [number, number, number] }[];
    expect(a!.position).toEqual([1, 3, 0]);
    // Yaw +90° about Y (Euler XYZ): local +X maps to world -Z.
    expect(b!.position[0]).toBeCloseTo(10, 9);
    expect(b!.position[1]).toBeCloseTo(3, 9);
    expect(b!.position[2]).toBeCloseTo(-1, 9);
    expect(c!.position).toEqual([2, 6, 10]);
  });

  it("without lights the builder still returns the model node", () => {
    expect(json(instances.model(asset, { transforms })).kind).toBe("model");
  });
});
