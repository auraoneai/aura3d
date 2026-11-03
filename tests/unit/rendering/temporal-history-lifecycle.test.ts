import { Renderer } from "../../../packages/rendering/src/Renderer";
import { temporalAccumulationWeight } from "../../../packages/rendering/src/webgpu/WebGPUTemporal";
import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd03";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { rendererQrFlags, setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { identityMat4 } from "@aura3d/scene";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, RenderDeviceError } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory, assertExpectedPreviousDepthBindingsCurrent } from "../../../packages/rendering/src/TemporalHistory";
import { createRendererPostprocessPlanDiagnostics } from "../../../packages/rendering/src/RendererPostprocessPlan";
import { consumeTaaHistoryWritten, markPostV2Presented, markTaaHistoryWritten } from "../../../packages/rendering/src/renderer/postSkipped";
import { applyRendererOwnedStaticBatching, batchPlanCacheFor } from "../../../packages/rendering/src/renderer/CullingBatching";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import type { RendererInput, RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import { bindVelocityUniforms } from "../../../packages/rendering/src/forward/Velocity";
import { bindPrd07RendererAuthority } from "../../../packages/rendering/src/vfx/Prd07RendererBridge";
import { fakeWebGLCanvas } from "./static-unlit-fake-webgl";

function fixture() {
  const device = new MockRenderDevice();
  const owner = new TemporalHistory();
  const item = { geometry: Geometry.triangle(), label: "rigid", modelMatrix: identityMat4() };
  const prepare = (options = {}, width = 16) => { device.beginFrame(width, 16); try { return owner.prepare(device, width, 16, [item], identityMat4(), options); } finally { device.endFrame(); } };
  return { device, owner, item, prepare };
}

async function rendererTemporalFixture(v2 = true) {
  const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8,
    qrFlags: createTrustedQrFlags({ A3D_QR_POST: v2 }) });
  const owner = (renderer as unknown as { temporalHistory: TemporalHistory }).temporalHistory;
  renderer.device.presentLdrPostprocess = () => undefined;
  const post = (options: RendererPostProcessOptions) => {
    const frame = options.postFrameContext!;
    markTaaHistoryWritten(frame.scopeId, frame.viewId, frame.frameId);
    markPostV2Presented(frame.scopeId, frame.viewId, frame.frameId);
  };
  const internals = renderer as unknown as {
    executePostprocess(options: RendererPostProcessOptions): void;
    executePostprocessAsync(options: RendererPostProcessOptions): Promise<void>;
    finishTemporalFrame(frameId?: number): boolean;
    cancelTemporalFrame(frameId?: number): boolean;
    compositeViews(...args: unknown[]): void;
  };
  vi.spyOn(internals, "executePostprocess").mockImplementation(post);
  vi.spyOn(internals, "executePostprocessAsync").mockImplementation(async options => post(options));
  const geometry = Geometry.triangle();
  const object = {};
  const item = { geometry, temporalObjectKey: object, label: "frame-object", modelMatrix: identityMat4() };
  const source = { renderItems: [item], cameraPolicy: "identity" as const,
    postprocess: { execution: "auto" as const, toneMapping: { operator: "linear" as const },
      temporal: { sceneKey: "frame" }, taa: { blend: .9 } } };
  const render = async (input: RendererInput, asynchronous: boolean) => {
    if (asynchronous) await renderer.renderAsync(input);
    else renderer.render(input);
  };
  return { renderer, owner, internals, geometry, item, source, render,
    dispose: () => { renderer.dispose(); geometry.dispose(); } };
}

describe("renderer temporal ownership", () => {
  it.each([false, true])("commits a genuine expected-depth proof before restoring another renderer's flags (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const device = f.renderer.device as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const ownedFlags = rendererQrFlags(device);
    const otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
    const owner = {}, canvas = {}, overlay = {};
    const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
      wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
    const unbind = bindPrd07RendererAuthority(f.renderer, device, owner, canvas, {
      owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot,
      onRevoke: () => () => {}
    });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    const secondItem = { ...f.item, temporalObjectKey: {}, modelMatrix: identityMat4() };
    secondItem.modelMatrix[12] = 10;
    const prepare = vi.spyOn(f.owner, "prepare"), commit = vi.spyOn(f.owner, "commit");
    setRendererQrFlags(otherFlags, device);
    try {
      await f.render({ source }, asynchronous);
      expect(commit).toHaveBeenCalledOnce();
      expect(rendererQrFlags(device)).toBe(otherFlags);
      await f.render({ source }, asynchronous);
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(true);
      expect(prepare.mock.results.at(-1)!.value.history).toBe(prepare.mock.results[0]!.value.historyOutput);
      expect(rendererQrFlags(device)).toBe(otherFlags);
      expect(ownedFlags).not.toBe(otherFlags);
      // The renderer's private binding survives its own restoration, including
      // multiple device passes, but never authorizes a post-frame draw.
      await f.render({ source, frameId: 17 }, asynchronous);
      const firstPass = prepare.mock.results.at(-1)!.value;
      expect(() => assertExpectedPreviousDepthBindingsCurrent(firstPass, device, 8, 8)).toThrow(/stale/i);
      source.renderItems = [secondItem];
      await f.render({ source, frameId: 17 }, asynchronous);
      const secondPass = prepare.mock.results.at(-1)!.value;
      expect(secondPass).not.toBe(firstPass);
      expect(secondPass.history).toBe(firstPass.history);
      expect(secondPass.historyOutput).toBe(firstPass.historyOutput);
      expect(() => assertExpectedPreviousDepthBindingsCurrent(secondPass, device, 8, 8)).toThrow(/stale/i);
      expect(f.internals.finishTemporalFrame(17)).toBe(true);
      f.item.modelMatrix[12] = 2;
      secondItem.modelMatrix[12] = 20;
      source.renderItems = [f.item, secondItem];
      await f.render({ source, frameId: 18 }, asynchronous);
      const next = prepare.mock.results.at(-1)!.value;
      expect(next.history).toBe(secondPass.historyOutput);
      const previousModel = (index: number) => {
        const uniforms = new Map();
        bindVelocityUniforms!(next.renderItems[index]!, uniforms);
        return (uniforms.get("u_previousModel") as Float32Array)[12];
      };
      expect([previousModel(0), previousModel(1)]).toEqual([0, 10]);
      expect(f.internals.finishTemporalFrame(18)).toBe(true);
      expect(rendererQrFlags(device)).toBe(otherFlags);
    } finally { unbind(); velocity.dispose(); f.dispose(); }
  });

  it.each([false, true])("does not let an untrusted caller consume a scoped renderer proof (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const device = f.renderer.device as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
    const owner = {}, canvas = {}, overlay = {};
    const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
      wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
    const unbind = bindPrd07RendererAuthority(f.renderer, device, owner, canvas, {
      owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot, onRevoke: () => () => {}
    });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    setRendererQrFlags(otherFlags, device);
    try {
      await f.render({ source, frameId: 41 }, asynchronous);
      expect(() => f.owner.commit("single", 41)).toThrow(/stale|unverified/i);
      expect(f.internals.finishTemporalFrame(41)).toBe(true);
    } finally { unbind(); velocity.dispose(); f.dispose(); }
  });

  it.each([false, true].flatMap(asynchronous =>
    (["flags", "input-write", "output-write", "texture-revision", "device-frame", "generation", "loss"] as const)
      .map(change => [asynchronous, change] as const)))(
    "revokes a pending scoped proof after %s/%s", async (asynchronous, change) => {
      const f = await rendererTemporalFixture();
      const device = f.renderer.device as MockRenderDevice & { generation: number };
      Object.defineProperty(device, "generation", { value: 1, writable: true });
      const otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
      const owner = {}, canvas = {}, overlay = {};
      const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
        wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
      const unbind = bindPrd07RendererAuthority(f.renderer, device, owner, canvas, {
        owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot, onRevoke: () => () => {}
      });
      const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
      const source = { ...f.source, postprocess: { ...f.source.postprocess,
        temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
      const prepare = vi.spyOn(f.owner, "prepare");
      setRendererQrFlags(otherFlags, device);
      try {
        await f.render({ source, frameId: 42 }, asynchronous);
        const bindings = prepare.mock.results.at(-1)!.value;
        if (change === "flags") {
          setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
          setRendererQrFlags(otherFlags, device);
        } else if (change === "input-write") device.writeRenderTargetPixels(velocity, new Uint8Array(8 * 8 * 4));
        else if (change === "output-write") device.writeRenderTargetPixels(bindings.historyOutput, new Uint8Array(8 * 8 * 4));
        else if (change === "texture-revision") velocity.colorTexture.markNeedsUpdate();
        else if (change === "device-frame") { device.beginFrame(8, 8); device.endFrame(); }
        else if (change === "generation") device.generation++;
        else device.contextLost = true;
        expect(() => f.internals.finishTemporalFrame(42)).toThrow(/stale|cancelled|unverified/i);
      } finally { device.contextLost = false; unbind(); velocity.dispose(); f.dispose(); }
    }
  );

  it.each([false, true])("rejects a competing renderer on the same device before scoped proof completion (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const device = f.renderer.device as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
    const shaderLibrary = (f.renderer as unknown as { shaderLibrary: ConstructorParameters<typeof Renderer>[1]["shaderLibrary"] }).shaderLibrary;
    const competitor = new Renderer(device, { width: 8, height: 8, shaderLibrary, qrFlags: otherFlags }, new TemporalHistory());
    const owner = {}, canvas = {}, overlay = {};
    const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
      wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
    const unbind = bindPrd07RendererAuthority(f.renderer, device, owner, canvas, {
      owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot, onRevoke: () => () => {}
    });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    try {
      await f.render({ source, frameId: 43 }, asynchronous);
      competitor.render({ renderItems: [], cameraPolicy: "identity" });
      expect(() => f.internals.finishTemporalFrame(43)).toThrow(/stale|unverified/i);
    } finally { unbind(); competitor.dispose(); velocity.dispose(); f.dispose(); }
  });

  it.each([false, true].flatMap(asynchronous => (["write", "output-write", "nested"] as const).map(change => [asynchronous, change] as const)))(
    "rejects a %s/%s operation after preparation even if its error is caught", async (asynchronous, change) => {
      const f = await rendererTemporalFixture();
      const device = f.renderer.device as MockRenderDevice & { generation: number };
      Object.defineProperty(device, "generation", { value: 1, writable: true });
      const otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
      const shaderLibrary = (f.renderer as unknown as { shaderLibrary: ConstructorParameters<typeof Renderer>[1]["shaderLibrary"] }).shaderLibrary;
      const competitor = new Renderer(device, { width: 8, height: 8, shaderLibrary, qrFlags: otherFlags }, new TemporalHistory());
      const owner = {}, canvas = {}, overlay = {};
      const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
        wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
      const unbind = bindPrd07RendererAuthority(f.renderer, device, owner, canvas, {
        owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot, onRevoke: () => () => {}
      });
      const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
      const source = { ...f.source, postprocess: { ...f.source.postprocess,
        temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
      const prepare = vi.spyOn(f.owner, "prepare");
      const unregister = registerFrameContributor({ id: `prd03.depth-live-${change}`, owner: "prd03",
        flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
          name: `depth-live-${change}`, reads: [], writes: [], execute: () => {
            if (change === "write") device.writeRenderTargetPixels(velocity, new Uint8Array(8 * 8 * 4));
            else if (change === "output-write") device.writeRenderTargetPixels(prepare.mock.results.at(-1)!.value.historyOutput, new Uint8Array(8 * 8 * 4));
            else expect(() => competitor.render({ renderItems: [], cameraPolicy: "identity" })).toThrow(/busy/i);
          }
        }] });
      try {
        await expect(f.render({ source, frameId: 44 }, asynchronous)).rejects.toThrow(/stale|cancelled|unverified/i);
        expect(device.activeFrameToken).toBeNull();
      } finally { unregister(); unbind(); competitor.dispose(); velocity.dispose(); f.dispose(); }
    }
  );

  it("rejects an async target transfer started before a synchronous expected-depth capture", async () => {
    const f = await rendererTemporalFixture();
    const device = f.renderer.device as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const input = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    try {
      const copy = device.copyRenderTarget({ source: input, destination: velocity });
      expect(() => f.renderer.render({ source, frameId: 50 })).toThrow(/expected previous depth/i);
      await copy;
      f.renderer.render({ source, frameId: 51 });
      const laterCopy = device.copyRenderTarget({ source: input, destination: velocity });
      await laterCopy;
      expect(() => f.internals.finishTemporalFrame(51)).toThrow(/stale|unverified/i);
    } finally { input.dispose(); velocity.dispose(); f.dispose(); }
  });

  it.each(["copyRenderTarget", "resolveRenderTarget"] as const)(
    "fails closed and recovers when the retained %s wrapper is removed", async method => {
      const f = await rendererTemporalFixture();
      const device = f.renderer.device as MockRenderDevice & { generation: number };
      Object.defineProperty(device, "generation", { value: 1, writable: true });
      const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
      const source = { ...f.source, postprocess: { ...f.source.postprocess,
        temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
      const descriptor = Object.getOwnPropertyDescriptor(device, method)!;
      const prepare = vi.spyOn(f.owner, "prepare");
      try {
        expect(descriptor?.value).toEqual(expect.any(Function));
        expect(Reflect.deleteProperty(device, method)).toBe(true);
        let failure: unknown;
        try { f.renderer.render({ source, frameId: 52 }); } catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(RenderDeviceError);
        expect(failure).toMatchObject({ code: "TEMPORAL_EXPECTED_DEPTH_INVALID" });
        expect(device.activeFrameToken).toBeNull();

        Object.defineProperty(device, method, descriptor);
        f.renderer.render({ source, frameId: 53 });
        expect(f.internals.finishTemporalFrame(53)).toBe(true);
        f.renderer.render({ source, frameId: 54 });
        expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(true);
        expect(f.internals.finishTemporalFrame(54)).toBe(true);
      } finally {
        if (descriptor) Object.defineProperty(device, method, descriptor);
        velocity.dispose();
        f.dispose();
      }
      expect(Object.getOwnPropertyDescriptor(device, method)).toBeUndefined();
    }
  );

  it("waits for the built-in device transfer checkpoint when adopting an already-used device", async () => {
    const f = await rendererTemporalFixture();
    const device = new MockRenderDevice() as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const input = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const copy = device.copyRenderTarget({ source: input, destination: velocity });
    const shaderLibrary = (f.renderer as unknown as { shaderLibrary: ConstructorParameters<typeof Renderer>[1]["shaderLibrary"] }).shaderLibrary;
    const renderer = new Renderer(device, { width: 8, height: 8, shaderLibrary, qrFlags: createTrustedQrFlags({ A3D_QR_POST: true }) }, new TemporalHistory());
    renderer.device.presentLdrPostprocess = () => undefined;
    const internals = renderer as unknown as { executePostprocess(options: RendererPostProcessOptions): void };
    vi.spyOn(internals, "executePostprocess").mockImplementation(options => {
      const frame = options.postFrameContext!;
      markTaaHistoryWritten(frame.scopeId, frame.viewId, frame.frameId);
      markPostV2Presented(frame.scopeId, frame.viewId, frame.frameId);
    });
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    try {
      expect(() => renderer.render({ source, frameId: 60 })).toThrow(/expected previous depth/i);
      await copy;
      renderer.render({ source, frameId: 61 });
      expect(renderer.finishTemporalFrame(61)).toBe(true);
    } finally { renderer.dispose(); input.dispose(); velocity.dispose(); f.dispose(); }
  });

  it("runs scoped expected-depth completion through the built-in WebGL2 post route", async () => {
    const fake = fakeWebGLCanvas();
    const ownedFlags = createTrustedQrFlags({ A3D_QR_POST: true });
    const renderer = await Renderer.create({ backend: "webgl2", canvas: fake.canvas, width: 8, height: 8, qrFlags: ownedFlags });
    const device = renderer.device;
    const history = (renderer as unknown as { temporalHistory: TemporalHistory }).temporalHistory;
    const prepare = vi.spyOn(history, "prepare");
    const otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
    const owner = {}, canvas = {}, overlay = {};
    const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
      wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
    const unbind = bindPrd07RendererAuthority(renderer, device, owner, canvas, {
      owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot, onRevoke: () => () => {}
    });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const source = { renderItems: [], cameraPolicy: "identity" as const, postprocess: {
      v2: true, pipeline: { antiAliasing: "taa" as const, depthRange: { near: .1, far: 100, projection: "perspective" as const },
        exposure: 1, toneMapping: "aces" as const, dither: false },
      toneMapping: { operator: "aces" as const }, taa: { blend: .9 },
      temporal: { sceneKey: "native", velocity, expectedPreviousDepth: "velocity-alpha" as const }
    } };
    const camera = { viewMatrix: identityMat4(), projectionMatrix: identityMat4(), viewProjectionMatrix: identityMat4() };
    setRendererQrFlags(otherFlags, device);
    try {
      await renderer.renderAsync({ source, camera, frameId: 70 });
      await renderer.renderAsync({ source, camera, frameId: 70 });
      expect(renderer.finishTemporalFrame(70)).toBe(true);
      await renderer.renderAsync({ source, camera, frameId: 71 });
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(true);
      expect(renderer.finishTemporalFrame(71)).toBe(true);
      expect(rendererQrFlags(device)).toBe(otherFlags);
    } finally { unbind(); velocity.dispose(); renderer.dispose(); }
  });

  it.each(["flags", "generation"] as const)("never promotes a proof when the actual %s changes during the frame", async change => {
    const f = await rendererTemporalFixture();
    const device = f.renderer.device as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true });
    const ownedFlags = rendererQrFlags(device), otherFlags = createTrustedQrFlags({ A3D_QR_POST: false });
    const owner = {}, canvas = {}, overlay = {};
    const snapshot = { fog: null, fogVolumes: [], skyForFog: null,
      wetness: { wetness: 0, puddleThreshold: 0, rainRipples: 0, snowCover: 0, puddleNoise: null } };
    const unbind = bindPrd07RendererAuthority(f.renderer, device, owner, canvas, {
      owner, canvas, overlay, isLive: () => true, capture: () => snapshot, isCurrent: value => value === snapshot,
      onRevoke: () => () => {}
    });
    const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { ...f.source.postprocess.temporal, velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    const commit = vi.spyOn(f.owner, "commit");
    const unregister = registerFrameContributor({ id: `prd03.expected-depth-${change}`, owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: `expected-depth-${change}`, reads: [], writes: [], execute: () => {
          if (change === "generation") device.generation++;
          else { setRendererQrFlags(otherFlags, device); setRendererQrFlags(ownedFlags, device); }
        }
      }] });
    setRendererQrFlags(otherFlags, device);
    try {
      await expect(f.render({ source }, false)).rejects.toThrow(/stale|cancelled|revoked/i);
      expect(commit).not.toHaveBeenCalled();
      expect(device.activeFrameToken).toBeNull();
      expect(rendererQrFlags(device)).toBe(otherFlags);
    } finally { unregister(); unbind(); velocity.dispose(); f.dispose(); }
  });

  it.each([false, true])("preserves actual flag replacement when no temporary binding is present (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const replacement = createTrustedQrFlags({ A3D_QR_POST: false });
    const unregister = registerFrameContributor({ id: "prd03.flag-change-persistence", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "flag-change-persistence", reads: [], writes: [], execute: () => setRendererQrFlags(replacement, f.renderer.device)
      }] });
    try {
      await f.render({ source: f.source }, asynchronous);
      expect(rendererQrFlags(f.renderer.device)).toBe(replacement);
    } finally { unregister(); f.dispose(); }
  });

  it.each([false, true])("commits an implicit frame only after after-output and device completion (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const events: string[] = [];
    const commit = vi.spyOn(f.owner, "commit").mockImplementation(function (this: TemporalHistory, ...args) {
      events.push("commit");
      return TemporalHistory.prototype.commit.apply(this, args);
    });
    const end = f.renderer.device.endFrame.bind(f.renderer.device);
    vi.spyOn(f.renderer.device, "endFrame").mockImplementation(() => { events.push("end"); end(); });
    const unregister = registerFrameContributor({ id: "prd03.temporal-frame-boundary", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "temporal-after-output", reads: [], writes: [], execute: () => { events.push("after-output"); expect(commit).not.toHaveBeenCalled(); }
      }] });
    try {
      await f.render({ source: f.source }, asynchronous);
      expect(events).toEqual(["after-output", "end", "commit"]);
      expect(commit).toHaveBeenCalledOnce();
    } finally { unregister(); f.dispose(); }
  });

  it.each([false, true])("finishes repeated explicit passes once and preserves their frame-start history (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit");
    const prepare = vi.spyOn(f.owner, "prepare");
    try {
      await f.render({ source: f.source, frameId: 10 }, asynchronous);
      await f.render({ source: f.source, frameId: 10 }, asynchronous);
      expect(commit).not.toHaveBeenCalled();
      expect(prepare.mock.results[0]!.value).toBe(prepare.mock.results[1]!.value);
      expect(f.internals.finishTemporalFrame(10)).toBe(true);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(f.internals.finishTemporalFrame(10)).toBe(false);
      expect(commit).toHaveBeenCalledTimes(1);
      f.item.modelMatrix = [...identityMat4()] as typeof f.item.modelMatrix;
      f.item.modelMatrix[12] = 2;
      await f.render({ source: f.source, frameId: 11 }, asynchronous);
      const next = prepare.mock.results.at(-1)!.value;
      expect(next.historyValid).toBe(true);
      expect(next.v2!.previous[12]).toBe(0);
      expect(next.history).toBe(prepare.mock.results[0]!.value.historyOutput);
      expect(f.internals.finishTemporalFrame(11)).toBe(true);
      expect(commit).toHaveBeenCalledTimes(2);
    } finally { f.dispose(); }
  });

  it.each([false, true])("aborts every prepared view if multiview composition or after-output fails (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit");
    const prepare = vi.spyOn(f.owner, "prepare");
    const camera = { viewProjectionMatrix: identityMat4() };
    const views = [
      { id: "left", camera, viewport: { x: 0, y: 0, width: 4, height: 8 } },
      { id: "right", camera, viewport: { x: 4, y: 0, width: 4, height: 8 } }
    ];
    const composite = vi.spyOn(f.internals, "compositeViews").mockImplementation(() => { throw new Error("composite failed"); });
    try {
      await expect(f.render({ source: f.source, views }, asynchronous)).rejects.toThrow("composite failed");
      expect(prepare).toHaveBeenCalledTimes(2);
      expect(commit).not.toHaveBeenCalled();
      expect((f.renderer as unknown as { viewTargets: Map<unknown, unknown> }).viewTargets.size).toBe(0);
      composite.mockRestore();
      await f.render({ source: f.source, views }, asynchronous);
      expect(prepare.mock.results.slice(-2).every(result => result.value.historyValid === false)).toBe(true);
      expect(commit).toHaveBeenCalledTimes(2);
    } finally { f.dispose(); }
  });

  it.each([false, true])("does not promote a frame when after-output or endFrame fails (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit");
    let fail = true;
    const unregister = registerFrameContributor({ id: "prd03.temporal-after-output-failure", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "temporal-after-output-failure", reads: [], writes: [], execute: () => { if (fail) throw new Error("after-output failed"); }
      }] });
    try {
      await expect(f.render({ source: f.source, frameId: 1 }, asynchronous)).rejects.toThrow("after-output failed");
      expect(commit).not.toHaveBeenCalled();
      fail = false;
      const end = f.renderer.device.endFrame.bind(f.renderer.device);
      vi.spyOn(f.renderer.device, "endFrame").mockImplementationOnce(() => { end(); throw new Error("endFrame failed"); });
      await expect(f.render({ source: f.source, frameId: 2 }, asynchronous)).rejects.toThrow("endFrame failed");
      expect(commit).not.toHaveBeenCalled();
      await f.render({ source: f.source, frameId: 3 }, asynchronous);
      expect(f.internals.finishTemporalFrame(3)).toBe(true);
      expect(commit).toHaveBeenCalledOnce();
    } finally { unregister(); f.dispose(); }
  });

  it.each([false, true])("does not commit when frame inspection cleanup fails (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit");
    const internals = f.renderer as unknown as { finishFrameInspection(...args: unknown[]): void };
    vi.spyOn(internals, "finishFrameInspection").mockImplementationOnce(() => { throw new Error("inspection failed"); });
    try {
      await expect(f.render({ source: f.source }, asynchronous)).rejects.toThrow("inspection failed");
      expect(commit).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each([false, true])("cancels a pending explicit frame without advancing it or another renderer (async=%s)", async asynchronous => {
    const a = await rendererTemporalFixture(), b = await rendererTemporalFixture();
    const aCommit = vi.spyOn(a.owner, "commit"), bCommit = vi.spyOn(b.owner, "commit");
    const aPrepare = vi.spyOn(a.owner, "prepare"), bPrepare = vi.spyOn(b.owner, "prepare");
    try {
      await a.render({ source: a.source, frameId: 1 }, asynchronous);
      await b.render({ source: b.source, frameId: 1 }, asynchronous);
      expect(a.internals.cancelTemporalFrame(1)).toBe(true);
      expect(a.internals.cancelTemporalFrame(1)).toBe(false);
      expect(aCommit).not.toHaveBeenCalled();
      expect(b.internals.finishTemporalFrame(1)).toBe(true);
      expect(bCommit).toHaveBeenCalledOnce();
      await a.render({ source: a.source, frameId: 2 }, asynchronous);
      await b.render({ source: b.source, frameId: 2 }, asynchronous);
      expect(aPrepare.mock.results.at(-1)!.value.historyValid).toBe(false);
      expect(bPrepare.mock.results.at(-1)!.value.historyValid).toBe(true);
    } finally { a.dispose(); b.dispose(); }
  });

  it.each([false, true])("completes the prior explicit frame on an ID transition, before preparing the next (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit"), prepare = vi.spyOn(f.owner, "prepare");
    try {
      await f.render({ source: f.source, frameId: 1 }, asynchronous);
      expect(commit).not.toHaveBeenCalled();
      await f.render({ source: f.source, frameId: 2 }, asynchronous);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith("single", 1);
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(true);
      expect(f.internals.cancelTemporalFrame(2)).toBe(true);
      expect(commit).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it.each([false, true])("keeps legacy flag-off temporal rendering and scoped completion (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture(false);
    const commit = vi.spyOn(f.owner, "commit"), prepare = vi.spyOn(f.owner, "prepare");
    try {
      await f.render({ source: f.source, frameId: 1 }, asynchronous);
      await f.render({ source: f.source, frameId: 1 }, asynchronous);
      expect(commit).not.toHaveBeenCalled();
      expect(f.internals.finishTemporalFrame(1)).toBe(true);
      expect(commit).toHaveBeenCalledOnce();
      await f.render({ source: f.source, frameId: 2 }, asynchronous);
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(true);
      expect(prepare.mock.results.at(-1)!.value.v2).toBeUndefined();
    } finally { f.dispose(); }
  });

  it.each([false, true])("commits expected-depth history after the device frame has ended (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    Object.defineProperty(f.renderer.device, "generation", { value: 1, writable: true, configurable: true });
    const velocity = f.renderer.device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const prepare = vi.spyOn(f.owner, "prepare");
    const source = { ...f.source, postprocess: { ...f.source.postprocess,
      temporal: { sceneKey: "frame", velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    try {
      await f.render({ source }, asynchronous);
      await f.render({ source }, asynchronous);
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(true);
    } finally { velocity.dispose(); f.dispose(); }
  });

  it.each([false, true])("unions repeated expected-depth passes after their device frames end (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    Object.defineProperty(f.renderer.device, "generation", { value: 1, writable: true, configurable: true });
    const velocity = f.renderer.device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const second = { ...f.item, temporalObjectKey: {}, modelMatrix: identityMat4() };
    second.modelMatrix[12] = 10;
    const source = { ...f.source, renderItems: [f.item, second], postprocess: { ...f.source.postprocess,
      temporal: { sceneKey: "frame", velocity, expectedPreviousDepth: "velocity-alpha" as const } } };
    const prepare = vi.spyOn(f.owner, "prepare");
    const previous = (pass: number, item: number) => {
      const uniforms = new Map();
      bindVelocityUniforms!(prepare.mock.results[pass]!.value.renderItems[item]!, uniforms);
      return (uniforms.get("u_previousModel") as Float32Array)[12];
    };
    try {
      await f.render({ source, frameId: 1 }, asynchronous);
      expect(f.internals.finishTemporalFrame(1)).toBe(true);
      f.item.modelMatrix[12] = 2; second.modelMatrix[12] = 20;
      source.renderItems = [f.item];
      await f.render({ source, frameId: 2 }, asynchronous);
      source.renderItems = [second];
      await f.render({ source, frameId: 2 }, asynchronous);
      expect(previous(1, 0)).toBe(0);
      expect(previous(2, 0)).toBe(10);
      expect(f.internals.finishTemporalFrame(2)).toBe(true);
      source.renderItems = [f.item, second];
      await f.render({ source, frameId: 3 }, asynchronous);
      expect([previous(3, 0), previous(3, 1)]).toEqual([2, 20]);
    } finally { velocity.dispose(); f.dispose(); }
  });

  it.each([false, true])("does not reuse a prior pass's TAA marker to authorize a later unwritten pass (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit"), prepare = vi.spyOn(f.owner, "prepare");
    try {
      await f.render({ source: f.source, frameId: 1 }, asynchronous);
      if (asynchronous) vi.mocked(f.internals.executePostprocessAsync).mockImplementationOnce(async () => {});
      else vi.mocked(f.internals.executePostprocess).mockImplementationOnce(() => {});
      await f.render({ source: f.source, frameId: 1 }, asynchronous);
      expect(f.internals.finishTemporalFrame(1)).toBe(true);
      expect(commit).not.toHaveBeenCalled();
      await f.render({ source: f.source, frameId: 2 }, asynchronous);
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(false);
    } finally { f.dispose(); }
  });

  it.each([false, true])("keeps views submitted in separate passes alive through one authored frame (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit"), prepare = vi.spyOn(f.owner, "prepare");
    const camera = { viewProjectionMatrix: identityMat4() };
    const left = { id: "left", camera, viewport: { x: 0, y: 0, width: 4, height: 8 } };
    const right = { id: "right", camera, viewport: { x: 4, y: 0, width: 4, height: 8 } };
    try {
      await f.render({ source: f.source, frameId: 1, views: [left] }, asynchronous);
      await f.render({ source: f.source, frameId: 1, views: [right] }, asynchronous);
      expect(commit).not.toHaveBeenCalled();
      expect(f.internals.finishTemporalFrame(1)).toBe(true);
      expect(commit.mock.calls.map(call => call[0])).toEqual(["view:string:left", "view:string:right"]);
      await f.render({ source: f.source, frameId: 2, views: [left] }, asynchronous);
      await f.render({ source: f.source, frameId: 2, views: [right] }, asynchronous);
      expect(prepare.mock.results.slice(-2).every(result => result.value.historyValid)).toBe(true);
      expect(f.internals.finishTemporalFrame(2)).toBe(true);
      expect(commit).toHaveBeenCalledTimes(4);
    } finally { f.dispose(); }
  });

  it.each([false, true])("prepares disjoint objects in same-view passes against the same prior frame (async=%s)", async asynchronous => {
    const f = await rendererTemporalFixture();
    const second = { ...f.item, temporalObjectKey: {}, modelMatrix: identityMat4() };
    second.modelMatrix[12] = 10;
    f.source.renderItems = [f.item, second];
    const prepare = vi.spyOn(f.owner, "prepare");
    const previous = (index: number) => {
      const uniforms = new Map();
      bindVelocityUniforms!(prepare.mock.results[index]!.value.renderItems[0]!, uniforms);
      return (uniforms.get("u_previousModel") as Float32Array)[12];
    };
    try {
      await f.render({ source: f.source, frameId: 1 }, asynchronous);
      f.internals.finishTemporalFrame(1);
      f.item.modelMatrix[12] = 2;
      second.modelMatrix[12] = 20;
      f.source.renderItems = [f.item];
      await f.render({ source: f.source, frameId: 2 }, asynchronous);
      expect(previous(1)).toBe(0);
      f.source.renderItems = [second];
      await f.render({ source: f.source, frameId: 2 }, asynchronous);
      expect(previous(2)).toBe(10);
      expect(f.internals.finishTemporalFrame(2)).toBe(true);
      f.source.renderItems = [f.item, second];
      await f.render({ source: f.source, frameId: 3 }, asynchronous);
      expect(previous(3)).toBe(2);
      const uniforms = new Map();
      bindVelocityUniforms!(prepare.mock.results[3]!.value.renderItems[1]!, uniforms);
      expect((uniforms.get("u_previousModel") as Float32Array)[12]).toBe(20);
    } finally { f.dispose(); }
  });

  it.each(["cancel", "dispose"] as const)("prevents promotion when %s interrupts an asynchronous after-output pass", async action => {
    const f = await rendererTemporalFixture();
    const commit = vi.spyOn(f.owner, "commit");
    let signalStart!: () => void, resume!: () => void;
    const started = new Promise<void>(resolve => { signalStart = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const unregister = registerFrameContributor({ id: "prd03.temporal-async-interrupt", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "temporal-async-interrupt", reads: [], writes: [], execute: () => {}, executeAsync: async () => { signalStart(); await gate; }
      }] });
    try {
      const running = f.render({ source: f.source, frameId: 1 }, true);
      await started;
      expect(() => f.internals.finishTemporalFrame(1)).toThrow(/during rendering/);
      if (action === "cancel") expect(f.internals.cancelTemporalFrame(1)).toBe(true);
      else f.renderer.dispose();
      resume();
      await expect(running).rejects.toMatchObject({ code: "TEMPORAL_FRAME_CANCELLED" });
      expect(commit).not.toHaveBeenCalled();
    } finally { resume(); unregister(); f.dispose(); }
  });

  it.each(["loss", "generation"] as const)("rejects a pending frame after device %s without promoting history", async reason => {
    const f = await rendererTemporalFixture();
    const device = f.renderer.device as MockRenderDevice & { generation: number };
    Object.defineProperty(device, "generation", { value: 1, writable: true, configurable: true });
    const commit = vi.spyOn(f.owner, "commit"), prepare = vi.spyOn(f.owner, "prepare");
    try {
      await f.render({ source: f.source, frameId: 1 }, false);
      if (reason === "loss") device.contextLost = true;
      else device.generation = 2;
      expect(() => f.internals.finishTemporalFrame(1)).toThrow(/cancelled|unavailable/i);
      expect(commit).not.toHaveBeenCalled();
      device.contextLost = false;
      await f.render({ source: f.source, frameId: 2 }, false);
      expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(false);
    } finally { f.dispose(); }
  });

  it("promotes motion history only for its own completed v2 presentation", async () => {
    const qrFlags = resolveQrFlags({ options: { A3D_QR_POST: true } });
    const a = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags });
    const b = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags });
    type State = { viewScopeId: object; activeViewId: string | number; authoredFrameId: number; temporalHistory: TemporalHistory; commitTemporalHistory(taa: boolean): void };
    const first = a as unknown as State, second = b as unknown as State;
    first.authoredFrameId = 7; second.authoredFrameId = 7;
    const firstCommit = vi.spyOn(first.temporalHistory, "commit").mockImplementation(() => {});
    const firstReset = vi.spyOn(first.temporalHistory, "reset").mockImplementation(() => {});
    const secondCommit = vi.spyOn(second.temporalHistory, "commit").mockImplementation(() => {});
    markPostV2Presented(second.viewScopeId, second.activeViewId, 7);
    first.commitTemporalHistory(false);
    second.commitTemporalHistory(false);
    expect(firstReset).toHaveBeenCalledOnce();
    expect(firstCommit).not.toHaveBeenCalled();
    expect(secondCommit).toHaveBeenCalledOnce();
    markPostV2Presented(first.viewScopeId, "other-view", 8);
    first.authoredFrameId = 8;
    first.commitTemporalHistory(false);
    expect(firstReset).toHaveBeenCalledTimes(2);
    a.dispose(); b.dispose();
  });
  it("isolates and retires primed plans across shared sources and target wrappers while rendering logical draws", async () => {
    // The source-level planner is exercised separately from execution: no
    // backend currently attests renderer-owned automatic batching as safe.
    const qrFlags = createTrustedQrFlags({ A3D_QR_TIERS_BATCHING: true });
    const a = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags });
    const b = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags });
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();
    const source = { cameraPolicy: "identity" as const, staticBatching: true, renderItems: [
      { geometry, material, modelMatrix: identityMat4() }, { geometry, material, modelMatrix: identityMat4() }
    ] };
    try {
      expect(a.render(source).drawCalls).toBe(2);
      expect(b.render(source).drawCalls).toBe(2);
      // Prime real planner caches only after both renderers track this source;
      // that lets the assertions exercise their owner and retirement boundary.
      const planA = applyRendererOwnedStaticBatching(source, source.renderItems, a, qrFlags);
      const planB = applyRendererOwnedStaticBatching(source, source.renderItems, b, qrFlags);
      expect(planA).toHaveLength(1);
      expect(planB).toHaveLength(1);
      const ownedA = planA[0]!.material;
      const ownedB = planB[0]!.material;
      expect(ownedA).toBeInstanceOf(InstancedPBRMaterial);
      expect(ownedB).toBeInstanceOf(InstancedPBRMaterial);
      expect(ownedA).not.toBe(ownedB);
      const cacheA = batchPlanCacheFor(a), cacheB = batchPlanCacheFor(b);
      expect(cacheA).not.toBe(cacheB);
      expect(cacheA.lastPlan?.instancedBatches).toHaveLength(1);
      expect(cacheB.lastPlan?.instancedBatches).toHaveLength(1);
      const disposeA = vi.spyOn(cacheA, "dispose"), disposeB = vi.spyOn(cacheB, "dispose");
      const target = a.device.createRenderTarget({ width: 8, height: 8 });
      expect(a.render({ source, target }).drawCalls).toBe(2);
      expect(disposeA).not.toHaveBeenCalled();
      expect((ownedA as InstancedPBRMaterial).disposed).toBe(false);
      a.render({ cameraPolicy: "identity", renderItems: [] });
      expect(disposeA).toHaveBeenCalledOnce();
      expect((ownedA as InstancedPBRMaterial).disposed).toBe(true);
      expect(disposeB).not.toHaveBeenCalled();
      expect(cacheB.lastPlan).not.toBeNull();
      expect((ownedB as InstancedPBRMaterial).disposed).toBe(false);
      a.dispose(); b.dispose();
      expect(disposeB).toHaveBeenCalledOnce();
      expect((ownedB as InstancedPBRMaterial).disposed).toBe(true);
      expect(material.disposed).toBe(false);
    } finally { a.dispose(); b.dispose(); geometry.dispose(); material.dispose(); }
  });
  it("consumes TAA writes only for their exact renderer, view and frame", () => {
    const first = {}, second = {};
    markTaaHistoryWritten(first, "left", 1);
    markTaaHistoryWritten(first, "right", 1);
    markTaaHistoryWritten(second, "left", 1);
    markTaaHistoryWritten(first, "left", 2);
    markTaaHistoryWritten(undefined, "left", 1);
    expect(consumeTaaHistoryWritten(first, "left", 3)).toBe(false);
    expect(consumeTaaHistoryWritten(first, "left", 1)).toBe(true);
    expect(consumeTaaHistoryWritten(first, "left", 1)).toBe(false);
    expect(consumeTaaHistoryWritten(first, "right", 1)).toBe(true);
    expect(consumeTaaHistoryWritten(second, "left", 1)).toBe(true);
    expect(consumeTaaHistoryWritten(first, "left", 2)).toBe(true);
    expect(consumeTaaHistoryWritten(undefined, "left", 1)).toBe(false);
  });

  it.each([false, true])("retires an afterimage when it is removed or moves in the effect chain (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const release = vi.fn();
    renderer.device.releaseNativePostEffectView = release;
    renderer.device.presentLdrPostprocess = () => undefined;
    const item = { geometry: Geometry.triangle(), label: "effect-view", modelMatrix: identityMat4() };
    const render = async (nativeEffects: readonly { kind: string; [key: string]: unknown }[]) => {
      const source = { renderItems: [item], cameraPolicy: "identity" as const,
        postprocess: { v2: true, toneMapping: { operator: "linear" as const }, pipeline: { nativeEffects } } };
      if (asynchronous) await renderer.renderAsync(source); else renderer.render(source);
    };
    const afterimage = { kind: "afterimage", decay: 0.8 };
    await render([afterimage]);
    await render([]);
    expect(release).toHaveBeenCalledTimes(1);
    await render([afterimage]);
    await render([{ kind: "pixelation", size: 2 }, afterimage]);
    expect(release).toHaveBeenCalledTimes(2);
    expect(release.mock.calls[0]![0]).toBe(release.mock.calls[1]![0]);
    expect(release.mock.calls.map(call => call[1])).toEqual(["single", "single"]);
    renderer.dispose();
  });

  it.each([false, true])("retires the submitted afterimage on after-output, endFrame, or authored-frame failure (async=%s)", async asynchronous => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8,
      qrFlags: createTrustedQrFlags({ A3D_QR_POST: true }) });
    const release = vi.fn();
    renderer.device.releaseNativePostEffectView = release;
    renderer.device.presentLdrPostprocess = () => undefined;
    const internals = renderer as unknown as { executePostprocess(): void; executePostprocessAsync(): Promise<void> };
    vi.spyOn(internals, "executePostprocess").mockImplementation(() => {});
    vi.spyOn(internals, "executePostprocessAsync").mockImplementation(async () => {});
    const geometry = Geometry.triangle();
    const source = { renderItems: [{ geometry, modelMatrix: identityMat4() }], cameraPolicy: "identity" as const,
      postprocess: { v2: true, toneMapping: { operator: "linear" as const },
        pipeline: { nativeEffects: [{ kind: "afterimage" as const, decay: .8 }] } } };
    const render = async (frameId?: number) => {
      if (asynchronous) await renderer.renderAsync({ source, ...(frameId !== undefined ? { frameId } : {}) });
      else renderer.render({ source, ...(frameId !== undefined ? { frameId } : {}) });
    };
    let failOutput = true;
    const unregister = registerFrameContributor({ id: "prd03.afterimage-frame-failure", owner: "prd03",
      flag: "A3D_QR_POST", phases: ["after-output"], passes: () => [{
        name: "afterimage-frame-failure", reads: [], writes: [],
        execute: () => { if (failOutput) throw new Error("after-output failed"); }
      }] });
    try {
      await expect(render()).rejects.toThrow("after-output failed");
      expect(release).toHaveBeenCalled();
      failOutput = false;
      release.mockClear();
      const end = renderer.device.endFrame.bind(renderer.device);
      vi.spyOn(renderer.device, "endFrame").mockImplementationOnce(() => { end(); throw new Error("endFrame failed"); });
      await expect(render()).rejects.toThrow("endFrame failed");
      expect(release).toHaveBeenCalled();
      release.mockClear();
      await render(17);
      expect(release).not.toHaveBeenCalled();
      expect(renderer.cancelTemporalFrame(17)).toBe(true);
      expect(release).toHaveBeenCalled();
    } finally { unregister(); renderer.dispose(); geometry.dispose(); }
  });

  it.each([false,true])("reseeds after a configured temporal frame with no active effect (async=%s)", async (asynchronous) => {
    const renderer = await Renderer.create({backend:"mock",width:16,height:16});
    const owner = (renderer as unknown as {temporalHistory:TemporalHistory}).temporalHistory;
    const prepare=vi.spyOn(owner,"prepare"),commit=vi.spyOn(owner,"commit");
    renderer.device.presentLdrPostprocess=()=>undefined;
    const item={geometry:Geometry.triangle(),label:"frame-state-rigid",modelMatrix:identityMat4()};
    const render=async(active:boolean)=>{
      const source={renderItems:[item],cameraPolicy:"identity" as const,postprocess:{execution:"auto" as const,toneMapping:{operator:"linear" as const},temporal:{sceneKey:"same"},...(active?{taa:{blend:.9}}:{})}};
      if(asynchronous)await renderer.renderAsync(source);else renderer.render(source);
    };
    await render(true);expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(false);
    await render(false);expect(commit).toHaveBeenCalledTimes(1);
    await render(true);expect(prepare.mock.results.at(-1)!.value.historyValid).toBe(false);
    expect(commit).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("removes arbitrary cold-sample bias before reaching the authored steady weight", () => {
    let firstSampleWeight = 1;
    for (let samples = 1; samples <= 9; samples++) {
      firstSampleWeight *= temporalAccumulationWeight(.9, samples);
      expect(firstSampleWeight).toBeCloseTo(1 / (samples + 1), 12);
    }
    expect(temporalAccumulationWeight(.9, 20)).toBe(.9);
    expect(temporalAccumulationWeight(.9, 0)).toBe(0);
    expect(()=>temporalAccumulationWeight(.9, -1)).toThrow();
  });

  it("rasterizes rigid transforms and advances only after a committed frame", () => {
    const { device, owner, item, prepare } = fixture();
    const seed = prepare();
    expect(seed.historyValid).toBe(false);
    const first = device.drawCommands.at(-1)!;
    expect(first.uniforms?.get("u_previousViewProjection")).toEqual(first.uniforms?.get("u_modelViewProjection"));
    owner.commit();
    item.modelMatrix[12] = .25;
    const moved = prepare();
    expect(moved.historyValid).toBe(true);
    expect(moved.history).toBe(seed.historyOutput);
    const draw = device.drawCommands.at(-1)!;
    expect((draw.uniforms?.get("u_previousViewProjection") as Float32Array)[12]).toBe(0);
    expect((draw.uniforms?.get("u_modelViewProjection") as Float32Array)[12]).toBe(.25);
    owner.dispose(); device.dispose();
  });

  it("unions legacy disjoint passes against their original frame baseline", () => {
    const { device, owner, item } = fixture();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: false }), device);
    const other = { ...item, modelMatrix: identityMat4() };
    other.modelMatrix[12] = 10;
    const options = { viewId: "legacy", frameId: 1 };
    const draw = (items: typeof item[], frameId: number) => {
      device.beginFrame(16, 16);
      try {
        const result = owner.prepare(device, 16, 16, items, identityMat4(), { ...options, frameId });
        const previous = device.drawCommands.map(command => (command.uniforms?.get("u_previousViewProjection") as Float32Array)[12]);
        return { result, previous };
      } finally { device.endFrame(); }
    };
    try {
      draw([item, other], 1); owner.commit("legacy", 1);
      item.modelMatrix[12] = 2; other.modelMatrix[12] = 20;
      const a = draw([item], 2), b = draw([other], 2);
      expect(a.previous).toEqual([0]);
      expect(b.previous).toEqual([10]);
      expect(b.result.history).toBe(a.result.history);
      owner.commit("legacy", 2);
      const next = draw([item, other], 3);
      expect(next.previous).toEqual([2, 20]);
      expect(next.result.history).toBe(a.result.historyOutput);
    } finally { owner.dispose(); device.dispose(); }
  });

  it("keeps raster jitter out of physical motion vectors", () => {
    const { device, owner, prepare } = fixture();
    prepare({ jitter: true }); owner.commit();
    prepare({ jitter: true });
    const draw = device.drawCommands.at(-1)!;
    const raster = draw.uniforms!.get("u_modelViewProjection") as Float32Array;
    const current = draw.uniforms!.get("u_unjitteredViewProjection") as Float32Array;
    const previous = draw.uniforms!.get("u_previousViewProjection") as Float32Array;
    expect(current).toEqual(previous);
    expect(Array.from(current)).toEqual(identityMat4());
    expect(Array.from(raster)).not.toEqual(Array.from(current));
    owner.dispose(); device.dispose();
  });

  it("distributes both alternating motion phases across the whole pixel", () => {
    const { device, owner, prepare } = fixture();
    const phases: number[][] = [[], [], [], []];
    for (let frame = 0; frame < 64; frame++) {
      prepare({ jitter: true });
      if (frame > 0) for (let axis=0;axis<2;axis++) phases[axis*2+frame % 2]!.push(owner.jitter(16, 16)[axis]! * 8);
      owner.commit();
    }
    for (const samples of phases) {
      expect(Math.min(...samples)).toBeLessThan(-.4);
      expect(Math.max(...samples)).toBeGreaterThan(.4);
      expect(Math.abs(samples.reduce((a,b)=>a+b,0)/samples.length)).toBeLessThan(.08);
    }
    owner.dispose(); device.dispose();
  });

  it("reseeds cuts, scene replacement, resize, and releases old targets", () => {
    const { device, owner, prepare } = fixture();
    const first = prepare({sceneKey:"a"}); owner.commit();
    expect(prepare({sceneKey:"a"}).historyValid).toBe(true);
    expect(prepare({sceneKey:"b"}).historyValid).toBe(false);
    owner.commit(); owner.reset();
    expect(prepare({sceneKey:"b"}).historyValid).toBe(false);
    owner.commit();
    const resized = prepare({sceneKey:"b"}, 32);
    expect(resized.historyValid).toBe(false);
    expect(first.velocity.disposed).toBe(true);
    owner.dispose();
    expect([resized.velocity,resized.history,resized.historyOutput].every(target=>target.disposed)).toBe(true);
    device.dispose();
  });

  it("rejects duplicate identities and deformed geometry rather than inventing velocity", () => {
    const { device, owner, item } = fixture(); device.beginFrame(16,16);
    expect(()=>owner.prepare(device,16,16,[item,item],identityMat4(),{})).toThrow(/stable unique objects/);
    expect(()=>owner.prepare(device,16,16,[{...item, morphTargets:[{} as never]}],identityMat4(),{})).toThrow(/stable unique objects/);
    owner.dispose(); device.dispose();
  });

  it("flag on (A3D_QR_POST): no velocity re-draw, deformed items accepted, C-14 matrices returned", () => {
    setRendererQrFlags(resolveQrFlags({ options: { A3D_QR_POST: true } }));
    try {
      const { device, owner, prepare } = fixture();
      const drawsBefore = device.drawCommands.length;
      const bindings = prepare({ sceneKey: "s", jitter: true, frameTime: 1 / 60 });
      expect(device.drawCommands.length).toBe(drawsBefore); // no velocity re-render pass
      expect(bindings.v2).toBeDefined();
      expect(bindings.v2!.jitterClip).toHaveLength(2);
      // Jitter is zero on the seed frame by design; the committed second
      // frame carries it, and it must equal what raster applied.
      owner.commit();
      const second = prepare({ sceneKey: "s", jitter: true, frameTime: 1 / 60 });
      expect(second.v2!.jittered).not.toEqual(second.v2!.unjittered);
      expect(device.drawCommands.length).toBe(drawsBefore);
      // Deformed (morph) items throw only on the flag-off re-draw path.
      const morphed = { geometry: Geometry.triangle(), label: "morphed", modelMatrix: identityMat4(), morphTargets: [{} as never] };
      device.beginFrame(16, 16);
      try {
        expect(() => owner.prepare(device, 16, 16, [morphed], identityMat4(), {})).not.toThrow();
      } finally {
        device.endFrame();
      }
      owner.dispose();
      device.dispose();
    } finally {
      setRendererQrFlags(resolveQrFlags({}));
    }
  });

  it("requires three distinct live GPU targets and rejects disposed temporal inputs", () => {
    const { device, owner, prepare } = fixture();
    const temporal = prepare();
    const context = {nativeLdrPostprocess:true, sourceTargetFormat:"rgba8" as const};
    expect(createRendererPostprocessPlanDiagnostics({taa:{temporal}},context).missingInputs).toEqual([]);
    const alias = {...temporal,historyOutput:temporal.history};
    expect(createRendererPostprocessPlanDiagnostics({taa:{temporal:alias}},context).missingInputs).toEqual(["taa:history","taa:velocity"]);
    owner.dispose();
    expect(createRendererPostprocessPlanDiagnostics({taa:{temporal}},context).missingInputs).toEqual(["taa:history","taa:velocity"]);
    device.dispose();
  });
});
