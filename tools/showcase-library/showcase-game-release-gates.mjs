import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

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

function validateRetainedGeometryFiles(input) {
  const screenshotHash = readSha256(input.root, input.expectedScreenshot, "release-game-geometry-screenshot", input.failures);
  if (screenshotHash && input.geometry.routePrimaryScreenshotSha256 !== screenshotHash) {
    input.failures.push(`release-game-geometry-screenshot-hash-mismatch:${input.expectedScreenshot}`);
  }

  const manifestHashes = readManifestAssetHashes(input.root, input.failures);
  const geometryAssets = Array.isArray(input.geometry.assets) ? input.geometry.assets : [];
  for (const asset of geometryAssets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || typeof asset.id !== "string") continue;
    if (!input.primaryAssets.includes(asset.id)) continue;
    const manifestHash = manifestHashes.get(asset.id);
    if (!manifestHash) {
      input.failures.push(`release-game-geometry-manifest-asset-missing:${asset.id}`);
      continue;
    }
    if (asset.hash !== manifestHash) {
      input.failures.push(`release-game-geometry-asset-hash-mismatch:${asset.id}`);
    }
  }

  if (typeof input.geometry.report !== "string") return;
  const report = readJson(input.root, input.geometry.report, "release-game-geometry-report", input.failures);
  if (!report || typeof report !== "object" || Array.isArray(report)) return;

  if (report.routeId !== input.routeId) {
    input.failures.push(`release-game-geometry-report-route:${String(report.routeId)}`);
  }

  if (report.pass !== true) {
    input.failures.push(`release-game-geometry-report-pass:${String(report.pass)}`);
  }

  const reportFailures = Array.isArray(report.failures)
    ? report.failures.filter((failure) => typeof failure === "string" && failure.length > 0)
    : [];
  if (reportFailures.length > 0) {
    input.failures.push(`release-game-geometry-report-failures:${reportFailures.join(",")}`);
  }

  if (input.category === "racing") {
    validateRacingGeometryReport(input, report);
  } else if (input.category === "platformer") {
    validatePlatformerGeometryReport(input, report);
  }
}

function validateRacingGeometryReport(input, report) {
  if (report.schema !== "aura3d-racing-track-topology/1.0") {
    input.failures.push(`release-game-geometry-report-schema:${String(report.schema)}`);
  }
  const topology = report.topology;
  if (!topology || typeof topology !== "object" || Array.isArray(topology)) {
    input.failures.push("release-game-geometry-report-topology-missing");
    return;
  }
  if (topology.source !== input.geometry.source) {
    input.failures.push(`release-game-geometry-report-source:${String(topology.source)}`);
  }
  if (typeof topology.assetId === "string") {
    const geometryAsset = findGeometryAsset(input.geometry.assets, topology.assetId);
    if (!geometryAsset) {
      input.failures.push(`release-game-geometry-report-asset:${topology.assetId}`);
    } else if (geometryAsset.hash !== topology.assetHash) {
      input.failures.push(`release-game-geometry-report-asset-hash:${topology.assetId}`);
    }
  }
  const routeOverlay = topology.evidence && typeof topology.evidence === "object"
    ? topology.evidence.routeOverlay
    : undefined;
  if (routeOverlay !== input.expectedScreenshot) {
    input.failures.push(`release-game-geometry-report-overlay:${String(routeOverlay)}`);
  }
  const meshExtraction = report.meshExtraction;
  if (!meshExtraction || typeof meshExtraction !== "object" || Array.isArray(meshExtraction) || meshExtraction.status !== "pass") {
    input.failures.push(`release-game-geometry-report-mesh-extraction:${String(meshExtraction?.status)}`);
  }
}

function validatePlatformerGeometryReport(input, report) {
  if (report.schema !== "aura3d-platformer-playable-surfaces/1.0") {
    input.failures.push(`release-game-geometry-report-schema:${String(report.schema)}`);
  }
  const surfaceMap = report.surfaceMap;
  if (!surfaceMap || typeof surfaceMap !== "object" || Array.isArray(surfaceMap)) {
    input.failures.push("release-game-geometry-report-surface-map-missing");
    return;
  }
  if (surfaceMap.source !== input.geometry.source) {
    input.failures.push(`release-game-geometry-report-source:${String(surfaceMap.source)}`);
  }
  if (typeof surfaceMap.assetId === "string") {
    const geometryAsset = findGeometryAsset(input.geometry.assets, surfaceMap.assetId);
    if (!geometryAsset) {
      input.failures.push(`release-game-geometry-report-asset:${surfaceMap.assetId}`);
    } else if (geometryAsset.hash !== surfaceMap.assetHash) {
      input.failures.push(`release-game-geometry-report-asset-hash:${surfaceMap.assetId}`);
    }
  }
  const routeOverlay = surfaceMap.evidence && typeof surfaceMap.evidence === "object"
    ? surfaceMap.evidence.routeOverlay
    : undefined;
  if (routeOverlay !== input.expectedScreenshot) {
    input.failures.push(`release-game-geometry-report-overlay:${String(routeOverlay)}`);
  }
}

function findGeometryAsset(assets, id) {
  if (!Array.isArray(assets)) return undefined;
  return assets.find((asset) =>
    asset && typeof asset === "object" && !Array.isArray(asset) && asset.id === id
  );
}

function readManifestAssetHashes(root, failures) {
  const manifest = readJson(root, "aura.assets.json", "release-game-geometry-manifest", failures);
  const assets = manifest && typeof manifest === "object" && !Array.isArray(manifest) && Array.isArray(manifest.assets)
    ? manifest.assets
    : [];
  return new Map(assets
    .filter((asset) => asset && typeof asset === "object" && !Array.isArray(asset) && typeof asset.id === "string")
    .map((asset) => [asset.id, typeof asset.hash === "string" ? asset.hash : ""]));
}

function readSha256(root, path, label, failures) {
  const absolutePath = resolveRepoPath(root, path, label, failures);
  if (!absolutePath) return undefined;
  if (!existsSync(absolutePath)) {
    failures.push(`${label}-missing:${path}`);
    return undefined;
  }
  return `sha256-${createHash("sha256").update(readFileSync(absolutePath)).digest("hex")}`;
}

function readJson(root, path, label, failures) {
  const absolutePath = resolveRepoPath(root, path, label, failures);
  if (!absolutePath) return undefined;
  if (!existsSync(absolutePath)) {
    failures.push(`${label}-missing:${path}`);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    failures.push(`${label}-invalid-json:${path}`);
    return undefined;
  }
}

function resolveRepoPath(root, path, label, failures) {
  if (typeof path !== "string" || !path.trim() || path.includes("\0") || isAbsolute(path)) {
    failures.push(`${label}-path:${String(path)}`);
    return undefined;
  }
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    failures.push(`${label}-path:${path}`);
    return undefined;
  }
  return absolutePath;
}
