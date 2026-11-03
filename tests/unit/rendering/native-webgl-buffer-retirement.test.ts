import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { ResourceLifecycle } from "../../../packages/rendering/src/ResourceLifecycle";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGL2Buffer, WebGL2Device, type WebGL2ShaderProgram } from "../../../packages/rendering/src/WebGL2Device";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";

/** A recording context: these tests need no browser or GPU. */
function makeDevice() {
  const constants = new Map<string, number>([["NO_ERROR", 0]]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const bufferAttempts: WebGLBuffer[] = [];
  const deletedBuffers: WebGLBuffer[] = [];
  const vaoAttempts: WebGLVertexArrayObject[] = [];
  const deletedVaos: WebGLVertexArrayObject[] = [];
  let failedBuffer: WebGLBuffer | undefined;
  let failedVao: WebGLVertexArrayObject | undefined;
  let onBufferDelete: ((handle: WebGLBuffer) => void) | undefined;
  let onVaoDelete: ((handle: WebGLVertexArrayObject) => void) | undefined;
  const methods: Record<string, unknown> = {
    getError: () => 0,
    getParameter: () => 16,
    getExtension: () => null,
    isContextLost: () => false,
    createBuffer: () => ({}),
    createVertexArray: () => ({}),
    deleteBuffer: (handle: WebGLBuffer) => {
      bufferAttempts.push(handle);
      onBufferDelete?.(handle);
      if (handle === failedBuffer) {
        failedBuffer = undefined;
        throw new Error("deleteBuffer failed");
      }
      deletedBuffers.push(handle);
    },
    deleteVertexArray: (handle: WebGLVertexArrayObject) => {
      vaoAttempts.push(handle);
      onVaoDelete?.(handle);
      if (handle === failedVao) {
        failedVao = undefined;
        throw new Error("deleteVertexArray failed");
      }
      deletedVaos.push(handle);
    }
  };
  const gl = new Proxy({}, {
    get(_target, property) {
      const name = String(property);
      if (name in methods) return methods[name];
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      return () => undefined;
    }
  }) as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  const host = webgl2DeviceHost(device)!;

  function vao(vertex: WebGL2Buffer, shaderId: number, instance?: WebGL2Buffer) {
    const shader = {
      id: shaderId,
      reflection: { attributes: new Map(), uniforms: new Set(), attributeDetails: new Map(), uniformDetails: new Map() }
    } as unknown as WebGL2ShaderProgram;
    return host.drawBinder.bindVertexArrayForCommand({
      vertexBuffer: vertex,
      vertexCount: 3,
      vertexFormat: VertexFormat.P3,
      topology: "triangles",
      ...(instance ? {
        instanceAttributes: [{ buffer: instance, shaderName: "unused", components: 4 as const, offset: 0, stride: 16 }]
      } : {})
    }, shader, vertex);
  }

  return {
    device, host, vao, bufferAttempts, deletedBuffers, vaoAttempts, deletedVaos,
    failBufferOnce: (handle: WebGLBuffer) => { failedBuffer = handle; },
    failVaoOnce: (handle: WebGLVertexArrayObject) => { failedVao = handle; },
    onBufferDelete: (listener: (handle: WebGLBuffer) => void) => { onBufferDelete = listener; },
    onVaoDelete: (listener: (handle: WebGLVertexArrayObject) => void) => { onVaoDelete = listener; }
  };
}

describe("WebGL2 buffer retirement", () => {
  it("retains a failed VAO eviction without repeating successful deletions or disturbing peers", () => {
    const first = makeDevice();
    const second = makeDevice();
    const vertex = first.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const peer = first.device.createBuffer("vertex", 48) as WebGL2Buffer;
    const unrelated = first.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const otherDevice = second.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const completedVao = first.vao(vertex, 1, peer);
    const failedVao = first.vao(vertex, 2, peer);
    const unrelatedVao = first.vao(unrelated, 3);
    const otherVao = second.vao(otherDevice, 1);
    const index = (first.host.drawBinder as unknown as { bufferVaoIndex: Map<number, Set<string>> }).bufferVaoIndex;
    first.failVaoOnce(failedVao.handle);

    expect(() => vertex.dispose()).toThrow(/deleteVertexArray failed/);
    expect(vertex.disposed).toBe(false);
    expect(() => first.device.updateBuffer(vertex, 0, Uint8Array.of(1))).toThrow(/not a live/i);
    expect(first.host.drawBinder.vertexArrayCache.has(completedVao.key)).toBe(false);
    expect(first.host.drawBinder.vertexArrayCache.get(failedVao.key)).toBe(failedVao);
    expect(first.host.drawBinder.vertexArrayCache.get(unrelatedVao.key)).toBe(unrelatedVao);
    expect(index.get(peer.id)).toEqual(new Set([failedVao.key]));
    expect(first.vaoAttempts).toEqual([completedVao.handle, failedVao.handle]);
    expect(first.deletedVaos).toEqual([completedVao.handle]);
    expect(first.deletedBuffers).not.toContain(vertex.handle);

    vertex.dispose();
    expect(vertex.disposed).toBe(true);
    expect(first.vaoAttempts).toEqual([completedVao.handle, failedVao.handle, failedVao.handle]);
    expect(first.deletedVaos).toEqual([completedVao.handle, failedVao.handle]);
    expect(first.deletedBuffers.filter((handle) => handle === vertex.handle)).toHaveLength(1);
    expect(first.host.drawBinder.vertexArrayCache.has(failedVao.key)).toBe(false);
    expect(index.has(vertex.id)).toBe(false);
    expect(index.has(peer.id)).toBe(false);
    expect(index.get(unrelated.id)).toEqual(new Set([unrelatedVao.key]));
    expect(peer.disposed).toBe(false);
    expect(unrelated.disposed).toBe(false);
    expect(otherDevice.disposed).toBe(false);
    expect(second.host.drawBinder.vertexArrayCache.get(otherVao.key)).toBe(otherVao);
    expect(() => first.device.updateBuffer(peer, 0, Uint8Array.of(1))).not.toThrow();
    expect(() => second.device.updateBuffer(otherDevice, 0, Uint8Array.of(1))).not.toThrow();
    first.device.dispose();
    second.device.dispose();
  });

  it("retries a failed native buffer delete through device disposal without repeating successful work", () => {
    const harness = makeDevice();
    const failed = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const successful = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const failedVao = harness.vao(failed, 1);
    const successfulVao = harness.vao(successful, 2);
    harness.failBufferOnce(failed.handle);

    expect(() => harness.device.dispose()).toThrow(/disposal failed/i);
    expect(harness.device.disposed).toBe(true);
    expect(failed.disposed).toBe(false);
    expect(successful.disposed).toBe(true);
    expect(harness.deletedVaos).toEqual([failedVao.handle, successfulVao.handle]);
    expect(harness.bufferAttempts).toEqual([failed.handle, successful.handle]);
    expect(harness.device.getDiagnostics().disposedBuffers).toBe(1);

    harness.device.dispose();
    expect(failed.disposed).toBe(true);
    expect(harness.bufferAttempts).toEqual([failed.handle, successful.handle, failed.handle]);
    expect(harness.deletedVaos).toEqual([failedVao.handle, successfulVao.handle]);
    expect(harness.device.getDiagnostics().disposedBuffers).toBe(2);
    harness.device.dispose();
    expect(harness.bufferAttempts).toHaveLength(3);
  });

  it("keeps a direct native-delete failure device-owned until device disposal", () => {
    const harness = makeDevice();
    const buffer = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const vao = harness.vao(buffer, 1);
    harness.failBufferOnce(buffer.handle);

    expect(() => buffer.dispose()).toThrow(/deleteBuffer failed/);
    expect(buffer.disposed).toBe(false);
    expect(harness.device.getDiagnostics()).toMatchObject({ buffers: 1, bufferBytes: 36, disposedBuffers: 0 });
    expect(harness.deletedVaos).toEqual([vao.handle]);
    expect(() => harness.device.updateBuffer(buffer, 0, Uint8Array.of(1))).toThrow(/not a live/i);
    harness.device.dispose();
    expect(buffer.disposed).toBe(true);
    expect(harness.bufferAttempts).toEqual([buffer.handle, buffer.handle]);
    expect(harness.vaoAttempts).toEqual([vao.handle]);
    expect(harness.device.getDiagnostics()).toMatchObject({ buffers: 0, bufferBytes: 0, disposedBuffers: 1 });
  });

  it("retains failed VAO eviction through device disposal while finishing other buffers", () => {
    const harness = makeDevice();
    const failed = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const successful = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const failedVao = harness.vao(failed, 1);
    const successfulVao = harness.vao(successful, 2);
    harness.failVaoOnce(failedVao.handle);

    expect(() => harness.device.dispose()).toThrow(/disposal failed/i);
    expect(failed.disposed).toBe(false);
    expect(successful.disposed).toBe(true);
    expect(harness.host.drawBinder.vertexArrayCache.get(failedVao.key)).toBe(failedVao);
    expect(harness.deletedVaos).toEqual([successfulVao.handle]);
    expect(harness.deletedBuffers).toEqual([successful.handle]);
    harness.device.dispose();
    expect(failed.disposed).toBe(true);
    expect(harness.vaoAttempts).toEqual([failedVao.handle, successfulVao.handle, failedVao.handle]);
    expect(harness.deletedBuffers).toEqual([successful.handle, failed.handle]);
    expect(harness.host.drawBinder.vertexArrayCache.size).toBe(0);
  });

  it("keeps a closed device retryable through its outer lifecycle when a buffer failed", () => {
    const harness = makeDevice();
    const other = makeDevice();
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(harness.device);
    const failed = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const successful = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const independent = other.device.createBuffer("vertex", 36) as WebGL2Buffer;
    harness.failBufferOnce(failed.handle);

    try {
      expect(() => lifecycle.dispose()).toThrow(AggregateError);
      expect(harness.device.disposed).toBe(true);
      expect(failed.disposed).toBe(false);
      expect(successful.disposed).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(lifecycle.leakCount()).toBe(1);
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(lifecycle.leakCount()).toBe(0);
      expect(failed.disposed).toBe(true);
      expect(harness.bufferAttempts.filter((handle) => handle === failed.handle)).toHaveLength(2);
      expect(harness.bufferAttempts.filter((handle) => handle === successful.handle)).toHaveLength(1);
      expect(independent.disposed).toBe(false);
    } finally {
      harness.device.dispose();
      other.device.dispose();
    }
  });

  it("retries a WebGL VAO failure through geometry and its outer lifecycle across two devices", () => {
    const first = makeDevice();
    const second = makeDevice();
    const lifecycle = new ResourceLifecycle();
    const geometry = lifecycle.track(Geometry.triangle());
    const vertex = geometry.vertexBuffer;
    const index = geometry.indexBuffer!;
    const firstVertex = vertex.upload(first.device) as WebGL2Buffer;
    const secondVertex = vertex.upload(second.device) as WebGL2Buffer;
    const firstIndex = index.upload(first.device) as WebGL2Buffer;
    const secondIndex = index.upload(second.device) as WebGL2Buffer;
    const independent = second.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const vao = first.vao(firstVertex, 1);
    first.failVaoOnce(vao.handle);

    expect(() => lifecycle.dispose()).toThrow(AggregateError);
    expect(lifecycle.disposed).toBe(false);
    expect(lifecycle.leakCount()).toBe(1);
    expect(geometry.disposed).toBe(false);
    expect(firstVertex.disposed).toBe(false);
    expect([secondVertex.disposed, firstIndex.disposed, secondIndex.disposed]).toEqual([true, true, true]);
    expect(independent.disposed).toBe(false);
    expect(first.device.getDiagnostics().buffers).toBe(1);
    expect(first.device.getDiagnostics().bufferBytes).toBe(firstVertex.byteLength);

    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(geometry.disposed).toBe(true);
    expect(firstVertex.disposed).toBe(true);
    expect(first.vaoAttempts).toEqual([vao.handle, vao.handle]);
    for (const handle of [firstVertex.handle, firstIndex.handle]) {
      expect(first.deletedBuffers.filter((value) => value === handle)).toHaveLength(1);
    }
    for (const handle of [secondVertex.handle, secondIndex.handle]) {
      expect(second.deletedBuffers.filter((value) => value === handle)).toHaveLength(1);
    }
    expect(independent.disposed).toBe(false);
    expect(() => second.device.updateBuffer(independent, 0, Uint8Array.of(1))).not.toThrow();
    first.device.dispose();
    second.device.dispose();
  });

  it("lets a peer retire a shared failed VAO before the original buffer retries", () => {
    const harness = makeDevice();
    const vertex = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const peer = harness.device.createBuffer("vertex", 48) as WebGL2Buffer;
    const vao = harness.vao(vertex, 1, peer);
    harness.failVaoOnce(vao.handle);

    expect(() => vertex.dispose()).toThrow(/deleteVertexArray failed/);
    peer.dispose();
    expect(peer.disposed).toBe(true);
    expect(vertex.disposed).toBe(false);
    expect(harness.deletedVaos).toEqual([vao.handle]);
    vertex.dispose();
    expect(vertex.disposed).toBe(true);
    expect(harness.vaoAttempts).toEqual([vao.handle, vao.handle]);
    expect(harness.deletedBuffers.filter((handle) => handle === peer.handle)).toHaveLength(1);
    expect(harness.deletedBuffers.filter((handle) => handle === vertex.handle)).toHaveLength(1);
    harness.device.dispose();
  });

  it("keeps shared VAO retirement retryable when another owner disposes reentrantly", () => {
    const harness = makeDevice();
    const vertex = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const peer = harness.device.createBuffer("vertex", 48) as WebGL2Buffer;
    const vao = harness.vao(vertex, 1, peer);
    const nestedErrors: unknown[] = [];
    harness.onVaoDelete((handle) => {
      if (handle !== vao.handle) return;
      try { peer.dispose(); } catch (error) { nestedErrors.push(error); }
    });

    vertex.dispose();
    expect(nestedErrors).toHaveLength(1);
    expect(String(nestedErrors[0])).toMatch(/disposal is in progress/);
    expect(vertex.disposed).toBe(true);
    expect(peer.disposed).toBe(false);
    expect(harness.deletedVaos).toEqual([vao.handle]);
    peer.dispose();
    expect(peer.disposed).toBe(true);
    expect(harness.vaoAttempts).toEqual([vao.handle]);
    harness.device.dispose();
  });

  it("finishes an in-flight buffer once when its native delete reenters device disposal", () => {
    const harness = makeDevice();
    const first = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const second = harness.device.createBuffer("vertex", 36) as WebGL2Buffer;
    harness.onBufferDelete((handle) => {
      if (handle === first.handle) harness.device.dispose();
    });

    first.dispose();
    expect(harness.device.disposed).toBe(true);
    expect(first.disposed).toBe(true);
    expect(second.disposed).toBe(true);
    expect(harness.bufferAttempts.filter((handle) => handle === first.handle)).toHaveLength(1);
    expect(harness.bufferAttempts.filter((handle) => handle === second.handle)).toHaveLength(1);
    expect(harness.device.getDiagnostics().disposedBuffers).toBe(2);
    harness.device.dispose();
    expect(harness.bufferAttempts).toHaveLength(2);
  });

  it("keeps geometry owned when native buffer deletion reenters its lifecycle and then fails", () => {
    const harness = makeDevice();
    const lifecycle = new ResourceLifecycle();
    const geometry = lifecycle.track(Geometry.triangle());
    const vertex = geometry.vertexBuffer.upload(harness.device) as WebGL2Buffer;
    const index = geometry.indexBuffer!.upload(harness.device) as WebGL2Buffer;
    const nestedErrors: unknown[] = [];
    harness.onBufferDelete((handle) => {
      if (handle !== vertex.handle) return;
      try { lifecycle.dispose(); } catch (error) { nestedErrors.push(error); }
    });
    harness.failBufferOnce(vertex.handle);

    expect(() => vertex.dispose()).toThrow(/deleteBuffer failed/);
    expect(nestedErrors).toHaveLength(1);
    expect(lifecycle.disposed).toBe(false);
    expect(lifecycle.leakCount()).toBe(1);
    expect(geometry.disposed).toBe(false);
    expect(vertex.disposed).toBe(false);
    expect(index.disposed).toBe(true);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(geometry.disposed).toBe(true);
    expect(vertex.disposed).toBe(true);
    expect(harness.bufferAttempts.filter((handle) => handle === vertex.handle)).toHaveLength(2);
    expect(harness.bufferAttempts.filter((handle) => handle === index.handle)).toHaveLength(1);
    harness.device.dispose();
  });
});
