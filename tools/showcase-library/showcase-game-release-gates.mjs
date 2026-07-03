import { validateRetainedGeometryFiles } from "./showcase-game-release-retained-files.mjs";

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

  const routeHealthBlockers = Array.isArray(input.routeHealth.blockers)
    ? input.routeHealth.blockers.filter((blocker) => typeof blocker === "string")
    : [];
  const retainedAssetPairBlockers = routeHealthBlockers.filter((blocker) =>
    blocker.startsWith(`evidence:${status.category}-asset-pair:`)
  );
  if (retainedAssetPairBlockers.length > 0) {
    failures.push(`release-game-asset-pair-route-health-blockers:${retainedAssetPairBlockers.join(",")}`);
  }

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
