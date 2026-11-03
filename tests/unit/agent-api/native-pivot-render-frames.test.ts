import { describe, expect, it, vi } from "vitest";
import { Geometry, PBRMaterial, type RenderItem } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { flattenAuraSceneSnapshot, modelMatrixFor } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph";
import { instances, primitives, scene } from "../../../packages/engine/src/public/index";
import type { AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneNode, AuraSceneSnapshot, ProductionRuntimeActorEntry } from "../../../packages/engine/src/agent-api/nodes/types";

const flags = resolveQrFlags({ options: ["core"], env: {} });
const snapshot = (nodes: readonly AuraSceneNode[]): AuraSceneSnapshot => ({ ...scene().toJSON(), nodes });
const canvas = (): HTMLCanvasElement => ({ width: 64, height: 64 } as HTMLCanvasElement);

function close(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => expect(actual[index], `component ${index}`).toBeCloseTo(value, 5));
}

/** Independent column-major multiplication; inspect what a renderer receives. */
function product(left: ArrayLike<number>, right: ArrayLike<number>): number[] {
  return Array.from({ length: 16 }, (_, index) => {
    const row = index % 4, column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, k) => sum + left[k * 4 + row]! * right[column * 4 + k]!, 0);
  });
}

function harness(
  value: AuraSceneSnapshot,
  registry?: AuraRuntimeNodeRegistry,
  actors: readonly ProductionRuntimeActorEntry[] = [],
  cached = true
) {
  const target = canvas();
  const unregister = cached ? setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(true)), target) : () => {};
  const entries = createProductionRuntimePrimitiveEntries(value.nodes);
  const frame = (): RenderItem[] => {
    const input = createProductionRuntimeRendererInput(value, target, actors, entries, 0, registry, new Set(),
      { color: [0, 0, 0], intensity: 0 }, []);
    return [...(input.source.collectRenderItems?.() ?? [])];
  };
  const dispose = (): void => {
    unregister();
    for (const entry of entries) for (const resource of entry.resources) {
      resource.textureDisposer?.();
      resource.geometry.dispose();
      if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) resource.shadowGeometry.dispose();
      resource.material.dispose();
      resource.texturedMaterial?.dispose(); // a separate upgrade slot, never the scalar material
    }
  };
  return { entries, frame, dispose };
}

function actor(node: AuraModelNode, skinned = false) {
  const geometry = Geometry.triangle();
  const material = new PBRMaterial();
  const collect = vi.fn(({ modelMatrix }: { modelMatrix: ArrayLike<number> }) => [{ geometry, material, modelMatrix: Array.from(modelMatrix) }]);
  const setFootPlanting = vi.fn();
  const value = {
    id: "actor", pipeline: { asset: { skins: skinned ? [{}] : [], meshes: [] }, resources: {}, metadata: {
      meshCount: 1, primitiveCount: 1, materialCount: 1, textureCount: 0, imageCount: 0,
      animationCount: 0, skinCount: skinned ? 1 : 0, morphTargetCount: 0, extensionsUsed: []
    } },
    evidence: { clips: [], skinningBindingCount: skinned ? 1 : 0, lastSkinningPalettesUpdated: 0, lastMaterialTracksApplied: 0, lastLightTracksApplied: 0, lastFootPlantingMissingLegs: [] },
    animation: { setFootPlanting }, collectRenderItems: collect
  };
  return {
    entry: { node, actor: value } as unknown as ProductionRuntimeActorEntry,
    collect, setFootPlanting,
    dispose: () => { geometry.dispose(); material.dispose(); }
  };
}

const model = (overrides: Partial<AuraModelNode> = {}): AuraModelNode => ({
  kind: "model", name: "model", asset: {
    kind: "aura-asset-ref", id: "fixture", type: "model", source: "fixture.glb", uri: "fixture.glb",
    metadata: { boundsMetadata: { min: [-1, -1, -1], max: [1, 1, 1] } }
  } as unknown as AuraModelNode["asset"],
  scaleMode: "world", visible: true, castShadow: true, receiveShadow: true, ...overrides
});

describe("pivoted production frame submissions", () => {
  it.each([false, true])("tracks a root primitive's live pivot and reset with cached=%s", (cached) => {
    const node = primitives.box({ name: "box", position: [4, 0, 0], size: [2, 3, 4],
      rotation: [0, 0, Math.PI / 2], pivot: [1, 0, 0] }).runtime({ id: "box" }).toJSON();
    const value = snapshot([node]);
    const registry = createAuraRuntimeNodeRegistry(value, { flags });
    const h = harness(value, registry, [], cached);
    try {
      const matrix = () => h.frame()[0]!.modelMatrix!;
      const first = matrix();
      close([first[0]!, first[1]!, first[4]!, first[5]!, first[12]!, first[13]!], [0, 2, -3, 0, 5, -1]);
      registry.require("box").setPivot(2, 0, 0);
      close(Array.from(matrix()).slice(12, 15), [6, -2, 0]);
      registry.require("box").setPivot(0, 0, 0);
      close(Array.from(matrix()).slice(12, 15), [4, 0, 0]);
    } finally { h.dispose(); registry.dispose(); }
  });

  it("composes a flattened parent and leaf pivot once without a runtime registry", () => {
    const leaf = primitives.box({ name: "leaf", size: [2, 3, 1], position: [1, 0, 0],
      rotation: [0, 0, Math.PI / 2], pivot: [1, 0, 0] }).toJSON();
    const authored = snapshot([{ kind: "group", name: "group", position: [10, 0, 0],
      rotation: [0, 0, Math.PI / 2], pivot: [2, 0, 0], children: [leaf] }]);
    const flat = flattenAuraSceneSnapshot(authored, true);
    const h = harness(flat);
    try {
      const matrix = h.frame()[0]!.modelMatrix!;
      close([matrix[0]!, matrix[1]!, matrix[4]!, matrix[5]!, matrix[12]!, matrix[13]!], [-2, 0, 0, -3, 13, 0]);
    } finally { h.dispose(); }
  });

  it("uses the live parent and local pivot after either changes", () => {
    const leaf = primitives.box({ name: "leaf", position: [1, 0, 0], rotation: [0, 0, Math.PI / 2], pivot: [1, 0, 0] })
      .runtime({ id: "leaf" }).toJSON();
    const authored = snapshot([{ kind: "group", name: "group", runtime: { id: "group" }, position: [10, 0, 0],
      rotation: [0, 0, Math.PI / 2], pivot: [2, 0, 0], children: [leaf] }]);
    const flat = flattenAuraSceneSnapshot(authored, true);
    const registry = createAuraRuntimeNodeRegistry(flat, { flags }, authored);
    const h = harness(flat, registry);
    try {
      const position = () => Array.from(h.frame()[0]!.modelMatrix!).slice(12, 15);
      close(position(), [13, 0, 0]);
      registry.require("group").setPivot(3, 0, 0);
      close(position(), [14, -1, 0]);
      registry.require("leaf").setPivot(2, 0, 0);
      close(position(), [15, 0, 0]);
    } finally { h.dispose(); registry.dispose(); }
  });

  it("recomputes mutable primitive instance pivots and disables unsafe culling", () => {
    const pivot: [number, number, number] = [0, 0, 0];
    const node = instances.box({ name: "batch", size: [2, 3, 1], position: [5, 0, 0], rotation: [0, 0, Math.PI / 2],
      transforms: [{ position: [2, 0, 0], quaternion: [0, 0, 1, 0], pivot }] }).toJSON();
    const value = snapshot([node]);
    const h = harness(value);
    try {
      const first = h.frame()[0]!;
      const firstMatrix = product(first.modelMatrix!, first.instanceTransforms!);
      close(firstMatrix.slice(12, 15), [5, 2, 0]);
      pivot[0] = 1;
      const pivoted = h.frame()[0]!;
      expect(pivoted.frustumCulled).toBe(false);
      const pivotedMatrix = product(pivoted.modelMatrix!, pivoted.instanceTransforms!);
      close([pivotedMatrix[0]!, pivotedMatrix[1]!, pivotedMatrix[4]!, pivotedMatrix[5]!, pivotedMatrix[12]!, pivotedMatrix[13]!], [0, -2, 3, 0, 5, 4]);
      pivot[0] = 2;
      const next = h.frame()[0]!;
      const nextMatrix = product(next.modelMatrix!, next.instanceTransforms!);
      close(nextMatrix.slice(12, 15), [5, 6, 0]);
      close(pivotedMatrix.slice(12, 15), [5, 4, 0]);
    } finally { h.dispose(); }
  });

  it("merges model and instance pivots as overrides before mesh placement", () => {
    const node = model({ pivot: [1, 0, 0], rotation: [0, 0, Math.PI], instances: [
      { position: [2, 0, 0] }, { position: [3, 0, 0], pivot: [2, 0, 0], rotation: [0, 0, Math.PI / 2] }
    ] });
    const a = actor(node);
    const h = harness(snapshot([node]), undefined, [a.entry]);
    try {
      const item = h.frame()[0]!;
      expect(item.frustumCulled).toBe(false);
      const transforms = Array.from(item.instanceTransforms!);
      close(product(item.modelMatrix!, transforms.slice(0, 16)).slice(12, 15), [4, 0, 0]);
      close(product(item.modelMatrix!, transforms.slice(16, 32)).slice(12, 15), [5, -2, 0]);
    } finally { h.dispose(); a.dispose(); }
  });

  it("updates the submitted model matrix when its runtime pivot changes", () => {
    const node = model({ runtime: { id: "model" }, position: [4, 0, 0],
      rotation: [0, 0, Math.PI / 2], pivot: [1, 0, 0] });
    const value = snapshot([node]);
    const registry = createAuraRuntimeNodeRegistry(value, { flags });
    const a = actor(node);
    const h = harness(value, registry, [a.entry]);
    try {
      const position = () => Array.from(h.frame()[0]!.modelMatrix!).slice(12, 15);
      close(position(), [5, -1, 0]);
      registry.require("model").setPivot(2, 0, 0);
      close(position(), [6, -2, 0]);
      registry.require("model").setPivot(0, 0, 0);
      close(position(), [4, 0, 0]);
    } finally { h.dispose(); registry.dispose(); a.dispose(); }
  });

  it("keeps a static model parent outside a pivoted instance override", () => {
    const leaf = model({ position: [1, 0, 0], instances: [
      { position: [2, 0, 0], rotation: [0, 0, Math.PI], pivot: [1, 0, 0] }
    ] });
    const authored = snapshot([{ kind: "group", name: "parent", position: [3, 0, 0],
      rotation: [0, 0, Math.PI / 2], children: [leaf] }]);
    const flat = flattenAuraSceneSnapshot(authored, true);
    const a = actor(flat.nodes[0] as AuraModelNode);
    const h = harness(flat, undefined, [a.entry]);
    try {
      const item = h.frame()[0]!;
      close(product(item.modelMatrix!, item.instanceTransforms!).slice(12, 15), [3, 4, 0]);
    } finally { h.dispose(); a.dispose(); }
  });

  it("treats dense runtime matrices as precomposed instead of applying an instance pivot twice", () => {
    const node = instances.box({ name: "dense", size: [2, 3, 1],
      transforms: [{ pivot: [1, 0, 0], rotation: [0, 0, Math.PI] }] }).runtime({ id: "dense" }).toJSON();
    const value = snapshot([node]);
    const registry = createAuraRuntimeNodeRegistry(value, { flags });
    const h = harness(value, registry);
    try {
      let item = h.frame()[0]!;
      close(product(item.modelMatrix!, item.instanceTransforms!).slice(12, 15), [2, 0, 0]);
      registry.require("dense").setInstanceMatrices(new Float32Array([
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 0, 0, 1
      ]), 1);
      item = h.frame()[0]!;
      close(product(item.modelMatrix!, item.instanceTransforms!).slice(12, 15), [7, 0, 0]);
      expect(item.frustumCulled).toBe(false);
    } finally { h.dispose(); registry.dispose(); }
  });

  it("preflights a malformed later primitive before touching an earlier actor", () => {
    const first = model();
    const bad = primitives.box({ name: "bad" }).toJSON();
    const a = actor(first);
    const h = harness(snapshot([first, bad]), undefined, [a.entry]);
    try {
      (bad as { pivot?: unknown }).pivot = [1, Number.NaN, 0];
      expect(() => h.frame()).toThrow(/PIVOT_INVALID/);
      expect(a.setFootPlanting).not.toHaveBeenCalled();
      expect(a.collect).not.toHaveBeenCalled();
    } finally { h.dispose(); a.dispose(); }
  });

  it("rejects unsupported pivoted LOD and skinned instancing before drawing", () => {
    const primitiveNode: AuraPrimitiveNode = { kind: "primitive", primitive: "box", pivot: [1, 0, 0],
      lod: { levels: [{ name: "near", maxDistance: 10, primitive: "box" }] } };
    expect(() => createProductionRuntimePrimitiveEntries([primitiveNode])).toThrow(/PIVOT_UNSUPPORTED_LOD/);
    const node = model({ instances: [{ pivot: [1, 0, 0] }] });
    const a = actor(node, true);
    const h = harness(snapshot([node]), undefined, [a.entry]);
    try {
      expect(() => h.frame()).toThrow(/PIVOT_UNSUPPORTED_SKIN/);
      expect(a.setFootPlanting).not.toHaveBeenCalled();
      expect(a.collect).not.toHaveBeenCalled();
    } finally { h.dispose(); a.dispose(); }
  });

  it("rejects a live pivot plus lookAt before an earlier actor is touched", () => {
    const first = model();
    const pivot: [number, number, number] = [0, 0, 0];
    const bad = instances.box({ name: "batch", lookAt: [0, 1, 0], transforms: [{ pivot }] }).toJSON();
    const a = actor(first);
    const h = harness(snapshot([first, bad]), undefined, [a.entry]);
    try {
      pivot[0] = 1;
      expect(() => h.frame()).toThrow(/PIVOT_UNSUPPORTED_LOOK_AT/);
      expect(a.setFootPlanting).not.toHaveBeenCalled();
      expect(a.collect).not.toHaveBeenCalled();
    } finally { h.dispose(); a.dispose(); }
  });
});
