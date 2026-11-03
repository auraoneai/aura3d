import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/engine/src/agent-api/app/mountRenderer", () => ({
  createProductionSceneRenderer: async () => ({
    backend: "webgl2",
    deviceLost: () => false,
    render: () => 1,
    viewProjection: () => new Float32Array(16),
    resetTemporalHistory() {},
    dispose() {}
  })
}));

import { bindOrbitPointer, defineAuraAssets, type AuraOrbitRig } from "@aura3d/engine";
import { acquirePointerCapture, releasePointerCaptureLease } from "@aura3d/input";
import { mountNativeCapabilityScenario } from "../../../examples/native-capabilities/index";

type Listener = (event: unknown) => void;

class FakeCanvas {
  width = 1280;
  height = 720;
  clientWidth = 1280;
  clientHeight = 720;
  style: { touchAction: string; [key: string]: string } = { touchAction: "pan-y" };
  dataset: Record<string, string> = {};
  parentElement = null;
  readonly listeners = new Map<string, Set<Listener>>();
  private readonly captures = new Set<number>();

  getBoundingClientRect() { return { width: 1280, height: 720, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: Listener) { this.listeners.get(type)?.delete(listener); }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); }
  emit(type: string, event: Record<string, unknown>) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

const assets = defineAuraAssets({
  subject: { type: "model", format: "glb", url: "/subject.glb", hash: `sha256-${"1".repeat(64)}` }
});

beforeEach(() => {
  vi.stubEnv("A3D_QR", "all");
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("window", {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: "", href: "http://localhost/" },
    addEventListener() {},
    removeEventListener() {}
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("native capability controls scenario", () => {
  it("orbits the named model from pointer input and detaches on disposal", async () => {
    const canvas = new FakeCanvas();
    const app = await mountNativeCapabilityScenario("controls", {
      target: canvas as unknown as HTMLCanvasElement, asset: assets.subject, autoStart: false
    });
    try {
      expect(app.camera).toBeDefined();
      app.step(0);
      const before = app.camera!.presented();
      expect(before.target).toEqual([-1, 0.8, 0]);
      canvas.emit("pointerdown", { pointerId: 1, clientX: 400, clientY: 300 });
      canvas.emit("pointermove", { pointerId: 1, clientX: 520, clientY: 330 });
      canvas.emit("pointerup", { pointerId: 1, clientX: 520, clientY: 330 });
      for (let index = 0; index < 12; index++) app.step(1 / 60);
      expect(app.camera!.presented().position).not.toEqual(before.position);
      expect(canvas.listeners.get("pointerdown")?.size).toBeGreaterThan(0);
    } finally {
      app.dispose();
    }
    expect(canvas.style.touchAction).toBe("pan-y");
    expect(canvas.listeners.get("pointerdown")?.size ?? 0).toBe(0);
    expect(canvas.listeners.get("pointermove")?.size ?? 0).toBe(0);
  });

  it("detaches the controls through asynchronous app disposal", async () => {
    const canvas = new FakeCanvas();
    const app = await mountNativeCapabilityScenario("controls", {
      target: canvas as unknown as HTMLCanvasElement, asset: assets.subject, autoStart: false
    });
    expect(canvas.listeners.get("pointerdown")?.size).toBeGreaterThan(0);
    await app.disposeAsync();
    expect(canvas.listeners.get("pointerdown")?.size ?? 0).toBe(0);
  });

  it("releases a captured drag on disposal without releasing another participant's lease", async () => {
    const canvas = new FakeCanvas();
    const app = await mountNativeCapabilityScenario("controls", {
      target: canvas as unknown as HTMLCanvasElement, asset: assets.subject, autoStart: false
    });
    canvas.emit("pointerdown", { pointerId: 9, clientX: 400, clientY: 300 });
    expect(canvas.hasPointerCapture(9)).toBe(true);
    const other = {};
    acquirePointerCapture(canvas, 9, other);
    app.dispose();
    expect(canvas.hasPointerCapture(9)).toBe(true);
    releasePointerCaptureLease(canvas, 9, other, true);
    expect(canvas.hasPointerCapture(9)).toBe(false);
  });

  it("releases its captured drag when disposed without another owner", async () => {
    const canvas = new FakeCanvas();
    const app = await mountNativeCapabilityScenario("controls", {
      target: canvas as unknown as HTMLCanvasElement, asset: assets.subject, autoStart: false
    });
    canvas.emit("pointerdown", { pointerId: 9, clientX: 400, clientY: 300 });
    expect(canvas.hasPointerCapture(9)).toBe(true);
    app.dispose();
    expect(canvas.hasPointerCapture(9)).toBe(false);
  });

  it("ignores other pointers and retires a cancelled drag", () => {
    const canvas = new FakeCanvas();
    const dragBy = vi.fn();
    const unbind = bindOrbitPointer(canvas, { dragBy } as unknown as AuraOrbitRig);
    canvas.emit("pointerdown", { pointerId: 1, clientX: 10, clientY: 20 });
    canvas.emit("pointermove", { pointerId: 2, clientX: 40, clientY: 40 });
    canvas.emit("pointercancel", { pointerId: 2 });
    expect(dragBy).not.toHaveBeenCalled();
    canvas.emit("pointermove", { pointerId: 1, clientX: 15, clientY: 25 });
    expect(dragBy).toHaveBeenCalledWith(5, 5, 0.25);
    canvas.emit("pointercancel", { pointerId: 1 });
    expect(canvas.hasPointerCapture(1)).toBe(false);
    canvas.emit("pointermove", { pointerId: 1, clientX: 20, clientY: 30 });
    expect(dragBy).toHaveBeenCalledTimes(1);
    unbind();
    expect(canvas.style.touchAction).toBe("pan-y");
  });

  it("rolls back listeners and touch action if binding fails", () => {
    class RejectingCanvas extends FakeCanvas {
      override addEventListener(type: string, listener: Listener) {
        super.addEventListener(type, listener);
        if (type === "pointerup") throw new Error("listener failed");
      }
    }
    const canvas = new RejectingCanvas();
    expect(() => bindOrbitPointer(canvas, { dragBy: vi.fn() } as unknown as AuraOrbitRig)).toThrow("listener failed");
    expect(canvas.style.touchAction).toBe("pan-y");
    expect([...canvas.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it("finishes an in-flight capture released reentrantly", () => {
    class ReentrantCanvas extends FakeCanvas {
      override setPointerCapture(id: number) {
        super.setPointerCapture(id);
        this.emit("pointerup", { pointerId: id });
      }
    }
    const canvas = new ReentrantCanvas();
    const dragBy = vi.fn();
    const unbind = bindOrbitPointer(canvas, { dragBy } as unknown as AuraOrbitRig);
    canvas.emit("pointerdown", { pointerId: 1, clientX: 10, clientY: 20 });
    expect(canvas.hasPointerCapture(1)).toBe(false);
    canvas.emit("pointermove", { pointerId: 1, clientX: 15, clientY: 25 });
    expect(dragBy).not.toHaveBeenCalled();
    unbind();
  });

  it("rejects non-finite sensitivity and ignores overflowing pointer deltas", () => {
    const canvas = new FakeCanvas();
    const dragBy = vi.fn();
    const rig = { dragBy } as unknown as AuraOrbitRig;
    expect(() => bindOrbitPointer(canvas, rig, { sensitivity: NaN })).toThrow(/sensitivity/i);
    expect(canvas.style.touchAction).toBe("pan-y");
    const unbind = bindOrbitPointer(canvas, rig);
    canvas.emit("pointerdown", { pointerId: 1, clientX: -Number.MAX_VALUE, clientY: 0 });
    canvas.emit("pointermove", { pointerId: 1, clientX: Number.MAX_VALUE, clientY: 0 });
    expect(dragBy).not.toHaveBeenCalled();
    unbind();
  });
});
