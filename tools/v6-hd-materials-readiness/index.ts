import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readV6PngStats } from "../v6-report-bridge/pngStats";

type Obj = Record<string, unknown>;

const reportPath = resolve("tests/reports/v6-hd-materials.json");
const readinessPath = resolve("tests/reports/v6-hd-materials-readiness.json");
const expectedScreenshot = "tests/reports/v6-hd-materials/pbr-materials-hd.png";
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) as Obj : {};
const proof = asObj(report.proof);
const diagnostics = asObj(proof.diagnostics);
const importedAsset = asObj(proof.importedAsset);
const hdrPipeline = asObj(report.hdrPipeline);
const screenshot = String(report.screenshot ?? "");
const screenshotPath = resolve(screenshot || expectedScreenshot);
const pixelStats = existsSync(screenshotPath) ? readV6PngStats(screenshotPath) : null;
const fileSize = existsSync(screenshotPath) ? statSync(screenshotPath).size : 0;
const assetIds = Array.isArray(report.assetIds) ? report.assetIds.map(String) : [];
const materialExtensions = Array.isArray(report.materialExtensionCoverage) ? report.materialExtensionCoverage.map(String) : [];

const checks = [
  {
    id: "report-exists",
    pass: existsSync(reportPath) && report.pass === true,
    detail: reportPath
  },
  {
    id: "real-webgl2-only",
    pass: proof.realWebGL2 === true && proof.mockDevice === false && proof.canvas2dProof === false,
    detail: JSON.stringify({ realWebGL2: proof.realWebGL2, mockDevice: proof.mockDevice, canvas2dProof: proof.canvas2dProof })
  },
  {
    id: "hd-resolution",
    pass: pixelStats !== null && pixelStats.width >= 1920 && pixelStats.height >= 1080,
    detail: JSON.stringify(pixelStats ? { width: pixelStats.width, height: pixelStats.height } : null)
  },
  {
    id: "material-extension-assets",
    pass: importedAsset.assetId === "hd-pbr-material-composed-proof"
      && ["damaged-helmet", "clear-coat-test", "sheen-test-grid", "specular-test"].every((assetId) => assetIds.includes(assetId))
      && ["KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_specular"].every((extension) => materialExtensions.includes(extension))
      && Number(importedAsset.materialCount ?? 0) >= 4,
    detail: JSON.stringify({ importedAsset, assetIds, materialExtensions })
  },
  {
    id: "hdr-ibl-resources",
    pass: hdrPipeline.realRadianceHdr === true
      && hdrPipeline.environmentTextureEncoding === "rgba16f-linear"
      && Number(hdrPipeline.maxLinearValue ?? 0) > 1
      && hdrPipeline.specularPrefilter === true
      && hdrPipeline.brdfLut === true
      && Number(hdrPipeline.specularMipCount ?? 0) >= 4
      && String(importedAsset.environmentId ?? "") === "industrial-high-contrast"
      && String(importedAsset.hdrEnvironmentUri ?? "").endsWith(".hdr"),
    detail: JSON.stringify({ hdrPipeline, importedAsset })
  },
  {
    id: "texture-draw-evidence",
    pass: Number(importedAsset.textureCount ?? 0) >= 5
      && Number(diagnostics.textures ?? 0) >= 12
      && Number(diagnostics.textureBytes ?? 0) >= 80_000_000
      && Number(diagnostics.drawCalls ?? 0) >= 10
      && diagnostics.lastError === null,
    detail: JSON.stringify({ importedAsset, diagnostics })
  },
  {
    id: "visible-hd-material-pixels",
    pass: pixelStats !== null
      && fileSize >= 192 * 1024
      && pixelStats.uniqueColorBuckets >= 180
      && pixelStats.foregroundCoverage >= 0.2
      && pixelStats.centerForegroundCoverage >= 0.16
      && pixelStats.detailEdgeDensity >= 0.004
      && pixelStats.localContrast >= 16,
    detail: JSON.stringify({ fileSize, pixelStats })
  },
  {
    id: "screenshot-path",
    pass: screenshot === expectedScreenshot && existsSync(resolve(expectedScreenshot)),
    detail: screenshot || "(missing)"
  }
];

const readiness = {
  schema: "g3d-v6-hd-materials-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  screenshot: expectedScreenshot,
  checks
};

mkdirSync(dirname(readinessPath), { recursive: true });
writeFileSync(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`);

if (!readiness.pass) {
  console.error(JSON.stringify(readiness, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(readiness, null, 2));

function asObj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}
