import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredApps = [
  "production-product-configurator",
  "automotive-configurator",
  "production-architecture-viewer",
  "production-asset-inspector",
  "production-material-studio",
  "character-viewer",
  "cinematic-postprocess",
  "large-scene-lab",
  "webgpu-lab",
  "threejs-parity-lab"
] as const;
const requiredAppFiles = ["index.html", "src/main.ts", "src/scene.ts", "src/ui.ts", "src/assets.ts", "README.md"] as const;
const reportPath = resolve("tests/reports/production-runtime-app-suite-readiness.json");
const appReports = requiredApps.map((appId) => {
  const path = resolve(`tests/reports/production-runtime-app-suite/${appId}.json`);
  const report = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as {
    screenshot?: string;
    runtime?: {
      status?: string;
      rendererBackend?: string;
      interactionCount?: number;
      runtime?: {
        assetIds?: readonly string[];
        hdrEnvironmentId?: string;
        drawCalls?: number;
        triangleCount?: number;
        materialCount?: number;
        textureCount?: number;
        textureMemoryEstimate?: number;
        lightCount?: number;
        shadowMapCount?: number;
        screenshotPath?: string;
      };
      proofSummary?: { pass?: boolean };
      proof?: { diagnostics?: { drawCalls?: number; lastError?: string | null }; pixels?: { nonBlackPixels?: number; uniqueColorBuckets?: number } };
      webgpu?: { realHardwareRequiredForParity?: boolean; doesNotBlockWebGL2Production?: boolean };
    };
  } : null;
  return { appId, path, report };
});
const appFileChecks = requiredApps.flatMap((appId) => requiredAppFiles.map((file) => ({
  id: `${appId}:${file}`,
  pass: existsSync(resolve(`apps/${appId}/${file}`)),
  detail: `apps/${appId}/${file}`
})));
const runtimeChecks = appReports.map(({ appId, path, report }) => {
  const metrics = report?.runtime?.runtime;
  const proof = report?.runtime?.proof;
  return {
    id: `${appId}:runtime`,
    pass: Boolean(report)
      && report?.runtime?.status === "ready"
      && report.runtime.rendererBackend === "webgl2"
      && (report.runtime.interactionCount ?? 0) > 0
      && (metrics?.assetIds?.length ?? 0) >= 1
      && Boolean(metrics?.hdrEnvironmentId)
      && (metrics?.drawCalls ?? 0) > 0
      && (metrics?.triangleCount ?? 0) > 0
      && (metrics?.materialCount ?? 0) > 0
      && (metrics?.textureCount ?? 0) >= 0
      && (metrics?.textureMemoryEstimate ?? -1) >= 0
      && (metrics?.lightCount ?? 0) > 0
      && (metrics?.shadowMapCount ?? -1) >= 0
      && report.runtime.proofSummary?.pass === true
      && (proof?.diagnostics?.drawCalls ?? 0) > 0
      && proof?.diagnostics?.lastError === null
      && (proof?.pixels?.nonBlackPixels ?? 0) > 1000
      && (proof?.pixels?.uniqueColorBuckets ?? 0) > 4,
    detail: path
  };
});
const screenshotChecks = appReports.map(({ appId, report }) => {
  const screenshot = report?.screenshot ? resolve(report.screenshot) : "";
  return {
    id: `${appId}:screenshot`,
    pass: Boolean(screenshot) && existsSync(screenshot),
    detail: report?.screenshot ?? "(missing)"
  };
});
const webgpuLab = appReports.find((entry) => entry.appId === "webgpu-lab")?.report?.runtime?.webgpu;
const checks = [
  ...appFileChecks,
  ...runtimeChecks,
  ...screenshotChecks,
  {
    id: "webgpu-lab-honest-report",
    pass: webgpuLab?.realHardwareRequiredForParity === true && webgpuLab.doesNotBlockWebGL2Production === true,
    detail: JSON.stringify(webgpuLab ?? null)
  }
];
const report = {
  schema: "g3d-production-runtime-app-suite-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  appCount: requiredApps.length,
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
