import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly files?: readonly string[];
  readonly exports?: Record<string, string>;
}

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as PackageJson;
const requiredExports = [
  ".",
  "./rendering",
  "./assets",
  "./materials",
  "./environments",
  "./controls",
  "./animation",
  "./three-compat",
  "./create-aura3d"
];
const requiredTemplateFiles = [
  "templates/three-compat-premium-product-viewer",
  "templates/three-compat-architecture-interior",
  "templates/three-compat-material-authoring",
  "templates/three-compat-asset-inspector",
  "templates/three-compat-character-viewer",
  "templates/three-compat-postprocess-scene",
  "templates/three-compat-custom-threejs-migration",
  "templates/three-compat-large-scene"
];
const files = packageJson.files ?? [];
const exportsMap = packageJson.exports ?? {};
const missingExports = requiredExports.filter((entry) => !(entry in exportsMap));
const missingExportTargets = requiredExports.filter((entry) => !existsSync(resolve(String(exportsMap[entry] ?? "").replace(/^\.\//, ""))));
const missingTemplateFiles = requiredTemplateFiles.filter((entry) => !files.includes(entry) || !existsSync(resolve(entry)));
const workspaceTemplateDeps = requiredTemplateFiles.filter((entry) => readFileSync(resolve(`${entry}/package.json`), "utf8").includes("workspace:"));
const checks = [
  {
    id: "package-identity",
    pass: packageJson.name === "@aura3d/engine" && /^0\.1\.0-alpha\.0/.test(packageJson.version),
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
    detail: missingExportTargets.join(", ") || "required export targets exist in dist"
  },
  {
    id: "three-compat-templates-packaged",
    pass: missingTemplateFiles.length === 0,
    detail: missingTemplateFiles.join(", ") || "required Three.js compatibility templates are included in package files"
  },
  {
    id: "templates-are-external-consumer-safe",
    pass: workspaceTemplateDeps.length === 0,
    detail: workspaceTemplateDeps.join(", ") || "Three.js compatibility template package.json files do not use workspace:*"
  }
];
const report = {
  schema: "a3d-three-compat-package-surface-readiness",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredExports,
  requiredTemplateFiles,
  checks
};
const reportPath = resolve("tests/reports/three-compat-package-surface-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility package surface readiness passed: ${requiredExports.length} exports, ${requiredTemplateFiles.length} Three.js compatibility templates.`);
