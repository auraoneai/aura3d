/**
 * Audit lane E2: SI-3 (instance slots keyed by owner, not by per-pass draw order) and SI-8 (wind vegetation is never
 * per-instance frustum culled).
 */
import { describe, expect, it } from "vitest";
import { InstanceSlotAllocator, instanceCullExcluded } from "../../../packages/rendering/src/ForwardPass";

interface FakeBuffer { readonly id: number; readonly capacity: number; readonly colors: boolean; uploads: number; last: string; disposed: boolean }

function fakeAllocator(maxSlots?: number, stale?: number) {
  let next = 0;
  const created: FakeBuffer[] = [];
  const allocator = new InstanceSlotAllocator<FakeBuffer>(
    (capacity, colors) => {
      const buffer = { id: next++, capacity, colors, uploads: 0, last: "", disposed: false };
      created.push(buffer);
      return buffer;
    },
    (buffer) => { buffer.disposed = true; },
    maxSlots,
    stale
  );
  // The content-compare upload skip of InstanceBuffer.setMatrices, reduced to a string compare.
  const upload = (buffer: FakeBuffer, content: string) => {
    if (buffer.last !== content) { buffer.uploads += 1; buffer.last = content; }
  };
  return { allocator, created, upload };
}

describe("SI-3: instance slots survive several passes per frame", () => {
  it("an opaque pass and a transparent segment drawing different instanced items stop re-uploading each frame", () => {
    const { allocator, created, upload } = fakeAllocator();
    const frame = () => {
      allocator.beginPass(); // opaque ForwardPass
      upload(allocator.acquire(allocator.labelKey("primitive-1:trees"), 300, false).buffer, "trees");
      allocator.beginPass(); // interleaved transparent segment (a new ForwardPass)
      upload(allocator.acquire(allocator.labelKey("primitive-7:glass"), 80, true).buffer, "glass");
    };
    for (let i = 0; i < 5; i += 1) frame();
    expect(created).toHaveLength(2);
    // One upload each on the first frame, none after: the order-keyed cursor (reset to 0 per pass) re-uploaded and
    // re-created the shared slot 0 twice per frame (different colour layout).
    expect(created.map((b) => b.uploads)).toEqual([1, 1]);
    expect(created.every((b) => !b.disposed)).toBe(true);
  });

  it("two items with the same label in one pass keep separate slots", () => {
    const { allocator, created, upload } = fakeAllocator();
    for (let f = 0; f < 3; f += 1) {
      allocator.beginPass();
      upload(allocator.acquire(allocator.labelKey("rocks"), 100, false).buffer, "a");
      upload(allocator.acquire(allocator.labelKey("rocks"), 100, false).buffer, "b");
    }
    expect(created).toHaveLength(2);
    expect(created.map((b) => b.uploads)).toEqual([1, 1]);
  });

  it("an unlabeled item is keyed by its transform array", () => {
    const { allocator } = fakeAllocator();
    const a = new Float32Array(16 * 70);
    const b = new Float32Array(16 * 70);
    allocator.beginPass();
    const slotA = allocator.acquire(a, 70, false);
    const slotB = allocator.acquire(b, 70, false);
    allocator.beginPass();
    expect(allocator.acquire(b, 70, false)).toBe(slotB);
    expect(allocator.acquire(a, 70, false)).toBe(slotA);
  });

  it("growth re-creates the owner's buffer at the next power of two and disposes the old one", () => {
    const { allocator, created } = fakeAllocator();
    allocator.beginPass();
    allocator.acquire("x#0", 50, false);
    allocator.beginPass();
    const grown = allocator.acquire("x#0", 300, false);
    expect(grown.capacity).toBe(512);
    expect(created[0]!.disposed).toBe(true);
    expect(allocator.size).toBe(1);
  });

  it("idle slots are reused by new owners and the pool stays bounded", () => {
    const { allocator } = fakeAllocator(4, 2);
    for (let f = 0; f < 50; f += 1) {
      allocator.beginPass();
      allocator.acquire(`churn-${f}#0`, 10, false);
    }
    expect(allocator.size).toBeLessThanOrEqual(3);
    for (let i = 0; i < 10; i += 1) allocator.acquire(`burst-${i}#0`, 10, false);
    expect(allocator.size).toBe(4);
  });
});

describe("SI-8: wind vegetation is excluded from the per-instance frustum cull", () => {
  it("a prd10.wind item draws every instance", () => {
    expect(instanceCullExcluded({ label: "prd10.wind:conifers" }, false)).toBe(true);
  });

  it("a plain instanced item is still culled; the existing exclusions hold", () => {
    expect(instanceCullExcluded({ label: "primitive-3:crates" }, false)).toBe(false);
    expect(instanceCullExcluded({ label: "primitive-3:crates", frustumCulled: false }, false)).toBe(true);
    expect(instanceCullExcluded({ label: "primitive-3:crates" }, true)).toBe(true);
    expect(instanceCullExcluded({}, false)).toBe(false);
  });
});
