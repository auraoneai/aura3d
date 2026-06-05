import { describe, expect, it } from "vitest";
import { createAuraApp, game, lights, primitives, scene } from "../../../packages/engine/src";

describe("Aura app handle game runtime", () => {
  it("steps a headless app deterministically and exposes runtime state", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene()
        .add(
          primitives
            .box({ name: "runtime player proxy" })
            .position(0, 0.5, 0)
            .runtime(game.runtimeNode("player", { tags: ["fighter", "local"] }))
        )
        .add(lights.studio())
    });
    const frames: Array<{ readonly dt: number; readonly frame: number; readonly paused: boolean; readonly source: string }> = [];
    const unsubscribe = app.onFrame(({ dt, frame, paused, source }) => {
      frames.push({ dt: Number(dt.toFixed(4)), frame, paused, source });
      app.nodes.require("player").translate(1, 0, 0);
    });

    expect(app.backend).toBe("headless");
    expect(app.nodes.ids()).toEqual(["player"]);
    expect(app.runtime).toMatchObject({ paused: true, frame: 0, time: 0 });

    app.step(1 / 30);
    unsubscribe();
    app.step(1 / 30);

    expect(frames).toEqual([{ dt: 0.0333, frame: 1, paused: true, source: "manual" }]);
    expect(app.runtime.frame).toBe(2);
    expect(app.runtime.time).toBeCloseTo(1 / 15);
    expect(app.nodes.require("player").position).toEqual([1, 0.5, 0]);

    app.dispose();
  });

  it("replaces runtime node registries when the scene changes", () => {
    const app = createAuraApp(null, {
      autoStart: false,
      scene: scene().add(primitives.box({ name: "old player" }).runtime(game.runtimeNode("player")))
    });

    expect(app.nodes.has("player")).toBe(true);

    app.setScene(
      scene().add(
        primitives
          .sphere({ name: "pickup orb" })
          .position(1, 0, 0)
          .runtime(game.runtimeNode("pickup", { tags: ["collectible"] }))
      )
    );

    expect(app.nodes.ids()).toEqual(["pickup"]);
    expect(app.nodes.get("player")).toBeUndefined();
    expect(() => app.nodes.require("player")).toThrow(/runtime node "player"/);

    const pickup = app.nodes.require("pickup");
    pickup.translate(0, 1, 0);

    expect(pickup.tags).toEqual(["collectible"]);
    expect(pickup.position).toEqual([1, 1, 0]);

    app.dispose();
  });
});
