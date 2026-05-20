#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetArg = args.find((arg) => arg !== "--dry-run");
const targetRoot = resolve(targetArg || process.cwd());
const entries = [
    ".github",
    "docs/project/v4-parity-execution-prompt.md",
    "docs",
    "fixtures",
    "package.json",
    "tools/external-demo-export",
    "tools/external-demo-validation",
    "examples/portfolio",
    "packages/assets/src/AssetImportPreflight.ts",
    "packages/assets/src/OBJLoader.ts",
    "packages/assets/src/index.ts",
    "packages/assets/tests/assets.test.ts",
    "release-artifacts/external-demos",
    "release-artifacts/v4-external-evidence-operator-runbook.md",
    "release-artifacts/v4-parity-external-evidence-pr.md",
    "release-artifacts/codingrelated-completion-audit.md",
    "release-artifacts/v4-parity-external-evidence-workflows.patch",
    "release-artifacts/v4-current-handoff-supplement.patch",
    "tests/reports",
    "tests/unit/assets/asset-import-preflight.test.ts",
    "tests/browser/example-portfolio.spec.ts",
    "tests/browser/example-screenshot-audit-v4.spec.ts",
    "tests/unit/tools/v4-validation.test.ts",
    "tools/v4-examples",
    "tools/public-demo-deployment-artifacts",
    "tools/public-demo-deployment-smoke",
    "tools/v4-github-external-readiness",
    "tools/v4-local-port-status",
    "tools/v4-parity-status",
    "tools/v4-reporting",
    "tools/v4-claim-gates",
    "tools/v4-assets",
    "tools/v4-current-capability",
    "tools/v4-external-engine-baselines",
    "tools/v4-report-freshness",
    "tools/v4-pbr-reference-readiness",
    "tools/v4-shadow-map-readiness",
    "tools/v4-hdr-render-target-readiness",
    "tools/v4-production-readiness",
    "tools/v4-pbr-gltf-readiness",
    "tools/v4-ecosystem-readiness",
    "tools/v4-broad-parity-readiness",
    "tools/v4-completion-audit",
    "tools/v4-product-visual-parity",
    "tools/v4-pbr-visual-parity",
    "tools/v4-shadow-visual-parity",
    "tools/v4-hdr-visual-parity",
    "tools/v4-postprocess-suite",
    "tools/v4-unity-unreal-parity",
    "tools/v4-external-evidence-handoff",
    "tools/v4-external-evidence-readiness",
    "tools/v4-external-host-doctor",
    "tools/v4-external-host-runner",
    "tools/static-demo-server-smoke",
    "tools/package-provenance",
    "tools/compare-engines",
  ];
const restorePreflight = verifyPackageBeforeRestore();

if (!existsSync(targetRoot)) {
  throw new Error(`Target checkout does not exist: ${targetRoot}`);
}
if (!existsSync(resolve(targetRoot, "package.json"))) {
  throw new Error(`Target does not look like a Galileo3D checkout because package.json is missing: ${targetRoot}`);
}

const restored = [];
for (const entry of entries) {
  const source = resolve(packageRoot, entry);
  if (!existsSync(source)) continue;
  const target = resolve(targetRoot, entry);
  if (!dryRun) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, force: true });
  }
  restored.push({ entry, kind: statSync(source).isDirectory() ? "directory" : "file" });
}

console.log(JSON.stringify({
  ok: true,
  command: "RESTORE_INTO_CHECKOUT",
  dryRun,
  packageRoot,
  targetRoot,
  restorePreflight,
  restored,
  nextCommands: [
    "pnpm verify:v4-external-evidence-handoff",
    "pnpm doctor:v4-external-host",
    "pnpm run:v4-external-host-evidence",
    "pnpm run:v4-external-host-evidence:execute",
    "pnpm status:v4-local-port",
    "pnpm status:v4-parity",
    "pnpm preflight:v4-parity:after-external-evidence"
  ]
}, null, 2));

function verifyPackageBeforeRestore() {
  const verifier = resolve(packageRoot, "VERIFY_PACKAGE_INTEGRITY.mjs");
  if (!existsSync(verifier)) {
    console.log(JSON.stringify({
      ok: false,
      command: "RESTORE_INTO_CHECKOUT",
      packageRoot,
      reason: "Cannot restore because VERIFY_PACKAGE_INTEGRITY.mjs is missing from the handoff package."
    }, null, 2));
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [verifier], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  let parsed = null;
  try {
    parsed = result.stdout ? JSON.parse(result.stdout) : null;
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error) };
  }
  if (result.status !== 0 || !parsed || parsed.ok !== true) {
    console.log(JSON.stringify({
      ok: false,
      command: "RESTORE_INTO_CHECKOUT",
      packageRoot,
      verifierStatus: result.status,
      verifierStdout: result.stdout || "",
      verifierStderr: result.stderr || "",
      verifierResult: parsed,
      reason: "Cannot restore because the handoff package failed integrity verification."
    }, null, 2));
    process.exit(result.status ?? 1);
  }
  return {
    ok: true,
    command: "VERIFY_PACKAGE_INTEGRITY",
    checkedFiles: typeof parsed.checkedFiles === "number" ? parsed.checkedFiles : 0,
    verificationScope: parsed.verificationScope ?? null
  };
}
