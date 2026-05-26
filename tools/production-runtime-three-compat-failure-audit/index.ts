import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "docs/project/production-runtime-roadmap-three-compat-visual-failure-audit.md",
  "docs/project/production-runtime-roadmap-no-fake-visual-proof.md",
  "docs/project/production-runtime-roadmap-production-renderer-plan.md"
] as const;
const combined = requiredFiles
  .filter((path) => existsSync(resolve(path)))
  .map((path) => readFileSync(resolve(path), "utf8"))
  .join("\n");
const requiredPatterns = [
  { id: "canvas-painted-proof", pattern: /canvas[- ]painted|Canvas 2D/i },
  { id: "non-renderer-screenshots", pattern: /non-renderer screenshot|real renderer output/i },
  { id: "mock-renderer-blocked", pattern: /mock renderer/i },
  { id: "hardcoded-visual-scores-blocked", pattern: /hardcoded visual/i },
  { id: "page-set-content-blocked", pattern: /page\.setContent/i },
  { id: "real-webgl-webgpu-required", pattern: /WebGL2\/WebGPU|WebGL2 or WebGPU/i },
  { id: "real-assets-required", pattern: /real glTF\/GLB|real imported asset/i },
  { id: "three-compat-specific-failure-named", pattern: /three-compat-threejs-visual-parity\.spec\.ts|three-compat-gallery/i }
];
const checks = [
  ...requiredFiles.map((path) => ({
    id: `file:${path}`,
    pass: existsSync(resolve(path)),
    detail: `${path} must exist.`
  })),
  ...requiredPatterns.map(({ id, pattern }) => ({
    id,
    pass: pattern.test(combined),
    detail: `${id} must be explicitly documented.`
  }))
];
const report = {
  schema: "a3d-production-runtime-three-compat-visual-failure-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};
writeJson("tests/reports/production-runtime-three-compat-visual-failure-audit.json", report);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log("V6 V5 visual failure audit passed.");

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
