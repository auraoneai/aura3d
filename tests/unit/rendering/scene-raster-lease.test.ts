import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { TemporalHistory, type TemporalFrameOptions } from "../../../packages/rendering/src/TemporalHistory";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import {
  assertSceneRasterLeaseDraftCurrent, cancelSceneRasterLeaseDraft, createSceneRasterLeaseDraft,
  prepareSceneRasterLeaseDraft, sceneRasterLeaseDraftPhase, type SceneRasterLeaseDraftInput
} from "../../../packages/rendering/src/renderer/SceneRasterLease";
import { createSceneRasterSnapshot } from "../../../packages/rendering/src/renderer/SceneRasterSnapshot";

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function fixture() {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "generation", { value: 1, writable: true });
  setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
  device.beginFrame(8, 8);
  const history = new TemporalHistory(), owner = {}, viewProjection = identity();
  const options: TemporalFrameOptions = { viewId: "left", frameId: 1, jitter: true };
  const plan = history.planFrame(device, 8, 8, viewProjection, options);
  const snapshot = createSceneRasterSnapshot({ owner, device, viewId: "left", frameId: 1,
    viewMatrix: identity(), projectionMatrix: plan.jittered, viewProjectionMatrix: plan.jittered,
    unjitteredViewProjectionMatrix: plan.unjittered, jitterClip: plan.jitterClip,
    depth: { mode: "standard", clipRange: "minus-one-to-one" }, targetExtent: { width: 8, height: 8 },
    viewport: { x: 0, y: 0, width: 8, height: 8 }, scissor: null, cssExtent: { width: 4, height: 4 }, devicePixelRatio: 2 });
  const input: SceneRasterLeaseDraftInput = { snapshot, owner, device, history, plan, viewId: "left", frameId: 1,
    width: 8, height: 8, viewProjection, options };
  return { device, history, owner, plan, snapshot, input, options, viewProjection };
}

describe("non-authorizing scene raster lifecycle draft", () => {
  it("binds one draft to the shared temporal plan without allocating, drawing or consuming it", () => {
    const f = fixture(), createTarget = vi.spyOn(f.device, "createRenderTarget"), clear = vi.spyOn(f.device, "clear");
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      expect(Object.isFrozen(draft)).toBe(true);
      expect(draft.snapshot).toBe(f.snapshot);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("pending");
      expect(f.history.planFrame(f.device, 8, 8, f.viewProjection, { ...f.options })).toBe(f.plan);
      expect(() => createSceneRasterLeaseDraft(f.input)).toThrow(/already has a lifecycle draft/);
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).not.toThrow();
      expect(createTarget).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(f.device.drawCommands).toHaveLength(0);
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(true);
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(false);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("closed");
      expect(() => f.history.assertPlanCurrent(f.plan, f.device, 8, 8, f.viewProjection, f.options)).toThrow(/stale/);
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("rejects forged drafts and mismatched snapshot identity without taking ownership of the plan", () => {
    const f = fixture();
    try {
      let reads = 0;
      const forged = { get snapshot() { reads += 1; throw new Error("forged getter"); } };
      expect(() => assertSceneRasterLeaseDraftCurrent(forged as never)).toThrow(/Unknown/);
      expect(reads).toBe(0);
      expect(() => createSceneRasterLeaseDraft({ ...f.input, owner: {} })).toThrow(/stale/);
      expect(() => createSceneRasterLeaseDraft({ ...f.input, frameId: 2 })).toThrow(/stale/);
      expect(() => createSceneRasterLeaseDraft({ ...f.input, width: 7 })).toThrow(/stale|match/);
      expect(() => f.history.assertPlanCurrent(f.plan, f.device, 8, 8, f.viewProjection, f.options)).not.toThrow();
      const draft = createSceneRasterLeaseDraft(f.input);
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(true);
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("leaves a plan pending after a failed read-only check and does not call an instance-supplied validator", () => {
    const f = fixture();
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      const supplied = vi.fn(() => { throw new Error("instance callback invoked"); });
      Object.defineProperty(f.history, "assertPlanCurrent", { configurable: true, value: supplied });
      (f.options as { jitter: boolean }).jitter = false;
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).toThrow(/stale/);
      expect(() => prepareSceneRasterLeaseDraft(draft, [])).toThrow(/stale/);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("pending");
      (f.options as { jitter: boolean }).jitter = true;
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).not.toThrow();
      expect(supplied).not.toHaveBeenCalled();
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(true);
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("prepares only once and detects later history reset without disposing borrowed bindings", () => {
    const f = fixture();
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      const bindings = prepareSceneRasterLeaseDraft(draft, []);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("prepared");
      expect(Array.from(bindings.v2!.jittered)).toEqual(f.snapshot.viewProjectionMatrix);
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).not.toThrow();
      expect(() => prepareSceneRasterLeaseDraft(draft, [])).toThrow(/not pending/);
      f.history.reset("camera-cut", "left");
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).toThrow(/stale/);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("closed");
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(false);
      expect(bindings.history.disposed).toBe(false);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("closed");
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("revokes prepared drafts if returned temporal camera values change", () => {
    const f = fixture();
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      const bindings = prepareSceneRasterLeaseDraft(draft, []);
      bindings.v2!.jittered[0] = 2;
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).toThrow(/stale/);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("closed");
      expect(bindings.history.disposed).toBe(false);
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("keeps different views and plans independent when a draft is canceled", () => {
    const f = fixture();
    try {
      const options = { ...f.options, viewId: "right" };
      const plan = f.history.planFrame(f.device, 8, 8, f.viewProjection, options);
      const snapshot = createSceneRasterSnapshot({ owner: f.owner, device: f.device, viewId: "right", frameId: 1,
        viewMatrix: identity(), projectionMatrix: plan.jittered, viewProjectionMatrix: plan.jittered,
        unjitteredViewProjectionMatrix: plan.unjittered, jitterClip: plan.jitterClip,
        depth: { mode: "standard", clipRange: "minus-one-to-one" }, targetExtent: { width: 8, height: 8 },
        viewport: { x: 0, y: 0, width: 8, height: 8 }, scissor: null, cssExtent: null, devicePixelRatio: 1 });
      const left = createSceneRasterLeaseDraft(f.input);
      const right = createSceneRasterLeaseDraft({ ...f.input, options, plan, snapshot, viewId: "right" });
      expect(cancelSceneRasterLeaseDraft(left)).toBe(true);
      expect(() => assertSceneRasterLeaseDraftCurrent(right)).not.toThrow();
      expect(cancelSceneRasterLeaseDraft(right)).toBe(true);
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("closes an entered preparation that fails, without invoking an item getter", () => {
    const f = fixture();
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      let reads = 0;
      const item = { get geometry() { reads += 1; throw new Error("item getter invoked"); } } as unknown as RenderItem;
      expect(() => prepareSceneRasterLeaseDraft(draft, [item])).toThrow(/does not invoke item accessors/);
      expect(reads).toBe(0);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("closed");
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(false);
      expect(() => f.history.assertPlanCurrent(f.plan, f.device, 8, 8, f.viewProjection, f.options)).toThrow(/stale/);
      expect(f.history.planFrame(f.device, 8, 8, f.viewProjection, f.options)).not.toBe(f.plan);
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("does not reuse a draft across a physical frame boundary", () => {
    const f = fixture();
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      f.device.endFrame(); f.device.beginFrame(8, 8);
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).toThrow(/stale/);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("pending");
      cancelSceneRasterLeaseDraft(draft);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("closed");
    } finally { f.history.dispose(); f.device.dispose(); }
  });

  it("blocks reentrant cancellation while checking a draft", () => {
    const f = fixture();
    try {
      const draft = createSceneRasterLeaseDraft(f.input);
      const original = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(f.device), "activeFrameToken")!.get!;
      let attempt: unknown;
      let once = true;
      Object.defineProperty(f.device, "activeFrameToken", { configurable: true, get() {
        if (once) { once = false; try { cancelSceneRasterLeaseDraft(draft); } catch (error) { attempt = error; } }
        return Reflect.apply(original, f.device, []);
      } });
      expect(() => assertSceneRasterLeaseDraftCurrent(draft)).not.toThrow();
      expect(attempt).toBeInstanceOf(Error);
      expect((attempt as Error).message).toMatch(/already in use/);
      expect(sceneRasterLeaseDraftPhase(draft)).toBe("pending");
      expect(cancelSceneRasterLeaseDraft(draft)).toBe(true);
    } finally { f.history.dispose(); f.device.dispose(); }
  });
});
