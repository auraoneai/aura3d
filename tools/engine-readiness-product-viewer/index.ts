import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const reportPath = "tests/reports/engine-readiness-asset-viewer/report.json";

const checks = [
  {
    id: "current-example-source",
    ok: existsSync("examples/asset-viewer/main.ts"),
    evidence: "examples/asset-viewer/main.ts"
  },
  {
    id: "current-browser-spec",
    ok: existsSync("tests/browser/asset-viewer-browser.spec.ts"),
    evidence: "tests/browser/asset-viewer-browser.spec.ts"
  },
  {
    id: "typed-default-asset",
    ok: existsSync("fixtures/product-studio/products/speaker/speaker.gltf"),
    evidence: "fixtures/product-studio/products/speaker/speaker.gltf"
  },
  {
    id: "legacy-route-not-public",
    ok: !existsSync("examples/legacy-product-viewer/index.html"),
    evidence: "archive/examples/legacy-product-viewer"
  }
];

const report = {
  schemaVersion: "a3d-engine-readiness-current-asset-viewer",
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
