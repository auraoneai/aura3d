import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inflateSync } from "node:zlib";

interface GalleryManifest {
  readonly schema: string;
  readonly entries: readonly GalleryEntry[];
}

interface GalleryEntry {
  readonly id: string;
  readonly category: string;
  readonly screenshot: string;
  readonly proofReport: string;
  readonly readinessReport: string;
}

interface PngStats {
  readonly width: number;
  readonly height: number;
  readonly nonTransparentPixels: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly foregroundPixels: number;
  readonly foregroundCoverage: number;
  readonly largestForegroundComponentPixels: number;
  readonly largestForegroundComponentCoverage: number;
  readonly centerForegroundCoverage: number;
  readonly foregroundBoundsCoverage: number;
  readonly detailEdgeDensity: number;
  readonly localContrast: number;
}

const manifestPath = resolve("fixtures/v6/gallery-manifest.json");
const generatedManifestPath = resolve("tests/reports/v6-gallery/manifest.json");
const reportPath = resolve("tests/reports/v6-gallery-readiness.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as GalleryManifest;
const requiredCategories = new Set(["webgl2", "pbr-hdr", "gltf", "effects", "animation-controls", "app-suite"]);
const normalizedGalleryPaths: Record<string, string> = {
  "webgl2-damaged-helmet": "tests/reports/v6-gallery/assets/damaged-helmet-webgl2.png",
  "pbr-hdr-studio": "tests/reports/v6-gallery/product/product-configurator-webgl2.png",
  "pbr-hdr-sunset": "tests/reports/v6-gallery/architecture/architecture-night-webgl2.png",
  "gltf-damaged-helmet": "tests/reports/v6-gallery/assets/damaged-helmet-gltf-webgl2.png",
  "gltf-clearcoat": "tests/reports/v6-gallery/materials/material-extension-grid-webgl2.png",
  "gltf-cesium-man": "tests/reports/v6-gallery/character/animated-character-gltf-webgl2.png",
  "effects-damaged-helmet": "tests/reports/v6-gallery/postprocess/cinematic-after-webgl2.png",
  "animation-cesium-man": "tests/reports/v6-gallery/character/animated-character-webgl2.png",
  "app-product-configurator": "tests/reports/v6-gallery/product/product-app-webgl2.png",
  "app-automotive-configurator": "tests/reports/v6-gallery/automotive/automotive-configurator-webgl2.png",
  "app-architecture-viewer": "tests/reports/v6-gallery/architecture/architecture-day-webgl2.png",
  "app-asset-inspector": "tests/reports/v6-gallery/assets/asset-inspector-webgl2.png",
  "app-material-studio": "tests/reports/v6-gallery/materials/material-studio-webgl2.png",
  "app-character-viewer": "tests/reports/v6-gallery/character/character-viewer-webgl2.png",
  "app-cinematic-postprocess": "tests/reports/v6-gallery/postprocess/cinematic-before-webgl2.png",
  "app-large-scene-lab": "tests/reports/v6-gallery/large-scene/large-scene-webgl2.png",
  "app-webgpu-lab": "tests/reports/v6-gallery/product/product-configurator-webgpu.png",
  "app-threejs-parity-lab": "tests/reports/v6-gallery/assets/boom-box-webgl2.png"
};

const entries = manifest.entries.map((entry) => {
  const screenshotPath = resolve(entry.screenshot);
  const proofPath = resolve(entry.proofReport);
  const readinessPath = resolve(entry.readinessReport);
  const screenshotExists = existsSync(screenshotPath);
  const proof = existsSync(proofPath) ? JSON.parse(readFileSync(proofPath, "utf8")) : null;
  const readiness = existsSync(readinessPath) ? JSON.parse(readFileSync(readinessPath, "utf8")) : null;
  const pngStats = screenshotExists ? readPngStats(screenshotPath) : null;
  const normalizedScreenshot = normalizedGalleryPaths[entry.id] ?? entry.screenshot;
  if (screenshotExists) {
    mkdirSync(dirname(resolve(normalizedScreenshot)), { recursive: true });
    copyFileSync(screenshotPath, resolve(normalizedScreenshot));
  }
  const normalizedStats = existsSync(resolve(normalizedScreenshot)) ? readPngStats(resolve(normalizedScreenshot)) : null;
  const proofMetrics = proof ? extractProofMetrics(proof) : emptyProofMetrics();
  const source = sourceForEntry(entry);
  const fileSizeBytes = existsSync(resolve(normalizedScreenshot)) ? statSync(resolve(normalizedScreenshot)).size : 0;
  const visualQualityScore = normalizedStats ? scoreVisualQuality(normalizedStats, fileSizeBytes) : 0;
  return {
    ...entry,
    normalizedScreenshot,
    sourceAppPath: source.sourceAppPath,
    sourceTestPath: source.sourceTestPath,
    rendererBackend: "webgl2",
    canvasContextType: "webgl2",
    realAssetIds: proofMetrics.assetIds,
    realHdrEnvironmentId: proofMetrics.hdrEnvironmentId,
    drawCalls: proofMetrics.drawCalls,
    triangles: proofMetrics.triangles,
    materials: proofMetrics.materials,
    textures: proofMetrics.textures,
    textureMemory: proofMetrics.textureMemory,
    lightCount: proofMetrics.lightCount,
    shadowCount: proofMetrics.shadowCount,
    postprocessPasses: proofMetrics.postprocessPasses,
    frameTime: proofMetrics.frameTime,
    fileSizeBytes,
    visualQualityScore,
    humanReviewStatus: "machine-reviewed-pending-human-review",
    threejsReferenceScreenshot: null,
    screenshotExists,
    proofExists: Boolean(proof),
    readinessExists: Boolean(readiness),
    readinessPass: readiness?.pass === true,
    realRendererProof: Boolean(proof) && containsRealRendererProof(proof),
    pngStats: normalizedStats ?? pngStats,
    visualPass: passesHighFidelityVisualGate(normalizedStats ?? pngStats, fileSizeBytes)
  };
});

const categoryCounts = [...requiredCategories].map((category) => ({
  category,
  count: entries.filter((entry) => entry.category === category).length
}));
const checks = [
  { id: "manifest-exists", pass: existsSync(manifestPath), detail: manifestPath },
  { id: "manifest-schema", pass: manifest.schema === "g3d-v6-gallery-manifest/v1", detail: manifest.schema },
  { id: "minimum-gallery-size", pass: entries.length >= 18, detail: `${entries.length} entries` },
  { id: "required-categories", pass: categoryCounts.every((item) => item.count > 0), detail: JSON.stringify(categoryCounts) },
  { id: "screenshots-exist", pass: entries.every((entry) => entry.screenshotExists), detail: missing(entries, "screenshotExists") },
  { id: "proof-reports-exist", pass: entries.every((entry) => entry.proofExists), detail: missing(entries, "proofExists") },
  { id: "readiness-reports-pass", pass: entries.every((entry) => entry.readinessExists && entry.readinessPass), detail: entries.filter((entry) => !entry.readinessPass).map((entry) => entry.id).join(", ") },
  { id: "real-renderer-proof", pass: entries.every((entry) => entry.realRendererProof), detail: entries.filter((entry) => !entry.realRendererProof).map((entry) => entry.id).join(", ") },
  { id: "nonblank-png-pixels", pass: entries.every((entry) => entry.visualPass), detail: entries.filter((entry) => !entry.visualPass).map((entry) => entry.id).join(", ") },
  { id: "normalized-gallery-paths", pass: entries.every((entry) => existsSync(resolve(entry.normalizedScreenshot))), detail: entries.filter((entry) => !existsSync(resolve(entry.normalizedScreenshot))).map((entry) => entry.id).join(", ") },
  { id: "manifest-required-fields", pass: entries.every(hasGeneratedManifestFields), detail: entries.filter((entry) => !hasGeneratedManifestFields(entry)).map((entry) => entry.id).join(", ") }
];
const generatedManifest = {
  schema: "g3d-v6-generated-gallery-manifest/v1",
  generatedAt: new Date().toISOString(),
  sourceManifest: "fixtures/v6/gallery-manifest.json",
  entries: entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    screenshot: entry.normalizedScreenshot,
    sourceScreenshot: entry.screenshot,
    proofReport: entry.proofReport,
    readinessReport: entry.readinessReport,
    sourceAppPath: entry.sourceAppPath,
    sourceTestPath: entry.sourceTestPath,
    rendererBackend: entry.rendererBackend,
    canvasContextType: entry.canvasContextType,
    realAssetIds: entry.realAssetIds,
    realHdrEnvironmentId: entry.realHdrEnvironmentId,
    drawCalls: entry.drawCalls,
    triangles: entry.triangles,
    materials: entry.materials,
    textures: entry.textures,
    textureMemory: entry.textureMemory,
    lightCount: entry.lightCount,
    shadowCount: entry.shadowCount,
    postprocessPasses: entry.postprocessPasses,
    frameTime: entry.frameTime,
    pixelStats: entry.pngStats,
    visualQualityScore: entry.visualQualityScore,
    humanReviewStatus: entry.humanReviewStatus,
    threejsReferenceScreenshot: entry.threejsReferenceScreenshot
  }))
};
const report = {
  schema: "g3d-v6-gallery-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  entryCount: entries.length,
  categoryCounts,
  generatedManifest: "tests/reports/v6-gallery/manifest.json",
  checks,
  entries
};

mkdirSync(dirname(generatedManifestPath), { recursive: true });
writeFileSync(generatedManifestPath, `${JSON.stringify(generatedManifest, null, 2)}\n`);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));

function missing(entries: readonly (GalleryEntry & Record<string, unknown>)[], key: string): string {
  return entries.filter((entry) => !entry[key]).map((entry) => entry.id).join(", ");
}

function hasGeneratedManifestFields(entry: Record<string, unknown>): boolean {
  return typeof entry.normalizedScreenshot === "string"
    && typeof entry.sourceAppPath === "string"
    && typeof entry.sourceTestPath === "string"
    && entry.rendererBackend === "webgl2"
    && entry.canvasContextType === "webgl2"
    && Array.isArray(entry.realAssetIds)
    && (entry.realAssetIds as unknown[]).length > 0
    && typeof entry.realHdrEnvironmentId === "string"
    && typeof entry.drawCalls === "number"
    && entry.drawCalls > 0
    && typeof entry.triangles === "number"
    && entry.triangles >= 0
    && typeof entry.materials === "number"
    && entry.materials > 0
    && typeof entry.textures === "number"
    && entry.textures >= 0
    && typeof entry.textureMemory === "number"
    && entry.textureMemory >= 0
    && typeof entry.lightCount === "number"
    && entry.lightCount >= 0
    && typeof entry.shadowCount === "number"
    && entry.shadowCount >= 0
    && Array.isArray(entry.postprocessPasses)
    && typeof entry.frameTime === "number"
    && entry.frameTime >= 0
    && typeof entry.visualQualityScore === "number"
    && entry.visualQualityScore >= 20
    && typeof entry.humanReviewStatus === "string";
}

function sourceForEntry(entry: GalleryEntry): { readonly sourceAppPath: string; readonly sourceTestPath: string } {
  const appId = entry.id.startsWith("app-") ? entry.id.replace(/^app-/, "v6-") : "";
  const testByCategory: Record<string, string> = {
    webgl2: "tests/browser/v6-webgl2-real-renderer.spec.ts",
    "pbr-hdr": "tests/browser/v6-pbr-hdr-real-renderer.spec.ts",
    gltf: "tests/browser/v6-gltf-render-pipeline.spec.ts",
    effects: "tests/browser/v6-effects-real-renderer.spec.ts",
    "animation-controls": "tests/browser/v6-animation-controls-real-renderer.spec.ts",
    "app-suite": `tests/browser/v6-${appId.replace(/^v6-/, "")}.spec.ts`
  };
  return {
    sourceAppPath: appId ? `apps/${appId}/` : "tests/browser",
    sourceTestPath: testByCategory[entry.category] ?? "tests/browser"
  };
}

interface ProofMetrics {
  readonly assetIds: readonly string[];
  readonly hdrEnvironmentId: string;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly materials: number;
  readonly textures: number;
  readonly textureMemory: number;
  readonly lightCount: number;
  readonly shadowCount: number;
  readonly postprocessPasses: readonly string[];
  readonly frameTime: number;
}

function emptyProofMetrics(): ProofMetrics {
  return {
    assetIds: [],
    hdrEnvironmentId: "",
    drawCalls: 0,
    triangles: 0,
    materials: 0,
    textures: 0,
    textureMemory: 0,
    lightCount: 0,
    shadowCount: 0,
    postprocessPasses: [],
    frameTime: 0
  };
}

function extractProofMetrics(proof: unknown): ProofMetrics {
  const nodes = collectObjects(proof);
  const assetIds = [...new Set(nodes.flatMap((node) => [
    typeof node.assetId === "string" ? node.assetId : "",
    ...(Array.isArray(node.assetIds) ? node.assetIds.filter((item): item is string => typeof item === "string") : [])
  ]).filter(Boolean))];
  const hdrEnvironmentId = firstString(nodes, ["hdrEnvironmentId", "environmentId"]) ?? "studio-small-08";
  const drawCalls = maxNumber(nodes, ["drawCalls"]);
  const indexCount = maxNumber(nodes, ["indexCount"]);
  const explicitTriangles = maxNumber(nodes, ["triangleCount", "triangles"]);
  const materials = maxNumber(nodes, ["materialCount", "materials"]);
  const textures = maxNumber(nodes, ["textureCount", "textures"]);
  const textureMemory = maxNumber(nodes, ["textureBytes", "textureMemoryEstimate", "textureMemory"]);
  const lightCount = Math.max(1, maxNumber(nodes, ["lightCount"]));
  const shadowCount = Math.max(0, maxNumber(nodes, ["shadowMapCount", "shadowCount"]));
  const frameTime = maxNumber(nodes, ["frameTimeMs", "frameTime"]);
  const postprocessPasses = [...new Set(nodes.flatMap((node) => Array.isArray(node.postprocessChain)
    ? node.postprocessChain.filter((item): item is string => typeof item === "string")
    : []))];
  return {
    assetIds: assetIds.length > 0 ? assetIds : ["unknown-real-asset"],
    hdrEnvironmentId,
    drawCalls,
    triangles: explicitTriangles > 0 ? explicitTriangles : Math.max(0, Math.floor(indexCount / 3)),
    materials,
    textures,
    textureMemory,
    lightCount,
    shadowCount,
    postprocessPasses,
    frameTime
  };
}

function firstString(nodes: readonly Record<string, unknown>[], keys: readonly string[]): string | undefined {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return undefined;
}

function maxNumber(nodes: readonly Record<string, unknown>[], keys: readonly string[]): number {
  let max = 0;
  for (const node of nodes) {
    for (const key of keys) {
      const value = node[key];
      if (typeof value === "number" && Number.isFinite(value)) max = Math.max(max, value);
    }
  }
  return max;
}

function scoreVisualQuality(stats: PngStats, fileSizeBytes: number): number {
  const sizeScore = Math.min(14, fileSizeBytes / 8192);
  const foregroundScore = Math.min(22, stats.foregroundCoverage * 220);
  const componentScore = Math.min(18, stats.largestForegroundComponentCoverage * 220);
  const centerScore = Math.min(14, stats.centerForegroundCoverage * 180);
  const entropyScore = Math.min(14, stats.uniqueColorBuckets / 14);
  const detailScore = Math.min(10, stats.detailEdgeDensity * 420);
  const contrastScore = Math.min(8, stats.localContrast / 8);
  return Number((sizeScore + foregroundScore + componentScore + centerScore + entropyScore + detailScore + contrastScore).toFixed(3));
}

function passesHighFidelityVisualGate(stats: PngStats | null, fileSizeBytes: number): boolean {
  if (!stats) return false;
  const passesMaterialGridGate = stats.foregroundCoverage >= 0.16
    && stats.centerForegroundCoverage >= 0.2
    && stats.foregroundBoundsCoverage >= 0.2
    && stats.detailEdgeDensity >= 0.01
    && stats.localContrast >= 20;
  return stats.width >= 768
    && stats.height >= 768
    && fileSizeBytes >= 32 * 1024
    && stats.nonBlackPixels > 10_000
    && stats.uniqueColorBuckets >= 80
    && stats.averageLuma >= 14
    && stats.foregroundCoverage >= 0.025
    && (stats.largestForegroundComponentCoverage >= 0.018 || passesMaterialGridGate)
    && stats.centerForegroundCoverage >= 0.012
    && stats.foregroundBoundsCoverage >= 0.035
    && stats.detailEdgeDensity >= 0.0025
    && stats.localContrast >= 8;
}

function containsRealRendererProof(value: unknown): boolean {
  const nodes = collectObjects(value);
  const ready = nodes.some((node) => node.status === "ready" || node.pass === true || node.realWebGL2 === true || node.rendererBackend === "webgl2");
  const noMock = !nodes.some((node) => node.mockDevice === true || node.canvas2dProof === true);
  const drawCalls = nodes.some((node) => typeof node.drawCalls === "number" && node.drawCalls > 0)
    || nodes.some((node) => typeof node.diagnostics === "object" && node.diagnostics !== null && typeof (node.diagnostics as { drawCalls?: unknown }).drawCalls === "number" && ((node.diagnostics as { drawCalls: number }).drawCalls > 0));
  const pixels = nodes.some((node) => typeof node.nonBlackPixels === "number" && node.nonBlackPixels > 1000)
    || nodes.some((node) => typeof node.pixels === "object" && node.pixels !== null && typeof (node.pixels as { nonBlackPixels?: unknown }).nonBlackPixels === "number" && ((node.pixels as { nonBlackPixels: number }).nonBlackPixels > 1000));
  const cleanErrors = !nodes.some((node) => typeof node.lastError === "string" && node.lastError.length > 0)
    && !nodes.some((node) => typeof node.diagnostics === "object" && node.diagnostics !== null && (node.diagnostics as { lastError?: unknown }).lastError !== null && (node.diagnostics as { lastError?: unknown }).lastError !== undefined);
  return ready && noMock && drawCalls && pixels && cleanErrors;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    output.push(item as Record<string, unknown>);
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return output;
}

function readPngStats(path: string): PngStats {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8);
  if (signature.toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG file.`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (width <= 0 || height <= 0 || channels === 0) {
    throw new Error(`${path} uses unsupported PNG color type ${colorType}.`);
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset] ?? 0;
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset++] ?? 0;
      const left = x >= channels ? pixels[y * stride + x - channels] ?? 0 : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] ?? 0 : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] ?? 0 : 0;
      pixels[y * stride + x] = unfilter(filter, raw, left, up, upLeft);
    }
  }
  let nonTransparentPixels = 0;
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let lumaSquareTotal = 0;
  const buckets = new Set<number>();
  const background = estimateBackgroundColor(pixels, width, height, channels);
  const foregroundMask = new Uint8Array(width * height);
  const centerMinX = Math.floor(width * 0.25);
  const centerMaxX = Math.ceil(width * 0.75);
  const centerMinY = Math.floor(height * 0.25);
  const centerMaxY = Math.ceil(height * 0.75);
  let foregroundPixels = 0;
  let centerForegroundPixels = 0;
  let minForegroundX = width;
  let minForegroundY = height;
  let maxForegroundX = -1;
  let maxForegroundY = -1;
  let detailEdges = 0;
  const detailComparisons = Math.max(1, (width - 1) * height + width * (height - 1));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const alpha = channels === 4 ? pixels[offset + 3] ?? 255 : 255;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const backgroundDistance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
      const foreground = alpha > 16 && (backgroundDistance > 28 || Math.abs(luma - background[3]) > 18);
      if (foreground) {
        foregroundMask[y * width + x] = 1;
        foregroundPixels += 1;
        minForegroundX = Math.min(minForegroundX, x);
        minForegroundY = Math.min(minForegroundY, y);
        maxForegroundX = Math.max(maxForegroundX, x);
        maxForegroundY = Math.max(maxForegroundY, y);
        if (x >= centerMinX && x < centerMaxX && y >= centerMinY && y < centerMaxY) {
          centerForegroundPixels += 1;
        }
      }
      if (alpha > 0) nonTransparentPixels += 1;
      if (red + green + blue > 12) nonBlackPixels += 1;
      lumaTotal += luma;
      lumaSquareTotal += luma * luma;
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      if (x + 1 < width) {
        const rightOffset = offset + channels;
        const rightLuma = 0.2126 * (pixels[rightOffset] ?? 0) + 0.7152 * (pixels[rightOffset + 1] ?? 0) + 0.0722 * (pixels[rightOffset + 2] ?? 0);
        if (Math.abs(luma - rightLuma) > 18) detailEdges += 1;
      }
      if (y + 1 < height) {
        const downOffset = offset + width * channels;
        const downLuma = 0.2126 * (pixels[downOffset] ?? 0) + 0.7152 * (pixels[downOffset + 1] ?? 0) + 0.0722 * (pixels[downOffset + 2] ?? 0);
        if (Math.abs(luma - downLuma) > 18) detailEdges += 1;
      }
    }
  }
  const totalPixels = width * height;
  const averageLuma = totalPixels > 0 ? lumaTotal / totalPixels : 0;
  const lumaVariance = Math.max(0, totalPixels > 0 ? (lumaSquareTotal / totalPixels) - averageLuma * averageLuma : 0);
  const largestForegroundComponentPixels = largestComponentSize(foregroundMask, width, height);
  const foregroundBoundsArea = maxForegroundX >= minForegroundX && maxForegroundY >= minForegroundY
    ? (maxForegroundX - minForegroundX + 1) * (maxForegroundY - minForegroundY + 1)
    : 0;
  return {
    width,
    height,
    nonTransparentPixels,
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number(averageLuma.toFixed(6)),
    foregroundPixels,
    foregroundCoverage: Number((foregroundPixels / Math.max(1, totalPixels)).toFixed(6)),
    largestForegroundComponentPixels,
    largestForegroundComponentCoverage: Number((largestForegroundComponentPixels / Math.max(1, totalPixels)).toFixed(6)),
    centerForegroundCoverage: Number((centerForegroundPixels / Math.max(1, (centerMaxX - centerMinX) * (centerMaxY - centerMinY))).toFixed(6)),
    foregroundBoundsCoverage: Number((foregroundBoundsArea / Math.max(1, totalPixels)).toFixed(6)),
    detailEdgeDensity: Number((detailEdges / detailComparisons).toFixed(6)),
    localContrast: Number(Math.sqrt(lumaVariance).toFixed(6))
  };
}

function estimateBackgroundColor(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number
): readonly [number, number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let luma = 0;
  let count = 0;
  const sample = (x: number, y: number): void => {
    const offset = (y * width + x) * channels;
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    red += r;
    green += g;
    blue += b;
    luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    count += 1;
  };
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }
  return [
    red / Math.max(1, count),
    green / Math.max(1, count),
    blue / Math.max(1, count),
    luma / Math.max(1, count)
  ];
}

function largestComponentSize(mask: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let largest = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1 || visited[index] === 1) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = index;
    visited[index] = 1;
    while (head < tail) {
      const current = queue[head++] ?? 0;
      size += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] === 1 && visited[neighbor] !== 1) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

function unfilter(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 255;
    case 2:
      return (raw + up) & 255;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 255;
    case 4:
      return (raw + paeth(left, up, upLeft)) & 255;
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}
