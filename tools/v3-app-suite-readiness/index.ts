import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredApps = ["asset-lab", "material-lab", "scene-lab", "game-lab"] as const;
const requiredSourceFiles = [
  "apps/v3-common/src/WorkflowWorkbench.ts",
  ...requiredApps.flatMap((app) => [`apps/${app}/index.html`, `apps/${app}/src/main.ts`]),
  "tests/browser/v3-app-suite.spec.ts"
] as const;
const manifestPath = resolve("tests/reports/v3-app-suite/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as BrowserAppSuiteManifest : undefined;
const sourceFiles = requiredSourceFiles.map((path) => ({ path, exists: existsSync(resolve(path)) }));
const captureChecks = (manifest?.captures ?? []).map((capture) => ({
  ...capture,
  exists: existsSync(resolve(capture.path)),
  actualBytes: existsSync(resolve(capture.path)) ? statSync(resolve(capture.path)).size : 0
}));
const appsWithCaptures = new Set(captureChecks.map((capture) => capture.appId));
const workflowUsage = requiredApps.map((app) => {
  const sourcePath = resolve(`apps/${app}/src/main.ts`);
  const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";
  return {
    app,
    importsWorkflows: source.includes("@galileo3d/workflows"),
    usesWorkbench: source.includes("WorkflowWorkbenchApp")
  };
});

const report = {
  schema: "g3d-v3-app-suite-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: sourceFiles.every((file) => file.exists)
    && workflowUsage.every((usage) => usage.importsWorkflows && usage.usesWorkbench)
    && manifest?.pass === true
    && requiredApps.every((app) => appsWithCaptures.has(app))
    && captureChecks.length >= requiredApps.length * 2
    && captureChecks.every((capture) => capture.exists && capture.actualBytes > 10_000 && capture.drawCalls > 0 && capture.renderedItems > 0 && capture.lastError === null),
  sourceFiles,
  workflowUsage,
  browserManifestPath: "tests/reports/v3-app-suite/manifest.json",
  browserManifestExists: existsSync(manifestPath),
  captureChecks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v3-app-suite-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

interface BrowserAppSuiteManifest {
  readonly pass: boolean;
  readonly captures: readonly {
    readonly appId: string;
    readonly scenario: string;
    readonly path: string;
    readonly bytes: number;
    readonly drawCalls: number;
    readonly frameCount: number;
    readonly renderedItems: number;
    readonly lastError: string | null;
  }[];
}
