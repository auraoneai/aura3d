import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const products = ["camera-kit", "speaker", "watch"] as const;
const root = resolve("fixtures/product-studio/products");
const results = products.map((id) => {
  const gltfPath = join(root, id, `${id}.gltf`);
  const manifestPath = join(root, id, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const gltf = JSON.parse(readFileSync(gltfPath, "utf8"));
  return {
    id,
    gltfPath,
    manifestPath,
    exists: existsSync(gltfPath) && existsSync(manifestPath),
    meshCount: gltf.meshes?.length ?? 0,
    nodeCount: gltf.nodes?.length ?? 0,
    materialCount: gltf.materials?.length ?? 0,
    textureCount: gltf.textures?.length ?? 0,
    imageCount: gltf.images?.length ?? 0,
    manifestPartCount: manifest.parts?.length ?? 0,
    rejectedInputs: manifest.rejectedInputs ?? []
  };
});

const report = {
  schema: "a3d-product-studio-product-assets",
  generatedAt: new Date().toISOString(),
  pass: results.every((result) => result.exists && result.meshCount >= 8 && result.materialCount >= 3 && result.textureCount >= result.materialCount * 4),
  results
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/product-studio-product-assets.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));
