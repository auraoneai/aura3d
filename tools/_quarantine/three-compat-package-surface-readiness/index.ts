import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly exports?: Record<string, string>;
}

const packageJson = JSON.parse(readFileSync(resolve("packages/three-compat/package.json"), "utf8")) as PackageJson;
// `./postprocessing` was required here until WS-3.4 deleted the stub tree it built from. The gate then wanted
// an export whose source no longer existed, so the honest surface is the three subpaths that resolve. The
// `forbiddenExports` check below keeps it from being re-added without a real GPU composer behind it — the
// previous failure mode was a published subpath resolving to nothing.
const requiredExports = [
  ".",
  "./controls",
  "./loaders"
];
const forbiddenExports = ["./postprocessing", "./shaders"];
const sourceTargets: Record<string, string> = {
  ".": "packages/three-compat/src/index.ts",
  "./controls": "packages/three-compat/src/controls/index.ts",
  "./loaders": "packages/three-compat/src/loaders/index.ts"
};
const files = packageJson.files ?? [];
const exportsMap = packageJson.exports ?? {};
const missingExports = requiredExports.filter((entry) => !(entry in exportsMap));
const missingExportTargets = requiredExports.filter((entry) => !existsSync(resolve(sourceTargets[entry])));
const danglingExports = Object.keys(exportsMap).filter((entry) => forbiddenExports.includes(entry));
const checks = [
  {
    id: "package-identity",
    pass: packageJson.name === "@aura3d/three-compat",
    detail: `${packageJson.name}@${packageJson.version}`
  },
  {
    id: "public-exports",
    pass: missingExports.length === 0,
    detail: missingExports.join(", ") || "required public exports are declared"
  },
  {
    id: "built-export-targets",
    pass: missingExportTargets.length === 0,
    detail: missingExportTargets.join(", ") || "required source export targets exist"
  },
  {
    id: "no-dangling-export-subpaths",
    pass: danglingExports.length === 0,
    detail: danglingExports.length > 0
      ? `${danglingExports.join(", ")} declared but has no source tree; a published subpath must resolve`
      : "no export subpath points at a deleted tree"
  },
  {
    id: "root-engine-does-not-own-three-compat-surface",
    pass: !files.includes("dist/three-compat"),
    detail: files.includes("dist/three-compat") ? "compat package manifest unexpectedly includes root dist/three-compat" : "compat package is separate from root engine package files"
  }
];
const report = {
  schema: "a3d-three-compat-package-surface-readiness",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredExports,
  forbiddenExports,
  checks
};
const reportPath = resolve("tests/reports/three-compat-package-surface-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility package surface readiness passed: ${requiredExports.length} separate package exports.`);
