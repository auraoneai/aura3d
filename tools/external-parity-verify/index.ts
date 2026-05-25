import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseReport, writeJson } from "../external-parity-reporting/index.js";

const root = process.cwd();
const commands = [
  "verify:external-parity-code",
  "verify:external-parity-rendering",
  "verify:external-parity-assets",
  "verify:v4-khronos-visuals",
  "verify:external-parity-editor",
  "verify:external-parity-runtime",
  "verify:external-parity-examples",
  "verify:external-parity-benchmarks",
  "verify:external-parity-visual-quality",
  "audit:external-parity-product-visual-parity",
  "audit:external-parity-pbr-visual-parity",
  "audit:external-parity-shadow-visual-parity",
  "audit:external-parity-hdr-visual-parity",
  "audit:external-parity-hdr-ibl-readiness",
  "verify:external-parity-external-engine-baselines",
  "audit:external-parity-pbr-reference-readiness",
  "audit:external-parity-gltf-loader-visual-parity",
  "audit:external-parity-postprocess-suite",
  "audit:external-parity-shadow-map-readiness",
  "audit:external-parity-hdr-render-target-readiness",
  "audit:external-parity-pbr-gltf-readiness",
  "audit:external-parity-unity-unreal-parity",
  "verify:external-parity-code",
  "audit:external-parity-ecosystem-readiness",
  "audit:external-parity-production-readiness",
  "audit:external-parity-external-evidence-readiness",
  "audit:v4-broad-parity",
  "audit:v4-completion",
  "verify:external-parity-report-freshness",
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
      runIdPrefix: "external-parity-verify",
      sourceFiles: ["package.json", "tools/external-parity-verify/index.ts"],
      violations,
    }),
    results,
  };
  writeJson(root, "tests/reports/external-parity-verify.json", report);
  console.log(JSON.stringify({ ok: report.ok, failedCommands: violations }, null, 2));
  return report.ok ? 0 : 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = runV4Verification();
}
