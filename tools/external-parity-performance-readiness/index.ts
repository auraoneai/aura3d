import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EXTERNAL_PARITY_PERFORMANCE_BASELINE } from "../../tests/performance/external-parity-performance-baselines";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

/*
 * WS-1.1 — the large-scene browser spec and its report are gone from this list on purpose.
 *
 * `tests/browser/external-parity-large-scene.spec.ts` called `canvas.getContext("2d")`, drew 640
 * `fillRect`s, and returned `drawCalls: 146` and `cpuFrameMs: 13.8` as *literal constants in its own
 * source*, then asserted `cpuFrameMs < 16.7`. A Canvas 2D test cannot measure a WebGL2/WebGPU
 * renderer, and a constant cannot fail. This tool consumed it as the performance check, which is a
 * large part of why the project kept reporting a met frame budget while visible defects shipped.
 *
 * R1: no performance claim may be generated from evidence that does not execute the public
 * production path. Until WS-1.4's dual-engine production-path benchmark lands, large-scene
 * performance is UNPROVEN, and this tool says so by failing rather than by going quiet.
 */
const requiredFiles = [
  "packages/rendering/src/performance/RendererStats.ts",
  "packages/rendering/src/performance/ResourceBudget.ts",
  "packages/rendering/src/performance/RenderItemSorting.ts",
  "packages/rendering/src/performance/LOD.ts",
  "tests/performance/external-parity-performance-baselines.ts",
  "tools/external-parity-performance-readiness/index.ts"
] as const;

/**
 * The replacement evidence. Present after WS-1.4; absent before it.
 *
 * Pointed at the real benchmark rather than deleted, so the performance dimension is never silently
 * dropped — the gate reports it as unproven and names the workstream that resolves it.
 */
const PRODUCTION_PATH_BENCHMARK_REPORT = "tests/reports/production-path-benchmark.json";

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Obj : undefined;

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);

const benchmark = json(PRODUCTION_PATH_BENCHMARK_REPORT);
const aura = (benchmark?.aura3d ?? undefined) as Obj | undefined;
const three = (benchmark?.threejs ?? undefined) as Obj | undefined;
check(
  "production-path-benchmark",
  benchmark?.pass === true && Number(aura?.steadyStateFrameMs ?? -1) >= 0 && Number(three?.steadyStateFrameMs ?? -1) >= 0,
  benchmark === undefined
    ? "large-scene performance is UNPROVEN pending the production-path benchmark (WS-1.4). The previous evidence was a Canvas 2D test returning literal constants; it has been deleted rather than trusted. Run `pnpm bench:production-path`."
    : "Production-path benchmark must report a measured steady-state frame time for both Aura3D and Three.js through their public entry points."
);
check("baseline-stats", EXTERNAL_PARITY_PERFORMANCE_BASELINE.stats.objectCount >= 600 && EXTERNAL_PARITY_PERFORMANCE_BASELINE.stats.drawCalls > 0, "Performance baseline must include object count and draw calls.");
check("resource-budget", EXTERNAL_PARITY_PERFORMANCE_BASELINE.budget.withinBudget === true && EXTERNAL_PARITY_PERFORMANCE_BASELINE.budget.warnings.length === 0, "Resource budget must pass without exceeded warnings.");
check("sorting-lod", EXTERNAL_PARITY_PERFORMANCE_BASELINE.sortedIds[0] === "opaque-case" && EXTERNAL_PARITY_PERFORMANCE_BASELINE.lod.id === "lod1", "Render sorting and LOD selection must be deterministic.");
check("feature-coverage", EXTERNAL_PARITY_PERFORMANCE_BASELINE.featureCoverage.includes("frustum-culling") && EXTERNAL_PARITY_PERFORMANCE_BASELINE.featureCoverage.includes("memory-diagnostics"), "Performance baseline must name the required performance capabilities.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-performance-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass ? "External parity renderer performance and large-scene proof is ready." : "External parity renderer performance proof is incomplete.",
  baseline: EXTERNAL_PARITY_PERFORMANCE_BASELINE,
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-performance-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-performance-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
