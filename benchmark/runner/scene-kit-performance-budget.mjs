#!/usr/bin/env node
import { build } from "esbuild";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { character, collectAuraLazySystemEvidence, defineAuraAssets, lazySystems, physics, sceneKits } from "../../dist/engine/agent-api/index.js";
import { classifySceneFpsSample } from "./fps-calibration.mjs";

const assets = defineAuraAssets({
  product: {
    type: "model",
    format: "glb",
    url: "./public/aura-assets/product.glb",
    hash: "sha256-scene-kit-performance-fixture",
    bounds: [2.4, 1.1, 0.82]
  }
});

const kitFactories = {
  physicsPlayground: () => sceneKits.physicsPlayground(),
  particleFountain: () => sceneKits.particleFountain({ particleCount: 2400, emissionRate: 120 }),
  solarSystem: () => sceneKits.solarSystem(),
  neonTunnel: () => sceneKits.neonTunnel(),
  dataViz: () => sceneKits.dataViz({ dataset: [[0.2, 0.5, 0.8], [0.4, 0.7, 0.9], [0.3, 0.6, 1.0]] }),
  miniGolf: () => sceneKits.miniGolf(),
  materialLab: () => sceneKits.materialLab(),
  cityBlock: () => sceneKits.cityBlock({ timeOfDay: "night" }),
  humanoidWalk: () => sceneKits.humanoidWalk({ animationState: "benchmark-pose" }),
  productViewer: () => sceneKits.productViewer(assets.product)
};

const requiredLazySystems = new Set(["physics-backend", "product-gltf-loader", "postprocess", "character-rig"]);
const requiredInstancing = {
  particleFountain: ["particle billboards"],
  solarSystem: ["star impostors", "planet labels"],
  dataViz: ["chart bars", "chart ticks and labels"],
  cityBlock: ["city window panels", "road markings"]
};
const requiredLod = new Set(["particleFountain", "cityBlock"]);
const measuredBundleBudgetsGzipBytes = {
  physicsPlayground: 470_000,
  particleFountain: 470_000,
  solarSystem: 470_000,
  neonTunnel: 470_000,
  dataViz: 470_000,
  miniGolf: 470_000,
  materialLab: 470_000,
  cityBlock: 470_000,
  humanoidWalk: 620_000,
  productViewer: 470_000
};
const bundleSnippets = {
  physicsPlayground: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.physicsPlayground().toAppOptions());`,
  particleFountain: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.particleFountain({ particleCount: 2400 }).toAppOptions());`,
  solarSystem: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.solarSystem().toAppOptions());`,
  neonTunnel: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.neonTunnel().toAppOptions());`,
  dataViz: `import { createAuraApp, sceneKits } from "@aura3d/engine";\nconst dataset = [[0.2, 0.5, 0.8], [0.4, 0.7, 0.9], [0.3, 0.6, 1.0]];\ncreateAuraApp("#app", sceneKits.dataViz({ dataset }).toAppOptions());`,
  miniGolf: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.miniGolf().toAppOptions());`,
  materialLab: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.materialLab().toAppOptions());`,
  cityBlock: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.cityBlock({ timeOfDay: "night" }).toAppOptions());`,
  humanoidWalk: `import { createAuraApp, sceneKits } from "@aura3d/engine";\ncreateAuraApp("#app", sceneKits.humanoidWalk().toAppOptions());`,
  productViewer: `import { createAuraApp, defineAuraAssets, sceneKits } from "@aura3d/engine";\nconst assets = defineAuraAssets({ product: { type: "model", format: "glb", url: "./public/aura-assets/product.glb", hash: "sha256-scene-kit-product-fixture", bounds: [2.4, 1.1, 0.82] } });\ncreateAuraApp("#app", sceneKits.productViewer(assets.product).toAppOptions());`
};
const report = {
  schema: "aura3d-scene-kit-performance-budget/1.0",
  generatedAt: new Date().toISOString(),
  bundleMeasurement: "esbuild bundle + minify + gzip -9 per scene-kit snippet; optional lazy systems externalized",
  pass: true,
  kits: [],
  aggregate: {},
  lazyEntrypoints: {},
  smokeRoutes: auditSmokeRouteInstrumentation()
};

const seenLazySystems = new Set();
for (const [id, factory] of Object.entries(kitFactories)) {
  const kit = factory();
  const perf = kit.diagnostics.performance;
  const measuredBundle = await measureSceneKitBundle(id, bundleSnippets[id]);
  const familyNames = perf.instancing.families.map((family) => family.family);
  const missingFamilies = (requiredInstancing[id] ?? []).filter((family) => !familyNames.includes(family));
  const lazySystems = perf.lazyLoading.systems.map((entry) => entry.system);
  for (const system of lazySystems) seenLazySystems.add(system);
  const failures = [];
  if (perf.kind !== "aura-scene-kit-performance-diagnostics") failures.push("missing performance diagnostics");
  if (!perf.drawCalls.pass) failures.push(`draw-call budget exceeded: ${perf.drawCalls.estimatedDrawCalls}/${perf.drawCalls.maxDrawCalls}`);
  if (!perf.bundle.pass) failures.push(`bundle budget exceeded: ${perf.bundle.estimatedGzipBytes}/${perf.bundle.maxGzipBytes}`);
  if (!measuredBundle.pass) failures.push(`measured bundle budget exceeded: ${measuredBundle.bundleSizeGzipBytes}/${measuredBundle.bundleBudgetGzipBytes}`);
  if (!perf.fps.calibrationRequired || perf.fps.p50Metric !== "metrics.p50Fps") failures.push("missing calibrated p50 FPS contract");
  if (missingFamilies.length > 0) failures.push(`missing instancing families: ${missingFamilies.join(", ")}`);
  if (requiredInstancing[id] && perf.instancing.estimatedDrawCallSavings <= 0) failures.push("instancing savings not positive");
  if (requiredLod.has(id) && !perf.lod.applied) failures.push("dense scene missing LOD/impostor evidence");
  if (!perf.lazyLoading.allOptional) failures.push("lazy-loading plan marks an optional heavy system as default-loaded");
  report.kits.push({
    id,
    pass: failures.length === 0,
    failures,
    nodeCount: kit.nodes.length,
    drawCalls: perf.drawCalls,
    bundle: perf.bundle,
    measuredBundle,
    fps: perf.fps,
    instancingFamilies: familyNames,
    instancingSavings: perf.instancing.estimatedDrawCallSavings,
    lod: perf.lod,
    lazySystems
  });
  if (failures.length > 0) report.pass = false;
}

const missingLazySystems = [...requiredLazySystems].filter((system) => !seenLazySystems.has(system));
const rootEngine = await import("../../dist/engine/index.js");
const lazyEntrypoints = await auditLazyEntrypoints(rootEngine);
const fpsVerdict = classifySceneFpsSample({
  sampleCount: 120,
  totalFrameTimeMs: 2000,
  minFrameTimeMs: 15,
  maxFrameTimeMs: 24,
  p50FrameTimeMs: 16.7,
  p95FrameTimeMs: 22,
  p50Fps: 59.88,
  timedOut: false
});
report.aggregate = {
  requiredLazySystems: [...requiredLazySystems],
  seenLazySystems: [...seenLazySystems].sort(),
  missingLazySystems,
  fpsCalibrationSampleStatus: fpsVerdict.status,
  fpsCalibrationSampleFailures: fpsVerdict.failures
};
report.lazyEntrypoints = lazyEntrypoints;
if (missingLazySystems.length > 0 || fpsVerdict.status !== "pass" || !report.smokeRoutes.pass || !lazyEntrypoints.pass) report.pass = false;

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);

function auditSmokeRouteInstrumentation() {
  const captureSource = readFileSync("benchmark/runner/capture-engine.mjs", "utf8");
  const batchSource = readFileSync("benchmark/runner/capture-engine-batch.mjs", "utf8");
  const checks = [
    ["capture runs FPS calibration", captureSource.includes("runFpsCalibrationWithRetry")],
    ["capture samples scene FPS", captureSource.includes("samplePageFps(page")],
    ["capture records p50 FPS", captureSource.includes("p50Fps = fpsSample.p50Fps")],
    ["capture records p95 frame time", captureSource.includes("p95FrameTimeMs = fpsSample.p95FrameTimeMs")],
    ["capture records gzip bundle bytes", captureSource.includes("bundleSizeGzipBytes")],
    ["batch requires passing FPS instrumentation", batchSource.includes("metrics.fpsInstrumentationStatus === \"pass\"")],
    ["batch requires finite p50 FPS", batchSource.includes("Number.isFinite(metrics.p50Fps)")],
    ["batch requires finite bundle size", batchSource.includes("Number.isFinite(metrics.bundleSizeGzipBytes)")]
  ].map(([id, pass]) => ({ id, pass }));
  return { pass: checks.every((check) => check.pass), checks };
}

async function auditLazyEntrypoints(rootEngine) {
  const checks = [];
  const hasFunction = (id, value) => {
    const pass = typeof value === "function";
    checks.push({ id, pass });
    return pass;
  };
  hasFunction("physics.worldAsync", physics.worldAsync);
  hasFunction("physics.worldFromSceneAsync", physics.worldFromSceneAsync);
  hasFunction("character.importedRigRuntime", character.importedRigRuntime);
  hasFunction("root.loadProductAssetLazy", rootEngine.loadProductAssetLazy);
  hasFunction("root.createPostProcessComposerLazy", rootEngine.createPostProcessComposerLazy);
  hasFunction("collectAuraLazySystemEvidence", collectAuraLazySystemEvidence);
  hasFunction("lazySystems.collect", lazySystems.collect);

  if (typeof physics.worldAsync === "function") {
    const world = await physics.worldAsync({ backend: "aura-js" });
    checks.push({ id: "physics.worldAsync runtime", pass: world.snapshot().backend.active === "aura-js" });
  }

  for (const system of ["product-gltf-loader", "postprocess", "character-rig"]) {
    lazySystems.markRequested(system, "scene-kit-performance-budget-smoke");
    lazySystems.markLoaded(system, 0);
  }
  const systems = collectAuraLazySystemEvidence();
  for (const system of requiredLazySystems) {
    const entry = systems.find((candidate) => candidate.system === system);
    checks.push({ id: `lazy evidence:${system}`, pass: entry?.requested === true && entry.loaded === true });
  }

  return { pass: checks.every((check) => check.pass), checks, systems };
}

async function measureSceneKitBundle(id, source) {
  const enginePath = resolve("dist/engine/agent-api/index.js");
  const result = await build({
    stdin: {
      contents: source,
      resolveDir: process.cwd(),
      sourcefile: `${id}.ts`,
      loader: "ts"
    },
    bundle: true,
    minify: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2020",
    external: ["@aura3d/assets", "@aura3d/product-studio", "@aura3d/rendering", "node:*"],
    plugins: [{
      name: "aura3d-engine-alias",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@aura3d\/engine$/ }, () => ({ path: enginePath }));
      }
    }],
    logLevel: "silent"
  });
  const jsBytes = result.outputFiles[0]?.contents.length ?? 0;
  const gzipBytes = gzipSync(result.outputFiles[0]?.contents ?? new Uint8Array(), { level: 9 }).length;
  const budget = measuredBundleBudgetsGzipBytes[id];
  return {
    bundleSizeJsBytes: jsBytes,
    bundleSizeGzipBytes: gzipBytes,
    bundleBudgetGzipBytes: budget,
    pass: Number.isFinite(budget) && gzipBytes <= budget
  };
}
