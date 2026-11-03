import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, PerspectiveCamera, identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { batched, createBatchedLoopItems } from "../../../packages/engine/src/agent-api/nodes/batched";
import { batchedStateForNode } from "../../../packages/engine/src/agent-api/nodes/batchedState";
import type { BatchedLoopMemberSnapshot } from "../../../packages/engine/src/agent-api/nodes/batchedState";
import "../../../packages/rendering/src/lanes/prd01";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import type { WebGPUDeviceLike, WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { BatchedGeometryPool, type PackedGeometryLease } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { packedLoopMemberFor, rememberPackedLoopMember } from "../../../packages/rendering/src/batching/BatchMembers";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
  A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false });

function modelAt(x: number) {
  const matrix = identityMat4();
  matrix[12] = x;
  return matrix;
}

function rememberMember(item: RenderItem, member: BatchedLoopMemberSnapshot, pool: BatchedGeometryPool, lease: PackedGeometryLease,
  carrier: RenderItem = item): void {
  rememberPackedLoopMember(carrier, { ...member, logicalItem: item, logicalMaterial: item.material, pool, lease,
    sourceDrawRange: member.sourceGeometry.drawRange, itemDrawRange: item.drawRange,
    packedRange: pool.translateSourceRange(member.sourceGeometry, member.sourceRange) });
}

describe("packed loop renderer semantics", () => {
  it.each([false, true])("submits each current member from its shared packed arena (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const first = Geometry.litCube(1), second = Geometry.litCube(1), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    let release = () => {};
    try {
      first.drawRange = { start: 0, count: 3 }; second.drawRange = { start: 3, count: 6 };
      batch.addInstance(batch.addGeometry(first)); batch.addInstance(batch.addGeometry(second));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identityMat4(), material);
      release = prepared.release;
      const packets = prepared.items.map((item) => packedLoopMemberFor(item)!);
      const seen: number[] = [];
      prepared.items.forEach((item, index) => {
        (item as { onBeforeRender?: () => void }).onBeforeRender = () => seen.push(index);
      });
      const source = { renderItems: prepared.items, cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false } };
      if (asynchronous) await renderer.renderAsync({ source }); else renderer.render({ source });
      expect(seen).toEqual([0, 1]);
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands.map((draw) => [draw.firstIndex ?? 0, draw.indexCount])).toEqual(
        packets.map((packet) => [packet.packedRange.start, packet.packedRange.count]));
      expect(device.drawCommands.every((draw) => draw.vertexBuffer === prepared.lease!.geometry.vertexBuffer.uploadedBuffer)).toBe(true);
      expect(device.drawCommands.every((draw) => draw.indexBuffer === prepared.lease!.geometry.indexBuffer!.uploadedBuffer)).toBe(true);
      expect(first.vertexBuffer.uploadedBuffer).toBeNull();
      expect(second.vertexBuffer.uploadedBuffer).toBeNull();
    } finally { release(); renderer.dispose(); batch.dispose(); first.dispose(); second.dispose(); material.dispose(); }
  });

  it("falls back for later members after a callback changes their source bytes", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const first = Geometry.triangle(), second = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(first)); batch.addInstance(batch.addGeometry(second));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identityMat4(), material);
      release = prepared.release;
      let callbacks = 0;
      (prepared.items[0] as { onBeforeRender?: () => void }).onBeforeRender = () => {
        callbacks += 1;
        second.vertexBuffer.setAttribute(0, "position", [-0.75, -0.5, 0]);
      };
      renderer.render({ source: { renderItems: prepared.items, cameraPolicy: "identity", frustumCulling: false, shadow: { enabled: false } } });
      expect(callbacks).toBe(1);
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[0]!.vertexBuffer).toBe(prepared.lease!.geometry.vertexBuffer.uploadedBuffer);
      expect(device.drawCommands[1]!.vertexBuffer).toBe(second.vertexBuffer.uploadedBuffer);
    } finally { release(); renderer.dispose(); batch.dispose(); first.dispose(); second.dispose(); material.dispose(); }
  });

  it("uses logical source buffers when the supported device draw entry is overridden", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(geometry));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identityMat4(), material);
      release = prepared.release;
      const original = device.draw.bind(device);
      const observed = vi.fn((command: Parameters<typeof device.draw>[0]) => original(command));
      device.draw = observed;
      renderer.render({ source: { renderItems: prepared.items, cameraPolicy: "identity", frustumCulling: false, shadow: { enabled: false } } });
      expect(observed).toHaveBeenCalledTimes(1);
      expect(device.drawCommands[0]!.vertexBuffer).toBe(geometry.vertexBuffer.uploadedBuffer);
      expect(prepared.lease!.geometry.vertexBuffer.uploadedBuffer).toBeNull();
    } finally { release(); renderer.dispose(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("submits packed slices through the built-in WebGPU renderer and retains them until its queue fence", async () => {
    let finish!: () => void;
    const fence = new Promise<void>((resolve) => { finish = resolve; });
    const indices: Array<readonly number[]> = [];
    const native = {
      queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: () => fence },
      createBuffer: () => ({ destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      createShaderModule: (descriptor: object) => descriptor,
      createBindGroupLayout: (descriptor: object) => descriptor,
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (descriptor: object) => descriptor,
      createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {},
        setVertexBuffer() {}, setIndexBuffer() {}, draw() {},
        drawIndexed: (count: number, instances: number, first: number) => indices.push([count, instances, first]), end() {} }), finish: () => ({}) }),
      destroy() {}
    } as unknown as WebGPUDeviceLike;
    const webgpu = { requestAdapter: async () => ({ requestDevice: async () => native }) } as WebGPULike;
    const renderer = await Renderer.create({ backend: "webgpu", webgpu, width: 16, height: 16, qrFlags: flags });
    const target = renderer.device.createRenderTarget({ width: 16, height: 16, format: "rgba8", depth: false });
    const first = Geometry.triangle(), second = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(first)); batch.addInstance(batch.addGeometry(second));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identityMat4(), material);
      release = prepared.release;
      renderer.render({ source: { renderItems: prepared.items, renderTarget: target, cameraPolicy: "identity",
        frustumCulling: false, shadow: { enabled: false } } });
      expect(indices.map((draw) => draw[2])).toEqual(prepared.items.map((item) => packedLoopMemberFor(item)!.packedRange.start));
      expect(first.vertexBuffer.uploadedBuffer).toBeNull();
      expect(second.vertexBuffer.uploadedBuffer).toBeNull();
      release(); batch.dispose();
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).not.toThrow();
      finish();
      await fence;
      await Promise.resolve();
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { finish(); release(); batch.dispose(); first.dispose(); second.dispose(); material.dispose(); target.dispose(); renderer.dispose(); }
  });

  it.each([false, true])("preserves provenance through projection, clipping and temporal forward snapshots (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const pool = new BatchedGeometryPool(), history = new TemporalHistory();
    let lease: PackedGeometryLease | undefined, drawn: RenderItem | undefined;
    try {
      const geometryId = batch.addGeometry(geometry); batch.addInstance(geometryId);
      const [member] = batchedStateForNode(batch.toJSON()).captureLoopMembers(modelAt(0.25), "packet-batch");
      pool.pack(geometry); lease = pool.retainGeneration();
      const item: RenderItem = { geometry, material, modelMatrix: member!.modelMatrix,
        onBeforeRender: current => { drawn = current; } };
      rememberMember(item, member!, pool, lease);
      const source = { cameraPolicy: "identity" as const, renderItems: [item], shadow: { enabled: false },
        globalClipping: { planes: [[1, 0, 0, 1] as const] } };
      if (asynchronous) await renderer.renderAsync({ source });
      else renderer.render({ source });
      const projectedPacket = packedLoopMemberFor(drawn);
      expect(drawn).not.toBe(item);
      expect(projectedPacket?.logicalItem).toBe(drawn);
      expect(projectedPacket).toMatchObject({ batchId: member!.batchId, batchMemberId: member!.batchMemberId, sourceGeometry: geometry, pool, lease });
      expect(packedLoopMemberFor(item)?.logicalItem).toBe(item);
      expect(drawn?.globalClipping).toBeDefined();
      expect(Object.isFrozen(drawn?.globalClipping)).toBe(true);
      expect(device.drawCommands).toHaveLength(1);

      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device); device.beginFrame(64, 64);
      const prepared = history.prepare(device, 64, 64, [drawn!], identityMat4(), { viewId: "packet", frameId: 1, jitter: true });
      const temporalItem = prepared.renderItems[0]!;
      expect(temporalItem).not.toBe(drawn);
      expect(packedLoopMemberFor(temporalItem)?.logicalItem).toBe(temporalItem);
      expect(packedLoopMemberFor(temporalItem)).toMatchObject({ batchMemberId: member!.batchMemberId, sourceGeometry: geometry, pool, lease });
    } finally { history.dispose(); renderer.dispose(); lease?.release(); pool.dispose(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([[false, "source"], [true, "source"], [false, "contributor"], [true, "contributor"]] as const)(
    "rejects a physical carrier before culling or later observers (async=%s, origin=%s)", async (asynchronous, origin) => {
      const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
      const device = renderer.device as MockRenderDevice;
      const geometry = Geometry.triangle(), material = new UnlitMaterial(), batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
      const pool = new BatchedGeometryPool();
      let lease: PackedGeometryLease | undefined, after = 0;
      let unregisterFirst: (() => void) | undefined, unregisterSecond: (() => void) | undefined;
      try {
        const geometryId = batch.addGeometry(geometry); batch.addInstance(geometryId);
        const [member] = batchedStateForNode(batch.toJSON()).captureLoopMembers(identityMat4(), "carrier-batch");
        pool.pack(geometry); lease = pool.retainGeneration();
        const logical: RenderItem = { geometry, material, modelMatrix: member!.modelMatrix };
        const carrier: RenderItem = { ...logical, geometry: lease.geometry };
        rememberMember(logical, member!, pool, lease, carrier);
        const ordinary: RenderItem = { geometry, material };
        if (origin === "contributor") {
          unregisterFirst = registerFrameContributor({ id: "prd01.loop-carrier-first", owner: "prd01", flag: "A3D_QR_CORE", order: 1,
            phases: ["collect"], collect: items => [...items, carrier] });
          unregisterSecond = registerFrameContributor({ id: "prd01.loop-carrier-after", owner: "prd01", flag: "A3D_QR_CORE", order: 2,
            phases: ["collect"], collect: items => { after++; return items; } });
        }
        const source = { cameraPolicy: "identity" as const, frustumCulling: true, renderItems: origin === "source" ? [carrier] : [ordinary] };
        if (asynchronous) await expect(renderer.renderAsync({ source })).rejects.toThrowError(expect.objectContaining({ code: "BATCH_LOOP_CARRIER_UNSUPPORTED" }));
        else expect(() => renderer.render({ source })).toThrowError(expect.objectContaining({ code: "BATCH_LOOP_CARRIER_UNSUPPORTED" }));
        expect(after).toBe(0);
        expect(device.drawCommands).toHaveLength(0);
      } finally { unregisterSecond?.(); unregisterFirst?.(); renderer.dispose(); lease?.release(); pool.dispose(); batch.dispose(); geometry.dispose(); material.dispose(); }
    }
  );

  it.each([false, true])("establishes logical-member culling, sort and callback order (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 0, 5); camera.updateCameraMatrices();
    const callbacks: { readonly label: string | undefined; readonly x: number | undefined; readonly completedDraws: number }[] = [];
    const onBeforeRender = (item: RenderItem) => callbacks.push({ label: item.label, x: item.modelMatrix?.[12], completedDraws: device.drawCommands.length });
    const items: RenderItem[] = [
      { geometry, material, label: "later", modelMatrix: modelAt(0.5), renderOrder: 2, castShadow: false, onBeforeRender },
      { geometry, material, label: "outside", modelMatrix: modelAt(100), renderOrder: 0, castShadow: false, onBeforeRender },
      { geometry, material, label: "earlier", modelMatrix: modelAt(-0.5), renderOrder: -1, castShadow: false, onBeforeRender }
    ];
    const source = { renderItems: items, frustumCulling: true, shadow: { enabled: false } };
    try {
      const diagnostics = asynchronous ? await renderer.renderAsync({ source, camera }) : renderer.render({ source, camera });
      expect(callbacks).toEqual([
        { label: "earlier", x: -0.5, completedDraws: 0 },
        { label: "later", x: 0.5, completedDraws: 1 }
      ]);
      expect(device.drawCommands).toHaveLength(2);
      expect(diagnostics).toMatchObject({ submittedObjects: 3, visibleObjects: 2, culledObjects: 1, frustumTestedObjects: 3 });
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("preserves each logical indexed range through sorted submission (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.litCube(1), material = new UnlitMaterial();
    const callbacks: { readonly label: string | undefined; readonly start: number | undefined; readonly completedDraws: number }[] = [];
    const onBeforeRender = (item: RenderItem) => callbacks.push({ label: item.label, start: item.drawRange?.start, completedDraws: device.drawCommands.length });
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false }, renderItems: [
      { geometry, material, label: "later", modelMatrix: modelAt(0.5), renderOrder: 2, drawRange: { start: 12, count: 6 }, onBeforeRender },
      { geometry, material, label: "earlier", modelMatrix: modelAt(-0.5), renderOrder: -1, drawRange: { start: 3, count: 3 }, onBeforeRender }
    ] };
    try {
      if (asynchronous) await renderer.renderAsync({ source });
      else renderer.render({ source });
      expect(callbacks).toEqual([
        { label: "earlier", start: 3, completedDraws: 0 },
        { label: "later", start: 12, completedDraws: 1 }
      ]);
      expect(device.drawCommands.map(draw => [draw.firstIndex, draw.indexCount])).toEqual([[3, 3], [12, 6]]);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("culls and orders real captured batch members using their source geometry and world models (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 4, multiDraw: "loop" });
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 0, 5); camera.updateCameraMatrices();
    try {
      const firstGeometryId = batch.addGeometry(firstGeometry), secondGeometryId = batch.addGeometry(secondGeometry);
      const first = batch.addInstance(firstGeometryId), hidden = batch.addInstance(firstGeometryId);
      const outside = batch.addInstance(secondGeometryId), last = batch.addInstance(secondGeometryId);
      batch.setMatrixAt(first, modelAt(0.5)); batch.setVisibleAt(hidden, false);
      batch.setMatrixAt(outside, modelAt(100)); batch.setMatrixAt(last, modelAt(-0.5));
      const members = batchedStateForNode(batch.toJSON()).captureLoopMembers(modelAt(0.25), "runtime-batch");
      expect(members.map(member => [member.batchMemberId, member.drawIndex])).toEqual([[first, 0], [outside, 1], [last, 2]]);
      const callbacks: { readonly id: number; readonly x: number | undefined; readonly completedDraws: number }[] = [];
      const items: RenderItem[] = members.map(member => ({
        geometry: member.sourceGeometry, material, label: `member-${member.batchMemberId}`,
        modelMatrix: member.modelMatrix, renderOrder: member.batchMemberId === last ? -1 : 1, castShadow: false,
        onBeforeRender: item => callbacks.push({ id: member.batchMemberId, x: item.modelMatrix?.[12], completedDraws: device.drawCommands.length })
      }));
      const source = { renderItems: items, frustumCulling: true, shadow: { enabled: false } };
      const diagnostics = asynchronous ? await renderer.renderAsync({ source, camera }) : renderer.render({ source, camera });
      expect(callbacks).toEqual([
        { id: last, x: -0.25, completedDraws: 0 },
        { id: first, x: 0.75, completedDraws: 1 }
      ]);
      expect(diagnostics).toMatchObject({ submittedObjects: 3, visibleObjects: 2, culledObjects: 1, frustumTestedObjects: 3 });
      expect(device.drawCommands).toHaveLength(2);
    } finally { renderer.dispose(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("applies captured node layers, culling policy, render order and metadata (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 0, 5); camera.updateCameraMatrices();
    try {
      const geometryId = batch.addGeometry(geometry), slot = batch.addInstance(geometryId);
      batch.setMatrixAt(slot, modelAt(100));
      const userData = { source: "batch-node" };
      const [member] = batchedStateForNode(batch.toJSON()).captureLoopMembers(identityMat4(), "metadata-batch",
        { renderOrder: 7, frustumCulled: false, layers: 2, castShadow: false, userData });
      expect(member).toMatchObject({ batchMemberId: slot, renderOrder: 7, frustumCulled: false, layerMask: 2, castShadow: false });
      expect(member!.userData).toBe(userData);
      const seen: { readonly label: string | undefined; readonly userData: unknown }[] = [];
      const logical: RenderItem = { geometry: member!.sourceGeometry, material, label: "batch", modelMatrix: member!.modelMatrix,
        renderOrder: member!.renderOrder, frustumCulled: member!.frustumCulled, layerMask: member!.layerMask,
        castShadow: member!.castShadow, userData: member!.userData, onBeforeRender: item => seen.push({ label: item.label, userData: item.userData }) };
      const ordinary: RenderItem = { geometry, material, label: "ordinary", layerMask: 2,
        onBeforeRender: item => seen.push({ label: item.label, userData: item.userData }) };
      const source = { renderItems: [logical, ordinary], frustumCulling: true, shadow: { enabled: false } };
      const render = () => asynchronous ? renderer.renderAsync({ source, camera }) : Promise.resolve(renderer.render({ source, camera }));
      expect(await render()).toMatchObject({ submittedObjects: 0, visibleObjects: 0 });
      expect(seen).toEqual([]);
      camera.layerMask = 2;
      expect(await render()).toMatchObject({ submittedObjects: 2, visibleObjects: 2, culledObjects: 0 });
      expect(seen).toEqual([{ label: "ordinary", userData: undefined }, { label: "batch", userData }]);
      expect(seen[1]!.userData).toBe(userData);
      expect(device.drawCommands).toHaveLength(2);
    } finally { renderer.dispose(); batch.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("submits the original ranges of real captured batch members in sorted order (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const firstGeometry = Geometry.litCube(1), secondGeometry = Geometry.litCube(1), material = new UnlitMaterial();
    firstGeometry.drawRange = { start: 3, count: 3 }; secondGeometry.drawRange = { start: 12, count: 6 };
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    try {
      const firstId = batch.addGeometry(firstGeometry), secondId = batch.addGeometry(secondGeometry);
      const first = batch.addInstance(firstId), second = batch.addInstance(secondId);
      batch.setMatrixAt(first, modelAt(-0.5)); batch.setMatrixAt(second, modelAt(0.5));
      const members = batchedStateForNode(batch.toJSON()).captureLoopMembers(identityMat4(), "ranged-batch");
      const seen: { readonly id: number; readonly completedDraws: number }[] = [];
      const renderItems: RenderItem[] = members.map(member => ({ geometry: member.sourceGeometry, material,
        label: `member-${member.batchMemberId}`, modelMatrix: member.modelMatrix, drawRange: member.sourceRange,
        renderOrder: member.batchMemberId === second ? -1 : 1,
        onBeforeRender: () => seen.push({ id: member.batchMemberId, completedDraws: device.drawCommands.length }) }));
      const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false }, renderItems };
      if (asynchronous) await renderer.renderAsync({ source });
      else renderer.render({ source });
      expect(seen).toEqual([{ id: second, completedDraws: 0 }, { id: first, completedDraws: 1 }]);
      expect(device.drawCommands.map(draw => [draw.firstIndex, draw.indexCount])).toEqual([[12, 6], [3, 3]]);
    } finally { renderer.dispose(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); }
  });

  it.each([false, true])("observes a callback mutation of a later logical member exactly once (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle();
    const material = new UnlitMaterial(), replacement = new UnlitMaterial({ color: [0, 1, 0, 1] });
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    let laterProjected: RenderItem | undefined;
    const unregister = registerFrameContributor({ id: "prd01.loop-logical-observer", owner: "prd01", flag: "A3D_QR_CORE",
      phases: ["collect"], collect: items => { laterProjected = items.find(item => item.label === "later"); return items; } });
    try {
      const firstId = batch.addGeometry(firstGeometry), secondId = batch.addGeometry(secondGeometry);
      const first = batch.addInstance(firstId), second = batch.addInstance(secondId);
      const members = batchedStateForNode(batch.toJSON()).captureLoopMembers(identityMat4(), "mutable-batch");
      const seen: { readonly id: number; readonly material: unknown; readonly completedDraws: number }[] = [];
      const renderItems: RenderItem[] = members.map(member => ({ geometry: member.sourceGeometry, material,
        label: member.batchMemberId === first ? "first" : "later", modelMatrix: member.modelMatrix,
        renderOrder: member.batchMemberId === first ? -1 : 1,
        onBeforeRender: item => {
          seen.push({ id: member.batchMemberId, material: item.material, completedDraws: device.drawCommands.length });
          if (member.batchMemberId === first && laterProjected) (laterProjected as { material?: RenderItem["material"] }).material = replacement;
        } }));
      const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false }, renderItems };
      if (asynchronous) await renderer.renderAsync({ source });
      else renderer.render({ source });
      expect(seen).toEqual([
        { id: first, material, completedDraws: 0 },
        { id: second, material: replacement, completedDraws: 1 }
      ]);
      expect(device.drawCommands).toHaveLength(2);
      expect(Array.from(device.drawCommands[1]!.uniforms?.get("u_baseColor") as Float32Array | readonly number[])).toEqual([0, 1, 0, 1]);
    } finally { unregister(); renderer.dispose(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); replacement.dispose(); }
  });

  it.each([false, true])("retains an off-camera member whose shadow reaches the visible scene (async=%s)", async asynchronous => {
    const shadowFlags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
      A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: true });
    const renderer = await Renderer.create({ backend: "mock", width: 64, height: 64, qrFlags: shadowFlags });
    const device = renderer.device as MockRenderDevice;
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    camera.transform.setPosition(0, 0, 5); camera.updateCameraMatrices();
    const sun = new DirectionalLight("batch-shadow-sun"); sun.castsShadow = true; sun.transform.updateWorld(undefined, true);
    try {
      const firstId = batch.addGeometry(firstGeometry), secondId = batch.addGeometry(secondGeometry);
      const visible = batch.addInstance(firstId), overhead = batch.addInstance(secondId);
      const overheadModel = identityMat4(); overheadModel[13] = 10; batch.setMatrixAt(overhead, overheadModel);
      const members = batchedStateForNode(batch.toJSON()).captureLoopMembers(identityMat4(), "shadow-batch");
      const seen: number[] = [];
      const renderItems: RenderItem[] = members.map(member => ({ geometry: member.sourceGeometry, material,
        label: `member-${member.batchMemberId}`, modelMatrix: member.modelMatrix, castShadow: true,
        onBeforeRender: () => seen.push(member.batchMemberId) }));
      const source = { renderItems, frustumCulling: true,
        collectedLights: [{ ...collectLight(sun), direction: [0, -1, 0] as const }],
        shadow: { light: sun, size: 16, cascadeCount: 1, lightMatrix: identityMat4() } };
      const diagnostics = asynchronous ? await renderer.renderAsync({ source, camera }) : renderer.render({ source, camera });
      expect(diagnostics).toMatchObject({ submittedObjects: 2, visibleObjects: 1, culledObjects: 1 });
      expect(seen).toEqual([visible]);
      expect(device.drawCommands.map(draw => draw.label)).toEqual([`member-${visible}:0`, `member-${overhead}:0`, `member-${visible}`]);
      const evidence = renderer.getShadowEvidence() as { readonly lightMatrix: Mat4; readonly cascades: readonly { readonly lightMatrix: Mat4 }[] };
      const expected = multiplyMat4(evidence.cascades[0]?.lightMatrix ?? evidence.lightMatrix, overheadModel);
      const actual = device.drawCommands[1]!.uniforms?.get("u_modelViewProjection") as Float32Array | readonly number[];
      expect(Array.from(actual)).toEqual(Array.from(expected));
    } finally { renderer.dispose(); batch.dispose(); firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); }
  });
});
