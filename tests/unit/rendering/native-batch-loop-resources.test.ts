import { describe, expect, it, vi } from "vitest";

import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import "../../../packages/rendering/src/lanes/prd01";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { batchMembersFor, beginPackedLoopFrame, expandLogicalBatchItems, packedLoopCandidate, packedLoopDrawDataCurrent, packedLoopMemberFor, packedLoopMemberResourcesMatch, registerPackedLoopDevice, rememberPackedLoopMember, retainPackedLoopDrawData, transferBatchMembers, transferPackedLoopMember } from "../../../packages/rendering/src/batching/BatchMembers";
import { DrawDataTexture } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { ResourceRegistry } from "../../../packages/rendering/src/resources/ResourceRegistry";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { batched, createBatchedLoopItems } from "../../../packages/engine/src/agent-api/nodes/batched";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

function unindexedTriangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  return new Geometry(vertices, null);
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A device-shaped WebGL context; no browser or GPU is started. */
function webglFenceCanvas(supported: boolean) {
  const timeout = 0x911b, signaled = 0x911a, failed = 0x911d;
  let status = timeout;
  const draws: number[] = [];
  const listeners = new Map<string, EventListener>();
  let completionProbe: (() => void) | undefined;
  const values: Record<string, unknown> = {
    NO_ERROR: 0, SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: signaled,
    TIMEOUT_EXPIRED: timeout, CONDITION_SATISFIED: 0x911c, WAIT_FAILED: failed,
    LINK_STATUS: 0x8b82, COMPILE_STATUS: 0x8b81, ACTIVE_ATTRIBUTES: 0x8b89, ACTIVE_UNIFORMS: 0x8b86,
    INVALID_INDEX: 0xffffffff, UNSIGNED_SHORT: 0x1403, UNSIGNED_INT: 0x1405,
    getError: () => 0, getParameter: () => 16, getExtension: () => null, isContextLost: () => false,
    createBuffer: () => ({}), createShader: () => ({}), getShaderParameter: () => true,
    createProgram: () => ({}), getProgramParameter: (_program: unknown, parameter: number) => parameter === 0x8b82 ? true : 0,
    getUniformBlockIndex: () => 0xffffffff, createVertexArray: () => ({}),
    drawElements: (_mode: number, _count: number, _type: number, offset: number) => { draws.push(offset); },
    drawElementsInstanced: (_mode: number, _count: number, _type: number, offset: number) => { draws.push(offset); },
    fenceSync: supported ? () => ({}) : undefined, flush: () => {},
    clientWaitSync: () => status, deleteSync: () => {}
  };
  const gl = new Proxy(values, { get(target, key) {
    if (key === "fenceSync") completionProbe?.();
    if (typeof key === "string" && key in target) return target[key];
    if (typeof key === "string" && /^[A-Z0-9_]+$/.test(key)) return 0x10000;
    return () => undefined;
  } });
  const canvas = { width: 8, height: 8, getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name) } as unknown as HTMLCanvasElement;
  return { canvas, draws, signal: () => { status = signaled; }, fail: () => { status = failed; },
    lose: () => listeners.get("webglcontextlost")?.({ preventDefault() {} } as Event),
    onCompletionProbe: (callback: (() => void) | undefined) => { completionProbe = callback; } };
}

describe("packed loop source slices and provenance", () => {
  it("does not inspect an unregistered custom device when beginning a frame", () => {
    const custom = new Proxy({}, { get: () => { throw new Error("custom device property was read"); } });
    expect(beginPackedLoopFrame(custom as RenderDevice)).toBeUndefined();
  });

  it("rejects unregistered devices and forged or proxied draw data without inspecting them", () => {
    let dataReads = 0;
    const foreignData = new Proxy({}, { getPrototypeOf() { dataReads += 1; throw new Error("unexpected data inspection"); } });
    const foreignDevice = new Proxy({}, { get() { throw new Error("unexpected device inspection"); } });
    expect(retainPackedLoopDrawData(foreignDevice as RenderDevice, foreignData as DrawDataTexture)).toBe(false);
    expect(packedLoopDrawDataCurrent(foreignDevice as RenderDevice, foreignData as DrawDataTexture)).toBe(false);
    expect(dataReads).toBe(0);

    const device = new MockRenderDevice(), data = new DrawDataTexture(1);
    const texture = data.upload();
    registerPackedLoopDevice(device);
    try {
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      const alias = new Proxy(data, { getPrototypeOf() { dataReads += 1; throw new Error("unexpected data inspection"); } });
      const forged = Object.create(DrawDataTexture.prototype) as DrawDataTexture;
      expect(retainPackedLoopDrawData(device, alias)).toBe(false);
      expect(retainPackedLoopDrawData(device, forged)).toBe(false);
      expect(packedLoopDrawDataCurrent(device, alias)).toBe(false);
      expect(dataReads).toBe(0);
      device.endFrame();
      frame.finish(() => () => {});
      expect(texture.disposed).toBe(false); // no transfer occurred
    } finally { data.dispose(); device.dispose(); }
  });

  it("does not take ownership if a completion probe ends the active frame", async () => {
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const data = new DrawDataTexture(1), texture = data.upload();
    try {
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      gl.onCompletionProbe(() => { gl.onCompletionProbe(undefined); renderer.device.endFrame(); });
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(false);
      expect(packedLoopDrawDataCurrent(renderer.device, data)).toBe(false);
      frame.finish(() => () => {});
      expect(texture.disposed).toBe(false);
    } finally { gl.onCompletionProbe(undefined); data.dispose(); renderer.dispose(); }
  });

  it("does not take ownership if a completion probe replaces a trusted device method", async () => {
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const data = new DrawDataTexture(1), texture = data.upload(), draw = renderer.device.draw;
    try {
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      gl.onCompletionProbe(() => { gl.onCompletionProbe(undefined); renderer.device.draw = () => {}; });
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(false);
      expect(packedLoopDrawDataCurrent(renderer.device, data)).toBe(false);
      renderer.device.draw = draw;
      renderer.device.endFrame();
      frame.finish(() => () => {});
      expect(texture.disposed).toBe(false);
    } finally { gl.onCompletionProbe(undefined); renderer.device.draw = draw; data.dispose(); renderer.dispose(); }
  });

  it("accepts at most one transfer when a completion probe reenters", async () => {
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const data = new DrawDataTexture(1), texture = data.upload();
    try {
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      let nested = false;
      gl.onCompletionProbe(() => { gl.onCompletionProbe(undefined); nested = retainPackedLoopDrawData(renderer.device, data); });
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(false);
      expect(nested).toBe(true);
      expect(texture.disposed).toBe(false);
      renderer.device.endFrame();
      // This fixture submitted no GPU work; synchronous renderer retirement is safe.
      frame.finish((release) => { release(); return () => {}; });
      expect(texture.disposed).toBe(true);
    } finally { gl.onCompletionProbe(undefined); data.dispose(); renderer.dispose(); }
  });

  it("removes the pending registration when retirement happens during registration", async () => {
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const data = new DrawDataTexture(1), texture = data.upload();
    try {
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(true);
      renderer.device.endFrame();
      let removals = 0;
      frame.finish((release) => { release(); return () => { removals += 1; }; });
      expect(removals).toBe(1);
      expect(texture.disposed).toBe(true);
      frame.release();
      expect(removals).toBe(1);
    } finally { data.dispose(); renderer.dispose(); }
  });

  it("retains a transferred draw-data texture until its WebGL fence completes and never reuses it", async () => {
    vi.useFakeTimers();
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const data = new DrawDataTexture(2), texture = data.upload();
    const otherDevice = new MockRenderDevice();
    registerPackedLoopDevice(otherDevice);
    const disposeTexture = vi.spyOn(texture, "dispose");
    let retire = () => {};
    try {
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(true);
      expect(packedLoopDrawDataCurrent(renderer.device, data)).toBe(true);
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(false);
      renderer.device.endFrame();
      frame.finish((cleanup) => { retire = cleanup; return () => {}; });
      expect(packedLoopDrawDataCurrent(renderer.device, data)).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(texture.disposed).toBe(false);

      renderer.device.beginFrame(8, 8);
      const secondFrame = beginPackedLoopFrame(renderer.device)!;
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(false);
      renderer.device.endFrame();
      secondFrame.finish(() => () => {});
      otherDevice.beginFrame(8, 8);
      const otherFrame = beginPackedLoopFrame(otherDevice)!;
      expect(retainPackedLoopDrawData(otherDevice, data)).toBe(false);
      otherDevice.endFrame();
      otherFrame.finish(() => () => {});
      gl.signal();
      await vi.advanceTimersByTimeAsync(8);
      expect(texture.disposed).toBe(true);
      expect(disposeTexture).toHaveBeenCalledTimes(1);
      renderer.device.beginFrame(8, 8);
      const thirdFrame = beginPackedLoopFrame(renderer.device)!;
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(false);
      renderer.device.endFrame();
      thirdFrame.finish(() => () => {});
      retire(); frame.release();
      expect(disposeTexture).toHaveBeenCalledTimes(1);
    } finally { retire(); data.dispose(); otherDevice.dispose(); renderer.dispose(); disposeTexture.mockRestore(); vi.useRealTimers(); }
  });

  it.each(["failure", "loss"] as const)("keeps or retires draw data correctly on WebGL fence %s", async (outcome) => {
    vi.useFakeTimers();
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const data = new DrawDataTexture(1), texture = data.upload();
    const disposeTexture = vi.spyOn(texture, "dispose");
    let retire = () => {};
    try {
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      expect(retainPackedLoopDrawData(renderer.device, data)).toBe(true);
      renderer.device.endFrame();
      frame.finish((cleanup) => { retire = cleanup; return () => {}; });
      if (outcome === "failure") {
        gl.fail();
        await vi.advanceTimersByTimeAsync(0);
        expect(texture.disposed).toBe(false);
        renderer.device.beginFrame(8, 8);
        expect(beginPackedLoopFrame(renderer.device)).toBeUndefined();
        renderer.device.endFrame();
        retire();
      } else {
        gl.lose();
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(texture.disposed).toBe(true);
      expect(disposeTexture).toHaveBeenCalledTimes(1);
      retire(); frame.release();
      expect(disposeTexture).toHaveBeenCalledTimes(1);
    } finally { retire(); data.dispose(); renderer.dispose(); disposeTexture.mockRestore(); vi.useRealTimers(); }
  });

  it("attempts all transferred texture disposals when one disposal throws", () => {
    const device = new MockRenderDevice();
    const first = new DrawDataTexture(1), second = new DrawDataTexture(1);
    const firstTexture = first.upload(), secondTexture = second.upload();
    const failure = new Error("draw-data texture disposal failed");
    const failDispose = vi.spyOn(firstTexture, "dispose").mockImplementation(() => { throw failure; });
    const secondDispose = vi.spyOn(secondTexture, "dispose");
    registerPackedLoopDevice(device);
    try {
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      expect(retainPackedLoopDrawData(device, first)).toBe(true);
      expect(retainPackedLoopDrawData(device, second)).toBe(true);
      device.endFrame();
      let thrown: unknown;
      try { frame.finish(() => () => {}); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors[0]).toBeInstanceOf(AggregateError);
      expect(((thrown as AggregateError).errors[0] as AggregateError).errors).toContain(failure);
      expect(failDispose).toHaveBeenCalledTimes(1);
      expect(secondDispose).toHaveBeenCalledTimes(1);
      expect(secondTexture.disposed).toBe(true);
      frame.release();
      expect(failDispose).toHaveBeenCalledTimes(1);
    } finally {
      failDispose.mockRestore(); secondDispose.mockRestore();
      firstTexture.dispose(); first.dispose(); second.dispose(); device.dispose();
    }
  });

  it("releases every retained generation when another generation fails to dispose", () => {
    const device = new MockRenderDevice(), material = new UnlitMaterial();
    const firstGeometry = Geometry.triangle(), secondGeometry = Geometry.triangle();
    const firstBatch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    const secondBatch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let releaseFirst = () => {}, releaseSecond = () => {};
    let restoreFirst = () => {};
    try {
      firstBatch.addInstance(firstBatch.addGeometry(firstGeometry));
      secondBatch.addInstance(secondBatch.addGeometry(secondGeometry));
      const first = createBatchedLoopItems(firstBatch.state, firstBatch.toJSON(), identity, material);
      const second = createBatchedLoopItems(secondBatch.state, secondBatch.toJSON(), identity, material);
      releaseFirst = first.release; releaseSecond = second.release;
      registerPackedLoopDevice(device);
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      expect(packedLoopCandidate(device, first.items[0]!)).toBeDefined();
      expect(packedLoopCandidate(device, second.items[0]!)).toBeDefined();
      device.endFrame();
      releaseFirst(); releaseSecond(); firstBatch.dispose(); secondBatch.dispose();
      const failure = new Error("first generation disposal failed");
      const dispose = vi.spyOn(first.lease!.geometry, "dispose").mockImplementation(() => { throw failure; });
      restoreFirst = () => { dispose.mockRestore(); first.lease!.geometry.dispose(); };
      let thrown: unknown;
      try { frame.finish(() => () => {}); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(AggregateError);
      const poolFailure = (thrown as AggregateError).errors[0] as AggregateError;
      expect(poolFailure).toBeInstanceOf(AggregateError);
      expect(poolFailure.errors).toContain(failure);
      expect(() => second.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally {
      restoreFirst(); releaseFirst(); releaseSecond(); firstBatch.dispose(); secondBatch.dispose();
      firstGeometry.dispose(); secondGeometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it("retains a factory-created WebGL2 loop until its own fence signals", async () => {
    vi.useFakeTimers();
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(geometry));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      release = prepared.release;
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device);
      expect(frame).toBeDefined();
      expect(packedLoopCandidate(renderer.device, prepared.items[0]!)).toBeDefined();
      renderer.device.endFrame();
      let pending = 0;
      frame!.finish(() => { pending += 1; return () => { pending -= 1; }; });
      release(); batch.dispose();
      await vi.advanceTimersByTimeAsync(0);
      expect(pending).toBe(1);
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).not.toThrow();
      gl.signal();
      await vi.advanceTimersByTimeAsync(8);
      expect(pending).toBe(0);
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { release(); batch.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); vi.useRealTimers(); }
  });

  it("submits packed ranges through a factory-created WebGL2 renderer", async () => {
    vi.useFakeTimers();
    const gl = webglFenceCanvas(true);
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8, qrFlags: flags });
    const first = Geometry.triangle(), second = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(first)); batch.addInstance(batch.addGeometry(second));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      release = prepared.release;
      renderer.render({ source: { renderItems: prepared.items, cameraPolicy: "identity", frustumCulling: false, shadow: { enabled: false } } });
      expect(gl.draws).toEqual(prepared.items.map((item) => packedLoopMemberFor(item)!.packedRange.start * 2));
      expect(prepared.lease!.geometry.vertexBuffer.uploadedBuffer).not.toBeNull();
      expect(first.vertexBuffer.uploadedBuffer).toBeNull();
      expect(second.vertexBuffer.uploadedBuffer).toBeNull();
      release(); batch.dispose();
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).not.toThrow();
      gl.signal();
      await vi.advanceTimersByTimeAsync(0);
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { release(); batch.dispose(); first.dispose(); second.dispose(); material.dispose(); renderer.dispose(); vi.useRealTimers(); }
  });

  it("keeps unsupported or overridden WebGL2 devices on the logical path", async () => {
    const unsupported = webglFenceCanvas(false), supported = webglFenceCanvas(true);
    const a = await Renderer.create({ backend: "webgl2", canvas: unsupported.canvas, width: 8, height: 8 });
    const b = await Renderer.create({ backend: "webgl2", canvas: supported.canvas, width: 8, height: 8 });
    try {
      a.device.beginFrame(8, 8);
      expect(beginPackedLoopFrame(a.device)).toBeUndefined();
      a.device.endFrame();
      const draw = b.device.draw;
      b.device.draw = () => {};
      b.device.beginFrame(8, 8);
      expect(beginPackedLoopFrame(b.device)).toBeUndefined();
      b.device.endFrame();
      b.device.draw = draw;
    } finally { a.dispose(); b.dispose(); }
  });

  it("retains a WebGL2 generation after fence failure and disables later packed frames", async () => {
    vi.useFakeTimers();
    const gl = webglFenceCanvas(true);
    const renderer = await Renderer.create({ backend: "webgl2", canvas: gl.canvas, width: 8, height: 8 });
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let release = () => {}, retire = () => {};
    try {
      batch.addInstance(batch.addGeometry(geometry));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      release = prepared.release;
      renderer.device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(renderer.device)!;
      expect(packedLoopCandidate(renderer.device, prepared.items[0]!)).toBeDefined();
      renderer.device.endFrame();
      frame.finish((cleanup) => { retire = cleanup; return () => {}; });
      release(); batch.dispose();
      gl.fail();
      await vi.advanceTimersByTimeAsync(0);
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).not.toThrow();
      renderer.device.beginFrame(8, 8);
      expect(beginPackedLoopFrame(renderer.device)).toBeUndefined();
      renderer.device.endFrame();
      retire();
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { retire(); release(); batch.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); vi.useRealTimers(); }
  });

  it("deduplicates frame retention across members and waits for native queue completion", async () => {
    let complete!: () => void;
    const fence = new Promise<void>((resolve) => { complete = resolve; });
    const native = { queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: () => fence },
      createBuffer: () => ({ destroy() {} }), destroy() {} } as unknown as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    const first = Geometry.triangle(), second = Geometry.triangle(), material = new UnlitMaterial();
    const batch = batched.mesh({ maxInstances: 2, multiDraw: "loop" });
    let release = () => {};
    try {
      batch.addInstance(batch.addGeometry(first)); batch.addInstance(batch.addGeometry(second));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      release = prepared.release;
      const packet = packedLoopMemberFor(prepared.items[0])!;
      const retain = vi.spyOn(packet.pool, "retainGeneration");
      registerPackedLoopDevice(device);
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      expect(packedLoopCandidate(device, prepared.items[0]!)).toBeDefined();
      expect(packedLoopCandidate(device, prepared.items[1]!)).toBeDefined();
      expect(retain).toHaveBeenCalledTimes(1);
      device.endFrame();
      let pending = 0;
      frame.finish(() => { pending += 1; return () => { pending -= 1; }; });
      release(); batch.dispose();
      expect(pending).toBe(1);
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).not.toThrow();
      complete();
      await fence;
      await Promise.resolve();
      expect(pending).toBe(0);
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
      retain.mockRestore();
    } finally { complete(); release(); batch.dispose(); first.dispose(); second.dispose(); material.dispose(); device.dispose(); }
  });

  it("keeps a generation after a rejected fence until the renderer retires it", async () => {
    let reject!: (reason: Error) => void;
    const fence = new Promise<void>((_resolve, fail) => { reject = fail; });
    const native = { queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: () => fence },
      createBuffer: () => ({ destroy() {} }), destroy() {} } as unknown as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), batch = batched.mesh({ maxInstances: 1, multiDraw: "loop" });
    let release = () => {}, retire = () => {};
    try {
      batch.addInstance(batch.addGeometry(geometry));
      const prepared = createBatchedLoopItems(batch.state, batch.toJSON(), identity, material);
      release = prepared.release;
      registerPackedLoopDevice(device);
      device.beginFrame(8, 8);
      const frame = beginPackedLoopFrame(device)!;
      expect(packedLoopCandidate(device, prepared.items[0]!)).toBeDefined();
      device.endFrame();
      frame.finish((cleanup) => { retire = cleanup; return () => {}; });
      release(); batch.dispose();
      reject(new Error("fence failed"));
      await fence.catch(() => undefined);
      await Promise.resolve();
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).not.toThrow();
      device.beginFrame(8, 8);
      expect(beginPackedLoopFrame(device)).toBeUndefined();
      device.endFrame();
      retire();
      expect(() => prepared.lease!.geometry.vertexBuffer.readBytes()).toThrow(/disposed/i);
    } finally { retire(); release(); batch.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("translates indexed and unindexed source ranges, including empty ranges", () => {
    const indexedA = Geometry.triangle(), indexedB = Geometry.triangle();
    const plainA = unindexedTriangle(), plainB = unindexedTriangle();
    const indexed = new BatchedGeometryPool(), plain = new BatchedGeometryPool();
    try {
      indexed.pack(indexedA); indexed.pack(indexedB);
      plain.pack(plainA); plain.pack(plainB);
      expect(indexed.translateSourceRange(indexedB, { start: 1, count: 2 })).toEqual({ start: 4, count: 2 });
      expect(indexed.translateSourceRange(indexedB, { start: 3, count: 0 })).toEqual({ start: 6, count: 0 });
      expect(plain.translateSourceRange(plainB, { start: 1, count: 2 })).toEqual({ start: 4, count: 2 });
      expect(plain.translateSourceRange(plainB, { start: 3, count: 0 })).toEqual({ start: 6, count: 0 });
      expect(() => indexed.translateSourceRange(indexedB, { start: 2, count: 2 })).toThrow(RangeError);
      expect(() => plain.translateSourceRange(plainB, { start: -1, count: 1 })).toThrow(RangeError);
      expect(() => plain.translateSourceRange(plainB, { start: 0, count: Infinity })).toThrow(RangeError);
    } finally { indexed.dispose(); plain.dispose(); indexedA.dispose(); indexedB.dispose(); plainA.dispose(); plainB.dispose(); }
  });

  it("detects unmarked vertex and index byte writes as well as marked revisions", () => {
    const geometry = Geometry.triangle();
    const pool = new BatchedGeometryPool();
    try {
      pool.pack(geometry);
      expect(pool.sourceMatchesPacked(geometry)).toBe(true);
      const bytes = new Uint8Array(geometry.vertexBuffer.data);
      const previousByte = bytes[0]!;
      bytes[0] = previousByte ^ 1;
      expect(pool.sourceMatchesPacked(geometry)).toBe(false);
      bytes[0] = previousByte;
      expect(pool.sourceMatchesPacked(geometry)).toBe(true);
      const indices = geometry.indexBuffer!.data;
      const previousIndex = indices[0]!;
      indices[0] = 2;
      expect(pool.sourceMatchesPacked(geometry)).toBe(false);
      indices[0] = previousIndex;
      expect(pool.sourceMatchesPacked(geometry)).toBe(true);
      geometry.vertexBuffer.markDirtyRange(0, 1);
      expect(pool.sourceMatchesPacked(geometry)).toBe(false);
    } finally { pool.dispose(); geometry.dispose(); }
  });

  it("detects direct edits to the packed materialization even before lease acquisition", () => {
    const source = Geometry.triangle(), pool = new BatchedGeometryPool();
    pool.pack(source);
    const packed = pool.asGeometry();
    const bytes = new Uint8Array(packed.vertexBuffer.data);
    const originalByte = bytes[0]!;
    bytes[0] = originalByte ^ 1;
    const lease = pool.retainGeneration();
    try {
      expect(pool.packedGeometryMatches(lease)).toBe(false);
      bytes[0] = originalByte;
      expect(pool.packedGeometryMatches(lease)).toBe(true);
      const indices = packed.indexBuffer!.data;
      const originalIndex = indices[0]!;
      indices[0] = 2;
      expect(pool.packedGeometryMatches(lease)).toBe(false);
      indices[0] = originalIndex;
      expect(pool.packedGeometryMatches(lease)).toBe(true);
      packed.vertexBuffer.markDirtyRange(0, 1);
      expect(pool.packedGeometryMatches(lease)).toBe(false);
      let traps = 0;
      const unknown = new Proxy({}, { get() { traps += 1; throw new Error("unexpected property read"); } });
      expect(pool.packedGeometryMatches(unknown as typeof lease)).toBe(false);
      expect(traps).toBe(0);
    } finally { lease.release(); pool.dispose(); source.dispose(); }
  });

  it("copies logical member snapshots and transfers identities without touching proxy properties", () => {
    const source = Geometry.triangle();
    const pool = new BatchedGeometryPool();
    pool.pack(source);
    const lease = pool.retainGeneration();
    const model = [...identity];
    const bounds = { min: [-1, -1, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
    const range = { start: 1, count: 2 };
    const color: [number, number, number, number] = [1, 0.5, 0.25, 1];
    const logical: RenderItem = { geometry: source, modelMatrix: model };
    const carrier: RenderItem = { geometry: lease.geometry };
    const projectedLogical: RenderItem = { geometry: source, modelMatrix: [...model] };
    try {
      const packet = rememberPackedLoopMember(carrier, {
        logicalItem: logical, logicalMaterial: logical.material, batchId: "batch-a", stateVersion: 4, nodeId: "node-a", batchMemberId: 7,
        geometryId: 0, drawIndex: 1, sourceGeometry: source, sourceRange: range,
        sourceDrawRange: range, itemDrawRange: undefined, sourceBounds: bounds, worldBounds: bounds,
        localMatrix: model, modelMatrix: model, color, topology: source.topology,
        streams: [{ slot: 0, buffer: source.vertexBuffer, revision: source.vertexBuffer.revision }],
        indexBuffer: source.indexBuffer, indexRevision: source.indexBuffer!.revision,
        pool, lease, packedRange: pool.translateSourceRange(source, range)
      });
      model[12] = 99; range.start = 0; bounds.min[0] = -99; color[0] = 0;
      expect(packet.modelMatrix[12]).toBe(0);
      expect(packet.sourceRange).toEqual({ start: 1, count: 2 });
      expect(packet.sourceBounds.min[0]).toBe(-1);
      expect(packet.color[0]).toBe(1);
      expect(Object.isFrozen(packet.modelMatrix)).toBe(true);
      expect(Object.isFrozen(packet.sourceBounds.min)).toBe(true);
      expect(packedLoopMemberFor(logical)).toBe(packet);
      expect(packedLoopMemberFor(carrier)).toBe(packet);
      expect(batchMembersFor(carrier)).toEqual([logical]);
      expect(expandLogicalBatchItems([carrier])).toEqual([logical]);
      const projectedCarrier: RenderItem = { geometry: lease.geometry };
      expect(transferPackedLoopMember(carrier, projectedCarrier, projectedLogical)).toBe(true);
      expect(packedLoopMemberFor(projectedLogical)?.logicalItem).toBe(projectedLogical);
      expect(batchMembersFor(projectedCarrier)).toEqual([projectedLogical]);
      const traps: string[] = [];
      const proxy = new Proxy({}, { get(_target, key) { traps.push(String(key)); throw new Error("unexpected property read"); } });
      expect(packedLoopMemberFor(proxy)).toBeUndefined();
      expect(traps).toEqual([]);
    } finally { lease.release(); pool.dispose(); source.dispose(); }
  });

  it("invalidates a packed member when its logical material changes", () => {
    const source = Geometry.triangle(), pool = new BatchedGeometryPool();
    const material = new UnlitMaterial(), replacement = new UnlitMaterial();
    pool.pack(source);
    const lease = pool.retainGeneration();
    const logical = { geometry: source, material, modelMatrix: [...identity] };
    const carrier: RenderItem = { geometry: lease.geometry };
    const range = { start: 0, count: 3 };
    try {
      const packet = rememberPackedLoopMember(carrier, {
        logicalItem: logical, logicalMaterial: material, batchId: "material-batch", stateVersion: 1,
        batchMemberId: 0, geometryId: 0, drawIndex: 0, sourceGeometry: source, sourceRange: range,
        sourceDrawRange: source.drawRange, itemDrawRange: undefined, sourceBounds: source.bounds,
        worldBounds: source.bounds, localMatrix: identity, modelMatrix: logical.modelMatrix,
        color: [1, 1, 1, 1], topology: source.topology,
        streams: [{ slot: 0, buffer: source.vertexBuffer, revision: source.vertexBuffer.revision }],
        indexBuffer: source.indexBuffer, indexRevision: source.indexBuffer!.revision,
        pool, lease, packedRange: pool.translateSourceRange(source, range)
      });
      expect(packet.logicalMaterial).toBe(material);
      expect(packedLoopMemberResourcesMatch(carrier)).toBe(true);
      logical.material = replacement;
      expect(packedLoopMemberResourcesMatch(carrier)).toBe(false);
      logical.material = material;
      expect(packedLoopMemberResourcesMatch(carrier)).toBe(true);
    } finally { lease.release(); pool.dispose(); source.dispose(); material.dispose(); replacement.dispose(); }
  });

  it("keeps the projected logical identity when both provenance maps transfer", () => {
    const source = Geometry.triangle(), pool = new BatchedGeometryPool();
    pool.pack(source);
    const lease = pool.retainGeneration();
    const logical: RenderItem = { geometry: source, modelMatrix: identity };
    const carrier: RenderItem = { geometry: lease.geometry };
    const projectedLogical: RenderItem = { ...logical, modelMatrix: [...identity] };
    const projectedCarrier: RenderItem = { geometry: lease.geometry };
    const range = { start: 0, count: 3 };
    try {
      const packet = rememberPackedLoopMember(carrier, {
        logicalItem: logical, logicalMaterial: logical.material, batchId: "projection-batch", stateVersion: 1,
        batchMemberId: 0, geometryId: 0, drawIndex: 0, sourceGeometry: source, sourceRange: range,
        sourceDrawRange: source.drawRange, itemDrawRange: logical.drawRange, sourceBounds: source.bounds,
        worldBounds: source.bounds, localMatrix: identity, modelMatrix: identity,
        color: [1, 1, 1, 1], topology: source.topology,
        streams: [{ slot: 0, buffer: source.vertexBuffer, revision: source.vertexBuffer.revision }],
        indexBuffer: source.indexBuffer, indexRevision: source.indexBuffer!.revision,
        pool, lease, packedRange: pool.translateSourceRange(source, range)
      });
      expect(transferBatchMembers(carrier, projectedCarrier, member => {
        expect(member).toBe(logical);
        expect(transferPackedLoopMember(member, projectedLogical)).toBe(true);
        return projectedLogical;
      })).toBe(true);
      expect(transferPackedLoopMember(carrier, projectedCarrier, projectedLogical)).toBe(true);
      expect(batchMembersFor(projectedCarrier)).toEqual([projectedLogical]);
      expect(expandLogicalBatchItems([projectedCarrier])).toEqual([projectedLogical]);
      expect(packedLoopMemberFor(projectedCarrier)?.logicalItem).toBe(projectedLogical);
      expect(packedLoopMemberFor(projectedLogical)?.logicalItem).toBe(projectedLogical);
      expect(packedLoopMemberFor(projectedCarrier)).toBe(packedLoopMemberFor(projectedLogical));

      const otherLogical: RenderItem = { ...logical };
      const otherCarrier: RenderItem = { geometry: lease.geometry };
      const otherProjection: RenderItem = { ...otherLogical };
      const rejectedCarrier: RenderItem = { geometry: lease.geometry };
      rememberPackedLoopMember(otherCarrier, { ...packet, logicalItem: otherLogical, batchMemberId: 1 });
      expect(transferPackedLoopMember(otherLogical, otherProjection)).toBe(true);
      expect(() => transferPackedLoopMember(carrier, rejectedCarrier, otherProjection)).toThrow();
      expect(batchMembersFor(rejectedCarrier)).toBeUndefined();
      expect(packedLoopMemberFor(rejectedCarrier)).toBeUndefined();
    } finally { lease.release(); pool.dispose(); source.dispose(); }
  });
});

describe("packed pool generation leases", () => {
  it("keeps materializations and replaced arenas alive until every lease releases", () => {
    const first = Geometry.triangle(), second = Geometry.triangle();
    const pool = new BatchedGeometryPool(), device = new MockRenderDevice();
    pool.pack(first);
    const a = pool.retainGeneration(), b = pool.retainGeneration();
    expect(a.geometry).toBe(b.geometry);
    const geometryBuffer = a.geometry.vertexBuffer.upload(device);
    const oldArena = pool.upload(device).vertexBuffer;
    let c: ReturnType<typeof pool.retainGeneration> | undefined;
    try {
      pool.pack(second);
      expect(a.isCurrent()).toBe(false);
      const nextArena = pool.upload(device).vertexBuffer;
      c = pool.retainGeneration();
      const nextGeometryBuffer = c.geometry.vertexBuffer.upload(device);
      expect(c.isCurrent()).toBe(true);
      expect(oldArena.disposed).toBe(false);
      pool.dispose();
      expect(c.isCurrent()).toBe(false);
      expect([oldArena, nextArena, geometryBuffer, nextGeometryBuffer].map((buffer) => buffer.disposed)).toEqual([false, false, false, false]);
      a.release(); a.release(); b.release();
      expect([oldArena, nextArena, geometryBuffer, nextGeometryBuffer].map((buffer) => buffer.disposed)).toEqual([false, false, false, false]);
      c.release();
      expect([oldArena, nextArena, geometryBuffer, nextGeometryBuffer].map((buffer) => buffer.disposed)).toEqual([true, true, true, true]);
      expect(first.vertexBuffer.upload(device).disposed).toBe(false);
    } finally { a.release(); b.release(); c?.release(); pool.dispose(); device.dispose(); first.dispose(); second.dispose(); }
  });

  it("keeps a leased old arena through restore and releases it after the lease", async () => {
    const geometry = Geometry.triangle(), pool = new BatchedGeometryPool(), device = new MockRenderDevice();
    const registry = new ResourceRegistry();
    pool.pack(geometry);
    pool.registerForRestore(registry);
    const before = pool.upload(device).vertexBuffer;
    const lease = pool.retainGeneration();
    try {
      expect(await registry.rebuild(device)).toEqual({ rebuilt: 1, refetched: 0, failed: [] });
      const after = pool.upload(device).vertexBuffer;
      expect(after).not.toBe(before);
      expect(before.disposed).toBe(false);
      expect(lease.isCurrent()).toBe(true);
      lease.release();
      expect(before.disposed).toBe(true);
      expect(after.disposed).toBe(false);
    } finally { lease.release(); pool.dispose(); geometry.dispose(); device.dispose(); }
    expect(registry.size).toBe(0);
  });

  it("does not let retirement of an old lifetime dispose a reused pool", () => {
    const geometry = Geometry.triangle(), pool = new BatchedGeometryPool(), device = new MockRenderDevice();
    pool.pack(geometry);
    const oldLease = pool.retainGeneration();
    const oldBuffer = oldLease.geometry.vertexBuffer.upload(device);
    pool.dispose();
    pool.pack(geometry);
    const nextLease = pool.retainGeneration();
    const nextBuffer = nextLease.geometry.vertexBuffer.upload(device);
    try {
      oldLease.release();
      expect(oldBuffer.disposed).toBe(true);
      expect(nextBuffer.disposed).toBe(false);
      expect(nextLease.isCurrent()).toBe(true);
    } finally { oldLease.release(); nextLease.release(); pool.dispose(); geometry.dispose(); device.dispose(); }
  });
});
