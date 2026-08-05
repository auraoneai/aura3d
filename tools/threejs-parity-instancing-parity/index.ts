import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import instancingScene from "../../benchmarks/shared/scenes/instancing.js";

const OUTPUT_PATH = "tests/reports/threejs-parity/instancing-parity.json";
const comparisonPath = "tests/reports/comparison-threejs.json";
const routePath = "tests/reports/current-routes-route-health.json";

const comparison = readJson(comparisonPath);
const routeReport = readJson(routePath);
const threeOutcome = comparison.comparisonOutcomes?.byCompetitor?.threejs?.scenes?.find((scene: { readonly id?: unknown }) => scene.id === "instancing");
const route = routeReport.routes?.find((entry: { readonly label?: unknown }) => entry.label === "CurrentRoutes Instancing Performance");
const runtime = route?.runtime ?? {};

const checks = [
  check("descriptor-instances", instancingScene.workload.instances === 4096, `shared benchmark descriptor uses ${instancingScene.workload.instances ?? 0} instances`),
  check("descriptor-has-no-instancing-unsupported-features", (instancingScene.unsupportedFeatures ?? []).length === 0, `unsupportedFeatures: ${(instancingScene.unsupportedFeatures ?? []).join(", ") || "none"}`),
  check("comparison-scene-equivalent", Boolean(threeOutcome?.equivalent), "comparison report marks the instancing scene descriptor equivalent"),
  /*
   * WS-1.2 — `comparison-frame-time` is gone, and this is the check that most needed removing.
   *
   * It read `frameTimeMedian` / `frameTimeP95` from tools/compare-engines, which produced those
   * numbers by drawing a 3-vertex triangle through a raw WebGL2 context that imports no engine. The
   * check therefore passed for structural reasons — the same triangle compared against itself always
   * ties — while claiming Three.js frame-time parity for instancing.
   *
   * Replaced by an assertion that the comparison report *admits* it does not measure engine timing,
   * plus the real route-level instancing evidence below (one draw call for >= 4096 instances), which
   * does execute the public renderer. Frame-time parity for the engine as a whole is
   * tests/reports/production-path-benchmark.json's job.
   */
  check(
    "comparison-timing-not-claimed",
    threeOutcome?.timingVerdict?.result === "not-measured-by-this-report",
    `timingVerdict=${threeOutcome?.timingVerdict?.result ?? "missing"} (a frame-time claim from this report would be the raw-WebGL2 triangle compared against itself)`
  ),
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
  claim: "webgl_instancing_performance and webgl_instancing_dynamic have public Scene.createInstancedMesh, dynamic per-instance matrix updates, per-instance color attributes, one-draw browser evidence, and Three.js benchmark draw-call/screenshot parity evidence for this scoped workload. Bundle bytes are measured and reported as evidence, not used as a win claim. NO FRAME-TIME CLAIM is made from this report (WS-1.2): its timing came from a raw WebGL2 triangle importing no engine. Engine frame time is measured in tests/reports/production-path-benchmark.json.",
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
