import { afterEach, describe, expect, it, vi } from "vitest";

import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer, type RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";
import { RenderTargetPool } from "../../../packages/rendering/src/resources/RenderTargetPool";
import type { TargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";

const tiersOn = createTrustedQrFlags({ A3D_QR_TIERS: true });
const tiersOff = createTrustedQrFlags({ A3D_QR_TIERS: false });
const key = { width: 2, height: 2, format: "rgba8", samples: 1, depth: false } as const;
// Chromatic aberration and film grain make this a three-pass, unfused chain.
const chain = { execution: "cpu-deterministic", chromaticAberration: true, filmGrain: true } as const satisfies RendererPostProcessOptions;
const passthrough = { toneMapping: false } as const satisfies RendererPostProcessOptions;

type PoolDescriptor = Parameters<RenderTargetPoolLike["acquire"]>[0];
type LeasePool = RenderTargetPoolLike & { acquireLease?: (desc: PoolDescriptor) => TargetPoolLease };

function fixture(mode: "legacy" | "token" = "token") {
  const device = new MockRenderDevice();
  const targets: RenderTarget[] = [];
  const attempts: number[] = [];
  const live = new Set<RenderTarget>();
  const failures = new Map<number, unknown>();
  let onRelease: ((index: number) => void) | undefined;
  const acquire = (desc: PoolDescriptor): RenderTarget => {
    const target = device.createRenderTarget({ ...desc, sampleCount: desc.samples });
    targets.push(target);
    live.add(target);
    return target;
  };
  const release = (target: RenderTarget): void => {
    const index = targets.indexOf(target);
    if (index < 0) throw new Error("foreign target release");
    attempts[index] = (attempts[index] ?? 0) + 1;
    onRelease?.(index);
    if (failures.has(index)) throw failures.get(index);
    if (!live.delete(target)) throw new Error("duplicate target release");
  };
  const pool: LeasePool = { acquire, release, trim() {} };
  // Deliberately non-idempotent token callbacks exercise the chain's own guard.
  if (mode === "token") pool.acquireLease = desc => {
    const target = acquire(desc);
    return { target, release: () => release(target) };
  };
  vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
  setRendererQrFlags(tiersOn, device);
  const source = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
  const makePipeline = () => new RendererPostprocessPipeline({
    device, width: 2, height: 2, fusedLdrPostprocessScratch: {}
  } as unknown as RendererHost);
  return {
    device, source, makePipeline, pipeline: makePipeline(), targets, attempts, live, failures,
    setOnRelease(callback?: (index: number) => void) { onRelease = callback; }
  };
}

function execute(
  f: ReturnType<typeof fixture>,
  asynchronous: boolean,
  options: RendererPostProcessOptions = chain,
  pipeline = f.pipeline
): Promise<void> {
  if (asynchronous) return pipeline.executePostprocessAsync(options, [f.source]);
  return Promise.resolve().then(() => pipeline.executePostprocess(options, [f.source]));
}

afterEach(() => vi.restoreAllMocks());

describe("legacy postprocess chain cleanup retry", () => {
  it.each([
    ["legacy", false], ["legacy", true], ["token", false], ["token", true]
  ] as const)("retries only failed %s leases on later frames (async=%s), including after tiers turn off", async (mode, asynchronous) => {
    const f = fixture(mode);
    const failure = new Error("first target release failed");
    f.failures.set(0, failure);
    try {
      await expect(execute(f, asynchronous)).rejects.toBe(failure);
      expect(f.targets).toHaveLength(2);
      expect(f.attempts).toEqual([1, 1]);
      expect([...f.live]).toEqual([f.targets[0]]);

      const present = vi.spyOn(f.device, "presentRenderTarget");
      await expect(execute(f, asynchronous, passthrough)).rejects.toBe(failure);
      expect(f.attempts).toEqual([2, 1]);
      expect(f.targets).toHaveLength(2);
      expect(present).not.toHaveBeenCalled();

      f.failures.delete(0);
      setRendererQrFlags(tiersOff, f.device);
      await execute(f, asynchronous, passthrough);
      await execute(f, asynchronous, passthrough);
      expect(f.attempts).toEqual([3, 1]);
      expect(f.live.size).toBe(0);
      expect(f.targets).toHaveLength(2);
      expect(present).toHaveBeenCalledTimes(2);
    } finally {
      f.device.dispose();
    }
  });

  it.each([false, true])("reports each release failure and retries only those still failing (async=%s)", async asynchronous => {
    const f = fixture();
    const first = new Error("first release");
    const second = new Error("second release");
    f.failures.set(0, first);
    f.failures.set(1, second);
    try {
      const error = await execute(f, asynchronous).then(() => undefined, caught => caught);
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([first, second]);
      expect(f.attempts).toEqual([1, 1]);

      f.failures.delete(0);
      await expect(execute(f, asynchronous, passthrough)).rejects.toBe(second);
      expect(f.attempts).toEqual([2, 2]);
      f.failures.delete(1);
      await execute(f, asynchronous, passthrough);
      expect(f.attempts).toEqual([2, 3]);
      expect(f.live.size).toBe(0);
    } finally {
      f.device.dispose();
    }
  });

  it.each([false, true])("preserves both the frame failure and cleanup failures (async=%s)", async asynchronous => {
    const f = fixture();
    const renderFailure = new Error("second post pass failed");
    const first = new Error("first release");
    const second = new Error("second release");
    f.failures.set(0, first);
    f.failures.set(1, second);
    const readPixels = f.device.readPixels.bind(f.device);
    let reads = 0;
    const read = vi.spyOn(f.device, "readPixels").mockImplementation((...args) => {
      if (++reads === 2) throw renderFailure;
      return readPixels(...args);
    });
    try {
      const error = await execute(f, asynchronous).then(() => undefined, caught => caught);
      expect(error).toBeInstanceOf(AggregateError);
      const [frameError, cleanupError] = (error as AggregateError).errors;
      expect(frameError).toBe(renderFailure);
      expect(cleanupError).toBeInstanceOf(AggregateError);
      expect((cleanupError as AggregateError).errors).toEqual([first, second]);
      expect(f.attempts).toEqual([1, 1]);

      read.mockRestore();
      f.failures.clear();
      await execute(f, asynchronous, passthrough);
      expect(f.attempts).toEqual([2, 2]);
      expect(f.live.size).toBe(0);
    } finally {
      f.device.dispose();
    }
  });

  it.each([
    [false, false], [false, true], [true, false], [true, true]
  ] as const)("preserves an undefined frame exception (async=%s, cleanupFails=%s)", async (asynchronous, cleanupFails) => {
    const f = fixture();
    const releaseFailure = new Error("release after undefined frame failure");
    if (cleanupFails) f.failures.set(0, releaseFailure);
    const readPixels = f.device.readPixels.bind(f.device);
    let reads = 0;
    const read = vi.spyOn(f.device, "readPixels").mockImplementation((...args) => {
      if (++reads === 2) throw undefined;
      return readPixels(...args);
    });
    try {
      const result = await execute(f, asynchronous).then(
        () => ({ threw: false, error: undefined }),
        error => ({ threw: true, error })
      );
      expect(result.threw).toBe(true);
      if (cleanupFails) {
        expect(result.error).toBeInstanceOf(AggregateError);
        expect((result.error as AggregateError).errors).toEqual([undefined, releaseFailure]);
        f.failures.clear();
        read.mockRestore();
        await execute(f, asynchronous, passthrough);
        expect(f.attempts).toEqual([2, 1]);
      } else {
        expect(result.error).toBeUndefined();
        expect(f.attempts).toEqual([1, 1]);
      }
      expect(f.live.size).toBe(0);
    } finally {
      f.device.dispose();
    }
  });

  it.each([false, true])("keeps alpha validation ahead of pending cleanup (async=%s)", async asynchronous => {
    const f = fixture();
    const failure = new Error("pending release");
    f.failures.set(0, failure);
    try {
      await expect(execute(f, asynchronous)).rejects.toBe(failure);
      const invalid = { v2: true, pipeline: { alphaMode: "straight" } };
      await expect(execute(f, asynchronous, invalid)).rejects.toMatchObject({ code: "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE" });
      expect(f.attempts).toEqual([1, 1]);
      f.failures.delete(0);
      await execute(f, asynchronous, passthrough);
      expect(f.attempts).toEqual([2, 1]);
    } finally {
      f.device.dispose();
    }
  });

  it.each([false, true])("blocks reentrant cleanup across pipelines on the same device (async=%s)", async asynchronous => {
    const f = fixture();
    const other = f.makePipeline();
    const present = vi.spyOn(f.device, "presentRenderTarget");
    let reenter = true;
    f.setOnRelease(index => {
      if (index === 0 && reenter) other.executePostprocess(passthrough, [f.source]);
    });
    try {
      await expect(execute(f, asynchronous)).rejects.toMatchObject({ code: "POSTPROCESS_TARGET_RELEASE_BUSY" });
      expect(f.attempts).toEqual([1, 1]);
      expect(present).toHaveBeenCalledTimes(1);
      reenter = false;
      await execute(f, asynchronous, passthrough, other);
      expect(f.attempts).toEqual([1, 1]);
      await execute(f, asynchronous, passthrough);
      expect(f.attempts).toEqual([2, 1]);
      expect(f.live.size).toBe(0);
    } finally {
      f.device.dispose();
    }
  });

  it("does not let a pending release on one device block another device", async () => {
    const f = fixture();
    const otherDevice = new MockRenderDevice();
    const otherSource = otherDevice.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const other = new RendererPostprocessPipeline({ device: otherDevice, width: 2, height: 2 } as RendererHost);
    const failure = new Error("first device release");
    f.failures.set(0, failure);
    setRendererQrFlags(tiersOff, otherDevice);
    try {
      await expect(execute(f, false)).rejects.toBe(failure);
      expect(() => other.executePostprocess(passthrough, [otherSource])).not.toThrow();
      expect(f.attempts).toEqual([1, 1]);
      f.failures.clear();
      await execute(f, false, passthrough);
      expect(f.attempts).toEqual([2, 1]);
    } finally {
      otherDevice.dispose();
      f.device.dispose();
    }
  });

  it("guards a provider token against both reentrant and late double releases", () => {
    const f = fixture();
    const internals = f.pipeline as unknown as {
      chainTarget(label: string, owned: RenderTarget[], pooled: TargetPoolLease[]): RenderTarget;
      releaseChainTargets(pooled: TargetPoolLease[]): void;
    };
    const pooled: TargetPoolLease[] = [];
    try {
      internals.chainTarget("intermediate", [], pooled);
      const lease = pooled[0]!;
      f.setOnRelease(() => lease.release());
      internals.releaseChainTargets(pooled);
      lease.release();
      internals.releaseChainTargets([lease]);
      expect(f.attempts).toEqual([1]);
      expect(f.live.size).toBe(0);
    } finally {
      f.device.dispose();
    }
  });

  it("retains and reports a new lease enqueued by reentrant cleanup", async () => {
    const f = fixture();
    const internals = f.pipeline as unknown as {
      chainTarget(label: string, owned: RenderTarget[], pooled: TargetPoolLease[]): RenderTarget;
      releaseChainTargets(pooled: TargetPoolLease[]): void;
    };
    const pooled: TargetPoolLease[] = [];
    const nestedRelease = vi.fn();
    let nestedError: unknown;
    try {
      internals.chainTarget("first", [], pooled);
      internals.chainTarget("second", [], pooled);
      f.setOnRelease(index => {
        if (index !== 0) return;
        try { internals.releaseChainTargets([{ target: f.source, release: nestedRelease }]); }
        catch (error) { nestedError = error; }
      });
      expect(() => internals.releaseChainTargets(pooled)).toThrowError(expect.objectContaining({
        code: "POSTPROCESS_TARGET_RELEASE_DEFERRED"
      }));
      expect(nestedError).toMatchObject({ code: "POSTPROCESS_TARGET_RELEASE_BUSY" });
      expect(f.attempts).toEqual([1, 1]);
      expect(nestedRelease).not.toHaveBeenCalled();
      await execute(f, false, passthrough);
      await execute(f, false, passthrough);
      expect(nestedRelease).toHaveBeenCalledTimes(1);
      expect(f.attempts).toEqual([1, 1]);
    } finally {
      f.device.dispose();
    }
  });

  it("retains the correct owner for a peer lease enqueued during reentrant cleanup", async () => {
    const f = fixture();
    const other = f.makePipeline();
    const first = f.pipeline as unknown as {
      chainTarget(label: string, owned: RenderTarget[], pooled: TargetPoolLease[]): RenderTarget;
      releaseChainTargets(pooled: TargetPoolLease[]): void;
    };
    const second = other as unknown as typeof first;
    const firstLeases: TargetPoolLease[] = [], secondLeases: TargetPoolLease[] = [];
    let nestedError: unknown;
    try {
      first.chainTarget("first", [], firstLeases);
      second.chainTarget("second", [], secondLeases);
      f.setOnRelease(index => {
        if (index !== 0) return;
        try { second.releaseChainTargets(secondLeases); } catch (error) { nestedError = error; }
      });
      expect(() => first.releaseChainTargets(firstLeases)).toThrowError(expect.objectContaining({
        code: "POSTPROCESS_TARGET_RELEASE_DEFERRED"
      }));
      expect(nestedError).toMatchObject({ code: "POSTPROCESS_TARGET_RELEASE_BUSY" });
      expect(f.attempts).toEqual([1]);
      await execute(f, false, passthrough);
      expect(f.attempts).toEqual([1]);
      await execute(f, false, passthrough, other);
      expect(f.attempts).toEqual([1, 1]);
      expect(f.live.size).toBe(0);
    } finally {
      f.device.dispose();
    }
  });

  it.each([false, true])("retains retry ownership after one of two Renderers sharing a device is disposed (async=%s)", async asynchronous => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const first = new Renderer(f.device, options, new TemporalHistory());
    const second = new Renderer(f.device, options, new TemporalHistory());
    const failure = new Error("renderer chain release");
    f.failures.set(0, failure);
    const render = (renderer: Renderer, postprocess: RendererPostProcessOptions): Promise<unknown> => {
      const source = { renderItems: [], postprocess };
      return asynchronous ? renderer.renderAsync(source) : Promise.resolve().then(() => renderer.render(source));
    };
    try {
      await expect(render(first, chain)).rejects.toBe(failure);
      expect(f.attempts).toEqual([1, 1]);
      expect(() => first.dispose()).toThrow(/Renderer disposal failed/);
      expect(f.attempts).toEqual([2, 1]);
      expect(f.device.disposed).toBe(false);
      f.failures.delete(0);
      setRendererQrFlags(tiersOff, f.device);
      await render(second, passthrough);
      expect(f.attempts).toEqual([2, 1]);
      first.dispose();
      expect(f.attempts).toEqual([3, 1]);
      expect(f.live.size).toBe(0);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it.each([false, true])("isolates a live renderer's failed lease from its shared peer (async=%s)", async asynchronous => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const owner = new Renderer(f.device, options, new TemporalHistory());
    const peer = new Renderer(f.device, options, new TemporalHistory());
    const failure = new Error("owner release");
    f.failures.set(0, failure);
    const render = (renderer: Renderer, postprocess: RendererPostProcessOptions): Promise<unknown> => asynchronous
      ? renderer.renderAsync({ renderItems: [], postprocess })
      : Promise.resolve().then(() => renderer.render({ renderItems: [], postprocess }));
    try {
      await expect(render(owner, chain)).rejects.toBe(failure);
      await expect(render(peer, chain)).resolves.toBeDefined();
      expect(f.attempts).toEqual([1, 1, 1, 1]);
      expect([...f.live]).toEqual([f.targets[0]]);
      expect(() => peer.dispose()).not.toThrow();
      expect(f.device.disposed).toBe(false);
      expect(f.attempts).toEqual([1, 1, 1, 1]);

      await expect(render(owner, passthrough)).rejects.toBe(failure);
      expect(f.attempts).toEqual([2, 1, 1, 1]);
      f.failures.clear();
      await render(owner, passthrough);
      expect(f.attempts).toEqual([3, 1, 1, 1]);
      expect(f.live.size).toBe(0);
    } finally {
      f.failures.clear();
      owner.dispose(); peer.dispose();
    }
  });

  it("allows a peer with no pending leases to dispose reentrantly during another owner's release", () => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const owner = new Renderer(f.device, options, new TemporalHistory());
    const peer = new Renderer(f.device, options, new TemporalHistory());
    const failure = new Error("owner release");
    let peerError: unknown;
    f.failures.set(0, failure);
    f.setOnRelease(index => {
      if (index !== 0) return;
      try { peer.dispose(); } catch (error) { peerError = error; }
    });
    try {
      expect(() => owner.render({ renderItems: [], postprocess: chain })).toThrow(failure);
      expect(peerError).toBeUndefined();
      expect(f.device.disposed).toBe(false);
      expect(f.attempts).toEqual([1, 1]);
      f.failures.clear();
      owner.dispose();
      expect(f.attempts).toEqual([2, 1]);
      expect(f.device.disposed).toBe(true);
    } finally {
      f.failures.clear();
      owner.dispose(); peer.dispose();
    }
  });

  it("keeps the real pool's failed owner lease checked out while a shared peer renders and disposes", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const owner = new Renderer(device, options, new TemporalHistory());
    const peer = new Renderer(device, options, new TemporalHistory());
    const failure = new Error("backing lease release");
    const attempts: number[] = [];
    let acquisitions = 0, blocked = true;
    const provider: LeasePool = {
      acquire: desc => pool.acquire(desc),
      release: target => pool.release(target),
      trim: frames => pool.trim(frames),
      acquireLease: desc => {
        const backing = pool.acquireLease(desc), index = acquisitions++;
        return { target: backing.target, release() {
          attempts[index] = (attempts[index] ?? 0) + 1;
          if (index === 0 && blocked) throw failure;
          backing.release();
        } };
      }
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => provider);
    try {
      expect(() => owner.render({ renderItems: [], postprocess: chain })).toThrow(failure);
      expect(pool.poolStats()).toEqual({ idle: 1, inUse: 1, created: 2 });
      peer.render({ renderItems: [], postprocess: chain });
      expect(attempts).toEqual([1, 1, 1, 1]);
      expect(pool.poolStats()).toEqual({ idle: 2, inUse: 1, created: 3 });
      peer.dispose();
      expect(device.disposed).toBe(false);
      expect(attempts).toEqual([1, 1, 1, 1]);
      expect(pool.poolStats()).toEqual({ idle: 2, inUse: 1, created: 3 });
      blocked = false;
      owner.render({ renderItems: [], postprocess: passthrough });
      expect(attempts).toEqual([2, 1, 1, 1]);
      expect(pool.poolStats()).toEqual({ idle: 3, inUse: 0, created: 3 });
    } finally {
      blocked = false;
      owner.dispose(); peer.dispose(); pool.dispose();
    }
  });

  it.each([false, true])("drains retired peers once at last-device disposal and retries both owners (async=%s)", async asynchronous => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const first = new Renderer(f.device, options, new TemporalHistory());
    const last = new Renderer(f.device, options, new TemporalHistory());
    const firstError = new Error("first renderer release"), lastError = new Error("last renderer release");
    f.failures.set(0, firstError);
    f.failures.set(2, lastError);
    const render = (renderer: Renderer): Promise<unknown> => asynchronous
      ? renderer.renderAsync({ renderItems: [], postprocess: chain })
      : Promise.resolve().then(() => renderer.render({ renderItems: [], postprocess: chain }));
    const disposeError = (renderer: Renderer): AggregateError => {
      try { renderer.dispose(); } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        return error as AggregateError;
      }
      throw new Error("Expected renderer disposal failure");
    };
    try {
      await expect(render(first)).rejects.toBe(firstError);
      expect(disposeError(first).errors).toContain(firstError);
      await expect(render(last)).rejects.toBe(lastError);
      expect(f.attempts).toEqual([2, 1, 1, 1]);

      expect(disposeError(last).errors).toEqual(expect.arrayContaining([firstError, lastError]));
      expect(f.attempts).toEqual([3, 1, 2, 1]);
      expect(f.device.disposed).toBe(true);
      const repeated = disposeError(last);
      expect(repeated.errors).toHaveLength(1);
      expect((repeated.errors[0] as AggregateError).errors).toEqual([firstError, lastError]);
      expect(f.attempts).toEqual([4, 1, 3, 1]);

      f.failures.clear();
      last.dispose();
      first.dispose(); last.dispose();
      expect(f.attempts).toEqual([5, 1, 4, 1]);
      expect(f.live.size).toBe(0);
    } finally {
      f.failures.clear();
      first.dispose(); last.dispose();
    }
  });

  it("does not drain a retired renderer's failure when a non-last peer disposes", () => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const owner = new Renderer(f.device, options, new TemporalHistory());
    const peer = new Renderer(f.device, options, new TemporalHistory());
    const last = new Renderer(f.device, options, new TemporalHistory());
    f.failures.set(0, new Error("retired owner release"));
    try {
      expect(() => owner.render({ renderItems: [], postprocess: chain })).toThrow("retired owner release");
      expect(() => owner.dispose()).toThrow(/Renderer disposal failed/);
      expect(f.attempts).toEqual([2, 1]);
      expect(() => peer.dispose()).not.toThrow();
      expect(() => last.render({ renderItems: [], postprocess: passthrough })).not.toThrow();
      expect(f.attempts).toEqual([2, 1]);
      expect(f.device.disposed).toBe(false);
      f.failures.clear();
      last.dispose();
      expect(f.attempts).toEqual([3, 1]);
      expect(f.live.size).toBe(0);
      expect(f.device.disposed).toBe(true);
    } finally {
      f.failures.clear();
      owner.dispose(); peer.dispose(); last.dispose();
    }
  });

  it("does not touch an active peer's in-flight post lease during owner disposal", async () => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const owner = new Renderer(f.device, options, new TemporalHistory());
    const peer = new Renderer(f.device, options, new TemporalHistory());
    const failure = new Error("owner release");
    f.failures.set(0, failure);
    let started!: () => void;
    let resume!: (pixels: Uint8Array) => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    let firstRead = true;
    Object.assign(f.device, { readPixelsAsync(x: number, y: number, width: number, height: number): Promise<Uint8Array> {
      if (firstRead) {
        firstRead = false;
        started();
        return new Promise(resolve => { resume = resolve; });
      }
      return Promise.resolve(f.device.readPixels(x, y, width, height));
    } });
    try {
      expect(() => owner.render({ renderItems: [], postprocess: chain })).toThrow(failure);
      const frame = peer.renderAsync({ renderItems: [], postprocess: chain });
      await entered;
      expect(f.live.has(f.targets[2]!)).toBe(true);
      expect(() => owner.dispose()).toThrow(/Renderer disposal failed/);
      expect(f.attempts).toEqual([2, 1]);
      expect(f.live.has(f.targets[2]!)).toBe(true);
      expect(f.targets[2]!.disposed).toBe(false);
      expect(f.device.disposed).toBe(false);
      resume(new Uint8Array(16));
      await frame;
      expect(f.attempts).toEqual([2, 1, 1, 1]);
      expect([...f.live]).toEqual([f.targets[0]]);
    } finally {
      f.failures.clear();
      owner.dispose(); peer.dispose();
    }
  });

  it("lets the last disposed peer retry a lease enqueued by an already-disposed async owner", async () => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const owner = new Renderer(f.device, options, new TemporalHistory());
    const last = new Renderer(f.device, options, new TemporalHistory());
    const failure = new Error("late retired lease");
    f.failures.set(0, failure);
    let started!: () => void;
    let resume!: (pixels: Uint8Array) => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    Object.assign(f.device, { readPixelsAsync(): Promise<Uint8Array> {
      started();
      return new Promise(resolve => { resume = resolve; });
    } });
    try {
      const frame = owner.renderAsync({ renderItems: [], postprocess: chain });
      await entered;
      owner.dispose();
      last.dispose();
      expect(f.device.disposed).toBe(true);
      expect(f.attempts).toEqual([]);
      resume(new Uint8Array(16));
      await expect(frame).rejects.toBeDefined();
      expect(f.attempts).toEqual([1]);
      let disposalError: unknown;
      try { last.dispose(); } catch (error) { disposalError = error; }
      expect(disposalError).toBeInstanceOf(AggregateError);
      expect((disposalError as AggregateError).errors).toContain(failure);
      expect(f.attempts).toEqual([2]);
      f.failures.clear();
      last.dispose(); last.dispose();
      expect(f.attempts).toEqual([3]);
      expect(f.live.size).toBe(0);
    } finally {
      f.failures.clear();
      owner.dispose(); last.dispose();
    }
  });

  it("keeps a new device owner created while draining retired peers alive", () => {
    const f = fixture();
    const options = { width: 2, height: 2, qrFlags: tiersOn, shaderLibrary: createLeanCoreShaderLibrary() };
    const first = new Renderer(f.device, options, new TemporalHistory());
    const last = new Renderer(f.device, options, new TemporalHistory());
    let newOwner: Renderer | undefined;
    let createOwner = false;
    f.failures.set(0, new Error("first release"));
    f.setOnRelease(index => {
      if (index === 0 && createOwner) {
        createOwner = false;
        newOwner = new Renderer(f.device, options, new TemporalHistory());
      }
    });
    try {
      expect(() => first.render({ renderItems: [], postprocess: chain })).toThrow("first release");
      expect(() => first.dispose()).toThrow(/Renderer disposal failed/);
      f.failures.clear();
      createOwner = true;
      last.dispose();
      expect(newOwner).toBeDefined();
      expect(f.device.disposed).toBe(false);
      expect(f.attempts).toEqual([3, 1]);
      last.dispose();
      expect(f.device.disposed).toBe(false);
      expect(() => newOwner!.render({ renderItems: [], postprocess: passthrough })).not.toThrow();
      newOwner!.dispose();
      expect(f.device.disposed).toBe(true);
    } finally {
      createOwner = false;
      f.failures.clear();
      first.dispose(); last.dispose(); newOwner?.dispose();
    }
  });

  it.each([false, true])("retries an actual pool retirement failure after device loss (async=%s)", async asynchronous => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const targets: RenderTarget[] = [];
    const attempts: number[] = [];
    const failure = new Error("lost target disposal");
    let fail = true;
    const create = device.createRenderTarget.bind(device);
    vi.spyOn(device, "createRenderTarget").mockImplementation(descriptor => {
      const target = create(descriptor);
      if (descriptor.label === "render-target-pool") {
        const index = targets.push(target) - 1;
        const dispose = target.dispose.bind(target);
        target.dispose = () => {
          attempts[index] = (attempts[index] ?? 0) + 1;
          if (index === 0 && fail) throw failure;
          dispose();
        };
      }
      return target;
    });
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    setRendererQrFlags(tiersOn, device);
    const source = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pipeline = new RendererPostprocessPipeline({ device, width: 2, height: 2 } as RendererHost);
    const present = device.presentRenderTarget.bind(device);
    vi.spyOn(device, "presentRenderTarget").mockImplementationOnce(target => {
      present(target);
      device.contextLost = true;
    });
    const run = (options: RendererPostProcessOptions): Promise<void> => asynchronous
      ? pipeline.executePostprocessAsync(options, [source])
      : Promise.resolve().then(() => pipeline.executePostprocess(options, [source]));
    try {
      await expect(run(chain)).rejects.toBe(failure);
      expect(attempts).toEqual([1, 1]);
      expect(targets[0]!.disposed).toBe(false);
      expect(targets[1]!.disposed).toBe(true);

      device.contextLost = false;
      fail = false;
      await run(passthrough);
      await run(passthrough);
      expect(attempts).toEqual([2, 1]);
      expect(targets[0]!.disposed).toBe(true);
    } finally {
      device.contextLost = false;
      fail = false;
      pool.dispose();
      device.dispose();
    }
  });

  it("does not release a successful sibling that has already been borrowed again", async () => {
    const device = new MockRenderDevice();
    const backingPool = new RenderTargetPool(device);
    const attempts: number[] = [];
    let fail = true;
    let acquisitions = 0;
    const failure = new Error("retry first backing lease");
    const pool: LeasePool = {
      acquire: desc => backingPool.acquire(desc),
      release: target => backingPool.release(target),
      trim: frames => backingPool.trim(frames),
      acquireLease: desc => {
        const lease = backingPool.acquireLease(desc);
        const index = acquisitions++;
        return { target: lease.target, release() {
          attempts[index] = (attempts[index] ?? 0) + 1;
          if (index === 0 && fail) throw failure;
          lease.release();
        } };
      }
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    setRendererQrFlags(tiersOn, device);
    const source = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    const pipeline = new RendererPostprocessPipeline({ device, width: 2, height: 2 } as RendererHost);
    let borrower: TargetPoolLease | undefined;
    try {
      expect(() => pipeline.executePostprocess(chain, [source])).toThrow(failure);
      expect(backingPool.poolStats()).toEqual({ idle: 1, inUse: 1, created: 2 });
      borrower = backingPool.acquireLease(key);
      expect(backingPool.poolStats()).toEqual({ idle: 0, inUse: 2, created: 2 });
      fail = false;
      pipeline.executePostprocess(passthrough, [source]);
      expect(attempts).toEqual([2, 1]);
      expect(backingPool.poolStats()).toEqual({ idle: 1, inUse: 1, created: 2 });
      expect(borrower.target.disposed).toBe(false);
    } finally {
      borrower?.release();
      backingPool.dispose();
      device.dispose();
    }
  });
});
