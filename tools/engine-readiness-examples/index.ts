import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const screenshots = [
  "tests/reports/product-viewer-v1/product-viewer.png",
  "tests/reports/material-studio-v1/material-studio.png",
  "tests/reports/asset-viewer-v1/asset-viewer.png",
  "tests/reports/rendering-showcase-v1/rendering-showcase.png"
];

const checks = screenshots.map((path) => ({
  id: `screenshot:${path}`,
  path,
  ok: existsSync(path) && statSync(path).size > 10_000,
  byteLength: existsSync(path) ? statSync(path).size : 0
}));

const report = {
  schemaVersion: "g3d-engine-readiness-examples-v1",
  generatedAt: new Date().toISOString(),
  ok: checks.every((check) => check.ok),
  publicExamples: [
    "examples/product-viewer-v1/",
    "examples/material-studio-v1/",
    "examples/asset-viewer-v1/",
    "examples/rendering-showcase-v1/"
  ],
  checks
};

mkdirSync(dirname("tests/reports/engine-readiness-examples.json"), { recursive: true });
writeFileSync("tests/reports/engine-readiness-examples.json", `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
