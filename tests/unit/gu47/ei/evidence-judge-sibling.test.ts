import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JUDGE_USAGE,
  SIBLING_CONFIDENCE_THRESHOLD,
  runJudge,
  siblingPlan,
  summarizeSibling,
  type SiblingTrial
} from "../../../../packages/aura3d-cli/src/commands/evidence/judge.js";

// GU47 WP-9 (E-I): `aura3d evidence judge --mode sibling` ("are these two frames from the same game?"). Prism is mocked.

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SECRET = "sk-sibling-NEVER-PRINT-42";

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { cwd: tmpdir(), stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
}

function games(aNames: string[], bNames: string[]) {
  const root = mkdtempSync(join(tmpdir(), "sibling-"));
  const a = join(root, "game");
  const b = join(root, "neighbour");
  mkdirSync(a);
  mkdirSync(b);
  for (const n of aNames) writeFileSync(join(a, `${n}.png`), PNG_1X1);
  for (const n of bNames) writeFileSync(join(b, `${n}.png`), PNG_1X1);
  return { a, b, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PRISM_API_KEY;
});

const trial = (sameGame: boolean | null, conf: number | null, step = 0): SiblingTrial =>
  ({ step, pass: 0, a: "a", b: "b", gameIs: "A", sameGame, sameGameConfidence: conf, tells: [] });

describe("evidence judge --mode sibling (WP-9 E-I)", () => {
  it("plans every (a, b) pair once per pass, seeded and balanced between Image A and Image B", () => {
    const a = ["a1", "a2", "a3"];
    const b = ["b1", "b2", "b3", "b4"];
    const plan = siblingPlan(a, b, 48, 20261023);
    expect(plan).toHaveLength(48);
    expect(siblingPlan(a, b, 48, 20261023)).toEqual(plan);
    expect(siblingPlan(a, b, 48, 7)).not.toEqual(plan);
    for (let pass = 0; pass < 4; pass++) {
      const rows = plan.filter((p) => p.pass === pass);
      expect(rows).toHaveLength(12);
      expect(new Set(rows.map((p) => `${p.a}|${p.b}`)).size).toBe(12);
      expect(rows.filter((p) => p.gameIs === "A")).toHaveLength(6);
    }
    expect(plan.map((p) => p.step)).toEqual(plan.map((_, i) => i));
    expect(siblingPlan(["x"], ["y"], 5, 1).map((p) => p.pass)).toEqual([0, 1, 2, 3, 4]);
    expect(siblingPlan([], ["y"], 5, 1)).toEqual([]);
  });

  it("summarises same_game as the majority answer and same_game_confidence as its mean confidence", () => {
    const pass = summarizeSibling([trial(false, 0.9, 0), trial(false, 0.8, 1), trial(false, 0.85, 2), trial(true, 0.6, 3), trial(null, null, 4)]);
    expect(pass).toMatchObject({ trials: 5, valid: 4, differentGame: 3, sameGameYes: 1, confidentDifferent: 3, same_game: false, same_game_confidence: 0.85, passes: true });
    expect(pass.differentRate).toBe(0.75);
    const tie = summarizeSibling([trial(false, 0.99, 0), trial(true, 0.7, 1)]);
    expect(tie.same_game).toBe(true);
    expect(tie.passes).toBe(false);
    const unsure = summarizeSibling([trial(false, 0.7, 0), trial(false, 0.75, 1)]);
    expect(unsure).toMatchObject({ same_game: false, same_game_confidence: 0.725, passes: false, confidentDifferent: 0 });
    expect(SIBLING_CONFIDENCE_THRESHOLD).toBe(0.8);
    expect(summarizeSibling([]).same_game).toBeNull();
  });

  it("defaults to 48 trials, pairs frames without matching names and needs no key with --no-judge", async () => {
    const { a, b, root } = games(["shot-1", "shot-2"], ["other-1", "other-2", "other-3"]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const c = io();
    const out = join(root, "o");
    expect(await runJudge(["--mode", "sibling", "--a", a, "--b", b, "--no-judge", "--out", out], c.io)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    const result = JSON.parse(readFileSync(join(out, "judge-results.json"), "utf8"));
    expect(result.mode).toBe("sibling");
    expect(result.judge.trials).toBe(48);
    expect(result.judge.seed).toBe(20261023);
    expect(result.plan).toHaveLength(48);
    expect(result.same_game).toBeNull();
    expect(c.out.join("\n")).toContain("sibling plan of 48 pairs over 2 x 3 frames");
  });

  it("asks the same-game question through Kiro Prism and reports same_game / same_game_confidence", async () => {
    const { a, b, root } = games(["g1", "g2"], ["n1", "n2"]);
    process.env.PRISM_API_KEY = SECRET;
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      expect(url).toBe("https://prism.auraone.ai/v1/messages");
      expect(init.headers["x-api-key"]).toBe(SECRET);
      bodies.push(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"same_game": false, "same_game_confidence": 0.9, "tells": ["palette", "sky"]}' }] }) };
    }));
    const c = io();
    const out = join(root, "o");
    expect(await runJudge(["--mode", "sibling", "--a", a, "--b", b, "--trials", "8", "--seed", "3", "--out", out, "--concurrency", "2"], c.io)).toBe(0);
    expect(bodies).toHaveLength(8);
    expect(bodies[0]).toContain("are these two frames from the same game?");
    expect(bodies[0]).toContain("same_game_confidence");
    const result = JSON.parse(readFileSync(join(out, "judge-results.json"), "utf8"));
    expect(result.same_game).toBe(false);
    expect(result.same_game_confidence).toBe(0.9);
    expect(result.summary).toMatchObject({ valid: 8, differentGame: 8, passes: true });
    expect(result.trials.map((t: { step: number }) => t.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result.acceptance).toEqual({ same_game: false, same_game_confidence_min: 0.8 });
    const printed = [...c.out, ...c.err].join("\n");
    expect(printed).toContain("sibling mode: different games in 8 of 8 valid trials");
    expect(printed).toContain(": pass");
    expect(printed).not.toContain(SECRET);
    expect(readFileSync(join(out, "judge-results.json"), "utf8")).not.toContain(SECRET);
  });

  it("rejects an unknown mode and an empty frame folder; usage names the mode flag", async () => {
    const { a, b } = games(["g1"], []);
    const c = io();
    expect(await runJudge(["--mode", "twin", "--a", a, "--b", b], c.io)).toBe(2);
    expect(await runJudge(["--mode", "sibling", "--a", a, "--b", b, "--no-judge"], c.io)).toBe(2);
    expect(JUDGE_USAGE).toContain("--mode reference|sibling");
  });
});
