import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "apps/product-studio-pro/index.html",
  "apps/material-studio-pro/index.html",
  "apps/asset-studio-pro/index.html",
  "apps/scene-studio-pro/index.html",
  "apps/animation-studio-pro/index.html",
  "apps/interactive-showcase-pro/index.html",
  "tests/browser/v4-product-studio-pro.spec.ts",
  "tests/browser/v4-material-studio-pro.spec.ts",
  "tests/browser/v4-asset-studio-pro.spec.ts",
  "tests/browser/v4-scene-studio-pro.spec.ts",
  "tests/browser/v4-animation-studio-pro.spec.ts",
  "tests/browser/v4-interactive-showcase-pro.spec.ts"
] as const;

const requiredReports = [
  "tests/reports/v4-product-studio-pro-browser.json",
  "tests/reports/v4-material-studio-pro-browser.json",
  "tests/reports/v4-asset-studio-pro-browser.json",
  "tests/reports/v4-scene-studio-pro-browser.json",
  "tests/reports/v4-animation-studio-pro-browser.json",
  "tests/reports/v4-interactive-showcase-pro-browser.json"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Obj : undefined;

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);
for (const reportPath of requiredReports) {
  const report = json(reportPath);
  check(`report:${reportPath}`, report?.ok === true, `${reportPath} must exist and pass.`);
}

check(
  "app-suite-script",
  readFileSync(resolve("package.json"), "utf8").includes("\"v4:app-suite\""),
  "package.json must expose v4:app-suite."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-app-suite-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass ? "V4 Pro app suite is explicitly covered." : "V4 Pro app suite coverage is incomplete.",
  checkedFiles: requiredFiles,
  requiredReports,
  checks
};

mkdirSync(dirname(resolve("tests/reports/v4-app-suite-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-app-suite-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
