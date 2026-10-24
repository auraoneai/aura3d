import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assignOrder, binomialTwoSided, extractJson, jsDivergence, summarize, type Trial } from "../../../../packages/aura3d-cli/src/commands/evidence/judgeLib.js";
import { runJudge } from "../../../../packages/aura3d-cli/src/commands/evidence/judge.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { cwd: tmpdir(), stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
}

function frames(names: string[]): { a: string; b: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "judge-"));
  const a = join(root, "a");
  const b = join(root, "b");
  mkdirSync(a);
  mkdirSync(b);
  for (const n of names) {
    writeFileSync(join(a, `${n}.png`), PNG_1X1);
    writeFileSync(join(b, `${n}.png`), PNG_1X1);
  }
  return { a, b, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PRISM_API_KEY;
});

describe("judge lib", () => {
  it("assignOrder is deterministic per seed and balanced within a pass", () => {
    const steps = [0, 1, 2, 3, 4, 5];
    const x = assignOrder(steps, 2, 20261023);
    expect(assignOrder(steps, 2, 20261023)).toEqual(x);
    for (const pass of [0, 1]) expect(x.filter((t) => t.pass === pass && t.originalIs === "A")).toHaveLength(3);
    expect(assignOrder(steps, 2, 1)).not.toEqual(x);
  });

  it("statistics: binomial, JSD and JSON extraction", () => {
    expect(binomialTwoSided(24, 48)).toBeCloseTo(1, 6);
    expect(binomialTwoSided(48, 48)).toBeLessThan(1e-12);
    expect(jsDivergence([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(jsDivergence([1, 0], [0, 1])).toBeCloseTo(1, 12);
    expect(extractJson('text {"original":"A"} tail')).toEqual({ original: "A" });
    expect(extractJson("no json")).toBeNull();
  });

  it("summarize applies the 70% distinguishable threshold", () => {
    const t = (picked: "A" | "B" | null): Trial => ({ step: 0, pass: 0, look: "x", originalIs: "A", picked, sameGame: null, sameGameConfidence: null, originalConfidence: null, tells: [] });
    const s = summarize([t("A"), t("A"), t("A"), t("B"), t(null)]);
    expect(s.valid).toBe(4);
    expect(s.accuracy).toBe(0.75);
    expect(s.distinguishable).toBe(true);
  });
});

describe("aura3d evidence judge", () => {
  it("is registered as a CLI command", () => {
    expect(cliCommandFor("evidence judge")?.summary).toMatch(/model, not a human/);
  });

  it("prints usage and exits 2 without --a and --b", async () => {
    const c = io();
    expect(await runJudge([], c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("--a");
  });

  it("runs the trials through Kiro Prism with a mocked model and says model judge", async () => {
    const { a, b, root } = frames(["f1", "f2", "f3"]);
    process.env.PRISM_API_KEY = "test-key-not-real";
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"same_game": true, "same_game_confidence": 0.6, "original": "A", "original_confidence": 0.8, "tells": ["glow"]}' }] }) };
    }));
    const c = io();
    const out = join(root, "out");
    expect(await runJudge(["--a", a, "--b", b, "--trials", "6", "--seed", "7", "--out", out, "--concurrency", "1"], c.io)).toBe(0);
    expect(calls).toHaveLength(6);
    expect(calls[0]?.url).toBe("https://prism.auraone.ai/v1/messages");
    expect(calls[0]?.headers["x-api-key"]).toBe("test-key-not-real");
    const result = JSON.parse(readFileSync(join(out, "judge-results.json"), "utf8"));
    expect(result.kind).toMatch(/MODEL/);
    expect(result.summary.trials).toBe(6);
    expect(JSON.stringify(result)).not.toContain("test-key-not-real");
    expect(c.out.join("\n")).toContain("model judge (not a human)");
  });

  it("supports --no-judge without a key and skips the network", async () => {
    const { a, b, root } = frames(["only"]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const c = io();
    expect(await runJudge(["--a", a, "--b", b, "--no-judge", "--out", join(root, "o")], c.io)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails clearly when no frame names match", async () => {
    const one = frames(["x"]);
    const two = frames(["y"]);
    const c = io();
    expect(await runJudge(["--a", one.a, "--b", two.b, "--no-judge"], c.io)).toBe(2);
    expect(c.err.join("\n")).toContain("No frame name");
  });
});
