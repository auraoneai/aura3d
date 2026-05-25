import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "docs/project/v4-roadmap-product-positioning.md",
  "docs/project/v4-roadmap-getting-started.md",
  "docs/project/v4-roadmap-product-viewer-guide.md",
  "docs/project/v4-roadmap-material-authoring-guide.md",
  "docs/project/v4-roadmap-asset-pipeline-guide.md",
  "docs/project/v4-roadmap-hdr-ibl-guide.md",
  "docs/project/v4-roadmap-threejs-migration-guide.md",
  "docs/project/external-parity-roadmap-visual-quality-status.md",
  "docs/project/v4-roadmap-threejs-parity-status.md",
  "docs/project/v4-roadmap-supported-workflows.md",
  "docs/project/v4-roadmap-known-gaps.md",
  "docs/project/v4-roadmap-release-notes.md",
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
check("product-positioning", docs.includes("G3D Visual Engine V4") && docs.includes("@galileo3d/engine") && docs.includes("createG3DApp"), "Docs must state the product, package, and runtime API.");
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
  "Docs must include the named V4 product docs."
);
check("evidence-paths", [
  "tests/reports/external-parity-threejs-visual-parity.json",
  "tests/reports/external-parity-external-consumer.json",
  "tests/reports/external-parity-visual-quality.json"
].every((path) => docs.includes(path)), "Docs must cite current evidence reports.");
check("claim-boundary", normalizedDocs.includes("full three.js api compatibility remains blocked") && normalizedDocs.includes("unity replacement remains blocked") && normalizedDocs.includes("unreal replacement remains blocked"), "Docs must preserve blocked claim boundaries.");
check("readme-v4", read("README.md").includes("pnpm v4:release") && read("README.md").includes("v4:package") && read("README.md").includes("v4:docs"), "README must document the V4 gates and release boundary.");

const claimRegistry = json("tests/reports/external-parity-claim-registry.json");
check("claim-registry", claimRegistry?.pass === true, "Claim registry report must pass.");
check("package-script", read("package.json").includes("\"v4:docs\""), "package.json must expose v4:docs.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-external-parity-docs-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 18 documentation and claim registry are ready."
    : "V4 Milestone 18 documentation and claim registry are incomplete.",
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
