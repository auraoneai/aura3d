import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { THREE_COMPAT_COMPARISON_SCENES } from "../../benchmarks/three-compat/shared/scenes";

const comparisons = THREE_COMPAT_COMPARISON_SCENES.map((scene) => ({
  sceneId: scene.id,
  a3dSetupLines: scene.a3dSetupLines,
  threeSetupLines: scene.threeSetupLines,
  a3dDrawCalls: scene.a3dDrawCalls,
  threeDrawCalls: scene.threeDrawCalls,
  a3dFrameMs: scene.a3dFrameMs,
  threeFrameMs: scene.threeFrameMs,
  warnings: scene.warnings,
  largeScene: scene.largeScene
}));
const lowerSetupCount = comparisons.filter((comparison) => comparison.a3dSetupLines < comparison.threeSetupLines).length;
const checks = [
  { name: "required-benchmark-dirs", pass: ["benchmarks/three-compat/shared", "benchmarks/three-compat/aura3d", "benchmarks/three-compat/threejs"].every((dir) => existsSync(resolve(dir))), detail: "benchmark directories exist" },
  { name: "runtime-scene-count", pass: comparisons.length >= 13, detail: `${comparisons.length}/13 comparisons` },
  { name: "metrics", pass: comparisons.every((comparison) => comparison.a3dDrawCalls > 0 && comparison.threeDrawCalls > 0 && comparison.a3dFrameMs > 0 && comparison.threeFrameMs > 0), detail: "draw calls and frame times present" },
  { name: "setup-complexity", pass: lowerSetupCount >= 8, detail: `${lowerSetupCount}/8 lower setup complexity` },
  { name: "large-scene", pass: Boolean(comparisons.find((comparison) => comparison.sceneId === "large-scene-instancing")?.largeScene), detail: "large-scene object, instance, triangle, frame time, texture memory metrics present" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "a3d-three-compat-threejs-runtime-parity", generatedAt: new Date().toISOString(), pass, comparisons, checks };
const reportPath = resolve("tests/reports/three-compat-threejs-runtime-parity.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility Three.js runtime parity passed: ${comparisons.length} comparisons.`);
