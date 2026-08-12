import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "docs/project/competitive-positioning.md",
  "docs/project/getting-started.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/parity/threejs/parity-matrix.md",
  "docs/project/migration.md",
  "MIGRATION-2.0.md",
  "docs/project/threejs-superiority-status.md",
  "docs/project/compatibility.md",
  "docs/project/status/current-state.md",
  "docs/project/status/known-limits.md",
  "docs/project/release-process.md",
  "docs/api/app-api.md",
  "docs/api/public-api.md",
  "README.md",
  "tools/external-parity-docs-readiness/index.ts",
  "tools/external-parity-claim-registry/index.ts",
  "tests/reports/external-parity-claim-registry.json"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const read = (path: string) => readFileSync(resolve(path), "utf8");
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(read(path)) as Obj : undefined;

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);

const docs = requiredFiles.filter((file) => file.endsWith(".md") || file === "README.md").map(read).join("\n");
const normalizedDocs = docs.toLowerCase();
check("product-positioning", docs.includes("Aura3D 2.0") && docs.includes("@aura3d/engine") && docs.includes("createAuraApp"), "Docs must state the current product, package, and public runtime API.");
check(
  "named-product-docs",
  [
    "Getting started",
    "Product Configurator",
    "typed assets",
    "Migration",
    "Known Limits",
    "Three.js Comparison Status"
  ].every((phrase) => normalizedDocs.includes(phrase.toLowerCase())),
  "Docs must include the current onboarding, product, migration, limits, and comparison surfaces."
);
check("evidence-paths", [
  "tests/reports/current-head-to-head-installed/report.json",
  "tests/reports/current-head-to-head/aggregate.json",
  "tests/reports/packed-migration-consumer.json",
  "tests/reports/installed-template-lifecycle.json"
].every((path) => docs.includes(path)), "Docs must cite current evidence reports.");
check("claim-boundary", normalizedDocs.includes("not a universal ecosystem-parity claim") && normalizedDocs.includes("not currently a unity or unreal replacement") && normalizedDocs.includes("comparisoncomplete: false"), "Docs must preserve the current scoped comparison and blocked replacement boundaries.");
check("readme-release-boundary", read("README.md").includes("pnpm run check:release") && read("README.md").includes("not a universal parity claim"), "README must document the canonical release gate and bounded comparison result.");

const claimRegistry = json("tests/reports/external-parity-claim-registry.json");
check("claim-registry", claimRegistry?.pass === true, "Claim registry report must pass.");
check("package-script", read("package.json").includes("\"external-parity:docs\""), "package.json must expose external-parity:docs.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-docs-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "Aura3D 2.0 comparison documentation and claim registry are current."
    : "Aura3D 2.0 comparison documentation and claim registry are incomplete.",
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-docs-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-docs-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
