import { afterEach, describe, expect, it, vi } from "vitest";
import { createGame } from "../../../packages/engine/src/contracts/stubs/game";

describe("root createGame stub", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws the actionable versioned migration error on every call without mounting", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scene = vi.fn(() => ({}));
    const options = { id: "t", target: {} as HTMLElement, scene };
    for (let call = 0; call < 2; call += 1) {
      let thrown: unknown;
      try {
        createGame(options as never);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).toMatchObject({
        name: "AuraGameMigrationError",
        code: "CREATE_GAME_ROOT_UNAVAILABLE",
        version: 1
      });
      expect((thrown as Error).message).toContain("CREATE_GAME_ROOT_UNAVAILABLE_V1");
      expect((thrown as Error).message).toContain("Import { createGame } from '@aura3d/engine/game'");
      expect((thrown as Error).message).toContain("'-game' / 'none'");
      expect((thrown as Error).message).toContain("A3D_QR_GAME");
    }
    expect(scene).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
