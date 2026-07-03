import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export function validateRetainedGeometryFiles(input) {
  const screenshotHash = readSha256(input.root, input.expectedScreenshot, "release-game-geometry-screenshot", input.failures);
  if (screenshotHash && input.geometry.routePrimaryScreenshotSha256 !== screenshotHash) {
    input.failures.push(`release-game-geometry-screenshot-hash-mismatch:${input.expectedScreenshot}`);
  }

  const manifestAssets = readManifestAssetRecords(input.root, input.failures);
  const geometryAssets = Array.isArray(input.geometry.assets) ? input.geometry.assets : [];
  for (const asset of geometryAssets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset) || typeof asset.id !== "string") continue;
    if (!input.primaryAssets.includes(asset.id)) continue;
    const manifestAsset = manifestAssets.get(asset.id);
    if (!manifestAsset) {
      input.failures.push(`release-game-geometry-manifest-asset-missing:${asset.id}`);
      continue;
    }
    if (asset.hash !== manifestAsset.hash) {
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
    validateRacingGeometryReport(input, report, manifestAssets);
  } else if (input.category === "platformer") {
    validatePlatformerGeometryReport(input, report, manifestAssets);
  }
}

function validateRacingGeometryReport(input, report, manifestAssets) {
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
  if (!meshExtraction || typeof meshExtraction !== "object" || Array.isArray(meshExtraction) || !isPassingGeometryExtractionStatus(meshExtraction.status)) {
    input.failures.push(`release-game-geometry-report-mesh-extraction:${String(meshExtraction?.status)}`);
  }
  if (typeof topology.assetId === "string") {
    validateManifestGameCertification(input, manifestAssets, topology.assetId, "racing-track");
  }
}

function validatePlatformerGeometryReport(input, report, manifestAssets) {
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
  if (typeof surfaceMap.assetId === "string") {
    validateManifestGameCertification(input, manifestAssets, surfaceMap.assetId, "platformer-world");
  }
}

function findGeometryAsset(assets, id) {
  if (!Array.isArray(assets)) return undefined;
  return assets.find((asset) =>
    asset && typeof asset === "object" && !Array.isArray(asset) && asset.id === id
  );
}

function isPassingGeometryExtractionStatus(status) {
  return status === "pass" || status === "overlay-validated";
}

function validateManifestGameCertification(input, manifestAssets, primaryGeometryAssetId, primaryKind) {
  for (const assetId of input.primaryAssets) {
    const manifestAsset = manifestAssets.get(assetId);
    const certification = manifestAsset?.certification;
    const expected = assetId === primaryGeometryAssetId ? primaryKind : secondaryCertificationKind(input.category);
    if (!isExpectedCertification(certification, expected)) {
      input.failures.push(`release-game-geometry-asset-certification:${assetId}:${String(certification ?? "missing")}`);
    }
    validateManifestGameEvidence(input, manifestAsset, assetId);
  }
}

function secondaryCertificationKind(category) {
  return category === "racing" ? "racing-vehicle" : "platformer-character";
}

function isExpectedCertification(certification, expected) {
  if (expected === "racing-track") return certification === "certified-racing-track" || certification === "certified-generated-game-world";
  if (expected === "platformer-world") return certification === "certified-platformer-world" || certification === "certified-generated-game-world";
  if (expected === "racing-vehicle") return certification === "certified-racing-vehicle";
  if (expected === "platformer-character") return certification === "certified-platformer-character";
  return false;
}

function validateManifestGameEvidence(input, manifestAsset, assetId) {
  const evidence = manifestAsset?.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    input.failures.push(`release-game-geometry-asset-evidence-missing:${assetId}`);
    return;
  }
  if (evidence.routePrimaryScreenshot !== input.expectedScreenshot) {
    input.failures.push(`release-game-geometry-asset-evidence-screenshot:${assetId}:${String(evidence.routePrimaryScreenshot)}`);
  }
  if (typeof input.geometry.report === "string" && evidence.geometryReport !== input.geometry.report) {
    input.failures.push(`release-game-geometry-asset-evidence-report:${assetId}:${String(evidence.geometryReport)}`);
  }
  if (evidence.routePrimaryScreenshotSha256 !== input.geometry.routePrimaryScreenshotSha256) {
    input.failures.push(`release-game-geometry-asset-evidence-screenshot-sha:${assetId}:${String(evidence.routePrimaryScreenshotSha256)}`);
  }
  if (typeof evidence.manifestHash !== "string" || !/^sha256-[a-f0-9]{64}$/.test(evidence.manifestHash)) {
    input.failures.push(`release-game-geometry-asset-evidence-manifest-hash:${assetId}:${String(evidence.manifestHash)}`);
  } else if (evidence.manifestHash !== manifestAsset.hash) {
    input.failures.push(`release-game-geometry-asset-evidence-manifest-hash-mismatch:${assetId}`);
  }
  if (evidence.visualReview !== "pass") {
    input.failures.push(`release-game-geometry-asset-evidence-visual:${assetId}:${String(evidence.visualReview)}`);
  }
  if (evidence.assetPairPass !== true) {
    input.failures.push(`release-game-geometry-asset-evidence-asset-pair:${assetId}:${String(evidence.assetPairPass)}`);
  }
  const blockers = Array.isArray(evidence.blockers)
    ? evidence.blockers.filter((blocker) => typeof blocker === "string" && blocker.length > 0)
    : [];
  if (blockers.length > 0) {
    input.failures.push(`release-game-geometry-asset-evidence-blockers:${assetId}:${blockers.join(",")}`);
  }
}

function readManifestAssetRecords(root, failures) {
  const manifest = readJson(root, "aura.assets.json", "release-game-geometry-manifest", failures);
  const assets = manifest && typeof manifest === "object" && !Array.isArray(manifest) && Array.isArray(manifest.assets)
    ? manifest.assets
    : [];
  return new Map(assets
    .filter((asset) => asset && typeof asset === "object" && !Array.isArray(asset) && typeof asset.id === "string")
    .map((asset) => {
      const gameGeometry = asset.gameGeometry && typeof asset.gameGeometry === "object" && !Array.isArray(asset.gameGeometry)
        ? asset.gameGeometry
        : undefined;
      return [asset.id, {
        hash: typeof asset.hash === "string" ? asset.hash : "",
        certification: typeof gameGeometry?.certification === "string" ? gameGeometry.certification : undefined,
        evidence: gameGeometry?.evidence && typeof gameGeometry.evidence === "object" && !Array.isArray(gameGeometry.evidence)
          ? gameGeometry.evidence
          : undefined
      }];
    }));
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
