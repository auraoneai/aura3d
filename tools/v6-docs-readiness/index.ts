import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const docs = [
  "renderer-architecture.md",
  "webgl2-backend.md",
  "webgpu-backend.md",
  "gltf-pipeline.md",
  "pbr-materials.md",
  "hdr-ibl.md",
  "shadows.md",
  "postprocess.md",
  "animation.md",
  "asset-pipeline.md",
  "threejs-parity.md",
  "visual-quality-gates.md",
  "product-workflows.md",
  "api-reference.md",
  "getting-started.md",
  "templates.md",
  "examples.md",
  "known-gaps.md",
  "blocked-claims.md",
  "release-notes.md"
];
const requiredMarkers = [
  "real renderer",
  "WebGL2",
  "HDR",
  "glTF",
  "PBR",
  "WebGPU",
  "Three.js",
  "visual",
  "performance",
  "blocked"
];
const docPath = (doc: string) => resolve("docs/project", `v6-roadmap-${doc}`);
const docReports = docs.map((doc) => {
  const path = docPath(doc);
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  return {
    doc,
    exists: existsSync(path),
    bytes: content.length,
    markers: requiredMarkers.filter((marker) => content.toLowerCase().includes(marker.toLowerCase()))
  };
});
const allDocsContent = docReports.map((doc) => existsSync(docPath(doc.doc)) ? readFileSync(docPath(doc.doc), "utf8") : "").join("\n");
const claimRegistry = existsSync(resolve("tests/reports/v6-claim-registry.json"))
  ? JSON.parse(readFileSync(resolve("tests/reports/v6-claim-registry.json"), "utf8")) as { pass?: boolean; blockedClaims?: unknown[]; allowedClaims?: unknown[] }
  : {};
const checks = [
  { id: "docs-present", pass: docReports.every((doc) => doc.exists && doc.bytes > 120), detail: docReports.filter((doc) => !doc.exists || doc.bytes <= 120).map((doc) => doc.doc).join(", ") },
  { id: "marker-coverage", pass: requiredMarkers.every((marker) => allDocsContent.toLowerCase().includes(marker.toLowerCase())), detail: requiredMarkers.filter((marker) => !allDocsContent.toLowerCase().includes(marker.toLowerCase())).join(", ") },
  { id: "claim-registry", pass: claimRegistry.pass === true && Array.isArray(claimRegistry.allowedClaims) && Array.isArray(claimRegistry.blockedClaims), detail: "tests/reports/v6-claim-registry.json" },
  { id: "blocked-claims-visible", pass: allDocsContent.includes("Full Three.js API replacement") && allDocsContent.includes("Full WebGPU parity") && allDocsContent.includes("Unity replacement"), detail: "blocked claim names are present" },
  { id: "no-overclaim", pass: !/full Three\.js replacement is complete/i.test(allDocsContent) && !/full WebGPU parity is complete/i.test(allDocsContent), detail: "docs avoid completion language for blocked claims" },
  { id: "real-app-code", pass: allDocsContent.includes("runV6Example") && allDocsContent.includes("@galileo3d/engine/workflows/v6"), detail: "getting-started and API docs include real app code" },
  { id: "profiling-workflow", pass: allDocsContent.includes("tests/reports/v6-performance-readiness.json"), detail: "performance profiling evidence linked" }
];
const report = {
  schema: "g3d-v6-docs-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  docs: docReports,
  checks
};
const reportPath = resolve("tests/reports/v6-docs-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
