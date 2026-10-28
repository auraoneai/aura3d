import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  buildAuthorPlan,
  loadBriefs,
  materializeTasks,
  parseArgs,
  selectScenes,
  stageSandbox,
  summarizeBatch,
  validateBriefs
} from "../../../tools/bench-vs-threejs/shared/authors/run-authors.mjs";

const REPO = resolve(__dirname, "../../..");
const RUNNER = join(REPO, "tools/bench-vs-threejs/shared/authors/run-authors.mjs");
const BENCH_SCENES = ["baseline", "pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"];

describe("bench authors: briefs", () => {
  const briefs = loadBriefs();

  it("covers exactly the six bench scenes, each with a unique task number", () => {
    expect(briefs.scenes.map((s: any) => s.id)).toEqual(BENCH_SCENES);
    expect(new Set(briefs.scenes.map((s: any) => s.task)).size).toBe(6);
    expect(validateBriefs(briefs)).toEqual([]);
  });

  it("flags a missing placeholder, a reused task number and a missing reused file", () => {
    const bad = {
      scenes: [
        { id: "a", task: 1, reuse: null, text: "no placeholder", assets: [] },
        { id: "b", task: 1, reuse: "99-missing.md", text: null, assets: [] }
      ]
    };
    const problems = validateBriefs(bad);
    expect(problems).toContain("a: text must contain {{LIBRARY}}");
    expect(problems).toContain("b: task number 1 reused");
    expect(problems).toContain("b: reused task file 99-missing.md not found");
  });

  it("materialises task files agent-eval's readTask can find, with the contract appended and the library swapped", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-authors-t-"));
    try {
      materializeTasks(briefs, dir);
      const forest = readFileSync(join(dir, "02-forest.md"), "utf8");
      expect(forest).toBe(readFileSync(join(REPO, "tools/agent-eval/tasks/02-forest.md"), "utf8"));
      expect(readFileSync(join(dir, "09-baseline.md"), "utf8")).toContain("hello cube");
      expect(readFileSync(join(dir, "00-contract.md"), "utf8")).toContain("__EVAL_READY__");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bench authors: plan", () => {
  const briefs = loadBriefs();

  it("plans three authors per scene per library with distinct run ids and sessions", () => {
    const plan = buildAuthorPlan({ scenes: briefs.scenes, batch: "t" });
    expect(plan).toHaveLength(6 * 2 * 3);
    expect(new Set(plan.map((p: any) => p.runId)).size).toBe(36);
    for (const scene of BENCH_SCENES) for (const lib of ["three", "aura"]) expect(plan.filter((p: any) => p.scene === scene && p.lib === lib).map((p: any) => p.author).sort()).toEqual([1, 2, 3]);
  });

  it("is deterministic for a seed, interleaves arms, and changes with the seed", () => {
    const a = buildAuthorPlan({ scenes: briefs.scenes, batch: "t", seed: 7 });
    const b = buildAuthorPlan({ scenes: briefs.scenes, batch: "t", seed: 7 });
    const c = buildAuthorPlan({ scenes: briefs.scenes, batch: "t", seed: 8 });
    expect(a).toEqual(b);
    expect(a.map((p: any) => p.runId)).not.toEqual(c.map((p: any) => p.runId));
    expect(a.slice(0, 6).some((p: any) => p.lib === "three") && a.slice(0, 6).some((p: any) => p.lib === "aura")).toBe(true);
  });

  it("parses flags and rejects unknown libraries and scenes", () => {
    expect(parseArgs(["--dry-run", "--scenes", "forest", "--authors", "2", "--libs", "aura"])).toMatchObject({ dryRun: true, scenes: "forest", authors: 2, libs: ["aura"], confirmSpend: false });
    expect(() => parseArgs(["--libs", "babylon"])).toThrow(/unknown library/);
    expect(() => parseArgs(["--authors", "0"])).toThrow();
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument/);
    expect(() => selectScenes(briefs, "forest,sea")).toThrow(/unknown scene/);
    expect(selectScenes(briefs, "forest,game-loop").map((s: any) => s.id)).toEqual(["forest", "game-loop"]);
  });
});

describe("bench authors: runner", () => {
  it("--dry-run plans offline (no Prism, no npm) and writes plan.json", () => {
    const out = mkdtempSync(join(tmpdir(), "bench-authors-out-"));
    try {
      const res = spawnSync("node", [RUNNER, "--dry-run", "--scenes", "forest,baseline", "--out", out, "--batch", "d"], { encoding: "utf8", env: { ...process.env, PRISM_API_KEY: "" } });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("12 author run(s) planned");
      const plan = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"));
      expect(plan.plan).toHaveLength(12);
      expect(plan.note).toMatch(/not seedable/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("refuses to start paid runs without --confirm-spend", () => {
    const out = mkdtempSync(join(tmpdir(), "bench-authors-out-"));
    try {
      const res = spawnSync("node", [RUNNER, "--scenes", "forest", "--out", out, "--batch", "n"], { encoding: "utf8" });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("--confirm-spend");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("stages isolated sandboxes for both libraries with the provided asset and no repo source", () => {
    const work = mkdtempSync(join(tmpdir(), "bench-authors-sbx-"));
    try {
      const briefs = loadBriefs();
      const tasks = materializeTasks(briefs, join(work, "tasks"));
      for (const lib of ["three", "aura"]) {
        const baseDir = join(work, `base-${lib}`);
        mkdirSync(join(baseDir, "node_modules"), { recursive: true });
        writeFileSync(join(baseDir, "package.json"), JSON.stringify({ name: "base", private: true }));
        const dir = join(work, `sbx-${lib}`);
        const scene = briefs.scenes.find((s: any) => s.id === "pbr-viewer");
        stageSandbox({ scene, lib, dir, baseDir, tasksDir: tasks });
        expect(lstatSync(join(dir, "node_modules")).isSymbolicLink()).toBe(true);
        expect(lstatSync(join(dir, "public/assets/prop.glb")).size).toBeGreaterThan(1000);
        const task = readFileSync(join(dir, "TASK.md"), "utf8");
        expect(task).toContain("PBR model viewer");
        expect(task).toContain(lib === "aura" ? "@aura3d/engine" : "three.js 0.185.1");
        if (lib === "aura") expect(lstatSync(join(dir, "llms.txt")).isFile()).toBe(true);
        else expect(() => lstatSync(join(dir, "llms.txt"))).toThrow();
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

describe("bench authors: summarize", () => {
  it("takes medians over valid authors, counts invalid runs apart and measures the authored source", () => {
    const batch = mkdtempSync(join(tmpdir(), "bench-authors-sum-"));
    try {
      const mk = (id: string, run: Record<string, unknown>, source: string | null) => {
        const dir = join(batch, "runs", id);
        mkdirSync(join(dir, "snapshots/final/src"), { recursive: true });
        writeFileSync(join(dir, "run.json"), JSON.stringify({ runId: id, scene: "baseline", lib: "three", ...run }));
        if (source !== null) writeFileSync(join(dir, "snapshots/final/src/main.ts"), source);
      };
      const lines = (n: number) => Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join("\n");
      mk("a1", { usage: { turns: 4, input: 1000, output: 100 }, wallMs: 10, firstTryTypecheck: true, finalTypecheckPass: true }, lines(10));
      mk("a2", { usage: { turns: 8, input: 3000, output: 300 }, wallMs: 30, firstTryTypecheck: false, finalTypecheckPass: true }, lines(20));
      mk("a3", { usage: { turns: 6, input: 2000, output: 200 }, wallMs: 20, firstTryTypecheck: true, finalTypecheckPass: false }, lines(30));
      mk("a4", { invalid: true, usage: null }, null);
      const cell = summarizeBatch(batch).cells["baseline/three"];
      expect(cell).toMatchObject({ authors: 4, valid: 3, invalid: 1, turns: 6, inputTokens: 2000, outputTokens: 200, wallMs: 20, sourceLoc: 20, firstTryTypecheck: 2, finalTypecheckPass: 2 });
      expect(cell.sourceTokens).toBeGreaterThan(0);
    } finally {
      rmSync(batch, { recursive: true, force: true });
    }
  });
});
