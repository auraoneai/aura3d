/**
 * Parity-L5 SG-01/SG-02 — `instances.mesh` (three.js InstancedMesh) and
 * `batched.mesh` (BatchedMesh) over the dense retained instance store:
 * per-instance transforms/colours, count/needsUpdate semantics, bounding
 * sphere, capacity rules, visibility/deletion, the L5-01 direct write seam
 * (`setInstanceTransforms` on batched nodes), and the real `batched` node
 * handler (instanced fallback vs packed multi-draw route).
 */

import { describe, expect, it } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

import { instancedMesh, AuraInstancedMeshHandle } from "../../../packages/engine/src/agent-api/nodes/instancedMesh";
import {
  batched,
  batchedNodeHandler,
  batchedStateFor,
  batchedStateForNode,
  resolveBatchedMode,
  AuraBatchedMeshHandle
} from "../../../packages/engine/src/agent-api/nodes/batched";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import {
  directBatchedSetInstanceTransforms,
  instanceTransformsExtension
} from "../../../packages/engine/src/agent-api/nodes/game/instanceTransforms";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { AuraBatchedNode } from "../../../packages/engine/src/agent-api/nodes/types";
import "../../../packages/engine/src/agent-api/nodes/batched";

/** Unit quad centred on the origin (bounds [-0.5..0.5]²) — keeps bounding-sphere math exact. */
function boxGeometry(dye = 0): Geometry {
  const vb = new VertexBuffer(VertexFormat.P3N3, 4);
  for (let i = 0; i < 4; i += 1) {
    vb.setAttribute(i, "position", [(i % 2) - 0.5, Math.floor(i / 2) - 0.5 + dye, 0]);
    vb.setAttribute(i, "normal", [0, 0, 1]);
  }
  return new Geometry(vb, new IndexBuffer([0, 1, 2, 0, 2, 3], 6));
}

function translate(x: number, y = 0, z = 0): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function compileCtx(options: "all" | "none" | (string & {}) = "all") {
  return {
    flags: resolveQrFlags({ options }),
    renderer: undefined,
    assets: undefined,
    quality: undefined,
    strict: false,
    degrade: () => undefined
  } as never;
}

function collectOut() {
  const items: unknown[] = [];
  const features = new Set<string>();
  const fields = new Map<string, unknown>();
  return {
    items,
    features,
    fields,
    addItems(list: readonly unknown[]) { items.push(...list); },
    addLights() { /* none */ },
    set(key: string, value: unknown) { fields.set(key, value); },
    feature(f: string) { features.add(f); }
  };
}

function appWith(nodes: unknown[]) {
  return { scene: { nodes }, diagnostics: () => ({ qrFlags: ["A3D_QR_GAME"] }) } as never;
}

describe("instances.mesh — three.js InstancedMesh parity (SG-01/L5-02)", () => {
  it("factory allocates `count` live slots over one geometry", () => {
    const mesh = instancedMesh(boxGeometry(), undefined, 4);
    expect(mesh).toBeInstanceOf(AuraInstancedMeshHandle);
    expect(mesh.count).toBe(4);
    expect(mesh.capacity).toBe(4);
    expect(mesh.geometryId).toBe(0);
  });

  it("is exposed through the `instances` namespace", () => {
    const mesh = instances.mesh(boxGeometry(), undefined, 2);
    expect(mesh).toBeInstanceOf(AuraInstancedMeshHandle);
    expect(mesh.count).toBe(2);
  });

  it("setMatrixAt/getMatrixAt round-trip (identity default, then translated)", () => {
    const mesh = instancedMesh(boxGeometry(), undefined, 2);
    const identity = mesh.getMatrixAt(0) as Float32Array;
    expect(identity[12]).toBe(0);
    mesh.setMatrixAt(0, translate(3, -2, 1));
    const out = mesh.getMatrixAt(0) as Float32Array;
    expect([out[12], out[13], out[14]]).toEqual([3, -2, 1]);
    // Three.js `{elements}` matrix objects are accepted too.
    mesh.setMatrixAt(1, { elements: translate(7).slice() });
    expect((mesh.getMatrixAt(1) as Float32Array)[12]).toBe(7);
  });

  it("setColorAt/getColorAt accepts AuraColor strings and rgba arrays", () => {
    const mesh = instancedMesh(boxGeometry(), undefined, 2);
    mesh.setColorAt(0, "#ff0000");
    expect(mesh.getColorAt(0)).toEqual([1, 0, 0, 1]);
    mesh.setColorAt(1, [0.25, 0.5, 0.75, 1]);
    const c = mesh.getColorAt(1);
    expect(c[0]).toBeCloseTo(0.25, 5);
    expect(c[2]).toBeCloseTo(0.75, 5);
  });

  it("count clamps the draw bound; out-of-range writes throw", () => {
    const mesh = instancedMesh(boxGeometry(), undefined, 3);
    mesh.count = 2;
    expect(mesh.count).toBe(2);
    expect(() => { mesh.count = 4; }).toThrow(/capacity/);
    expect(() => mesh.setMatrixAt(3, translate(0))).toThrow(/capacity/);
  });

  it("needsUpdate bumps the store version (per-frame upload dirty flag)", () => {
    const mesh = instancedMesh(boxGeometry(), undefined, 1);
    const state = batchedStateFor(mesh.toJSON().batchedId)!;
    const v0 = state.version;
    mesh.needsUpdate = true;
    expect(state.version).toBe(v0 + 1);
    mesh.setMatrixAt(0, translate(1));
    expect(state.version).toBe(v0 + 2);
  });

  it("computeBoundingSphere unions geometry bounds across live instances", () => {
    const mesh = instancedMesh(boxGeometry(), undefined, 2);
    mesh.setMatrixAt(0, translate(-5));
    mesh.setMatrixAt(1, translate(5));
    const sphere = mesh.computeBoundingSphere();
    // Union box ≈ [-5.5..5.5] on x — centre on origin, radius ≥ 5.
    expect(Math.abs(sphere.center[0])).toBeLessThan(0.01);
    expect(sphere.radius).toBeGreaterThan(5);
    expect(mesh.boundingSphere.radius).toBeCloseTo(sphere.radius, 5);
  });
});

describe("batched.mesh — three.js BatchedMesh parity (SG-02/L5-04)", () => {
  it("addGeometry returns stable ids; capacity rules enforced", () => {
    const mesh = batched.mesh({ maxInstances: 2, maxVertices: 100, maxIndices: 100 });
    expect(mesh).toBeInstanceOf(AuraBatchedMeshHandle);
    const g0 = mesh.addGeometry(boxGeometry());
    const g1 = mesh.addGeometry(boxGeometry(1));
    expect([g0, g1]).toEqual([0, 1]);
    const i0 = mesh.addInstance(g0);
    const i1 = mesh.addInstance(g1);
    expect([i0, i1]).toEqual([0, 1]);
    expect(() => mesh.addInstance(g0)).toThrow(/maxInstances/);
    expect(() => mesh.addInstance(9)).toThrow(/geometryId/);
  });

  it("maxVertices / maxIndices reject overflow", () => {
    const mesh = batched.mesh({ maxInstances: 4, maxVertices: 4, maxIndices: 6 });
    mesh.addGeometry(boxGeometry());
    expect(() => mesh.addGeometry(boxGeometry())).toThrow(/maxVertices/);
    const mesh2 = batched.mesh({ maxInstances: 4, maxIndices: 6 });
    mesh2.addGeometry(boxGeometry());
    expect(() => mesh2.addGeometry(boxGeometry())).toThrow(/maxIndices/);
  });

  it("deleteInstance frees the slot; addInstance reuses it", () => {
    const mesh = batched.mesh({ maxInstances: 2 });
    const g = mesh.addGeometry(boxGeometry());
    const a = mesh.addInstance(g);
    mesh.addInstance(g);
    mesh.deleteInstance(a);
    expect(mesh.count).toBe(1);
    const reuse = mesh.addInstance(g);
    expect(reuse).toBe(a);
    expect(mesh.count).toBe(2);
  });

  it("setVisibleAt hides live slots; visibility reads back", () => {
    const mesh = batched.mesh({ maxInstances: 2 });
    const g = mesh.addGeometry(boxGeometry());
    const i = mesh.addInstance(g);
    const state = batchedStateFor(mesh.toJSON().batchedId)!;
    mesh.setVisibleAt(i, false);
    expect(state.isVisible(i)).toBe(false);
    expect(state.liveSlots()).toHaveLength(0);
    mesh.setVisibleAt(i, true);
    expect(state.liveSlots()).toEqual([i]);
  });

  it("per-instance matrix/colour live in the flat store the GPU uploads", () => {
    const mesh = batched.mesh({ maxInstances: 2 });
    const g = mesh.addGeometry(boxGeometry());
    const i = mesh.addInstance(g);
    mesh.setMatrixAt(i, translate(4, 5, 6)).setColorAt(i, "#00ff00");
    const state = batchedStateForNode(mesh.toJSON());
    expect([state.matrices[12], state.matrices[13], state.matrices[14]]).toEqual([4, 5, 6]);
    expect([state.colors[0], state.colors[1], state.colors[2], state.colors[3]]).toEqual([0, 1, 0, 1]);
  });
});

describe("L5-01 direct instance-buffer write (setInstanceTransforms)", () => {
  it("instanceTransformsExtension now applies to batched nodes too", () => {
    expect(instanceTransformsExtension.appliesTo).toContain("batched");
    expect(instanceTransformsExtension.appliesTo).toContain("primitive");
  });

  it("writes dense matrices/colours straight into the retained buffers — no spec decomposition", () => {
    const mesh = batched.mesh({ maxInstances: 3 });
    const g = mesh.addGeometry(boxGeometry());
    mesh.addInstance(g); mesh.addInstance(g); mesh.addInstance(g);
    const node = mesh.toJSON();
    const handle = { id: node.batchedId } as never;
    const matrices = new Float32Array(48);
    matrices.set(translate(1, 2, 3), 0);
    matrices.set(translate(-1, -2, -3), 16);
    directBatchedSetInstanceTransforms(handle, appWith([node]), matrices, 2, new Float32Array([1, 0, 0, 0, 1, 0]));
    const state = batchedStateForNode(node);
    // Verbatim column-major copy — a matrix→spec round trip could never
    // preserve a shear term; the flat buffers carry it through untouched.
    matrices[1] = 0.5;
    directBatchedSetInstanceTransforms(handle, appWith([node]), matrices, 2);
    expect(state.matrices[1]).toBe(0.5);
    expect([state.matrices[12], state.matrices[13], state.matrices[14]]).toEqual([1, 2, 3]);
  });

  it("count < capacity hides trailing slots (instanced) or frees them (batched)", () => {
    const inst = instancedMesh(boxGeometry(), undefined, 3);
    const instNode = inst.toJSON();
    const instHandle = { id: instNode.batchedId } as never;
    directBatchedSetInstanceTransforms(instHandle, appWith([instNode]), translate(0), 1);
    const instState = batchedStateForNode(instNode);
    expect(instState.isAlive(2)).toBe(true);          // slot retained
    expect(instState.isVisible(2)).toBe(false);       // but hidden
    expect(instState.liveSlots()).toEqual([0]);

    const bat = batched.mesh({ maxInstances: 3 });
    const g = bat.addGeometry(boxGeometry());
    bat.addInstance(g); bat.addInstance(g); bat.addInstance(g);
    const batNode = bat.toJSON();
    directBatchedSetInstanceTransforms({ id: batNode.batchedId } as never, appWith([batNode]), new Float32Array(translate(0)), 1);
    const batState = batchedStateForNode(batNode);
    expect(batState.isAlive(2)).toBe(false);          // pool slot freed
    expect(batState.count).toBe(1);
  });

  it("capacity and buffer-length validation mirror the stub path", () => {
    const mesh = batched.mesh({ maxInstances: 2 });
    const g = mesh.addGeometry(boxGeometry());
    mesh.addInstance(g); mesh.addInstance(g);
    const node = mesh.toJSON();
    const handle = { id: node.batchedId } as never;
    expect(() => directBatchedSetInstanceTransforms(handle, appWith([node]), new Float32Array(48), 3)).toThrow(/INSTANCE_CAPACITY_EXCEEDED/);
    expect(() => directBatchedSetInstanceTransforms(handle, appWith([node]), new Float32Array(8), 1)).toThrow(/matrices\.length/);
    expect(() => directBatchedSetInstanceTransforms(handle, appWith([node]), new Float32Array(16), 1, new Float32Array(1))).toThrow(/colors\.length/);
  });

  it("throws INSTANCE_NODE_REQUIRED for non-batched nodes", () => {
    const plain = { kind: "primitive", primitive: "box", runtime: { id: "p" } };
    expect(() =>
      directBatchedSetInstanceTransforms({ id: "p" } as never, appWith([plain]), new Float32Array(16), 1)
    ).toThrow(/INSTANCE_NODE_REQUIRED/);
  });
});

describe("batchedNodeHandler — compiled route selection (L5-03)", () => {
  function authoredNode(over: Partial<AuraBatchedNode> = {}): AuraBatchedNode {
    const mesh = batched.mesh({ maxInstances: 4 });
    const g = mesh.addGeometry(boxGeometry());
    mesh.addGeometry(boxGeometry(1));
    mesh.addInstance(g);
    mesh.addInstance(1);
    return { ...mesh.toJSON(), ...over };
  }

  it("generated-programs on → packed multi-draw route with marker items", () => {
    const node = authoredNode();
    const out = collectOut();
    batchedNodeHandler.compile(node as never, compileCtx("parity.batching,tiers.batching,core"), out as never);
    const report = out.fields.get("parityBatched") as { mode: string; draws: number; instances: number };
    expect(report.mode).toBe("multi-draw");
    expect(report.instances).toBe(2);
    // One item per live instance; each carries the shared draw-data texture.
    expect(out.items).toHaveLength(2);
    const markers = out.items.map((i) => (i as { multiDraw?: { mode: string; drawIndex: number } }).multiDraw);
    expect(markers.map((m) => m?.mode)).toEqual(["multi-draw", "multi-draw"]);
    expect(markers.map((m) => m?.drawIndex)).toEqual([0, 1]);
  });

  it("generated-programs off → honest instanced fallback (one item per geometry bucket)", () => {
    const node = authoredNode();
    const out = collectOut();
    // Lane flag on, generated-program core off — the honest instanced route.
    batchedNodeHandler.compile(node as never, compileCtx("parity.batching,-core"), out as never);
    const report = out.fields.get("parityBatched") as { mode: string; fallbackReason?: string };
    expect(report.mode).toBe("instanced");
    expect(report.fallbackReason).toBe("generated-programs-off");
    expect(out.features.has("instancing")).toBe(true);
    // Two geometry buckets → two instanced items carrying dense transforms.
    expect(out.items).toHaveLength(2);
    for (const item of out.items) {
      const it = item as { instanceTransforms?: Float32Array; instanceColors?: Float32Array };
      expect(it.instanceTransforms).toBeInstanceOf(Float32Array);
      expect(it.instanceColors).toBeInstanceOf(Float32Array);
    }
  });

  it("resolveBatchedMode honours the explicit mode override", () => {
    const mesh = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    mesh.addGeometry(boxGeometry());
    mesh.addGeometry(boxGeometry(1));
    const node = mesh.toJSON();
    const state = batchedStateForNode(node);
    expect(resolveBatchedMode(state, node, compileCtx("parity.batching,tiers.batching,core")).mode).toBe("loop");
    expect(resolveBatchedMode(state, node, compileCtx("none")).mode).toBe("instanced");
  });

  it("without tiers.batching the packed route is never chosen (its marker items would draw nothing)", () => {
    const mesh = batched.mesh({ maxInstances: 2 });
    mesh.addGeometry(boxGeometry());
    mesh.addGeometry(boxGeometry(1));
    const node = mesh.toJSON();
    const state = batchedStateForNode(node);
    const resolved = resolveBatchedMode(state, node, compileCtx("parity.batching,core"));
    expect(resolved.mode).toBe("instanced");
    expect(resolved.fallbackReason).toBe("tiers-batching-off");
    expect(resolveBatchedMode(state, node, compileCtx("parity.batching,tiers.batching,core")).mode).toBe("multi-draw");
  });

  it("authored (non-builder) batched nodes materialize state from declarative fields", () => {
    const node: AuraBatchedNode = {
      kind: "batched",
      batchedId: "authored-b1",
      maxInstances: 4,
      geometries: ["box"],
      instances: [{ position: [2, 0, 0] }],
      instanceColors: ["#ff0000"]
    };
    const state = batchedStateForNode(node);
    expect(state.count).toBe(1);
    expect((state.getMatrixAt(0) as Float32Array)[12]).toBe(2);
    expect(state.getColorAt(0)).toEqual([1, 0, 0, 1]);
  });
});
