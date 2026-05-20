import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { V4_PERFORMANCE_BASELINE } from "../../tests/performance/v4-performance-baselines";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const requiredFiles = [
  "packages/rendering/src/performance/RendererStats.ts",
  "packages/rendering/src/performance/ResourceBudget.ts",
  "packages/rendering/src/performance/RenderItemSorting.ts",
  "packages/rendering/src/performance/LOD.ts",
  "tests/browser/v4-large-scene.spec.ts",
  "tests/performance/v4-performance-baselines.ts",
  "tools/v4-performance-readiness/index.ts",
  "tests/reports/v4-large-scene-browser.json",
  "tests/reports/v4-gallery/performance/large-scene-performance.png"
] as const;

const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const json = (path: string): Obj | undefined => existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Obj : undefined;

for (const file of requiredFiles) check(`file:${file}`, existsSync(resolve(file)), `${file} must exist.`);

const browser = json("tests/reports/v4-large-scene-browser.json");
const state = browser?.state as Obj | undefined;
check("browser-large-scene", browser?.ok === true && Number(state?.objectCount ?? 0) >= 600 && Number(state?.drawCalls ?? 0) > 0, "Browser large-scene report must prove object count, draw calls, and frame diagnostics.");
check("screenshot", existsSync(resolve("tests/reports/v4-gallery/performance/large-scene-performance.png")) && statSync(resolve("tests/reports/v4-gallery/performance/large-scene-performance.png")).size > 8_000, "Large-scene screenshot must exist and be non-placeholder.");
check("baseline-stats", V4_PERFORMANCE_BASELINE.stats.objectCount >= 600 && V4_PERFORMANCE_BASELINE.stats.drawCalls > 0, "Performance baseline must include object count and draw calls.");
check("resource-budget", V4_PERFORMANCE_BASELINE.budget.withinBudget === true && V4_PERFORMANCE_BASELINE.budget.warnings.length === 0, "Resource budget must pass without exceeded warnings.");
check("sorting-lod", V4_PERFORMANCE_BASELINE.sortedIds[0] === "opaque-case" && V4_PERFORMANCE_BASELINE.lod.id === "lod1", "Render sorting and LOD selection must be deterministic.");
check("feature-coverage", V4_PERFORMANCE_BASELINE.featureCoverage.includes("frustum-culling") && V4_PERFORMANCE_BASELINE.featureCoverage.includes("memory-diagnostics"), "Performance baseline must name the required performance capabilities.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "g3d-v4-performance-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass ? "V4 renderer performance and large-scene proof is ready." : "V4 renderer performance proof is incomplete.",
  baseline: V4_PERFORMANCE_BASELINE,
  checkedFiles: requiredFiles,
  checks
};

mkdirSync(dirname(resolve("tests/reports/v4-performance-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/v4-performance-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
