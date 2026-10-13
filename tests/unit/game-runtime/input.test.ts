import { afterEach, describe, expect, it, vi } from "vitest";
import { game } from "../../../packages/engine/src";

/** Minimal EventTarget stand-in that can emit synthetic pointer events. */
function createTarget(): EventTarget & { emit(type: string, event: Record<string, unknown>): void } {
  const target = new EventTarget() as EventTarget & { emit(type: string, event: Record<string, unknown>): void };
  target.emit = (type, event) => {
    const dispatched = new Event(type) as Event & Record<string, unknown>;
    Object.assign(dispatched, event);
    target.dispatchEvent(dispatched);
  };
  return target;
}

describe("game.input", () => {
  it("tracks pressed, held, released, buffered, axis, and replay state deterministically", () => {
    const input = game.input({
      actions: {
        moveLeft: ["KeyA"],
        moveRight: ["KeyD"],
        light: ["KeyJ"],
        guard: ["KeyK"]
      },
      axes: {
        moveX: { negative: "moveLeft", positive: "moveRight" }
      },
      bufferMs: 100,
      autoListen: false
    });

    input.press("KeyD");
    input.press("KeyJ");
    const first = input.update(1 / 60);

    expect(first.kind).toBe("aura-game-input-snapshot");
    expect(first.activeBindings).toEqual(["KeyD", "KeyJ"]);
    expect(first.actions.moveRight).toMatchObject({ pressed: true, held: true, released: false, buffered: true, value: 1 });
    expect(first.actions.light).toMatchObject({ pressed: true, held: true, released: false, buffered: true, value: 1 });
    expect(input.axis("moveX")).toBe(1);
    expect(input.pressed("light")).toBe(true);

    input.release("KeyJ");
    const released = input.update(1 / 60);

    expect(released.actions.light).toMatchObject({ pressed: false, held: false, released: true, buffered: true, value: 0 });
    expect(input.held("moveRight")).toBe(true);
    expect(input.released("light")).toBe(true);

    input.update(0.15);
    expect(input.buffered("light")).toBe(false);

    input.release("KeyD");
    input.setAction("moveLeft", true);
    const left = input.update(1 / 60);

    expect(left.actions.moveLeft).toMatchObject({ pressed: true, held: true, released: false, value: 1 });
    expect(left.actions.moveRight).toMatchObject({ pressed: false, held: false, released: true, value: 0 });
    expect(input.axis("moveX")).toBe(-1);

    const replay = game.input({
      actions: {
        moveLeft: ["KeyA"],
        moveRight: ["KeyD"],
        light: ["KeyJ"]
      },
      axes: {
        moveX: { negative: "moveLeft", positive: "moveRight" }
      },
      autoListen: false
    });
    const replayed = replay.replay(input.recorded());

    expect(input.recorded().map((event) => `${event.type}:${event.binding}`)).toEqual([
      "press:KeyD",
      "press:KeyJ",
      "release:KeyJ",
      "release:KeyD",
      "press:moveLeft"
    ]);
    expect(replayed.actions.moveLeft).toMatchObject({ pressed: true, held: true });
    expect(replay.axis("moveX")).toBe(-1);
    expect(replay.held("light")).toBe(false);

    replay.clearReplay();
    expect(replay.recorded()).toEqual([]);

    input.dispose();
    replay.dispose();
  });

  it("does not drop fast taps that press and release between frame updates", () => {
    const input = game.input({
      actions: {
        jump: ["Space"],
        reset: ["KeyR"]
      },
      bufferMs: 140,
      autoListen: false
    });

    input.press("Space");
    input.release("Space");
    const tapped = input.update(1 / 60);

    expect(tapped.actions.jump).toMatchObject({ pressed: true, held: false, released: false, buffered: true, value: 0 });
    expect(input.pressed("jump")).toBe(true);
    expect(input.buffered("jump")).toBe(true);

    input.setAction("reset", true);
    input.setAction("reset", false);
    const programmaticTap = input.update(1 / 60);

    expect(programmaticTap.actions.reset).toMatchObject({ pressed: true, held: false, released: false, buffered: true, value: 0 });

    input.dispose();
  });
});

describe("game.input pointer delta (E5)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates movementX/Y under pointer lock — 96px is real turning, and the axis stays clamped", () => {
    vi.stubGlobal("document", { pointerLockElement: {} });
    const target = createTarget();
    const input = game.input({
      actions: { fire: ["PointerPrimary"] },
      axes: { lookX: { pointerDelta: "x" } },
      target
    });

    // Under lock clientX is frozen at the lock point; only movement counts.
    target.emit("pointermove", { clientX: 400, clientY: 300, movementX: 60, movementY: 5 });
    target.emit("pointermove", { clientX: 400, clientY: 300, movementX: 36, movementY: -2 });
    const frame = input.update(1 / 60);

    expect(frame.pointer.dx).toBe(96);
    expect(frame.pointer.dy).toBe(3);
    expect(frame.pointer.dx * 0.0024).toBeCloseTo(0.2304);
    expect(input.axis("lookX")).toBe(1);

    // Delta is per-frame: the next update starts from zero again.
    expect(input.update(1 / 60).pointer.dx).toBe(0);

    input.dispose();
  });

  it("falls back to client delta when unlocked and does not spike on the first move after unlock", () => {
    const target = createTarget();
    const input = game.input({ actions: { fire: ["PointerPrimary"] }, target });

    target.emit("pointermove", { clientX: 30, clientY: 10 });
    target.emit("pointermove", { clientX: 55, clientY: 25 });
    const frame = input.update(1 / 60);
    expect(frame.pointer.dx).toBe(55);
    expect(frame.pointer.dy).toBe(25);

    // Lock, move by movement only, then unlock far from the locked origin:
    // the first unlocked move must re-origin, not jump.
    vi.stubGlobal("document", { pointerLockElement: {} });
    target.emit("pointermove", { clientX: 55, clientY: 25, movementX: 12, movementY: 0 });
    vi.stubGlobal("document", { pointerLockElement: null });
    target.emit("pointermove", { clientX: 900, clientY: 700 });
    target.emit("pointermove", { clientX: 910, clientY: 700 });
    const after = input.update(1 / 60);
    expect(after.pointer.dx).toBe(22);
    expect(after.pointer.dy).toBe(0);

    input.dispose();
  });

  it("pointerdown does not wipe the current frame's accumulated delta", () => {
    const target = createTarget();
    const input = game.input({ actions: { fire: ["PointerPrimary"] }, target });

    target.emit("pointermove", { clientX: 48, clientY: 0 });
    target.emit("pointerdown", { clientX: 48, clientY: 0, button: 0, pointerType: "mouse" });
    const frame = input.update(1 / 60);

    expect(frame.pointer.dx).toBe(48);
    expect(frame.actions.fire).toMatchObject({ pressed: true, held: true });

    input.dispose();
  });
});
