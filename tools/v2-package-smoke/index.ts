import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const productStudio = await import(new URL("../../dist/product-studio/index.js", import.meta.url).href);
const {
  createProductCameraFrame,
  createProductLightingPreset,
  createProductMaterialMode,
  createProductRenderScene,
  createProductStudio,
  loadProductAsset
} = productStudio;

const asset = await loadProductAsset({
  id: "camera-kit",
  url: dataUri("model/gltf+json", readFileSync(join(process.cwd(), "fixtures/v2/products/camera-kit/camera-kit.gltf"))),
  manifestUrl: dataUri("application/json", readFileSync(join(process.cwd(), "fixtures/v2/products/camera-kit/manifest.json")))
});
const studio = await createProductStudio({ backend: "mock", width: 640, height: 480 });
const lighting = createProductLightingPreset("catalog-softbox");
const scene = createProductRenderScene(asset, {
  lighting: {
    ...lighting,
    postprocess: {
      ...lighting.postprocess,
      targetFormat: "rgba8"
    }
  },
  camera: createProductCameraFrame(asset, { preset: "front-three-quarter", viewport: { width: 640, height: 480 } }),
  materialMode: createProductMaterialMode("asset")
});
const diagnostics = studio.render(scene);
studio.dispose();
asset.resources.dispose();

const report = {
  schema: "g3d-v2-package-smoke/v1",
  generatedAt: new Date().toISOString(),
  packageImport: "../../dist/product-studio/index.js",
  diagnostics,
  pass: diagnostics.lastError === null
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v2-package-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify(report, null, 2));

function dataUri(mime: string, content: Buffer): string {
  return `data:${mime};base64,${content.toString("base64")}`;
}
