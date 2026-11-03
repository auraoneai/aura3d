import { describe, expect, it, vi } from "vitest";
import { createGame as rootCreateGame } from "../../../packages/engine/src/contracts/stubs/game";
import { createGame as fullCreateGame } from "@aura3d/engine/game";
import { primitives, scene } from "@aura3d/engine";

const sceneFactory = () => scene().add(primitives.box({ name: "game-migration-test" }));

describe("createGame migration", () => {
  it("throws a versioned actionable diagnostic before evaluating the scene", () => {
    const buildScene = vi.fn(sceneFactory);
    for (let call = 0; call < 2; call += 1) {
      try {
        rootCreateGame({ id: "root", target: {} as HTMLElement, scene: buildScene });
        throw new Error("expected root createGame to fail");
      } catch (error) {
        expect(error).toMatchObject({
          name: "AuraGameMigrationError",
          code: "CREATE_GAME_ROOT_UNAVAILABLE",
          version: 1
        });
        expect(String(error)).toContain("CREATE_GAME_ROOT_UNAVAILABLE_V1");
        expect(String(error)).toContain("@aura3d/engine/game");
        expect(String(error)).toContain("A3D_QR_GAME");
      }
    }
    expect(buildScene).not.toHaveBeenCalled();
  });

  it("creates the full game through the recommended entry and reports explicit opt-out", async () => {
    const game = fullCreateGame({
      id: "full-game-migration", target: null, autoStart: false,
      scene: sceneFactory, qualityRebuild: { flags: ["game"] }
    });
    try {
      expect(game.runtime.app).toBe(game.app);
      expect(game.session.state).toBe("booting");
      game.start();
      expect(game.session.state).toBe("loading");
      (game.app as { diagnostics: () => { drawCalls: number } }).diagnostics = () => ({ drawCalls: 1 });
      await game.ready();
      expect(game.session.state).toBe("playing");
    } finally {
      await game.dispose();
    }
    expect(game.session.state).toBe("disposed");
    expect(() => fullCreateGame({
      id: "off", target: null, scene: sceneFactory,
      qualityRebuild: { flags: ["-game"] }
    })).toThrow(/CREATE_GAME_ROOT_UNAVAILABLE_V1.*-game/);
  });
});
