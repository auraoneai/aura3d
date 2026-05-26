import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredSourceFiles = [
  "packages/rendering/src/Renderer.ts",
  "packages/rendering/src/RenderPipeline.ts",
  "packages/rendering/src/ForwardPass.ts",
  "packages/rendering/src/RenderGraph.ts",
  "packages/rendering/src/WebGL2Device.ts",
  "packages/rendering/src/Material.ts",
  "packages/rendering/src/PBRMaterial.ts",
  "packages/rendering/src/TexturedPBRMaterial.ts",
  "packages/rendering/src/NormalMappedPBRMaterial.ts",
  "packages/rendering/src/LightingDefaults.ts",
  "packages/rendering/src/ShadowMap.ts",
  "packages/rendering/src/PostProcessPass.ts",
  "packages/rendering/src/CameraFraming.ts"
] as const;

const manifestPath = resolve("tests/reports/foundation-renderer-foundation/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const requiredFeatures = [
  "webgl2",
  "pbr",
  "textured-pbr",
  "normal-mapped-pbr",
  "emissive",
  "alpha",
  "environment-lighting",
  "renderer-owned-shadows",
  "postprocess",
  "resize",
  "diagnostics",
  "frame-capture"
] as const;
const captures: RawCapture[] = manifest?.captures ?? [];
const missingFeatures = requiredFeatures.filter((feature) => !(manifest?.requiredFeatures ?? []).includes(feature));
const sourceFiles = requiredSourceFiles.map((path) => ({ path, exists: existsSync(resolve(path)) }));
const captureChecks = captures.map((capture) => ({
  id: capture.id,
  path: capture.path,
  exists: capture.path !== undefined && existsSync(resolve(capture.path)),
  bytes: capture.path !== undefined && existsSync(resolve(capture.path)) ? statSync(resolve(capture.path)).size : 0,
  drawCalls: capture.drawCalls ?? 0,
  lastError: capture.lastError,
  nonDarkRatio: capture.stats?.nonDarkRatio,
  colorBuckets: capture.stats?.colorBuckets
}));

const report = {
  schema: "a3d-foundation-renderer-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: sourceFiles.every((file) => file.exists)
    && manifest?.pass === true
    && missingFeatures.length === 0
    && captureChecks.length >= 4
    && captureChecks.every((capture) => capture.exists && capture.bytes > 10_000 && capture.drawCalls > 3 && capture.lastError === null),
  sourceFiles,
  manifestPath: "tests/reports/foundation-renderer-foundation/manifest.json",
  manifestExists: existsSync(manifestPath),
  missingFeatures,
  captureChecks
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync(resolve("tests/reports/foundation-renderer-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exitCode = 1;
}

interface RawCapture {
  readonly id?: string;
  readonly path?: string;
  readonly drawCalls?: number;
  readonly lastError?: string | null;
  readonly stats?: {
    readonly nonDarkRatio?: number;
    readonly colorBuckets?: number;
  };
}
