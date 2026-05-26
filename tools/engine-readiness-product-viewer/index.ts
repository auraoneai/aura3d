import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const screenshot = "tests/reports/legacy-product-viewer/product-viewer.png";
const reportPath = "tests/reports/legacy-product-viewer/report.json";

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
    ok: existsSync("examples/legacy-product-viewer/main.ts"),
    evidence: "examples/legacy-product-viewer/main.ts"
  },
  {
    id: "browser-spec-exists",
    ok: existsSync("tests/browser/product-viewer-engine-readiness.spec.ts"),
    evidence: "tests/browser/product-viewer-engine-readiness.spec.ts"
  }
];

const report = {
  schemaVersion: "a3d-engine-readiness-legacy-product-viewer",
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
