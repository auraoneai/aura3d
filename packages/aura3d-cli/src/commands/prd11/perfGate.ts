/**
 * C-39 `aura3d perf gate --report <file>` (PRD-11 §16.2, 11-CODE).
 *
 * Thin wrapper over `tools/perf-gate/index.mjs`, which stays the single
 * implementation of the budget evaluation (the lane CI job calls it directly).
 * The command locates the gate script (explicit `--gate <path>`, else the
 * nearest `tools/perf-gate/index.mjs` walking up from cwd), runs it with the
 * current Node binary, forwards its output and returns its exit code:
 * 0 = every gating row passes, 1 = a gating row failed or is missing,
 * 2 = usage / gate-not-found.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { AuraCliCommand } from "../../contracts/commands.js";

export const PERF_GATE_SCRIPT = join("tools", "perf-gate", "index.mjs");

export const PERF_GATE_USAGE =
  "aura3d perf gate --report <report.json> [--budgets <budgets.json>] [--out <perf-gate.json>] [--gate <tools/perf-gate/index.mjs>]";

/** Walks up from `cwd` to find `tools/perf-gate/index.mjs`; undefined when absent. */
export function findPerfGateScript(cwd: string): string | undefined {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, PERF_GATE_SCRIPT);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface PerfGateArgs {
  readonly report: string;
  readonly budgets?: string;
  readonly out?: string;
  readonly gate?: string;
}

/** Parses `--report/--budgets/--out/--gate`; throws `PERF_GATE_USAGE:<reason>` on bad argv. */
export function parsePerfGateArgs(argv: readonly string[]): PerfGateArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const match = /^--(report|budgets|out|gate)(?:=(.*))?$/.exec(token);
    if (!match) throw new Error(`PERF_GATE_USAGE:unknown argument ${token}`);
    const value = match[2] ?? argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`PERF_GATE_USAGE:--${match[1]} needs a value`);
    values[match[1]] = value;
  }
  if (!values.report) throw new Error("PERF_GATE_USAGE:--report <report.json> is required");
  return {
    report: values.report,
    ...(values.budgets ? { budgets: values.budgets } : {}),
    ...(values.out ? { out: values.out } : {}),
    ...(values.gate ? { gate: values.gate } : {})
  };
}

const abs = (cwd: string, path: string): string => (isAbsolute(path) ? path : resolve(cwd, path));

export const perfGateCommand: AuraCliCommand = {
  name: "perf gate",
  owner: "prd11",
  summary: "Evaluate a PRD-11 capture report against tools/perf-gate budgets (writes perf-gate.json).",
  usage: PERF_GATE_USAGE,
  async run(argv, io) {
    let args: PerfGateArgs;
    try {
      args = parsePerfGateArgs(argv);
    } catch (error) {
      io.stderr(`[perf gate] ${(error as Error).message}`);
      io.stderr(`usage: ${PERF_GATE_USAGE}`);
      return 2;
    }
    const gate = args.gate ? abs(io.cwd, args.gate) : findPerfGateScript(io.cwd);
    if (!gate || !existsSync(gate)) {
      io.stderr(`[perf gate] PERF_GATE_NOT_FOUND: ${args.gate ?? PERF_GATE_SCRIPT} (run from the Aura3D repo or pass --gate)`);
      return 2;
    }
    const report = abs(io.cwd, args.report);
    if (!existsSync(report)) {
      io.stderr(`[perf gate] PERF_GATE_REPORT_MISSING: ${report}`);
      return 2;
    }
    const forwarded = ["--report", report];
    if (args.budgets) forwarded.push("--budgets", abs(io.cwd, args.budgets));
    if (args.out) forwarded.push("--out", abs(io.cwd, args.out));
    const child = spawnSync(process.execPath, [gate, ...forwarded], { cwd: io.cwd, encoding: "utf8" });
    if (child.error) {
      io.stderr(`[perf gate] failed to run ${gate}: ${child.error.message}`);
      return 2;
    }
    for (const line of (child.stdout ?? "").split("\n")) if (line) io.stdout(line);
    for (const line of (child.stderr ?? "").split("\n")) if (line) io.stderr(line);
    // A signal-killed gate (status null) is a failure, never a pass.
    return child.status ?? 1;
  }
};
