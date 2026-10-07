import { describe, expect, it } from "vitest";

import { RenderTargetPool } from "../../../../packages/rendering/src/resources/RenderTargetPool";
import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../../../../packages/rendering/src/RenderDevice";

let nextId = 0;

function makeTarget(desc: RenderTargetDescriptor): RenderTarget {
  return {
    id: ++nextId,
    width: desc.width,
    height: desc.height,
    label: desc.label ?? "fake",
    colorTexture: { format: desc.format ?? "rgba8" } as RenderTarget["colorTexture"],
    depthTexture: desc.depth === "texture" ? ({} as RenderTarget["depthTexture"]) : undefined,
    sampleCount: desc.sampleCount,
    disposed: false,
    dispose() { this.disposed = true; }
  } as RenderTarget & { disposed: boolean };
}

function makeDevice() {
  const descriptors: RenderTargetDescriptor[] = [];
  const device = {
    createRenderTarget(desc: RenderTargetDescriptor): RenderTarget {
      descriptors.push(desc);
      return makeTarget(desc);
    }
  } as unknown as RenderDevice;
  return { device, descriptors };
}

const desc = { width: 320, height: 180, format: "rgba8", samples: 1, depth: false } as const;

describe("RenderTargetPool (C-28 real)", () => {
  it("creates on first acquire and reuses after release", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const t1 = pool.acquire(desc);
    pool.release(t1);
    const t2 = pool.acquire(desc);
    expect(t2).toBe(t1);
    expect(descriptors).toHaveLength(1);
  });

  it("does not share targets across different keys", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquire(desc);
    pool.release(a);
    const b = pool.acquire({ ...desc, format: "rgba16f" });
    const c = pool.acquire({ ...desc, depth: true });
    const d = pool.acquire({ ...desc, samples: 4 });
    expect(b).not.toBe(a);
    expect(c).not.toBe(a);
    expect(d).not.toBe(a);
    expect(descriptors).toHaveLength(4);
  });

  it("requests a sampleable depth texture for depth:true, none otherwise", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    pool.acquire({ ...desc, depth: true });
    pool.acquire(desc);
    expect(descriptors[0].depth).toBe("texture");
    expect(descriptors[1].depth).toBe(false);
  });

  it("acquires concurrently-in-use targets separately", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquire(desc);
    const b = pool.acquire(desc);
    expect(b).not.toBe(a);
    expect(descriptors).toHaveLength(2);
  });

  it("ignores foreign targets on release (does not dispose them)", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const foreign = makeTarget({ width: 8, height: 8 });
    pool.release(foreign);
    expect((foreign as { disposed: boolean }).disposed).toBe(false);
    expect(pool.poolStats().idle).toBe(0);
  });

  it("trim disposes targets idle longer than maxIdleFrames", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquire(desc);
    pool.release(a);
    pool.trim(1); // generation 1: idleSince 0 → kept (1 gen)
    expect((a as unknown as { disposed: boolean }).disposed).toBe(false);
    pool.trim(1); // generation 2: idle for 2 gens > 1 → disposed
    expect((a as unknown as { disposed: boolean }).disposed).toBe(true);
    expect(pool.poolStats().idle).toBe(0);
  });

  it("reacquire clears idle state so trim keeps live targets", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquire(desc);
    pool.release(a);
    const b = pool.acquire(desc);
    pool.trim(1);
    pool.release(b);
    pool.trim(1);
    expect((b as unknown as { disposed: boolean }).disposed).toBe(false);
    expect(descriptors).toHaveLength(1);
  });

  it("trim(0) disposes every idle target", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquire(desc);
    pool.release(a);
    pool.trim(0);
    expect((a as unknown as { disposed: boolean }).disposed).toBe(true);
  });
});
