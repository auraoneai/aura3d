import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type BufferUsage, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Material } from "../../../packages/rendering/src/Material";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { ForwardPass } from "../../../packages/rendering/src/ForwardPass";
import { RenderPipeline } from "../../../packages/rendering/src/RenderPipeline";
import { submitDraw } from "../../../packages/rendering/src/forward/DrawSubmit";
import { BatchedGeometryPool } from "../../../packages/rendering/src/batching/BatchedGeometryPool";
import { geometryContentKey } from "../../../packages/rendering/src/batching/ContentKeys";
import { planBatches } from "../../../packages/rendering/src/batching/StaticMergePlanner";
import { BatchPlanCache, applyRendererOwnedStaticBatching, applyRendererOwnedStaticMeshConsolidation } from "../../../packages/rendering/src/renderer/CullingBatching";
import { createStaticMeshConsolidationCache } from "../../../packages/rendering/src/MeshConsolidation";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

class TrackingDevice extends MockRenderDevice {
  public generation = 0;
  public readonly updates: { offset: number; bytes: number[] }[] = [];
  public failCreate = false;
  public failUpdate = false;

  override createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    if (this.failCreate) throw new Error("create failed");
    return super.createBuffer(usage, byteLength, initialData);
  }

  override updateBuffer(buffer: RenderBuffer, offset: number, data: ArrayBufferView): void {
    if (this.failUpdate) throw new Error("update failed");
    this.updates.push({ offset, bytes: Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) });
    super.updateBuffer(buffer, offset, data);
  }
}

describe("native vertex formats and buffers", () => {
  it("retains exact typed storage and exposes normalized shader values separately", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 12, type: "uint8", normalized: true },
      { semantic: "joints", components: 4, offset: 16, type: "uint16", integer: true },
      { semantic: "weights", components: 4, offset: 24, type: "int8", normalized: true },
      { semantic: "uv", components: 2, offset: 28, type: "uint32", integer: true }
    ], 36);
    const buffer = new VertexBuffer(format, 2);
    buffer.setAttribute(1, "position", [1, 2, 3]);
    buffer.setAttribute(1, "color", [0, 128, 255, 64]);
    buffer.setAttribute(1, "joints", [1, 256, 65535, 42]);
    buffer.setAttribute(1, "weights", [-128, -127, 0, 127]);
    buffer.setAttribute(1, "uv", [4294967295, 2147483648]);

    expect(buffer.getAttribute(1, "color")).toEqual([0, 128, 255, 64]);
    expect(buffer.getDecodedAttribute(1, "color")).toEqual([0, 128 / 255, 1, 64 / 255]);
    expect(buffer.getDecodedAttribute(1, "weights")).toEqual([-1, -1, 0, 1]);
    expect(buffer.getAttribute(1, "joints")).toEqual([1, 256, 65535, 42]);
    expect(buffer.getAttribute(1, "uv")).toEqual([4294967295, 2147483648]);
    expect(Array.from(buffer.readBytes(48, 24))).toEqual([
      0, 128, 255, 64, 1, 0, 0, 1, 255, 255, 42, 0,
      128, 129, 0, 127, 255, 255, 255, 255, 0, 0, 0, 128
    ]);
  });

  it("validates all values before modifying data or marking a range dirty", () => {
    const format = new VertexFormat([{ semantic: "joints", components: 4, offset: 0, type: "uint8", integer: true }]);
    const buffer = new VertexBuffer(format, 1);
    const device = new TrackingDevice();
    buffer.setAttribute(0, "joints", [1, 2, 3, 4]);
    buffer.upload(device);
    for (const values of [[8, 9, 256, 10], [8, 9, -1, 10], [8, 9, 0.5, 10], [8, 9, NaN, 10]]) {
      expect(() => buffer.setAttribute(0, "joints", values)).toThrow();
      expect(buffer.getAttribute(0, "joints")).toEqual([1, 2, 3, 4]);
      expect(buffer.getDirtyRange()).toBeNull();
    }
  });

  it("uses each stream's independent stride, record count and step mode", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, bufferSlot: 2, type: "uint8", normalized: true }
    ], 12, [{ slot: 2, stride: 4, stepMode: "instance", divisor: 2 }]);
    const vertices = new VertexBuffer(format, 3);
    const instances = new VertexBuffer(format, 2, 2);
    vertices.setAttribute(2, "position", [4, 5, 6]);
    instances.setAttribute(1, "color", [255, 128, 64, 0]);

    expect(format.streams).toEqual([
      { slot: 0, stride: 12, stepMode: "vertex", divisor: 0 },
      { slot: 2, stride: 4, stepMode: "instance", divisor: 2 }
    ]);
    expect(vertices.byteLength).toBe(36);
    expect(instances.byteLength).toBe(8);
    expect(instances.getAttribute(1, "color")).toEqual([255, 128, 64, 0]);
    expect(() => instances.getAttribute(0, "position")).toThrow(/slot 0/);
    expect(() => vertices.setAttribute(0, "color", [0, 0, 0, 0])).toThrow(/slot 2/);
    expect(() => new VertexBuffer(format, 1, 1)).toThrow(/slot 1/);
  });

  it("validates storage alignment, instance divisors and illegal attribute combinations", () => {
    const inferred = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 3, offset: 12, type: "uint8" }
    ]);
    expect(inferred.stride).toBe(16);
    expect(() => new VertexFormat([{ semantic: "position", components: 3, offset: 1, type: "int16" }])).toThrow(/2-byte aligned/);
    expect(() => new VertexFormat([{ semantic: "position", components: 1, offset: 0, type: "uint16" }], 3)).toThrow(/2-byte aligned/);
    expect(() => new VertexFormat([{ semantic: "position", components: 1, offset: 0, type: "float32", integer: true }])).toThrow(/integer input/);
    expect(() => new VertexFormat([{ semantic: "color", components: 4, offset: 0, type: "uint8", integer: true, normalized: true }])).toThrow(/integer input/);
    expect(() => new VertexFormat([{ semantic: "position", components: 1, offset: 0 }], 4, [{ slot: 0, stride: 4, stepMode: "instance", divisor: 0 }])).toThrow(/divisor/);
    expect(() => new VertexFormat([{ semantic: "position", components: 1, offset: 0 }], 4, [{ slot: 0, stride: 4, stepMode: "vertex", divisor: 1 }])).toThrow(/divisor/);
    // Existing built-in aliasing remained legal before typed layouts were added.
    expect(() => new VertexFormat([
      { semantic: "position", components: 1, offset: 0 },
      { semantic: "normal", components: 1, offset: 4, shaderLocation: 0 }
    ])).not.toThrow();
  });

  it("uploads exact dirty bytes, including an unaligned final byte", () => {
    const format = new VertexFormat([{ semantic: "color", components: 3, offset: 0, type: "uint8" }]);
    const buffer = new VertexBuffer(format, 2);
    const device = new TrackingDevice();
    buffer.setAttribute(0, "color", [1, 2, 3]);
    buffer.setAttribute(1, "color", [4, 5, 6]);
    const gpu = buffer.upload(device);
    buffer.writeBytes(5, Uint8Array.of(17));
    expect(buffer.getDirtyRange()).toEqual({ start: 5, end: 6 });
    expect(buffer.upload(device)).toBe(gpu);
    expect(device.updates).toEqual([{ offset: 5, bytes: [17] }]);
    expect(Array.from(device.readBuffer(gpu))).toEqual([1, 2, 3, 4, 5, 17]);
    expect(buffer.getDirtyRange()).toBeNull();
  });

  it("copies typed-view windows and overlapping byte ranges without conversion", () => {
    const format = new VertexFormat([{ semantic: "color", components: 4, offset: 0, type: "uint8" }]);
    const buffer = new VertexBuffer(format, 2);
    const source = Uint8Array.of(9, 10, 11, 12, 13, 14);
    buffer.writeBytes(2, source.subarray(1, 5));
    expect(Array.from(buffer.readBytes())).toEqual([0, 0, 10, 11, 12, 13, 0, 0]);
    buffer.writeBytes(3, new Uint8Array(buffer.data, 2, 4));
    expect(Array.from(buffer.readBytes())).toEqual([0, 0, 10, 10, 11, 12, 13, 0]);
    const copy = buffer.readBytes(2, 2);
    copy[0] = 99;
    expect(buffer.readBytes(2, 2)[0]).toBe(10);
  });

  it("rejects fractional, non-finite and out-of-bounds byte ranges without changing state", () => {
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    const device = new TrackingDevice();
    buffer.upload(device);
    for (const [offset, length] of [[-1, 1], [0.5, 1], [0, 1.5], [NaN, 1], [0, Infinity], [12, 1], [13, 0]]) {
      expect(() => buffer.readBytes(offset, length)).toThrow(RangeError);
      expect(() => buffer.markDirtyRange(offset, length)).toThrow(RangeError);
    }
    expect(() => buffer.writeBytes(11, Uint8Array.of(1, 2))).toThrow(RangeError);
    expect(buffer.readBytes()).toEqual(new Uint8Array(12));
    expect(buffer.getDirtyRange()).toBeNull();
    buffer.markDirtyRange(12, 0);
    expect(buffer.getDirtyRange()).toBeNull();
  });

  it("supports explicit dirty ranges for direct writes through legacy views", () => {
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    const device = new TrackingDevice();
    const gpu = buffer.upload(device);
    expect(buffer.revision).toBe(0);
    buffer.floats[1] = 42;
    buffer.markDirtyRange(4, 4);
    expect(buffer.revision).toBe(1);
    buffer.upload(device);
    expect(buffer.revision).toBe(1);
    expect(device.updates.map(({ offset, bytes }) => [offset, bytes.length])).toEqual([[4, 4]]);
    expect(new DataView(device.readBuffer(gpu).buffer).getFloat32(4, true)).toBe(42);
  });

  it("keeps one independently synchronized resource per device", () => {
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const gpuA = buffer.upload(a);
    const gpuB = buffer.upload(b);
    expect(gpuA).not.toBe(gpuB);
    expect(buffer.uploadedBuffer).toBe(gpuB);
    buffer.setAttribute(0, "position", [2, 3, 4]);
    buffer.upload(a);
    expect(buffer.getDirtyRange()).toEqual({ start: 0, end: 12 });
    expect(Array.from(new Float32Array(b.readBuffer(gpuB).buffer))).toEqual([0, 0, 0]);
    buffer.upload(b);
    expect(buffer.getDirtyRange()).toBeNull();
    expect(Array.from(new Float32Array(a.readBuffer(gpuA).buffer))).toEqual([2, 3, 4]);
    expect(Array.from(new Float32Array(b.readBuffer(gpuB).buffer))).toEqual([2, 3, 4]);
    buffer.dispose();
    buffer.dispose();
    expect(gpuA.disposed).toBe(true);
    expect(gpuB.disposed).toBe(true);
    expect(() => buffer.upload(a)).toThrow(/disposed/);
  });

  it("attempts to release every device resource if one disposal fails", () => {
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const first = buffer.upload(a);
    const second = buffer.upload(b);
    const failure = vi.spyOn(first, "dispose").mockImplementationOnce(() => { throw new Error("release failed"); });
    const success = vi.spyOn(second, "dispose");
    expect(() => buffer.dispose()).toThrow(/disposal failed/);
    expect(second.disposed).toBe(true);
    expect(first.disposed).toBe(false);
    expect(() => buffer.upload(a)).toThrow(/disposed/);
    expect(() => buffer.dispose()).not.toThrow();
    expect(first.disposed).toBe(true);
    expect(failure).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledOnce();
    failure.mockRestore();
    success.mockRestore();
    a.dispose();
    b.dispose();
  });

  it("retries failed uploads and replaces an externally disposed or prior-generation resource", () => {
    const buffer = new VertexBuffer(VertexFormat.P3, 1);
    const device = new TrackingDevice();
    device.failCreate = true;
    expect(() => buffer.upload(device)).toThrow(/create failed/);
    expect(buffer.getDirtyRange()).toEqual({ start: 0, end: 12 });
    device.failCreate = false;
    const first = buffer.upload(device);
    buffer.setAttribute(0, "position", [7, 8, 9]);
    device.failUpdate = true;
    expect(() => buffer.upload(device)).toThrow(/update failed/);
    expect(buffer.getDirtyRange()).toEqual({ start: 0, end: 12 });
    device.failUpdate = false;
    buffer.upload(device);
    expect(Array.from(new Float32Array(device.readBuffer(first).buffer))).toEqual([7, 8, 9]);
    first.dispose();
    const second = buffer.upload(device);
    expect(second).not.toBe(first);
    device.generation += 1;
    const third = buffer.upload(device);
    expect(third).not.toBe(second);
    expect(second.disposed).toBe(true);
    expect(Array.from(new Float32Array(device.readBuffer(third).buffer))).toEqual([7, 8, 9]);
    device.contextLost = true;
    expect(() => buffer.upload(device)).toThrow(/lost/);
    device.contextLost = false;
    device.dispose();
    expect(() => buffer.upload(device)).toThrow(/disposed/);
  });
});

describe("vertex stream geometry and draw submission", () => {
  function streamGeometry(instanceRecords = 2): Geometry {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, type: "uint8", normalized: true, bufferSlot: 2 }
    ], 12, [{ slot: 2, stride: 4, stepMode: "instance", divisor: 2 }]);
    const vertices = new VertexBuffer(format, 3);
    vertices.setAttribute(0, "position", [0, 0, 0]);
    vertices.setAttribute(1, "position", [1, 0, 0]);
    vertices.setAttribute(2, "position", [0, 1, 0]);
    const colors = new VertexBuffer(format, instanceRecords, 2);
    colors.setAttribute(0, "color", [255, 128, 0, 255]);
    return new Geometry(vertices, null, "triangles", undefined, [colors]);
  }

  it("computes and refreshes normalized bounds from the actual position stream", () => {
    const format = new VertexFormat([
      { semantic: "uv", components: 2, offset: 0 },
      { semantic: "position", components: 3, offset: 0, type: "int8", normalized: true, bufferSlot: 2 }
    ], 8, [{ slot: 2, stride: 3 }]);
    const uv = new VertexBuffer(format, 2);
    const positions = new VertexBuffer(format, 2, 2);
    positions.setAttribute(0, "position", [-128, 0, 127]);
    positions.setAttribute(1, "position", [127, 127, 0]);
    const geometry = new Geometry(uv, null, "triangles", undefined, [positions]);
    expect(geometry.getAttributeBuffer("position")).toBe(positions);
    expect(geometry.bounds).toEqual({ min: [-1, 0, 0], max: [1, 1, 1] });
    positions.setAttribute(1, "position", [0, 0, 0]);
    expect(geometry.refreshBounds()).toEqual({ min: [-1, 0, 0], max: [0, 0, 1] });
    geometry.dispose();
  });

  it("validates missing, duplicate, mismatched and short streams before allocating", () => {
    const geometry = streamGeometry(1);
    const format = geometry.vertexBuffer.format;
    const device = new TrackingDevice();
    const create = vi.spyOn(device, "createBuffer");
    expect(() => geometry.uploadVertexBuffers(device, 3)).toThrow(/requires 2 records/);
    expect(create).not.toHaveBeenCalled();
    expect(() => new Geometry(new VertexBuffer(format, 3))).toThrow(/slot 2/);
    expect(() => new Geometry(new VertexBuffer(format, 3), null, "triangles", undefined, [
      new VertexBuffer(format, 1, 2), new VertexBuffer(format, 1, 2)
    ])).toThrow(/unique/);
    const different = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, type: "int8", normalized: true, bufferSlot: 2 }
    ], 12, [{ slot: 2, stride: 4, stepMode: "instance", divisor: 2 }]);
    expect(() => new Geometry(new VertexBuffer(format, 3), null, "triangles", undefined, [new VertexBuffer(different, 2, 2)])).toThrow(/format|layout/i);
    geometry.dispose();
  });

  it("uploads sparse slots and follows a replaced primary buffer", () => {
    const geometry = streamGeometry();
    const oldPrimary = geometry.vertexBuffer;
    const replacement = new VertexBuffer(oldPrimary.format, 3);
    replacement.setAttribute(0, "position", [7, 8, 9]);
    geometry.vertexBuffer = replacement;
    const device = new TrackingDevice();
    const handles = geometry.uploadVertexBuffers(device, 4);
    expect(handles[0]).toBe(replacement.uploadedBuffer);
    expect(handles[1]).toBeUndefined();
    expect(handles[2]).toBe(geometry.getVertexBuffer(2).uploadedBuffer);
    expect(geometry.refreshBounds().max).toEqual([7, 8, 9]);
    geometry.dispose();
    expect(handles[0]?.disposed).toBe(true);
    expect(handles[2]?.disposed).toBe(true);
    oldPrimary.dispose();
  });

  it("releases extra streams and indices even if the primary stream fails to dispose", () => {
    const geometry = streamGeometry();
    geometry.indexBuffer = new IndexBuffer([0, 1, 2], 3);
    const device = new TrackingDevice();
    const handles = geometry.uploadVertexBuffers(device, 4);
    const index = geometry.indexBuffer.upload(device);
    const primary = geometry.vertexBuffer;
    const failure = vi.spyOn(primary, "dispose").mockImplementationOnce(() => { throw new Error("release failed"); });
    const extra = vi.spyOn(handles[2]!, "dispose");
    const indices = vi.spyOn(index, "dispose");
    expect(() => geometry.dispose()).toThrow(/Geometry disposal failed/);
    expect(geometry.disposed).toBe(false);
    expect(() => geometry.vertexBuffer).toThrow(/disposed/i);
    expect(handles[2]?.disposed).toBe(true);
    expect(index.disposed).toBe(true);
    expect(() => geometry.dispose()).not.toThrow();
    expect(geometry.disposed).toBe(true);
    expect(handles[0]?.disposed).toBe(true);
    expect(failure).toHaveBeenCalledTimes(2);
    expect(extra).toHaveBeenCalledOnce();
    expect(indices).toHaveBeenCalledOnce();
    failure.mockRestore();
    extra.mockRestore();
    indices.mockRestore();
    device.dispose();
  });

  it("retries nested GPU failures through the consolidation cache without repeating successful cleanup", () => {
    const source = Geometry.litTriangle();
    const material = new PBRMaterial();
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
    const cache = createStaticMeshConsolidationCache();
    const result = cache.consolidate([
      { geometry: source, material, modelMatrix: identity },
      { geometry: source, material, modelMatrix: identity }
    ]);
    const geometry = result.renderItems[0]!.geometry;
    const vertices = geometry.vertexBuffer;
    const indices = geometry.indexBuffer!;
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const vertexA = vertices.upload(a);
    const vertexB = vertices.upload(b);
    const indexA = indices.upload(a);
    const indexB = indices.upload(b);
    const vertexError = new Error("vertex device cleanup failed");
    const indexError = new Error("index device cleanup failed");
    const failedVertex = vi.spyOn(vertexA, "dispose").mockImplementationOnce(() => {
      // All three owners may synchronously request teardown from a device callback.
      vertices.dispose();
      geometry.dispose();
      cache.dispose();
      throw vertexError;
    });
    const failedIndex = vi.spyOn(indexA, "dispose").mockImplementationOnce(() => {
      indices.dispose();
      throw indexError;
    });
    const successfulVertex = vi.spyOn(vertexB, "dispose");
    const successfulIndex = vi.spyOn(indexB, "dispose");
    try {
      expect(geometry).not.toBe(source);
      let caught: unknown;
      try { cache.dispose(); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(AggregateError);
      const children = (caught as AggregateError).errors;
      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(AggregateError);
      expect(children[1]).toBeInstanceOf(AggregateError);
      expect((children[0] as AggregateError).errors).toEqual([vertexError]);
      expect((children[1] as AggregateError).errors).toEqual([indexError]);
      expect(geometry.disposed).toBe(false);
      expect(vertices.disposed).toBe(false);
      expect(indices.disposed).toBe(false);
      expect(() => geometry.vertexBuffer).toThrow(/disposed/i);
      expect(() => vertices.readBytes()).toThrow(/disposed/i);
      expect(() => indices.assertReadable()).toThrow(/disposed/i);
      expect([vertexA.disposed, vertexB.disposed, indexA.disposed, indexB.disposed]).toEqual([false, true, false, true]);
      expect(failedVertex).toHaveBeenCalledOnce();
      expect(failedIndex).toHaveBeenCalledOnce();
      expect(successfulVertex).toHaveBeenCalledOnce();
      expect(successfulIndex).toHaveBeenCalledOnce();

      expect(() => cache.dispose()).not.toThrow();
      expect(geometry.disposed).toBe(true);
      expect(vertices.disposed).toBe(true);
      expect(indices.disposed).toBe(true);
      expect([vertexA.disposed, vertexB.disposed, indexA.disposed, indexB.disposed]).toEqual([true, true, true, true]);
      expect(failedVertex).toHaveBeenCalledTimes(2);
      expect(failedIndex).toHaveBeenCalledTimes(2);
      expect(successfulVertex).toHaveBeenCalledOnce();
      expect(successfulIndex).toHaveBeenCalledOnce();
      cache.dispose();
      expect(failedVertex).toHaveBeenCalledTimes(2);
      expect(failedIndex).toHaveBeenCalledTimes(2);
      expect(source.disposed).toBe(false);
    } finally {
      failedVertex.mockRestore(); failedIndex.mockRestore();
      successfulVertex.mockRestore(); successfulIndex.mockRestore();
      cache.dispose(); source.dispose(); material.dispose(); a.dispose(); b.dispose();
    }
  });

  it("keeps a failed relinquished index buffer retryable after replacement", () => {
    const geometry = Geometry.triangle();
    const previous = geometry.indexBuffer!;
    const device = new TrackingDevice();
    const vertexGpu = geometry.vertexBuffer.upload(device);
    const oldGpu = previous.upload(device);
    const replacement = new IndexBuffer([2, 1, 0], 3);
    const replacementGpu = replacement.upload(device);
    const failure = vi.spyOn(oldGpu, "dispose")
      .mockImplementationOnce(() => { throw new Error("old index cleanup failed"); })
      .mockImplementationOnce(() => { throw new Error("old index cleanup failed again"); });
    const vertexSuccess = vi.spyOn(vertexGpu, "dispose");
    const replacementSuccess = vi.spyOn(replacementGpu, "dispose");
    try {
      expect(() => geometry.replaceIndexBuffer(replacement)).toThrow(/IndexBuffer disposal failed/);
      expect(geometry.indexBuffer).toBe(replacement);
      expect(oldGpu.disposed).toBe(false);
      expect(() => previous.assertReadable()).toThrow(/disposed/i);
      expect(() => geometry.dispose()).toThrow(/Geometry disposal failed/);
      expect(geometry.disposed).toBe(false);
      expect(vertexGpu.disposed).toBe(true);
      expect(replacementGpu.disposed).toBe(true);
      expect(vertexSuccess).toHaveBeenCalledOnce();
      expect(replacementSuccess).toHaveBeenCalledOnce();
      expect(oldGpu.disposed).toBe(false);
      expect(() => geometry.dispose()).not.toThrow();
      expect(geometry.disposed).toBe(true);
      expect(oldGpu.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(3);
      expect(vertexSuccess).toHaveBeenCalledOnce();
      expect(replacementSuccess).toHaveBeenCalledOnce();
      geometry.dispose();
      expect(failure).toHaveBeenCalledTimes(3);
    } finally {
      failure.mockRestore(); vertexSuccess.mockRestore(); replacementSuccess.mockRestore();
      geometry.dispose(); device.dispose();
    }
  });

  it("releases only its own failed shared-buffer retain when a peer acquires it before retry", () => {
    const first = Geometry.triangle();
    const shared = first.vertexBuffer;
    const device = new TrackingDevice();
    const gpu = shared.upload(device);
    const failure = vi.spyOn(shared, "dispose").mockImplementationOnce(() => { throw new Error("release not started"); });
    let second: Geometry | undefined;
    try {
      expect(() => first.dispose()).toThrow(/Geometry disposal failed/);
      expect(first.disposed).toBe(false);
      expect(() => shared.readBytes()).not.toThrow();
      second = new Geometry(shared, new IndexBuffer([0, 1, 2], 3));
      first.dispose();
      expect(first.disposed).toBe(true);
      expect(gpu.disposed).toBe(false);
      expect(second.vertexBuffer).toBe(shared);
      expect(() => shared.readBytes()).not.toThrow();
      expect(failure).toHaveBeenCalledOnce();
      second.dispose();
      expect(shared.disposed).toBe(true);
      expect(gpu.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
    } finally {
      failure.mockRestore();
      first.dispose(); second?.dispose(); device.dispose();
    }
  });

  it("transfers a failed unowned replacement to a new geometry without invalidating it", () => {
    const first = Geometry.triangle();
    const previous = first.indexBuffer!;
    const candidate = new IndexBuffer([2, 1, 0], 3);
    const failure = vi.spyOn(previous, "dispose").mockImplementationOnce(() => { throw new Error("retirement not started"); });
    let second: Geometry | undefined;
    try {
      expect(() => first.replaceIndexBuffer(candidate)).toThrow(/retirement not started/);
      second = new Geometry(new VertexBuffer(VertexFormat.P3, 3), previous);
      first.dispose();
      expect(first.disposed).toBe(true);
      expect(previous.disposed).toBe(false);
      expect(() => second!.indexBuffer!.assertReadable()).not.toThrow();
      expect(failure).toHaveBeenCalledOnce();
      second.dispose();
      expect(previous.disposed).toBe(true);
      expect(failure).toHaveBeenCalledTimes(2);
    } finally {
      failure.mockRestore();
      first.dispose(); second?.dispose();
    }
  });

  it("preserves sparse slots and explicit counts through pipeline and actual forward submission", () => {
    const geometry = streamGeometry();
    const device = new TrackingDevice();
    const material = new UnlitMaterial();
    device.beginFrame(8, 8);
    new ForwardPass({ items: [{ geometry, material, instanceCount: 4 }] }).execute({ device, width: 8, height: 8 });
    device.endFrame();
    expect(device.drawCommands).toHaveLength(1);
    const draw = device.drawCommands[0]!;
    expect(draw.instanceCount).toBe(4);
    expect(draw.vertexBuffers?.[0]).toBe(geometry.vertexBuffer.uploadedBuffer);
    expect(draw.vertexBuffers?.[1]).toBeUndefined();
    expect(draw.vertexBuffers?.[2]).toBe(geometry.getVertexBuffer(2).uploadedBuffer);

    const pipeline = new RenderPipeline({ shader: draw.shader!, vertexFormat: geometry.vertexBuffer.format, requiredAttributes: [] });
    const explicit = pipeline.createDrawCommand({ vertexBuffer: draw.vertexBuffer, vertexBuffers: draw.vertexBuffers, vertexCount: 3, instanceCount: 4 });
    expect(explicit.vertexBuffers?.[2]).toBe(draw.vertexBuffers?.[2]);
    const recorded: typeof draw[] = [];
    const capture = { draw: (command: typeof draw) => recorded.push(command) } as unknown as MockRenderDevice;
    submitDraw(capture, pipeline, geometry, 4, { start: 0, count: 3 }, {
      item: { geometry, material }, vertexBuffer: draw.vertexBuffer, vertexBuffers: draw.vertexBuffers,
      indexBuffer: undefined, drawRange: { start: 0, count: 3 }, uniforms: new Map(), instanceBinding: { count: 4 }
    });
    expect(recorded[0]?.vertexBuffers?.[2]).toBe(draw.vertexBuffers?.[2]);
    expect(recorded[0]?.instanceCount).toBe(4);
    geometry.dispose();
    material.dispose();
    device.dispose();
  });

  it("rejects undersized divisor streams before a forward draw", () => {
    const geometry = streamGeometry(1);
    const device = new TrackingDevice();
    device.beginFrame(8, 8);
    expect(() => new ForwardPass({ items: [{ geometry, instanceCount: 3 }] }).execute({ device, width: 8, height: 8 })).toThrow(/requires 2 records/);
    expect(device.drawCommands).toHaveLength(0);
    expect(geometry.vertexBuffer.uploadedBuffer).toBeNull();
    geometry.dispose();
    device.dispose();
  });
});

describe("typed vertex batching", () => {
  function byteGeometry(bytes: readonly [number, number, number]): Geometry {
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "uint8" }]);
    const vertices = new VertexBuffer(format, 1);
    vertices.setAttribute(0, "position", bytes);
    return new Geometry(vertices);
  }

  it("packs complete records, including trailing bytes, through CPU materialization and GPU upload", () => {
    const a = byteGeometry([1, 2, 3]);
    const b = byteGeometry([4, 5, 254]);
    const pool = new BatchedGeometryPool();
    pool.pack(a);
    pool.pack(b);
    expect(Array.from(new Uint8Array(pool.asGeometry().vertexBuffer.data))).toEqual([1, 2, 3, 4, 5, 254]);
    const device = new TrackingDevice();
    expect(Array.from(device.readBuffer(pool.upload(device).vertexBuffer))).toEqual([1, 2, 3, 4, 5, 254]);
    pool.dispose();
    a.dispose();
    b.dispose();
    device.dispose();
  });

  it("keys layouts and all stream bytes, including changes under an identical primitive descriptor", () => {
    const a = byteGeometry([1, 2, 3]);
    const same = byteGeometry([1, 2, 3]);
    (a as unknown as { __a3dPrimitiveDescriptor: object }).__a3dPrimitiveDescriptor = { shape: "sample" };
    (same as unknown as { __a3dPrimitiveDescriptor: object }).__a3dPrimitiveDescriptor = { shape: "sample" };
    const original = geometryContentKey(a);
    expect(geometryContentKey(same)).toBe(original);
    same.vertexBuffer.writeBytes(2, Uint8Array.of(99));
    expect(geometryContentKey(same)).not.toBe(original);
    same.vertexBuffer.writeBytes(2, Uint8Array.of(3));
    expect(geometryContentKey(same)).toBe(original);
    const normalized = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "uint8", normalized: true }]);
    const changedLayout = new VertexBuffer(normalized, 1);
    changedLayout.writeBytes(0, Uint8Array.of(1, 2, 3));
    const layoutGeometry = new Geometry(changedLayout);
    (layoutGeometry as unknown as { __a3dPrimitiveDescriptor: object }).__a3dPrimitiveDescriptor = { shape: "sample" };
    expect(geometryContentKey(layoutGeometry)).not.toBe(original);

    const streams = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 0, type: "uint8", bufferSlot: 2 }
    ], 12, [{ slot: 2, stride: 2 }]);
    const make = () => new Geometry(new VertexBuffer(streams, 1), null, "triangles", undefined, [new VertexBuffer(streams, 1, 2)]);
    const first = make();
    const second = make();
    expect(geometryContentKey(first)).toBe(geometryContentKey(second));
    second.getVertexBuffer(2).writeBytes(1, Uint8Array.of(1));
    expect(geometryContentKey(first)).not.toBe(geometryContentKey(second));
    a.dispose(); same.dispose(); layoutGeometry.dispose(); first.dispose(); second.dispose();
  });

  it("passes unsupported layouts and independently instanced draws through the planner", () => {
    const a = byteGeometry([1, 2, 3]);
    const b = byteGeometry([4, 5, 6]);
    const material = new PBRMaterial();
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 0, bufferSlot: 1 }
    ], 12, [{ slot: 1, stride: 8 }]);
    const multi = new Geometry(new VertexBuffer(format, 1), null, "triangles", undefined, [new VertexBuffer(format, 1, 1)]);
    const items = [
      { geometry: a, material, instanceCount: 2 },
      { geometry: b, material, instanceCount: 2 },
      { geometry: multi, material }
    ];
    const plan = planBatches(items, { multiDrawAvailable: true });
    expect(plan.passthrough).toEqual(items);
    expect(plan.instancedBatches).toHaveLength(0);
    expect(plan.multiDrawGroups).toHaveLength(0);
    expect(plan.reasonsNotBatched["unsupported-vertex-streams"]).toBe(1);
    expect(() => new BatchedGeometryPool().pack(multi)).toThrow(/single per-vertex/);
    a.dispose(); b.dispose(); multi.dispose(); material.dispose();
  });

  it("keeps existing arenas alive if allocating an index arena on another device fails", () => {
    const vertices = new VertexBuffer(VertexFormat.P3, 1);
    const geometry = new Geometry(vertices, new IndexBuffer([0], 1));
    const pool = new BatchedGeometryPool();
    pool.pack(geometry);
    const a = new TrackingDevice();
    const prior = pool.upload(a);
    class FailingIndexDevice extends TrackingDevice {
      createdVertex: RenderBuffer | undefined;
      override createBuffer(usage: BufferUsage, byteLength: number, data?: ArrayBufferView): RenderBuffer {
        if (usage === "index") throw new Error("index failed");
        return (this.createdVertex = super.createBuffer(usage, byteLength, data));
      }
    }
    const b = new FailingIndexDevice();
    expect(() => pool.upload(b)).toThrow(/index failed/);
    expect(b.createdVertex?.disposed).toBe(true);
    expect(prior.vertexBuffer.disposed).toBe(false);
    expect(prior.indexBuffer?.disposed).toBe(false);
    expect(pool.upload(a).vertexBuffer).toBe(prior.vertexBuffer);
    pool.dispose(); geometry.dispose(); a.dispose(); b.dispose();
  });

  it("preserves explicit instance attributes and shader variants instead of synthesizing incompatible materials", () => {
    const geometry = byteGeometry([1, 2, 3]);
    const regular = new PBRMaterial();
    const variant = new Material({ shaderKey: regular.shaderKey, shaderVariant: "graph:test" });
    const items = [
      { geometry, material: regular, instanceAttributes: [{ shaderName: "a_custom", components: 1 as const, data: [1] }] },
      { geometry, material: regular, instanceAttributes: [{ shaderName: "a_custom", components: 1 as const, data: [2] }] },
      { geometry, material: variant },
      { geometry, material: variant }
    ];
    const plan = planBatches(items, { multiDrawAvailable: true });
    expect(plan.passthrough).toEqual(items);
    expect(plan.instancedBatches).toHaveLength(0);
    expect(plan.multiDrawGroups).toHaveLength(0);
    geometry.dispose(); regular.dispose(); variant.dispose();
  });

  it("rebuilds cached packed bytes after vertex or index edits while reusing unchanged frames", () => {
    const make = (x: number) => {
      const vertices = new VertexBuffer(VertexFormat.P3, 3);
      vertices.setAttribute(0, "position", [x, 0, 0]);
      vertices.setAttribute(1, "position", [x + 1, 0, 0]);
      vertices.setAttribute(2, "position", [x, 1, 0]);
      return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    };
    const a = make(0);
    const b = make(3);
    const material = new PBRMaterial();
    const items = [{ geometry: a, material }, { geometry: b, material }];
    const cache = new BatchPlanCache();
    const options = { instancing: false, multiDrawAvailable: true };
    const device = new TrackingDevice();
    const initial = cache.apply(items, options);
    expect(cache.planVersion).toBe(1);
    expect(initial[0]?.geometry.vertexBuffer.getAttribute(0, "position")).toEqual([0, 0, 0]);
    const oldGpu = initial[0]!.geometry.vertexBuffer.upload(device);
    const oldDrawData = (initial[0] as unknown as { multiDraw?: { drawData?: { disposed: boolean } } }).multiDraw?.drawData;
    expect(oldDrawData).toBeDefined();
    expect(cache.apply(items, options)).toBe(initial);
    a.vertexBuffer.setAttribute(0, "position", [9, 0, 0]);
    const updated = cache.apply(items, options);
    expect(cache.planVersion).toBe(2);
    expect(updated[0]?.geometry.vertexBuffer.getAttribute(0, "position")).toEqual([9, 0, 0]);
    expect(oldGpu.disposed).toBe(true);
    expect(oldDrawData?.disposed).toBe(true);
    expect(cache.apply(items, options)).toBe(updated);
    a.indexBuffer!.data[0] = 2;
    const reindexed = cache.apply(items, options);
    expect(cache.planVersion).toBe(3);
    expect(reindexed[0]?.geometry.indexBuffer?.data[0]).toBe(2);
    const finalGpu = reindexed[0]!.geometry.vertexBuffer.upload(device);
    cache.dispose();
    cache.dispose();
    expect(finalGpu.disposed).toBe(true);
    a.dispose(); b.dispose(); material.dispose(); device.dispose();
  });

  it("unregisters a pool's restore handle on disposal and supports explicit reuse", () => {
    const registered = new Set<object>();
    const registry = {
      register<T extends object>(handle: T): T { registered.add(handle); return handle; },
      unregister(handle: object): void { registered.delete(handle); }
    };
    const pool = new BatchedGeometryPool();
    pool.registerForRestore(registry);
    expect(registered.has(pool)).toBe(true);
    pool.dispose();
    expect(registered.has(pool)).toBe(false);
    pool.registerForRestore(registry);
    expect(registered.has(pool)).toBe(true);
    pool.dispose();
    expect(registered.size).toBe(0);
  });

  it("keeps per-item rendering overrides out of renderer-owned consolidation and static batching", () => {
    const geometry = Geometry.triangle();
    const material = new PBRMaterial();
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const symbol = Symbol("future renderer override");
    const overrides = [
      { castShadow: false }, { castShadow: true }, { receiveShadow: false }, { geometryMatrix: identity },
      { normalMatrix: identity.slice(0, 9) }, { modelViewProjectionMatrix: identity },
      { renderOrder: 7 }, { layerMask: 2 }, { instanceCount: 1 }, { label: "keep-my-label" },
      { previousModelMatrix: new Float32Array(identity) }, { writesReactive: true },
      { onBeforeRender: () => undefined }, { futureExtensionField: "must-survive" }, { [symbol]: 42 }
    ];
    const items = overrides.map((fields) => ({ geometry, material, ...fields }));
    const source = { staticMeshConsolidation: true, staticBatching: true };
    const consolidated = applyRendererOwnedStaticMeshConsolidation(source, items);
    const batched = applyRendererOwnedStaticBatching(source, items);
    expect(consolidated).toEqual(items);
    expect(batched).toEqual(items);
    for (let i = 0; i < items.length; i += 1) {
      expect(consolidated[i]).toBe(items[i]);
      expect(batched[i]).toBe(items[i]);
    }
    const plain = { geometry, material };
    const undefinedExtension = { geometry, material, futureExtensionField: undefined };
    const overridden = { geometry, material, renderOrder: 7 };
    const mixed = [plain, undefinedExtension, overridden];
    const vertexBytes = geometry.vertexBuffer.readBytes();
    const indexBytes = new Uint8Array(geometry.indexBuffer!.data.buffer).slice();
    const consolidatedMixed = applyRendererOwnedStaticMeshConsolidation(source, mixed);
    const batchedMixed = applyRendererOwnedStaticBatching(source, mixed);
    expect(consolidatedMixed).toBe(mixed);
    expect(batchedMixed).toBe(mixed);
    for (let i = 0; i < mixed.length; i += 1) {
      expect(consolidatedMixed[i]).toBe(mixed[i]);
      expect(batchedMixed[i]).toBe(mixed[i]);
      expect(consolidatedMixed[i]!.geometry.vertexBuffer.readBytes()).toEqual(vertexBytes);
      expect(new Uint8Array(batchedMixed[i]!.geometry.indexBuffer!.data.buffer)).toEqual(indexBytes);
    }
    geometry.dispose();
    material.dispose();
  });
});

describe("device buffer retirement across generations", () => {
  it.each(["vertex", "index"] as const)("retains a failed old %s allocation without replacing another device's generation", (kind) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const oldA = buffer.upload(a);
    const currentB = buffer.upload(b);
    const failure = vi.spyOn(oldA, "dispose").mockImplementationOnce(() => { throw new Error("old generation cleanup failed"); });
    const successB = vi.spyOn(currentB, "dispose");
    try {
      a.generation += 1;
      expect(() => buffer.upload(a)).toThrow(/old generation cleanup failed/);
      const currentA = buffer.uploadedBuffer!;
      expect(currentA).not.toBe(oldA);
      expect(currentA.disposed).toBe(false);
      expect(oldA.disposed).toBe(false);
      expect(buffer.upload(b)).toBe(currentB);
      expect(buffer.upload(a)).toBe(currentA);

      if (buffer instanceof VertexBuffer) buffer.setAttribute(0, "position", [4, 5, 6]);
      else buffer.setIndices(1, [9]);
      expect(buffer.upload(b)).toBe(currentB);
      expect(buffer.upload(a)).toBe(currentA);
      expect(a.updates).toHaveLength(1);
      expect(b.updates).toHaveLength(1);
      expect(oldA.disposed).toBe(false);

      buffer.dispose();
      expect([oldA.disposed, currentA.disposed, currentB.disposed]).toEqual([true, true, true]);
      expect(failure).toHaveBeenCalledTimes(2);
      expect(successB).toHaveBeenCalledOnce();
      buffer.dispose();
      expect(failure).toHaveBeenCalledTimes(2);
      expect(successB).toHaveBeenCalledOnce();
    } finally {
      failure.mockRestore(); successB.mockRestore();
      buffer.dispose(); a.dispose(); b.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("does not retry a %s GPU buffer that completed before reporting an error", (kind) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    const gpu = buffer.upload(device);
    const dispose = gpu.dispose.bind(gpu);
    const failure = vi.spyOn(gpu, "dispose").mockImplementationOnce(() => {
      dispose();
      throw new Error("cleanup callback failed after release");
    });
    try {
      expect(() => buffer.dispose()).toThrow(/disposal failed/);
      expect(gpu.disposed).toBe(true);
      expect(buffer.disposed).toBe(true);
      buffer.dispose();
      expect(failure).toHaveBeenCalledOnce();
    } finally {
      failure.mockRestore(); buffer.dispose(); device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("does not double-dispose an in-flight old %s generation during reentrant teardown", (kind) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    const old = buffer.upload(device);
    const dispose = old.dispose.bind(old);
    const calls = vi.spyOn(old, "dispose").mockImplementationOnce(() => {
      buffer.dispose();
      expect(buffer.disposed).toBe(false);
      dispose();
    });
    try {
      device.generation += 1;
      expect(() => buffer.upload(device)).toThrow(/disposed/i);
      expect(old.disposed).toBe(true);
      expect(buffer.disposed).toBe(true);
      expect(calls).toHaveBeenCalledOnce();
      buffer.dispose();
      expect(calls).toHaveBeenCalledOnce();
    } finally {
      calls.mockRestore(); buffer.dispose(); device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("does not return an old %s generation when a retirement callback restores again", (kind) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    const old = buffer.upload(device);
    const dispose = old.dispose.bind(old);
    const calls = vi.spyOn(old, "dispose").mockImplementationOnce(() => {
      device.generation += 1;
      dispose();
    });
    try {
      device.generation += 1;
      expect(() => buffer.upload(device)).toThrow(/generation|context.*lost/i);
      const superseded = buffer.uploadedBuffer!;
      expect(superseded).not.toBe(old);
      const current = buffer.upload(device);
      expect(current).not.toBe(superseded);
      expect(superseded.disposed).toBe(true);
      expect(current.disposed).toBe(false);
      expect(calls).toHaveBeenCalledOnce();
      buffer.dispose();
      expect(current.disposed).toBe(true);
    } finally {
      calls.mockRestore(); buffer.dispose(); device.dispose();
    }
  });

  it.each([
    ["vertex", false], ["vertex", true], ["index", false], ["index", true]
  ] as const)("retires a %s allocation superseded during creation without disturbing another device (cleanup fails: %s)", (kind, failCleanup) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const oldA = buffer.upload(a);
    const currentB = buffer.upload(b);
    const create = a.createBuffer.bind(a);
    const cleanupError = new Error("superseded allocation cleanup failed");
    let superseded: RenderBuffer | undefined;
    let cleanupCalls = 0;
    const createSpy = vi.spyOn(a, "createBuffer").mockImplementationOnce((usage, byteLength, data) => {
      superseded = create(usage, byteLength, data);
      const dispose = superseded.dispose.bind(superseded);
      superseded.dispose = () => {
        cleanupCalls += 1;
        if (failCleanup && cleanupCalls === 1) throw cleanupError;
        dispose();
      };
      a.generation += 1;
      return superseded;
    });
    try {
      a.generation += 1;
      let caught: unknown;
      try { buffer.upload(a); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(Error);
      expect(superseded).toBeDefined();
      expect(cleanupCalls).toBe(1);
      if (failCleanup) {
        expect(caught).toBeInstanceOf(AggregateError);
        expect((caught as AggregateError).errors[1]).toBe(cleanupError);
      }
      expect(superseded!.disposed).toBe(!failCleanup);
      expect(buffer.upload(b)).toBe(currentB);
      const currentA = buffer.upload(a);
      expect(currentA).not.toBe(oldA);
      expect(currentA).not.toBe(superseded);
      expect(oldA.disposed).toBe(true);
      expect(currentB.disposed).toBe(false);
      buffer.dispose();
      expect(superseded!.disposed).toBe(true);
      expect(cleanupCalls).toBe(failCleanup ? 2 : 1);
      expect(currentA.disposed).toBe(true);
      expect(currentB.disposed).toBe(true);
    } finally {
      createSpy.mockRestore(); buffer.dispose(); a.dispose(); b.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("rejects reentrant %s upload on one device without disturbing another", (kind) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const currentB = buffer.upload(b);
    const create = a.createBuffer.bind(a);
    let reentryError: unknown;
    const createSpy = vi.spyOn(a, "createBuffer").mockImplementationOnce((usage, byteLength, data) => {
      try { buffer.upload(a); } catch (error) { reentryError = error; }
      return create(usage, byteLength, data);
    });
    try {
      const currentA = buffer.upload(a);
      expect(reentryError).toBeInstanceOf(Error);
      expect((reentryError as Error).message).toMatch(/reentrant/i);
      expect(buffer.upload(a)).toBe(currentA);
      expect(buffer.upload(b)).toBe(currentB);
      expect([currentA.disposed, currentB.disposed]).toEqual([false, false]);
      buffer.dispose();
      expect([currentA.disposed, currentB.disposed]).toEqual([true, true]);
    } finally {
      createSpy.mockRestore(); buffer.dispose(); a.dispose(); b.dispose();
    }
  });

  it.each([
    ["vertex", false], ["vertex", true], ["index", false], ["index", true]
  ] as const)("retains an allocated %s buffer when disposal reenters allocation (cleanup fails: %s)", (kind, failCleanup) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    const create = device.createBuffer.bind(device);
    const cleanupError = new Error("late allocation cleanup failed");
    let created: RenderBuffer | undefined;
    let cleanupCalls = 0;
    let completeDuringAllocation = true;
    const createSpy = vi.spyOn(device, "createBuffer").mockImplementationOnce((usage, byteLength, data) => {
      created = create(usage, byteLength, data);
      const dispose = created.dispose.bind(created);
      created.dispose = () => {
        cleanupCalls += 1;
        if (failCleanup && cleanupCalls === 1) throw cleanupError;
        dispose();
      };
      buffer.dispose();
      completeDuringAllocation = buffer.disposed;
      return created;
    });
    try {
      let caught: unknown;
      try { buffer.upload(device); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(Error);
      expect(completeDuringAllocation).toBe(false);
      expect(created).toBeDefined();
      expect(cleanupCalls).toBe(1);
      if (failCleanup) {
        expect(caught).toBeInstanceOf(AggregateError);
        expect((caught as AggregateError).errors[1]).toBe(cleanupError);
        expect(buffer.disposed).toBe(false);
        expect(created!.disposed).toBe(false);
        buffer.dispose();
        expect(cleanupCalls).toBe(2);
      }
      expect(created!.disposed).toBe(true);
      expect(buffer.disposed).toBe(true);
      buffer.dispose();
      expect(cleanupCalls).toBe(failCleanup ? 2 : 1);
    } finally {
      createSpy.mockRestore(); buffer.dispose(); device.dispose();
    }
  });

  it.each(["vertex", "index"] as const)("does not return a %s allocation disposed from an update callback", (kind) => {
    const buffer = kind === "vertex" ? new VertexBuffer(VertexFormat.P3, 1) : new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    const gpu = buffer.upload(device);
    if (buffer instanceof VertexBuffer) buffer.setAttribute(0, "position", [1, 2, 3]);
    else buffer.setIndices(1, [9]);
    const update = device.updateBuffer.bind(device);
    let completeDuringUpdate = true;
    const updateSpy = vi.spyOn(device, "updateBuffer").mockImplementationOnce((resource, offset, data) => {
      update(resource, offset, data);
      buffer.dispose();
      completeDuringUpdate = buffer.disposed;
    });
    try {
      expect(() => buffer.upload(device)).toThrow(/disposed/i);
      expect(completeDuringUpdate).toBe(false);
      expect(gpu.disposed).toBe(true);
      expect(buffer.disposed).toBe(true);
    } finally {
      updateSpy.mockRestore(); buffer.dispose(); device.dispose();
    }
  });
});

describe("native index buffer ownership", () => {
  it("keeps per-device index allocations and dirty ranges independent", () => {
    const indices = new IndexBuffer([0, 1, 2]);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    expect(indices.uploadedBuffer).toBeNull();
    expect(indices.getDirtyRange()).toBeNull();
    const gpuA = indices.upload(a);
    const gpuB = indices.upload(b);
    expect(gpuA).not.toBe(gpuB);
    expect(indices.uploadedBuffer).toBe(gpuB);

    indices.setIndices(1, [9]);
    expect(indices.getDirtyRange()).toEqual({ start: 2, end: 4 });
    expect(indices.upload(a)).toBe(gpuA);
    expect(a.updates).toEqual([{ offset: 2, bytes: [9, 0] }]);
    expect(Array.from(new Uint16Array(b.readBuffer(gpuB).buffer))).toEqual([0, 1, 2]);
    expect(indices.getDirtyRange()).toEqual({ start: 2, end: 4 });
    indices.upload(b);
    expect(b.updates).toEqual([{ offset: 2, bytes: [9, 0] }]);
    expect(indices.getDirtyRange()).toBeNull();

    indices.setIndices(2, [7]);
    indices.upload(b);
    expect(b.updates[1]).toEqual({ offset: 4, bytes: [7, 0] });
    expect(indices.getDirtyRange()).toEqual({ start: 4, end: 6 });
    indices.upload(a);
    expect(Array.from(new Uint16Array(a.readBuffer(gpuA).buffer))).toEqual([0, 9, 7]);
    expect(Array.from(new Uint16Array(b.readBuffer(gpuB).buffer))).toEqual([0, 9, 7]);
    expect(indices.getDirtyRange()).toBeNull();
    indices.setIndices(3, []);
    indices.upload(a);
    expect(a.updates).toHaveLength(2);
    indices.dispose();
    indices.dispose();
    expect(gpuA.disposed).toBe(true);
    expect(gpuB.disposed).toBe(true);
    a.dispose(); b.dispose();
  });

  it("retries failed updates and allocations and rebuilds after loss or external disposal", () => {
    const indices = new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    device.failCreate = true;
    expect(() => indices.upload(device)).toThrow(/create failed/);
    expect(indices.uploadedBuffer).toBeNull();
    device.failCreate = false;
    const first = indices.upload(device);
    indices.setIndices(1, [8]);
    device.failUpdate = true;
    expect(() => indices.upload(device)).toThrow(/update failed/);
    expect(indices.getDirtyRange()).toEqual({ start: 2, end: 4 });
    device.failUpdate = false;
    expect(indices.upload(device)).toBe(first);
    expect(Array.from(new Uint16Array(device.readBuffer(first).buffer))).toEqual([0, 8, 2]);
    first.dispose();
    const second = indices.upload(device);
    expect(second).not.toBe(first);
    device.generation += 1;
    device.failCreate = true;
    expect(() => indices.upload(device)).toThrow(/create failed/);
    expect(second.disposed).toBe(false);
    device.failCreate = false;
    const third = indices.upload(device);
    expect(third).not.toBe(second);
    expect(second.disposed).toBe(true);
    expect(Array.from(new Uint16Array(device.readBuffer(third).buffer))).toEqual([0, 8, 2]);
    device.contextLost = true;
    expect(() => indices.upload(device)).toThrow(/lost/);
    device.contextLost = false;
    device.dispose();
    expect(() => indices.upload(device)).toThrow(/disposed/);
    indices.dispose();
    expect(() => indices.upload(new TrackingDevice())).toThrow(/IndexBuffer is disposed/);
  });

  it("releases other devices when one index resource disposal fails", () => {
    const indices = new IndexBuffer([0, 1, 2]);
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const first = indices.upload(a);
    const second = indices.upload(b);
    const failure = vi.spyOn(first, "dispose").mockImplementationOnce(() => { throw new Error("release failed"); });
    const success = vi.spyOn(second, "dispose");
    const revision = indices.revision;
    expect(() => indices.dispose()).toThrow(/IndexBuffer disposal failed/);
    expect(second.disposed).toBe(true);
    expect(first.disposed).toBe(false);
    expect(() => indices.upload(a)).toThrow(/disposed/);
    expect(indices.revision).toBe(revision + 1);
    expect(() => indices.dispose()).not.toThrow();
    expect(first.disposed).toBe(true);
    expect(failure).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledOnce();
    expect(indices.revision).toBe(revision + 1);
    failure.mockRestore();
    success.mockRestore();
    a.dispose(); b.dispose();
  });

  it("rejects invalid or out-of-range index values without partial writes", () => {
    for (const value of [-1, 1.5, NaN, Infinity, 4294967296]) {
      expect(() => new IndexBuffer([0, value])).toThrow();
    }
    expect(new IndexBuffer([0, 4294967295]).data[1]).toBe(4294967295);
    const indices = new IndexBuffer([0, 1, 2]);
    const device = new TrackingDevice();
    indices.upload(device);
    for (const value of [-1, 1.5, NaN, Infinity, 65536]) {
      expect(() => indices.setIndices(0, [9, value])).toThrow();
      expect(Array.from(indices.data)).toEqual([0, 1, 2]);
      expect(indices.getDirtyRange()).toBeNull();
    }
    const wide = new IndexBuffer([0, 65536]);
    expect(wide.type).toBe("uint32");
    wide.setIndices(1, [4294967295]);
    expect(wide.type).toBe("uint32");
    expect(Array.from(wide.data)).toEqual([0, 4294967295]);
    expect(() => wide.setIndices(0, [4294967296])).toThrow();
    expect(Array.from(wide.data)).toEqual([0, 4294967295]);
    indices.dispose(); wide.dispose(); device.dispose();
  });

  it("submits the same indexed geometry to two devices using each device's own buffer", () => {
    const geometry = Geometry.triangle();
    const a = new TrackingDevice();
    const b = new TrackingDevice();
    const pass = new ForwardPass({ items: [{ geometry }] });
    const draw = (device: TrackingDevice) => {
      device.beginFrame(8, 8);
      pass.execute({ device, width: 8, height: 8 });
      device.endFrame();
      return device.drawCommands.at(-1)!;
    };
    const drawA = draw(a);
    const drawB = draw(b);
    expect(drawA.indexBuffer).toBeDefined();
    expect(drawB.indexBuffer).toBeDefined();
    expect(drawA.indexBuffer).not.toBe(drawB.indexBuffer);
    geometry.indexBuffer!.setIndices(0, [2, 1, 0]);
    draw(a);
    draw(b);
    expect(Array.from(new Uint16Array(a.readBuffer(drawA.indexBuffer!).buffer))).toEqual([2, 1, 0]);
    expect(Array.from(new Uint16Array(b.readBuffer(drawB.indexBuffer!).buffer))).toEqual([2, 1, 0]);
    geometry.dispose(); a.dispose(); b.dispose();
  });

  it("uses a WebGPU-owned allocation after an initial mock-device upload", async () => {
    const writes: { offset: number; bytes: number[] }[] = [];
    const native = {
      queue: {
        writeBuffer(_buffer: unknown, offset: number, data: ArrayBuffer | ArrayBufferView) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          writes.push({ offset, bytes: Array.from(bytes) });
        },
        submit() {}
      },
      createBuffer({ size }: { size: number }) { return { size, destroy() {} }; }
    };
    const gpu = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as WebGPUDeviceLike } });
    const mock = new TrackingDevice();
    const indices = new IndexBuffer([0, 1, 2]);
    const mockBuffer = indices.upload(mock);
    const gpuBuffer = indices.upload(gpu);
    expect(gpuBuffer).not.toBe(mockBuffer);
    expect(Array.from(new Uint16Array(gpu.readBuffer(gpuBuffer).buffer))).toEqual([0, 1, 2]);
    indices.setIndices(1, [8]);
    indices.upload(mock);
    indices.upload(gpu);
    expect(Array.from(new Uint16Array(gpu.readBuffer(gpuBuffer).buffer))).toEqual([0, 8, 2]);
    expect(writes.at(-1)).toEqual({ offset: 0, bytes: [0, 0, 8, 0] });
    indices.dispose(); mock.dispose(); gpu.dispose();
  });
});
