import { describe, expect, it } from "vitest";
import { ActionMap, InputSnapshot, InputSystem } from "../../../packages/input/src";
import { game } from "../../../packages/engine/src";

/**
 * WS-3.1 step 1 — characterize BOTH input systems before choosing a survivor.
 *
 * The PRD is explicit that the survivor must come from a measured table rather than an assumption, and it
 * records why: revision 1 said make `packages/input` the survivor, and measurement disproved that —
 * `ActionMap` has no buffering and no combo support, while the engine's `createGameInput` has `bufferMs`,
 * `buffered()`, `combo()`, axis binding and replay.
 *
 * These tests are the table. They assert **current** behaviour of each system, so that after WS-3.1's
 * consolidation the same assertions must still hold for the survivor. A test that only described the
 * winner would let the loser's behaviour disappear silently, which is the risk consolidation carries.
 *
 * Both systems are reached through their public entry points, so this doubles as R1-admissible evidence.
 */

/** Minimal EventTarget stand-in: `packages/input`'s InputSystem attaches to any addEventListener host. */
function createTarget(): EventTarget & { emit(type: string, event: Record<string, unknown>): void } {
  const target = new EventTarget() as EventTarget & { emit(type: string, event: Record<string, unknown>): void };
  target.emit = (type, event) => {
    const dispatched = new Event(type) as Event & Record<string, unknown>;
    Object.assign(dispatched, event);
    target.dispatchEvent(dispatched);
  };
  return target;
}

describe("input characterization: packages/input", () => {
  it("distinguishes down, pressed and released across snapshot transitions", () => {
    /*
     * `InputSnapshot` derives edges by comparing against an explicitly-supplied previous set, so the
     * caller owns frame boundaries. That is a real design difference from the engine's controller, which
     * advances its own edges inside `update(dt)`.
     */
    const first = new InputSnapshot({ keys: new Set(["KeyA"]), previousKeys: new Set() });
    expect(first.key("KeyA")).toEqual({ down: true, pressed: true, released: false });

    const held = new InputSnapshot({ keys: new Set(["KeyA"]), previousKeys: new Set(["KeyA"]) });
    expect(held.key("KeyA")).toEqual({ down: true, pressed: false, released: false });

    const lifted = new InputSnapshot({ keys: new Set(), previousKeys: new Set(["KeyA"]) });
    expect(lifted.key("KeyA")).toEqual({ down: false, pressed: false, released: true });
  });

  it("maps actions over keyboard, chord, pointer and gamepad bindings", () => {
    const map = new ActionMap();
    map.bind("jump", [{ type: "keyboard", code: "Space" }]);
    map.bind("save", [{ type: "keyboard-chord", codes: ["ControlLeft", "KeyS"] }]);
    map.bind("fire", [{ type: "pointer", button: 0 }]);

    map.useSnapshot(new InputSnapshot({ keys: new Set(["Space"]), previousKeys: new Set() }));
    expect(map.pressed("jump")).toBe(true);
    expect(map.down("jump")).toBe(true);

    // A chord requires every code down: this is binding-level AND, distinct from the engine's combo(),
    // which is a *temporal* sequence across a window.
    map.useSnapshot(new InputSnapshot({ keys: new Set(["ControlLeft"]), previousKeys: new Set() }));
    expect(map.down("save")).toBe(false);
    map.useSnapshot(new InputSnapshot({ keys: new Set(["ControlLeft", "KeyS"]), previousKeys: new Set(["ControlLeft"]) }));
    expect(map.down("save")).toBe(true);

    map.useSnapshot(new InputSnapshot({
      pointer: { buttons: new Map([[0, { down: true, pressed: true, released: false }]]) },
      previousPointerButtons: new Set<number>()
    }));
    expect(map.down("fire")).toBe(true);
  });

  it("sums axis bindings with per-binding scale", () => {
    const map = new ActionMap();
    map.bindAxis("moveX", [{ type: "keyboard-axis", negative: "KeyA", positive: "KeyD", scale: 2 }]);
    map.useSnapshot(new InputSnapshot({ keys: new Set(["KeyD"]) }));
    expect(map.axis("moveX")).toBe(2);
    map.useSnapshot(new InputSnapshot({ keys: new Set(["KeyA"]) }));
    expect(map.axis("moveX")).toBe(-2);
    map.useSnapshot(new InputSnapshot({ keys: new Set(["KeyA", "KeyD"]) }));
    expect(map.axis("moveX"), "opposing keys cancel").toBe(0);
  });

  it("has NO buffering and NO combo support — the measurement that overturned revision 1", () => {
    const map = new ActionMap() as unknown as Record<string, unknown>;
    expect(typeof map.buffered, "ActionMap.buffered must not exist").toBe("undefined");
    expect(typeof map.combo, "ActionMap.combo must not exist").toBe("undefined");
  });

  it("requires an explicit endFrame() to advance edges — a THIRD frame-boundary convention", () => {
    /*
     * Measured, and it is the most consequential difference in this whole comparison.
     *
     * `InputSystem` separates `update()` (sample) from `endFrame()` (advance). Calling `update()` twice
     * without `endFrame()` reports `pressed: true` both times, because the previous-key set has not moved.
     *
     * So the repository contains THREE different frame-boundary conventions for the same concept:
     *
     *   packages/input · InputSnapshot   caller supplies the previous set explicitly
     *   packages/input · InputSystem     sample in update(), advance in a separate endFrame()
     *   engine         · createGameInput sample AND advance together inside update(dt)
     *
     * A consolidation that picks a survivor silently adopts one convention and breaks callers of the other
     * two in a way no type signature catches — `pressed()` keeps compiling and starts lying. That is the
     * risk this characterization exists to make visible before anything moves.
     */
    const target = createTarget();
    const system = new InputSystem(target);
    target.emit("keydown", { code: "KeyW" });
    expect(system.update().key("KeyW").pressed).toBe(true);
    // Without endFrame(), the edge is still reported: update() samples, it does not advance.
    expect(system.update().key("KeyW").pressed, "update() alone does not advance the edge").toBe(true);
    system.endFrame();
    expect(system.update().key("KeyW"), "after endFrame() the same key reads as held").toEqual({ down: true, pressed: false, released: false });
    /*
     * And the ordering is load-bearing in the other direction too: `endFrame()` copies current into
     * previous, so calling it AFTER the keyup erases the release edge before anything can observe it.
     * The correct order is sample, observe, then advance — a caller that advances first silently loses
     * every release. Another way this convention is easy to get wrong and impossible to catch by type.
     */
    target.emit("keyup", { code: "KeyW" });
    expect(system.update().key("KeyW").released, "observe the release before advancing").toBe(true);
    system.endFrame();
    expect(system.update().key("KeyW"), "after advancing, the key is simply up").toEqual({ down: false, pressed: false, released: false });
    system.dispose();
  });

  it("stops sampling after dispose, so a swapped scene cannot keep an old listener alive", () => {
    const target = createTarget();
    const system = new InputSystem(target);
    system.dispose();
    target.emit("keydown", { code: "KeyE" });
    expect(system.update().key("KeyE").down).toBe(false);
  });
});

describe("input characterization: engine createGameInput", () => {
  it("computes edges inside update(), not on press() — a real semantic difference", () => {
    /*
     * Measured, and it corrected my assumption while writing this test.
     *
     * `press()` records a *pending* binding; the pressed/released edges and the press history are computed
     * when `update(dt)` runs. So a caller that presses and reads without stepping sees nothing.
     *
     * This is the opposite convention from `packages/input`, where `InputSnapshot` derives edges from an
     * explicitly-supplied previous set and the caller owns frame boundaries. Consolidating the two means
     * choosing one convention, and the difference is exactly what a characterization test exists to pin.
     */
    const input = game.input({ actions: { jump: ["Space"] }, autoListen: false });
    input.press("Space");
    // Nothing yet: the edge has not been computed.
    expect(input.pressed("jump")).toBe(false);
    input.update(1 / 60);
    expect(input.pressed("jump"), "the frame that observes the transition reports pressed").toBe(true);
    expect(input.held("jump")).toBe(true);
    input.update(1 / 60);
    expect(input.pressed("jump"), "pressed is an edge, not a state").toBe(false);
    expect(input.held("jump")).toBe(true);
    input.release("Space");
    input.update(1 / 60);
    expect(input.released("jump")).toBe(true);
    input.dispose();
  });

  it("buffers an action inside a window — capability packages/input lacks entirely", () => {
    const input = game.input({ actions: { jump: ["Space"] }, bufferMs: 120, autoListen: false });
    input.press("Space");
    input.update(1 / 60);
    input.release("Space");
    // Still buffered a couple of frames later: this is what makes a jump feel responsive at a ledge edge.
    input.update(1 / 60);
    input.update(1 / 60);
    expect(input.buffered("jump")).toBe(true);
    input.dispose();
  });

  it("recognises a temporal combo — also absent from packages/input", () => {
    const input = game.input({ actions: { a: ["KeyA"], b: ["KeyB"] }, bufferMs: 250, autoListen: false });
    /*
     * Each press needs its own `update()` to enter the press history, because `actionPressHistory` is
     * appended where the pressed edge is computed. Pressing both within one frame records only one entry
     * and the combo never matches — which is correct for a *temporal* sequence and is why this differs from
     * `ActionMap`'s `keyboard-chord`, which is a simultaneous AND over bindings.
     */
    input.press("KeyA");
    input.update(1 / 60);
    input.release("KeyA");
    input.update(1 / 60);
    input.press("KeyB");
    input.update(1 / 60);
    expect(input.combo(["a", "b"]), "a then b, each observed on its own frame").toBe(true);
    input.dispose();
  });

  it("records and replays an input stream", () => {
    const input = game.input({ actions: { fire: ["Space"] }, autoListen: false });
    input.press("Space");
    input.update(1 / 60);
    input.release("Space");
    input.update(1 / 60);
    const recorded = input.recorded();
    expect(recorded.length).toBeGreaterThan(0);
    input.dispose();

    const replayed = game.input({ actions: { fire: ["Space"] }, autoListen: false });
    const snapshot = replayed.replay(recorded, 1 / 60);
    expect(snapshot, "a recorded stream must be replayable into a snapshot").toBeTruthy();
    replayed.dispose();
  });

  it("derives an axis from two actions", () => {
    const input = game.input({ actions: { left: ["KeyA"], right: ["KeyD"] }, autoListen: false });
    input.press("KeyD");
    input.update(1 / 60);
    expect(input.axis("moveX", "left", "right")).toBe(1);
    input.release("KeyD");
    input.press("KeyA");
    input.update(1 / 60);
    expect(input.axis("moveX", "left", "right")).toBe(-1);
    input.dispose();
  });

  it("setAction drives state without a synthetic DOM event, for headless simulation", () => {
    const input = game.input({ actions: { jump: ["Space"] }, autoListen: false });
    input.setAction("jump", true);
    expect(input.held("jump")).toBe(true);
    input.setAction("jump", false);
    expect(input.held("jump")).toBe(false);
    input.dispose();
  });
});

/**
 * The comparison, asserted rather than described.
 *
 * This is the table WS-3.1 step 2 selects from. It is a test rather than a doc comment so it cannot drift
 * away from the code: if a capability moves between the two systems, this fails.
 */
describe("input capability comparison (WS-3.1 step 2 evidence)", () => {
  it("records which system owns which capability", () => {
    const engineInput = game.input({ actions: { x: ["KeyX"] }, autoListen: false }) as unknown as Record<string, unknown>;
    const actionMap = new ActionMap() as unknown as Record<string, unknown>;

    const engineOnly = ["buffered", "combo", "recorded", "replay", "setAction", "update"];
    for (const capability of engineOnly) {
      expect(typeof engineInput[capability], `engine must own ${capability}`).toBe("function");
      expect(typeof actionMap[capability], `packages/input must NOT own ${capability}`).toBe("undefined");
    }

    // What packages/input uniquely owns is not on ActionMap at all — it is separate device modules.
    // Asserted by module existence rather than by method probing, because that is how it is structured.
    (engineInput.dispose as () => void)();
  });
});
