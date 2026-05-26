import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const browserReportPath = resolve("tests/reports/production-runtime-webgl2-real-renderer.json");
const screenshotPath = resolve("tests/reports/production-runtime-webgl2/damaged-helmet-webgl2.png");
const reportPath = resolve("tests/reports/production-runtime-webgl2-readiness.json");

const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      status?: string;
      summary?: { pass?: boolean; missing?: readonly string[] };
      proof?: {
        realWebGL2?: boolean;
        mockDevice?: boolean;
        canvas2dProof?: boolean;
        diagnostics?: { drawCalls?: number; textures?: number; textureBytes?: number; lastError?: string | null };
        pixels?: { nonBlackPixels?: number; averageLuma?: number; maxLuma?: number; uniqueColorBuckets?: number };
        importedAsset?: { assetId?: string; materialCount?: number; textureCount?: number; imageCount?: number };
      };
      assetIds?: readonly string[];
    }
  : null;

const checks = [
  {
    id: "browser-report-exists",
    pass: Boolean(browserReport),
    detail: browserReportPath
  },
  {
    id: "real-webgl2",
    pass: browserReport?.proof?.realWebGL2 === true && browserReport.proof.mockDevice === false,
    detail: `real=${browserReport?.proof?.realWebGL2} mock=${browserReport?.proof?.mockDevice}`
  },
  {
    id: "no-canvas2d-proof",
    pass: browserReport?.proof?.canvas2dProof === false,
    detail: "flagship proof must not use Canvas 2D drawing"
  },
  {
    id: "imported-asset",
    pass: browserReport?.proof?.importedAsset?.assetId === "damaged-helmet-composed-proof"
      && (browserReport.proof.importedAsset.textureCount ?? 0) >= 15
      && ["damaged-helmet", "boom-box", "antique-camera"].every((assetId) => browserReport.assetIds?.includes(assetId)),
    detail: JSON.stringify({
      importedAsset: browserReport?.proof?.importedAsset ?? null,
      assetIds: browserReport?.assetIds ?? []
    })
  },
  {
    id: "draw-texture-diagnostics",
    pass: (browserReport?.proof?.diagnostics?.drawCalls ?? 0) > 0 && (browserReport?.proof?.diagnostics?.textures ?? 0) > 0 && (browserReport?.proof?.diagnostics?.textureBytes ?? 0) > 0 && browserReport?.proof?.diagnostics?.lastError === null,
    detail: JSON.stringify(browserReport?.proof?.diagnostics ?? null)
  },
  {
    id: "visible-pixels",
    pass: (browserReport?.proof?.pixels?.nonBlackPixels ?? 0) > 2000 && (browserReport?.proof?.pixels?.uniqueColorBuckets ?? 0) > 8,
    detail: JSON.stringify(browserReport?.proof?.pixels ?? null)
  },
  {
    id: "screenshot-exists",
    pass: existsSync(screenshotPath),
    detail: screenshotPath
  }
];

const report = {
  schema: "a3d-production-runtime-webgl2-readiness",
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
