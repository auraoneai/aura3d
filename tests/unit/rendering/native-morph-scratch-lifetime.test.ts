import { afterEach, describe, expect, it, vi } from "vitest";
import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import type { MorphTargetDelta } from "../../../packages/rendering/src/MorphTarget";
import type { RenderBuffer, RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { releaseMorphScratchGeometry, resolveRenderGeometry } from "../../../packages/rendering/src/forward/Deform";
import "../../../packages/rendering/src/lanes/prd06";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";

const enabled: QrFlags = {
  values: { A3D_QR_ANIMATION: true },
  on(name: QrFlagName) { return name === "A3D_QR_ANIMATION"; }
};
const disabled: QrFlags = { values: {}, on() { return false; } };

function sourceGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [0, 0, 0]);
  vertices.setAttribute(1, "position", [1, 0, 0]);
  vertices.setAttribute(2, "position", [0, 1, 0]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3, "uint32"));
}

function targets(delta: number): MorphTargetDelta[] {
  return [{ positions: [[delta, 0, 0], [0, 0, 0], [0, 0, 0]] }];
}

function resolve(source: Geometry, value: readonly MorphTargetDelta[]): Geometry {
  return resolveRenderGeometry({ geometry: source, morphTargets: value, morphWeights: [1] } as RenderItem);
}

afterEach(() => {
  setRendererQrFlags(disabled);
  vi.restoreAllMocks();
});

describe("persistent morph scratch ownership", () => {
  it("releases replaced wrappers while keeping buffers live for the current wrapper and peers", () => {
    setRendererQrFlags(enabled);
    const source = sourceGeometry();
    const first = resolve(source, targets(1));
    const vertices = first.vertexBuffer;
    const indices = first.indexBuffer!;
    expect(indices.type).toBe("uint32");
    const peer = new Geometry(vertices, indices, first.topology, first.bounds);

    // Forward/depth passes call dispose after every draw; that stays a no-op.
    first.dispose();
    expect(first.vertexBuffer).toBe(vertices);
    const second = resolve(source, targets(2));
    expect(() => first.vertexBuffer).toThrow(/disposed/i);
    expect(second.vertexBuffer).toBe(vertices);
    expect(second.indexBuffer).toBe(indices);
    expect(peer.vertexBuffer.getAttribute(0, "position")).toEqual([2, 0, 0]);

    releaseMorphScratchGeometry(source);
    expect(() => second.vertexBuffer).toThrow(/disposed/i);
    expect(peer.vertexBuffer).toBe(vertices);
    expect(peer.indexBuffer).toBe(indices);
    peer.dispose();
    expect(() => vertices.readBytes()).toThrow(/disposed/i);
    expect(() => indices.assertReadable()).toThrow(/disposed/i);
    expect(source.vertexBuffer.getAttribute(0, "position")).toEqual([0, 0, 0]);
    source.dispose();
  });

  it("keeps the previous cached wrapper usable when replacement construction fails", () => {
    setRendererQrFlags(enabled);
    const source = sourceGeometry();
    const originalTargets = targets(1);
    const first = resolve(source, originalTargets);
    const buffer = first.vertexBuffer;
    const originalRead = VertexBuffer.prototype.readBytes;
    const read = vi.spyOn(VertexBuffer.prototype, "readBytes").mockImplementation(function (this: VertexBuffer, offset?: number, length?: number) {
      if (this === buffer) throw new Error("scratch validation failed");
      return originalRead.call(this, offset, length);
    });

    expect(() => resolve(source, targets(2))).toThrow("scratch validation failed");
    read.mockRestore();
    expect(first.vertexBuffer).toBe(buffer);
    expect(resolve(source, originalTargets)).toBe(first);
    releaseMorphScratchGeometry(source);
    source.dispose();
  });

  it("cleans every newly allocated buffer if initial preparation fails, preserving the original error", () => {
    setRendererQrFlags(enabled);
    const source = sourceGeometry();
    const sourceVertices = source.vertexBuffer;
    const sourceIndices = source.indexBuffer;
    const disposedVertices: VertexBuffer[] = [];
    const disposedIndices: IndexBuffer[] = [];
    const disposeVertex = VertexBuffer.prototype.dispose;
    const disposeIndex = IndexBuffer.prototype.dispose;
    vi.spyOn(VertexBuffer.prototype, "dispose").mockImplementation(function (this: VertexBuffer) {
      disposedVertices.push(this);
      disposeVertex.call(this);
      if (this !== sourceVertices) throw new Error("cleanup failed");
    });
    vi.spyOn(IndexBuffer.prototype, "dispose").mockImplementation(function (this: IndexBuffer) {
      disposedIndices.push(this);
      disposeIndex.call(this);
    });
    const failure = new Error("bad target data");
    const bad = [{ get positions(): never { throw failure; } }] as MorphTargetDelta[];

    expect(() => resolve(source, bad)).toThrow(failure);
    expect(disposedVertices).toHaveLength(1);
    expect(disposedVertices[0]).not.toBe(sourceVertices);
    expect(disposedIndices).toHaveLength(1);
    expect(disposedIndices[0]).not.toBe(sourceIndices);
    expect(source.vertexBuffer.getAttribute(1, "position")).toEqual([1, 0, 0]);
    vi.restoreAllMocks();
    const retry = resolve(source, targets(1));
    expect(retry.vertexBuffer.getAttribute(0, "position")).toEqual([1, 0, 0]);
    releaseMorphScratchGeometry(source);
    source.dispose();
  });

  it("does not publish over a scratch released reentrantly by target data", () => {
    setRendererQrFlags(enabled);
    const source = sourceGeometry();
    const first = resolve(source, targets(1));
    let released = false;
    const next = [{
      get positions(): readonly (readonly [number, number, number])[] {
        if (!released) { released = true; releaseMorphScratchGeometry(source); }
        return [[2, 0, 0], [0, 0, 0], [0, 0, 0]];
      }
    }];

    expect(() => resolve(source, next)).toThrow(/scratch changed/i);
    expect(() => first.vertexBuffer).toThrow(/disposed/i);
    expect(resolve(source, targets(3)).vertexBuffer.getAttribute(0, "position")).toEqual([3, 0, 0]);
    releaseMorphScratchGeometry(source);
    source.dispose();
  });

  it("drops the cached wrapper and releases remaining resources even when device cleanup fails", () => {
    setRendererQrFlags(enabled);
    const source = sourceGeometry();
    const target = targets(1);
    const first = resolve(source, target);
    const vertices = first.vertexBuffer;
    const indices = first.indexBuffer!;
    const released: string[] = [];
    const device = {
      createBuffer(usage: "vertex" | "index", byteLength: number): RenderBuffer {
        return {
          id: usage === "vertex" ? 1 : 2, usage, byteLength, disposed: false,
          dispose() {
            released.push(usage);
            if (usage === "vertex") throw new Error("device cleanup failed");
          }
        } as RenderBuffer;
      }
    } as unknown as RenderDevice;
    vertices.upload(device);
    indices.upload(device);

    expect(() => releaseMorphScratchGeometry(source)).toThrow(/Geometry disposal failed/);
    expect(released).toEqual(["vertex", "index"]);
    expect(() => vertices.readBytes()).toThrow(/disposed/i);
    expect(() => indices.assertReadable()).toThrow(/disposed/i);
    expect(() => releaseMorphScratchGeometry(source)).not.toThrow();
    expect(resolve(source, target)).not.toBe(first);
    releaseMorphScratchGeometry(source);
    source.dispose();
  });
});
