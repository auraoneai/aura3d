import { describe, expect, it } from "vitest";
import { DragControls, TransformControls, type ControlObject3DLike, type DragEvent } from "@aura3d/controls";
import { Bounds3, OrthographicCamera, SceneNode, type Renderable } from "@aura3d/scene";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";

type Listener = EventListenerOrEventListenerObject;

class PointerSurface {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly captured = new Set<number>();
  readonly style = { touchAction: "pan-y" };
  readonly width = 800;
  readonly height = 400;
  readonly offsetWidth = 200;
  readonly offsetHeight = 100;
  readonly clientWidth = 200;
  readonly clientHeight = 100;
  readonly clientLeft = 0;
  readonly clientTop = 0;
  onCapture?: (id: number) => void;
  captureFailure?: Error;

  getBoundingClientRect(): DOMRect {
    return { left: 100, top: 50, width: 400, height: 200 } as DOMRect;
  }

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
    if (this.captureFailure) throw this.captureFailure;
    this.captured.add(id);
    this.onCapture?.(id);
  }

  hasPointerCapture(id: number): boolean {
    return this.captured.has(id);
  }

  releasePointerCapture(id: number): void {
    this.captured.delete(id);
  }

  fire(type: string, id: number, x = 0, y = 0, pointerType = "touch"): void {
    const event = Object.assign(new Event(type), {
      pointerId: id,
      pointerType,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      clientX: x,
      clientY: y
    });
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
  }

  get element(): HTMLElement {
    return this as unknown as HTMLElement;
  }

  get listenerCount(): number {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

const pointerRay = (event: PointerEvent) => ({
  origin: { x: event.clientX, y: event.clientY, z: 10 },
  direction: { x: 0, y: 0, z: -1 }
});

const pointHit = (node: SceneNode, event: PointerEvent, instanceId?: number) => ({
  object: node,
  distance: 10,
  point: { x: event.clientX, y: event.clientY, z: 0 },
  instanceId
});

function translation(x: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1];
}

function nodeWithInstances(): SceneNode {
  const node = new SceneNode();
  node.renderable = {
    instanceTransforms: new Float32Array([...translation(0), ...translation(4)])
  } as Renderable;
  return node;
}

describe("pointer-owned drag interactions", () => {
  it("uses camera unprojection and real mesh hits instead of overlapping bounds", () => {
    const root = new SceneNode();
    const node = new SceneNode({ id: "pointer-triangle" });
    node.setLocalBounds(new Bounds3([0, 0, -0.01], [2, 2, 0.01]));
    root.addChild(node);
    const geometry = defineAuraCustomGeometry({
      positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
      indices: [0, 1, 2]
    });
    const mesh = {
      kind: "primitive" as const,
      primitive: "custom" as const,
      name: node.name,
      geometry,
      runtime: { id: node.id }
    };
    const camera = new OrthographicCamera({ left: -2, right: 2, bottom: -2, top: 2, near: 0.1, far: 20 });
    camera.transform.setPosition(0, 0, 10);
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      root,
      camera,
      pickOptions: {
        mode: "exact",
        query: (ray, options) => raycast(ray, { ...options, nodes: [mesh] })
      },
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });

    surface.fire("pointerdown", 1, 450, 75);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    surface.fire("pointerdown", 2, 350, 125);
    expect(controls.dragging).toBe(node);
    expect(surface.captured.has(2)).toBe(true);
    surface.fire("pointermove", 2, 450, 125);
    expect(node.transform.position[0]).toBeCloseTo(1);
    expect(node.transform.position[1]).toBeCloseTo(0);
    surface.fire("pointerup", 2, 450, 125);
    expect(events).toContain("dragstart:2");
    expect(events).toContain("dragend:2");
    expect(events).not.toContain("dragstart:1");
    expect(surface.captured.size).toBe(0);
    controls.dispose();
  });

  it("retains touch-action ownership until the last drag control is disposed", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const options = {
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray: ReturnType<typeof pointerRay>, event: PointerEvent) => pointHit(node, event)
    };
    const first = new DragControls(options);
    const second = new DragControls(options);

    expect(surface.style.touchAction).toBe("none");
    first.dispose();
    expect(surface.style.touchAction).toBe("none");
    second.dispose();
    expect(surface.style.touchAction).toBe("pan-y");
    expect(surface.listenerCount).toBe(0);
  });

  it("retains pointer capture while another drag control still owns that contact", () => {
    const surface = new PointerSurface();
    const firstNode = new SceneNode();
    const secondNode = new SceneNode();
    const events: string[] = [];
    const first = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(firstNode, event)
    });
    const second = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(secondNode, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    expect(first.dragging).toBe(firstNode);
    expect(second.dragging).toBe(secondNode);
    expect(surface.captured.has(1)).toBe(true);
    first.dispose();
    expect(surface.captured.has(1)).toBe(true);
    surface.fire("lostpointercapture", 1);
    surface.fire("pointermove", 1, 2);
    expect(secondNode.transform.position[0]).toBeCloseTo(2);
    surface.fire("pointerup", 1, 2);
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragend");
    expect(events).not.toContain("dragcancel");
    second.dispose();
  });

  it("does not overwrite an externally changed touch-action during disposal", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event)
    });

    expect(surface.style.touchAction).toBe("none");
    surface.style.touchAction = "manipulation";
    controls.dispose();
    expect(surface.style.touchAction).toBe("manipulation");
  });

  it("restores touch scrolling while every control is disabled and reacquires it when enabled", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const options = {
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray: ReturnType<typeof pointerRay>, event: PointerEvent) => pointHit(node, event)
    };
    const first = new DragControls(options);
    const second = new DragControls(options);

    first.enabled = false;
    expect(surface.style.touchAction).toBe("none");
    second.enabled = false;
    expect(surface.style.touchAction).toBe("pan-y");
    first.enabled = true;
    expect(surface.style.touchAction).toBe("none");
    first.dispose();
    second.dispose();
    expect(surface.style.touchAction).toBe("pan-y");
  });

  it("moves two contacts independently through a rotated, scaled parent", () => {
    const parent = new SceneNode();
    parent.transform.setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2).setScale(2, 3, 1);
    const first = new SceneNode();
    const second = new SceneNode();
    second.transform.setPosition(0, -2, 0);
    parent.addChild(first).addChild(second);
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(event.pointerId === 1 ? first : second, event),
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });

    surface.fire("pointerdown", 1, 0);
    surface.fire("pointerdown", 2, 6);
    expect([...surface.captured].sort()).toEqual([1, 2]);
    expect(controls.dragging).toBe(first);
    surface.fire("pointermove", 1, 2);
    surface.fire("pointermove", 2, 9);
    expect(first.transform.position[0]).toBeCloseTo(0);
    expect(first.transform.position[1]).toBeCloseTo(-2 / 3);
    expect(second.transform.position[0]).toBeCloseTo(0);
    expect(second.transform.position[1]).toBeCloseTo(-3);

    surface.fire("pointercancel", 1, 2);
    expect([...surface.captured]).toEqual([2]);
    expect(controls.dragging).toBe(second);
    expect(events).toContain("dragcancel:1");
    expect(events).not.toContain("dragend:1");
    surface.fire("pointermove", 2, 12);
    expect(second.transform.position[1]).toBeCloseTo(-4);
    surface.fire("pointerup", 2, 12);
    expect(events).toContain("dragend:2");
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    controls.dispose();
  });

  it("keeps the shared helper attached to the primary compatibility object", () => {
    const first: ControlObject3DLike = { position: { x: 0, y: 0, z: 0 } };
    const second: ControlObject3DLike = { position: { x: 4, y: 0, z: 0 } };
    const surface = new PointerSurface();
    const transforms = new TransformControls();
    const controls = new DragControls({
      transforms,
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => ({
        object: event.pointerId === 1 ? first : second,
        point: { x: event.clientX, y: event.clientY, z: 0 },
        distance: 10
      })
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointerdown", 2, 4);
    expect(controls.dragging).toBe(first);
    expect(transforms.object).toBe(first);
    surface.fire("pointerup", 1);
    expect(controls.dragging).toBe(second);
    expect(transforms.object).toBe(second);
    surface.fire("pointermove", 2, 6);
    expect(second.position.x).toBeCloseTo(6);
    controls.dispose();
    expect(transforms.object).toBeNull();
    expect(transforms.isDisposed).toBe(false);
  });

  it("does not grant two contacts ownership of the same whole object", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointerdown", 2);
    surface.fire("pointermove", 2, 9);
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect([...surface.captured]).toEqual([1]);
    expect(events.filter((event) => event.startsWith("dragstart"))).toEqual(["dragstart:1"]);
    surface.fire("pointerup", 2);
    surface.fire("pointermove", 1, 3);
    expect(node.transform.position[0]).toBeCloseTo(3);
    controls.dispose();
  });

  it("tracks two different instances and reports their identities in drag events", () => {
    const node = nodeWithInstances();
    const surface = new PointerSurface();
    const events: DragEvent<SceneNode>[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event, event.pointerId - 1),
      onEvent: (event) => events.push(event)
    });

    surface.fire("pointerdown", 1, 0);
    surface.fire("pointerdown", 2, 4);
    surface.fire("pointermove", 1, 1);
    surface.fire("pointermove", 2, 6);
    expect(node.renderable!.instanceTransforms![12]).toBeCloseTo(1);
    expect(node.renderable!.instanceTransforms![28]).toBeCloseTo(6);
    expect(node.transform.position).toEqual([0, 0, 0]);
    surface.fire("pointercancel", 1, 1);
    surface.fire("pointerup", 2, 6);
    expect(events.filter((event) => event.type === "dragstart")).toMatchObject([
      { pointerId: 1, instanceId: 0 },
      { pointerId: 2, instanceId: 1 }
    ]);
    expect(events.filter((event) => event.type === "dragcancel")).toMatchObject([
      { pointerId: 1, instanceId: 0 }
    ]);
    expect(events.filter((event) => event.type === "dragend")).toMatchObject([
      { pointerId: 2, instanceId: 1 }
    ]);
    controls.dispose();
  });

  it.each([-1, 0.5, 2, Number.NaN])("rejects invalid instance identity %s without moving the node", (instanceId) => {
    const node = nodeWithInstances();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event, instanceId),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointermove", 1, 3);
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).not.toContain("dragstart");
    controls.dispose();
  });

  it("cancels instead of moving the node when the selected instance disappears", () => {
    const node = nodeWithInstances();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event, 1),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1, 4);
    node.renderable!.instanceTransforms = new Float32Array(translation(0));
    surface.fire("pointermove", 1, 7);
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect(node.renderable!.instanceTransforms![12]).toBe(0);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("dragend");
    controls.dispose();
  });

  it("cancels a selected node that is disposed during the gesture", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    node.dispose();
    surface.fire("pointermove", 1, 3);
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("drag");
    controls.dispose();
  });

  it("cancels a disposed target even when the next pointer ray misses its drag plane", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: (event) => ({
        origin: { x: event.clientX, y: 0, z: 10 },
        direction: event.clientX === 0 ? { x: 0, y: 0, z: -1 } : { x: 1, y: 0, z: 0 }
      }),
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    node.dispose();
    surface.fire("pointermove", 1, 1);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    controls.dispose();
  });

  it("treats release of a disposed target as cancellation, not completion", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    node.dispose();
    surface.fire("pointerup", 1);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("dragend");
    controls.dispose();
  });

  it("does not edit a replacement instance buffer with the same number of matrices", () => {
    const node = nodeWithInstances();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event, 1),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1, 4);
    node.renderable!.instanceTransforms = new Float32Array([...translation(10), ...translation(20)]);
    surface.fire("pointermove", 1, 6);
    expect(node.renderable!.instanceTransforms![28]).toBe(20);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    controls.dispose();
  });

  it("cancels safely if the parent transform becomes noninvertible", () => {
    const parent = new SceneNode();
    const node = new SceneNode();
    parent.addChild(node);
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    parent.transform.setScale(0, 1, 1);
    expect(() => surface.fire("pointermove", 1, 3)).not.toThrow();
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("drag");
    controls.dispose();
  });

  it("ignores intersections behind the pointer ray and resumes when it faces the plane", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: (event) => ({
        origin: { x: event.clientX, y: 0, z: 10 },
        direction: { x: 0, y: 0, z: event.clientX > 5 ? 1 : -1 }
      }),
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointermove", 1, 9);
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect(events).not.toContain("drag");
    expect(surface.captured.has(1)).toBe(true);
    surface.fire("pointermove", 1, 2);
    expect(node.transform.position[0]).toBeCloseTo(2);
    surface.fire("pointerup", 1, 2);
    controls.dispose();
  });

  it("does not start after a hover observer synchronously cancels the press", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => {
        events.push(event.type);
        if (event.type === "hoverenter") surface.fire("pointercancel", event.pointerId);
      }
    });

    surface.fire("pointerdown", 1);
    expect(events).toEqual(["hoverenter", "hoverleave"]);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    controls.dispose();
  });

  it("does not duplicate a press reentered from a hover observer", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => {
        events.push(event.type);
        if (event.type === "hoverenter") surface.fire("pointerdown", event.pointerId);
      }
    });

    surface.fire("pointerdown", 1);
    expect(events).toEqual(["hoverenter", "dragstart"]);
    expect([...surface.captured]).toEqual([1]);
    surface.fire("pointerup", 1);
    controls.dispose();
  });

  it("does not emit a late start after capture is immediately lost", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });
    surface.onCapture = (id) => {
      surface.captured.delete(id);
      surface.fire("lostpointercapture", id);
    };

    surface.fire("pointerdown", 1);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).not.toContain("dragstart");
    expect(events).not.toContain("dragend");
    controls.dispose();
  });

  it("does not start a ghost drag when the browser rejects pointer capture", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    surface.captureFailure = new Error("pointer is no longer active");
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).not.toContain("dragstart");
    expect(events).not.toContain("dragend");
    controls.dispose();
  });

  it("preserves a new press on the same contact started by a dragend observer", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    let restart = true;
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => {
        events.push(`${event.type}:${event.pointerId}`);
        if (event.type === "dragend" && restart) {
          restart = false;
          surface.fire("pointerdown", event.pointerId, 1);
        }
      }
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointerup", 1, 1);
    expect(controls.dragging).toBe(node);
    expect(surface.captured.has(1)).toBe(true);
    expect(events).toEqual(["hoverenter:1", "dragstart:1", "dragend:1", "dragstart:1"]);
    surface.fire("lostpointercapture", 1);
    surface.fire("pointermove", 1, 3);
    expect(node.transform.position[0]).toBeCloseTo(2);
    surface.fire("pointerup", 1, 3);
    expect(events.filter((event) => event === "dragend:1")).toHaveLength(2);
    expect(events.filter((event) => event === "hoverleave:1")).toHaveLength(1);
    controls.dispose();
  });

  it("does not emit hoverleave twice when disposal is reentered from hoverleave", () => {
    const first = new SceneNode();
    const second = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    let controls: DragControls<SceneNode>;
    controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(event.clientX < 1 ? first : second, event),
      onEvent: (event) => {
        events.push(`${event.type}:${event.object === first ? "first" : "second"}`);
        if (event.type === "hoverleave") controls.dispose();
      }
    });

    surface.fire("pointermove", 1);
    surface.fire("pointermove", 1, 2);
    expect(events).toEqual(["hoverenter:first", "hoverleave:first"]);
    expect(controls.isDisposed).toBe(true);
    expect(surface.listenerCount).toBe(0);
  });

  it("terminates capture if a transform observer throws after a committed movement", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const failure = new Error("transform observer failed");
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    const unsubscribe = node.transform.onDirty(() => { throw failure; });
    expect(() => surface.fire("pointermove", 1, 3)).toThrow(failure);
    expect(node.transform.position[0]).toBeCloseTo(3);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("drag");
    unsubscribe();
    controls.dispose();
  });

  it("terminates capture and preserves the error when ray calculation fails during a drag", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const failure = new Error("ray provider failed");
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: (event) => {
        if (event.clientX > 0) throw failure;
        return pointerRay(event);
      },
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    expect(() => surface.fire("pointermove", 1, 2)).toThrow(failure);
    expect(node.transform.position).toEqual([0, 0, 0]);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("dragend");
    controls.dispose();
  });

  it("cancels all captured contacts on blur even when one observer throws", () => {
    const first = new SceneNode();
    const second = new SceneNode();
    const surface = new PointerSurface();
    const blurTarget = new PointerSurface();
    const failure = new Error("blur observer failed");
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      blurTarget: blurTarget.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(event.pointerId === 1 ? first : second, event),
      onEvent: (event) => {
        events.push(`${event.type}:${event.pointerId}`);
        if (event.type === "dragcancel" && event.pointerId === 1) throw failure;
      }
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointerdown", 2);
    expect(() => blurTarget.fire("blur", 0)).toThrow(failure);
    expect(events).toContain("dragcancel:1");
    expect(events).toContain("dragcancel:2");
    expect(events).not.toContain("dragend:1");
    expect(events).not.toContain("dragend:2");
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    controls.dispose();
    expect(surface.listenerCount).toBe(0);
    expect(blurTarget.listenerCount).toBe(0);
  });

  it("releases capture and publishes cancellation when a shared helper throws", () => {
    const failure = new Error("detach failed");
    class ThrowingTransforms extends TransformControls {
      fail = true;
      override detach(): void {
        if (this.fail) throw failure;
        super.detach();
      }
    }
    const transforms = new ThrowingTransforms();
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      transforms,
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    expect(() => surface.fire("pointercancel", 1)).toThrow(failure);
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("dragend");
    transforms.fail = false;
    controls.dispose();
    expect(transforms.isDisposed).toBe(false);
  });

  it("cancels every owned contact and removes listeners even if an observer throws", () => {
    const first = new SceneNode();
    const second = new SceneNode();
    const surface = new PointerSurface();
    const failure = new Error("first cancellation observer failed");
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(event.pointerId === 1 ? first : second, event),
      onEvent: (event) => {
        events.push(`${event.type}:${event.pointerId}`);
        if (event.type === "dragcancel" && event.pointerId === 1) throw failure;
      }
    });

    surface.fire("pointerdown", 1);
    surface.fire("pointerdown", 2);
    expect([...surface.captured].sort()).toEqual([1, 2]);
    expect(() => controls.dispose()).toThrow(failure);
    expect(events).toContain("dragcancel:1");
    expect(events).toContain("dragcancel:2");
    expect(surface.captured.size).toBe(0);
    expect(surface.listenerCount).toBe(0);
    expect(controls.dragging).toBeNull();
    expect(controls.isDisposed).toBe(true);
    expect(() => controls.dispose()).not.toThrow();
  });

  it("cancels a live drag as soon as the control is disabled", () => {
    const node = new SceneNode();
    const surface = new PointerSurface();
    const events: string[] = [];
    const controls = new DragControls({
      element: surface.element,
      rayFromPointer: pointerRay,
      hitTest: (_ray, event) => pointHit(node, event),
      onEvent: (event) => events.push(event.type)
    });

    surface.fire("pointerdown", 1);
    controls.enabled = false;
    expect(controls.dragging).toBeNull();
    expect(surface.captured.size).toBe(0);
    expect(events).toContain("dragcancel");
    expect(events).not.toContain("dragend");
    surface.fire("pointermove", 1, 5);
    expect(node.transform.position).toEqual([0, 0, 0]);
    controls.dispose();
  });
});
