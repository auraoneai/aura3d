import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readV6PngStats } from "../production-runtime-report-bridge/pngStats";

const reportPath = resolve("tests/reports/production-runtime-hd-product-hero.json");
const readinessPath = resolve("tests/reports/production-runtime-hd-product-hero-readiness.json");
const expectedScreenshot = "tests/reports/production-runtime-hd-product-hero/damaged-helmet-hero.png";

type Obj = Record<string, unknown>;

const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) as Obj : {};
const proof = asObj(report.proof);
const diagnostics = asObj(proof.diagnostics);
const importedAsset = asObj(proof.importedAsset);
const hdrPipeline = asObj(report.hdrPipeline);
const screenshot = String(report.screenshot ?? "");
const screenshotPath = resolve(screenshot || expectedScreenshot);
const pixelStats = existsSync(screenshotPath) ? readV6PngStats(screenshotPath) : null;
const fileSize = existsSync(screenshotPath) ? statSync(screenshotPath).size : 0;

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
    id: "hero-resolution",
    pass: pixelStats !== null && pixelStats.width >= 2560 && pixelStats.height >= 1440,
    detail: JSON.stringify(pixelStats ? { width: pixelStats.width, height: pixelStats.height } : null)
  },
  {
    id: "single-real-pbr-asset",
    pass: importedAsset.assetId === "damaged-helmet-hd-product-hero"
      && Number(importedAsset.vertexCount ?? 0) >= 14_000
      && Number(importedAsset.indexCount ?? 0) >= 46_000
      && Number(importedAsset.textureCount ?? 0) >= 5
      && Number(importedAsset.imageCount ?? 0) >= 5,
    detail: JSON.stringify(importedAsset)
  },
  {
    id: "real-hdr-ibl",
    pass: hdrPipeline.realRadianceHdr === true
      && hdrPipeline.environmentTextureEncoding === "rgba16f-linear"
      && Number(hdrPipeline.maxLinearValue ?? 0) > 1
      && hdrPipeline.specularPrefilter === true
      && hdrPipeline.brdfLut === true
      && Number(hdrPipeline.specularMipCount ?? 0) >= 4
      && String(importedAsset.environmentId ?? "") === "studio-small-08"
      && String(importedAsset.hdrEnvironmentUri ?? "").endsWith(".hdr"),
    detail: JSON.stringify({ hdrPipeline, importedAsset })
  },
  {
    id: "texture-draw-evidence",
    pass: Number(diagnostics.drawCalls ?? 0) >= 3
      && Number(diagnostics.textures ?? 0) >= 7
      && Number(diagnostics.textureBytes ?? 0) >= 80_000_000
      && diagnostics.lastError === null,
    detail: JSON.stringify(diagnostics)
  },
  {
    id: "visible-closeup-pixels",
    pass: pixelStats !== null
      && fileSize >= 384 * 1024
      && pixelStats.uniqueColorBuckets >= 300
      && pixelStats.foregroundCoverage >= 0.05
      && pixelStats.centerForegroundCoverage >= 0.08
      && pixelStats.detailEdgeDensity >= 0.013
      && pixelStats.localContrast >= 26,
    detail: JSON.stringify({ fileSize, pixelStats })
  },
  {
    id: "screenshot-path",
    pass: screenshot === expectedScreenshot && existsSync(resolve(expectedScreenshot)),
    detail: screenshot || "(missing)"
  }
];

const readiness = {
  schema: "g3d-production-runtime-hd-product-hero-readiness/v1",
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
