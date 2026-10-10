/**
 * 08-SPEC / I-3: the cited `touch-device-prompts.test.ts` was missing — this is
 * it. `input.activeDevice()` tracks the last device with input;
 * `input.prompt(action)` returns the binding-table label/glyph per device:
 * keyboard → KeyboardEvent.code name, gamepad → glyph, touch → region label
 * (or action name capitalised).
 */
import { describe, expect, it } from "vitest";
import { createGameInput } from "../../../../packages/engine/src/agent-api/GameRuntime.js";

const input = () =>
  createGameInput({
    actions: { jump: ["Space", "pad:0", "touch:jump"], fire: ["KeyF", "pad:2"] }
  });

describe("I-3 input.prompt + activeDevice", () => {
  it("binding jump: [Space, pad:0, touch:jump] → Space / pad-0 / Jump per device", () => {
    const i = input();
    expect(i.prompt("jump", "keyboard")).toBe("Space");
    expect(i.prompt("jump", "gamepad")).toBe("pad-0");
    expect(i.prompt("jump", "touch")).toBe("Jump");
  });

  it("activeDevice reflects the last device that produced input", () => {
    const i = input();
    expect(i.activeDevice()).toBeUndefined();
    // The virtual `press` port is device-agnostic — only real device events
    // (and the `touch.*` port, which is explicitly a touch device) mark one.
    i.touch.press("touch:jump");
    expect(i.activeDevice()).toBe("touch");
  });

  it("prompt() with no device arg uses activeDevice", () => {
    const i = input();
    i.touch.press("touch:jump");
    expect(i.prompt("jump")).toBe("Jump");
  });

  it("actions without a binding for the device return undefined", () => {
    const i = input();
    expect(i.prompt("fire", "touch")).toBeUndefined();
  });
});
