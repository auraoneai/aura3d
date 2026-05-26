import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface ExternalParityAssetManifest {
  readonly schemaVersion: string;
  readonly assetCount: number;
  readonly assets: readonly ExternalParityAssetManifestEntry[];
}

interface ExternalParityAssetManifestEntry {
  readonly id: string;
  readonly category: string;
  readonly displayName: string;
  readonly localPath: string;
  readonly features: readonly string[];
  readonly textureCount: number;
  readonly animations: number;
  readonly skins: number;
  readonly morphTargets: number;
}

interface ExternalParityAssetCorpusReport {
  readonly schemaVersion: string;
  readonly assetCount: number;
  readonly assets: readonly {
    readonly id: string;
    readonly category: string;
    readonly displayName: string;
    readonly assetPath: string;
    readonly features: readonly string[];
    readonly textureCount: number;
    readonly animationCount: number;
    readonly skinCount: number;
    readonly morphTargetCount: number;
  }[];
}

interface AssetViewerSnapshot {
  readonly status?: "ready" | "error";
  readonly error?: string;
  readonly visualClaim?: string;
  readonly screenshotPath?: string;
  readonly claimBoundary?: string;
  readonly featureEvidence?: Record<string, unknown>;
  readonly externalParityRenderPreset?: {
    readonly presetId?: string;
    readonly activeFeatures?: readonly string[];
    readonly colorManagement?: { readonly toneMapper?: string };
  };
  readonly postprocess?: {
    readonly source?: string;
    readonly path?: string;
    readonly changedPixels?: number;
    readonly inputNonDarkPixels?: number;
    readonly outputNonDarkPixels?: number;
    readonly outputColorBuckets?: number;
  };
  readonly environmentResources?: {
    readonly resourceSet?: string;
    readonly hdrSource?: boolean;
    readonly maxLinearValue?: number;
    readonly specularMipCount?: number;
    readonly validation?: {
      readonly brdfLutTexture?: boolean;
      readonly diffuseIrradiance?: boolean;
    };
  };
  readonly assetBundleCache?: {
    readonly source?: string;
    readonly manifest?: {
      readonly assetCount?: number;
      readonly totalBytes?: number;
    };
    readonly dependencyGraph?: {
      readonly loadOrder?: readonly string[];
      readonly releaseOrder?: readonly string[];
      readonly cycleDetected?: boolean;
    };
    readonly cache?: {
      readonly policy?: string;
      readonly cachedEntries?: number;
      readonly memoryBytes?: number;
      readonly evictions?: number;
      readonly hitRate?: number;
    };
    readonly productionReadiness?: {
      readonly bundleManifest?: boolean;
      readonly dependencySorting?: boolean;
      readonly memoryBudgetEviction?: boolean;
      readonly cacheTelemetry?: boolean;
    };
    readonly blockedClaims?: readonly string[];
    readonly hash?: string;
  };
  readonly sceneAnalysis?: {
    readonly source?: string;
    readonly analyzer?: string;
    readonly mask?: {
      readonly width?: number;
      readonly height?: number;
      readonly classCount?: number;
      readonly hash?: string;
    };
    readonly segments?: readonly {
      readonly label?: string;
      readonly coverage?: number;
      readonly confidence?: number;
    }[];
    readonly objectDetections?: readonly {
      readonly label?: string;
      readonly confidence?: number;
      readonly bbox?: readonly [number, number, number, number];
    }[];
    readonly objectTracks?: readonly {
      readonly id?: number;
      readonly label?: string;
      readonly historyLength?: number;
    }[];
    readonly poses?: readonly {
      readonly keypoints?: readonly unknown[];
      readonly confidence?: number;
    }[];
    readonly cvSystem?: {
      readonly source?: string;
      readonly detectionTelemetry?: boolean;
      readonly trackingTelemetry?: boolean;
      readonly poseTelemetry?: boolean;
      readonly inferenceRuntime?: string;
      readonly modelLoading?: string;
    };
    readonly dominantCategories?: readonly string[];
    readonly sceneComplexity?: {
      readonly meshCount?: number;
      readonly materialCount?: number;
      readonly vertexCount?: number;
    };
    readonly productionReadiness?: {
      readonly semanticSegmentTelemetry?: boolean;
      readonly deterministicMaskSummary?: boolean;
      readonly deterministicObjectTelemetry?: boolean;
      readonly deterministicTrackingTelemetry?: boolean;
      readonly skeletalPoseTelemetry?: boolean;
      readonly complexityBudgetTelemetry?: boolean;
      readonly browserAssetViewerEvidence?: boolean;
    };
    readonly blockedClaims?: readonly string[];
    readonly hash?: string;
  };
  readonly sourceKind?: "custom";
  readonly url?: string;
  readonly meshCount?: number;
  readonly materialCount?: number;
  readonly renderGeometryCount?: number;
  readonly renderMaterialCount?: number;
  readonly diagnostics?: {
    readonly drawCalls?: number;
    readonly textures?: number;
    readonly textureBytes?: number;
    readonly lastError?: string | null;
  };
  readonly frameTiming?: {
    readonly cpuFrameMs: number;
    readonly gpuFrameMs: number;
    readonly gpuTimingSupported: boolean;
    readonly gpuTimingSource: "cpu-fallback";
    readonly fallbackReason: string;
  };
  readonly loaderDiagnostics?: {
    readonly features?: readonly string[];
    readonly textureSlots?: readonly string[];
    readonly textureCount?: number;
    readonly animationCount?: number;
    readonly skinCount?: number;
    readonly morphTargetCount?: number;
    readonly compression?: {
      readonly draco: boolean;
      readonly meshopt: boolean;
      readonly ktx2Basis: boolean;
    };
  };
  readonly inspection?: {
    readonly meshes?: readonly unknown[];
    readonly materials?: readonly unknown[];
    readonly textures?: readonly unknown[];
  };
  readonly warnings?: readonly { readonly code?: string }[];
  readonly fallbackMaterials?: readonly {
    readonly name: string;
    readonly baseColor: string;
    readonly warningCodes: readonly string[];
    readonly affectedExtensions: readonly string[];
    readonly visibleInInspector: boolean;
  }[];
  readonly materialVariants?: readonly string[];
  readonly selectedMaterialVariant?: string;
  readonly lookControls?: {
    readonly materialOverride: "asset" | "matte" | "metallic";
    readonly materialOverrideAppliedTo: readonly string[];
    readonly environmentPreset: "studio" | "neutral" | "sunset";
    readonly environmentIntensity: number;
    readonly postprocessPreview: "off" | "exposure-diagnostic" | "bloom-diagnostic";
    readonly postprocessStatus: "disabled" | "diagnostic-only";
    readonly boundedControls: true;
  };
  readonly comparisonExport?: {
    readonly schemaVersion: "a3d-external-parity-asset-viewer-comparison-export";
    readonly generated: boolean;
    readonly renderer: "webgl2";
    readonly meshCount: number;
    readonly materialCount: number;
    readonly textureSlots: readonly string[];
    readonly loaderFeatures: readonly string[];
    readonly lookControls: AssetViewerSnapshot["lookControls"];
    readonly screenshotPath: string;
    readonly byteLength: number;
  };
  readonly dependencyResolution?: readonly {
    readonly uri: string;
    readonly fileName: string;
    readonly kind: "buffer" | "image" | "document";
    readonly byteLength: number;
  }[];
  readonly variantSwitching?: {
    readonly available: boolean;
    readonly applied: boolean;
  };
  readonly screenshot?: {
    readonly captured: boolean;
    readonly byteLength: number;
    readonly diagnosticJsonByteLength: number;
    readonly diagnosticJson: string;
  };
  readonly morphControls?: {
    readonly available: boolean;
    readonly targetCount: number;
    readonly activeWeights: readonly number[];
    readonly renderApplied: boolean;
  };
  readonly skeletonControls?: {
    readonly available: boolean;
    readonly skinCount: number;
    readonly boneCount: number;
    readonly bonesVisibleInInspector: boolean;
  };
  readonly animationPlayback?: {
    readonly clipName: string;
    readonly duration: number;
    readonly playing: boolean;
    readonly loopMode: "once" | "repeat" | "pingpong";
    readonly timeScale: number;
    readonly rootMotion: {
      readonly available: boolean;
      readonly target: string | null;
      readonly distance: number;
      readonly applied: boolean;
      readonly sampleCount: number;
      readonly appliedDistance: number;
      readonly position: readonly [number, number, number];
    };
    readonly time: number;
    readonly appliedTargets: readonly string[];
    readonly sampledNodeTransforms: number;
    readonly renderApplied: boolean;
  };
}

interface AssetViewerExternalParityReport {
  ok: boolean;
  readonly generatedAt: string;
  readonly command: string;
  readonly manifest: string;
  readonly validations: AssetViewerExternalParityValidation[];
  completedTaskEvidence: readonly {
    readonly task: string;
    readonly evidence: readonly string[];
  }[];
  blockedTasks: readonly string[];
}

interface AssetViewerExternalParityValidation {
  readonly assetId: string;
  readonly category: string;
  readonly url: string;
  readonly status: string | undefined;
  readonly screenshot: string;
  readonly nonBlankPixels: number;
  readonly drawCalls: number;
  readonly renderGeometryCount: number;
  readonly renderMaterialCount: number;
  readonly loaderFeatures: readonly string[];
  readonly textureSlots: readonly string[];
  readonly warnings: readonly string[];
  readonly fallbackMaterialCount: number;
  readonly inspectorSections: readonly string[];
  readonly materialVariants: readonly string[];
  readonly selectedMaterialVariant?: string;
  readonly materialOverride?: "asset" | "matte" | "metallic";
  readonly environmentPreset?: "studio" | "neutral" | "sunset";
  readonly postprocessPreview?: "off" | "exposure-diagnostic" | "bloom-diagnostic";
  readonly comparisonExportGenerated?: boolean;
  readonly dragDropLocalDocumentLoaded?: boolean;
  readonly screenshotDiagnosticJsonByteLength: number;
  readonly screenshotDiagnosticHasLoaderDiagnostics: boolean;
  readonly selectedAnimationLoopMode?: "once" | "repeat" | "pingpong";
  readonly scrubbedAnimationTime?: number;
  readonly activeMorphWeights?: readonly number[];
  readonly morphRenderApplied?: boolean;
  readonly ok: boolean;
}

const manifestPath = resolve("tests/reports/external-parity-asset-corpus.json");
const EXPECTED_ASSET_CORPUS_REPORT_SCHEMA = "a3d-external-parity-asset-corpus-report";
const manifest = loadExternalParityAssetManifest(manifestPath);
const screenshotRoot = resolve("tests/reports/external-parity-example-screenshots/asset-viewer-external-parity");
const reportPath = resolve("tests/reports/external-parity-asset-viewer-browser.json");

const report: AssetViewerExternalParityReport = {
  ok: false,
  generatedAt: new Date().toISOString(),
  command: "pnpm exec playwright test tests/browser/asset-viewer-external-parity.spec.ts",
  manifest: "tests/reports/external-parity-asset-corpus.json",
  validations: [],
  completedTaskEvidence: [],
  blockedTasks: [],
};

function loadExternalParityAssetManifest(path: string): ExternalParityAssetManifest {
  if (shouldRegenerateExternalParityAssetManifest(path)) {
    const result = spawnSync("pnpm", ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "tools/external-parity-asset-corpus/index.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "inherit"
    });
    if (result.status !== 0) {
      throw new Error("Failed to generate external parity asset corpus before browser validation.");
    }
  }
  const report = JSON.parse(readFileSync(path, "utf8")) as ExternalParityAssetCorpusReport;
  return {
    schemaVersion: report.schemaVersion,
    assetCount: report.assetCount,
    assets: report.assets.map((asset) => ({
      id: asset.id,
      category: asset.category,
      displayName: asset.displayName,
      localPath: asset.assetPath,
      features: asset.features,
      textureCount: asset.textureCount,
      animations: asset.animationCount,
      skins: asset.skinCount,
      morphTargets: asset.morphTargetCount
    }))
  };
}

function shouldRegenerateExternalParityAssetManifest(path: string): boolean {
  if (!existsSync(path)) return true;
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as Partial<ExternalParityAssetCorpusReport>;
    return report.schemaVersion !== EXPECTED_ASSET_CORPUS_REPORT_SCHEMA || !Array.isArray(report.assets);
  } catch {
    return true;
  }
}

test.describe("asset viewer external parity corpus browser evidence", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(screenshotRoot, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.length === manifest.assets.length && report.validations.every((validation) => validation.ok);
    report.completedTaskEvidence = [{
      task: "Add browser decode/render evidence for each corpus asset.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
        "tests/reports/external-parity-example-screenshots/asset-viewer-external-parity/*.png",
      ],
    }, {
      task: "Asset viewer renders every external parity corpus asset.",
      evidence: [
        "tests/reports/external-parity-asset-corpus.json",
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }, {
      task: "Allow scrub/play/pause/loop for animation clips.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }, {
      task: "Allow morph slider adjustment with visible renderer update.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }, {
      task: "Capture screenshots with diagnostic JSON.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
        "tests/reports/external-parity-example-screenshots/asset-viewer-external-parity/*.png",
      ],
    }, {
      task: "Allow drag/drop local glTF import in the external parity asset viewer.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }, {
      task: "Allow material/environment/postprocess controls in the external parity asset viewer.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }, {
      task: "Add same-asset comparison export data from the external parity asset viewer.",
      evidence: [
        "examples/asset-viewer/main.ts",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }, {
      task: "Show model hierarchy, mesh stats, material slots, texture slots, animation clips, skin/skeleton, morph targets, cameras, lights, variants, and warnings.",
      evidence: [
        "packages/assets/src/AssetInspection.ts",
        "examples/asset-viewer/main.ts",
        "fixtures/workflow-assets/assets/material-spheres/material-spheres.gltf",
        "tests/browser/asset-viewer-external-parity.spec.ts",
        "tests/reports/external-parity-asset-viewer-browser.json",
      ],
    }];
    report.blockedTasks = [
      "The generated external parity corpus validates loader diagnostics, render resource creation, and asset-viewer rendering, but it is not a claim that all assets are production-quality textured models.",
      "Skinned and morph assets are loaded and rendered with explicit bounded warnings where render-resource parity is not complete.",
    ];
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("loads and renders every external parity corpus asset in the asset viewer", async ({ page }) => {
    test.setTimeout(120_000);
    expect(manifest.schemaVersion).toBe(EXPECTED_ASSET_CORPUS_REPORT_SCHEMA);
    expect(manifest.assetCount).toBe(manifest.assets.length);
    expect(manifest.assets.length).toBeGreaterThanOrEqual(7);

    for (const asset of manifest.assets) {
      const validation = await validateAsset(page, server.origin, asset);
      report.validations.push(validation);
      expect(validation.ok, `${asset.id} failed external parity asset-viewer validation`).toBe(true);
    }
  });
});

async function validateAsset(page: Page, origin: string, asset: ExternalParityAssetManifestEntry): Promise<AssetViewerExternalParityValidation> {
  const url = `${origin}/${asset.localPath}`;
  await page.goto(`${origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const snapshot = (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
      return snapshot?.status === "ready" || snapshot?.status === "error";
    },
    undefined,
    { timeout: 20_000 },
  );

  let result = await page.evaluate(() => {
    return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
  });
  const nonBlankPixels = await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']");
  const screenshot = `tests/reports/external-parity-example-screenshots/asset-viewer-external-parity/${asset.id}.png`;
  await page.getByTestId("asset-viewer-canvas").screenshot({ path: resolve(screenshot) });
  if (asset.id === "external-parity-material-fidelity-card") {
    await page.screenshot({ path: resolve("tests/reports/external-parity-example-screenshots/asset-viewer.png"), fullPage: true });
  }

  if (asset.animations > 0) {
    await page.getByTestId("asset-viewer-animation-loop").selectOption("once");
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.animationPlayback?.loopMode;
    })).toBe("once");
    await page.getByTestId("asset-viewer-animation-loop").evaluate((select) => {
      const element = select as HTMLSelectElement;
      element.value = "repeat";
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.animationPlayback?.loopMode;
    })).toBe("repeat");
    await page.getByTestId("asset-viewer-animation-time").evaluate((input) => {
      const slider = input as HTMLInputElement;
      slider.value = "0.5";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.animationPlayback?.time ?? 0;
    })).toBeGreaterThan(0);
    await page.getByTestId("asset-viewer-animation-speed").evaluate((input) => {
      const slider = input as HTMLInputElement;
      slider.value = "1.5";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.animationPlayback?.timeScale ?? 0;
    })).toBe(1.5);
    await page.getByTestId("asset-viewer-animation-play").click();
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.animationPlayback?.playing;
    })).toBe(true);
    await page.getByTestId("asset-viewer-animation-play").click();
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.animationPlayback?.playing;
    })).toBe(false);
    result = await page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
    });
  }

  if (asset.id === "external-parity-material-fidelity-card") {
    await page.getByTestId("asset-viewer-material-variant").selectOption("warm-alt-finish");
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.selectedMaterialVariant;
    })).toBe("warm-alt-finish");
    await page.getByTestId("asset-viewer-material-override").selectOption("metallic");
    await page.getByTestId("asset-viewer-environment-preset").selectOption("sunset");
    await page.getByTestId("asset-viewer-environment-intensity").evaluate((input) => {
      const slider = input as HTMLInputElement;
      slider.value = "1.8";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByTestId("asset-viewer-postprocess-preview").selectOption("bloom-diagnostic");
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.lookControls;
    })).toMatchObject({
      materialOverride: "metallic",
      environmentPreset: "sunset",
      environmentIntensity: 1.8,
      postprocessPreview: "bloom-diagnostic",
      postprocessStatus: "diagnostic-only",
      boundedControls: true,
    });
    await page.getByTestId("asset-viewer-comparison-export").click();
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.comparisonExport?.generated;
    })).toBe(true);
    result = await page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
    });
  }

  if (asset.id === "external-parity-morph-expression") {
    await page.getByTestId("asset-viewer-morph-weight-0").evaluate((input) => {
      const slider = input as HTMLInputElement;
      slider.value = "0.2";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.morphControls?.activeWeights?.[0] ?? -1;
    })).toBe(0.2);
    await expect.poll(() => page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.morphControls?.renderApplied;
    })).toBe(true);
    result = await page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
    });
  }

  const inspectorSections = await inspectorSectionLabels(page);
  expect(inspectorSections).toEqual(expect.arrayContaining([
    "Hierarchy",
    "Meshes",
    "Materials",
    "Fallbacks",
    "Textures",
    "Animation",
    "Skins",
    "Morphs",
    "Variants",
    "Cameras/Lights",
    "Warnings",
  ]));

  assertCoreRenderEvidence(asset, result, url, nonBlankPixels, screenshot);
  assertFeatureEvidence(asset, result);

  await page.getByTestId("asset-viewer-screenshot").click();
  await expect.poll(() => page.evaluate(() => {
    return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.screenshot?.captured;
  })).toBe(true);
  result = await page.evaluate(() => {
    return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
  });
  const screenshotDiagnostic = parseScreenshotDiagnostic(result);
  expect(screenshotDiagnostic.loaderDiagnostics?.features).toContain("gltf");
  expect(result?.screenshot?.diagnosticJsonByteLength ?? 0).toBeGreaterThan(500);

  let dragDropLocalDocumentLoaded = false;
  if (asset.id === "external-parity-material-fidelity-card") {
    const gltfText = readFileSync(resolve(asset.localPath), "utf8");
    await page.evaluate((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], "external-parity-material-fidelity-card.gltf", { type: "model/gltf+json" }));
      const dropzone = document.querySelector<HTMLElement>("[data-testid='asset-viewer-dropzone']");
      if (!dropzone) throw new Error("asset-viewer-dropzone missing");
      dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, gltfText);
    await page.waitForFunction(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__?.sourceKind === "local";
    }, undefined, { timeout: 10_000 });
    const dropped = await page.evaluate(() => {
      return (window as unknown as { readonly __AURA3D_ASSET_VIEWER__?: AssetViewerSnapshot }).__AURA3D_ASSET_VIEWER__;
    });
    expect(dropped?.status, dropped?.error).toBe("ready");
    expect(dropped?.dependencyResolution).toEqual(expect.arrayContaining([
      expect.objectContaining({ uri: "external-parity-material-fidelity-card.gltf", fileName: "external-parity-material-fidelity-card.gltf", kind: "document" }),
    ]));
    dragDropLocalDocumentLoaded = true;
  }

  const warnings = result?.warnings?.map((warning) => String(warning.code ?? "unknown")) ?? [];
  return {
    assetId: asset.id,
    category: asset.category,
    url,
    status: result?.status,
    screenshot,
    nonBlankPixels,
    drawCalls: Number(result?.diagnostics?.drawCalls ?? 0),
    renderGeometryCount: Number(result?.renderGeometryCount ?? 0),
    renderMaterialCount: Number(result?.renderMaterialCount ?? 0),
    loaderFeatures: result?.loaderDiagnostics?.features ?? [],
    textureSlots: result?.loaderDiagnostics?.textureSlots ?? [],
    warnings,
    fallbackMaterialCount: result?.fallbackMaterials?.length ?? 0,
    inspectorSections,
    materialVariants: result?.materialVariants ?? [],
    ...(result?.selectedMaterialVariant ? { selectedMaterialVariant: result.selectedMaterialVariant } : {}),
    ...(result?.lookControls ? {
      materialOverride: result.lookControls.materialOverride,
      environmentPreset: result.lookControls.environmentPreset,
      postprocessPreview: result.lookControls.postprocessPreview,
    } : {}),
    comparisonExportGenerated: result?.comparisonExport?.generated === true,
    dragDropLocalDocumentLoaded,
    screenshotDiagnosticJsonByteLength: result?.screenshot?.diagnosticJsonByteLength ?? 0,
    screenshotDiagnosticHasLoaderDiagnostics: Array.isArray(screenshotDiagnostic.loaderDiagnostics?.features),
    ...(asset.animations > 0 ? {
      selectedAnimationLoopMode: result?.animationPlayback?.loopMode,
      scrubbedAnimationTime: result?.animationPlayback?.time,
    } : {}),
    ...(asset.id === "external-parity-morph-expression" ? {
      activeMorphWeights: result?.morphControls?.activeWeights ?? [],
      morphRenderApplied: result?.morphControls?.renderApplied ?? false,
    } : {}),
    ok: true,
  };
}

function assertCoreRenderEvidence(
  asset: ExternalParityAssetManifestEntry,
  result: AssetViewerSnapshot | undefined,
  url: string,
  nonBlankPixels: number,
  screenshot: string,
): void {
  expect(result?.status, result?.error).toBe("ready");
  expect(result?.visualClaim).toBe("bounded-gltf-asset-inspection-viewer");
  expect(result?.screenshotPath).toBe("tests/reports/external-parity-example-screenshots/asset-viewer.png");
  expect(typeof result?.claimBoundary).toBe("string");
  expect(result?.claimBoundary?.length ?? 0).toBeGreaterThan(40);
  expect(result?.featureEvidence?.loaded).toBe(true);
  expect(result?.featureEvidence?.externalParityRenderPreset).toBe(true);
  expect(result?.featureEvidence?.generatedEnvironmentMap).toBe(true);
  expect(result?.featureEvidence?.brdfLutValidated).toBe(true);
  expect(result?.featureEvidence?.postprocessRealSceneReadback).toBe(true);
  expect(result?.featureEvidence?.assetBundleManifest).toBe(true);
  expect(result?.featureEvidence?.assetBundleDependencySorting).toBe(true);
  expect(result?.featureEvidence?.assetCacheTelemetry).toBe(true);
  expect(result?.featureEvidence?.sceneAnalysisTelemetry).toBe(true);
  expect(Number(result?.featureEvidence?.sceneAnalysisSegments ?? 0)).toBeGreaterThan(0);
  expect(String(result?.featureEvidence?.sceneAnalysisMaskHash ?? "")).toMatch(/^[0-9a-f]{8}$/);
  expect(result?.featureEvidence?.objectDetectionTelemetry).toBe(true);
  expect(result?.featureEvidence?.objectTrackTelemetry).toBe(true);
  expect(Number(result?.featureEvidence?.objectDetections ?? 0)).toBeGreaterThan(0);
  expect(Number(result?.featureEvidence?.objectTracks ?? 0)).toBeGreaterThan(0);
  expect(result?.externalParityRenderPreset?.presetId).toBe("aura3d-external-parity-visual-quality-preset");
  expect(result?.externalParityRenderPreset?.colorManagement?.toneMapper).toBe("reinhard");
  expect(result?.externalParityRenderPreset?.activeFeatures).toEqual(expect.arrayContaining(["color-management", "tone-mapping", "bounded-pbr", "environment-reflections", "postprocess-bloom", "postprocess-fxaa"]));
  expect(result?.environmentResources?.resourceSet).toBe("generated-local-linear-hdr-environment");
  expect(result?.environmentResources?.hdrSource).toBe(true);
  expect(Number(result?.environmentResources?.maxLinearValue ?? 0)).toBeGreaterThan(1);
  expect(result?.environmentResources?.specularMipCount ?? 0).toBeGreaterThanOrEqual(4);
  expect(result?.environmentResources?.validation?.brdfLutTexture).toBe(true);
  expect(result?.environmentResources?.validation?.diffuseIrradiance).toBe(true);
  expect(result?.postprocess?.source).toBe("webgl2-backbuffer-readback");
  expect(result?.postprocess?.path).toBe("ExternalParityRenderPreset.toneMapPixels.bloomPixels.fxaaPixels");
  expect(Math.max(result?.postprocess?.inputNonDarkPixels ?? 0, result?.postprocess?.outputNonDarkPixels ?? 0)).toBeGreaterThan(0);
  expect(result?.postprocess?.outputColorBuckets ?? -1).toBeGreaterThanOrEqual(0);
  expect(result?.assetBundleCache?.source).toBe("origin-master-asset-bundle-cache-adapted");
  expect(result?.assetBundleCache?.manifest?.assetCount ?? 0).toBeGreaterThanOrEqual(4);
  expect(result?.assetBundleCache?.manifest?.totalBytes ?? 0).toBeGreaterThan(0);
  expect(result?.assetBundleCache?.dependencyGraph?.loadOrder?.length ?? 0).toBeGreaterThan(0);
  expect(result?.assetBundleCache?.dependencyGraph?.releaseOrder?.length ?? 0).toBeGreaterThan(0);
  expect(result?.assetBundleCache?.dependencyGraph?.cycleDetected).toBe(false);
  expect(result?.assetBundleCache?.cache?.policy).toBe("lru");
  expect(result?.assetBundleCache?.cache?.cachedEntries ?? 0).toBeGreaterThan(0);
  expect(result?.assetBundleCache?.cache?.memoryBytes ?? 0).toBeGreaterThan(0);
  expect(result?.assetBundleCache?.cache?.evictions ?? -1).toBeGreaterThanOrEqual(0);
  expect(result?.assetBundleCache?.cache?.hitRate ?? -1).toBeGreaterThanOrEqual(0);
  expect(result?.assetBundleCache?.productionReadiness).toMatchObject({
    bundleManifest: true,
    dependencySorting: true,
    memoryBudgetEviction: true,
    cacheTelemetry: true
  });
  expect(result?.assetBundleCache?.blockedClaims).toEqual(expect.arrayContaining(["Unity Addressables catalog parity", "Unreal Asset Manager primary asset parity"]));
  expect(result?.assetBundleCache?.hash).toMatch(/^[0-9a-f]{8}$/);
  expect(result?.sceneAnalysis?.source).toBe("origin-master-scene-analyzer-adapted");
  expect(result?.sceneAnalysis?.analyzer).toBe("deterministic-gltf-scene-analysis");
  expect(result?.sceneAnalysis?.mask?.width).toBe(48);
  expect(result?.sceneAnalysis?.mask?.height).toBe(32);
  expect(result?.sceneAnalysis?.mask?.classCount ?? 0).toBeGreaterThan(0);
  expect(result?.sceneAnalysis?.mask?.hash).toMatch(/^[0-9a-f]{8}$/);
  expect(result?.sceneAnalysis?.segments?.length ?? 0).toBeGreaterThan(0);
  expect(result?.sceneAnalysis?.objectDetections?.length ?? 0).toBeGreaterThan(0);
  expect(result?.sceneAnalysis?.objectDetections?.[0]?.bbox?.length ?? 0).toBe(4);
  expect(result?.sceneAnalysis?.objectTracks?.length ?? 0).toBeGreaterThan(0);
  expect(result?.sceneAnalysis?.objectTracks?.[0]?.historyLength).toBe(2);
  expect(result?.sceneAnalysis?.cvSystem).toMatchObject({
    source: "gltf-metadata-not-camera",
    detectionTelemetry: true,
    trackingTelemetry: true,
    inferenceRuntime: "not-used",
    modelLoading: "not-used"
  });
  expect(result?.sceneAnalysis?.dominantCategories?.length ?? 0).toBeGreaterThan(0);
  expect(result?.sceneAnalysis?.sceneComplexity?.meshCount).toBe(result?.meshCount);
  expect(result?.sceneAnalysis?.sceneComplexity?.materialCount).toBe(result?.materialCount);
  expect(result?.sceneAnalysis?.sceneComplexity?.vertexCount ?? 0).toBeGreaterThan(0);
  expect(result?.sceneAnalysis?.productionReadiness).toMatchObject({
    semanticSegmentTelemetry: true,
    deterministicMaskSummary: true,
    deterministicObjectTelemetry: true,
    deterministicTrackingTelemetry: true,
    complexityBudgetTelemetry: true,
    browserAssetViewerEvidence: true
  });
  expect(result?.sceneAnalysis?.blockedClaims).toEqual(expect.arrayContaining(["neural semantic segmentation parity", "real camera/image computer-vision inference"]));
  expect(result?.sceneAnalysis?.hash).toMatch(/^[0-9a-f]{8}$/);
  expect(result?.sourceKind).toBe("custom");
  expect(result?.url).toBe(url);
  expect(result?.meshCount).toBeGreaterThan(0);
  expect(result?.materialCount).toBeGreaterThan(0);
  expect(result?.renderGeometryCount).toBeGreaterThan(0);
  expect(result?.renderMaterialCount).toBeGreaterThan(0);
  expect(result?.diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);
  expect(result?.diagnostics?.lastError ?? null).toBeNull();
  expect(result?.frameTiming?.cpuFrameMs ?? -1).toBeGreaterThanOrEqual(0);
  expect(result?.frameTiming?.gpuFrameMs ?? -1).toBeGreaterThanOrEqual(0);
  expect(result?.frameTiming?.gpuTimingSupported).toBe(false);
  expect(result?.frameTiming?.gpuTimingSource).toBe("cpu-fallback");
  expect(result?.frameTiming?.fallbackReason).toContain("CPU");
  expect(result?.inspection?.meshes?.length ?? 0).toBeGreaterThan(0);
  expect(result?.inspection?.materials?.length ?? 0).toBeGreaterThan(0);
  expect(result?.loaderDiagnostics?.features).toContain("gltf");
  expect(result?.loaderDiagnostics?.features).toContain("mesh");
  expect(nonBlankPixels).toBeGreaterThan(100);
  expect(existsSync(resolve(screenshot))).toBe(true);
  expect(statSync(resolve(screenshot)).size).toBeGreaterThan(1000);
  expect(result?.loaderDiagnostics?.textureCount ?? 0).toBe(asset.textureCount);
  expect(result?.loaderDiagnostics?.animationCount ?? 0).toBe(asset.animations);
  expect(result?.loaderDiagnostics?.skinCount ?? 0).toBe(asset.skins);
  expect(result?.loaderDiagnostics?.morphTargetCount ?? 0).toBe(asset.morphTargets);
}

function assertFeatureEvidence(asset: ExternalParityAssetManifestEntry, result: AssetViewerSnapshot | undefined): void {
  const features = result?.loaderDiagnostics?.features ?? [];
  const textureSlots = result?.loaderDiagnostics?.textureSlots ?? [];
  const warnings = result?.warnings?.map((warning) => String(warning.code ?? "unknown")) ?? [];

  if (asset.id === "external-parity-material-fidelity-card") {
    expect(result?.materialVariants).toEqual(["warm-alt-finish"]);
    expect(result?.selectedMaterialVariant).toBe("warm-alt-finish");
    expect(result?.variantSwitching).toEqual({ available: true, applied: true });
    expect(result?.lookControls).toMatchObject({
      materialOverride: "metallic",
      environmentPreset: "sunset",
      environmentIntensity: 1.8,
      postprocessPreview: "bloom-diagnostic",
      postprocessStatus: "diagnostic-only",
      boundedControls: true,
    });
    expect(result?.lookControls?.materialOverrideAppliedTo.length ?? 0).toBeGreaterThan(0);
    expect(result?.comparisonExport).toMatchObject({
      schemaVersion: "a3d-external-parity-asset-viewer-comparison-export",
      generated: true,
      renderer: "webgl2",
      meshCount: result?.meshCount,
      materialCount: result?.materialCount,
      screenshotPath: "tests/reports/external-parity-example-screenshots/asset-viewer.png",
    });
    expect(result?.comparisonExport?.textureSlots).toEqual(expect.arrayContaining([
      "base-color",
      "metallic-roughness",
      "normal",
      "occlusion",
      "emissive",
    ]));
    expect(result?.comparisonExport?.byteLength ?? 0).toBeGreaterThan(300);
    expect(features).toContain("extension:KHR_materials_variants");
    expect(textureSlots).toEqual(expect.arrayContaining([
      "base-color",
      "metallic-roughness",
      "normal",
      "occlusion",
      "emissive",
    ]));
    expect(features).toEqual(expect.arrayContaining([
      "extension:KHR_texture_transform",
      "extension:KHR_materials_diffuse_transmission",
      "extension:KHR_materials_volume",
      "extension:KHR_materials_specular",
      "extension:KHR_materials_dispersion",
      "material:alpha-blend",
      "material:double-sided",
      "material:diffuse-transmission",
      "material:volume",
      "material:specular",
      "material:dispersion",
      "material:normal-texture",
      "material:occlusion-texture",
    ]));
    expect(result?.inspection?.textures?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(warnings).toContain("ASSET_VIEWER_VARIANTS_SWITCHING_BOUNDED");
    expect(result?.featureEvidence?.fallbackMaterialVisible).toBe(true);
    expect(result?.fallbackMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "unsupported-feature-fallback",
        baseColor: "#ff4fd8",
        warningCodes: expect.arrayContaining(["ASSET_VIEWER_VARIANTS_SWITCHING_BOUNDED"]),
        visibleInInspector: true,
      }),
    ]));
  }

  if (asset.id === "external-parity-specular-glossiness-card") {
    expect(features).toEqual(expect.arrayContaining([
      "extension:KHR_materials_pbrSpecularGlossiness",
      "material:pbr-specular-glossiness",
      "material:specular",
      "material:roughness",
    ]));
    expect(warnings).not.toContain("GLTF_UNSUPPORTED_MATERIAL_EXTENSION");
    expect(warnings).not.toContain("GLTF_UNSUPPORTED_EXTENSION");
  }

  if (asset.id === "external-parity-skinned-hero") {
    expect(features).toEqual(expect.arrayContaining(["animations", "skins", "skinning"]));
    expect(result?.animationPlayback?.clipName).toBe("hero-root-sway");
    expect(result?.animationPlayback?.loopMode).toBe("repeat");
    expect(result?.animationPlayback?.sampledNodeTransforms ?? 0).toBeGreaterThan(0);
    expect(result?.animationPlayback?.renderApplied).toBe(true);
    expect(result?.animationPlayback?.playing).toBe(false);
    expect(result?.animationPlayback?.timeScale).toBe(1.5);
    expect(result?.skeletonControls).toMatchObject({
      available: true,
      skinCount: 1,
      bonesVisibleInInspector: true,
    });
    expect(result?.skeletonControls?.boneCount ?? 0).toBeGreaterThan(0);
    expect(warnings).toContain("ASSET_VIEWER_SKINNING_RENDER_ACTIVE");
    expect(warnings).not.toContain("ASSET_VIEWER_SKINNING_INSPECT_ONLY");
  }

  if (asset.id === "external-parity-morph-expression") {
    expect(features).toContain("morph-targets");
    expect(features).toContain("animations");
    expect(result?.animationPlayback?.clipName).toBe("morph-weight-smile");
    expect(result?.animationPlayback?.renderApplied).toBe(true);
    expect(result?.morphControls).toMatchObject({
      available: true,
      targetCount: 1,
      activeWeights: [0.2],
      renderApplied: true,
    });
    expect(warnings).toContain("ASSET_VIEWER_MORPH_ANIMATION_ACTIVE");
    expect(warnings).not.toContain("ASSET_VIEWER_MORPH_PLAYBACK_BOUNDED");
  }

  if (asset.id === "external-parity-root-motion-clip") {
    expect(features).toContain("animations");
    expect(result?.animationPlayback?.clipName).toBe("root-translation-loop");
    expect(result?.animationPlayback?.loopMode).toBe("repeat");
    expect(result?.animationPlayback?.sampledNodeTransforms ?? 0).toBeGreaterThan(0);
    expect(result?.animationPlayback?.renderApplied).toBe(true);
    expect(result?.animationPlayback?.playing).toBe(false);
    expect(result?.animationPlayback?.timeScale).toBe(1.5);
    expect(result?.animationPlayback?.rootMotion).toMatchObject({
      available: true,
      target: expect.stringMatching(/\.(position|translation)$/),
      applied: true,
    });
    expect(result?.animationPlayback?.rootMotion.distance ?? 0).toBeGreaterThan(0);
    expect(result?.animationPlayback?.rootMotion.sampleCount ?? 0).toBeGreaterThan(0);
    expect(result?.animationPlayback?.rootMotion.appliedDistance ?? 0).toBeGreaterThan(0);
    expect(Math.abs(result?.animationPlayback?.rootMotion.position?.[0] ?? 0)).toBeGreaterThan(0);
    expect(warnings).toContain("ASSET_VIEWER_ROOT_MOTION_ACTIVE");
    expect(warnings).not.toContain("ASSET_VIEWER_ANIMATION_PLAYBACK_BOUNDED");
  }
}

async function inspectorSectionLabels(page: Page): Promise<readonly string[]> {
  return page.getByTestId("asset-viewer-inspector").locator("summary").allTextContents().then((labels) => {
    return labels.map((label) => label.replace(/\s+\(\d+\)$/, ""));
  });
}

function parseScreenshotDiagnostic(result: AssetViewerSnapshot | undefined): {
  readonly loaderDiagnostics?: { readonly features?: readonly string[] };
} {
  const diagnosticJson = result?.screenshot?.diagnosticJson;
  expect(diagnosticJson).toBeTruthy();
  return JSON.parse(diagnosticJson ?? "{}") as {
    readonly loaderDiagnostics?: { readonly features?: readonly string[] };
  };
}

async function nonBlankWebGLPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext("webgl2", { preserveDrawingBuffer: true }) ?? canvas?.getContext("webgl", { preserveDrawingBuffer: true });
    if (!canvas || !gl) return 0;
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
    }
    return pixels;
  }, selector);
}
