import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPEARANCE_GROUPS, APPEARANCE_PARTS, resolveAppearance, validateAppearance } from "../../../examples/aura-slam/view/appearance";

const original = ((): { resolve(v: unknown, side?: string): Record<string, string>; validate(v: unknown): unknown; defaults(side?: string): unknown; groups: Record<string, Array<{ id: string; label: string; color: string }>> } => {
  const module = { exports: {} as unknown };
  new Function("module", "exports", readFileSync("tests/fixtures/aura-slam-original/toptennis/player-appearance.js", "utf8"))(module, module.exports);
  return module.exports as never;
})();

describe("aura-slam view: appearance resolver equals player-appearance.js", () => {
  it("groups, ids, labels and colours are identical", () => {
    for (const part of APPEARANCE_PARTS) expect(APPEARANCE_GROUPS[part].map((o) => ({ ...o }))).toEqual(original.groups[part]);
  });
  it("resolve matches for every shirt/skin/pants combination, both sides, and for invalid input", () => {
    let cases = 0;
    for (const skin of ["light", "medium", "dark"]) for (const shirt of ["ivory", "forest", "clay", "navy", "sky", "berry"]) for (const pants of ["ivory", "navy", "berry"]) for (const side of ["player", "ai", "rival"]) {
      const sel = { skin, shirt, pants, shoes: "ivory", racket: "sky" };
      expect(resolveAppearance(sel, side)).toEqual(original.resolve(sel, side));
      cases += 1;
    }
    for (const bad of [null, undefined, 5, "x", [], {}, { skin: "nope", shirt: "sky", pants: "navy", shoes: "ivory" }]) for (const side of ["player", "ai"]) expect(resolveAppearance(bad, side)).toEqual(original.resolve(bad, side));
    expect(validateAppearance({ skin: "dark", shirt: "sky", pants: "navy", shoes: "ivory" })).toEqual(original.validate({ skin: "dark", shirt: "sky", pants: "navy", shoes: "ivory" }));
    expect(cases).toBe(3 * 6 * 3 * 3);
  });
  it("the captured live athletes resolve to the sky/navy kit, not the default ivory/forest one", () => {
    const state = JSON.parse(readFileSync("tests/fixtures/aura-slam/live-state-hard.json", "utf8"));
    expect(resolveAppearance(state.player.appearance, "player").shirt).toBe("#70b5d3");
  });
});
