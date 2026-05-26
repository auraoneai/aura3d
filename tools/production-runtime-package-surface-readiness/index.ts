import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  readonly exports?: Obj;
  readonly files?: readonly string[];
};
const requiredExports = [
  "./production-runtime",
  "./rendering",
  "./assets/browser",
  "./animation/browser",
  "./workflows/production-runtime"
];
const requiredDist = [
  "dist/engine/production-runtime/index.js",
  "dist/rendering/index.js",
  "dist/assets/browser-index.js",
  "dist/animation/browser-index.js",
  "dist/workflows/production-runtime/index.js",
  "dist/workflows/production-runtime/V6ExampleRuntime.js"
];
const workflowRuntime = existsSync(resolve("dist/workflows/production-runtime/V6ExampleRuntime.js"))
  ? readFileSync(resolve("dist/workflows/production-runtime/V6ExampleRuntime.js"), "utf8")
  : "";
const checks = [
  { id: "required-exports", pass: requiredExports.every((key) => packageJson.exports?.[key]), detail: requiredExports.join(", ") },
  { id: "required-dist", pass: requiredDist.every((file) => existsSync(resolve(file))), detail: requiredDist.join(", ") },
  { id: "production-runtime-template-files", pass: ["templates/production-product-viewer", "templates/production-product-configurator", "templates/production-asset-inspector", "templates/production-material-studio", "templates/production-architecture-viewer", "templates/production-webgpu-starter"].every((file) => packageJson.files?.includes(file)), detail: "root package files include V6 templates" },
  { id: "browser-safe-production-runtime-runtime", pass: workflowRuntime.includes("@aura3d/engine/assets/browser") && workflowRuntime.includes("@aura3d/engine/rendering") && !workflowRuntime.includes("@aura3d/assets\""), detail: "V6 runtime imports browser-safe package subpaths" },
  { id: "browser-safe-animation-dist", pass: read("dist/assets/GLTFLoader.js").includes("../animation/browser-index.js"), detail: "GLTFLoader uses browser-safe animation dist" }
];
const report = {
  schema: "a3d-production-runtime-package-surface-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};
const reportPath = resolve("tests/reports/production-runtime-package-surface-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}
