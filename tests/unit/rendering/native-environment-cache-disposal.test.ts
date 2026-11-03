import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import type { EnvironmentProbe, EnvironmentProbeFactory } from "../../../packages/rendering/src/contracts/environment";
import { EnvironmentCache } from "../../../packages/rendering/src/environment/EnvironmentCache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function testProbe() {
  const faces = ["px", "nx", "py", "ny", "pz", "nz"] as const;
  const texture = new Texture({
    width: 1,
    height: 1,
    dimension: "cube",
    format: "rgba16f",
    cubeFaces: faces.map((face) => ({
      face,
      mipLevels: [{ width: 1, height: 1, data: new Uint16Array(4) }]
    }))
  });
  const dispose = vi.fn(() => texture.dispose());
  const probe: EnvironmentProbe = {
    kind: "environment-probe",
    specularCube: texture,
    mipCount: 1,
    faceSize: 64,
    sh9: new Float32Array(27),
    shTexture: null,
    background: null,
    source: "hdri",
    dispose
  };
  return { probe, texture, dispose };
}

const unusedFactory: EnvironmentProbeFactory = {
  fromEquirect: () => { throw new Error("unexpected factory call"); },
  fromCube: () => { throw new Error("unexpected factory call"); },
  fromScene: () => { throw new Error("unexpected factory call"); },
  neutral: () => { throw new Error("unexpected factory call"); }
};
const key = { url: "https://assets.example/probe.exr", tier: "high", identity: { key: "opaque-test", reusable: true } } as const;

describe("EnvironmentCache asynchronous ownership", () => {
  it("coalesces concurrent acquisitions while retaining one reference per caller", async () => {
    const pending = deferred<EnvironmentProbe>();
    const load = vi.fn(() => pending.promise);
    const cache = new EnvironmentCache(new MockRenderDevice(), unusedFactory, load);
    const first = cache.acquire(key);
    const second = cache.acquire(key);
    expect(load).toHaveBeenCalledTimes(1);

    const { probe, dispose } = testProbe();
    pending.resolve(probe);
    expect(await Promise.all([first, second])).toEqual([probe, probe]);
    expect(cache.residentCount).toBe(1);
    expect(cache.refCount(probe)).toBe(2);
    cache.release(probe);
    expect(cache.refCount(probe)).toBe(1);
    cache.release(probe);
    expect(cache.refCount(probe)).toBe(0);
    cache.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes a late probe once and rejects all coalesced callers after disposal", async () => {
    const pending = deferred<EnvironmentProbe>();
    const load = vi.fn(() => pending.promise);
    const cache = new EnvironmentCache(new MockRenderDevice(), unusedFactory, load);
    const first = cache.acquire(key);
    const second = cache.acquire(key);
    const rejections = Promise.all([
      expect(first).rejects.toThrow(/ENVIRONMENT_CACHE_DISPOSED/),
      expect(second).rejects.toThrow(/ENVIRONMENT_CACHE_DISPOSED/)
    ]);
    expect(load).toHaveBeenCalledTimes(1);

    cache.dispose();
    cache.dispose();
    const { probe, texture, dispose } = testProbe();
    pending.resolve(probe);
    await rejections;

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(texture.disposed).toBe(true);
    expect(cache.residentCount).toBe(0);
    expect(cache.refCount(probe)).toBe(0);
    await expect(cache.acquire(key)).rejects.toThrow(/ENVIRONMENT_CACHE_DISPOSED/);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("disposes a resident probe once and rejects later acquisitions", async () => {
    const { probe, texture, dispose } = testProbe();
    const cache = new EnvironmentCache(new MockRenderDevice(), unusedFactory, async () => probe);
    expect(await cache.acquire(key)).toBe(probe);
    cache.dispose();
    cache.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(texture.disposed).toBe(true);
    expect(cache.residentCount).toBe(0);
    await expect(cache.acquire(key)).rejects.toThrow(/ENVIRONMENT_CACHE_DISPOSED/);
    expect(() => cache.neutral("high")).toThrow(/ENVIRONMENT_CACHE_DISPOSED/);
  });

  it("evicts a failed in-flight load and allows the next acquisition to retry", async () => {
    const pending = deferred<EnvironmentProbe>();
    const { probe, dispose } = testProbe();
    const load = vi.fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(probe);
    const cache = new EnvironmentCache(new MockRenderDevice(), unusedFactory, load);
    const first = cache.acquire(key);
    const failed = expect(first).rejects.toThrow("decode failed");
    pending.reject(new Error("decode failed"));
    await failed;
    expect(await cache.acquire(key)).toBe(probe);
    expect(load).toHaveBeenCalledTimes(2);
    cache.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
