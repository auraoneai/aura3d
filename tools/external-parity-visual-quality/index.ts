import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { baseReport, readJson, writeJson } from "../external-parity-reporting/index.js";

const defaultRoot = process.cwd();
const visualReviewPath = "tests/reports/external-parity-example-visual-review.json";
const requiredScreenshots: readonly RequiredScreenshot[] = [
  { id: "product-configurator", path: "tests/reports/external-parity-example-screenshots/product-configurator.png", source: "manifest", minNonBlankPixels: 12_000, minColorBuckets: 4, minOccupiedAreaRatio: 0.18, minOccupiedQuadrants: 3, minImageColorBuckets: 18, minMeanLuma: 48, maxDarkPixelRatio: 0.42, maxDominantBucketRatio: 0.5, minEdgePixelRatio: 0.03, maxFlatPixelRatio: 0.74, minLocalContrastRatio: 0.08, minCanvasColorBuckets: 64, minCanvasEdgePixelRatio: 0.025, maxCanvasDominantBucketRatio: 0.34, maxCanvasFlatPixelRatio: 0.72, minCanvasLocalContrastRatio: 0.085 },
  { id: "product-visual-parity-aura3d", path: "tests/reports/external-parity-product-visual-parity/aura3d-product.png", source: "standalone", minImageColorBuckets: 24, minMeanLuma: 80, maxDarkPixelRatio: 0.2, maxDominantBucketRatio: 0.62, minEdgePixelRatio: 0.025, maxFlatPixelRatio: 0.72, minLocalContrastRatio: 0.09 },
  { id: "architecture-viewer", path: "tests/reports/external-parity-example-screenshots/architecture-viewer.png", source: "manifest", minNonBlankPixels: 12_000, minColorBuckets: 10, minOccupiedAreaRatio: 0.18, minOccupiedQuadrants: 3, minImageColorBuckets: 22, minMeanLuma: 52, maxDarkPixelRatio: 0.44, maxDominantBucketRatio: 0.5, minEdgePixelRatio: 0.04, maxFlatPixelRatio: 0.68, minLocalContrastRatio: 0.12, minCanvasColorBuckets: 120, minCanvasEdgePixelRatio: 0.045, maxCanvasDominantBucketRatio: 0.28, maxCanvasFlatPixelRatio: 0.64, minCanvasLocalContrastRatio: 0.14 },
  { id: "game-slice", path: "tests/reports/external-parity-example-screenshots/game-slice.png", source: "manifest", minNonBlankPixels: 12_000, minColorBuckets: 6, minOccupiedAreaRatio: 0.18, minOccupiedQuadrants: 3, minImageColorBuckets: 24, minMeanLuma: 42, maxDarkPixelRatio: 0.34, maxDominantBucketRatio: 0.5, minEdgePixelRatio: 0.05, maxFlatPixelRatio: 0.68, minLocalContrastRatio: 0.12, minCanvasColorBuckets: 220, minCanvasEdgePixelRatio: 0.045, maxCanvasDominantBucketRatio: 0.28, maxCanvasFlatPixelRatio: 0.68, minCanvasLocalContrastRatio: 0.12 },
  { id: "racing-showcase", path: "tests/reports/external-parity-example-screenshots/racing-showcase.png", source: "standalone", minNonBlankPixels: 8_000, minColorBuckets: 6, minImageColorBuckets: 22, minMeanLuma: 50, maxDarkPixelRatio: 0.42, maxDominantBucketRatio: 0.52, minEdgePixelRatio: 0.043, maxFlatPixelRatio: 0.7, minLocalContrastRatio: 0.1 },
  { id: "asset-viewer", path: "tests/reports/external-parity-example-screenshots/asset-viewer.png", source: "asset-viewer" },
  { id: "material-showroom", path: "tests/reports/external-parity-example-screenshots/material-showroom.png", source: "rendering", validationName: "material-showroom-v4-preset", minImageColorBuckets: 24, minMeanLuma: 70, maxDarkPixelRatio: 0.5, maxDominantBucketRatio: 0.48, minEdgePixelRatio: 0.037, maxFlatPixelRatio: 0.66, minLocalContrastRatio: 0.11 },
  { id: "postprocess-lab", path: "tests/reports/external-parity-example-screenshots/postprocess-lab.png", source: "rendering", validationName: "postprocess-lab-v4-preset", minImageColorBuckets: 10, minMeanLuma: 18, maxDarkPixelRatio: 0.82, maxDominantBucketRatio: 0.78, minEdgePixelRatio: 0.03, maxFlatPixelRatio: 0.76, minLocalContrastRatio: 0.07 },
  { id: "shadow-lab", path: "tests/reports/external-parity-example-screenshots/shadow-lab.png", source: "rendering", validationName: "shadow-lab-v4-preset", minImageColorBuckets: 8, minMeanLuma: 42, maxDarkPixelRatio: 0.48, maxDominantBucketRatio: 0.72, minEdgePixelRatio: 0.04, maxFlatPixelRatio: 0.68, minLocalContrastRatio: 0.09 },
] as const;

export function createV4VisualQualityReport(root = defaultRoot) {
  const manifest = readJson(root, "tests/reports/external-parity-example-screenshots/manifest.json");
  const renderingReport = readJson(root, "tests/reports/external-parity-rendering.json");
  const assetViewerReport = readJson(root, "tests/reports/external-parity-asset-viewer-browser.json");
  const visualReview = readJson(root, visualReviewPath);
  const manifestPasses = manifest?.pass === true || manifest?.ok === true;
  const screenshotResults = requiredScreenshots.map((screenshot) => validateScreenshot(root, screenshot));
  const missingScreenshots = screenshotResults.filter((result) => !result.exists);
  const invalidScreenshots = screenshotResults.filter((result) => result.exists && !result.ok);
  const manifestEntries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const manifestCoverage = requiredScreenshots
    .filter((screenshot) => screenshot.source === "manifest")
    .map((screenshot) => validateManifestEvidence(screenshot, manifestEntries));
  const renderingEvidence = requiredScreenshots
    .filter((screenshot) => screenshot.source === "rendering")
    .map((screenshot) => validateRenderingEvidence(screenshot, renderingReport));
  const assetViewerEvidence = validateAssetViewerEvidence(assetViewerReport);
  const portfolioFreshness = validatePortfolioFreshness(root, manifest);
  const portfolioBlockedCards = validatePortfolioBlockedCards(manifest);
  const staticSceneComposition = validateStaticSceneComposition(root);
  const primaryAssetChecks = [
    ...manifestCoverage.map((entry) => ({
      id: `v4-primary-asset-visible-${entry.id}`,
      passed: entry.passed,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json"],
      blocker: `${entry.id} primary asset is missing, tiny, or visually under-evidenced: ${entry.reason}`,
    })),
    {
      id: "v4-primary-asset-visible-asset-viewer",
      passed: assetViewerEvidence.primaryAssetVisible,
      evidencePaths: ["tests/reports/external-parity-asset-viewer-browser.json", "tests/reports/external-parity-example-screenshots/asset-viewer.png"],
      blocker: assetViewerEvidence.primaryAssetBlocker,
    },
  ];
  const realAssetChecks = [
    ...manifestCoverage.map((entry) => ({
      id: `v4-real-asset-claimed-${entry.id}`,
      passed: entry.realAssetClaimed,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json"],
      blocker: `${entry.id} does not expose required real/generated-asset feature evidence.`,
    })),
    {
      id: "v4-real-asset-claimed-asset-viewer",
      passed: assetViewerEvidence.realTexturedAsset,
      evidencePaths: ["tests/reports/external-parity-asset-viewer-browser.json"],
      blocker: assetViewerEvidence.realAssetBlocker,
    },
  ];
  const shadowChecks = [
    {
      id: "v4-shadows-visible-product",
      passed: manifestCoverage.find((entry) => entry.id === "product-configurator")?.shadowClaimed === true,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json"],
      blocker: "Product configurator does not expose visible shadow/contact-shadow evidence.",
    },
    {
      id: "v4-shadows-visible-architecture",
      passed: manifestCoverage.find((entry) => entry.id === "architecture-viewer")?.shadowClaimed === true,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json"],
      blocker: "Architecture viewer does not expose visible shadow/contact-shadow evidence.",
    },
    {
      id: "v4-shadows-visible-shadow-lab",
      passed: renderingEvidence.find((entry) => entry.id === "shadow-lab")?.passed === true,
      evidencePaths: ["tests/reports/external-parity-rendering.json", "tests/reports/external-parity-example-screenshots/shadow-lab.png"],
      blocker: renderingEvidence.find((entry) => entry.id === "shadow-lab")?.reason ?? "Shadow lab evidence is missing.",
    },
  ];
  const postprocessChecks = [
    {
      id: "v4-postprocess-changes-pixels-postprocess-lab",
      passed: renderingEvidence.find((entry) => entry.id === "postprocess-lab")?.postprocessChanged === true,
      evidencePaths: ["tests/reports/external-parity-rendering.json", "tests/reports/external-parity-example-screenshots/postprocess-lab.png"],
      blocker: renderingEvidence.find((entry) => entry.id === "postprocess-lab")?.reason ?? "Postprocess lab pixel-change evidence is missing.",
    },
    {
      id: "v4-postprocess-evidence-material-showroom",
      passed: renderingEvidence.find((entry) => entry.id === "material-showroom")?.postprocessChanged === true,
      evidencePaths: ["tests/reports/external-parity-rendering.json", "tests/reports/external-parity-example-screenshots/material-showroom.png"],
      blocker: renderingEvidence.find((entry) => entry.id === "material-showroom")?.reason ?? "Material showroom postprocess evidence is missing.",
    },
  ];
  const primitiveDominance = validatePrimitiveDominance(manifestCoverage, renderingEvidence, assetViewerEvidence);
  const manualVisualApproval = validateManualVisualApproval(visualReview, requiredScreenshots.map((screenshot) => screenshot.id));
  const checks = [
    {
      id: "v4-example-screenshots-present",
      passed: missingScreenshots.length === 0,
      evidencePaths: requiredScreenshots.map((screenshot) => screenshot.path),
      blocker: "V4 screenshots are missing; visual credibility gate remains blocked.",
    },
    {
      id: "v4-screenshot-files-valid",
      passed: invalidScreenshots.length === 0,
      evidencePaths: requiredScreenshots.map((screenshot) => screenshot.path),
      blocker: `V4 screenshots are blank, tiny, corrupt, or badly framed: ${invalidScreenshots.map((entry) => entry.id).join(", ")}`,
    },
    {
      id: "v4-screenshot-manifest-passes",
      passed: manifestPasses,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json"],
      blocker: "V4 screenshot manifest is missing or failing.",
    },
    ...primaryAssetChecks,
    ...realAssetChecks,
    ...shadowChecks,
    ...postprocessChecks,
    {
      id: "v4-portfolio-screenshot-fresh",
      passed: portfolioFreshness.passed,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json", "tests/reports/external-parity-example-screenshots/portfolio.png"],
      blocker: portfolioFreshness.reason,
    },
    {
      id: "v4-portfolio-has-no-visual-blocked-featured-cards",
      passed: portfolioBlockedCards.blockedCardIds.length === 0,
      evidencePaths: ["tests/reports/external-parity-example-screenshots/manifest.json", "examples/portfolio/main.ts"],
      blocker: `Portfolio still marks featured cards as visual-blocked: ${portfolioBlockedCards.blockedCardIds.join(", ") || "none"}. These pages must not be treated as completed visual-quality evidence until the cards are visually approved.`,
    },
    {
      id: "v4-not-debug-or-primitive-dominated",
      passed: primitiveDominance.passed && staticSceneComposition.passed,
      evidencePaths: [
        "tests/reports/external-parity-example-screenshots/manifest.json",
        "tests/reports/external-parity-rendering.json",
        "tests/reports/external-parity-asset-viewer-browser.json",
        ...staticSceneComposition.evidencePaths,
      ],
      blocker: `${primitiveDominance.reason}; ${staticSceneComposition.reason}`,
    },
    {
      id: "v4-current-screenshots-have-explicit-visual-approval",
      passed: manualVisualApproval.passed,
      evidencePaths: [visualReviewPath],
      blocker: manualVisualApproval.reason,
    },
    {
      id: "v4-manual-review-cannot-override-automation",
      passed: true,
      evidencePaths: ["tools/external-parity-visual-quality/index.ts"],
      blocker: "Manual review notes must not override automated visual gate failures.",
    },
  ];
  const violations = checks.filter((check) => !check.passed).map((check) => check.blocker);
  const report = {
    ...baseReport(root, {
      ok: violations.length === 0,
      command: "pnpm verify:external-parity-visual-quality",
      runIdPrefix: "external-parity-visual-quality",
      sourceFiles: [
        "tools/external-parity-visual-quality/index.ts",
        "tests/reports/external-parity-example-screenshots/manifest.json",
        "tests/reports/external-parity-rendering.json",
        "tests/reports/external-parity-asset-viewer-browser.json",
        visualReviewPath,
        ...requiredScreenshots.map((screenshot) => screenshot.path),
      ],
      screenshotPaths: requiredScreenshots.map((screenshot) => screenshot.path).filter((path) => existsSync(`${root}/${path}`)),
      violations,
    }),
    checks,
    screenshotResults,
    manifestCoverage,
    renderingEvidence,
    assetViewerEvidence,
    portfolioFreshness,
    portfolioBlockedCards,
    primitiveDominance,
    staticSceneComposition,
    manualVisualApproval,
    manualReviewNotes: "Manual review cannot be bypassed by nonblank-pixel metrics. If the portfolio marks a card visual-blocked, this verifier remains failed until the underlying scene and card status are corrected.",
  };
  writeJson(root, "tests/reports/external-parity-visual-quality.json", report);
  return report;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createV4VisualQualityReport();
  console.log(JSON.stringify({ ok: report.ok, violations: report.violations.length }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

interface RequiredScreenshot {
  readonly id: string;
  readonly path: string;
  readonly source: "manifest" | "rendering" | "asset-viewer" | "standalone";
  readonly validationName?: string;
  readonly minNonBlankPixels?: number;
  readonly minColorBuckets?: number;
  readonly minOccupiedAreaRatio?: number;
  readonly minOccupiedQuadrants?: number;
  readonly minImageColorBuckets?: number;
  readonly minMeanLuma?: number;
  readonly maxDarkPixelRatio?: number;
  readonly maxDominantBucketRatio?: number;
  readonly minEdgePixelRatio?: number;
  readonly maxFlatPixelRatio?: number;
  readonly minLocalContrastRatio?: number;
  readonly minCanvasColorBuckets?: number;
  readonly minCanvasEdgePixelRatio?: number;
  readonly maxCanvasDominantBucketRatio?: number;
  readonly maxCanvasFlatPixelRatio?: number;
  readonly minCanvasLocalContrastRatio?: number;
}

interface ScreenshotValidation {
  readonly id: string;
  readonly path: string;
  readonly exists: boolean;
  readonly ok: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly visualStats?: PngVisualStats;
  readonly reason?: string;
}

interface PngVisualStats {
  readonly meanLuma: number;
  readonly darkPixelRatio: number;
  readonly dominantBucketRatio: number;
  readonly colorBuckets: number;
  readonly edgePixelRatio: number;
  readonly flatPixelRatio: number;
  readonly localContrastRatio: number;
}

function validateScreenshot(root: string, screenshot: RequiredScreenshot): ScreenshotValidation {
  const fullPath = `${root}/${screenshot.path}`;
  if (!existsSync(fullPath)) {
    return { id: screenshot.id, path: screenshot.path, exists: false, ok: false, reason: "missing" };
  }
  const dimensions = readPngDimensions(fullPath);
  const byteLength = statSync(fullPath).size;
  const visualStats = dimensions.ok ? readPngVisualStats(fullPath, dimensions.width, dimensions.height) : null;
  const visualFailures = visualStats ? validatePngVisualStats(visualStats, screenshot) : ["png-visual-stats-unavailable"];
  const ok = dimensions.ok && dimensions.width >= 320 && dimensions.height >= 220 && byteLength > 4_096 && visualFailures.length === 0;
  return {
    id: screenshot.id,
    path: screenshot.path,
    exists: true,
    ok,
    width: dimensions.width,
    height: dimensions.height,
    byteLength,
    visualStats: visualStats ?? undefined,
    reason: ok ? undefined : dimensions.ok ? ["image is too small, empty, or visually weak", ...visualFailures].join(": ") : dimensions.reason,
  };
}

function readPngDimensions(path: string): { readonly ok: true; readonly width: number; readonly height: number } | { readonly ok: false; readonly width: number; readonly height: number; readonly reason: string } {
  const data = readFileSync(path);
  const isPng =
    data.length >= 24
    && data[0] === 0x89
    && data[1] === 0x50
    && data[2] === 0x4e
    && data[3] === 0x47
    && data[4] === 0x0d
    && data[5] === 0x0a
    && data[6] === 0x1a
    && data[7] === 0x0a;
  if (!isPng) return { ok: false, width: 0, height: 0, reason: "not a PNG file" };
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width === 0 || height === 0) return { ok: false, width, height, reason: "PNG has zero dimensions" };
  return { ok: true, width, height };
}

function validatePngVisualStats(stats: PngVisualStats, screenshot: RequiredScreenshot): string[] {
  const failures: string[] = [];
  if (screenshot.minImageColorBuckets !== undefined && stats.colorBuckets < screenshot.minImageColorBuckets) {
    failures.push(`image-color-buckets ${stats.colorBuckets} < ${screenshot.minImageColorBuckets}`);
  }
  if (screenshot.minMeanLuma !== undefined && stats.meanLuma < screenshot.minMeanLuma) {
    failures.push(`mean-luma ${stats.meanLuma} < ${screenshot.minMeanLuma}`);
  }
  if (screenshot.maxDarkPixelRatio !== undefined && stats.darkPixelRatio > screenshot.maxDarkPixelRatio) {
    failures.push(`dark-pixel-ratio ${stats.darkPixelRatio} > ${screenshot.maxDarkPixelRatio}`);
  }
  if (screenshot.maxDominantBucketRatio !== undefined && stats.dominantBucketRatio > screenshot.maxDominantBucketRatio) {
    failures.push(`dominant-bucket-ratio ${stats.dominantBucketRatio} > ${screenshot.maxDominantBucketRatio}`);
  }
  if (screenshot.minEdgePixelRatio !== undefined && stats.edgePixelRatio < screenshot.minEdgePixelRatio) {
    failures.push(`edge-pixel-ratio ${stats.edgePixelRatio} < ${screenshot.minEdgePixelRatio}`);
  }
  if (screenshot.maxFlatPixelRatio !== undefined && stats.flatPixelRatio > screenshot.maxFlatPixelRatio) {
    failures.push(`flat-pixel-ratio ${stats.flatPixelRatio} > ${screenshot.maxFlatPixelRatio}`);
  }
  if (screenshot.minLocalContrastRatio !== undefined && stats.localContrastRatio < screenshot.minLocalContrastRatio) {
    failures.push(`local-contrast-ratio ${stats.localContrastRatio} < ${screenshot.minLocalContrastRatio}`);
  }
  return failures;
}

function readPngVisualStats(path: string, width: number, height: number): PngVisualStats | null {
  const data = readFileSync(path);
  let offset = 8;
  let colorType = -1;
  let bitDepth = -1;
  let interlace = -1;
  const idatChunks: Buffer[] = [];
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      bitDepth = chunk[8] ?? -1;
      colorType = chunk[9] ?? -1;
      interlace = chunk[12] ?? -1;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(chunk));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6) || idatChunks.length === 0) {
    return null;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? -1;
    sourceOffset += 1;
    const current = new Uint8Array(stride);
    current.set(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    unfilterScanline(current, previous, channels, filter);
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = current[source] ?? 0;
      pixels[target + 1] = current[source + 1] ?? 0;
      pixels[target + 2] = current[source + 2] ?? 0;
      pixels[target + 3] = channels === 4 ? current[source + 3] ?? 255 : 255;
    }
    previous = current;
  }
  return summarizeRgbaPixels(pixels, width, height);
}

function unfilterScanline(current: Uint8Array, previous: Uint8Array, bytesPerPixel: number, filter: number): void {
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] ?? 0 : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    else if (filter === 2) predictor = up;
    else if (filter === 3) predictor = Math.floor((left + up) / 2);
    else if (filter === 4) predictor = paeth(left, up, upLeft);
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
    current[index] = (current[index]! + predictor) & 0xff;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function summarizeRgbaPixels(pixels: Uint8Array, width: number, height: number): PngVisualStats {
  const buckets = new Map<string, number>();
  let lumaSum = 0;
  let darkPixels = 0;
  let edgePixels = 0;
  let flatPixels = 0;
  let localContrastPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    if (luma < 18) darkPixels += 1;
    const bucket = `${r >> 5}:${g >> 5}:${b >> 5}`;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const left = index - 4;
      const up = index - width * 4;
      const luma = pixelLuma(pixels, index);
      const delta = Math.abs(luma - pixelLuma(pixels, left)) + Math.abs(luma - pixelLuma(pixels, up));
      if (delta > 42) edgePixels += 1;
      if (delta <= 2) flatPixels += 1;
      if (delta >= 8) localContrastPixels += 1;
    }
  }
  const pixelCount = Math.max(1, width * height);
  const dominantBucket = Math.max(0, ...buckets.values());
  return {
    meanLuma: Number((lumaSum / pixelCount).toFixed(2)),
    darkPixelRatio: Number((darkPixels / pixelCount).toFixed(4)),
    dominantBucketRatio: Number((dominantBucket / pixelCount).toFixed(4)),
    colorBuckets: buckets.size,
    edgePixelRatio: Number((edgePixels / pixelCount).toFixed(4)),
    flatPixelRatio: Number((flatPixels / pixelCount).toFixed(4)),
    localContrastRatio: Number((localContrastPixels / pixelCount).toFixed(4)),
  };
}

function pixelLuma(pixels: Uint8Array, index: number): number {
  return 0.2126 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.0722 * (pixels[index + 2] ?? 0);
}

function validateManifestEvidence(screenshot: RequiredScreenshot, entries: readonly unknown[]) {
  const entry = entries.find((candidate) => {
    return isRecord(candidate) && candidate.id === screenshot.id;
  });
  const featureEvidence = isRecord(entry) && isRecord(entry.featureEvidence) ? entry.featureEvidence : null;
  const pixelStats = isRecord(entry) && isRecord(entry.pixelStats) ? entry.pixelStats : null;
  const canvasVisualStats = isRecord(entry) && isRecord(entry.canvasVisualStats) ? entry.canvasVisualStats : null;
  const nonBlankPixels = Number(pixelStats?.nonBlankPixels ?? 0);
  const colorBuckets = Number(pixelStats?.colorBuckets ?? 0);
  const quality = validateVisualGateEntry(entry, screenshot);
  const canvasQuality = validateCanvasVisualQuality(canvasVisualStats, screenshot);
  const passed = quality.passed && canvasQuality.passed;
  const realAssetClaimed = Boolean(
    featureEvidence?.modelBacked
    || featureEvidence?.v4ProductAssetLoaded
    || featureEvidence?.roomModel
    || featureEvidence?.levelAssetLoaded
    || featureEvidence?.playerAssetLoaded,
  );
  const shadowClaimed = Boolean(featureEvidence?.contactShadowAlternative || featureEvidence?.stableShadows || featureEvidence?.shadows);
  return {
    id: screenshot.id,
    passed,
    realAssetClaimed,
    shadowClaimed,
    nonBlankPixels,
    colorBuckets,
    quality,
    canvasQuality,
    reason: entry ? `${quality.reason}; ${canvasQuality.reason}; nonBlankPixels=${nonBlankPixels}, colorBuckets=${colorBuckets}, occupiedAreaRatio=${quality.occupiedAreaRatio}, occupiedQuadrants=${quality.occupiedQuadrants}` : "missing manifest entry",
  };
}

function validateCanvasVisualQuality(canvasVisualStats: Record<string, unknown> | null, screenshot: Pick<RequiredScreenshot, "minCanvasColorBuckets" | "minCanvasEdgePixelRatio" | "maxCanvasDominantBucketRatio" | "maxCanvasFlatPixelRatio" | "minCanvasLocalContrastRatio">) {
  if (!canvasVisualStats) {
    return { passed: false, reason: "missing full-canvas visual stats" };
  }
  const colorBuckets = Number(canvasVisualStats.colorBuckets ?? 0);
  const edgePixelRatio = Number(canvasVisualStats.edgePixelRatio ?? 0);
  const dominantBucketRatio = Number(canvasVisualStats.dominantBucketRatio ?? 1);
  const flatPixelRatio = Number(canvasVisualStats.flatPixelRatio ?? 1);
  const localContrastRatio = Number(canvasVisualStats.localContrastRatio ?? 0);
  const failures = [
    screenshot.minCanvasColorBuckets !== undefined && colorBuckets < screenshot.minCanvasColorBuckets
      ? `canvas-color-buckets ${colorBuckets} < ${screenshot.minCanvasColorBuckets}`
      : "",
    screenshot.minCanvasEdgePixelRatio !== undefined && edgePixelRatio < screenshot.minCanvasEdgePixelRatio
      ? `canvas-edge-pixel-ratio ${edgePixelRatio} < ${screenshot.minCanvasEdgePixelRatio}`
      : "",
    screenshot.maxCanvasDominantBucketRatio !== undefined && dominantBucketRatio > screenshot.maxCanvasDominantBucketRatio
      ? `canvas-dominant-bucket-ratio ${dominantBucketRatio} > ${screenshot.maxCanvasDominantBucketRatio}`
      : "",
    screenshot.maxCanvasFlatPixelRatio !== undefined && flatPixelRatio > screenshot.maxCanvasFlatPixelRatio
      ? `canvas-flat-pixel-ratio ${flatPixelRatio} > ${screenshot.maxCanvasFlatPixelRatio}`
      : "",
    screenshot.minCanvasLocalContrastRatio !== undefined && localContrastRatio < screenshot.minCanvasLocalContrastRatio
      ? `canvas-local-contrast-ratio ${localContrastRatio} < ${screenshot.minCanvasLocalContrastRatio}`
      : "",
  ].filter(Boolean);
  return {
    passed: failures.length === 0,
    reason: failures.length === 0 ? "full-canvas visual stats passed" : failures.join(","),
    colorBuckets,
    edgePixelRatio,
    dominantBucketRatio,
    flatPixelRatio,
    localContrastRatio,
  };
}

export function validateVisualGateEntry(entry: unknown, screenshot: Pick<RequiredScreenshot, "id" | "path" | "minNonBlankPixels" | "minColorBuckets" | "minOccupiedAreaRatio" | "minOccupiedQuadrants">) {
  if (!isRecord(entry)) return { passed: false, reason: "missing manifest entry" };
  const pixelStats = isRecord(entry.pixelStats) ? entry.pixelStats : {};
  const featureEvidence = isRecord(entry.featureEvidence) ? entry.featureEvidence : {};
  const nonBlankPixels = Number(pixelStats.nonBlankPixels ?? 0);
  const colorBuckets = Number(pixelStats.colorBuckets ?? 0);
  const occupiedAreaRatio = Number(pixelStats.occupiedAreaRatio ?? 0);
  const occupiedQuadrants = Number(pixelStats.occupiedQuadrants ?? 0);
  const visualClaim = String(entry.visualClaim ?? "");
  const claimBoundary = String(entry.claimBoundary ?? "");
  const screenshotPath = String(entry.screenshotPath ?? "");
  const expectedPath = screenshot.path;
  const darkOrFlat = nonBlankPixels < (screenshot.minNonBlankPixels ?? 1) || colorBuckets < (screenshot.minColorBuckets ?? 1);
  const spatiallyWeak = occupiedAreaRatio < (screenshot.minOccupiedAreaRatio ?? 0) || occupiedQuadrants < (screenshot.minOccupiedQuadrants ?? 1);
  const stale = screenshotPath.length > 0 && screenshotPath !== expectedPath;
  const debugDominated = /\b(debug|wireframe|placeholder)\b/i.test(`${visualClaim} ${claimBoundary}`) && featureEvidence.screenshotEvidencePath !== expectedPath;
  const primitiveOnly = !(
    featureEvidence.proceduralTextureFixturesApplied === true
    || featureEvidence.v4ProductAssetLoaded === true
    || featureEvidence.v4ArchitectureAssetLoaded === true
    || featureEvidence.levelAssetLoaded === true
    || featureEvidence.playerAssetLoaded === true
    || featureEvidence.v4RenderPreset === true
  );
  const failures = [
    darkOrFlat ? "dark-or-flat" : "",
    spatiallyWeak ? "spatially-weak" : "",
    stale ? "stale-screenshot-path" : "",
    debugDominated ? "debug-dominated" : "",
    primitiveOnly ? "primitive-only" : "",
  ].filter(Boolean);
  return {
    passed: failures.length === 0,
    reason: failures.length === 0 ? "visual gate entry passed" : failures.join(","),
    nonBlankPixels,
    colorBuckets,
    occupiedAreaRatio,
    occupiedQuadrants,
    stale,
    debugDominated,
    primitiveOnly,
    darkOrFlat,
    spatiallyWeak,
  };
}

function validateRenderingEvidence(screenshot: RequiredScreenshot, renderingReport: Record<string, unknown> | null) {
  const validations = Array.isArray(renderingReport?.validations) ? renderingReport.validations : [];
  const validation = validations.find((candidate) => {
    return isRecord(candidate) && candidate.name === screenshot.validationName && candidate.screenshotPath === screenshot.path;
  });
  const checks = isRecord(validation) && isRecord(validation.checks) ? validation.checks : null;
  const metrics = isRecord(validation) && isRecord(validation.metrics) ? validation.metrics : null;
  const passed = Boolean(renderingReport?.ok === true && isRecord(validation) && validation.ok === true);
  const postprocessChanged = Boolean(
    passed
    && (checks?.postprocessChanged === true || checks?.bloomChanged === true)
    && (Number(metrics?.bloomBoost ?? metrics?.bloomBrightPixels ?? 0) > 0),
  );
  return {
    id: screenshot.id,
    passed,
    postprocessChanged,
    reason: passed ? "rendering validation passed" : `missing or failing rendering validation ${screenshot.validationName}`,
  };
}

function validateAssetViewerEvidence(assetViewerReport: Record<string, unknown> | null) {
  const validations = Array.isArray(assetViewerReport?.validations) ? assetViewerReport.validations : [];
  const materialAsset = validations.find((candidate) => isRecord(candidate) && candidate.assetId === "v4-material-fidelity-card");
  const okValidations = validations.filter((candidate) => isRecord(candidate) && candidate.ok === true);
  const primaryAssetVisible = assetViewerReport?.ok === true
    && okValidations.length >= 7
    && okValidations.every((candidate) => Number(isRecord(candidate) ? candidate.nonBlankPixels ?? 0 : 0) >= 800);
  const textureSlots = isRecord(materialAsset) && Array.isArray(materialAsset.textureSlots) ? materialAsset.textureSlots : [];
  const realTexturedAsset = Boolean(
    primaryAssetVisible
    && isRecord(materialAsset)
    && Number(materialAsset.nonBlankPixels ?? 0) >= 12_000
    && textureSlots.length >= 4,
  );
  return {
    primaryAssetVisible,
    realTexturedAsset,
    validationCount: validations.length,
    materialTextureSlots: textureSlots,
    primaryAssetBlocker: "Asset viewer corpus screenshots are missing or at least one primary asset is too small.",
    realAssetBlocker: "Asset viewer does not prove a real textured material asset with multiple texture slots.",
  };
}

function validatePortfolioFreshness(root: string, manifest: Record<string, unknown> | null) {
  const manifestPath = `${root}/tests/reports/external-parity-example-screenshots/manifest.json`;
  const portfolioPath = `${root}/tests/reports/external-parity-example-screenshots/portfolio.png`;
  if (!existsSync(manifestPath)) return { passed: false, reason: "Portfolio freshness cannot be checked without manifest." };
  if (!existsSync(portfolioPath)) return { passed: false, reason: "Portfolio screenshot is missing." };
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const portfolioEntry = entries.find((entry) => isRecord(entry) && entry.id === "portfolio");
  const cards = isRecord(portfolioEntry) && Array.isArray(portfolioEntry.cards) ? portfolioEntry.cards : [];
  const hasCurrentCards = cards.length >= 3 && cards.every((card) => {
    if (!isRecord(card)) return false;
    const visualGate = isRecord(card.visualGate) ? card.visualGate : null;
    return typeof card.screenshotPath === "string"
      && card.screenshotPath.includes("/tests/reports/external-parity-example-screenshots/")
      && (visualGate?.status === "passed-v4-screenshot-audit" || visualGate?.status === "blocked-external-parity-visual-quality")
      && visualGate?.reportPath === "/tests/reports/external-parity-example-screenshots/manifest.json"
      && visualGate?.visualQualityReportPath === "/tests/reports/external-parity-visual-quality.json";
  });
  const manifestMtime = statSync(manifestPath).mtimeMs;
  const portfolioMtime = statSync(portfolioPath).mtimeMs;
  const notStale = portfolioMtime >= manifestMtime - 10 * 60 * 1000;
  return {
    passed: Boolean(portfolioEntry && hasCurrentCards && notStale),
    reason: portfolioEntry
      ? `portfolioCards=${cards.length}, currentCards=${hasCurrentCards}, screenshotMtime=${portfolioMtime}, manifestMtime=${manifestMtime}`
      : "Manifest is missing the portfolio entry.",
  };
}

function validatePortfolioBlockedCards(manifest: Record<string, unknown> | null) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const portfolioEntry = entries.find((entry) => isRecord(entry) && entry.id === "portfolio");
  const cards = isRecord(portfolioEntry) && Array.isArray(portfolioEntry.cards) ? portfolioEntry.cards : [];
  const blockedCardIds = cards
    .filter((card) => {
      if (!isRecord(card)) return false;
      const visualGate = isRecord(card.visualGate) ? card.visualGate : null;
      return visualGate?.status === "blocked-external-parity-visual-quality";
    })
    .map((card) => isRecord(card) && typeof card.id === "string" ? card.id : "unknown");
  return { blockedCardIds };
}

function validatePrimitiveDominance(
  manifestCoverage: readonly ReturnType<typeof validateManifestEvidence>[],
  renderingEvidence: readonly ReturnType<typeof validateRenderingEvidence>[],
  assetViewerEvidence: ReturnType<typeof validateAssetViewerEvidence>,
) {
  const flagshipEvidence = manifestCoverage.every((entry) => entry.realAssetClaimed && entry.passed);
  const rendererLabEvidence = renderingEvidence.every((entry) => entry.passed);
  const assetEvidence = assetViewerEvidence.realTexturedAsset;
  return {
    passed: flagshipEvidence && rendererLabEvidence && assetEvidence,
    reason: `flagshipEvidence=${flagshipEvidence}, rendererLabEvidence=${rendererLabEvidence}, assetEvidence=${assetEvidence}`,
  };
}

export function validateManualVisualApproval(review: unknown, requiredIds: readonly string[]) {
  if (!isRecord(review)) {
    return {
      passed: false,
      approvedIds: [] as string[],
      rejectedIds: [] as string[],
      missingIds: [...requiredIds],
      reason: `${visualReviewPath} is missing. Current screenshots need explicit visual approval; automated nonblank-pixel metrics are not enough.`,
    };
  }
  const status = typeof review.status === "string" ? review.status : "";
  const entries = Array.isArray(review.entries) ? review.entries : [];
  const approvedIds = entries
    .filter((entry) => isRecord(entry) && entry.status === "approved" && typeof entry.id === "string")
    .map((entry) => String((entry as Record<string, unknown>).id));
  const rejectedIds = entries
    .filter((entry) => isRecord(entry) && entry.status === "rejected" && typeof entry.id === "string")
    .map((entry) => String((entry as Record<string, unknown>).id));
  const missingIds = requiredIds.filter((id) => !approvedIds.includes(id));
  const reviewer = typeof review.reviewer === "string" ? review.reviewer : "";
  const approvedAt = typeof review.approvedAt === "string" ? review.approvedAt : "";
  const reviewedAt = typeof review.reviewedAt === "string" ? review.reviewedAt : "";
  const reviewReason = typeof review.reason === "string" ? review.reason : "";
  const passed = status === "approved" && reviewer.length > 0 && approvedAt.length > 0 && rejectedIds.length === 0 && missingIds.length === 0;
  if (status === "rejected") {
    const failures = [
      `manual visual review rejected the current screenshot set${reviewer.length > 0 ? ` by ${reviewer}` : ""}${reviewedAt.length > 0 ? ` at ${reviewedAt}` : ""}`,
      reviewReason.length > 0 ? `reason: ${reviewReason}` : "",
      rejectedIds.length > 0 ? `rejected screenshots: ${rejectedIds.join(", ")}` : "",
      missingIds.length > 0 ? `missing approved screenshots: ${missingIds.join(", ")}` : "",
    ].filter(Boolean);
    return {
      passed: false,
      approvedIds,
      rejectedIds,
      missingIds,
      reason: failures.join("; "),
    };
  }
  const failures = [
    status !== "approved" ? `status=${status || "missing"} is not approved` : "",
    reviewer.length === 0 ? "reviewer is missing" : "",
    approvedAt.length === 0 ? "approvedAt is missing" : "",
    rejectedIds.length > 0 ? `rejected screenshots: ${rejectedIds.join(", ")}` : "",
    missingIds.length > 0 ? `missing approved screenshots: ${missingIds.join(", ")}` : "",
  ].filter(Boolean);
  return {
    passed,
    approvedIds,
    rejectedIds,
    missingIds,
    reason: passed ? "current screenshot set has explicit visual approval" : failures.join("; "),
  };
}

function validateStaticSceneComposition(root: string) {
  const targets: readonly StaticSceneCompositionTarget[] = [
    {
      id: "product-configurator",
      path: "examples/product-configurator/main.ts",
      maxDepthDisabledMaterials: 4,
      maxDebugWordCount: 14,
      maxUnlitToPbrRatio: 0.45,
      maxPrimitiveFactoryCount: 8,
    },
    {
      id: "architecture-viewer",
      path: "examples/architecture-viewer/main.ts",
      maxDepthDisabledMaterials: 4,
      maxDebugWordCount: 8,
      maxUnlitToPbrRatio: 0.45,
      maxPrimitiveFactoryCount: 10,
    },
    {
      id: "game-slice",
      path: "examples/game-slice/main.ts",
      maxDepthDisabledMaterials: 5,
      maxDebugWordCount: 10,
      maxUnlitToPbrRatio: 0.55,
      maxPrimitiveFactoryCount: 8,
    },
    {
      id: "racing-showcase",
      path: "examples/racing-showcase/main.ts",
      maxDepthDisabledMaterials: 1,
      maxDebugWordCount: 12,
      maxUnlitToPbrRatio: 0.3,
      maxPrimitiveFactoryCount: 10,
    },
    {
      id: "material-showroom",
      path: "examples/material-showroom/main.ts",
      maxDepthDisabledMaterials: 3,
      maxDebugWordCount: 12,
      maxUnlitToPbrRatio: 0.25,
      maxPrimitiveFactoryCount: 3,
    },
  ];
  const results = targets.map((target) => validateStaticSceneCompositionTarget(root, target));
  const failed = results.filter((result) => !result.passed);
  return {
    passed: failed.length === 0,
    evidencePaths: targets.map((target) => target.path),
    results,
    reason: failed.length === 0
      ? "static scene composition is not debug/primitive dominated"
      : `static scene composition is still debug/primitive dominated: ${failed.map((result) => `${result.id}(${result.failures.join(",")})`).join("; ")}`,
  };
}

interface StaticSceneCompositionTarget {
  readonly id: string;
  readonly path: string;
  readonly maxDepthDisabledMaterials: number;
  readonly maxDebugWordCount: number;
  readonly maxUnlitToPbrRatio: number;
  readonly maxPrimitiveFactoryCount: number;
}

function validateStaticSceneCompositionTarget(root: string, target: StaticSceneCompositionTarget) {
  const source = readFileSync(`${root}/${target.path}`, "utf8");
  const pbrMaterialCount = countMatches(source, /\bnew\s+(?:TexturedPBRMaterial|PBRMaterial|NormalMappedPBRMaterial)\b/g);
  const unlitMaterialCount = countMatches(source, /\bnew\s+UnlitMaterial\b/g);
  const depthDisabledMaterialCount = countMatches(source, /\bdepthTest:\s*false\b/g);
  const primitiveFactoryCount = countMatches(source, /\bGeometry\.(?:litCube|texturedCube)\(1\)|\bGeometry\.lineSegments\b/g);
  const debugWordCount = countMatches(source, /\b(?:debug|guide|overlay|proxy|placeholder|wireframe)\b/gi);
  const unlitToPbrRatio = Number((unlitMaterialCount / Math.max(1, pbrMaterialCount)).toFixed(3));
  const failures = [
    depthDisabledMaterialCount > target.maxDepthDisabledMaterials ? `depth-disabled=${depthDisabledMaterialCount}>${target.maxDepthDisabledMaterials}` : "",
    debugWordCount > target.maxDebugWordCount ? `debug-words=${debugWordCount}>${target.maxDebugWordCount}` : "",
    unlitToPbrRatio > target.maxUnlitToPbrRatio ? `unlit-pbr-ratio=${unlitToPbrRatio}>${target.maxUnlitToPbrRatio}` : "",
    primitiveFactoryCount > target.maxPrimitiveFactoryCount ? `primitive-factories=${primitiveFactoryCount}>${target.maxPrimitiveFactoryCount}` : "",
  ].filter(Boolean);
  return {
    id: target.id,
    path: target.path,
    passed: failures.length === 0,
    pbrMaterialCount,
    unlitMaterialCount,
    depthDisabledMaterialCount,
    primitiveFactoryCount,
    debugWordCount,
    unlitToPbrRatio,
    failures,
  };
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
