// tools/agent-eval/run.ts — T0.4 agent-output eval runner (PRD-13 §6.7).
//
// Per (prompt, seed) cell: fresh workdir → `npm create aura3d@<packed tgz>`
// (--template, --agent claude --skills all so the release-candidate skills are
// what the agent sees) → agent runs headless (Kiro Prism, 45-min wall clock) →
// `npm run build`. Stores src/**, transcript, build log and dist/ per cell plus
// a run.json (aura3d.agent-eval/1) and round summary. No repo checkout inside
// the sandbox; the key comes from the environment only.
//
//   pnpm exec tsx --tsconfig tsconfig.base.json tools/agent-eval/run.ts --dry-run
//   pnpm exec tsx ... run.ts --prompts benchmarks/agent-eval/prompts.json --seeds 0,1,2 --out benchmarks/agent-eval/runs/<id>
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { resolveAgentRunner, type AgentRunResult } from "./agents";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

interface CliOpts {
  prompts: string; only: string[]; seeds: number[];
  out: string; agent: string; agentCmd?: string;
  model: string; limitMinutes: number; template?: string;
  skills: string; packDir: string; dryRun: boolean;
  keepTemp: boolean; installTimeoutSec: number; buildTimeoutSec: number;
}
function parseArgs(argv: string[]): CliOpts {
  const opt = (name: string, fallback?: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
  };
  return {
    prompts: resolve(REPO_ROOT, opt("--prompts", "benchmarks/agent-eval/prompts.json")!),
    only: (opt("--only", "") ?? "").split(",").filter(Boolean),
    seeds: (opt("--seeds", "0,1,2") ?? "0,1,2").split(",").map((s) => Number(s.trim())),
    out: resolve(REPO_ROOT, opt("--out", `benchmarks/agent-eval/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`)!),
    agent: opt("--agent", "claude-code")!,
    agentCmd: opt("--agent-cmd"),
    model: opt("--model", process.env.A3D_EVAL_AGENT_MODEL ?? "kiro-prism/claude-opus-5.5")!,
    limitMinutes: Number(opt("--limit-minutes", "45")),
    template: opt("--template"),
    skills: opt("--skills", "all")!,
    packDir: resolve(REPO_ROOT, opt("--pack-dir", "tests/reports/release-tarballs")!),
    dryRun: argv.includes("--dry-run"),
    keepTemp: argv.includes("--keep-temp"),
    installTimeoutSec: Number(opt("--install-timeout", "600")),
    buildTimeoutSec: Number(opt("--build-timeout", "300"))
  };
}

interface PromptSpec { id: string; text: string; allowedAssets?: string[]; [k: string]: unknown; }
function loadPrompts(file: string): PromptSpec[] {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  if (doc.schema !== "aura3d.agent-eval-prompts/1" || !Array.isArray(doc.prompts)) {
    throw new Error(`prompts file ${file} is not aura3d.agent-eval-prompts/1`);
  }
  return doc.prompts;
}

function run(cmd: string, args: string[], cwd: string, timeoutSec: number, logPath?: string) {
  const r = spawnSync(cmd, args, { cwd, timeout: timeoutSec * 1000, encoding: "utf8", env: process.env });
  if (logPath) writeFileSync(logPath, `> ${cmd} ${args.join(" ")}\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", timedOut: r.signal === "SIGTERM" };
}

/** Every packed tarball of the release candidate (npm create + deps closure). */
function releaseTarballs(packDir: string): string[] {
  const planPath = join(packDir, "release-plan.json");
  const names = existsSync(planPath)
    ? (JSON.parse(readFileSync(planPath, "utf8")).packages ?? []).map((p: { tarball: string }) => p.tarball)
    : readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
  const files = names.map((n: string) => join(packDir, n)).filter((f: string) => f.endsWith(".tgz") && existsSync(f));
  if (!files.some((f: string) => basename(f).includes("create-aura3d")))
    throw new Error(`no create-aura3d tarball in ${packDir} — run tools/release/publish-all.mjs --pack-only`);
  return files;
}

/** Fixed minimal project for --dry-run: buildable with zero deps. */
function writeStubProject(dir: string, promptId: string) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `agent-eval-stub-${promptId.toLowerCase()}`, private: true, version: "0.0.0",
    scripts: { build: "node -e \"const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','<canvas id=stub></canvas>')\"" }
  }, null, 2));
  writeFileSync(join(dir, "src", "main.ts"), "// stub scaffold — replaced by stub agent output\n");
  writeFileSync(join(dir, "index.html"), "<div id=\"app\"></div><script type=\"module\" src=\"/src/main.ts\"></script>\n");
}

interface CellRecord {
  schema: "aura3d.agent-eval/1"; runId: string; cellId: string;
  promptId: string; seed: number; prompt: string; template: string | null;
  agent: { type: string; backend: string; model: string | null; wallClockMinutes: number };
  scaffold: { kind: string; tarballs: string[] };
  outcome: { status: "complete" | "failed"; phase: string; errors: string[] };
  timings: { startedAt: string; finishedAt: string; durationSec: number; agentSec?: number; buildSec?: number };
  artifacts: Record<string, string>;
  env: { node: string; platform: string; ciProvider: string | null; runUrl: string | null; dryRun: boolean };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const runId = process.env.GITHUB_RUN_ID ?? `local-${randomBytes(4).toString("hex")}`;
  const prompts = loadPrompts(opts.prompts).filter((p) => opts.only.length === 0 || opts.only.includes(p.id));
  if (prompts.length === 0) throw new Error("no prompts selected");
  const tarballs = opts.dryRun ? [] : releaseTarballs(opts.packDir);
  mkdirSync(opts.out, { recursive: true });
  const cells: CellRecord[] = [];

  for (const prompt of prompts) {
    for (const seed of opts.seeds) {
      const cellId = `${prompt.id}-s${seed}`;
      const cellDir = join(opts.out, cellId);
      const workdir = join(cellDir, "work");
      const artifacts = join(cellDir, "artifacts");
      mkdirSync(workdir, { recursive: true }); mkdirSync(artifacts, { recursive: true });
      const startedAt = new Date().toISOString(); const t0 = Date.now();
      const errors: string[] = []; let phase = "scaffold";

      // --- 1. scaffold -----------------------------------------------------
      if (opts.dryRun) {
        writeStubProject(workdir, prompt.id);
      } else {
        const createTgz = tarballs.find((f) => basename(f).includes("create-aura3d"))!;
        const args = ["exec", "--yes", "--package", createTgz, "--", "create-aura3d", "."];
        if (opts.template) args.push("--template", opts.template);
        args.push("--agent", "claude", "--skills", opts.skills);
        const sc = run("npm", args, workdir, opts.installTimeoutSec, join(artifacts, "scaffold.log"));
        if (sc.code !== 0) errors.push(`scaffold exit ${sc.code}`);
        const ins = run("npm", ["install", ...tarballs], workdir, opts.installTimeoutSec, join(artifacts, "install.log"));
        if (sc.code === 0 && ins.code !== 0) errors.push(`tarball install exit ${ins.code}`);
      }
      // materialize allowed assets into the sandbox (skip + record when absent)
      const materialized: string[] = [];
      for (const a of prompt.allowedAssets ?? []) {
        const src = resolve(REPO_ROOT, a);
        if (existsSync(src)) { cpSync(src, join(workdir, basename(a))); materialized.push(a); }
      }

      // --- 2. agent ---------------------------------------------------------
      let agentRes: AgentRunResult | null = null;
      const transcript = join(artifacts, "agent-transcript.txt");
      if (errors.length === 0) {
        phase = "agent";
        const runner = resolveAgentRunner(opts.dryRun ? "stub" : opts.agent, { cli: opts.agentCmd });
        agentRes = await runner.run({
          cellId, runId, promptId: prompt.id, seed, promptText: prompt.text,
          workdir, transcriptPath: transcript, model: opts.model,
          limitMs: opts.limitMinutes * 60_000
        });
        if (!agentRes.ok) errors.push(`agent failed${agentRes.note ? `: ${agentRes.note}` : ""}`);
      }

      // --- 3. build ----------------------------------------------------------
      const buildLog = join(artifacts, "build.log");
      let buildSec = 0;
      if (errors.length === 0) {
        phase = "build";
        const b0 = Date.now();
        const b = run("npm", ["run", "build"], workdir, opts.buildTimeoutSec, buildLog);
        buildSec = Math.round((Date.now() - b0) / 1000);
        if (b.code !== 0) errors.push(`build exit ${b.code}`);
      }

      // --- 4. collect artifacts ----------------------------------------------
      for (const [src, dest, name] of [
        [join(workdir, "src"), join(cellDir, "src"), "srcDir"],
        [join(workdir, "dist"), join(cellDir, "dist"), "distDir"]
      ] as const) {
        if (existsSync(src)) cpSync(src, dest, { recursive: true });
      }
      const art: Record<string, string> = { cellDir: relative(opts.out, cellDir) };
      if (existsSync(transcript)) art.transcript = relative(opts.out, transcript);
      if (existsSync(buildLog)) art.buildLog = relative(opts.out, buildLog);
      if (existsSync(join(cellDir, "src"))) art.srcDir = `${cellId}/src`;
      if (existsSync(join(cellDir, "dist"))) art.distDir = `${cellId}/dist`;

      const cell: CellRecord = {
        schema: "aura3d.agent-eval/1", runId, cellId,
        promptId: prompt.id, seed, prompt: prompt.text, template: opts.template ?? null,
        agent: { type: opts.dryRun ? "stub" : opts.agent, backend: opts.dryRun ? "offline" : "kiro-prism", model: opts.dryRun ? null : opts.model, wallClockMinutes: opts.limitMinutes },
        scaffold: { kind: opts.dryRun ? "stub" : "npm-create-aura3d", tarballs: tarballs.map((t) => basename(t)) },
        outcome: { status: errors.length ? "failed" : "complete", phase, errors },
        timings: { startedAt, finishedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - t0) / 1000), agentSec: agentRes ? Math.round(agentRes.durationMs / 1000) : undefined, buildSec },
        artifacts: art,
        env: {
          node: process.version, platform: process.platform,
          ciProvider: process.env.GITHUB_ACTIONS ? `github:${process.env.GITHUB_WORKFLOW ?? "?"}` : null,
          runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
          dryRun: opts.dryRun
        }
      };
      writeFileSync(join(cellDir, "run.json"), JSON.stringify(cell, null, 2));
      cells.push(cell);
      console.log(`[agent-eval] ${cellId}: ${cell.outcome.status} (phase=${phase}, ${cell.timings.durationSec}s)`);
      if (!opts.keepTemp && !opts.dryRun) rmSync(join(workdir, "node_modules"), { recursive: true, force: true });
    }
  }

  const round = {
    schema: "aura3d.agent-eval.round/1", runId,
    startedAt: cells[0]?.timings.startedAt, finishedAt: new Date().toISOString(),
    agent: cells[0]?.agent, prompts: prompts.length, seeds: opts.seeds,
    cells: cells.map((c) => ({ cellId: c.cellId, status: c.outcome.status, phase: c.outcome.phase })),
    digest: createHash("sha256").update(cells.map((c) => c.cellId).join("|")).digest("hex")
  };
  writeFileSync(join(opts.out, "round.json"), JSON.stringify(round, null, 2));
  const failed = cells.filter((c) => c.outcome.status === "failed");
  console.log(`[agent-eval] run ${runId}: ${cells.length - failed.length}/${cells.length} cells complete → ${relative(REPO_ROOT, opts.out)}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(`[agent-eval] ${e.message ?? e}`); process.exit(2); });
