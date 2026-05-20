import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const templates = ["v5-premium-product-viewer","v5-architecture-interior","v5-material-authoring","v5-asset-inspector","v5-character-viewer","v5-postprocess-scene","v5-custom-threejs-migration","v5-large-scene"];
const missing = templates.flatMap((template) => [`templates/${template}/index.html`, `templates/${template}/src/main.ts`, `templates/${template}/asset-manifest.json`, `packages/create-g3d/templates/${template}/index.html`, `tests/reports/v5-templates/${template}.png`].filter((file) => !existsSync(resolve(file))));
const workspaceTemplates = templates.filter((template) => readFileSync(resolve(`templates/${template}/package.json`), "utf8").includes("workspace:"));
const monorepoFixtureImports = templates.filter((template) => /fixtures\/|packages\//.test(readFileSync(resolve(`templates/${template}/src/main.ts`), "utf8")));
const checks = [
  { name: "templates-present", pass: missing.length === 0, detail: missing.join(", ") || "all templates, mirrors, assets, screenshots exist" },
  { name: "no-workspace", pass: workspaceTemplates.length === 0, detail: workspaceTemplates.join(", ") || "no template uses workspace:*" },
  { name: "no-monorepo-fixtures", pass: monorepoFixtureImports.length === 0, detail: monorepoFixtureImports.join(", ") || "no template imports monorepo fixtures" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "g3d-v5-template-readiness/v1", generatedAt: new Date().toISOString(), pass, templates, checks };
const reportPath = resolve("tests/reports/v5-template-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`V5 template readiness passed: ${templates.length} templates.`);
