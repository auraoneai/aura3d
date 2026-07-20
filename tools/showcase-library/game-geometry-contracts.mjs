import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const GAME_GEOMETRY_CONTRACT_SCHEMA = "aura3d-game-geometry-contract/1.0";

export function geometryCompileReportPath(routeId) {
  return `tests/reports/showcase-spec-compiler/${routeId.replace(/^showcase-/, "")}/showcase-spec-compile-report.json`;
}

export function validateGameGeometryContract(route, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.compileReportPath ?? geometryCompileReportPath(route.id);
  const failures = [];
  const report = readJson(root, reportPath, failures, "compile-report");
  if (!report) return result(reportPath, failures);
  const contract = record(report.geometryContract);
  if (!contract) return result(reportPath, [...failures, "geometry-contract-record-missing"]);
  const moduleRelative = string(contract.module);
  const sourceReport = string(contract.sourceReport);
  if (!moduleRelative) failures.push("geometry-contract-module-path-missing");
  if (!sourceReport) failures.push("geometry-contract-source-report-missing");
  const modulePath = moduleRelative ? `apps/${route.id}/${moduleRelative}` : undefined;
  const sourcePath = sourceReport;
  const moduleText = modulePath ? readText(root, modulePath, failures, "module") : undefined;
  const sourceBytes = sourcePath ? readText(root, sourcePath, failures, "source-report") : undefined;
  const mainPath = `apps/${route.id}/src/main.ts`;
  const mainText = readText(root, mainPath, failures, "route-source");
  if (moduleText !== undefined) {
    checkHash(moduleText, contract.contentHash, failures, "module-content-hash");
    if (!moduleText.includes(`schema: "${GAME_GEOMETRY_CONTRACT_SCHEMA}"`) &&
        !moduleText.includes(`"schema": "${GAME_GEOMETRY_CONTRACT_SCHEMA}"`)) failures.push("geometry-contract-schema");
    const hasRouteId = moduleText.includes(`routeId: "${route.id}"`) ||
      moduleText.includes(`"routeId": "${route.id}"`) ||
      (moduleText.includes(`const routeId = "${route.id}"`) && /export const gameGeometryContract[\s\S]*\brouteId(?:\s*[,}])/.test(moduleText));
    if (!hasRouteId) failures.push("geometry-contract-route-id");
    if (!/category["']?\s*:\s*["'](?:racing|platformer)["']/.test(moduleText)) failures.push("geometry-contract-category");
    if (!/cameraBounds["']?\s*:/.test(moduleText) &&
        !(/const cameraBounds\s*=/.test(moduleText) && /export const gameGeometryContract[\s\S]*\bcameraBounds(?:\s*[,}])/.test(moduleText))) failures.push("geometry-contract-camera-bounds");
    if (!/(?:evidence|sourceReport)["']?\s*:/.test(moduleText)) failures.push("geometry-contract-evidence");
    const racing = /category["']?\s*:\s*["']racing["']/.test(moduleText);
    if (racing) validateRacingSpeedModel(moduleText, failures);
  }
  if (sourceBytes !== undefined) checkHash(sourceBytes, contract.sourceReportHash, failures, "source-report-hash");
  if (mainText !== undefined) {
    if (!/import\s*\{\s*gameGeometryContract\s*\}\s*from\s*["']\.\/generated\/game-geometry["']/.test(mainText)) failures.push("route-source-contract-import");
    if (/const\s+(?:roadCenterline|trackTopology|playableSurfaces|playableSurfaceMap)\s*=\s*(?:\[|\{)/.test(mainText)) failures.push("route-source-inline-geometry");
    if (/sha256-[a-f0-9]{64}/.test(mainText)) failures.push("route-source-inline-sha256");
  }
  return result(reportPath, failures, { modulePath, sourceReport: sourcePath, contentHash: contract.contentHash, sourceReportHash: contract.sourceReportHash });
}

function validateRacingSpeedModel(moduleText, failures) {
  if (!/speedModel["']?\s*:/.test(moduleText) && !(/const speedModel\s*=/.test(moduleText) && /gameGeometryContract[\s\S]*\bspeedModel(?:\s*[,}])/.test(moduleText))) {
    failures.push("geometry-contract-racing-speed-model");
    return;
  }
  for (const field of ["routeLength", "authoredLapSeconds", "gameUnitsPerSecond", "sceneUnitsPerGameUnit", "sceneUnitsPerSecond"]) {
    if (!new RegExp(`${field}["']?\\s*:`).test(moduleText)) failures.push(`geometry-contract-racing-speed-${field}`);
  }
  if (!/route-length-over-authored-lap-seconds/.test(moduleText)) failures.push("geometry-contract-racing-speed-kind");
}

function checkHash(text, expected, failures, id) {
  const actual = `sha256-${createHash("sha256").update(text).digest("hex")}`;
  if (expected !== actual) failures.push(`${id}:${String(expected)}:${actual}`);
}
function readJson(root, path, failures, label) {
  const text = readText(root, path, failures, label); if (text === undefined) return undefined;
  try { return JSON.parse(text); } catch { failures.push(`${label}-invalid-json:${path}`); return undefined; }
}
function readText(root, path, failures, label) {
  if (!safePath(root, path)) { failures.push(`${label}-unsafe-path:${String(path)}`); return undefined; }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) { failures.push(`${label}-missing:${path}`); return undefined; }
  return readFileSync(absolute, "utf8");
}
function safePath(root, path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\0")) return false;
  const rel = relative(root, resolve(root, path)); return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; }
function string(value) { return typeof value === "string" && value ? value : undefined; }
function result(reportPath, failures, extra = {}) { return { ok: failures.length === 0, reportPath, failures, ...extra }; }
