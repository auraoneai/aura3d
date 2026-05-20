import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rejectedInputs = [
  "tests/reports/product-viewer-v1/product-viewer.png",
  "tests/reports/material-studio-v1/material-studio.png",
  "tests/reports/asset-viewer-v1/asset-viewer.png",
  "tests/reports/rendering-showcase-v1/rendering-showcase.png"
] as const;

const report = {
  schema: "g3d-v2-truth/v1",
  generatedAt: new Date().toISOString(),
  verdict: "build-product-studio",
  productTarget: "G3D Product Studio V1",
  rejectedInputs,
  buildFirstFiles: [
    "tools/v2-generate-products/index.ts",
    "fixtures/v2/products/camera-kit/camera-kit.gltf",
    "fixtures/v2/products/speaker/speaker.gltf",
    "fixtures/v2/products/watch/watch.gltf",
    "packages/product-studio/src/ProductStudio.ts",
    "apps/product-studio/src/ProductStudioApp.ts"
  ],
  statement: "V2 does not accept the V1 screenshots as proof. It builds a product studio, assets, SDK, app, tests, and evidence around new product files."
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v2-truth.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
