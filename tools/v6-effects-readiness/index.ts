import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const browserReportPath = resolve("tests/reports/v6-effects-real-renderer.json");
const screenshotPath = resolve("tests/reports/v6-effects/damaged-helmet-effects.png");
const reportPath = resolve("tests/reports/v6-effects-readiness.json");
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      status?: string;
      webglSummary?: { pass?: boolean };
      effectsSummary?: { pass?: boolean; shadowProof?: boolean; transparencyProof?: boolean; postprocessProof?: boolean; failures?: readonly string[] };
      proof?: { diagnostics?: { drawCalls?: number; textures?: number; lastError?: string | null }; pixels?: { nonBlackPixels?: number; uniqueColorBuckets?: number } };
      importedMetadata?: { pbrTextureCount?: number; normalMapCount?: number };
    }
  : null;
const checks = [
  { id: "browser-report-exists", pass: Boolean(browserReport), detail: browserReportPath },
  { id: "real-webgl-proof", pass: browserReport?.webglSummary?.pass === true, detail: "base WebGL2 proof passed" },
  { id: "effects-proof", pass: browserReport?.effectsSummary?.pass === true, detail: JSON.stringify(browserReport?.effectsSummary ?? null) },
  { id: "shadow-draw-calls", pass: browserReport?.effectsSummary?.shadowProof === true && (browserReport?.proof?.diagnostics?.drawCalls ?? 0) >= 2, detail: JSON.stringify(browserReport?.proof?.diagnostics ?? null) },
  { id: "transparency-declared", pass: browserReport?.effectsSummary?.transparencyProof === true, detail: "transparent blended render item included with imported asset" },
  { id: "postprocess-pixels", pass: browserReport?.effectsSummary?.postprocessProof === true && (browserReport?.proof?.pixels?.uniqueColorBuckets ?? 0) > 12, detail: JSON.stringify(browserReport?.proof?.pixels ?? null) },
  { id: "imported-pbr-asset", pass: (browserReport?.importedMetadata?.pbrTextureCount ?? 0) > 0 && (browserReport?.importedMetadata?.normalMapCount ?? 0) > 0, detail: JSON.stringify(browserReport?.importedMetadata ?? null) },
  { id: "screenshot-exists", pass: existsSync(screenshotPath), detail: screenshotPath }
];
const report = {
  schema: "g3d-v6-effects-readiness/v1",
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
