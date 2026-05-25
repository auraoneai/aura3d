import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

const build = json("tests/reports/production-runtime-external-vite-build.json");
const render = json("tests/reports/production-runtime-external-consumer-render.json");
const runtime = obj(render.runtime);
const runtimeMetrics = obj(runtime.runtime);
const proof = obj(runtime.proof);
const pixels = obj(proof.pixels);
const screenshot = String(render.screenshot ?? "tests/reports/production-runtime-external-consumer/external-consumer-render.png");
const checks = [
  { id: "external-vite-build", pass: build.pass === true && existsSync(resolve(String(build.previewDir ?? ""))), detail: String(build.previewDir ?? "") },
  { id: "browser-render", pass: render.pass === true && runtime.status === "ready" && runtime.rendererBackend === "webgl2", detail: JSON.stringify(runtime) },
  { id: "real-production-runtime-scene", pass: Array.isArray(runtimeMetrics.assetIds) && runtimeMetrics.assetIds.includes("damaged-helmet") && runtimeMetrics.hdrEnvironmentId === "studio-small-08", detail: JSON.stringify(runtimeMetrics) },
  { id: "draw-texture-proof", pass: Number(runtimeMetrics.drawCalls ?? 0) > 0 && Number(runtimeMetrics.textureMemoryEstimate ?? 0) > 0, detail: JSON.stringify(runtimeMetrics) },
  { id: "nonblank-screenshot", pass: existsSync(resolve(screenshot)) && statSync(resolve(screenshot)).size > 10_000 && Number(pixels.nonBlackPixels ?? 0) > 1000 && Number(pixels.uniqueColorBuckets ?? 0) > 4, detail: screenshot }
];
const report = {
  schema: "g3d-production-runtime-external-consumer/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  build,
  render,
  checks
};
const reportPath = resolve("tests/reports/production-runtime-external-consumer.json");
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
