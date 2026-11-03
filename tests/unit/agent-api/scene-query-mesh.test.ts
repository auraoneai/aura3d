import { describe, expect, it } from "vitest";
import { raycast, raycastSceneTargetsAll, sceneQueryTargets, sphereCastSceneTargets } from "../../../packages/engine/src/agent-api/SceneQueries";
import { createAuraRuntimeNodeRegistry, createRuntimeNodeHandle, runtimeNodeHandleForSceneNode, setRuntimeQueryRenderItems } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { batched, batchedNodeHandler, BatchedMeshState, batchedStateFor, batchedStateForNode, registerBatchedState } from "../../../packages/engine/src/agent-api/nodes/batched";
import { flattenNodesWithLineWorldMatrices } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { flattenTaggingMountedRoots } from "../../../packages/engine/src/agent-api/compiler/mountedRoots";
import { realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat } from "../../../packages/rendering/src";
import { mergeStatic } from "../../../packages/engine/src/agent-api/nodes/mergeStatic";
import { raycast as publicRaycast, material as publicMaterial } from "../../../packages/engine/src/index";
import { flattenSceneNodesV2 } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem, RenderSource } from "@aura3d/rendering";

const triangle = defineAuraCustomGeometry({
  positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
  uvs: [0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2]
});
const node = (name: string, extra: Partial<AuraPrimitiveNode> = {}): AuraPrimitiveNode => ({
  kind: "primitive", primitive: "custom", name, geometry: triangle, ...extra
});
const ray = { origin: [0.5, 0.5, 5] as const, direction: [0, 0, -2] as const };

describe("exact scene queries", () => {
  it("reports true triangle, barycentric, UV, face, world normal and stable node identity", () => {
    const mesh = node("panel", { runtime: { id: "panel-1" } });
    const [hit] = raycast(ray, { nodes: [mesh], mode: "mesh" });
    expect(hit).toMatchObject({ nodeName: "panel", nodeId: "panel-1", distance: 5, point: [0.5, 0.5, 0], normal: [0, 0, 1], faceIndex: 0 });
    expect(hit!.uv).toEqual([0.25, 0.25]);
    expect(hit!.barycentric).toEqual([0.5, 0.25, 0.25]);
    // This point is inside the box but outside the triangle.
    const outside = { origin: [1.8, 1.8, 5] as const, direction: [0, 0, -1] as const };
    expect(raycast(outside, { nodes: [mesh], mode: "bounds" })).toHaveLength(1);
    expect(raycast(outside, { nodes: [mesh], mode: "mesh" })).toHaveLength(0);
  });

  it("includes origin nodes and composes rotated/scaled parent transforms", () => {
    expect(sceneQueryTargets([node("origin")])).toHaveLength(1);
    const child = node("child", { position: [1, 0, 0] });
    const group = { kind: "group" as const, position: [3, 0, 0] as const, rotation: [0, 0, Math.PI / 2] as const, scale: [2, 1, 1] as const, children: [child] };
    const hits = raycast({ origin: [2.5, 2.5, 5], direction: [0, 0, -1] }, { nodes: [group], mode: "mesh" });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.point[0]).toBeCloseTo(2.5);
    expect(hits[0]!.point[1]).toBeCloseTo(2.5);
    expect(raycast(ray, { nodes: [group], mode: "mesh", recursive: false })).toHaveLength(0);
  });

  it("honors sidedness, draw ranges, near/far, layers and stable ties", () => {
    const front = node("front", { layers: 2 });
    const same = node("same", { layers: 2 });
    const reverse = { origin: [0.5, 0.5, -5] as const, direction: [0, 0, 1] as const };
    expect(raycast(reverse, { nodes: [front], mode: "mesh" })).toHaveLength(0);
    expect(raycast(reverse, { nodes: [{ ...front, material: { doubleSided: true } }], mode: "mesh" })).toHaveLength(1);
    expect(raycast(ray, { nodes: [front], mode: "mesh", layers: 1 })).toHaveLength(0);
    expect(raycast(ray, { nodes: [front], mode: "mesh", far: 4 })).toHaveLength(0);
    expect(raycast(ray, { nodes: [front], mode: "mesh", near: 6 })).toHaveLength(0);
    expect(raycast(ray, { nodes: [front, same], mode: "mesh", layers: 2 }).map((hit) => hit.nodeName)).toEqual(["front", "same"]);
    expect(raycast(ray, { nodes: [front, same], mode: "mesh", layers: 2, firstHitOnly: true })).toHaveLength(1);
    expect(raycast(ray, { nodes: [{ ...front, geometry: { ...triangle, drawRange: { start: 0, count: 0 } } }], mode: "mesh" })).toHaveLength(0);
  });

  it("ignores degenerate triangles and missing model geometry", () => {
    const degenerate = { ...triangle, positions: [0, 0, 0, 1, 1, 0, 2, 2, 0] };
    expect(raycast(ray, { nodes: [node("degenerate", { geometry: degenerate })], mode: "mesh" })).toEqual([]);
    expect(raycast(ray, { nodes: [{ kind: "model", name: "unloaded", asset: {} as never, castShadow: true, receiveShadow: true, visible: true }], mode: "mesh" })).toEqual([]);
  });

  it("returns instance IDs under parent transforms and follows live dense matrices", () => {
    const mesh = node("copies", { instances: [{ position: [0, 0, 0] }, { position: [0, 0, 2] }], runtime: { id: "copies" } });
    const handle = createRuntimeNodeHandle(mesh as never, { id: "copies" });
    expect(raycast(ray, { handles: [handle], mode: "mesh" }).map((hit) => [hit.instanceId, hit.distance])).toEqual([[1, 3], [0, 5]]);
    const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1]);
    handle.setInstanceMatrices(matrix, 1);
    expect(raycast(ray, { handles: [handle], mode: "mesh" }).map((hit) => [hit.instanceId, hit.distance])).toEqual([[0, 4]]);
  });

  it("uses current position edits, morph weights and disposes removed handles", () => {
    const geometry = { ...triangle, morphTargets: [{ name: "raise", positions: [0, 0, 1, 0, 0, 1, 0, 0, 1] }] };
    const mesh = node("dynamic", { geometry, runtime: { id: "dynamic" } });
    const registry = createAuraRuntimeNodeRegistry({ nodes: [mesh] } as AuraSceneSnapshot);
    const handle = registry.require("dynamic");
    handle.setMorphTarget("raise", 1);
    expect(raycast(ray, { handles: [handle], mode: "mesh" })[0]!.distance).toBeCloseTo(4);
    handle.updateAttribute!("position", { array: [10, 0, 0, 12, 0, 0, 10, 2, 0] });
    expect(raycast(ray, { handles: [handle], mode: "mesh" })).toEqual([]);
    expect(handle.bounds().min[0]).toBeCloseTo(10);
    const movedRay = { origin: [10.5, 0.5, 5] as const, direction: [0, 0, -1] as const };
    expect(raycast(movedRay, { handles: [handle], mode: "mesh" })[0]!.distance).toBeCloseTo(4);
    expect(registry.remove("dynamic")).toBe(true);
    expect(raycast(movedRay, { handles: [handle], mode: "mesh" })).toEqual([]);
  });

  it("treats an unset morph target named like an inherited object property as zero", () => {
    const geometry = { ...triangle, morphTargets: [{ name: "toString", positions: [0, 0, 1, 0, 0, 1, 0, 0, 1] }] };
    const mesh = node("reserved-morph", { geometry, runtime: { id: "reserved-morph" } });
    const handle = createRuntimeNodeHandle(mesh as never, { id: "reserved-morph" });
    expect(raycast(ray, { handles: [handle], mode: "mesh" })[0]?.distance).toBe(5);
  });

  it("intersects live render-item morphs and skinning palettes", () => {
    const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
    [[0, 0, 0], [2, 0, 0], [0, 2, 0]].forEach((position, i) => {
      vertices.setAttribute(i, "position", position);
      vertices.setAttribute(i, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
    });
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const model = { kind: "model" as const, name: "actor", asset: {} as never, castShadow: true, receiveShadow: true, visible: true };
    const handle = createRuntimeNodeHandle(model as never, { id: "actor" });
    const palette = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 1]);
    setRuntimeQueryRenderItems(handle, [{ geometry, skinning: { jointCount: 1, matrices: palette }, morphTargets: [{ positions: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] }], morphWeights: [1] }]);
    expect(raycast(ray, { handles: [handle], mode: "mesh" })[0]).toMatchObject({ nodeId: "actor", distance: 2 });
    geometry.dispose();
  });

  it("decodes interleaved normalized positions, UVs and skinning weights as shaders do", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0, type: "int16", normalized: true },
      { semantic: "uv", components: 2, offset: 6, type: "uint16", normalized: true },
      { semantic: "joints", components: 4, offset: 10, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 14, type: "uint8", normalized: true }
    ], 18);
    const vertices = new VertexBuffer(format, 3);
    [[0, 0, 0], [32767, 0, 0], [0, 32767, 0]].forEach((position, i) => {
      vertices.setAttribute(i, "position", position);
      vertices.setAttribute(i, "uv", i === 1 ? [65535, 0] : i === 2 ? [0, 65535] : [0, 0]);
      vertices.setAttribute(i, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(i, "weights", [255, 0, 0, 0]);
    });
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const handle = createRuntimeNodeHandle(node("typed", { runtime: { id: "typed" } }) as never, { id: "typed" });
    const palette = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 1]);
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, skinning: { jointCount: 1, matrices: palette } }]);
      const [hit] = raycast({ origin: [0.25, 0.25, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh" });
      expect(hit?.distance).toBe(3);
      expect(hit?.uv).toEqual([0.25, 0.25]);
      expect(raycast({ origin: [1.2, 1.2, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh" })).toEqual([]);
    } finally {
      geometry.dispose();
    }
  });

  it("uses a primitive's submitted geometry and transforms until an empty frame replaces them", () => {
    const mesh = node("submitted", { runtime: { id: "submitted" } });
    const handle = createRuntimeNodeHandle(mesh as never, { id: "submitted" });
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((position, i) => vertices.setAttribute(i, "position", position));
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const modelMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 2, 1];
    const geometryMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1];
    const movedRay = { origin: [10.25, 0.25, 5] as const, direction: [0, 0, -1] as const };
    const outsideSubmitted = { origin: [11.25, 0.25, 5] as const, direction: [0, 0, -1] as const };
    try {
      // Before the first frame, declarative geometry is still queryable.
      expect(raycast(ray, { handles: [handle], mode: "mesh" })[0]?.distance).toBe(5);
      setRuntimeQueryRenderItems(handle, [{ geometry, modelMatrix, geometryMatrix }]);
      expect(raycast(ray, { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(raycast(movedRay, { handles: [handle], mode: "mesh" })[0]?.distance).toBe(2);
      expect(raycast(outsideSubmitted, { handles: [handle], mode: "mesh" })).toEqual([]);
      // Bounds mode remains the independent handle-bounds approximation.
      expect(raycast(ray, { handles: [handle], mode: "bounds" })).toHaveLength(1);
      expect(raycast(movedRay, { handles: [handle], mode: "bounds" })).toEqual([]);
      geometry.drawRange = { start: 0, count: 0 };
      setRuntimeQueryRenderItems(handle, [{ geometry, modelMatrix, geometryMatrix, drawRange: { start: 0, count: 3 } }]);
      expect(raycast(movedRay, { handles: [handle], mode: "mesh" })).toEqual([]);
      setRuntimeQueryRenderItems(handle, []);
      expect(raycast(ray, { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(raycast(ray, { handles: [handle], mode: "bounds" })).toHaveLength(1);
    } finally {
      geometry.dispose();
    }
  });

  it("uses the renderer's front-face convention for reflected instances", () => {
    const mesh = node("mirrored", { runtime: { id: "mirrored" } });
    const handle = createRuntimeNodeHandle(mesh as never, { id: "mirrored" });
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((position, i) => vertices.setAttribute(i, "position", position));
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const transforms = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
    ]);
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, instanceTransforms: transforms }]);
      const front = (x: number) => ({ origin: [x, 0.25, 5] as const, direction: [0, 0, -1] as const });
      const back = (x: number) => ({ origin: [x, 0.25, -5] as const, direction: [0, 0, 1] as const });
      expect(raycast(front(0.25), { handles: [handle], mode: "mesh" })[0]?.instanceId).toBe(0);
      expect(raycast(front(-0.25), { handles: [handle], mode: "mesh" })[0]?.instanceId).toBe(1);
      expect(raycast(back(-0.25), { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(raycast(front(-0.25), { nodes: [node("raw", { scale: [-1, 1, 1] })], mode: "mesh" })).toHaveLength(1);
    } finally {
      geometry.dispose();
    }
  });

  it("keeps batched slot identity through visibility, remapping and disposal", () => {
    const batch = batched.mesh({ maxInstances: 3 });
    const geometryId = batch.addGeometry(triangle);
    const first = batch.addInstance(geometryId), second = batch.addInstance(geometryId);
    batch.setMatrixAt(second, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 2, 1]);
    expect(batch.state.boundingBox().max[2]).toBe(2);
    expect(raycast(ray, { nodes: [batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([second, first]);
    batch.setVisibleAt(second, false);
    expect(batch.state.boundingBox().max[2]).toBe(0);
    expect(raycast(ray, { nodes: [batch.toJSON()], mode: "mesh" }).map((hit) => hit.batchMemberId)).toEqual([first]);
    batch.deleteInstance(first);
    expect(batch.addInstance(geometryId)).toBe(first);
    expect(raycast(ray, { nodes: [batch.toJSON()], mode: "mesh" })[0]?.batchMemberId).not.toBe(first);
    const serialized = batch.toJSON();
    const handle = createRuntimeNodeHandle(serialized as never, { id: "batch-handle" });
    const capturedTargets = sceneQueryTargets([serialized]);
    const ownedGeometry = batch.state.geometries[geometryId]!;
    batch.dispose();
    expect(batch.state.disposed).toBe(true);
    expect(batch.count).toBe(0);
    expect(batch.state.liveSlots()).toEqual([]);
    expect(batchedStateFor(serialized.batchedId)).toBeUndefined();
    // The renderer's state resolution must not recreate a disposed batch.
    expect(batchedStateForNode(serialized).liveSlots()).toEqual([]);
    expect(batchedStateFor(serialized.batchedId)).toBeUndefined();
    expect(raycast(ray, { nodes: [serialized], mode: "mesh" })).toEqual([]);
    expect(raycast(ray, { nodes: [serialized], mode: "bounds" })).toEqual([]);
    expect(raycast(ray, { handles: [handle], mode: "bounds" })).toEqual([]);
    expect(raycastSceneTargetsAll(capturedTargets, ray)).toEqual([]);
    expect(sphereCastSceneTargets(capturedTargets, ray, 0.5)).toBeUndefined();
    expect(() => batch.setMatrixAt(first, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toThrow(/disposed/i);
    expect(() => batch.addInstance(geometryId)).toThrow(/disposed/i);
    expect(() => ownedGeometry.vertexBuffer.getAttribute(0, "position")).toThrow(/disposed/i);
    expect(() => batch.dispose()).not.toThrow();
  });

  it("does not dispose geometry borrowed by a batch", () => {
    const externalGeometry = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1 });
    batch.addInstance(batch.addGeometry(externalGeometry));
    batch.dispose();
    expect(() => externalGeometry.vertexBuffer.getAttribute(0, "position")).not.toThrow();
    externalGeometry.dispose();
  });

  it("does not retire a newer registry entry when an older state with that ID is disposed", () => {
    const id = "query-registry-replacement";
    const oldState = new BatchedMeshState({ id, capacity: 1 });
    const newState = new BatchedMeshState({ id, capacity: 1 });
    registerBatchedState(oldState);
    registerBatchedState(newState);
    oldState.dispose();
    expect(batchedStateFor(id)).toBe(newState);
    const geometryId = newState.addGeometry(triangle);
    newState.addInstance(geometryId);
    const serialized = { kind: "batched" as const, batchedId: id, maxInstances: 1 };
    expect(raycast(ray, { nodes: [serialized], mode: "mesh" })).toHaveLength(1);
    newState.dispose();
    expect(batchedStateForNode(serialized).disposed).toBe(true);
    expect(raycast(ray, { nodes: [serialized], mode: "mesh" })).toEqual([]);
  });

  it("shares anonymous authored batch state between queries and renderer resolution", () => {
    const authored = { kind: "batched" as const, maxInstances: 1, geometries: [triangle], instances: [{}] };
    expect(raycast(ray, { nodes: [authored], mode: "mesh" })[0]?.batchMemberId).toBe(0);
    const state = batchedStateForNode(authored);
    expect(batchedStateForNode(authored)).toBe(state);
    state.setVisibleAt(0, false);
    expect(raycast(ray, { nodes: [authored], mode: "mesh" })).toEqual([]);
    state.setVisibleAt(0, true);
    state.dispose();
    expect(batchedStateForNode(authored).disposed).toBe(true);
    expect(raycast(ray, { nodes: [authored], mode: "mesh" })).toEqual([]);
  });

  it("shares anonymous batch state with the compiler under a transformed parent", () => {
    const authored = { kind: "batched" as const, maxInstances: 1, geometries: [triangle], instances: [{}] };
    const group = { kind: "group" as const, position: [3, 0, 0] as const, children: [authored] };
    const [flattened] = flattenNodesWithLineWorldMatrices([group]);
    const movedRay = { origin: [3.5, 0.5, 5] as const, direction: [0, 0, -1] as const };
    const items: { modelMatrix?: ArrayLike<number> }[] = [];
    const out = { addItems: (submitted: typeof items) => items.push(...submitted), set: () => undefined } as never;
    const context = { flags: { on: () => true } } as never;
    expect(raycast(movedRay, { nodes: [group], mode: "mesh" })).toHaveLength(1);
    const state = batchedStateForNode(authored);
    batchedNodeHandler.update!(flattened as never, undefined as never, context, out, 0);
    expect(items).toHaveLength(1);
    expect(items[0]!.modelMatrix?.[12]).toBe(3);
    items.length = 0;
    state.setVisibleAt(0, false);
    batchedNodeHandler.update!(flattened as never, undefined as never, context, out, 0);
    expect(items).toHaveLength(0);
    expect(raycast(movedRay, { nodes: [group], mode: "mesh" })).toEqual([]);
    state.setVisibleAt(0, true);
    const hiddenGroup = { ...group, visible: false };
    const [hidden] = flattenNodesWithLineWorldMatrices([hiddenGroup]);
    batchedNodeHandler.update!(hidden as never, undefined as never, context, out, 0);
    expect(items).toHaveLength(0);
    expect(raycast(movedRay, { nodes: [hiddenGroup], mode: "mesh" })).toEqual([]);
    state.dispose();
    batchedNodeHandler.update!(flattened as never, undefined as never, context, out, 0);
    expect(items).toHaveLength(0);
  });

  it("updates real compiler submissions and queries when a runtime batch ancestor changes", async () => {
    const anonymous = { kind: "batched" as const, name: "anonymous-batch", maxInstances: 1, geometries: [triangle], instances: [{}] };
    const named = { kind: "batched" as const, name: "named-batch", runtime: { id: "named-batch" }, position: [4, 0, 0] as const, maxInstances: 1, geometries: [triangle], instances: [{}] };
    const parent = { kind: "group" as const, runtime: { id: "batch-parent" }, position: [3, 0, 0] as const, visible: false, children: [anonymous, named] };
    const snapshot = {
      nodes: [parent], camera: { mode: "orbit", position: [0, 4, 10], target: [0, 0, 0] }, background: "#000000", diagnostics: { enabled: false }
    } as unknown as AuraSceneSnapshot;
    const renderSnapshot = { ...snapshot, nodes: flattenTaggingMountedRoots(snapshot.nodes, flattenNodesWithLineWorldMatrices) };
    const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_PARITY_BATCHING: true, A3D_QR_CORE: false } });
    const registry = createAuraRuntimeNodeRegistry(renderSnapshot, { flags }, snapshot);
    const anonymousHandle = runtimeNodeHandleForSceneNode(registry, anonymous)!;
    const namedHandle = registry.require("named-batch");
    const mount = {
      canvas: { width: 800, height: 600 }, flags, strict: false, quality: { tier: "high" }, renderer: null, assets: null,
      degrade: () => undefined, runtimeNodes: registry,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>()
    } as unknown as MountSceneCompileContext;
    const compiled = await realCompilerImpl.compile(renderSnapshot, mount);
    registry.attachCompiled(compiled);
    const submitted = (source: unknown): readonly RenderItem[] => {
      const renderSource = source as RenderSource;
      return [...(renderSource.collectRenderItems?.() ?? renderSource.renderItems ?? [])];
    };
    const frame = () => submitted(realCompilerImpl.update(compiled, renderSnapshot, registry, 0));
    const rayAt = (x: number) => ({ origin: [x, 0.5, 5] as const, direction: [0, 0, -1] as const });
    try {
      expect(anonymousHandle).toBeDefined();
      expect(submitted(compiled.source)).toHaveLength(0);
      registry.require("batch-parent").setVisible(true);
      expect(frame()).toHaveLength(2);
      expect(raycast(rayAt(3.5), { handles: [anonymousHandle], mode: "mesh" })).toHaveLength(1);
      expect(raycast(rayAt(7.5), { handles: [namedHandle], mode: "mesh" })).toHaveLength(1);

      registry.require("batch-parent").setVisible(false);
      expect(frame()).toHaveLength(0);
      expect(raycast(rayAt(3.5), { handles: [anonymousHandle], mode: "mesh" })).toEqual([]);
      expect(raycast(rayAt(7.5), { handles: [namedHandle], mode: "mesh" })).toEqual([]);

      registry.require("batch-parent").setVisible(true);
      namedHandle.setVisible(false);
      expect(frame()).toHaveLength(1);
      expect(raycast(rayAt(7.5), { handles: [namedHandle], mode: "mesh" })).toEqual([]);
      registry.require("batch-parent").setPosition(6, 0, 0);
      expect(frame()[0]!.modelMatrix?.[12]).toBe(6);
      expect(raycast(rayAt(6.5), { handles: [anonymousHandle], mode: "mesh" })).toHaveLength(1);
      namedHandle.setVisible(true);
      expect(frame().map((item) => item.modelMatrix?.[12])).toEqual([6, 10]);
      expect(raycast(rayAt(10.5), { handles: [namedHandle], mode: "mesh" })).toHaveLength(1);

      expect(registry.remove("batch-parent")).toBe(true);
      expect(frame()).toHaveLength(0);
      expect(raycast(rayAt(6.5), { handles: [anonymousHandle], mode: "mesh" })).toEqual([]);
    } finally {
      compiled.dispose();
      registry.dispose();
      batchedStateForNode(anonymous).dispose();
      batchedStateForNode(named).dispose();
    }
  });

  it("keeps flattened anonymous batch identity and bounds at the live member location", () => {
    const authored = { kind: "batched" as const, maxInstances: 1, geometries: [triangle], instances: [{ position: [4, 0, 0] }] };
    const group = { kind: "group" as const, position: [3, 0, 0] as const, children: [authored] };
    const [flattened] = flattenNodesWithLineWorldMatrices([group]);
    const atMember = { origin: [7.5, 0.5, 5] as const, direction: [0, 0, -1] as const };
    const state = batchedStateForNode(authored);
    try {
      expect(raycast(atMember, { nodes: [flattened!], mode: "mesh" })).toHaveLength(1);
      expect(raycast(atMember, { nodes: [group], mode: "bounds" })).toHaveLength(1);
      state.setVisibleAt(0, false);
      expect(raycast(atMember, { nodes: [flattened!], mode: "mesh" })).toEqual([]);
      expect(raycast(atMember, { nodes: [group], mode: "bounds" })).toEqual([]);
    } finally {
      state.dispose();
    }
  });

  it("agrees with real compiler batch submissions under a rotated and scaled parent", async () => {
    const authored = { kind: "batched" as const, name: "composed-batch", position: [1, 0, 0] as const, maxInstances: 1, geometries: [triangle], instances: [{}] };
    const parent = { kind: "group" as const, runtime: { id: "composed-parent" }, position: [3, 0, 0] as const, rotation: [0, 0, Math.PI / 2] as const, scale: [2, 1, 1] as const, children: [authored] };
    const snapshot = {
      nodes: [parent], camera: { mode: "orbit", position: [0, 4, 10], target: [0, 0, 0] }, background: "#000000", diagnostics: { enabled: false }
    } as unknown as AuraSceneSnapshot;
    const renderSnapshot = { ...snapshot, nodes: flattenTaggingMountedRoots(snapshot.nodes, flattenNodesWithLineWorldMatrices) };
    const flags = resolveQrFlags({ options: { A3D_QR_COMPILER: true, A3D_PARITY_BATCHING: true, A3D_QR_CORE: false } });
    const registry = createAuraRuntimeNodeRegistry(renderSnapshot, { flags }, snapshot);
    const handle = runtimeNodeHandleForSceneNode(registry, authored)!;
    expect(handle).toBeDefined();
    const mount = {
      canvas: { width: 800, height: 600 }, flags, strict: false, quality: { tier: "high" }, renderer: null, assets: null,
      degrade: () => undefined, runtimeNodes: registry,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>()
    } as unknown as MountSceneCompileContext;
    const compiled = await realCompilerImpl.compile(renderSnapshot, mount);
    registry.attachCompiled(compiled);
    const items = (source: unknown): readonly RenderItem[] => {
      const renderSource = source as RenderSource;
      return [...(renderSource.collectRenderItems?.() ?? renderSource.renderItems ?? [])];
    };
    const atSurface = { origin: [2.5, 3, 5] as const, direction: [0, 0, -1] as const };
    try {
      const initial = items(compiled.source);
      expect(initial).toHaveLength(1);
      expect(initial[0]!.modelMatrix?.[12]).toBeCloseTo(3);
      expect(initial[0]!.modelMatrix?.[13]).toBeCloseTo(2);
      expect(publicRaycast(atSurface, { handles: [handle], mode: "mesh" })).toHaveLength(1);
      const updated = items(realCompilerImpl.update(compiled, renderSnapshot, registry, 0));
      expect(updated[0]!.modelMatrix?.[12]).toBeCloseTo(3);
      expect(updated[0]!.modelMatrix?.[13]).toBeCloseTo(2);
    } finally {
      compiled.dispose();
      registry.dispose();
      batchedStateForNode(authored).dispose();
    }
  });

  it("returns world geometric normals with mirrored front-face orientation", () => {
    const hit = raycast({ origin: [-0.25, 0.25, 5], direction: [0, 0, -1] }, {
      nodes: [node("mirrored-normal", { scale: [-2, 1, 3] })], mode: "mesh"
    })[0];
    expect(hit?.normal[0]).toBeCloseTo(0);
    expect(hit?.normal[1]).toBeCloseTo(0);
    expect(hit?.normal[2]).toBeCloseTo(1);
  });

  it("fails closed for malformed, disposed or unsupported render item deformation", () => {
    const handle = createRuntimeNodeHandle(node("invalid", { runtime: { id: "invalid" } }) as never, { id: "invalid" });
    const geometry = Geometry.triangle();
    const testRay = { origin: [0, 0, 5] as const, direction: [0, 0, -1] as const };
    const item = (value: RenderItem) => setRuntimeQueryRenderItems(handle, [value]);
    const hit = () => raycast(testRay, { handles: [handle], mode: "mesh" });
    try {
      item({ geometry, skinning: { jointCount: 1, matrices: new Float32Array(16) } });
      expect(hit()).toEqual([]);
      item({ geometry, morphTargets: [{ positions: [[0, 0, 1]] }], morphWeights: [1] });
      expect(hit()).toEqual([]);
      item({ geometry, morphTargets: [{ positions: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] }], morphWeights: [] });
      expect(hit()).toEqual([]);
      item({ geometry, instanceTransforms: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), instanceCount: 2 });
      expect(hit()).toEqual([]);
      item({ geometry, modelMatrix: [1, 0, 0] });
      expect(hit()).toEqual([]);
      item({ geometry });
      expect(raycast({ origin: [Number.NaN, 0, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh" })).toEqual([]);
      geometry.dispose();
      expect(hit()).toEqual([]);
    } finally {
      geometry.dispose();
    }
  });

  it("does not silently drop mesh attributes in static merging", () => {
    const input = { ...triangle, uv1s: [0, 0, 1, 0, 0, 1], morphTargets: [{ name: "raise", positions: [0, 0, 1, 0, 0, 1, 0, 0, 1] }] };
    const merged = mergeStatic([{ geometry: input, position: [3, 0, 0], scale: [2, 1, 1] }])!;
    expect(Array.from(merged.uv1s as ArrayLike<number>)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(merged.morphTargets![0]!.positions)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("uses the public entry for composed sheared transforms and keeps explicit bounds distinct from mesh hits", () => {
    const child = node("sheared", { rotation: [0, 0, Math.PI / 4] });
    const group = { kind: "group" as const, position: [3, 0, 0] as const, scale: [2, 1, 1] as const, children: [child] };
    const atSurface = { origin: [3, Math.SQRT1_2, 5] as const, direction: [0, 0, -1] as const };
    const direct = publicRaycast(atSurface, { nodes: [group], mode: "mesh" });
    const flattened = publicRaycast(atSurface, { nodes: flattenSceneNodesV2([group]), mode: "mesh" });
    expect(direct).toHaveLength(1);
    expect(flattened).toHaveLength(1);
    expect(flattened[0]!.distance).toBeCloseTo(direct[0]!.distance);
    expect(flattened[0]!.barycentric?.[0]).toBeCloseTo(direct[0]!.barycentric![0]);
    const explicit = { nodeName: "explicit-box", bounds: sceneQueryTargets([node("box")])[0]!.bounds };
    expect(publicRaycast(ray, { targets: [explicit], mode: "bounds" })[0]?.nodeName).toBe("explicit-box");
    expect(publicRaycast(ray, { targets: [explicit], mode: "mesh" })).toEqual([]);
    expect(publicRaycast(ray, { targets: [explicit] })).toEqual(publicRaycast(ray, { targets: [explicit], mode: "bounds" }));
  });

  it("preserves batch lifetime identity and refreshes captured bounds after movement and visibility changes", () => {
    const batch = batched.mesh({ maxInstances: 2 });
    const geometryId = batch.addGeometry(triangle);
    const slot = batch.addInstance(geometryId);
    const saved = sceneQueryTargets([batch.toJSON()]);
    const initial = publicRaycast(ray, { nodes: [batch.toJSON()], mode: "mesh" })[0]!.batchMemberId;
    batch.setMatrixAt(slot, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1]);
    const moved = { origin: [4.5, 0.5, 5] as const, direction: [0, 0, -1] as const };
    expect(raycastSceneTargetsAll(saved, ray)).toEqual([]);
    expect(raycastSceneTargetsAll(saved, moved)).toHaveLength(1);
    expect(publicRaycast(moved, { nodes: [batch.toJSON()], mode: "mesh" })[0]?.batchMemberId).toBe(initial);
    batch.setVisibleAt(slot, false);
    expect(raycastSceneTargetsAll(saved, moved)).toEqual([]);
    batch.setVisibleAt(slot, true);
    batch.deleteInstance(slot);
    expect(batch.addInstance(geometryId)).toBe(slot);
    expect(publicRaycast(ray, { nodes: [batch.toJSON()], mode: "mesh" })[0]?.batchMemberId).not.toBe(initial);
    batch.dispose();
    expect(raycastSceneTargetsAll(saved, ray)).toEqual([]);
  });

  it("uses a separate normalized instance-rate UV stream and item layers on the public hit path", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0, bufferSlot: 0 },
      { semantic: "uv", components: 2, offset: 0, type: "uint16", normalized: true, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 4, stepMode: "instance" }]);
    const positions = new VertexBuffer(format, 3);
    const uvs = new VertexBuffer(format, 2, 1);
    [[0, 0, 0], [2, 0, 0], [0, 2, 0]].forEach((p, i) => positions.setAttribute(i, "position", p));
    uvs.setAttribute(0, "uv", [0, 65535]);
    uvs.setAttribute(1, "uv", [65535, 0]);
    const geometry = new Geometry(positions, new IndexBuffer([0, 1, 2], 3), "triangles", undefined, [uvs]);
    const handle = createRuntimeNodeHandle(node("stream", { runtime: { id: "stream" }, layers: 1 }) as never, { id: "stream" });
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, instanceCount: 2, layerMask: 4 }]);
      const hits = publicRaycast(ray, { handles: [handle], mode: "mesh", layers: 4 });
      expect(hits.map((hit) => [hit.instanceId, hit.uv])).toEqual([[0, [0, 1]], [1, [1, 0]]]);
      expect(publicRaycast(ray, { handles: [handle], mode: "mesh", layers: 1 })).toEqual([]);
    } finally {
      geometry.dispose();
    }
  });

  it("reports inverse-transpose geometric normals for reflected nonuniform transforms", () => {
    const slope = defineAuraCustomGeometry({ positions: [0, 0, 0, 1, 0, 1, 0, 1, 0], indices: [0, 1, 2] });
    const hit = publicRaycast({ origin: [-0.5, 0.25, 5], direction: [0, 0, -1] }, {
      nodes: [node("slope", { geometry: slope, scale: [-2, 1, 3] })], mode: "mesh"
    })[0];
    const length = Math.hypot(0.5, 1 / 3);
    expect(hit?.normal[0]).toBeCloseTo(0.5 / length);
    expect(hit?.normal[1]).toBeCloseTo(0);
    expect(hit?.normal[2]).toBeCloseTo((1 / 3) / length);
  });

  it("fails closed for custom vertex programs and malformed instance, morph and skin inputs while retaining bounds", () => {
    const custom = publicMaterial.custom({
      glsl: { vertex: "void main() { gl_Position = vec4(position + vec3(0.0, 0.0, 2.0), 1.0); }", fragment: "out vec4 color; void main() { color = vec4(1.0); }" }
    });
    const mesh = node("custom", { material: custom });
    expect(publicRaycast(ray, { nodes: [mesh], mode: "bounds" })).toHaveLength(1);
    expect(publicRaycast(ray, { nodes: [mesh], mode: "mesh" })).toEqual([]);

    const handle = createRuntimeNodeHandle(node("invalid-extra", { runtime: { id: "invalid-extra" } }) as never, { id: "invalid-extra" });
    const geometry = Geometry.triangle();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const probe = { origin: [0, 0, 5] as const, direction: [0, 0, -1] as const };
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, instanceTransforms: identity, instanceCount: 0 }]);
      expect(publicRaycast(probe, { handles: [handle], mode: "mesh" })).toEqual([]);
      setRuntimeQueryRenderItems(handle, [{ geometry, morphTargets: [{ positions: [[0, 0, Number.NaN], [0, 0, 0], [0, 0, 0]] }], morphWeights: [1] }]);
      expect(publicRaycast(probe, { handles: [handle], mode: "mesh" })).toEqual([]);
      setRuntimeQueryRenderItems(handle, [{ geometry, skinning: { jointCount: 1, matrices: identity, extraInfluences: true } }]);
      expect(publicRaycast(probe, { handles: [handle], mode: "mesh" })).toEqual([]);
      expect(publicRaycast({ origin: [Number.NaN, 0, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "bounds" })).toEqual([]);
    } finally {
      geometry.dispose();
    }
  });

  it("reports arbitrary vertex-program exclusions with a stable code (skip, callback, error)", () => {
    const custom = publicMaterial.custom({
      glsl: { vertex: "void main() { gl_Position = vec4(position + vec3(0.0, 0.0, 2.0), 1.0); }", fragment: "out vec4 color; void main() { color = vec4(1.0); }" }
    });
    const excluded = node("displaced", { material: custom, runtime: { id: "displaced" } });
    const plain = node("plain", { position: [0, 0, -1] });
    const seen: unknown[] = [];
    const hits = publicRaycast(ray, { nodes: [excluded, plain], mode: "mesh", unsupported: (exclusion) => seen.push(exclusion) });
    expect(hits.map((hit) => hit.nodeName)).toEqual(["plain"]);
    expect(seen).toEqual([{ code: "SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED", nodeName: "displaced", nodeId: "displaced",
      reason: "authored custom program has no submitted position certificate" }]);
    expect(publicRaycast(ray, { nodes: [excluded, plain], mode: "mesh" }).map((hit) => hit.nodeName)).toEqual(["plain"]);
    expect(() => publicRaycast(ray, { nodes: [plain, excluded], mode: "mesh", unsupported: "error" }))
      .toThrowError(expect.objectContaining({ name: "SceneQueryError", code: "SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED" }));
    // Bounds mode never consults the vertex program.
    expect(publicRaycast(ray, { nodes: [excluded], mode: "bounds", unsupported: "error" })).toHaveLength(1);

    const handle = createRuntimeNodeHandle(node("wind", { runtime: { id: "wind" } }) as never, { id: "wind" });
    const geometry = Geometry.triangle();
    try {
      setRuntimeQueryRenderItems(handle, [{ geometry, label: "prd10.wind:grass" }]);
      expect(() => publicRaycast({ origin: [0, 0, 5], direction: [0, 0, -1] }, { handles: [handle], mode: "mesh", unsupported: "error" }))
        .toThrow(/SCENE_QUERY_VERTEX_PROGRAM_UNSUPPORTED: wind .*displaces positions/);
      expect(() => publicRaycast(ray, { nodes: [plain], mode: "mesh", unsupported: "strict" as never })).toThrow(/SCENE_QUERY_INVALID_OPTION/);
    } finally {
      geometry.dispose();
    }
  });

  it("keeps mirrored non-indexed UV1, custom streams and transformed morph deltas aligned", () => {
    const spec = {
      ...triangle, indices: [],
      uv1s: [0, 0, 1, 0, 0, 1],
      attributes: { heat: { itemSize: 1 as const, data: new Uint8Array([9, 1, 9, 2, 9, 3]), stride: 2, offset: 1 } },
      morphTargets: [{ name: "shift", positions: [1, 0, 0, 0, 1, 0, 0, 0, 1] }]
    };
    const merged = mergeStatic([{ geometry: spec, scale: [-2, 3, 4] }])!;
    expect(Array.from(merged.indices)).toEqual([0, 2, 1]);
    expect(Array.from(merged.uv1s as ArrayLike<number>)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(merged.attributes!.heat!.data)).toEqual([1, 2, 3]);
    expect(Array.from(merged.morphTargets![0]!.positions)).toEqual([-2, 0, 0, 0, 3, 0, 0, 0, 4]);
    expect(spec.attributes.heat.data).toEqual(new Uint8Array([9, 1, 9, 2, 9, 3]));
  });
});
