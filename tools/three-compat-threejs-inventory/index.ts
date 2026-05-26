import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { buildThreeApiInventory, REQUIRED_THREE_API_CATEGORIES } from "../../packages/three-compat/src/ThreeApiInventory";
import { buildInitialCompatibilityMatrix } from "../../packages/three-compat/src/ThreeCompatibilityMatrix";

const require = createRequire(import.meta.url);
const THREE = require("three") as Record<string, unknown>;
const packageJson = JSON.parse(readFileSync(resolve("node_modules/three/package.json"), "utf8")) as { readonly version?: string };
const inventory = buildThreeApiInventory(packageJson.version ?? "unknown", Object.keys(THREE));
const matrix = buildInitialCompatibilityMatrix(inventory);

const checks = [
  {
    id: "package-version",
    pass: typeof packageJson.version === "string" && packageJson.version.length > 0,
    detail: "Inventory must read installed Three.js package version."
  },
  {
    id: "category-coverage",
    pass: REQUIRED_THREE_API_CATEGORIES.every((category) => inventory.categories[category] > 0),
    detail: "Inventory must include every required Three.js category."
  },
  {
    id: "entry-count",
    pass: inventory.entries.length >= 250,
    detail: "Inventory must track at least 250 Three.js API/example entries."
  },
  {
    id: "thresholds-defined",
    pass: matrix.thresholds.some((entry) => entry.category === "overall" && entry.minimumSupportedOrPartialPercent === 60) &&
      matrix.thresholds.some((entry) => entry.category === "materials" && entry.minimumSupportedOrPartialPercent === 80) &&
      matrix.thresholds.some((entry) => entry.category === "controls" && entry.minimumSupportedOrPartialPercent === 60),
    detail: "Compatibility matrix must define the V5 broad replacement thresholds."
  },
  {
    id: "status-taxonomy",
    pass: matrix.entries.every((entry) => ["supported", "partial", "planned", "blocked", "out-of-scope"].includes(entry.status)),
    detail: "Matrix must use the V5 status taxonomy."
  }
];

const report = {
  schema: "a3d-three-compat-threejs-inventory/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((entry) => entry.pass),
  inventory,
  checks
};

writeJson("tests/reports/three-compat-threejs-inventory.json", report);
writeJson("tests/reports/three-compat-threejs-compatibility-matrix.json", matrix);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
