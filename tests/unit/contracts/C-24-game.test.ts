import { describe, expect, it } from "vitest";
import { C24_GAME_SLOT } from "@aura3d/game";
import { createGame as stubCreateGame } from "@aura3d/engine/contracts";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

/**
 * C-24 createGame contract (16.1-1): stub and real behaviour suites. The real
 * impl is resolved through the slot with flags on; full scene instantiation
 * needs a DOM/renderer and lives in the browser specs — here we assert the
 * contract surface and flag dispatch, which is what the lane contract gates on.
 */
describe("stub", () => {
  it("createGame is an invocable factory", () => {
    expect(typeof C24_GAME_SLOT.stub).toBe("function");
    expect(C24_GAME_SLOT.stub.length).toBe(1);
  });
});

describe("real", () => {
  const flagsOn = resolveQrFlags({ env: { A3D_QR: "game" } });
  const real = C24_GAME_SLOT.get(flagsOn);

  it("resolves an impl distinct from the stub", () => {
    expect(real).not.toBe(stubCreateGame);
    expect(typeof real).toBe("function");
    expect(real.length).toBe(1);
  });
});

describe("C-24 flag dispatch", () => {
  it("flags-off resolves the stub; A3D_QR_GAME resolves the provided impl", () => {
    const off = resolveQrFlags({ env: {} });
    expect(C24_GAME_SLOT.get(off)).toBe(stubCreateGame);
    const on = resolveQrFlags({ env: { A3D_QR: "game" } });
    expect(C24_GAME_SLOT.provided).toBe(true);
    expect(C24_GAME_SLOT.get(on)).not.toBe(stubCreateGame);
  });
});
