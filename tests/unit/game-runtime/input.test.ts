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

describe("game input replay sequencing", () => {
  const dt = 1 / 60;
  const createInput = () => game.input({
    actions: { left: ["KeyA"], right: ["KeyD"], jump: ["Space"] },
    axes: { moveX: { negative: "left", positive: "right", smoothing: 12 } },
    bufferMs: 120,
    autoListen: false,
    gamepad: false
  });

  it("applies each event in a cumulative direct replay only once", () => {
    const input = createInput();
    const press = { frame: 0, time: 0, type: "press", binding: "KeyD" } as const;
    const release = { frame: 1, time: dt, type: "release", binding: "KeyD" } as const;
    const again = { frame: 3, time: 3 * dt, type: "press", binding: "KeyD" } as const;

    expect(input.replay([press], dt).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    expect(input.replay([{ ...press }, release], dt).actions.right).toMatchObject({ pressed: false, held: false, released: true });
    expect(input.replay([press, release], dt).actions.right).toMatchObject({ pressed: false, held: false, released: false });
    expect(input.replay([press, release, again], dt).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    expect(input.recorded()).toEqual([]);
    input.dispose();
  });

  it("reconstructs a first cumulative prefix and a shorter prefix without resurfacing historical presses", () => {
    const input = createInput();
    const press = { frame: 0, time: 0, type: "press", binding: "KeyD" } as const;
    const release = { frame: 1, time: dt, type: "release", binding: "KeyD" } as const;

    expect(input.replay([press, release], dt).actions.right).toMatchObject({ pressed: false, held: false, released: true });
    expect(input.replay([press, release], dt).actions.right).toMatchObject({ pressed: false, held: false, released: false });
    expect(input.replay([press], dt).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    expect(input.replay([], dt).actions.right).toMatchObject({ pressed: false, held: false, released: true });
    input.dispose();
  });

  it("preserves ordered same-frame taps and release-then-press sequences", () => {
    const press = { frame: 0, time: 0, type: "press", binding: "Space" } as const;
    const release = { frame: 0, time: 0, type: "release", binding: "Space" } as const;
    const tapPlan = game.inputReplay([press, release]);
    const heldPlan = game.inputReplay([release, press]);
    const tapInput = createInput();
    const heldInput = createInput();

    expect(tapPlan.events.map((event) => event.type)).toEqual(["press", "release"]);
    expect(heldPlan.events.map((event) => event.type)).toEqual(["release", "press"]);
    expect(tapPlan.checksum).not.toBe(heldPlan.checksum);
    expect(game.inputReplayDriver(tapInput, tapPlan).seek(0, dt).actions.jump)
      .toMatchObject({ pressed: true, held: false, released: false });
    expect(game.inputReplayDriver(heldInput, heldPlan).seek(0, dt).actions.jump)
      .toMatchObject({ pressed: true, held: true, released: false });
    tapInput.dispose();
    heldInput.dispose();
  });

  it("starts at frame zero, consumes signed and large dt one frame at a time, and never repeats an edge", () => {
    const input = createInput();
    const plan = game.inputReplay([
      { frame: 0, time: 0, type: "press", binding: "KeyD" },
      { frame: 1, time: dt, type: "release", binding: "KeyD" },
      { frame: 2, time: 2 * dt, type: "press", binding: "KeyD" }
    ]);
    const driver = game.inputReplayDriver(input, plan);

    expect(driver.snapshot()).toMatchObject({ frame: 0, time: 0, complete: false });
    expect(driver.step(-1).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    expect(driver.snapshot()).toMatchObject({ frame: 0, time: 0, complete: false });
    expect(driver.step(120).actions.right).toMatchObject({ pressed: false, held: false, released: true });
    expect(driver.snapshot()).toMatchObject({ frame: 1, time: 120, complete: false });
    expect(driver.step(0).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    expect(driver.snapshot()).toMatchObject({ frame: 2, time: 120, complete: true });
    expect(driver.step(dt).actions.right).toMatchObject({ pressed: false, held: true, released: false });
    input.dispose();
  });

  it("replays action overrides and preserves buffered combo history without duplicating presses", () => {
    const recorder = createInput();
    recorder.setAction("jump", true);
    const first = recorder.update(dt);
    recorder.setAction("jump", false);
    const second = recorder.update(dt);
    recorder.press("KeyD");
    const third = recorder.update(dt);
    const fourth = recorder.update(dt);
    const plan = game.inputReplay(recorder.recorded());
    const imported = game.importReplay(JSON.stringify(game.exportReplay(plan)));
    const replay = createInput();
    const driver = game.inputReplayDriver(replay, imported);

    for (const expected of [first, second, third, fourth]) {
      expect(driver.step(dt).actions).toEqual(expected.actions);
    }
    expect(replay.combo(["jump", "right"], 200)).toBe(true);
    expect(replay.combo(["jump", "jump"], 200)).toBe(false);
    expect(replay.recorded()).toEqual([]);
    recorder.dispose();
    replay.dispose();
  });

  it("distinguishes recorded action overrides from bindings with the same name", () => {
    const make = () => game.input({
      actions: { jump: ["Space"], alias: ["jump"] },
      autoListen: false,
      gamepad: false
    });
    const recorder = make();
    recorder.setAction("jump", true);
    const pressed = recorder.update(dt);
    recorder.setAction("jump", false);
    const released = recorder.update(dt);
    const events = recorder.recorded();
    const plan = game.inputReplay(events);
    const imported = game.importReplay(JSON.stringify(game.exportReplay(plan)));
    const replay = make();
    const driver = game.inputReplayDriver(replay, imported);

    expect(events.map((event) => event.source)).toEqual(["action", "action"]);
    expect(imported.events).toEqual(plan.events);
    expect(imported.checksum).toBe(plan.checksum);
    const replayPressed = driver.step(dt);
    const replayReleased = driver.step(dt);
    expect(replayPressed.actions).toEqual(pressed.actions);
    expect(replayPressed.activeBindings).toEqual(pressed.activeBindings);
    expect(replayReleased.actions).toEqual(released.actions);
    expect(replayReleased.activeBindings).toEqual(released.activeBindings);

    const bindingRecorder = make();
    bindingRecorder.press("jump");
    const bindingPressed = bindingRecorder.update(dt);
    const bindingReplay = make();
    const bindingDriver = game.inputReplayDriver(bindingReplay, game.inputReplay(bindingRecorder.recorded()));
    expect(bindingDriver.step(dt).actions).toEqual(bindingPressed.actions);
    expect(bindingPressed.actions.alias.held).toBe(true);
    expect(game.inputReplay(events.slice(0, 1)).checksum).not.toBe(game.inputReplay(bindingRecorder.recorded()).checksum);
    recorder.dispose();
    replay.dispose();
    bindingRecorder.dispose();
    bindingReplay.dispose();
  });

  it("reconstructs backward and forward seeks with the same edges, buffers, and smoothed axes as live input", () => {
    const recorder = createInput();
    const snapshots = [];
    for (let frame = 0; frame <= 8; frame += 1) {
      if (frame === 0 || frame === 5) recorder.press("KeyD");
      if (frame === 1 || frame === 6) recorder.release("KeyD");
      if (frame === 3) {
        recorder.press("Space");
        recorder.release("Space");
      }
      snapshots.push(recorder.update(dt));
    }
    const replay = createInput();
    const driver = game.inputReplayDriver(replay, game.inputReplay(recorder.recorded()));

    for (const frame of [8, 1, 3, 0, 5, 7, 6, 2, 8]) {
      const actual = driver.seek(frame, dt);
      const expected = snapshots[frame]!;
      expect(actual.frame).toBe(expected.frame);
      expect(actual.time).toBeCloseTo(expected.time, 10);
      expect(actual.actions).toEqual(expected.actions);
      expect(actual.axes?.moveX).toBeCloseTo(expected.axes?.moveX ?? 0, 10);
      expect(replay.buffered("jump")).toBe(expected.actions.jump.buffered);
    }
    recorder.dispose();
    replay.dispose();
  });

  it("matches fixed-step buffer and combo boundaries when a seek skips idle frames", () => {
    const make = () => game.input({ actions: { right: ["KeyD"] }, bufferMs: 500, autoListen: false, gamepad: false });
    const recorder = make();
    recorder.press("KeyD");
    recorder.update(dt);
    for (let frame = 1; frame <= 30; frame += 1) recorder.update(dt);
    const replay = make();
    const driver = game.inputReplayDriver(replay, game.inputReplay(recorder.recorded()));

    const atBoundary = driver.seek(30, dt);
    expect(atBoundary.time).toBe(recorder.snapshot().time);
    expect(atBoundary.actions.right.buffered).toBe(recorder.snapshot().actions.right.buffered);
    expect(replay.combo(["right"], 500)).toBe(recorder.combo(["right"], 500));
    const nextLive = recorder.update(dt);
    expect(driver.step(dt).actions.right.buffered).toBe(nextLive.actions.right.buffered);
    expect(replay.combo(["right"], 500)).toBe(recorder.combo(["right"], 500));
    recorder.dispose();
    replay.dispose();
  });

  it("keeps live input, recordings, other controllers, and other replay drivers independently owned", () => {
    const input = createInput();
    const other = createInput();
    input.press("KeyA");
    input.update(dt);
    other.press("Space");
    other.update(dt);
    const originalRecording = input.recorded();
    const first = game.inputReplayDriver(input, game.inputReplay([
      { frame: 0, time: 0, type: "press", binding: "KeyD" },
      { frame: 1, time: dt, type: "release", binding: "KeyD" }
    ]));
    const second = game.inputReplayDriver(input, game.inputReplay([
      { frame: 0, time: 0, type: "press", binding: "Space" }
    ]));

    expect(first.seek(0, dt).actions.right.held).toBe(true);
    expect(second.seek(0, dt).actions.jump.held).toBe(true);
    expect(first.step(dt).actions.right).toMatchObject({ pressed: false, held: false, released: true });
    second.reset();
    expect(input.snapshot().actions.right).toMatchObject({ pressed: false, held: false, released: true });
    first.reset();
    expect(input.snapshot().actions.left.held).toBe(true);
    expect(input.recorded()).toEqual(originalRecording);
    expect(other.snapshot().actions.jump.held).toBe(true);
    expect(first.snapshot()).toMatchObject({ frame: 0, time: 0, complete: false });
    expect(first.step(dt).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    input.dispose();
    other.dispose();
  });

  it("keeps live target events and a driver's input state separate until playback is reset", () => {
    const target = createTarget();
    const input = game.input({ actions: { left: ["KeyA"], right: ["KeyD"] }, target, gamepad: false });
    const driver = game.inputReplayDriver(input, game.inputReplay([
      { frame: 0, time: 0, type: "press", binding: "KeyD" },
      { frame: 1, time: dt, type: "release", binding: "KeyD" }
    ]));

    const beforeInvalidStep = input.snapshot();
    expect(() => driver.step(Number.MAX_VALUE)).toThrow(RangeError);
    expect(input.snapshot()).toBe(beforeInvalidStep);
    expect(driver.step(dt).actions.right.held).toBe(true);
    target.emit("keydown", { code: "KeyA", key: "a", repeat: false });
    expect(input.snapshot().actions.right.held).toBe(true);
    expect(driver.step(dt).actions.right).toMatchObject({ pressed: false, held: false, released: true });
    expect(input.recorded().some((event) => event.binding === "KeyA")).toBe(true);
    driver.reset();
    expect(input.update(dt).actions.left).toMatchObject({ pressed: true, held: true, released: false });
    input.dispose();
    expect(input.snapshot().actions.left).toMatchObject({ pressed: false, held: false, released: false, buffered: false });
    expect(input.held("left")).toBe(false);
    expect(() => driver.step(dt)).toThrow(/disposed/i);
    expect(() => driver.reset()).not.toThrow();
  });

  it("handles negative and very large seeks without iterating through empty frames", () => {
    const input = createInput();
    const plan = game.inputReplay([
      { frame: 0, time: 0, type: "press", binding: "KeyD" },
      { frame: 1, time: dt, type: "release", binding: "KeyD" }
    ]);
    const driver = game.inputReplayDriver(input, plan);
    const target = 2 ** 31 + 7;

    expect(driver.seek(-42, dt).actions.right).toMatchObject({ pressed: true, held: true, released: false });
    const settled = driver.seek(target, dt);
    expect(settled.frame).toBe(target + 1);
    expect(settled.actions.right).toMatchObject({ pressed: false, held: false, released: false, buffered: false });
    expect(driver.snapshot()).toMatchObject({ frame: target, complete: true });
    const before = driver.snapshot();
    expect(() => driver.seek(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => driver.step(Number.NaN)).toThrow(RangeError);
    expect(() => driver.step(Number.MAX_VALUE)).toThrow(RangeError);
    expect(() => game.inputReplay([], { fps: Number.NaN })).toThrow(RangeError);
    expect(() => game.inputReplay([{ frame: Number.POSITIVE_INFINITY, time: 0, type: "press", binding: "KeyD" }])).toThrow(RangeError);
    expect(driver.snapshot()).toEqual(before);
    input.dispose();
  });

  it("does not mark frame-zero input complete before it is consumed", () => {
    const input = createInput();
    const driver = game.inputReplayDriver(input, game.inputReplay([
      { frame: 0, time: 0, type: "press", binding: "Space" }
    ]));
    expect(driver.snapshot().complete).toBe(false);
    expect(driver.step(dt).actions.jump).toMatchObject({ pressed: true, held: true });
    expect(driver.snapshot()).toMatchObject({ frame: 0, time: 0, complete: true });
    driver.reset();
    expect(driver.snapshot().complete).toBe(false);
    expect(driver.seek(0, dt).actions.jump.pressed).toBe(true);
    expect(driver.snapshot()).toMatchObject({ frame: 0, time: 0, complete: true });
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
