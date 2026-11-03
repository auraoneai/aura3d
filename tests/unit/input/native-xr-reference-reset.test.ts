import { describe, expect, it, vi } from "vitest";
import type { A3DXREventLike, A3DXRFrameLike, A3DXRSessionLike, WebXRFrameSample } from "../../../packages/input/src/WebXRSessionController";
import { createAuraXRRuntime } from "../../../packages/engine/src/agent-api/xr/xrRuntime";
import { attachXRSceneHelpers, type AuraXRVisual } from "../../../packages/engine/src/agent-api/xr/XRSceneHelpers";
import { getXRViewCamera } from "../../../packages/engine/src/agent-api/xr/xrViewOverride";
import type { AuraXREventMap } from "../../../packages/engine/src/agent-api/xr/types";

const matrixAt = (x = 0): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
const transform = (x = 0) => ({ matrix: matrixAt(x), position: { x, y: 1, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } });

class Target {
  readonly listeners = new Map<string, Set<(event: A3DXREventLike) => void>>();
  addEventListener(type: string, listener: (event: A3DXREventLike) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener));
  }
  removeEventListener(type: string, listener: (event: A3DXREventLike) => void) { this.listeners.get(type)?.delete(listener); }
  fire(type: string, event: A3DXREventLike = {}) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event); }
}

class Session extends Target implements A3DXRSessionLike {
  readonly space = new Target();
  readonly inputSources = [{ handedness: "left" as const, targetRaySpace: {}, hand: new Map([["wrist", {}]]) }];
  readonly enabledFeatures = ["light-estimation"];
  readonly frames: Array<(time: number, frame: A3DXRFrameLike) => void> = [];
  readonly requestReferenceSpace = vi.fn(async () => this.space);
  readonly requestLightProbe = vi.fn(async () => ({}));
  readonly updateRenderState = vi.fn();
  readonly requestAnimationFrame = vi.fn((callback: (time: number, frame: A3DXRFrameLike) => void) => {
    this.frames.push(callback);
    return this.frames.length;
  });
  readonly cancelAnimationFrame = vi.fn();
  readonly end = vi.fn(async () => { this.fire("end"); });
  step(time: number, frame: A3DXRFrameLike): void {
    const callback = this.frames.shift();
    if (!callback) throw new Error("No XR frame scheduled");
    callback(time, frame);
  }
}

interface Hooks {
  onPose?: () => void;
  onViewerPose?: (call: number) => void;
  onTime?: () => void;
  onAdvance?: () => void;
  onViewport?: () => void;
  onFramebuffer?: () => void;
  onSetViewport?: () => void;
  onRender?: () => void;
  isFrameCurrent?: () => boolean;
}

function rig() {
  const session = new Session();
  const hooks: Hooks = {};
  const key = {};
  class Layer {
    readonly framebuffer = {};
    readonly framebufferWidth = 100;
    readonly framebufferHeight = 50;
    getViewport() { hooks.onViewport?.(); return { x: 0, y: 0, width: 50, height: 50 }; }
  }
  const device = {
    setExternalFramebuffer: vi.fn((framebuffer: unknown | null) => { if (framebuffer !== null) hooks.onFramebuffer?.(); }),
    setViewport: vi.fn(() => hooks.onSetViewport?.()),
    resetViewport: vi.fn()
  };
  const renderFrame = vi.fn(() => hooks.onRender?.());
  const advanceFrame = vi.fn(() => hooks.onAdvance?.());
  const runtime = createAuraXRRuntime({
    key,
    xr: { isSessionSupported: async () => true, requestSession: async () => session },
    getGL: () => ({ makeXRCompatible: async () => undefined }),
    layerConstructor: Layer,
    getDevice: () => device,
    getTime: () => { hooks.onTime?.(); return 0; },
    advanceFrame,
    isFrameCurrent: () => hooks.isFrameCurrent?.() ?? true,
    renderFrame
  });
  const makeFrame = (x = 1): A3DXRFrameLike => {
    let viewerCalls = 0;
    const view = (eye: "left" | "right") => ({ eye, projectionMatrix: matrixAt(), transform: { matrix: matrixAt(x), inverse: { matrix: matrixAt(-x) } } });
    return {
      getPose: () => { hooks.onPose?.(); return { transform: transform(x) }; },
      getJointPose: () => ({ transform: transform(x), radius: 0.02 }),
      getViewerPose: () => { hooks.onViewerPose?.(++viewerCalls); return { transform: transform(x), views: [view("left"), view("right")] }; },
      detectedPlanes: new Set([{ planeSpace: {}, polygon: [{ x: 0, y: 0, z: 0 }] }]),
      getDepthInformation: () => ({ width: 1, height: 1, rawValueToMeters: 1 }),
      getLightEstimate: () => ({ primaryLightIntensity: { x: 1, y: 1, z: 1 } })
    };
  };
  return { session, hooks, key, device, runtime, renderFrame, advanceFrame, makeFrame };
}

function visual() {
  return { setPosition: vi.fn(), setRotation: vi.fn(), setScale: vi.fn(), setVisible: vi.fn(), dispose: vi.fn() };
}

describe("XR reference-space resets (injected native-shaped sessions)", () => {
  it("invalidates samples before reset listeners, clears helpers, and recreates them on the next frame", async () => {
    const { session, runtime, makeFrame, renderFrame } = rig();
    const visuals: Array<ReturnType<typeof visual>> = [];
    const makeVisual = (): AuraXRVisual => { const next = visual(); visuals.push(next); return next; };
    const onPlanes = vi.fn(); const onDepth = vi.fn(); const onLight = vi.fn();
    const helpers = attachXRSceneHelpers(runtime, { createController: makeVisual, createJoint: makeVisual, onPlanes, onDepth, onLight });
    const samplesDuringReset: Array<WebXRFrameSample | null> = [];
    const onReset = vi.fn((_event: AuraXREventMap["reset"]) => { samplesDuringReset.push(runtime.lastSample); });
    runtime.on("reset", onReset);
    expect((await runtime.enter("immersive-vr", { referenceSpace: "local", lightEstimation: true })).started).toBe(true);
    session.step(10, makeFrame(1));
    expect(runtime.lastSample?.camera.position).toEqual([1, 1, 0]);
    expect(visuals).toHaveLength(2);
    expect(onPlanes.mock.lastCall?.[0]).toHaveLength(1);
    expect(onDepth.mock.lastCall?.[0]).toHaveLength(2);
    expect(onLight.mock.lastCall?.[0]).not.toBeNull();

    const delta = transform(9);
    session.space.fire("reset", { transform: delta });
    expect(onReset).toHaveBeenCalledWith({ transform: delta });
    expect(onReset.mock.calls[0]?.[0].transform).toBe(delta);
    expect(samplesDuringReset).toEqual([null]);
    expect(runtime.lastSample).toBeNull();
    for (const item of visuals) { expect(item.setVisible).toHaveBeenLastCalledWith(false); expect(item.dispose).toHaveBeenCalledOnce(); }
    expect(onPlanes).toHaveBeenLastCalledWith([]);
    expect(onDepth).toHaveBeenLastCalledWith([]);
    expect(onLight).toHaveBeenLastCalledWith(null);
    expect(runtime.isPresenting).toBe(true);
    expect(session.end).not.toHaveBeenCalled();
    expect(session.frames).toHaveLength(1);

    session.step(20, makeFrame(5));
    expect(runtime.lastSample?.camera.position).toEqual([5, 1, 0]);
    expect(visuals).toHaveLength(4);
    expect(renderFrame).toHaveBeenCalledTimes(4);
    helpers.dispose();
    const notifications = onPlanes.mock.calls.length;
    session.space.fire("reset");
    expect(onPlanes).toHaveBeenCalledTimes(notifications);
    await runtime.exit();
    expect(session.space.listeners.get("reset")?.size).toBe(0);
  });

  it.each(["sample", "clock", "simulation", "viewer", "viewport", "framebuffer", "device-viewport", "first-eye"] as const)(
    "abandons a frame reset during %s and recovers on the next native frame",
    async (phase) => {
      const { session, hooks, key, device, runtime, renderFrame, advanceFrame, makeFrame } = rig();
      const onFrame = vi.fn(); const onReset = vi.fn();
      let cameraAfterReset: ReturnType<typeof getXRViewCamera>;
      runtime.on("frame", onFrame); runtime.on("reset", onReset);
      await runtime.enter("immersive-vr", { referenceSpace: "local" });
      const reset = () => {
        hooks.onPose = undefined; hooks.onTime = undefined; hooks.onAdvance = undefined;
        hooks.onViewerPose = undefined; hooks.onViewport = undefined; hooks.onFramebuffer = undefined;
        hooks.onSetViewport = undefined; hooks.onRender = undefined;
        session.space.fire("reset");
        cameraAfterReset = getXRViewCamera(key);
      };
      if (phase === "sample") hooks.onPose = reset;
      if (phase === "clock") hooks.onTime = reset;
      if (phase === "simulation") hooks.onAdvance = reset;
      if (phase === "viewer") hooks.onViewerPose = (call) => { if (call === 2) reset(); };
      if (phase === "viewport") hooks.onViewport = reset;
      if (phase === "framebuffer") hooks.onFramebuffer = reset;
      if (phase === "device-viewport") hooks.onSetViewport = reset;
      if (phase === "first-eye") hooks.onRender = reset;

      session.step(10, makeFrame(1));
      expect(onReset).toHaveBeenCalledOnce();
      expect(cameraAfterReset).toBeUndefined();
      expect(runtime.lastSample).toBeNull();
      expect(onFrame).not.toHaveBeenCalled();
      expect(renderFrame).toHaveBeenCalledTimes(phase === "first-eye" ? 1 : 0);
      if (phase === "sample" || phase === "clock") expect(advanceFrame).not.toHaveBeenCalled();
      if (["viewport", "framebuffer", "device-viewport", "first-eye"].includes(phase)) expect(device.resetViewport).toHaveBeenCalled();
      expect(runtime.isPresenting).toBe(true);
      expect(session.end).not.toHaveBeenCalled();
      expect(session.frames).toHaveLength(1);

      session.step(20, makeFrame(4));
      expect(runtime.lastSample?.camera.position).toEqual([4, 1, 0]);
      expect(onFrame).toHaveBeenCalledOnce();
      expect(renderFrame).toHaveBeenCalledTimes((phase === "first-eye" ? 1 : 0) + 2);
      await runtime.exit();
    }
  );

  it("lets simulation establish the current renderer before checking frame ownership", async () => {
    const { session, hooks, runtime, makeFrame, renderFrame } = rig();
    let current = false;
    hooks.isFrameCurrent = () => current;
    hooks.onAdvance = () => { current = true; };
    await runtime.enter("immersive-vr", { referenceSpace: "local" });
    session.step(10, makeFrame());
    expect(runtime.isPresenting).toBe(true);
    expect(session.end).not.toHaveBeenCalled();
    expect(renderFrame).toHaveBeenCalledTimes(2);
    await runtime.exit();
  });

  it("does not send an old frame to later listeners after an earlier listener resets the space", async () => {
    const { session, runtime, makeFrame } = rig();
    let first = true;
    runtime.on("frame", () => { if (first) { first = false; session.space.fire("reset"); } });
    const createController = vi.fn(() => visual());
    const helpers = attachXRSceneHelpers(runtime, { createController });
    const later = vi.fn();
    runtime.on("frame", later);
    await runtime.enter("immersive-vr", { referenceSpace: "local" });
    session.step(10, makeFrame());
    expect(runtime.lastSample).toBeNull();
    expect(createController).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    session.step(20, makeFrame());
    expect(createController).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
    helpers.dispose();
    await runtime.exit();
  });

  it("disposes a visual returned after its factory reentrantly resets the reference space", async () => {
    const { session, runtime, makeFrame } = rig();
    const created: Array<ReturnType<typeof visual>> = [];
    let resetInFactory = true;
    const createController = vi.fn(() => {
      const next = visual(); created.push(next);
      if (resetInFactory) { resetInFactory = false; session.space.fire("reset"); }
      return next;
    });
    const createJoint = vi.fn(() => visual());
    const onPlanes = vi.fn();
    const helpers = attachXRSceneHelpers(runtime, { createController, createJoint, onPlanes });
    const later = vi.fn(); runtime.on("frame", later);
    await runtime.enter("immersive-vr", { referenceSpace: "local" });
    session.step(10, makeFrame());
    expect(runtime.lastSample).toBeNull();
    expect(created[0]?.setVisible).toHaveBeenCalledWith(false);
    expect(created[0]?.dispose).toHaveBeenCalledOnce();
    expect(createJoint).not.toHaveBeenCalled();
    expect(onPlanes).toHaveBeenLastCalledWith([]);
    expect(later).not.toHaveBeenCalled();
    session.step(20, makeFrame());
    expect(created).toHaveLength(2);
    expect(created[1]?.setVisible).toHaveBeenCalledWith(true);
    expect(createJoint).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
    helpers.dispose();
    await runtime.exit();
  });
});
