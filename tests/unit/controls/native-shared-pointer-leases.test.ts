import { describe, expect, it } from "vitest";
import { SceneNode } from "@aura3d/scene";
import { ArcballControls } from "../../../packages/controls/src/ArcballControls";
import { DragControls } from "../../../packages/controls/src/DragControls";
import { InteractiveGroup } from "../../../packages/controls/src/InteractiveGroup";

type Listener = EventListenerOrEventListenerObject;
type ControlKind = "drag" | "arcball" | "group";

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

class PointerSurface {
  readonly style = new InlineStyle();
  readonly captured = new Set<number>();
  readonly captureCalls: number[] = [];
  readonly releaseCalls: number[] = [];
  readonly listeners = new Map<string, Set<Listener>>();
  captureFailures = 0;
  onCapture?: (id: number) => void;

  addEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (listener) this.listeners.get(type)?.delete(listener);
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
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
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

function fixture(): {
  surface: PointerSurface;
  root: SceneNode;
  nodes: Map<number, SceneNode>;
} {
  const surface = new PointerSurface();
  const root = new SceneNode();
  const nodes = new Map<number, SceneNode>();
  for (const id of [11, 12, 17, 42]) {
    const node = new SceneNode({ name: `pointer-${id}` });
    root.addChild(node);
    nodes.set(id, node);
  }
  return { surface, root, nodes };
}

function ray(event: PointerEvent) {
  return {
    origin: { x: event.clientX, y: event.clientY, z: 10 },
    direction: { x: 0, y: 0, z: -1 }
  };
}

function createControl(kind: ControlKind, context: ReturnType<typeof fixture>) {
  const { surface, root, nodes } = context;
  const events: string[] = [];
  const hit = (_ray: ReturnType<typeof ray>, event: PointerEvent) => ({
    object: nodes.get(event.pointerId)!,
    point: { x: event.clientX, y: event.clientY, z: 0 },
    distance: 10
  });
  if (kind === "drag") {
    const control = new DragControls({
      element: surface.element,
      rayFromPointer: ray,
      hitTest: hit,
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });
    return {
      control,
      events,
      moving: () => events.filter((event) => event.startsWith("drag:")).length,
      dispose: () => control.dispose()
    };
  }
  if (kind === "arcball") {
    const control = new ArcballControls(undefined, { element: surface.element });
    return {
      control,
      events,
      moving: () => control.state.rotation.y,
      dispose: () => control.dispose()
    };
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
    events,
    moving: () => events.filter((event) => event.startsWith("pointermove:")).length,
    dispose: () => control.dispose()
  };
}

const pairs: readonly (readonly [ControlKind, ControlKind])[] = [
  ["drag", "arcball"],
  ["drag", "group"],
  ["arcball", "group"],
  ["arcball", "arcball"],
  ["group", "group"]
];

describe("shared pointer and touch-action ownership", () => {
  for (const [left, right] of pairs) {
    for (const reverseCreation of [false, true]) {
      for (const reverseDisposal of [false, true]) {
        it(`${left} and ${right} keep a live owner after ${reverseCreation ? "reversed creation" : "creation"} and ${reverseDisposal ? "reversed disposal" : "disposal"}`, () => {
          const context = fixture();
          const kinds: [ControlKind, ControlKind] = reverseCreation ? [right, left] : [left, right];
          const controls = kinds.map((kind) => createControl(kind, context));
          const { surface } = context;
          surface.fire("pointerdown", 17);
          const before = controls.map((control) => control.moving());
          surface.fire("pointermove", 17, 2);
          controls.forEach((control, index) => expect(control.moving()).not.toBe(before[index]));
          expect(surface.captured.has(17)).toBe(true);

          const first = reverseDisposal ? 1 : 0;
          const remaining = 1 - first;
          controls[first]!.dispose();
          expect(surface.captured.has(17)).toBe(true);
          expect(surface.releaseCalls).toEqual([]);
          expect(surface.style.touchAction).toBe(kinds[remaining] === "group" ? "pan-y" : "none");
          const beforeRemainingMove = controls[remaining]!.moving();
          surface.fire("pointermove", 17, 4);
          expect(controls[remaining]!.moving()).not.toBe(beforeRemainingMove);

          controls[remaining]!.dispose();
          expect(surface.captured.has(17)).toBe(false);
          expect(surface.releaseCalls).toEqual([17]);
          expect(surface.style.touchAction).toBe("pan-y");
          expect(surface.listenerCount).toBe(0);
        });
      }
    }
  }

  it.each(["drag", "arcball"] as const)("preserves an external style edit when %s releases first", (first) => {
    const context = fixture();
    const drag = createControl("drag", context);
    const arcball = createControl("arcball", context);
    context.surface.style.setProperty("touch-action", "manipulation", "important");
    (first === "drag" ? drag : arcball).dispose();
    expect(context.surface.style.touchAction).toBe("manipulation");
    expect(context.surface.style.getPropertyPriority("touch-action")).toBe("important");
    (first === "drag" ? arcball : drag).dispose();
    expect(context.surface.style.touchAction).toBe("manipulation");
    expect(context.surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it.each(["drag", "arcball"] as const)("restores an external style edit after a later %s lease", (later) => {
    const context = fixture();
    const first = createControl(later === "drag" ? "arcball" : "drag", context);
    context.surface.style.setProperty("touch-action", "pan-x", "important");
    const second = createControl(later, context);
    expect(context.surface.style.touchAction).toBe("none");
    expect(context.surface.style.getPropertyPriority("touch-action")).toBe("");
    first.dispose();
    second.dispose();
    expect(context.surface.style.touchAction).toBe("pan-x");
    expect(context.surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it("restores an original important declaration and preserves an external important none", () => {
    const context = fixture();
    context.surface.style.setProperty("touch-action", "pan-y", "important");
    const first = createControl("drag", context);
    const second = createControl("arcball", context);
    first.dispose();
    second.dispose();
    expect(context.surface.style.touchAction).toBe("pan-y");
    expect(context.surface.style.getPropertyPriority("touch-action")).toBe("important");

    const third = createControl("arcball", context);
    context.surface.style.setProperty("touch-action", "none", "important");
    third.dispose();
    expect(context.surface.style.touchAction).toBe("none");
    expect(context.surface.style.getPropertyPriority("touch-action")).toBe("important");
  });

  it("does not release a capture already held by an unrelated owner on the same element", () => {
    const context = fixture();
    context.surface.captured.add(42);
    const drag = createControl("drag", context);
    const arcball = createControl("arcball", context);
    const group = createControl("group", context);
    context.surface.fire("pointerdown", 42);
    drag.dispose();
    group.dispose();
    arcball.dispose();
    expect(context.surface.captured.has(42)).toBe(true);
    expect(context.surface.releaseCalls).toEqual([]);
  });

  it("shares one native capture request without reissuing it for later owners", () => {
    const context = fixture();
    const drag = createControl("drag", context);
    const arcball = createControl("arcball", context);
    const group = createControl("group", context);
    context.surface.onCapture = () => {
      if (context.surface.captureCalls.length > 1) throw new Error("duplicate capture request");
    };
    context.surface.fire("pointerdown", 17);
    expect(context.surface.captureCalls).toEqual([17]);
    context.surface.fire("pointermove", 17, 2);
    expect(drag.events).toContain("drag:17");
    expect(group.events).toContain("pointermove:17");
    expect(arcball.moving()).not.toBe(0);
    drag.dispose();
    arcball.dispose();
    expect(context.surface.captured.has(17)).toBe(true);
    group.dispose();
    expect(context.surface.releaseCalls).toEqual([17]);
  });

  it.each(["arcball", "group"] as const)("retains %s ownership if its capture request fails before another control succeeds", (kind) => {
    const context = fixture();
    context.surface.captureFailures = 1;
    const fallback = createControl(kind, context);
    const drag = createControl("drag", context);
    context.surface.fire("pointerdown", 17);
    expect(context.surface.captureCalls).toEqual([17, 17]);
    expect(context.surface.captured.has(17)).toBe(true);
    drag.dispose();
    expect(context.surface.captured.has(17)).toBe(true);
    const before = fallback.moving();
    context.surface.fire("pointermove", 17, 2);
    expect(fallback.moving()).not.toBe(before);
    fallback.dispose();
    expect(context.surface.captured.size).toBe(0);
    expect(context.surface.releaseCalls).toEqual([17]);
  });

  it("keeps another control active while a drag control is disabled and re-enabled", () => {
    const context = fixture();
    const drag = createControl("drag", context);
    const arcball = createControl("arcball", context);
    const dragControl = drag.control as DragControls<SceneNode>;
    context.surface.fire("pointerdown", 17);
    dragControl.enabled = false;
    expect(drag.events).toContain("dragcancel:17");
    expect(context.surface.captured.has(17)).toBe(true);
    expect(context.surface.style.touchAction).toBe("none");
    context.surface.fire("pointermove", 17, 2);
    expect(arcball.moving()).not.toBe(0);
    dragControl.enabled = true;
    arcball.dispose();
    expect(context.surface.captured.size).toBe(0);
    expect(context.surface.style.touchAction).toBe("none");
    drag.dispose();
    expect(context.surface.style.touchAction).toBe("pan-y");
  });

  it("reconnects arcball to a new element without disturbing the old element's drag", () => {
    const first = fixture();
    const second = fixture();
    const drag = createControl("drag", first);
    const arcball = createControl("arcball", first);
    first.surface.fire("pointerdown", 17);
    (arcball.control as ArcballControls).connect(second.surface.element);
    expect(first.surface.captured.has(17)).toBe(true);
    expect(first.surface.style.touchAction).toBe("none");
    expect(second.surface.style.touchAction).toBe("none");
    first.surface.fire("pointermove", 17, 3);
    expect(first.nodes.get(17)!.transform.position[0]).toBeCloseTo(3);
    second.surface.fire("pointerdown", 42);
    second.surface.fire("pointermove", 42, 2);
    expect(arcball.moving()).not.toBe(0);
    drag.dispose();
    expect(first.surface.captured.size).toBe(0);
    expect(first.surface.style.touchAction).toBe("pan-y");
    expect(second.surface.captured.has(42)).toBe(true);
    arcball.dispose();
    expect(second.surface.captured.size).toBe(0);
    expect(second.surface.style.touchAction).toBe("pan-y");
    expect(first.surface.listenerCount).toBe(0);
    expect(second.surface.listenerCount).toBe(0);
  });

  it("ignores stale loss, cancels a genuine shared loss, and retains another contact", () => {
    const context = fixture();
    const group = createControl("group", context);
    const drag = createControl("drag", context);
    const arcball = createControl("arcball", context);
    const arcballControl = arcball.control as ArcballControls;
    const { surface, nodes } = context;
    surface.fire("pointerdown", 11);
    surface.fire("pointerdown", 12, 10);
    expect([...surface.captured].sort()).toEqual([11, 12]);

    surface.fire("lostpointercapture", 11);
    const initialDistance = arcballControl.state.position.z;
    surface.fire("pointermove", 11, 2);
    expect(arcballControl.state.position.z).not.toBe(initialDistance);
    expect(drag.events).not.toContain("dragcancel:11");
    expect(group.events).not.toContain("pointercancel:11");

    surface.lose(11);
    expect(drag.events.filter((event) => event === "dragcancel:11")).toHaveLength(1);
    expect(group.events.filter((event) => event === "pointercancel:11")).toHaveLength(1);
    expect(surface.captured.has(12)).toBe(true);
    expect(surface.releaseCalls).not.toContain(11);
    const rotation = arcballControl.state.rotation.y;
    surface.fire("pointermove", 12, 14);
    expect(nodes.get(12)!.transform.position[0]).toBeCloseTo(4);
    expect(arcballControl.state.rotation.y).not.toBe(rotation);
    surface.fire("pointerup", 11, 2);
    surface.fire("pointerup", 12, 14);
    expect(drag.events).not.toContain("dragend:11");
    expect(drag.events).toContain("dragend:12");
    expect(group.events).not.toContain("click:11");
    expect(group.events).toContain("click:12");
    expect(surface.captured.size).toBe(0);
    group.dispose();
    drag.dispose();
    arcball.dispose();
  });

  it("keeps a reentrant group press captured while a different control ends its old press", () => {
    const context = fixture();
    const group = createControl("group", context);
    const drag = createControl("drag", context);
    let restarted = false;
    (group.control as InteractiveGroup).on(context.root, "pointerup", () => {
      if (!restarted) {
        restarted = true;
        context.surface.fire("pointerdown", 17, 1);
      }
    });
    context.surface.fire("pointerdown", 17);
    context.surface.fire("pointerup", 17, 1);
    expect(context.surface.captured.has(17)).toBe(true);
    expect(group.events.filter((event) => event === "pointerdown:17")).toHaveLength(2);
    context.surface.fire("pointerup", 17, 1);
    expect(group.events.filter((event) => event === "pointerup:17")).toHaveLength(2);
    expect(group.events).toContain("click:17");
    expect(context.surface.captured.has(17)).toBe(false);
    expect(context.surface.releaseCalls).toEqual([17]);
    group.dispose();
    drag.dispose();
  });

  it("keeps a newly acquired capture when an old loss listener starts another press", () => {
    const context = fixture();
    const group = createControl("group", context);
    const drag = createControl("drag", context);
    const arcball = createControl("arcball", context);
    let restarted = false;
    (group.control as InteractiveGroup).on(context.root, "pointercancel", () => {
      if (!restarted) {
        restarted = true;
        context.surface.fire("pointerdown", 17, 1);
      }
    });
    context.surface.fire("pointerdown", 17);
    context.surface.lose(17);
    expect(context.surface.captured.has(17)).toBe(true);
    expect(group.events.filter((event) => event === "pointerdown:17")).toHaveLength(2);
    expect(drag.events).not.toContain("dragcancel:17");
    context.surface.fire("pointermove", 17, 3);
    expect(drag.events).toContain("drag:17");
    context.surface.fire("pointerup", 17, 3);
    expect(group.events).toContain("click:17");
    expect(context.surface.captured.has(17)).toBe(false);
    group.dispose();
    drag.dispose();
    arcball.dispose();
  });

  it("does not dispatch a late group press when capture is immediately lost", () => {
    const context = fixture();
    const group = createControl("group", context);
    context.surface.onCapture = (id) => context.surface.lose(id);
    context.surface.fire("pointerdown", 17);
    expect(group.events).toContain("pointercancel:17");
    expect(group.events).not.toContain("pointerdown:17");
    expect(context.surface.captured.size).toBe(0);
    group.dispose();
  });

  it("does not duplicate a nested group press or leak its capture lease", () => {
    const context = fixture();
    const group = createControl("group", context);
    const drag = createControl("drag", context);
    let nested = false;
    (group.control as InteractiveGroup).on(context.root, "pointerenter", () => {
      if (!nested) {
        nested = true;
        context.surface.fire("pointerdown", 17);
      }
    });
    context.surface.fire("pointerdown", 17);
    expect(group.events.filter((event) => event === "pointerdown:17")).toHaveLength(1);
    expect(drag.events.filter((event) => event === "dragstart:17")).toHaveLength(1);
    context.surface.fire("pointerup", 17);
    expect(context.surface.captured.size).toBe(0);
    expect(context.surface.releaseCalls).toEqual([17]);
    group.dispose();
    drag.dispose();
  });

  it("does not resurrect a group press cancelled from a shared move observer", () => {
    const context = fixture();
    const group = createControl("group", context);
    const drag = createControl("drag", context);
    (group.control as InteractiveGroup).on(context.root, "pointermove", () => {
      context.surface.fire("pointercancel", 17, 2);
    });
    context.surface.fire("pointerdown", 17);
    context.surface.fire("pointermove", 17, 2);
    expect(group.events).toContain("pointercancel:17");
    expect(drag.events).toContain("dragcancel:17");
    expect(context.surface.captured.size).toBe(0);
    context.surface.fire("pointerup", 17, 2);
    expect(group.events).not.toContain("pointerup:17");
    expect(group.events).not.toContain("click:17");
    group.dispose();
    drag.dispose();
  });
});
