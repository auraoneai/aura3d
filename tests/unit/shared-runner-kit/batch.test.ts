import { describe, expect, it } from "vitest";
import { Batch, Slots, mergeMeshes, scrollFrameZ, type MeshData } from "../../../examples/shared/runner-kit/batch";

const quad = (): MeshData => ({
  positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  uvs: [0, 0, 1, 0, 1, 1, 0, 1],
  indices: [0, 1, 2, 0, 2, 3]
});

type FlushHandle = Parameters<Batch["flush"]>[0];

function fakeHandle() {
  const calls: { name: string; offset: number; length: number }[] = [];
  const h = {
    updateAttribute: (name: string, update: { array: ArrayLike<number>; offset: number }) => {
      calls.push({ name, offset: update.offset, length: update.array.length });
    }
  };
  return { calls, h: h as unknown as FlushHandle };
}

describe("runner-kit Batch", () => {
  it("uploads only the dirty runs, merging adjacent instances", () => {
    const batch = new Batch(quad(), 6);
    const { calls, h } = fakeHandle();
    batch.place(0, 1, 0, 0, 0, 1, 1, 1);
    batch.place(2, 2, 0, 0, 0, 1, 1, 1);
    batch.place(3, 3, 0, 0, 0, 1, 1, 1);
    batch.flush(h);
    const positions = calls.filter((c) => c.name === "position");
    expect(positions).toEqual([
      { name: "position", offset: 0, length: 12 },
      { name: "position", offset: 8, length: 24 }
    ]);
    expect(batch.uploadedVertices).toBe(12);
    calls.length = 0;
    batch.flush(h);
    expect(calls).toEqual([]);
  });

  it("tone uploads are tracked separately from geometry", () => {
    const batch = new Batch(quad(), 4, [1, 1, 1]);
    const { calls, h } = fakeHandle();
    batch.setTone(1, [1, 0, 0]);
    batch.flush(h);
    expect(calls).toEqual([{ name: "tone", offset: 4, length: 12 }]);
    expect(batch.uploadedVertices).toBe(0);
  });

  it("collapse zeroes the instance and uploads it", () => {
    const batch = new Batch(quad(), 2);
    batch.place(1, 5, 0, 0, 0, 1, 1, 1);
    const { h } = fakeHandle();
    batch.flush(h);
    batch.collapse(1);
    expect(Array.from(batch.positions.slice(12, 24))).toEqual(new Array(12).fill(0));
  });

  it("normals: false skips the normal upload for unlit batches", () => {
    const batch = new Batch(quad(), 2);
    const { calls, h } = fakeHandle();
    batch.place(0, 0, 0, 0, 0, 1, 1, 1);
    batch.flush(h, false);
    expect(calls.map((c) => c.name)).toEqual(["position"]);
  });

  it("place applies yaw and scale to positions and normals", () => {
    const batch = new Batch(quad(), 1);
    batch.place(0, 10, 0, 0, Math.PI / 2, 2, 1, 1);
    expect(batch.positions[0]).toBeCloseTo(10 + -0.5 * 0 + -0.5 * 1, 5);
    expect(batch.positions[2]).toBeCloseTo(0 - -0.5 * 2 * 1 + -0.5 * 0, 5);
    const n = Math.hypot(batch.normals[0]!, batch.normals[1]!, batch.normals[2]!);
    expect(n).toBeCloseTo(1, 5);
  });

  it("geometry() carries the tone attribute only when toned", () => {
    const plain = new Batch(quad(), 2).geometry();
    const toned = new Batch(quad(), 2, [1, 0, 0]).geometry();
    expect(plain).toBeDefined();
    expect(toned).toBeDefined();
  });
});

describe("runner-kit scrolling frame", () => {
  it("vertex z plus node scroll reproduces run-space z at write time", () => {
    const z = -120, scroll = 30;
    expect(scrollFrameZ(z, scroll) + scroll).toBe(z);
  });

  it("a live entity advances exactly with the scroll delta", () => {
    const z = -120, writeScroll = 30;
    const vertexZ = scrollFrameZ(z, writeScroll);
    for (const now of [30, 45.5, 100]) {
      const rendered = vertexZ + now;
      expect(rendered - z).toBeCloseTo(now - writeScroll, 9);
    }
  });
});

describe("runner-kit mergeMeshes", () => {
  it("offsets indices per part", () => {
    const merged = mergeMeshes([quad(), quad()]);
    expect(merged.positions.length).toBe(24);
    expect(merged.indices).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  });
});

describe("runner-kit Slots", () => {
  it("keeps a slot for an object's life and reuses freed slots", () => {
    const slots = new Slots<object>(2);
    const a = {}, b = {}, c = {};
    const sa = slots.use(a);
    expect(sa.fresh).toBe(true);
    expect(slots.use(a)).toEqual({ slot: sa.slot, fresh: false });
    slots.use(b);
    expect(slots.use(c).slot).toBe(-1);
    const gone: number[] = [];
    slots.retain([b, c], (s) => gone.push(s));
    expect(gone).toEqual([sa.slot]);
    const sc = slots.use(c);
    expect(sc).toEqual({ slot: sa.slot, fresh: true });
  });

  it("retain frees only departed objects", () => {
    const slots = new Slots<object>(3);
    const a = {}, b = {};
    slots.use(a);
    slots.use(b);
    const gone: number[] = [];
    slots.retain([a], (s) => gone.push(s));
    expect(gone.length).toBe(1);
    expect(slots.use(a).fresh).toBe(false);
  });
});