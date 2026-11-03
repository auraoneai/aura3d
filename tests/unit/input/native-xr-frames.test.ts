import { describe, expect, it, vi } from "vitest";
import {
  WebXRSessionController,
  type A3DXREventLike, type A3DXRFrameLike, type A3DXRReferenceSpaceLike, type A3DXRSessionLike
} from "../../../packages/input/src/WebXRSessionController";
import { createAuraXRRuntime } from "../../../packages/engine/src/agent-api/xr/xrRuntime";
import { xr } from "../../../packages/engine/src/agent-api/xr/index";

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const matrixAt = (x: number, y: number, z: number) => { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; };
const point = (x: number, y: number, z: number, w?: number) => ({ x, y, z, ...(w !== undefined ? { w } : {}) });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
class Target {
  readonly listeners = new Map<string, Set<(event: A3DXREventLike) => void>>();
  addEventListener(type: string, cb: (event: A3DXREventLike) => void) { this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(cb)); }
  removeEventListener(type: string, cb: (event: A3DXREventLike) => void) { this.listeners.get(type)?.delete(cb); }
  fire(type: string, event: A3DXREventLike = {}) { for (const cb of [...(this.listeners.get(type) ?? [])]) cb(event); }
}
class Session extends Target implements A3DXRSessionLike {
  readonly viewer = new Target();
  readonly local = new Target();
  readonly inputSources: NonNullable<A3DXRSessionLike["inputSources"]> = [];
  readonly enabledFeatures = ["hit-test", "hand-tracking", "light-estimation"];
  depthUsage?: "cpu-optimized" | "gpu-optimized";
  visibilityState = "visible";
  readonly cancel = vi.fn();
  readonly hitSource = { cancel: this.cancel };
  readonly probe = {};
  readonly end = vi.fn(async () => { this.fire("end"); });
  requestReferenceSpace = vi.fn(async (type: string) => type === "viewer" ? this.viewer : this.local);
  requestHitTestSource = vi.fn(async (_options: { readonly space: A3DXRReferenceSpaceLike }) => this.hitSource);
  readonly requestLightProbe = vi.fn(async () => this.probe);
  updateRenderState = vi.fn(async (_state: unknown) => undefined);
  readonly requestAnimationFrame = vi.fn((_cb: (time: number, frame: A3DXRFrameLike) => void) => 1);
  readonly cancelAnimationFrame = vi.fn();
}
class BaseLayer {
  readonly framebuffer = {};
  readonly framebufferWidth = 100;
  readonly framebufferHeight = 100;
  fixedFoveation = 0;
  getViewport() { return { x: 0, y: 0, width: 100, height: 100 }; }
}
function rig(session: Session, more: Record<string, unknown> = {}) {
  const xr = { isSessionSupported: vi.fn(async () => true), requestSession: vi.fn(async () => session) };
  const gl = { makeXRCompatible: vi.fn(async () => undefined) };
  const device = { setExternalFramebuffer: vi.fn(), setViewport: vi.fn(), resetViewport: vi.fn() };
  const renderFrame = vi.fn();
  const runtime = createAuraXRRuntime({ key: {}, xr, getGL: () => gl, layerConstructor: BaseLayer, getDevice: () => device, renderFrame, ...more });
  return { runtime, xr, gl, device, renderFrame };
}

describe("native WebXR frame contracts (browser-shaped mocks; no device session)", () => {
  it("samples native poses, iterable joint spaces, hit poses, planes, depth and light in the chosen reference space", async () => {
    const session = new Session();
    const wristSpace = {};
    const gripSpace = {};
    const planeSpace = {};
    const input = { handedness: "left" as const, gripSpace, hand: new Map([["wrist", wristSpace]]) };
    (session.inputSources as typeof input[]).push(input);
    const xr = { requestSession: async () => session };
    const controller = new WebXRSessionController({ xr, referenceSpace: "local", requiredFeatures: ["hit-test", "light-estimation"] });
    await controller.start();
    expect(session.requestHitTestSource).toHaveBeenCalledWith({ space: session.viewer });
    const hitPose = vi.fn((space: unknown) => {
      expect(space).toBe(session.local);
      return { transform: { position: point(1, 2, -3), orientation: point(0, 0, Math.SQRT1_2, Math.SQRT1_2) } };
    });
    const view = { eye: "left" as const, projectionMatrix: identity(), transform: { matrix: identity(), inverse: { matrix: identity() } } };
    const getJointPose = vi.fn((joint: unknown, space: unknown) => {
      expect(joint).toBe(wristSpace); expect(space).toBe(session.local);
      return { transform: { position: point(0.2, 1, -0.5), orientation: point(0, 0, 0, 1) }, radius: 0.015 };
    });
    const frame: A3DXRFrameLike = {
      getViewerPose: (space) => { expect(space).toBe(session.local); return { transform: { position: point(0, 1.6, 0), orientation: point(0, 0, 0, 1) }, views: [view] }; },
      getPose: (space, base) => { expect(base).toBe(session.local); return { transform: { matrix: matrixAt(space === gripSpace ? 2 : 3, 0, 0) } }; },
      getJointPose,
      getHitTestResults: (source) => { expect(source).toBe(session.hitSource); return [{ getPose: hitPose }]; },
      detectedPlanes: new Set([{ planeSpace, polygon: [point(0, 0, 0), point(1, 0, 0)], orientation: "horizontal", lastChangedTime: 42 }]),
      getDepthInformation: () => ({ width: 2, height: 1, rawValueToMeters: 0.001, data: new Uint16Array([1000, 2000]), normDepthBufferFromNormView: { matrix: identity() } }),
      getLightEstimate: (probe) => { expect(probe).toBe(session.probe); return { primaryLightDirection: point(0, 1, 0), primaryLightIntensity: point(2, 3, 4), sphericalHarmonicsCoefficients: new Float32Array([0.1, 0.2]) }; }
    };
    const sample = controller.sampleFrame(frame);
    expect(sample.camera).toMatchObject({ tracked: true, position: [0, 1.6, 0], orientation: [0, 0, 0, 1], viewMatrix: Array.from(identity()) });
    expect(sample.controllers[0]?.gripMatrix?.[12]).toBe(2);
    expect(sample.hands[0]?.joints.wrist).toMatchObject({ position: [0.2, 1, -0.5], orientation: [0, 0, 0, 1], radius: 0.015 });
    expect(sample.hands[0]?.id).toBe(sample.controllers[0]?.id);
    expect(sample.hitTests[0]?.position).toEqual([1, 2, -3]);
    expect(sample.hitTests[0]?.normal[0]).toBeCloseTo(-1);
    expect(sample.planes[0]).toMatchObject({ polygon: [[0, 0, 0], [1, 0, 0]], orientation: "horizontal", lastChangedTime: 42 });
    expect(sample.planes[0]?.matrix?.[12]).toBe(3);
    expect(sample.depth[0]).toMatchObject({ width: 2, height: 1, rawValueToMeters: 0.001 });
    expect(sample.light).toMatchObject({ direction: [0, 1, 0], intensity: [2, 3, 4] });
    expect(sample.capabilities).toMatchObject({ handTracking: true, hitTest: true, planeDetection: true, depthSensing: true, lightEstimation: true });
    expect(controller.sampleFrame(frame).controllers[0]?.id).toBe(sample.controllers[0]?.id);
    await controller.end();
    expect(session.cancel).toHaveBeenCalledOnce();
    expect(session.end).toHaveBeenCalledOnce();
  });

  it("closes sessions acquired after cancellation and cancels late hit-test sources", async () => {
    const session = new Session();
    const pendingSession = deferred<A3DXRSessionLike>();
    const controller = new WebXRSessionController({ xr: { requestSession: () => pendingSession.promise } });
    const start = controller.start();
    await flush();
    await controller.end();
    pendingSession.resolve(session);
    expect((await start).started).toBe(false);
    expect(session.end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);

    const pendingHit = deferred<{ cancel(): void }>();
    const pendingHitSession = new Session();
    pendingHitSession.requestHitTestSource.mockImplementation(async () => {
      const source = await pendingHit.promise;
      return { cancel: vi.fn(() => source.cancel()) };
    });
    const second = new WebXRSessionController({ xr: { requestSession: async () => pendingHitSession }, requiredFeatures: ["hit-test"] });
    const starting = second.start();
    await flush();
    await second.end();
    const cancel = vi.fn();
    pendingHit.resolve({ cancel });
    expect((await starting).started).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(pendingHitSession.end).toHaveBeenCalledOnce();
    expect(second.active).toBe(false);
  });

  it("disposes an in-flight controller and closes a session delivered afterward", async () => {
    const late = deferred<A3DXRSessionLike>();
    const session = new Session();
    const controller = new WebXRSessionController({ xr: { requestSession: () => late.promise } });
    const pending = controller.start();
    await flush();
    await controller.dispose();
    late.resolve(session);
    expect((await pending).started).toBe(false);
    expect(session.end).toHaveBeenCalledOnce();
    expect(await controller.start()).toMatchObject({ supported: false, started: false });
  });

  it("keeps the owner busy after cancellation until a late session finishes closing", async () => {
    const owner = {};
    const request = deferred<A3DXRSessionLike>();
    const closed = deferred<void>();
    const late = new Session();
    const next = new Session();
    late.end.mockImplementation(async () => { await closed.promise; late.fire("end"); });
    const requestSession = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce(next);
    const xr = { requestSession };
    const first = new WebXRSessionController({ xr, leaseOwner: owner });
    const second = new WebXRSessionController({ xr, leaseOwner: owner });
    const starting = first.start();
    await flush();
    await first.end(); // The pending request itself cannot be cancelled.
    expect(await second.start()).toMatchObject({ started: false, busy: true });
    expect(requestSession).toHaveBeenCalledOnce();
    request.resolve(late);
    await flush();
    expect(late.end).toHaveBeenCalledOnce();
    expect(await second.start()).toMatchObject({ started: false, busy: true });
    expect(requestSession).toHaveBeenCalledOnce();
    closed.resolve();
    expect(await starting).toMatchObject({ started: false });
    expect(await second.start()).toMatchObject({ started: true });
    expect(requestSession).toHaveBeenCalledTimes(2);
    await second.end();
  });

  it("releases a cancelled request after rejection and a closing session after end rejection", async () => {
    const owner = {};
    const request = deferred<A3DXRSessionLike>();
    const rejectedEnd = deferred<void>();
    const firstSession = new Session();
    const secondSession = new Session();
    firstSession.end.mockImplementation(() => rejectedEnd.promise);
    const requestSession = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);
    const xr = { requestSession };
    const cancelled = new WebXRSessionController({ xr, leaseOwner: owner });
    const first = new WebXRSessionController({ xr, leaseOwner: owner });
    const second = new WebXRSessionController({ xr, leaseOwner: owner });
    const starting = cancelled.start();
    const failedRequest = expect(starting).rejects.toThrow("permission dismissed");
    await flush();
    await cancelled.dispose();
    expect(await first.start()).toMatchObject({ started: false, busy: true });
    request.reject(new Error("permission dismissed"));
    await failedRequest;
    expect(await first.start()).toMatchObject({ started: true });
    const closing = first.end();
    await flush();
    expect(await second.start()).toMatchObject({ started: false, busy: true });
    rejectedEnd.reject(new Error("already ended"));
    await expect(closing).resolves.toBeUndefined();
    expect(await second.start()).toMatchObject({ started: true });
    await second.end();
  });

  it("releases a closed session without waiting for stale reference-space work or clearing the new lease", async () => {
    const owner = {};
    const oldSession = new Session();
    const newSession = new Session();
    const thirdSession = new Session();
    const oldSpace = deferred<Target>();
    const closed = deferred<void>();
    oldSession.requestReferenceSpace.mockImplementation(() => oldSpace.promise);
    oldSession.end.mockImplementation(async () => { oldSession.fire("end"); await closed.promise; });
    const requestSession = vi.fn().mockResolvedValueOnce(oldSession).mockResolvedValueOnce(newSession).mockResolvedValueOnce(thirdSession);
    const xr = { requestSession };
    const controller = new WebXRSessionController({ xr, leaseOwner: owner });
    const another = new WebXRSessionController({ xr, leaseOwner: owner });
    const oldStart = controller.start();
    await flush();
    const ending = controller.end();
    await flush();
    expect(oldSession.end).toHaveBeenCalledOnce();
    expect(await another.start()).toMatchObject({ started: false, busy: true });
    closed.resolve();
    await ending;
    expect(await controller.start()).toMatchObject({ started: true });
    oldSpace.resolve(oldSession.local);
    expect(await oldStart).toMatchObject({ started: false });
    expect(controller.xrSession).toBe(newSession);
    expect(await another.start()).toMatchObject({ started: false, busy: true });
    expect(requestSession).toHaveBeenCalledTimes(2);
    await controller.end();
    expect(await another.start()).toMatchObject({ started: true });
    await another.end();
  });

  it("releases a naturally ended pending session even if reference space never resolves", async () => {
    const owner = {};
    const firstSession = new Session();
    const secondSession = new Session();
    const oldSpace = deferred<Target>();
    firstSession.requestReferenceSpace.mockImplementation(() => oldSpace.promise);
    const requestSession = vi.fn().mockResolvedValueOnce(firstSession).mockResolvedValueOnce(secondSession);
    const xr = { requestSession };
    const first = new WebXRSessionController({ xr, leaseOwner: owner });
    const second = new WebXRSessionController({ xr, leaseOwner: owner });
    const starting = first.start();
    await flush();
    await firstSession.end();
    expect(await second.start()).toMatchObject({ started: true });
    oldSpace.resolve(firstSession.local);
    expect(await starting).toMatchObject({ started: false });
    expect(await first.start()).toMatchObject({ started: false, busy: true });
    await second.end();
  });

  it("isolates leases by owner and defaults standalone controllers to distinct owners", async () => {
    const pending = deferred<A3DXRSessionLike>();
    const firstSession = new Session();
    const standaloneSession = new Session();
    const otherOwnerSession = new Session();
    const xr = { requestSession: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(standaloneSession).mockResolvedValueOnce(otherOwnerSession) };
    const first = new WebXRSessionController({ xr });
    const standalone = new WebXRSessionController({ xr });
    const otherOwner = new WebXRSessionController({ xr, leaseOwner: {} });
    const starting = first.start();
    await flush();
    expect(await standalone.start()).toMatchObject({ started: true });
    expect(await otherOwner.start()).toMatchObject({ started: true });
    await first.end();
    pending.resolve(firstSession);
    expect(await starting).toMatchObject({ started: false });
    await Promise.all([standalone.end(), otherOwner.end()]);
  });

  it("serializes acquisitions after concurrent support checks for the same owner", async () => {
    const owner = {};
    const support = deferred<boolean>();
    const session = new Session();
    const xr = { isSessionSupported: () => support.promise, requestSession: vi.fn(async () => session) };
    const first = new WebXRSessionController({ xr, leaseOwner: owner });
    const second = new WebXRSessionController({ xr, leaseOwner: owner });
    const starts = [first.start(), second.start()];
    support.resolve(true);
    const results = await Promise.all(starts);
    expect(results.filter((result) => result.started)).toHaveLength(1);
    expect(results.filter((result) => result.busy)).toHaveLength(1);
    expect(xr.requestSession).toHaveBeenCalledOnce();
    await Promise.all([first.end(), second.end()]);
  });

  it("reports tracking loss without inventing viewer or joint poses", async () => {
    const session = new Session();
    (session.inputSources as { hand: Map<string, object> }[]).push({ hand: new Map([["wrist", {}]]) });
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session }, referenceSpace: "local" });
    await controller.start();
    const sample = controller.sampleFrame({ getViewerPose: () => null, getJointPose: () => null, getPose: () => null });
    expect(sample.active).toBe(true);
    expect(sample.camera.tracked).toBe(false);
    expect(sample.hands[0]).toMatchObject({ tracked: false, jointCount: 0, joints: {} });
    expect(sample.controllers[0]?.gripMatrix).toBeNull();
    await controller.end();
  });

  it("preserves a native transient-pointer source and reports an unavailable hit-test source", async () => {
    const end = vi.fn(async () => undefined);
    const session: A3DXRSessionLike = {
      inputSources: [{ targetRayMode: "transient-pointer", targetRaySpace: {}, hand: null, gamepad: null }],
      requestReferenceSpace: async () => ({}),
      requestHitTestSource: () => undefined,
      end
    };
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session }, requiredFeatures: ["hit-test"] });
    expect((await controller.start()).started).toBe(true);
    expect(controller.xrHitTestSource).toBeNull();
    expect(controller.warnings).toContain("Hit testing unavailable: no hit-test source was supplied.");
    const sample = controller.sampleFrame();
    expect(sample.controllers[0]?.targetRayMode).toBe("transient-pointer");
    expect(sample.hands).toEqual([]);
    await controller.end();
    expect(end).toHaveBeenCalledOnce();
  });

  it("does not revive a session that the browser ends while reference space is being acquired", async () => {
    const session = new Session();
    const space = deferred<Target>();
    session.requestReferenceSpace.mockImplementation(() => space.promise);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    const starting = controller.start();
    await flush();
    await session.end();
    space.resolve(session.local);
    expect(await starting).toMatchObject({ started: false });
    expect(controller.active).toBe(false);
    expect(session.end).toHaveBeenCalledOnce();
    expect([...session.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("still closes a session if native hit-test cancellation throws", async () => {
    const session = new Session();
    session.cancel.mockImplementation(() => { throw new Error("source invalidated"); });
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session }, requiredFeatures: ["hit-test"] });
    await controller.start();
    await expect(controller.end()).resolves.toBeUndefined();
    expect(session.end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });

  it("joins repeated controller shutdowns and refuses a new start until native end completes", async () => {
    const session = new Session();
    const closed = deferred<void>();
    session.end.mockImplementation(async () => { await closed.promise; session.fire("end"); });
    const requestSession = vi.fn(async () => session);
    const controller = new WebXRSessionController({ xr: { requestSession } });
    expect((await controller.start()).started).toBe(true);
    let ended = false;
    let disposed = false;
    const first = controller.end().then(() => { ended = true; });
    expect(await controller.start()).toMatchObject({ started: false });
    const second = controller.dispose().then(() => { disposed = true; });
    await flush();
    expect(ended).toBe(false);
    expect(disposed).toBe(false);
    expect(session.end).toHaveBeenCalledOnce();
    closed.resolve();
    await Promise.all([first, second]);
    expect(ended).toBe(true);
    expect(disposed).toBe(true);
    expect(await controller.start()).toMatchObject({ started: false });
    expect(requestSession).toHaveBeenCalledOnce();
  });

  it("joins the same native shutdown when cancellation races reference-space resolution", async () => {
    const session = new Session();
    const space = deferred<Target>();
    const closed = deferred<void>();
    session.requestReferenceSpace.mockImplementation(() => space.promise);
    session.end.mockImplementation(async () => { await closed.promise; session.fire("end"); });
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    const starting = controller.start();
    await flush();
    space.resolve(session.local);
    let endDone = false;
    const ending = controller.end().then(() => { endDone = true; });
    await flush();
    expect(session.end).toHaveBeenCalledOnce();
    expect(endDone).toBe(false);
    closed.resolve();
    expect(await starting).toMatchObject({ started: false });
    await ending;
    expect(endDone).toBe(true);
  });

  it("waits for concurrent exits before permitting a new session", async () => {
    const oldSession = new Session();
    const newSession = new Session();
    const closed = deferred<void>();
    oldSession.end.mockImplementation(async () => { await closed.promise; oldSession.fire("end"); });
    const requestSession = vi.fn().mockResolvedValueOnce(oldSession).mockResolvedValueOnce(newSession);
    const { runtime } = rig(oldSession, { xr: { isSessionSupported: async () => true, requestSession } });
    expect((await runtime.enter()).started).toBe(true);
    let firstDone = false;
    let secondDone = false;
    const first = runtime.exit().then(() => { firstDone = true; });
    const second = runtime.exit().then(() => { secondDone = true; });
    await flush();
    expect(firstDone).toBe(false);
    expect(secondDone).toBe(false);
    oldSession.fire("end");
    expect(runtime.isPresenting).toBe(false);
    expect(await runtime.enter()).toMatchObject({ started: false, reason: "already-presenting" });
    expect(oldSession.end).toHaveBeenCalledOnce();
    expect(requestSession).toHaveBeenCalledOnce();
    closed.resolve();
    await Promise.all([first, second]);
    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    expect((await runtime.enter()).started).toBe(true);
    expect(newSession.end).not.toHaveBeenCalled();
    await runtime.exit();
    expect(newSession.end).toHaveBeenCalledOnce();
  });

  it("stops rendering remaining eyes and ignores queued frames as soon as exit is requested", async () => {
    const session = new Session();
    const closed = deferred<void>();
    session.end.mockImplementation(async () => { await closed.promise; session.fire("end"); });
    let exit: Promise<void> | undefined;
    let runtime!: ReturnType<typeof createAuraXRRuntime>;
    const renderFrame = vi.fn(() => { exit = runtime.exit(); });
    ({ runtime } = rig(session, { renderFrame }));
    const onFrame = vi.fn();
    runtime.on("frame", onFrame);
    await runtime.enter();
    const view = { eye: "left" as const, projectionMatrix: identity(), transform: { matrix: identity(), inverse: { matrix: identity() } } };
    const frame = { getViewerPose: () => ({ views: [view, { ...view, eye: "right" as const }] }) };
    session.requestAnimationFrame.mock.calls[0]![0](100, frame);
    expect(renderFrame).toHaveBeenCalledOnce();
    expect(onFrame).not.toHaveBeenCalled();
    session.requestAnimationFrame.mock.calls[1]![0](101, frame);
    expect(renderFrame).toHaveBeenCalledOnce();
    closed.resolve();
    await exit;
  });

  it("cancels an animation frame even when the browser returns handle zero", async () => {
    const session = new Session();
    session.requestAnimationFrame.mockReturnValue(0);
    const { runtime } = rig(session);
    await runtime.enter();
    await runtime.exit();
    expect(session.cancelAnimationFrame).toHaveBeenCalledWith(0);
  });

  it("refuses concurrent starts, invalidates pending graphics setup and cannot revive after dispose", async () => {
    const session = new Session();
    const compatible = deferred<void>();
    const rigged = rig(session, { getGL: () => ({ makeXRCompatible: () => compatible.promise }) });
    const first = rigged.runtime.enter();
    await flush();
    expect(await rigged.runtime.enter()).toMatchObject({ reason: "already-presenting", started: false });
    rigged.runtime.dispose();
    compatible.resolve();
    expect(await first).toMatchObject({ reason: "cancelled", started: false });
    expect(session.end).toHaveBeenCalledOnce();
    expect(rigged.runtime.isPresenting).toBe(false);
    expect(rigged.xr.requestSession).toHaveBeenCalledOnce();
  });

  it("closes a pending session immediately when its reference space is still pending", async () => {
    const session = new Session();
    const space = deferred<Target>();
    session.requestReferenceSpace = vi.fn(() => space.promise);
    const { runtime } = rig(session);
    const enter = runtime.enter();
    await flush();
    await runtime.exit();
    expect(session.end).toHaveBeenCalledOnce();
    space.resolve(session.local);
    expect(await enter).toMatchObject({ reason: "cancelled", started: false });
    expect(runtime.isPresenting).toBe(false);
    expect(session.end).toHaveBeenCalledOnce();
  });

  it("does not let an old enter tear down a newer session after exit and re-entry", async () => {
    const oldSession = new Session();
    const newSession = new Session();
    const oldSpace = deferred<Target>();
    oldSession.requestReferenceSpace.mockImplementation(() => oldSpace.promise);
    const requestSession = vi.fn().mockResolvedValueOnce(oldSession).mockResolvedValueOnce(newSession);
    const xr = { isSessionSupported: async () => true, requestSession };
    const { runtime } = rig(oldSession, { xr });
    const oldEnter = runtime.enter();
    await flush();
    await runtime.exit();
    const newEnter = await runtime.enter();
    expect(newEnter.started).toBe(true);
    oldSpace.resolve(oldSession.local);
    expect(await oldEnter).toMatchObject({ started: false, reason: "cancelled" });
    expect(runtime.isPresenting).toBe(true);
    expect(oldSession.end).toHaveBeenCalledOnce();
    expect(newSession.end).not.toHaveBeenCalled();
    await runtime.exit();
    expect(newSession.end).toHaveBeenCalledOnce();
  });

  it("does not request a session when exit occurs during the support probe", async () => {
    const support = deferred<boolean>();
    const session = new Session();
    const requestSession = vi.fn(async () => session);
    const { runtime } = rig(session, { xr: { isSessionSupported: () => support.promise, requestSession } });
    const enter = runtime.enter();
    await runtime.exit();
    support.resolve(true);
    expect(await enter).toMatchObject({ reason: "cancelled", started: false });
    expect(requestSession).not.toHaveBeenCalled();
  });

  it("does not publish a session when exit races updateRenderState", async () => {
    const session = new Session();
    const update = deferred<void>();
    session.updateRenderState.mockImplementation(async () => { await update.promise; return undefined; });
    const { runtime } = rig(session);
    const enter = runtime.enter();
    await flush();
    const exit = runtime.exit();
    update.resolve();
    await exit;
    expect(await enter).toMatchObject({ reason: "cancelled", started: false });
    expect(session.end).toHaveBeenCalledOnce();
    expect(runtime.isPresenting).toBe(false);
  });

  it("routes input, visibility and reference-space events, then removes listeners on end", async () => {
    const session = new Session();
    const { runtime } = rig(session);
    const selected = vi.fn(); const changed = vi.fn(); const visibility = vi.fn(); const reset = vi.fn(); const started = vi.fn();
    runtime.on("sessionstart", started);
    runtime.on("selectstart", selected);
    runtime.on("inputsourceschange", changed);
    runtime.on("visibilitychange", visibility);
    runtime.on("reset", reset);
    const result = await runtime.enter("immersive-vr", { referenceSpace: "local" });
    expect(result.provenance).toBe("injected");
    expect(started).toHaveBeenCalledWith({ mode: "immersive-vr", provenance: "injected" });
    const source = { handedness: "right" as const };
    session.fire("selectstart", { inputSource: source });
    session.fire("inputsourceschange", { added: [source], removed: [] });
    session.visibilityState = "hidden";
    session.fire("visibilitychange");
    session.local.fire("reset", { transform: { matrix: identity() } });
    expect(selected).toHaveBeenCalledWith({ inputSource: source });
    expect(changed).toHaveBeenCalledWith({ added: [source], removed: [] });
    expect(visibility).toHaveBeenCalledWith({ visibilityState: "hidden" });
    expect(reset).toHaveBeenCalledWith({ transform: { matrix: identity() } });
    await session.end();
    expect(runtime.isPresenting).toBe(false);
    expect([...session.listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect(session.local.listeners.get("reset")?.size).toBe(0);
  });

  it("reports unsupported optional layers and configures foveation without pretending a device result", async () => {
    const session = new Session();
    const { runtime } = rig(session);
    const result = await runtime.enter("immersive-ar", { hitTest: true, layers: true, foveation: 0.7 });
    expect(result).toMatchObject({ started: true, provenance: "injected", capabilities: { hitTest: true, foveation: true, layers: false } });
    expect(result.warnings.some((w) => w.includes("layers unavailable"))).toBe(true);
    expect((session.updateRenderState.mock.calls[0]?.[0] as { baseLayer: BaseLayer }).baseLayer.fixedFoveation).toBe(0.7);
    await runtime.exit();
    expect(session.cancel).toHaveBeenCalledOnce();
  });

  it("does not claim fixed foveation when the native layer reports it unavailable", async () => {
    const session = new Session();
    class NoFoveationLayer {
      readonly framebuffer = {};
      readonly framebufferWidth = 100;
      readonly framebufferHeight = 100;
      readonly fixedFoveation = undefined;
    }
    const { runtime } = rig(session, { layerConstructor: NoFoveationLayer });
    const result = await runtime.enter("immersive-vr", { foveation: 0.5 });
    expect(result).toMatchObject({ started: true, capabilities: { foveation: false } });
    expect(result.warnings).toContain("XR fixed foveation is unavailable.");
    await runtime.exit();
  });

  it("binds each projection-layer image, applies foveation and deletes its framebuffer", async () => {
    const session = new Session();
    const framebuffer = {};
    const color = {};
    const depth = {};
    const projectionLayer = { fixedFoveation: 0 };
    const compositionGL = {
      FRAMEBUFFER: 1, COLOR_ATTACHMENT0: 2, DEPTH_ATTACHMENT: 3, TEXTURE_2D: 4, DEPTH_COMPONENT24: 5,
      createFramebuffer: vi.fn(() => framebuffer), deleteFramebuffer: vi.fn(), bindFramebuffer: vi.fn(),
      framebufferTexture2D: vi.fn(), makeXRCompatible: vi.fn(async () => undefined)
    };
    class Binding {
      createProjectionLayer() { return projectionLayer; }
      getViewSubImage() { return { colorTexture: color, depthStencilTexture: depth, textureWidth: 100, textureHeight: 100, viewport: { x: 0, y: 0, width: 100, height: 100 } }; }
    }
    const { runtime, device, renderFrame } = rig(session, { getGL: () => compositionGL, bindingConstructor: Binding });
    const result = await runtime.enter("immersive-vr", { layers: true, foveation: 0.4 });
    expect(result.capabilities).toMatchObject({ layers: true, foveation: true });
    expect(projectionLayer.fixedFoveation).toBe(0.4);
    const view = { eye: "left" as const, projectionMatrix: identity(), transform: { matrix: identity(), inverse: { matrix: identity() } } };
    session.requestAnimationFrame.mock.calls[0]![0](100, { getViewerPose: () => ({ views: [view] }) });
    expect(compositionGL.framebufferTexture2D).toHaveBeenCalledWith(1, 2, 4, color, 0);
    expect(compositionGL.framebufferTexture2D).toHaveBeenCalledWith(1, 3, 4, depth, 0);
    expect(device.setExternalFramebuffer).toHaveBeenCalledWith(framebuffer, 100, 100);
    expect(renderFrame).toHaveBeenCalledOnce();
    await runtime.exit();
    expect(compositionGL.deleteFramebuffer).toHaveBeenCalledWith(framebuffer);
  });

  it("negotiates native depth preferences and samples a GPU depth texture through XRWebGLBinding", async () => {
    const session = new Session();
    session.enabledFeatures.push("depth-sensing");
    session.depthUsage = "gpu-optimized";
    const texture = {};
    class Binding {
      getDepthInformation() { return { width: 8, height: 4, rawValueToMeters: 0.01, texture, textureType: "texture", imageIndex: 0 }; }
    }
    const { runtime, xr } = rig(session, { bindingConstructor: Binding });
    const depthSensing = { usagePreference: ["gpu-optimized"] as const, dataFormatPreference: ["float32"] as const };
    const entered = await runtime.enter("immersive-ar", { depthSensing });
    expect(entered.capabilities?.depthSensing).toBe("gpu-optimized");
    expect(xr.requestSession).toHaveBeenCalledWith("immersive-ar", expect.objectContaining({ optionalFeatures: ["depth-sensing"], depthSensing }));
    const view = { eye: "left" as const, projectionMatrix: identity(), transform: { matrix: identity(), inverse: { matrix: identity() } } };
    session.requestAnimationFrame.mock.calls[0]![0](100, { getViewerPose: () => ({ views: [view] }) });
    expect(runtime.lastSample?.depth[0]).toMatchObject({ eye: "left", width: 8, height: 4, texture, textureType: "texture", imageIndex: 0 });
    expect(runtime.lastSample?.capabilities.depthSensing).toBe(true);
    await runtime.exit();
  });

  it("creates, updates and disposes optional hand/controller visuals with frame and session lifecycle", async () => {
    const session = new Session();
    const { runtime } = rig(session);
    const position = vi.fn(); const visible = vi.fn(); const dispose = vi.fn();
    const visual = () => ({ setPosition: position, setVisible: visible, dispose });
    const onPlanes = vi.fn(); const onDepth = vi.fn(); const onLight = vi.fn();
    const helpers = xr.attachSceneHelpers(runtime, { createController: visual, createJoint: visual, onPlanes, onDepth, onLight });
    await runtime.enter();
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    // Use a distinct source sample; the helper subscribes to the runtime and accepts direct updates too.
    await controller.start();
    const sample = controller.sampleFrame();
    helpers.update({ ...sample, controllers: [{ id: 1, handedness: "left", targetRayMode: "tracked-pointer", profiles: [], triggerPressed: false, squeezePressed: false, primaryValue: 0, axes: [], targetRayMatrix: Array.from(matrixAt(1, 2, 3)), gripMatrix: null, hapticActuatorCount: 0 }], hands: [{ id: 1, handedness: "left", tracked: true, jointCount: 1, joints: { wrist: { position: [4, 5, 6], orientation: [0, 0, 0, 1], radius: 0.01 } } }] });
    expect(position).toHaveBeenCalledWith(1, 2, 3);
    expect(position).toHaveBeenCalledWith(4, 5, 6);
    await runtime.exit();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(onPlanes).toHaveBeenLastCalledWith([]);
    expect(onDepth).toHaveBeenLastCalledWith([]);
    expect(onLight).toHaveBeenLastCalledWith(null);
    helpers.dispose();
    await controller.end();
  });
});
