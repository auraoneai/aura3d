import { describe, expect, it } from "vitest";
import {
  createLeanCameraRig,
  createLeanDebugDraw,
  createLeanGameFeel,
  createLeanPerformanceGovernor,
  createLeanText,
  game
} from "../../../packages/lean/src/game";

describe("J3 lean-game surface", () => {
  it("exposes rigs, feel, text, debug, and governor on the game object", () => {
    expect(game.cameraRig).toBe(createLeanCameraRig);
    expect(game.gameFeel).toBe(createLeanGameFeel);
    expect(game.text).toBe(createLeanText);
    expect(game.debugDraw).toBe(createLeanDebugDraw);
    expect(game.performanceGovernor).toBe(createLeanPerformanceGovernor);
    expect(game.input).toBeDefined();
    expect(game.platformer).toBeDefined();
  });

  it("side-view rig follows with smoothing and snaps exactly", () => {
    const rig = createLeanCameraRig({ kind: "side-view-follow" });
    expect(rig.snap([4, 1, 0])).toEqual([4, 2.6, 6.4]);
    const moved = rig.follow([10, 1, 0], 1 / 60);
    // Smoothing moves toward the goal without teleporting.
    expect(moved[0]).toBeGreaterThan(4);
    expect(moved[0]).toBeLessThan(10);
    const topDown = createLeanCameraRig({ kind: "top-down-follow" });
    expect(topDown.snap([1, 0, 2])[1]).toBe(9);
  });

  it("game feel adds trauma, shakes proportionally, and hit-stops deterministically", () => {
    const feel = createLeanGameFeel();
    feel.addTrauma(1);
    const first = feel.update(1 / 60);
    expect(first.frozen).toBe(false);
    expect(first.trauma).toBeLessThan(1);
    const shakeMagnitude = Math.hypot(first.shake[0], first.shake[1]);
    expect(shakeMagnitude).toBeGreaterThan(0);

    // Same tick sequence replays exactly (no Math.random).
    const replay = createLeanGameFeel();
    replay.addTrauma(1);
    expect(replay.update(1 / 60)).toEqual(first);

    feel.hitStop();
    expect(feel.snapshot().frozen).toBe(true);
    const frozen = feel.update(1 / 60);
    expect(frozen.shake).toEqual([0, 0]);
  });

  it("debug draw toggles explicitly", () => {
    const debug = createLeanDebugDraw();
    expect(debug.enabled).toBe(false);
    expect(debug.toggle()).toBe(true);
    expect(debug.setEnabled(false)).toBe(false);
  });

  it("input controllers detach every window listener on dispose (U1)", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const scope = globalThis as unknown as { window?: unknown };
    const previousWindow = scope.window;
    scope.window = {
      addEventListener: (type: string) => {
        added.push(type);
      },
      removeEventListener: (type: string) => {
        removed.push(type);
      }
    };
    try {
      const input = game.input({ actions: { jump: ["Space"] }, autoListen: true });
      expect(added).toEqual(["keydown", "keyup"]);
      // Repeated mount/dispose cycles must not accumulate listeners.
      for (let cycle = 0; cycle < 50; cycle += 1) {
        const controller = game.input({ actions: { jump: ["Space"] }, autoListen: true });
        controller.dispose();
      }
      input.dispose();
      expect(removed.length).toBe(added.length);
      expect(added.length).toBe(102);
    } finally {
      scope.window = previousWindow;
    }
  });

  it("lean text resolves atlas quad layout without claiming pixel backing", () => {
    const text = createLeanText();
    expect(text.pixelBacked).toBe(false);
    expect(text.supportedGlyphs).toContain("A");
    expect(text.atlas.glyphCount).toBeGreaterThan(0);
    const layout = text.layout("GO");
    expect(layout.quads).toHaveLength(2);
    expect(layout.widthWorld).toBeGreaterThan(0);
    expect(layout.unsupportedCharacters).toEqual([]);
    // Out-of-catalog glyphs are reported, never silently shaped.
    expect(text.layout("go!").unsupportedCharacters.length).toBeGreaterThan(0);
  });

  it("lean governor degrades resolution before particles and never runs in off mode", () => {
    const governor = createLeanPerformanceGovernor("conservative");
    governor.step(31);
    expect(governor.settings.resolutionScale).toBe(0.85);
    expect(governor.degraded).toEqual(["resolutionScale"]);

    const off = createLeanPerformanceGovernor("off");
    off.step(99);
    expect(off.settings).toEqual({ resolutionScale: 1, particleScale: 1 });
  });
});
