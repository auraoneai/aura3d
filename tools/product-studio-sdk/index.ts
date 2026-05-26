import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createProductCameraFrame,
  createProductDiagnostics,
  createProductLightingPreset,
  createProductMaterialMode,
  createProductRenderScene,
  loadProductAsset
} from "@aura3d/product-studio";

const products = ["camera-kit", "speaker", "watch"] as const;
const results = [];

for (const id of products) {
  const asset = await loadProductAsset({
    id,
    url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), `fixtures/product-studio/products/${id}/${id}.gltf`))),
    manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), `fixtures/product-studio/products/${id}/manifest.json`)))
  });
  const scene = createProductRenderScene(asset, {
    lighting: createProductLightingPreset("catalog-softbox"),
    camera: createProductCameraFrame(asset, { preset: "front-three-quarter" }),
    materialMode: createProductMaterialMode("asset")
  });
  const diagnostics = createProductDiagnostics(asset);
  results.push({
    id,
    partCount: diagnostics.partCount,
    materialCount: diagnostics.materialCount,
    textureCount: diagnostics.textureCount,
    meshCount: diagnostics.meshCount,
    warnings: diagnostics.warnings,
    cameraPreset: scene.cameraFrame.preset,
    lightingPreset: scene.lighting.preset,
    materialMode: scene.materialMode.id
  });
  asset.resources.dispose();
}

const report = {
  schema: "a3d-product-studio-sdk",
  generatedAt: new Date().toISOString(),
  pass: results.every((result) => result.partCount >= 8 && result.materialCount >= 3 && result.textureCount >= 12 && result.warnings.length === 0),
  results
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/product-studio-sdk.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
