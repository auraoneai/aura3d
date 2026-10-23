import { describe, expect, it } from "vitest";
import { withGameFlagDefault } from "../../../packages/game/src/flagDefault";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createGame as stubCreateGame } from "../../../packages/engine/src/contracts/game";
import { C24_GAME_SLOT } from "../../../packages/game/src/index";

const gameOn = (options: Parameters<typeof withGameFlagDefault>[0], extra: { url?: string; env?: Record<string, string> } = {}): boolean =>
  resolveQrFlags({ options: withGameFlagDefault(options), ...extra }).on("A3D_QR_GAME");

describe("@aura3d/engine/game defaults the game lane on", () => {
  it("is on with no flags, and resolves the real implementation instead of the stub", () => {
    expect(gameOn(undefined)).toBe(true);
    expect(C24_GAME_SLOT.get(resolveQrFlags({ options: withGameFlagDefault(undefined) }))).not.toBe(stubCreateGame);
  });

  it("adds game to other flag lists in every accepted shape", () => {
    expect(gameOn("core,post")).toBe(true);
    expect(gameOn(["core"])).toBe(true);
    expect(gameOn({ A3D_QR_CORE: true })).toBe(true);
    expect(withGameFlagDefault("core,post")).toBe("core,post,game");
  });

  it("keeps every explicit opt-out", () => {
    expect(gameOn("-game")).toBe(false);
    expect(gameOn(["core", "-game"])).toBe(false);
    expect(gameOn({ A3D_QR_GAME: false })).toBe(false);
    expect(gameOn("none")).toBe(false);
    expect(gameOn(undefined, { url: "http://localhost/?a3d-qr=-game" })).toBe(false);
    expect(gameOn(undefined, { env: { A3D_QR_GAME: "0" } })).toBe(false);
  });

  it("leaves an explicit game or all untouched", () => {
    expect(withGameFlagDefault(["game"])).toEqual(["game"]);
    expect(withGameFlagDefault("all")).toBe("all");
    expect(gameOn("all")).toBe(true);
  });
});
