import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const requiredSourceFiles = [
  "packages/assets/src/GLTFLoader.ts",
  "packages/assets/src/GLTFRenderResources.ts",
  "packages/assets/src/loadRenderableAsset.ts",
  "packages/assets/src/createRenderableScene.ts",
  "packages/assets/src/AssetRenderDefaults.ts",
  "packages/assets/src/AssetInspection.ts",
  "packages/assets/src/AssetCompatibility.ts",
  "packages/assets/src/AssetImportPreflight.ts"
] as const;
const requiredFixtures = ["product-camera", "material-spheres", "animated-character", "variant-product", "compressed-product"] as const;
const fixtureRoot = resolve("fixtures/v3/assets");
const browserManifestPath = resolve("tests/reports/v3-assets/manifest.json");
const browserManifest = existsSync(browserManifestPath) ? JSON.parse(readFileSync(browserManifestPath, "utf8")) : null;
const sourceFiles = requiredSourceFiles.map((path) => ({ path, exists: existsSync(resolve(path)) }));
interface BrowserAssetCapture {
  readonly id: string;
  readonly path: string;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly drawCalls: number;
  readonly lastError: string | null;
}
interface AssetCaptureCheck extends BrowserAssetCapture {
  readonly exists: boolean;
  readonly bytes: number;
}
const fixtureChecks = requiredFixtures.map((id) => {
  const manifestPath = join(fixtureRoot, id, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  return {
    id,
    exists: existsSync(join(fixtureRoot, id)),
    manifestPath: `fixtures/v3/assets/${id}/manifest.json`,
    manifestExists: existsSync(manifestPath),
    coverage: manifest?.coverage ?? [],
    gltfExists: manifest ? existsSync(join(fixtureRoot, id, manifest.gltf)) : false,
    glbExists: manifest ? existsSync(join(fixtureRoot, id, manifest.glb)) : false,
    externalExists: manifest ? existsSync(join(fixtureRoot, id, manifest.externalGltf)) : false
  };
});
const captureChecks: AssetCaptureCheck[] = (browserManifest?.captures ?? []).map((capture: BrowserAssetCapture) => ({
  id: capture.id,
  path: capture.path,
  exists: existsSync(resolve(capture.path)),
  bytes: existsSync(resolve(capture.path)) ? statSync(resolve(capture.path)).size : 0,
  meshCount: capture.meshCount,
  materialCount: capture.materialCount,
  textureCount: capture.textureCount,
  drawCalls: capture.drawCalls,
  lastError: capture.lastError
}));
const requiredCoverage = ["gltf", "glb", "data-uri", "external-buffer", "external-image"] as const;

const report = {
  schema: "g3d-v3-assets-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: sourceFiles.every((file) => file.exists)
    && fixtureChecks.every((fixture) => fixture.exists && fixture.manifestExists && fixture.gltfExists && fixture.glbExists && fixture.externalExists && requiredCoverage.every((item) => fixture.coverage.includes(item)))
    && browserManifest?.pass === true
    && captureChecks.length >= 3
    && captureChecks.every((capture) => capture.exists && capture.bytes > 10_000 && capture.meshCount > 0 && capture.materialCount > 0 && capture.textureCount > 0 && capture.drawCalls > 5 && capture.lastError === null),
  sourceFiles,
  fixtureChecks,
  browserManifestPath: "tests/reports/v3-assets/manifest.json",
  browserManifestExists: existsSync(browserManifestPath),
  captureChecks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/v3-assets-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
