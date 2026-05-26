import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { arch, cpus, platform, release, totalmem, type } from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import type { Page } from "@playwright/test";
import babylonLargeScene from "../../benchmarks/babylon/src/scenes/large-scene.js";
import babylonProductConfigurator from "../../benchmarks/babylon/src/scenes/product-configurator.js";
import babylonSkinnedCharacters from "../../benchmarks/babylon/src/scenes/skinned-characters.js";
import babylonArchitectureViewer from "../../benchmarks/babylon/src/scenes/architecture-viewer.js";
import babylonAssetRender from "../../benchmarks/babylon/src/scenes/asset-render.js";
import babylonInstancing from "../../benchmarks/babylon/src/scenes/instancing.js";
import babylonParticles from "../../benchmarks/babylon/src/scenes/particles.js";
import babylonPbrMaterials from "../../benchmarks/babylon/src/scenes/pbr-materials.js";
import babylonPostprocess from "../../benchmarks/babylon/src/scenes/postprocess.js";
import babylonMorphCharacters from "../../benchmarks/babylon/src/scenes/morph-characters.js";
import babylonEditorAuthoredStartup from "../../benchmarks/babylon/src/scenes/editor-authored-startup.js";
import aura3dLargeScene from "../../benchmarks/aura3d/src/scenes/large-scene.js";
import aura3dProductConfigurator from "../../benchmarks/aura3d/src/scenes/product-configurator.js";
import aura3dSkinnedCharacters from "../../benchmarks/aura3d/src/scenes/skinned-characters.js";
import aura3dArchitectureViewer from "../../benchmarks/aura3d/src/scenes/architecture-viewer.js";
import aura3dAssetRender from "../../benchmarks/aura3d/src/scenes/asset-render.js";
import aura3dInstancing from "../../benchmarks/aura3d/src/scenes/instancing.js";
import aura3dParticles from "../../benchmarks/aura3d/src/scenes/particles.js";
import aura3dPbrMaterials from "../../benchmarks/aura3d/src/scenes/pbr-materials.js";
import aura3dPostprocess from "../../benchmarks/aura3d/src/scenes/postprocess.js";
import aura3dMorphCharacters from "../../benchmarks/aura3d/src/scenes/morph-characters.js";
import aura3dEditorAuthoredStartup from "../../benchmarks/aura3d/src/scenes/editor-authored-startup.js";
import threeLargeScene from "../../benchmarks/threejs/src/scenes/large-scene.js";
import threeProductConfigurator from "../../benchmarks/threejs/src/scenes/product-configurator.js";
import threeSkinnedCharacters from "../../benchmarks/threejs/src/scenes/skinned-characters.js";
import threeArchitectureViewer from "../../benchmarks/threejs/src/scenes/architecture-viewer.js";
import threeAssetRender from "../../benchmarks/threejs/src/scenes/asset-render.js";
import threeInstancing from "../../benchmarks/threejs/src/scenes/instancing.js";
import threeParticles from "../../benchmarks/threejs/src/scenes/particles.js";
import threePbrMaterials from "../../benchmarks/threejs/src/scenes/pbr-materials.js";
import threePostprocess from "../../benchmarks/threejs/src/scenes/postprocess.js";
import threeMorphCharacters from "../../benchmarks/threejs/src/scenes/morph-characters.js";
import threeEditorAuthoredStartup from "../../benchmarks/threejs/src/scenes/editor-authored-startup.js";

type Engine = "babylon" | "aura3d" | "threejs";

type BenchmarkScene = {
  readonly id: string;
  readonly engine: Engine;
  readonly engineVersion: string;
  readonly sceneVersion: number;
  readonly assetId: string;
  readonly assetClass?: string;
  readonly resolution: { readonly width: number; readonly height: number; readonly dpr: number };
  readonly warmupFrames: number;
  readonly measuredFrames: number;
  readonly cameraPath: string;
  readonly lighting: string;
  readonly materialFeatures?: readonly string[];
  readonly postprocessState?: {
    readonly enabled: boolean;
    readonly effects: readonly string[];
    readonly sourceEvidence?: readonly string[];
  };
  readonly animationState?: {
    readonly enabled: boolean;
    readonly clips: number;
    readonly skinning: boolean;
    readonly morphTargets: boolean;
    readonly playback: string;
  };
  readonly quality: Record<string, boolean>;
  readonly workload: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly materials: number;
    readonly materialVariants: number;
    readonly textures: number;
    readonly textureBytes?: number;
    readonly geometryBytes?: number;
    readonly shaders?: number;
    readonly animations: number;
    readonly particles: number;
    readonly instances?: number;
  };
  readonly workflow?: {
    readonly kind: "editor-authored-exported-app-startup";
    readonly exportedProjectPath: string;
    readonly exportedRuntimePath: string;
    readonly editorEvidenceReportPath: string;
    readonly comparisonMode: string;
    readonly authoredOperations: readonly string[];
  };
  readonly unsupportedFeatures?: readonly string[];
};

type SceneComparison = {
  readonly id: string;
  readonly equivalent: boolean;
  readonly reason?: string;
  readonly estimates: Record<Engine, Record<string, unknown>>;
  readonly workflow?: BenchmarkScene["workflow"];
};

type PackageJson = {
  readonly name?: string;
  readonly version?: string;
  readonly devDependencies?: Record<string, string>;
  readonly benchmarkEngine?: {
    readonly name: string;
    readonly version: string;
  };
};

type BrowserSettings = {
  readonly headless: boolean;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly colorScheme: "light";
  readonly reducedMotion: "reduce";
  readonly javaScriptEnabled: boolean;
};

type BrowserEvidence = {
  readonly browser: {
    readonly mode: string;
    readonly version: string;
    readonly engine: string;
    readonly executablePath: string;
    readonly userAgent: string;
    readonly settings: BrowserSettings | string;
  };
  readonly gpu: {
    readonly adapter: string;
    readonly vendor: string;
    readonly webglVersion: string;
    readonly shadingLanguageVersion: string;
  };
  readonly screenshots: {
    readonly status: string;
    readonly reason: string;
    readonly paths: string[];
  };
  readonly failureLog: string[];
};

type BenchmarkMeasurement = {
  readonly engine: Engine;
  readonly sceneId: string;
  readonly measurementMode: "browser-webgl2-microbenchmark";
  readonly sampleCount: number;
  readonly warmupFrames: number;
  readonly measuredFrames: number;
  readonly startupMs: ReturnType<typeof summarize>;
  readonly firstFrameMs: ReturnType<typeof summarize>;
  readonly assetLoadMs: ReturnType<typeof summarize>;
  readonly frameTimeMs: ReturnType<typeof summarize>;
  readonly memoryMb: ReturnType<typeof summarize>;
  readonly drawCalls: number;
  readonly requestedDrawCalls: number;
  readonly shaderCount: number;
  readonly textureCount: number;
  readonly textureBytes: number;
  readonly geometryBytesEstimate: number;
  readonly jsHeapEstimateMb: ReturnType<typeof summarize>;
  readonly triangles: number;
  readonly sourceCodeBytes: number;
  readonly bundleBytes: number;
  readonly bundlePath: string;
  readonly screenshotPath: string;
  readonly failureLog: string[];
  readonly rawSamples: {
    readonly startupMs: readonly number[];
    readonly firstFrameMs: readonly number[];
    readonly assetLoadMs: readonly number[];
    readonly frameTimeMs: readonly number[];
    readonly memoryMb: readonly number[];
  };
  readonly editorWorkflow?: {
    readonly kind: "editor-authored-exported-app-startup";
    readonly projectBytes: number;
    readonly runtimeBytes: number;
    readonly operationCount: number;
    readonly comparisonMode: string;
  };
};

type BenchmarkVisualRender = {
  readonly engine: Engine;
  readonly sceneId: string;
  readonly screenshotPath: string;
  readonly metrics: {
    readonly width: number;
    readonly height: number;
    readonly nonBlankPixels: number;
    readonly colorBuckets: number;
    readonly drawCalls: number;
    readonly objectCount: number;
  };
};

type ScreenshotDiffResult = {
  readonly sceneId: string;
  readonly baselineEngine: "aura3d";
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
};

type BenchmarkBundle = {
  readonly engine: Engine;
  readonly sceneId: string;
  readonly path: string;
  readonly bytes: number;
};

type BenchmarkMeasurementEvidence = {
  readonly measurements: readonly BenchmarkMeasurement[];
  readonly bundles: readonly BenchmarkBundle[];
  readonly visualRenders: readonly BenchmarkVisualRender[];
  readonly screenshotDiffs: readonly ScreenshotDiffResult[];
  readonly failureLog: readonly string[];
};

type BenchmarkBrowserPage = {
  evaluate<R>(pageFunction: string): Promise<R>;
  evaluate<R, A>(pageFunction: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
};

type WorkflowPayload = {
  readonly projectJson: string;
  readonly runtimeBytes: number;
  readonly operationCount: number;
  readonly comparisonMode: string;
} | null;

type SupportedNicheClaim = {
  readonly id: string;
  readonly status: "supported";
  readonly claim: string;
  readonly comparedEngine: "threejs" | "babylon";
  readonly measuredDimension: string;
  readonly evidence: {
    readonly reportPath: string;
    readonly scenes: readonly {
      readonly id: string;
      readonly aura3dBundleBytes?: number;
      readonly competitorBundleBytes?: number;
      readonly ratio?: number;
      readonly losingDimensions?: number;
    }[];
  };
  readonly exclusions: readonly string[];
};

type BroadSuperiorityEvidenceDimension = {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
};

type CompetitorBroadSuperiorityEvidence = {
  readonly competitor: "threejs" | "babylon";
  readonly dimensions: readonly BroadSuperiorityEvidenceDimension[];
  readonly passedDimensions: number;
  readonly totalDimensions: number;
  readonly ready: boolean;
};

const scenes: BenchmarkScene[] = [
  aura3dProductConfigurator,
  aura3dArchitectureViewer,
  aura3dAssetRender,
  aura3dPbrMaterials,
  aura3dLargeScene,
  aura3dInstancing,
  aura3dSkinnedCharacters,
  aura3dParticles,
  aura3dPostprocess,
  aura3dMorphCharacters,
  aura3dEditorAuthoredStartup,
  threeProductConfigurator,
  threeArchitectureViewer,
  threeAssetRender,
  threePbrMaterials,
  threeLargeScene,
  threeInstancing,
  threeSkinnedCharacters,
  threeParticles,
  threePostprocess,
  threeMorphCharacters,
  threeEditorAuthoredStartup,
  babylonProductConfigurator,
  babylonArchitectureViewer,
  babylonAssetRender,
  babylonPbrMaterials,
  babylonLargeScene,
  babylonInstancing,
  babylonSkinnedCharacters,
  babylonParticles,
  babylonPostprocess,
  babylonMorphCharacters,
  babylonEditorAuthoredStartup,
];

const foundationComparedSceneIds = [
  "product-configurator",
  "architecture-viewer",
  "asset-render",
  "pbr-materials",
  "large-scene",
  "instancing",
  "skinned-characters",
  "particles",
  "editor-authored-startup",
] as const;
const externalParityComparedSceneIds = [
  "product-configurator",
  "architecture-viewer",
  "asset-render",
  "pbr-materials",
  "postprocess",
  "large-scene",
  "instancing",
  "skinned-characters",
  "morph-characters",
  "particles",
  "editor-authored-startup",
] as const;
const isExternalParityRun = process.argv.includes("--external-parity");
const comparedSceneIds = isExternalParityRun ? externalParityComparedSceneIds : foundationComparedSceneIds;
const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  const assetManifest = JSON.parse(readFileSync(resolve("benchmarks/fixtures/assets/manifest.json"), "utf8")) as {
    assets: Array<{ id: string }>;
  };
  const assetIds = new Set(assetManifest.assets.map((asset) => asset.id));
  const comparisons = comparedSceneIds.map((id) => compareScene(id, assetIds));
  let report = createReport(comparisons);

  if (process.argv.includes("--write-reports")) {
    const measurementEvidence = await captureBenchmarkMeasurements();
    report = withBenchmarkMeasurements(report, measurementEvidence);
    const browserEvidence = await captureBrowserEvidence(report);
    report = withBrowserEvidence(report, browserEvidence);
    report = withComparisonOutcomes(report);
    const threejsReport = filterReport(report, "threejs");
    const babylonReport = filterReport(report, "babylon");
    writeJson(comparisonReportPath("threejs"), threejsReport);
    writeJson(comparisonReportPath("babylon"), babylonReport);
    writeJson("tests/reports/comparison-threejs.json", threejsReport);
    writeJson("tests/reports/comparison-babylon.json", babylonReport);
    writeJson(isExternalParityRun ? "tests/reports/external-parity-engine-comparison.json" : "tests/reports/foundation-engine-comparison.json", report);
  }

  if (process.argv.includes("--write-docs")) {
    writeMarkdown("docs/benchmarks/threejs-comparison.md", createMarkdown(filterReport(report, "threejs"), "Three.js"));
    writeMarkdown("docs/benchmarks/babylon-comparison.md", createMarkdown(filterReport(report, "babylon"), "Babylon.js"));
  }

  console.log(JSON.stringify(report, null, 2));
}

function compareScene(id: string, assetIds: Set<string>): SceneComparison {
  const byEngine = new Map<Engine, BenchmarkScene>();
  for (const scene of scenes.filter((candidate) => candidate.id === id)) {
    byEngine.set(scene.engine, scene);
  }

  const requiredEngines: Engine[] = ["aura3d", "threejs", "babylon"];
  for (const engine of requiredEngines) {
    if (!byEngine.has(engine)) {
      return { id, equivalent: false, reason: `missing ${engine} scene definition`, estimates: {} as Record<Engine, Record<string, unknown>> };
    }
  }

  const base = byEngine.get("aura3d")!;
  const estimates = {} as Record<Engine, Record<string, unknown>>;
  for (const engine of requiredEngines) {
    const scene = byEngine.get(engine)!;
    if (!assetIds.has(scene.assetId)) {
      return { id, equivalent: false, reason: `${engine} references unknown asset ${scene.assetId}`, estimates };
    }
    if (!sameBenchmarkShape(base, scene)) {
      return { id, equivalent: false, reason: `${engine} scene does not match Aura3D benchmark shape`, estimates };
    }
    estimates[engine] = estimateScene(scene);
  }

  return { id, equivalent: true, estimates, workflow: base.workflow };
}

function sameBenchmarkShape(left: BenchmarkScene, right: BenchmarkScene): boolean {
  return (
    left.assetId === right.assetId &&
    left.resolution.width === right.resolution.width &&
    left.resolution.height === right.resolution.height &&
    left.resolution.dpr === right.resolution.dpr &&
    left.warmupFrames === right.warmupFrames &&
    left.measuredFrames === right.measuredFrames &&
    left.assetClass === right.assetClass &&
    left.cameraPath === right.cameraPath &&
    left.lighting === right.lighting &&
    JSON.stringify(left.materialFeatures ?? []) === JSON.stringify(right.materialFeatures ?? []) &&
    JSON.stringify(left.postprocessState ?? null) === JSON.stringify(right.postprocessState ?? null) &&
    JSON.stringify(left.animationState ?? null) === JSON.stringify(right.animationState ?? null) &&
    JSON.stringify(left.quality) === JSON.stringify(right.quality) &&
    JSON.stringify(left.workload) === JSON.stringify(right.workload) &&
    JSON.stringify(left.workflow ?? null) === JSON.stringify(right.workflow ?? null)
  );
}

function estimateScene(scene: BenchmarkScene): Record<string, unknown> {
  const workload = scene.workload;
  const frameTimeMs =
    1.2 +
    workload.drawCalls * 0.015 +
    workload.triangles * 0.00002 +
    workload.materials * 0.08 +
    workload.textures * 0.05 +
    workload.animations * 0.025 +
    workload.particles * 0.002;
  const startupMs = 18 + workload.materials * 2.2 + workload.textures * 3.5 + workload.triangles * 0.00012;
  const firstFrameMs = startupMs + frameTimeMs;
  const assetLoadMs = 2 + workload.textures * 1.4 + workload.triangles * 0.00004 + workload.animations * 0.01;
  const memoryMb = 12 + workload.triangles * 0.00018 + workload.materials * 0.4 + workload.textures * 1.5 + workload.particles * 0.00012;
  const frameSamplesMs = deterministicSamples(frameTimeMs, scene.id);
  const startupSamplesMs = deterministicSamples(startupMs, scene.id);
  const firstFrameSamplesMs = deterministicSamples(firstFrameMs, scene.id);
  const assetLoadSamplesMs = deterministicSamples(assetLoadMs, scene.id);
  const memorySamplesMb = deterministicSamples(memoryMb, scene.id);

  return {
    measurementMode: "deterministic-scaffold-estimate",
    sampleCount: frameSamplesMs.length,
    frameTimeMs: summarize(frameSamplesMs),
    startupMs: summarize(startupSamplesMs),
    firstFrameMs: summarize(firstFrameSamplesMs),
    assetLoadMs: summarize(assetLoadSamplesMs),
    memoryMb: summarize(memorySamplesMb),
    drawCalls: workload.drawCalls,
    triangles: workload.triangles,
    shaderCount: workload.shaders ?? Math.max(1, Math.ceil(workload.materials / 4)),
    textureCount: workload.textures,
    textureBytes: workload.textureBytes ?? workload.textures * 65_536,
    geometryBytesEstimate: workload.geometryBytes ?? workload.triangles * 24,
    jsHeapEstimateMb: summarize(memorySamplesMb),
    unsupportedFeatures: scene.unsupportedFeatures ?? [],
    assetClass: scene.assetClass ?? "unspecified",
    materialFeatures: scene.materialFeatures ?? [],
    postprocessState: scene.postprocessState ?? { enabled: scene.quality.postprocess, effects: [] },
    animationState: scene.animationState ?? {
      enabled: scene.workload.animations > 0,
      clips: scene.workload.animations,
      skinning: scene.quality.skinning,
      morphTargets: false,
      playback: scene.workload.animations > 0 ? "animation-workload-metadata" : "static",
    },
    sourceCodeBytes: sceneSourceBytes(scene),
    sourceCodeSizeBytes: sceneSourceBytes(scene),
    bundleBytes: "not-measured-no-browser-bundle-built",
    screenshotPath: "not-captured-run-with-write-reports",
    failureLog: [],
    rawSamples: {
      frameTimeMs: frameSamplesMs,
      startupMs: startupSamplesMs,
      firstFrameMs: firstFrameSamplesMs,
      assetLoadMs: assetLoadSamplesMs,
      memoryMb: memorySamplesMb,
    },
  };
}

function createReport(comparisons: SceneComparison[]): Record<string, unknown> {
  const ok = comparisons.every((comparison) => comparison.equivalent);
  const rootPackage = readJson("package.json") as PackageJson;
  const threePackage = readJson("benchmarks/threejs/package.json") as PackageJson;
  const babylonPackage = readJson("benchmarks/babylon/package.json") as PackageJson;
  const productVisualParity = isExternalParityRun ? productVisualParityEvidence() : { status: "not-applicable-to-foundation" };
  const productVisualParityReady = isRecord(productVisualParity) && productVisualParity.aura3dThreeBabylon === true;
  const gltfLoaderVisualParity = isExternalParityRun ? gltfLoaderVisualParityEvidence() : { status: "not-applicable-to-foundation" };
  const gltfLoaderVisualParityReady = isRecord(gltfLoaderVisualParity) && gltfLoaderVisualParity.aura3dThreeBabylon === true;
  const fullGltfLoaderVisualParityReady = isRecord(gltfLoaderVisualParity) && gltfLoaderVisualParity.fullCorpusThreeBabylon === true;
  const featureRuntimeCoverage = featureRuntimeCoverageMatrix();

  return {
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.A3D_RELEASE_RUN_ID ?? "standalone-compare-engines-run",
    gitSha: gitSha(),
    command: isExternalParityRun
      ? "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --external-parity --write-reports"
      : "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --write-reports",
    sourceInputs: sourceInputPaths(),
    suite: isExternalParityRun ? "external-parity-engine-comparison" : "foundation-engine-comparison",
    ok,
    claimUsable: false,
    claimCaveat: "This report validates equivalent benchmark scaffolds, browser WebGL2 microbenchmark measurements, and bundle artifacts. Broad competitive claims remain unsupported; only exact supportedNicheClaims may be used.",
    supportedNicheClaims: [] as SupportedNicheClaim[],
    repeatability: {
      command: isExternalParityRun
        ? "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --external-parity --write-reports"
        : "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --write-reports",
      deterministic: false,
      sampleSource: "Checked-in scene definitions plus Playwright Chromium WebGL2 microbenchmark timers; measurements vary by browser, GPU backend, and machine load.",
    },
    environment: {
      node: process.version,
      packageManager: packageManager(),
      os: {
        type: type(),
        platform: platform(),
        release: release(),
        arch: arch(),
      },
      hardware: {
        cpuModel: cpus()[0]?.model ?? "unknown",
        cpuCount: cpus().length,
        totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
      },
      browser: {
        mode: "not-run",
        version: "not-captured-no-browser-benchmark-executed",
        engine: "not-captured-no-browser-benchmark-executed",
        settings: "not-captured-no-browser-benchmark-executed",
      },
      gpu: {
        adapter: "not-captured-no-browser-benchmark-executed",
        vendor: "not-captured-no-browser-benchmark-executed",
      },
    },
    artifacts: {
      screenshots: {
        status: "not-captured",
        reason: "Run with --write-reports to capture Playwright audit screenshots. Rendered scene screenshots are still unsupported by this scaffold.",
        paths: [] as string[],
      },
      bundles: {
        status: "not-built",
        reason: "Run with --write-reports to build browser benchmark bundles.",
        paths: [] as string[],
      },
      rawSamples: {
        status: "included-inline",
        location: "scenes[].estimates.*.rawSamples",
      },
      failureLogs: {
        status: "included-inline",
        location: "scenes[].estimates.*.failureLog",
      },
      screenshotDiffs: {
        status: "not-captured",
        reason: "Run with --write-reports to compare Aura3D benchmark canvas screenshots against Three.js and Babylon.js captures.",
        paths: [] as string[],
      },
    },
    comparedEngines: {
      aura3d: rootPackage.version ?? "unknown",
      threejs: threePackage.benchmarkEngine?.version ?? "unknown",
      babylon: babylonPackage.benchmarkEngine?.version ?? "unknown",
    },
    dependencyPins: dependencyPins(rootPackage, threePackage, babylonPackage),
    gltfCompatibility: gltfCompatibilitySummary(),
    featureComparison: featureComparisonMatrix(),
    featureRuntimeCoverage,
    productVisualParity,
    gltfLoaderVisualParity,
    comparisonOutcomes: {
      status: "not-measured",
      reason: "Run with --write-reports to attach browser measurements and compute loss/tie/win outcomes.",
      byCompetitor: {},
    },
    broadSuperiority: {
      threejs: false,
      babylonjs: false,
      blockers: [
        "browser measurements and comparison outcomes are not attached",
        "visual, feature, loader, tooling, ecosystem, and independent reproduction evidence are not sufficient for broad superiority",
      ],
    },
    unsupportedByThisReport: [
      "GPU memory counters",
      ...(productVisualParityReady ? [] : ["rendered product screenshot diffs"]),
      ...(productVisualParityReady ? ["Unity/Unreal product-render visual parity"] : ["external engine product-render visual parity beyond the benchmark canvas screenshots"]),
      ...(gltfLoaderVisualParityReady ? [] : ["visual pixel parity for external Three.js/Babylon.js glTF loader output"]),
      ...(fullGltfLoaderVisualParityReady ? [] : ["full-corpus and extension visual pixel parity for external Three.js/Babylon.js glTF loader output"]),
      isExternalParityRun
        ? "full external-engine controls/materials/lights/shadows/postprocess runtime scoring with Unity/Unreal remains blocked"
        : "controls/materials/lights/shadows/postprocess runtime feature scoring",
      ...(isExternalParityRun ? [
        "broad better-than-Three.js claims",
        "broad better-than-Babylon.js claims",
        "Unity/Unreal replacement claims",
        "production-ready claims",
      ] : []),
    ],
    scenes: comparisons,
  };
}

function sourceInputPaths(): string[] {
  const scenePaths = Array.from(comparedSceneIds).flatMap((id) => [
    `benchmarks/shared/scenes/${id}.ts`,
    `benchmarks/aura3d/src/scenes/${id}.ts`,
    `benchmarks/threejs/src/scenes/${id}.ts`,
    `benchmarks/babylon/src/scenes/${id}.ts`,
  ]);
  return [
    ...scenePaths,
    "benchmarks/shared/scenes/descriptor.ts",
    "benchmarks/fixtures/assets/manifest.json",
    "examples/foundation-editor-authored-app/project.json",
    "examples/foundation-editor-authored-app/runtime.js",
    "tests/reports/foundation-editor-authoring.json",
    ...(isExternalParityRun ? [
      "docs/project/verification-evidence.md",
      "docs/project/product-studio-decision-gates.md",
      "docs/project/implementation-plan.md",
      "tests/reports/foundation-rendering.json",
      "tests/reports/external-parity-product-visual-parity.json",
      "tools/external-parity-product-visual-parity/index.ts",
      "tools/external-parity-product-visual-parity/productScene.ts",
      "tests/reports/external-parity-gltf-loader-visual-parity.json",
      "tools/external-parity-gltf-loader-visual-parity/index.ts",
      "tests/reports/external-parity-rendering.json",
      "tests/reports/external-parity-pbr-gltf-readiness.json",
      "tests/reports/external-parity-shadow-map-readiness.json",
      "tests/reports/external-parity-postprocess-suite.json",
      "tests/reports/external-parity-hdr-render-target-readiness.json",
      "tests/reports/external-parity-webgpu-parity.json",
      "tests/reports/external-parity-production-readiness.json",
      "tests/reports/external-parity-ecosystem-readiness.json",
      "tests/reports/external-parity-unity-unreal-parity.json",
      "tests/reports/package-install-smoke.json",
      "tests/reports/package-provenance.json",
    ] : []),
    "tools/compare-engines/index.ts",
  ];
}

function productVisualParityEvidence(): Record<string, unknown> {
  const reportPath = "tests/reports/external-parity-product-visual-parity.json";
  if (!existsSync(resolve(reportPath))) {
    return {
      status: "missing",
      reportPath,
      aura3dThreeBabylon: false,
      blockers: ["Run `pnpm audit:external-parity-product-visual-parity` before writing External parity engine-comparison reports."],
    };
  }
  const report = readJson(reportPath);
  if (!isRecord(report)) {
    return {
      status: "invalid",
      reportPath,
      aura3dThreeBabylon: false,
      blockers: ["External parity product visual parity report is not a JSON object."],
    };
  }
  const rendered = isRecord(report.renderedProductVisualParity) ? report.renderedProductVisualParity : {};
  const diffs = Array.isArray(report.diffs) ? report.diffs.filter(isRecord) : [];
  const threejs = report.ok === true && rendered.threejs === true && diffs.some((diff) => diff.comparedEngine === "threejs" && diff.pass === true);
  const babylon = report.ok === true && rendered.babylon === true && diffs.some((diff) => diff.comparedEngine === "babylon" && diff.pass === true);
  return {
    status: threejs && babylon ? "bounded-product-visual-diffs-pass" : "blocked",
    reportPath,
    aura3dThreeBabylon: threejs && babylon,
    threejs,
    babylon,
    unity: rendered.unity === true,
    unreal: rendered.unreal === true,
    sceneDescriptor: report.sceneDescriptor,
    diffSummary: diffs.map((diff) => ({
      comparedEngine: diff.comparedEngine,
      pass: diff.pass,
      changedPixelRatio: diff.changedPixelRatio,
      meanAbsoluteError: diff.meanAbsoluteError,
      diffPath: diff.diffPath,
    })),
    blockers: [
      ...(threejs ? [] : ["Three.js product visual diff is missing or failing."]),
      ...(babylon ? [] : ["Babylon.js product visual diff is missing or failing."]),
      ...(rendered.unity === true ? [] : ["Unity product visual baseline is missing."]),
      ...(rendered.unreal === true ? [] : ["Unreal product visual baseline is missing."]),
    ],
  };
}

function gltfLoaderVisualParityEvidence(): Record<string, unknown> {
  const reportPath = "tests/reports/external-parity-gltf-loader-visual-parity.json";
  if (!existsSync(resolve(reportPath))) {
    return {
      status: "missing",
      reportPath,
      aura3dThreeBabylon: false,
      blockers: ["Run `pnpm audit:external-parity-gltf-loader-visual-parity` before writing External parity engine-comparison reports."],
    };
  }
  const report = readJson(reportPath);
  if (!isRecord(report)) {
    return {
      status: "invalid",
      reportPath,
      aura3dThreeBabylon: false,
      blockers: ["External parity glTF loader visual parity report is not a JSON object."],
    };
  }
  const bounded = isRecord(report.boundedGltfLoaderVisualParity) ? report.boundedGltfLoaderVisualParity : {};
  const externalCorpus = isRecord(report.externalCorpus) ? report.externalCorpus : {};
  const diffs = Array.isArray(report.diffs) ? report.diffs.filter(isRecord) : [];
  const renders = Array.isArray(report.renders) ? report.renders.filter(isRecord) : [];
  const violations = Array.isArray(report.violations) ? report.violations.filter((violation): violation is string => typeof violation === "string") : [];
  const threejs = report.ok === true && bounded.threejs === true && diffs.some((diff) => diff.comparedEngine === "threejs" && diff.pass === true);
  const babylon = report.ok === true && bounded.babylon === true && diffs.some((diff) => diff.comparedEngine === "babylon" && diff.pass === true);
  const fullCorpusThreeBabylon = report.fullGltfLoaderVisualParity === true && externalCorpus.fullGltfLoaderVisualParity === true;
  return {
    status: threejs && babylon ? "bounded-same-source-gltf-loader-visual-diffs-pass" : "blocked",
    reportPath,
    aura3dThreeBabylon: threejs && babylon,
    fullCorpusThreeBabylon,
    threejs,
    babylon,
    externalCorpus: {
      sourceAssetCount: Number(externalCorpus.sourceAssetCount ?? 0),
      visualAssetCount: Number(externalCorpus.visualAssetCount ?? 0),
      visualParityAssetCount: Number(externalCorpus.visualParityAssetCount ?? 0),
      visuallyValidatedWarningCount: Number(externalCorpus.visuallyValidatedWarningCount ?? 0),
      fullGltfLoaderVisualParity: externalCorpus.fullGltfLoaderVisualParity === true,
    },
    assets: Array.isArray(report.assets) ? report.assets : [],
    visualQualityWarnings: Array.isArray(report.visualQualityWarnings) ? report.visualQualityWarnings : [],
    renderSummary: renders.map((render) => ({
      assetId: render.assetId,
      engine: render.engine,
      screenshotPath: render.screenshotPath,
      metrics: render.metrics,
    })),
    diffSummary: diffs.map((diff) => ({
      assetId: diff.assetId,
      comparedEngine: diff.comparedEngine,
      pass: diff.pass,
      changedPixelRatio: diff.changedPixelRatio,
      meanAbsoluteError: diff.meanAbsoluteError,
      diffPath: diff.diffPath,
    })),
    blockers: [
      ...(threejs ? [] : ["Three.js same-source glTF loader visual diff is missing or failing."]),
      ...(babylon ? [] : ["Babylon.js same-source glTF loader visual diff is missing or failing."]),
      ...(fullCorpusThreeBabylon ? [] : [
        `Full external glTF loader visual parity is not complete (${Number(externalCorpus.visualParityAssetCount ?? 0)}/${Number(externalCorpus.sourceAssetCount ?? 0)} external visual assets pass strict Three.js/Babylon diffs; ${Number(externalCorpus.visualAssetCount ?? 0)}/${Number(externalCorpus.sourceAssetCount ?? 0)} render).`,
        ...violations,
      ]),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function withBrowserEvidence(report: Record<string, unknown>, evidence: BrowserEvidence): Record<string, unknown> {
  const environment = report.environment as Record<string, unknown>;
  const artifacts = report.artifacts as Record<string, unknown>;
  const previousScreenshots = artifacts.screenshots as { status?: string; reason?: string; paths?: string[] } | undefined;
  return {
    ...report,
    environment: {
      ...environment,
      browser: evidence.browser,
      gpu: evidence.gpu,
    },
    artifacts: {
      ...artifacts,
      screenshots: {
        status: previousScreenshots?.status ?? evidence.screenshots.status,
        reason: previousScreenshots?.reason ?? evidence.screenshots.reason,
        paths: [...(previousScreenshots?.paths ?? []), ...evidence.screenshots.paths],
      },
      auditScreenshots: evidence.screenshots,
      browserCaptureFailureLog: evidence.failureLog,
    },
  };
}

function filterReport(report: Record<string, unknown>, competitor: "threejs" | "babylon"): Record<string, unknown> {
  return {
    ...report,
    competitor,
    supportedNicheClaims: (report.supportedNicheClaims as SupportedNicheClaim[] | undefined)?.filter((claim) => claim.comparedEngine === competitor) ?? [],
    scenes: (report.scenes as SceneComparison[]).map((scene) => ({
      id: scene.id,
      equivalent: scene.equivalent,
      reason: scene.reason,
      estimates: {
        aura3d: scene.estimates.aura3d,
        [competitor]: scene.estimates[competitor],
      },
    })),
  };
}

function withBenchmarkMeasurements(report: Record<string, unknown>, evidence: BenchmarkMeasurementEvidence): Record<string, unknown> {
  const byKey = new Map(evidence.measurements.map((measurement) => [`${measurement.engine}:${measurement.sceneId}`, measurement]));
  const scenesWithMeasurements = (report.scenes as SceneComparison[]).map((scene) => {
    const estimates = {} as Record<Engine, Record<string, unknown>>;
    for (const engine of ["aura3d", "threejs", "babylon"] as const) {
      const existing = scene.estimates[engine];
      const measurement = byKey.get(`${engine}:${scene.id}`);
      estimates[engine] = measurement
        ? {
            ...existing,
            deterministicEstimate: existing,
            ...measurement,
            measurementCaveat:
              "Browser WebGL2 microbenchmark using the equivalent workload metadata with recorded frame and draw-call caps; this is timing and bundle evidence, not rendered product parity.",
          }
        : existing;
    }
    return { ...scene, estimates };
  });
  const artifacts = report.artifacts as Record<string, unknown>;

  const nextReport = {
    ...report,
    artifacts: {
      ...artifacts,
      bundles: {
        status: evidence.bundles.length > 0 ? "built-browser-benchmark-bundles" : "bundle-build-failed",
        reason:
          "Bundles are esbuild browser artifacts for the benchmark runtime imports and scene metadata. They are measured artifacts, not public npm package release bundles.",
        paths: evidence.bundles.map((bundle) => bundle.path),
      },
      screenshots: {
        status: evidence.measurements.some((measurement) => measurement.screenshotPath) ? "captured-webgl2-microbenchmark-canvases" : "not-captured",
        reason: "Screenshots capture the WebGL2 microbenchmark canvas for each equivalent scene workload; they are not external engine product-render parity screenshots.",
        paths: evidence.measurements.map((measurement) => measurement.screenshotPath).filter((path) => path !== ""),
      },
      screenshotDiffs: {
        status: evidence.screenshotDiffs.length > 0 ? "computed-rendered-benchmark-scene-diffs" : "not-computed",
        reason:
          "Diff PNGs and metrics compare Aura3D's descriptor-driven rendered benchmark visual captures against the Three.js and Babylon.js rendered benchmark visual captures for each equivalent scene. They are generated benchmark-scene visual evidence, not external Unity/Unreal product-render parity.",
        paths: evidence.screenshotDiffs.map((diff) => diff.diffPath),
      },
      renderedBenchmarkVisuals: {
        status: evidence.visualRenders.length > 0 ? "captured-descriptor-driven-rendered-benchmark-scenes" : "not-captured",
        reason:
          "Screenshots capture descriptor-driven real rendered browser scenes for Aura3D, Three.js, and Babylon.js using the shared benchmark scene metadata.",
        paths: evidence.visualRenders.map((render) => render.screenshotPath),
      },
    },
    benchmarkMeasurementFailureLog: evidence.failureLog,
    benchmarkVisualRenders: evidence.visualRenders,
    screenshotDiffs: evidence.screenshotDiffs,
    scenes: scenesWithMeasurements,
  };
  return {
    ...nextReport,
    supportedNicheClaims: bundleSizeNicheClaims(nextReport),
  };
}

function withComparisonOutcomes(report: Record<string, unknown>): Record<string, unknown> {
  const sceneComparisons = report.scenes as SceneComparison[];
  const byCompetitor = Object.fromEntries((["threejs", "babylon"] as const).map((competitor) => {
    const sceneOutcomes = sceneComparisons.map((scene) => {
      const aura3d = scene.estimates.aura3d;
      const other = scene.estimates[competitor];
      return {
        id: scene.id,
        equivalent: scene.equivalent,
        frameTimeMedian: compareTimingMetric(lowerIsBetter(aura3d?.frameTimeMs), lowerIsBetter(other?.frameTimeMs)),
        frameTimeP95: compareTimingMetric(p95Metric(aura3d?.frameTimeMs), p95Metric(other?.frameTimeMs)),
        startupMedian: neutralMicrobenchmarkStartupMetric(lowerIsBetter(aura3d?.startupMs), lowerIsBetter(other?.startupMs)),
        assetLoadMedian: compareTimingMetric(lowerIsBetter(aura3d?.assetLoadMs), lowerIsBetter(other?.assetLoadMs)),
        bundleBytes: compareMetric(numeric(aura3d?.bundleBytes), numeric(other?.bundleBytes)),
        drawCalls: compareMetric(numeric(aura3d?.drawCalls), numeric(other?.drawCalls)),
        shaderCount: compareMetric(numeric(aura3d?.shaderCount), numeric(other?.shaderCount)),
        textureBytes: compareMetric(numeric(aura3d?.textureBytes), numeric(other?.textureBytes)),
        geometryBytesEstimate: compareMetric(numeric(aura3d?.geometryBytesEstimate), numeric(other?.geometryBytesEstimate)),
        screenshotDiff: screenshotDiffFor(report, scene.id, competitor),
        unsupportedFeatures: Array.from(new Set([
          ...unsupportedFromEstimate(aura3d),
          ...unsupportedFromEstimate(other),
        ])),
      };
    });
    const flat = sceneOutcomes.flatMap((scene) => [
      scene.frameTimeMedian.result,
      scene.frameTimeP95.result,
      scene.startupMedian.result,
      scene.assetLoadMedian.result,
      scene.bundleBytes.result,
      scene.drawCalls.result,
      scene.shaderCount.result,
      scene.textureBytes.result,
      scene.geometryBytesEstimate.result,
    ]);
    return [competitor, {
      summary: {
        wins: flat.filter((result) => result === "win").length,
        ties: flat.filter((result) => result === "tie").length,
        losses: flat.filter((result) => result === "loss").length,
        unavailable: flat.filter((result) => result === "unavailable").length,
      },
      scenes: sceneOutcomes,
    }];
  }));

  const broadSuperiorityEvidence = broadSuperiorityEvidenceMatrix(report, byCompetitor);
  const broadSuperiority = broadSuperiorityAssessment(byCompetitor, broadSuperiorityEvidence);
  const claimUsable = broadSuperiority.threejs === true && broadSuperiority.babylonjs === true;
  return {
    ...report,
    supportedNicheClaims: bundleSizeNicheClaims(report),
    claimUsable,
    broadSuperiorityEvidence,
    broadSuperiority,
    unsupportedByThisReport: unsupportedMarkersAfterBroadAssessment(report, broadSuperiority),
    claimCaveat: claimUsable
      ? "This report includes computed broad-superiority evidence for the checked-in comparison scope. Use the completion audit before making release, Unity/Unreal, or production-readiness claims."
      : report.claimCaveat,
    comparisonOutcomes: {
      status: "computed-from-report-measurements",
      rule: "For lower-is-better non-timing metrics, Aura3D wins when at least 5% lower, loses when at least 5% higher, and ties inside +/-5%. Timing metrics additionally tie inside a 2 ms absolute tolerance. startupMedian is neutral for this WebGL2 microbenchmark because the startup path creates a raw browser WebGL2 context and shader directly; it does not import or execute Aura3D, Three.js, or Babylon.js runtime code.",
      byCompetitor,
    },
  };
}

function unsupportedMarkersAfterBroadAssessment(
  report: Record<string, unknown>,
  broadSuperiority: { readonly threejs: boolean; readonly babylonjs: boolean }
): readonly string[] {
  const unsupported = Array.isArray(report.unsupportedByThisReport)
    ? report.unsupportedByThisReport.filter((entry): entry is string => typeof entry === "string")
    : [];
  return unsupported.filter((marker) =>
    !(marker === "broad better-than-Three.js claims" && broadSuperiority.threejs) &&
    !(marker === "broad better-than-Babylon.js claims" && broadSuperiority.babylonjs)
  );
}

function broadSuperiorityAssessment(
  byCompetitor: Record<string, unknown>,
  evidence: readonly CompetitorBroadSuperiorityEvidence[]
): { readonly threejs: boolean; readonly babylonjs: boolean; readonly blockers: readonly string[] } {
  const three = competitorBroadSuperiority(byCompetitor.threejs, "Three.js", evidence.find((entry) => entry.competitor === "threejs"));
  const babylon = competitorBroadSuperiority(byCompetitor.babylon, "Babylon.js", evidence.find((entry) => entry.competitor === "babylon"));
  return {
    threejs: three.ready,
    babylonjs: babylon.ready,
    blockers: [...three.blockers, ...babylon.blockers],
  };
}

function competitorBroadSuperiority(
  value: unknown,
  label: string,
  evidence: CompetitorBroadSuperiorityEvidence | undefined
): { readonly ready: boolean; readonly blockers: readonly string[] } {
  if (typeof value !== "object" || value === null || !("summary" in value)) {
    return { ready: false, blockers: [`${label}: comparison outcomes are unavailable.`] };
  }
  const summary = (value as { summary?: Record<string, unknown> }).summary ?? {};
  const rawScenes = (value as { scenes?: unknown }).scenes;
  const scenes = Array.isArray(rawScenes) ? rawScenes.filter(isRecord) : [];
  const wins = Number(summary.wins ?? 0);
  const losses = Number(summary.losses ?? 0);
  const unavailable = Number(summary.unavailable ?? 0);
  const scenesWithWins = scenes.filter((scene) => sceneHasWin(scene)).length;
  const blockers = [
    ...(losses === 0 ? [] : [`${label}: ${losses} benchmark dimensions still lose.`]),
    ...(unavailable === 0 ? [] : [`${label}: ${unavailable} benchmark dimensions are unavailable.`]),
    ...(wins >= comparedSceneIds.length && scenesWithWins === comparedSceneIds.length ? [] : [`${label}: benchmark wins do not cover every compared scene (${scenesWithWins}/${comparedSceneIds.length} scenes with at least one win).`]),
    ...(evidence?.ready === true ? [] : [`${label}: broad-superiority evidence matrix is incomplete (${evidence?.passedDimensions ?? 0}/${evidence?.totalDimensions ?? 0} dimensions passed).`]),
    ...(evidence?.dimensions.flatMap((dimension) =>
      dimension.passed ? [] : [`${label}: ${dimension.label}: ${dimension.blockers.join("; ")}`]
    ) ?? [`${label}: broad-superiority evidence matrix is missing.`]),
  ];
  return {
    ready: blockers.length === 0,
    blockers,
  };
}

function sceneHasWin(scene: Record<string, unknown>): boolean {
  return [
    "frameTimeMedian",
    "frameTimeP95",
    "assetLoadMedian",
    "bundleBytes",
    "drawCalls",
    "shaderCount",
    "textureBytes",
    "geometryBytesEstimate",
  ].some((field) => isRecord(scene[field]) && scene[field].result === "win");
}

function broadSuperiorityEvidenceMatrix(report: Record<string, unknown>, byCompetitor: Record<string, unknown>): readonly CompetitorBroadSuperiorityEvidence[] {
  return (["threejs", "babylon"] as const).map((competitor) => {
    const product = readOptionalReport("tests/reports/external-parity-product-visual-parity.json");
    const gltf = readOptionalReport("tests/reports/external-parity-gltf-loader-visual-parity.json");
    const pbrGltf = readOptionalReport("tests/reports/external-parity-pbr-gltf-readiness.json");
    const shadow = readOptionalReport("tests/reports/external-parity-shadow-map-readiness.json");
    const hdr = readOptionalReport("tests/reports/external-parity-hdr-render-target-readiness.json");
    const postprocess = readOptionalReport("tests/reports/external-parity-postprocess-suite.json");
    const webgpu = readOptionalReport("tests/reports/external-parity-webgpu-parity.json");
    const unityUnreal = readOptionalReport("tests/reports/external-parity-unity-unreal-parity.json");
    const production = readOptionalReport("tests/reports/external-parity-production-readiness.json");
    const ecosystem = readOptionalReport("tests/reports/external-parity-ecosystem-readiness.json");
    const packageInstall = readOptionalReport("tests/reports/package-install-smoke.json");
    const packageProvenance = readOptionalReport("tests/reports/package-provenance.json");
    const comparison = isRecord(byCompetitor[competitor]) ? byCompetitor[competitor] : {};
    const scenes = Array.isArray((comparison as Record<string, unknown>).scenes) ? (comparison as { scenes: readonly Record<string, unknown>[] }).scenes : [];
    const screenshotDiffs = Array.isArray(report.screenshotDiffs) ? report.screenshotDiffs.filter(isRecord) : [];
    const screenshotDiffArtifacts = isRecord(report.artifacts) && isRecord(report.artifacts.screenshotDiffs) ? report.artifacts.screenshotDiffs : {};
    const screenshotDiffsAreBroadClaimEvidence =
      typeof screenshotDiffArtifacts.reason === "string" &&
      !screenshotDiffArtifacts.reason.includes("not product-render visual parity") &&
      !screenshotDiffArtifacts.reason.includes("timing artifact");
    const screenshotDiffBlockers = screenshotDiffsAreBroadClaimEvidence
      ? ["rendered benchmark visual diffs must pass for every compared scene"]
      : [
          "benchmark screenshot diffs must pass for every compared scene using real rendered scene captures",
          "current comparison screenshots are WebGL2 microbenchmark timing canvases and are not product-render visual parity evidence"
        ];
    const productParity = isRecord(product?.renderedProductVisualParity) ? product.renderedProductVisualParity : {};
    const boundedGltfParity = isRecord(gltf?.boundedGltfLoaderVisualParity) ? gltf.boundedGltfLoaderVisualParity : {};
    const pbrGltfBlockers = [
      ...(pbrGltf?.pbrParity === true ? [] : ["full PBR readiness must be true"]),
      ...(pbrGltf?.gltfParity === true ? [] : ["full glTF readiness must be true"]),
    ];
    const dimensions: BroadSuperiorityEvidenceDimension[] = [
      dimension(
        "equivalent-benchmark-scenes",
        "Equivalent benchmark scene definitions",
        (report.scenes as SceneComparison[] | undefined)?.length === comparedSceneIds.length &&
          (report.scenes as SceneComparison[] | undefined)?.every((scene) => scene.equivalent) === true,
        ["tests/reports/external-parity-engine-comparison.json", "benchmarks/shared/scenes"],
        [`expected ${comparedSceneIds.length} equivalent benchmark scenes for Aura3D, Three.js, and Babylon.js`]
      ),
      dimension(
        "browser-measurement-coverage",
        "Browser measurement coverage",
        scenes.length === comparedSceneIds.length &&
          scenes.every((scene) => isRecord(scene.aura3d) || scene.equivalent === true) &&
          Array.isArray(report.benchmarkMeasurementFailureLog) &&
          report.benchmarkMeasurementFailureLog.length === 0,
        ["tests/reports/external-parity-engine-comparison.json"],
        ["browser WebGL2 measurements, bundles, and failure logs must cover every compared scene"]
      ),
      dimension(
        "benchmark-screenshot-diffs",
        "Same-scene benchmark screenshot diffs",
        screenshotDiffsAreBroadClaimEvidence &&
          screenshotDiffs.filter((diff) => diff.comparedEngine === competitor && diff.pass === true).length === comparedSceneIds.length,
        ["tests/reports/external-parity-engine-comparison.json", "tests/reports/comparison-screenshots"],
        screenshotDiffBlockers
      ),
      dimension(
        "product-visual-parity",
        "Rendered product visual parity",
        product?.ok === true && productParity[competitor === "threejs" ? "threejs" : "babylon"] === true,
        ["tests/reports/external-parity-product-visual-parity.json"],
        [`product visual parity must pass for Aura3D vs ${competitor === "threejs" ? "Three.js" : "Babylon.js"} browser renders`]
      ),
      dimension(
        "gltf-loader-visual-parity",
        "glTF loader visual parity",
        gltf?.ok === true && boundedGltfParity.threejs === true && boundedGltfParity.babylon === true,
        ["tests/reports/external-parity-gltf-loader-visual-parity.json"],
        ["same-source glTF visual-loader parity must pass across the required corpus and extensions"]
      ),
      dimension(
        "pbr-gltf-full-parity",
        "Full PBR and glTF parity",
        pbrGltf?.pbrParity === true && pbrGltf?.gltfParity === true,
        ["tests/reports/external-parity-pbr-gltf-readiness.json"],
        pbrGltfBlockers
      ),
      dimension(
        "shadow-hdr-postprocess-parity",
        "Shadow, HDR, and postprocess parity",
        shadow?.shadowMapParity === true && hdr?.hdrRenderTargetParity === true && postprocess?.postprocessSuiteParity === true,
        ["tests/reports/external-parity-shadow-map-readiness.json", "tests/reports/external-parity-hdr-render-target-readiness.json", "tests/reports/external-parity-postprocess-suite.json"],
        ["production shadow-map parity, HDR/render-target parity, and full postprocess-suite parity must all be true"]
      ),
      dimension(
        "webgpu-real-hardware-parity",
        "Real WebGPU hardware parity",
        webgpu?.fullWebGPUParity === true,
        ["tests/reports/external-parity-webgpu-parity.json", "tests/reports/webgpu-hardware-matrix.json"],
        ["full WebGPU parity must include real adapter/device and real WebGPU render/readback evidence"]
      ),
      dimension(
        "unity-unreal-workflow-parity",
        "Unity/Unreal workflow parity",
        unityUnreal?.unityParity === true && unityUnreal?.unrealParity === true && unityUnreal?.replacement === true,
        ["tests/reports/external-parity-unity-unreal-parity.json"],
        ["Unity parity, Unreal parity, and replacement readiness must all be true"]
      ),
      dimension(
        "production-and-independent-reproduction",
        "Production deployment and independent reproduction",
        production?.productionReady === true && packageInstall?.ok === true && packageProvenance?.ok === true,
        ["tests/reports/external-parity-production-readiness.json", "tests/reports/package-install-smoke.json", "tests/reports/package-provenance.json"],
        ["production readiness, clean package install smoke, and provenance evidence must all pass"]
      ),
      dimension(
        "ecosystem-docs-accessibility-device-matrix",
        "Ecosystem, documentation, accessibility, and device matrix",
        ecosystem?.ok === true && ecosystem.boundedEcosystemDocsAccessibilityDeviceMatrix === true,
        ["tests/reports/external-parity-ecosystem-readiness.json", "docs/project/product-studio-decision-gates.md", "tests/reports/browser-hardware-matrix.json"],
        ["bounded documentation, accessibility, and device-matrix audit must pass; this still does not prove ecosystem superiority"]
      ),
    ];
    return {
      competitor,
      dimensions,
      passedDimensions: dimensions.filter((entry) => entry.passed).length,
      totalDimensions: dimensions.length,
      ready: dimensions.every((entry) => entry.passed),
    };
  });
}

function dimension(
  id: string,
  label: string,
  passed: boolean,
  evidencePaths: readonly string[],
  blockers: readonly string[]
): BroadSuperiorityEvidenceDimension {
  return {
    id,
    label,
    passed,
    evidencePaths,
    blockers: passed ? [] : blockers,
  };
}

function screenshotDiffFor(report: Record<string, unknown>, sceneId: string, competitor: "threejs" | "babylon"): ScreenshotDiffResult | undefined {
  const diffs = report.screenshotDiffs;
  if (!Array.isArray(diffs)) return undefined;
  return diffs.find((diff): diff is ScreenshotDiffResult => {
    if (typeof diff !== "object" || diff === null) return false;
    const entry = diff as Partial<ScreenshotDiffResult>;
    return entry.sceneId === sceneId && entry.comparedEngine === competitor;
  });
}

function lowerIsBetter(value: unknown): number | undefined {
  return medianMetric(value);
}

function medianMetric(value: unknown): number | undefined {
  if (typeof value === "object" && value !== null && "median" in value && typeof value.median === "number") return value.median;
  return undefined;
}

function p95Metric(value: unknown): number | undefined {
  if (typeof value === "object" && value !== null && "p95" in value && typeof value.p95 === "number") return value.p95;
  return undefined;
}

function compareMetric(aura3d: number | undefined, competitor: number | undefined): { result: "win" | "tie" | "loss" | "unavailable"; aura3d?: number; competitor?: number; ratio?: number } {
  if (aura3d === undefined || competitor === undefined) return { result: "unavailable", ...(aura3d !== undefined ? { aura3d } : {}), ...(competitor !== undefined ? { competitor } : {}) };
  if (aura3d === 0 && competitor === 0) return { result: "tie", aura3d, competitor, ratio: 1 };
  if (competitor === 0) return { result: aura3d === 0 ? "tie" : "loss", aura3d, competitor };
  const ratio = aura3d / competitor;
  const result = ratio <= 0.95 ? "win" : ratio >= 1.05 ? "loss" : "tie";
  return { result, aura3d, competitor, ratio: Number(ratio.toFixed(3)) };
}

function compareTimingMetric(aura3d: number | undefined, competitor: number | undefined): { result: "win" | "tie" | "loss" | "unavailable"; aura3d?: number; competitor?: number; ratio?: number; toleranceMs?: number } {
  const toleranceMs = 2;
  if (aura3d === undefined || competitor === undefined) return { result: "unavailable", ...(aura3d !== undefined ? { aura3d } : {}), ...(competitor !== undefined ? { competitor } : {}), toleranceMs };
  if (Math.abs(aura3d - competitor) <= toleranceMs) {
    return { result: "tie", aura3d, competitor, ratio: competitor === 0 ? (aura3d === 0 ? 1 : undefined) : Number((aura3d / competitor).toFixed(3)), toleranceMs };
  }
  return { ...compareMetric(aura3d, competitor), toleranceMs };
}

function neutralMicrobenchmarkStartupMetric(aura3d: number | undefined, competitor: number | undefined): {
  readonly result: "tie" | "unavailable";
  readonly aura3d?: number;
  readonly competitor?: number;
  readonly ratio?: number;
  readonly neutralized: boolean;
  readonly reason: string;
} {
  const reason = "browser WebGL2 context and shader startup is measured without importing any compared engine runtime";
  if (aura3d === undefined || competitor === undefined) {
    return {
      result: "unavailable",
      ...(aura3d !== undefined ? { aura3d } : {}),
      ...(competitor !== undefined ? { competitor } : {}),
      neutralized: true,
      reason
    };
  }
  return {
    result: "tie",
    aura3d,
    competitor,
    ratio: competitor === 0 ? (aura3d === 0 ? 1 : undefined) : Number((aura3d / competitor).toFixed(3)),
    neutralized: true,
    reason
  };
}

function unsupportedFromEstimate(estimate: Record<string, unknown> | undefined): string[] {
  const value = estimate?.unsupportedFeatures;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function bundleSizeNicheClaims(report: Record<string, unknown>): SupportedNicheClaim[] {
  const scenesToCheck = report.scenes as SceneComparison[];
  return ([
    ["threejs", "Three.js", comparisonReportPath("threejs")],
    ["babylon", "Babylon.js", comparisonReportPath("babylon")]
  ] as const).flatMap(([competitor, label, reportPath]) => {
    const evidence = scenesToCheck.flatMap((scene) => {
      const aura3dBundleBytes = numeric(scene.estimates.aura3d?.bundleBytes);
      const competitorBundleBytes = numeric(scene.estimates[competitor]?.bundleBytes);
      if (!aura3dBundleBytes || !competitorBundleBytes || aura3dBundleBytes >= competitorBundleBytes) return [];
      return [{
        id: scene.id,
        aura3dBundleBytes,
        competitorBundleBytes,
        ratio: Number((aura3dBundleBytes / competitorBundleBytes).toFixed(3))
      }];
    });
    if (evidence.length !== comparedSceneIds.length) return [];
    return [{
      id: `equivalent-scaffold-bundle-size-${competitor}`,
      status: "supported",
      claim: `Aura3D generated smaller esbuild browser benchmark bundles than ${label} for all ${comparedSceneIds.length} checked-in equivalent scaffold scenes on this run.`,
      comparedEngine: competitor,
      measuredDimension: "esbuild browser benchmark bundle bytes",
      evidence: {
        reportPath,
        scenes: evidence
      },
      exclusions: [
        "This is not a runtime frame-rate claim.",
        "This is not a production release bundle-size claim.",
        "This is not rendered visual parity, loader parity, ecosystem maturity, or broad engine superiority.",
        "The claim is limited to the checked-in benchmark scene definitions, dependency versions, browser/toolchain environment, and generated reports from this run."
      ]
    }];
  });
}

function comparisonReportPath(competitor: "threejs" | "babylon"): string {
  return isExternalParityRun
    ? `tests/reports/external-parity-comparison-${competitor}.json`
    : `tests/reports/foundation-comparison-.json`;
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function captureBenchmarkMeasurements(): Promise<BenchmarkMeasurementEvidence> {
  const bundles = await buildBenchmarkBundles();
  const bundleByKey = new Map(bundles.map((bundle) => [`${bundle.engine}:${bundle.sceneId}`, bundle]));
  const measurements: BenchmarkMeasurement[] = [];
  const failureLog: string[] = [];
  const activeScenes = scenes.filter((scene) => Array.from(comparedSceneIds).includes(scene.id as never));
  const measurementScenes = interleavedMeasurementScenes(activeScenes);
  const measurementIterations = 5;

  try {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({
      headless: true,
      args: ["--enable-precise-memory-info"],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    mkdirSync(resolve("tests/reports/comparison-screenshots"), { recursive: true });

    for (const scene of measurementScenes) {
      const bundle = bundleByKey.get(`${scene.engine}:${scene.id}`);
      const screenshotPath = `tests/reports/comparison-screenshots/${scene.engine}-${scene.id}.png`;
      const page = await context.newPage();
      try {
        await page.setContent("<!doctype html><html><body></body></html>", { waitUntil: "load" });
        await page.addScriptTag({ content: browserBenchmarkMeasurementScript });
        await page.evaluate(`window.__measureBenchmarkScene(${JSON.stringify({
          scene: browserWarmupScene(scene),
          bundleBytes: 0,
          bundlePath: "warmup-not-recorded",
          screenshotPath: "warmup-not-recorded",
          sourceCodeBytes: 0,
          workflowPayload: null,
        })})`);
        const measuredRuns: BenchmarkMeasurement[] = [];
        for (let iteration = 0; iteration < measurementIterations; iteration += 1) {
          measuredRuns.push(await page.evaluate(`window.__measureBenchmarkScene(${JSON.stringify({
            scene,
            bundleBytes: bundle?.bytes ?? 0,
            bundlePath: bundle?.path ?? "not-built",
            screenshotPath,
            sourceCodeBytes: sceneSourceBytes(scene),
            workflowPayload: workflowPayloadForScene(scene),
          })})`) as BenchmarkMeasurement);
        }
        const measured = combineBenchmarkMeasurements(measuredRuns);
        await page.screenshot({ path: resolve(screenshotPath), fullPage: true });
        measurements.push(measured);
      } catch (error) {
        failureLog.push(`${scene.engine}/${scene.id}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    const visualBundles = await buildBenchmarkVisualBundles();
    const page = await context.newPage();
    const visualRenders = await captureBenchmarkVisualRenders(page, activeScenes, visualBundles, failureLog);
    const screenshotDiffs = await createScreenshotDiffs(page, visualRenders, failureLog);
    await page.close().catch(() => undefined);
    await context.close();
    await browser.close();
    return { measurements, bundles, visualRenders, screenshotDiffs, failureLog };
  } catch (error) {
    failureLog.push(error instanceof Error ? error.stack ?? error.message : String(error));
  }

  return { measurements, bundles, visualRenders: [], screenshotDiffs: [], failureLog };
}

function interleavedMeasurementScenes(activeScenes: readonly BenchmarkScene[]): BenchmarkScene[] {
  const byKey = new Map(activeScenes.map((scene) => [`${scene.engine}:${scene.id}`, scene]));
  const engineOrders: readonly (readonly Engine[])[] = [
    ["aura3d", "threejs", "babylon"],
    ["threejs", "babylon", "aura3d"],
    ["babylon", "aura3d", "threejs"],
  ];
  return comparedSceneIds.flatMap((id, index) => {
    const order = engineOrders[index % engineOrders.length] ?? engineOrders[0];
    return order.map((engine) => byKey.get(`${engine}:${id}`)).filter((scene): scene is BenchmarkScene => Boolean(scene));
  });
}

function combineBenchmarkMeasurements(runs: readonly BenchmarkMeasurement[]): BenchmarkMeasurement {
  const first = runs[0];
  if (!first) throw new Error("Cannot combine empty benchmark measurement runs.");
  const rawSamples = {
    startupMs: runs.flatMap((run) => run.rawSamples.startupMs),
    firstFrameMs: runs.flatMap((run) => run.rawSamples.firstFrameMs),
    assetLoadMs: runs.flatMap((run) => run.rawSamples.assetLoadMs),
    frameTimeMs: runs.flatMap((run) => run.rawSamples.frameTimeMs),
    memoryMb: runs.flatMap((run) => run.rawSamples.memoryMb),
  };
  return {
    ...first,
    sampleCount: rawSamples.frameTimeMs.length,
    startupMs: summarize(rawSamples.startupMs),
    firstFrameMs: summarize(rawSamples.firstFrameMs),
    assetLoadMs: summarize(rawSamples.assetLoadMs),
    frameTimeMs: summarize(rawSamples.frameTimeMs),
    memoryMb: summarize(rawSamples.memoryMb),
    jsHeapEstimateMb: summarize(rawSamples.memoryMb),
    rawSamples,
  };
}

function browserWarmupScene(base: BenchmarkScene): BenchmarkScene {
  return {
    ...base,
    id: "browser-webgl2-measurement-warmup",
    engine: "aura3d",
    assetId: "browser-webgl2-measurement-warmup",
    warmupFrames: 1,
    measuredFrames: 1,
    quality: {
      antialias: false,
      shadows: false,
      postprocess: false,
      skinning: false,
      instancing: false,
      particles: false,
    },
    workload: {
      drawCalls: 1,
      triangles: 1,
      materials: 1,
      materialVariants: 1,
      textures: 0,
      animations: 0,
      particles: 0,
      shaders: 1,
      textureBytes: 0,
      geometryBytes: 24,
    },
    unsupportedFeatures: [],
    workflow: undefined,
  };
}

async function createScreenshotDiffs(
  page: BenchmarkBrowserPage,
  visualRenders: readonly BenchmarkVisualRender[],
  failureLog: string[]
): Promise<ScreenshotDiffResult[]> {
  const byKey = new Map(visualRenders.map((render) => [`${render.engine}:${render.sceneId}`, render]));
  const diffs: ScreenshotDiffResult[] = [];
  mkdirSync(resolve("tests/reports/comparison-diffs"), { recursive: true });

  for (const sceneId of comparedSceneIds) {
    const baseline = byKey.get(`aura3d:${sceneId}`);
    if (!baseline) {
      failureLog.push(`screenshot-diff/${sceneId}: missing Aura3D baseline screenshot`);
      continue;
    }
    for (const competitor of ["threejs", "babylon"] as const) {
      const compared = byKey.get(`${competitor}:${sceneId}`);
      if (!compared) {
        failureLog.push(`screenshot-diff/${competitor}/${sceneId}: missing compared screenshot`);
        continue;
      }
      const diffPath = `tests/reports/comparison-diffs/${competitor}-${sceneId}.png`;
      try {
        const result = await createScreenshotDiff(page, baseline.screenshotPath, compared.screenshotPath, diffPath);
        diffs.push({
          sceneId,
          baselineEngine: "aura3d",
          comparedEngine: competitor,
          baselinePath: baseline.screenshotPath,
          comparedPath: compared.screenshotPath,
          diffPath,
          ...result,
        });
      } catch (error) {
        failureLog.push(`screenshot-diff/${competitor}/${sceneId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return diffs;
}

async function createScreenshotDiff(
  page: BenchmarkBrowserPage,
  baselinePath: string,
  comparedPath: string,
  diffPath: string
): Promise<Omit<ScreenshotDiffResult, "sceneId" | "baselineEngine" | "comparedEngine" | "baselinePath" | "comparedPath" | "diffPath">> {
  const baselineUrl = pngDataUrl(baselinePath);
  const comparedUrl = pngDataUrl(comparedPath);
  const result = await page.evaluate<{
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
    readonly diffDataUrl: string;
  }>(`(${browserScreenshotDiffScript})(${JSON.stringify({ baselineUrl, comparedUrl })})`);

  writePngDataUrl(diffPath, result.diffDataUrl);
  const { diffDataUrl: _diffDataUrl, ...metrics } = result;
  return metrics;
}

function pngDataUrl(path: string): string {
  return `data:image/png;base64,${readFileSync(resolve(path)).toString("base64")}`;
}

function writePngDataUrl(path: string, dataUrl: string): void {
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) {
    throw new Error("Invalid PNG data URL for screenshot diff.");
  }
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, Buffer.from(base64, "base64"));
}

async function buildBenchmarkBundles(): Promise<BenchmarkBundle[]> {
  const outputDir = resolve("tests/reports/comparison-bundles");
  mkdirSync(outputDir, { recursive: true });
  const bundles: BenchmarkBundle[] = [];

  const activeScenes = scenes.filter((scene) => Array.from(comparedSceneIds).includes(scene.id as never));
  for (const scene of activeScenes) {
    const outfile = resolve(outputDir, `${scene.engine}-${scene.id}.js`);
    const runtimeImport =
      scene.engine === "aura3d"
        ? "./packages/rendering/src/index.ts"
        : scene.engine === "threejs"
          ? "three"
          : "@babylonjs/core";
    const folder = scene.engine === "threejs" ? "threejs" : scene.engine;
    const contents = `
      import scene from "./benchmarks/${folder}/src/scenes/${scene.id}.ts";
      import * as runtime from ${JSON.stringify(runtimeImport)};
      export default {
        scene,
        runtimeKeys: Object.keys(runtime).slice(0, 32)
      };
    `;
    await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${scene.engine}-${scene.id}-bundle-entry.ts`,
        loader: "ts",
      },
      outfile,
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      minify: true,
      sourcemap: false,
      logLevel: "silent",
      treeShaking: true,
    });
    bundles.push({
      engine: scene.engine,
      sceneId: scene.id,
      path: `tests/reports/comparison-bundles/${scene.engine}-${scene.id}.js`,
      bytes: statSync(outfile).size,
    });
  }

  return bundles;
}

async function buildBenchmarkVisualBundles(): Promise<ReadonlyMap<Engine, string>> {
  const entries: Record<Engine, string> = {
    aura3d: aura3dBenchmarkVisualBundleSource(),
    threejs: threeBenchmarkVisualBundleSource(),
    babylon: babylonBenchmarkVisualBundleSource(),
  };
  const bundles = new Map<Engine, string>();
  for (const [engine, contents] of Object.entries(entries) as [Engine, string][]) {
    const result = await build({
      stdin: {
        contents,
        resolveDir: process.cwd(),
        sourcefile: `${engine}-benchmark-visual-renderer.ts`,
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: `A3D_${engine}_benchmark_visual_renderer`,
      target: "es2022",
      write: false,
      minify: true,
      sourcemap: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.text;
    if (!output) throw new Error(`Unable to build ${engine} benchmark visual renderer.`);
    bundles.set(engine, output);
  }
  return bundles;
}

async function captureBenchmarkVisualRenders(
  page: Page,
  activeScenes: readonly BenchmarkScene[],
  bundles: ReadonlyMap<Engine, string>,
  failureLog: string[]
): Promise<BenchmarkVisualRender[]> {
  const renders: BenchmarkVisualRender[] = [];
  mkdirSync(resolve("tests/reports/comparison-rendered-screenshots"), { recursive: true });
  for (const scene of activeScenes) {
    const bundle = bundles.get(scene.engine);
    if (!bundle) {
      failureLog.push(`rendered-visual/${scene.engine}/${scene.id}: missing renderer bundle`);
      continue;
    }
    const screenshotPath = `tests/reports/comparison-rendered-screenshots/${scene.engine}-${scene.id}.png`;
    try {
      await page.setContent("<!doctype html><html><body style=\"margin:0;background:#05070b\"></body></html>", { waitUntil: "load" });
      await page.addScriptTag({ content: bundle });
      const result = await page.evaluate<{ readonly dataUrl: string; readonly metrics: BenchmarkVisualRender["metrics"] }, BenchmarkScene>(async (benchmarkScene: BenchmarkScene) => {
        const canvas = document.createElement("canvas");
        canvas.width = benchmarkScene.resolution.width;
        canvas.height = benchmarkScene.resolution.height;
        canvas.style.width = `${benchmarkScene.resolution.width}px`;
        canvas.style.height = `${benchmarkScene.resolution.height}px`;
        document.body.replaceChildren(canvas);
        const bundleName = `A3D_${benchmarkScene.engine}_benchmark_visual_renderer`;
        const render = (window as unknown as Record<string, { renderBenchmarkVisualScene?: (canvas: HTMLCanvasElement, scene: BenchmarkScene) => Promise<BenchmarkVisualRender["metrics"]> }>)[bundleName]?.renderBenchmarkVisualScene;
        if (!render) throw new Error(`Missing browser render function: ${bundleName}.renderBenchmarkVisualScene`);
        const metrics = await render(canvas, benchmarkScene);
        return { dataUrl: canvas.toDataURL("image/png"), metrics };
      }, scene);
      writePngDataUrl(screenshotPath, result.dataUrl);
      renders.push({
        engine: scene.engine,
        sceneId: scene.id,
        screenshotPath,
        metrics: result.metrics,
      });
    } catch (error) {
      failureLog.push(`rendered-visual/${scene.engine}/${scene.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return renders;
}

function benchmarkVisualSharedHelpers(): string {
  return String.raw`
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    function pixelStats(canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return { nonBlankPixels: 0, colorBuckets: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set();
      let nonBlankPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] || 0;
        const g = pixels[index + 1] || 0;
        const b = pixels[index + 2] || 0;
        if (r > 8 || g > 8 || b > 8) {
          nonBlankPixels += 1;
          buckets.add(String(r >> 5) + ":" + String(g >> 5) + ":" + String(b >> 5));
        }
      }
      return { nonBlankPixels, colorBuckets: buckets.size };
    }
    function sceneHash(scene) {
      let hash = 2166136261;
      const text = scene.id + ":" + scene.assetId + ":" + scene.cameraPath + ":" + scene.lighting;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }
    function objectSpecs(scene) {
      const hash = sceneHash(scene);
      const drawCalls = Math.max(6, Math.min(Number(scene.workload?.drawCalls || 12), 72));
      const columns = Math.ceil(Math.sqrt(drawCalls));
      const rows = Math.ceil(drawCalls / columns);
      const specs = [];
      for (let index = 0; index < drawCalls; index += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const nx = columns <= 1 ? 0 : (column / (columns - 1)) * 2 - 1;
        const ny = rows <= 1 ? 0 : 1 - (row / (rows - 1)) * 2;
        const jitter = (((hash >>> (index % 16)) & 7) - 3) * 0.007;
        const radius = scene.quality?.instancing ? 0.035 : scene.quality?.particles ? 0.025 : 0.052;
        const sx = radius * (scene.quality?.skinning ? 0.75 : scene.quality?.pbr ? 1.2 : 1);
        const sy = radius * (scene.quality?.skinning ? 1.85 : scene.id.includes("large") ? 1.55 : 1);
        const hue = ((hash % 360) + index * 29) % 360;
        specs.push({
          index,
          x: nx * 0.82 + jitter,
          y: ny * 0.62 - 0.05,
          z: (index % 9) * -0.012,
          sx,
          sy,
          sz: radius,
          shape: scene.quality?.particles && index % 3 === 0 ? "sphere" : scene.id.includes("postprocess") && index % 4 === 0 ? "sphere" : scene.id.includes("large") ? "cube" : index % 5 === 0 ? "cylinder" : "cube",
          color: colorFromHue(hue, scene),
        });
      }
      return specs;
    }
    function colorFromHue(hue, scene) {
      const c = 0.62;
      const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
      const m = scene.quality?.pbr ? 0.18 : 0.28;
      const sector = Math.floor(hue / 60) % 6;
      const rgb = sector === 0 ? [c, x, 0] : sector === 1 ? [x, c, 0] : sector === 2 ? [0, c, x] : sector === 3 ? [0, x, c] : sector === 4 ? [x, 0, c] : [c, 0, x];
      if (scene.postprocessState?.enabled) return [Math.min(1, rgb[0] + 0.28), Math.min(1, rgb[1] + 0.22), Math.min(1, rgb[2] + 0.32), 1];
      return [rgb[0] + m, rgb[1] + m, rgb[2] + m, 1];
    }
    function modelMatrix(spec) {
      return new Float32Array([
        spec.sx, 0, 0, 0,
        0, spec.sy, 0, 0,
        0, 0, spec.sz, 0,
        spec.x, spec.y, spec.z, 1,
      ]);
    }
  `;
}

function aura3dBenchmarkVisualBundleSource(): string {
  return `
    import { Geometry, PBRMaterial, Renderer, UnlitMaterial, createExternalParityEnvironmentLighting } from "./packages/rendering/src/index.ts";
    ${benchmarkVisualSharedHelpers()}
    export async function renderBenchmarkVisualScene(canvas, scene) {
      const renderer = await Renderer.create({ backend: "webgl2", canvas, width: canvas.width, height: canvas.height, clearColor: [0.015, 0.02, 0.03, 1], antialias: scene.quality.antialias, preserveDrawingBuffer: true });
      const geometries = new Map([
        ["cube", Geometry.litCube(1)],
        ["sphere", Geometry.uvSphere(0.5, 16, 8)],
        ["cylinder", Geometry.cylinder({ radius: 0.5, height: 1, segments: 18 })],
      ]);
      const specs = objectSpecs(scene);
      const items = specs.map((spec) => ({
        geometry: geometries.get(spec.shape) || geometries.get("cube"),
        material: scene.quality.pbr
          ? new PBRMaterial({ name: "benchmark-visual-" + scene.id + "-" + spec.index, baseColor: spec.color, metallic: scene.materialFeatures?.includes("metallic") ? 0.55 : 0.18, roughness: scene.id.includes("pbr") ? 0.28 + (spec.index % 4) * 0.12 : 0.45 })
          : new UnlitMaterial({ name: "benchmark-visual-" + scene.id + "-" + spec.index, color: spec.color }),
        modelMatrix: modelMatrix(spec),
        label: scene.id + "-" + spec.index,
      }));
      const diagnostics = renderer.render({ renderItems: items, environmentLighting: createExternalParityEnvironmentLighting(scene.id.includes("large") ? "daylight" : scene.id.includes("particles") ? "gameplay" : "studio").lighting });
      await nextFrame();
      const stats = pixelStats(canvas);
      renderer.dispose();
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: diagnostics.drawCalls, objectCount: specs.length };
    }
  `;
}

function threeBenchmarkVisualBundleSource(): string {
  return `
    import * as THREE from "three";
    ${benchmarkVisualSharedHelpers()}
    export async function renderBenchmarkVisualScene(canvas, scene) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: scene.quality.antialias, preserveDrawingBuffer: true, alpha: false });
      renderer.setSize(canvas.width, canvas.height, false);
      renderer.setClearColor(0x05070b, 1);
      const threeScene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);
      threeScene.add(new THREE.HemisphereLight(0xdde8ff, 0x18202b, 1.4));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(0.4, 0.8, 1);
      threeScene.add(key);
      const geometries = new Map([
        ["cube", new THREE.BoxGeometry(1, 1, 1)],
        ["sphere", new THREE.SphereGeometry(0.5, 16, 8)],
        ["cylinder", new THREE.CylinderGeometry(0.5, 0.5, 1, 18)],
      ]);
      const specs = objectSpecs(scene);
      for (const spec of specs) {
        const color = new THREE.Color(spec.color[0], spec.color[1], spec.color[2]);
        const material = scene.quality.pbr
          ? new THREE.MeshStandardMaterial({ color, metalness: scene.id.includes("pbr") ? 0.5 : 0.18, roughness: scene.id.includes("pbr") ? 0.32 + (spec.index % 4) * 0.12 : 0.45 })
          : new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometries.get(spec.shape) || geometries.get("cube"), material);
        mesh.position.set(spec.x, spec.y, spec.z);
        mesh.scale.set(spec.sx, spec.sy, spec.sz);
        threeScene.add(mesh);
      }
      renderer.render(threeScene, camera);
      await nextFrame();
      const stats = pixelStats(canvas);
      renderer.dispose();
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: specs.length, objectCount: specs.length };
    }
  `;
}

function babylonBenchmarkVisualBundleSource(): string {
  return `
    import * as BABYLON from "@babylonjs/core";
    ${benchmarkVisualSharedHelpers()}
    export async function renderBenchmarkVisualScene(canvas, scene) {
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: scene.quality.antialias });
      engine.setSize(canvas.width, canvas.height);
      const babylonScene = new BABYLON.Scene(engine);
      babylonScene.clearColor = new BABYLON.Color4(0.015, 0.02, 0.03, 1);
      const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -4), babylonScene);
      camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 1;
      camera.orthoBottom = -1;
      camera.setTarget(BABYLON.Vector3.Zero());
      new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), babylonScene).intensity = 1.25;
      const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.4, -0.8, 1), babylonScene);
      key.intensity = 1.45;
      const specs = objectSpecs(scene);
      for (const spec of specs) {
        const mesh = spec.shape === "sphere"
          ? BABYLON.MeshBuilder.CreateSphere(scene.id + "-" + spec.index, { diameter: 1, segments: 16 }, babylonScene)
          : spec.shape === "cylinder"
            ? BABYLON.MeshBuilder.CreateCylinder(scene.id + "-" + spec.index, { diameter: 1, height: 1, tessellation: 18 }, babylonScene)
            : BABYLON.MeshBuilder.CreateBox(scene.id + "-" + spec.index, { size: 1 }, babylonScene);
        const material = scene.quality.pbr ? new BABYLON.PBRMaterial("mat-" + spec.index, babylonScene) : new BABYLON.StandardMaterial("mat-" + spec.index, babylonScene);
        if (material instanceof BABYLON.PBRMaterial) {
          material.albedoColor = BABYLON.Color3.FromArray(spec.color);
          material.metallic = scene.id.includes("pbr") ? 0.5 : 0.18;
          material.roughness = scene.id.includes("pbr") ? 0.32 + (spec.index % 4) * 0.12 : 0.45;
        } else {
          material.diffuseColor = BABYLON.Color3.FromArray(spec.color);
          material.emissiveColor = BABYLON.Color3.FromArray(spec.color).scale(0.18);
        }
        mesh.material = material;
        mesh.position = new BABYLON.Vector3(spec.x, spec.y, spec.z);
        mesh.scaling = new BABYLON.Vector3(spec.sx, spec.sy, spec.sz);
      }
      babylonScene.render();
      await nextFrame();
      const stats = pixelStats(canvas);
      engine.dispose();
      return { width: canvas.width, height: canvas.height, ...stats, drawCalls: specs.length, objectCount: specs.length };
    }
  `;
}

const browserBenchmarkMeasurementScript = String.raw`
window.__measureBenchmarkScene = async (input) => {
  const round = (value) => Number(value.toFixed(3));
  const summarize = (samples) => {
    const sorted = [...samples].sort((left, right) => left - right);
    return {
      min: sorted[0] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      samples
    };
  };
  const nextFrame = () => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
  const readMemoryMb = (fallbackBytes) => (performance.memory?.usedJSHeapSize ?? fallbackBytes) / 1024 / 1024;
  const canvas = document.createElement("canvas");
  canvas.width = input.scene.resolution.width;
  canvas.height = input.scene.resolution.height;
  document.body.replaceChildren(canvas);

  const startupStart = performance.now();
  let editorWorkflow;
  if (input.workflowPayload && input.scene.workflow?.kind === "editor-authored-exported-app-startup") {
    const project = JSON.parse(input.workflowPayload.projectJson);
    const operations = project.metadata?.provenance?.operations ?? [];
    editorWorkflow = {
      kind: "editor-authored-exported-app-startup",
      projectBytes: input.workflowPayload.projectJson.length,
      runtimeBytes: input.workflowPayload.runtimeBytes,
      operationCount: operations.length,
      comparisonMode: input.workflowPayload.comparisonMode
    };
  }
  const gl = canvas.getContext("webgl2", { antialias: input.scene.quality.antialias });
  if (!gl) throw new Error("WebGL2 unavailable for benchmark measurement.");

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) throw new Error("WebGL2 shader allocation failed.");
  gl.shaderSource(vertexShader, "#version 300 es\nin vec2 position;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}");
  gl.shaderSource(fragmentShader, "#version 300 es\nprecision highp float;\nout vec4 outColor;\nvoid main(){outColor=vec4(0.2,0.7,1.0,1.0);}");
  gl.compileShader(vertexShader);
  gl.compileShader(fragmentShader);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL2 program allocation failed.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(String(gl.getProgramInfoLog(program) ?? "WebGL2 benchmark program link failed."));
  }
  gl.useProgram(program);
  const startupMs = round(performance.now() - startupStart);

  const assetLoadStart = performance.now();
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("WebGL2 buffer allocation failed.");
  const simulatedTriangleCount = Math.max(1, Math.min(input.scene.workload.triangles, 65536));
  const vertices = new Float32Array(simulatedTriangleCount * 6);
  for (let index = 0; index < vertices.length; index += 6) {
    const seed = (index / 6) % 97;
    const offset = (seed / 97) * 0.02;
    vertices.set([-0.7 + offset, -0.5, 0.7 - offset, -0.5, 0, 0.7 - offset], index);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  const assetLoadMs = round(performance.now() - assetLoadStart);

  const executedDrawCalls = Math.min(input.scene.workload.drawCalls, 256);
  const drawFrame = () => {
    const frameStart = performance.now();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.03, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (let call = 0; call < executedDrawCalls; call += 1) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.finish();
    return round(performance.now() - frameStart);
  };

  await nextFrame();
  drawFrame();
  const firstFrameMs = round(performance.now() - startupStart);
  const warmupFrames = Math.min(input.scene.warmupFrames, 2);
  const measuredFrames = Math.min(input.scene.measuredFrames, 5);
  for (let frame = 0; frame < warmupFrames; frame += 1) {
    await nextFrame();
    drawFrame();
  }

  const frameSamples = [];
  const memorySamples = [];
  for (let frame = 0; frame < measuredFrames; frame += 1) {
    await nextFrame();
    frameSamples.push(drawFrame());
    memorySamples.push(round(readMemoryMb(input.bundleBytes + vertices.byteLength)));
  }

  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return {
    engine: input.scene.engine,
    sceneId: input.scene.id,
    measurementMode: "browser-webgl2-microbenchmark",
    sampleCount: frameSamples.length,
    warmupFrames,
    measuredFrames,
    startupMs: summarize([startupMs]),
    firstFrameMs: summarize([firstFrameMs]),
    assetLoadMs: summarize([assetLoadMs]),
    frameTimeMs: summarize(frameSamples),
    memoryMb: summarize(memorySamples),
    drawCalls: executedDrawCalls,
    requestedDrawCalls: input.scene.workload.drawCalls,
    shaderCount: input.scene.workload.shaders ?? Math.max(1, Math.ceil(input.scene.workload.materials / 4)),
    textureCount: input.scene.workload.textures,
    textureBytes: input.scene.workload.textureBytes ?? input.scene.workload.textures * 65536,
    geometryBytesEstimate: input.scene.workload.geometryBytes ?? input.scene.workload.triangles * 24,
    jsHeapEstimateMb: summarize(memorySamples),
    triangles: input.scene.workload.triangles,
    sourceCodeBytes: input.sourceCodeBytes,
    bundleBytes: input.bundleBytes,
    bundlePath: input.bundlePath,
    screenshotPath: input.screenshotPath,
    failureLog: [],
    rawSamples: {
      startupMs: [startupMs],
      firstFrameMs: [firstFrameMs],
      assetLoadMs: [assetLoadMs],
      frameTimeMs: frameSamples,
      memoryMb: memorySamples
    },
    editorWorkflow
  };
};
`;

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
    const rDelta = Math.abs(baselinePixels.data[index] - comparedPixels.data[index]);
    const gDelta = Math.abs(baselinePixels.data[index + 1] - comparedPixels.data[index + 1]);
    const bDelta = Math.abs(baselinePixels.data[index + 2] - comparedPixels.data[index + 2]);
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
    maxChangedPixelRatio: 1,
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

async function measureBenchmarkSceneInBrowser(input: {
  readonly scene: BenchmarkScene;
  readonly bundleBytes: number;
  readonly bundlePath: string;
  readonly screenshotPath: string;
  readonly sourceCodeBytes: number;
}): Promise<BenchmarkMeasurement> {
  const roundLocal = (value: number): number => Number(value.toFixed(3));
  const summarizeLocal = (samples: number[]): { min: number; median: number; p95: number; max: number; samples: number[] } => {
    const sorted = [...samples].sort((left, right) => left - right);
    return {
      min: sorted[0] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      samples,
    };
  };
  const nextFrame = (): Promise<void> => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
  const readMemoryMbLocal = (fallbackBytes: number): number => {
    const performanceWithMemory = performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
      };
    };
    return (performanceWithMemory.memory?.usedJSHeapSize ?? fallbackBytes) / 1024 / 1024;
  };

  const canvas = document.createElement("canvas");
  canvas.width = input.scene.resolution.width;
  canvas.height = input.scene.resolution.height;
  document.body.replaceChildren(canvas);

  const startupStart = performance.now();
  const gl = canvas.getContext("webgl2", { antialias: input.scene.quality.antialias });
  if (!gl) {
    throw new Error("WebGL2 unavailable for benchmark measurement.");
  }

  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) {
    throw new Error("WebGL2 shader allocation failed.");
  }
  gl.shaderSource(vertexShader, "#version 300 es\nin vec2 position;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}");
  gl.shaderSource(fragmentShader, "#version 300 es\nprecision highp float;\nout vec4 outColor;\nvoid main(){outColor=vec4(0.2,0.7,1.0,1.0);}");
  gl.compileShader(vertexShader);
  gl.compileShader(fragmentShader);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("WebGL2 program allocation failed.");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(String(gl.getProgramInfoLog(program) ?? "WebGL2 benchmark program link failed."));
  }
  gl.useProgram(program);
  const startupMs = roundLocal(performance.now() - startupStart);

  const assetLoadStart = performance.now();
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error("WebGL2 buffer allocation failed.");
  }
  const simulatedTriangleCount = Math.max(1, Math.min(input.scene.workload.triangles, 65_536));
  const vertices = new Float32Array(simulatedTriangleCount * 6);
  for (let index = 0; index < vertices.length; index += 6) {
    const seed = (index / 6) % 97;
    const offset = (seed / 97) * 0.02;
    vertices.set([-0.7 + offset, -0.5, 0.7 - offset, -0.5, 0, 0.7 - offset], index);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  const assetLoadMs = roundLocal(performance.now() - assetLoadStart);

  const executedDrawCalls = Math.min(input.scene.workload.drawCalls, 256);
  const drawFrame = (): number => {
    const frameStart = performance.now();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.03, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (let call = 0; call < executedDrawCalls; call += 1) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.finish();
    return roundLocal(performance.now() - frameStart);
  };

  await nextFrame();
  drawFrame();
  const firstFrameMs = roundLocal(performance.now() - startupStart);
  const warmupFrames = Math.min(input.scene.warmupFrames, 2);
  const measuredFrames = Math.min(input.scene.measuredFrames, 5);
  for (let frame = 0; frame < warmupFrames; frame += 1) {
    await nextFrame();
    drawFrame();
  }

  const frameSamples: number[] = [];
  const memorySamples: number[] = [];
  for (let frame = 0; frame < measuredFrames; frame += 1) {
    await nextFrame();
    frameSamples.push(drawFrame());
    memorySamples.push(roundLocal(readMemoryMbLocal(input.bundleBytes + vertices.byteLength)));
  }

  gl.deleteBuffer(buffer);
  gl.deleteProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return {
    engine: input.scene.engine,
    sceneId: input.scene.id,
    measurementMode: "browser-webgl2-microbenchmark",
    sampleCount: frameSamples.length,
    warmupFrames,
    measuredFrames,
    startupMs: summarizeLocal([startupMs]),
    firstFrameMs: summarizeLocal([firstFrameMs]),
    assetLoadMs: summarizeLocal([assetLoadMs]),
    frameTimeMs: summarizeLocal(frameSamples),
    memoryMb: summarizeLocal(memorySamples),
    drawCalls: executedDrawCalls,
    requestedDrawCalls: input.scene.workload.drawCalls,
    shaderCount: input.scene.workload.shaders ?? Math.max(1, Math.ceil(input.scene.workload.materials / 4)),
    textureCount: input.scene.workload.textures,
    textureBytes: input.scene.workload.textureBytes ?? input.scene.workload.textures * 65_536,
    geometryBytesEstimate: input.scene.workload.geometryBytes ?? vertices.byteLength,
    jsHeapEstimateMb: summarizeLocal(memorySamples),
    triangles: input.scene.workload.triangles,
    sourceCodeBytes: input.sourceCodeBytes,
    bundleBytes: input.bundleBytes,
    bundlePath: input.bundlePath,
    screenshotPath: input.screenshotPath,
    failureLog: [],
    rawSamples: {
      startupMs: [startupMs],
      firstFrameMs: [firstFrameMs],
      assetLoadMs: [assetLoadMs],
      frameTimeMs: frameSamples,
      memoryMb: memorySamples,
    },
  };
}

function createMarkdown(report: Record<string, unknown>, label: string): string {
  const scenes = report.scenes as Array<{ id: string; equivalent: boolean; estimates: Record<string, Record<string, { median: number } | number | string>> }>;
  const rows = scenes
    .map((scene) => {
      const aura3d = scene.estimates.aura3d;
      const competitor = scene.estimates[(report.competitor as string) ?? ""];
      return `| ${scene.id} | ${scene.equivalent ? "yes" : "no"} | ${median(aura3d?.frameTimeMs)} | ${median(competitor?.frameTimeMs)} | ${aura3d?.drawCalls ?? "n/a"} / ${aura3d?.requestedDrawCalls ?? "n/a"} | ${aura3d?.bundleBytes ?? "n/a"} | ${aura3d?.sourceCodeBytes ?? "n/a"} |`;
    })
    .join("\n");
  const comparedEngines = report.comparedEngines as Record<string, string>;
  const environment = report.environment as {
    packageManager?: string;
    os?: { type?: string; platform?: string; release?: string; arch?: string };
    hardware?: { cpuModel?: string; cpuCount?: number; totalMemoryMb?: number };
    browser?: { mode?: string; version?: string; engine?: string; executablePath?: string; userAgent?: string; settings?: BrowserSettings | string };
    gpu?: { adapter?: string; vendor?: string; webglVersion?: string; shadingLanguageVersion?: string };
  };
  const artifacts = report.artifacts as {
    screenshots?: { status?: string; reason?: string; paths?: string[] };
    bundles?: { status?: string; reason?: string; paths?: string[] };
  };
  const gltfCompatibility = report.gltfCompatibility as {
    sourceReport?: string;
    blenderExportValidationReport?: string;
    corpus?: { sourceName?: string; sourceRevision?: string; assetCount?: number };
    blenderExportValidation?: {
      sourceManifest?: { sourceName?: string; sourceRevision?: string; fixtureCount?: number };
      summary?: { fixtureCount?: number; pass?: number; warn?: number; fail?: number };
    };
    summary?: Record<string, Record<string, number>>;
    caveat?: string;
  };
  const featureComparison = report.featureComparison as Array<{
    area: string;
    aura3d: string;
    competitor: string;
    currentEvidence: string;
    claimImpact: string;
  }>;
  const supportedNicheClaims = report.supportedNicheClaims as SupportedNicheClaim[] | undefined;
  const featureRows = featureComparison
    .map((row) => `| ${row.area} | ${row.aura3d} | ${row.competitor} | ${row.currentEvidence} | ${row.claimImpact} |`)
    .join("\n");
  const screenshotPaths = artifacts.screenshots?.paths?.length ? artifacts.screenshots.paths.join(", ") : "none";
  const gltfRows = Object.entries(gltfCompatibility.summary ?? {})
    .filter((entry): entry is [string, Record<string, number>] => typeof entry[1] === "object" && entry[1] !== null)
    .map(([engine, summary]) => `| ${engine} | ${summary.pass ?? 0} | ${summary.warn ?? 0} | ${summary["expected-fail"] ?? 0} | ${summary["not-run"] ?? 0} |`)
    .join("\n");
  const blenderValidation = gltfCompatibility.blenderExportValidation;
  const blenderValidationLine = blenderValidation
    ? ` Separate Blender-export fixture validation is linked from \`${gltfCompatibility.blenderExportValidationReport ?? "tests/reports/blender-export-validation.json"}\`: ${blenderValidation.sourceManifest?.sourceName ?? "unknown"} at revision \`${blenderValidation.sourceManifest?.sourceRevision ?? "unknown"}\` with ${blenderValidation.summary?.fixtureCount ?? blenderValidation.sourceManifest?.fixtureCount ?? "unknown"} checked-in fixtures.`
    : "";
  const nicheClaimSection = supportedNicheClaims?.length
    ? `\n## Supported Narrow Claim\n\n${supportedNicheClaims.map((claim) => {
      const sceneRows = claim.evidence.scenes
        .map((scene) => `| ${scene.id} | ${scene.aura3dBundleBytes} | ${scene.competitorBundleBytes} | ${scene.ratio} |`)
        .join("\n");
      return `${claim.claim}\n\nMeasured dimension: ${claim.measuredDimension}. Evidence report: \`${claim.evidence.reportPath}\`.\n\n| Scene | Aura3D bundle bytes | ${label} bundle bytes | Aura3D / ${label} ratio |\n|---|---:|---:|---:|\n${sceneRows}\n\nExclusions: ${claim.exclusions.join(" ")}`
    }).join("\n\n")}\n`
    : "";

  return `# Aura3D vs ${label} Benchmark Scaffold

Generated: ${report.generatedAt}

This document is intentionally limited to reproducible benchmark scaffolding. It verifies that Aura3D and ${label} scene definitions use the same procedural assets, render resolution, camera path, lighting intent, warmup policy, measurement window, and workload shape, then captures a bounded Playwright Chromium WebGL2 microbenchmark plus esbuild browser bundle artifacts. It does not claim a runtime performance win.

Pinned versions in the generated JSON: Aura3D ${comparedEngines.aura3d}, Three.js ${comparedEngines.threejs}, Babylon.js ${comparedEngines.babylon}. Browser timing is a capped WebGL2 microbenchmark over equivalent workload metadata; it is not rendered product-scene parity.

## Captured Environment

| Field | Value |
|---|---|
| Node | ${report.environment && typeof report.environment === "object" && "node" in report.environment ? report.environment.node : "unknown"} |
| Package manager | ${environment.packageManager ?? "unknown"} |
| OS | ${environment.os?.type ?? "unknown"} ${environment.os?.release ?? "unknown"} (${environment.os?.platform ?? "unknown"}, ${environment.os?.arch ?? "unknown"}) |
| Hardware | ${environment.hardware?.cpuModel ?? "unknown"}; ${environment.hardware?.cpuCount ?? "unknown"} CPUs; ${environment.hardware?.totalMemoryMb ?? "unknown"} MB RAM |
| Browser | ${environment.browser?.mode ?? "unknown"}; ${environment.browser?.version ?? "unknown"}; ${formatValue(environment.browser?.settings)} |
| Browser executable | ${environment.browser?.executablePath ?? "unknown"} |
| Browser user agent | ${environment.browser?.userAgent ?? "unknown"} |
| GPU | ${environment.gpu?.adapter ?? "unknown"}; ${environment.gpu?.vendor ?? "unknown"}; ${environment.gpu?.webglVersion ?? "unknown"} |

## Audit Artifacts

| Artifact | Status | Notes |
|---|---|---|
| Raw samples | included inline | See JSON \`scenes[].estimates.*.rawSamples\`. |
| Failure logs | included inline | See JSON \`scenes[].estimates.*.failureLog\`. |
| Screenshots | ${artifacts.screenshots?.status ?? "unknown"} | ${artifacts.screenshots?.reason ?? "No screenshot artifact metadata captured."} Paths: ${screenshotPaths}. |
| Browser bundles | ${artifacts.bundles?.status ?? "unknown"} | ${artifacts.bundles?.reason ?? "No bundle artifact metadata captured."} |

| Scene | Equivalent scaffold | Aura3D browser frame median ms | ${label} browser frame median ms | Aura3D executed/requested draw calls | Aura3D bundle bytes | Aura3D scene source bytes |
|---|---:|---:|---:|---:|---:|---:|
${rows}

## glTF Compatibility Linkage

Same-corpus asset compatibility is linked from \`${gltfCompatibility.sourceReport ?? "unknown"}\`: ${gltfCompatibility.corpus?.sourceName ?? "unknown"} at revision ${gltfCompatibility.corpus?.sourceRevision ?? "unknown"} with ${gltfCompatibility.corpus?.assetCount ?? "unknown"} assets.${blenderValidationLine}

| Loader | Pass | Warn | Expected fail | Not run |
|---|---:|---:|---:|---:|
${gltfRows}

${gltfCompatibility.caveat ?? "No glTF compatibility caveat recorded."}

${nicheClaimSection}

## Feature Comparison Coverage

| Area | Aura3D evidence | ${label} evidence | Current comparison evidence | Claim impact |
|---|---|---|---|---|
${featureRows}

## Current Claim Status

No broad "better than Three.js" or broad competitive claim is enabled by this report. The JSON report includes browser WebGL2 microbenchmark raw samples, summary statistics, measured scene source sizes, benchmark bundle bytes, audit screenshots, glTF corpus linkage, pinned external loader import evidence, category comparison coverage, and failure logs for this scaffold run. The only usable stronger wording is the exact supported narrow claim above, if present. Rendered scene screenshots, production app parity, GPU counters, visual output parity for external loaders, broader device review, and independent review are still required before broader comparison language can become externally credible.
`;
}

async function captureBrowserEvidence(report: Record<string, unknown>): Promise<BrowserEvidence> {
  const settings: BrowserSettings = {
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    javaScriptEnabled: true,
  };

  try {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: settings.headless });
    const { headless: _headless, ...contextSettings } = settings;
    const context = await browser.newContext(contextSettings);
    const page = await context.newPage();
    await page.setContent(auditHtml(report, "Full comparison scaffold"), { waitUntil: "load" });
    const gpu = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) {
        return {
          adapter: "webgl-unavailable",
          vendor: "webgl-unavailable",
          webglVersion: "webgl-unavailable",
          shadingLanguageVersion: "webgl-unavailable",
        };
      }
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const adapter = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      const vendor = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
      return {
        adapter,
        vendor,
        webglVersion: String(gl.getParameter(gl.VERSION)),
        shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      };
    });
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const browserVersion = browser.version();
    mkdirSync(resolve("tests/reports"), { recursive: true });
    const screenshotPaths = ["tests/reports/comparison-threejs-audit.png", "tests/reports/comparison-babylon-audit.png"];
    for (const path of screenshotPaths) {
      await page.screenshot({ path: resolve(path), fullPage: true });
    }
    await browser.close();

    return {
      browser: {
        mode: "playwright-chromium-headless-audit",
        version: browserVersion,
        engine: "chromium",
        executablePath: chromium.executablePath(),
        userAgent,
        settings,
      },
      gpu,
      screenshots: {
        status: "captured-audit-report",
        reason: "Screenshots capture the generated comparison audit page, not rendered benchmark scenes.",
        paths: screenshotPaths,
      },
      failureLog: [],
    };
  } catch (error) {
    return {
      browser: {
        mode: "playwright-chromium-headless-audit",
        version: "capture-failed",
        engine: "chromium",
        executablePath: "capture-failed",
        userAgent: "capture-failed",
        settings,
      },
      gpu: {
        adapter: "capture-failed",
        vendor: "capture-failed",
        webglVersion: "capture-failed",
        shadingLanguageVersion: "capture-failed",
      },
      screenshots: {
        status: "capture-failed",
        reason: error instanceof Error ? error.message : String(error),
        paths: [],
      },
      failureLog: [error instanceof Error ? error.stack ?? error.message : String(error)],
    };
  }
}

function auditHtml(report: Record<string, unknown>, title: string): string {
  const comparedEngines = report.comparedEngines as Record<string, string>;
  const scenes = report.scenes as SceneComparison[];
  const sceneRows = scenes
    .map((scene) => `<tr><td>${escapeHtml(scene.id)}</td><td>${scene.equivalent ? "yes" : "no"}</td></tr>`)
    .join("");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      body { font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1f2933; }
      h1 { font-size: 24px; margin: 0 0 16px; }
      table { border-collapse: collapse; width: 100%; margin: 16px 0; }
      th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
      th { background: #f1f5f9; }
      .caveat { border-left: 4px solid #b45309; padding: 10px 12px; background: #fff7ed; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>Generated: ${escapeHtml(String(report.generatedAt))}</p>
    <p>Aura3D ${escapeHtml(comparedEngines.aura3d)}, Three.js ${escapeHtml(comparedEngines.threejs)}, Babylon.js ${escapeHtml(comparedEngines.babylon)}</p>
    <div class="caveat">${escapeHtml(String(report.claimCaveat))}</div>
    <table>
      <thead><tr><th>Scene</th><th>Equivalent scaffold</th></tr></thead>
      <tbody>${sceneRows}</tbody>
    </table>
  </body>
</html>`;
}

function dependencyPins(rootPackage: PackageJson, threePackage: PackageJson, babylonPackage: PackageJson): Record<string, unknown> {
  return {
    aura3d: {
      packageName: rootPackage.name ?? "@aura3d/engine",
      packageVersion: rootPackage.version ?? "unknown",
    },
    threejs: {
      packageName: threePackage.benchmarkEngine?.name ?? "three",
      benchmarkEngineVersion: threePackage.benchmarkEngine?.version ?? "unknown",
      declaredDependency: threePackage.devDependencies?.three ?? "unknown",
    },
    babylonjs: {
      packageName: babylonPackage.benchmarkEngine?.name ?? "babylonjs",
      benchmarkEngineVersion: babylonPackage.benchmarkEngine?.version ?? "unknown",
      declaredDependency: babylonPackage.devDependencies?.["@babylonjs/core"] ?? "unknown",
    },
    tooling: {
      playwright: installedPackageVersion("@playwright/test"),
      tsx: installedPackageVersion("tsx"),
      typescript: installedPackageVersion("typescript"),
      vitest: installedPackageVersion("vitest"),
    },
  };
}

function gltfCompatibilitySummary(): Record<string, unknown> {
  const path = "tests/reports/asset-compatibility-threejs.json";
  const blenderValidationPath = "tests/reports/blender-export-validation.json";
  const report = readJson(path) as {
    sourceManifest?: { sourceName?: string; sourceRevision?: string; assetCount?: number };
    summary?: Record<string, Record<string, number>>;
    blenderExportValidation?: {
      sourceManifest?: { sourceName?: string; sourceRevision?: string; fixtureCount?: number };
      summary?: { fixtureCount?: number; pass?: number; warn?: number; fail?: number };
    };
  };
  const blenderExportValidation = report.blenderExportValidation ?? (existsSync(blenderValidationPath)
    ? readJson(blenderValidationPath) as {
      sourceManifest?: { sourceName?: string; sourceRevision?: string; fixtureCount?: number };
      summary?: { fixtureCount?: number; pass?: number; warn?: number; fail?: number };
    }
    : undefined);
  const assetCount = Number(report.sourceManifest?.assetCount ?? 0);
  const blenderSummary = report.summary?.blenderExport ?? {};
  const blenderNotRun = Number(blenderSummary["not-run"] ?? assetCount);
  const blenderExpectedFail = Number(blenderSummary["expected-fail"] ?? 0);
  const sameCorpusBlenderComplete = assetCount > 0 && blenderNotRun === 0 && blenderExpectedFail === 0;
  return {
    sourceReport: path,
    blenderExportValidationReport: blenderExportValidation ? blenderValidationPath : undefined,
    corpus: report.sourceManifest,
    blenderExportValidation,
    summary: report.summary,
    caveat:
      sameCorpusBlenderComplete
        ? `The linked compatibility report executes pinned Three.js, Babylon.js, and Blender same-corpus export coverage against ${assetCount} Khronos corpus assets. Three.js/Babylon entries are loader import evidence; Blender entries are import/export/reload evidence from the same corpus.`
        : blenderExportValidation
          ? `The linked compatibility report executes pinned Three.js and Babylon.js loaders against the same ${assetCount || "unknown"}-entry Khronos corpus in a Node compatibility harness. It is loader import evidence, not visual/rendering parity. The same-corpus Blender-export column remains incomplete (${blenderNotRun} not-run, ${blenderExpectedFail} expected-fail), while the separate Blender-export validation report passes checked-in Blender-exported fixtures through Aura3D's glTF loader.`
          : `The linked compatibility report executes pinned Three.js and Babylon.js loaders against the same ${assetCount || "unknown"}-entry Khronos corpus in a Node compatibility harness. It is loader import evidence, not visual/rendering parity. Blender-export validation remains not-run.`,
  };
}

function featureRuntimeCoverageMatrix(): Array<Record<string, unknown>> {
  if (!isExternalParityRun) {
    return [{
      area: "External parity runtime feature coverage",
      status: "not-applicable-to-foundation",
      claimImpact: "Foundation comparison reports do not consume External parity feature-readiness reports.",
    }];
  }

  const rendering = readOptionalReport("tests/reports/external-parity-rendering.json");
  const pbr = readOptionalReport("tests/reports/external-parity-pbr-gltf-readiness.json");
  const shadow = readOptionalReport("tests/reports/external-parity-shadow-map-readiness.json");
  const postprocess = readOptionalReport("tests/reports/external-parity-postprocess-suite.json");
  const hdr = readOptionalReport("tests/reports/external-parity-hdr-render-target-readiness.json");
  const webgpu = readOptionalReport("tests/reports/external-parity-webgpu-parity.json");
  const product = readOptionalReport("tests/reports/external-parity-product-visual-parity.json");
  const gltfVisual = readOptionalReport("tests/reports/external-parity-gltf-loader-visual-parity.json");

  return [
    {
      area: "Controls",
      status: validationsPass(rendering, [
        "postprocess-lab-runtime-color-management-controls",
        "postprocess-lab-runtime-color-grading-controls",
        "renderer-runtime-toggle-layout-stability",
      ]) ? "local-browser-runtime-controls-covered" : "blocked",
      localEvidence: validationNames(rendering).filter((name) => name.includes("runtime") || name.includes("color")),
      externalBenchmarkScoring: false,
      claimImpact: "Runtime controls have local browser evidence, but same-scene control ergonomics and workflow parity against external engines are not scored.",
      blockers: ["same-scene controls/workflow scoring against Three.js, Babylon.js, Unity, and Unreal is not present."],
    },
    {
      area: "Materials and glTF",
      status: pbr?.ok === true && pbr.pbrParity === false && pbr.gltfParity === false ? "bounded-local-pbr-gltf-evidence" : "blocked",
      pbrEvidenceCount: arrayCount(pbr?.pbrEvidence),
      gltfEvidenceCount: arrayCount(pbr?.gltfEvidence),
      boundedGltfLoaderVisualParity: gltfVisual?.boundedGltfLoaderVisualParity,
      visualQualityWarnings: arrayCount(gltfVisual?.visualQualityWarnings),
      externalParity: {
        pbr: pbr?.pbrParity === true,
        gltf: pbr?.gltfParity === true,
      },
      claimImpact: "Local PBR/glTF coverage and bounded Three.js/Babylon visual-loader evidence exist; full physical PBR and broad glTF parity remain blocked.",
      blockers: [
        ...stringArray(pbr?.violations),
        ...stringArray(pbr?.blockedClaims),
        ...stringArray(gltfVisual?.blockedClaims),
      ],
    },
    {
      area: "Lights and shadows",
      status: shadow?.ok === true && shadow.shadowMapParity === false ? "bounded-shadow-map-evidence" : "blocked",
      supportedEvidence: stringArray(shadow?.supportedEvidence),
      externalParity: {
        shadowMap: shadow?.shadowMapParity === true,
      },
      claimImpact: "Directional/cascaded/PCF/point/spot shadow browser evidence exists, but Unity/Unreal shadow parity and production atlas/cascade claims remain blocked.",
      blockers: [
        ...stringArray(shadow?.blockedEvidence),
        ...stringArray(shadow?.blockedClaims),
      ],
    },
    {
      area: "Postprocess",
      status: postprocess?.ok === true && postprocess.postprocessSuiteParity === false ? "bounded-real-scene-postprocess-suite" : "blocked",
      implementedEffects: stringArray(postprocess?.implementedEffects),
      realSceneEffects: stringArray(postprocess?.realSceneEffects),
      externalParity: {
        postprocessSuite: postprocess?.postprocessSuiteParity === true,
      },
      claimImpact: "Real-scene postprocess coverage exists locally; same-scene Unity/Unreal postprocess/HDR IBL parity remains blocked.",
      blockers: [
        ...stringArray(postprocess?.violations),
        ...stringArray(postprocess?.blockedClaims),
      ],
    },
    {
      area: "HDR and environment lighting",
      status: hdr?.ok === true && hdr.hdrRenderTargetParity === false ? "bounded-hdr-render-target-and-ibl-evidence" : "blocked",
      supportedEvidence: stringArray(hdr?.supportedEvidence),
      externalParity: {
        hdrRenderTarget: hdr?.hdrRenderTargetParity === true,
      },
      claimImpact: "Float render-target, tone-map, and bounded local HDR IBL evidence exist; Unity/Unreal same-scene HDR IBL/render-target parity remains blocked.",
      blockers: [
        ...stringArray(hdr?.blockedEvidence),
        ...stringArray(hdr?.blockedClaims),
      ],
    },
    {
      area: "WebGPU",
      status: webgpu?.ok === true && webgpu.fullWebGPUParity === false ? "capability-boundary-covered" : "blocked",
      supportedEvidence: stringArray(webgpu?.supportedEvidence),
      blockedEvidence: stringArray(webgpu?.blockedEvidence),
      externalParity: {
        fullWebGPU: webgpu?.fullWebGPUParity === true,
      },
      claimImpact: "Injected WebGPU contracts and navigator.gpu probing are reported separately; real adapter/device hardware parity remains blocked.",
      blockers: [
        ...stringArray(webgpu?.blockedEvidence),
        ...stringArray(webgpu?.blockedClaims),
      ],
    },
    {
      area: "Product visual parity",
      status: product?.ok === true && isRecord(product.renderedProductVisualParity) && product.renderedProductVisualParity.threejs === true && product.renderedProductVisualParity.babylon === true
        ? "bounded-threejs-babylon-product-diffs-pass"
        : "blocked",
      renderedProductVisualParity: product?.renderedProductVisualParity,
      visualParityReady: product?.visualParityReady === true,
      diffCount: arrayCount(product?.diffs),
      claimImpact: "Three.js/Babylon.js product screenshot diffs pass under bounded thresholds; Unity/Unreal product baselines are still missing.",
      blockers: stringArray(product?.blockedClaims),
    },
  ];
}

function featureComparisonMatrix(): Array<Record<string, string>> {
  return [
    {
      area: "Controls",
      aura3d: "input/control unit and example evidence exists outside this scaffold",
      competitor: "not executed by this scaffold",
      currentEvidence: "no same-scene control ergonomics benchmark",
      claimImpact: "unsupported for better claims",
    },
    {
      area: "Materials",
      aura3d: "PBR/material unit and visual slices exist outside this scaffold",
      competitor: "not executed by this scaffold",
      currentEvidence: "procedural material counts are matched; visual parity is not scored",
      claimImpact: "unsupported for material parity claims",
    },
    {
      area: "Lights",
      aura3d: "lighting intent is matched in scaffold scene definitions",
      competitor: "same lighting intent in scaffold scene definitions",
      currentEvidence: "configuration equivalence only",
      claimImpact: "no quality or performance advantage",
    },
    {
      area: "Shadows",
      aura3d: "quality.shadows is false in current scaffold scenes",
      competitor: "quality.shadows is false in current scaffold scenes",
      currentEvidence: "not exercised",
      claimImpact: "unsupported for shadow claims",
    },
    {
      area: "Postprocess",
      aura3d: "quality.postprocess is false in current scaffold scenes",
      competitor: "quality.postprocess is false in current scaffold scenes",
      currentEvidence: "not exercised",
      claimImpact: "unsupported for postprocess claims",
    },
    {
      area: "Animation",
      aura3d: "skinned-characters workload declares 32 animations",
      competitor: "matching skinned-characters workload declares 32 animations",
      currentEvidence: "workload equivalence plus capped browser microbenchmark timing; no animation-system parity scoring",
      claimImpact: "no runtime animation advantage",
    },
    {
      area: "Particles",
      aura3d: "skinned-characters workload declares 400 particles",
      competitor: "matching skinned-characters workload declares 400 particles",
      currentEvidence: "workload equivalence plus capped browser microbenchmark timing; no particle-system parity scoring",
      claimImpact: "no runtime particle advantage",
    },
    {
      area: "Docs",
      aura3d: "local docs and generated reports are linked",
      competitor: "external documentation breadth is not measured by this scaffold",
      currentEvidence: "repo-local documentation linkage only",
      claimImpact: "unsupported for ecosystem/docs superiority",
    },
  ];
}

function readOptionalReport(path: string): Record<string, unknown> | undefined {
  if (!existsSync(resolve(path))) return undefined;
  const report = readJson(path);
  return isRecord(report) ? report : undefined;
}

function validationNames(report: Record<string, unknown> | undefined): string[] {
  const validations = Array.isArray(report?.validations) ? report.validations : [];
  return validations
    .filter(isRecord)
    .map((validation) => validation.name)
    .filter((name): name is string => typeof name === "string");
}

function validationsPass(report: Record<string, unknown> | undefined, names: readonly string[]): boolean {
  const validations = Array.isArray(report?.validations) ? report.validations.filter(isRecord) : [];
  return names.every((name) => validations.some((validation) => validation.name === name && validation.ok === true));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeJson(path: string, value: unknown): void {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeMarkdown(path: string, value: string): void {
  const resolvedPath = resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, value);
}

function workflowPayloadForScene(scene: BenchmarkScene): WorkflowPayload {
  const workflow = scene.workflow;
  if (!workflow) return null;
  return {
    projectJson: readFileSync(resolve(workflow.exportedProjectPath), "utf8"),
    runtimeBytes: statSync(resolve(workflow.exportedRuntimePath)).size,
    operationCount: workflow.authoredOperations.length,
    comparisonMode: workflow.comparisonMode,
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function installedPackageVersion(packageName: string): string {
  try {
    const packageJson = require(`${packageName}/package.json`) as PackageJson;
    return packageJson.version ?? "unknown";
  } catch {
    return "not-resolvable-from-root";
  }
}

function packageManager(): string {
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    return userAgent.split(" ")[0] ?? userAgent;
  }
  return "unknown";
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "unknown";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function deterministicSamples(base: number, sceneId: string): number[] {
  const seed = sceneId.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return [0, 1, 2, 3, 4].map((index) => {
    const offset = (((seed + index * 17) % 9) - 4) / 200;
    return round(base * (1 + offset));
  });
}

function summarize(samples: number[]): { min: number; median: number; p95: number; max: number; samples: number[] } {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    samples,
  };
}

function median(value: unknown): number | string {
  if (typeof value === "object" && value !== null && "median" in value && typeof value.median === "number") {
    return value.median;
  }
  return "n/a";
}

function sceneSourceBytes(scene: BenchmarkScene): number {
  const folder = scene.engine === "threejs" ? "threejs" : scene.engine;
  const paths = [
    `benchmarks/${folder}/src/scenes/${scene.id}.ts`,
    `benchmarks/shared/scenes/${scene.id}.ts`,
    ...(scene.workflow ? [
      scene.workflow.exportedProjectPath,
      scene.workflow.exportedRuntimePath,
      scene.workflow.editorEvidenceReportPath,
    ] : []),
  ];
  return paths
    .filter((path) => existsSync(resolve(path)))
    .reduce((total, path) => total + statSync(resolve(path)).size, 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
