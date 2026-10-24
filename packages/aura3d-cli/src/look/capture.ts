/**
 * PRD-13 T2.16 — `look capture` command body.
 * Registered as C-39 command `look capture` from commands/prd13/index.ts.
 *
 * `--runner remote` (default): browsers never run on the developer machine.
 * With `--remote-cmd "<cmd>"` (or env AURA3D_REMOTE_RUNNER) the command is
 * executed as `<cmd> <capture-request.json> <outDir>` and must leave the
 * screenshots in outDir. With `--from <dir>` the PNGs and reports a remote run
 * already produced are collected. With neither, a `capture-request.json` is
 * written next to the output and the exact remote-run steps are printed (exit 2:
 * the capture is pending, not done).
 *
 * `--runner local` (explicit opt-in, prints a warning): runs the project's
 * Playwright screenshot spec directly on this machine.
 *
 * `--runner gh-actions` (legacy, prints a warning): dispatches the project's own
 * `.github/workflows/aura3d-lookdev.yml` through the user's `gh` CLI auth —
 * the command never sets or reads tokens itself — polls the run, then
 * downloads the `lookdev` artifact into `--out` (default dist/lookdev/<round>).
 *
 * Always exits 0 on a completed capture even when lint findings exist —
 * lint.json is evidence, not a gate (the judge consumes it).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { AuraCliCommand } from "../contracts/commands.js";

export interface LookCaptureDeps {
  /** Injected process runner (tests mock it); default spawns real commands. */
  readonly exec?: (command: string, args: readonly string[], cwd: string) => { readonly status: number; readonly stdout: string; readonly stderr: string };
  /** Poll delay between gh run status checks (ms); tests pass 0. */
  readonly pollMs?: number;
  /** Max polls before giving up on a dispatched run. */
  readonly maxPolls?: number;
  /** Sleep implementation (tests inject a no-op). */
  readonly sleep?: (ms: number) => void;
}

export interface LookCaptureResult {
  readonly ok: boolean;
  readonly runner: "remote" | "gh-actions" | "local";
  readonly pending?: boolean;
  readonly requestPath?: string;
  readonly outDir: string;
  readonly pngs: readonly string[];
  readonly appliedLookPath?: string;
  readonly lintPath?: string;
  readonly lintErrors: number;
  readonly error?: string;
}

interface ParsedArgs {
  readonly flags: ReadonlyMap<string, string>;
  readonly switches: ReadonlySet<string>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(arg.slice(2), next);
        i += 1;
      } else {
        switches.add(arg.slice(2));
      }
    }
  }
  return { flags, switches };
}

function defaultExec(command: string, args: readonly string[], cwd: string): { readonly status: number; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8", shell: process.platform === "win32" });
  return { status: result.status ?? 1, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
}

/** Next free round number under <cwd>/dist/lookdev/. */
export function nextLookdevRound(cwd: string): number {
  const root = resolve(cwd, "dist/lookdev");
  if (!existsSync(root)) return 1;
  const rounds = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name));
  return rounds.length === 0 ? 1 : Math.max(...rounds) + 1;
}

/** Collect .png files anywhere under dir (artifacts may nest). */
function collectPngs(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".png")) out.push(path);
    }
  };
  if (existsSync(dir)) visit(dir);
  return out.sort();
}

/**
 * Emit appliedLook.json + lint.json next to the captures. Sources, in order:
 * tests/reports/screenshot.json profile fields (the T3.12 screenshot spec
 * writes lint findings into the report), then any lint.json/appLook.json the
 * artifact already carried.
 */
function emitLookReports(outDir: string): { appliedLookPath?: string; lintPath?: string; lintErrors: number } {
  let appliedLook: unknown;
  let lint: unknown;
  const screenshotJson = join(outDir, "screenshot.json");
  if (existsSync(screenshotJson)) {
    try {
      const report = JSON.parse(readFileSync(screenshotJson, "utf8")) as { profile?: Record<string, unknown> };
      const profile = report.profile ?? {};
      appliedLook = profile.appliedLook ?? profile.look;
      lint = profile.lint;
    } catch { /* tolerate malformed report; emit empty files below */ }
  }
  for (const name of ["appliedLook.json", "applied-look.json"]) {
    const candidate = join(outDir, name);
    if (appliedLook === undefined && existsSync(candidate)) {
      try { appliedLook = JSON.parse(readFileSync(candidate, "utf8")); } catch { /* ignore */ }
    }
  }
  const lintCandidate = join(outDir, "lint.json");
  if (lint === undefined && existsSync(lintCandidate)) {
    try { lint = JSON.parse(readFileSync(lintCandidate, "utf8")); } catch { /* ignore */ }
  }
  const appliedLookPath = join(outDir, "appliedLook.json");
  writeFileSync(appliedLookPath, `${JSON.stringify(appliedLook ?? {}, null, 2)}\n`);
  const lintPath = join(outDir, "lint.json");
  writeFileSync(lintPath, `${JSON.stringify(lint ?? { findings: [] }, null, 2)}\n`);
  const findings = (lint as { findings?: { severity?: string }[] } | undefined)?.findings ?? [];
  const lintErrors = findings.filter((finding) => finding.severity === "error").length;
  return { appliedLookPath, lintPath, lintErrors };
}

export async function runLookCapture(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }, deps: LookCaptureDeps = {}): Promise<number> {
  const { flags, switches } = parseArgs(argv);
  const asJson = switches.has("json");
  const runner = flags.get("runner") ?? "remote";
  if (runner !== "remote" && runner !== "gh-actions" && runner !== "local") {
    io.stderr(`unknown --runner "${runner}"; use remote (default), local or gh-actions`);
    return 2;
  }
  if (runner === "local") io.stderr("warning: --runner local runs a real browser on this machine; prefer --runner remote (see docs/agents/verification.md).");
  if (runner === "gh-actions") io.stderr("warning: --runner gh-actions is a legacy option; prefer --runner remote (see docs/agents/verification.md).");
  const exec = deps.exec ?? defaultExec;
  const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
  const sleep = deps.sleep ?? ((ms: number) => Atomics.wait(sleepBuffer, 0, 0, ms));
  const pollMs = deps.pollMs ?? 5000;
  const maxPolls = deps.maxPolls ?? 120;
  const outDir = resolve(io.cwd, flags.get("out") ?? `dist/lookdev/${nextLookdevRound(io.cwd)}`);
  mkdirSync(outDir, { recursive: true });
  const shots = flags.get("shots");
  const viewports = flags.get("viewports");

  const finish = (result: LookCaptureResult): number => {
    if (asJson) {
      io.stdout(JSON.stringify(result, null, 2));
    } else {
      if (!result.ok) io.stderr(result.error ?? "capture failed");
      for (const png of result.pngs) io.stdout(`png: ${png}`);
      if (result.appliedLookPath) io.stdout(`appliedLook: ${result.appliedLookPath}`);
      if (result.lintPath) io.stdout(`lint: ${result.lintPath} (${result.lintErrors} error findings — reported, not gating)`);
    }
    // Spec: exit 0 on completed capture even when lint has errors.
    return result.ok ? 0 : 2;
  };

  if (runner === "remote") {
    const requestPath = join(outDir, "capture-request.json");
    const request = {
      schema: "aura3d.look-capture-request/1",
      route: flags.get("route") ?? "/",
      shots: shots ?? "opening,mid,action",
      viewports: viewports ?? "desktop,mobile",
      spec: "tests/screenshot.spec.ts",
      env: { A3D_LOOKDEV_SHOTS: shots ?? "opening,mid,action", A3D_LOOKDEV_VIEWPORTS: viewports ?? "desktop,mobile" },
      reportsDir: "tests/reports",
      expectedFiles: ["*.png", "screenshot.json", "appliedLook.json", "lint.json"]
    };
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);
    const fromDir = flags.get("from");
    if (fromDir !== undefined) {
      const src = resolve(io.cwd, fromDir);
      if (!existsSync(src)) return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, requestPath, error: `--from directory not found: ${src}` });
      for (const file of collectPngs(src)) {
        const dest = join(outDir, file.slice(src.length + 1));
        mkdirSync(join(dest, ".."), { recursive: true });
        writeFileSync(dest, readFileSync(file));
      }
      for (const json of ["screenshot.json", "appliedLook.json", "lint.json"]) {
        const file = join(src, json);
        if (existsSync(file)) writeFileSync(join(outDir, json), readFileSync(file));
      }
      const pngs = collectPngs(outDir);
      if (pngs.length === 0) return finish({ ok: false, runner, outDir, pngs, lintErrors: 0, requestPath, error: `no .png captures found under ${src}` });
      return finish({ ok: true, runner, outDir, pngs, requestPath, ...emitLookReports(outDir) });
    }
    const remoteCmd = (flags.get("remote-cmd") ?? process.env.AURA3D_REMOTE_RUNNER ?? "").trim();
    if (remoteCmd !== "") {
      const [command, ...rest] = remoteCmd.split(/\s+/);
      const result = exec(command!, [...rest, requestPath, outDir], io.cwd);
      if (result.status !== 0) return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, requestPath, error: `remote runner failed: ${result.stderr || result.stdout}` });
      const pngs = collectPngs(outDir);
      if (pngs.length === 0) return finish({ ok: false, runner, outDir, pngs, lintErrors: 0, requestPath, error: "remote runner finished but left no .png captures in the output directory" });
      return finish({ ok: true, runner, outDir, pngs, requestPath, ...emitLookReports(outDir) });
    }
    const steps = [
      `No remote runner is configured, so no browser was started here. Capture request written: ${requestPath}`,
      "Run the capture on a remote machine (never a local browser on your dev machine):",
      "  1. On the remote runner, in this project, run: A3D_LOOKDEV_SHOTS=<shots> A3D_LOOKDEV_VIEWPORTS=<viewports> pnpm exec playwright test tests/screenshot.spec.ts --workers=1",
      "     (AuraOne repos: tools/remote-acr/run.sh with a SPECS entry for tests/screenshot.spec.ts.)",
      "  2. Copy tests/reports back to this machine.",
      `  3. Finish with: aura3d look capture --runner remote --from <copied reports dir> --out ${outDir}`,
      "Or configure a runner once: --remote-cmd \"<command>\" or AURA3D_REMOTE_RUNNER (called as <command> <capture-request.json> <outDir>)."
    ];
    if (asJson) {
      io.stdout(JSON.stringify({ ok: false, pending: true, runner, outDir, pngs: [], lintErrors: 0, requestPath, error: "no remote runner configured; capture request written", steps }, null, 2));
    } else {
      for (const line of steps) io.stderr(line);
    }
    return 2;
  }

  if (runner === "local") {
    const playwrightBin = join(io.cwd, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
    if (!existsSync(playwrightBin) && exec("pnpm", ["exec", "playwright", "--version"], io.cwd).status !== 0) {
      return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: "local runner unavailable: playwright is not installed in this project (use --runner remote)" });
    }
    // shots/viewports reach the spec through the same env vars the
    // aura3d-lookdev.yml workflow sets (A3D_LOOKDEV_SHOTS/VIEWPORTS); exec()
    // spawns with inherited env, so callers/tests set them on the process.
    void shots; void viewports;
    const result = exec("pnpm", ["exec", "playwright", "test", "tests/screenshot.spec.ts", "--reporter=line", "--workers=1"], io.cwd);
    if (result.status !== 0) {
      return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: `local playwright run failed: ${result.stderr || result.stdout}` });
    }
    const reportsDir = resolve(io.cwd, "tests/reports");
    for (const file of collectPngs(reportsDir)) {
      const dest = join(outDir, file.slice(reportsDir.length + 1));
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, readFileSync(file));
    }
    for (const json of ["screenshot.json", "appliedLook.json", "lint.json"]) {
      const src = join(reportsDir, json);
      if (existsSync(src)) writeFileSync(join(outDir, json), readFileSync(src));
    }
    const reports = emitLookReports(outDir);
    return finish({ ok: true, runner, outDir, pngs: collectPngs(outDir), ...reports });
  }

  // --runner gh-actions: use the user's gh auth; never set/read tokens.
  if (exec("gh", ["--version"], io.cwd).status !== 0) {
    return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: "gh CLI not found; install https://cli.github.com or use --runner remote" });
  }
  const workflowFile = resolve(io.cwd, ".github/workflows/aura3d-lookdev.yml");
  if (!existsSync(workflowFile)) {
    return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: "no .github/workflows/aura3d-lookdev.yml in this project (templates ship it by default)" });
  }
  const dispatchArgs = ["workflow", "run", "aura3d-lookdev.yml"];
  if (shots) dispatchArgs.push("-f", `shots=${shots}`);
  if (viewports) dispatchArgs.push("-f", `viewports=${viewports}`);
  const dispatch = exec("gh", dispatchArgs, io.cwd);
  if (dispatch.status !== 0) {
    return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: `gh workflow run failed: ${dispatch.stderr || dispatch.stdout}` });
  }

  // Poll the newest run of the workflow until it completes.
  let runId: string | undefined;
  for (let poll = 0; poll < maxPolls; poll++) {
    const list = exec("gh", ["run", "list", "--workflow=aura3d-lookdev.yml", "--limit", "1", "--json", "databaseId,status,conclusion"], io.cwd);
    if (list.status === 0) {
      try {
        const [run] = JSON.parse(list.stdout) as { databaseId?: number; status?: string; conclusion?: string }[];
        if (run?.databaseId !== undefined) {
          runId = String(run.databaseId);
          if (run.status === "completed") {
            if (run.conclusion === "success") break;
            return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: `look-dev run ${runId} concluded ${run.conclusion}` });
          }
        }
      } catch { /* gh emitted non-JSON; keep polling */ }
    }
    sleep(pollMs);
  }
  if (!runId) {
    return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: "no aura3d-lookdev run appeared after dispatch" });
  }
  // Completed? Re-check status once more after the loop exits on success only.
  const download = exec("gh", ["run", "download", runId, "--name", "lookdev", "--dir", outDir], io.cwd);
  if (download.status !== 0) {
    return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: `gh run download failed: ${download.stderr || download.stdout}` });
  }
  const reports = emitLookReports(outDir);
  return finish({ ok: true, runner, outDir, pngs: collectPngs(outDir), ...reports });
}

export const lookCaptureCommand: AuraCliCommand = {
  name: "look capture",
  owner: "prd13",
  summary: "Capture look-dev screenshots on a remote runner (default), or explicitly via local Playwright or the legacy gh-actions workflow",
  usage: "aura3d look capture [--route /] [--shots opening,mid,action] [--viewports desktop,mobile] [--runner remote|local|gh-actions] [--remote-cmd <cmd>] [--from <reports-dir>] [--out dist/lookdev/<n>] [--json]",
  run: (argv, io) => runLookCapture(argv, io)
};
