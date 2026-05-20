import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseReport, writeJson } from "../v4-reporting/index.js";

const root = process.cwd();
const commands = [
  "verify:v4-code",
  "verify:v4-rendering",
  "verify:v4-assets",
  "verify:v4-khronos-visuals",
  "verify:v4-editor",
  "verify:v4-runtime",
  "verify:v4-examples",
  "verify:v4-benchmarks",
  "verify:v4-visual-quality",
  "audit:v4-product-visual-parity",
  "audit:v4-pbr-visual-parity",
  "audit:v4-shadow-visual-parity",
  "audit:v4-hdr-visual-parity",
  "audit:v4-hdr-ibl-readiness",
  "verify:v4-external-engine-baselines",
  "audit:v4-pbr-reference-readiness",
  "audit:v4-gltf-loader-visual-parity",
  "audit:v4-postprocess-suite",
  "audit:v4-shadow-map-readiness",
  "audit:v4-hdr-render-target-readiness",
  "audit:v4-pbr-gltf-readiness",
  "audit:v4-unity-unreal-parity",
  "verify:v4-code",
  "audit:v4-ecosystem-readiness",
  "audit:v4-production-readiness",
  "audit:v4-external-evidence-readiness",
  "audit:v4-broad-parity",
  "audit:v4-completion",
  "verify:v4-report-freshness",
] as const;

export function runV4Verification(): number {
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
      command: "pnpm verify:v4",
      runIdPrefix: "v4-verify",
      sourceFiles: ["package.json", "tools/v4-verify/index.ts"],
      violations,
    }),
    results,
  };
  writeJson(root, "tests/reports/v4-verify.json", report);
  console.log(JSON.stringify({ ok: report.ok, failedCommands: violations }, null, 2));
  return report.ok ? 0 : 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runV4Verification();
}
