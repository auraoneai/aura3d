import { describe, expect, it, vi } from "vitest";
import { Bounds3, OrthographicCamera, SceneNode, type Mat4, type Renderable } from "@aura3d/scene";
import { ArcballControls } from "../../../packages/controls/src/ArcballControls";
import { DragControls } from "../../../packages/controls/src/DragControls";
import { InteractiveGroup } from "../../../packages/controls/src/InteractiveGroup";
import { ControlVector3, type ControlObject3DLike } from "../../../packages/controls/src/NativeControlTypes";
import { Picking, type ExactScenePickQuery } from "../../../packages/controls/src/Picking";
import { SelectionBox } from "../../../packages/controls/src/SelectionBox";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";

class PointerTarget extends EventTarget {
  readonly captured = new Set<number>();
  readonly registrations = new Map<string, Set<EventListenerOrEventListenerObject>>();
  readonly style = { touchAction: "" };
  width = 400;
  height = 400;
  left = 100;
  top = 50;
  readonly clientWidth = 200;
  readonly clientHeight = 200;
  readonly offsetWidth = 200;
  readonly offsetHeight = 200;
  readonly clientLeft = 0;
  readonly clientTop = 0;
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    if (listener) {
      const listeners = this.registrations.get(type) ?? new Set();
      listeners.add(listener);
      this.registrations.set(type, listeners);
    }
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    if (listener) this.registrations.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  setPointerCapture(id: number): void { this.captured.add(id); }
  hasPointerCapture(id: number): boolean { return this.captured.has(id); }
  releasePointerCapture(id: number): void { this.captured.delete(id); }
  getBoundingClientRect(): DOMRect { return { left: this.left, top: this.top, width: 200, height: 200 } as DOMRect; }
  pointer(type: string, id: number, x: number, y = 0): void {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0, buttons: 1 });
    this.dispatchEvent(event);
  }
  get element(): HTMLElement { return this as unknown as HTMLElement; }
  get listenerCount(): number { return [...this.registrations.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function translated(x: number, y = 0, z = 0): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}
function camera(): OrthographicCamera {
  const result = new OrthographicCamera({ left: -4, right: 4, bottom: -4, top: 4, near: 0.1, far: 30 });
  result.transform.setPosition(0, 0, 10);
  return result;
}
function bounded(name: string): SceneNode {
  const node = new SceneNode({ name });
  node.setLocalBounds(new Bounds3([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]));
  return node;
}

function paddedScaledTarget(): PointerTarget {
  const target = new PointerTarget();
  const view = Object.assign(new EventTarget(), {
    getComputedStyle: () => ({
      borderLeftWidth: "8px", borderRightWidth: "4px", borderTopWidth: "4px", borderBottomWidth: "6px",
      paddingLeft: "100px", paddingRight: "20px", paddingTop: "45px", paddingBottom: "5px"
    })
  });
  Object.assign(target, {
    width: 536, height: 280, offsetWidth: 400, offsetHeight: 200,
    clientWidth: 388, clientHeight: 190, clientLeft: 8, clientTop: 4,
    ownerDocument: { defaultView: view }
  });
  target.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 300 }) as DOMRect;
  return target;
}

const triangleGeometry = defineAuraCustomGeometry({
  positions: [0, 0, 0, 2, 0, 0, 0, 2, 0],
  indices: [0, 1, 2]
});

describe("native interaction controls", () => {
  it("drags in world space through a rotated and scaled parent and cancels only the owning pointer", () => {
    const root = new SceneNode();
    root.transform.setPosition(3, 0, 0).setRotation(0, 0, Math.SQRT1_2, Math.SQRT1_2).setScale(2, 2, 2);
    const node = bounded("draggable");
    root.addChild(node);
    const element = new PointerTarget();
    const events: string[] = [];
    const control = new DragControls({
      element: element.element,
      root,
      rayFromPointer: (event) => ({ origin: { x: event.clientX, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } }),
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });
    element.pointer("pointerdown", 1, 3);
    element.pointer("pointerdown", 2, 3);
    element.pointer("pointermove", 1, 5);
    expect(node.transform.position[0]).toBeCloseTo(0, 6);
    expect(node.transform.position[1]).toBeCloseTo(-1, 6);
    element.pointer("pointerup", 2, 3);
    expect(control.dragging).toBe(node);
    element.pointer("pointercancel", 1, 5);
    expect(control.dragging).toBeNull();
    expect(events).toContain("dragcancel:1");
    expect(events).not.toContain("dragend:1");
    expect(element.captured.size).toBe(0);
    control.dispose();
    expect(element.listenerCount).toBe(0);
    element.pointer("pointermove", 1, 9);
    expect(node.transform.position[1]).toBeCloseTo(-1, 6);
  });

  it("moves the selected instance without moving its siblings or node", () => {
    const node = bounded("instances");
    node.renderable = { instanceTransforms: new Float32Array([...translated(0), ...translated(4)]) } as Renderable;
    const element = new PointerTarget();
    const control = new DragControls({
      element: element.element,
      root: node,
      rayFromPointer: (event) => ({ origin: { x: event.clientX, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } })
    });
    element.pointer("pointerdown", 1, 4);
    element.pointer("pointermove", 1, 6);
    element.pointer("pointerup", 1, 6);
    expect(node.renderable!.instanceTransforms![12]).toBe(0);
    expect(node.renderable!.instanceTransforms![28]).toBeCloseTo(6);
    expect(node.transform.position).toEqual([0, 0, 0]);
    control.dispose();
  });

  it("handles parent transforms supplied as ordinary vector objects", () => {
    const parent = { position: new ControlVector3(3, 0, 0), rotation: new ControlVector3(0, 0, Math.PI / 2), scale: new ControlVector3(2, 2, 2) };
    const object = { position: new ControlVector3(), parent };
    const element = new PointerTarget();
    const control = new DragControls({
      element: element.element,
      rayFromPointer: (event) => ({ origin: { x: event.clientX, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } }),
      hitTest: () => ({ object, point: { x: 3, y: 0, z: 0 }, distance: 10 })
    });
    element.pointer("pointerdown", 1, 3);
    element.pointer("pointermove", 1, 5);
    expect(object.position.x).toBeCloseTo(0, 6);
    expect(object.position.y).toBeCloseTo(-1, 6);
    control.dispose();
  });

  it("updates a manually authored matrix without re-enabling automatic transforms", () => {
    const node = bounded("matrix");
    node.transform.setLocalMatrix(translated(2) as Mat4, { matrixAutoUpdate: false });
    const element = new PointerTarget();
    const control = new DragControls({
      element: element.element, root: node,
      rayFromPointer: (event) => ({ origin: { x: event.clientX, y: 0, z: 10 }, direction: { x: 0, y: 0, z: -1 } })
    });
    element.pointer("pointerdown", 1, 2);
    element.pointer("pointermove", 1, 4);
    element.pointer("pointerup", 1, 4);
    expect(node.transform.matrixAutoUpdate).toBe(false);
    expect(node.transform.localMatrix[12]).toBeCloseTo(4);
    control.dispose();
  });

  it("uses exact mesh results and identities while retaining approximate mode", () => {
    const first = { id: "a", name: "duplicate", type: "Mesh", position: new ControlVector3(0, 0, -5) };
    const second = { id: "b", name: "duplicate", type: "Mesh", position: new ControlVector3(0, 0, -3) };
    const root: ControlObject3DLike = { name: "root", position: new ControlVector3(), children: [first, second] };
    const query = vi.fn((..._args: Parameters<ExactScenePickQuery>) => [
      { nodeId: "a", nodeName: "duplicate", distance: 5, point: [0, 0, -5] as const, normal: [0, 0, 1] as const, uv: [0.2, 0.3] as const, faceIndex: 8, instanceId: 4 },
      { nodeId: "b", nodeName: "duplicate", distance: 3, point: [0, 0, -3] as const, normal: [0, 0, 1] as const }
    ]);
    const picker = new Picking();
    const hits = picker.pickAll(root, new ControlVector3(), new ControlVector3(0, 0, -2), { mode: "exact", query });
    expect(hits.map((hit) => hit.object)).toEqual([second, first]);
    expect(hits[1]).toMatchObject({ faceIndex: 8, instanceId: 4, uv: [0.2, 0.3], metadata: { instanceId: 4 } });
    expect(query.mock.calls[0]?.[1]).toMatchObject({ mode: "mesh", recursive: true, firstHitOnly: false });
    expect(picker.pick(root)?.object).toBe(second);
    expect(() => picker.pick(root, undefined, undefined, { mode: "exact" })).toThrow("query adapter");
    expect(() => picker.pick(root, undefined, undefined, { mode: "exact", query: () => [{ nodeName: "duplicate", distance: 1, point: [0, 0, -1] }] })).toThrow("uniquely resolve");
  });

  it("consumes real engine mesh raycasts through the exact adapter", () => {
    const node = primitives.box({ name: "box" }).position(0, 0, -4).toJSON();
    const object: ControlObject3DLike = { name: "box", type: "Mesh", position: new ControlVector3(0, 0, -4) };
    const hit = new Picking().pick(object, new ControlVector3(0.2, 0.1, 0), new ControlVector3(0, 0, -1), {
      mode: "exact",
      query: (ray, options) => raycast(ray, { ...options, nodes: [node] })
    });
    expect(hit?.object).toBe(object);
    expect(hit?.distance).toBeCloseTo(3.5);
    expect(hit?.point.z).toBeCloseTo(-3.5);
    expect(hit?.faceIndex).toEqual(expect.any(Number));
    expect(hit?.normal?.z).toBeCloseTo(1);
    expect(hit?.uv).toHaveLength(2);
  });

  it("uses a real exact mesh query for native nodes instead of their overlapping bounds", () => {
    const root = new SceneNode();
    const front = new SceneNode({ id: "bounds-only", name: "duplicate" });
    const triangle = new SceneNode({ id: "triangle", name: "duplicate" });
    for (const node of [front, triangle]) {
      node.setLocalBounds(new Bounds3([0, 0, -0.01], [2, 2, 0.01]));
      root.addChild(node);
    }
    const mesh = { kind: "primitive" as const, primitive: "custom" as const, name: triangle.name,
      geometry: triangleGeometry, runtime: { id: triangle.id } };
    const element = new PointerTarget();
    const rayFromPointer = (event: PointerEvent) => ({
      origin: { x: event.clientX, y: event.clientY, z: 5 }, direction: { x: 0, y: 0, z: -2 }
    });

    // (1.8, 1.8) is inside both boxes but outside x + y <= 2, the triangle.
    const approximate = new DragControls({ element: element.element, root, rayFromPointer });
    element.pointer("pointerdown", 1, 1.8, 1.8);
    expect(approximate.dragging).toBe(front);
    element.pointer("pointercancel", 1, 1.8, 1.8);
    approximate.dispose();

    const query = vi.fn((ray: Parameters<ExactScenePickQuery>[0], options: Parameters<ExactScenePickQuery>[1]) =>
      raycast(ray, { ...options, nodes: [mesh] }));
    const exact = new DragControls({
      element: element.element, root, rayFromPointer,
      pickOptions: { mode: "exact", query, near: 1, far: 6 }
    });
    element.pointer("pointerdown", 2, 1.8, 1.8);
    expect(exact.dragging).toBeNull();
    expect(query).toHaveBeenCalledWith({ origin: [1.8, 1.8, 5], direction: [0, 0, -1], maxDistance: 6 },
      { mode: "mesh", near: 1, far: 6, recursive: true, firstHitOnly: false });
    element.pointer("pointerdown", 3, 0.5, 0.5);
    expect(exact.dragging).toBe(triangle);
    element.pointer("pointermove", 3, 1.5, 0.5);
    element.pointer("pointerup", 3, 1.5, 0.5);
    expect(triangle.transform.position[0]).toBeCloseTo(1);
    expect(front.transform.position[0]).toBe(0);
    exact.dispose();

    // The triangle is five units away. Both near and far must reach the adapter.
    for (const range of [{ near: 0, far: 4 }, { near: 6, far: 8 }]) {
      const limited = new DragControls({ element: element.element, root, rayFromPointer,
        pickOptions: { mode: "exact", query, ...range } });
      element.pointer("pointerdown", 4, 0.5, 0.5);
      expect(limited.dragging).toBeNull();
      limited.dispose();
    }
  });

  it("passes a native exact instance identity through to the dragged matrix", () => {
    const node = new SceneNode({ id: "copies", name: "copies" });
    node.setLocalBounds(new Bounds3([0, 0, -0.01], [2, 2, 0.01]));
    node.renderable = { instanceTransforms: new Float32Array([...translated(0), ...translated(4)]) } as Renderable;
    const mesh = { kind: "primitive" as const, primitive: "custom" as const, name: node.name,
      geometry: triangleGeometry, runtime: { id: node.id }, instances: [{ position: [0, 0, 0] as const }, { position: [4, 0, 0] as const }] };
    const element = new PointerTarget();
    const control = new DragControls({
      element: element.element, root: node,
      rayFromPointer: (event) => ({ origin: { x: event.clientX, y: event.clientY, z: 5 }, direction: { x: 0, y: 0, z: -1 } }),
      pickOptions: { mode: "exact", query: (ray, options) => raycast(ray, { ...options, nodes: [mesh] }) }
    });
    element.pointer("pointerdown", 1, 4.5, 0.5);
    expect(control.dragging).toBe(node);
    element.pointer("pointermove", 1, 5.5, 0.5);
    element.pointer("pointerup", 1, 5.5, 0.5);
    expect(node.renderable!.instanceTransforms![12]).toBe(0);
    expect(node.renderable!.instanceTransforms![28]).toBeCloseTo(5);
    expect(node.transform.position).toEqual([0, 0, 0]);
    control.dispose();
  });

  it("resolves native nodes from exact adapters, filters their range and chooses the nearest hit", () => {
    const root = new SceneNode();
    const nearer = bounded("nearer");
    const farther = bounded("farther");
    root.addChild(nearer);
    root.addChild(farther);
    const element = new PointerTarget();
    const resolveObject = vi.fn((hit: { readonly nodeId?: string }) =>
      hit.nodeId === "external-nearer" ? nearer : farther);
    const query: ExactScenePickQuery = () => [
      { nodeId: "external-farther", distance: 4, point: [0, 0, 1] },
      { nodeId: "external-farther", distance: 0.5, point: [0, 0, 4.5] },
      { nodeId: "external-nearer", distance: 2, point: [0, 0, 3] },
      { nodeId: "external-farther", distance: 9, point: [0, 0, -4] }
    ];
    const control = new DragControls({
      element: element.element, root,
      rayFromPointer: () => ({ origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }),
      pickOptions: { mode: "exact", query, resolveObject, near: 1, far: 6 }
    });
    element.pointer("pointerdown", 1, 0);
    expect(control.dragging).toBe(nearer);
    expect(resolveObject).toHaveBeenCalledWith(expect.objectContaining({ nodeId: "external-nearer", distance: 2 }));
    expect(resolveObject).not.toHaveBeenCalledWith(expect.objectContaining({ distance: 0.5 }));
    expect(resolveObject).not.toHaveBeenCalledWith(expect.objectContaining({ distance: 9 }));
    element.pointer("pointercancel", 1, 0);
    control.dispose();

    const metadata = vi.fn((object: SceneNode) => ({ selectable: object !== nearer }));
    const filtered = new DragControls({
      element: element.element, root,
      rayFromPointer: () => ({ origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }),
      pickOptions: { mode: "exact", query, resolveObject, metadata, near: 1, far: 6 }
    });
    element.pointer("pointerdown", 2, 0);
    expect(filtered.dragging).toBe(farther);
    expect(metadata).toHaveBeenCalledWith(nearer);
    element.pointer("pointercancel", 2, 0);
    filtered.dispose();
  });

  it("requires an adapter when native exact picking is requested", () => {
    const element = new PointerTarget();
    const control = new DragControls({
      element: element.element, root: bounded("node"),
      rayFromPointer: () => ({ origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }),
      pickOptions: { mode: "exact" }
    });
    // Invoke the registered DOM listener directly so a thrown error stays in
    // this assertion rather than being reported as an uncaught EventTarget error.
    const down = [...element.registrations.get("pointerdown")!][0] as EventListener;
    const event = Object.assign(new Event("pointerdown"), { pointerId: 1, pointerType: "touch", button: 0, clientX: 0, clientY: 0 });
    expect(() => down(event)).toThrow(/query adapter/i);
    expect(control.dragging).toBeNull();
    control.dispose();
  });

  it("includes parent rotation, scale and visibility in approximate picking", () => {
    const object: ControlObject3DLike = { name: "child", type: "Mesh", position: new ControlVector3(1, 0, 0) };
    const root: ControlObject3DLike = {
      name: "root", position: new ControlVector3(2, 0, -5), rotation: new ControlVector3(0, 0, Math.PI / 2),
      scale: new ControlVector3(2, 2, 2), children: [object]
    };
    const picker = new Picking();
    expect(picker.pick(root, new ControlVector3(2, 2, 0))?.object).toBe(object);
    expect(picker.pick(root, new ControlVector3(1, 0, 0))).toBeNull();
    const hidden = { ...root, visible: false };
    expect(picker.pick(hidden, new ControlVector3(2, 2, 0))).toBeNull();
    expect(picker.pick(hidden, new ControlVector3(2, 2, 0), undefined, { includeInvisible: true })?.object).toBe(object);
  });

  it("selects transformed instances and reevaluates live posed bounds", () => {
    const root = new SceneNode();
    root.transform.setPosition(1, 0, 0);
    const node = bounded("instances");
    node.renderable = { instanceTransforms: new Float32Array([...translated(-2), ...translated(2)]) } as Renderable;
    root.addChild(node);
    let animatedX = -1;
    const moving = bounded("animated");
    root.addChild(moving);
    const selection = new SelectionBox(camera(), root, {
      bounds: (object) => object === moving ? { min: [animatedX - 0.25, -0.25, -0.25], max: [animatedX + 0.25, 0.25, 0.25] } : undefined
    });
    const selectCenter = () => selection.select({ x: -0.3, y: -0.25 }, { x: 0.1, y: 0.25 });
    expect(selectCenter()).toEqual(expect.arrayContaining([{ object: node, instanceId: 0 }, { object: moving }]));
    expect(selectCenter()).not.toContainEqual({ object: node, instanceId: 1 });
    animatedX = 6;
    expect(selectCenter()).not.toContainEqual({ object: moving });
    const target = new PointerTarget();
    expect(selection.selectClient({ x: 170, y: 125 }, { x: 210, y: 175 }, target.element)).toContainEqual({ object: node, instanceId: 0 });
  });

  it("bubbles pointer events and never clicks a cancelled contact", () => {
    const root = new SceneNode({ name: "root" });
    const node = bounded("child");
    root.addChild(node);
    const element = new PointerTarget();
    const events: string[] = [];
    const group = new InteractiveGroup({
      element: element.element,
      root,
      rayFromPointer: () => ({ origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } })
    });
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"] as const) {
      group.on(node, type, (event) => events.push(`child:${type}:${event.pointerId}`));
      group.on(root, type, (event) => events.push(`root:${type}:${event.pointerId}`));
    }
    element.pointer("pointerdown", 1, 0);
    element.pointer("pointerdown", 2, 0);
    element.pointer("pointercancel", 1, 0);
    expect(element.captured.has(2)).toBe(true);
    element.pointer("pointerup", 2, 0);
    expect(events).toContain("child:pointercancel:1");
    expect(events).not.toContain("child:click:1");
    expect(events).toContain("root:click:2");
    expect(events.indexOf("child:click:2")).toBeLessThan(events.indexOf("root:click:2"));
    expect(element.captured.size).toBe(0);
    group.dispose();
    expect(element.listenerCount).toBe(0);
  });

  it("ignores delayed capture loss for a new drag while cancelling a genuine loss", () => {
    const node = bounded("drag");
    const element = new PointerTarget();
    const events: string[] = [];
    const blurTarget = new EventTarget();
    const drag = new DragControls({
      element: element.element, root: node, blurTarget,
      rayFromPointer: (event) => ({ origin: { x: event.clientX, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }),
      onEvent: (event) => events.push(`${event.type}:${event.pointerId}`)
    });
    element.pointer("pointerdown", 1, 0);
    element.pointer("pointerup", 1, 0);
    element.pointer("pointerdown", 1, 0);
    expect(element.captured.has(1)).toBe(true);
    element.pointer("lostpointercapture", 1, 0); // delayed loss from the previous press
    element.pointer("pointermove", 2, 2);
    element.pointer("pointerup", 2, 2);
    expect(drag.dragging).toBe(node);
    element.pointer("pointermove", 1, 2);
    expect(node.transform.position[0]).toBeCloseTo(2);
    expect(events.filter((event) => event === "dragcancel:1")).toHaveLength(0);

    element.captured.delete(1); // genuine loss: the browser no longer owns this capture
    element.pointer("lostpointercapture", 1, 2);
    expect(drag.dragging).toBeNull();
    expect(events.filter((event) => event === "dragcancel:1")).toHaveLength(1);
    expect(events.filter((event) => event === "dragend:1")).toHaveLength(1);

    element.pointer("pointerdown", 3, 2);
    blurTarget.dispatchEvent(new Event("blur"));
    expect(drag.dragging).toBeNull();
    expect(events).toContain("dragcancel:3");
    expect(element.captured.size).toBe(0);
    drag.dispose();
    expect(element.listenerCount).toBe(0);
  });

  it("finishes disposal after cancellation and hover observers throw", () => {
    const node = bounded("drag");
    const element = new PointerTarget();
    const blurTarget = new PointerTarget();
    const cancellationError = new Error("cancellation observer failed");
    const hoverError = new Error("hover observer failed");
    const calls: string[] = [];
    const drag = new DragControls({
      element: element.element, root: node, blurTarget,
      rayFromPointer: () => ({ origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }),
      onEvent: (event) => {
        calls.push(`${event.type}:${event.pointerId}`);
        if (event.type === "dragcancel") throw cancellationError;
        if (event.type === "hoverleave") throw hoverError;
      }
    });
    element.pointer("pointerdown", 1, 0);
    element.pointer("pointermove", 2, 0);
    expect(drag.dragging).toBe(node);
    expect(element.captured.has(1)).toBe(true);
    expect(blurTarget.listenerCount).toBe(1);

    let thrown: unknown;
    try { drag.dispose(); } catch (error) { thrown = error; }
    expect(thrown).toBe(cancellationError);
    expect(calls).toContain("dragcancel:1");
    expect(calls).toContain("hoverleave:1");
    expect(calls).toContain("hoverleave:2");
    expect(element.captured.size).toBe(0);
    expect(element.listenerCount).toBe(0);
    expect(blurTarget.listenerCount).toBe(0);
    expect(drag.dragging).toBeNull();
    expect(drag.isDisposed).toBe(true);
    expect(drag.transforms.isDisposed).toBe(true);
    expect(() => drag.dispose()).not.toThrow();
  });

  it("keeps a new press and other contacts alive after a delayed capture loss", () => {
    const root = new SceneNode();
    const node = bounded("child");
    root.addChild(node);
    const element = new PointerTarget();
    const events: string[] = [];
    const group = new InteractiveGroup({ element: element.element, root,
      rayFromPointer: () => ({ origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } }) });
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"] as const) {
      group.on(node, type, (event) => events.push(`${type}:${event.pointerId}`));
    }
    element.pointer("pointerdown", 1, 0);
    element.pointer("pointerup", 1, 0);
    element.pointer("pointerdown", 1, 0);
    element.pointer("lostpointercapture", 1, 0); // the new capture still belongs to pointer 1
    element.pointer("pointerup", 1, 0);
    expect(events.filter((event) => event === "click:1")).toHaveLength(2);
    expect(events).not.toContain("pointercancel:1");

    element.pointer("pointerdown", 2, 0);
    element.pointer("pointerdown", 3, 0);
    element.captured.delete(2);
    element.pointer("lostpointercapture", 2, 0);
    expect(events).toContain("pointercancel:2");
    expect(element.captured.has(3)).toBe(true);
    element.pointer("pointerup", 3, 0);
    expect(events).toContain("click:3");
    expect(events).not.toContain("click:2");
    expect(element.captured.size).toBe(0);
    group.dispose();
    expect(element.listenerCount).toBe(0);
  });

  it("uses the scaled content box and camera viewport for picking, dragging and marquee selection", () => {
    for (const sample of [
      { viewport: undefined, center: { x: 584, y: 228.5 }, delta: { x: 67, y: -26.25 } },
      { viewport: { x: 80, y: 40, width: 300, height: 160 }, center: { x: 546, y: 213.5 }, delta: { x: 37.5, y: -15 } }
    ]) {
      const element = paddedScaledTarget();
      const cam = camera();
      if (sample.viewport) cam.setViewport(sample.viewport);
      const root = new SceneNode();
      const node = bounded("center");
      const other = bounded("other");
      other.transform.setPosition(2.5, 0, 0);
      root.addChild(node);
      root.addChild(other);

      const clicks: number[] = [];
      const group = new InteractiveGroup({ element: element.element, root, camera: cam });
      group.on(node, "click", (event) => clicks.push(event.pointerId));
      element.pointer("pointerdown", 1, sample.center.x, sample.center.y);
      element.pointer("pointerup", 1, sample.center.x, sample.center.y);
      expect(clicks).toEqual([1]);
      group.dispose();

      const selection = new SelectionBox(cam, root);
      const selected = selection.selectClient(
        { x: sample.center.x + 10, y: sample.center.y + 6 },
        { x: sample.center.x - 10, y: sample.center.y - 6 }, element.element
      );
      expect(selected).toContainEqual({ object: node });
      expect(selected).not.toContainEqual({ object: other });

      const drag = new DragControls({ element: element.element, root, camera: cam });
      element.pointer("pointerdown", 2, sample.center.x, sample.center.y);
      expect(drag.dragging).toBe(node);
      element.pointer("pointermove", 2, sample.center.x + sample.delta.x, sample.center.y + sample.delta.y);
      element.pointer("pointerup", 2, sample.center.x + sample.delta.x, sample.center.y + sample.delta.y);
      expect(node.transform.position[0]).toBeCloseTo(1);
      expect(node.transform.position[1]).toBeCloseTo(1);
      drag.dispose();
      expect(element.listenerCount).toBe(0);
    }
  });

  it("unprojects embedded canvas coordinates using the current rectangle and framebuffer size", () => {
    const root = new SceneNode();
    const node = bounded("child");
    root.addChild(node);
    const element = new PointerTarget();
    const events: number[] = [];
    const group = new InteractiveGroup({ element: element.element, root, camera: camera() });
    group.on(node, "click", (event) => events.push(event.pointerId));
    element.pointer("pointerdown", 1, 200, 150);
    element.pointer("pointerup", 1, 200, 150);
    element.left = 270;
    element.top = 330;
    element.width = 800;
    element.height = 800;
    element.pointer("pointerdown", 2, 370, 430);
    element.pointer("pointerup", 2, 370, 430);
    expect(events).toEqual([1, 2]);
    group.dispose();

    const drag = new DragControls({ element: element.element, root, camera: camera() });
    element.pointer("pointerdown", 3, 370, 430);
    element.pointer("pointermove", 3, 395, 430);
    element.pointer("pointerup", 3, 395, 430);
    expect(node.transform.position[0]).toBeCloseTo(1);
    drag.dispose();
  });

  it("keeps the cursor's projected point fixed while zooming and rebases touch pairs", () => {
    const cam = { position: { x: 0, y: 0, z: 5 }, up: { x: 0, y: 1, z: 0 }, fovYRadians: Math.PI / 2, aspect: 1, near: 1, lookAt: () => {} };
    const control = new ArcballControls(cam, { cursorZoom: true, adjustNearPlane: true });
    const viewport = { left: 0, top: 0, width: 200, height: 200 };
    control.dollyToCursor(0.5, 150, 100, viewport);
    expect(cam.position.x).toBeCloseTo(1.25);
    expect(control.state.target.x).toBeCloseTo(1.25);
    expect(cam.position.z).toBeCloseTo(2.5);
    control.pointerDown({ pointerId: 1, clientX: 40, clientY: 80, pointerType: "touch" });
    control.pointerDown({ pointerId: 2, clientX: 100, clientY: 80, pointerType: "touch" });
    control.pointerDown({ pointerId: 3, clientX: 150, clientY: 80, pointerType: "touch" });
    const beforeThird = { ...cam.position };
    control.pointerMove({ pointerId: 3, clientX: 170, clientY: 140, pointerType: "touch" }, viewport);
    expect(cam.position).toEqual(beforeThird);
    control.pointerMove({ pointerId: 2, clientX: 120, clientY: 100, pointerType: "touch" }, viewport);
    expect(cam.position).not.toEqual(beforeThird);
    expect(control.state.rotation.z).not.toBe(0);
    control.pointerCancel({ pointerId: 1 });
    const rebased = { ...cam.position };
    control.pointerMove({ pointerId: 3, clientX: 170, clientY: 140, pointerType: "touch" }, viewport);
    expect(cam.position.x).toBeCloseTo(rebased.x);
    expect(cam.position.y).toBeCloseTo(rebased.y);
    expect(cam.position.z).toBeCloseTo(rebased.z);
    control.dispose();
    expect(cam.near).toBe(1);
  });

  it("drives marquee selection from connected pointer events into committed selection state", () => {
    const element = new PointerTarget();
    const blur = new EventTarget();
    const root = new SceneNode();
    const center = bounded("center");
    const other = bounded("other");
    other.transform.setPosition(2.5, 0, 0);
    root.addChild(center);
    root.addChild(other);
    const selection = new SelectionBox(camera(), root);
    const events: { type: string; start: { x: number; y: number }; end: { x: number; y: number }; selected: readonly unknown[] }[] = [];
    selection.subscribe((event) => events.push({
      type: event.type, start: event.start, end: event.end, selected: event.selection.map((hit) => hit.object)
    }));
    const shift = { held: true };
    const disconnect = selection.connect(element.element, { shouldStart: () => shift.held, blurTarget: blur });
    expect(element.listenerCount).toBe(5);

    // Content box is 200px at (100, 50): client (190..210, 140..160) is NDC +/-0.1, world +/-0.4.
    element.pointer("pointerdown", 1, 190, 140);
    expect(element.captured.has(1)).toBe(true);
    expect(selection.marquee).toEqual({ pointerId: 1, start: { x: 190, y: 140 }, end: { x: 190, y: 140 } });
    element.pointer("pointermove", 1, 205, 155);
    element.pointer("pointermove", 2, 300, 300); // Another contact never moves this marquee.
    expect(selection.marquee?.end).toEqual({ x: 205, y: 155 });
    element.pointer("pointerup", 1, 210, 160);
    expect(element.captured.has(1)).toBe(false);
    expect(selection.marquee).toBeNull();
    expect(selection.selection).toEqual([{ object: center }]);
    expect(events.map((event) => event.type)).toEqual(["marqueestart", "marqueemove", "marqueeend"]);
    expect(events[0].selected).toEqual([]);
    expect(events[2]).toMatchObject({ start: { x: 190, y: 140 }, end: { x: 210, y: 160 }, selected: [center] });

    // A cancelled or blurred gesture leaves the committed selection unchanged.
    events.length = 0;
    element.pointer("pointerdown", 3, 250, 140);
    element.pointer("pointermove", 3, 290, 160);
    element.pointer("pointercancel", 3, 290, 160);
    element.pointer("pointerdown", 4, 250, 140);
    blur.dispatchEvent(new Event("blur"));
    element.pointer("pointerup", 4, 290, 160);
    expect(events.map((event) => event.type)).toEqual(["marqueestart", "marqueemove", "marqueecancel", "marqueestart", "marqueecancel"]);
    expect(selection.selection).toEqual([{ object: center }]);
    expect(element.captured.size).toBe(0);

    // The interaction mode gate keeps ordinary presses from starting a marquee.
    shift.held = false;
    element.pointer("pointerdown", 5, 250, 140);
    expect(selection.marquee).toBeNull();
    shift.held = true;

    // Client (250..290) is NDC 0.5..0.9, world 2..3.6: the next commit replaces the selection.
    element.pointer("pointerdown", 6, 290, 160);
    element.pointer("pointerup", 6, 250, 140);
    expect(selection.selection).toEqual([{ object: other }]);

    disconnect();
    expect(element.listenerCount).toBe(0);
    element.pointer("pointerdown", 7, 190, 140);
    expect(selection.marquee).toBeNull();
    selection.dispose();
    expect(selection.selection).toEqual([]);
  });
});
