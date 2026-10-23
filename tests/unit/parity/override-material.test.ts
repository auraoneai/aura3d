/**
 * threejs-parity SG-10 (P2): `scene().overrideMaterial(material)` — three's
 * `scene.overrideMaterial`. Applied at snapshot time to every mesh-like node.
 */

import { describe, expect, it } from "vitest";
import { batched, camera, group, groups, instances, lines, material, points, primitives, scene, sprites } from "../../../packages/engine/src";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors";
import { applyOverrideMaterial } from "../../../packages/engine/src/agent-api/nodes/overrideMaterial";
import { lodMarkerOf } from "../../../packages/engine/src/agent-api/lodMarkers";
import type { AuraGroupNode, AuraPrimitiveNode, AuraSceneNode } from "../../../packages/engine/src/agent-api/nodes/types";

const OVERRIDE = material.pbr({ color: "#ff00ff", roughness: 0.2 });
const OWN = material.pbr({ color: "#00ff00" });

const modelNode = (extra: Record<string, unknown> = {}): AuraSceneNode =>
  ({
    kind: "model",
    name: "hero",
    asset: { kind: "aura-asset-ref", id: "hero", type: "model", url: "/hero.glb" },
    material: OWN,
    castShadow: true,
    receiveShadow: true,
    visible: true,
    ...extra
  }) as unknown as AuraSceneNode;

const materialOf = (node: AuraSceneNode): unknown => (node as { material?: unknown }).material;

describe("scene().overrideMaterial — mesh-like nodes", () => {
  it("replaces the material of primitives and keeps geometry, size and transform", () => {
    const snapshot = scene()
      .add(primitives.box({ name: "a", material: OWN, size: [2, 1, 3] }).position(1, 2, 3))
      .add(primitives.torus({ name: "b", material: OWN, params: { tube: 0.2 } }))
      .overrideMaterial(OVERRIDE)
      .toJSON();
    const [a, b] = snapshot.nodes as AuraPrimitiveNode[];
    expect(a!.material).toBe(OVERRIDE);
    expect(b!.material).toBe(OVERRIDE);
    expect(a!.primitive).toBe("box");
    expect(a!.size).toEqual([2, 1, 3]);
    expect(a!.position).toEqual([1, 2, 3]);
    expect(b!.params).toEqual({ tube: 0.2 });
    expect(snapshot.overrideMaterial).toBe(OVERRIDE);
  });

  it("recurses through groups, including nested ones", () => {
    const nested = group("outer", [group("inner", [primitives.sphere({ material: OWN })]), primitives.box({ material: OWN })]);
    const snapshot = scene().add(nested).overrideMaterial(OVERRIDE).toJSON();
    const outer = snapshot.nodes[0] as AuraGroupNode;
    const inner = outer.children[0] as AuraGroupNode;
    expect(materialOf(inner.children[0]!)).toBe(OVERRIDE);
    expect(materialOf(outer.children[1]!)).toBe(OVERRIDE);
  });

  it("overrides model nodes and drops per-slot C-15 overrides so they cannot win", () => {
    const slotOverride = [{ slot: "body", color: "#123456" }];
    const snapshot = scene().add(modelNode({ materialOverrides: slotOverride })).overrideMaterial(OVERRIDE).toJSON();
    const node = snapshot.nodes[0] as unknown as { material: unknown; materialOverrides?: unknown; asset: { id: string } };
    expect(node.material).toBe(OVERRIDE);
    expect(node.materialOverrides).toBeUndefined();
    expect(node.asset.id).toBe("hero");
  });

  it("keeps instanced primitives' instances and per-instance colours", () => {
    const instanced = primitives.box({ name: "swarm", material: OWN });
    const raw = { ...instanced.toJSON(), instances: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }], instanceColors: ["#ff0000", "#00ff00"] } as unknown as AuraSceneNode;
    const [out] = applyOverrideMaterial([raw], OVERRIDE) as AuraPrimitiveNode[];
    expect(out!.material).toBe(OVERRIDE);
    expect(out!.instances).toHaveLength(2);
    expect(out!.instanceColors).toEqual(["#ff0000", "#00ff00"]);
  });

  it("overrides instances.mesh and batched.mesh (batched nodes)", () => {
    const im = instances.mesh("box", OWN, 4);
    const bm = batched.mesh({ maxInstances: 4, maxVertices: 64, maxIndices: 64, material: OWN });
    const snapshot = scene().add(im).add(bm).overrideMaterial(OVERRIDE).toJSON();
    expect(snapshot.nodes.map((n) => n.kind)).toEqual(["batched", "batched"]);
    for (const node of snapshot.nodes) expect(materialOf(node)).toBe(OVERRIDE);
    expect((snapshot.nodes[0] as { maxInstances?: number }).maxInstances).toBe(4);
  });

  it("overrides every distance-LOD level material", () => {
    const lod = { ...primitives.box({ name: "lod" }).toJSON(), lod: { levels: [{ name: "near", primitive: "box", material: OWN }, { name: "far", primitive: "sphere", material: OWN }], hysteresis: 0.1 } } as unknown as AuraSceneNode;
    const [out] = applyOverrideMaterial([lod], OVERRIDE) as AuraPrimitiveNode[];
    expect(out!.lod!.levels.map((l) => l.material)).toEqual([OVERRIDE, OVERRIDE]);
    expect(out!.lod!.levels.map((l) => l.name)).toEqual(["near", "far"]);
    expect(out!.lod!.hysteresis).toBe(0.1);
  });

  it("keeps mixed-child LOD level tags on overridden children", () => {
    const lodGroup = groups.lod({ levels: [{ maxDistance: 5, children: [primitives.box({ material: OWN })] }, { children: [primitives.sphere({ material: OWN })] }] });
    const snapshot = scene().add(lodGroup).overrideMaterial(OVERRIDE).toJSON();
    const children = (snapshot.nodes[0] as AuraGroupNode).children;
    expect(children.map((c) => materialOf(c))).toEqual([OVERRIDE, OVERRIDE]);
    expect(children.map((c) => lodMarkerOf(c)?.levelIndex)).toEqual([0, 1]);
  });

  it("leaves lines, points and sprites on their own materials", () => {
    const lineMaterial = material.emissive({ color: "#abcdef", emissive: "#abcdef" });
    const snapshot = scene()
      .add(lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: lineMaterial }))
      .add(points({ positions: [[0, 0, 0]], material: lineMaterial }))
      .add(sprites.sprite({ material: lineMaterial }))
      .overrideMaterial(OVERRIDE)
      .toJSON();
    expect(snapshot.nodes.map((n) => n.kind)).toEqual(["line", "points", "sprite"]);
    for (const node of snapshot.nodes) expect(materialOf(node)).toBe(lineMaterial);
  });

  it("accepts a material.custom spec", () => {
    const custom = material.custom({ glsl: { fragment: "out vec4 outColor;\nvoid main() { outColor = vec4(1.0); }" } });
    const snapshot = scene().add(primitives.box({ material: OWN })).overrideMaterial(custom).toJSON();
    expect(materialOf(snapshot.nodes[0]!)).toBe(custom);
  });
});

describe("scene().overrideMaterial — lifecycle", () => {
  it("never mutates authored nodes, so null restores the originals exactly", () => {
    const builder = scene().add(primitives.box({ name: "a", material: OWN })).add(group("g", [primitives.sphere({ material: OWN })]));
    const before = builder.toJSON();
    builder.overrideMaterial(OVERRIDE);
    const during = builder.toJSON();
    builder.overrideMaterial(null);
    const after = builder.toJSON();
    expect(materialOf(during.nodes[0]!)).toBe(OVERRIDE);
    expect(during.overrideMaterial).toBe(OVERRIDE);
    expect(materialOf(after.nodes[0]!)).toBe(OWN);
    expect(after.overrideMaterial).toBeUndefined();
    expect(after.nodes).toEqual(before.nodes);
    expect("overrideMaterial" in after).toBe(false);
  });

  it("applies to nodes added after the override call (resolved at toJSON)", () => {
    const builder = scene().overrideMaterial(OVERRIDE);
    builder.add(primitives.box({ material: OWN }));
    expect(materialOf(builder.toJSON().nodes[0]!)).toBe(OVERRIDE);
  });

  it("is a no-op for snapshots without an override (nodes are plain copies)", () => {
    const snapshot = scene().add(primitives.box({ material: OWN })).camera(camera.orbit()).toJSON();
    expect(materialOf(snapshot.nodes[0]!)).toBe(OWN);
    expect(snapshot.overrideMaterial).toBeUndefined();
  });

  it("the latest override wins", () => {
    const other = material.pbr({ color: "#0000ff" });
    const snapshot = scene().add(primitives.box({ material: OWN })).overrideMaterial(OVERRIDE).overrideMaterial(other).toJSON();
    expect(materialOf(snapshot.nodes[0]!)).toBe(other);
  });
});

describe("scene().overrideMaterial — validation", () => {
  it("rejects non-object values", () => {
    for (const bad of [undefined, 1, "#ff0000", true, [] as unknown]) {
      expect(() => scene().overrideMaterial(bad as never)).toThrowError(AuraRuntimeError);
    }
    expect(() => scene().overrideMaterial(undefined as never)).toThrowError(/material spec/);
  });

  it("rejects a node builder or a scene node passed instead of a material", () => {
    expect(() => scene().overrideMaterial(primitives.box() as never)).toThrowError(/node\/builder/);
    expect(() => scene().overrideMaterial(primitives.box().toJSON() as never)).toThrowError(/"primitive" object/);
  });

  it("rejects a malformed custom spec with invalid-material-spec", () => {
    try {
      scene().overrideMaterial({ kind: "custom", custom: {} } as never);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuraRuntimeError);
      expect((error as AuraRuntimeError).code).toBe("invalid-material-spec");
    }
  });

  it("a failed call keeps the previously set override", () => {
    const builder = scene().add(primitives.box({ material: OWN })).overrideMaterial(OVERRIDE);
    expect(() => builder.overrideMaterial(42 as never)).toThrowError(AuraRuntimeError);
    expect(materialOf(builder.toJSON().nodes[0]!)).toBe(OVERRIDE);
  });
});
