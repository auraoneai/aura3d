import { readFileSync } from "node:fs";
import { createContext, runInContext, type Context } from "node:vm";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  acquirePointerCapture,
  acquireTouchAction,
  InputSystem,
  releasePointerCaptureLease,
  releaseTouchAction,
  type InputEventTargetLike
} from "../../../packages/input/src";
import { SceneNode } from "@aura3d/scene";
import { ArcballControls } from "../../../packages/controls/src/ArcballControls";
import { DragControls } from "../../../packages/controls/src/DragControls";
import { InteractiveGroup } from "../../../packages/controls/src/InteractiveGroup";
import * as controlLeases from "../../../packages/controls/src/PointerLeases";

type Listener = EventListenerOrEventListenerObject;
type ControlKind = "arcball" | "drag" | "group";
type PointerLeaseModule = typeof import("../../../packages/input/src/PointerLeases");

function independentLeaseModules() {
  const source = readFileSync(new URL("../../../packages/input/src/PointerLeases.ts", import.meta.url), "utf8");
  const { code } = transformSync(source, { loader: "ts", format: "cjs", target: "es2020" });
  const context = createContext({});
  const evaluate = runInContext(`(function(module, exports) {\n${code}\n})`, context) as (
    module: { exports: object },
    exports: object
  ) => void;
  const load = (): PointerLeaseModule => {
    const module = { exports: {} };
    evaluate(module, module.exports);
    return module.exports as PointerLeaseModule;
  };
  return { first: load(), second: load(), context };
}

/** The first shared version-1 protocol, evaluated independently of the current module. */
function versionOneLeaseModule(context: Context): PointerLeaseModule {
  return runInContext(`(() => {
    const key = Symbol.for("@aura3d/input/pointer-leases");
    function coordinator(create) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
      if (descriptor) return descriptor.value;
      if (!create) return undefined;
      const value = Object.freeze({
        version: 1, touchActionLeases: new WeakMap(), pointerCaptureLeases: new WeakMap()
      });
      Object.defineProperty(globalThis, key, { value, enumerable: false, configurable: false, writable: false });
      return value;
    }
    return {
      acquireTouchAction(element, owner) {
        const style = element.style;
        if (!style) return false;
        const leases = coordinator(true).touchActionLeases;
        let lease = leases.get(element);
        if (lease?.owners.has(owner)) return true;
        const priority = style.getPropertyPriority?.("touch-action") ?? "";
        if (!lease) {
          lease = { owners: new Set(), previous: style.touchAction, priority };
          leases.set(element, lease);
        } else if (style.touchAction !== "none" || priority !== "") {
          lease.previous = style.touchAction;
          lease.priority = priority;
        }
        lease.owners.add(owner);
        style.touchAction = "none";
        return true;
      },
      releaseTouchAction(element, owner) {
        const leases = coordinator(false)?.touchActionLeases;
        const lease = leases?.get(element);
        if (!lease?.owners.delete(owner) || lease.owners.size) return;
        leases.delete(element);
        const style = element.style;
        if (!style || style.touchAction !== "none" || (style.getPropertyPriority?.("touch-action") ?? "") !== "") return;
        if (lease.priority && style.setProperty) style.setProperty("touch-action", lease.previous, lease.priority);
        else style.touchAction = lease.previous;
      },
      acquirePointerCapture(element, id, owner) {
        if (!element?.setPointerCapture) return;
        const leases = coordinator(true).pointerCaptureLeases;
        let pointers = leases.get(element);
        if (!pointers) { pointers = new Map(); leases.set(element, pointers); }
        let lease = pointers.get(id);
        if (!lease) { lease = { owners: new Set(), ownedCapture: false, attempt: 0 }; pointers.set(id, lease); }
        if (lease.owners.has(owner)) return;
        lease.owners.add(owner);
        const captured = element.hasPointerCapture?.(id);
        if (captured) return;
        lease.attempt++;
        lease.ownedCapture = captured === false;
        element.setPointerCapture(id);
      },
      releasePointerCaptureLease(element, id, owner, release, beforeRelease) {
        const leases = coordinator(false)?.pointerCaptureLeases;
        const pointers = element && leases?.get(element);
        const lease = pointers?.get(id);
        if (!lease?.owners.delete(owner) || lease.owners.size) return;
        pointers.delete(id);
        if (!pointers.size) leases.delete(element);
        if (release && lease.ownedCapture && element.releasePointerCapture && element.hasPointerCapture?.(id)) {
          beforeRelease?.();
          element.releasePointerCapture(id);
        }
      }
    };
  })()`, context) as PointerLeaseModule;
}

class InlineStyle {
  private value = "pan-y";
  private priority = "";

  get touchAction(): string { return this.value; }
  set touchAction(value: string) { this.value = value; this.priority = ""; }
  getPropertyPriority(name: string): string { return name === "touch-action" ? this.priority : ""; }
  setProperty(name: string, value: string, priority = ""): void {
    if (name === "touch-action") { this.value = value; this.priority = priority; }
  }
}

/** A headless structural InputEventTargetLike; only controls need an HTMLElement cast. */
class PointerSurface implements InputEventTargetLike {
  readonly style = new InlineStyle();
  readonly captured = new Set<number>();
  readonly captureCalls: number[] = [];
  readonly releaseCalls: number[] = [];
  readonly listeners = new Map<string, Set<Listener>>();
  readonly captureListeners = new Map<string, Set<Listener>>();
  private clock = 0;
  honorCapturePhase = false;
  fixedTimestamp?: number;
  captureFailures = 0;
  onCapture?: (id: number) => void;
  onRelease?: (id: number) => void;

  addEventListener(type: string, listener: Listener | null, capture = false): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    if (capture) {
      const captures = this.captureListeners.get(type) ?? new Set<Listener>();
      captures.add(listener);
      this.captureListeners.set(type, captures);
    }
  }

  removeEventListener(type: string, listener: Listener | null, capture = false): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
    if (capture) this.captureListeners.get(type)?.delete(listener);
  }

  setPointerCapture(id: number): void {
    this.captureCalls.push(id);
    if (this.captureFailures > 0) {
      this.captureFailures -= 1;
      throw new Error("capture unavailable");
    }
    this.captured.add(id);
    this.onCapture?.(id);
  }

  hasPointerCapture(id: number): boolean { return this.captured.has(id); }

  releasePointerCapture(id: number): void {
    this.releaseCalls.push(id);
    this.captured.delete(id);
    this.onRelease?.(id);
  }

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 200, height: 200 } as DOMRect;
  }

  fire(type: string, id: number, x = 0, y = 0): void {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: id,
      pointerType: "touch",
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      clientX: x,
      clientY: y
    });
    Object.defineProperty(event, "timeStamp", { value: this.fixedTimestamp ?? ++this.clock });
    const listeners = [...(this.listeners.get(type) ?? [])];
    if (this.honorCapturePhase) {
      listeners.sort((a, b) => Number(this.captureListeners.get(type)?.has(b) ?? false) -
        Number(this.captureListeners.get(type)?.has(a) ?? false));
    }
    for (const listener of listeners) {
      if (!this.listeners.get(type)?.has(listener)) continue;
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
  }

  lose(id: number): void {
    this.captured.delete(id);
    this.fire("lostpointercapture", id);
  }

  get element(): HTMLElement { return this as unknown as HTMLElement; }
  get listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

function createControl(kind: ControlKind, surface: PointerSurface) {
  const root = new SceneNode();
  const object = new SceneNode();
  root.addChild(object);
  const events: string[] = [];
  const ray = (event: PointerEvent) => ({
    origin: { x: event.clientX, y: event.clientY, z: 10 },
    direction: { x: 0, y: 0, z: -1 }
  });
  const hit = (_ray: ReturnType<typeof ray>, event: PointerEvent) => ({
    object,
    point: { x: event.clientX, y: event.clientY, z: 0 },
    distance: 10
  });
  if (kind === "arcball") {
    const control = new ArcballControls(undefined, { element: surface.element });
    return { control, root, events, moving: () => control.state.rotation.y, dispose: () => control.dispose() };
  }
  if (kind === "drag") {
    const control = new DragControls({
      element: surface.element,
      rayFromPointer: ray,
      hitTest: hit,
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });
    return { control, root, events, moving: () => object.transform.position[0], dispose: () => control.dispose() };
  }
  const control = new InteractiveGroup({
    element: surface.element,
    root,
    rayFromPointer: ray,
    hitTest: (pointerRay, _root, event) => hit(pointerRay, event)
  });
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "click"] as const) {
    control.on(root, type, (event) => events.push(`${event.type}:${event.pointerId}`));
  }
  return {
    control,
    root,
    events,
    moving: () => events.filter((event) => event.startsWith("pointermove:")).length,
    dispose: () => control.dispose()
  };
}

describe("separately evaluated pointer lease modules", () => {
  it("keeps native capture until the last independently bundled owner releases it", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    expect(first.acquirePointerCapture).not.toBe(second.acquirePointerCapture);

    first.acquirePointerCapture(surface, 17, firstOwner);
    second.acquirePointerCapture(surface, 17, secondOwner);
    first.releasePointerCaptureLease(surface, 17, firstOwner, true);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
    second.releasePointerCaptureLease(surface, 17, secondOwner, true);
    expect(surface.captured.has(17)).toBe(false);
    expect(surface.captureCalls).toEqual([17]);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("restores the original touch-action only after independently bundled owners finish", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    surface.style.setProperty("touch-action", "pan-x", "important");

    first.acquireTouchAction(surface, firstOwner);
    second.acquireTouchAction(surface, secondOwner);
    first.releaseTouchAction(surface, firstOwner);
    expect(surface.style.touchAction).toBe("none");
    second.releaseTouchAction(surface, secondOwner);
    expect(surface.style.touchAction).toBe("pan-x");
    expect(surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it.each(["query", "beforeRelease"] as const)(
    "does not release a new cross-bundle owner acquired during the final release %s",
    (point) => {
      const { first, second } = independentLeaseModules();
      const surface = new PointerSurface();
      const original = {};
      const replacement = {};
      first.acquirePointerCapture(surface, 17, original);
      let reentered = false;
      const reenter = () => {
        if (reentered) return;
        reentered = true;
        second.acquirePointerCapture(surface, 17, replacement);
      };
      if (point === "query") {
        surface.hasPointerCapture = (id) => {
          reenter();
          return surface.captured.has(id);
        };
      }

      first.releasePointerCaptureLease(surface, 17, original, true, point === "beforeRelease" ? reenter : undefined);
      expect(reentered).toBe(true);
      expect(surface.captured.has(17)).toBe(true);
      expect(surface.releaseCalls).toEqual([]);
      second.releasePointerCaptureLease(surface, 17, replacement, true);
      expect(surface.releaseCalls).toEqual([17]);
    }
  );

  it("does not request capture after its owner is released during a reentrant capture query", () => {
    const { first } = independentLeaseModules();
    const surface = new PointerSurface();
    const owner = {};
    surface.hasPointerCapture = () => {
      first.releasePointerCaptureLease(surface, 17, owner, true);
      return false;
    };

    first.acquirePointerCapture(surface, 17, owner);
    expect(surface.captureCalls).toEqual([]);
    expect(surface.captured.size).toBe(0);
  });

  it("does not request capture after its owner releases from the setPointerCapture getter", () => {
    const { first } = independentLeaseModules();
    const surface = new PointerSurface();
    const owner = {};
    const setCapture = surface.setPointerCapture;
    let reentered = false;
    Object.defineProperty(surface, "setPointerCapture", {
      configurable: true,
      get() {
        if (!reentered) {
          reentered = true;
          first.releasePointerCaptureLease(surface, 17, owner, true);
        }
        return setCapture;
      }
    });

    first.acquirePointerCapture(surface, 17, owner);
    expect(reentered).toBe(true);
    expect(surface.captureCalls).toEqual([]);
    expect(surface.captured.size).toBe(0);
  });

  it("does not repeat a stale capture request after another bundle acquires inside the query", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    let reentered = false;
    surface.hasPointerCapture = (id) => {
      if (!reentered) {
        reentered = true;
        second.acquirePointerCapture(surface, id, secondOwner);
        return false; // The first query's result predates the nested capture.
      }
      return surface.captured.has(id);
    };

    first.acquirePointerCapture(surface, 17, firstOwner);
    expect(surface.captureCalls).toEqual([17]);
    first.releasePointerCaptureLease(surface, 17, firstOwner, true);
    expect(surface.captured.has(17)).toBe(true);
    second.releasePointerCaptureLease(surface, 17, secondOwner, true);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("rechecks a stale false query when another bundle observes an external capture", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    let reentered = false;
    surface.hasPointerCapture = (id) => {
      if (!reentered) {
        reentered = true;
        surface.captured.add(id); // An unrelated owner acquired after this query's snapshot.
        second.acquirePointerCapture(surface, id, secondOwner);
        return false;
      }
      return surface.captured.has(id);
    };

    first.acquirePointerCapture(surface, 17, firstOwner);
    expect(surface.captureCalls).toEqual([]);
    first.releasePointerCaptureLease(surface, 17, firstOwner, true);
    second.releasePointerCaptureLease(surface, 17, secondOwner, true);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
  });

  it("finishes a reentrant final release after an in-flight capture request returns", () => {
    const { first } = independentLeaseModules();
    const surface = new PointerSurface();
    const owner = {};
    surface.setPointerCapture = (id) => {
      surface.captureCalls.push(id);
      first.releasePointerCaptureLease(surface, id, owner, true);
      surface.captured.add(id);
    };

    first.acquirePointerCapture(surface, 17, owner);
    expect(surface.captureCalls).toEqual([17]);
    expect(surface.releaseCalls).toEqual([17]);
    expect(surface.captured.size).toBe(0);
  });

  it.each(["missing", "throwing"] as const)(
    "keeps a pending final release when a reentrant replacement capture method is %s",
    (method) => {
      const { first, second } = independentLeaseModules();
      const surface = new PointerSurface();
      const original = {};
      const replacement = {};
      surface.setPointerCapture = (id) => {
        surface.captureCalls.push(id);
        first.releasePointerCaptureLease(surface, id, original, true);
        Object.defineProperty(surface, "setPointerCapture", {
          configurable: true,
          get() {
            if (method === "throwing") throw new Error("capture getter failed");
            return undefined;
          }
        });
        if (method === "throwing") {
          expect(() => second.acquirePointerCapture(surface, id, replacement)).toThrow("capture getter failed");
        } else {
          second.acquirePointerCapture(surface, id, replacement);
        }
        surface.captured.add(id);
      };

      first.acquirePointerCapture(surface, 17, original);
      expect(surface.captureCalls).toEqual([17]);
      expect(surface.releaseCalls).toEqual([17]);
      expect(surface.captured.size).toBe(0);
    }
  );

  it("does not release an external replacement after an owner reports genuine capture loss", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    first.acquirePointerCapture(surface, 17, firstOwner);
    second.acquirePointerCapture(surface, 17, secondOwner);
    surface.captured.delete(17);
    surface.captured.add(17); // An unrelated caller now holds capture.

    first.releasePointerCaptureLease(surface, 17, firstOwner, false);
    second.releasePointerCaptureLease(surface, 17, secondOwner, true);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
  });

  it("keeps a newer coordinated capture when an older owner reports loss", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    const replacement = {};
    first.acquirePointerCapture(surface, 17, firstOwner);
    second.acquirePointerCapture(surface, 17, secondOwner);
    surface.captured.delete(17);
    second.acquirePointerCapture(surface, 17, replacement);

    first.releasePointerCaptureLease(surface, 17, firstOwner, false);
    second.releasePointerCaptureLease(surface, 17, secondOwner, false);
    expect(surface.captured.has(17)).toBe(true);
    second.releasePointerCaptureLease(surface, 17, replacement, true);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("does not restore a previous style onto an externally replaced style object", () => {
    const { first } = independentLeaseModules();
    const target = { style: new InlineStyle() };
    const owner = {};
    first.acquireTouchAction(target, owner);
    const replacement = new InlineStyle();
    replacement.touchAction = "none";
    target.style = replacement;

    first.releaseTouchAction(target, owner);
    expect(target.style).toBe(replacement);
    expect(replacement.touchAction).toBe("none");
  });

  it("restores touch-action when its final owner releases inside the initial style write", () => {
    const { first } = independentLeaseModules();
    const owner = {};
    let value = "pan-y";
    let reentered = false;
    const style = {
      get touchAction() { return value; },
      set touchAction(next: string) {
        if (next === "none" && !reentered) {
          reentered = true;
          first.releaseTouchAction(target, owner);
        }
        value = next;
      }
    };
    const target = { style };

    first.acquireTouchAction(target, owner);
    expect(reentered).toBe(true);
    expect(style.touchAction).toBe("pan-y");
  });

  it("keeps touch-action leased when another bundle acquires during restoration", () => {
    const { first, second } = independentLeaseModules();
    const firstOwner = {};
    const secondOwner = {};
    let value = "pan-y";
    let reentered = false;
    const style = {
      get touchAction() { return value; },
      set touchAction(next: string) {
        if (next === "pan-y" && !reentered) {
          reentered = true;
          second.acquireTouchAction(target, secondOwner);
        }
        value = next;
      }
    };
    const target = { style };

    first.acquireTouchAction(target, firstOwner);
    first.releaseTouchAction(target, firstOwner);
    expect(reentered).toBe(true);
    expect(style.touchAction).toBe("none");
    second.releaseTouchAction(target, secondOwner);
    expect(style.touchAction).toBe("pan-y");
  });

  it("does not restore an uninitialized lease over an already-none external style", () => {
    const { first } = independentLeaseModules();
    const owner = {};
    let value = "none";
    let reads = 0;
    const style = {
      get touchAction() {
        if (++reads === 1) first.releaseTouchAction(target, owner);
        return value;
      },
      set touchAction(next: string) { value = next; }
    };
    const target = { style };

    first.acquireTouchAction(target, owner);
    expect(style.touchAction).toBe("none");
  });

  it("rolls back an applied touch-action write when the setter then throws", () => {
    const { first } = independentLeaseModules();
    const owner = {};
    let value = "pan-y";
    let fail = true;
    const style = {
      get touchAction() { return value; },
      set touchAction(next: string) {
        value = next;
        if (next === "none" && fail) {
          fail = false;
          throw new Error("style write failed");
        }
      }
    };
    const target = { style };

    expect(() => first.acquireTouchAction(target, owner)).toThrow("style write failed");
    expect(style.touchAction).toBe("pan-y");
    first.releaseTouchAction(target, owner);
    expect(style.touchAction).toBe("pan-y");
  });

  for (const oldFirst of [true, false]) {
    for (const oldReleasesFirst of [true, false]) {
      it(`shares the version-1 protocol with an older bundle (old first: ${oldFirst}, old releases first: ${oldReleasesFirst})`, () => {
        const { first: current, context } = independentLeaseModules();
        const old = versionOneLeaseModule(context);
        const surface = new PointerSurface();
        const oldOwner = {};
        const currentOwner = {};
        surface.style.setProperty("touch-action", "pan-x", "important");
        const acquire = (module: PointerLeaseModule, owner: object) => {
          module.acquireTouchAction(surface, owner);
          module.acquirePointerCapture(surface, 17, owner);
        };
        const release = (module: PointerLeaseModule, owner: object) => {
          module.releaseTouchAction(surface, owner);
          module.releasePointerCaptureLease(surface, 17, owner, true);
        };

        if (oldFirst) { acquire(old, oldOwner); acquire(current, currentOwner); }
        else { acquire(current, currentOwner); acquire(old, oldOwner); }
        if (oldReleasesFirst) release(old, oldOwner);
        else release(current, currentOwner);
        expect(surface.style.touchAction).toBe("none");
        expect(surface.captured.has(17)).toBe(true);
        expect(surface.releaseCalls).toEqual([]);
        if (oldReleasesFirst) release(current, currentOwner);
        else release(old, oldOwner);
        expect(surface.style.touchAction).toBe("pan-x");
        expect(surface.style.getPropertyPriority("touch-action")).toBe("important");
        expect(surface.captureCalls).toEqual([17]);
        expect(surface.releaseCalls).toEqual([17]);
      });
    }
  }

  it("leaves an externally edited touch-action and priority alone at final release", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    first.acquireTouchAction(surface, firstOwner);
    second.acquireTouchAction(surface, secondOwner);
    surface.style.setProperty("touch-action", "pan-x", "important");
    first.releaseTouchAction(surface, firstOwner);
    second.releaseTouchAction(surface, secondOwner);
    expect(surface.style.touchAction).toBe("pan-x");
    expect(surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it("restores an external touch-action edit observed before a new owner joins", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    first.acquireTouchAction(surface, firstOwner);
    surface.style.setProperty("touch-action", "pan-x", "important");
    second.acquireTouchAction(surface, secondOwner);
    expect(surface.style.touchAction).toBe("none");
    first.releaseTouchAction(surface, firstOwner);
    second.releaseTouchAction(surface, secondOwner);
    expect(surface.style.touchAction).toBe("pan-x");
    expect(surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it("reacquires for an owner reentered before a synthetic native release actually drops capture", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const original = {};
    const replacement = {};
    first.acquirePointerCapture(surface, 17, original);
    surface.releasePointerCapture = (id) => {
      surface.releaseCalls.push(id);
      second.acquirePointerCapture(surface, id, replacement);
      surface.captured.delete(id);
    };

    first.releasePointerCaptureLease(surface, 17, original, true);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.captureCalls).toEqual([17, 17]);
    surface.releasePointerCapture = (id) => { surface.releaseCalls.push(id); surface.captured.delete(id); };
    second.releasePointerCaptureLease(surface, 17, replacement, true);
    expect(surface.captured.has(17)).toBe(false);
    expect(surface.releaseCalls).toEqual([17, 17]);
  });

  it("keeps an older bundle's owner when it joins during the modern final release", () => {
    const { first: current, context } = independentLeaseModules();
    const old = versionOneLeaseModule(context);
    const surface = new PointerSurface();
    const currentOwner = {};
    const oldOwner = {};
    current.acquirePointerCapture(surface, 17, currentOwner);

    current.releasePointerCaptureLease(surface, 17, currentOwner, true, () => {
      old.acquirePointerCapture(surface, 17, oldOwner);
    });
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
    old.releasePointerCaptureLease(surface, 17, oldOwner, true);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("rechecks ownership after a reentrant releasePointerCapture getter", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const original = {};
    const replacement = {};
    const releaseCapture = surface.releasePointerCapture;
    first.acquirePointerCapture(surface, 17, original);
    let reentered = false;
    Object.defineProperty(surface, "releasePointerCapture", {
      configurable: true,
      get() {
        if (!reentered) {
          reentered = true;
          second.acquirePointerCapture(surface, 17, replacement);
        }
        return releaseCapture;
      }
    });

    first.releasePointerCaptureLease(surface, 17, original, true);
    expect(reentered).toBe(true);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
    second.releasePointerCaptureLease(surface, 17, replacement, true);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("retains the new owner when beforeRelease reenters and throws", () => {
    const { first, second } = independentLeaseModules();
    const surface = new PointerSurface();
    const original = {};
    const replacement = {};
    first.acquirePointerCapture(surface, 17, original);
    expect(() => first.releasePointerCaptureLease(surface, 17, original, true, () => {
      second.acquirePointerCapture(surface, 17, replacement);
      throw new Error("before release failed");
    })).toThrow("before release failed");
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
    second.releasePointerCaptureLease(surface, 17, replacement, true);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("rejects an incompatible coordinator without overwriting it or touching the target", () => {
    const { first, context } = independentLeaseModules();
    const surface = new PointerSurface();
    runInContext(`Object.defineProperty(globalThis, Symbol.for("@aura3d/input/pointer-leases"), {
      value: Object.freeze({ version: 2, touchActionLeases: new WeakMap(), pointerCaptureLeases: new WeakMap() }),
      enumerable: false, configurable: false, writable: false
    })`, context);

    expect(() => first.acquirePointerCapture(surface, 17, {})).toThrow(/incompatible pointer lease coordinator/);
    expect(() => first.acquireTouchAction(surface, {})).toThrow(/incompatible pointer lease coordinator/);
    expect(surface.captured.size).toBe(0);
    expect(surface.captureCalls).toEqual([]);
    expect(surface.style.touchAction).toBe("pan-y");
    expect(runInContext(`globalThis[Symbol.for("@aura3d/input/pointer-leases")].version`, context)).toBe(2);
  });

  it("rejects an accessor on an otherwise frozen coordinator without invoking it", () => {
    const { first, context } = independentLeaseModules();
    const surface = new PointerSurface();
    runInContext(`(() => {
      globalThis.coordinatorReads = 0;
      const value = Object.freeze({
        version: 1,
        get touchActionLeases() { globalThis.coordinatorReads++; return new WeakMap(); },
        pointerCaptureLeases: new WeakMap()
      });
      Object.defineProperty(globalThis, Symbol.for("@aura3d/input/pointer-leases"), {
        value, enumerable: false, configurable: false, writable: false
      });
    })()`, context);

    expect(() => first.acquireTouchAction(surface, {})).toThrow(/incompatible pointer lease coordinator/);
    expect(runInContext("globalThis.coordinatorReads", context)).toBe(0);
    expect(surface.style.touchAction).toBe("pan-y");
  });

  it("accepts genuine WeakMaps provisioned from another realm under the same version-1 registry", () => {
    const { first, second, context } = independentLeaseModules();
    const surface = new PointerSurface();
    const firstOwner = {};
    const secondOwner = {};
    Object.assign(context, { touchActionLeases: new WeakMap(), pointerCaptureLeases: new WeakMap() });
    runInContext(`Object.defineProperty(globalThis, Symbol.for("@aura3d/input/pointer-leases"), {
      value: Object.freeze({ version: 1, touchActionLeases, pointerCaptureLeases }),
      enumerable: false, configurable: false, writable: false
    })`, context);

    first.acquirePointerCapture(surface, 17, firstOwner);
    second.acquirePointerCapture(surface, 17, secondOwner);
    first.releasePointerCaptureLease(surface, 17, firstOwner, true);
    expect(surface.captured.has(17)).toBe(true);
    second.releasePointerCaptureLease(surface, 17, secondOwner, true);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("keeps separately created realms' registries separate, even with the same Symbol.for key", () => {
    const firstRealm = independentLeaseModules();
    const secondRealm = independentLeaseModules();
    firstRealm.first.acquirePointerCapture(new PointerSurface(), 17, {});
    secondRealm.first.acquirePointerCapture(new PointerSurface(), 17, {});
    const key = `Symbol.for("@aura3d/input/pointer-leases")`;
    expect(runInContext(key, firstRealm.context)).toBe(runInContext(key, secondRealm.context));
    expect(runInContext(`globalThis[${key}]`, firstRealm.context))
      .not.toBe(runInContext(`globalThis[${key}]`, secondRealm.context));
  });
});

describe("InputSystem and controls share capture ownership", () => {
  for (const kind of ["arcball", "drag", "group"] as const) {
    for (const inputFirst of [true, false]) {
      for (const disposeInputFirst of [true, false]) {
        it(`${kind}: ${inputFirst ? "input" : "control"} created first, ${disposeInputFirst ? "input" : "control"} disposed first`, () => {
          const surface = new PointerSurface();
          const input = inputFirst ? new InputSystem(surface) : undefined;
          const control = createControl(kind, surface);
          const actualInput = input ?? new InputSystem(surface);
          surface.fire("pointerdown", 17);
          surface.fire("pointermove", 17, 2);
          expect(actualInput.update().pointer.contacts[0]).toMatchObject({ id: 17, down: true, clientX: 2 });
          expect(control.moving()).not.toBe(0);
          expect(surface.captured.has(17)).toBe(true);

          const before = control.moving();
          if (disposeInputFirst) actualInput.dispose();
          else control.dispose();

          // The remaining owner, not the first disposer, decides when capture ends.
          expect(surface.captured.has(17)).toBe(true);
          expect(surface.releaseCalls).toEqual([]);
          surface.fire("pointermove", 17, 4);
          if (disposeInputFirst) expect(control.moving()).not.toBe(before);
          else expect(actualInput.update().pointer.contacts[0]).toMatchObject({ id: 17, down: true, clientX: 4 });

          if (disposeInputFirst) control.dispose();
          else actualInput.dispose();
          expect(surface.captured.size).toBe(0);
          expect(surface.releaseCalls).toEqual([17]);
          expect(surface.captureCalls).toEqual([17]);
          expect(surface.style.touchAction).toBe("pan-y");
          expect(surface.listenerCount).toBe(0);
        });
      }
    }
  }
});

describe("cross-package pointer lease lifecycle", () => {
  it("re-exports the exact input coordinator from the controls compatibility module", () => {
    expect(controlLeases.acquirePointerCapture).toBe(acquirePointerCapture);
    expect(controlLeases.releasePointerCaptureLease).toBe(releasePointerCaptureLease);
    expect(controlLeases.acquireTouchAction).toBe(acquireTouchAction);
    expect(controlLeases.releaseTouchAction).toBe(releaseTouchAction);
  });

  it("keeps the package dependency one-way from controls to input", () => {
    const inputPackage = JSON.parse(readFileSync(new URL("../../../packages/input/package.json", import.meta.url), "utf8"));
    const controlsPackage = JSON.parse(readFileSync(new URL("../../../packages/controls/package.json", import.meta.url), "utf8"));
    expect(controlsPackage.dependencies["@aura3d/input"]).toBe("workspace:*");
    expect(inputPackage.dependencies["@aura3d/controls"]).toBeUndefined();
    const leaseSource = readFileSync(new URL("../../../packages/input/src/PointerLeases.ts", import.meta.url), "utf8");
    expect(leaseSource).not.toMatch(/\b(?:import|export)\s.*\bfrom\s*["']@aura3d\/controls/);
  });

  for (const kind of ["arcball", "drag", "group"] as const) {
    for (const inputFirst of [true, false]) {
      for (const disposeInputFirst of [true, false]) {
        it(`preserves externally acquired capture for ${kind} with ${inputFirst ? "input" : "control"} first and ${disposeInputFirst ? "input" : "control"} disposed first`, () => {
          const surface = new PointerSurface();
          surface.captured.add(17);
          const input = inputFirst ? new InputSystem(surface) : undefined;
          const control = createControl(kind, surface);
          const actualInput = input ?? new InputSystem(surface);
          surface.fire("pointerdown", 17);
          if (disposeInputFirst) {
            actualInput.dispose();
            control.dispose();
          } else {
            control.dispose();
            actualInput.dispose();
          }
          expect(surface.captured.has(17)).toBe(true);
          expect(surface.captureCalls).toEqual([]);
          expect(surface.releaseCalls).toEqual([]);
          expect(surface.style.touchAction).toBe("pan-y");
          expect(surface.listenerCount).toBe(0);
        });
      }
    }
  }

  it("shares capture between independent InputSystems but not between targets", () => {
    const firstTarget = new PointerSurface();
    const secondTarget = new PointerSurface();
    const first = new InputSystem(firstTarget);
    const second = new InputSystem(firstTarget);
    const otherTarget = new InputSystem(secondTarget);
    firstTarget.fire("pointerdown", 17);
    secondTarget.fire("pointerdown", 17);
    expect(firstTarget.captureCalls).toEqual([17]);
    expect(secondTarget.captureCalls).toEqual([17]);

    first.dispose();
    expect(firstTarget.captured.has(17)).toBe(true);
    expect(secondTarget.captured.has(17)).toBe(true);
    firstTarget.fire("pointermove", 17, 7);
    expect(second.update().pointer.contacts[0]).toMatchObject({ id: 17, down: true, clientX: 7 });
    second.dispose();
    expect(firstTarget.releaseCalls).toEqual([17]);
    expect(secondTarget.captured.has(17)).toBe(true);
    otherTarget.dispose();
    expect(secondTarget.releaseCalls).toEqual([17]);
  });

  it.each([true, false])("keeps one contact on genuine loss and ignores stale loss (input first: %s)", (inputFirst) => {
    const surface = new PointerSurface();
    const input = inputFirst ? new InputSystem(surface) : undefined;
    const control = createControl("arcball", surface);
    const actualInput = input ?? new InputSystem(surface);
    surface.onRelease = (id) => surface.fire("lostpointercapture", id);
    surface.fire("pointerdown", 17);
    surface.fire("pointerdown", 18, 10);
    actualInput.update();
    actualInput.endFrame();
    surface.fire("lostpointercapture", 17); // A delayed loss while this contact is still captured.
    expect(actualInput.update().pointer.cancellations).toEqual([]);
    surface.lose(17);
    const afterLoss = actualInput.update().pointer;
    expect(afterLoss.cancellations).toMatchObject([{ id: 17, reason: "lostpointercapture" }]);
    expect(afterLoss.touches.map((contact) => contact.id)).toEqual([18]);
    expect(surface.captured.has(18)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
    const before = control.moving();
    surface.fire("pointermove", 18, 14);
    expect(control.moving()).not.toBe(before);

    actualInput.endFrame();
    surface.fire("pointerup", 18, 14);
    expect(actualInput.update().pointer.cancellations).toEqual([]);
    expect(surface.releaseCalls).toEqual([18]);
    surface.fire("pointerdown", 17, 2);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.captureCalls).toEqual([17, 18, 17]);
    actualInput.dispose();
    expect(surface.captured.has(17)).toBe(true);
    control.dispose();
    expect(surface.releaseCalls).toEqual([18, 17]);
  });

  it.each([true, false])("retains a failed request as a live owner if the other consumer succeeds (input first: %s)", (inputFirst) => {
    const surface = new PointerSurface();
    surface.captureFailures = 1;
    const input = inputFirst ? new InputSystem(surface) : undefined;
    const control = createControl("arcball", surface);
    const actualInput = input ?? new InputSystem(surface);
    surface.fire("pointerdown", 17);
    expect(surface.captureCalls).toEqual([17, 17]);
    expect(surface.captured.has(17)).toBe(true);
    if (inputFirst) control.dispose();
    else actualInput.dispose();
    expect(surface.captured.has(17)).toBe(true);
    if (inputFirst) actualInput.dispose();
    else control.dispose();
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("restores the shared controls' original important touch-action only after the final control", () => {
    const surface = new PointerSurface();
    surface.style.setProperty("touch-action", "pan-x", "important");
    const input = new InputSystem(surface);
    const drag = createControl("drag", surface);
    const arcball = createControl("arcball", surface);
    surface.fire("pointerdown", 17);
    drag.dispose();
    expect(surface.style.touchAction).toBe("none");
    input.dispose();
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.style.touchAction).toBe("none");
    arcball.dispose();
    expect(surface.style.touchAction).toBe("pan-x");
    expect(surface.style.getPropertyPriority("touch-action")).toBe("important");
    expect(surface.releaseCalls).toEqual([17]);
  });

  it("accepts a headless target without any pointer-capture methods", () => {
    const target: InputEventTargetLike = new EventTarget();
    const input = new InputSystem(target);
    const emit = (type: string) => (target as EventTarget).dispatchEvent(Object.assign(new Event(type), {
      pointerId: 17, pointerType: "touch", button: 0, buttons: 1, clientX: 3, clientY: 4
    }));
    emit("pointerdown");
    expect(input.update().pointer.touches).toHaveLength(1);
    input.endFrame();
    emit("lostpointercapture");
    expect(input.update().pointer.cancellations).toMatchObject([{ id: 17, reason: "lostpointercapture" }]);
    input.dispose();
  });

  it("remains structurally compatible with a headless target using optional object listener options", () => {
    class ObjectOptionsTarget {
      readonly listeners = new Map<string, Set<EventListener>>();
      addEventListener(type: string, listener: EventListener, _options?: { capture?: boolean }): void {
        const listeners = this.listeners.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }
      removeEventListener(type: string, listener: EventListener, _options?: { capture?: boolean }): void {
        this.listeners.get(type)?.delete(listener);
      }
    }
    const target = new ObjectOptionsTarget();
    const input = new InputSystem(target);
    const event = Object.assign(new Event("pointerdown"), {
      pointerId: 17, pointerType: "touch", button: 0, buttons: 1, clientX: 3, clientY: 4
    });
    for (const listener of target.listeners.get("pointerdown") ?? []) listener(event);
    expect(input.update().pointer.touches).toHaveLength(1);
    input.dispose();
    expect([...target.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it("falls back when a headless target rejects optional listener arguments", () => {
    class StrictTarget {
      readonly listeners = new Map<string, Set<EventListener>>();
      addEventListener(type: string, listener: EventListener): void {
        if (arguments.length !== 2) throw new TypeError("only two listener arguments are supported");
        const listeners = this.listeners.get(type) ?? new Set<EventListener>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }
      removeEventListener(type: string, listener: EventListener): void {
        if (arguments.length !== 2) throw new TypeError("only two listener arguments are supported");
        this.listeners.get(type)?.delete(listener);
      }
    }
    const target = new StrictTarget();
    const input = new InputSystem(target);
    const event = Object.assign(new Event("pointerdown"), {
      pointerId: 17, pointerType: "touch", button: 0, buttons: 1, clientX: 3, clientY: 4
    });
    for (const listener of target.listeners.get("pointerdown") ?? []) listener(event);
    expect(input.update().pointer.touches).toHaveLength(1);
    expect(() => input.dispose()).not.toThrow();
    expect([...target.listeners.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it("does not release a capture that a partial target cannot prove the lease acquired", () => {
    class PartialTarget extends EventTarget implements InputEventTargetLike {
      captureCalls = 0;
      releaseCalls = 0;
      setPointerCapture(): void { this.captureCalls += 1; }
      releasePointerCapture(): void { this.releaseCalls += 1; }
    }
    const target = new PartialTarget();
    const input = new InputSystem(target);
    target.dispatchEvent(Object.assign(new Event("pointerdown"), {
      pointerId: 17, pointerType: "touch", button: 0, buttons: 1, clientX: 3, clientY: 4
    }));
    input.dispose();
    expect(target.captureCalls).toBe(1);
    expect(target.releaseCalls).toBe(0);
  });

  it("treats a throwing capture query as loss without propagating the target error", () => {
    const surface = new PointerSurface();
    const input = new InputSystem(surface);
    surface.hasPointerCapture = () => { throw new Error("capture query unsupported"); };
    surface.fire("pointerdown", 17);
    input.update();
    input.endFrame();
    expect(() => surface.lose(17)).not.toThrow();
    expect(input.update().pointer.cancellations).toMatchObject([{ id: 17, reason: "lostpointercapture" }]);
    input.dispose();
    expect(surface.releaseCalls).toEqual([]);
    expect(surface.listenerCount).toBe(0);
  });

  it.each(["blur", "device-disconnect"] as const)("does not steal a control's capture on input %s", (reason) => {
    const surface = new PointerSurface();
    const input = new InputSystem(surface);
    const control = createControl("arcball", surface);
    surface.fire("pointerdown", 17);
    input.update();
    input.endFrame();
    if (reason === "blur") surface.fire("blur", 17);
    else input.disconnectPointer(10);
    const snapshot = input.update();
    expect(snapshot.pointer.cancellations).toMatchObject([{ id: 17, reason }]);
    expect(snapshot.button(0).released).toBe(false);
    expect(surface.captured.has(17)).toBe(true);
    expect(surface.releaseCalls).toEqual([]);
    const before = control.moving();
    surface.fire("pointermove", 17, 3);
    expect(control.moving()).not.toBe(before);
    input.dispose();
    control.dispose();
    expect(surface.releaseCalls).toEqual([17]);
  });

  it.each(["blur", "device-disconnect"] as const)("keeps a reentrant second contact during bulk %s cleanup", (reason) => {
    const surface = new PointerSurface();
    const input = new InputSystem(surface);
    surface.fire("pointerdown", 17);
    surface.fire("pointerdown", 18);
    input.update();
    input.endFrame();
    surface.onRelease = (id) => {
      if (id === 17) surface.fire("pointerdown", 18, 7);
    };
    if (reason === "blur") surface.fire("blur", 17);
    else input.disconnectPointer(10);
    expect(surface.captured.has(18)).toBe(true);
    expect(surface.releaseCalls).toEqual([17]);
    expect(input.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 18, clientX: 7 });
    input.dispose();
    expect(surface.releaseCalls).toEqual([17, 18]);
  });

  it("releases captures from every attached target on blur", () => {
    const first = new PointerSurface();
    const second = new PointerSurface();
    const input = new InputSystem(first);
    input.attach(second);
    first.fire("pointerdown", 17);
    second.fire("pointerdown", 18);
    first.fire("blur", 17);
    expect(first.releaseCalls).toEqual([17]);
    expect(second.releaseCalls).toEqual([18]);
    expect(first.captured.size + second.captured.size).toBe(0);
    expect(input.update().pointer.cancellationReason).toBe("blur");
    input.dispose();
  });

  it.each(["blur", "device-disconnect"] as const)("keeps a reentrant press on another attached target during %s", (reason) => {
    const first = new PointerSurface();
    const second = new PointerSurface();
    const input = new InputSystem(first);
    input.attach(second);
    first.fire("pointerdown", 17);
    second.fire("pointerdown", 18);
    input.update();
    input.endFrame();
    first.onRelease = (id) => {
      if (id === 17) second.fire("pointerdown", 18, 7);
    };
    if (reason === "blur") first.fire("blur", 17);
    else input.disconnectPointer(10);
    expect(first.releaseCalls).toEqual([17]);
    expect(second.captured.has(18)).toBe(true);
    expect(second.releaseCalls).toEqual([]);
    expect(input.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 18, clientX: 7 });
    input.dispose();
    expect(second.releaseCalls).toEqual([18]);
    expect(first.listenerCount + second.listenerCount).toBe(0);
  });

  it("removes input listeners before a disposal release can reenter with a press", () => {
    const surface = new PointerSurface();
    const input = new InputSystem(surface);
    surface.onRelease = (id) => surface.fire("pointerdown", id, 9);
    surface.fire("pointerdown", 17);
    input.dispose();
    expect(surface.captureCalls).toEqual([17]);
    expect(surface.releaseCalls).toEqual([17]);
    expect(surface.captured.size).toBe(0);
    expect(surface.listenerCount).toBe(0);
    expect(input.update().pointer.touches).toEqual([]);
  });

  it("cleans up when a synthetic release method throws", () => {
    const surface = new PointerSurface();
    const input = new InputSystem(surface);
    surface.onRelease = () => { throw new Error("synthetic release failed"); };
    surface.fire("pointerdown", 17);
    expect(() => input.dispose()).not.toThrow();
    expect(surface.releaseCalls).toEqual([17]);
    expect(surface.captured.size).toBe(0);
    expect(surface.listenerCount).toBe(0);
  });

  it("handles synchronous capture loss during acquisition without leaking a lease", () => {
    const surface = new PointerSurface();
    const input = new InputSystem(surface);
    surface.onCapture = (id) => {
      surface.onCapture = undefined;
      surface.lose(id);
    };
    surface.fire("pointerdown", 17);
    expect(input.update().pointer.cancellations).toMatchObject([{ id: 17, reason: "lostpointercapture" }]);
    expect(surface.captured.size).toBe(0);
    expect(surface.releaseCalls).toEqual([]);
    input.endFrame();
    surface.fire("pointerdown", 17, 5);
    expect(input.update().pointer.touches).toHaveLength(1);
    input.dispose();
    expect(surface.captureCalls).toEqual([17, 17]);
    expect(surface.releaseCalls).toEqual([17]);
  });

  it.each([true, false])("survives a press and stale loss reentered during native release (input first: %s)", (inputFirst) => {
    const surface = new PointerSurface();
    const input = inputFirst ? new InputSystem(surface) : undefined;
    const control = createControl("arcball", surface);
    const actualInput = input ?? new InputSystem(surface);
    let restart = true;
    surface.onRelease = (id) => {
      if (restart) {
        restart = false;
        surface.fire("pointerdown", id, 3);
      }
      surface.fire("lostpointercapture", id);
    };
    surface.fire("pointerdown", 17);
    actualInput.update();
    actualInput.endFrame();
    surface.fire("pointerup", 17, 2);
    expect(surface.captured.has(17)).toBe(true);
    expect(actualInput.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 17, clientX: 3 });
    expect(actualInput.update().pointer.cancellations).toEqual([]);
    const before = control.moving();
    surface.fire("pointermove", 17, 6);
    expect(control.moving()).not.toBe(before);
    expect(surface.captureCalls).toEqual([17, 17]);
    expect(surface.releaseCalls).toEqual([17]);
    actualInput.dispose();
    expect(surface.captured.has(17)).toBe(true);
    control.dispose();
    expect(surface.releaseCalls).toEqual([17, 17]);
  });

  it.each([true, false])("preserves a group press reentered from genuine loss (input first: %s)", (inputFirst) => {
    const surface = new PointerSurface();
    const input = inputFirst ? new InputSystem(surface) : undefined;
    const group = createControl("group", surface);
    const actualInput = input ?? new InputSystem(surface);
    let restarted = false;
    (group.control as InteractiveGroup).on(group.root, "pointercancel", () => {
      if (!restarted) {
        restarted = true;
        surface.fire("pointerdown", 17, 3);
      }
    });
    surface.fire("pointerdown", 17);
    actualInput.update();
    actualInput.endFrame();
    surface.lose(17);
    expect(surface.captured.has(17)).toBe(true);
    expect(actualInput.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 17, clientX: 3 });
    expect(group.events.filter((event) => event === "pointerdown:17")).toHaveLength(2);
    const before = group.moving();
    surface.fire("pointermove", 17, 6);
    expect(group.moving()).not.toBe(before);
    actualInput.dispose();
    expect(surface.captured.has(17)).toBe(true);
    group.dispose();
    expect(surface.releaseCalls).toEqual([17]);
  });

  it.each([true, false])("preserves a group press reentered from pointerup (input first: %s)", (inputFirst) => {
    const surface = new PointerSurface();
    const input = inputFirst ? new InputSystem(surface) : undefined;
    const group = createControl("group", surface);
    const actualInput = input ?? new InputSystem(surface);
    let restarted = false;
    (group.control as InteractiveGroup).on(group.root, "pointerup", () => {
      if (!restarted) {
        restarted = true;
        surface.fire("pointerdown", 17, 3);
      }
    });
    surface.fire("pointerdown", 17);
    actualInput.update();
    actualInput.endFrame();
    surface.fire("pointerup", 17, 2);
    expect(surface.captured.has(17)).toBe(true);
    expect(actualInput.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 17, clientX: 3 });
    expect(group.events.filter((event) => event === "pointerdown:17")).toHaveLength(2);
    surface.fire("pointerup", 17, 3);
    expect(surface.releaseCalls).toEqual([17]);
    actualInput.dispose();
    group.dispose();
  });

  it.each([true, false])("preserves a group press reentered from pointercancel (input first: %s)", (inputFirst) => {
    const surface = new PointerSurface();
    const input = inputFirst ? new InputSystem(surface) : undefined;
    const group = createControl("group", surface);
    const actualInput = input ?? new InputSystem(surface);
    let restarted = false;
    (group.control as InteractiveGroup).on(group.root, "pointercancel", () => {
      if (!restarted) {
        restarted = true;
        surface.fire("pointerdown", 17, 3);
      }
    });
    surface.fire("pointerdown", 17);
    actualInput.update();
    actualInput.endFrame();
    surface.fire("pointercancel", 17, 2);
    expect(surface.captured.has(17)).toBe(true);
    expect(actualInput.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 17, clientX: 3 });
    expect(group.events.filter((event) => event === "pointerdown:17")).toHaveLength(2);
    surface.fire("pointerup", 17, 3);
    expect(surface.releaseCalls).toEqual([17]);
    actualInput.dispose();
    group.dispose();
  });

  it("uses DOM capture phase to preserve reentrant presses even when event timestamps are equal", () => {
    const surface = new PointerSurface();
    surface.honorCapturePhase = true;
    surface.fixedTimestamp = 10;
    const group = createControl("group", surface);
    const input = new InputSystem(surface);
    let restarted = false;
    (group.control as InteractiveGroup).on(group.root, "pointerup", () => {
      if (!restarted) {
        restarted = true;
        surface.fire("pointerdown", 17, 3);
      }
    });
    surface.fire("pointerdown", 17);
    input.update();
    input.endFrame();
    surface.fire("pointerup", 17, 2);
    expect(surface.captured.has(17)).toBe(true);
    expect(input.update().pointer.contacts.find((contact) => contact.down)).toMatchObject({ id: 17, clientX: 3 });
    surface.fire("pointerup", 17, 3);
    expect(surface.releaseCalls).toEqual([17]);
    input.dispose();
    group.dispose();
    expect(surface.listenerCount).toBe(0);
  });
});
