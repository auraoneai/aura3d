import { describe, expect, it, vi } from "vitest";
import {
  WebXRSessionController,
  type A3DXREventLike,
  type A3DXRInputSourceLike,
  type A3DXRReferenceSpaceLike,
  type A3DXRSessionLike
} from "../../../packages/input/src/WebXRSessionController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

class Session implements A3DXRSessionLike {
  readonly inputSources: A3DXRInputSourceLike[] = [];
  readonly listeners = new Map<string, Set<(event: A3DXREventLike) => void>>();
  requestReferenceSpace = vi.fn(async (_type: string): Promise<A3DXRReferenceSpaceLike> => ({}));
  end = vi.fn(async () => { this.fire("end"); });

  addEventListener(type: string, listener: (event: A3DXREventLike) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: A3DXREventLike) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: string, event: A3DXREventLike = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

const input = (...actuators: Array<{ pulse?(intensity: number, duration: number): Promise<boolean> | boolean }>): A3DXRInputSourceLike => ({
  gamepad: { hapticActuators: actuators }
});

describe("native XR haptic and reference-space lifetime", () => {
  it("preserves successful pulse counts, arguments and false results across live inputs", async () => {
    const session = new Session();
    const first = vi.fn(() => true), declined = vi.fn(() => false), last = vi.fn(async () => true);
    session.inputSources.push(input({ pulse: first }, { pulse: declined }), input({ pulse: last }));
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await controller.start();
    await expect(controller.pulseHaptics(0.4, 25)).resolves.toBe(2);
    expect(first).toHaveBeenCalledWith(0.4, 25);
    expect(declined).toHaveBeenCalledWith(0.4, 25);
    expect(last).toHaveBeenCalledWith(0.4, 25);
    await controller.end();
  });

  it("does not pulse a stale actuator or replacement session after a pending pulse", async () => {
    const firstSession = new Session(), nextSession = new Session();
    const pending = deferred<boolean>();
    const first = vi.fn(() => pending.promise), stale = vi.fn(() => true), replacement = vi.fn(() => true);
    firstSession.inputSources.push(input({ pulse: first }, { pulse: stale }));
    nextSession.inputSources.push(input({ pulse: replacement }));
    const requestSession = vi.fn().mockResolvedValueOnce(firstSession).mockResolvedValueOnce(nextSession);
    const controller = new WebXRSessionController({ xr: { requestSession } });
    await controller.start();
    const pulse = controller.pulseHaptics();
    expect(first).toHaveBeenCalledOnce();
    expect(firstSession.listeners.get("inputsourceschange")?.size).toBe(1);
    await controller.end();
    expect(firstSession.listeners.get("inputsourceschange")?.size).toBe(0);
    await controller.start();
    pending.resolve(true);
    await expect(pulse).resolves.toBe(1);
    expect(stale).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    await expect(controller.pulseHaptics()).resolves.toBe(1);
    expect(replacement).toHaveBeenCalledOnce();
    await controller.end();
  });

  it.each(["native end", "dispose"] as const)("stops the old sequence after %s", async (reason) => {
    const session = new Session(), pending = deferred<boolean>();
    const first = vi.fn(() => pending.promise), later = vi.fn(() => true);
    session.inputSources.push(input({ pulse: first }, { pulse: later }));
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await controller.start();
    const pulse = controller.pulseHaptics();
    if (reason === "native end") session.fire("end");
    else await controller.dispose();
    pending.resolve(true);
    await expect(pulse).resolves.toBe(1);
    expect(later).not.toHaveBeenCalled();
    await expect(controller.pulseHaptics()).resolves.toBe(0);
    await controller.dispose();
  });

  it("skips removed controllers while continuing still-live inputs", async () => {
    const session = new Session(), pending = deferred<boolean>();
    const first = vi.fn(() => pending.promise), removedActuator = vi.fn(() => true), later = vi.fn(() => true);
    const removedSource = input({ pulse: first }, { pulse: removedActuator });
    const liveSource = input({ pulse: later });
    session.inputSources.push(removedSource, liveSource);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await controller.start();
    const pulse = controller.pulseHaptics();
    session.inputSources.splice(0, 1);
    session.fire("inputsourceschange", { removed: [removedSource] });
    pending.resolve(true);
    await expect(pulse).resolves.toBe(2);
    expect(removedActuator).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledOnce();
    await controller.end();
  });

  it("skips an actuator removed from a controller that is still connected", async () => {
    const session = new Session(), pending = deferred<boolean>();
    const first = vi.fn(() => pending.promise), removed = vi.fn(() => true), last = vi.fn(() => true);
    const actuators = [{ pulse: first }, { pulse: removed }, { pulse: last }];
    session.inputSources.push({ gamepad: { hapticActuators: actuators } });
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await controller.start();
    const pulse = controller.pulseHaptics();
    actuators.splice(1, 1);
    pending.resolve(true);
    await expect(pulse).resolves.toBe(2);
    expect(removed).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledOnce();
    await controller.end();
  });

  it("supports one-shot source iterables and invalidates sources removed during a pulse", async () => {
    const session = new Session(), pending = deferred<boolean>();
    const first = vi.fn(() => pending.promise), removed = vi.fn(() => true), last = vi.fn(() => true);
    const firstSource = input({ pulse: first });
    const removedSource = input({ pulse: removed });
    const lastSource = input({ pulse: last });
    const sourceIterator = (function* () { yield firstSource; yield removedSource; yield lastSource; })();
    Object.defineProperty(session, "inputSources", { value: sourceIterator });
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await controller.start();
    const pulse = controller.pulseHaptics();
    session.fire("inputsourceschange", { removed: [removedSource] });
    pending.resolve(true);
    await expect(pulse).resolves.toBe(2);
    expect(first).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledOnce();
    expect(session.listeners.get("inputsourceschange")?.size).toBe(0);
    await controller.end();
  });

  it("preserves argument validation and native actuator rejections", async () => {
    const session = new Session();
    const failure = new Error("actuator failed");
    session.inputSources.push(input({ pulse: () => { throw failure; } }));
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await expect(controller.pulseHaptics(Number.NaN)).rejects.toThrow(RangeError);
    await expect(controller.pulseHaptics(0.5, -1)).rejects.toThrow(RangeError);
    await expect(controller.pulseHaptics()).resolves.toBe(0);
    await controller.start();
    await expect(controller.pulseHaptics()).rejects.toBe(failure);
    expect(session.listeners.get("inputsourceschange")?.size).toBe(0);
    await controller.end();
  });

  it("rejects a session without reference-space acquisition and closes it", async () => {
    const end = vi.fn(async () => undefined);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => ({ end }) } });
    await expect(controller.start()).rejects.toThrow(/XR_REFERENCE_SPACE_UNAVAILABLE/);
    expect(controller.active).toBe(false);
    expect(controller.xrReferenceSpace).toBeNull();
    expect(end).toHaveBeenCalledOnce();
  });

  it("releases the shared session lease after reference-space acquisition fails", async () => {
    const owner = {};
    const failedEnd = vi.fn(async () => undefined);
    const next = new Session();
    const requestSession = vi.fn().mockResolvedValueOnce({ end: failedEnd }).mockResolvedValueOnce(next);
    const first = new WebXRSessionController({ xr: { requestSession }, leaseOwner: owner });
    const second = new WebXRSessionController({ xr: { requestSession }, leaseOwner: owner });
    await expect(first.start()).rejects.toThrow(/XR_REFERENCE_SPACE_UNAVAILABLE/);
    await expect(second.start()).resolves.toMatchObject({ started: true });
    expect(failedEnd).toHaveBeenCalledOnce();
    await second.end();
  });

  it.each([undefined, null, "invalid"])("rejects a nullish or non-object reference-space result (%s)", async (space) => {
    const end = vi.fn(async () => undefined);
    const requestReferenceSpace = vi.fn(async () => space as unknown as A3DXRReferenceSpaceLike);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => ({ requestReferenceSpace, end }) } });
    await expect(controller.start()).rejects.toThrow(/XR_REFERENCE_SPACE_UNAVAILABLE/);
    expect(requestReferenceSpace).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });

  it("retains the default local-floor to local fallback after an actual request failure", async () => {
    const session = new Session();
    const local = {};
    session.requestReferenceSpace.mockRejectedValueOnce(new Error("floor unavailable")).mockResolvedValueOnce(local);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await expect(controller.start()).resolves.toMatchObject({ started: true, referenceSpace: "local" });
    expect(session.requestReferenceSpace.mock.calls.map(([type]) => type)).toEqual(["local-floor", "local"]);
    expect(controller.xrReferenceSpace).toBe(local);
    await controller.end();
  });

  it("does not fall back when local-floor was explicitly requested", async () => {
    const session = new Session();
    session.requestReferenceSpace.mockRejectedValueOnce(new Error("floor unavailable"));
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session }, referenceSpace: "local-floor" });
    await expect(controller.start()).rejects.toThrow("floor unavailable");
    expect(session.requestReferenceSpace).toHaveBeenCalledOnce();
    expect(session.end).toHaveBeenCalledOnce();
  });

  it("rejects an invalid result from the local fallback and closes the session", async () => {
    const session = new Session();
    session.requestReferenceSpace.mockRejectedValueOnce(new Error("floor unavailable")).mockResolvedValueOnce(null as unknown as A3DXRReferenceSpaceLike);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    await expect(controller.start()).rejects.toThrow(/XR_REFERENCE_SPACE_UNAVAILABLE/);
    expect(session.requestReferenceSpace.mock.calls.map(([type]) => type)).toEqual(["local-floor", "local"]);
    expect(session.end).toHaveBeenCalledOnce();
  });

  it("does not report a malformed late reference space after cancellation", async () => {
    const session = new Session(), pending = deferred<A3DXRReferenceSpaceLike>();
    session.requestReferenceSpace.mockImplementation(() => pending.promise);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    const starting = controller.start();
    await vi.waitFor(() => expect(session.requestReferenceSpace).toHaveBeenCalledOnce());
    await controller.end();
    pending.resolve(null as unknown as A3DXRReferenceSpaceLike);
    await expect(starting).resolves.toMatchObject({ started: false });
    expect(session.end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });

  it("treats a fallback rejection after cancellation as an interrupted start", async () => {
    const session = new Session(), fallback = deferred<A3DXRReferenceSpaceLike>();
    session.requestReferenceSpace.mockRejectedValueOnce(new Error("floor unavailable")).mockImplementationOnce(() => fallback.promise);
    const controller = new WebXRSessionController({ xr: { requestSession: async () => session } });
    const starting = controller.start();
    await vi.waitFor(() => expect(session.requestReferenceSpace).toHaveBeenCalledTimes(2));
    await controller.end();
    fallback.reject(new Error("session ended"));
    await expect(starting).resolves.toMatchObject({ started: false });
    expect(session.end).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });
});
