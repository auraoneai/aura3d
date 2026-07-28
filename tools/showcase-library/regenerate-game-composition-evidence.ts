import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateShowcaseAssetPairCompositionFromDisk } from "../../packages/create-aura3d/src/showcase-spec-asset-pair-composition.js";

interface RouteConfig {
  readonly routeId: string;
  readonly category: "racing" | "platformer";
  readonly reportDir: string;
  readonly geometrySuffix: string;
}

const routes: readonly RouteConfig[] = [
  {
    routeId: "showcase-turbo-drift-circuit",
    category: "racing",
    reportDir: "turbo-drift-circuit",
    geometrySuffix: "racing-track-topology"
  },
  {
    routeId: "showcase-skyline-runner",
    category: "platformer",
    reportDir: "skyline-runner",
    geometrySuffix: "platformer-playable-surfaces"
  }
];

const selected = new Set(process.argv.slice(2));
const root = resolve(process.cwd());
for (const route of routes.filter((entry) => selected.size === 0 || selected.has(entry.routeId))) {
  regenerate(route);
}

function regenerate(route: RouteConfig): void {
  const appDir = `apps/${route.routeId}`;
  const reportRoot = `tests/reports/showcase-spec-compiler/${route.reportDir}`;
  const compositionPath = `${reportRoot}/game-template/${route.routeId}-asset-pair-composition.json`;
  const geometryReport = `${reportRoot}/game-template/${route.routeId}-${route.geometrySuffix}.json`;
  const routePrimaryProbe = `tests/reports/showcase-route-primary-probes/${route.routeId}.json`;
  const gameplayProof = `tests/reports/showcase-gameplay/${route.routeId}.json`;
  for (const required of [geometryReport, routePrimaryProbe, gameplayProof]) {
    if (!existsSync(resolve(root, required))) throw new Error(`${route.routeId} is missing ${required}`);
  }

  const report = validateShowcaseAssetPairCompositionFromDisk({
    projectDir: root,
    routeId: route.routeId,
    category: route.category,
    routePrimaryProbe,
    gameplayProof,
    geometryReport,
    outputPath: compositionPath
  });
  if (!report.pass) {
    throw new Error(`${route.routeId} composition failed: ${report.blockers.join(", ")}`);
  }

  writeJson(`${appDir}/game-template/${route.routeId}-asset-pair-composition.json`, report);
  const screenshotHash = report.screenshot.sha256;
  const modulePath = `${appDir}/src/generated/game-geometry.ts`;
  const moduleSource = readFile(modulePath);
  const synchronizedModule = moduleSource
    .replace(/("routePrimaryScreenshotSha256":\s*")sha256-[a-f0-9]{64}(")/g, `$1${screenshotHash}$2`)
    .replace(/("screenshotSha256":\s*")sha256-[a-f0-9]{64}(")/g, `$1${screenshotHash}$2`);
  writeFileSync(resolve(root, modulePath), synchronizedModule);

  for (const relativePath of [
    `${appDir}/route-health.json`,
    `${appDir}/showcase-evidence-checklist.json`,
    `${reportRoot}/route-health.json`,
    `${reportRoot}/showcase-evidence-checklist.json`
  ]) {
    if (!existsSync(resolve(root, relativePath))) continue;
    const value = readJson(relativePath);
    synchronizeScreenshotHashes(value, screenshotHash);
    if (relativePath.endsWith("route-health.json")) {
      synchronizeRouteHealth(value, route, report, compositionPath, routePrimaryProbe, geometryReport);
    }
    writeJson(relativePath, value);
  }

  const moduleContentHash = hash(modulePath);
  const sourceReportHash = hash(geometryReport);
  for (const compileReport of [
    `${appDir}/showcase-spec-compile-report.json`,
    `${reportRoot}/showcase-spec-compile-report.json`
  ]) {
    if (!existsSync(resolve(root, compileReport))) continue;
    const value = readJson(compileReport);
    value.assetPairComposition = {
      report: compositionPath,
      verdict: report.verdict,
      checks: report.checks.map(({ id, verdict }) => ({ id, verdict }))
    };
    value.geometryContract = {
      module: "src/generated/game-geometry.ts",
      contentHash: moduleContentHash,
      sourceReport: geometryReport,
      sourceReportHash
    };
    writeJson(compileReport, value);
  }

  console.log(`${route.routeId}: ${report.verdict} ${screenshotHash}`);
}

function synchronizeRouteHealth(
  health: Record<string, unknown>,
  route: RouteConfig,
  report: ReturnType<typeof validateShowcaseAssetPairCompositionFromDisk>,
  compositionPath: string,
  routePrimaryProbe: string,
  geometryReport: string
): void {
  const selectedMode = report.checks.find((check) => check.id === "camera-readability")?.measured.selectedMode;
  health.gameAssetPairEvidence = {
    category: route.category,
    assets: report.assets.map((asset) => asset.id),
    screenshotEvidence: report.screenshot.path,
    routePrimaryProbe,
    screenshotSha256: report.screenshot.sha256,
    geometryEvidence: {
      category: route.category,
      kind: route.category === "racing" ? "racing-track-topology" : "platformer-playable-surface-map",
      source: report.geometry.source,
      report: geometryReport,
      screenshotEvidence: report.screenshot.path,
      routePrimaryScreenshotSha256: report.screenshot.sha256,
      assets: report.assets.map((asset) => ({ id: asset.id, hash: asset.manifestHash }))
    },
    compositionReport: compositionPath,
    verdict: report.verdict,
    notes: "Regenerated by the live asset-pair composition validator from current route-primary, gameplay, geometry, and manifest evidence.",
    blockers: report.blockers,
    ...(route.category === "racing" && (selectedMode === "chase" || selectedMode === "top-down")
      ? { cameraMode: selectedMode }
      : {}),
    checks: report.checks.map(({ id, verdict }) => ({ id, verdict }))
  };
}

function synchronizeScreenshotHashes(value: unknown, screenshotHash: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) synchronizeScreenshotHashes(entry, screenshotHash);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (key === "screenshotSha256" || key === "routePrimaryScreenshotSha256") {
      record[key] = screenshotHash;
    } else {
      synchronizeScreenshotHashes(entry, screenshotHash);
    }
  }
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFile(relativePath)) as Record<string, unknown>;
}

function readFile(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function writeJson(relativePath: string, value: unknown): void {
  writeFileSync(resolve(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function hash(relativePath: string): string {
  return `sha256-${createHash("sha256").update(readFileSync(resolve(root, relativePath))).digest("hex")}`;
}
