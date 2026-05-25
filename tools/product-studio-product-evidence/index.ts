import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const inputs = [
  "tests/reports/product-studio-truth.json",
  "tests/reports/product-studio-product-assets.json",
  "tests/reports/product-studio-sdk.json",
  "tests/reports/product-studio-app.json",
  "tests/reports/product-studio/manifest.json"
] as const;

const reports = inputs.map((path) => ({
  path,
  exists: existsSync(resolve(path)),
  content: existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) : null
}));

const report = {
  schema: "g3d-product-studio-product-evidence/v1",
  generatedAt: new Date().toISOString(),
  pass: reports.every((entry) => entry.exists && entry.content && entry.content.pass !== false),
  reports
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/product-studio-product-evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
