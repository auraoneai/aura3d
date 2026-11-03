import { describe, expect, it } from "vitest";
import { createProductionInstanceTransforms, createProductionModelInstanceTransforms, createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { flattenAuraSceneNodes } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import { instances, instanceLightNodes } from "../../../packages/engine/src/agent-api/nodes/instances";
import { ignoredOptionMessages } from "../../../packages/engine/src/agent-api/nodes/optionDiagnostics";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraAssetRef, AuraSceneSnapshot, AuraTransformSpec } from "../../../packages/engine/src/agent-api/nodes/types";
import { Frustum } from "../../../packages/math/src/Frustum";
import { Matrix4 } from "../../../packages/math/src/Matrix4";
import { instanceCullExcluded } from "../../../packages/rendering/src/ForwardPass";
import { createRenderCollectionDiagnostics } from "../../../packages/rendering/src/Renderer";
import { cullExplicitRenderItems } from "../../../packages/rendering/src/renderer/CullingBatching";

const asset = {
  kind: "aura-asset-ref", id: "pivot-probe", type: "model", source: "probe.glb", uri: "probe.glb",
  [auraAssetRefBrand]: { type: "model", id: "pivot-probe" }
} as unknown as AuraAssetRef<"model">;
const halfTurn = [0, 0, 1, 0] as const;
const pivoted: AuraTransformSpec = { pivot: [1, 0, 0], rotation: [0, 0, 0], quaternion: halfTurn, rotationOrder: "XYZ" };
const lights = { offset: [0, 1, 0] as const, color: "#fff", power: 10, distance: 5 };
const warning = (node: { ignoredOptions?: readonly string[] }, code: string) =>
  node.ignoredOptions?.some((message) => message.includes(code)) ?? false;

describe("pivoted instance authoring", () => {
  it("retains per-instance pivot and rotation fields for primitive and model snapshots", () => {
    const primitive = instances.box({ position: [4, 0, 0], transforms: [pivoted] }).toJSON();
    const model = instances.model(asset, { position: [4, 0, 0], scaleMode: "world", transforms: [pivoted] }).toJSON();
    expect(primitive.instances?.[0]).toMatchObject(pivoted);
    expect(model.instances?.[0]).toMatchObject(pivoted);
    expect(model.instances?.[0]?.pivot).not.toBe(pivoted.pivot);
    expect(model.instances?.[0]?.quaternion).not.toBe(pivoted.quaternion);

    const primitiveMatrix = createProductionInstanceTransforms(primitive.instances!, primitive);
    const modelMatrix = createProductionModelInstanceTransforms(model.instances!, model, { min: [-1, -1, -1], max: [1, 1, 1] }, 0);
    // A half-turn about [1, 0, 0] moves the local origin to [2, 0, 0].
    // Primitive matrices are local to the node; model matrices include its position.
    expect(primitiveMatrix[12]).toBeCloseTo(2);
    expect(primitiveMatrix[13]).toBeCloseTo(0);
    expect(modelMatrix[12]).toBeCloseTo(6);
    expect(modelMatrix[13]).toBeCloseTo(0);
  });

  it("disables culling and suppresses position-only telemetry with an actionable diagnostic", () => {
    const primitive = instances.box({ transforms: [pivoted], frustumCulled: true }).toJSON();
    const model = instances.model(asset, { transforms: [pivoted] }).toJSON();
    expect(primitive.frustumCulled).toBe(false);
    expect(model.frustumCulled).toBe(false);
    expect(model.instanceCulling).toBeUndefined();
    for (const node of [primitive, model]) {
      expect(warning(node, "INSTANCE_PIVOT_CULLING_DISABLED")).toBe(true);
      expect(ignoredOptionMessages([node])[0]?.message).toMatch(/every instance will be drawn/i);
    }
    const acknowledged = instances.box({ transforms: [pivoted], frustumCulled: false }).toJSON();
    expect(warning(acknowledged, "INSTANCE_PIVOT_CULLING_DISABLED")).toBe(false);
  });

  it("keeps a pivoted primitive in the draw despite both aggregate and per-instance culling", () => {
    const node = instances.box({ position: [100, 0, -5], transforms: [pivoted] }).toJSON();
    const snapshot = scene().add(node).toJSON();
    const entries = createProductionRuntimePrimitiveEntries([node]);
    try {
      const input = createProductionRuntimeRendererInput(
        snapshot, { width: 100, height: 100 } as HTMLCanvasElement,
        [], entries, 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []
      );
      const item = [...input.source.collectRenderItems!()][0]!;
      expect(item.frustumCulled).toBe(false);
      expect(instanceCullExcluded(item, false)).toBe(true);
      const frustum = Frustum.fromMatrix(Matrix4.perspective(Math.PI / 2, 1, 0.1, 50));
      expect(cullExplicitRenderItems([item], frustum, createRenderCollectionDiagnostics())).toEqual([item]);
      expect(cullExplicitRenderItems([{ ...item, frustumCulled: true }], frustum, createRenderCollectionDiagnostics())).toHaveLength(0);
    } finally {
      for (const entry of entries) for (const resource of entry.resources) {
        resource.geometry.dispose();
        resource.material.dispose();
      }
    }
  });

  it("keeps zero and absent pivots on the legacy culling path", () => {
    const model = instances.model(asset, { transforms: [{ position: [2, 0, 0], pivot: [0, 0, 0] }] }).toJSON();
    const primitive = instances.box({ transforms: [{ position: [2, 0, 0] }] }).toJSON();
    expect(model.instanceCulling).toMatchObject({ cullable: true, centroid: [2, 0, 0] });
    expect(model.frustumCulled).not.toBe(false);
    expect(primitive.frustumCulled).not.toBe(false);
    expect(warning(model, "INSTANCE_PIVOT_CULLING_DISABLED")).toBe(false);
    expect(warning(primitive, "INSTANCE_PIVOT_CULLING_DISABLED")).toBe(false);
  });

  it("reports legacy unsupported per-instance rotation fields without changing no-pivot model behavior", () => {
    const transform: AuraTransformSpec = { rotation: [0, 0, 1], quaternion: halfTurn, rotationOrder: "XYZ" };
    const model = instances.model(asset, { transforms: [transform] }).toJSON();
    const primitive = instances.box({ transforms: [transform] }).toJSON();
    expect(model.instances?.[0]).not.toHaveProperty("quaternion");
    expect(model.instances?.[0]).not.toHaveProperty("rotationOrder");
    expect(primitive.instances?.[0]).toMatchObject(transform);
    expect(warning(model, "INSTANCE_ROTATION_IGNORED")).toBe(true);
    expect(warning(primitive, "INSTANCE_ROTATION_IGNORED")).toBe(true);
  });

  it.each([null, [0, 0], [0, NaN, 0], [0, 0, Infinity], new Float32Array([0, 0, 0])])("rejects malformed instance pivot %s before authoring", (pivot) => {
    expect(() => instances.box({ transforms: [{ pivot } as never] })).toThrow(/PIVOT_INVALID/);
    expect(() => instances.model(asset, { transforms: [{ pivot } as never] })).toThrow(/PIVOT_INVALID/);
  });

  it("rejects lookAt mixed with pivots without mutating authored options", () => {
    const transforms: readonly AuraTransformSpec[] = Object.freeze([
      Object.freeze({ pivot: Object.freeze([1, 0, 0] as const) }),
      Object.freeze({ lookAt: Object.freeze([0, 0, 0] as const) })
    ]);
    expect(() => instances.box({ transforms })).toThrow(/INSTANCE_PIVOT_LOOK_AT_UNSUPPORTED/);
    expect(() => instances.model(asset, { transforms })).toThrow(/INSTANCE_PIVOT_LOOK_AT_UNSUPPORTED/);
    expect(transforms).toEqual([{ pivot: [1, 0, 0] }, { lookAt: [0, 0, 0] }]);
  });

  it("rejects primitive LOD and pivot together before registering instance wind", () => {
    expect(() => instances.box({ transforms: [pivoted], wind: true, lod: { levels: [{ name: "near", primitive: "box" }] } }))
      .toThrow(/PIVOT_UNSUPPORTED_LOD/);
  });

  it.each([
    { static: false }, { chunkSize: 8 }, { shadowLod: "none" as const }, { wind: false }, { impostor: "none" as const }
  ])("rejects a pivot before preparing scatter placement for %o", (world) => {
    expect(() => instances.model(asset, { transforms: [pivoted], ...world })).toThrow(/INSTANCE_SCATTER_TRANSFORM_UNSUPPORTED/);
  });

  it("rejects unsupported light and scatter orientation combinations before producing a group", () => {
    expect(() => instances.model(asset, { transforms: [pivoted], lights })).toThrow(/INSTANCE_LIGHT_TRANSFORM_UNSUPPORTED/);
    expect(() => instanceLightNodes("probe", [pivoted], lights)).toThrow(/INSTANCE_LIGHT_TRANSFORM_UNSUPPORTED/);
    expect(() => instances.model(asset, { transforms: [{ quaternion: halfTurn }], static: true })).toThrow(/INSTANCE_SCATTER_TRANSFORM_UNSUPPORTED/);
    expect(() => instances.model(asset, { transforms: [{ rotationOrder: "ZYX" }], lights })).toThrow(/INSTANCE_LIGHT_TRANSFORM_UNSUPPORTED/);
    expect(() => instances.model(asset, { rotationOrder: "XYZ", transforms: [{}], lights })).toThrow(/INSTANCE_LIGHT_TRANSFORM_UNSUPPORTED/);
    expect(() => instances.model(asset, { transforms: [{ pivot: [0, 0, 0], rotationOrder: "XYZ" }], static: true })).not.toThrow();
  });

  it.each([
    { position: [1, 0, 0] as const },
    { rotation: [0, 0.2, 0] as const },
    { scale: 2 },
    { scale: [1, 2, 1] as const }
  ])("rejects model-level transform %o for generated sibling lights only", (transform) => {
    const transforms = [{ position: [2, 0, 0] as const }];
    expect(() => instances.model(asset, { ...transform, transforms, lights })).toThrow(/INSTANCE_LIGHT_TRANSFORM_UNSUPPORTED/);
    expect(instances.model(asset, { ...transform, transforms }).toJSON()).toMatchObject(transform);
  });

  it("accepts identity model-level transforms with generated lights", () => {
    expect(() => instances.model(asset, {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pivot: [0, 0, 0],
      transforms: [{ position: [2, 0, 0] }], lights
    })).not.toThrow();
    expect(() => instances.model(asset, { scale: 1, transforms: [{}], lights })).not.toThrow();
  });

  it("keeps the generated-light marker through snapshot serialization and both flatteners", () => {
    const transforms: readonly AuraTransformSpec[] = [{ position: [0, 0, 0] }, { position: [3, 0, 0] }];
    const ordinary = instances.model(asset, { transforms }).toJSON();
    expect(ordinary).not.toHaveProperty("instanceLightsStatic");
    const snapshot = scene().add(instances.model(asset, { transforms, lights })).toJSON();
    const roundTrip = JSON.parse(JSON.stringify(snapshot)) as AuraSceneSnapshot;
    for (const input of [snapshot, roundTrip]) {
      const group = input.nodes[0]!;
      expect(group.kind).toBe("group");
      if (group.kind !== "group") throw new Error("Expected a group");
      expect(group.children[0]).toMatchObject({ kind: "model", instanceLightsStatic: true });
      expect(group.children.slice(1).every((child) => child.kind === "light")).toBe(true);
      for (const core of [false, true]) {
        const model = flattenAuraSceneNodes(input.nodes, core).find((node) => node.kind === "model");
        expect(model).toMatchObject({ instanceLightsStatic: true });
      }
    }
  });
});
