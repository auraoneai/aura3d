import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseReport, writeJson } from "../v3-reporting/index.js";

const root = process.cwd();
const commands = [
  "verify:v3-examples",
  "verify:v3-rendering",
  "verify:v3-assets",
  "verify:v3-editor",
  "verify:v3-runtime",
  "verify:v3-benchmarks",
  "verify:v3-flakes",
  "verify:v3-code",
  "verify:v3-report-freshness",
] as const;

export function runV3Verification(): number {
  const results = commands.map((script) => {
    const result = spawnSync("pnpm", ["--silent", script], { stdio: "inherit", env: process.env });
    return {
      script,
      exitCode: result.status ?? 1,
    };
  });
  const violations = results.filter((result) => result.exitCode !== 0).map((result) => `${result.script} exited ${result.exitCode}`);
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:v3",
      runIdPrefix: "v3-verify",
      sourceFiles: ["package.json", "tools/v3-verify/index.ts"],
      violations,
    }),
    results,
  };
  writeJson(root, "tests/reports/v3-verify.json", report);
  console.log(JSON.stringify({ ok: report.ok, failedCommands: violations }, null, 2));
  return report.ok ? 0 : 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runV3Verification();
}
