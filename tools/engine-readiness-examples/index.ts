import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const screenshots = [
  "tests/reports/legacy-product-viewer/product-viewer.png",
  "tests/reports/legacy-material-studio/material-studio.png",
  "tests/reports/legacy-asset-viewer/asset-viewer.png",
  "tests/reports/legacy-rendering-showcase/rendering-showcase.png"
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
    "examples/legacy-product-viewer/",
    "examples/legacy-material-studio/",
    "examples/legacy-asset-viewer/",
    "examples/legacy-rendering-showcase/"
  ],
  checks
};

mkdirSync(dirname("tests/reports/engine-readiness-examples.json"), { recursive: true });
writeFileSync("tests/reports/engine-readiness-examples.json", `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
