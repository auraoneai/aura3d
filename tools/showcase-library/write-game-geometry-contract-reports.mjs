#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import "./write-established-racing-speed-contracts.mjs";

const root = resolve(process.cwd());
const routes = [
  ["showcase-racing-game-layer-proof", "racing-game-layer-proof", "racing-track-topology"],
  ["showcase-platformer-game-layer-proof", "platformer-game-layer-proof", "platformer-playable-surfaces"]
];
for (const [routeId, reportDir, suffix] of routes) {
  const module = `apps/${routeId}/src/generated/game-geometry.ts`;
  const sourceReport = `tests/reports/showcase-spec-compiler/${reportDir}/game-template/${routeId}-${suffix}.json`;
  for (const path of [module, sourceReport]) if (!existsSync(resolve(root, path))) throw new Error(`Missing geometry input: ${path}`);
  synchronizeRetainedScreenshotHash(module);
  synchronizeRouteHealthComposition(routeId, reportDir);
  const reportPath = `tests/reports/showcase-spec-compiler/${reportDir}/showcase-spec-compile-report.json`;
  const report = {
    schema: "aura3d-showcase-spec-compile-report/1.0",
    routeId,
    generatedFiles: ["src/generated/game-geometry.ts"],
    geometryContract: {
      module: "src/generated/game-geometry.ts",
      contentHash: hash(module),
      sourceReport,
      sourceReportHash: hash(sourceReport)
    }
  };
  mkdirSync(dirname(resolve(root, reportPath)), { recursive: true });
  writeFileSync(resolve(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${routeId}: ${report.geometryContract.contentHash}`);
}
function synchronizeRouteHealthComposition(routeId, reportDir) {
  const compositionPath = `tests/reports/showcase-spec-compiler/${reportDir}/game-template/${routeId}-asset-pair-composition.json`;
  if (!existsSync(resolve(root, compositionPath))) return;
  const composition = JSON.parse(readFileSync(resolve(root, compositionPath), "utf8"));
  const category = routeId.includes("racing") ? "racing" : "platformer";
  const requiredChecks = ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"];
  const checks = Array.isArray(composition.checks) ? composition.checks : [];
  const screenshotPath = composition?.screenshot?.path;
  const screenshotSha256 = typeof screenshotPath === "string" && existsSync(resolve(root, screenshotPath)) ? hash(screenshotPath) : undefined;
  const blockers = [];
  if (composition.schema !== "aura3d-showcase-asset-pair-composition/1.0") blockers.push("composition-schema");
  if (composition.routeId !== routeId) blockers.push("composition-route");
  if (composition.category !== category) blockers.push("composition-category");
  if (composition.verdict !== "pass" || composition.pass !== true) blockers.push("composition-verdict");
  if (!screenshotSha256 || composition?.screenshot?.sha256 !== screenshotSha256) blockers.push("composition-screenshot-hash");
  for (const id of requiredChecks) if (!checks.some((check) => check?.id === id && check.verdict === "pass")) blockers.push(`composition-check:${id}`);
  const assets = Array.isArray(composition.assets)
    ? composition.assets.filter((asset) => typeof asset?.id === "string" && /^sha256-[a-f0-9]{64}$/.test(asset.manifestHash))
    : [];
  if (assets.length < 2) blockers.push("composition-assets");
  if (blockers.length) throw new Error(`Cannot synchronize ${routeId} route health: ${blockers.join(",")}`);
  const routeHealthPath = `apps/${routeId}/route-health.json`;
  const health = JSON.parse(readFileSync(resolve(root, routeHealthPath), "utf8"));
  const cameraCheck = checks.find((check) => check?.id === "camera-readability");
  const selectedMode = cameraCheck?.measured?.selectedMode
    ?? (cameraCheck?.measured?.cameraMode === "follow" ? "chase" : cameraCheck?.measured?.cameraMode);
  health.gameAssetPairEvidence = {
    category,
    assets: assets.map((asset) => asset.id),
    screenshotEvidence: screenshotPath,
    verdict: "pass",
    notes: "Derived from the retained asset-pair composition validator report; manual review cannot upgrade a validator failure.",
    blockers: [],
    geometryEvidence: {
      category,
      kind: category === "racing" ? "racing-track-topology" : "platformer-playable-surface-map",
      source: composition.geometry.source,
      report: composition.geometry.report,
      screenshotEvidence: screenshotPath,
      routePrimaryScreenshotSha256: screenshotSha256,
      assets: assets.map((asset) => ({ id: asset.id, hash: asset.manifestHash }))
    },
    routePrimaryProbe: `tests/reports/showcase-route-primary-probes/${routeId}.json`,
    screenshotSha256,
    compositionReport: compositionPath,
    ...(category === "racing" && (selectedMode === "chase" || selectedMode === "top-down") ? { cameraMode: selectedMode } : {}),
    checks: checks.map((check) => ({ id: check.id, verdict: check.verdict }))
  };
  writeFileSync(resolve(root, routeHealthPath), `${JSON.stringify(health, null, 2)}\n`);
}

function synchronizeRetainedScreenshotHash(modulePath) {
  const absoluteModule = resolve(root, modulePath);
  const source = readFileSync(absoluteModule, "utf8");
  const pathMatch = source.match(/const screenshotPath = "([^"]+)";/);
  const hashMatch = source.match(/const screenshotSha256 = "sha256-[a-f0-9]{64}";/);
  if (!pathMatch || !hashMatch) throw new Error(`Missing retained screenshot contract in ${modulePath}`);
  const screenshotPath = pathMatch[1];
  if (!screenshotPath || !existsSync(resolve(root, screenshotPath))) throw new Error(`Missing retained screenshot: ${String(screenshotPath)}`);
  const screenshotHash = hash(screenshotPath);
  const next = source.replace(hashMatch[0], `const screenshotSha256 = "${screenshotHash}";`);
  if (next !== source) writeFileSync(absoluteModule, next);
}
function hash(path) { return `sha256-${createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")}`; }
