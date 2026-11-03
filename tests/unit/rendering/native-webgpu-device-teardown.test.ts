import { describe, expect, it, vi } from "vitest";
import { WebGPUDevice, type WebGPUBufferLike, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import type { RenderTarget, RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { NativeRenderBundleCache } from "../../../packages/rendering/src/production-runtime/NativeRenderBundleCache";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { ParticleGpuSim } from "../../../packages/rendering/src/vfx/ParticleGpuSim";

interface TrackedTarget {
  readonly target: RenderTarget;
  attempts: number;
  failure?: Error;
  onDispose?: () => void;
}

async function fixture(borrowed = false, canvas?: HTMLCanvasElement) {
  let finish!: () => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  let lose!: (info: { reason: string; message: string }) => void;
  let rejectLoss!: (error: Error) => void;
  const lost = new Promise<{ reason: string; message: string }>((resolve, reject) => { lose = resolve; rejectLoss = reject; });
  const buffers: { readonly label: string; readonly destroy: ReturnType<typeof vi.fn> }[] = [];
  const textures: { readonly label: string; readonly destroy: ReturnType<typeof vi.fn>; createView(): unknown }[] = [];
  let onSubmit: ((label: string) => void) | undefined;
  let onWrite: (() => void) | undefined;
  const native = {
    lost,
    features: new Set(["float32-blendable"]),
    queue: {
      writeBuffer() {},
      writeTexture() { onWrite?.(); },
      submit(commands: readonly { label?: string }[]) { onSubmit?.(commands[0]?.label ?? ""); },
      onSubmittedWorkDone: vi.fn(() => fence)
    },
    createBuffer({ label }: { label?: string }) {
      const buffer = { label: label ?? "", destroy: vi.fn() };
      buffers.push(buffer); return buffer;
    },
    createTexture({ label }: { label?: string }) {
      const texture = { label: label ?? "", destroy: vi.fn(), createView: () => ({ texture }) };
      textures.push(texture); return texture;
    },
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createCommandEncoder: (descriptor?: { label?: string }) => ({
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }),
      finish: () => ({ label: descriptor?.label })
    }),
    destroy: vi.fn()
  };
  const nativeDevice = native as unknown as WebGPUDeviceLike;
  const adapter = { requestDevice: async () => nativeDevice };
  const device = await WebGPUDevice.create({ adapter, ...(borrowed ? { device: nativeDevice } : {}), ...(canvas ? { canvas } : {}) });
  const targets: RenderTarget[] = [];
  const createTarget = device.createRenderTarget.bind(device);
  device.createRenderTarget = (descriptor: RenderTargetDescriptor) => {
    const target = createTarget(descriptor);
    targets.push(target);
    return target;
  };
  const source = device.createRenderTarget({ width: 16, height: 8, format: "rgba16f", depth: false, label: "source" });
  const output = device.createRenderTarget({ width: 16, height: 8, format: "rgba8", depth: false, label: "output" });
  const buffer = device.createBuffer("vertex", 16);
  const scopeId = {};
  const frame = { scopeId, viewId: "main", frameId: 1, timeSeconds: 1 };
  const exposure = () => device.presentLdrPostprocess(source, { outputTarget: output, autoExposure: {}, passes: [], postFrameContext: frame });
  const afterimage = () => device.executeWebGPUNativeEffects(output, [{ kind: "afterimage", decay: 0.5 }], frame);
  return { device, source, output, buffer, native, buffers, textures, targets, scopeId, exposure, afterimage, finish, lose, rejectLoss,
    onSubmit: (callback?: (label: string) => void) => { onSubmit = callback; },
    onWrite: (callback?: () => void) => { onWrite = callback; } };
}

function track(targets: readonly RenderTarget[]): TrackedTarget[] {
  return targets.map(target => {
    const original = target.dispose.bind(target);
    const record: TrackedTarget = { target, attempts: 0 };
    target.dispose = () => {
      record.attempts += 1;
      record.onDispose?.();
      if (record.failure) throw record.failure;
      original();
    };
    return record;
  });
}

function capture(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

function causes(error: unknown): unknown[] {
  return error instanceof AggregateError ? [error, ...error.errors.flatMap(causes)] : [error];
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("WebGPU device post teardown", () => {
  it("retries failed canvas unconfiguration without repeating native sibling disposal", async () => {
    const failure = new Error("canvas unconfiguration failed");
    const context = { configure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }),
      unconfigure: vi.fn().mockImplementationOnce(() => { throw failure; }) };
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
    const f = await fixture(true, canvas);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(context.unconfigure).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(context.unconfigure).toHaveBeenCalledTimes(2);
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      sibling.mockRestore();
    }
  });

  it("retains only failed streaming unsubscribe operations for retry", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const adapter = device.createTextureResidencyAdapter();
    const textures = [new Texture({ width: 1, height: 1 }), new Texture({ width: 1, height: 1 })];
    for (const texture of textures) {
      adapter.prepare({ texture, identity: {}, fallback: [0, 0, 0, 255], levels: [{ width: 1, height: 1, bytes: 4 }] },
        { maxBytes: 100000, generation: adapter.generation() });
    }
    const owner = device as unknown as { nativeStreamingLeases: Map<Texture, { removeDispose(): void }> };
    const [first, second] = textures.map(texture => owner.nativeStreamingLeases.get(texture)!);
    const failure = new Error("streaming unsubscribe failed");
    const failed = vi.spyOn(first!, "removeDispose").mockImplementationOnce(() => { throw failure; });
    const healthy = vi.spyOn(second!, "removeDispose");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(owner.nativeStreamingLeases.has(textures[0]!)).toBe(true);
      expect(owner.nativeStreamingLeases.has(textures[1]!)).toBe(false);
      expect(healthy).toHaveBeenCalledOnce();
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(owner.nativeStreamingLeases.size).toBe(0);
      expect(failed).toHaveBeenCalledTimes(2);
      expect(healthy).toHaveBeenCalledOnce();
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      failed.mockRestore();
      healthy.mockRestore();
    }
  });

  it("never unconfigures a canvas claimed by a newer device during retry", async () => {
    const failure = new Error("unconfigure failed");
    const context = { configure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }),
      unconfigure: vi.fn().mockImplementationOnce(() => { throw failure; }) };
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
    const original = await fixture(true, canvas);
    try {
      expect(causes(capture(() => original.device.dispose()))).toContain(failure);
      const replacement = await fixture(true, canvas);
      try {
        original.device.dispose();
        expect(context.unconfigure).toHaveBeenCalledOnce();
        expect((original.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(false);
        expect(replacement.device.disposed).toBe(false);
        replacement.device.dispose();
        expect(context.unconfigure).toHaveBeenCalledTimes(2);
      } finally {
        capture(() => replacement.device.dispose());
        replacement.finish();
      }
    } finally {
      capture(() => original.device.dispose());
      original.finish();
      await flush();
    }
  });

  it("preserves a new canvas owner installed reentrantly during unconfigure", async () => {
    let onUnconfigure: (() => void) | undefined;
    const context = { configure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }),
      unconfigure: vi.fn(() => onUnconfigure?.()) };
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
    const original = await fixture(true, canvas);
    let replacementPromise: ReturnType<typeof fixture> | undefined;
    onUnconfigure = () => {
      original.device.dispose();
      expect((original.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
      replacementPromise = fixture(true, canvas);
    };
    try {
      original.device.dispose();
      onUnconfigure = undefined;
      expect(replacementPromise).toBeDefined();
      const replacement = await replacementPromise!;
      try {
        expect(context.unconfigure).toHaveBeenCalledOnce();
        replacement.device.dispose();
        expect(context.unconfigure).toHaveBeenCalledTimes(2);
      } finally {
        capture(() => replacement.device.dispose());
        replacement.finish();
      }
    } finally {
      onUnconfigure = undefined;
      capture(() => original.device.dispose());
      original.finish();
      await flush();
    }
  });

  it("keeps a streaming unsubscribe owned while it reenters its parent", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const adapter = device.createTextureResidencyAdapter();
    const texture = new Texture({ width: 1, height: 1 });
    adapter.prepare({ texture, identity: {}, fallback: [0, 0, 0, 255], levels: [{ width: 1, height: 1, bytes: 4 }] },
      { maxBytes: 100000, generation: adapter.generation() });
    const owner = device as unknown as {
      nativeStreamingLeases: Map<Texture, { removeDispose(): void }>;
      detachNativeStreamingTextures(): void;
    };
    const lease = owner.nativeStreamingLeases.get(texture)!;
    const failure = new Error("reentrant streaming unsubscribe failed");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const remove = vi.spyOn(lease, "removeDispose").mockImplementationOnce(() => {
      expect(causes(capture(() => lifecycle.dispose())).some(error =>
        error instanceof Error && error.message === "Resource disposal did not complete.")).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      throw failure;
    });
    try {
      expect(causes(capture(() => owner.detachNativeStreamingTextures()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(remove).toHaveBeenCalledOnce();
      lifecycle.dispose();
      expect(remove).toHaveBeenCalledTimes(2);
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      remove.mockRestore();
    }
  });

  it("keeps a failed streaming unprepare unsubscribe for device teardown", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const adapter = device.createTextureResidencyAdapter();
    const texture = new Texture({ width: 1, height: 1 });
    const source = { texture, identity: {}, fallback: [0, 0, 0, 255] as const, levels: [{ width: 1, height: 1, bytes: 4 }] };
    adapter.prepare(source, { maxBytes: 100000, generation: adapter.generation() });
    const owner = device as unknown as { nativeStreamingLeases: Map<Texture, { removeDispose(): void }> };
    const lease = owner.nativeStreamingLeases.get(texture)!;
    const failure = new Error("streaming unprepare unsubscribe failed");
    const unsubscribe = vi.spyOn(lease, "removeDispose").mockImplementationOnce(() => { throw failure; });
    try {
      expect(causes(capture(() => { void adapter.unprepare(source, adapter.generation()); }))).toContain(failure);
      expect(owner.nativeStreamingLeases.get(texture)).toBe(lease);
      device.dispose();
      expect(unsubscribe).toHaveBeenCalledTimes(2);
      expect(owner.nativeStreamingLeases.size).toBe(0);
      expect(device[resourceDisposalPending]).toBe(false);
    } finally {
      capture(() => device.dispose());
      f.finish();
      await flush();
      unsubscribe.mockRestore();
    }
  });

  it("retains failed forward-bundle uniform retirements and preserves both original failures", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const uniform = f.native.createBuffer({ label: "bundle-uniform" });
    const frameUniform = f.native.createBuffer({ label: "bundle-frame-uniform" });
    device.resourceInterop.register(uniform, () => uniform.destroy());
    device.resourceInterop.register(frameUniform, () => frameUniform.destroy());
    const owner = device as unknown as {
      nativeForwardBundleResources: Set<object>;
      nativeForwardBundles: { invalidate(entry: object): void; dispose(): void } | undefined;
      retireNative(resource: object): void;
    };
    const cache = { invalidate: vi.fn(), dispose: vi.fn() };
    owner.nativeForwardBundles = cache;
    const entry = { live: true, uniform, frameUniform };
    owner.nativeForwardBundleResources.add(entry);
    const failures = [new Error("bundle uniform failed"), new Error("bundle frame uniform failed")];
    const original = owner.retireNative.bind(device);
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (fail && resource === uniform) throw failures[0];
      if (fail && resource === frameUniform) throw failures[1];
      original(resource);
    });
    try {
      const first = capture(() => device.dispose());
      expect(causes(first)).toContain(failures[0]);
      expect(causes(first)).toContain(failures[1]);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(cache.invalidate).toHaveBeenCalledOnce();
      expect(cache.dispose).toHaveBeenCalledOnce();
      fail = false;
      device.dispose();
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(retire.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(2);
      expect(retire.mock.calls.filter(([resource]) => resource === frameUniform)).toHaveLength(2);
      expect(cache.invalidate).toHaveBeenCalledOnce();
      expect(cache.dispose).toHaveBeenCalledOnce();
      expect(uniform.destroy).not.toHaveBeenCalled();
      expect(frameUniform.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(uniform.destroy).toHaveBeenCalledOnce();
      expect(frameUniform.destroy).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
    }
  });

  it("does not falsely certify a bundle cache whose unsubscribe threw after marking it disposed", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const failure = new Error("bundle cache unsubscribe failed");
    const unsubscribe = vi.fn(() => { throw failure; });
    const cache = new NativeRenderBundleCache({ disposed: false, contextLost: false, onDeviceLost: () => unsubscribe });
    const owner = device as unknown as { nativeForwardBundles: NativeRenderBundleCache | undefined };
    owner.nativeForwardBundles = cache;
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(owner.nativeForwardBundles).toBe(cache);
    } finally {
      f.finish();
      await flush();
    }
  });

  it("keeps an in-flight bundle cache when its unsubscribe reenters disposal and throws", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const failure = new Error("reentrant cache unsubscribe failed");
    const unsubscribe = vi.fn(() => {
      expect(causes(capture(() => lifecycle.dispose())).some(error =>
        error instanceof Error && error.message === "Resource disposal did not complete.")).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      throw failure;
    });
    const cache = new NativeRenderBundleCache({ disposed: false, contextLost: false, onDeviceLost: () => unsubscribe });
    const owner = device as unknown as { nativeForwardBundles: NativeRenderBundleCache | undefined; releaseNativeForwardBundles(): void };
    owner.nativeForwardBundles = cache;
    try {
      expect(causes(capture(() => owner.releaseNativeForwardBundles()))).toContain(failure);
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(owner.nativeForwardBundles).toBe(cache);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      f.finish();
      await flush();
    }
  });

  it("retries only bundle invalidation after successful uniform retirement", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const uniform = f.native.createBuffer({ label: "bundle-uniform" });
    const frameUniform = f.native.createBuffer({ label: "bundle-frame-uniform" });
    device.resourceInterop.register(uniform, () => uniform.destroy());
    device.resourceInterop.register(frameUniform, () => frameUniform.destroy());
    const owner = device as unknown as {
      nativeForwardBundleResources: Set<object>;
      nativeForwardBundles: { invalidate(entry: object): void; dispose(): void } | undefined;
      retireNative(resource: object): void;
    };
    const failure = new Error("bundle invalidation failed");
    const cache = { invalidate: vi.fn().mockImplementationOnce(() => { throw failure; }), dispose: vi.fn() };
    owner.nativeForwardBundles = cache;
    owner.nativeForwardBundleResources.add({ live: true, uniform, frameUniform });
    const retire = vi.spyOn(owner, "retireNative");
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(retire.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(1);
      expect(retire.mock.calls.filter(([resource]) => resource === frameUniform)).toHaveLength(1);
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(cache.invalidate).toHaveBeenCalledTimes(2);
      expect(cache.dispose).toHaveBeenCalledOnce();
      expect(retire.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(1);
      expect(retire.mock.calls.filter(([resource]) => resource === frameUniform)).toHaveLength(1);
      expect(uniform.destroy).not.toHaveBeenCalled();
      expect(frameUniform.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(uniform.destroy).toHaveBeenCalledOnce();
      expect(frameUniform.destroy).toHaveBeenCalledOnce();
    } finally {
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
    }
  });

  it("retains a failed fallback-texture retirement without repeating canvas depth cleanup", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const fallback = f.native.createTexture({ label: "fallback" });
    const depth = f.native.createTexture({ label: "canvas-depth" });
    device.resourceInterop.register(fallback, () => fallback.destroy());
    device.resourceInterop.register(depth, () => depth.destroy());
    const owner = device as unknown as {
      nativeFallbackTextures: Map<string, { texture: typeof fallback; view: object }>;
      canvasDepthTexture: typeof depth | null;
      retireNative(resource: object): void;
    };
    owner.nativeFallbackTextures.set("fallback", { texture: fallback, view: {} });
    owner.canvasDepthTexture = depth;
    const failure = new Error("fallback retirement failed");
    const original = owner.retireNative.bind(device);
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === fallback && fail) throw failure;
      original(resource);
    });
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(retire.mock.calls.filter(([resource]) => resource === depth)).toHaveLength(1);
      fail = false;
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(retire.mock.calls.filter(([resource]) => resource === fallback)).toHaveLength(2);
      expect(retire.mock.calls.filter(([resource]) => resource === depth)).toHaveLength(1);
      expect(fallback.destroy).not.toHaveBeenCalled();
      expect(depth.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(fallback.destroy).toHaveBeenCalledOnce();
      expect(depth.destroy).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
    }
  });

  it("retains independent sampled-native and budgeted-texture cleanup failures", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const sampled = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    const native = device.getNativeTexture(sampled) as unknown as { destroy: ReturnType<typeof vi.fn> };
    const budgeted = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    const owner = device as unknown as { nativeBudgetedTextures: Map<Texture, Texture>; retireNative(resource: object): void };
    owner.nativeBudgetedTextures.set(sampled, budgeted);
    const failures = [new Error("sampled retirement failed"), new Error("budgeted cleanup failed")];
    const original = owner.retireNative.bind(device);
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === native && fail) throw failures[0];
      original(resource);
    });
    const budgetedDispose = vi.spyOn(budgeted, "dispose").mockImplementationOnce(() => { throw failures[1]; });
    try {
      const first = capture(() => device.dispose());
      expect(causes(first)).toContain(failures[0]);
      expect(causes(first)).toContain(failures[1]);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(budgetedDispose).toHaveBeenCalledOnce();
      fail = false;
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(retire.mock.calls.filter(([resource]) => resource === native)).toHaveLength(2);
      expect(budgetedDispose).toHaveBeenCalledTimes(2);
      expect(budgeted.disposed).toBe(true);
      expect(native.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(native.destroy).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
      budgetedDispose.mockRestore();
    }
  });

  it("retries a sampled-texture unsubscribe while leaving successful siblings alone", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const sampled = [new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false }),
      new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false })];
    for (const texture of sampled) device.getNativeTexture(texture);
    const owner = device as unknown as { nativeSampledTextureDisposers: Map<Texture, () => void> };
    const failure = new Error("sampled unsubscribe failed");
    const first = vi.fn(owner.nativeSampledTextureDisposers.get(sampled[0]!)!)
      .mockImplementationOnce(() => { throw failure; });
    const second = vi.fn(owner.nativeSampledTextureDisposers.get(sampled[1]!)!);
    owner.nativeSampledTextureDisposers.set(sampled[0]!, first);
    owner.nativeSampledTextureDisposers.set(sampled[1]!, second);
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
      device.dispose();
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(first).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledOnce();
    } finally {
      capture(() => device.dispose());
      f.finish();
      await flush();
    }
  });

  it("retains uncertain budgeted-texture cleanup when it throws after setting disposed", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const sampled = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    device.getNativeTexture(sampled);
    const budgeted = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    const owner = device as unknown as { nativeBudgetedTextures: Map<Texture, Texture> };
    owner.nativeBudgetedTextures.set(sampled, budgeted);
    const failure = new Error("budgeted cleanup uncertain");
    const original = budgeted.dispose.bind(budgeted);
    const dispose = vi.spyOn(budgeted, "dispose").mockImplementationOnce(() => { original(); throw failure; });
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(budgeted.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      f.finish();
      await flush();
      dispose.mockRestore();
    }
  });

  it("retains an in-flight sampled unsubscribe across reentrant parent disposal", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const sampled = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    device.getNativeTexture(sampled);
    const owner = device as unknown as {
      nativeSampledTextureDisposers: Map<Texture, () => void>;
      releaseNativeSampledTexture(texture: Texture): void;
    };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const failure = new Error("reentrant sampled unsubscribe failed");
    const unsubscribe = vi.fn(owner.nativeSampledTextureDisposers.get(sampled)!).mockImplementationOnce(() => {
      expect(causes(capture(() => lifecycle.dispose())).some(error =>
        error instanceof Error && error.message === "Resource disposal did not complete.")).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      throw failure;
    });
    owner.nativeSampledTextureDisposers.set(sampled, unsubscribe);
    try {
      expect(causes(capture(() => owner.releaseNativeSampledTexture(sampled)))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(unsubscribe).toHaveBeenCalledOnce();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(unsubscribe).toHaveBeenCalledTimes(2);
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
    }
  });

  it("retains an in-flight bundle retirement when it reenters a parent lifecycle", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const uniform = f.native.createBuffer({ label: "bundle-uniform" });
    const frameUniform = f.native.createBuffer({ label: "bundle-frame-uniform" });
    device.resourceInterop.register(uniform, () => uniform.destroy());
    device.resourceInterop.register(frameUniform, () => frameUniform.destroy());
    const entry = { live: true, uniform, frameUniform };
    const owner = device as unknown as {
      nativeForwardBundleResources: Set<object>;
      nativeForwardBundles: { invalidate(entry: object): void; dispose(): void } | undefined;
      retireNative(resource: object): void;
      retireNativeForwardBundle(entry: object): void;
    };
    const cache = { invalidate: vi.fn(), dispose: vi.fn() };
    owner.nativeForwardBundles = cache;
    owner.nativeForwardBundleResources.add(entry);
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const failure = new Error("bundle reentrant retirement failed");
    const original = owner.retireNative.bind(device);
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === uniform && fail) {
        expect(causes(capture(() => lifecycle.dispose())).some(error =>
          error instanceof Error && error.message === "Resource disposal did not complete.")).toBe(true);
        expect(device[resourceDisposalPending]).toBe(true);
        throw failure;
      }
      original(resource);
    });
    try {
      expect(causes(capture(() => owner.retireNativeForwardBundle(entry)))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(retire.mock.calls.filter(([resource]) => resource === frameUniform)).toHaveLength(1);
      fail = false;
      lifecycle.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(retire.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(2);
      expect(retire.mock.calls.filter(([resource]) => resource === frameUniform)).toHaveLength(1);
      expect(cache.invalidate).toHaveBeenCalledOnce();
      expect(cache.dispose).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
    }
  });

  it("retains an uncertain Gaussian adapter after its scratch cleanup throws", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const scene = device.createRenderTarget({ width: 4, height: 4, format: "rgba16f", depth: true });
    device.beginFrame(4, 4);
    device.setRenderTarget(scene);
    const adapter = device.createGaussianSplatColorAdapter();
    const scratch = adapter.createScratch(scene);
    const failure = new Error("splat scratch cleanup failed");
    const dispose = vi.spyOn(scratch, "dispose").mockImplementationOnce(() => { throw failure; });
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(sibling).toHaveBeenCalledOnce();
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      // The adapter marks itself retired before scratch disposal, so a second
      // adapter call cannot certify that its remaining cleanup ran.
      expect(dispose).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      f.finish();
      await flush();
      dispose.mockRestore();
      sibling.mockRestore();
    }
  });

  it("retains failed deferred bundle retirements while completing healthy siblings", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const first = f.native.createBuffer({ label: "deferred-first" });
    const second = f.native.createBuffer({ label: "deferred-second" });
    device.resourceInterop.register(first, () => first.destroy());
    device.resourceInterop.register(second, () => second.destroy());
    const owner = device as unknown as {
      nativeForwardBundleRetirements: Set<object>;
      retireNative(resource: object): void;
    };
    owner.nativeForwardBundleRetirements.add(first);
    owner.nativeForwardBundleRetirements.add(second);
    const failure = new Error("deferred bundle retirement failed");
    const original = owner.retireNative.bind(device);
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === first && fail) throw failure;
      original(resource);
    });
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(retire.mock.calls.filter(([resource]) => resource === second)).toHaveLength(1);
      fail = false;
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(retire.mock.calls.filter(([resource]) => resource === first)).toHaveLength(2);
      expect(retire.mock.calls.filter(([resource]) => resource === second)).toHaveLength(1);
      expect(first.destroy).not.toHaveBeenCalled();
      expect(second.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(first.destroy).toHaveBeenCalledOnce();
      expect(second.destroy).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
    }
  });

  it.each([false, true])("keeps an in-flight native target owned after reentrant disposal (borrowed=%s)", async borrowed => {
    const f = await fixture(borrowed);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const target = f.source as RenderTarget & { readonly [resourceDisposalPending]: boolean; readonly nativeDisposalComplete: boolean };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const failure = new Error("outer texture cleanup failed");
    const original = target.colorTexture.dispose.bind(target.colorTexture);
    let fail = true, nested: unknown;
    const color = vi.spyOn(target.colorTexture, "dispose").mockImplementation(() => {
      if (fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
      original();
    });
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      expect(device[resourceDisposalPending]).toBe(false);
      expect(capture(() => target.dispose())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(target.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(target.nativeDisposalComplete).toBe(false);
      expect(lifecycle.leakCount()).toBe(1);
      expect(sibling).toHaveBeenCalledOnce();
      expect(f.native.destroy).toHaveBeenCalledTimes(borrowed ? 0 : 1);

      fail = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(target.nativeDisposalComplete).toBe(true);
      expect(color).toHaveBeenCalledTimes(2);
      expect(sibling).toHaveBeenCalledOnce();
      expect(f.native.destroy).toHaveBeenCalledTimes(borrowed ? 0 : 1);
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      color.mockRestore();
      sibling.mockRestore();
    }
  });

  it("keeps a reentrant native buffer callback owned and retries it without re-retiring its handle", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const buffer = f.buffer as typeof f.buffer & { readonly [resourceDisposalPending]: boolean; onDispose(value: object): void };
    const owner = device as unknown as { retireNative(resource: object): void };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const original = buffer.onDispose.bind(buffer), failure = new Error("buffer bookkeeping failed");
    let fail = true, nested: unknown;
    const callback = vi.spyOn(buffer, "onDispose").mockImplementation(value => {
      if (fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
      original(value);
    });
    const retire = vi.spyOn(owner, "retireNative");
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      expect(capture(() => buffer.dispose())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(buffer.disposed).toBe(true);
      expect(buffer[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(sibling).toHaveBeenCalledOnce();
      const handle = f.buffers.find(resource => resource.label.includes("vertex"))!;
      expect(retire.mock.calls.filter(([resource]) => resource === handle)).toHaveLength(1);
      fail = false;
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(buffer[resourceDisposalPending]).toBe(false);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(retire.mock.calls.filter(([resource]) => resource === handle)).toHaveLength(1);
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      callback.mockRestore();
      retire.mockRestore();
      sibling.mockRestore();
    }
  });

  it("retries a failed native buffer retirement while leaving successful siblings alone", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const buffer = f.buffer as typeof f.buffer & { readonly [resourceDisposalPending]: boolean };
    const sibling = device.createBuffer("vertex", 16);
    const failed = f.buffers.find(resource => resource.label === `aura3d-vertex-${buffer.id}`)!;
    const healthy = f.buffers.find(resource => resource.label === `aura3d-vertex-${sibling.id}`)!;
    expect(failed).toBeDefined();
    expect(healthy).toBeDefined();
    const owner = device as unknown as { retireNative(resource: object): void };
    const original = owner.retireNative.bind(device), failure = new Error("native buffer retirement failed");
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === failed && fail) throw failure;
      original(resource);
    });
    const siblingDispose = vi.spyOn(sibling, "dispose");
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(buffer.disposed).toBe(true);
      expect(buffer[resourceDisposalPending]).toBe(true);
      expect(sibling.disposed).toBe(true);
      expect(siblingDispose).toHaveBeenCalledOnce();
      fail = false;
      device.dispose();
      device.dispose();
      expect(buffer[resourceDisposalPending]).toBe(false);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(retire.mock.calls.filter(([resource]) => resource === failed)).toHaveLength(2);
      expect(retire.mock.calls.filter(([resource]) => resource === healthy)).toHaveLength(1);
      expect(siblingDispose).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
      siblingDispose.mockRestore();
    }
    expect(f.buffers.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it.each(["target", "buffer"] as const)("reports an in-flight %s even after its owner bookkeeping removed it", async kind => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const resource = kind === "target" ? f.source : f.buffer;
    const internal = resource as typeof resource & { onDispose(value: object): void };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const original = internal.onDispose.bind(resource), failure = new Error("failure after bookkeeping");
    let fail = true, nested: unknown;
    const callback = vi.spyOn(internal, "onDispose").mockImplementation(value => {
      original(value);
      if (fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
    });
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      expect(capture(() => resource.dispose())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(sibling).toHaveBeenCalledOnce();
      fail = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      callback.mockRestore();
      sibling.mockRestore();
    }
  });

  it.each(["target", "buffer"] as const)("clears the in-flight %s signal when the outer disposer succeeds", async kind => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const resource = kind === "target" ? f.source : f.buffer;
    const internal = resource as typeof resource & { onDispose(value: object): void };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const original = internal.onDispose.bind(resource);
    let nested: unknown;
    const callback = vi.spyOn(internal, "onDispose").mockImplementation(value => {
      original(value);
      nested = capture(() => lifecycle.dispose());
    });
    const dispose = vi.spyOn(resource, "dispose");
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      resource.dispose();
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(false);
      expect(dispose).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      callback.mockRestore();
      dispose.mockRestore();
      sibling.mockRestore();
    }
  });

  it.each(["history", "exposure"] as const)("retains a reentrant %s target after its post owner returns normally", async kind => {
    const f = await fixture(true);
    if (kind === "history") f.afterimage();
    else f.exposure();
    const label = kind === "history" ? "webgpu-afterimage-history" : "webgpu-exposure-meter";
    const target = f.targets.find(value => value.label === label)! as RenderTarget & { readonly nativeDisposalComplete: boolean };
    const sibling = f.targets.find(value => value !== target && value.label.startsWith(kind === "history" ? "webgpu-afterimage-" : "webgpu-exposure-"))!;
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const original = target.colorTexture.dispose.bind(target.colorTexture), failure = new Error("post texture cleanup failed");
    let fail = true, nested: unknown;
    const color = vi.spyOn(target.colorTexture, "dispose").mockImplementation(() => {
      if (fail) { nested = capture(() => device.dispose()); throw failure; }
      original();
    });
    const siblingDispose = vi.spyOn(sibling, "dispose");
    try {
      expect(capture(() => target.dispose())).toBe(failure);
      expect(nested).toBeUndefined();
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(target.disposed).toBe(true);
      expect(target.nativeDisposalComplete).toBe(false);
      expect(siblingDispose).toHaveBeenCalledOnce();
      fail = false;
      device.dispose();
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(target.nativeDisposalComplete).toBe(true);
      expect(color).toHaveBeenCalledTimes(2);
      expect(siblingDispose).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => target.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      color.mockRestore();
      siblingDispose.mockRestore();
    }
  });

  it("retains failed one-shot post uniforms for retry without repeating successful retirement", async () => {
    const f = await fixture(true);
    f.afterimage();
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const owner = device as unknown as { webgpuPostRetiredUniformBuffers: WebGPUBufferLike[]; retireNative(resource: WebGPUBufferLike): void };
    const failed = owner.webgpuPostRetiredUniformBuffers[0]!;
    expect(failed).toBeDefined();
    const healthy = f.native.createBuffer({ label: "healthy-post-uniform" });
    device.resourceInterop.register(healthy, () => healthy.destroy());
    owner.webgpuPostRetiredUniformBuffers.push(healthy);
    const original = owner.retireNative.bind(device), failure = new Error("one-shot post uniform retirement failed");
    let fail = true;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === failed && fail) throw failure;
      original(resource);
    });
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(owner.webgpuPostRetiredUniformBuffers).toEqual([failed]);
      expect(retire.mock.calls.filter(([resource]) => resource === healthy)).toHaveLength(1);
      fail = false;
      device.dispose();
      device.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(owner.webgpuPostRetiredUniformBuffers).toEqual([]);
      expect(retire.mock.calls.filter(([resource]) => resource === failed)).toHaveLength(2);
      expect(retire.mock.calls.filter(([resource]) => resource === healthy)).toHaveLength(1);
    } finally {
      fail = false;
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
    }
  });

  it("keeps an in-flight post-uniform retirement visible to a reentrant parent lifecycle", async () => {
    const f = await fixture(true);
    f.afterimage();
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const owner = device as unknown as {
      webgpuPostRetiredUniformBuffers: WebGPUBufferLike[];
      reclaimWebGPUPostUniformBuffers(): void;
      retireNative(resource: WebGPUBufferLike): void;
    };
    const uniform = owner.webgpuPostRetiredUniformBuffers[0]!;
    const original = owner.retireNative.bind(device), failure = new Error("in-flight post uniform failed");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const sibling = vi.spyOn(f.output, "dispose");
    let fail = true, nested: unknown;
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === uniform && fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
      original(resource);
    });
    try {
      expect(causes(capture(() => owner.reclaimWebGPUPostUniformBuffers()))).toContain(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(owner.webgpuPostRetiredUniformBuffers).toEqual([uniform]);
      expect(lifecycle.leakCount()).toBe(1);
      expect(sibling).toHaveBeenCalledOnce();
      fail = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(retire.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(2);
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      retire.mockRestore();
      sibling.mockRestore();
    }
  });

  it("reports an in-flight sampled-texture retirement across a reentrant queue fence", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    const native = device.getNativeTexture(texture) as unknown as { destroy: ReturnType<typeof vi.fn> };
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const fence = f.native.queue.onSubmittedWorkDone();
    let nested: unknown;
    f.native.queue.onSubmittedWorkDone.mockImplementationOnce(() => {
      nested = capture(() => lifecycle.dispose());
      return fence;
    });
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      texture.dispose();
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(false);
      expect(native.destroy).not.toHaveBeenCalled();
      expect(sibling).toHaveBeenCalledOnce();
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(sibling).toHaveBeenCalledOnce();
      expect(native.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(native.destroy).toHaveBeenCalledOnce();
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      sibling.mockRestore();
    }
  });

  it("retains a shader whose disposer returns normally before closing", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const marker = "pending-shader";
    const shader = device.createShaderProgram({ label: marker, marker, vertex: `// ${marker}\nvoid main() {}`,
      fragment: `// ${marker}\nvoid main() {}`, webgpu: {
        vertex: "@vertex fn vs_main() -> @builtin(position) vec4<f32> { return vec4<f32>(); }",
        fragment: "@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(); }"
      } });
    const original = shader.dispose.bind(shader);
    let pending = true;
    const dispose = vi.spyOn(shader, "dispose").mockImplementation(() => { if (!pending) original(); });
    const sibling = vi.spyOn(f.output, "dispose");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(capture(() => lifecycle.dispose())).toBeInstanceOf(AggregateError);
      expect(shader.disposed).toBe(false);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(sibling).toHaveBeenCalledOnce();
      pending = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(shader.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      pending = false;
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      dispose.mockRestore();
      sibling.mockRestore();
    }
  });

  it("retains uncertain owned-device destruction until confirmed loss without repeating sibling disposal", async () => {
    const f = await fixture();
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const failure = new Error("native device destroy failed");
    f.native.destroy.mockImplementationOnce(() => { throw failure; });
    const sibling = vi.spyOn(f.output, "dispose");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      expect(f.textures.every(resource => resource.destroy.mock.calls.length === 0)).toBe(true);
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(f.textures.every(resource => resource.destroy.mock.calls.length === 0)).toBe(true);
      f.lose({ reason: "destroyed", message: "confirmed loss" });
      await flush();
      lifecycle.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      expect(f.textures.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      sibling.mockRestore();
    }
    expect(f.textures.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("retries native invalidation without destroying an already-destroyed owned device again", async () => {
    const f = await fixture();
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const original = device.resourceInterop.invalidate.bind(device.resourceInterop), failure = new Error("native invalidation failed");
    const invalidate = vi.spyOn(device.resourceInterop, "invalidate")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(original);
    const sibling = vi.spyOn(f.output, "dispose");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(causes(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(invalidate).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      lifecycle.dispose();
      lifecycle.dispose();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(invalidate).toHaveBeenCalledTimes(2);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      expect(f.textures.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      invalidate.mockRestore();
      sibling.mockRestore();
    }
  });

  it.each([1, 2])("clears pending owned-device destruction after confirmed loss (%s invalidation failures)", async failures => {
    const f = await fixture();
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const destroyFailure = new Error("native destroy failed"), lossFailure = new Error("first loss invalidation failed");
    f.native.destroy.mockImplementationOnce(() => { throw destroyFailure; });
    const original = device.resourceInterop.invalidate.bind(device.resourceInterop);
    let remaining = failures;
    const invalidate = vi.spyOn(device.resourceInterop, "invalidate").mockImplementation(() => {
      if (remaining > 0) { remaining -= 1; throw lossFailure; }
      original();
    });
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    try {
      expect(causes(capture(() => lifecycle.dispose()))).toContain(destroyFailure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(invalidate).not.toHaveBeenCalled();
      f.lose({ reason: "destroyed", message: "confirmed loss" });
      await flush();
      expect(invalidate).toHaveBeenCalledOnce();
      expect(device.getDiagnostics().lastError).toContain(lossFailure.message);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      if (failures === 2) {
        expect(causes(capture(() => lifecycle.dispose()))).toContain(lossFailure);
        expect(device[resourceDisposalPending]).toBe(true);
        expect(lifecycle.leakCount()).toBe(1);
      }
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(invalidate).toHaveBeenCalledTimes(failures + 1);
      expect(f.native.destroy).toHaveBeenCalledOnce();
    } finally {
      capture(() => lifecycle.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      invalidate.mockRestore();
    }
  });

  it.each(["pool-first", "particle-first"] as const)("composes native pending ownership through the particle and pool wrappers (%s)", async order => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const earlyPool = order === "pool-first" ? prd11RenderTargetPoolFor(device) : undefined;
    const sim = new ParticleGpuSim(device, { capacity: 4, lifetimeMax: 2 });
    const pool = earlyPool ?? prd11RenderTargetPoolFor(device);
    const pooled = pool.acquireLease({ width: 4, height: 4, format: "rgba8", samples: 1, depth: false }).target;
    const particle = sim.state!.posTarget;
    const particleDispose = vi.spyOn(particle, "dispose");
    const poolDispose = vi.spyOn(pooled, "dispose");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    const original = f.source.colorTexture.dispose.bind(f.source.colorTexture), failure = new Error("nested target retirement failed");
    let fail = true, nested: unknown;
    const color = vi.spyOn(f.source.colorTexture, "dispose").mockImplementation(() => {
      if (fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
      original();
    });
    try {
      expect(capture(() => f.source.dispose())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(sim.cleanupPending).toBe(false);
      expect(particleDispose).toHaveBeenCalledOnce();
      expect(poolDispose).toHaveBeenCalledOnce();
      fail = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(color).toHaveBeenCalledTimes(2);
      expect(particleDispose).toHaveBeenCalledOnce();
      expect(poolDispose).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => sim.dispose());
      capture(() => pool.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      color.mockRestore();
      particleDispose.mockRestore();
      poolDispose.mockRestore();
    }
  });

  it("retries an in-flight particle-owned WebGPU target through its parent device", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const sim = new ParticleGpuSim(device, { capacity: 4, lifetimeMax: 2 });
    const target = sim.state!.posTarget as RenderTarget & { readonly [resourceDisposalPending]: boolean };
    const healthy = vi.spyOn(sim.state!.velTarget, "dispose");
    const original = target.colorTexture.dispose.bind(target.colorTexture), failure = new Error("particle target texture failed");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    let fail = true, nested: unknown;
    const color = vi.spyOn(target.colorTexture, "dispose").mockImplementation(() => {
      if (fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
      original();
    });
    try {
      expect(capture(() => target.dispose())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(sim.cleanupPending).toBe(true);
      expect(healthy).toHaveBeenCalledOnce();
      fail = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(sim.cleanupPending).toBe(false);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(color).toHaveBeenCalledTimes(2);
      expect(healthy).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => sim.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      color.mockRestore();
      healthy.mockRestore();
    }
  });

  it("retries an in-flight pooled WebGPU target through the lane-owned device", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const pool = prd11RenderTargetPoolFor(device);
    const desc = { width: 4, height: 4, format: "rgba8", samples: 1, depth: false } as const;
    const target = pool.acquireLease(desc).target as RenderTarget & { readonly [resourceDisposalPending]: boolean };
    const sibling = pool.acquireLease(desc).target;
    const healthy = vi.spyOn(sibling, "dispose");
    const original = target.colorTexture.dispose.bind(target.colorTexture), failure = new Error("pool target texture failed");
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(device);
    let fail = true, nested: unknown;
    const color = vi.spyOn(target.colorTexture, "dispose").mockImplementation(() => {
      if (fail) { nested = capture(() => lifecycle.dispose()); throw failure; }
      original();
    });
    try {
      expect(capture(() => target.dispose())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(lifecycle.leakCount()).toBe(1);
      expect(healthy).toHaveBeenCalledOnce();
      fail = false;
      lifecycle.dispose();
      lifecycle.dispose();
      expect(target[resourceDisposalPending]).toBe(false);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(lifecycle.disposed).toBe(true);
      expect(color).toHaveBeenCalledTimes(2);
      expect(healthy).toHaveBeenCalledOnce();
    } finally {
      fail = false;
      capture(() => lifecycle.dispose());
      capture(() => pool.dispose());
      capture(() => device.dispose());
      f.finish();
      await flush();
      color.mockRestore();
      healthy.mockRestore();
    }
  });

  it.each(["target", "device"] as const)("retains a target when its owner callback fails after bookkeeping (%s)", async entry => {
    const f = await fixture(true);
    const target = f.source;
    const owner = f.device as unknown as {
      renderTargets: Set<RenderTarget>;
      retireNative(resource: object): void;
    };
    const internal = target as unknown as { nativeTexture: object; onDispose(target: RenderTarget): void };
    const original = internal.onDispose.bind(target), failure = new Error("owner callback failed");
    let fail = true;
    const callback = vi.spyOn(internal, "onDispose").mockImplementation(value => {
      original(value);
      if (fail) throw failure;
    });
    const colorDispose = vi.spyOn(target.colorTexture, "dispose");
    const retire = vi.spyOn(owner, "retireNative");
    try {
      const first = capture(() => entry === "target" ? target.dispose() : f.device.dispose());
      expect(causes(first)).toContain(failure);
      if (entry === "target") expect(first).toBe(failure);
      expect(target.disposed).toBe(true);
      expect(owner.renderTargets.has(target)).toBe(true);
      expect(colorDispose).toHaveBeenCalledOnce();
      expect(retire.mock.calls.filter(([resource]) => resource === internal.nativeTexture)).toHaveLength(1);
      if (entry === "device") {
        expect(causes(capture(() => f.device.dispose()))).toContain(failure);
        expect(owner.renderTargets.has(target)).toBe(true);
        expect(colorDispose).toHaveBeenCalledOnce();
        expect(retire.mock.calls.filter(([resource]) => resource === internal.nativeTexture)).toHaveLength(1);
      }
      const count = f.device.getDiagnostics().disposedRenderTargets;
      fail = false;
      f.device.dispose();
      expect(callback).toHaveBeenCalledTimes(entry === "device" ? 3 : 2);
      expect(colorDispose).toHaveBeenCalledOnce();
      expect(retire.mock.calls.filter(([resource]) => resource === internal.nativeTexture)).toHaveLength(1);
      expect(owner.renderTargets.has(target)).toBe(false);
      expect(f.device.getDiagnostics().disposedRenderTargets).toBe(count + (entry === "target" ? 1 : 0));
      expect(f.native.destroy).not.toHaveBeenCalled();
      expect(f.textures.every(resource => resource.destroy.mock.calls.length === 0)).toBe(true);
    } finally {
      fail = false;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      callback.mockRestore();
      colorDispose.mockRestore();
      retire.mockRestore();
    }
    expect(f.textures.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("reports a target error after completed cleanup without retrying that target", async () => {
    const f = await fixture(true);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    const target = f.source as RenderTarget & { readonly nativeDisposalComplete: boolean };
    const original = target.dispose.bind(target), failure = new Error("reported after target completion");
    const dispose = vi.spyOn(target, "dispose").mockImplementationOnce(() => { original(); throw failure; });
    const sibling = vi.spyOn(f.output, "dispose");
    try {
      expect(causes(capture(() => device.dispose()))).toContain(failure);
      expect(target.nativeDisposalComplete).toBe(true);
      expect(device[resourceDisposalPending]).toBe(false);
      expect(dispose).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
      device.dispose();
      expect(dispose).toHaveBeenCalledOnce();
      expect(sibling).toHaveBeenCalledOnce();
    } finally {
      capture(() => device.dispose());
      f.finish();
      await flush();
      dispose.mockRestore();
      sibling.mockRestore();
    }
  });

  it("attempts every target attachment and retries only failed native and logical retirement", async () => {
    const f = await fixture(true);
    const target = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: true, sampleCount: 4, label: "multi" });
    const owner = f.device as unknown as { renderTargets: Set<RenderTarget>; retireNative(resource: object): void };
    const native = target as unknown as { nativeTexture: object; nativeDepthTexture: object; nativeMultisampleTexture: object };
    const depthFailure = new Error("depth retirement failed"), colorFailure = new Error("logical color disposal failed");
    let failDepth = true, failColor = true;
    const originalRetire = owner.retireNative.bind(f.device), originalColorDispose = target.colorTexture.dispose.bind(target.colorTexture);
    const retire = vi.spyOn(owner, "retireNative").mockImplementation(resource => {
      if (resource === native.nativeDepthTexture && failDepth) throw depthFailure;
      originalRetire(resource);
    });
    const colorDispose = vi.spyOn(target.colorTexture, "dispose").mockImplementation(() => {
      if (failColor) throw colorFailure;
      originalColorDispose();
    });
    try {
      const first = capture(() => target.dispose());
      expect(first).toBeInstanceOf(AggregateError);
      expect(causes(first)).toContain(depthFailure);
      expect(causes(first)).toContain(colorFailure);
      expect(target.disposed).toBe(true);
      expect(owner.renderTargets.has(target)).toBe(true);
      for (const resource of [native.nativeTexture, native.nativeDepthTexture, native.nativeMultisampleTexture]) {
        expect(retire.mock.calls.filter(([value]) => value === resource)).toHaveLength(1);
      }
      expect(colorDispose).toHaveBeenCalledOnce();
      failDepth = false; failColor = false;
      f.device.dispose();
      expect(retire.mock.calls.filter(([value]) => value === native.nativeTexture)).toHaveLength(1);
      expect(retire.mock.calls.filter(([value]) => value === native.nativeMultisampleTexture)).toHaveLength(1);
      expect(retire.mock.calls.filter(([value]) => value === native.nativeDepthTexture)).toHaveLength(2);
      expect(colorDispose).toHaveBeenCalledTimes(2);
      expect(owner.renderTargets.has(target)).toBe(false);
    } finally {
      failDepth = false; failColor = false;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      colorDispose.mockRestore();
      retire.mockRestore();
    }
    expect(f.textures.every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("retains an in-flight target if its callback reenters device disposal and then fails", async () => {
    const f = await fixture();
    const target = f.source;
    const owner = f.device as unknown as { renderTargets: Set<RenderTarget> };
    const internal = target as unknown as { onDispose(target: RenderTarget): void };
    const original = internal.onDispose.bind(target), failure = new Error("reentrant owner failed");
    let first = true;
    const callback = vi.spyOn(internal, "onDispose").mockImplementation(value => {
      if (first) { first = false; f.device.dispose(); throw failure; }
      original(value);
    });
    try {
      expect(capture(() => target.dispose())).toBe(failure);
      expect(f.device.disposed).toBe(true);
      expect(owner.renderTargets.has(target)).toBe(true);
      f.device.dispose();
      expect(callback).toHaveBeenCalledTimes(2);
      expect(owner.renderTargets.has(target)).toBe(false);
      expect(f.native.destroy).toHaveBeenCalledOnce();
    } finally {
      first = false;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      callback.mockRestore();
    }
  });

  it.each([false, true])("retries only failed exposure and afterimage targets (borrowed=%s)", async borrowed => {
    const f = await fixture(borrowed);
    const device = f.device as WebGPUDevice & { readonly [resourceDisposalPending]: boolean };
    f.exposure();
    f.afterimage();
    const post = track(f.targets.filter(target => !target.disposed && (target.label.startsWith("webgpu-exposure-") || target.label === "webgpu-afterimage-history")));
    const exposure = post.find(record => record.target.label === "webgpu-exposure-meter")!;
    const history = post.find(record => record.target.label === "webgpu-afterimage-history")!;
    const exposureFailure = new Error("exposure target failed");
    const historyFailure = new Error("afterimage target failed");
    const liveResources = [...f.buffers, ...f.textures].filter(resource => resource.destroy.mock.calls.length === 0);
    expect(exposure).toBeDefined();
    expect(history).toBeDefined();
    exposure.failure = exposureFailure;
    history.failure = historyFailure;
    try {
      const initial = capture(() => f.device.dispose());
      expect(initial).toBeInstanceOf(AggregateError);
      expect(causes(initial)).toContain(exposureFailure);
      expect(causes(initial)).toContain(historyFailure);
      expect(f.device.disposed).toBe(true);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(f.source.disposed).toBe(true);
      expect(f.output.disposed).toBe(true);
      expect(f.buffer.disposed).toBe(true);
      expect(f.native.destroy).toHaveBeenCalledTimes(borrowed ? 0 : 1);
      expect((f.device as unknown as { webgpuAutoExposure: unknown }).webgpuAutoExposure).not.toBeNull();
      expect(post.every(record => record.attempts === 1)).toBe(true);

      history.failure = undefined;
      const second = capture(() => f.device.dispose());
      expect(second).toBeInstanceOf(AggregateError);
      expect(causes(second)).toContain(exposureFailure);
      expect(causes(second)).not.toContain(historyFailure);
      expect(device[resourceDisposalPending]).toBe(true);
      expect(history.attempts).toBe(2);
      expect(exposure.attempts).toBe(2);
      exposure.failure = undefined;
      expect(() => f.device.dispose()).not.toThrow();
      expect(() => f.device.dispose()).not.toThrow();
      expect(device[resourceDisposalPending]).toBe(false);
      expect(exposure.attempts).toBe(3);
      expect(history.attempts).toBe(2);
      expect(post.filter(record => record !== exposure && record !== history).every(record => record.attempts === 1)).toBe(true);
      expect(f.native.destroy).toHaveBeenCalledTimes(borrowed ? 0 : 1);
      if (borrowed) expect(liveResources.filter(resource => resource.destroy.mock.calls.length !== 0).map(resource => resource.label)).toEqual([]);
    } finally {
      exposure.failure = undefined;
      history.failure = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
    expect([...f.buffers, ...f.textures].every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("retries failed afterimage history after the device is already disposed", async () => {
    const f = await fixture();
    f.exposure();
    f.afterimage();
    const helper = (f.device as unknown as { webgpuAutoExposure: { dispose(): void } }).webgpuAutoExposure;
    const helperDispose = vi.spyOn(helper, "dispose");
    const history = track(f.targets.filter(target => target.label === "webgpu-afterimage-history"));
    const failure = new Error("afterimage retirement failed");
    history[0]!.failure = failure;
    try {
      expect(causes(capture(() => f.device.dispose()))).toContain(failure);
      expect(f.device.disposed).toBe(true);
      expect(history[0]!.target.disposed).toBe(false);
      history[0]!.failure = undefined;
      f.device.dispose();
      expect(history[0]!.target.disposed).toBe(true);
      expect(history[1]!.attempts).toBe(1);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(helperDispose).toHaveBeenCalledOnce();
    } finally {
      history[0]!.failure = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      helperDispose.mockRestore();
    }
  });

  it("retains failed exposure uniform retirement without repeating successful retirement", async () => {
    const f = await fixture(true);
    f.exposure();
    const internals = f.device as unknown as {
      webgpuAutoExposure: { dispose(): void } | null;
      webgpuExposureUniformBuffers: Map<number, WebGPUBufferLike>;
      retireNative(resource: WebGPUBufferLike): void;
    };
    const helper = internals.webgpuAutoExposure!;
    const helperDispose = vi.spyOn(helper, "dispose");
    const uniforms = [...internals.webgpuExposureUniformBuffers.values()];
    expect(uniforms.length).toBeGreaterThan(1);
    const failed = uniforms[0]!, failure = new Error("uniform retirement failed");
    let shouldFail = true;
    const retire = internals.retireNative.bind(f.device);
    const retireSpy = vi.spyOn(internals, "retireNative").mockImplementation(resource => {
      if (resource === failed && shouldFail) throw failure;
      retire(resource);
    });
    try {
      const initial = capture(() => f.device.dispose());
      expect(causes(initial)).toContain(failure);
      expect(internals.webgpuAutoExposure).toBeNull();
      expect([...internals.webgpuExposureUniformBuffers.values()]).toEqual([failed]);
      expect(helperDispose).toHaveBeenCalledOnce();
      expect(causes(capture(() => f.device.dispose()))).toContain(failure);
      expect(helperDispose).toHaveBeenCalledOnce();
      shouldFail = false;
      f.device.dispose();
      expect(internals.webgpuExposureUniformBuffers.size).toBe(0);
      for (const uniform of uniforms.slice(1)) expect(retireSpy.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(1);
      expect(helperDispose).toHaveBeenCalledOnce();
    } finally {
      shouldFail = false;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      retireSpy.mockRestore();
      helperDispose.mockRestore();
    }
    expect([...f.buffers, ...f.textures].every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("guards reentrant device disposal during post target cleanup", async () => {
    const f = await fixture();
    f.exposure();
    f.afterimage();
    const post = track(f.targets.filter(target => !target.disposed && (target.label.startsWith("webgpu-exposure-") || target.label === "webgpu-afterimage-history")));
    const first = post[0]!;
    const reenter = vi.fn(() => {
      f.device.dispose();
      expect(capture(() => f.device.createBuffer("vertex", 16))).toMatchObject({ code: "DISPOSED_DEVICE" });
    });
    first.onDispose = reenter;
    try {
      expect(() => f.device.dispose()).not.toThrow();
      expect(reenter).toHaveBeenCalledOnce();
      expect(post.every(record => record.attempts === 1)).toBe(true);
      expect(f.native.destroy).toHaveBeenCalledOnce();
      expect(() => f.device.dispose()).not.toThrow();
      expect(f.native.destroy).toHaveBeenCalledOnce();
    } finally {
      first.onDispose = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
  });

  it("preserves the device-disposal guard and fence during a texture upload", async () => {
    const f = await fixture(true);
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false, label: "upload-guard" });
    let nested: unknown;
    f.onWrite(() => { nested = capture(() => f.device.dispose()); });
    try {
      f.device.getNativeTexture(texture);
      expect(nested).toMatchObject({ code: "WEBGPU_TEXTURE_UPLOAD_ACTIVE" });
      expect(f.device.disposed).toBe(false);
      const uploaded = f.textures.find(resource => resource.label === "upload-guard")!;
      expect(uploaded).toBeDefined();
      f.onWrite();
      f.device.dispose();
      expect(uploaded.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(uploaded.destroy).toHaveBeenCalledOnce();
    } finally {
      f.onWrite();
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      texture.dispose();
    }
  });

  it("does not interrupt a scoped post cleanup with a nested device disposal", async () => {
    const f = await fixture();
    f.exposure();
    f.afterimage();
    const post = track(f.targets.filter(target => !target.disposed && (target.label.startsWith("webgpu-exposure-") || target.label === "webgpu-afterimage-history")));
    const first = post[0]!;
    const reenter = vi.fn(() => {
      expect(capture(() => f.device.dispose())).toMatchObject({ code: "WEBGPU_POST_CLEANUP_ACTIVE" });
    });
    first.onDispose = reenter;
    try {
      f.device.releaseNativePostEffectView(f.scopeId, "main");
      expect(reenter).toHaveBeenCalledOnce();
      expect(f.device.disposed).toBe(false);
      expect(post.every(record => record.attempts === 1)).toBe(true);
      f.device.dispose();
      expect(post.every(record => record.attempts === 1)).toBe(true);
      expect(f.native.destroy).toHaveBeenCalledOnce();
    } finally {
      first.onDispose = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
  });

  it("does not abandon an afterimage retirement when disposal reenters history invalidation", async () => {
    const f = await fixture();
    f.afterimage();
    const history = track(f.targets.filter(target => target.label === "webgpu-afterimage-history"));
    const first = history[0]!, failure = new Error("invalidation target failed");
    let nested: unknown;
    first.failure = failure;
    first.onDispose = () => { nested = capture(() => f.device.dispose()); };
    try {
      const result = capture(() => f.device.executeWebGPUNativeEffects(f.output, [{ kind: "afterimage", decay: 0.5 }],
        { scopeId: f.scopeId, viewId: "main", frameId: 2, timeSeconds: 2, cameraCut: true }));
      expect(causes(result)).toContain(failure);
      expect(nested).toMatchObject({ code: "WEBGPU_POST_CLEANUP_ACTIVE" });
      expect(f.device.disposed).toBe(false);
      expect(first.target.disposed).toBe(false);
      first.failure = undefined;
      first.onDispose = undefined;
      f.device.dispose();
      expect(first.target.disposed).toBe(true);
      expect(first.attempts).toBe(2);
      expect(history[1]!.attempts).toBe(1);
    } finally {
      first.failure = undefined;
      first.onDispose = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
  });

  it("does not abandon exposure scratch when disposal reenters a resize retirement", async () => {
    const f = await fixture();
    f.exposure();
    const scratch = track(f.targets.filter(target => target.label === "webgpu-exposure-meter"));
    const first = scratch[0]!, failure = new Error("resize scratch failed");
    const resized = f.device.createRenderTarget({ width: 8, height: 4, format: "rgba16f", depth: false, label: "resized" });
    const output = f.device.createRenderTarget({ width: 8, height: 4, format: "rgba8", depth: false, label: "resized-output" });
    let nested: unknown;
    first.failure = failure;
    first.onDispose = () => { nested = capture(() => f.device.dispose()); };
    try {
      const result = capture(() => f.device.presentLdrPostprocess(resized, { outputTarget: output, autoExposure: {}, passes: [],
        postFrameContext: { scopeId: f.scopeId, viewId: "main", frameId: 2, timeSeconds: 2 } }));
      expect(causes(result)).toContain(failure);
      expect(nested).toMatchObject({ code: "WEBGPU_POST_CLEANUP_ACTIVE" });
      expect(f.device.disposed).toBe(false);
      first.failure = undefined;
      first.onDispose = undefined;
      f.device.dispose();
      expect(first.target.disposed).toBe(true);
      expect(first.attempts).toBe(2);
      expect(scratch.slice(1).every(record => record.attempts === 1)).toBe(true);
    } finally {
      first.failure = undefined;
      first.onDispose = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
  });

  it("preserves a presentation error when failed history retirement reenters disposal", async () => {
    const f = await fixture();
    const display = f.device.createRenderTarget({ width: 16, height: 8, format: "rgba8", depth: false, label: "display" });
    const present = (frameId: number) => f.device.presentLdrPostprocess(f.output, { outputTarget: display, passes: [],
      nativeEffects: [{ kind: "afterimage", decay: 0.5 }], postFrameContext: { scopeId: f.scopeId, viewId: "main", frameId, timeSeconds: frameId } });
    present(1);
    const history = track(f.targets.filter(target => target.label === "webgpu-afterimage-history"));
    const first = history[0]!, renderingFailure = new Error("original presentation failure"), cleanupFailure = new Error("history cleanup failure");
    let nested: unknown;
    first.failure = cleanupFailure;
    first.onDispose = () => { nested = capture(() => f.device.dispose()); };
    f.onSubmit(label => { if (label === "webgpu-post-present-encoder") throw renderingFailure; });
    try {
      expect(capture(() => present(2))).toBe(renderingFailure);
      expect(nested).toMatchObject({ code: "WEBGPU_POST_CLEANUP_ACTIVE" });
      expect(f.device.disposed).toBe(false);
      // The failed view remains owned, but abort must not retry it in this presentation.
      expect(first.attempts).toBe(1);
      expect(history[1]!.attempts).toBe(1);
      first.failure = undefined;
      first.onDispose = undefined;
      f.onSubmit();
      f.device.dispose();
      expect(first.target.disposed).toBe(true);
      expect(first.attempts).toBe(2);
      expect(history[1]!.attempts).toBe(1);
    } finally {
      first.failure = undefined;
      first.onDispose = undefined;
      f.onSubmit();
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
  });

  it("preserves the original submission error if post-uniform retirement also fails", async () => {
    const f = await fixture(true);
    const renderingFailure = new Error("original submission failure"), cleanupFailure = new Error("uniform cleanup failure");
    const internals = f.device as unknown as {
      webgpuPostRetiredUniformBuffers: WebGPUBufferLike[];
      retireNative(resource: WebGPUBufferLike & { label?: string }): void;
    };
    const retire = internals.retireNative.bind(f.device);
    let failRetirement = true;
    const retireSpy = vi.spyOn(internals, "retireNative").mockImplementation(resource => {
      if (failRetirement && resource.label === "webgpu-native-effect-0-afterimage-uniforms") throw cleanupFailure;
      retire(resource);
    });
    f.onSubmit(label => { if (label === "webgpu-native-effect-0-afterimage-encoder") throw renderingFailure; });
    try {
      expect(capture(() => f.afterimage())).toBe(renderingFailure);
      const uniform = f.buffers.find(buffer => buffer.label === "webgpu-native-effect-0-afterimage-uniforms")!;
      expect(internals.webgpuPostRetiredUniformBuffers).toContain(uniform);
      failRetirement = false;
      f.onSubmit();
      f.device.dispose();
      expect(retireSpy.mock.calls.filter(([resource]) => resource === uniform)).toHaveLength(2);
      expect(uniform.destroy).not.toHaveBeenCalled();
      f.finish();
      await flush();
      expect(uniform.destroy).toHaveBeenCalledOnce();
    } finally {
      failRetirement = false;
      f.onSubmit();
      capture(() => f.device.dispose());
      f.finish();
      await flush();
      retireSpy.mockRestore();
    }
  });

  it.each(["resolved", "rejected"] as const)("continues %s device-loss cleanup and retains failed post owners for disposal", async loss => {
    const f = await fixture(true);
    f.exposure();
    f.afterimage();
    const post = track(f.targets.filter(target => !target.disposed && (target.label.startsWith("webgpu-exposure-") || target.label === "webgpu-afterimage-history")));
    const exposure = post.find(record => record.target.label === "webgpu-exposure-meter")!;
    const history = post.find(record => record.target.label === "webgpu-afterimage-history")!;
    exposure.failure = new Error("exposure loss cleanup failed");
    history.failure = new Error("history loss cleanup failed");
    const liveResources = [...f.buffers, ...f.textures].filter(resource => resource.destroy.mock.calls.length === 0);
    const notified = vi.fn();
    f.device.onDeviceLost(notified);
    try {
      if (loss === "resolved") f.lose({ reason: "unknown", message: "original loss" });
      else f.rejectLoss(new Error("original rejection"));
      await flush();
      expect(f.device.contextLost).toBe(true);
      expect(notified).toHaveBeenCalledOnce();
      expect(f.device.getDiagnostics().lastError).toContain(loss === "resolved" ? "original loss" : "original rejection");
      expect(f.device.getDiagnostics().lastError).toContain("exposure loss cleanup failed");
      expect(f.device.getDiagnostics().lastError).toContain("history loss cleanup failed");
      expect(exposure.attempts).toBe(1);
      expect(history.attempts).toBe(1);
      expect((f.device as unknown as { webgpuPostRetiredUniformBuffers: unknown[] }).webgpuPostRetiredUniformBuffers).toHaveLength(0);
      if (loss === "rejected") expect(liveResources.filter(resource => resource.destroy.mock.calls.length !== 0).map(resource => resource.label)).toEqual([]);
      else expect(liveResources.filter(resource => resource.destroy.mock.calls.length !== 1).map(resource => resource.label)).toEqual([]);

      exposure.failure = undefined;
      history.failure = undefined;
      expect(() => f.device.dispose()).not.toThrow();
      expect(exposure.attempts).toBe(2);
      expect(history.attempts).toBe(2);
      expect(post.filter(record => record !== exposure && record !== history).every(record => record.attempts === 1)).toBe(true);
      expect(f.native.destroy).not.toHaveBeenCalled();
    } finally {
      exposure.failure = undefined;
      history.failure = undefined;
      capture(() => f.device.dispose());
      f.finish();
      await flush();
    }
    expect([...f.buffers, ...f.textures].every(resource => resource.destroy.mock.calls.length === 1)).toBe(true);
  });
});
