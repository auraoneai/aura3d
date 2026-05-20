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
  "./create-g3d"
];
const requiredTemplateFiles = [
  "templates/v5-premium-product-viewer",
  "templates/v5-architecture-interior",
  "templates/v5-material-authoring",
  "templates/v5-asset-inspector",
  "templates/v5-character-viewer",
  "templates/v5-postprocess-scene",
  "templates/v5-custom-threejs-migration",
  "templates/v5-large-scene"
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
    pass: packageJson.name === "@galileo3d/engine" && /^0\.1\.0-alpha\.0/.test(packageJson.version),
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
    id: "v5-templates-packaged",
    pass: missingTemplateFiles.length === 0,
    detail: missingTemplateFiles.join(", ") || "required V5 templates are included in package files"
  },
  {
    id: "templates-are-external-consumer-safe",
    pass: workspaceTemplateDeps.length === 0,
    detail: workspaceTemplateDeps.join(", ") || "V5 template package.json files do not use workspace:*"
  }
];
const report = {
  schema: "g3d-v5-package-surface-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  requiredExports,
  requiredTemplateFiles,
  checks
};
const reportPath = resolve("tests/reports/v5-package-surface-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 package surface readiness passed: ${requiredExports.length} exports, ${requiredTemplateFiles.length} V5 templates.`);
