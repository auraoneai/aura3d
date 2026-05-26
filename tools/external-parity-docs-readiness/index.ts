import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "docs/project/competitive-positioning.md",
  "docs/project/getting-started.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/getting-started.md",
  "docs/project/threejs-parity-parity-matrix.md",
  "docs/project/migration.md",
  "docs/project/threejs-superiority-status.md",
  "docs/project/threejs-parity-status.md",
  "docs/project/compatibility.md",
  "docs/project/known-limits.md",
  "docs/project/release-process.md",
  "docs/api/app-api.md",
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
check("product-positioning", docs.includes("A3D Visual Engine External parity") && docs.includes("@aura3d/engine") && docs.includes("createA3DApp"), "Docs must state the product, package, and runtime API.");
check(
  "named-product-docs",
  [
    "Getting started",
    "Product Viewer Guide",
    "Material Authoring Guide",
    "Asset Pipeline Guide",
    "HDR And IBL Guide",
    "Three.js Migration Guide",
    "Release Notes"
  ].every((phrase) => normalizedDocs.includes(phrase.toLowerCase())),
  "Docs must include the named External parity product docs."
);
check("evidence-paths", [
  "tests/reports/external-parity-threejs-visual-parity.json",
  "tests/reports/external-parity-external-consumer.json",
  "tests/reports/external-parity-visual-quality.json"
].every((path) => docs.includes(path)), "Docs must cite current evidence reports.");
check("claim-boundary", normalizedDocs.includes("full three.js api compatibility remains blocked") && normalizedDocs.includes("unity replacement remains blocked") && normalizedDocs.includes("unreal replacement remains blocked"), "Docs must preserve blocked claim boundaries.");
check("readme-external-parity", read("README.md").includes("pnpm external-parity:release") && read("README.md").includes("external-parity:package") && read("README.md").includes("external-parity:docs"), "README must document the External parity gates and release boundary.");

const claimRegistry = json("tests/reports/external-parity-claim-registry.json");
check("claim-registry", claimRegistry?.pass === true, "Claim registry report must pass.");
check("package-script", read("package.json").includes("\"external-parity:docs\""), "package.json must expose external-parity:docs.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-docs-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "External parity Milestone 18 documentation and claim registry are ready."
    : "External parity Milestone 18 documentation and claim registry are incomplete.",
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
