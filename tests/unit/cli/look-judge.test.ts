import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLookJudge, runLookRubric } from "../../../packages/aura3d-cli/src/look/judge";
import {
  AGENT_LOOK_CATEGORIES,
  LOOK_JUDGEMENT_SCHEMA,
  lookHintFor,
  validateLookJudgement,
  weakestLookCategory,
  type LookJudgement
} from "../../../packages/aura3d-cli/src/look/rubric";
import { GAME_VISUAL_CATEGORIES } from "../../../tools/quality-gate/src/contracts";

const SHA = "a".repeat(64);

function validJudgement(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schema: LOOK_JUDGEMENT_SCHEMA,
    round: 1,
    shots: [{ path: "dist/lookdev/1/screenshot.png", sha256: SHA }],
    references: ["webgl_materials_car"],
    scores: { lighting: 8, shadows: 8, composition: 7.5 },
    observations: [{ category: "lighting", seen: "key light reads from the left" }],
    nextChange: { category: "composition", change: "tighten on the car", api: "camera.orbit" },
    judge: "self",
    ...overrides
  };
}

describe("LookJudgement schema validation (§7.6)", () => {
  it("accepts a valid judgement", () => {
    const result = validateLookJudgement(validJudgement());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires at least one observation per score < 7", () => {
    const result = validateLookJudgement(validJudgement({ scores: { lighting: 5, shadows: 6 } }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("shadows=6");
  });

  it("accepts a low score when the observation exists", () => {
    const result = validateLookJudgement(validJudgement({
      scores: { lighting: 5 },
      observations: [{ category: "lighting", seen: "flat ambient, no key" }]
    }));
    expect(result.ok).toBe(true);
  });

  it("rejects out-of-range and off-step scores", () => {
    for (const score of [11, -1, 7.3]) {
      const result = validateLookJudgement(validJudgement({
        scores: { lighting: score },
        observations: [{ category: "lighting", seen: "noted" }]
      }));
      expect(result.ok).toBe(false);
    }
  });

  it("rejects unknown categories", () => {
    const result = validateLookJudgement(validJudgement({ scores: { vibes: 9 } }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain('unknown category "vibes"');
  });

  it("rejects a missing nextChange api", () => {
    const result = validateLookJudgement(validJudgement({ nextChange: { category: "lighting", change: "raise key" } }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("nextChange.api");
  });
});

describe("look judge command", () => {
  it("validates a file and reports weakest category + hint", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "look-judge-"));
    writeFileSync(join(cwd, "j.json"), JSON.stringify(validJudgement({
      scores: { lighting: 8, shadows: 4.5, composition: 9 },
      observations: [{ category: "shadows", seen: "no contact shadow under the car" }]
    })));
    const out: string[] = [];
    const code = await runLookJudge(["--validate", "j.json"], { cwd, stdout: (s) => out.push(s), stderr: () => {} });
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("weakest category: shadows");
    expect(text).toContain("api:");
  });

  it("exits 2 with judge-unavailable when --judge prism has no C-32 export", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "look-judge-"));
    const err: string[] = [];
    const code = await runLookJudge(["--judge", "prism"], { cwd, stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("judge-unavailable");
  });

  it("exits 2 without --validate", async () => {
    const err: string[] = [];
    const code = await runLookJudge([], { cwd: ".", stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(2);
  });
});

describe("look rubric command", () => {
  it("prints the 12 categories and a genre recipe row", async () => {
    const out: string[] = [];
    const code = await runLookRubric(["--genre", "racing"], { cwd: ".", stdout: (s) => out.push(s), stderr: () => {} });
    expect(code).toBe(0);
    const text = out.join("\n");
    for (const category of AGENT_LOOK_CATEGORIES) expect(text).toContain(category);
    expect(text).toContain("golden-hour");
    expect(text).toContain("chase");
  });

  it("rejects an unknown genre", async () => {
    const err: string[] = [];
    const code = await runLookRubric(["--genre", "wibble"], { cwd: ".", stdout: () => {}, stderr: (s) => err.push(s) });
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("unknown genre");
  });
});

describe("C-32 alignment", () => {
  it("AGENT_LOOK_CATEGORIES is a subset of GAME_VISUAL_CATEGORIES", () => {
    const game = new Set(GAME_VISUAL_CATEGORIES);
    for (const category of AGENT_LOOK_CATEGORIES) {
      expect(game.has(category)).toBe(true);
    }
  });
});

describe("hint selection", () => {
  it("weakest category is the lowest score", () => {
    const judgement = validJudgement({ scores: { lighting: 9, ui_hud: 3, camera: 8 } }) as unknown as LookJudgement;
    expect(weakestLookCategory(judgement)).toBe("ui_hud");
  });

  it("lint codes feed the hint text", () => {
    const hint = lookHintFor("lighting", ["look/ambient-kills-ibl"]);
    expect(hint.change).toContain("ambient");
  });
});
