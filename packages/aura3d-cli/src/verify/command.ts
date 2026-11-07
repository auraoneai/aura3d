// `aura3d verify [projectDir] [--json] [--out file] [--skip steps] [--only steps] [--explain CODE] [--list-codes] ...`
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { VERIFY_CODE_TABLE, explainCode, formatExplanation } from "./codes.js";
import { VERIFY_STEP_ORDER, runVerify, type VerifyReport, type VerifyStep } from "./run.js";
import type { VerifyBrowserDriver } from "./cdp.js";

export const VERIFY_USAGE =
  "aura3d verify [projectDir] [--json] [--out report.json] [--skip typecheck,build,...] [--only a,b] [--route /path] [--dist dist] [--chrome <path>] [--software-gl] [--browser-lock <dir>] [--width N --height N --settle-ms N --motion-gap-ms N --timeout-ms N --ready-timeout-ms N]\n" +
  "aura3d verify --explain <CODE>      explain one finding code (cause and fix)\n" +
  "aura3d verify --list-codes          print the whole code table as JSON";

const valueOf = (argv: readonly string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value !== undefined && !value.startsWith("--") ? value : undefined;
};
const stepList = (value: string | undefined): VerifyStep[] =>
  (value ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    if (!(VERIFY_STEP_ORDER as readonly string[]).includes(s)) throw new Error(`Unknown verify step "${s}". Steps: ${VERIFY_STEP_ORDER.join(", ")}.`);
    return s as VerifyStep;
  });
const numberOf = (argv: readonly string[], name: string): number | undefined => {
  const raw = valueOf(argv, name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} needs a non-negative number.`);
  return n;
};

export function formatReport(report: VerifyReport): string {
  const lines = [`aura3d verify: ${report.ok ? "PASS" : "FAIL"} (${report.counts.error} error, ${report.counts.warning} warning) in ${(report.durationMs / 1000).toFixed(1)}s`];
  for (const step of report.steps) lines.push(`  ${step.status.padEnd(7)} ${step.id}${step.detail ? `  (${step.detail})` : ""}`);
  for (const f of report.findings) {
    const where = f.location ? ` ${f.location.file}:${f.location.line}:${f.location.column}` : "";
    lines.push(`${f.severity.toUpperCase().padEnd(7)} ${f.code}${where}`, `        ${f.message}`, `        fix: ${f.fix}`);
  }
  return lines.join("\n");
}

export async function verifyCommand(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }, injected?: { driver?: VerifyBrowserDriver }): Promise<number> {
  if (argv.includes("--list-codes")) { io.stdout(JSON.stringify(VERIFY_CODE_TABLE, null, 2)); return 0; }
  if (argv.includes("--explain")) {
    const code = valueOf(argv, "--explain");
    if (!code) { io.stderr(`Usage: ${VERIFY_USAGE}`); return 2; }
    const entry = explainCode(code);
    if (!entry) { io.stderr(`Unknown code "${code}". Run \`aura3d verify --list-codes\` for the table.`); return 2; }
    io.stdout(argv.includes("--json") ? JSON.stringify(entry, null, 2) : formatExplanation(entry));
    return 0;
  }
  let skip: VerifyStep[];
  try {
    const only = stepList(valueOf(argv, "--only"));
    skip = only.length ? VERIFY_STEP_ORDER.filter((s) => !only.includes(s)) : stepList(valueOf(argv, "--skip"));
  } catch (error) { io.stderr(String((error as Error).message)); return 2; }
  const valueFlags = new Set(["--out", "--skip", "--only", "--route", "--dist", "--chrome", "--browser-lock", "--width", "--height", "--settle-ms", "--motion-gap-ms", "--timeout-ms", "--ready-timeout-ms"]);
  const positional = argv.find((arg, i) => !arg.startsWith("--") && !valueFlags.has(argv[i - 1] ?? ""));
  let report: VerifyReport;
  try {
    report = await runVerify({
      projectDir: resolve(io.cwd, positional ?? "."),
      skip,
      ...(valueOf(argv, "--dist") ? { distDir: valueOf(argv, "--dist")! } : {}),
      ...(valueOf(argv, "--route") ? { route: valueOf(argv, "--route")! } : {}),
      ...(valueOf(argv, "--chrome") ? { chromePath: valueOf(argv, "--chrome")! } : {}),
      ...(valueOf(argv, "--browser-lock") ? { browserLock: valueOf(argv, "--browser-lock")! } : {}),
      ...(argv.includes("--software-gl") ? { softwareGl: true } : {}),
      ...(numberOf(argv, "--width") !== undefined ? { width: numberOf(argv, "--width")! } : {}),
      ...(numberOf(argv, "--height") !== undefined ? { height: numberOf(argv, "--height")! } : {}),
      ...(numberOf(argv, "--settle-ms") !== undefined ? { settleMs: numberOf(argv, "--settle-ms")! } : {}),
      ...(numberOf(argv, "--motion-gap-ms") !== undefined ? { motionGapMs: numberOf(argv, "--motion-gap-ms")! } : {}),
      ...(numberOf(argv, "--ready-timeout-ms") !== undefined ? { readyTimeoutMs: numberOf(argv, "--ready-timeout-ms")! } : {}),
      ...(numberOf(argv, "--timeout-ms") !== undefined ? { timeoutMs: numberOf(argv, "--timeout-ms")! } : {}),
      ...(injected?.driver ? { driver: injected.driver } : {})
    });
  } catch (error) { io.stderr(String((error as Error).message ?? error)); return 2; }
  const out = valueOf(argv, "--out");
  if (out) { const file = resolve(io.cwd, out); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`); }
  io.stdout(argv.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.ok ? 0 : 1;
}
