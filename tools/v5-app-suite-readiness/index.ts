import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const apps = ["v5-product-studio-pro","v5-material-studio-pro","v5-asset-studio-pro","v5-scene-studio-pro","v5-animation-studio-pro","v5-postprocess-studio-pro","v5-shader-lab-pro","v5-threejs-migration-lab","v5-large-scene-lab","v5-controls-lab"];
const missing = apps.flatMap((app) => [`apps/${app}/index.html`, `apps/${app}/src/main.ts`, `tests/reports/v5-app-suite/${app}.png`].filter((file) => !existsSync(resolve(file))));
const internalImports = apps.filter((app) => /packages\//.test(readFileSync(resolve(`apps/${app}/src/main.ts`), "utf8")));
const checks = [
  { name: "apps-present", pass: missing.length === 0, detail: missing.join(", ") || "all app files and screenshots exist" },
  { name: "public-imports", pass: internalImports.length === 0, detail: internalImports.join(", ") || "apps use public V5 APIs" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "g3d-v5-app-suite-readiness/v1", generatedAt: new Date().toISOString(), pass, apps, checks };
const reportPath = resolve("tests/reports/v5-app-suite-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) { console.error(JSON.stringify(report, null, 2)); process.exit(1); }
console.log(`V5 app suite readiness passed: ${apps.length} apps.`);
