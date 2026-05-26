import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/runtime-import-audit.json";
const roots = ["apps", "packages", "templates"] as const;
const allowed = [
  "packages/three-compat/",
  "packages/engine/src/production-runtime/",
  "apps/three-compat-threejs-migration-lab/",
  "apps/threejs-parity-lab/",
  "apps/example-parity-lab/"
] as const;
const files = roots.flatMap((root) => walk(root)).filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
const runtimeThreeImports = files.filter((file) => {
  if (allowed.some((prefix) => file.startsWith(prefix))) return false;
  const source = readFileSync(file, "utf8");
  return /\bfrom\s+["']three["']|\bimport\s*\(["']three["']\)/.test(source);
});
const issues = runtimeThreeImports.map((file) => reportIssue(`runtime-three-import:${file}`, `${file} imports Three.js at runtime.`, "blocker"));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-runtime-import-audit/v1",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  scannedFiles: files.length,
  allowedPrefixes: allowed,
  runtimeThreeImports,
  issues
});
console.log(`V9 runtime import audit written: ${outputPath}`);

function walk(root: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (path.includes("node_modules") || path.includes("/dist/")) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else entries.push(path);
  }
  return entries;
}
