/**
 * P2 instances.model mount proof (behavioural). Drives the real
 * createProductionRuntimeRendererInput with a typed-GLB actor entry instead of
 * grepping the source text (the previous string checks broke on refactors that
 * kept the behaviour).
 *
 * - one Float32Array of model matrices for every instance, on every mesh item
 * - per-instance colours ride the same items
 * - primitive parity: instanced primitives attach transforms + colours the same way
 * - skinned actors cannot instance: warn (skinned-palette-overflow-cpu-fallback)
 *   and draw single instead of silently dropping copies
 * - the build-time D1 fallback diagnostic is surfaced in runtimeWarnings
 * - every pushed item carries the node's castShadow intent
 */

import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { MATERIAL_INSTANCE_COLOR_TARGET_PARAM } from "../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import { MaterialInstance, PBRMaterial } from "../../../packages/rendering/src";
import { selectInstanceColorTargetFeature } from "../../../packages/rendering/src/shaders/chunks/instance_color_target.glsl";
import type { AuraAssetRef, AuraModelNode, AuraPrimitiveNode, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem } from "@aura3d/rendering";

const ASSET = {
  kind: "aura-asset-ref",
  id: "probe-model",
  type: "model",
  source: "probe.glb",
  uri: "probe.glb",
  metadata: { boundsMetadata: { min: [-1, -1, -1], max: [1, 1, 1] } },
  [auraAssetRefBrand]: { type: "model", id: "probe-model" }
} as unknown as AuraAssetRef<"model">;

const INSTANCES = [{ position: [0, 0, 0] }, { position: [3, 0, 0] }, { position: [-3, 0, 2] }] as const;

function actorEntry(node: Partial<AuraModelNode>, options: { skinned?: boolean; meshes?: number } = {}): ProductionRuntimeActorEntry {
  const meshes = options.meshes ?? 2;
  // GLB meshes retain real materials across collections, including the
  // material-instance wrapper used for per-mesh overrides.
  const materials = Array.from({ length: meshes }, (_, index) => {
    const base = new PBRMaterial({ name: `mesh-${index}` });
    return index === 1 ? new MaterialInstance(base) : base;
  });
  const actor = {
    id: "actor-1",
    pipeline: { asset: { skins: [], meshes: [] }, resources: {}, metadata: {} },
    evidence: { clips: [], skinningBindingCount: 0, lastSkinningPalettesUpdated: 0, lastMaterialTracksApplied: 0, lastLightTracksApplied: 0, lastFootPlantingMissingLegs: [] },
    animation: { setFootPlanting: () => undefined },
    applyMorphTargets: () => undefined,
    applyRetargetedPose: () => undefined,
    collectRenderItems: ({ modelMatrix }: { modelMatrix: ArrayLike<number> }) =>
      Array.from({ length: meshes }, (_, index) => ({
        geometry: { topology: "triangles", bounds: { min: [-1, -1, -1], max: [1, 1, 1] } },
        material: materials[index],
        modelMatrix: Float32Array.from(modelMatrix),
        label: `mesh-${index}`,
        ...(options.skinned ? { skinning: { joints: 1 } } : {})
      }))
  };
  const fullNode = { kind: "model", asset: ASSET, ...node } as unknown as AuraModelNode;
  return { node: fullNode, actor } as unknown as ProductionRuntimeActorEntry;
}

function render(actors: ProductionRuntimeActorEntry[], primitives: AuraPrimitiveNode[] = []): { items: RenderItem[]; warnings: Set<string> } {
  const snapshot = {
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000000",
    diagnostics: { enabled: false },
    nodes: [...actors.map((entry) => entry.node), ...primitives],
    camera: { mode: "orbit", position: [0, 4, 10], target: [0, 0, 0] }
  } as unknown as AuraSceneSnapshot;
  const warnings = new Set<string>();
  const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
  const input = createProductionRuntimeRendererInput(snapshot, canvas, actors, createProductionRuntimePrimitiveEntries(primitives), 0, undefined, warnings, { color: [0, 0, 0], intensity: 0 }, []);
  return { items: [...(input.source.collectRenderItems?.() ?? [])], warnings };
}

describe("P2 instances.model mount proof", () => {
  it("every mesh item carries one matrix per instance plus the per-instance colours and castShadow", () => {
    const entry = actorEntry({ instances: INSTANCES as never, instanceColors: ["#ff0000", "#00ff00", "#0000ff"], castShadow: true });
    const { items } = render([entry]);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect((item.instanceTransforms as Float32Array).length).toBe(INSTANCES.length * 16);
      expect((item.instanceColors as Float32Array).length).toBe(INSTANCES.length * 4);
      expect(Array.from(item.instanceColors!)).toEqual([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
      expect(item.castShadow).toBe(true);
    }
    // distinct instance placements, not N copies of one matrix
    const t = items[0]!.instanceTransforms as Float32Array;
    expect(t[12]).not.toBeCloseTo(t[16 + 12]!, 3);
  });

  it("updates the instance color target on each retained model material", () => {
    const entry = actorEntry({ instances: INSTANCES, instanceColors: ["#ff0000", "#00ff00", "#0000ff"], instanceColorTarget: "emissive" });
    const first = render([entry]).items;
    expect(first).toHaveLength(2);
    for (const item of first) {
      expect(item.material!.getParameter(MATERIAL_INSTANCE_COLOR_TARGET_PARAM)).toBe(1);
      expect(selectInstanceColorTargetFeature(item, "forward")).toBe("emissive");
    }

    const liveNode = entry.node as { instanceColorTarget?: AuraModelNode["instanceColorTarget"] };
    liveNode.instanceColorTarget = "both";
    const second = render([entry]).items;
    for (const [index, item] of second.entries()) {
      expect(item.material).toBe(first[index]!.material);
      expect(item.material!.getParameter(MATERIAL_INSTANCE_COLOR_TARGET_PARAM)).toBe(2);
      expect(selectInstanceColorTargetFeature(item, "forward")).toBe("both");
    }

    liveNode.instanceColorTarget = undefined;
    for (const item of render([entry]).items) {
      expect(item.material!.getParameter(MATERIAL_INSTANCE_COLOR_TARGET_PARAM)).toBe(0);
      expect(selectInstanceColorTargetFeature(item, "forward")).toBeUndefined();
    }
  });

  it("primitive parity: instanced primitives attach transforms and colours the same way", () => {
    const primitive = { kind: "primitive", primitive: "box", instances: INSTANCES, instanceColors: ["#ff0000", "#00ff00", "#0000ff"] } as unknown as AuraPrimitiveNode;
    const { items } = render([], [primitive]);
    expect(items).toHaveLength(1);
    expect((items[0]!.instanceTransforms as Float32Array).length).toBe(INSTANCES.length * 16);
    expect((items[0]!.instanceColors as Float32Array).length).toBe(INSTANCES.length * 4);
  });

  it("skinned actors draw single and warn skinned-palette-overflow-cpu-fallback (copies are reported, not dropped silently)", () => {
    const entry = actorEntry({ name: "p2-skinned-probe", instances: INSTANCES as never }, { skinned: true, meshes: 1 });
    const { items, warnings } = render([entry]);
    expect(items).toHaveLength(1);
    expect(items[0]!.instanceTransforms).toBeUndefined();
    expect([...warnings].some((w) => w.includes("skinned-palette-overflow-cpu-fallback"))).toBe(true);
    // GU47 eint EH-4: the warning points at the crowd kit.
    expect([...warnings].some((w) => w.includes("skinned-palette-overflow-cpu-fallback") && w.includes("loadCrowdPoses + createCrowd"))).toBe(true);
  });

  it("the build-time D1 fallback diagnostic is surfaced in runtimeWarnings", () => {
    const entry = actorEntry({ instancedModelWarning: "D1_PROBE_WARNING" } as Partial<AuraModelNode>);
    const { warnings } = render([entry]);
    expect(warnings.has("D1_PROBE_WARNING")).toBe(true);
  });
});
