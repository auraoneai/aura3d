import { describe, expect, it } from "vitest";
import { game } from "../../../packages/engine/src";

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
});
