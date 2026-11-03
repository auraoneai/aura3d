import { expect, it } from "vitest";
import { Ray, Vector3 } from "../../../packages/math/src";
import { GestureRecognizer, InputSystem, InteractionSystem } from "../../../packages/input/src";

it("cancels one touch without activating a gesture or releasing another, and removes its listeners", () => {
  const target = new EventTarget();
  const input = new InputSystem(target);
  const recognizer = new GestureRecognizer();
  const events: Array<{ type: string; pointerId?: number }> = [];
  const interaction = new InteractionSystem(
    () => new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)),
    () => [{ id: "target", bounds: { min: [-1, -1, 0], max: [1, 1, 1] } }]
  );
  interaction.subscribe(({ type, pointerId }) => events.push({ type, pointerId }));
  const emit = (type: string, id: number, x = 25) => target.dispatchEvent(Object.assign(new Event(type), {
    pointerId: id, pointerType: "touch", clientX: x, clientY: 30, button: 0
  }));
  emit("pointerdown", 7);
  emit("pointerdown", 8, 50);
  let snapshot = input.update();
  interaction.update(snapshot);
  recognizer.update(snapshot);
  expect(snapshot.pointer.touches.map(t => t.id)).toEqual([7, 8]);
  input.endFrame();

  emit("pointermove", 7, 45);
  snapshot = input.update();
  interaction.update(snapshot);
  input.endFrame();
  emit("pointercancel", 7, 45);
  snapshot = input.update();
  expect(snapshot.pointer.touches.map(t => t.id)).toEqual([8]);
  expect(snapshot.button(0)).toMatchObject({ down: true, released: false });
  expect(snapshot.pointer.cancellations).toMatchObject([{ id: 7, reason: "pointercancel" }]);
  expect(recognizer.update(snapshot).filter(g => g.type === "tap")).toEqual([]);
  interaction.update(snapshot);
  expect(events).toContainEqual({ type: "drag-cancel", pointerId: 7 });
  expect(events.filter(e => e.pointerId === 7 && ["click", "drag-end"].includes(e.type))).toEqual([]);

  input.endFrame();
  emit("pointerup", 8, 50);
  snapshot = input.update();
  interaction.update(snapshot);
  expect(snapshot.button(0).released).toBe(true);
  expect(events).toContainEqual({ type: "click", pointerId: 8 });
  input.dispose();
  emit("pointerdown", 9);
  expect(input.update().pointer.touches).toEqual([]);
});

it("does not expose cancellation of the last contact as a normal release", () => {
  const input = new InputSystem();
  input.pointer.down({ pointerId: 1, pointerType: "touch", clientX: 1, clientY: 2 });
  input.update();
  input.endFrame();
  input.pointer.cancel({ pointerId: 1, pointerType: "touch", clientX: 1, clientY: 2 });
  const snapshot = input.update();
  expect(snapshot.button(0)).toEqual({ down: false, pressed: false, released: false });
  expect(snapshot.pointer.contacts[0]).toMatchObject({ id: 1, cancelled: true, released: false });
});

it("computes independent rays and disposes interaction subscribers", () => {
  const input = new InputSystem();
  const interaction = new InteractionSystem(
    snapshot => new Ray(new Vector3(snapshot.pointer.x, 0, 5), new Vector3(0, 0, -1)),
    () => [
      { id: "first", bounds: { min: [0, -1, 0], max: [2, 1, 1] } },
      { id: "second", bounds: { min: [9, -1, 0], max: [11, 1, 1] } }
    ]
  );
  const events: Array<[string, number | undefined, string | undefined]> = [];
  interaction.subscribe(event => events.push([event.type, event.pointerId, event.target?.id]));
  input.pointer.down({ pointerId: 1, pointerType: "touch", clientX: 1, clientY: 0 });
  input.pointer.down({ pointerId: 2, pointerType: "touch", clientX: 10, clientY: 0 });
  interaction.update(input.update());
  expect(events).toContainEqual(["pointer-down", 1, "first"]);
  expect(events).toContainEqual(["pointer-down", 2, "second"]);
  input.endFrame();
  input.pointer.cancel({ pointerId: 1, pointerType: "touch", clientX: 1, clientY: 0 });
  interaction.update(input.update());
  expect(events).toContainEqual(["pointer-cancel", 1, "first"]);
  expect(events).not.toContainEqual(["pointer-cancel", 2, "second"]);
  interaction.dispose();
  const count = events.length;
  input.endFrame();
  input.pointer.up({ pointerId: 2, pointerType: "touch", clientX: 10, clientY: 0 });
  expect(interaction.update(input.update())).toBeUndefined();
  expect(events).toHaveLength(count);
});

it("terminates an interaction whose release frame was not sampled", () => {
  const input = new InputSystem();
  const interaction = new InteractionSystem(
    () => new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)),
    () => [{ id: "target", bounds: { min: [-1, -1, 0], max: [1, 1, 1] } }]
  );
  const events: string[] = [];
  interaction.subscribe(event => events.push(event.type));
  input.pointer.down({ pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 });
  interaction.update(input.update());
  input.endFrame();
  input.pointer.up({ pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 });
  input.endFrame();
  interaction.update(input.update());
  expect(events).toContain("pointer-cancel");
  expect(events).toContain("hover-exit");
  expect(events).not.toContain("click");
});
