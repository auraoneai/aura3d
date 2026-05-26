import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readProductionPngStats } from "../production-runtime-report-bridge/pngStats";

const reportPath = resolve("tests/reports/production-runtime-hd-flagship.json");
const readinessPath = resolve("tests/reports/production-runtime-hd-flagship-readiness.json");
const expectedScreenshot = "tests/reports/production-runtime-hd-flagship/composed-product-hd.png";

type Obj = Record<string, unknown>;

const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) as Obj : {};
const proof = asObj(report.proof);
const diagnostics = asObj(proof.diagnostics);
const importedAsset = asObj(proof.importedAsset);
const screenshot = String(report.screenshot ?? "");
const screenshotPath = resolve(screenshot || expectedScreenshot);
const pixelStats = existsSync(screenshotPath) ? readProductionPngStats(screenshotPath) : null;
const fileSize = existsSync(screenshotPath) ? statSync(screenshotPath).size : 0;
const assetIds = Array.isArray(report.assetIds) ? report.assetIds.map(String) : [];

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
    id: "composed-real-assets",
    pass: importedAsset.assetId === "damaged-helmet-composed-proof"
      && ["damaged-helmet", "boom-box", "antique-camera"].every((assetId) => assetIds.includes(assetId))
      && Number(importedAsset.vertexCount ?? 0) >= 39_000
      && Number(importedAsset.indexCount ?? 0) >= 120_000,
    detail: JSON.stringify({ importedAsset, assetIds })
  },
  {
    id: "pbr-hdr-texture-evidence",
    pass: Number(importedAsset.textureCount ?? 0) >= 15
      && Number(importedAsset.imageCount ?? 0) >= 15
      && String(importedAsset.environmentId ?? "") === "studio-small-08"
      && String(importedAsset.hdrEnvironmentUri ?? "").endsWith(".hdr")
      && Number(diagnostics.textures ?? 0) >= 21
      && Number(diagnostics.textureBytes ?? 0) >= 200_000_000,
    detail: JSON.stringify({ importedAsset, diagnostics })
  },
  {
    id: "visible-hd-pixels",
    pass: pixelStats !== null
      && fileSize >= 256 * 1024
      && pixelStats.uniqueColorBuckets >= 250
      && pixelStats.foregroundCoverage >= 0.25
      && pixelStats.centerForegroundCoverage >= 0.2
      && pixelStats.detailEdgeDensity >= 0.006
      && pixelStats.localContrast >= 18,
    detail: JSON.stringify({ fileSize, pixelStats })
  },
  {
    id: "screenshot-path",
    pass: screenshot === expectedScreenshot && existsSync(resolve(expectedScreenshot)),
    detail: screenshot || "(missing)"
  }
];

const readiness = {
  schema: "a3d-production-runtime-hd-flagship-readiness",
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
