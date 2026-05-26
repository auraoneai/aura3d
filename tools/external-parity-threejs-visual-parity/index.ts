import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { V4_THREEJS_PARITY_SCENES } from "../../benchmarks/external-parity/shared/threejs-visual-parity-scenes";

type Obj = Record<string, unknown>;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string; }

const reportDir = "tests/reports/external-parity-threejs-visual-parity";
const manifestPath = `${reportDir}/manifest.json`;
const manifest = existsSync(resolve(manifestPath)) ? JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as Obj : undefined;
const captures = Array.isArray(manifest?.captures) ? manifest.captures.map((entry) => entry as Obj) : [];
const checks: Check[] = [];
const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

check("browser-manifest", manifest?.pass === true, "Browser manifest must pass.");
check("scene-count", captures.length >= 7 && captures.length === V4_THREEJS_PARITY_SCENES.length, "At least seven same-scene captures are required, including large-scene/performance.");

const screenshotChecks = V4_THREEJS_PARITY_SCENES.flatMap((scene) => ["a3d", "threejs", "diff"].map((kind) => {
  const path = `${reportDir}/${scene.id}-${kind}.png`;
  const exists = existsSync(resolve(path));
  const bytes = exists ? statSync(resolve(path)).size : 0;
  check(`screenshot:${scene.id}:${kind}`, exists && bytes > (kind === "diff" ? 2_000 : 8_000), `${path} must exist and be non-empty.`);
  return { scene: scene.id, kind, path, exists, bytes };
}));

const setupLineCounts = captures.map((capture) => {
  const a3d = obj(capture.a3d);
  const threejs = obj(capture.threejs);
  return {
    scene: String(capture.sceneId),
    a3d: Number(a3d.setupLines ?? 0),
    threejs: Number(threejs.setupLines ?? 0),
    a3dShorter: Number(a3d.setupLines ?? 0) < Number(threejs.setupLines ?? 0)
  };
});

const runtimeStats = captures.map((capture) => ({
  scene: String(capture.sceneId),
  a3dDrawCalls: Number(obj(capture.runtimeStats).a3dDrawCalls ?? 0),
  threejsDrawCalls: Number(obj(capture.runtimeStats).threejsDrawCalls ?? 0),
  threejsTriangles: Number(obj(capture.runtimeStats).threejsTriangles ?? 0),
  meanDifference: Number(obj(capture.diff).meanDifference ?? Number.NaN),
  visualScore: Number(capture.visualScore ?? Number.NaN)
}));

check(
  "line-counts",
  setupLineCounts.length >= 6 && setupLineCounts.every((entry) => entry.a3dShorter && entry.a3d > 0 && entry.threejs > 0),
  "Every supported workflow comparison must record lower A3D setup line count than the raw Three.js setup."
);
check(
  "runtime-stats",
  runtimeStats.length >= 6 && runtimeStats.every((entry) =>
    Number(entry.a3dDrawCalls) > 0 &&
    Number(entry.threejsDrawCalls) > 0 &&
    Number.isFinite(entry.meanDifference) &&
    Number.isFinite(entry.visualScore)
  ),
  "Every comparison must include draw-call stats, diff mean, and visual score."
);
check(
  "visual-scoring",
  runtimeStats.every((entry) => Number(entry.visualScore) >= 58),
  "Every comparison must meet the bounded visual score threshold."
);
check(
  "gap-report-source",
  captures.every((capture) => arr(capture.gaps).length > 0) &&
    captures.some((capture) => arr(capture.gaps).join(" ").includes("not prove every glTF extension")) &&
    captures.some((capture) => arr(capture.gaps).join(" ").includes("input latency")) &&
    captures.some((capture) => arr(capture.gaps).join(" ").includes("performance superiority")),
  "Captures must include explicit gap statements for non-proven Three.js parity claims."
);

const gapReportPath = `${reportDir}/gap-report.md`;
writeFileSync(resolve(gapReportPath), [
  "# V4 Three.js Visual Parity Gap Report",
  "",
  "This report covers six supported workflow comparisons only. It does not claim broad Three.js API replacement.",
  "",
  ...captures.flatMap((capture) => [
    `## ${String(capture.title ?? capture.sceneId)}`,
    "",
    `- Visual score: ${String(capture.visualScore)}`,
    `- Mean diff: ${String(obj(capture.diff).meanDifference)}`,
    `- A3D setup lines: ${String(obj(capture.a3d).setupLines)}`,
    `- Three.js setup lines: ${String(obj(capture.threejs).setupLines)}`,
    ...arr(capture.gaps).map((gap) => `- Gap: ${String(gap)}`),
    ""
  ])
].join("\n"));

check("gap-report", existsSync(resolve(gapReportPath)) && readFileSync(resolve(gapReportPath), "utf8").includes("does not claim broad Three.js API replacement"), "Gap report must be written and preserve the claim boundary.");

const pass = checks.every((entry) => entry.pass);
const report = {
  schema: "a3d-external-parity-threejs-visual-parity/v1",
  generatedAt: new Date().toISOString(),
  pass,
  summary: pass
    ? "V4 Milestone 15 same-scene Three.js visual parity proof is ready for the supported workflow comparisons, including large-scene/performance."
    : "V4 Milestone 15 same-scene Three.js visual parity proof is incomplete.",
  scenes: V4_THREEJS_PARITY_SCENES.map((scene) => scene.id),
  screenshotChecks,
  setupLineCounts,
  runtimeStats,
  gapReportPath,
  browserManifestPath: manifestPath,
  claimBoundary: "Bounded same-scene parity for supported V4 workflows only; broad Three.js replacement remains blocked.",
  checks
};

mkdirSync(dirname(resolve("tests/reports/external-parity-threejs-visual-parity.json")), { recursive: true });
writeFileSync(resolve("tests/reports/external-parity-threejs-visual-parity.json"), `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
