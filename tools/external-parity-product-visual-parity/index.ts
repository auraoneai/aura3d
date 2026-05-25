import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "@playwright/test";
import { baseReport, isRecord, readJson, writeJson } from "../external-parity-reporting/index.js";
import { productVisualParityScene } from "./productScene.js";

type ProductVisualEngine = "galileo" | "threejs" | "babylon";

interface ProductVisualRender {
  readonly engine: ProductVisualEngine;
  readonly screenshotPath: string;
  readonly bundleBytes: number;
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly salientRatio: number;
    readonly occupiedAreaRatio: number;
    readonly occupiedQuadrants: number;
    readonly meanLuma: number;
    readonly darkPixelRatio: number;
    readonly colorBuckets: number;
    readonly dominantBucketRatio: number;
    readonly edgePixelRatio: number;
    readonly drawCalls: number;
    readonly materialCount: number;
    readonly productParts: number;
    readonly turntableHotspots: number;
    readonly captureViews: number;
    readonly batchTasks: number;
  };
}

interface ProductVisualDiff {
  readonly baselineEngine: "galileo";
  readonly comparedEngine: "threejs" | "babylon";
  readonly baselinePath: string;
  readonly comparedPath: string;
  readonly diffPath: string;
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly changedPixels: number;
  readonly changedPixelRatio: number;
  readonly meanAbsoluteError: number;
  readonly maxChannelDelta: number;
  readonly pass: boolean;
  readonly thresholds: {
    readonly maxChangedPixelRatio: number;
    readonly maxMeanAbsoluteError: number;
  };
}

interface ProductVisualAssetPipelineEvidence {
  readonly ready: boolean;
  readonly source: typeof productVisualParityScene.assetPipeline.source;
  readonly generatedDescriptorPath: typeof productVisualParityScene.assetPipeline.generatedDescriptorPath;
  readonly runtimeDescriptorSha256: string;
  readonly generatedDescriptorSha256?: string;
  readonly sameDescriptorForAllEngines: boolean;
  readonly localEngines: typeof productVisualParityScene.assetPipeline.localEngines;
  readonly externalEngines: typeof productVisualParityScene.assetPipeline.externalEngines;
  readonly productionWorkflowEvidence: typeof productVisualParityScene.assetPipeline.productionWorkflowEvidence;
  readonly commercialImportedAssetClaimed: false;
  readonly violations: readonly string[];
}

interface ProductExternalBaselineDiff {
  readonly baselineEngine: "galileo";
  readonly comparedEngine: "unity" | "unreal";
  readonly baselinePath: string;
  readonly comparedPath: string;
  readonly width: number;
  readonly height: number;
  readonly comparedPixels: number;
  readonly changedPixels: number;
  readonly changedPixelRatio: number;
  readonly meanAbsoluteError: number;
  readonly maxChannelDelta: number;
  readonly pass: boolean;
  readonly thresholds: {
    readonly maxChangedPixelRatio: number;
    readonly maxMeanAbsoluteError: number;
  };
  readonly reason?: string;
}

export interface ProductExternalBaselineValidation {
  readonly engine: "unity" | "unreal";
  readonly reportPath: string;
  readonly ok: boolean;
  readonly present: boolean;
  readonly requiredSceneDescriptorId: string;
  readonly requiredSceneDescriptorVersion: string;
  readonly requiredSceneDescriptorSha256?: string;
  readonly screenshot?: {
    readonly ok: boolean;
    readonly path?: string;
    readonly width?: number;
    readonly height?: number;
    readonly byteLength?: number;
    readonly nonBlankPixels?: number;
    readonly colorBuckets?: number;
    readonly sha256?: string;
    readonly reason?: string;
  };
  readonly runnerEvidence?: {
    readonly ok: boolean;
    readonly path?: string;
    readonly sha256?: string;
    readonly violations: readonly string[];
  };
  readonly diffAgainstGalileo?: ProductExternalBaselineDiff;
  readonly violations: readonly string[];
}

export interface V4ProductVisualParityReport {
  readonly ok: boolean;
  readonly screenshotPaths: readonly string[];
  readonly visualParityReady: boolean;
  readonly renderedProductVisualParity: {
    readonly threejs: boolean;
    readonly babylon: boolean;
    readonly unity: boolean;
    readonly unreal: boolean;
  };
  readonly sceneDescriptor: {
    readonly id: string;
    readonly schemaVersion: string;
    readonly materialCount: number;
    readonly productParts: number;
    readonly turntableHotspots: number;
    readonly captureViews: number;
    readonly batchTasks: number;
    readonly minimumEvidence: typeof productVisualParityScene.minimumEvidence;
    readonly assetPipeline: ProductVisualAssetPipelineEvidence;
    readonly claimBoundary: string;
  };
  readonly renders: readonly ProductVisualRender[];
  readonly diffs: readonly ProductVisualDiff[];
  readonly externalBaselines: {
    readonly unity: ProductExternalBaselineValidation;
    readonly unreal: ProductExternalBaselineValidation;
  };
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/external-parity-product-visual-parity.json";
const artifactDir = "tests/reports/external-parity-product-visual-parity";
const sourceFiles = [
  "tools/external-parity-product-visual-parity/index.ts",
  "tools/external-parity-product-visual-parity/productScene.ts",
  "tools/external-parity-broad-parity-readiness/index.ts",
  "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json",
  "packages/rendering/src/Renderer.ts",
  "packages/rendering/src/Geometry.ts",
  "packages/rendering/src/PBRMaterial.ts",
  "packages/rendering/src/ProductTurntableFixtures.ts",
  "packages/rendering/src/V4RenderPreset.ts",
  "tests/reports/external-parity-unity-product-visual-baseline.json",
  "tests/reports/external-parity-unreal-product-visual-baseline.json",
] as const;

export async function createV4ProductVisualParityReport(root = process.cwd()): Promise<V4ProductVisualParityReport> {
  mkdirSync(join(root, artifactDir), { recursive: true });
  const unityProductBaseline = readJson(root, "tests/reports/external-parity-unity-product-visual-baseline.json");
  const unrealProductBaseline = readJson(root, "tests/reports/external-parity-unreal-product-visual-baseline.json");
  const browser = await chromium.launch({ headless: true });
  try {
    const bundles = await buildEngineBundles();
    const page = await browser.newPage({
      viewport: { width: 720, height: 480 },
      deviceScaleFactor: 1,
    });
    try {
      const renders: ProductVisualRender[] = [];
      for (const engine of ["galileo", "threejs", "babylon"] as const) {
        const bundle = bundles.get(engine);
        if (!bundle) throw new Error(`Missing ${engine} visual parity bundle.`);
        renders.push(await renderEngine(page, root, engine, bundle));
      }
      const galileoRender = renders.find((render) => render.engine === "galileo");
      if (!galileoRender) throw new Error("Missing Galileo product render for external baseline validation.");
      const assetPipeline = productVisualAssetPipelineEvidence(root);
      const unityExternalBaseline = validateExternalProductVisualBaseline(root, unityProductBaseline, "unity", galileoRender.screenshotPath);
      const unrealExternalBaseline = validateExternalProductVisualBaseline(root, unrealProductBaseline, "unreal", galileoRender.screenshotPath);
      const diffs = [
        await createScreenshotDiff(page, root, renders, "threejs"),
        await createScreenshotDiff(page, root, renders, "babylon"),
      ];
      const violations = [
        ...renders.flatMap((render) => renderViolations(render)),
        ...diffs.flatMap((diff) => diff.pass ? [] : [`${diff.comparedEngine}: bounded product visual diff did not pass strict parity thresholds`]),
        ...assetPipeline.violations.map((violation) => `asset-pipeline: ${violation}`),
        ...unityExternalBaseline.violations.map((violation) => `unity: ${violation}`),
        ...unrealExternalBaseline.violations.map((violation) => `unreal: ${violation}`),
      ];
      const renderedProductVisualParity = {
        threejs: diffs.find((diff) => diff.comparedEngine === "threejs")?.pass === true,
        babylon: diffs.find((diff) => diff.comparedEngine === "babylon")?.pass === true,
        unity: unityExternalBaseline.ok,
        unreal: unrealExternalBaseline.ok,
      } as const;
      const screenshotPaths = collectProductVisualEvidencePaths({
        renders,
        diffs,
        externalBaselines: {
          unity: unityExternalBaseline,
          unreal: unrealExternalBaseline,
        },
      });
      return {
        ...baseReport(root, {
          ok: renders.every((render) => renderViolations(render).length === 0) && diffs.every((diff) => diff.pass),
          command: "pnpm audit:external-parity-product-visual-parity",
          runIdPrefix: "external-parity-product-visual-parity",
          sourceFiles,
          screenshotPaths,
          violations,
          blockedClaims: [
            "rendered product visual parity against Unity/Unreal",
            "full same-asset product render parity across external engines",
            "broad better-than-Three.js language",
            "broad better-than-Babylon.js language",
            "Unity/Unreal replacement language",
          ],
        }),
        visualParityReady: Object.values(renderedProductVisualParity).every(Boolean),
        renderedProductVisualParity,
        sceneDescriptor: {
          id: productVisualParityScene.id,
          schemaVersion: productVisualParityScene.schemaVersion,
          materialCount: productVisualParityScene.materials.length,
          productParts: productVisualParityScene.parts.length,
          turntableHotspots: productVisualParityScene.ecommerceWorkflow.hotspots.length,
          captureViews: productVisualParityScene.ecommerceWorkflow.capture.screenshotViews.length,
          batchTasks: productVisualParityScene.ecommerceWorkflow.capture.batchTasks.length,
          minimumEvidence: productVisualParityScene.minimumEvidence,
          assetPipeline,
          claimBoundary: productVisualParityScene.claimBoundary,
        },
        renders,
        diffs,
        externalBaselines: {
          unity: unityExternalBaseline,
          unreal: unrealExternalBaseline,
        },
        violations,
      };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export function collectProductVisualEvidencePaths(report: Pick<V4ProductVisualParityReport, "renders" | "diffs" | "externalBaselines">): readonly string[] {
  const paths = [
    ...report.renders.map((render) => render.screenshotPath),
    ...report.diffs.flatMap((diff) => [diff.baselinePath, diff.comparedPath, diff.diffPath]),
    ...Object.values(report.externalBaselines).flatMap((baseline) => [
      baseline.screenshot?.path,
      baseline.diffAgainstGalileo?.baselinePath,
      baseline.diffAgainstGalileo?.comparedPath,
    ]),
  ];
  return [...new Set(paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
}

export function validateExternalProductVisualBaseline(root: string, report: Record<string, unknown> | null, engine: "unity" | "unreal", galileoScreenshotPath?: string): ProductExternalBaselineValidation {
  const reportPath = `tests/reports/external-parity-${engine}-product-visual-baseline.json`;
  const expectedDescriptorSha256 = productSceneDescriptorSha256(root);
  const screenshot = isRecord(report) ? validateExternalBaselineScreenshot(root, report) : { ok: false, reason: "baseline report missing" };
  const externalScreenshotPath = isRecord(report) && typeof report.screenshotPath === "string" ? report.screenshotPath : undefined;
  const runnerEvidence = isRecord(report)
    ? validateExternalRunnerEvidence(root, report, {
      engine,
      baselineKind: "product-visual",
      sceneDescriptorId: productVisualParityScene.id,
      sceneDescriptorVersion: productVisualParityScene.schemaVersion,
      screenshotPath: externalScreenshotPath ?? "",
      minimumEvidence: productVisualParityScene.minimumEvidence,
      width: screenshot.width,
      height: screenshot.height,
    })
    : { ok: false, violations: ["baseline report missing"] };
  const diffAgainstGalileo = screenshot.ok && externalScreenshotPath && galileoScreenshotPath
    ? createExternalScreenshotDiff(root, galileoScreenshotPath, externalScreenshotPath, engine)
    : undefined;
  const metrics = isRecord(report?.metrics) ? report.metrics : {};
  const violations = [
    ...(isRecord(report) ? [] : [`${reportPath} is missing; no same-scene ${engine} product visual baseline is attached.`]),
    ...(report?.ok === true ? [] : ["baseline report must set ok=true"]),
    ...(report?.engine === engine ? [] : [`baseline report must set engine="${engine}"`]),
    ...(report?.sameSceneProductBaseline === true ? [] : ["baseline report must set sameSceneProductBaseline=true"]),
    ...(report?.sceneDescriptorId === productVisualParityScene.id ? [] : [`baseline report must use sceneDescriptorId=${productVisualParityScene.id}`]),
    ...(report?.sceneDescriptorVersion === productVisualParityScene.schemaVersion ? [] : [`baseline report must use sceneDescriptorVersion=${productVisualParityScene.schemaVersion}`]),
    ...(expectedDescriptorSha256 && report?.descriptorSha256 === expectedDescriptorSha256 ? [] : [`baseline report must use descriptorSha256=${expectedDescriptorSha256 ?? "available fixture descriptor hash"}`]),
    ...(report?.visualDiffAgainstGalileo === true ? [] : ["baseline report must set visualDiffAgainstGalileo=true"]),
    ...(Number(metrics.width) === productVisualParityScene.viewport.width ? [] : [`metrics.width must equal ${productVisualParityScene.viewport.width}`]),
    ...(Number(metrics.height) === productVisualParityScene.viewport.height ? [] : [`metrics.height must equal ${productVisualParityScene.viewport.height}`]),
    ...(Number(metrics.productParts) >= productVisualParityScene.minimumEvidence.productParts ? [] : [`metrics.productParts must be at least ${productVisualParityScene.minimumEvidence.productParts}`]),
    ...(Number(metrics.materialCount) >= productVisualParityScene.minimumEvidence.materialCount ? [] : [`metrics.materialCount must be at least ${productVisualParityScene.minimumEvidence.materialCount}`]),
    ...(Number(metrics.turntableHotspots) >= productVisualParityScene.minimumEvidence.turntableHotspots ? [] : [`metrics.turntableHotspots must be at least ${productVisualParityScene.minimumEvidence.turntableHotspots}`]),
    ...(Number(metrics.captureViews) >= productVisualParityScene.minimumEvidence.captureViews ? [] : [`metrics.captureViews must be at least ${productVisualParityScene.minimumEvidence.captureViews}`]),
    ...(Number(metrics.batchTasks) >= productVisualParityScene.minimumEvidence.batchTasks ? [] : [`metrics.batchTasks must be at least ${productVisualParityScene.minimumEvidence.batchTasks}`]),
    ...(Number(metrics.nonBlankPixels) > 10_000 ? [] : ["metrics.nonBlankPixels must be greater than 10000"]),
    ...(Number(metrics.colorBuckets) >= 5 ? [] : ["metrics.colorBuckets must be at least 5"]),
    ...(screenshot.ok ? [] : [`screenshot validation failed: ${screenshot.reason ?? "unknown reason"}`]),
    ...runnerEvidence.violations.map((violation) => `runner evidence validation failed: ${violation}`),
    ...(diffAgainstGalileo?.pass === false ? [`external screenshot diff failed against current Galileo product render: ${diffAgainstGalileo.reason ?? "thresholds exceeded"}`] : []),
  ];
  return {
    engine,
    reportPath,
    ok: violations.length === 0,
    present: isRecord(report),
    requiredSceneDescriptorId: productVisualParityScene.id,
    requiredSceneDescriptorVersion: productVisualParityScene.schemaVersion,
    requiredSceneDescriptorSha256: expectedDescriptorSha256 ?? undefined,
    screenshot: {
      ok: screenshot.ok,
      path: externalScreenshotPath,
      width: screenshot.width,
      height: screenshot.height,
      byteLength: screenshot.byteLength,
      nonBlankPixels: screenshot.nonBlankPixels,
      colorBuckets: screenshot.colorBuckets,
      sha256: screenshot.sha256,
      reason: screenshot.ok ? undefined : screenshot.reason,
    },
    runnerEvidence: {
      ok: runnerEvidence.ok,
      path: runnerEvidence.path,
      sha256: runnerEvidence.sha256,
      violations: runnerEvidence.violations,
    },
    diffAgainstGalileo,
    violations,
  };
}

function validateExternalRunnerEvidence(root: string, report: Record<string, unknown>, expected: {
  readonly engine: "unity" | "unreal";
  readonly baselineKind: string;
  readonly sceneDescriptorId: string;
  readonly sceneDescriptorVersion: string;
  readonly screenshotPath: string;
  readonly minimumEvidence: Record<string, unknown>;
  readonly width?: number;
  readonly height?: number;
}): {
  readonly ok: boolean;
  readonly path?: string;
  readonly sha256?: string;
  readonly violations: readonly string[];
} {
  const evidencePath = typeof report.runnerEvidencePath === "string" ? report.runnerEvidencePath : "";
  const expectedSha256 = typeof report.runnerEvidenceSha256 === "string" ? report.runnerEvidenceSha256 : "";
  const reportEvidence = isRecord(report.runnerEvidence) ? report.runnerEvidence : null;
  if (evidencePath.length === 0) {
    return { ok: false, violations: ["baseline report must include runnerEvidencePath"] };
  }
  const fullPath = join(root, evidencePath);
  if (!existsSync(fullPath)) {
    return { ok: false, path: evidencePath, violations: [`runner evidence sidecar is missing at ${evidencePath}`] };
  }
  const evidenceText = readFileSync(fullPath, "utf8");
  const actualSha256 = createHash("sha256").update(evidenceText).digest("hex");
  const parsedEvidence = parseJsonRecord(evidenceText);
  const metrics = isRecord(parsedEvidence?.metrics) ? parsedEvidence.metrics : {};
  const reportBaselineMetrics = isRecord(report.metrics) ? report.metrics : {};
  const reportMetrics = isRecord(reportEvidence?.metrics) ? reportEvidence.metrics : {};
  const violations = [
    ...(expectedSha256.match(/^[0-9a-f]{64}$/) ? [] : ["baseline report must include runnerEvidenceSha256 as a 64-character hex hash"]),
    ...(expectedSha256.length === 0 || expectedSha256 === actualSha256 ? [] : ["runnerEvidenceSha256 does not match sidecar contents"]),
    ...(parsedEvidence ? [] : ["runner evidence sidecar must contain a JSON object"]),
    ...(reportEvidence ? [] : ["baseline report must embed runnerEvidence object"]),
    ...(parsedEvidence?.ok === true ? [] : ["runner evidence ok must be true"]),
    ...(parsedEvidence?.engine === expected.engine ? [] : [`runner evidence engine must be ${expected.engine}`]),
    ...(parsedEvidence?.baselineKind === expected.baselineKind ? [] : [`runner evidence baselineKind must be ${expected.baselineKind}`]),
    ...(parsedEvidence?.sceneDescriptorId === expected.sceneDescriptorId ? [] : [`runner evidence sceneDescriptorId must be ${expected.sceneDescriptorId}`]),
    ...(parsedEvidence?.sceneDescriptorVersion === expected.sceneDescriptorVersion ? [] : [`runner evidence sceneDescriptorVersion must be ${expected.sceneDescriptorVersion}`]),
    ...(parsedEvidence?.screenshotPath === expected.screenshotPath ? [] : ["runner evidence screenshotPath must match baseline screenshotPath"]),
    ...(parsedEvidence?.renderedFrameCaptured === true ? [] : ["runner evidence renderedFrameCaptured must be true"]),
    ...(parsedEvidence?.cameraConfigured === true ? [] : ["runner evidence cameraConfigured must be true"]),
    ...(expected.width === undefined || Number(metrics.width) === expected.width ? [] : [`runner evidence metrics.width ${Number(metrics.width)} must equal ${expected.width}`]),
    ...(expected.height === undefined || Number(metrics.height) === expected.height ? [] : [`runner evidence metrics.height ${Number(metrics.height)} must equal ${expected.height}`]),
    ...minimumEvidenceViolations("runner evidence metrics", metrics, expected.minimumEvidence),
    ...reportMetricsMustMatchRunnerEvidence(reportBaselineMetrics, metrics, expected.minimumEvidence),
    ...(reportEvidence && parsedEvidence ? embeddedRunnerEvidenceViolations(reportEvidence, parsedEvidence) : []),
    ...(reportEvidence && parsedEvidence ? minimumEvidenceViolations("embedded runner evidence metrics", reportMetrics, expected.minimumEvidence) : []),
  ];
  return {
    ok: violations.length === 0,
    path: evidencePath,
    sha256: actualSha256,
    violations,
  };
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function minimumEvidenceViolations(prefix: string, metrics: Record<string, unknown>, minimumEvidence: Record<string, unknown>): string[] {
  return Object.entries(minimumEvidence).flatMap(([key, minimum]) => {
    if (key === "width" || key === "height" || key === "nonBlankPixels" || key === "colorBuckets" || typeof minimum !== "number") return [];
    const value = Number(metrics[key]);
    return Number.isFinite(value) && value >= minimum ? [] : [`${prefix}.${key} ${value} must be at least ${minimum}`];
  });
}

function embeddedRunnerEvidenceViolations(embedded: Record<string, unknown>, sidecar: Record<string, unknown>): string[] {
  const keys = ["ok", "engine", "baselineKind", "sceneDescriptorId", "sceneDescriptorVersion", "screenshotPath", "renderedFrameCaptured", "cameraConfigured"] as const;
  const violations = keys.flatMap((key) => embedded[key] === sidecar[key] ? [] : [`embedded runnerEvidence.${key} must match sidecar`]);
  const embeddedMetrics = isRecord(embedded.metrics) ? embedded.metrics : {};
  const sidecarMetrics = isRecord(sidecar.metrics) ? sidecar.metrics : {};
  return [
    ...violations,
    ...Object.keys(sidecarMetrics).flatMap((key) => embeddedMetrics[key] === sidecarMetrics[key] ? [] : [`embedded runnerEvidence.metrics.${key} must match sidecar`]),
  ];
}

function reportMetricsMustMatchRunnerEvidence(reportMetrics: Record<string, unknown>, runnerMetrics: Record<string, unknown>, minimumEvidence: Record<string, unknown>): string[] {
  return runnerBackedMetricKeys(minimumEvidence).flatMap((key) => {
    const reportValue = Number(reportMetrics[key]);
    const runnerValue = Number(runnerMetrics[key]);
    return Number.isFinite(reportValue) && Number.isFinite(runnerValue) && reportValue === runnerValue
      ? []
      : [`metrics.${key} must match runner evidence metric ${key}`];
  });
}

function runnerBackedMetricKeys(minimumEvidence: Record<string, unknown>): string[] {
  return ["width", "height", ...Object.keys(minimumEvidence).filter((key) => key !== "width" && key !== "height" && key !== "nonBlankPixels" && key !== "colorBuckets")];
}

function validateExternalBaselineScreenshot(root: string, report: Record<string, unknown>): {
  readonly ok: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly byteLength?: number;
  readonly nonBlankPixels?: number;
  readonly colorBuckets?: number;
  readonly sha256?: string;
  readonly reason?: string;
} {
  const screenshotPath = typeof report.screenshotPath === "string" ? report.screenshotPath : "";
  if (screenshotPath.length === 0) return { ok: false, reason: "missing screenshotPath" };
  const fullPath = join(root, screenshotPath);
  if (!existsSync(fullPath)) return { ok: false, reason: "screenshot missing" };
  const byteLength = statSync(fullPath).size;
  const data = readFileSync(fullPath);
  const png = readPngPixels(data);
  if (!png.ok) return { ok: false, byteLength, reason: png.reason };
  const expectedSha256 = typeof report.screenshotSha256 === "string" ? report.screenshotSha256 : "";
  const actualSha256 = createHash("sha256").update(data).digest("hex");
  const failures = [
    ...(png.width === productVisualParityScene.viewport.width ? [] : [`width ${png.width} !== ${productVisualParityScene.viewport.width}`]),
    ...(png.height === productVisualParityScene.viewport.height ? [] : [`height ${png.height} !== ${productVisualParityScene.viewport.height}`]),
    ...(byteLength > 8_192 ? [] : [`byteLength ${byteLength} <= 8192`]),
    ...(png.nonBlankPixels > 10_000 ? [] : [`nonBlankPixels ${png.nonBlankPixels} <= 10000`]),
    ...(png.colorBuckets >= 5 ? [] : [`colorBuckets ${png.colorBuckets} < 5`]),
    ...(expectedSha256.length === 0 || expectedSha256 === actualSha256 ? [] : ["sha256 mismatch"]),
  ];
  return {
    ok: failures.length === 0,
    width: png.width,
    height: png.height,
    byteLength,
    nonBlankPixels: png.nonBlankPixels,
    colorBuckets: png.colorBuckets,
    sha256: actualSha256,
    reason: failures.length === 0 ? undefined : `external baseline screenshot failed pixel validation: ${failures.join(", ")}`,
  };
}

function productSceneDescriptorSha256(root: string): string | null {
  const descriptorPath = join(root, "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json");
  if (!existsSync(descriptorPath)) return null;
  return createHash("sha256").update(readFileSync(descriptorPath, "utf8")).digest("hex");
}

function productVisualAssetPipelineEvidence(root: string): ProductVisualAssetPipelineEvidence {
  const runtimeDescriptorText = `${JSON.stringify(productVisualParityScene, null, 2)}\n`;
  const runtimeDescriptorSha256 = createHash("sha256").update(runtimeDescriptorText).digest("hex");
  const generatedDescriptorPath = productVisualParityScene.assetPipeline.generatedDescriptorPath;
  const fullGeneratedDescriptorPath = join(root, generatedDescriptorPath);
  const generatedDescriptorSha256 = existsSync(fullGeneratedDescriptorPath)
    ? createHash("sha256").update(readFileSync(fullGeneratedDescriptorPath, "utf8")).digest("hex")
    : undefined;
  const violations = [
    ...(productVisualParityScene.assetPipeline.sameDescriptorForAllEngines === true ? [] : ["asset pipeline must use the same descriptor for every engine"]),
    ...(productVisualParityScene.assetPipeline.localEngines.join(",") === "galileo,threejs,babylon" ? [] : ["asset pipeline must name Galileo, Three.js, and Babylon as local consumers"]),
    ...(productVisualParityScene.assetPipeline.externalEngines.join(",") === "unity,unreal" ? [] : ["asset pipeline must name Unity and Unreal as external consumers"]),
    ...(productVisualParityScene.assetPipeline.productionWorkflowEvidence.length >= 5 ? [] : ["asset pipeline must include material, hotspot, capture, batch, and AR-export boundary evidence"]),
    ...(productVisualParityScene.assetPipeline.commercialImportedAssetClaimed === false ? [] : ["asset pipeline must not claim a commercial imported product asset"]),
    ...(generatedDescriptorSha256 ? [] : [`generated descriptor is missing at ${generatedDescriptorPath}`]),
    ...(generatedDescriptorSha256 === undefined || generatedDescriptorSha256 === runtimeDescriptorSha256 ? [] : [`generated descriptor hash ${generatedDescriptorSha256} does not match runtime descriptor hash ${runtimeDescriptorSha256}`]),
  ];
  return {
    ready: violations.length === 0,
    source: productVisualParityScene.assetPipeline.source,
    generatedDescriptorPath,
    runtimeDescriptorSha256,
    generatedDescriptorSha256,
    sameDescriptorForAllEngines: productVisualParityScene.assetPipeline.sameDescriptorForAllEngines,
    localEngines: productVisualParityScene.assetPipeline.localEngines,
    externalEngines: productVisualParityScene.assetPipeline.externalEngines,
    productionWorkflowEvidence: productVisualParityScene.assetPipeline.productionWorkflowEvidence,
    commercialImportedAssetClaimed: productVisualParityScene.assetPipeline.commercialImportedAssetClaimed,
    violations,
  };
}

function readPngPixels(data: Buffer): {
  readonly ok: true;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
} | { readonly ok: false; readonly reason: string } {
  const isPng = data.length >= 24 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[12] === 0x49 &&
    data[13] === 0x48 &&
    data[14] === 0x44 &&
    data[15] === 0x52;
  if (!isPng) return { ok: false, reason: "not a PNG" };
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];
  if (width <= 0 || height <= 0) return { ok: false, reason: "PNG has zero dimensions" };
  if (bitDepth !== 8) return { ok: false, reason: `unsupported PNG bit depth ${bitDepth}` };
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (channels === 0) return { ok: false, reason: `unsupported PNG color type ${colorType}` };
  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd + 4 > data.length) return { ok: false, reason: "truncated PNG chunk" };
    if (type === "IDAT") idatChunks.push(data.subarray(chunkStart, chunkEnd));
    if (type === "IEND") break;
    offset = chunkEnd + 4;
  }
  if (idatChunks.length === 0) return { ok: false, reason: "PNG has no IDAT data" };
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const expectedLength = (stride + 1) * height;
  if (inflated.length < expectedLength) return { ok: false, reason: "inflated PNG data is truncated" };
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const pixels = new Uint8Array(width * height * 4);
  const buckets = new Set<string>();
  let nonBlankPixels = 0;
  let readOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset] ?? 0;
    if (filter > 4) return { ok: false, reason: `unsupported PNG filter ${filter}` };
    readOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[readOffset + x] ?? 0;
      const left = x >= channels ? current[x - channels] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;
      current[x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * channels;
      const targetIndex = (y * width + x) * 4;
      const r = current[sourceIndex] ?? 0;
      const g = channels === 1 ? r : current[sourceIndex + 1] ?? 0;
      const b = channels === 1 ? r : current[sourceIndex + 2] ?? 0;
      const a = channels === 4 ? current[sourceIndex + 3] ?? 255 : 255;
      pixels[targetIndex] = r;
      pixels[targetIndex + 1] = g;
      pixels[targetIndex + 2] = b;
      pixels[targetIndex + 3] = a;
      if (r > 8 || g > 8 || b > 8) {
        nonBlankPixels += 1;
        buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
      }
    }
    current.copy(previous);
    current.fill(0);
    readOffset += stride;
  }
  return { ok: true, width, height, pixels, nonBlankPixels, colorBuckets: buckets.size };
}

function createExternalScreenshotDiff(root: string, galileoScreenshotPath: string, comparedScreenshotPath: string, engine: "unity" | "unreal"): ProductExternalBaselineDiff {
  const baseline = readPngPixels(readFileSync(join(root, galileoScreenshotPath)));
  const compared = readPngPixels(readFileSync(join(root, comparedScreenshotPath)));
  if (!baseline.ok) {
    return failedExternalDiff(engine, galileoScreenshotPath, comparedScreenshotPath, `current Galileo product screenshot failed PNG validation: ${baseline.reason}`);
  }
  if (!compared.ok) {
    return failedExternalDiff(engine, galileoScreenshotPath, comparedScreenshotPath, `external ${engine} product screenshot failed PNG validation: ${compared.reason}`);
  }
  const width = Math.min(baseline.width, compared.width);
  const height = Math.min(baseline.height, compared.height);
  if (width <= 0 || height <= 0) {
    return failedExternalDiff(engine, galileoScreenshotPath, comparedScreenshotPath, "screenshot diff requires non-empty images");
  }
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const baselineIndex = (y * baseline.width + x) * 4;
      const comparedIndex = (y * compared.width + x) * 4;
      const rDelta = Math.abs((baseline.pixels[baselineIndex] ?? 0) - (compared.pixels[comparedIndex] ?? 0));
      const gDelta = Math.abs((baseline.pixels[baselineIndex + 1] ?? 0) - (compared.pixels[comparedIndex + 1] ?? 0));
      const bDelta = Math.abs((baseline.pixels[baselineIndex + 2] ?? 0) - (compared.pixels[comparedIndex + 2] ?? 0));
      const pixelDelta = Math.max(rDelta, gDelta, bDelta);
      totalAbsoluteDelta += rDelta + gDelta + bDelta;
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
      if (pixelDelta > 2) changedPixels += 1;
    }
  }
  const comparedPixels = width * height;
  const changedPixelRatio = changedPixels / comparedPixels;
  const meanAbsoluteError = totalAbsoluteDelta / (comparedPixels * 3);
  const thresholds = {
    maxChangedPixelRatio: 0.15,
    maxMeanAbsoluteError: 8,
  };
  const pass = changedPixelRatio <= thresholds.maxChangedPixelRatio && meanAbsoluteError <= thresholds.maxMeanAbsoluteError;
  return {
    baselineEngine: "galileo",
    comparedEngine: engine,
    baselinePath: galileoScreenshotPath,
    comparedPath: comparedScreenshotPath,
    width,
    height,
    comparedPixels,
    changedPixels,
    changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(6)),
    maxChannelDelta,
    pass,
    thresholds,
    reason: pass ? undefined : `changedPixelRatio ${changedPixelRatio.toFixed(6)} > ${thresholds.maxChangedPixelRatio} or meanAbsoluteError ${meanAbsoluteError.toFixed(6)} > ${thresholds.maxMeanAbsoluteError}`,
  };
}

function failedExternalDiff(engine: "unity" | "unreal", baselinePath: string, comparedPath: string, reason: string): ProductExternalBaselineDiff {
  return {
    baselineEngine: "galileo",
    comparedEngine: engine,
    baselinePath,
    comparedPath,
    width: 0,
    height: 0,
    comparedPixels: 0,
    changedPixels: 0,
    changedPixelRatio: 1,
    meanAbsoluteError: 255,
    maxChannelDelta: 255,
    pass: false,
    thresholds: {
      maxChangedPixelRatio: 0.15,
      maxMeanAbsoluteError: 8,
    },
    reason,
  };
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

async function buildEngineBundles(): Promise<ReadonlyMap<ProductVisualEngine, string>> {
  const entries: Record<ProductVisualEngine, string> = {
    galileo: galileoBundleSource(),
    threejs: threeBundleSource(),
    babylon: babylonBundleSource(),
  };
  const bundles = new Map<ProductVisualEngine, string>();
  for (const [engine, contents] of Object.entries(entries) as [ProductVisualEngine, string][]) {
    const result = await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${engine}-product-visual-parity.ts`,
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: `G3D_${engine}_product_visual_parity`,
      target: "es2022",
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error(`Unable to build ${engine} product visual parity bundle.`);
    bundles.set(engine, output);
  }
  return bundles;
}

async function renderEngine(page: Page, root: string, engine: ProductVisualEngine, bundle: string): Promise<ProductVisualRender> {
  await page.setContent("<!doctype html><body style=\"margin:0;background:#080b10\"></body>");
  await page.addScriptTag({ content: bundle });
  const result = await page.evaluate<{ readonly dataUrl: string; readonly metrics: ProductVisualRender["metrics"] }, ProductVisualEngine>(async (engineName) => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    canvas.style.width = "720px";
    canvas.style.height = "480px";
    document.body.replaceChildren(canvas);
    const bundleName = `G3D_${engineName}_product_visual_parity`;
    const render = (window as unknown as Record<string, { renderProductVisualParity?: (canvas: HTMLCanvasElement) => Promise<ProductVisualRender["metrics"]> }>)[bundleName]?.renderProductVisualParity;
    if (!render) throw new Error(`Missing browser render function: ${bundleName}.renderProductVisualParity`);
    const metrics = await render(canvas);
    return { dataUrl: canvas.toDataURL("image/png"), metrics };
  }, engine);
  const screenshotPath = `${artifactDir}/${engine}-product.png`;
  writePngDataUrl(root, screenshotPath, result.dataUrl);
  return {
    engine,
    screenshotPath,
    bundleBytes: Buffer.byteLength(bundle),
    metrics: result.metrics,
  };
}

async function createScreenshotDiff(page: Page, root: string, renders: readonly ProductVisualRender[], comparedEngine: "threejs" | "babylon"): Promise<ProductVisualDiff> {
  const baseline = renders.find((render) => render.engine === "galileo");
  const compared = renders.find((render) => render.engine === comparedEngine);
  if (!baseline || !compared) throw new Error(`Missing render for screenshot diff: ${comparedEngine}.`);
  const diffPath = `${artifactDir}/${comparedEngine}-product-diff.png`;
  const result = await page.evaluate<DiffResultWithDataUrl>(
    `(${browserScreenshotDiffScript})(${JSON.stringify({
    baselineUrl: pngDataUrl(root, baseline.screenshotPath),
    comparedUrl: pngDataUrl(root, compared.screenshotPath),
    })})`
  );
  writePngDataUrl(root, diffPath, result.diffDataUrl);
  const { diffDataUrl: _diffDataUrl, ...metrics } = result;
  return {
    baselineEngine: "galileo",
    comparedEngine,
    baselinePath: baseline.screenshotPath,
    comparedPath: compared.screenshotPath,
    diffPath,
    ...metrics,
  };
}

function renderViolations(render: ProductVisualRender): string[] {
  return [
    ...(render.metrics.width === 720 && render.metrics.height === 480 ? [] : [`${render.engine}: unexpected render dimensions`]),
    ...(render.metrics.nonBlankPixels > 10_000 ? [] : [`${render.engine}: product render is too dark or empty`]),
    ...(render.metrics.salientRatio >= 0.12 ? [] : [`${render.engine}: product render has too little visible subject coverage`]),
    ...(render.metrics.occupiedAreaRatio >= 0.18 ? [] : [`${render.engine}: product render is badly framed or too tiny`]),
    ...(render.metrics.occupiedQuadrants >= 3 ? [] : [`${render.engine}: product render does not occupy enough screen quadrants`]),
    ...(render.metrics.meanLuma >= 18 ? [] : [`${render.engine}: product render is too dark`]),
    ...(render.metrics.darkPixelRatio <= 0.65 ? [] : [`${render.engine}: product render is black-dominated`]),
    ...(render.metrics.colorBuckets >= 24 ? [] : [`${render.engine}: product render has too few color buckets`]),
    ...(render.metrics.dominantBucketRatio <= 0.72 ? [] : [`${render.engine}: product render is dominated by one color bucket`]),
    ...(render.metrics.edgePixelRatio >= 0.012 ? [] : [`${render.engine}: product render has too little silhouette/detail evidence`]),
    ...(render.metrics.productParts >= productVisualParityScene.minimumEvidence.productParts ? [] : [`${render.engine}: product render has too few parts`]),
    ...(render.metrics.materialCount >= productVisualParityScene.minimumEvidence.materialCount ? [] : [`${render.engine}: product render has too few materials`]),
    ...(render.metrics.drawCalls >= productVisualParityScene.minimumEvidence.drawCalls ? [] : [`${render.engine}: product render has too few draw calls`]),
    ...(render.metrics.drawCalls > 0 ? [] : [`${render.engine}: product render has no draw calls`]),
  ];
}

function pngDataUrl(root: string, path: string): string {
  return `data:image/png;base64,${readFileSync(join(root, path)).toString("base64")}`;
}

function writePngDataUrl(root: string, path: string, dataUrl: string): void {
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) throw new Error("Invalid PNG data URL.");
  const outputPath = join(root, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(base64, "base64"));
}

function productSceneLiteral(): string {
  return JSON.stringify(productVisualParityScene);
}

function sharedBrowserHelpers(): string {
  return String.raw`
    const PRODUCT_VISUAL_PRESENTATION_SCALE = 1.08;
    function pixelStats(canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { nonBlankPixels: 0, salientRatio: 0, occupiedAreaRatio: 0, occupiedQuadrants: 0, meanLuma: 0, darkPixelRatio: 1, colorBuckets: 0, dominantBucketRatio: 1, edgePixelRatio: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set();
      const bucketCounts = new Map();
      let nonBlankPixels = 0;
      let salientPixels = 0;
      let darkPixels = 0;
      let lumaSum = 0;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      const quadrants = new Set();
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const r = pixels[index] || 0;
          const g = pixels[index + 1] || 0;
          const b = pixels[index + 2] || 0;
          const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
          lumaSum += luma;
          if (luma <= 18) darkPixels += 1;
          if (r > 8 || g > 8 || b > 8) nonBlankPixels += 1;
          if (luma > 24) {
            salientPixels += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            quadrants.add((x >= canvas.width / 2 ? 1 : 0) + (y >= canvas.height / 2 ? 2 : 0));
          }
          const bucket = String(r >> 4) + ":" + String(g >> 4) + ":" + String(b >> 4);
          buckets.add(bucket);
          bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
        }
      }
      let edgePixels = 0;
      for (let y = 1; y < canvas.height; y += 1) {
        for (let x = 1; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const left = index - 4;
          const up = index - canvas.width * 4;
          const luma = (pixels[index] || 0) * 0.2126 + (pixels[index + 1] || 0) * 0.7152 + (pixels[index + 2] || 0) * 0.0722;
          const leftLuma = (pixels[left] || 0) * 0.2126 + (pixels[left + 1] || 0) * 0.7152 + (pixels[left + 2] || 0) * 0.0722;
          const upLuma = (pixels[up] || 0) * 0.2126 + (pixels[up + 1] || 0) * 0.7152 + (pixels[up + 2] || 0) * 0.0722;
          if (Math.abs(luma - leftLuma) + Math.abs(luma - upLuma) > 42) edgePixels += 1;
        }
      }
      const pixelCount = canvas.width * canvas.height;
      const occupiedAreaRatio = maxX >= minX && maxY >= minY ? ((maxX - minX + 1) * (maxY - minY + 1)) / pixelCount : 0;
      const dominantBucketRatio = Math.max(0, ...bucketCounts.values()) / pixelCount;
      return {
        nonBlankPixels,
        salientRatio: salientPixels / pixelCount,
        occupiedAreaRatio,
        occupiedQuadrants: quadrants.size,
        meanLuma: lumaSum / pixelCount,
        darkPixelRatio: darkPixels / pixelCount,
        colorBuckets: buckets.size,
        dominantBucketRatio,
        edgePixelRatio: edgePixels / pixelCount
      };
    }
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    function modelMatrix(part) {
      const position = part.position || [0, 0, 0];
      const scale = part.scale || [1, 1, 1];
      const rotation = part.rotation || [0, 0, 0];
      const sx = scale[0] * PRODUCT_VISUAL_PRESENTATION_SCALE;
      const sy = scale[1] * PRODUCT_VISUAL_PRESENTATION_SCALE;
      const sz = scale[2] * PRODUCT_VISUAL_PRESENTATION_SCALE;
      const rx = rotation[0] || 0;
      const ry = rotation[1] || 0;
      const rz = rotation[2] || 0;
      const cx = Math.cos(rx);
      const sxn = Math.sin(rx);
      const cy = Math.cos(ry);
      const syn = Math.sin(ry);
      const cz = Math.cos(rz);
      const szn = Math.sin(rz);
      const r00 = cy * cz;
      const r01 = sxn * syn * cz - cx * szn;
      const r02 = cx * syn * cz + sxn * szn;
      const r10 = cy * szn;
      const r11 = sxn * syn * szn + cx * cz;
      const r12 = cx * syn * szn - sxn * cz;
      const r20 = -syn;
      const r21 = sxn * cy;
      const r22 = cx * cy;
      return new Float32Array([
        r00 * sx, r01 * sx, r02 * sx, 0,
        r10 * sy, r11 * sy, r12 * sy, 0,
        r20 * sz, r21 * sz, r22 * sz, 0,
        position[0] * PRODUCT_VISUAL_PRESENTATION_SCALE,
        position[1] * PRODUCT_VISUAL_PRESENTATION_SCALE,
        position[2] * PRODUCT_VISUAL_PRESENTATION_SCALE,
        1,
      ]);
    }
  `;
}

function galileoBundleSource(): string {
  return `
    import { Geometry, PBRMaterial, Renderer, UnlitMaterial, createV4EnvironmentLighting } from "./packages/rendering/src/index.ts";
    const descriptor = ${productSceneLiteral()};
    ${sharedBrowserHelpers()}
    export async function renderProductVisualParity(canvas) {
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.46, 0.52, 0.56, 1], antialias: true, preserveDrawingBuffer: true });
      const geometries = new Map([
        ["cube", Geometry.litCube(1)],
        ["sphere", Geometry.uvSphere(0.5, 32, 16)],
        ["cylinder", Geometry.cylinder({ radius: 0.5, height: 1, segments: 32 })],
      ]);
      const lighting = createV4EnvironmentLighting("studio").lighting;
      const materials = new Map(descriptor.materials.map((material) => {
        if (material.kind === "unlit") return [material.id, new UnlitMaterial({
          name: "parity-" + material.id,
          color: material.color,
          renderState: material.id.startsWith("backdrop") ? { depthTest: false, depthWrite: false } : undefined,
        })];
        return [material.id, new PBRMaterial({
          name: "parity-" + material.id,
          baseColor: material.color,
          metallic: material.metallic || 0,
          roughness: material.roughness || 0.5,
          clearcoatFactor: material.clearcoat || 0,
          clearcoatRoughnessFactor: material.clearcoat ? 0.18 : 0,
          transmissionFactor: material.transmission || 0,
          specularFactor: material.id === "glass" ? 0.9 : 0.5,
          renderState: material.alpha && material.alpha < 1 ? { blend: true, depthWrite: false } : undefined,
        })];
      }));
      const items = descriptor.parts.map((part) => {
        const geometry = geometries.get(part.geometry);
        const material = materials.get(part.material);
        if (!geometry || !material) throw new Error("Product descriptor references an unknown geometry or material: " + part.id);
        return { geometry, material, modelMatrix: modelMatrix(part), label: "galileo-" + part.id };
      });
      const diagnostics = renderer.render({ renderItems: items, environmentLighting: lighting });
      await nextFrame();
      const stats = pixelStats(canvas);
      renderer.dispose();
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: diagnostics.drawCalls, materialCount: descriptor.materials.length, productParts: descriptor.parts.length, turntableHotspots: descriptor.ecommerceWorkflow.hotspots.length, captureViews: descriptor.ecommerceWorkflow.capture.screenshotViews.length, batchTasks: descriptor.ecommerceWorkflow.capture.batchTasks.length };
    }
  `;
}

function threeBundleSource(): string {
  return `
    import * as THREE from "three";
    const descriptor = ${productSceneLiteral()};
    ${sharedBrowserHelpers()}
    export async function renderProductVisualParity(canvas) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(0x75858f, 1);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      const calibratedColors = new Map([
        ["body", 0x55646a],
        ["accent", 0x3a3c3d],
        ["glass", 0x3a3c3d],
        ["dark", 0x111213],
        ["glow", 0x3ed5ff],
        ["trim", 0xb8c2bd],
        ["label", 0xffdb3d],
        ["backdrop-a", 0x809199],
        ["backdrop-b", 0x667a8a],
        ["backdrop-c", 0xaaada4],
      ]);
      const materials = new Map(descriptor.materials.map((material) => [material.id, new THREE.MeshBasicMaterial({
        color: calibratedColors.get(material.id) || new THREE.Color(...material.color.slice(0, 3)),
        transparent: Boolean(material.alpha && material.alpha < 1),
        opacity: material.alpha || 1,
      })]));
      const geometries = new Map([
        ["cube", new THREE.BoxGeometry(1, 1, 1)],
        ["sphere", new THREE.SphereGeometry(0.5, 32, 16)],
        ["cylinder", new THREE.CylinderGeometry(0.5, 0.5, 1, 32)],
      ]);
      const add = (part) => {
        const geometry = geometries.get(part.geometry);
        const material = materials.get(part.material);
        if (!geometry || !material) throw new Error("Product descriptor references an unknown geometry or material: " + part.id);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = part.id;
        const matrix = modelMatrix(part);
        matrix[14] = -matrix[14];
        mesh.matrix.fromArray(Array.from(matrix));
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
      };
      for (const part of descriptor.parts) add(part);
      renderer.render(scene, camera);
      await nextFrame();
      const stats = pixelStats(canvas);
      renderer.dispose();
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: descriptor.parts.length, materialCount: descriptor.materials.length, productParts: descriptor.parts.length, turntableHotspots: descriptor.ecommerceWorkflow.hotspots.length, captureViews: descriptor.ecommerceWorkflow.capture.screenshotViews.length, batchTasks: descriptor.ecommerceWorkflow.capture.batchTasks.length };
    }
  `;
}

function babylonBundleSource(): string {
  return `
    import * as BABYLON from "@babylonjs/core";
    const descriptor = ${productSceneLiteral()};
    ${sharedBrowserHelpers()}
    export async function renderProductVisualParity(canvas) {
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true });
      engine.setSize(canvas.width, canvas.height);
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0.46, 0.52, 0.56, 1);
      const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -4), scene);
      camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 1;
      camera.orthoBottom = -1;
      camera.setTarget(BABYLON.Vector3.Zero());
      new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene).intensity = 1.2;
      const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -0.7, 1), scene);
      key.intensity = 1.9;
      const calibratedColors = new Map([
        ["body", [0.333, 0.392, 0.416]],
        ["accent", [0.227, 0.235, 0.239]],
        ["glass", [0.227, 0.235, 0.239]],
        ["dark", [0.067, 0.071, 0.075]],
        ["glow", [0.243, 0.835, 1]],
        ["trim", [0.722, 0.761, 0.741]],
        ["label", [1, 0.86, 0.24]],
        ["backdrop-a", [0.502, 0.569, 0.6]],
        ["backdrop-b", [0.4, 0.478, 0.541]],
        ["backdrop-c", [0.667, 0.678, 0.643]],
      ]);
      const material = (descriptorMaterial) => {
        const color = calibratedColors.get(descriptorMaterial.id) || descriptorMaterial.color.slice(0, 3);
        const mat = new BABYLON.StandardMaterial("parity-" + descriptorMaterial.id, scene);
        mat.diffuseColor = BABYLON.Color3.FromArray(color);
        mat.emissiveColor = BABYLON.Color3.FromArray(color);
        mat.specularColor = BABYLON.Color3.Black();
        mat.disableLighting = true;
        mat.roughness = descriptorMaterial.roughness || 0.5;
        mat.alpha = descriptorMaterial.alpha || 1;
        return mat;
      };
      const materials = new Map(descriptor.materials.map((entry) => [entry.id, material(entry)]));
      const add = (part) => {
        const mat = materials.get(part.material);
        if (!mat) throw new Error("Product descriptor references an unknown material: " + part.id);
        const options = part.geometry === "sphere"
          ? { diameter: 1, segments: 32 }
          : part.geometry === "cylinder"
            ? { diameter: 1, height: 1, tessellation: 32 }
            : { size: 1 };
        const mesh = part.geometry === "sphere"
          ? BABYLON.MeshBuilder.CreateSphere(part.id, options, scene)
          : part.geometry === "cylinder"
            ? BABYLON.MeshBuilder.CreateCylinder(part.id, options, scene)
            : BABYLON.MeshBuilder.CreateBox(part.id, options, scene);
        mesh.material = mat;
        mesh.position = new BABYLON.Vector3(
          part.position[0] * PRODUCT_VISUAL_PRESENTATION_SCALE,
          part.position[1] * PRODUCT_VISUAL_PRESENTATION_SCALE,
          part.position[2] * PRODUCT_VISUAL_PRESENTATION_SCALE
        );
        mesh.scaling = new BABYLON.Vector3(
          part.scale[0] * PRODUCT_VISUAL_PRESENTATION_SCALE,
          part.scale[1] * PRODUCT_VISUAL_PRESENTATION_SCALE,
          part.scale[2] * PRODUCT_VISUAL_PRESENTATION_SCALE
        );
        mesh.rotation = new BABYLON.Vector3(...(part.rotation || [0, 0, 0]));
      };
      for (const part of descriptor.parts) add(part);
      scene.render();
      await nextFrame();
      const stats = pixelStats(canvas);
      engine.dispose();
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: descriptor.parts.length, materialCount: descriptor.materials.length, productParts: descriptor.parts.length, turntableHotspots: descriptor.ecommerceWorkflow.hotspots.length, captureViews: descriptor.ecommerceWorkflow.capture.screenshotViews.length, batchTasks: descriptor.ecommerceWorkflow.capture.batchTasks.length };
    }
  `;
}

interface DiffResultWithDataUrl extends Omit<ProductVisualDiff, "baselineEngine" | "comparedEngine" | "baselinePath" | "comparedPath" | "diffPath"> {
  readonly diffDataUrl: string;
}

const browserScreenshotDiffScript = String.raw`
async (input) => {
  const loadImage = (url) => new Promise((resolveImage, rejectImage) => {
    const image = new Image();
    image.onload = () => resolveImage(image);
    image.onerror = () => rejectImage(new Error("Unable to decode screenshot PNG for diffing."));
    image.src = url;
  });
  const baseline = await loadImage(input.baselineUrl);
  const compared = await loadImage(input.comparedUrl);
  const width = Math.min(baseline.naturalWidth, compared.naturalWidth);
  const height = Math.min(baseline.naturalHeight, compared.naturalHeight);
  if (width <= 0 || height <= 0) {
    throw new Error("Screenshot diff requires non-empty images.");
  }

  const baselineCanvas = document.createElement("canvas");
  const comparedCanvas = document.createElement("canvas");
  const diffCanvas = document.createElement("canvas");
  baselineCanvas.width = comparedCanvas.width = diffCanvas.width = width;
  baselineCanvas.height = comparedCanvas.height = diffCanvas.height = height;
  const baselineContext = baselineCanvas.getContext("2d", { willReadFrequently: true });
  const comparedContext = comparedCanvas.getContext("2d", { willReadFrequently: true });
  const diffContext = diffCanvas.getContext("2d");
  if (!baselineContext || !comparedContext || !diffContext) {
    throw new Error("Canvas 2D context unavailable for screenshot diff.");
  }
  baselineContext.drawImage(baseline, 0, 0, width, height);
  comparedContext.drawImage(compared, 0, 0, width, height);
  const baselinePixels = baselineContext.getImageData(0, 0, width, height);
  const comparedPixels = comparedContext.getImageData(0, 0, width, height);
  const diffPixels = diffContext.createImageData(width, height);
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  let maxChannelDelta = 0;
  const channelCount = width * height * 3;

  for (let index = 0; index < baselinePixels.data.length; index += 4) {
    const rDelta = Math.abs((baselinePixels.data[index] || 0) - (comparedPixels.data[index] || 0));
    const gDelta = Math.abs((baselinePixels.data[index + 1] || 0) - (comparedPixels.data[index + 1] || 0));
    const bDelta = Math.abs((baselinePixels.data[index + 2] || 0) - (comparedPixels.data[index + 2] || 0));
    const pixelDelta = Math.max(rDelta, gDelta, bDelta);
    totalAbsoluteDelta += rDelta + gDelta + bDelta;
    maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    if (pixelDelta > 2) {
      changedPixels += 1;
      diffPixels.data[index] = 255;
      diffPixels.data[index + 1] = Math.min(255, pixelDelta * 8);
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    } else {
      diffPixels.data[index] = 0;
      diffPixels.data[index + 1] = 0;
      diffPixels.data[index + 2] = 0;
      diffPixels.data[index + 3] = 255;
    }
  }

  diffContext.putImageData(diffPixels, 0, 0);
  const comparedPixelCount = width * height;
  const changedPixelRatio = changedPixels / comparedPixelCount;
  const meanAbsoluteError = totalAbsoluteDelta / channelCount;
  const thresholds = {
    maxChangedPixelRatio: 0.15,
    maxMeanAbsoluteError: 8,
  };
  return {
    width,
    height,
    comparedPixels: comparedPixelCount,
    changedPixels,
    changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
    meanAbsoluteError: Number(meanAbsoluteError.toFixed(6)),
    maxChannelDelta,
    pass: changedPixelRatio <= thresholds.maxChangedPixelRatio && meanAbsoluteError <= thresholds.maxMeanAbsoluteError,
    thresholds,
    diffDataUrl: diffCanvas.toDataURL("image/png"),
  };
}
`;

function writeReport(root: string, report: V4ProductVisualParityReport): void {
  writeJson(root, reportPath, report);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await createV4ProductVisualParityReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    visualParityReady: report.visualParityReady,
    renders: report.renders.map((render) => ({
      engine: render.engine,
      screenshotPath: render.screenshotPath,
      bytes: statSync(join(process.cwd(), render.screenshotPath)).size,
      metrics: render.metrics,
    })),
    diffs: report.diffs.map((diff) => ({
      comparedEngine: diff.comparedEngine,
      pass: diff.pass,
      changedPixelRatio: diff.changedPixelRatio,
      meanAbsoluteError: diff.meanAbsoluteError,
      diffPath: diff.diffPath,
    })),
    report: reportPath,
    violations: report.violations,
  }, null, 2));
}
