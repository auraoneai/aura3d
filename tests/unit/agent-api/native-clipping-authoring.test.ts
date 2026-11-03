import { describe, expect, it, vi } from "vitest";
import { AuraClipGroup, clipping, createArchitectureKit, material, placedBounds, primitives, scene } from "../../../packages/engine/src/public/index";
import { getMaterialClipping, getSceneClipping } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import { Geometry, PBRMaterial } from "../../../packages/rendering/src";
import type { AuraAssetRef, AuraModelNode, AuraPrimitiveNode, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/nodes/types";

const canvas = { width: 640, height: 360 } as HTMLCanvasElement;
const lighting = { color: [0, 0, 0] as const, intensity: 0 };

function renderInput(snapshot: AuraSceneSnapshot, actors: readonly ProductionRuntimeActorEntry[] = []) {
  const nodes = snapshot.nodes.filter((node): node is AuraPrimitiveNode => node.kind === "primitive");
  return createProductionRuntimeRendererInput(snapshot, canvas, actors, createProductionRuntimePrimitiveEntries(nodes), 0, undefined, new Set(), lighting, []);
}

describe("scene and material clipping authoring", () => {
  it("exports typed live controllers and keeps clipping absent by default", () => {
    expect(clipping.global({ planes: [] })).toBeInstanceOf(AuraClipGroup);
    expect(scene().toJSON()).not.toHaveProperty("clipping");
    expect(material.pbr()).not.toHaveProperty("clipping");
    expect(clipping.global({ planes: [] }).snapshot()).toMatchObject({ space: "world", combine: "intersection", clipShadows: false, enabled: true });
    expect(clipping.material({ planes: [] }).snapshot()).toMatchObject({ space: "world", combine: "intersection", clipShadows: false, enabled: true });
  });

  it("copies authored scene and nested material groups while keeping live controllers through scene spreads", () => {
    const worldPlane: [number, number, number, number] = [2, 0, 0, -2];
    const localPlane: [number, number, number, number] = [0, 4, 0, -8];
    const world = clipping.global({ planes: [worldPlane], clipShadows: true });
    const local = clipping.material({ planes: [localPlane], space: "local", combine: "union" });
    const builder = scene({ clipping: world }).add({
      kind: "group", children: [primitives.box({ material: material.pbr({ clipping: local }) }).toJSON()]
    });
    const before = builder.toJSON();
    const group = before.nodes[0];
    if (group.kind !== "group" || group.children[0]?.kind !== "primitive") throw new Error("fixture has no primitive");
    const copiedMaterial = group.children[0].material!;
    const serialized = JSON.stringify(before);
    worldPlane[3] = 500;
    localPlane[3] = 500;
    world.update({ planes: [[1, 0, 0, -3]] });
    local.update({ planes: [[0, 1, 0, -4]], clipShadows: true });
    expect(before.clipping?.planes).toEqual([[1, 0, 0, -1]]);
    expect(copiedMaterial.clipping?.planes).toEqual([[0, 1, 0, -2]]);
    expect(JSON.stringify(before)).toBe(serialized);
    expect(getSceneClipping({ ...before })).toBe(world);
    expect(getMaterialClipping({ ...copiedMaterial })).toBe(local);
    expect(builder.toJSON().clipping?.planes).toEqual([[1, 0, 0, -3]]);

    const replacementWorld = clipping.global({ planes: [[0, 0, 1, -5]] }).snapshot();
    const replacementLocal = clipping.material({ planes: [[1, 0, 0, -6]], space: "local" }).snapshot();
    expect(getSceneClipping({ ...before, clipping: replacementWorld })).toBe(replacementWorld);
    expect(getMaterialClipping({ ...copiedMaterial, clipping: replacementLocal })).toBe(replacementLocal);

    const restored = JSON.parse(serialized) as AuraSceneSnapshot;
    expect(getSceneClipping(restored)).toEqual(before.clipping);
    expect(getSceneClipping(structuredClone(before))).toEqual(before.clipping);
    const restoredGroup = restored.nodes[0];
    if (restoredGroup.kind !== "group" || restoredGroup.children[0]?.kind !== "primitive") throw new Error("roundtrip lost primitive");
    expect(getMaterialClipping(restoredGroup.children[0].material)).toEqual(copiedMaterial.clipping);
    const fromCopy = scene({ clipping: restored.clipping, children: restored.nodes }).toJSON();
    expect(JSON.parse(JSON.stringify(fromCopy)).clipping).toEqual(restored.clipping);
  });

  it("honors direct edits to copied snapshot state instead of reviving a stale controller", () => {
    const world = clipping.global({ planes: [[1, 0, 0, 0]] });
    const local = clipping.material({ planes: [[0, 1, 0, 0]] });
    const snapshot = scene({ clipping: world }).add(primitives.box({ material: material.pbr({ clipping: local }) })).toJSON();
    const node = snapshot.nodes[0] as AuraPrimitiveNode;
    (snapshot.clipping!.planes[0] as unknown as number[])[3] = -2;
    (node.material!.clipping!.planes[0] as unknown as number[])[3] = -3;
    expect(getSceneClipping(snapshot)).toBe(snapshot.clipping);
    expect(getMaterialClipping(node.material)).toBe(node.material!.clipping);
  });

  it("validates scope, coordinate space, metadata and plane inputs without partial updates", () => {
    const global = clipping.global({ planes: [[1, 0, 0, 0]] });
    const local = clipping.material({ planes: [[0, 1, 0, 0]], space: "local" });
    expect(() => scene({ clipping: local })).toThrow(/global/);
    expect(() => clipping.global({ planes: [], space: "local" } as never)).toThrow(/world/);
    expect(() => clipping.material({ planes: [[0, 0, 0, 0]] })).toThrow(/normal/);
    expect(() => clipping.material({ planes: [[1, 0, 0, Infinity]] })).toThrow(/finite/);
    expect(() => scene().add(primitives.box({ material: material.pbr({ clipping: global }) })).toJSON()).toThrow(/material/);
    const badSnapshot = { ...global.snapshot(), revision: -1 };
    expect(() => scene({ clipping: badSnapshot })).toThrow(/revision/);
    const builder = scene({ clipping: global });
    expect(() => builder.clipping(local)).toThrow(/global/);
    expect(builder.toJSON().clipping?.scope).toBe("global");
    builder.clipping(null);
    expect(builder.toJSON().clipping).toBeUndefined();
  });

  it("accepts copied JSON input without retaining the caller's mutable plane arrays", () => {
    const input = JSON.parse(JSON.stringify(clipping.global({ planes: [[1, 0, 0, -1]] }))) as ReturnType<AuraClipGroup["snapshot"]>;
    const builder = scene({ clipping: input });
    (input.planes[0] as unknown as number[])[3] = -99;
    expect(builder.toJSON().clipping?.planes).toEqual([[1, 0, 0, -1]]);
  });

  it("notifies independently subscribed owners only for committed edits and disposal", () => {
    const group = clipping.material({ planes: [[1, 0, 0, 0]] });
    const observe = vi.fn();
    const first = group.onChange(observe);
    const second = group.onChange(observe);
    group.update({ enabled: true });
    expect(observe).not.toHaveBeenCalled();
    expect(() => group.update({ planes: [[0, 0, 0, 0]] })).toThrow();
    expect(observe).not.toHaveBeenCalled();
    group.update({ enabled: false });
    expect(observe).toHaveBeenCalledTimes(2);
    first(); first();
    group.dispose(); group.dispose();
    expect(observe).toHaveBeenCalledTimes(3);
    second();
    group.onChange(observe);
    expect(() => group.setEnabled(true)).toThrow(/disposed/);
    expect(observe).toHaveBeenCalledTimes(3);
  });

  it("forwards live scene and primitive material groups, including selected LOD, to rendering", () => {
    const world = clipping.global({ planes: [[1, 0, 0, 0]] });
    const local = clipping.material({ planes: [[0, 1, 0, 0]], space: "local", clipShadows: true });
    const snapshot = scene({ clipping: world }).add(primitives.box({
      material: material.pbr({ color: "#ffffff" }),
      lod: { levels: [{ name: "near", primitive: "box", material: material.pbr({ clipping: local }) }] }
    })).toJSON();
    const input = renderInput({ ...snapshot });
    const item = [...input.source.collectRenderItems!()][0]!;
    expect(input.source.globalClipping).toBe(world);
    expect(item.materialClipping).toBe(local);
    expect(input.source.staticBatching).toBe(false);
    expect(input.source.staticMeshConsolidation).toBe(false);
    world.setEnabled(false);
    local.update({ planes: [[0, 1, 0, -2]] });
    expect(input.source.globalClipping?.enabled).toBe(false);
    expect(item.materialClipping?.planes).toEqual([[0, 1, 0, -2]]);
    expect(snapshot.clipping?.enabled).toBe(true);

    const restored = JSON.parse(JSON.stringify(snapshot)) as AuraSceneSnapshot;
    const restoredInput = renderInput(restored);
    expect(restoredInput.source.globalClipping).toEqual(snapshot.clipping);
    expect([...restoredInput.source.collectRenderItems!()][0]!.materialClipping?.planes).toEqual([[0, 1, 0, 0]]);
  });

  it("forwards a model's material group to every actor mesh", () => {
    const local = clipping.material({ planes: [[0, 0, 1, -1]], space: "local" });
    const asset = { kind: "aura-asset-ref", id: "model", type: "model", source: "model.glb", uri: "model.glb",
      metadata: { boundsMetadata: { min: [-1, -1, -1], max: [1, 1, 1] } }, [auraAssetRefBrand]: { type: "model", id: "model" } } as unknown as AuraAssetRef<"model">;
    const authored: AuraModelNode = { kind: "model", asset, material: material.pbr({ clipping: local }), visible: true, castShadow: true, receiveShadow: true };
    const snapshot = scene().add(authored).toJSON();
    const node = snapshot.nodes[0] as AuraModelNode;
    const geometry = Geometry.triangle();
    const drawMaterial = new PBRMaterial();
    const actor = {
      id: "actor", pipeline: { asset: { skins: [], meshes: [] }, resources: {}, metadata: {} },
      evidence: { clips: [], skinningBindingCount: 0, lastSkinningPalettesUpdated: 0, lastMaterialTracksApplied: 0, lastLightTracksApplied: 0, lastFootPlantingMissingLegs: [] },
      animation: { setFootPlanting: () => undefined }, applyMorphTargets: () => undefined, applyRetargetedPose: () => undefined,
      collectRenderItems: ({ modelMatrix }: { modelMatrix: ArrayLike<number> }) => [0, 1].map(() => ({ geometry, material: drawMaterial, modelMatrix }))
    };
    const items = [...renderInput(snapshot, [{ node, actor } as unknown as ProductionRuntimeActorEntry]).source.collectRenderItems!()];
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.materialClipping === local)).toBe(true);
    geometry.dispose(); drawMaterial.dispose();
  });

  it("connects the architecture kit's stable section controller to scene authoring", () => {
    const kit = createArchitectureKit({ bounds: placedBounds({ position: [0, 0, 0], size: [4, 4, 4], floorY: 0 }), spaces: [], moods: [] });
    const section = kit.frame().clipping;
    const snapshot = scene({ clipping: section }).toJSON();
    kit.setSection({ planes: [[1, 0, 0, -1]], clipShadows: true });
    expect(getSceneClipping({ ...snapshot })).toBe(section);
    expect(section.snapshot()).toMatchObject({ enabled: true, clipShadows: true, planes: [[1, 0, 0, -1]] });
    expect(snapshot.clipping?.enabled).toBe(false);
  });
});
