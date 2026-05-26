import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Obj = Record<string, unknown>;

const gallery = json("tests/reports/production-runtime-gallery/manifest.json");
const entries = Array.isArray(gallery.entries) ? gallery.entries.map(obj) : [];
const external = json("tests/reports/production-runtime-external-consumer.json");
const performance = json("tests/reports/production-runtime-performance-readiness.json");
const three = json("tests/reports/production-runtime-threejs-parity-readiness.json");
const checks = [
  { id: "gallery-present", pass: entries.length >= 18, detail: `${entries.length} gallery entries` },
  { id: "real-renderer-backend", pass: entries.every((entry) => entry.rendererBackend === "webgl2"), detail: failing(entries, (entry) => entry.rendererBackend === "webgl2") },
  { id: "real-assets", pass: entries.every((entry) => Array.isArray(entry.realAssetIds) && entry.realAssetIds.length > 0), detail: failing(entries, (entry) => Array.isArray(entry.realAssetIds) && entry.realAssetIds.length > 0) },
  { id: "hdr-environments", pass: entries.every((entry) => typeof entry.realHdrEnvironmentId === "string" && entry.realHdrEnvironmentId.length > 0), detail: failing(entries, (entry) => typeof entry.realHdrEnvironmentId === "string" && entry.realHdrEnvironmentId.length > 0) },
  { id: "draw-calls", pass: entries.every((entry) => Number(entry.drawCalls ?? 0) > 0), detail: failing(entries, (entry) => Number(entry.drawCalls ?? 0) > 0) },
  { id: "textures", pass: entries.every((entry) => Number(entry.textureCount ?? 0) > 0 || Number(entry.textureMemory ?? 0) > 0), detail: failing(entries, (entry) => Number(entry.textureCount ?? 0) > 0 || Number(entry.textureMemory ?? 0) > 0) },
  { id: "pixels", pass: entries.every((entry) => passesProductionPixelGate(obj(entry.pixelStats))), detail: failing(entries, (entry) => passesProductionPixelGate(obj(entry.pixelStats))) },
  { id: "screenshots", pass: entries.every((entry) => typeof entry.screenshot === "string" && existsSync(resolve(String(entry.screenshot))) && statSync(resolve(String(entry.screenshot))).size >= 32_768), detail: failing(entries, (entry) => typeof entry.screenshot === "string" && existsSync(resolve(String(entry.screenshot))) && statSync(resolve(String(entry.screenshot))).size >= 32_768) },
  { id: "threejs-parity", pass: three.pass === true, detail: "tests/reports/production-runtime-threejs-parity-readiness.json" },
  { id: "external-consumer", pass: external.pass === true, detail: "tests/reports/production-runtime-external-consumer.json" },
  { id: "performance", pass: performance.pass === true, detail: "tests/reports/production-runtime-performance-readiness.json" }
];
const report = {
  schema: "a3d-production-runtime-production-renderer-readiness",
  generatedAt: new Date().toISOString(),
  pass: checks.every((check) => check.pass),
  galleryEntryCount: entries.length,
  checks
};
write("tests/reports/production-runtime-production-renderer-readiness.json", report);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));

function json(path: string): Obj {
  return existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), "utf8")) as Obj : {};
}

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}

function failing(values: readonly Obj[], predicate: (value: Obj) => boolean): string {
  return values.filter((value) => !predicate(value)).map((value) => String(value.id ?? value.screenshot ?? "unknown")).join(", ");
}

function passesProductionPixelGate(stats: Obj): boolean {
  const width = Number(stats.width ?? 0);
  const height = Number(stats.height ?? 0);
  const foregroundCoverage = Number(stats.foregroundCoverage ?? 0);
  const largestForegroundComponentCoverage = Number(stats.largestForegroundComponentCoverage ?? 0);
  const centerForegroundCoverage = Number(stats.centerForegroundCoverage ?? 0);
  const foregroundBoundsCoverage = Number(stats.foregroundBoundsCoverage ?? 0);
  const detailEdgeDensity = Number(stats.detailEdgeDensity ?? 0);
  const localContrast = Number(stats.localContrast ?? 0);
  const materialGrid =
    foregroundCoverage >= 0.16 &&
    centerForegroundCoverage >= 0.2 &&
    foregroundBoundsCoverage >= 0.2 &&
    detailEdgeDensity >= 0.01 &&
    localContrast >= 20;

  return (
    width >= 768 &&
    height >= 768 &&
    Number(stats.nonBlackPixels ?? 0) >= 10_000 &&
    Number(stats.uniqueColorBuckets ?? 0) >= 80 &&
    Number(stats.averageLuma ?? 0) >= 14 &&
    foregroundCoverage >= 0.025 &&
    centerForegroundCoverage >= 0.012 &&
    foregroundBoundsCoverage >= 0.035 &&
    detailEdgeDensity >= 0.0025 &&
    localContrast >= 8 &&
    (largestForegroundComponentCoverage >= 0.018 || materialGrid)
  );
}

function write(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
