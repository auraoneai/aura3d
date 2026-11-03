import { describe, expect, it } from "vitest";
import { GestureRecognizer, InputSnapshot, InputSystem, PointerDevice } from "../../../packages/input/src";

type Surface = EventTarget & {
  width: number;
  height: number;
  rect: { left: number; top: number; width: number; height: number };
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  ownerDocument: { defaultView: EventTarget };
};

function surface(): Surface {
  const result = new EventTarget() as Surface;
  result.width = 600;
  result.height = 300;
  result.rect = { left: 100, top: 50, width: 300, height: 150 };
  result.getBoundingClientRect = () => ({ ...result.rect });
  result.ownerDocument = { defaultView: new EventTarget() };
  return result;
}

function emit(target: EventTarget, type: string, id: number, x: number, y: number, timestamp: number): void {
  const event = Object.assign(new Event(type), { pointerId: id, pointerType: "touch", clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "timeStamp", { value: timestamp });
  target.dispatchEvent(event);
}

describe("per-contact pointer contract", () => {
  it("keeps simultaneous contacts and their deltas separate, including an independent release", () => {
    const target = surface();
    const input = new InputSystem(target);
    emit(target, "pointerdown", 7, 120, 70, 10);
    emit(target, "pointerdown", 9, 200, 110, 11);
    input.update();
    input.endFrame();
    emit(target, "pointermove", 7, 125, 72, 20);
    emit(target, "pointermove", 9, 190, 115, 21);
    let snapshot = input.update();
    expect(snapshot.pointer.primaryId).toBe(7);
    expect([snapshot.pointer.x, snapshot.pointer.y, snapshot.pointer.deltaX, snapshot.pointer.deltaY]).toEqual([50, 44, 10, 4]);
    expect(snapshot.pointer.contacts.map(c => [c.id, c.deltaX, c.deltaY])).toEqual([[7, 10, 4], [9, -20, 10]]);
    input.endFrame();
    emit(target, "pointerup", 7, 125, 72, 30);
    snapshot = input.update();
    expect(snapshot.pointer.contacts.find(c => c.id === 7)).toMatchObject({ down: false, released: true, cancelled: false });
    expect(snapshot.pointer.contacts.find(c => c.id === 9)).toMatchObject({ down: true, released: false });
    expect(snapshot.pointer.touches.map(c => c.id)).toEqual([9]);
    expect(snapshot.button(0)).toMatchObject({ down: true, released: false });
    input.endFrame();
    emit(target, "pointerup", 9, 190, 115, 40);
    expect(input.update().button(0).released).toBe(true);
    input.dispose();
  });

  it("maps client, target CSS and drawing-buffer coordinates after scrolling and resize", () => {
    const target = surface();
    const input = new InputSystem(target);
    input.pointer.setDevicePixelRatio(3); // actual buffer-to-CSS scale, not DPR, is authoritative
    emit(target, "pointerdown", 3, 175, 100, 1);
    let pointer = input.update().pointer;
    expect(pointer).toMatchObject({ clientX: 175, clientY: 100, cssX: 75, cssY: 50, framebufferX: 150, framebufferY: 100, x: 150, y: 100 });
    expect(pointer.contacts[0]).toMatchObject({ clientX: 175, cssX: 75, framebufferX: 150 });
    input.endFrame();
    target.rect = { left: 125, top: 70, width: 250, height: 100 };
    target.width = 1000;
    target.height = 200;
    pointer = input.update().pointer;
    expect(pointer).toMatchObject({ clientX: 175, clientY: 100, cssX: 50, cssY: 30, framebufferX: 200, framebufferY: 60, deltaX: 0, deltaY: 0 });
    emit(target, "pointermove", 3, 180, 105, 2);
    pointer = input.update().pointer;
    expect(pointer).toMatchObject({ framebufferX: 220, framebufferY: 70, deltaX: 20, deltaY: 10 });
    input.dispose();
  });

  it("accounts for canvas border, padding and a CSS scale in its content coordinates", () => {
    const target = surface();
    Object.assign(target, { offsetWidth: 320, offsetHeight: 170, width: 600, height: 300 });
    target.rect = { left: 100, top: 50, width: 640, height: 340 };
    Object.assign(target.ownerDocument.defaultView, { getComputedStyle: () => ({
      borderLeftWidth: "5px", borderRightWidth: "5px", borderTopWidth: "5px", borderBottomWidth: "5px",
      paddingLeft: "5px", paddingRight: "5px", paddingTop: "5px", paddingBottom: "5px"
    }) });
    const input = new InputSystem(target);
    emit(target, "pointerdown", 3, 270, 160, 1);
    expect(input.update().pointer).toMatchObject({ cssX: 75, cssY: 45, framebufferX: 150, framebufferY: 90 });
    input.dispose();
  });

  it("keeps lost capture, focus loss and device disconnect separate from release", () => {
    const target = surface();
    const input = new InputSystem(target);
    emit(target, "pointerdown", 4, 120, 70, 1);
    emit(target, "pointerdown", 5, 130, 80, 2);
    input.update();
    input.endFrame();
    emit(target, "lostpointercapture", 4, 120, 70, 3);
    let snapshot = input.update();
    expect(snapshot.pointer.cancellations).toMatchObject([{ id: 4, reason: "lostpointercapture" }]);
    expect(snapshot.pointer.touches.map(c => c.id)).toEqual([5]);
    expect(snapshot.button(0).down).toBe(true);
    input.endFrame();
    target.ownerDocument.defaultView.dispatchEvent(new Event("blur"));
    snapshot = input.update();
    expect(snapshot.pointer.cancellationReason).toBe("blur");
    expect(snapshot.pointer.cancellations).toMatchObject([{ id: 5, reason: "blur" }]);
    expect(snapshot.button(0).released).toBe(false);
    input.endFrame();
    emit(target, "pointerdown", 6, 140, 80, 10);
    input.update();
    input.endFrame();
    input.disconnectPointer(20);
    snapshot = input.update();
    expect(snapshot.pointer.cancellations).toMatchObject([{ id: 6, reason: "device-disconnect", timestamp: 20 }]);
    expect(snapshot.button(0).released).toBe(false);
    input.dispose();
  });

  it("clears idle hover on focus loss until a new pointer movement", () => {
    const target = surface();
    const input = new InputSystem(target);
    target.dispatchEvent(Object.assign(new Event("pointermove"), { pointerId: 1, pointerType: "mouse", clientX: 120, clientY: 70 }));
    expect(input.update().pointer.contacts.map(contact => contact.id)).toEqual([1]);
    input.endFrame();
    target.ownerDocument.defaultView.dispatchEvent(new Event("blur"));
    expect(input.update().pointer.contacts).toEqual([]);
    input.endFrame();
    expect(input.update().pointer.contacts).toEqual([]);
    input.dispose();
  });

  it("uses elapsed milliseconds for taps independent of frame rate and rejects out-and-back dragging", () => {
    function run(duration: number, frames: number, travel = false) {
      const input = new InputSystem();
      const gestures = new GestureRecognizer();
      const point = (timeStamp: number, clientX = 0) => ({ pointerId: 1, pointerType: "touch", clientX, clientY: 0, timeStamp });
      input.pointer.down(point(100));
      gestures.update(input.update());
      input.endFrame();
      for (let i = 1; i < frames; i++) {
        input.pointer.move(point(100 + duration * i / frames));
        gestures.update(input.update());
        input.endFrame();
      }
      if (travel) {
        input.pointer.move(point(100 + duration - 2, 25));
        input.pointer.move(point(100 + duration - 1, 0));
      }
      input.pointer.up(point(100 + duration));
      return gestures.update(input.update());
    }
    for (const frames of [1, 6, 24, 120]) {
      expect(run(190, frames)).toContainEqual({ type: "tap", x: 0, y: 0 });
      expect(run(250, frames).some(g => g.type === "tap")).toBe(false);
    }
    expect(run(100, 1, true).some(g => g.type === "tap")).toBe(false);
  });

  it("keeps the same pinch pair across reorder and replacement contacts", () => {
    const gestures = new GestureRecognizer();
    const frame = (touches: Array<{ id: number; x: number; y: number }>) => new InputSnapshot({ pointer: { touches } });
    gestures.update(frame([{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 0 }, { id: 3, x: 100, y: 0 }]));
    expect(gestures.update(frame([{ id: 3, x: 100, y: 0 }, { id: 2, x: 20, y: 0 }, { id: 1, x: 0, y: 0 }]))).toContainEqual({ type: "pinch", scale: 2 });
    expect(gestures.update(frame([{ id: 2, x: 20, y: 0 }, { id: 3, x: 100, y: 0 }]))).toEqual([]);
    expect(gestures.update(frame([{ id: 3, x: 180, y: 0 }, { id: 2, x: 20, y: 0 }]))).toContainEqual({ type: "pinch", scale: 2 });
  });

  it("uses DPR only for targets without drawing-buffer dimensions", () => {
    const pointer = new PointerDevice();
    pointer.setDevicePixelRatio(2);
    pointer.setCoordinateTarget({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 100 }) });
    pointer.down({ clientX: 30, clientY: 50, pointerId: 1, pointerType: "touch", timeStamp: 1 });
    expect(pointer.snapshotData().pointer).toMatchObject({ cssX: 20, cssY: 30, framebufferX: 40, framebufferY: 60 });
  });

  it("does not synthesize taps when multiple contacts begin and end in the same frame", () => {
    const pointer = new PointerDevice();
    const recognizer = new GestureRecognizer();
    const event = (id: number, timeStamp: number) => ({ pointerId: id, pointerType: "touch", clientX: id * 10, clientY: 0, timeStamp });
    pointer.down(event(1, 10));
    pointer.down(event(2, 15));
    pointer.up(event(1, 20));
    pointer.up(event(2, 25));
    expect(recognizer.update(new InputSnapshot(pointer.snapshotData())).filter(gesture => gesture.type === "tap")).toEqual([]);
  });

  it("restores mouse hover coordinates after a touch interaction ends", () => {
    const pointer = new PointerDevice();
    pointer.move({ clientX: 10, clientY: 20, pointerId: 1, pointerType: "mouse" });
    pointer.down({ clientX: 100, clientY: 200, pointerId: 2, pointerType: "touch" });
    pointer.up({ clientX: 100, clientY: 200, pointerId: 2, pointerType: "touch" });
    pointer.endFrame();
    pointer.move({ clientX: 15, clientY: 25, pointerId: 1, pointerType: "mouse" });
    expect(pointer.snapshotData().pointer).toMatchObject({ primaryId: 1, clientX: 15, clientY: 25 });
  });

  it("tracks pointer-event mouse chords without prematurely ending the contact", () => {
    const input = new InputSystem();
    const mouse = (button: number, buttons: number) => ({ pointerId: 1, pointerType: "mouse", clientX: 5, clientY: 5, button, buttons });
    input.pointer.down(mouse(0, 1));
    input.update();
    input.endFrame();
    input.pointer.move(mouse(2, 3)); // secondary button down is a pointermove
    let snapshot = input.update();
    expect(snapshot.button(0).down).toBe(true);
    expect(snapshot.button(2).pressed).toBe(true);
    input.endFrame();
    input.pointer.move(mouse(0, 2)); // primary release is also a pointermove
    snapshot = input.update();
    expect(snapshot.button(0).released).toBe(true);
    expect(snapshot.button(2).down).toBe(true);
    expect(snapshot.pointer.contacts[0]).toMatchObject({ id: 1, down: true });
    input.endFrame();
    input.pointer.up(mouse(2, 0));
    snapshot = input.update();
    expect(snapshot.button(2).released).toBe(true);
  });

  it("does not recreate an active contact on moves after capture loss", () => {
    const input = new InputSystem();
    const mouse = { pointerId: 1, pointerType: "mouse", clientX: 5, clientY: 5, button: 0, buttons: 1 };
    input.pointer.down(mouse);
    input.update();
    input.endFrame();
    input.pointer.cancel(mouse, "lostpointercapture");
    input.pointer.move({ ...mouse, clientX: 10 });
    let snapshot = input.update();
    expect(snapshot.button(0).down).toBe(false);
    expect(snapshot.pointer.contacts[0]).toMatchObject({ cancelled: true, down: false });
    input.endFrame();
    input.pointer.move({ ...mouse, clientX: 15 });
    snapshot = input.update();
    expect(snapshot.button(0).down).toBe(false);
    expect(snapshot.button(0).pressed).toBe(false);
    input.pointer.down({ ...mouse, clientX: 15 });
    expect(input.update().button(0).pressed).toBe(true);
  });

  it("drops hover on pointerleave while preserving an active captured contact", () => {
    const target = surface();
    const input = new InputSystem(target);
    const event = (type: string) => target.dispatchEvent(Object.assign(new Event(type), {
      pointerId: 1, pointerType: "mouse", clientX: 120, clientY: 70, button: 0, buttons: type === "pointerdown" ? 1 : 0
    }));
    event("pointermove");
    expect(input.update().pointer.contacts).toHaveLength(1);
    event("pointerleave");
    expect(input.update().pointer.contacts).toEqual([]);
    event("pointerdown");
    event("pointerleave");
    expect(input.update().pointer.contacts[0]).toMatchObject({ id: 1, down: true });
    target.dispatchEvent(Object.assign(new Event("pointerup"), {
      pointerId: 1, pointerType: "mouse", clientX: 500, clientY: 500, button: 0, buttons: 0
    }));
    expect(input.update().pointer.contacts[0]).toMatchObject({ id: 1, down: false, released: true, overTarget: false });
    input.endFrame();
    expect(input.update().pointer.contacts).toEqual([]);
    input.dispose();
  });

  it("owns pointer capture through release, cancellation and disposal", () => {
    const target = surface() as Surface & {
      setPointerCapture(id: number): void;
      hasPointerCapture(id: number): boolean;
      releasePointerCapture(id: number): void;
    };
    const captured = new Set<number>();
    const released: number[] = [];
    target.setPointerCapture = id => { captured.add(id); };
    target.hasPointerCapture = id => captured.has(id);
    target.releasePointerCapture = id => {
      captured.delete(id);
      released.push(id);
      emit(target, "lostpointercapture", id, 120, 70, 10);
    };
    const input = new InputSystem(target);
    emit(target, "pointerdown", 1, 120, 70, 1);
    expect(captured.has(1)).toBe(true);
    input.update();
    input.endFrame();
    emit(target, "pointerup", 1, 120, 70, 2);
    expect(released).toEqual([1]);
    expect(input.update().pointer.cancellations).toEqual([]);
    input.endFrame();
    emit(target, "pointerdown", 2, 130, 70, 3);
    input.update();
    input.endFrame();
    emit(target, "pointercancel", 2, 130, 70, 4);
    expect(input.update().pointer.cancellations).toMatchObject([{ id: 2, reason: "pointercancel" }]);
    expect(released).toEqual([1, 2]);
    input.endFrame();
    emit(target, "pointerdown", 3, 140, 70, 5);
    input.dispose();
    expect(released).toEqual([1, 2, 3]);
    expect(captured.size).toBe(0);
    expect(input.update().pointer.cancellationReason).toBe("dispose");
  });

  it("does not let a delayed capture-loss event cancel a newer press", () => {
    const target = surface() as Surface & {
      setPointerCapture(id: number): void;
      hasPointerCapture(id: number): boolean;
      releasePointerCapture(id: number): void;
    };
    const captured = new Set<number>();
    target.setPointerCapture = id => { captured.add(id); };
    target.hasPointerCapture = id => captured.has(id);
    target.releasePointerCapture = id => { captured.delete(id); };
    const input = new InputSystem(target);
    emit(target, "pointerdown", 1, 120, 70, 1);
    input.update();
    input.endFrame();
    emit(target, "pointerup", 1, 120, 70, 2);
    input.update();
    input.endFrame();
    emit(target, "pointerdown", 1, 130, 70, 3);
    emit(target, "lostpointercapture", 1, 120, 70, 4); // delayed loss of the prior capture
    const snapshot = input.update();
    expect(snapshot.pointer.contacts[0]).toMatchObject({ id: 1, down: true, cancelled: false });
    expect(snapshot.pointer.cancellations).toEqual([]);
    input.dispose();
  });
});
