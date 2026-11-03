import { describe, expect, it, vi } from "vitest";
import { InputSnapshot } from "@aura3d/input";
import { PointerLockControls, type PointerLockControlsOptions } from "../../../packages/controls/src";
import { PointerLockControls as PointerLockControlsEngine } from "../../../packages/controls/src/engine/PointerLockControls";

type Listener = (event: never) => void;

class EventHub {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: object = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event as never);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

class MockDocument extends EventHub {
  readonly defaultView = new EventHub();
  pointerLockElement: MockElement | null = null;
  visibilityState = "visible";
  readonly exitPointerLock = vi.fn();

  grant(element: MockElement): void {
    this.pointerLockElement = element;
    this.emit("pointerlockchange");
  }

  loseLock(): void {
    this.pointerLockElement = null;
    this.emit("pointerlockchange");
  }
}

class MockElement {
  readonly requestPointerLock = vi.fn<() => void | Promise<void>>();
  root?: { pointerLockElement: MockElement | null };
  constructor(readonly ownerDocument: MockDocument) {}
  getRootNode(): MockDocument | { pointerLockElement: MockElement | null } { return this.root ?? this.ownerDocument; }
  asElement(): HTMLElement { return this as unknown as HTMLElement; }
}

function camera() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
}

describe("native pointer lock", () => {
  it("requests a browser lock through the public wrapper and applies relative mouse and keyboard input", () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    const changes: boolean[] = [];
    const errors: unknown[] = [];
    const options: PointerLockControlsOptions = {
      element: element.asElement(),
      lookSpeed: 0.01,
      moveSpeed: 2,
      onLockChange: (locked) => changes.push(locked),
      onLockError: (error) => errors.push(error)
    };
    const target = camera();
    const controls = new PointerLockControls(target, options);

    controls.lock();
    expect(element.requestPointerLock).toHaveBeenCalledOnce();
    expect(controls.locked).toBe(false);
    controls.applyInput(new InputSnapshot({ keys: new Set(["KeyW"]) }), 0.5);
    expect(target.position.z).toBe(0);

    doc.grant(element);
    expect(controls.locked).toBe(true);
    doc.emit("mousemove", { movementX: 12, movementY: 3 });
    doc.emit("mousemove", { movementX: 3, movementY: -1 });
    controls.applyInput(new InputSnapshot({ keys: new Set(["KeyW"]) }), 0.5);
    expect(target.rotation.y).toBeCloseTo(-0.15);
    expect(target.rotation.x).toBeCloseTo(-0.02);
    expect(target.position.x).toBeCloseTo(Math.sin(-0.15));
    expect(target.position.z).toBeCloseTo(Math.cos(-0.15));
    controls.applyInput(new InputSnapshot(), 0);
    expect(target.rotation.y).toBeCloseTo(-0.15);
    controls.look(0.3, -0.2);
    expect(target.rotation.y).toBeCloseTo(0.15);
    expect(target.rotation.x).toBeCloseTo(-0.22);

    doc.loseLock();
    expect(controls.locked).toBe(false);
    controls.look(0.4, 0.4);
    expect(target.rotation.y).toBeCloseTo(0.15);
    expect(changes).toEqual([true, false]);
    expect(errors).toEqual([]);
    controls.dispose();
    expect(doc.listenerCount()).toBe(0);
    expect(doc.defaultView.listenerCount()).toBe(0);
  });

  it("reports a denied request once even when both the event and promise reject, then allows retry", async () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    let rejectRequest!: (reason: unknown) => void;
    element.requestPointerLock.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectRequest = reject; }));
    const errors: unknown[] = [];
    const controls = new PointerLockControls(camera(), { element: element.asElement(), onLockError: (error) => errors.push(error) });

    controls.lock();
    doc.emit("pointerlockerror");
    rejectRequest(new Error("permission denied"));
    await Promise.resolve();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(controls.locked).toBe(false);

    controls.lock();
    expect(element.requestPointerLock).toHaveBeenCalledTimes(2);
    doc.grant(element);
    expect(controls.locked).toBe(true);
    controls.dispose();
    expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    expect(doc.listenerCount()).toBe(0);
  });

  it("reports synchronous API failures and rejects a second pending Aura3D request", () => {
    const doc = new MockDocument();
    const first = new MockElement(doc);
    const second = new MockElement(doc);
    const errors: unknown[] = [];
    const a = new PointerLockControls(camera(), { element: first.asElement() });
    const b = new PointerLockControls(camera(), { element: second.asElement(), onLockError: (error) => errors.push(error) });
    a.lock();
    b.lock();
    expect(second.requestPointerLock).not.toHaveBeenCalled();
    expect(String(errors[0])).toContain("pending");
    doc.emit("pointerlockerror");
    second.requestPointerLock.mockImplementationOnce(() => { throw new Error("activation required"); });
    b.lock();
    expect(String(errors[1])).toContain("activation required");
    b.lock();
    doc.grant(second);
    expect(b.locked).toBe(true);
    a.dispose();
    b.dispose();
  });

  it("reports unavailable lock APIs and allows retry after an exit failure", () => {
    const doc = new MockDocument();
    const missing = new MockElement(doc);
    Object.defineProperty(missing, "requestPointerLock", { value: undefined });
    const errors: unknown[] = [];
    const unsupported = new PointerLockControls(camera(), { element: missing.asElement(), onLockError: (error) => errors.push(error) });
    unsupported.lock();
    expect(String(errors[0])).toContain("unavailable");
    unsupported.dispose();

    const element = new MockElement(doc);
    const controls = new PointerLockControls(camera(), { element: element.asElement(), onLockError: (error) => errors.push(error) });
    controls.lock();
    doc.grant(element);
    doc.exitPointerLock.mockImplementationOnce(() => { throw new Error("exit denied"); });
    controls.unlock();
    expect(String(errors[1])).toContain("exit denied");
    expect(controls.locked).toBe(false);
    controls.unlock();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(2);
    controls.dispose();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(2);
  });

  it("never exits a foreign lock and follows transfer and escape events", () => {
    const doc = new MockDocument();
    const first = new MockElement(doc);
    const second = new MockElement(doc);
    const a = new PointerLockControls(camera(), { element: first.asElement() });
    const b = new PointerLockControls(camera(), { element: second.asElement() });
    a.lock();
    doc.grant(first);
    b.unlock();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
    b.lock();
    doc.grant(second);
    expect(a.locked).toBe(false);
    expect(b.locked).toBe(true);
    a.dispose();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
    doc.loseLock();
    expect(b.locked).toBe(false);
    b.dispose();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
    expect(doc.listenerCount()).toBe(0);
  });

  it("does not adopt a lock that another owner already obtained on the same element", () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    doc.pointerLockElement = element;
    const errors: unknown[] = [];
    const controls = new PointerLockControls(camera(), { element: element.asElement(), onLockError: (error) => errors.push(error) });
    controls.lock();
    expect(controls.locked).toBe(false);
    expect(String(errors[0])).toContain("owned elsewhere");
    controls.unlock();
    controls.dispose();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
  });

  it("handles transfer and cancelled late grants regardless of listener registration order", () => {
    const doc = new MockDocument();
    const first = new MockElement(doc);
    const second = new MockElement(doc);
    // Register the incoming controller first, so it receives the document
    // event before the controller that previously held the lock.
    const incoming = new PointerLockControls(camera(), { element: second.asElement() });
    const previous = new PointerLockControls(camera(), { element: first.asElement() });
    previous.lock();
    doc.grant(first);
    incoming.lock();
    doc.grant(second);
    expect(incoming.locked).toBe(true);
    expect(previous.locked).toBe(false);

    doc.loseLock();
    previous.lock();
    doc.grant(first);
    incoming.lock();
    incoming.unlock();
    doc.grant(second);
    expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    expect(incoming.locked).toBe(false);
    expect(previous.locked).toBe(false);
    incoming.dispose();
    previous.dispose();
  });

  it("tracks the locked element inside a shadow root even when the document reports its host", () => {
    const doc = new MockDocument();
    const host = new MockElement(doc);
    const element = new MockElement(doc);
    const root = { pointerLockElement: null as MockElement | null };
    element.root = root;
    const controls = new PointerLockControls(camera(), { element: element.asElement() });
    controls.lock();
    doc.pointerLockElement = host;
    root.pointerLockElement = element;
    doc.emit("pointerlockchange");
    expect(controls.locked).toBe(true);
    controls.unlock();
    expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    root.pointerLockElement = null;
    doc.loseLock();
    controls.dispose();
  });

  it("stops input when the browser drops the lock before dispatching its change event", () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    const target = camera();
    const changes: boolean[] = [];
    const controls = new PointerLockControls(target, { element: element.asElement(), onLockChange: (value) => changes.push(value) });
    controls.lock();
    doc.grant(element);
    doc.emit("mousemove", { movementX: 40, movementY: 0 });
    doc.pointerLockElement = null;
    controls.applyInput(new InputSnapshot({ keys: new Set(["KeyW"]) }), 1);
    expect(target.position.z).toBe(0);
    expect(target.rotation.y).toBe(0);
    expect(controls.locked).toBe(false);
    doc.emit("pointerlockchange");
    expect(changes).toEqual([true, false]);
    controls.dispose();
  });

  it("cancels a pending legacy request and releases a late grant after disposal", () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    const changes: boolean[] = [];
    const controls = new PointerLockControls(camera(), { element: element.asElement(), onLockChange: (value) => changes.push(value) });
    controls.lock();
    controls.dispose();
    expect(doc.listenerCount()).toBe(2); // Only the pending request's outcome listeners remain.
    expect(doc.defaultView.listenerCount()).toBe(0);
    doc.grant(element);
    expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    expect(controls.locked).toBe(false);
    expect(changes).toEqual([]);
    expect(doc.listenerCount()).toBe(0);
    controls.lock();
    expect(element.requestPointerLock).toHaveBeenCalledOnce();
  });

  it("removes listeners immediately for a pending promise and releases a later grant", async () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    let resolveRequest!: () => void;
    element.requestPointerLock.mockImplementation(() => new Promise<void>((resolve) => { resolveRequest = resolve; }));
    const errors: unknown[] = [];
    const controls = new PointerLockControls(camera(), { element: element.asElement(), onLockError: (error) => errors.push(error) });
    controls.lock();
    controls.dispose();
    expect(doc.listenerCount()).toBe(0);
    expect(doc.defaultView.listenerCount()).toBe(0);
    doc.pointerLockElement = element;
    resolveRequest();
    await Promise.resolve();
    expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    expect(controls.locked).toBe(false);
    expect(errors).toEqual([]);
  });

  it("ends input and discards accumulated motion on blur, visibility loss and device cancellation", () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    const target = camera();
    const controls = new PointerLockControls(target, { element: element.asElement() });
    controls.lock();
    doc.grant(element);
    doc.emit("mousemove", { movementX: 30, movementY: 10 });
    doc.defaultView.emit("blur");
    expect(controls.locked).toBe(false);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    controls.unlock();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    controls.applyInput(new InputSnapshot({ keys: new Set(["KeyW"]) }), 1);
    expect(target.position.z).toBe(0);
    expect(target.rotation.y).toBe(0);

    doc.loseLock();
    controls.lock();
    doc.grant(element);
    doc.visibilityState = "hidden";
    doc.emit("visibilitychange");
    expect(controls.locked).toBe(false);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(2);

    doc.loseLock();
    doc.visibilityState = "visible";
    controls.lock();
    doc.grant(element);
    controls.applyInput(new InputSnapshot({ pointer: { cancellationReason: "device-disconnect" } }), 1);
    expect(controls.locked).toBe(false);
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(3);
    controls.dispose();
  });

  it("discards queued locked motion across disable and re-enable without dropping the lock", () => {
    const doc = new MockDocument();
    const element = new MockElement(doc);
    const target = camera();
    const controls = new PointerLockControls(target, { element: element.asElement(), lookSpeed: 0.01 });
    controls.lock();
    doc.grant(element);
    doc.emit("mousemove", { movementX: 40, movementY: 10 });
    controls.enabled = false;
    doc.emit("mousemove", { movementX: 30, movementY: 15 });
    controls.enabled = true;
    controls.applyInput(new InputSnapshot(), 0);
    expect(controls.locked).toBe(true);
    expect(target.rotation).toEqual({ x: 0, y: 0, z: 0 });
    doc.emit("mousemove", { movementX: 5, movementY: 2 });
    controls.applyInput(new InputSnapshot(), 0);
    expect(target.rotation.y).toBeCloseTo(-0.05);
    expect(target.rotation.x).toBeCloseTo(-0.02);
    controls.dispose();
  });

  it("keeps the synchronous headless gate, writable locked property and disposal behavior", () => {
    const target = camera();
    const controls = new PointerLockControlsEngine(target, { lookSpeed: 0.01 });
    expect(Object.keys(controls)).toContain("enabled");
    const snapshot = new InputSnapshot({ keys: new Set(["KeyW"]), pointer: { deltaX: 10, deltaY: 5 } });
    controls.update(snapshot, 1);
    expect(target.position.z).toBe(0);
    controls.locked = true;
    expect(controls.locked).toBe(true);
    controls.update(snapshot, 1);
    expect(target.rotation.y).toBeCloseTo(-0.1);
    expect(target.rotation.x).toBeCloseTo(-0.05);
    expect(target.position.z).toBeCloseTo(Math.cos(-0.1));
    controls.dispose();
    controls.locked = true;
    expect(controls.locked).toBe(false);
  });
});
