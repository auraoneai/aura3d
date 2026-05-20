import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const browserReportPath = resolve("tests/reports/v6-pbr-hdr-real-renderer.json");
const reportPath = resolve("tests/reports/v6-pbr-hdr-readiness.json");
const screenshotPaths = [
  resolve("tests/reports/v6-pbr-hdr/damaged-helmet-studio-hdr.png"),
  resolve("tests/reports/v6-pbr-hdr/damaged-helmet-sunset-hdr.png")
];
const browserReport = existsSync(browserReportPath)
  ? JSON.parse(readFileSync(browserReportPath, "utf8")) as {
      status?: string;
      studioSummary?: { pass?: boolean };
      sunsetSummary?: { pass?: boolean };
      studioPipeline?: { realRadianceHdr?: boolean; environmentTextureEncoding?: string; maxLinearValue?: number; specularMipCount?: number; textureBytes?: number };
      sunsetPipeline?: { realRadianceHdr?: boolean; environmentTextureEncoding?: string; maxLinearValue?: number; specularMipCount?: number; textureBytes?: number };
      studioProof?: { diagnostics?: { drawCalls?: number; textures?: number; lastError?: string | null }; pixels?: { nonBlackPixels?: number } };
      sunsetProof?: { diagnostics?: { drawCalls?: number; textures?: number; lastError?: string | null }; pixels?: { nonBlackPixels?: number } };
      pixelDelta?: number;
    }
  : null;

const checks = [
  { id: "browser-report-exists", pass: Boolean(browserReport), detail: browserReportPath },
  { id: "real-hdr-parsed", pass: browserReport?.studioPipeline?.realRadianceHdr === true && browserReport.sunsetPipeline?.realRadianceHdr === true, detail: "studio and sunset HDR parse flags" },
  { id: "rgba16f-hdr-texture-sampling", pass: browserReport?.studioPipeline?.environmentTextureEncoding === "rgba16f-linear" && browserReport.sunsetPipeline?.environmentTextureEncoding === "rgba16f-linear", detail: "environment maps use linear RGBA16F shader sampling" },
  { id: "hdr-radiance-range", pass: (browserReport?.studioPipeline?.maxLinearValue ?? 0) > 1 && (browserReport?.sunsetPipeline?.maxLinearValue ?? 0) > 1, detail: "HDR max linear values exceed LDR range" },
  { id: "pmrem-brdf-resources", pass: (browserReport?.studioPipeline?.specularMipCount ?? 0) >= 9 && (browserReport?.sunsetPipeline?.specularMipCount ?? 0) >= 9 && (browserReport?.studioPipeline?.textureBytes ?? 0) > 2_000_000, detail: "specular prefilter and BRDF resources generated" },
  { id: "real-renderer-passes", pass: browserReport?.studioSummary?.pass === true && browserReport.sunsetSummary?.pass === true, detail: "both WebGL2 render proofs pass" },
  { id: "visible-environment-delta", pass: (browserReport?.pixelDelta ?? 0) > 5, detail: `pixelDelta=${browserReport?.pixelDelta ?? "missing"}` },
  { id: "screenshots-exist", pass: screenshotPaths.every(existsSync), detail: screenshotPaths.join(", ") }
];

const report = {
  schema: "g3d-v6-pbr-hdr-readiness/v1",
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
