import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const templates = ["three-compat-premium-product-viewer","three-compat-architecture-interior","three-compat-material-authoring","three-compat-asset-inspector","three-compat-character-viewer","three-compat-postprocess-scene","three-compat-custom-threejs-migration","three-compat-large-scene"];
const missing = templates.flatMap((template) => [`templates/${template}/index.html`, `templates/${template}/src/main.ts`, `templates/${template}/asset-manifest.json`, `packages/create-g3d/templates/${template}/index.html`, `tests/reports/three-compat-templates/${template}.png`].filter((file) => !existsSync(resolve(file))));
const workspaceTemplates = templates.filter((template) => readFileSync(resolve(`templates/${template}/package.json`), "utf8").includes("workspace:"));
const monorepoFixtureImports = templates.filter((template) => /fixtures\/|packages\//.test(readFileSync(resolve(`templates/${template}/src/main.ts`), "utf8")));
const checks = [
  { name: "templates-present", pass: missing.length === 0, detail: missing.join(", ") || "all templates, mirrors, assets, screenshots exist" },
  { name: "no-workspace", pass: workspaceTemplates.length === 0, detail: workspaceTemplates.join(", ") || "no template uses workspace:*" },
  { name: "no-monorepo-fixtures", pass: monorepoFixtureImports.length === 0, detail: monorepoFixtureImports.join(", ") || "no template imports monorepo fixtures" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "g3d-three-compat-template-readiness/v1", generatedAt: new Date().toISOString(), pass, templates, checks };
const reportPath = resolve("tests/reports/three-compat-template-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`V5 template readiness passed: ${templates.length} templates.`);
