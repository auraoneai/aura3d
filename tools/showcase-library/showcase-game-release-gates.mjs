import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { validateRetainedGeometryFiles } from "./showcase-game-release-retained-files.mjs";
import { validateGameVisualQa } from "./game-visual-qa.mjs";

const publicGameCategories = new Set(["racing", "platformer"]);
const publicGameGeometrySources = new Set([
  "asset-mesh-extracted",
  "manifest-authored-overlay-validated",
  "compiler-authored-overlay-validated"
]);

const expectedGeometryKinds = {
  racing: "racing-track-topology",
  platformer: "platformer-playable-surface-map"
};

export function validateReleaseGameAssetPairEvidence(input) {
  const status = input.route.gameTemplateStatus;
  if (!status || !publicGameCategories.has(status.category)) return [];

  const failures = [];
  if (status.publicTemplateReady !== true) {
    failures.push(`release-game-template-ready:${String(status.publicTemplateReady)}`);
  }
  if (!Array.isArray(status.evidence) || status.evidence.length === 0) {
    failures.push("release-game-template-evidence-missing");
  }

  const evidence = input.routeHealth.gameAssetPairEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    failures.push(`release-game-asset-pair-evidence-missing:${status.category}`);
    return failures;
  }

  if (evidence.category !== status.category) {
    failures.push(`release-game-asset-pair-category:${String(evidence.category)}`);
  }
  if (evidence.verdict !== "pass") {
    failures.push(`release-game-asset-pair-verdict:${String(evidence.verdict)}`);
  }

  const expectedScreenshot = `tests/reports/showcase-route-primary-probes/${input.route.id}.png`;
  if (evidence.screenshotEvidence !== expectedScreenshot) {
    failures.push(`release-game-asset-pair-screenshot-evidence:${String(evidence.screenshotEvidence)}`);
  }

  const evidenceAssets = Array.isArray(evidence.assets) ? evidence.assets.filter((asset) => typeof asset === "string") : [];
  const expectedAssets = new Set(input.route.primaryAssets);
  const actualAssets = new Set(evidenceAssets);
  const missingAssets = input.route.primaryAssets.filter((asset) => !actualAssets.has(asset));
  const extraAssets = evidenceAssets.filter((asset) => !expectedAssets.has(asset));
  if (missingAssets.length > 0) {
    failures.push(`release-game-asset-pair-missing-assets:${missingAssets.join(",")}`);
  }
  if (extraAssets.length > 0) {
    failures.push(`release-game-asset-pair-extra-assets:${extraAssets.join(",")}`);
  }

  const blockers = Array.isArray(evidence.blockers)
    ? evidence.blockers.filter((blocker) => typeof blocker === "string" && blocker.length > 0)
    : [];
  if (blockers.length > 0) {
    failures.push(`release-game-asset-pair-blockers:${blockers.join(",")}`);
  }

  failures.push(...validateCompositionReport({
    root: input.root,
    routeId: input.route.id,
    category: status.category,
    expectedScreenshot,
    primaryAssets: input.route.primaryAssets,
    evidence
  }));

  const routeHealthBlockers = Array.isArray(input.routeHealth.blockers)
    ? input.routeHealth.blockers.filter((blocker) => typeof blocker === "string")
    : [];
  const retainedAssetPairBlockers = routeHealthBlockers.filter((blocker) =>
    blocker.startsWith(`evidence:${status.category}-asset-pair:`)
  );
  if (retainedAssetPairBlockers.length > 0) {
    failures.push(`release-game-asset-pair-route-health-blockers:${retainedAssetPairBlockers.join(",")}`);
  }

  const visualQa = validateGameVisualQa({ route: input.route, routeHealth: input.routeHealth, root: input.root });
  if (!visualQa.pass) failures.push(...visualQa.blockers.map((blocker) => `release-game-visual-qa:${blocker}`));

  failures.push(...validatePublicGameGeometryEvidence({
    category: status.category,
    routeId: input.route.id,
    expectedScreenshot,
    primaryAssets: input.route.primaryAssets,
    geometryEvidence: evidence.geometryEvidence,
    root: input.root
  }));

  return failures;
}

function validateCompositionReport(input) {
  const failures = [];
  const path = input.evidence.compositionReport;
  if (typeof path !== "string" || !path.endsWith("-asset-pair-composition.json")) {
    return [`release-game-composition-report:${String(path)}`];
  }
  if (typeof input.root !== "string" || !input.root.trim()) return ["release-game-composition-root-required"];
  const report = readRepoJson(input.root, path, "release-game-composition-report", failures);
  if (!report) return failures;
  if (report.schema !== "aura3d-showcase-asset-pair-composition/1.0") failures.push(`release-game-composition-schema:${String(report.schema)}`);
  if (report.routeId !== input.routeId) failures.push(`release-game-composition-route:${String(report.routeId)}`);
  if (report.category !== input.category) failures.push(`release-game-composition-category:${String(report.category)}`);
  if (report.verdict !== "pass" || report.pass !== true) failures.push(`release-game-composition-verdict:${String(report.verdict)}`);
  const blockers = Array.isArray(report.blockers) ? report.blockers.filter((value) => typeof value === "string") : [];
  if (blockers.length > 0) failures.push(`release-game-composition-blockers:${blockers.join(",")}`);

  const screenshot = report.screenshot && typeof report.screenshot === "object" && !Array.isArray(report.screenshot) ? report.screenshot : undefined;
  if (screenshot?.path !== input.expectedScreenshot) failures.push(`release-game-composition-screenshot:${String(screenshot?.path)}`);
  const screenshotHash = readRepoSha256(input.root, input.expectedScreenshot, "release-game-composition-screenshot", failures);
  if (screenshotHash && screenshot?.sha256 !== screenshotHash) failures.push(`release-game-composition-screenshot-hash-mismatch:${input.expectedScreenshot}`);

  const manifest = readRepoJson(input.root, "aura.assets.json", "release-game-composition-manifest", failures);
  const manifestAssets = new Map(Array.isArray(manifest?.assets)
    ? manifest.assets.filter((asset) => asset && typeof asset === "object" && !Array.isArray(asset) && typeof asset.id === "string").map((asset) => [asset.id, asset.hash])
    : []);
  const reportAssets = Array.isArray(report.assets) ? report.assets : [];
  for (const assetId of input.primaryAssets) {
    const asset = reportAssets.find((value) => value && typeof value === "object" && !Array.isArray(value) && value.id === assetId);
    if (!asset) {
      failures.push(`release-game-composition-asset-missing:${assetId}`);
      continue;
    }
    const currentHash = manifestAssets.get(assetId);
    if (asset.manifestHash !== currentHash || asset.evidenceHash !== currentHash) failures.push(`release-game-composition-asset-hash-mismatch:${assetId}`);
  }
  const requiredChecks = ["binding-overlap", "contact", "camera-readability", "scale-contract", "debug-guide-absence"];
  const checks = Array.isArray(report.checks) ? report.checks : [];
  for (const id of requiredChecks) {
    const check = checks.find((value) => value && typeof value === "object" && !Array.isArray(value) && value.id === id);
    if (!check) failures.push(`release-game-composition-check-missing:${id}`);
    else if (check.verdict !== "pass") failures.push(`release-game-composition-check-fail:${id}`);
  }
  return failures;
}

function readRepoJson(root, path, label, failures) {
  const absolute = resolveRepoEvidencePath(root, path, label, failures);
  if (!absolute) return undefined;
  if (!existsSync(absolute)) { failures.push(`${label}-missing:${path}`); return undefined; }
  try { return JSON.parse(readFileSync(absolute, "utf8")); }
  catch { failures.push(`${label}-invalid-json:${path}`); return undefined; }
}
function readRepoSha256(root, path, label, failures) {
  const absolute = resolveRepoEvidencePath(root, path, label, failures);
  if (!absolute) return undefined;
  if (!existsSync(absolute)) { failures.push(`${label}-missing:${path}`); return undefined; }
  return `sha256-${createHash("sha256").update(readFileSync(absolute)).digest("hex")}`;
}
function resolveRepoEvidencePath(root, path, label, failures) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\0")) { failures.push(`${label}-path:${String(path)}`); return undefined; }
  const absolute = resolve(root, path);
  const rel = relative(resolve(root), absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) { failures.push(`${label}-path:${path}`); return undefined; }
  return absolute;
}

function validatePublicGameGeometryEvidence(input) {
  const failures = [];
  const geometry = input.geometryEvidence;
  if (!geometry || typeof geometry !== "object" || Array.isArray(geometry)) {
    return [`release-game-geometry-evidence-missing:${input.category}`];
  }

  if (geometry.category !== input.category) {
    failures.push(`release-game-geometry-category:${String(geometry.category)}`);
  }

  const expectedKind = expectedGeometryKinds[input.category];
  if (geometry.kind !== expectedKind) {
    failures.push(`release-game-geometry-kind:${input.category}:${String(geometry.kind)}`);
  }

  if (!publicGameGeometrySources.has(geometry.source)) {
    failures.push(`release-game-geometry-source:${String(geometry.source)}`);
  }

  if (typeof geometry.report !== "string" || !geometry.report.startsWith("tests/reports/showcase-spec-compiler/") || !geometry.report.endsWith(".json")) {
    failures.push(`release-game-geometry-report:${String(geometry.report)}`);
  }

  if (geometry.screenshotEvidence !== input.expectedScreenshot) {
    failures.push(`release-game-geometry-screenshot-evidence:${String(geometry.screenshotEvidence)}`);
  }

  if (typeof geometry.routePrimaryScreenshotSha256 !== "string" || !/^sha256-[a-f0-9]{64}$/.test(geometry.routePrimaryScreenshotSha256)) {
    failures.push(`release-game-geometry-screenshot-sha256:${String(geometry.routePrimaryScreenshotSha256)}`);
  }

  const geometryAssets = Array.isArray(geometry.assets) ? geometry.assets : [];
  const assetIds = geometryAssets
    .map((asset) => asset && typeof asset === "object" && !Array.isArray(asset) ? asset.id : undefined)
    .filter((id) => typeof id === "string");
  const expectedAssets = new Set(input.primaryAssets);
  const actualAssets = new Set(assetIds);
  const missingAssets = input.primaryAssets.filter((asset) => !actualAssets.has(asset));
  const extraAssets = assetIds.filter((asset) => !expectedAssets.has(asset));
  if (missingAssets.length > 0) {
    failures.push(`release-game-geometry-missing-assets:${missingAssets.join(",")}`);
  }
  if (extraAssets.length > 0) {
    failures.push(`release-game-geometry-extra-assets:${extraAssets.join(",")}`);
  }

  for (const asset of geometryAssets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) continue;
    if (typeof asset.id !== "string" || !expectedAssets.has(asset.id)) continue;
    if (typeof asset.hash !== "string" || !/^sha256-[a-f0-9]{64}$/.test(asset.hash)) {
      failures.push(`release-game-geometry-asset-hash:${asset.id}:${String(asset.hash)}`);
    }
  }

  if (typeof input.root !== "string" || !input.root.trim()) {
    failures.push("release-game-geometry-root-required");
    return failures;
  }

  validateRetainedGeometryFiles({
    category: input.category,
    routeId: input.routeId,
    expectedScreenshot: input.expectedScreenshot,
    primaryAssets: input.primaryAssets,
    geometry,
    root: input.root,
    failures
  });

  return failures;
}
