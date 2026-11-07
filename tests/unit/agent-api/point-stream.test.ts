// E6-00 §4 / P-01 / P-02 / I-07: typed mutable-buffer path invariants (no GPU: MockRenderDevice).
import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { points, pointStreamOf } from "../../../packages/engine/src/agent-api/index.js";
import { pointsNodeHandler } from "../../../packages/engine/src/agent-api/compiler/lines.js";
import {
  PointStreamController,
  createTypedPointsGeometry,
  pointStreamControllerFor
} from "../../../packages/engine/src/agent-api/compiler/pointStream.js";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { denseModelInstanceTransforms } from "../../../packages/engine/src/agent-api/compiler/renderInput.js";
import { createProductionModelInstanceTransforms } from "../../../packages/engine/src/agent-api/compiler/primitives.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import type { SceneCompileContext } from "../../../packages/engine/src/contracts/compiler.js";
import type { AuraModelNode, AuraPointsNode } from "../../../packages/engine/src/agent-api/nodes/types.js";

function ramp(count: number, scale = 1): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    out[i * 3] = i * scale; out[i * 3 + 1] = i === 0 ? 0 : -i * scale; out[i * 3 + 2] = i * 0.5 * scale;
  }
  return out;
}

const ctx = {
  renderer: null, assets: null, quality: { tier: "high" }, strict: false,
  flags: resolveQrFlags({ options: "A3D_PARITY_LINES" }), degrade: () => undefined,
  canvas: { width: 800, height: 600, clientWidth: 800 }
} as unknown as SceneCompileContext;
const out = () => {
  const items: { drawRange?: { start: number; count: number }; geometry: { topology: string } }[] = [];
  return { items, addItems: (next: readonly unknown[]) => { items.push(...(next as typeof items)); }, addLights: () => undefined, set: () => undefined, feature: () => undefined };
};


describe("PointStreamController: replace, partial and bounds", () => {
  it("replace writes the interleaved mirror, sets the draw count and exact bounds", () => {
    const c = new PointStreamController({ capacity: 100, colors: "u8x4n" });
    c.write(ramp(10), { colors: new Uint8Array(40).fill(7) });
    expect(c.drawCount).toBe(10);
    expect(c.geometry.bounds.min).toEqual([0, -9, 0]);
    expect(c.geometry.bounds.max).toEqual([9, 0, 4.5]);
    // stride 16: x y z + packed rgba
    const f = c.vertices.floats;
    expect([f[16 / 4 * 3], f[16 / 4 * 3 + 1], f[16 / 4 * 3 + 2]]).toEqual([3, -3, 1.5]);
    expect(Array.from(new Uint8Array(c.vertices.data, 3 * 16 + 12, 4))).toEqual([7, 7, 7, 7]);
    // A smaller full replace shrinks the draw count and the bounds with it.
    c.write(ramp(2));
    expect(c.drawCount).toBe(2);
    expect(c.geometry.bounds.max).toEqual([1, 0, 0.5]);
  });

  it("an offset write is partial: the draw count only grows and bounds only grow", () => {
    const c = new PointStreamController({ capacity: 100 });
    c.write(ramp(4));
    c.write(ramp(2, 100), { offset: 10 }); // points 10..11
    expect(c.drawCount).toBe(12);
    expect(c.geometry.bounds.max[0]).toBe(100);
    expect(c.geometry.bounds.min[0]).toBe(0);
    c.write(ramp(1), { offset: 0 });
    expect(c.drawCount).toBe(12);
    expect(c.geometry.bounds.max[0]).toBe(100); // never shrinks on a partial write
  });

  it("a bounds hint is used verbatim and positions are never scanned", () => {
    const c = new PointStreamController({ capacity: 8, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });
    c.write(ramp(4, 50));
    expect(c.geometry.bounds.max).toEqual([1, 1, 1]);
  });

  it("capacity, range and input are validated with typed codes", () => {
    const c = new PointStreamController({ capacity: 4 });
    expect(() => c.write(ramp(5))).toThrow(/POINT_STREAM_CAPACITY_EXCEEDED/);
    expect(() => c.write(ramp(2), { offset: 3 })).toThrow(/POINT_STREAM_CAPACITY_EXCEEDED/);
    expect(() => c.write(ramp(2), { count: 3 })).toThrow(/POINT_STREAM_SHORT_INPUT/);
    expect(() => c.write(new Float64Array(3) as never)).toThrow(/POINT_STREAM_TYPE/);
    expect(() => c.write(ramp(1), { colors: new Uint8Array(4) })).toThrow(/POINT_STREAM_NO_COLORS/);
    expect(() => c.write(Float32Array.of(NaN, 0, 0), { validate: true })).toThrow(/POINT_STREAM_NON_FINITE/);
    expect(() => c.setDrawCount(5)).toThrow(/POINT_STREAM_CAPACITY_EXCEEDED/);
    c.dispose();
    expect(() => c.write(ramp(1))).toThrow(/POINT_STREAM_DISPOSED/);
  });

  it("converts color formats: u32 words, f32 -> u8, u8 -> f32 (webgpu layout), srgb table", () => {
    const u8 = new PointStreamController({ capacity: 2, colors: "u8x4n" });
    u8.write(ramp(2), { colors: Uint32Array.of(0xff804020, 0x01020304) });
    expect(Array.from(new Uint8Array(u8.vertices.data, 12, 4))).toEqual([0x20, 0x40, 0x80, 0xff]);
    u8.write(ramp(1), { colors: Float32Array.of(1, 0.5, 0, 2) });
    expect(Array.from(new Uint8Array(u8.vertices.data, 12, 4))).toEqual([255, 128, 0, 255]);

    const f32 = new PointStreamController({ capacity: 1, colors: "u8x4n" }, { backend: "webgpu" });
    expect(f32.layout).toBe("f32");
    f32.write(ramp(1), { colors: Uint8Array.of(255, 51, 0, 255) });
    expect(Array.from(f32.vertices.floats.subarray(3, 7))).toEqual([1, Math.fround(0.2), 0, 1]);

    const srgb = new PointStreamController({ capacity: 1, colors: "u8x4n", colorSpace: "srgb" });
    srgb.write(ramp(1), { colors: Uint8Array.of(128, 255, 0, 200) });
    const px = new Uint8Array(srgb.vertices.data, 12, 4);
    expect(px[0]).toBe(55); // 0.2158 linear
    expect(px[1]).toBe(255);
    expect(px[3]).toBe(200); // alpha is never decoded
  });
});

describe("PointStreamController: lease", () => {
  it("without colors the lease is zero-copy over the CPU mirror", () => {
    const c = new PointStreamController({ capacity: 16 });
    const lease = c.lease();
    expect(lease.positions).toBe(c.vertices.floats);
    expect(lease.colors).toBeUndefined();
    lease.positions.set(ramp(3));
    lease.commit(3);
    expect(c.drawCount).toBe(3);
    expect(c.geometry.bounds.max).toEqual([2, 0, 1]);
  });
});

describe("PointStreamController: lease with colors and partial commit", () => {
  it("interleaves staged data and only dirties the committed range", () => {
    const device = new MockRenderDevice();
    const c = new PointStreamController({ capacity: 64, colors: "u8x4n" });
    c.vertices.upload(device); // initial full upload
    const update = vi.spyOn(device, "updateBuffer");
    const lease = c.lease();
    lease.positions.set(ramp(8));
    (lease.colors as Uint8Array).fill(9, 0, 32);
    lease.commit(8);
    c.vertices.upload(device);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).toBe(0);
    expect((update.mock.calls[0]![2] as ArrayBufferView).byteLength).toBe(8 * 16);
    // Partial: re-publish points 4..5 only.
    update.mockClear();
    lease.positions.set(Float32Array.of(5, 5, 5, 6, 6, 6), 4 * 3);
    lease.commit(8, { start: 4, count: 2 });
    c.vertices.upload(device);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).toBe(4 * 16);
    expect((update.mock.calls[0]![2] as ArrayBufferView).byteLength).toBe(2 * 16);
    expect(c.vertices.floats[4 * 4]).toBe(5);
  });
});

describe("PointStreamController: upload accounting", () => {
  it("uploads exactly the dirty byte range, never re-creates the GPU buffer, and allocates nothing per tick", () => {
    const device = new MockRenderDevice();
    const create = vi.spyOn(device, "createBuffer");
    const update = vi.spyOn(device, "updateBuffer");
    const c = new PointStreamController({ capacity: 4096, colors: "u8x4n" });
    const data = c.vertices.data;
    const geometry = c.geometry;
    const cloud = ramp(4096);
    const colors = new Uint8Array(4096 * 4).fill(200);
    c.write(cloud, { colors });
    c.vertices.upload(device);
    expect(create).toHaveBeenCalledTimes(1);
    const allocationsBefore = c.stats.allocations;
    update.mockClear();
    for (let tick = 0; tick < 200; tick += 1) {
      cloud[0] = tick;
      c.write(cloud, { colors });
      c.vertices.upload(device);
    }
    expect(create).toHaveBeenCalledTimes(1); // no GPU resource churn
    expect(update).toHaveBeenCalledTimes(200);
    for (const call of update.mock.calls) expect((call[2] as ArrayBufferView).byteLength).toBe(4096 * 16);
    expect(c.stats.allocations).toBe(allocationsBefore); // no staging growth
    expect(c.vertices.data).toBe(data);
    expect(c.geometry).toBe(geometry);
    expect(c.stats.commits).toBe(201);
  });

  it("a partial write of K points uploads K x stride bytes at the right offset", () => {
    const device = new MockRenderDevice();
    const c = new PointStreamController({ capacity: 1000 });
    c.write(ramp(1000));
    c.vertices.upload(device);
    const update = vi.spyOn(device, "updateBuffer");
    c.write(ramp(10, 3), { offset: 500 });
    c.vertices.upload(device);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).toBe(500 * 12);
    expect((update.mock.calls[0]![2] as ArrayBufferView).byteLength).toBe(10 * 12);
    // Nothing dirty -> no upload at all.
    update.mockClear();
    c.vertices.upload(device);
    expect(update).not.toHaveBeenCalled();
  });

  it("context loss: a new device generation re-uploads the whole CPU mirror", () => {
    const device = new MockRenderDevice() as MockRenderDevice & { generation: number };
    device.generation = 1;
    const c = new PointStreamController({ capacity: 64, colors: "u8x4n" });
    c.write(ramp(64), { colors: new Uint8Array(256).fill(33) });
    const first = c.vertices.upload(device);
    device.generation = 2; // context restored
    const second = c.vertices.upload(device);
    expect(second).not.toBe(first);
    const bytes = device.readBuffer(second);
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(c.vertices.data)));
  });

  it("capacity growth is an explicit new mount: the old controller is invalidated", () => {
    const small = new PointStreamController({ capacity: 4 });
    small.dispose();
    const big = new PointStreamController({ capacity: 8 });
    big.write(ramp(8));
    expect(big.drawCount).toBe(8);
    expect(() => small.write(ramp(1))).toThrow(/POINT_STREAM_DISPOSED/);
  });
});

describe("points.stream node, handle and handler", () => {
  it("serialises capacity and layout only, and requires a runtime id", () => {
    const node = points.stream({ capacity: 10, colors: "u8x4n", runtime: { id: "s" } }).toJSON() as AuraPointsNode;
    expect(node.stream).toEqual({ capacity: 10, colors: "u8x4n" });
    expect(node.positions).toEqual([]);
    expect(JSON.stringify(node)).not.toContain("Float32");
    expect(() => points.stream({ capacity: 10 } as never)).toThrow(/runtime/);
    expect(() => points.stream({ capacity: 0, runtime: { id: "s" } })).toThrow(/capacity/);
    expect(() => points.stream({ capacity: 4, colorSpace: "srgb", runtime: { id: "s" } })).toThrow(/srgb/);
  });

  it("writes through the handle reach the mounted geometry; draw range follows; nothing is drawn at 0 points", () => {
    const node = points.stream({ capacity: 32, colors: "u8x4n", size: 3, runtime: { id: "stream-a" } }).toJSON() as AuraPointsNode;
    const handle = createRuntimeNodeHandle(node as never, { id: "stream-a" });
    const stream = pointStreamOf(handle);
    expect(() => stream.write(ramp(1))).toThrow(/POINT_STREAM_NOT_MOUNTED/);
    const sink = out();
    pointsNodeHandler.compile(node as never, ctx, sink as never);
    pointsNodeHandler.update?.(node as never, handle, ctx, sink as never, 0);
    expect(sink.items).toHaveLength(0); // zero points: nothing drawn
    const before = handle.version;
    stream.write(ramp(12), { colors: new Uint8Array(48) });
    expect(handle.version).toBe(before + 1);
    expect(stream.drawCount).toBe(12);
    pointsNodeHandler.update?.(node as never, handle, ctx, sink as never, 0);
    expect(sink.items).toHaveLength(1);
    expect(sink.items[0]!.drawRange).toEqual({ start: 0, count: 12 });
    expect(sink.items[0]!.geometry.topology).toBe("points");
    stream.setDrawCount(5);
    pointsNodeHandler.update?.(node as never, handle, ctx, sink as never, 0);
    expect(sink.items[1]!.drawRange).toEqual({ start: 0, count: 5 });
    pointsNodeHandler.dispose?.(node as never);
    expect(pointStreamControllerFor(node.stream)).toBeUndefined();
    expect(() => stream.write(ramp(1))).toThrow(/POINT_STREAM_NOT_MOUNTED/);
  });

  it("pointStreamOf rejects non-stream handles", () => {
    const node = points({ positions: [[0, 0, 0]], runtime: { id: "plain" } }).toJSON();
    expect(() => pointStreamOf(createRuntimeNodeHandle(node as never, { id: "plain" }))).toThrow(/POINT_STREAM_REQUIRED/);
  });
});

describe("P-01: typed static points()", () => {
  it("a Float32Array cloud with packed colors builds with no per-point objects and keeps the caller's array untouched", () => {
    const positions = ramp(50_000);
    const colors = new Uint8Array(50_000 * 4).fill(255);
    const builder = points({ positions, colors, size: 2 });
    const node = builder.toJSON() as AuraPointsNode;
    expect(node.positions).toBeInstanceOf(Float32Array);
    expect(node.positions).not.toBe(positions); // copied once, never aliased
    expect(node.colors).toBeInstanceOf(Uint8Array);
    positions[0] = 999;
    expect((node.positions as Float32Array)[0]).toBe(0);
    const sink = out();
    pointsNodeHandler.compile(node as never, ctx, sink as never);
    pointsNodeHandler.update?.(node as never, undefined, ctx, sink as never, 0);
    expect(sink.items).toHaveLength(1);
    pointsNodeHandler.dispose?.(node as never);
  });

  it("packed u8 colors give the same vertex bytes as the equivalent float colors", () => {
    const positions = ramp(3);
    const u8 = createTypedPointsGeometry(positions, Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255));
    const f32 = createTypedPointsGeometry(positions, Float32Array.of(1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1));
    for (let i = 0; i < 3; i += 1) {
      const a = u8.vertexBuffer.getDecodedAttribute(i, "color");
      const b = f32.vertexBuffer.getDecodedAttribute(i, "color");
      expect(Array.from(a)).toEqual(Array.from(b));
    }
    expect(Array.from(u8.vertexBuffer.getDecodedAttribute(2, "position"))).toEqual([2, -2, 1]);
  });

  it("validates typed input", () => {
    expect(() => points({ positions: Float32Array.of(0, 0, NaN) })).toThrow(/finite/);
    expect(() => points({ positions: Float32Array.of(0, 0, 0), colors: new Uint8Array(3) })).toThrow(/match positions length/);
    expect(() => points({ positions: [[0, 0, 0]], colors: new Uint8Array(4) })).toThrow(/Float32Array/);
  });

  it("legacy inputs are unchanged: tuples and string colors keep the old node shape", () => {
    const node = points({ positions: [[0, 0, 0], [1, 1, 1]], colors: ["#ff0000", "#00ff00"] }).toJSON() as AuraPointsNode;
    expect(Array.isArray(node.positions)).toBe(true);
    expect(node.colors).toEqual(["#ff0000", "#00ff00"]);
  });
});

describe("I-07: dense matrices on instances.model", () => {
  const bounds = { min: [-1, 0, -1] as const, max: [1, 2, 1] as const };
  const modelNode = { kind: "model", asset: { id: "m" }, targetHeight: 1.5 } as unknown as AuraModelNode;

  it("dense translate/scale equals the spec-path instance matrix for the same transform", () => {
    const specs = [{ position: [3, 0, -2] as [number, number, number], scale: 2 }, { position: [-1, 4, 0] as [number, number, number], scale: 0.5 }];
    const expected = createProductionModelInstanceTransforms(specs, { ...modelNode, instances: specs } as AuraModelNode, bounds, 0);
    const dense = new Float32Array(32);
    specs.forEach((spec, index) => {
      const s = spec.scale;
      dense.set([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, spec.position[0], spec.position[1], spec.position[2], 1], index * 16);
    });
    const actual = denseModelInstanceTransforms({}, dense, modelNode, bounds, 0);
    expect(actual.length).toBe(32);
    for (let i = 0; i < 32; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, 4);
  });

  it("reuses its output while the count is stable and applies a parent world matrix", () => {
    const key = {};
    const dense = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1);
    const first = denseModelInstanceTransforms(key, dense, modelNode, bounds, 0);
    const second = denseModelInstanceTransforms(key, dense, modelNode, bounds, 0);
    expect(second).toBe(first);
    const parent = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1);
    const lone = Float32Array.from(denseModelInstanceTransforms({}, dense, modelNode, bounds, 0));
    const moved = denseModelInstanceTransforms({}, dense, modelNode, bounds, 0, parent);
    expect(moved[12]! - lone[12]!).toBeCloseTo(10, 5);
    expect(moved[13]! - lone[13]!).toBeCloseTo(20, 5);
    expect(moved[14]! - lone[14]!).toBeCloseTo(30, 5);
  });
});
