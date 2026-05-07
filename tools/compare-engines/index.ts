import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { arch, cpus, platform, release, totalmem, type } from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import babylonLargeScene from "../../benchmarks/babylon/src/scenes/large-scene.js";
import babylonProductConfigurator from "../../benchmarks/babylon/src/scenes/product-configurator.js";
import babylonSkinnedCharacters from "../../benchmarks/babylon/src/scenes/skinned-characters.js";
import galileoLargeScene from "../../benchmarks/galileo/src/scenes/large-scene.js";
import galileoProductConfigurator from "../../benchmarks/galileo/src/scenes/product-configurator.js";
import galileoSkinnedCharacters from "../../benchmarks/galileo/src/scenes/skinned-characters.js";
import threeLargeScene from "../../benchmarks/threejs/src/scenes/large-scene.js";
import threeProductConfigurator from "../../benchmarks/threejs/src/scenes/product-configurator.js";
import threeSkinnedCharacters from "../../benchmarks/threejs/src/scenes/skinned-characters.js";

type Engine = "babylon" | "galileo" | "threejs";

type BenchmarkScene = {
  readonly id: string;
  readonly engine: Engine;
  readonly engineVersion: string;
  readonly sceneVersion: number;
  readonly assetId: string;
  readonly resolution: { readonly width: number; readonly height: number; readonly dpr: number };
  readonly warmupFrames: number;
  readonly measuredFrames: number;
  readonly cameraPath: string;
  readonly lighting: string;
  readonly quality: Record<string, boolean>;
  readonly workload: {
    readonly drawCalls: number;
    readonly triangles: number;
    readonly materials: number;
    readonly materialVariants: number;
    readonly textures: number;
    readonly animations: number;
    readonly particles: number;
  };
};

type SceneComparison = {
  readonly id: string;
  readonly equivalent: boolean;
  readonly reason?: string;
  readonly estimates: Record<Engine, Record<string, unknown>>;
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
  readonly triangles: number;
  readonly sourceCodeBytes: number;
  readonly bundleBytes: number;
  readonly bundlePath: string;
  readonly failureLog: string[];
  readonly rawSamples: {
    readonly startupMs: readonly number[];
    readonly firstFrameMs: readonly number[];
    readonly assetLoadMs: readonly number[];
    readonly frameTimeMs: readonly number[];
    readonly memoryMb: readonly number[];
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
  readonly failureLog: readonly string[];
};

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
      readonly galileoBundleBytes: number;
      readonly competitorBundleBytes: number;
      readonly ratio: number;
    }[];
  };
  readonly exclusions: readonly string[];
};

const scenes: BenchmarkScene[] = [
  galileoProductConfigurator,
  galileoLargeScene,
  galileoSkinnedCharacters,
  threeProductConfigurator,
  threeLargeScene,
  threeSkinnedCharacters,
  babylonProductConfigurator,
  babylonLargeScene,
  babylonSkinnedCharacters,
];

const comparedSceneIds = ["product-configurator", "large-scene", "skinned-characters"] as const;
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
    writeJson("tests/reports/comparison-threejs.json", filterReport(report, "threejs"));
    writeJson("tests/reports/comparison-babylon.json", filterReport(report, "babylon"));
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

  const requiredEngines: Engine[] = ["galileo", "threejs", "babylon"];
  for (const engine of requiredEngines) {
    if (!byEngine.has(engine)) {
      return { id, equivalent: false, reason: `missing ${engine} scene definition`, estimates: {} as Record<Engine, Record<string, unknown>> };
    }
  }

  const base = byEngine.get("galileo")!;
  const estimates = {} as Record<Engine, Record<string, unknown>>;
  for (const engine of requiredEngines) {
    const scene = byEngine.get(engine)!;
    if (!assetIds.has(scene.assetId)) {
      return { id, equivalent: false, reason: `${engine} references unknown asset ${scene.assetId}`, estimates };
    }
    if (!sameBenchmarkShape(base, scene)) {
      return { id, equivalent: false, reason: `${engine} scene does not match Galileo benchmark shape`, estimates };
    }
    estimates[engine] = estimateScene(scene);
  }

  return { id, equivalent: true, estimates };
}

function sameBenchmarkShape(left: BenchmarkScene, right: BenchmarkScene): boolean {
  return (
    left.assetId === right.assetId &&
    left.resolution.width === right.resolution.width &&
    left.resolution.height === right.resolution.height &&
    left.resolution.dpr === right.resolution.dpr &&
    left.warmupFrames === right.warmupFrames &&
    left.measuredFrames === right.measuredFrames &&
    left.cameraPath === right.cameraPath &&
    left.lighting === right.lighting &&
    JSON.stringify(left.quality) === JSON.stringify(right.quality) &&
    JSON.stringify(left.workload) === JSON.stringify(right.workload)
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
    sourceCodeBytes: sceneSourceBytes(scene),
    sourceCodeSizeBytes: sceneSourceBytes(scene),
    bundleBytes: "not-measured-no-browser-bundle-built",
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

  return {
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-compare-engines-run",
    gitSha: gitSha(),
    command: "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --write-reports",
    sourceInputs: [
      "benchmarks/galileo/src/scenes/product-configurator.ts",
      "benchmarks/galileo/src/scenes/large-scene.ts",
      "benchmarks/galileo/src/scenes/skinned-characters.ts",
      "benchmarks/threejs/src/scenes/product-configurator.ts",
      "benchmarks/threejs/src/scenes/large-scene.ts",
      "benchmarks/threejs/src/scenes/skinned-characters.ts",
      "benchmarks/babylon/src/scenes/product-configurator.ts",
      "benchmarks/babylon/src/scenes/large-scene.ts",
      "benchmarks/babylon/src/scenes/skinned-characters.ts",
      "benchmarks/fixtures/assets/manifest.json",
      "tools/compare-engines/index.ts"
    ],
    suite: "engine-comparison-scaffold",
    ok,
    claimUsable: false,
    claimCaveat: "This report validates equivalent benchmark scaffolds, browser WebGL2 microbenchmark measurements, and bundle artifacts. Broad competitive claims remain unsupported; only exact supportedNicheClaims may be used.",
    supportedNicheClaims: [] as SupportedNicheClaim[],
    repeatability: {
      command: "pnpm exec tsx --tsconfig tsconfig.base.json tools/compare-engines/index.ts --write-reports",
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
    },
    comparedEngines: {
      galileo: rootPackage.version ?? "unknown",
      threejs: threePackage.benchmarkEngine?.version ?? "unknown",
      babylon: babylonPackage.benchmarkEngine?.version ?? "unknown",
    },
    dependencyPins: dependencyPins(rootPackage, threePackage, babylonPackage),
    gltfCompatibility: gltfCompatibilitySummary(),
    featureComparison: featureComparisonMatrix(),
    unsupportedByThisReport: [
      "GPU memory counters",
      "rendered screenshot diffs",
      "visual pixel parity for external Three.js/Babylon.js glTF loader output",
      "controls/materials/lights/shadows/postprocess runtime feature scoring",
    ],
    scenes: comparisons,
  };
}

function gitSha(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function withBrowserEvidence(report: Record<string, unknown>, evidence: BrowserEvidence): Record<string, unknown> {
  const environment = report.environment as Record<string, unknown>;
  const artifacts = report.artifacts as Record<string, unknown>;
  return {
    ...report,
    environment: {
      ...environment,
      browser: evidence.browser,
      gpu: evidence.gpu,
    },
    artifacts: {
      ...artifacts,
      screenshots: evidence.screenshots,
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
        galileo: scene.estimates.galileo,
        [competitor]: scene.estimates[competitor],
      },
    })),
  };
}

function withBenchmarkMeasurements(report: Record<string, unknown>, evidence: BenchmarkMeasurementEvidence): Record<string, unknown> {
  const byKey = new Map(evidence.measurements.map((measurement) => [`${measurement.engine}:${measurement.sceneId}`, measurement]));
  const scenesWithMeasurements = (report.scenes as SceneComparison[]).map((scene) => {
    const estimates = {} as Record<Engine, Record<string, unknown>>;
    for (const engine of ["galileo", "threejs", "babylon"] as const) {
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
    },
    benchmarkMeasurementFailureLog: evidence.failureLog,
    scenes: scenesWithMeasurements,
  };
  return {
    ...nextReport,
    supportedNicheClaims: bundleSizeNicheClaims(nextReport),
  };
}

function bundleSizeNicheClaims(report: Record<string, unknown>): SupportedNicheClaim[] {
  const scenesToCheck = report.scenes as SceneComparison[];
  return ([
    ["threejs", "Three.js", "tests/reports/comparison-threejs.json"],
    ["babylon", "Babylon.js", "tests/reports/comparison-babylon.json"]
  ] as const).flatMap(([competitor, label, reportPath]) => {
    const evidence = scenesToCheck.flatMap((scene) => {
      const galileoBundleBytes = numeric(scene.estimates.galileo?.bundleBytes);
      const competitorBundleBytes = numeric(scene.estimates[competitor]?.bundleBytes);
      if (!galileoBundleBytes || !competitorBundleBytes || galileoBundleBytes >= competitorBundleBytes) return [];
      return [{
        id: scene.id,
        galileoBundleBytes,
        competitorBundleBytes,
        ratio: Number((galileoBundleBytes / competitorBundleBytes).toFixed(3))
      }];
    });
    if (evidence.length !== comparedSceneIds.length) return [];
    return [{
      id: `equivalent-scaffold-bundle-size-${competitor}`,
      status: "supported",
      claim: `Galileo3D generated smaller esbuild browser benchmark bundles than ${label} for all three checked-in equivalent scaffold scenes on this run.`,
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

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function captureBenchmarkMeasurements(): Promise<BenchmarkMeasurementEvidence> {
  const bundles = await buildBenchmarkBundles();
  const bundleByKey = new Map(bundles.map((bundle) => [`${bundle.engine}:${bundle.sceneId}`, bundle]));
  const measurements: BenchmarkMeasurement[] = [];
  const failureLog: string[] = [];

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
    const page = await context.newPage();
    await page.setContent("<!doctype html><html><body></body></html>", { waitUntil: "load" });
    await page.addScriptTag({ content: browserBenchmarkMeasurementScript });

    for (const scene of scenes) {
      const bundle = bundleByKey.get(`${scene.engine}:${scene.id}`);
      try {
        const measured = await page.evaluate(`window.__measureBenchmarkScene(${JSON.stringify({
          scene,
          bundleBytes: bundle?.bytes ?? 0,
          bundlePath: bundle?.path ?? "not-built",
          sourceCodeBytes: sceneSourceBytes(scene),
        })})`) as BenchmarkMeasurement;
        measurements.push(measured);
      } catch (error) {
        failureLog.push(`${scene.engine}/${scene.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await browser.close();
  } catch (error) {
    failureLog.push(error instanceof Error ? error.stack ?? error.message : String(error));
  }

  return { measurements, bundles, failureLog };
}

async function buildBenchmarkBundles(): Promise<BenchmarkBundle[]> {
  const outputDir = resolve("tests/reports/comparison-bundles");
  mkdirSync(outputDir, { recursive: true });
  const bundles: BenchmarkBundle[] = [];

  for (const scene of scenes) {
    const outfile = resolve(outputDir, `${scene.engine}-${scene.id}.js`);
    const runtimeImport =
      scene.engine === "galileo"
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

const browserBenchmarkMeasurementScript = String.raw`
window.__measureBenchmarkScene = async (input) => {
  const round = (value) => Number(value.toFixed(3));
  const summarize = (samples) => {
    const sorted = [...samples].sort((left, right) => left - right);
    return {
      min: sorted[0] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
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
    triangles: input.scene.workload.triangles,
    sourceCodeBytes: input.sourceCodeBytes,
    bundleBytes: input.bundleBytes,
    bundlePath: input.bundlePath,
    failureLog: [],
    rawSamples: {
      startupMs: [startupMs],
      firstFrameMs: [firstFrameMs],
      assetLoadMs: [assetLoadMs],
      frameTimeMs: frameSamples,
      memoryMb: memorySamples
    }
  };
};
`;

async function measureBenchmarkSceneInBrowser(input: {
  readonly scene: BenchmarkScene;
  readonly bundleBytes: number;
  readonly bundlePath: string;
  readonly sourceCodeBytes: number;
}): Promise<BenchmarkMeasurement> {
  const roundLocal = (value: number): number => Number(value.toFixed(3));
  const summarizeLocal = (samples: number[]): { min: number; median: number; max: number; samples: number[] } => {
    const sorted = [...samples].sort((left, right) => left - right);
    return {
      min: sorted[0] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
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
    triangles: input.scene.workload.triangles,
    sourceCodeBytes: input.sourceCodeBytes,
    bundleBytes: input.bundleBytes,
    bundlePath: input.bundlePath,
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
      const galileo = scene.estimates.galileo;
      const competitor = scene.estimates[(report.competitor as string) ?? ""];
      return `| ${scene.id} | ${scene.equivalent ? "yes" : "no"} | ${median(galileo?.frameTimeMs)} | ${median(competitor?.frameTimeMs)} | ${galileo?.drawCalls ?? "n/a"} / ${galileo?.requestedDrawCalls ?? "n/a"} | ${galileo?.bundleBytes ?? "n/a"} | ${galileo?.sourceCodeBytes ?? "n/a"} |`;
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
    galileo: string;
    competitor: string;
    currentEvidence: string;
    claimImpact: string;
  }>;
  const supportedNicheClaims = report.supportedNicheClaims as SupportedNicheClaim[] | undefined;
  const featureRows = featureComparison
    .map((row) => `| ${row.area} | ${row.galileo} | ${row.competitor} | ${row.currentEvidence} | ${row.claimImpact} |`)
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
        .map((scene) => `| ${scene.id} | ${scene.galileoBundleBytes} | ${scene.competitorBundleBytes} | ${scene.ratio} |`)
        .join("\n");
      return `${claim.claim}\n\nMeasured dimension: ${claim.measuredDimension}. Evidence report: \`${claim.evidence.reportPath}\`.\n\n| Scene | Galileo bundle bytes | ${label} bundle bytes | Galileo / ${label} ratio |\n|---|---:|---:|---:|\n${sceneRows}\n\nExclusions: ${claim.exclusions.join(" ")}`
    }).join("\n\n")}\n`
    : "";

  return `# Galileo3D vs ${label} Benchmark Scaffold

Generated: ${report.generatedAt}

This document is intentionally limited to reproducible benchmark scaffolding. It verifies that Galileo3D and ${label} scene definitions use the same procedural assets, render resolution, camera path, lighting intent, warmup policy, measurement window, and workload shape, then captures a bounded Playwright Chromium WebGL2 microbenchmark plus esbuild browser bundle artifacts. It does not claim a runtime performance win.

Pinned versions in the generated JSON: Galileo3D ${comparedEngines.galileo}, Three.js ${comparedEngines.threejs}, Babylon.js ${comparedEngines.babylon}. Browser timing is a capped WebGL2 microbenchmark over equivalent workload metadata; it is not rendered product-scene parity.

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

| Scene | Equivalent scaffold | Galileo browser frame median ms | ${label} browser frame median ms | Galileo executed/requested draw calls | Galileo bundle bytes | Galileo scene source bytes |
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

| Area | Galileo3D evidence | ${label} evidence | Current comparison evidence | Claim impact |
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
    <p>Galileo3D ${escapeHtml(comparedEngines.galileo)}, Three.js ${escapeHtml(comparedEngines.threejs)}, Babylon.js ${escapeHtml(comparedEngines.babylon)}</p>
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
    galileo: {
      packageName: rootPackage.name ?? "@galileo3d/engine",
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
  return {
    sourceReport: path,
    blenderExportValidationReport: blenderExportValidation ? blenderValidationPath : undefined,
    corpus: report.sourceManifest,
    blenderExportValidation,
    summary: report.summary,
    caveat:
      blenderExportValidation
        ? "The linked compatibility report executes pinned Three.js and Babylon.js loaders against the same 17-entry Khronos corpus in a Node compatibility harness. It is loader import evidence, not visual/rendering parity. The same-corpus Blender-export column remains `not-run`, while the separate Blender-export validation report passes checked-in Blender-exported fixtures through Galileo3D's glTF loader."
        : "The linked compatibility report executes pinned Three.js and Babylon.js loaders against the same 17-entry Khronos corpus in a Node compatibility harness. It is loader import evidence, not visual/rendering parity. Blender-export validation remains not-run.",
  };
}

function featureComparisonMatrix(): Array<Record<string, string>> {
  return [
    {
      area: "Controls",
      galileo: "input/control unit and example evidence exists outside this scaffold",
      competitor: "not executed by this scaffold",
      currentEvidence: "no same-scene control ergonomics benchmark",
      claimImpact: "unsupported for better claims",
    },
    {
      area: "Materials",
      galileo: "PBR/material unit and visual slices exist outside this scaffold",
      competitor: "not executed by this scaffold",
      currentEvidence: "procedural material counts are matched; visual parity is not scored",
      claimImpact: "unsupported for material parity claims",
    },
    {
      area: "Lights",
      galileo: "lighting intent is matched in scaffold scene definitions",
      competitor: "same lighting intent in scaffold scene definitions",
      currentEvidence: "configuration equivalence only",
      claimImpact: "no quality or performance advantage",
    },
    {
      area: "Shadows",
      galileo: "quality.shadows is false in current scaffold scenes",
      competitor: "quality.shadows is false in current scaffold scenes",
      currentEvidence: "not exercised",
      claimImpact: "unsupported for shadow claims",
    },
    {
      area: "Postprocess",
      galileo: "quality.postprocess is false in current scaffold scenes",
      competitor: "quality.postprocess is false in current scaffold scenes",
      currentEvidence: "not exercised",
      claimImpact: "unsupported for postprocess claims",
    },
    {
      area: "Animation",
      galileo: "skinned-characters workload declares 32 animations",
      competitor: "matching skinned-characters workload declares 32 animations",
      currentEvidence: "workload equivalence plus capped browser microbenchmark timing; no animation-system parity scoring",
      claimImpact: "no runtime animation advantage",
    },
    {
      area: "Particles",
      galileo: "skinned-characters workload declares 400 particles",
      competitor: "matching skinned-characters workload declares 400 particles",
      currentEvidence: "workload equivalence plus capped browser microbenchmark timing; no particle-system parity scoring",
      claimImpact: "no runtime particle advantage",
    },
    {
      area: "Docs",
      galileo: "local docs and generated reports are linked",
      competitor: "external documentation breadth is not measured by this scaffold",
      currentEvidence: "repo-local documentation linkage only",
      claimImpact: "unsupported for ecosystem/docs superiority",
    },
  ];
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

function summarize(samples: number[]): { min: number; median: number; max: number; samples: number[] } {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
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
  return statSync(resolve(`benchmarks/${folder}/src/scenes/${scene.id}.ts`)).size;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
