import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  readonly exports?: Obj;
  readonly files?: readonly string[];
};
const requiredExports = [
  "./v6",
  "./rendering",
  "./assets/browser",
  "./animation/browser",
  "./workflows/v6"
];
const requiredDist = [
  "dist/engine/v6/index.js",
  "dist/rendering/index.js",
  "dist/assets/browser-index.js",
  "dist/animation/browser-index.js",
  "dist/workflows/v6/index.js",
  "dist/workflows/v6/V6ExampleRuntime.js"
];
const workflowRuntime = existsSync(resolve("dist/workflows/v6/V6ExampleRuntime.js"))
  ? readFileSync(resolve("dist/workflows/v6/V6ExampleRuntime.js"), "utf8")
  : "";
const checks = [
  { id: "required-exports", pass: requiredExports.every((key) => packageJson.exports?.[key]), detail: requiredExports.join(", ") },
  { id: "required-dist", pass: requiredDist.every((file) => existsSync(resolve(file))), detail: requiredDist.join(", ") },
  { id: "v6-template-files", pass: ["templates/v6-product-viewer", "templates/v6-product-configurator", "templates/v6-asset-inspector", "templates/v6-material-studio", "templates/v6-architecture-viewer", "templates/v6-webgpu-starter"].every((file) => packageJson.files?.includes(file)), detail: "root package files include V6 templates" },
  { id: "browser-safe-v6-runtime", pass: workflowRuntime.includes("@galileo3d/engine/assets/browser") && workflowRuntime.includes("@galileo3d/engine/rendering") && !workflowRuntime.includes("@galileo3d/assets\""), detail: "V6 runtime imports browser-safe package subpaths" },
  { id: "browser-safe-animation-dist", pass: read("dist/assets/GLTFLoader.js").includes("../animation/browser-index.js"), detail: "GLTFLoader uses browser-safe animation dist" }
];
const report = {
  schema: "g3d-v6-package-surface-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};
const reportPath = resolve("tests/reports/v6-package-surface-readiness.json");
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
