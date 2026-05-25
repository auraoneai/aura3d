import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rejectedInputs = [
  "tests/reports/legacy-product-viewer/product-viewer.png",
  "tests/reports/legacy-material-studio/material-studio.png",
  "tests/reports/legacy-asset-viewer/asset-viewer.png",
  "tests/reports/legacy-rendering-showcase/rendering-showcase.png"
] as const;

const report = {
  schema: "g3d-product-studio-truth/v1",
  generatedAt: new Date().toISOString(),
  verdict: "build-product-studio",
  productTarget: "G3D Product Studio V1",
  rejectedInputs,
  buildFirstFiles: [
    "tools/product-studio-generate-products/index.ts",
    "fixtures/v2/products/camera-kit/camera-kit.gltf",
    "fixtures/v2/products/speaker/speaker.gltf",
    "fixtures/v2/products/watch/watch.gltf",
    "packages/product-studio/src/ProductStudio.ts",
    "apps/product-studio/src/ProductStudioApp.ts"
  ],
  statement: "V2 does not accept the V1 screenshots as proof. It builds a product studio, assets, SDK, app, tests, and evidence around new product files."
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/product-studio-truth.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
