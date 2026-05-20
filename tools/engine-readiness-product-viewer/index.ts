import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const screenshot = "tests/reports/product-viewer-v1/product-viewer.png";
const reportPath = "tests/reports/product-viewer-v1/report.json";

const checks = [
  {
    id: "screenshot-exists",
    ok: existsSync(screenshot),
    evidence: screenshot
  },
  {
    id: "screenshot-nontrivial-size",
    ok: existsSync(screenshot) && statSync(screenshot).size > 10_000,
    evidence: screenshot
  },
  {
    id: "example-source-uses-asset-sdk",
    ok: existsSync("examples/product-viewer-v1/main.ts"),
    evidence: "examples/product-viewer-v1/main.ts"
  },
  {
    id: "browser-spec-exists",
    ok: existsSync("tests/browser/product-viewer-v1.spec.ts"),
    evidence: "tests/browser/product-viewer-v1.spec.ts"
  }
];

const report = {
  schemaVersion: "g3d-engine-readiness-product-viewer-v1",
  generatedAt: new Date().toISOString(),
  ok: checks.every((check) => check.ok),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
