import { describe, expect, it } from "vitest";
import { DEFAULT_BINDINGS, InputState, TOUCH_BUTTONS, keyLabel, loadBindings, promptText, rebind, runInput, saveBindings, touchCode } from "../../../examples/roadster-hours-port/input";
import { SIM_STEP, createRun, defaultCareer, stepRun, type Run } from "../../../examples/roadster-hours-port/sim";

const career = () => ({ ...defaultCareer(), unlocked: 2 });
/** A run past the countdown, driving. */
function running(): { run: Run; c: ReturnType<typeof career> } {
  const c = career();
  const run = createRun(0, c);
  for (let i = 0; i < 400; i++) stepRun(run, { throttle: 1 }, SIM_STEP, c);
  expect(run.phase).toBe("running");
  return { run, c };
}

describe("Saltwind Highway input (audit C1): recover is one per tap", () => {
  it("a 100 ms R hold (12 steps) recovers once and costs 150 points once", () => {
    const { run, c } = running();
    run.score = 1250;
    const input = new InputState();
    input.keydown("KeyR");
    for (let i = 0; i < 12; i++) { stepRun(run, runInput(run, input), SIM_STEP, c); input.endStep(); }
    input.keyup("KeyR");
    stepRun(run, runInput(run, input), SIM_STEP, c);
    expect(run.crashes).toBe(1);
    expect(run.score).toBe(1100);
  });
  it("a tap shorter than one step still recovers once", () => {
    const { run, c } = running();
    const input = new InputState();
    input.keydown("KeyR"); input.keyup("KeyR");
    for (let i = 0; i < 3; i++) { stepRun(run, runInput(run, input), SIM_STEP, c); input.endStep(); }
    expect(run.crashes).toBe(1);
  });
  it("held drive keys stay held across steps", () => {
    const { run } = running();
    const input = new InputState();
    input.keydown("KeyW");
    input.endStep();
    expect(runInput(run, input).throttle).toBe(1);
    input.keyup("KeyW");
    expect(runInput(run, input).throttle).toBe(0);
  });
  it("blur clears held and tapped keys", () => {
    const input = new InputState();
    input.keydown("KeyW"); input.keydown("KeyR");
    input.clear();
    expect(input.held("up")).toBe(false);
    expect(input.tapped("recover")).toBe(false);
  });
});

describe("Saltwind Highway key remapping (audit C12)", () => {
  it("rebinding replaces the primary key and frees it from other actions", () => {
    const b = rebind(DEFAULT_BINDINGS, "thrust", "KeyJ");
    expect(b.thrust).toEqual(["KeyJ"]);
    const c = rebind(b, "recover", "KeyW");
    expect(c.recover[0]).toBe("KeyW");
    expect(c.up).toEqual(["ArrowUp"]);
    expect(rebind(DEFAULT_BINDINGS, "up", "Enter")).toBe(DEFAULT_BINDINGS);
  });
  it("a rebound key drives its new action, and arrows still work", () => {
    const input = new InputState(rebind(DEFAULT_BINDINGS, "up", "KeyI"));
    input.keydown("KeyI");
    expect(input.held("up")).toBe(true);
    input.clear();
    input.keydown("ArrowUp");
    expect(input.held("up")).toBe(true);
    expect(input.actionOf("KeyW")).toBe(null);
  });
  it("bindings round-trip through storage, and bad data falls back to the defaults", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveBindings(rebind(DEFAULT_BINDINGS, "nitro", "KeyN"), storage);
    expect(loadBindings(storage).nitro[0]).toBe("KeyN");
    mem.set("saltwind-highway:bindings", "{bad json");
    expect(loadBindings(storage)).toBe(DEFAULT_BINDINGS);
    expect(loadBindings(null)).toBe(DEFAULT_BINDINGS);
  });
  it("labels keys for the menu", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("Up");
    expect(keyLabel("ShiftLeft")).toBe("Shift");
    expect(keyLabel("Escape")).toBe("Esc");
  });
});

describe("Saltwind Highway touch input (audit C2)", () => {
  it("touch codes drive the same actions whatever the key bindings are", () => {
    const input = new InputState(rebind(DEFAULT_BINDINGS, "thrust", "KeyJ"));
    input.keydown(touchCode("thrust"));
    input.keydown(touchCode("up"));
    expect(input.actionOf(touchCode("thrust"))).toBe("thrust");
    expect(input.held("thrust")).toBe(true);
    expect(input.held("up")).toBe(true);
  });
  it("the touch recover button is a tap: one recovery", () => {
    const { run, c } = running();
    const input = new InputState();
    input.keydown(touchCode("recover"));
    for (let i = 0; i < 8; i++) { stepRun(run, runInput(run, input), SIM_STEP, c); input.endStep(); }
    expect(run.crashes).toBe(1);
  });
  it("there is a button for every driving action, and recover is the only tap", () => {
    expect(TOUCH_BUTTONS.map((b) => b.action).sort()).toEqual(["down", "left", "nitro", "recover", "right", "rollLeft", "rollRight", "thrust", "up"]);
    expect(TOUCH_BUTTONS.filter((b) => !b.hold).map((b) => b.action)).toEqual(["recover"]);
  });
  it("prompts name the touch buttons instead of keys", () => {
    expect(promptText("MISSED RELAY · R TO RECOVER", true)).toBe("MISSED RELAY · TAP RECOVER");
    expect(promptText("MISSED RELAY · R TO RECOVER", false)).toBe("MISSED RELAY · R TO RECOVER");
    expect(promptText("MISSED RELAY · R TO RECOVER", false, rebind(DEFAULT_BINDINGS, "recover", "KeyT"))).toBe("MISSED RELAY · T TO RECOVER");
  });
});
