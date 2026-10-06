import { describe, expect, it } from "vitest";
import { GAME_VISUAL_CATEGORIES, GAME_NONVISUAL_CATEGORIES, RUBRIC_PROMPT_VERSION } from "../../../tools/quality-gate/src/contracts";

describe("C-32 visual review rubric", () => {
  it("27 visual + 6 non-visual categories", () => {
    expect(GAME_VISUAL_CATEGORIES.length).toBe(27);
    expect(GAME_NONVISUAL_CATEGORIES.length).toBe(6);
  });
  it("rubric version pinned", () => {
    expect(RUBRIC_PROMPT_VERSION).toMatch(/^rubric-v/);
  });
});
