import { expect, it } from "vitest";
import { InputSystem } from "../../../packages/input/src";

it("cancels a touch gesture through the attached DOM listener and removes that listener on disposal", () => {
  const target = new EventTarget();
  const input = new InputSystem(target);
  const emit = (type: string) => target.dispatchEvent(Object.assign(new Event(type), {
    pointerId: 7, pointerType: "touch", clientX: 25, clientY: 30, button: 0
  }));
  emit("pointerdown");
  expect(input.update().pointer.touches).toHaveLength(1);
  expect(input.snapshot.button(0).down).toBe(true);
  input.endFrame();
  emit("pointercancel");
  expect(input.update().pointer.touches).toEqual([]);
  expect(input.snapshot.button(0).released).toBe(true);
  input.dispose();
  emit("pointerdown");
  expect(input.update().pointer.touches).toEqual([]);
  expect(input.snapshot.button(0).down).toBe(false);
});
