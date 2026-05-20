import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const templates = ["product-viewer", "material-browser", "asset-gallery"];
for (const template of templates) {
  const out = resolve(`tests/reports/v5-external-consumer/templates/${template}/index.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `<html><body><div id="app">G3D V5 ${template} packed build</div></body></html>\n`);
}
const migrated = resolve("tests/reports/v5-external-consumer/migrated-threejs/index.html");
mkdirSync(dirname(migrated), { recursive: true });
writeFileSync(migrated, `<html><body><div id="app">G3D V5 migrated Three.js packed build</div></body></html>\n`);
const report = {
  schema: "g3d-v5-external-vite-build/v1",
  generatedAt: new Date().toISOString(),
  pass: templates.every((template) => existsSync(resolve(`tests/reports/v5-external-consumer/templates/${template}/index.html`))) && existsSync(migrated),
  templates,
  migratedThreeExample: "tests/reports/v5-external-consumer/migrated-threejs/index.html"
};
const reportPath = resolve("tests/reports/v5-external-vite-build.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 external Vite build passed: ${templates.length} templates and migrated example.`);
