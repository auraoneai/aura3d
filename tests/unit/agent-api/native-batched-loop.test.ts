import { describe, expect, it } from "vitest";
import { Geometry, PackedLoopProducerState, UnlitMaterial, packedLoopMemberFor, packedLoopProducerMemberCurrent, registerPackedLoopProducerSnapshot, rememberPackedLoopMember, transferPackedLoopMember } from "../../../packages/rendering/src";
import { batched, batchedRuntimeNodeWorldReader, createBatchedLoopItems } from "../../../packages/engine/src/agent-api/nodes/batched";
import { batchedStateForNode } from "../../../packages/engine/src/agent-api/nodes/batchedState";
import { createAuraRuntimeNodeRegistry, runtimeNodeQueryState } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { PerspectiveCamera } from "@aura3d/scene";
import { collectRenderItems } from "../../../packages/rendering/src/Renderer";
import { hasCombinedDrawIntent } from "../../../packages/rendering/src/batching/BatchMembers";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const parentWorld = [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 10, 20, 30, 1];
const memberLocal = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 2, 0, 0, 1];

describe("staged batched loop member snapshots", () => {
  it("copies per-member world placement, bounds, color, source range and stable slot identity", () => {
    const triangle = Geometry.triangle();
    const line = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    const batch = batched.mesh({ maxInstances: 3, multiDraw: "loop" });
    try {
      triangle.drawRange = { start: 1, count: Infinity };
      line.drawRange = { start: 1, count: 0 };
      const triangles = batch.addGeometry(triangle), lines = batch.addGeometry(line);
      const first = batch.addInstance(triangles), hidden = batch.addInstance(triangles), last = batch.addInstance(lines);
      batch.setMatrixAt(first, memberLocal);
      batch.setColorAt(first, [1.25, -0.5, 2, 1]);
      batch.setVisibleAt(hidden, false);
      const state = batchedStateForNode(batch.toJSON());
      const userData = { selected: false };
      const captured = state.captureLoopMembers(parentWorld, "runtime-node", {
        renderOrder: 7, frustumCulled: false, layers: 5, userData, castShadow: false
      });

      expect(captured.map((member) => member.batchMemberId)).toEqual([first, last]);
      expect(captured.map((member) => member.drawIndex)).toEqual([0, 1]);
      expect(captured.map((member) => member.geometryId)).toEqual([triangles, lines]);
      expect(captured.every((member) => member.batchId === state.id && member.nodeId === "runtime-node")).toBe(true);
      expect(captured.every((member) => member.stateVersion === state.version)).toBe(true);
      expect(captured.every((member) => member.renderOrder === 7 && member.frustumCulled === false && member.layerMask === 5 && member.castShadow === false)).toBe(true);
      expect(captured[0]!.userData).toBe(userData);
      userData.selected = true;
      expect(captured[1]!.userData?.selected).toBe(true);
      expect(captured[0]!.sourceGeometry).toBe(triangle);
      expect(captured[0]!.sourceRange).toEqual({ start: 1, count: 2 });
      expect(captured[0]!.sourceDrawRange).toEqual({ start: 1, count: Infinity });
      expect(captured[1]!.sourceRange).toEqual({ start: 1, count: 0 });
      expect(captured[0]!.localMatrix).toEqual(memberLocal);
      expect(captured[0]!.modelMatrix).toEqual([0, 2, 0, 0, -3, 0, 0, 0, 0, 0, -4, 0, 10, 24, 30, 1]);
      expect(captured[0]!.sourceBounds).toEqual({ min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] });
      expect(captured[0]!.worldBounds).toEqual({ min: [8.5, 23, 30], max: [11.5, 25, 30] });
      expect(captured[0]!.color).toEqual([1.25, -0.5, 2, 1]);
      expect(captured[0]!.streams[0]).toEqual({ slot: 0, buffer: triangle.vertexBuffer, revision: triangle.vertexBuffer.revision });
      expect(captured[0]!.indexBuffer).toBe(triangle.indexBuffer);
      expect(captured[0]!.indexRevision).toBe(triangle.indexBuffer!.revision);
      expect(captured[1]!.indexBuffer).toBeNull();

      // The live handle and borrowed geometry can advance after capture. Old
      // snapshots keep their values and revisions so later consumers can
      // detect the mismatch instead of silently drawing a stale pool slice.
      batch.setMatrixAt(first, identity);
      batch.setColorAt(first, [1, 0, 0, 1]);
      triangle.vertexBuffer.setAttribute(0, "position", [-2, -0.5, 0]);
      triangle.indexBuffer!.setIndices(0, [2]);
      triangle.refreshBounds();
      triangle.drawRange = { start: 0, count: 3 };
      expect(captured[0]!.modelMatrix[13]).toBe(24);
      expect(captured[0]!.color).toEqual([1.25, -0.5, 2, 1]);
      expect(captured[0]!.sourceBounds.min[0]).toBe(-0.5);
      expect(captured[0]!.sourceRange).toEqual({ start: 1, count: 2 });
      expect(captured[0]!.sourceDrawRange).toEqual({ start: 1, count: Infinity });
      expect(captured[0]!.stateVersion).not.toBe(state.version);
      expect(captured[0]!.streams[0]!.revision).not.toBe(triangle.vertexBuffer.revision);
      expect(captured[0]!.indexRevision).not.toBe(triangle.indexBuffer!.revision);
      expect(Object.isFrozen(captured[0]!.modelMatrix)).toBe(true);
      expect(Object.isFrozen(captured[0]!.sourceBounds.min)).toBe(true);

      batch.deleteInstance(first);
      expect(batch.addInstance(triangles)).toBe(first);
      const next = state.captureLoopMembers(parentWorld);
      expect(next.map((member) => member.batchMemberId)).toEqual([first, last]);
      expect(next.map((member) => member.drawIndex)).toEqual([0, 1]);
      expect(next[0]!.sourceRange).toEqual({ start: 0, count: 3 });
    } finally { batch.dispose(); triangle.dispose(); line.dispose(); }
  });

  it("rejects malformed source ranges instead of creating a misleading packed slice", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle);
      batch.addInstance(id);
      triangle.drawRange = { start: -1, count: 1 };
      expect(() => batchedStateForNode(batch.toJSON()).captureLoopMembers(identity)).toThrow(/BATCH_LOOP_DRAW_RANGE_INVALID/);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("rejects nonfinite color and matrices including float32 composition overflow", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle), slot = batch.addInstance(id);
      const state = batchedStateForNode(batch.toJSON());
      batch.setColorAt(slot, [NaN, 0, 0, 1]);
      expect(() => state.captureLoopMembers(identity)).toThrow(/BATCH_LOOP_COLOR_NONFINITE/);
      batch.setColorAt(slot, [1, 1, 1, 1]);
      const badNode = [...identity]; badNode[0] = Infinity;
      expect(() => state.captureLoopMembers(badNode)).toThrow(/BATCH_LOOP_TRANSFORM_NONFINITE/);
      const local = [...identity]; local[0] = 2;
      batch.setMatrixAt(slot, local);
      const largeNode = [...identity]; largeNode[0] = 3e38;
      expect(() => state.captureLoopMembers(largeNode)).toThrow(/BATCH_LOOP_TRANSFORM_NONFINITE/);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("does not publish a mixture of members if batch state changes during capture", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle), slot = batch.addInstance(id);
      const getVertexBuffer = triangle.getVertexBuffer.bind(triangle);
      triangle.getVertexBuffer = (stream) => {
        batch.setVisibleAt(slot, false);
        return getVertexBuffer(stream);
      };
      expect(() => batchedStateForNode(batch.toJSON()).captureLoopMembers(identity)).toThrow(/BATCH_LOOP_STATE_CHANGED/);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("detects direct dense-array writes during capture even without a version change", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle), slot = batch.addInstance(id);
      const state = batchedStateForNode(batch.toJSON());
      const version = state.version;
      const getVertexBuffer = triangle.getVertexBuffer.bind(triangle);
      triangle.getVertexBuffer = (stream) => {
        state.matrices[slot * 16 + 12] = 9;
        return getVertexBuffer(stream);
      };
      expect(() => state.captureLoopMembers(identity)).toThrow(/BATCH_LOOP_STATE_CHANGED/);
      expect(state.version).toBe(version);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("does not combine old bounds with changed geometry during capture", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle);
      batch.addInstance(id);
      const getVertexBuffer = triangle.getVertexBuffer.bind(triangle);
      let reads = 0;
      triangle.getVertexBuffer = (stream) => {
        reads += 1;
        if (reads === 2) triangle.bounds = { min: [-2, -0.5, 0], max: [0.5, 0.5, 0] };
        return getVertexBuffer(stream);
      };
      expect(() => batchedStateForNode(batch.toJSON()).captureLoopMembers(identity)).toThrow(/BATCH_LOOP_SOURCE_CHANGED/);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("preserves the distinction between absent and explicit full source ranges", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle);
      batch.addInstance(id);
      const getVertexBuffer = triangle.getVertexBuffer.bind(triangle);
      let reads = 0;
      triangle.getVertexBuffer = (stream) => {
        reads += 1;
        if (reads === 2) triangle.drawRange = { start: 0, count: 3 };
        return getVertexBuffer(stream);
      };
      expect(() => batchedStateForNode(batch.toJSON()).captureLoopMembers(identity)).toThrow(/BATCH_LOOP_SOURCE_CHANGED/);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("uses one node-world snapshot for all members even if the input array changes", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    try {
      const id = batch.addGeometry(triangle);
      batch.addInstance(id); batch.addInstance(id);
      const nodeWorld = [...parentWorld];
      const getVertexBuffer = triangle.getVertexBuffer.bind(triangle);
      triangle.getVertexBuffer = (stream) => {
        nodeWorld[12] = 99;
        return getVertexBuffer(stream);
      };
      const captured = batchedStateForNode(batch.toJSON()).captureLoopMembers(nodeWorld);
      expect(captured.map((member) => member.modelMatrix[12])).toEqual([10, 10]);
      expect(nodeWorld[12]).toBe(99);
    } finally { batch.dispose(); triangle.dispose(); }
  });

  it("rebuilds stale packed bytes and retains a retired generation until its lease ends", () => {
    const triangle = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let releaseLease: () => void = () => undefined;
    try {
      const id = batch.addGeometry(triangle);
      batch.addInstance(id);
      const state = batchedStateForNode(batch.toJSON());
      const originalPool = state.packedPool();
      const lease = originalPool.retainGeneration();
      releaseLease = () => lease.release();
      const sourceRevision = triangle.vertexBuffer.revision;
      triangle.vertexBuffer.floats[0] = -0.75; // Deliberately bypass dirty/revision tracking.
      expect(triangle.vertexBuffer.revision).toBe(sourceRevision);

      const replacement = state.packedPool();
      expect(replacement).not.toBe(originalPool);
      expect(lease.isCurrent()).toBe(false);
      expect(() => lease.geometry.vertexBuffer.readBytes()).not.toThrow();
      expect(replacement.sourceMatchesPacked(triangle)).toBe(true);
      expect(replacement.asGeometry().vertexBuffer.floats[0]).toBe(-0.75);
      lease.release();
      expect(() => lease.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { releaseLease(); batch.dispose(); triangle.dispose(); }
  });

  it("keeps an existing pool alive when an incompatible replacement cannot be built", () => {
    const triangle = Geometry.triangle();
    const line = Geometry.lineSegments([[0, 0, 0], [1, 0, 0]]);
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let releaseLease: () => void = () => undefined;
    try {
      batch.addGeometry(triangle);
      const state = batchedStateForNode(batch.toJSON());
      const originalPool = state.packedPool();
      const lease = originalPool.retainGeneration();
      releaseLease = () => lease.release();
      batch.addGeometry(line);
      expect(() => state.packedPool()).toThrow(/layout|topology|indexing/i);
      expect(lease.isCurrent()).toBe(true);
      expect(() => lease.geometry.vertexBuffer.readBytes()).not.toThrow();
      lease.release();
    } finally { releaseLease(); batch.dispose(); triangle.dispose(); line.dispose(); }
  });
});

describe("batched loop producer handoff", () => {
  it("retains private combined intent on logical members through culling and projection", () => {
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 3, multiDraw: "multi-draw" });
    const material = new UnlitMaterial();
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 0, 5); camera.updateCameraMatrices();
    let release = () => {};
    try {
      const a = batch.addGeometry(firstGeometry), b = batch.addGeometry(secondGeometry);
      const first = batch.addInstance(a), outside = batch.addInstance(a), last = batch.addInstance(b);
      const translated = [...identity]; translated[12] = 100;
      batch.setMatrixAt(outside, translated);
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material,
        undefined, undefined, false, "multi-draw");
      release = prepared.release;
      expect(prepared.items.every(hasCombinedDrawIntent)).toBe(true);
      const ordinaryLoop = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      try { expect(ordinaryLoop.items.every((item) => !hasCombinedDrawIntent(item))).toBe(true); }
      finally { ordinaryLoop.release(); }
      // An object spread or proxy is not the original producer identity.
      expect(hasCombinedDrawIntent({ ...prepared.items[0]! })).toBe(false);
      const proxy = new Proxy(prepared.items[0]!, { get() { throw new Error("unexpected read"); } });
      expect(hasCombinedDrawIntent(proxy)).toBe(false);
      const forged = { ...prepared.items[0]! };
      expect(() => rememberPackedLoopMember(forged, { ...packedLoopMemberFor(prepared.items[0])!, logicalItem: forged,
        producerSnapshot: undefined, combinedDrawIntent: true })).toThrow(/requires producer provenance/);
      const visible = collectRenderItems({ renderItems: prepared.items, frustumCulling: true }, undefined, camera);
      expect(visible.map((item) => packedLoopMemberFor(item)?.batchMemberId)).toEqual([first, last]);
      expect(visible.every(hasCombinedDrawIntent)).toBe(true);
      expect(visible.every(packedLoopProducerMemberCurrent)).toBe(true);
      expect(visible.map((item) => item.geometry)).toEqual([firstGeometry, secondGeometry]);
      batch.setColorAt(first, [0.25, 0.5, 0.75, 1]);
      // Intent is provenance, not an authorization or a currentness proof.
      expect(hasCombinedDrawIntent(visible[0])).toBe(true);
      expect(packedLoopProducerMemberCurrent(visible[0])).toBe(false);
    } finally { release(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); }
  });

  it("produces logical members with source ranges, composed transforms, colors and retained packed slices", () => {
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle();
    const batch = batched.mesh({ maxInstances: 3, multiDraw: "loop", name: "fixture" });
    const material = new UnlitMaterial();
    let release: () => void = () => undefined;
    try {
      const firstId = batch.addGeometry(firstGeometry), secondId = batch.addGeometry(secondGeometry);
      const first = batch.addInstance(firstId), hidden = batch.addInstance(firstId), second = batch.addInstance(secondId);
      batch.setMatrixAt(first, memberLocal);
      batch.setColorAt(first, [0.25, 0.5, 0.75, 0.125]);
      batch.setVisibleAt(hidden, false);
      secondGeometry.drawRange = { start: 1, count: Infinity };
      const metadata = { selected: true };
      const node = { ...batch.toJSON(), renderOrder: 7, frustumCulled: false, layers: 5, userData: metadata, castShadow: false };
      const owner = {};
      const prepared = createBatchedLoopItems(batch.state, node, parentWorld, material, owner);
      release = prepared.release;
      expect(prepared.items).toHaveLength(2);
      const [one, two] = prepared.items;
      const firstPacket = packedLoopMemberFor(one), secondPacket = packedLoopMemberFor(two);
      expect(one).toMatchObject({ geometry: firstGeometry, material, label: "fixture", renderOrder: 7,
        frustumCulled: false, layerMask: 5, castShadow: false, userData: metadata });
      expect(Array.from(one!.modelMatrix!)).toEqual([0, 2, 0, 0, -3, 0, 0, 0, 0, 0, -4, 0, 10, 24, 30, 1]);
      expect(Array.from(one!.instanceTransforms!)).toEqual(identity);
      expect(Array.from(one!.instanceColors!)).toEqual([0.25, 0.5, 0.75, 0.125]);
      expect(two!.geometry).toBe(secondGeometry);
      expect(two!.drawRange).toEqual({ start: 1, count: 2 });
      expect(secondPacket!.sourceDrawRange).toEqual({ start: 1, count: Infinity });
      expect(firstPacket).toMatchObject({ batchMemberId: first, drawIndex: 0, geometryId: firstId, sourceRange: { start: 0, count: 3 } });
      expect(secondPacket).toMatchObject({ batchMemberId: second, drawIndex: 1, geometryId: secondId,
        sourceRange: { start: 1, count: 2 }, packedRange: { start: 4, count: 2 } });
      expect(firstPacket!.lease).toBe(prepared.lease);
      expect(secondPacket!.lease).toBe(prepared.lease);
      expect(firstPacket!.temporalObjectKey).toBe((one as typeof one & { temporalObjectKey: object }).temporalObjectKey);
      expect(prepared.items.every(packedLoopProducerMemberCurrent)).toBe(true);

      // Projection preserves the producer identity while allowing a renderer
      // to add per-item callback/clipping information to the logical member.
      const projected = { ...one!, onBeforeRender: () => undefined };
      expect(transferPackedLoopMember(one, projected)).toBe(true);
      expect(packedLoopProducerMemberCurrent(projected)).toBe(true);
      release();
      expect(packedLoopProducerMemberCurrent(projected)).toBe(false);
    } finally { release(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); }
  });

  it("detects live slot changes, direct array writes, source bytes, and node-world changes", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    const world = [...identity];
    const releases: Array<() => void> = [];
    try {
      const id = batch.addGeometry(geometry), first = batch.addInstance(id), second = batch.addInstance(id);
      const make = () => {
        const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), world, material);
        releases.push(prepared.release);
        expect(prepared.items.every(packedLoopProducerMemberCurrent)).toBe(true);
        return prepared.items;
      };
      let items = make();
      batch.setMatrixAt(first, memberLocal);
      expect(packedLoopProducerMemberCurrent(items[0])).toBe(false);
      expect(packedLoopProducerMemberCurrent(items[1])).toBe(false); // the shared batch changed

      items = make();
      const oldVersion = batch.state.version;
      batch.state.version += 1; // The textured-material upgrade uses this path.
      batch.state.version = oldVersion; // Restoring the public version cannot revive a capture.
      expect(items.every((item) => !packedLoopProducerMemberCurrent(item))).toBe(true);

      items = make();
      batch.state.colors[second * 4 + 3] = 0.5; // No setter/version bump.
      expect(packedLoopProducerMemberCurrent(items[1])).toBe(false);
      items = make();
      batch.state.matrices[first * 16 + 12] = 9;
      expect(packedLoopProducerMemberCurrent(items[0])).toBe(false);
      items = make();
      batch.setVisibleAt(first, false);
      expect(packedLoopProducerMemberCurrent(items[0])).toBe(false);
      expect(packedLoopProducerMemberCurrent(items[1])).toBe(false); // dense row moved
      batch.setVisibleAt(first, true);

      items = make();
      world[12] = 4;
      expect(items.every((item) => !packedLoopProducerMemberCurrent(item))).toBe(true);
      world[12] = 0;
      items = make();
      geometry.vertexBuffer.floats[0] = -0.75; // No buffer revision bump.
      expect(items.every((item) => !packedLoopProducerMemberCurrent(item))).toBe(true);
    } finally { for (const release of releases) release(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("uses distinct mount and slot-lifetime identities and cannot promote a copied snapshot", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const releases: Array<() => void> = [];
    try {
      const id = batch.addGeometry(geometry), slot = batch.addInstance(id);
      const ownerA = {}, ownerB = {};
      const make = (owner: object) => {
        const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material, owner);
        releases.push(prepared.release);
        return prepared.items[0]!;
      };
      const first = make(ownerA), again = make(ownerA), otherMount = make(ownerB);
      const firstPacket = packedLoopMemberFor(first)!;
      expect(firstPacket.temporalObjectKey).toBe(packedLoopMemberFor(again)!.temporalObjectKey);
      expect(firstPacket.temporalObjectKey).not.toBe(packedLoopMemberFor(otherMount)!.temporalObjectKey);
      const snapshot = batch.state.captureLoopMembers(identity, undefined, undefined, ownerA)[0]!;
      const forged = { ...snapshot };
      const copied = { ...first };
      expect(() => rememberPackedLoopMember(copied, { ...firstPacket, logicalItem: copied,
        logicalMaterial: copied.material, producerSnapshot: forged })).toThrow(/not registered/);
      expect(packedLoopProducerMemberCurrent(copied)).toBe(false);

      batch.deleteInstance(slot);
      expect(batch.addInstance(id)).toBe(slot);
      const replacement = make(ownerA);
      expect(packedLoopProducerMemberCurrent(first)).toBe(false);
      expect(packedLoopMemberFor(replacement)!.temporalObjectKey).not.toBe(firstPacket.temporalObjectKey);
    } finally { for (const release of releases) release(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("rejects a registered snapshot whose composed transform is inconsistent with its live slot", () => {
    const geometry = Geometry.triangle(), batch = batched.mesh({ maxInstances: 1 });
    try {
      const id = batch.addGeometry(geometry); batch.addInstance(id);
      const captured = batch.state.captureLoopMembers(identity)[0]!;
      const producer = new PackedLoopProducerState("other", 1, [geometry], 1);
      producer.matrices.set(identity); producer.colors.set([1, 1, 1, 1]);
      producer.alive[0] = 1; producer.visible[0] = 1; producer.slotLifetimes[0] = {};
      producer.setVersion(captured.stateVersion);
      const owner = {}, badModel = [...identity]; badModel[12] = 100;
      const forged = Object.freeze({ ...captured, batchId: "other", temporalObjectKey: producer.temporalKey(0, owner),
        modelMatrix: Object.freeze(badModel) });
      expect(() => registerPackedLoopProducerSnapshot(producer, forged, owner, identity, identity)).toThrow(/slot and transform/);
    } finally { batch.dispose(); geometry.dispose(); }
  });

  it("invalidates captures when a real ancestor moves, hides, or the runtime node changes", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 1 });
    const releases: Array<() => void> = [];
    const child = { ...batch.toJSON(), runtime: { id: "batch-child" } };
    const parent = { kind: "group" as const, runtime: { id: "batch-parent" }, children: [child] };
    const registry = createAuraRuntimeNodeRegistry({ nodes: [parent] } as unknown as AuraSceneSnapshot);
    try {
      const id = batch.addGeometry(geometry); batch.addInstance(id);
      const parentHandle = registry.require("batch-parent"), childHandle = registry.require("batch-child");
      const make = () => {
        const live = runtimeNodeQueryState(childHandle)!;
        if (live.node.kind !== "batched") throw new Error("Expected a live batched node");
        const readWorld = batchedRuntimeNodeWorldReader(childHandle, live.node);
        const prepared = createBatchedLoopItems(batch.state, live.node, live.worldMatrix, material, childHandle, readWorld);
        releases.push(prepared.release);
        expect(packedLoopProducerMemberCurrent(prepared.items[0])).toBe(true);
        return prepared.items[0]!;
      };
      let item = make();
      const childVersion = childHandle.version;
      parentHandle.setPosition(3, 0, 0);
      expect(childHandle.version).toBe(childVersion);
      expect(packedLoopProducerMemberCurrent(item)).toBe(false);
      item = make();
      parentHandle.setVisible(false);
      expect(packedLoopProducerMemberCurrent(item)).toBe(false);
      parentHandle.setVisible(true);
      item = make();
      childHandle.renderOrder = 2;
      expect(packedLoopProducerMemberCurrent(item)).toBe(false);
      childHandle.renderOrder = 0;
      item = make();
      registry.dispose();
      expect(packedLoopProducerMemberCurrent(item)).toBe(false);
    } finally { for (const release of releases) release(); registry.dispose(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("retains a retired pool generation until its owner releases the frame lease", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let release: () => void = () => undefined;
    try {
      const id = batch.addGeometry(geometry); batch.addInstance(id);
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      release = prepared.release;
      const packed = prepared.lease!.geometry;
      expect(packedLoopProducerMemberCurrent(prepared.items[0])).toBe(true);
      batch.dispose();
      expect(packedLoopProducerMemberCurrent(prepared.items[0])).toBe(false);
      expect(() => packed.vertexBuffer.readBytes()).not.toThrow();
      release();
      release();
      expect(() => packed.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { release(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("reuses packed geometry across moving logical members without retaining per-frame buffer copies", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const releases: Array<() => void> = [];
    try {
      const id = batch.addGeometry(geometry), slot = batch.addInstance(id);
      const first = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      releases.push(first.release);
      batch.setMatrixAt(slot, memberLocal);
      const second = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      releases.push(second.release);
      expect(second.lease!.geometry).toBe(first.lease!.geometry);
      expect(packedLoopProducerMemberCurrent(first.items[0])).toBe(false);
      expect(packedLoopProducerMemberCurrent(second.items[0])).toBe(true);
      expect(first.lease!.isCurrent()).toBe(true);
      expect(second.lease!.isCurrent()).toBe(true);
    } finally { for (const release of releases) release(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });
});
