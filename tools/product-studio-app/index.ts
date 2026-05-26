import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const browserReportPath = resolve("tests/reports/product-studio/manifest.json");
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8"))
  : null;
const captures = browserReport?.captures ?? [];
const report = {
  schema: "a3d-product-studio-app/v1",
  generatedAt: new Date().toISOString(),
  appPath: "apps/product-studio/index.html",
  browserReportPath: "tests/reports/product-studio/manifest.json",
  captureCount: captures.length,
  captures,
  pass: existsSync(resolve("apps/product-studio/index.html")) && captures.length >= 6
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/product-studio-app.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
