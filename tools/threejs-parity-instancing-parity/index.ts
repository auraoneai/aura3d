import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import instancingScene from "../../benchmarks/shared/scenes/instancing.js";

const OUTPUT_PATH = "tests/reports/threejs-parity/instancing-parity.json";
const comparisonPath = "tests/reports/comparison-threejs.json";
const routePath = "tests/reports/current-routes-animation-examples.json";

const comparison = readJson(comparisonPath);
const routeReport = readJson(routePath);
const threeOutcome = comparison.comparisonOutcomes?.byCompetitor?.threejs?.scenes?.find((scene: { readonly id?: unknown }) => scene.id === "instancing");
const route = routeReport.routes?.find((entry: { readonly label?: unknown }) => entry.label === "CurrentRoutes Instancing Performance");
const runtime = route?.runtime ?? {};

const checks = [
  check("descriptor-instances", instancingScene.workload.instances === 4096, `shared benchmark descriptor uses ${instancingScene.workload.instances ?? 0} instances`),
  check("descriptor-has-no-instancing-unsupported-features", (instancingScene.unsupportedFeatures ?? []).length === 0, `unsupportedFeatures: ${(instancingScene.unsupportedFeatures ?? []).join(", ") || "none"}`),
  check("comparison-scene-equivalent", Boolean(threeOutcome?.equivalent), "comparison report marks the instancing scene descriptor equivalent"),
  check("comparison-frame-time", isWinOrTie(threeOutcome?.frameTimeMedian?.result) && isWinOrTie(threeOutcome?.frameTimeP95?.result), `median=${threeOutcome?.frameTimeMedian?.result}, p95=${threeOutcome?.frameTimeP95?.result}`),
  check("comparison-draw-calls", isWinOrTie(threeOutcome?.drawCalls?.result), `drawCalls=${threeOutcome?.drawCalls?.result}`),
  check("comparison-bundle-measured", typeof threeOutcome?.bundleBytes?.aura3d === "number" && typeof threeOutcome?.bundleBytes?.competitor === "number", `bundle=${threeOutcome?.bundleBytes?.result}, aura3d=${threeOutcome?.bundleBytes?.aura3d}, threejs=${threeOutcome?.bundleBytes?.competitor}`),
  check("comparison-screenshot-diff", threeOutcome?.screenshotDiff?.pass === true, `screenshotDiff.pass=${threeOutcome?.screenshotDiff?.pass}`),
  check("route-public-scene-instanced-mesh", runtime.publicSceneInstancedMesh === true, `publicSceneInstancedMesh=${runtime.publicSceneInstancedMesh}`),
  check("route-one-draw", runtime.drawCalls === 1, `drawCalls=${runtime.drawCalls}`),
  check("route-instance-count", typeof runtime.instanceCount === "number" && runtime.instanceCount >= 4096, `instanceCount=${runtime.instanceCount}`),
  check("route-instance-attributes", typeof runtime.instanceAttributeBuffers === "number" && runtime.instanceAttributeBuffers >= 2 && typeof runtime.instanceAttributeBytes === "number" && runtime.instanceAttributeBytes > 0, `buffers=${runtime.instanceAttributeBuffers}, bytes=${runtime.instanceAttributeBytes}`)
];

const report = {
  schema: "a3d-threejs-parity-instancing-parity",
  generatedAt: new Date().toISOString(),
  pass: checks.every((entry) => entry.pass),
  inputs: {
    comparisonPath,
    routePath,
    benchmarkDescriptor: "benchmarks/shared/scenes/instancing.ts",
    route: "/apps/instancing-performance/"
  },
  claim: "webgl_instancing_performance and webgl_instancing_dynamic have public Scene.createInstancedMesh, dynamic per-instance matrix updates, per-instance color attributes, one-draw browser evidence, and Three.js benchmark frame-time/draw-call/screenshot parity evidence for this scoped workload. Bundle bytes are measured and reported as evidence, not used as a win claim.",
  checks
};

writeJson(OUTPUT_PATH, report);
if (!report.pass) {
  throw new Error(`Three.js parity instancing parity failed: ${OUTPUT_PATH}`);
}
console.log(`Three.js parity instancing parity report written: ${OUTPUT_PATH}`);

function check(id: string, pass: boolean, detail: string): { readonly id: string; readonly pass: boolean; readonly detail: string } {
  return { id, pass, detail };
}

function isWinOrTie(value: unknown): boolean {
  return value === "win" || value === "tie";
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
