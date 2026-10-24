import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRemoteLog } from "../../../tools/agent-eval/lib/extract.mjs";
import { applyStockBuildPatch, basePackageJson } from "../../../tools/agent-eval/lib/base.mjs";
import { buildJudgePrompt, parseJudge } from "../../../tools/agent-eval/lib/judge.mjs";
import { renderReport } from "../../../tools/agent-eval/lib/report.mjs";
import { computeRunMetrics, probeChecks } from "../../../tools/agent-eval/lib/score.mjs";
import { stageBatch } from "../../../tools/agent-eval/lib/stage.mjs";

const okRemote = (probes: Record<string, unknown>) => ({ build: { ok: true }, readyMs: 900, probes: { blank: false, ...probes }, page: { pageErrors: [], consoleErrorCount: 0 }, bundle: { rawKB: 3800, gzipKB: 1090 } });

describe("agent-eval scoring", () => {
  it("scores task probes deterministically", () => {
    const good = probeChecks(1, okRemote({ animated: true, orbitResponds: true }));
    expect(good).toMatchObject({ passed: good.total });
    const bad = probeChecks(1, okRemote({ animated: true, orbitResponds: false }));
    expect(bad.items.orbitResponds).toBe(false);
    expect(probeChecks(4, okRemote({ hasState: true })).items).toMatchObject({ hasState: true, pauseFreezes: false });
    const failedBuild = probeChecks(5, { build: { ok: false } });
    expect(failedBuild.items.builds).toBe(false);
    expect(probeChecks(6, okRemote({ replayDeterministic: true, mobile: { noHorizontalScroll: true } })).items).toMatchObject({ replayDeterministic: true, mobileNoHScroll: true });
  });

  it("derives first-try and final results, aliasing a draft that equals the final", () => {
    const run = {
      runId: "r",
      arm: "aura",
      task: 1,
      draftIsFinal: false,
      firstTryTypecheck: false,
      finalTypecheckPass: true,
      usage: { turns: 7, input: 1000, output: 200 },
      wallMs: 12000,
      events: [{ type: "write" }, { type: "typecheck", pass: false }, { type: "write" }, { type: "typecheck", pass: true }],
      docsOpened: ["llms.txt", "docs/agents/README.md"],
      typesOpened: ["node_modules/@aura3d/engine/README.md"]
    };
    const m = computeRunMetrics({
      run,
      remoteDraft: { ...okRemote({}), build: { ok: false } },
      remoteFinal: okRemote({ animated: true, orbitResponds: true }),
      sources: { "src/main.ts": "const a = 1;\n// c\nrun();\n", "index.html": "<html>" }
    });
    expect(m).toMatchObject({ firstTryTypecheck: false, firstTryBuild: false, firstTryRender: false, finalBuild: true, finalRender: true, editsToGreen: 1, srcLines: 2, docsFilesOpened: 2, probePassFraction: 1 });
    const same = computeRunMetrics({ run: { ...run, draftIsFinal: true }, remoteDraft: null, remoteFinal: okRemote({ animated: true, orbitResponds: true }), sources: {} });
    expect(same.firstTryBuild).toBe(true);
  });

  it("parses the judge reply and builds a bounded prompt", () => {
    const parsed = parseJudge('text {"checklist":[{"id":"a","pass":true,"why":"ok"},{"id":"b","pass":false}],"silentNoOps":[{"where":"x","why":"y"}],"glue":{"glueLines":12}} tail');
    expect(parsed.checklist).toHaveLength(2);
    expect(parsed.silentNoOps).toHaveLength(1);
    expect(parsed.glue.glueLines).toBe(12);
    expect(() => parseJudge("no json here")).toThrow();
    const prompt = buildJudgePrompt({ task: 1, checklist: [{ id: "a", text: "A" }], sources: { "src/main.ts": "x".repeat(100000) }, probes: {}, remote: {} });
    expect(prompt.length).toBeLessThan(75000);
  });

  it("renders a report with both arms, spread, failed probes and invalid runs", () => {
    const mk = (arm: string, runId: string, over: Record<string, unknown> = {}) => ({
      runId,
      arm,
      task: 1,
      valid: true,
      firstTryTypecheck: true,
      firstTryBuild: arm === "three",
      firstTryRender: arm === "three",
      finalBuild: true,
      finalRender: true,
      probePassFraction: 1,
      editsToGreen: 0,
      turns: 8,
      srcLines: 30,
      probeItems: arm === "aura" ? { orbitResponds: false } : {},
      ...over
    });
    const text = renderReport({
      batches: ["x"],
      metrics: [mk("aura", "a1"), mk("aura", "a2", { turns: 12 }), mk("three", "t1"), { runId: "bad", arm: "aura", task: 1, valid: false, invalidReason: "prism 500" }],
      meta: { generated: "2026-10-24", caveats: ["a caveat"] }
    });
    expect(text).toContain("| first-try build (vite, stock) | 0/2 | 1/1 |");
    expect(text).toContain("10 (8-12, n=2)");
    expect(text).toContain("orbitResponds x2");
    expect(text).toContain("bad: prism 500");
    expect(text).toContain("- a caveat");
    expect(text).toContain("not statistical significance");
  });

  it("parses remote logs, keeping the last result per id", () => {
    const log = ["noise", 'AGENTEVAL_RESULT {"id":"a-final","build":{"ok":false}}', 'x AGENTEVAL_RESULT {"id":"a-final","build":{"ok":true}}', "AGENTEVAL_FRAME a-final 0 QUJD", "AGENTEVAL_RESULT {broken"].join("\n");
    const parsed = parseRemoteLog(log);
    expect(parsed.results).toEqual([{ id: "a-final", build: { ok: true } }]);
    expect(parsed.frames).toEqual([{ id: "a-final", index: 0, data: "QUJD" }]);
  });

  it("applies the documented stock-build dist patch once and describes the base installs", () => {
    const nm = mkdtempSync(join(tmpdir(), "agent-eval-patch-"));
    const file = join(nm, "@aura3d/engine/dist/engine/production-runtime/actor/ModelTextureShare.js");
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, 'import { GLTFSharedTextureCache } from "../../../assets/index.js";\n');
    expect(applyStockBuildPatch(nm)).toBe("applied");
    expect(applyStockBuildPatch(nm)).toBe("already");
    expect(applyStockBuildPatch(join(nm, "missing"))).toBe("not-needed");
    expect(basePackageJson("three").dependencies.three).toBe("0.185.1");
    expect(basePackageJson("aura").dependencies["@aura3d/engine"]).toBe("4.1.2");
    rmSync(nm, { recursive: true, force: true });
  });

  it("stages final snapshots and drops a duplicate draft", () => {
    const repo = mkdtempSync(join(tmpdir(), "agent-eval-stage-"));
    const runs = join(repo, "evidence/agent-eval/b/runs");
    const put = (name: string, kind: string, text: string) => {
      mkdirSync(join(runs, name, "snapshots", kind, "src"), { recursive: true });
      writeFileSync(join(runs, name, "snapshots", kind, "src/main.ts"), text);
    };
    mkdirSync(join(runs, "same"), { recursive: true });
    writeFileSync(join(runs, "same/run.json"), JSON.stringify({ runId: "same", arm: "three", task: 1, draftIsFinal: false }));
    put("same", "draft", "A");
    put("same", "final", "A");
    mkdirSync(join(runs, "diff"), { recursive: true });
    writeFileSync(join(runs, "diff/run.json"), JSON.stringify({ runId: "diff", arm: "aura", task: 1, draftIsFinal: false }));
    put("diff", "draft", "A");
    put("diff", "final", "B");
    mkdirSync(join(runs, "invalid"), { recursive: true });
    writeFileSync(join(runs, "invalid/run.json"), JSON.stringify({ runId: "invalid", arm: "aura", task: 1, invalid: true }));
    const { manifest, stage } = stageBatch({ repoRoot: repo, batch: "b", stageRoot: join(repo, "stage") });
    expect(manifest.snapshots.map((s: { id: string }) => s.id).sort()).toEqual(["diff-draft", "diff-final", "same-final"]);
    expect(manifest.snapshots.find((s: { id: string }) => s.id === "same-final").draftAliasesFinal).toBe(true);
    expect(existsSync(join(stage, "manifest.json"))).toBe(true);
    cpSync(stage, join(repo, "copy"), { recursive: true });
    rmSync(repo, { recursive: true, force: true });
  });
});
