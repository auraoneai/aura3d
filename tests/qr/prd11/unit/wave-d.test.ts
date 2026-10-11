import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cliCommandFor, codemodFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import "../../../../packages/aura3d-cli/src/commands/prd11/index";
import {
  findPerfGateScript,
  parsePerfGateArgs,
  perfGateCommand
} from "../../../../packages/aura3d-cli/src/commands/prd11/perfGate";
import {
  batchOptoutCodemod,
  buildBatchOptoutReport,
  scanBatchOptout
} from "../../../../packages/aura3d-cli/src/commands/prd11/batchOptout";
import * as Batcher from "../../../../packages/rendering/src/performance/Batcher";
import { planBatches } from "../../../../packages/rendering/src/batching/StaticMergePlanner";
import { batchStaticRenderItems } from "../../../../packages/rendering/src/SceneOptimization";

const repoRoot = resolve(__dirname, "../../../..");
const scratch = mkdtempSync(join(tmpdir(), "prd11-wave-d-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function io(cwd = repoRoot) {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { cwd, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
}

const budgets = {
  schema: "prd11-perf-budgets/1.0",
  rows: [
    { id: "frames", scene: "s", engine: "aura3d", flags: null, metric: "frame.frames", comparator: ">=", threshold: 30, gating: true },
    { id: "draws", scene: "s", engine: "aura3d", flags: null, metric: "payload.drawCalls", comparator: "<=", threshold: 10, gating: false }
  ]
};

function writeCase(name: string, frames: number) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  const budgetsPath = join(dir, "budgets.json");
  const reportPath = join(dir, "report.json");
  writeFileSync(budgetsPath, JSON.stringify(budgets));
  writeFileSync(reportPath, JSON.stringify({ scenes: [{ scene: "s", engines: { aura3d: { frame: { frames } } } }] }));
  return { dir, budgetsPath, reportPath, outPath: join(dir, "gate.json") };
}

describe("aura3d perf gate (11-CODE CLI)", () => {
  it("is registered in the C-39 registry as `perf gate`", () => {
    expect(cliCommandFor("perf gate")).toBe(perfGateCommand);
    expect(perfGateCommand.owner).toBe("prd11");
  });

  it("finds tools/perf-gate/index.mjs walking up from a nested cwd", () => {
    expect(findPerfGateScript(join(repoRoot, "packages", "aura3d-cli", "src"))).toBe(join(repoRoot, "tools", "perf-gate", "index.mjs"));
    expect(findPerfGateScript(scratch)).toBeUndefined();
  });

  it("parses --report/--budgets/--out/--gate and rejects bad argv", () => {
    expect(parsePerfGateArgs(["--report", "r.json", "--budgets=b.json"])).toEqual({ report: "r.json", budgets: "b.json" });
    expect(() => parsePerfGateArgs([])).toThrow(/--report/);
    expect(() => parsePerfGateArgs(["--report"])).toThrow(/needs a value/);
    expect(() => parsePerfGateArgs(["--report", "r.json", "--nope"])).toThrow(/unknown argument/);
  });

  it("exits 0 and writes perf-gate.json when every gating row passes", async () => {
    const c = writeCase("pass", 60);
    const h = io();
    const code = await perfGateCommand.run(["--report", c.reportPath, "--budgets", c.budgetsPath, "--out", c.outPath], h.io);
    expect(code).toBe(0);
    const gate = JSON.parse(readFileSync(c.outPath, "utf8"));
    expect(gate.schema).toBe("prd11-perf-gate/1.0");
    expect(gate.pass).toBe(true);
    expect(gate.rows.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([["frames", "pass"], ["draws", "pending"]]);
    expect(h.out.join("\n")).toMatch(/\[perf-gate\] PASS/);
  });

  it("exits 1 when a gating row fails (relative paths resolve against cwd)", async () => {
    const c = writeCase("fail", 5);
    const h = io(c.dir);
    const code = await perfGateCommand.run(
      ["--report", "report.json", "--budgets", "budgets.json", "--out", "gate.json", "--gate", join(repoRoot, "tools/perf-gate/index.mjs")],
      h.io
    );
    expect(code).toBe(1);
    expect(JSON.parse(readFileSync(c.outPath, "utf8")).rows[0].status).toBe("fail");
    expect(h.out.join("\n")).toMatch(/FAIL.*frames/);
  });

  it("exits 2 on usage errors, a missing report or no gate script", async () => {
    expect(await perfGateCommand.run([], io().io)).toBe(2);
    expect(await perfGateCommand.run(["--report", join(scratch, "missing.json")], io().io)).toBe(2);
    const c = writeCase("nogate", 60);
    const h = io(scratch);
    expect(await perfGateCommand.run(["--report", c.reportPath], h.io)).toBe(2);
    expect(h.err.join("\n")).toMatch(/PERF_GATE_NOT_FOUND/);
  });
});

describe("codemod prd11-batch-optout (11-CODE codemod, #121)", () => {
  const fixture = [
    "const a = 1;",
    "handle.setMaterial(glowMaterial);",
    "ballNode?.setMaterial(ok ? gold : orange);",
    "burstNode()?.setMaterial(mat).setVisible(true);",
    "  .setMaterial(chained)",
    "node.material.roughness = 0.2;",
    "this.parts[i].material.roughness += 0.1;",
    "if (node.material.roughness === 0.5) {}",
    "// handle.setMaterial(commented);",
    "const s = \"x.setMaterial(in a string)\";",
    "/* block",
    "  node.setMaterial(in a block) */",
    "function setMaterial(spec) {",
    "  setMaterial(spec: AuraMaterialSpec): this;",
    "setMaterial(fallback);"
  ].join("\n");

  it("is registered in the C-39 registry and never rewrites source", () => {
    expect(codemodFor("prd11-batch-optout")).toBe(batchOptoutCodemod);
    const { code, rows } = batchOptoutCodemod.transform(fixture, "apps/demo/src/main.ts");
    expect(code).toBe(fixture);
    expect(rows.length).toBe(7);
  });

  it("lists setMaterial( and material.roughness mutation sites with their node", () => {
    const rows = scanBatchOptout(fixture, "apps/demo/src/main.ts");
    expect(rows.map((r) => [r.line, r.kind, r.node])).toEqual([
      [2, "setMaterial", "handle"],
      [3, "setMaterial", "ballNode"],
      [4, "setMaterial", "burstNode()"],
      [5, "setMaterial", null],
      [6, "material.roughness", "node"],
      [7, "material.roughness", "this.parts[i]"],
      [15, "setMaterial", null]
    ]);
    for (const row of rows) {
      expect(row.target).toBe("batch: false");
      expect(row.mapping).toBe("none");
    }
  });

  it("builds a report over a directory; the migration script renders the #121 markdown", () => {
    const root = join(scratch, "repo");
    mkdirSync(join(root, "apps", "game-a", "src"), { recursive: true });
    mkdirSync(join(root, "apps", "game-a", "node_modules", "dep"), { recursive: true });
    writeFileSync(join(root, "apps", "game-a", "src", "main.ts"), "h.setMaterial(m);\nh.material.roughness = 1;\n");
    writeFileSync(join(root, "apps", "game-a", "node_modules", "dep", "index.js"), "h.setMaterial(m);\n");
    writeFileSync(join(root, "apps", "game-a", "src", "types.d.ts"), "h.setMaterial(m);\n");
    const report = buildBatchOptoutReport(["apps"], root);
    expect(report.filesScanned).toBe(1);
    expect(report.summary).toEqual({ sites: 2, files: 1, apps: { "game-a": 2 } });
    expect(report.rows[0].file).toBe("apps/game-a/src/main.ts");
    const script = join(repoRoot, "scripts/migrations/prd11-batch-optout.mjs");
    const run = spawnSync(process.execPath, [script, "apps", "--json", "out/r.json", "--md", "out/r.md"], { cwd: root, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "out/r.json"), "utf8")).summary).toEqual(report.summary);
    const md = readFileSync(join(root, "out/r.md"), "utf8");
    expect(md).toContain("| game-a | 2 |");
    expect(md).toContain("`apps/game-a/src/main.ts:2` | material.roughness | `h`");
  });
});

describe("performance/Batcher deprecation shim", () => {
  it("forwards planBatches and batchStaticRenderItems unchanged", () => {
    expect(Batcher.planBatches).toBe(planBatches);
    expect(Batcher.batchStaticRenderItems).toBe(batchStaticRenderItems);
  });

  it("carries @deprecated notices for every forwarded name", () => {
    const source = readFileSync(join(repoRoot, "packages/rendering/src/performance/Batcher.ts"), "utf8");
    expect(source).toMatch(/@deprecated Import `planBatches`/);
    expect(source).toMatch(/@deprecated Import `batchStaticRenderItems`/);
  });
});
