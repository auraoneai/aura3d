import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredReports = [
  "tests/reports/v2-truth.json",
  "tests/reports/v2-product-assets.json",
  "tests/reports/v2-sdk.json",
  "tests/reports/v2-app.json",
  "tests/reports/v2-product-evidence.json",
  "tests/reports/v2-package-smoke.json",
  "tests/reports/v2-product-studio/manifest.json"
] as const;

const files = [
  "apps/product-studio/index.html",
  "apps/product-studio/src/ProductStudioApp.ts",
  "packages/product-studio/src/ProductStudio.ts",
  "packages/product-studio/src/ProductRenderScene.ts",
  "tools/v2-generate-products/index.ts",
  "fixtures/v2/products/camera-kit/camera-kit.gltf",
  "fixtures/v2/products/speaker/speaker.gltf",
  "fixtures/v2/products/watch/watch.gltf"
] as const;

const reports = requiredReports.map((path) => ({
  path,
  exists: existsSync(resolve(path)),
  pass: existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")).pass !== false : false
}));
const implementationFiles = files.map((path) => ({ path, exists: existsSync(resolve(path)) }));
const report = {
  schema: "g3d-v2-product-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: reports.every((entry) => entry.pass) && implementationFiles.every((entry) => entry.exists),
  reports,
  implementationFiles,
  rejectedScreenshotsRemainRejected: [
    "tests/reports/product-viewer-v1/product-viewer.png",
    "tests/reports/material-studio-v1/material-studio.png",
    "tests/reports/asset-viewer-v1/asset-viewer.png",
    "tests/reports/rendering-showcase-v1/rendering-showcase.png"
  ]
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v2-product-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
