import { describe, expect, it } from "vitest";
import * as game from "@aura3d/engine/contracts";

describe("C-24 game contract", () => {
  it("createGame is exported from the stub", () => {
    expect(typeof game.createGame).toBe("function");
  });
});
