import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const scenes = ["product", "material", "asset", "interactive"] as const;
const requiredFiles = [
  ...scenes.map((scene) => `benchmarks/foundation/shared/scenes/${scene}-scene.ts`),
  ...scenes.map((scene) => `benchmarks/foundation/aura3d/${scene}-scene.ts`),
  ...scenes.map((scene) => `benchmarks/foundation/threejs/${scene}-scene.ts`),
  "tests/browser/foundation-threejs-comparison.spec.ts"
] as const;
const manifestPath = resolve("tests/reports/foundation-threejs-comparison/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as BrowserComparisonManifest : undefined;
const fileChecks = requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)), lines: existsSync(resolve(path)) ? lineCount(resolve(path)) : 0 }));
const screenshotChecks = scenes.flatMap((scene) => ["a3d", "threejs", "diff"].map((kind) => {
  const path = `tests/reports/foundation-threejs-comparison/${scene}-${kind}.png`;
  return {
    scene,
    kind,
    path,
    exists: existsSync(resolve(path)),
    bytes: existsSync(resolve(path)) ? statSync(resolve(path)).size : 0
  };
}));
const captures = manifest?.captures ?? [];
const ergonomicWins = captures.filter((capture) => capture.ergonomicWin).map((capture) => capture.sceneId);
const setupLineCounts = captures.map((capture) => ({
  scene: capture.sceneId,
  a3d: capture.a3d.setupLines,
  threejs: capture.threejs.setupLines,
  a3dShorter: capture.a3d.setupLines < capture.threejs.setupLines
}));
const runtimeDiagnostics = captures.map((capture) => ({
  scene: capture.sceneId,
  a3dDrawCalls: capture.a3d.drawCalls,
  threejsDrawCalls: capture.threejs.drawCalls,
  a3dItems: capture.a3d.itemCount,
  threejsItems: capture.threejs.itemCount,
  meanDifference: capture.diff.meanDifference
}));
const bundleEstimate = {
  a3dDistBytes: directorySize(resolve("dist/rendering")) + directorySize(resolve("dist/workflows")) + directorySize(resolve("dist/assets")),
  threeModuleBytes: existsSync(resolve("node_modules/three/build/three.module.js")) ? statSync(resolve("node_modules/three/build/three.module.js")).size : 0,
  note: "Local unminified file-size estimate only; not a production bundle-size benchmark."
};
const wins = [
  "Workflow APIs reduce setup code for supported asset, product/material, and interactive scenes.",
  "A3D reports renderer diagnostics and workflow feature checklists as first-class app data.",
  "A3D asset/product workflows combine loading, framing, lighting, render-source creation, and disposal."
];
const gaps = [
  "This comparison does not prove broad Three.js API replacement.",
  "Three.js has a much larger ecosystem, examples base, loader catalog, and community surface.",
  "The visual diff images are local evidence for these scenes only, not a formal perceptual-quality benchmark.",
  "Interactive comparison is a fixed timestamp capture, not input latency or long-run stability evidence."
];
const report = {
  schema: "a3d-foundation-threejs-comparison/v1",
  generatedAt: new Date().toISOString(),
  pass: fileChecks.every((file) => file.exists)
    && manifest?.pass === true
    && captures.length === scenes.length
    && screenshotChecks.every((check) => check.exists && check.bytes > (check.kind === "diff" ? 5_000 : 10_000))
    && ergonomicWins.length >= 3
    && runtimeDiagnostics.every((diagnostic) => diagnostic.a3dDrawCalls > 0 && diagnostic.threejsDrawCalls > 0 && Number.isFinite(diagnostic.meanDifference) && diagnostic.meanDifference < 160),
  fileChecks,
  screenshotChecks,
  setupLineCounts,
  ergonomicWins,
  runtimeDiagnostics,
  bundleEstimate,
  featureComparison: {
    scenes: [...scenes],
    a3dStrength: "Supported workflows expose higher-level app-ready APIs.",
    threejsStrength: "Lower-level scene graph flexibility and mature ecosystem breadth.",
    claimBoundary: "A3D can be described as a Three.js competitor for these supported workflows only."
  },
  wins,
  gaps,
  browserManifestPath: "tests/reports/foundation-threejs-comparison/manifest.json",
  browserManifestExists: existsSync(manifestPath)
};

const reportPath = resolve("tests/reports/foundation-threejs-comparison.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function directorySize(path: string): number {
  if (!existsSync(path)) return 0;
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const next = join(path, entry.name);
    total += entry.isDirectory() ? directorySize(next) : statSync(next).size;
  }
  return total;
}

interface BrowserComparisonManifest {
  readonly pass: boolean;
  readonly captures: readonly {
    readonly sceneId: string;
    readonly a3d: {
      readonly path: string;
      readonly bytes: number;
      readonly drawCalls: number;
      readonly itemCount: number;
      readonly setupLines: number;
    };
    readonly threejs: {
      readonly path: string;
      readonly bytes: number;
      readonly drawCalls: number;
      readonly itemCount: number;
      readonly setupLines: number;
    };
    readonly diff: {
      readonly path: string;
      readonly bytes: number;
      readonly drawCalls: number;
      readonly itemCount: number;
      readonly setupLines: number;
      readonly meanDifference: number;
    };
    readonly ergonomicWin: boolean;
    readonly gaps: readonly string[];
  }[];
}
