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
  "tests/browser/external-parity-product-studio-pro.spec.ts",
  "tests/browser/external-parity-material-studio-pro.spec.ts",
  "tests/browser/external-parity-asset-studio-pro.spec.ts",
  "tests/browser/external-parity-scene-studio-pro.spec.ts",
  "tests/browser/external-parity-animation-studio-pro.spec.ts",
  "tests/browser/external-parity-interactive-showcase-pro.spec.ts"
] as const;

const requiredReports = [
  "tests/reports/external-parity-product-studio-pro-browser.json",
  "tests/reports/external-parity-material-studio-pro-browser.json",
  "tests/reports/external-parity-asset-studio-pro-browser.json",
  "tests/reports/external-parity-scene-studio-pro-browser.json",
  "tests/reports/external-parity-animation-studio-pro-browser.json",
  "tests/reports/external-parity-interactive-showcase-pro-browser.json"
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
  readFileSync(resolve("package.json"), "utf8").includes("\"external-parity:app-suite\""),
  "package.json must expose external-parity:app-suite."
);

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-app-suite-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass ? "External parity Pro app suite is explicitly covered." : "External parity Pro app suite coverage is incomplete.",
  checkedFiles: requiredFiles,
  requiredReports,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-app-suite-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-app-suite-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
