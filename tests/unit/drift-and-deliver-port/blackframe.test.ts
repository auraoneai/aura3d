import { describe, expect, it } from "vitest";
import { healParams, healRungName, healStage, isBlackFrame } from "../../../examples/drift-and-deliver-port/blackframe";

describe("black-frame self-heal ladder", () => {
  it("isBlackFrame is true only when every texel is near black", () => {
    expect(isBlackFrame(new Uint8Array(16 * 16 * 4).fill(0))).toBe(true);
    const lit = new Uint8Array(16 * 16 * 4).fill(0);
    lit[4 * 100 + 1] = 90;
    expect(isBlackFrame(lit)).toBe(false);
    expect(isBlackFrame([])).toBe(false);
  });

  it("rungs are cumulative and ordered from cheapest to most drastic", () => {
    expect(healParams(0)).toEqual({});
    expect(healParams(1)).toEqual({ aa: "0" });
    expect(healParams(2)).toEqual({ aa: "0", post: "0" });
    expect(healParams(4)).toEqual({ aa: "0", post: "0", tm: "aces", env: "0" });
    expect(healParams(6)).toMatchObject({ shadow: "0", quality: "low", sky: "1" });
    expect(healRungName(0)).toBe("full");
    expect(healRungName(3)).toBe("aces-tone");
  });

  it("healStage reads session storage defensively", () => {
    expect(healStage({ getItem: () => null })).toBe(0);
    expect(healStage({ getItem: () => "3" })).toBe(3);
    expect(healStage({ getItem: () => "99" })).toBe(0);
    expect(healStage({ getItem: () => "-2" })).toBe(0);
    expect(healStage({ getItem: () => "abc" })).toBe(0);
    expect(healStage(undefined)).toBe(0);
  });
});
