import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

const baseline = json("tests/reports/production-runtime-performance-baselines.json");
const browser = json("tests/reports/production-runtime-large-scene-performance.json");
const browserReport = obj(browser.report);
const baselineEntry = obj((Array.isArray(baseline.baselines) ? baseline.baselines[0] : undefined));
const screenshot = "tests/reports/production-runtime-performance/large-scene-performance.png";
const checks = [
  { id: "baseline-pass", pass: baseline.pass === true, detail: JSON.stringify(baselineEntry) },
  { id: "frame-timing", pass: Number(baselineEntry.frameMs ?? 0) >= 0 && Number(baselineEntry.medianMs ?? 0) >= 0 && Number(browserReport.frameMs ?? 0) >= 0, detail: `baseline=${String(baselineEntry.frameMs)} browser=${String(browserReport.frameMs)}` },
  { id: "draw-calls", pass: Number(baselineEntry.drawCalls ?? 0) > 0 && Number(browserReport.drawCalls ?? 0) > 0, detail: `baseline=${String(baselineEntry.drawCalls)} browser=${String(browserReport.drawCalls)}` },
  { id: "texture-memory", pass: Number(baselineEntry.textureBytes ?? 0) > 0 && Number(browserReport.textureBytes ?? 0) > 0, detail: `baseline=${String(baselineEntry.textureBytes)} browser=${String(browserReport.textureBytes)}` },
  { id: "instancing", pass: Number(baselineEntry.renderedInstances ?? 0) >= 4096 && Number(browserReport.renderedInstances ?? 0) >= 2048 && Number(browserReport.instancedBatches ?? 0) > 0, detail: `baseline=${String(baselineEntry.renderedInstances)} browser=${String(browserReport.renderedInstances)}` },
  { id: "culling", pass: Number(baselineEntry.culledInstances ?? 0) > 0 && Number(browserReport.culledInstances ?? 0) > 0, detail: `baseline=${String(baselineEntry.culledInstances)} browser=${String(browserReport.culledInstances)}` },
  { id: "asset-budget-warnings", pass: Array.isArray(baselineEntry.assetBudgetWarnings) && baselineEntry.assetBudgetWarnings.length > 0, detail: JSON.stringify(baselineEntry.assetBudgetWarnings ?? []) },
  { id: "real-webgl2-browser", pass: browser.pass === true && browserReport.status === "ready" && browserReport.realWebGL2 === true, detail: JSON.stringify(browserReport) },
  { id: "browser-pixels", pass: Number(browserReport.nonBlackPixels ?? 0) > 1000 && Number(browserReport.uniqueColorBuckets ?? 0) > 4, detail: `pixels=${String(browserReport.nonBlackPixels)} buckets=${String(browserReport.uniqueColorBuckets)}` },
  { id: "screenshot", pass: existsSync(resolve(screenshot)) && statSync(resolve(screenshot)).size > 10_000, detail: screenshot }
];
const report = {
  schema: "a3d-production-runtime-performance-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  baseline,
  browser,
  checks
};
const reportPath = resolve("tests/reports/production-runtime-performance-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function json(path: string): Obj {
  return existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Obj : {};
}

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}
