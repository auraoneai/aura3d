import { describe, expect, it } from "vitest";
import { MockRenderDevice, type RenderTarget, type RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import type { PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGPUAutoExposure, type WebGPUExposureDraw, type WebGPUExposureFrame } from "../../../packages/rendering/src/post/WebGPUAutoExposure";
import { acquireV2TargetLease, disposeNativePostEffects, releaseNativePostEffectScope, releaseNativePostEffectView,
  releaseV2Target, runV2HdrStages, runV2LdrTail, smaaTexturesSettled } from "../../../packages/rendering/src/post/v2Stages";

interface TrackedTarget extends RenderTarget {
  attempts: number;
  failDisposal: boolean;
  onDispose?: () => void;
}

function track(target: RenderTarget): TrackedTarget {
  const tracked = target as TrackedTarget;
  const dispose = target.dispose.bind(target);
  tracked.attempts = 0;
  tracked.failDisposal = false;
  tracked.dispose = () => {
    tracked.attempts += 1;
    tracked.onDispose?.();
    if (tracked.failDisposal) throw new Error(`failed to dispose ${tracked.label}`);
    dispose();
  };
  return tracked;
}

function glFixture() {
  const device = new MockRenderDevice();
  const create = device.createRenderTarget.bind(device);
  const targets: TrackedTarget[] = [];
  device.createRenderTarget = descriptor => {
    const target = track(Object.assign(create(descriptor), { framebuffer: {}, colorHandle: {}, depthTextureHandle: null }));
    targets.push(target);
    return target;
  };
  const deleted = new Map<object, number>();
  const failDelete = new Set<object>(), textures: object[] = [];
  const remove = (object: object): void => {
    deleted.set(object, (deleted.get(object) ?? 0) + 1);
    if (failDelete.has(object)) throw new Error("GL delete failed");
  };
  const methods: Record<string, (...args: any[]) => unknown> = {
    createVertexArray: () => ({}), createTexture: () => { const texture = {}; textures.push(texture); return texture; },
    createShader: () => ({}), createProgram: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true, getUniformLocation: (_program, name) => name,
    deleteProgram: remove, deleteVertexArray: remove, deleteTexture: remove
  };
  const gl = new Proxy(methods, { get(target, property: string) {
    if (property in target) return target[property];
    if (property === "TEXTURE0") return 100;
    return /^[A-Z][A-Z0-9_]*$/.test(property) ? 1 : () => undefined;
  } }) as unknown as WebGL2RenderingContext;
  const host = { gl, device, stateCache: { invalidate() {} }, resolveMultisampleTarget() {},
    lifecycle: { bindOutput() {} } } as unknown as WebGL2DeviceHost;
  return { device, host, targets, deleted, failDelete, textures };
}

function gpuFixture() {
  const targets: TrackedTarget[] = [], draws: WebGPUExposureDraw[] = [];
  const make = (descriptor: RenderTargetDescriptor): TrackedTarget => {
    const texture = { format: descriptor.format ?? "rgba8", disposed: false };
    const target = track({ width: descriptor.width, height: descriptor.height, label: descriptor.label ?? "source",
      sampleCount: 1, colorTexture: texture, disposed: false, dispose() {
        (this as { disposed: boolean }).disposed = true;
        texture.disposed = true;
      } } as unknown as RenderTarget);
    targets.push(target);
    return target;
  };
  const exposure = new WebGPUAutoExposure({ createTarget: make, draw(pass) { draws.push(pass); } });
  const source = (width = 5, format: "rgba16f" | "rgba32f" = "rgba16f") => make({ width, height: 3, format });
  return { exposure, source, targets, draws, make };
}

const frame = (scopeId: object, viewId: string, frameId = 1): WebGPUExposureFrame =>
  ({ scopeId, viewId, frameId, timeSeconds: frameId, deviceGeneration: 1 });

const pipeline = { antiAliasing: "off", autoExposure: {}, exposure: 1, toneMapping: "aces", dither: false } as PostPipelineOptions;

describe("native post owner retryable cleanup", () => {
  it("keeps failed WebGL histories for later host disposal without repeating independent releases", () => {
    const f = glFixture(), scope = {};
    const source = f.device.createRenderTarget({ width: 5, height: 3, format: "rgba16f" }) as TrackedTarget;
    const ldr = f.device.createRenderTarget({ width: 5, height: 3, format: "rgba8" }) as TrackedTarget;
    const context = { scopeId: scope, viewId: "main", frameId: 1, source: {}, items: [],
      sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 100, orthographic: false } } };
    const result = runV2HdrStages(f.host, source, pipeline, null, undefined, context, { deferExposureCommit: true });
    runV2LdrTail(f.host, ldr, { ...pipeline, nativeEffects: [{ kind: "afterimage", decay: .8 }] }, undefined, context);
    releaseV2Target(f.host, result.target);
    const effect = f.targets.filter(target => target.label === "post-afterimage-history");
    const exposure = f.targets.filter(target => target.label === "post.ev");
    expect(effect).toHaveLength(2);
    expect(exposure).toHaveLength(2);
    effect[0]!.failDisposal = true;
    exposure[0]!.failDisposal = true;
    let staleDuringCleanup = false;
    effect[0]!.onDispose = () => {
      try { result.exposureCompletion!.commit(); } catch { staleDuringCleanup = true; }
      disposeNativePostEffects(f.host);
    };

    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(() => result.exposureCompletion!.abort()).toThrow("POST_HISTORY_STALE_LEASE");
    expect([...effect, ...exposure].map(target => target.attempts)).toEqual([1, 1, 1, 1]);
    const deletions = [...f.deleted.values()];
    expect(deletions.length).toBeGreaterThan(0);
    expect(deletions.every(count => count === 1)).toBe(true);
    expect(source.disposed).toBe(false);
    expect(ldr.disposed).toBe(false);

    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(staleDuringCleanup).toBe(true);
    expect([...effect, ...exposure].map(target => target.attempts)).toEqual([2, 1, 2, 1]);
    effect[0]!.failDisposal = false;
    exposure[0]!.failDisposal = false;
    disposeNativePostEffects(f.host);
    disposeNativePostEffects(f.host);
    expect([...effect, ...exposure].map(target => target.attempts)).toEqual([3, 1, 3, 1]);
    expect([...f.deleted.values()]).toEqual(deletions);
    source.dispose(); ldr.dispose(); f.device.dispose();
  });

  it("retries failed WebGL histories by view and scope after the host state has retired", () => {
    const f = glFixture(), a = {}, b = {}, replacementScope = {};
    const source = f.device.createRenderTarget({ width: 5, height: 3, format: "rgba16f" }) as TrackedTarget;
    const context = (scopeId: object) => ({ scopeId, viewId: "main", frameId: 1, source: {}, items: [],
      sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 100, orthographic: false } } });
    const first = runV2HdrStages(f.host, source, pipeline, null, undefined, context(a), { deferExposureCommit: true });
    releaseV2Target(f.host, first.target);
    const aHistory = f.targets.filter(target => target.label === "post.ev");
    const second = runV2HdrStages(f.host, source, pipeline, null, undefined, context(b), { deferExposureCommit: true });
    releaseV2Target(f.host, second.target);
    const bHistory = f.targets.filter(target => target.label === "post.ev" && !aHistory.includes(target));
    aHistory[0]!.failDisposal = true;
    bHistory[0]!.failDisposal = true;
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(() => first.exposureCompletion!.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => second.exposureCompletion!.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    const replacement = runV2HdrStages(f.host, source, pipeline, null, undefined, context(replacementScope), { deferExposureCommit: true });
    releaseV2Target(f.host, replacement.target);
    const replacementHistory = f.targets.filter(target => target.label === "post.ev" && !aHistory.includes(target) && !bHistory.includes(target));
    replacement.exposureCompletion!.commit();

    aHistory[0]!.failDisposal = false;
    releaseNativePostEffectView(f.host, a, "main");
    expect(aHistory.map(target => target.attempts)).toEqual([2, 1]);
    expect(bHistory.map(target => target.attempts)).toEqual([1, 1]);
    bHistory[0]!.failDisposal = false;
    releaseNativePostEffectScope(f.host, b);
    expect(bHistory.map(target => target.attempts)).toEqual([2, 1]);
    expect(replacementHistory.map(target => target.attempts)).toEqual([0, 0]);
    replacement.exposureCompletion!.commit();
    disposeNativePostEffects(f.host);
    expect(() => replacement.exposureCompletion!.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(replacementHistory.map(target => target.attempts)).toEqual([1, 1]);
    expect(aHistory.map(target => target.attempts)).toEqual([2, 1]);
    expect(bHistory.map(target => target.attempts)).toEqual([2, 1]);
    source.dispose(); f.device.dispose();
  });

  it("defers a reentrant WebGL view reset until the current disposal attempt finishes", () => {
    const f = glFixture(), scope = {};
    const source = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba16f" }) as TrackedTarget;
    const ldr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" }) as TrackedTarget;
    const context = { scopeId: scope, viewId: "main", frameId: 1, source: {}, items: [],
      sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 100, orthographic: false } } };
    const result = runV2HdrStages(f.host, source, pipeline, null, undefined, context, { deferExposureCommit: true });
    releaseV2Target(f.host, result.target);
    runV2LdrTail(f.host, ldr, { ...pipeline, nativeEffects: [{ kind: "afterimage", decay: .8 }] }, undefined, context);
    const exposure = f.targets.filter(target => target.label === "post.ev");
    const effect = f.targets.filter(target => target.label === "post-afterimage-history");
    exposure[0]!.failDisposal = true;
    effect[0]!.onDispose = () => {
      try { releaseNativePostEffectView(f.host, scope, "main"); } catch { /* Outer cleanup reports the failure. */ }
    };
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(exposure.map(target => target.attempts)).toEqual([1, 1]);
    expect(effect.map(target => target.attempts)).toEqual([1, 1]);
    exposure[0]!.failDisposal = false;
    disposeNativePostEffects(f.host);
    expect(exposure.map(target => target.attempts)).toEqual([2, 1]);
    source.dispose(); ldr.dispose(); f.device.dispose();
  });

  it("retries a failed WebGL object deletion without repeating successful sibling deletions", () => {
    const f = glFixture();
    const lease = acquireV2TargetLease(f.host, { width: 4, height: 4, format: "rgba8" });
    const failedTexture = f.textures[0]!;
    f.failDelete.add(failedTexture);
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    lease.release();
    const otherObjects = [...f.deleted.keys()].filter(object => object !== failedTexture);
    expect(otherObjects.length).toBeGreaterThan(0);
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(f.deleted.get(failedTexture)).toBe(2);
    expect(otherObjects.every(object => f.deleted.get(object) === 1)).toBe(true);
    f.failDelete.delete(failedTexture);
    disposeNativePostEffects(f.host);
    disposeNativePostEffects(f.host);
    expect(f.deleted.get(failedTexture)).toBe(3);
    expect(otherObjects.every(object => f.deleted.get(object) === 1)).toBe(true);
    f.device.dispose();
  });

  it("retries an individual failed LUT deletion without deleting successful LUTs again", () => {
    const f = glFixture();
    const ldr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" }) as TrackedTarget;
    const data = { size: 2, data: new Float32Array(32) };
    runV2LdrTail(f.host, ldr, { ...pipeline, lut: { source: "first", data } }, undefined);
    runV2LdrTail(f.host, ldr, { ...pipeline, lut: { source: "second", data } }, undefined);
    const first = f.textures[2]!, second = f.textures[3]!;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    f.failDelete.add(second);
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(f.deleted.get(first)).toBe(1);
    expect(f.deleted.get(second)).toBe(1);
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    expect(f.deleted.get(first)).toBe(1);
    expect(f.deleted.get(second)).toBe(2);
    f.failDelete.delete(second);
    disposeNativePostEffects(f.host);
    disposeNativePostEffects(f.host);
    expect(f.deleted.get(first)).toBe(1);
    expect(f.deleted.get(second)).toBe(3);
    ldr.dispose(); f.device.dispose();
  });

  it("does not resurrect an asynchronously loaded WebGL texture after failed host cleanup", async () => {
    const f = glFixture();
    const ldr = f.device.createRenderTarget({ width: 4, height: 4, format: "rgba8" }) as TrackedTarget;
    runV2LdrTail(f.host, ldr, { ...pipeline, antiAliasing: "smaa" }, undefined);
    const texturesBeforeCleanup = f.textures.length;
    f.failDelete.add(f.textures[0]!);
    expect(() => disposeNativePostEffects(f.host)).toThrow(AggregateError);
    await smaaTexturesSettled();
    expect(f.textures).toHaveLength(texturesBeforeCleanup);
    f.failDelete.clear();
    disposeNativePostEffects(f.host);
    ldr.dispose(); f.device.dispose();
  });

  it("invalidates all WebGPU leases before cleanup and retries only failed resources on disposal", () => {
    const f = gpuFixture(), a = {}, b = {}, source = f.source();
    const first = f.exposure.execute(source, {}, frame(a, "left"));
    const aTargets = f.targets.filter(target => target !== source);
    const second = f.exposure.execute(source, {}, frame(b, "right"));
    const bTargets = f.targets.filter(target => target !== source && !aTargets.includes(target));
    const scratch = aTargets.find(target => target.label === "webgpu-exposure-meter")!;
    const history = aTargets.find(target => target.label === "webgpu-exposure-history")!;
    scratch.failDisposal = true;
    history.failDisposal = true;
    let staleDuringCleanup = false;
    scratch.onDispose = () => {
      try { second.commit(); } catch { staleDuringCleanup = true; }
      f.exposure.dispose();
    };

    expect(() => f.exposure.dispose()).toThrow(AggregateError);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => second.abort()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => f.exposure.execute(source, {}, frame(a, "left", 2))).toThrow("disposed");
    expect([...aTargets, ...bTargets].every(target => target.attempts === 1)).toBe(true);
    expect(source.attempts).toBe(0);

    expect(() => f.exposure.dispose()).toThrow(AggregateError);
    expect(staleDuringCleanup).toBe(true);
    expect(scratch.attempts).toBe(2);
    expect(history.attempts).toBe(2);
    expect([...aTargets, ...bTargets].filter(target => target !== scratch && target !== history).every(target => target.attempts === 1)).toBe(true);
    scratch.failDisposal = false;
    history.failDisposal = false;
    f.exposure.dispose();
    f.exposure.dispose();
    expect(scratch.attempts).toBe(3);
    expect(history.attempts).toBe(3);
  });

  it("retries a removed WebGPU view without releasing another view or scope", () => {
    const f = gpuFixture(), a = {}, b = {}, source = f.source();
    const left = f.exposure.execute(source, {}, frame(a, "left"));
    const leftTargets = f.targets.filter(target => target !== source);
    const right = f.exposure.execute(source, {}, frame(a, "right"));
    const rightTargets = f.targets.filter(target => target !== source && !leftTargets.includes(target));
    const other = f.exposure.execute(source, {}, frame(b, "left"));
    const otherTargets = f.targets.filter(target => target !== source && !leftTargets.includes(target) && !rightTargets.includes(target));
    const scratch = leftTargets.find(target => target.label === "webgpu-exposure-output")!;
    const history = leftTargets.find(target => target.label === "webgpu-exposure-history")!;
    scratch.failDisposal = true;
    history.failDisposal = true;
    expect(() => f.exposure.resetView(a, "left")).toThrow(AggregateError);
    expect(() => left.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    right.commit(); other.commit();
    expect(leftTargets.every(target => target.attempts === 1)).toBe(true);
    expect([...rightTargets, ...otherTargets].every(target => target.attempts === 0)).toBe(true);

    f.exposure.resetScope(b);
    expect(scratch.attempts).toBe(1);
    expect(history.attempts).toBe(1);
    expect(rightTargets.every(target => target.attempts === 0)).toBe(true);
    expect(() => f.exposure.resetView(a, "left")).toThrow(AggregateError);
    expect(scratch.attempts).toBe(2);
    expect(history.attempts).toBe(2);
    scratch.failDisposal = false;
    history.failDisposal = false;
    f.exposure.resetView(a, "left");
    f.exposure.resetView(a, "left");
    expect(scratch.attempts).toBe(3);
    expect(history.attempts).toBe(3);
    expect(leftTargets.filter(target => target !== scratch && target !== history).every(target => target.attempts === 1)).toBe(true);
    right.commit();
    f.exposure.dispose();
  });

  it("retains partially allocated scratch when allocation and rollback both fail", () => {
    const f = gpuFixture(), source = f.source(), scope = {};
    const allocationError = new Error("scratch allocation failed");
    let calls = 0;
    let allocated: TrackedTarget | undefined;
    const exposure = new WebGPUAutoExposure({
      createTarget(descriptor) {
        if (++calls === 2) throw allocationError;
        allocated = f.make(descriptor);
        allocated.failDisposal = true;
        return allocated;
      },
      draw() {}
    });
    let caught: unknown;
    try { exposure.execute(source, {}, frame(scope, "left")); } catch (error) { caught = error; }
    expect(caught).toBe(allocationError);
    expect(allocated!.attempts).toBe(1);
    expect(() => exposure.resetView(scope, "left")).toThrow(AggregateError);
    expect(allocated!.attempts).toBe(2);
    allocated!.failDisposal = false;
    exposure.resetScope(scope);
    exposure.dispose();
    expect(allocated!.attempts).toBe(3);
    expect(source.attempts).toBe(0);
  });

  it("keeps an allocation that reenters disposal retired until its release succeeds", () => {
    const f = gpuFixture(), source = f.source(), scope = {};
    let allocated: TrackedTarget | undefined;
    let exposure: WebGPUAutoExposure;
    exposure = new WebGPUAutoExposure({
      createTarget(descriptor) {
        allocated = f.make(descriptor);
        allocated.failDisposal = true;
        exposure.dispose();
        return allocated;
      },
      draw() {}
    });
    expect(() => exposure.execute(source, {}, frame(scope, "left"))).toThrow("disposed");
    expect(allocated!.attempts).toBe(1);
    expect(() => exposure.dispose()).toThrow(AggregateError);
    expect(allocated!.attempts).toBe(2);
    allocated!.failDisposal = false;
    exposure.dispose();
    exposure.dispose();
    expect(allocated!.attempts).toBe(3);
    expect(source.attempts).toBe(0);
  });

  it("does not resurrect a view reset during replacement allocation", () => {
    const f = gpuFixture(), source = f.source(), scope = {}, otherScope = {};
    let resetOnCreate = false;
    let exposure: WebGPUAutoExposure;
    exposure = new WebGPUAutoExposure({
      createTarget(descriptor) {
        const target = f.make(descriptor);
        if (resetOnCreate) {
          resetOnCreate = false;
          exposure.resetView(scope, "left");
        }
        return target;
      },
      draw() {}
    });
    const first = exposure.execute(source, {}, frame(scope, "left"));
    const firstTargets = f.targets.filter(target => target !== source);
    const other = exposure.execute(source, {}, frame(otherScope, "left"));
    const otherTargets = f.targets.filter(target => target !== source && !firstTargets.includes(target));
    const resized = f.source(9);
    resetOnCreate = true;
    expect(() => exposure.execute(resized, {}, frame(scope, "left", 2))).toThrow("invalidated");
    const partial = f.targets.filter(target =>
      target !== source && target !== resized && !firstTargets.includes(target) && !otherTargets.includes(target));
    expect(partial).toHaveLength(1);
    expect(partial[0]!.attempts).toBe(1);
    expect(firstTargets.every(target => target.attempts === 1)).toBe(true);
    expect(otherTargets.every(target => target.attempts === 0)).toBe(true);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    other.commit();
    exposure.dispose();
  });

  it.each(["view", "scope"] as const)("does not resurrect an initially empty %s reset during allocation", reset => {
    const f = gpuFixture(), source = f.source(), scope = {};
    let allocated: TrackedTarget | undefined;
    let exposure: WebGPUAutoExposure;
    exposure = new WebGPUAutoExposure({
      createTarget(descriptor) {
        allocated = f.make(descriptor);
        allocated.failDisposal = true;
        if (reset === "view") exposure.resetView(scope, "left");
        else exposure.resetScope(scope);
        return allocated;
      },
      draw() {}
    });
    expect(() => exposure.execute(source, {}, frame(scope, "left"))).toThrow("invalidated");
    expect(allocated!.attempts).toBe(1);
    expect(() => exposure.resetView(scope, "left")).toThrow(AggregateError);
    expect(allocated!.attempts).toBe(2);
    allocated!.failDisposal = false;
    exposure.resetScope(scope);
    exposure.dispose();
    expect(allocated!.attempts).toBe(3);
  });

  it("retires resized scratch and history independently when both fail", () => {
    const f = gpuFixture(), scope = {}, otherScope = {}, source = f.source();
    const old = f.exposure.execute(source, {}, frame(scope, "left"));
    const oldTargets = f.targets.filter(target => target !== source);
    const other = f.exposure.execute(source, {}, frame(otherScope, "left"));
    const otherTargets = f.targets.filter(target => target !== source && !oldTargets.includes(target));
    const oldScratch = oldTargets.find(target => target.label === "webgpu-exposure-meter")!;
    const oldHistory = oldTargets.find(target => target.label === "webgpu-exposure-history")!;
    oldScratch.failDisposal = true;
    oldHistory.failDisposal = true;
    const resized = f.source(9);
    expect(() => f.exposure.execute(resized, {}, frame(scope, "left", 2))).toThrow(AggregateError);
    expect(() => old.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(oldTargets.every(target => target.attempts === 1)).toBe(true);
    expect(otherTargets.every(target => target.attempts === 0)).toBe(true);
    other.commit();

    oldScratch.failDisposal = false;
    oldHistory.failDisposal = false;
    f.exposure.resetView(scope, "left");
    expect(oldScratch.attempts).toBe(2);
    expect(oldHistory.attempts).toBe(2);
    expect(oldTargets.filter(target => target !== oldScratch && target !== oldHistory).every(target => target.attempts === 1)).toBe(true);
    expect(otherTargets.every(target => target.attempts === 0)).toBe(true);
    other.commit();
    f.exposure.dispose();
  });

  it("continues valid exposure history when only the source HDR format changes", () => {
    const f = gpuFixture(), scope = {}, firstSource = f.source();
    const first = f.exposure.execute(firstSource, {}, frame(scope, "left"));
    first.commit();
    const nextSource = f.source(5, "rgba32f");
    const next = f.exposure.execute(nextSource, {}, frame(scope, "left", 2));
    const adapt = f.draws.filter(draw => draw.entryPoint === "fs_exposure_adapt").at(-1)!;
    expect(new DataView(adapt.uniforms.buffer, adapt.uniforms.byteOffset).getUint32(24, true)).toBe(1);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    next.commit();
    f.exposure.dispose();
  });

  it("does not retry a failed history twice when a view reset reenters full disposal", () => {
    const f = gpuFixture(), scope = {}, otherScope = {}, source = f.source();
    const first = f.exposure.execute(source, {}, frame(scope, "left"));
    const oldTargets = f.targets.filter(target => target !== source);
    const other = f.exposure.execute(source, {}, frame(otherScope, "left"));
    const history = oldTargets.find(target => target.label === "webgpu-exposure-history")!;
    const scratch = oldTargets.find(target => target.label === "webgpu-exposure-output")!;
    history.failDisposal = true;
    scratch.onDispose = () => {
      try { f.exposure.dispose(); } catch { /* The outer reset must retain and report the failure. */ }
    };
    expect(() => f.exposure.resetView(scope, "left")).toThrow(AggregateError);
    expect(history.attempts).toBe(1);
    expect(() => first.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    expect(() => other.commit()).toThrow("POST_HISTORY_STALE_LEASE");
    history.failDisposal = false;
    f.exposure.dispose();
    f.exposure.dispose();
    expect(history.attempts).toBe(2);
  });
});
