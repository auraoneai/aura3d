/**
 * Regression for artifacts/idol/ENGINE-SKINNED-PARENT.md.
 *
 * (a) A rigged (skinned) model nested under a translated + rotated group draws at parent x local: the render item's
 *     model matrix carries every ancestor and the skinned vertex (model . palette . v) follows it, for a static group
 *     and for a live runtime group that moves. Top-level rigged nodes whose world transform the game writes each frame
 *     (the per-game workaround) draw exactly at the written transform (no second parent application).
 * (b) `instances.model({ wind })` under a translated + rotated static group draws its instances at parent x instance
 *     (it used to draw them at the world origin), the group-at-origin workaround is unchanged, and `setInstances` on a
 *     wind batch (tree clearance) no longer throws INSTANCE_SCATTER_RUNTIME_UNSUPPORTED.
 *
 * The render-item construction below is shared by the WebGL2 and WebGPU backends; both consume `item.modelMatrix`,
 * `item.skinning` and `item.instanceTransforms` unchanged.
 */
import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { flattenAuraSceneSnapshot } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { instances, labelInstanceWindItems } from "../../../packages/engine/src/agent-api/nodes/instances";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraSceneNode, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem } from "@aura3d/rendering";

const flags = resolveQrFlags({ options: ["core"], env: {} });
const asset = (id: string) => ({
  kind: "aura-asset-ref", id, type: "model", source: `${id}.glb`, uri: `${id}.glb`,
  metadata: { boundsMetadata: { min: [-1, 0, -1], max: [1, 2, 1] } },
  [auraAssetRefBrand]: { type: "model", id }
}) as never;

/** One joint palette entry: a translation of +1 m on Y (the "hips" lifted above the rig origin). */
const PALETTE = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1]);

function actor(skinned: boolean) {
  return {
    id: skinned ? "rig" : "tree",
    pipeline: { asset: { skins: skinned ? [{}] : [], meshes: [] }, resources: {}, metadata: {} },
    evidence: { clips: [], skinningBindingCount: 0, lastSkinningPalettesUpdated: 0, lastMaterialTracksApplied: 0, lastLightTracksApplied: 0, lastFootPlantingMissingLegs: [] },
    animation: { setFootPlanting: () => undefined },
    applyMorphTargets: () => undefined,
    applyRetargetedPose: () => undefined,
    collectRenderItems: ({ modelMatrix }: { modelMatrix: ArrayLike<number> }) => [{
      geometry: { topology: "triangles", bounds: { min: [-1, 0, -1], max: [1, 2, 1] } },
      material: undefined,
      modelMatrix: Float32Array.from(modelMatrix),
      label: "mesh",
      ...(skinned ? { skinning: { jointCount: 1, matrices: PALETTE } } : {})
    }]
  };
}

function mount(nodes: readonly AuraSceneNode[]) {
  const authored = { ...scene().toJSON(), nodes } as AuraSceneSnapshot;
  const flat = flattenAuraSceneSnapshot(authored, flags);
  const registry = createAuraRuntimeNodeRegistry(flat, { flags }, authored);
  return { flat, registry };
}

function render(flat: AuraSceneSnapshot, registry: ReturnType<typeof createAuraRuntimeNodeRegistry>, entries: readonly ProductionRuntimeActorEntry[]): RenderItem[] {
  const input = createProductionRuntimeRendererInput(flat, { width: 8, height: 6 } as HTMLCanvasElement, entries, [], 0, registry, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
  return [...(input.source.collectRenderItems?.() ?? [])];
}

const apply = (m: ArrayLike<number>, o: number, p: readonly number[]): number[] => [0, 1, 2].map((r) =>
  m[o + r]! * p[0]! + m[o + 4 + r]! * p[1]! + m[o + 8 + r]! * p[2]! + m[o + 12 + r]!);
/** World position of skinned vertex `v` (single joint, weight 1): modelMatrix . palette . v. */
const skinnedWorld = (item: RenderItem, v: readonly number[]): number[] => apply(item.modelMatrix!, 0, apply(item.skinning!.matrices, 0, v));
const close = (actual: readonly number[], expected: readonly number[]) => expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 5));

/** Ry(+90 deg) maps local +X to world -Z and local +Z to world +X. */
const QUARTER = Math.PI / 2;

describe("(a) skinned model under a translated + rotated parent group", () => {
  it("static group: the item model matrix and the skinned vertex follow parent x local", () => {
    const rig = { kind: "model", name: "rig", asset: asset("rig"), scaleMode: "world", position: [1, 0, 0] } as unknown as AuraSceneNode;
    const { flat, registry } = mount([{ kind: "group", name: "kart", position: [10, 2, 0], rotation: [0, QUARTER, 0], children: [rig] } as unknown as AuraSceneNode]);
    try {
      const [item] = render(flat, registry, [{ node: flat.nodes[0], actor: actor(true) } as unknown as ProductionRuntimeActorEntry]);
      expect(item!.skinning).toBeDefined();
      close(apply(item!.modelMatrix!, 0, [0, 0, 0]), [10, 2, -1]);
      close(skinnedWorld(item!, [0, 0, 0]), [10, 3, -1]);
      close(skinnedWorld(item!, [0, 0, 1]), [11, 3, -1]);
    } finally { registry.dispose(); }
  });

  it("live runtime group: the rig follows the group as it moves and turns", () => {
    const rig = { kind: "model", name: "rig", asset: asset("rig"), scaleMode: "world", position: [1, 0, 0], runtime: { id: "driver" } } as unknown as AuraSceneNode;
    const { flat, registry } = mount([{ kind: "group", name: "kart", runtime: { id: "kart" }, position: [10, 2, 0], rotation: [0, QUARTER, 0], children: [rig] } as unknown as AuraSceneNode]);
    try {
      const entry = { node: flat.nodes[0], actor: actor(true) } as unknown as ProductionRuntimeActorEntry;
      close(skinnedWorld(render(flat, registry, [entry])[0]!, [0, 0, 0]), [10, 3, -1]);
      registry.require("kart").setPosition(20, 0, 5).setRotation(0, 0, 0);
      const moved = render(flat, registry, [entry])[0]!;
      close(apply(moved.modelMatrix!, 0, [0, 0, 0]), [21, 0, 5]);
      close(skinnedWorld(moved, [0, 0, 0]), [21, 1, 5]);
    } finally { registry.dispose(); }
  });

  it("top-level workaround: a rigged node whose world transform the game writes draws exactly there", () => {
    const rig = { kind: "model", name: "rig", asset: asset("rig"), scaleMode: "world", position: [0, -60, 0], runtime: { id: "driver" } } as unknown as AuraSceneNode;
    const { flat, registry } = mount([rig, { kind: "group", name: "kart", runtime: { id: "kart" }, position: [10, 2, 0], children: [] } as unknown as AuraSceneNode]);
    try {
      registry.require("driver").setPosition(10, 2.5, 0).setRotation(0, QUARTER, 0);
      const [item] = render(flat, registry, [{ node: flat.nodes[0], actor: actor(true) } as unknown as ProductionRuntimeActorEntry]);
      close(apply(item!.modelMatrix!, 0, [0, 0, 0]), [10, 2.5, 0]);
      close(apply(item!.modelMatrix!, 0, [1, 0, 0]), [10, 2.5, -1]);
      close(skinnedWorld(item!, [0, 0, 0]), [10, 3.5, 0]);
    } finally { registry.dispose(); }
  });
});

describe("(b) wind-swayed instances.model under a parent group", () => {
  const windTrees = (extra: Record<string, unknown> = {}) => instances.model(asset("tree"), {
    name: "trees", scaleMode: "world", transforms: [{ position: [1, 0, 0] }, { position: [0, 0, 2], rotation: [0, QUARTER, 0] }],
    wind: { strength: 0.6, assetHeight: 2 }, ...extra
  } as never);
  const treeEntry = (flat: AuraSceneSnapshot) => ({ node: flat.nodes[0], actor: actor(false) } as unknown as ProductionRuntimeActorEntry);
  const origins = (item: RenderItem): number[][] => {
    const t = item.instanceTransforms as Float32Array;
    return Array.from({ length: t.length / 16 }, (_, i) => apply(t, i * 16, [0, 0, 0]));
  };

  it("static translated + rotated group: instance matrices are parent x instance (not the world origin)", () => {
    const { flat, registry } = mount([{ kind: "group", name: "monastery", position: [10, 0, 0], rotation: [0, QUARTER, 0], children: [windTrees().toJSON()] } as unknown as AuraSceneNode]);
    try {
      const items = labelInstanceWindItems(render(flat, registry, [treeEntry(flat)])).items;
      expect(items[0]!.label?.startsWith("prd10.wind:")).toBe(true);
      const [a, b] = origins(items[0]!);
      close(a!, [10, 0, -1]);
      close(b!, [12, 0, 0]);
      // the second instance's own +90 deg yaw composes with the parent's: local +X faces world -X
      const t = items[0]!.instanceTransforms as Float32Array;
      close(apply(t, 16, [1, 0, 0]), [11, 0, 0]);
    } finally { registry.dispose(); }
  });

  it("group at the origin and top-level batches (the game-side workaround) are unchanged", () => {
    for (const nodes of [[{ kind: "group", name: "piece", children: [windTrees().toJSON()] }], [windTrees().toJSON()]] as unknown as AuraSceneNode[][]) {
      const { flat, registry } = mount(nodes);
      try {
        const [a, b] = origins(render(flat, registry, [treeEntry(flat)])[0]!);
        close(a!, [1, 0, 0]);
        close(b!, [0, 0, 2]);
      } finally { registry.dispose(); }
    }
  });

  it("tree clearance: setInstances on a wind batch does not throw and the hidden tree keeps the parent", () => {
    const { flat, registry } = mount([{ kind: "group", name: "course", position: [10, 0, 0], children: [windTrees().runtime({ id: "trees" }).toJSON()] } as unknown as AuraSceneNode]);
    try {
      const handle = registry.require("trees");
      for (let frame = 0; frame < 3; frame += 1) {
        expect(() => handle.setInstances([{ position: [1, 0, 0], scale: [0.0001, 0.0001, 0.0001] }, { position: [0, 0, 2] }])).not.toThrow();
      }
      expect(() => handle.setInstanceMatrices(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1]), 1)).not.toThrow();
      handle.setInstances([{ position: [1, 0, 0], scale: [0.0001, 0.0001, 0.0001] }, { position: [0, 0, 2] }]);
      const items = labelInstanceWindItems(render(flat, registry, [treeEntry(flat)])).items;
      const t = items[0]!.instanceTransforms as Float32Array;
      expect(t[0]).toBeCloseTo(0.0001, 6);
      close(origins(items[0]!)[1]!, [10, 0, 2]);
    } finally { registry.dispose(); }
  });

  it("batches with other packed world options still reject live instance changes", () => {
    const { flat, registry } = mount([windTrees({ static: true }).runtime({ id: "packed" }).toJSON()]);
    void flat;
    try {
      expect(() => registry.require("packed").setInstances([{ position: [3, 0, 0] }])).toThrow(/INSTANCE_SCATTER_RUNTIME_UNSUPPORTED/);
    } finally { registry.dispose(); }
  });
});
