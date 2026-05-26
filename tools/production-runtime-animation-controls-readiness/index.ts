import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const reportPath = resolve("tests/reports/production-runtime-animation-controls-readiness.json");
const browserReportPath = resolve("tests/reports/production-runtime-animation-controls-real-renderer.json");
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      status?: string;
      hdr?: { realRadianceHdr?: boolean; specularMipCount?: number };
      results?: {
        id: string;
        metadata?: { hasAnimation?: boolean; hasSkinning?: boolean; hasMorphTargets?: boolean };
        animation?: { importedAnimation?: boolean; skinningReady?: boolean; morphTargetsReady?: boolean; renderable?: boolean; warnings?: readonly string[] };
        orbit?: {
          distance?: number;
          minDistance?: number;
          maxDistance?: number;
          near?: number;
          far?: number;
          viewMatrixFinite?: boolean;
          projectionMatrixFinite?: boolean;
          viewProjectionMatrixFinite?: boolean;
        };
        summary?: { pass?: boolean };
        proof?: {
          diagnostics?: { drawCalls?: number; lastError?: string | null };
          pixels?: { nonBlackPixels?: number; uniqueColorBuckets?: number };
        };
      }[];
    }
  : null;
const results = browserReport?.results ?? [];
const skinned = results.find((result) => result.id === "cesium-man");
const morph = results.find((result) => result.id === "animated-morph-cube");
const screenshots = [
  "tests/reports/production-runtime-animation-controls/cesium-man-animation.png",
  "tests/reports/production-runtime-animation-controls/animated-morph-cube.png"
].map((path) => resolve(path));
const renderedProofsPass = results.length >= 2 && results.every((result) =>
  result.summary?.pass === true &&
  result.animation?.importedAnimation === true &&
  result.animation.renderable === true &&
  (result.animation.warnings ?? []).length === 0 &&
  (result.proof?.diagnostics?.drawCalls ?? 0) > 0 &&
  result.proof?.diagnostics?.lastError === null &&
  (result.proof?.pixels?.nonBlackPixels ?? 0) > 1000 &&
  (result.proof?.pixels?.uniqueColorBuckets ?? 0) > 4
);
const controlsPass = results.length >= 2 && results.every((result) =>
  Number.isFinite(result.orbit?.distance) &&
  Number.isFinite(result.orbit?.minDistance) &&
  Number.isFinite(result.orbit?.maxDistance) &&
  Number.isFinite(result.orbit?.near) &&
  Number.isFinite(result.orbit?.far) &&
  (result.orbit?.distance ?? 0) > 0 &&
  (result.orbit?.minDistance ?? 0) > 0 &&
  (result.orbit?.maxDistance ?? 0) > (result.orbit?.distance ?? Number.POSITIVE_INFINITY) &&
  (result.orbit?.far ?? 0) > (result.orbit?.near ?? Number.POSITIVE_INFINITY) &&
  result.orbit?.viewMatrixFinite === true &&
  result.orbit.projectionMatrixFinite === true &&
  result.orbit.viewProjectionMatrixFinite === true
);
const checks = [
  { id: "browser-report-exists", pass: Boolean(browserReport), detail: browserReportPath },
  { id: "real-hdr-bound", pass: browserReport?.hdr?.realRadianceHdr === true && (browserReport.hdr.specularMipCount ?? 0) >= 9, detail: JSON.stringify(browserReport?.hdr ?? null) },
  { id: "skinned-animation-asset", pass: skinned?.metadata?.hasAnimation === true && skinned.metadata.hasSkinning === true && skinned.animation?.skinningReady === true, detail: JSON.stringify(skinned?.metadata ?? null) },
  { id: "morph-animation-asset", pass: morph?.metadata?.hasAnimation === true && morph.metadata.hasMorphTargets === true && morph.animation?.morphTargetsReady === true, detail: JSON.stringify(morph?.metadata ?? null) },
  { id: "orbit-controls-finite", pass: controlsPass, detail: "each imported animated asset has finite target distance, clipping planes, and camera matrices" },
  { id: "real-webgl-render-proofs", pass: renderedProofsPass, detail: "each animated asset has draw calls, clean diagnostics, and nonblank pixel readback" },
  { id: "screenshots-exist", pass: screenshots.every(existsSync), detail: screenshots.join(", ") }
];
const report = {
  schema: "a3d-production-runtime-animation-controls-readiness",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  checks
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
