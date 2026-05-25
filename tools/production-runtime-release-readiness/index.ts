import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

const requiredReports = [
  "tests/reports/production-runtime-truth.json",
  "tests/reports/production-runtime-progress.json",
  "tests/reports/production-runtime-three-compat-visual-failure-audit.json",
  "tests/reports/production-runtime-asset-readiness.json",
  "tests/reports/production-runtime-asset-audit.json",
  "tests/reports/production-runtime-environment-readiness.json",
  "tests/reports/production-runtime-webgl2-readiness.json",
  "tests/reports/production-runtime-hd-flagship-readiness.json",
  "tests/reports/production-runtime-hd-product-hero-readiness.json",
  "tests/reports/production-runtime-hd-materials-readiness.json",
  "tests/reports/production-runtime-pbr-hdr-readiness.json",
  "tests/reports/production-runtime-pbr-readiness.json",
  "tests/reports/production-runtime-gltf-render-readiness.json",
  "tests/reports/production-runtime-gltf-readiness.json",
  "tests/reports/production-runtime-effects-readiness.json",
  "tests/reports/production-runtime-lighting-postprocess-readiness.json",
  "tests/reports/production-runtime-webgpu-readiness.json",
  "tests/reports/production-runtime-animation-controls-readiness.json",
  "tests/reports/production-runtime-app-suite-readiness.json",
  "tests/reports/production-runtime-gallery-readiness.json",
  "tests/reports/production-runtime-gallery/manifest.json",
  "tests/reports/production-runtime-visual-quality.json",
  "tests/reports/production-runtime-real-renderer-proof.json",
  "tests/reports/production-runtime-human-visual-review.json",
  "tests/reports/production-runtime-threejs-parity-readiness.json",
  "tests/reports/production-runtime-threejs-visual-parity.json",
  "tests/reports/production-runtime-threejs-runtime-parity.json",
  "tests/reports/production-runtime-workflows-readiness.json",
  "tests/reports/production-runtime-workflow-readiness.json",
  "tests/reports/production-runtime-examples-readiness.json",
  "tests/reports/production-runtime-template-readiness.json",
  "tests/reports/production-runtime-performance-readiness.json",
  "tests/reports/production-runtime-package-surface-readiness.json",
  "tests/reports/production-runtime-package-smoke.json",
  "tests/reports/production-runtime-external-consumer.json",
  "tests/reports/production-runtime-docs-readiness.json",
  "tests/reports/production-runtime-claim-registry.json",
  "tests/reports/production-runtime-product-decision-record.json",
  "tests/reports/production-runtime-production-renderer-readiness.json",
  "tests/reports/production-runtime-literal-completion.json",
  "tests/reports/production-runtime-completion-audit.json"
];
const reports = requiredReports.map((path) => ({ path, exists: existsSync(resolve(path)), report: json(path) }));
const gallery = json("tests/reports/production-runtime-gallery/manifest.json");
const galleryEntries = Array.isArray(gallery.entries) ? gallery.entries.map(obj) : [];
const knownGaps = read("docs/project/production-runtime-roadmap-known-gaps.md");
const blocked = read("docs/project/production-runtime-roadmap-blocked-claims.md");
const checks = [
  { id: "reports-exist", pass: reports.every((item) => item.exists), detail: reports.filter((item) => !item.exists).map((item) => item.path).join(", ") },
  { id: "reports-pass", pass: reports.every((item) => item.path.endsWith("/manifest.json") || item.report.pass === true), detail: reports.filter((item) => !item.path.endsWith("/manifest.json") && item.report.pass !== true).map((item) => item.path).join(", ") },
  { id: "no-mock-or-canvas-gallery", pass: galleryEntries.every((entry) => entry.rendererBackend === "webgl2" && entry.canvas2dProof !== true && entry.mockDevice !== true), detail: "gallery entries report WebGL2 proof" },
  { id: "gallery-assets-hdr-textures-draws", pass: galleryEntries.every((entry) => Array.isArray(entry.realAssetIds) && entry.realAssetIds.length > 0 && String(entry.realHdrEnvironmentId ?? "").length > 0 && Number(entry.drawCalls ?? 0) > 0 && (Number(entry.textureCount ?? 0) > 0 || Number(entry.textureMemory ?? 0) > 0)), detail: "gallery entries include assets, HDR, textures, draw calls" },
  { id: "hd-flagship", pass: json("tests/reports/production-runtime-hd-flagship-readiness.json").pass === true, detail: "1920x1080 composed real-asset PBR/HDR flagship proof passes" },
  { id: "hd-product-hero", pass: json("tests/reports/production-runtime-hd-product-hero-readiness.json").pass === true, detail: "2560x1440 close product-hero PBR/HDR proof passes" },
  { id: "hd-materials", pass: json("tests/reports/production-runtime-hd-materials-readiness.json").pass === true, detail: "1920x1080 PBR material-extension HDR proof passes" },
  { id: "webgpu-boundary", pass: json("tests/reports/production-runtime-webgpu-readiness.json").pass === true && blocked.includes("Full WebGPU parity"), detail: "WebGPU proof exists and full parity remains blocked" },
  { id: "external-render", pass: json("tests/reports/production-runtime-external-consumer.json").pass === true, detail: "external consumer render report passes" },
  { id: "product-decision", pass: json("tests/reports/production-runtime-product-decision-record.json").pass === true, detail: "product decision record answers V6 boundary, public screenshots, blocked claims, and roadmap" },
  { id: "known-gaps-visible", pass: knownGaps.includes("incomplete") && blocked.includes("Full Three.js API replacement"), detail: "known gaps and blocked claims docs are visible" }
];
const report = {
  schema: "g3d-production-runtime-release-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checkedReports: reports.map(({ path, exists, report }) => ({ path, exists, pass: path.endsWith("/manifest.json") ? exists : report.pass === true })),
  checks
};
mkdirSync(dirname(resolve("tests/reports/production-runtime-release-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/production-runtime-release-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
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

function read(path: string): string {
  return existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
}
