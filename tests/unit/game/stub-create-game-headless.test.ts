import { afterEach, describe, expect, it, vi } from "vitest";

// The root createGame is documented (api-surface, root-exports, troubleshooting) as inert, not throwing.
// Mock the app mount so the stub's own surface can be exercised without a canvas.
vi.mock("../../../packages/engine/src/agent-api/index", () => ({
  createGameApp: () => ({
    app: { ready: () => Promise.resolve(), setScene: () => Promise.resolve(), dispose: () => Promise.resolve() },
    start: () => undefined,
    dispose: () => undefined
  })
}));

describe("root createGame stub is headless and inert", () => {
  afterEach(() => vi.restoreAllMocks());

  it("has no touch or sound, ignores HUD and menu calls, and never throws FEATURE_UNIMPLEMENTED", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { createGame } = await import("../../../packages/engine/src/contracts/stubs/game");
    const game = createGame({ id: "headless", target: {} as HTMLElement, scene: () => ({}) } as never);

    expect(game.touch).toBeNull();
    expect(game.sound).toBeUndefined();
    expect(() => {
      game.shell.openMenu("pause");
      game.shell.closeMenus();
      game.hud.toast("hi");
      game.hud.set("score", 3);
      game.juice.fire("hit" as never);
    }).not.toThrow();
    expect(game.hud.snapshot().widgets).toEqual([{ id: "score", value: 3, screenFraction: 0 }]);
    expect(await game.shell.showResults({ score: 1 })).toBe("retry");

    game.start();
    await game.ready();
    expect(game.session.state).toBe("playing");
    await game.dispose();
    expect(game.session.state).toBe("disposed");
  });
});
