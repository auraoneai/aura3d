import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type RenderTargetDescriptor, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import { acquireV2TargetLease } from "../../../packages/rendering/src/post/v2Stages";
import { acquireTargetPoolLease, type TargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";
import * as lifecycleRegistry from "../../../packages/rendering/src/renderer/postSkipped";
import { disposeNativePostEffectsForHost, registerNativePostEffectLifecycle, releaseNativePostEffectViewForHost,
  releaseNativePostEffectScopeForHost,
  type NativePostEffectLifecycle } from "../../../packages/rendering/src/renderer/postSkipped";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

/** Pool acquire descriptor → device descriptor; the renderer only pools color formats. */
function poolTargetDescriptor(desc: Parameters<RenderTargetPoolLike["acquire"]>[0]): RenderTargetDescriptor {
  const { format } = desc;
  if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") throw new Error(`pooled target format ${format} is not a color target format`);
  return { ...desc, format, sampleCount: desc.samples };
}

const key = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;
const flags = { values: {}, on: () => false };
afterEach(() => vi.restoreAllMocks());

describe("post owner cleanup retries", () => {
  it("does not retry a failed v2 resource twice when a replacement generation is registered", () => {
    const device = new MockRenderDevice(), textures: object[] = [];
    let fail = true, attempts = 0;
    const methods: Record<string, (...args: any[]) => unknown> = {
      createVertexArray: () => ({}),
      createTexture: () => { const texture = {}; textures.push(texture); return texture; },
      deleteTexture: texture => { if (texture === textures[0]) { attempts++; if (fail) throw new Error("texture failed"); } }
    };
    const gl = new Proxy(methods, { get(target, name: string) {
      if (name in target) return target[name];
      return /^[A-Z][A-Z0-9_]*$/.test(name) ? 1 : () => undefined;
    } }) as unknown as WebGL2RenderingContext;
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release() {}, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const host = { gl, device } as unknown as WebGL2DeviceHost;
    try {
      acquireV2TargetLease(host, key);
      expect(() => disposeNativePostEffectsForHost(host)).toThrow();
      acquireV2TargetLease(host, key);
      expect(() => disposeNativePostEffectsForHost(host)).toThrow();
      expect(attempts).toBe(2);
    } finally {
      fail = false;
      disposeNativePostEffectsForHost(host);
      device.dispose();
    }
  });

  it("coalesces shared-owner generations while retaining independent owners", () => {
    const host = {}, scope = {}, shared = {}, failure = new Error("shared failed");
    let fail = true;
    const dispose = vi.fn(() => { if (fail) throw failure; });
    const releaseView = vi.fn();
    const make = (): NativePostEffectLifecycle => ({
      cleanupOwner: shared, dispose, releaseView, releaseScope() {}
    });
    registerNativePostEffectLifecycle(host, make());
    expect(() => disposeNativePostEffectsForHost(host)).toThrow(failure);
    registerNativePostEffectLifecycle(host, make());
    releaseNativePostEffectViewForHost(host, scope, "main");
    expect(releaseView).toHaveBeenCalledTimes(1);
    expect(() => disposeNativePostEffectsForHost(host)).toThrow(failure);
    expect(dispose).toHaveBeenCalledTimes(2);
    fail = false;
    disposeNativePostEffectsForHost(host);
    disposeNativePostEffectsForHost(host);
    expect(dispose).toHaveBeenCalledTimes(3);
  });

  it("coalesces real v2 generations when the host is explicitly registered as cleanup owner", () => {
    const original = lifecycleRegistry.registerNativePostEffectLifecycle;
    vi.spyOn(lifecycleRegistry, "registerNativePostEffectLifecycle").mockImplementation((host, lifecycle) => {
      original(host, { ...lifecycle, cleanupOwner: host });
    });
    const device = new MockRenderDevice(), textures: object[] = [];
    let fail = true, attempts = 0;
    const methods: Record<string, (...args: any[]) => unknown> = {
      createVertexArray: () => ({}),
      createTexture: () => { const texture = {}; textures.push(texture); return texture; },
      deleteTexture: texture => { if (texture === textures[0]) { attempts++; if (fail) throw new Error("texture failed"); } }
    };
    const gl = new Proxy(methods, { get(target, name: string) {
      if (name in target) return target[name];
      return /^[A-Z][A-Z0-9_]*$/.test(name) ? 1 : () => undefined;
    } }) as unknown as WebGL2RenderingContext;
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release() {}, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const host = { gl, device } as unknown as WebGL2DeviceHost;
    try {
      acquireV2TargetLease(host, key);
      expect(() => disposeNativePostEffectsForHost(host)).toThrow();
      acquireV2TargetLease(host, key);
      expect(() => disposeNativePostEffectsForHost(host)).toThrow();
      expect(attempts).toBe(2);
    } finally {
      fail = false;
      disposeNativePostEffectsForHost(host);
      device.dispose();
    }
  });

  it("retries real v2 cleanup through the host lifecycle without repeating successful siblings", () => {
    const device = new MockRenderDevice(), textures: object[] = [];
    const deletes = new Map<object, number>();
    let failed: object | undefined;
    const methods: Record<string, (...args: any[]) => unknown> = {
      createVertexArray: () => ({}),
      createTexture: () => { const texture = {}; textures.push(texture); return texture; },
      deleteTexture: texture => {
        deletes.set(texture, (deletes.get(texture) ?? 0) + 1);
        if (texture === failed) throw new Error("texture failed");
      }
    };
    const gl = new Proxy(methods, { get(target, name: string) {
      if (name in target) return target[name];
      return /^[A-Z][A-Z0-9_]*$/.test(name) ? 1 : () => undefined;
    } }) as unknown as WebGL2RenderingContext;
    const release = vi.fn();
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const host = { gl, device } as unknown as WebGL2DeviceHost;
    const lease = acquireV2TargetLease(host, key);
    failed = textures[0];
    expect(() => disposeNativePostEffectsForHost(host)).toThrow(AggregateError);
    expect(deletes.get(textures[0]!)).toBe(1);
    expect(deletes.get(textures[1]!)).toBe(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(() => disposeNativePostEffectsForHost(host)).toThrow(AggregateError);
    expect(deletes.get(textures[0]!)).toBe(2);
    expect(deletes.get(textures[1]!)).toBe(1);
    expect(release).toHaveBeenCalledTimes(1);
    failed = undefined;
    disposeNativePostEffectsForHost(host);
    disposeNativePostEffectsForHost(host);
    lease.release();
    expect(deletes.get(textures[0]!)).toBe(3);
    expect(deletes.get(textures[1]!)).toBe(1);
    expect(release).toHaveBeenCalledTimes(1);
    device.dispose();
  });

  it("retries a failed legacy lease without reentering its release or repeating success", () => {
    const failure = new Error("legacy failed");
    let fail = true;
    const target = {} as RenderTarget;
    let lease: ReturnType<typeof acquireTargetPoolLease>;
    const release = vi.fn(() => {
      lease.release();
      if (fail) throw failure;
    });
    const pool = { acquire: () => target, release, trim() {} } satisfies RenderTargetPoolLike;
    lease = acquireTargetPoolLease(pool, key);
    let error: unknown;
    try { lease.release(); } catch (caught) { error = caught; }
    expect(error).toBe(failure);
    expect(release).toHaveBeenCalledTimes(1);
    fail = false;
    lease.release(); lease.release();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("retains a failed lifecycle while a replacement is registered reentrantly", () => {
    const host = {}, scope = {}, failure = new Error("dispose failed");
    let fail = true;
    const views: string[] = [];
    const replacement: NativePostEffectLifecycle = {
      releaseView: () => views.push("replacement"), releaseScope() {}, dispose: vi.fn()
    };
    const first: NativePostEffectLifecycle = {
      releaseView: () => views.push("first"), releaseScope() {},
      dispose: vi.fn(() => {
        registerNativePostEffectLifecycle(host, replacement);
        disposeNativePostEffectsForHost(host);
        if (fail) throw failure;
      })
    };
    registerNativePostEffectLifecycle(host, first);
    let error: unknown;
    try { disposeNativePostEffectsForHost(host); } catch (caught) { error = caught; }
    expect(error).toBe(failure);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    releaseNativePostEffectViewForHost(host, scope, "view");
    expect(views).toEqual(["first"]);
    fail = false;
    disposeNativePostEffectsForHost(host);
    disposeNativePostEffectsForHost(host);
    expect(first.dispose).toHaveBeenCalledTimes(2);
    // The same replacement was registered again during the retry; it is not
    // the already-retired registration from the first cleanup.
    expect(replacement.dispose).toHaveBeenCalledTimes(2);
  });

  it("disposes every post backing lease and retries only failures", () => {
    const device = new MockRenderDevice(), failures = new Set<RenderTarget>();
    const calls = new Map<RenderTarget, number>();
    let resources: PostResources;
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release: target => {
        calls.set(target, (calls.get(target) ?? 0) + 1);
        resources.dispose();
        if (failures.has(target)) throw new Error("backing failed");
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    resources = new PostResources(device, flags);
    const first = resources.acquireLease(key), second = resources.acquireLease(key);
    failures.add(first.target);
    expect(() => resources.dispose()).toThrow(AggregateError);
    expect(calls.get(first.target)).toBe(1);
    expect(calls.get(second.target)).toBe(1);
    expect(() => resources.acquireLease(key)).toThrow(/disposed/);
    expect(() => resources.dispose()).toThrow(AggregateError);
    expect(calls.get(first.target)).toBe(2);
    expect(calls.get(second.target)).toBe(1);
    failures.clear();
    resources.dispose(); resources.dispose(); first.release(); second.release();
    expect(calls.get(first.target)).toBe(3);
    expect(calls.get(second.target)).toBe(1);
    device.dispose();
  });

  it("invalidates all mismatched resize leases and retains failures for matching retry", () => {
    const device = new MockRenderDevice(), failures = new Set<RenderTarget>();
    const calls = new Map<RenderTarget, number>();
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release: target => {
        calls.set(target, (calls.get(target) ?? 0) + 1);
        if (failures.has(target)) throw new Error("backing failed");
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flags);
    const first = resources.acquireLease(key), second = resources.acquireLease(key);
    const kept = resources.acquireLease({ ...key, width: 4, height: 4 });
    failures.add(first.target);
    expect(() => resources.resize(4, 4)).toThrow(AggregateError);
    expect(calls.get(first.target)).toBe(1);
    expect(calls.get(second.target)).toBe(1);
    expect(calls.has(kept.target)).toBe(false);
    failures.clear();
    resources.resize(4, 4);
    expect(calls.get(first.target)).toBe(2);
    expect(calls.get(second.target)).toBe(1);
    first.release(); second.release(); kept.release(); resources.dispose(); device.dispose();
  });

  it("retries a failed explicit release for a target already disposed externally", () => {
    const device = new MockRenderDevice(), failure = new Error("failed disposed target");
    let fail = true;
    const release = vi.fn(() => { if (fail) throw failure; });
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flags);
    const lease = resources.acquireLease(key);
    lease.target.dispose();
    expect(() => lease.release()).toThrow(failure);
    fail = false;
    lease.release(); lease.release();
    expect(release).toHaveBeenCalledTimes(2);
    resources.dispose();
    expect(release).toHaveBeenCalledTimes(2);
    device.dispose();
  });

  it("retains a replaced lifecycle and disposes each independent owner once", () => {
    const host = {}, failure = new Error("old failed");
    let fail = true;
    const old: NativePostEffectLifecycle = {
      releaseView() {}, releaseScope() {}, dispose: vi.fn(() => { if (fail) throw failure; })
    };
    const replacement: NativePostEffectLifecycle = {
      releaseView() {}, releaseScope() {}, dispose: vi.fn()
    };
    registerNativePostEffectLifecycle(host, old);
    registerNativePostEffectLifecycle(host, replacement);
    expect(() => disposeNativePostEffectsForHost(host)).toThrow(failure);
    expect(old.dispose).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    fail = false;
    disposeNativePostEffectsForHost(host);
    expect(old.dispose).toHaveBeenCalledTimes(2);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
  });

  it("retires a different lifecycle registered during disposal even without a nested dispose", () => {
    const host = {};
    const replacement: NativePostEffectLifecycle = {
      releaseView() {}, releaseScope() {}, dispose: vi.fn()
    };
    const first: NativePostEffectLifecycle = {
      releaseView() {}, releaseScope() {}, dispose() { registerNativePostEffectLifecycle(host, replacement); }
    };
    registerNativePostEffectLifecycle(host, first);
    disposeNativePostEffectsForHost(host);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    disposeNativePostEffectsForHost(host);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
  });

  it("suppresses repeated reentrant view and scope callbacks but handles independent views", () => {
    const host = {}, scope = {}, views: (string | number)[] = [];
    let scopes = 0;
    const owner: NativePostEffectLifecycle = {
      releaseView(_scope, view) {
        views.push(view);
        releaseNativePostEffectViewForHost(host, scope, view);
        if (view === "left") releaseNativePostEffectViewForHost(host, scope, "right");
      },
      releaseScope() {
        scopes++;
        releaseNativePostEffectScopeForHost(host, scope);
      },
      dispose() {}
    };
    registerNativePostEffectLifecycle(host, owner);
    releaseNativePostEffectViewForHost(host, scope, "left");
    releaseNativePostEffectScopeForHost(host, scope);
    expect(views).toEqual(["left", "right"]);
    expect(scopes).toBe(1);
    disposeNativePostEffectsForHost(host);
  });

  it("defers a re-registered lifecycle rather than releasing it twice in one cleanup", () => {
    const host = {};
    let registrations = 0;
    const owner: NativePostEffectLifecycle = {
      releaseView() {}, releaseScope() {}, dispose: vi.fn(() => {
        if (registrations++ === 0) {
          registerNativePostEffectLifecycle(host, owner);
          disposeNativePostEffectsForHost(host);
        }
      })
    };
    registerNativePostEffectLifecycle(host, owner);
    expect(() => disposeNativePostEffectsForHost(host)).toThrow(/deferred by reentrant registration/);
    expect(owner.dispose).toHaveBeenCalledTimes(1);
    disposeNativePostEffectsForHost(host);
    expect(owner.dispose).toHaveBeenCalledTimes(2);
    disposeNativePostEffectsForHost(host);
    expect(owner.dispose).toHaveBeenCalledTimes(2);
  });

  it("preserves sibling errors exactly when disposal reenters and a sibling fails", () => {
    const device = new MockRenderDevice(), failure = new Error("sibling failed");
    let resources: PostResources, second: RenderTarget;
    const calls = new Map<RenderTarget, number>();
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release: target => {
        calls.set(target, (calls.get(target) ?? 0) + 1);
        if (target === second) throw failure;
        resources.dispose();
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    resources = new PostResources(device, flags);
    const first = resources.acquireLease(key);
    second = resources.acquireLease(key).target;
    let error: unknown;
    try { resources.dispose(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(calls.get(first.target)).toBe(1);
    expect(calls.get(second)).toBe(1);
    device.dispose();
  });

  it("attempts all target-only end-of-frame releases and retries only failures", () => {
    const device = new MockRenderDevice(), failure = new Error("legacy post target failed");
    let fail = true;
    const calls = new Map<RenderTarget, number>();
    let first: RenderTarget;
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release: target => {
        calls.set(target, (calls.get(target) ?? 0) + 1);
        if (target === first && fail) throw failure;
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flags);
    first = resources.acquire(key);
    const second = resources.acquire(key);
    first.dispose(); second.dispose();
    let error: unknown;
    try { resources.releaseAll(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(calls.get(first)).toBe(1);
    expect(calls.get(second)).toBe(1);
    fail = false;
    resources.releaseAll();
    expect(calls.get(first)).toBe(2);
    expect(calls.get(second)).toBe(1);
    resources.dispose(); device.dispose();
  });

  it("invalidates acquisitions before unsubscribe and retries a failing unsubscriber", () => {
    const device = new MockRenderDevice() as MockRenderDevice & { onDeviceLost: (listener: () => void) => () => void };
    const failure = new Error("unsubscribe failed");
    let fail = true, resources: PostResources, lease: ReturnType<PostResources["acquireLease"]>;
    const unsubscribe = vi.fn(() => {
      expect(() => resources.transferLeaseToLegacy(lease)).toThrow(/stale or foreign/);
      expect(() => resources.claimLease(lease.target)).toThrow(/not a live/);
      if (fail) throw failure;
    });
    device.onDeviceLost = () => unsubscribe;
    const release = vi.fn();
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    resources = new PostResources(device, flags);
    lease = resources.acquireLease(key);
    let error: unknown;
    try { resources.dispose(); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(release).toHaveBeenCalledTimes(1);
    fail = false;
    resources.dispose(); resources.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
    device.dispose();
  });

  it("rejects an acquisition retired reentrantly during pool allocation and retains failed rollback", () => {
    const device = new MockRenderDevice();
    let resources: PostResources, fail = true;
    const release = vi.fn(() => { if (fail) throw new Error("rollback failed"); });
    const pool: RenderTargetPoolLike = {
      acquire: desc => {
        const target = device.createRenderTarget(poolTargetDescriptor(desc));
        resources.dispose();
        return target;
      },
      release, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    resources = new PostResources(device, flags);
    expect(() => resources.acquireLease(key)).toThrow(/disposed/);
    expect(release).toHaveBeenCalledTimes(1);
    fail = false;
    resources.dispose();
    expect(release).toHaveBeenCalledTimes(2);
    resources.dispose();
    expect(release).toHaveBeenCalledTimes(2);
    device.dispose();
  });

  it.each(["dispose", "resize"] as const)(
    "cannot reacquire a sibling returned to the backing pool by reentrant %s",
    mode => {
      const device = new MockRenderDevice();
      let resources: PostResources, trigger: RenderTarget;
      const release = vi.fn((target: RenderTarget) => {
        if (target === trigger) {
          if (mode === "dispose") resources.dispose();
          else resources.resize(4, 4);
        }
      });
      const pool: RenderTargetPoolLike = {
        acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
        release, trim() {}
      };
      vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
      resources = new PostResources(device, flags);
      const first = resources.acquireLease(key), second = resources.acquireLease(key);
      first.release(); second.release();
      trigger = second.target;
      trigger.dispose();
      expect(() => resources.acquireLease(key)).toThrow(/disposed|invalidated/);
      expect(release).toHaveBeenCalledTimes(2);
      resources.dispose(); device.dispose();
    }
  );

  it("retains failed loss cleanup without releasing a new generation during resize retry", () => {
    const device = new MockRenderDevice() as MockRenderDevice & { onDeviceLost: (listener: () => void) => () => void };
    let lost: () => void = () => undefined, fail = true, first: RenderTarget;
    const calls = new Map<RenderTarget, number>();
    device.onDeviceLost = listener => { lost = listener; return () => undefined; };
    const pool: RenderTargetPoolLike = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      release: target => {
        calls.set(target, (calls.get(target) ?? 0) + 1);
        if (target === first && fail) throw new Error("loss cleanup failed");
      },
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flags);
    const old = resources.acquireLease(key);
    first = old.target;
    const sibling = resources.acquireLease(key);
    expect(() => lost()).not.toThrow();
    expect(calls.get(first)).toBe(1);
    expect(calls.get(sibling.target)).toBe(1);
    const next = resources.acquireLease({ ...key, width: 4, height: 4 });
    old.release(); sibling.release();
    fail = false;
    resources.resize(4, 4);
    expect(calls.get(first)).toBe(2);
    expect(calls.get(sibling.target)).toBe(1);
    expect(calls.has(next.target)).toBe(false);
    next.release(); resources.dispose(); device.dispose();
  });

  it("retains an explicit backing lease after failure without releasing its sibling twice", () => {
    const device = new MockRenderDevice();
    let fail = true;
    const releases: Array<ReturnType<typeof vi.fn>> = [];
    const pool: RenderTargetPoolLike & { acquireLease: (desc: Parameters<RenderTargetPoolLike["acquire"]>[0]) => TargetPoolLease } = {
      acquire: desc => device.createRenderTarget(poolTargetDescriptor(desc)),
      acquireLease(desc) {
        const target = this.acquire(desc);
        const release = vi.fn(() => { if (releases[0] === release && fail) throw new Error("explicit failed"); });
        releases.push(release);
        return { target, release };
      },
      release() {}, trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flags);
    const a = resources.acquireLease(key), b = resources.acquireLease(key);
    expect(() => resources.dispose()).toThrow(AggregateError);
    expect(releases.map(release => release.mock.calls.length)).toEqual([1, 1]);
    fail = false;
    resources.dispose(); a.release(); b.release();
    expect(releases.map(release => release.mock.calls.length)).toEqual([2, 1]);
    device.dispose();
  });
});
