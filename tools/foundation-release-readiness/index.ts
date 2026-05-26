import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredScripts = [
  "foundation:truth",
  "foundation:progress",
  "foundation:renderer",
  "foundation:assets",
  "foundation:workflows",
  "foundation:apps",
  "foundation:examples",
  "foundation:package",
  "foundation:compare-threejs",
  "foundation:docs",
  "foundation:release"
] as const;
const requiredReports = [
  "tests/reports/foundation-truth.json",
  "tests/reports/foundation-progress.json",
  "tests/reports/foundation-renderer-readiness.json",
  "tests/reports/foundation-assets-readiness.json",
  "tests/reports/foundation-workflows-readiness.json",
  "tests/reports/foundation-app-suite-readiness.json",
  "tests/reports/foundation-examples-readiness.json",
  "tests/reports/foundation-package-smoke.json",
  "tests/reports/foundation-external-consumer.json",
  "tests/reports/foundation-threejs-comparison.json",
  "tests/reports/foundation-docs-readiness.json"
] as const;
const requiredScreenshots = [
  "tests/reports/foundation-renderer-foundation/foundation.png",
  "tests/reports/foundation-assets/product-camera.png",
  "tests/reports/foundation-app-suite/asset-lab-default.png",
  "tests/reports/foundation-app-suite/material-lab-default.png",
  "tests/reports/foundation-app-suite/scene-lab-default.png",
  "tests/reports/foundation-app-suite/game-lab-default.png",
  "tests/reports/foundation-examples/foundation-asset-viewer.png",
  "tests/reports/foundation-examples/foundation-product-configurator.png",
  "tests/reports/foundation-external-consumer/external-consumer.png",
  "tests/reports/foundation-threejs-comparison/product-a3d.png",
  "tests/reports/foundation-threejs-comparison/product-threejs.png",
  "tests/reports/foundation-threejs-comparison/product-diff.png",
  "tests/reports/foundation-threejs-comparison/asset-a3d.png",
  "tests/reports/foundation-threejs-comparison/interactive-a3d.png"
] as const;

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { readonly scripts?: Record<string, string> };
const scriptChecks = requiredScripts.map((script) => ({ script, exists: typeof packageJson.scripts?.[script] === "string" }));
const reportChecks = requiredReports.map((path) => {
  const report = existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Record<string, unknown> : undefined;
  return {
    path,
    exists: Boolean(report),
    pass: reportPasses(report)
  };
});
const screenshotChecks = requiredScreenshots.map((path) => ({
  path,
  exists: existsSync(resolve(path)),
  bytes: existsSync(resolve(path)) ? statSync(resolve(path)).size : 0
}));
const comparison = readJson("tests/reports/foundation-threejs-comparison.json") as {
  readonly ergonomicWins?: readonly string[];
  readonly runtimeDiagnostics?: readonly { readonly scene: string; readonly a3dDrawCalls: number; readonly threejsDrawCalls: number }[];
  readonly gaps?: readonly string[];
} | undefined;
const externalConsumer = readJson("tests/reports/foundation-external-consumer.json") as { readonly pass?: boolean; readonly state?: { readonly imports?: readonly string[] } } | undefined;
const docs = readJson("tests/reports/foundation-docs-readiness.json") as { readonly pass?: boolean } | undefined;
const releaseGate1 = {
  name: "Three.js competitor for supported workflows",
  pass: reportChecks.every((check) => check.pass)
    && screenshotChecks.every((check) => check.exists && check.bytes > 10_000)
    && docs?.pass === true
};
const releaseGate2 = {
  name: "Limited replacement for supported workflows",
  pass: releaseGate1.pass
    && (comparison?.ergonomicWins?.length ?? 0) >= 4
    && externalConsumer?.pass === true
    && (comparison?.runtimeDiagnostics ?? []).every((diagnostic) => diagnostic.a3dDrawCalls > 0 && diagnostic.threejsDrawCalls > 0)
    && (comparison?.gaps?.length ?? 0) > 0
};
const report = {
  schema: "a3d-foundation-release-readiness",
  generatedAt: new Date().toISOString(),
  pass: scriptChecks.every((check) => check.exists)
    && reportChecks.every((check) => check.pass)
    && screenshotChecks.every((check) => check.exists && check.bytes > 10_000)
    && releaseGate1.pass
    && releaseGate2.pass,
  allowedClaim: "A3D is a Three.js competitor for supported web product, asset-viewer, material, scene, and lightweight interactive workflows.",
  limitedReplacementClaim: "A3D can replace Three.js for the supported workflows listed in docs/project/compatibility.md.",
  blockedClaimsRemainBlocked: [
    "Unity replacement",
    "Unreal replacement",
    "Full game engine replacement",
    "Full Three.js API replacement",
    "Broad performance superiority",
    "Full glTF parity",
    "Full WebGPU parity"
  ],
  scriptChecks,
  reportChecks,
  screenshotChecks,
  releaseGate1,
  releaseGate2,
  comparisonSummary: {
    ergonomicWins: comparison?.ergonomicWins ?? [],
    gaps: comparison?.gaps ?? []
  },
  externalConsumerImports: externalConsumer?.state?.imports ?? []
};

const output = resolve("tests/reports/foundation-release-readiness.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function readJson(path: string): unknown | undefined {
  return existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) : undefined;
}

function reportPasses(report: Record<string, unknown> | undefined): boolean {
  if (!report) return false;
  if (typeof report.pass === "boolean") return report.pass;
  if (typeof report.ok === "boolean") return report.ok;
  return false;
}
