import { afterEach, describe, expect, it, vi } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { primitives, scene } from "../../../packages/engine/src/public/index";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import type { AuraPrimitiveNode, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types";
import { collectTypedGLBActorRenderItems, createTypedGLBActor, type TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { getTypedGLBActorLod } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorLod";
import "../../../packages/rendering/src/lanes/prd03";
import { bindVelocityUniforms, VelocityHistory } from "../../../packages/rendering/src/forward/Velocity";
import { collectRenderItems } from "../../../packages/rendering/src/Renderer";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

const matrixAt = (x: number) => { const matrix = Float32Array.from(identityMat4()); matrix[12] = x; return matrix; };

function previousX(item: RenderItem): number | undefined {
  const uniforms = new Map();
  bindVelocityUniforms?.(item, uniforms);
  return (uniforms.get("u_previousModel") as Float32Array | undefined)?.[12];
}

function disposePrimitiveEntries(entries: readonly ProductionRuntimePrimitiveEntry[]): void {
  for (const entry of entries) for (const resource of entry.resources) {
    resource.geometry.dispose();
    if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) resource.shadowGeometry.dispose();
    resource.material.dispose();
    resource.texturedMaterial?.dispose();
    resource.textureDisposer?.();
  }
}

function gltfFixture(withLod = false): string {
  const bytes = Buffer.from(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer);
  const primitive = { attributes: { POSITION: 0 }, material: 0 };
  const base = {
    asset: { version: "2.0" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteLength: bytes.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] }],
    materials: [{ name: "surface" }],
    meshes: [{ name: "high", primitives: [primitive] }],
    nodes: [{ name: "same", mesh: 0 }, { name: "same", mesh: 0, translation: [3, 0, 0] }],
    scenes: [{ nodes: [0, 1] }], scene: 0
  };
  if (!withLod) return JSON.stringify(base);
  return JSON.stringify({
    ...base,
    extensionsUsed: ["MSFT_lod"],
    meshes: [...base.meshes, { name: "low", primitives: [primitive, primitive] }],
    nodes: [
      { name: "high", mesh: 0, extensions: { MSFT_lod: { ids: [1] } }, extras: { MSFT_screencoverage: [1, 0.1] } },
      { name: "low", mesh: 1 }
    ],
    scenes: [{ nodes: [0] }]
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("rigid temporal draw identities", () => {
  it("keeps root primitive identities through movement and reordered draws, then retires unseen objects", () => {
    const snapshot = scene()
      .add(primitives.box({ name: "same", position: [0, 0, 0] }).runtime({ id: "a" }))
      .add(primitives.box({ name: "same", position: [5, 0, 0] }).runtime({ id: "b" }))
      .toJSON();
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const entries = createProductionRuntimePrimitiveEntries(snapshot.nodes as readonly AuraPrimitiveNode[]);
    const replacement = createProductionRuntimePrimitiveEntries([snapshot.nodes[0] as AuraPrimitiveNode]);
    const canvas = { width: 64, height: 64 } as HTMLCanvasElement;
    const frame = (selected: readonly ProductionRuntimePrimitiveEntry[]) => collectRenderItems(
      createProductionRuntimeRendererInput(snapshot, canvas, [], selected, 0, registry, new Set(), { color: [0, 0, 0], intensity: 0 }, []).source
    );
    const history = new VelocityHistory();
    try {
      const initial = frame(entries);
      expect(initial).toHaveLength(2);
      expect(initial[0]!.temporalObjectKey).toBeDefined();
      expect(initial[0]!.temporalObjectKey).not.toBe(initial[1]!.temporalObjectKey);
      expect(frame(replacement)[0]!.temporalObjectKey).not.toBe(initial[0]!.temporalObjectKey);
      history.prepare(matrixAt(0), [0, 0], 1);
      initial.forEach((item) => history.prepareItem(item, true));
      history.commit(1);

      registry.require("a").setPosition(2, 0, 0);
      registry.require("b").setPosition(7, 0, 0);
      const moved = frame([...entries].reverse());
      expect(moved[0]!.temporalObjectKey).toBe(initial[1]!.temporalObjectKey);
      expect(moved[1]!.temporalObjectKey).toBe(initial[0]!.temporalObjectKey);
      history.prepare(matrixAt(0), [0, 0], 2);
      expect(previousX(history.prepareItem(moved[0]!, true))).toBe(5);
      expect(previousX(history.prepareItem(moved[1]!, true))).toBe(0);
      history.commit(2);

      history.prepare(matrixAt(0), [0, 0], 3);
      history.prepareItem(moved[0]!, true);
      history.commit(3);
      history.prepare(matrixAt(0), [0, 0], 4);
      // A was absent for a committed frame, so it seeds from its current pose.
      expect(previousX(history.prepareItem(moved[1]!, true))).toBe(2);
    } finally {
      history.reset("explicit-reset");
      registry.dispose();
      disposePrimitiveEntries([...entries, ...replacement]);
    }
  });

  it("retains per-node actor keys across motion and isolates actors sharing a pipeline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(gltfFixture())));
    const actor = await createTypedGLBActor({ asset: { url: "https://asset.invalid/identity.gltf", format: "gltf" }, id: "identity", width: 64, height: 64 });
    try {
      const first = actor.collectRenderItems({ modelMatrix: matrixAt(0) });
      const moved = actor.collectRenderItems({ modelMatrix: matrixAt(2) });
      expect(first).toHaveLength(2);
      expect(first[0]!.geometry).toBe(first[1]!.geometry);
      expect(first[0]!.temporalObjectKey).not.toBe(first[1]!.temporalObjectKey);
      expect(moved.map((item) => item.temporalObjectKey)).toEqual(first.map((item) => item.temporalObjectKey));
      // A second actor sharing the same pipeline and scene nodes must still
      // receive different keys; this exercises the actual actor collector.
      const secondActor = { ...actor, id: "second" } as TypedGLBActor;
      const second = collectTypedGLBActorRenderItems(secondActor, { modelMatrix: matrixAt(0) });
      expect(second[0]!.temporalObjectKey).not.toBe(first[0]!.temporalObjectKey);

      const history = new VelocityHistory();
      history.prepare(matrixAt(0), [0, 0], 1);
      first.forEach((item) => history.prepareItem(item, true));
      history.commit(1);
      history.prepare(matrixAt(0), [0, 0], 2);
      expect(previousX(history.prepareItem(moved[0]!, true))).toBe(first[0]!.modelMatrix?.[12]);
      expect(previousX(history.prepareItem(moved[1]!, true))).toBe(first[1]!.modelMatrix?.[12]);
      history.reset("explicit-reset");
    } finally { actor.dispose(); }
  });

  it("gives crossfading LOD levels and overflow primitives distinct stable identities", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(gltfFixture(true))));
    const actor = await createTypedGLBActor({ asset: { url: "https://asset.invalid/identity-lod.gltf", format: "gltf" }, id: "lod", width: 64, height: 64, lod: false });
    try {
      const lod = getTypedGLBActorLod(actor);
      expect(lod?.levels).toBe(2);
      lod!.setLevel(0);
      const before = actor.collectRenderItems();
      lod!.setLevel(1, 60);
      const first = actor.collectRenderItems();
      const repeated = actor.collectRenderItems({ reuseLodSelection: true });
      expect(before).toHaveLength(1);
      expect(first).toHaveLength(3); // two low primitives and the outgoing high one
      expect(new Set(first.map((item) => item.temporalObjectKey)).size).toBe(3);
      expect(repeated.map((item) => item.temporalObjectKey)).toEqual(first.map((item) => item.temporalObjectKey));
      expect(first.find((item) => item.lodLevel === 0)?.temporalObjectKey).toBe(before[0]!.temporalObjectKey);
    } finally { actor.dispose(); }
  });
});
