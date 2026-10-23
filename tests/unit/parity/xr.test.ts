import { describe, expect, it, vi } from "vitest";
import { WebXRSessionController } from "../../../packages/input/src/WebXRSessionController";
import { createAuraXRRuntime, type AuraXRRuntimeOptions } from "../../../packages/engine/src/agent-api/xr/xrRuntime";
import { createXRButton, type AuraXRButtonElementLike } from "../../../packages/engine/src/agent-api/xr/xrButton";
import {
  applyXRViewOverride,
  getXRViewCamera,
  invertRigidMatrix4,
  multiplyMatrix4,
  resolveXRView,
  setXRViewCamera
} from "../../../packages/engine/src/agent-api/xr/xrViewOverride";
import type { AuraXRViewCamera } from "../../../packages/engine/src/agent-api/xr/types";
import { parseThreeSource } from "../../../packages/aura3d-cli/src/migrate-three/parse";
import { threeMappingFor } from "../../../packages/aura3d-cli/src/migrate-three/mappings";
import { THREE_COMPAT_CODEMOD_IMPORTS } from "../../../packages/aura3d-cli/src/migrate-three/ImportMap";

// SC-04 (docs/workflows/threejs-parity-gaps.md): WebXR buttons + session runtime.
// Everything here runs against FAKE XR objects. The same runtime is exercised against the
// independent iwer WebXR emulator in tests/browser/parity-xr.spec.ts; a real headset and a
// native browser WebXR implementation are NOT exercised.

const translation = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const near = 0.1;
const far = 100;
const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, (-2 * far * near) / (far - near), 0];

const flush = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

const close = (actual: readonly number[], expected: readonly number[], digits = 9): void => {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, digits));
};

function makeView(eye: "left" | "right", x: number) {
  return {
    eye,
    projectionMatrix: projection,
    transform: { matrix: translation(x, 1.6, 0), inverse: { matrix: translation(-x, -1.6, 0) } }
  };
}

class FakeSession {
  readonly listeners = new Map<string, Set<() => void>>();
  rafCallback: ((time: number, frame: unknown) => void) | null = null;
  rafHandle = 0;
  readonly updates: Record<string, unknown>[] = [];
  readonly cancelAnimationFrame = vi.fn();
  ended = false;
  readonly inputSources = [];
  async requestReferenceSpace(type: string) {
    return { type };
  }
  requestAnimationFrame(callback: (time: number, frame: unknown) => void): number {
    this.rafCallback = callback;
    this.rafHandle += 1;
    return this.rafHandle;
  }
  async updateRenderState(state: Record<string, unknown>): Promise<void> {
    this.updates.push(state);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener));
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  async end(): Promise<void> {
    this.ended = true;
    for (const listener of [...(this.listeners.get("end") ?? [])]) listener();
  }
  /** Run the next XR animation frame with two eyes. */
  tick(time: number, views: readonly unknown[] = [makeView("left", -0.03), makeView("right", 0.03)]): void {
    const callback = this.rafCallback;
    if (!callback) throw new Error("no XR frame scheduled");
    callback(time, { getViewerPose: () => ({ views }) });
  }
}

class FakeLayer {
  readonly framebuffer = { id: "xr-framebuffer" };
  readonly framebufferWidth = 2000;
  readonly framebufferHeight = 1000;
  constructor(readonly session: unknown, readonly gl: unknown, readonly init?: unknown) {}
  getViewport(view: { eye?: string }) {
    return view.eye === "left" ? { x: 0, y: 0, width: 1000, height: 1000 } : { x: 1000, y: 0, width: 1000, height: 1000 };
  }
}

function makeRig(overrides: Partial<AuraXRRuntimeOptions> & { supported?: boolean; failUpdate?: boolean } = {}) {
  const session = new FakeSession();
  if (overrides.failUpdate) session.updateRenderState = async () => { throw new Error("updateRenderState rejected"); };
  const requestSession = vi.fn(async () => session);
  const system = {
    isSessionSupported: vi.fn(async () => overrides.supported ?? true),
    requestSession
  };
  const device = { setExternalFramebuffer: vi.fn(), setViewport: vi.fn(), resetViewport: vi.fn() };
  const key = {};
  let appClock = 5;
  const seen: { time: number; camera: AuraXRViewCamera | undefined }[] = [];
  const gl = { makeXRCompatible: vi.fn(async () => undefined) };
  const calls = { pause: vi.fn(), resume: vi.fn() };
  const runtime = createAuraXRRuntime({
    key,
    xr: system as never,
    getGL: () => gl,
    layerConstructor: FakeLayer as never,
    getDevice: () => device,
    renderFrame: (time) => { seen.push({ time, camera: getXRViewCamera(key) }); },
    pauseLoop: calls.pause,
    resumeLoop: calls.resume,
    getTime: () => appClock,
    setTime: (seconds) => { appClock = seconds; },
    depthRange: () => ({ near: 0.05, far: 200 }),
    canvasSize: () => ({ width: 640, height: 480 }),
    ...overrides
  });
  return { runtime, session, system, requestSession, device, key, seen, gl, calls, clock: () => appClock };
}

describe("xr math: pose -> camera matrices", () => {
  it("resolves view, projection, viewProjection and eye from an XRView", () => {
    const camera = resolveXRView(makeView("left", -0.03), { x: 0, y: 0, width: 1000, height: 1000 })!;
    expect(camera.eye).toBe("left");
    close(camera.viewMatrix, translation(0.03, -1.6, 0));
    close(camera.eyePosition, [-0.03, 1.6, 0]);
    // P * V columns worked out by hand: V has identity rotation, so only column 3 changes.
    close(camera.viewProjectionMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0.03, -1.6, (-2 * far * near) / (far - near), 0]);
  });

  it("derives the view matrix from transform.matrix when the inverse is absent", () => {
    const view = { eye: "right" as const, projectionMatrix: projection, transform: { matrix: translation(0.03, 1.6, 0) } };
    const camera = resolveXRView(view, { x: 0, y: 0, width: 1, height: 1 })!;
    close(camera.viewMatrix, translation(-0.03, -1.6, 0));
    close(camera.eyePosition, [0.03, 1.6, 0]);
  });

  it("inverts a rotated rigid transform exactly (Y 90 degrees + translation)", () => {
    const m = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 2, 3, 1];
    const inverse = invertRigidMatrix4(m);
    close(inverse, [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 3, -2, -1, 1]);
    close(multiplyMatrix4(m, inverse), translation(0, 0, 0));
  });

  it("rejects views with missing or non-finite matrices instead of warping the camera", () => {
    const viewport = { x: 0, y: 0, width: 1, height: 1 };
    expect(resolveXRView({ eye: "left" }, viewport)).toBeNull();
    expect(resolveXRView({ ...makeView("left", 0), projectionMatrix: [...projection.slice(0, 15), Number.NaN] }, viewport)).toBeNull();
    expect(resolveXRView({ eye: "left", projectionMatrix: projection }, viewport)).toBeNull();
  });
});

describe("xr view override seam", () => {
  const source = { collectRenderItems: () => [], cameraPosition: [9, 9, 9] as const };
  const baseCamera = { viewProjectionMatrix: translation(0, 0, 0), layerMask: 4 };

  it("passes frames through untouched when no eye is installed", () => {
    const key = {};
    const out = applyXRViewOverride(key, { source, camera: baseCamera });
    expect(out.source).toBe(source);
    expect(out.camera).toBe(baseCamera);
  });

  it("replaces matrices and eye position while an eye is installed, keeps layerMask, never mutates the source", () => {
    const key = {};
    const eye = resolveXRView(makeView("right", 0.03), { x: 1000, y: 0, width: 1000, height: 1000 })!;
    setXRViewCamera(key, eye);
    const out = applyXRViewOverride(key, { source, camera: baseCamera });
    expect((out.source as typeof source).cameraPosition).toEqual([0.03, 1.6, 0]);
    expect(out.source).not.toBe(source);
    expect(source.cameraPosition).toEqual([9, 9, 9]);
    expect(out.camera).toMatchObject({ layerMask: 4, viewMatrix: eye.viewMatrix, projectionMatrix: eye.projectionMatrix, viewProjectionMatrix: eye.viewProjectionMatrix });
    setXRViewCamera(key, undefined);
    expect(applyXRViewOverride(key, { source, camera: baseCamera }).camera).toBe(baseCamera);
  });
});

describe("app.xr runtime lifecycle", () => {
  it("enters a session: requests the mode, binds a layer, pauses the window loop, emits sessionstart", async () => {
    const rig = makeRig();
    const started = vi.fn();
    rig.runtime.on("sessionstart", started);
    const result = await rig.runtime.enter("immersive-vr", { requiredFeatures: ["local-floor"], optionalFeatures: ["hand-tracking"] });
    expect(result).toMatchObject({ supported: true, started: true, mode: "immersive-vr" });
    expect(rig.requestSession).toHaveBeenCalledWith("immersive-vr", { requiredFeatures: ["local-floor"], optionalFeatures: ["hand-tracking"] });
    expect(rig.gl.makeXRCompatible).toHaveBeenCalledOnce();
    expect(rig.session.updates).toHaveLength(1);
    expect(rig.session.updates[0]).toMatchObject({ depthNear: 0.05, depthFar: 200 });
    expect(rig.session.updates[0]!.baseLayer).toBeInstanceOf(FakeLayer);
    expect(rig.calls.pause).toHaveBeenCalledOnce();
    expect(rig.runtime.isPresenting).toBe(true);
    expect(rig.runtime.mode).toBe("immersive-vr");
    expect(started).toHaveBeenCalledWith({ mode: "immersive-vr" });
    expect((await rig.runtime.enter()).reason).toBe("already-presenting");
  });

  it("renders every eye into its viewport with its own camera, then restores the device", async () => {
    const rig = makeRig();
    const frames = vi.fn();
    rig.runtime.on("frame", frames);
    await rig.runtime.enter();
    rig.session.tick(1000);
    expect(rig.device.setExternalFramebuffer).toHaveBeenNthCalledWith(1, { id: "xr-framebuffer" }, 2000, 1000);
    // Persistent: a frame-scoped viewport would be reset by the device's beginFrame and the eye would render full-frame.
    expect(rig.device.setViewport.mock.calls).toEqual([[0, 0, 1000, 1000, { persistent: true }], [1000, 0, 1000, 1000, { persistent: true }]]);
    // ...and it is handed back (cleared) once the frame is done.
    expect(rig.device.resetViewport).toHaveBeenCalledTimes(1);
    expect(rig.seen).toHaveLength(2);
    expect(rig.seen.map((entry) => entry.camera?.eye)).toEqual(["left", "right"]);
    close(rig.seen[0]!.camera!.eyePosition, [-0.03, 1.6, 0]);
    close(rig.seen[1]!.camera!.eyePosition, [0.03, 1.6, 0]);
    expect(rig.seen[1]!.camera!.viewport).toEqual({ x: 1000, y: 0, width: 1000, height: 1000 });
    // The framebuffer is released and the eye cleared once the frame is done.
    expect(rig.device.setExternalFramebuffer).toHaveBeenLastCalledWith(null, 640, 480);
    expect(getXRViewCamera(rig.key)).toBeUndefined();
    expect(frames).toHaveBeenCalledWith(expect.objectContaining({ time: 1000, viewCount: 2 }));
    expect(rig.runtime.lastSample?.active).toBe(true);
    // The next XR frame is scheduled before rendering, so a render error cannot stall the loop silently.
    expect(rig.session.rafHandle).toBe(2);
  });

  it("renders into the canvas when the layer reports a null framebuffer (inline sessions, emulators), still per eye", async () => {
    class NullFramebufferLayer extends FakeLayer {
      override readonly framebuffer = null as unknown as { id: string };
    }
    const rig = makeRig({ layerConstructor: NullFramebufferLayer as never });
    const errors = vi.fn();
    rig.runtime.on("error", errors);
    await rig.runtime.enter();
    rig.session.tick(1000);
    expect(rig.device.setExternalFramebuffer).toHaveBeenNthCalledWith(1, null, 2000, 1000);
    expect(rig.device.setViewport.mock.calls).toEqual([[0, 0, 1000, 1000, { persistent: true }], [1000, 0, 1000, 1000, { persistent: true }]]);
    expect(rig.seen).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
    expect(rig.runtime.isPresenting).toBe(true);
  });

  it("clears the persistent viewport when the session ends, so the app's own frames are full-frame again", async () => {
    const rig = makeRig();
    await rig.runtime.enter();
    rig.session.tick(1000);
    rig.device.resetViewport.mockClear();
    await rig.runtime.exit();
    expect(rig.device.resetViewport).toHaveBeenCalled();
    expect(rig.device.setExternalFramebuffer).toHaveBeenLastCalledWith(null, 640, 480);
  });

  it("continues the app clock from the XR frame times and writes it back", async () => {
    const rig = makeRig();
    await rig.runtime.enter();
    rig.session.tick(10_000);
    rig.session.tick(10_500);
    expect(rig.seen.map((entry) => entry.time)).toEqual([5, 5, 5.5, 5.5]);
    expect(rig.clock()).toBe(5.5);
  });

  it("skips an eye with invalid matrices, reports it once, and renders the other", async () => {
    const rig = makeRig();
    const errors: string[] = [];
    rig.runtime.on("error", (e) => errors.push(e.code));
    await rig.runtime.enter();
    const bad = { eye: "left" as const, projectionMatrix: [1, 2, 3], transform: {} };
    rig.session.tick(1, [bad, makeView("right", 0.03)]);
    rig.session.tick(2, [bad, makeView("right", 0.03)]);
    expect(rig.seen.map((entry) => entry.camera?.eye)).toEqual(["right", "right"]);
    expect(errors.filter((code) => code === "XR_VIEW_MATRICES_INVALID")).toHaveLength(1);
  });

  it("skips an eye whose viewport has no pixels (a mono device's zero-width right view) instead of failing the session", async () => {
    class MonoLayer extends FakeLayer {
      override getViewport(view: { eye?: string }) {
        return view.eye === "left" ? { x: 0, y: 0, width: 2000, height: 1000 } : { x: 2000, y: 0, width: 0, height: 1000 };
      }
    }
    const rig = makeRig({ layerConstructor: MonoLayer as never });
    const errors = vi.fn();
    const frames = vi.fn();
    rig.runtime.on("error", errors);
    rig.runtime.on("frame", frames);
    await rig.runtime.enter();
    rig.session.tick(1000);
    expect(rig.device.setViewport).toHaveBeenCalledTimes(1);
    expect(rig.device.setViewport).toHaveBeenCalledWith(0, 0, 2000, 1000, { persistent: true });
    expect(rig.seen).toHaveLength(1);
    expect(rig.seen[0]!.camera?.eye).toBe("left");
    expect(frames).toHaveBeenCalledWith(expect.objectContaining({ viewCount: 1 }));
    expect(errors).not.toHaveBeenCalled();
    expect(rig.runtime.isPresenting).toBe(true);
  });

  it("skips rendering on a frame with no viewer pose (tracking lost) but keeps the session", async () => {
    const rig = makeRig();
    await rig.runtime.enter();
    rig.session.tick(1, []);
    expect(rig.seen).toHaveLength(0);
    expect(rig.runtime.isPresenting).toBe(true);
    expect(rig.device.setViewport).not.toHaveBeenCalled();
  });

  it("exit() ends the session and cleans up: loop resumed, frame cancelled, listener removed, device released", async () => {
    const rig = makeRig();
    const ended = vi.fn();
    rig.runtime.on("sessionend", ended);
    await rig.runtime.enter();
    await rig.runtime.exit();
    expect(rig.session.ended).toBe(true);
    expect(rig.runtime.isPresenting).toBe(false);
    expect(rig.runtime.mode).toBeNull();
    expect(rig.calls.resume).toHaveBeenCalledOnce();
    expect(rig.session.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(rig.session.listeners.get("end")?.size ?? 0).toBe(0);
    expect(rig.device.setExternalFramebuffer).toHaveBeenLastCalledWith(null, 640, 480);
    expect(ended).toHaveBeenCalledOnce();
    await rig.runtime.exit();
    expect(ended).toHaveBeenCalledOnce();
  });

  it("cleans up exactly once when the browser ends the session itself", async () => {
    const rig = makeRig();
    const ended = vi.fn();
    rig.runtime.on("sessionend", ended);
    await rig.runtime.enter();
    await rig.session.end();
    expect(rig.runtime.isPresenting).toBe(false);
    expect(rig.calls.resume).toHaveBeenCalledOnce();
    expect(ended).toHaveBeenCalledOnce();
    rig.session.tick(1);
    expect(rig.seen).toHaveLength(0);
  });

  it("a render failure reports XR_RENDER_FAILED, ends the session and clears the eye", async () => {
    const rig = makeRig({ renderFrame: () => { throw new Error("gpu exploded"); } });
    const errors: { code: string; message: string }[] = [];
    rig.runtime.on("error", (e) => errors.push(e));
    await rig.runtime.enter();
    rig.session.tick(1);
    await flush();
    expect(errors).toEqual([{ code: "XR_RENDER_FAILED", message: "gpu exploded" }]);
    expect(rig.runtime.isPresenting).toBe(false);
    expect(rig.session.ended).toBe(true);
    expect(getXRViewCamera(rig.key)).toBeUndefined();
  });

  it("dispose() ends an active session", async () => {
    const rig = makeRig();
    await rig.runtime.enter();
    rig.runtime.dispose();
    await flush();
    expect(rig.session.ended).toBe(true);
    expect((await rig.runtime.enter()).started).toBe(false);
  });
});

describe("app.xr refuses to start without a real render path (WS-3.4)", () => {
  it("returns render-path-unavailable and never requests a session when the device lacks the bridge", async () => {
    const rig = makeRig({ getDevice: () => ({}) });
    const result = await rig.runtime.enter();
    expect(result).toMatchObject({ supported: true, started: false, reason: "render-path-unavailable" });
    expect(rig.requestSession).not.toHaveBeenCalled();
    expect(rig.calls.pause).not.toHaveBeenCalled();
  });

  it("requires setViewport as well as setExternalFramebuffer (eyes share one framebuffer)", async () => {
    const rig = makeRig({ getDevice: () => ({ setExternalFramebuffer: vi.fn() }) });
    expect((await rig.runtime.enter()).reason).toBe("render-path-unavailable");
    const noDevice = makeRig({ getDevice: () => undefined });
    expect((await noDevice.runtime.enter()).reason).toBe("render-path-unavailable");
  });

  it("reports no-webxr, unsupported, no-webgl-context and no-xr-layer without starting", async () => {
    const none = createAuraXRRuntime({ key: {}, getGL: () => ({}), getDevice: () => ({}), renderFrame: () => undefined });
    expect((await none.enter()).reason).toBe("no-webxr");
    const unsupported = makeRig({ supported: false });
    expect(await unsupported.runtime.enter("immersive-ar")).toMatchObject({ supported: false, started: false, reason: "unsupported", mode: "immersive-ar" });
    expect(unsupported.requestSession).not.toHaveBeenCalled();
    expect((await makeRig({ getGL: () => undefined }).runtime.enter()).reason).toBe("no-webgl-context");
    const noLayer = makeRig({ layerConstructor: undefined });
    expect((await noLayer.runtime.enter()).reason).toBe("no-xr-layer");
  });

  it("ends the session and reports session-failed when the layer cannot be attached", async () => {
    const rig = makeRig({ failUpdate: true });
    const result = await rig.runtime.enter();
    expect(result).toMatchObject({ started: false, reason: "session-failed", message: "updateRenderState rejected" });
    expect(rig.session.ended).toBe(true);
    expect(rig.runtime.isPresenting).toBe(false);
    expect(rig.calls.pause).not.toHaveBeenCalled();
  });
});

class FakeElement implements AuraXRButtonElementLike {
  textContent: string | null = "";
  disabled = false;
  title = "";
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  handlers = new Set<() => void>();
  removed = false;
  addEventListener(_type: "click", listener: () => void): void {
    this.handlers.add(listener);
  }
  removeEventListener(_type: "click", listener: () => void): void {
    this.handlers.delete(listener);
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  remove(): void {
    this.removed = true;
  }
  click(): void {
    for (const handler of [...this.handlers]) handler();
  }
}

function makeButton(rig: ReturnType<typeof makeRig>, extra: { mode?: "immersive-vr" | "immersive-ar" } = {}) {
  const elements: FakeElement[] = [];
  const parent = { appendChild: vi.fn() };
  const handle = createXRButton({
    app: { xr: rig.runtime },
    document: { createElement: () => { const el = new FakeElement(); elements.push(el); return el; } },
    parent: parent as never,
    ...extra
  });
  return { handle, element: elements[0]!, parent };
}

describe("xr.button()", () => {
  it("shows CHECKING, then ENTER VR when supported, and appends to the parent", async () => {
    const rig = makeRig();
    const { handle, element, parent } = makeButton(rig);
    expect(element.textContent).toBe("CHECKING VR");
    expect(element.disabled).toBe(true);
    await flush();
    expect(handle.state).toBe("ready");
    expect(element.textContent).toBe("ENTER VR");
    expect(element.disabled).toBe(false);
    expect(element.attributes["data-xr-state"]).toBe("ready");
    expect(parent.appendChild).toHaveBeenCalledWith(element);
    expect(rig.system.isSessionSupported).toHaveBeenCalledWith("immersive-vr");
  });

  it("shows VR NOT SUPPORTED, disabled, with an explanatory title when unsupported", async () => {
    const rig = makeRig({ supported: false });
    const { handle, element } = makeButton(rig);
    await flush();
    expect(handle.state).toBe("unsupported");
    expect(element.textContent).toBe("VR NOT SUPPORTED");
    expect(element.disabled).toBe(true);
    expect(element.title).toContain("immersive-vr");
    element.click();
    await flush();
    expect(rig.requestSession).not.toHaveBeenCalled();
  });

  it("uses AR labels and asks for immersive-ar", async () => {
    const rig = makeRig();
    const { element } = makeButton(rig, { mode: "immersive-ar" });
    await flush();
    expect(element.textContent).toBe("ENTER AR");
    expect(rig.system.isSessionSupported).toHaveBeenCalledWith("immersive-ar");
  });

  it("is unsupported when navigator.xr is missing", async () => {
    const runtime = createAuraXRRuntime({ key: {}, getGL: () => ({}), getDevice: () => ({}), renderFrame: () => undefined });
    const elements: FakeElement[] = [];
    createXRButton({ app: { xr: runtime }, document: { createElement: () => { const el = new FakeElement(); elements.push(el); return el; } } });
    await flush();
    expect(elements[0]!.textContent).toBe("VR NOT SUPPORTED");
  });

  it("click enters the session (STOP while presenting) and the next click exits", async () => {
    const rig = makeRig();
    const { handle, element } = makeButton(rig);
    await flush();
    element.click();
    await flush();
    expect(rig.runtime.isPresenting).toBe(true);
    expect(handle.state).toBe("presenting");
    expect(element.textContent).toBe("STOP");
    element.click();
    await flush();
    expect(rig.runtime.isPresenting).toBe(false);
    expect(rig.session.ended).toBe(true);
    expect(handle.state).toBe("ready");
    expect(element.textContent).toBe("ENTER VR");
  });

  it("falls back to ENTER with the reason as the title when entering fails, so it can be retried", async () => {
    const rig = makeRig({ getDevice: () => ({}) });
    const { handle, element } = makeButton(rig);
    await flush();
    element.click();
    await flush();
    expect(handle.state).toBe("ready");
    expect(element.title).toContain("setExternalFramebuffer");
    expect(rig.requestSession).not.toHaveBeenCalled();
  });

  it("dispose() removes the handler, the listeners and the element", async () => {
    const rig = makeRig();
    const { handle, element } = makeButton(rig);
    await flush();
    handle.dispose();
    expect(element.handlers.size).toBe(0);
    expect(element.removed).toBe(true);
    element.click();
    await flush();
    expect(rig.requestSession).not.toHaveBeenCalled();
  });

  it("throws a clear error without a document", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
    try {
      expect(() => createXRButton({ app: { xr: makeRig().runtime } })).toThrow(/requires a DOM document/);
    } finally {
      if (original) Object.defineProperty(globalThis, "document", original);
      else delete (globalThis as { document?: unknown }).document;
    }
  });

  it("accepts an app whose `xr` is typed optional and throws a clear error when the runtime is missing", () => {
    const fakeDocument = { createElement: () => new FakeElement() };
    // A plain app-shaped holder with the runtime works (AuraApp.xr is `xr?:`).
    const optionalTyped: { readonly xr?: ReturnType<typeof makeRig>["runtime"] } = { xr: makeRig().runtime };
    expect(() => createXRButton({ app: optionalTyped, document: fakeDocument }).dispose()).not.toThrow();
    expect(() => createXRButton({ app: {}, document: fakeDocument })).toThrow(/requires an app with an XR runtime/);
  });
});

describe("WebXRSessionController session accessors", () => {
  it("exposes the live session and reference space only while active", async () => {
    const session = new FakeSession();
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } as never, mode: "immersive-vr" });
    expect(controller.xrSession).toBeNull();
    expect(controller.xrReferenceSpace).toBeNull();
    await controller.start();
    expect(controller.xrSession).toBe(session);
    expect(controller.xrReferenceSpace).toEqual({ type: "local-floor" });
    await controller.end();
    expect(controller.xrSession).toBeNull();
    expect(controller.xrReferenceSpace).toBeNull();
  });
});

describe("WebXRSessionController reference-space negotiation (found by the iwer run)", () => {
  // A browser rejects `requestReferenceSpace("local-floor")` unless it was requested as a session feature.
  const makeSystem = (grant: readonly string[], alwaysReject = false) => {
    const end = vi.fn(async () => undefined);
    const requestReferenceSpace = vi.fn(async (type: string) => {
      if (alwaysReject || (type !== "viewer" && type !== "local" && !grant.includes(type))) {
        throw new Error("The requested reference space type is not supported.");
      }
      return { type };
    });
    const session = { requestReferenceSpace, end, enabledFeatures: grant };
    const requestSession = vi.fn(async (_mode: string, _init: unknown) => session);
    const system = { isSessionSupported: async () => true, requestSession };
    return { system: system as never, requestSession, requestReferenceSpace, end };
  };

  it("requests the default local-floor space as an optional session feature", async () => {
    const rig = makeSystem(["local-floor"]);
    const controller = new WebXRSessionController({ xr: rig.system });
    await expect(controller.start()).resolves.toMatchObject({ started: true, referenceSpace: "local-floor" });
    expect(rig.requestSession).toHaveBeenCalledWith("immersive-vr", { requiredFeatures: [], optionalFeatures: ["local-floor"] });
  });

  it("does not duplicate a space the caller already listed, and adds nothing for local or viewer", async () => {
    const listed = makeSystem(["local-floor"]);
    await new WebXRSessionController({ xr: listed.system, requiredFeatures: ["local-floor"] }).start();
    expect(listed.requestSession).toHaveBeenCalledWith("immersive-vr", { requiredFeatures: ["local-floor"], optionalFeatures: [] });
    for (const referenceSpace of ["local", "viewer"] as const) {
      const rig = makeSystem([]);
      await new WebXRSessionController({ xr: rig.system, referenceSpace }).start();
      expect(rig.requestSession).toHaveBeenCalledWith("immersive-vr", { requiredFeatures: [], optionalFeatures: [] });
    }
  });

  it("degrades the default local-floor to local when the device grants no floor, like three's VRButton", async () => {
    const rig = makeSystem([]);
    const controller = new WebXRSessionController({ xr: rig.system });
    await expect(controller.start()).resolves.toMatchObject({ started: true, referenceSpace: "local" });
    expect(rig.requestReferenceSpace.mock.calls.map(([type]) => type)).toEqual(["local-floor", "local"]);
    expect(rig.end).not.toHaveBeenCalled();
    expect(controller.active).toBe(true);
  });

  it("does not silently degrade an explicit local-floor request, and ends the session it opened", async () => {
    const rig = makeSystem([]);
    const controller = new WebXRSessionController({ xr: rig.system, referenceSpace: "local-floor" });
    await expect(controller.start()).rejects.toThrow(/reference space type is not supported/);
    expect(rig.end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
    expect(controller.xrReferenceSpace).toBeNull();
  });

  it("ends the session when even the local fallback fails, so none is left open", async () => {
    const rig = makeSystem([], true);
    const controller = new WebXRSessionController({ xr: rig.system });
    await expect(controller.start()).rejects.toThrow(/not supported/);
    expect(rig.requestReferenceSpace.mock.calls.map(([type]) => type)).toEqual(["local-floor", "local"]);
    expect(rig.end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });
});

describe("migrate-three XR rows (approximate: verified against the iwer emulator, not a headset)", () => {
  const source = [
    'import { VRButton } from "three/addons/webxr/VRButton.js";',
    'import { ARButton } from "three/addons/webxr/ARButton.js";',
    "renderer.xr.enabled = true;",
    "document.body.appendChild(VRButton.createButton(renderer));",
    "document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));",
    "const controller = renderer.xr.getController(0);"
  ].join("\n");

  it("detects VRButton/ARButton.createButton and renderer.xr.* on the right lines", () => {
    const found = parseThreeSource(source).filter((c) => c.construct !== "import").map((c) => `${c.construct}@${c.line}`);
    expect(found).toEqual(["WebXRManager@3", "VRButton.createButton@4", "ARButton.createButton@5", "WebXRManager@6"]);
  });

  it("labels every XR row approximate (never exact) and states the emulator-only verification", () => {
    for (const construct of ["VRButton.createButton", "ARButton.createButton", "WebXRManager"]) {
      const row = threeMappingFor(construct)!;
      expect(row.mapping).toBe("approximate");
      expect(row.note).not.toMatch(/PENDING/);
      expect(row.note).toMatch(/iwer emulator|VRButton\.createButton/);
    }
    expect(threeMappingFor("VRButton.createButton")!.engineImport).toBe("xr");
  });

  it("routes the three/addons/webxr specifiers through the codemod instead of a broken named import", () => {
    for (const specifier of ["three/addons/webxr/VRButton.js", "three/addons/webxr/ARButton.js", "three/examples/jsm/webxr/VRButton.js", "three/examples/jsm/webxr/ARButton.js"]) {
      expect(THREE_COMPAT_CODEMOD_IMPORTS[specifier]).toMatch(/xr\.button/);
    }
  });
});
