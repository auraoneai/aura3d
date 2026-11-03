import "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { Geometry, IndexBuffer, MockRenderBuffer, MockRenderDevice, Renderer, VertexBuffer, VertexFormat } from "../../../packages/rendering/src";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { createAuraRuntimeNodeRegistry, runtimeNodeQueryState } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { tagLodLevel } from "../../../packages/engine/src/agent-api/lodMarkers";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraAssetRef, AuraModelNode, AuraPrimitiveNode, AuraSceneSnapshot, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem } from "@aura3d/rendering";

const asset = {
  kind: "aura-asset-ref", id: "query-model", type: "model", source: "query.glb", uri: "query.glb",
  metadata: { boundsMetadata: { min: [0, 0, 0], max: [2, 2, 2] } },
  [auraAssetRefBrand]: { type: "model", id: "query-model" }
} as unknown as AuraAssetRef<"model">;

function triangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  [[0, 0, 0], [2, 0, 0], [0, 2, 0]].forEach((position, index) => vertices.setAttribute(index, "position", position));
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function actorEntry(node: AuraModelNode, geometry: Geometry): ProductionRuntimeActorEntry {
  const actor = {
    id: `actor-${node.runtime!.id}`,
    pipeline: { asset: { skins: [], meshes: [] }, resources: {}, metadata: { extensionsUsed: [] } },
    evidence: { clips: [], skinningBindingCount: 0, lastSkinningPalettesUpdated: 0, lastMaterialTracksApplied: 0, lastLightTracksApplied: 0, lastFootPlantingMissingLegs: [] },
    animation: { setFootPlanting: () => undefined },
    applyMorphTargets: () => undefined,
    collectRenderItems: ({ modelMatrix }: { modelMatrix: ArrayLike<number> }) => [1, 2].map((meshOffset) => {
      const matrix = Float32Array.from(modelMatrix);
      matrix[14] += meshOffset;
      return { geometry, material: { renderState: { cullMode: "back" }, getParameter: () => undefined, setParameter: () => undefined }, modelMatrix: matrix, label: `mesh-${meshOffset}` };
    })
  };
  return { node, actor } as unknown as ProductionRuntimeActorEntry;
}

function model(id: string, extra: Partial<AuraModelNode> = {}): AuraModelNode {
  return { kind: "model", asset, name: id, runtime: { id }, visible: true, scaleMode: "world", castShadow: true, receiveShadow: true, ...extra } as AuraModelNode;
}

function snapshot(nodes: AuraSceneSnapshot["nodes"]): AuraSceneSnapshot {
  return {
    schema: "aura3d-scene-snapshot/1.0", background: "#000000", diagnostics: { enabled: false }, nodes,
    camera: { mode: "orbit", position: [0, 4, 10], target: [0, 0, 0] }
  } as unknown as AuraSceneSnapshot;
}

function fixture(node: AuraModelNode) {
  const scene = snapshot([node]);
  const registry = createAuraRuntimeNodeRegistry(scene);
  const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
  const geometry = triangle();
  const actor = actorEntry(node, geometry);
  const frame = (actors: readonly ProductionRuntimeActorEntry[] = [actor], primitives: readonly ProductionRuntimePrimitiveEntry[] = []) => {
    const input = createProductionRuntimeRendererInput(scene, canvas, actors, primitives, 0, registry, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
    return [...(input.source.collectRenderItems?.() ?? [])];
  };
  return { scene, registry, canvas, geometry, actor, frame, handle: registry.require(node.runtime!.id) };
}

const ray = { origin: [0.5, 0.5, 10] as const, direction: [0, 0, -1] as const };

describe("runtime query render-item handoff", () => {
  it("raycasts every finalized actor mesh and follows the next frame's placement", () => {
    const f = fixture(model("actor"));
    try {
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toEqual([]);
      const submitted = f.frame();
      expect(runtimeNodeQueryState(f.handle)?.renderItems).toEqual(submitted);
      expect(runtimeNodeQueryState(f.handle)?.renderItems?.[0]).toBe(submitted[0]);
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" }).map(({ distance }) => distance)).toEqual([8, 9]);

      f.handle.setPosition(0, 0, 3);
      const moved = f.frame();
      expect(runtimeNodeQueryState(f.handle)?.renderItems?.[0]).toBe(moved[0]);
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" }).map(({ distance }) => distance)).toEqual([5, 6]);
    } finally {
      f.registry.dispose();
      f.geometry.dispose();
    }
  });

  it("publishes composed model instance transforms and preserves instance identity", () => {
    const f = fixture(model("copies", { instances: [{ position: [0, 0, 0] }, { position: [0, 0, 3] }] }));
    try {
      const submitted = f.frame();
      expect(runtimeNodeQueryState(f.handle)?.renderItems?.[0]).toBe(submitted[0]);
      expect(submitted[0]!.instanceTransforms).toBeDefined();
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" }).map(({ instanceId, distance }) => [instanceId, distance]))
        .toEqual([[1, 5], [1, 6], [0, 8], [0, 9]]);
      f.handle.setInstances([]);
      expect(f.frame()).toHaveLength(0);
      expect(runtimeNodeQueryState(f.handle)?.renderItems).toEqual([]);
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toEqual([]);
    } finally {
      f.registry.dispose();
      f.geometry.dispose();
    }
  });

  it("passes synthetic live morph weights and a skinning palette through to mesh queries", () => {
    const f = fixture(model("deformed"));
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    [[0, 0, 0], [2, 0, 0], [0, 2, 0]].forEach((position, index) => {
      vertices.setAttribute(index, "position", position);
      vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
    });
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const palette = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1]);
    const weights = [1];
    const morphTargets = [{ positions: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] as const }];
    const actor = f.actor.actor as unknown as { collectRenderItems(options: { modelMatrix: ArrayLike<number> }): RenderItem[] };
    const collect = actor.collectRenderItems;
    actor.collectRenderItems = (options) => collect(options).map((item) => ({
      ...item, geometry, morphTargets, morphWeights: weights, skinning: { jointCount: 1, matrices: palette }
    }));
    try {
      f.frame();
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" }).map(({ distance }) => distance)).toEqual([6, 7]);
      palette[14] = 3;
      weights[0] = 2;
      f.frame();
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" }).map(({ distance }) => distance)).toEqual([3, 4]);
    } finally {
      f.registry.dispose();
      f.geometry.dispose();
      geometry.dispose();
    }
  });

  it("clears skipped, removed and disposed entries instead of retaining their previous geometry", () => {
    const f = fixture(model("lifecycle"));
    try {
      f.frame();
      f.handle.setVisible(false);
      expect(f.frame()).toEqual([]);
      f.handle.setVisible(true);
      expect(runtimeNodeQueryState(f.handle)?.renderItems).toEqual([]);
      f.frame();
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toHaveLength(2);
      expect(f.frame([])).toEqual([]);
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toEqual([]);
      f.frame();
      f.registry.remove("lifecycle");
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toEqual([]);
      f.frame();
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toEqual([]);
    } finally {
      f.registry.dispose();
      f.geometry.dispose();
    }
  });

  it("clears an actor's meshes when its LOD level stops being submitted", () => {
    const root = { position: [0, 4, 10] as [number, number, number], thresholds: [{ maxDistance: 5 }, {}], hysteresis: 0 };
    const node = tagLodLevel(model("lod"), { root, levelIndex: 0 }) as AuraModelNode;
    const f = fixture(node);
    try {
      f.frame();
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toHaveLength(2);
      root.position = [0, 100, 0];
      expect(f.frame()).toEqual([]);
      expect(runtimeNodeQueryState(f.handle)?.renderItems).toEqual([]);
      expect(raycast(ray, { handles: [f.handle], mode: "mesh" })).toEqual([]);
    } finally {
      f.registry.dispose();
      f.geometry.dispose();
    }
  });

  it("publishes primitive instance items and clears an empty dense write", () => {
    const node = { kind: "primitive", primitive: "box", name: "boxes", runtime: { id: "boxes" }, instances: [{ position: [0, 0, 0] }] } as AuraPrimitiveNode;
    const scene = snapshot([node]);
    const registry = createAuraRuntimeNodeRegistry(scene);
    const handle = registry.require("boxes");
    const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
    const entries = createProductionRuntimePrimitiveEntries([node]);
    const frame = () => [...(createProductionRuntimeRendererInput(scene, canvas, [], entries, 0, registry, new Set(), { color: [0, 0, 0], intensity: 0 }, []).source.collectRenderItems?.() ?? [])];
    try {
      const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1]);
      handle.setInstanceMatrices(matrix, 1);
      const [submitted] = frame();
      expect(runtimeNodeQueryState(handle)?.renderItems?.[0]).toBe(submitted);
      expect(submitted!.instanceTransforms?.[12]).toBe(2);
      const displacedRay = { origin: [2.1, 0.05, 5] as const, direction: [0, 0, -1] as const };
      const authoredRay = { origin: [0.1, 0.05, 5] as const, direction: [0, 0, -1] as const };
      expect(raycast(displacedRay, { handles: [handle], mode: "mesh" })[0]?.instanceId).toBe(0);
      expect(raycast(authoredRay, { handles: [handle], mode: "mesh" })).toEqual([]);
      handle.setInstanceMatrices(new Float32Array(), 0);
      expect(frame()).toEqual([]);
      expect(runtimeNodeQueryState(handle)?.renderItems).toEqual([]);
      expect(raycast(displacedRay, { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(raycast(authoredRay, { handles: [handle], mode: "mesh" })).toEqual([]);
    } finally {
      registry.dispose();
      for (const entry of entries) for (const resource of entry.resources) resource.geometry.dispose();
    }
  });

  it("submits live custom-primitive morphs to rendering and mesh queries", async () => {
    const sourceGeometry = defineAuraCustomGeometry({
      positions: [0, 0, 0, 2, 0, 0, 0, 2, 0], indices: [0, 1, 2],
      morphTargets: [
        { name: "raise", positions: new Float32Array([0, 0, 2, 0, 0, 2, 0, 0, 2]) },
        { positions: [1, 0, 0, 1, 0, 0, 1, 0, 0] },
        { name: "toString", positions: [0, 0, 3, 0, 0, 3, 0, 0, 3] }
      ]
    });
    const node = { kind: "primitive", primitive: "custom", name: "morph", runtime: { id: "morph" }, geometry: sourceGeometry } as AuraPrimitiveNode;
    const scene = snapshot([node]);
    const registry = createAuraRuntimeNodeRegistry(scene);
    const handle = registry.require("morph");
    const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
    const entries = createProductionRuntimePrimitiveEntries([node]);
    const frame = () => [...(createProductionRuntimeRendererInput(scene, canvas, [], entries, 0, registry, new Set(), { color: [0, 0, 0], intensity: 0 }, []).source.collectRenderItems?.() ?? [])];
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const query = { origin: [0.5, 0.5, 5] as const, direction: [0, 0, -1] as const };
    try {
      handle.setMorphTarget("raise", 0.5);
      handle.setMorphTarget("1", 0.25);
      const [submitted] = frame();
      expect(submitted!.morphWeights).toEqual([0.5, 0.25, 0]);
      expect(submitted!.morphTargets?.[0]?.positions).toEqual([[0, 0, 2], [0, 0, 2], [0, 0, 2]]);
      expect(raycast(query, { handles: [handle], mode: "mesh" })[0]?.distance).toBeCloseTo(4);

      // The mock backend records the actual CPU-morphed buffer sent to a draw.
      renderer.render([submitted!]);
      const draw = (renderer.device as MockRenderDevice).drawCommands[0];
      const buffer = draw?.vertexBuffer as MockRenderBuffer;
      const floats = new Float32Array(buffer.bytes.buffer, buffer.bytes.byteOffset, buffer.bytes.byteLength / 4);
      expect(Array.from(floats.slice(0, 3))).toEqual([0.25, 0, 1]);

      // A same-footprint setGeometry replaces the deltas on the live resource.
      handle.setGeometry!({ ...sourceGeometry, morphTargets: [
        { name: "raise", positions: [0, 0, 4, 0, 0, 4, 0, 0, 4] },
        { positions: [1, 0, 0, 1, 0, 0, 1, 0, 0] },
        { name: "toString", positions: [0, 0, 3, 0, 0, 3, 0, 0, 3] }
      ] });
      const [updated] = frame();
      expect(updated!.geometry).toBe(submitted!.geometry);
      expect(updated!.morphTargets?.[0]?.positions?.[0]).toEqual([0, 0, 4]);
      expect(raycast(query, { handles: [handle], mode: "mesh" })[0]?.distance).toBeCloseTo(3);

      handle.setMorphTargets({});
      const [reset] = frame();
      expect(raycast(query, { handles: [handle], mode: "mesh" })[0]?.distance).toBeCloseTo(5);
      expect(reset!.morphWeights?.every((weight) => weight === 0) ?? true).toBe(true);
    } finally {
      renderer.dispose();
      registry.dispose();
      for (const entry of entries) for (const resource of entry.resources) resource.geometry.dispose();
    }
  });

  it("keeps canvas owners isolated and clears a released owner's published items", () => {
    const a = fixture(model("shared-id"));
    const b = fixture(model("shared-id"));
    const releaseA = setPrd01ModelMatrixCache(null, a.canvas);
    const releaseB = setPrd01ModelMatrixCache(null, b.canvas);
    try {
      a.frame();
      b.frame();
      releaseA();
      expect(raycast(ray, { handles: [a.handle], mode: "mesh" })).toEqual([]);
      expect(raycast(ray, { handles: [b.handle], mode: "mesh" })).toHaveLength(2);
    } finally {
      releaseA();
      releaseB();
      a.registry.dispose();
      b.registry.dispose();
      a.geometry.dispose();
      b.geometry.dispose();
    }
  });

  it("retires the previous registry's handles when a canvas changes scenes", () => {
    const old = fixture(model("old"));
    const next = fixture(model("next"));
    try {
      old.frame();
      createProductionRuntimeRendererInput(next.scene, old.canvas, [next.actor], [], 0, next.registry, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
      expect(raycast(ray, { handles: [old.handle], mode: "mesh" })).toEqual([]);
      expect(raycast(ray, { handles: [next.handle], mode: "mesh" })).toHaveLength(2);
    } finally {
      old.registry.dispose();
      next.registry.dispose();
      old.geometry.dispose();
      next.geometry.dispose();
    }
  });
});
