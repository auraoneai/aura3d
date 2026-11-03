import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";

describe("public game input replay lifecycle", () => {
  const dt = 1 / 60;
  const createInput = () => game.input({
    actions: {
      moveRight: ["KeyD"],
      light: ["KeyJ"],
      guard: ["KeyK"]
    },
    axes: { moveX: { positive: "moveRight" } },
    autoListen: false,
    gamepad: false
  });

  it("applies a zero-delta recording as one batch without replaying old presses on later calls", () => {
    const recorder = createInput();
    recorder.press("KeyD");
    recorder.press("KeyJ");
    recorder.update(dt);
    recorder.release("KeyJ");
    const live = recorder.update(dt);
    const recording = recorder.recorded();

    expect(recording.map(({ frame, type, binding }) => ({ frame, type, binding }))).toEqual([
      { frame: 0, type: "press", binding: "KeyD" },
      { frame: 0, type: "press", binding: "KeyJ" },
      { frame: 1, type: "release", binding: "KeyJ" }
    ]);
    expect(live.actions.moveRight).toMatchObject({ pressed: false, held: true });
    expect(live.actions.light).toMatchObject({ pressed: false, held: false, released: true });

    const replay = createInput();
    const explicitZero = createInput();
    const first = replay.replay(recording);
    expect(explicitZero.replay(recording, 0)).toEqual(first);
    expect(first).toMatchObject({ frame: 1, time: 0 });
    expect(first.actions.moveRight).toMatchObject({ pressed: true, held: true, released: false });
    expect(first.actions.light).toMatchObject({ pressed: true, held: false, released: false });
    expect(replay.pressed("moveRight")).toBe(true);
    expect(replay.axis("moveX")).toBe(1);

    const repeated = replay.replay(recording);
    expect(repeated.actions.moveRight).toMatchObject({ pressed: false, held: true, released: false });
    expect(repeated.actions.light).toMatchObject({ pressed: false, held: false, released: false });
    expect(replay.combo(["moveRight", "moveRight"], 1000)).toBe(false);
    expect(replay.recorded()).toEqual([]);

    recorder.release("KeyD");
    recorder.press("KeyK");
    recorder.update(dt);
    const extended = replay.replay(recorder.recorded());
    expect(extended.actions.moveRight).toMatchObject({ pressed: false, held: false, released: true });
    expect(extended.actions.guard).toMatchObject({ pressed: true, held: true, released: false });

    const cleared = replay.replay([]);
    expect(cleared.actions.guard).toMatchObject({ pressed: false, held: false, released: true });
    expect(replay.replay(recording).actions.moveRight).toMatchObject({ pressed: true, held: true });

    recorder.dispose();
    replay.dispose();
    explicitZero.dispose();
  });

  it("retains frame-accurate reconstruction with a positive step and with the replay driver", () => {
    const recorder = createInput();
    recorder.press("KeyD");
    recorder.press("KeyJ");
    const firstLiveFrame = recorder.update(dt);
    recorder.release("KeyJ");
    const lastLiveFrame = recorder.update(dt);
    const recording = recorder.recorded();

    const direct = createInput();
    const reconstructed = direct.replay(recording, dt);
    expect(reconstructed.frame).toBe(lastLiveFrame.frame);
    expect(reconstructed.time).toBeCloseTo(lastLiveFrame.time, 10);
    expect(reconstructed.actions).toEqual(lastLiveFrame.actions);
    expect(reconstructed.axes).toEqual(lastLiveFrame.axes);

    const driven = createInput();
    const driver = game.inputReplayDriver(driven, game.inputReplay(recording));
    expect(driver.step(dt).actions).toEqual(firstLiveFrame.actions);
    expect(driver.step(dt).actions).toEqual(lastLiveFrame.actions);
    expect(driver.step(dt).actions.moveRight).toMatchObject({ pressed: false, held: true });

    recorder.dispose();
    direct.dispose();
    driven.dispose();
  });
});
