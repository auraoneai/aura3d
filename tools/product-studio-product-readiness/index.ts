import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredReports = [
  "tests/reports/product-studio-truth.json",
  "tests/reports/product-studio-product-assets.json",
  "tests/reports/product-studio-sdk.json",
  "tests/reports/product-studio-app.json",
  "tests/reports/product-studio-product-evidence.json",
  "tests/reports/product-studio-package-smoke.json",
  "tests/reports/product-studio/manifest.json"
] as const;

const files = [
  "apps/product-studio/index.html",
  "apps/product-studio/src/ProductStudioApp.ts",
  "packages/product-studio/src/ProductStudio.ts",
  "packages/product-studio/src/ProductRenderScene.ts",
  "tools/product-studio-generate-products/index.ts",
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
  schema: "g3d-product-studio-product-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: reports.every((entry) => entry.pass) && implementationFiles.every((entry) => entry.exists),
  reports,
  implementationFiles,
  rejectedScreenshotsRemainRejected: [
    "tests/reports/legacy-product-viewer/product-viewer.png",
    "tests/reports/legacy-material-studio/material-studio.png",
    "tests/reports/legacy-asset-viewer/asset-viewer.png",
    "tests/reports/legacy-rendering-showcase/rendering-showcase.png"
  ]
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/product-studio-product-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
