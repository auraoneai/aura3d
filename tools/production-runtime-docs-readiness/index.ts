import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const docs = [
  "current-state.md",
  "threejs-parity-status.md",
  "threejs-parity-parity-matrix.md",
  "threejs-parity-claim-boundary.md",
  "known-limits.md",
  "claim-guidelines.md",
  "compatibility.md",
  "migration.md",
  "getting-started.md",
  "verification-evidence.md",
  "release-process.md",
  "release-checklist.md"
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
const docPath = (doc: string) => resolve("docs/project", doc);
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
const claimRegistry = existsSync(resolve("tests/reports/production-runtime-claim-registry.json"))
  ? JSON.parse(readFileSync(resolve("tests/reports/production-runtime-claim-registry.json"), "utf8")) as { pass?: boolean; blockedClaims?: unknown[]; allowedClaims?: unknown[] }
  : {};
const checks = [
  { id: "docs-present", pass: docReports.every((doc) => doc.exists && doc.bytes > 120), detail: docReports.filter((doc) => !doc.exists || doc.bytes <= 120).map((doc) => doc.doc).join(", ") },
  { id: "marker-coverage", pass: requiredMarkers.every((marker) => allDocsContent.toLowerCase().includes(marker.toLowerCase())), detail: requiredMarkers.filter((marker) => !allDocsContent.toLowerCase().includes(marker.toLowerCase())).join(", ") },
  { id: "claim-registry", pass: claimRegistry.pass === true && Array.isArray(claimRegistry.allowedClaims) && Array.isArray(claimRegistry.blockedClaims), detail: "tests/reports/production-runtime-claim-registry.json" },
  { id: "blocked-claims-visible", pass: allDocsContent.includes("Full Three.js API replacement") && allDocsContent.includes("Full WebGPU parity") && allDocsContent.includes("Unity replacement"), detail: "blocked claim names are present" },
  { id: "no-overclaim", pass: !/full Three\.js replacement is complete/i.test(allDocsContent) && !/full WebGPU parity is complete/i.test(allDocsContent), detail: "docs avoid completion language for blocked claims" },
  { id: "real-app-code", pass: allDocsContent.includes("runProductionExample") && allDocsContent.includes("@aura3d/engine/workflows/production"), detail: "getting-started and API docs include real app code" },
  { id: "profiling-workflow", pass: allDocsContent.includes("tests/reports/production-runtime-performance-readiness.json"), detail: "performance profiling evidence linked" }
];
const report = {
  schema: "a3d-production-runtime-docs-readiness",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  docs: docReports,
  checks
};
const reportPath = resolve("tests/reports/production-runtime-docs-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
