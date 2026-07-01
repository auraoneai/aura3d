// allow: SIZE_OK - single route-primary evidence validator; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  defaultRepoRoot,
  showcaseRouteGateHash
} from "./route-gates.mjs";
import { readPngForegroundMetrics } from "./png-foreground.mjs";

export const routePrimaryProbeSchema = "aura3d-route-primary-probe/1.0";
export const routePrimaryProbeReportDirRelativePath = "tests/reports/showcase-route-primary-probes";
export const routePrimaryProbeThresholds = Object.freeze({
  minNonBlankPixels: 2500,
  minColorBuckets: 8,
  minForegroundWidth: 96,
  minForegroundHeight: 72,
  minReadabilityScore: 35
});

export function routePrimaryProbeEvidencePath(routeId, root = defaultRepoRoot) {
  return resolve(root, routePrimaryProbeReportDirRelativePath, `${safeRouteId(routeId)}.json`);
}

export function routePrimaryProbeScreenshotPath(routeId, root = defaultRepoRoot) {
  return resolve(root, routePrimaryProbeReportDirRelativePath, `${safeRouteId(routeId)}.png`);
}

export function routePrimaryProbeRelativeEvidencePath(routeId) {
  return `${routePrimaryProbeReportDirRelativePath}/${safeRouteId(routeId)}.json`;
}

export function routePrimaryProbeRelativeScreenshotPath(routeId) {
  return `${routePrimaryProbeReportDirRelativePath}/${safeRouteId(routeId)}.png`;
}

export function createRoutePrimaryProbeContext(route, root = defaultRepoRoot) {
  const routeHealthPath = getRouteHealthPath(route, root);
  const heroAssetId = routePrimaryHeroAsset(route);
  const secondaryAssets = secondaryPrimaryAssets(route, heroAssetId);
  return {
    schema: routePrimaryProbeSchema,
    routeId: route.id,
    routePath: route.path,
    appId: route.id,
    sourceHash: createRouteSourceHash(route.id, root),
    routeGateHash: showcaseRouteGateHash(root),
    routeHealthHash: routeHealthPath && existsSync(routeHealthPath) ? `sha256-${hashFile(routeHealthPath)}` : undefined,
    routePrimaryHeroAsset: heroAssetId,
    secondaryPrimaryAssets: secondaryAssets,
    primaryAssets: route.primaryAssets.map((assetId) => ({
      id: assetId,
      role: primaryAssetRole(route, assetId),
      expectedTypedRef: `assets.${assetId}`,
      manifestHash: readManifestAssetHash(assetId, root),
      routePrimaryEvidenceTarget: assetId === heroAssetId,
      evidenceMode: assetId === heroAssetId ? "route-primary-foreground" : "secondary-present"
    }))
  };
}

export function validateRoutePrimaryProbeEvidence(route, options = {}) {
  const root = resolve(options.root ?? defaultRepoRoot);
  if (!routeRequiresPrimaryProbe(route)) {
    return {
      ok: true,
      required: false,
      path: null,
      screenshotPath: null,
      failures: [],
      evidence: null
    };
  }

  const path = resolve(root, options.evidencePath ?? routePrimaryProbeRelativeEvidencePath(route.id));
  if (!existsSync(path)) {
    return {
      ok: false,
      required: true,
      path: relative(root, path),
      screenshotPath: relative(root, routePrimaryProbeScreenshotPath(route.id, root)),
      failures: [`missing-route-primary-probe:${relative(root, path)}`],
      evidence: null
    };
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      ok: false,
      required: true,
      path: relative(root, path),
      screenshotPath: relative(root, routePrimaryProbeScreenshotPath(route.id, root)),
      failures: [`invalid-route-primary-probe-json:${error instanceof Error ? error.message : String(error)}`],
      evidence: null
    };
  }

  return validateRoutePrimaryProbeEvidenceRecord(route, evidence, {
    root,
    path,
    requireScreenshot: options.requireScreenshot ?? true
  });
}

export function validateRoutePrimaryProbeEvidenceRecord(route, evidence, options = {}) {
  const root = resolve(options.root ?? defaultRepoRoot);
  const context = createRoutePrimaryProbeContext(route, root);
  const failures = [];
  const path = options.path ? relative(root, options.path) : routePrimaryProbeRelativeEvidencePath(route.id);

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      ok: false,
      required: routeRequiresPrimaryProbe(route),
      path,
      screenshotPath: routePrimaryProbeRelativeScreenshotPath(route.id),
      failures: ["route-primary-probe-evidence-not-object"],
      evidence: evidence ?? null
    };
  }

  if (evidence.schema !== routePrimaryProbeSchema) failures.push(`schema:${String(evidence.schema)}`);
  if (evidence.routeId !== route.id) failures.push(`route-id:${String(evidence.routeId)}`);
  if (evidence.routePath !== route.path) failures.push(`route-path:${String(evidence.routePath)}`);
  if (evidence.appId !== route.id) failures.push(`app-id:${String(evidence.appId)}`);
  if (evidence.sourceHash !== context.sourceHash) failures.push(`source-hash:${String(evidence.sourceHash)}`);
  if (evidence.routeGateHash !== context.routeGateHash) failures.push(`route-gate-hash:${String(evidence.routeGateHash)}`);
  if (evidence.routePrimaryHeroAsset !== context.routePrimaryHeroAsset) {
    failures.push(`route-primary-hero-asset:${String(evidence.routePrimaryHeroAsset)}`);
  }
  if (!Array.isArray(evidence.secondaryPrimaryAssets) ||
      evidence.secondaryPrimaryAssets.join(",") !== context.secondaryPrimaryAssets.join(",")) {
    failures.push(`secondary-primary-assets:${Array.isArray(evidence.secondaryPrimaryAssets) ? evidence.secondaryPrimaryAssets.join(",") : String(evidence.secondaryPrimaryAssets)}`);
  }
  if (context.routeHealthHash && evidence.routeHealthHash !== context.routeHealthHash) {
    failures.push(`route-health-hash:${String(evidence.routeHealthHash)}`);
  }
  if (!isValidTimestamp(evidence.generatedAt)) failures.push(`generated-at:${String(evidence.generatedAt)}`);
  if (!isPositiveInteger(evidence.viewport?.width) || !isPositiveInteger(evidence.viewport?.height)) {
    failures.push("viewport");
  }

  failures.push(...validateRendererEvidence(evidence.renderer));

  const primitiveCandidates = Array.isArray(evidence.primitivePrimaryCandidates)
    ? evidence.primitivePrimaryCandidates.filter((value) => typeof value === "string" && value.trim())
    : [];
  if (!Array.isArray(evidence.primitivePrimaryCandidates)) failures.push("primitive-primary-candidates-not-array");
  if (primitiveCandidates.length > 0) {
    failures.push(`primitive-primary-candidates:${primitiveCandidates.join(",")}`);
  }

  if (evidence.pass !== true) failures.push(`route-primary-probe-pass:${String(evidence.pass)}`);
  if (Array.isArray(evidence.failures) && evidence.failures.length > 0) {
    failures.push(...evidence.failures.map((failure) => `route-primary-probe-failure:${String(failure)}`));
  } else if (!Array.isArray(evidence.failures)) {
    failures.push("route-primary-probe-failures-not-array");
  }

  const screenshotValidation = options.requireScreenshot !== false
    ? validateScreenshotFiles(root, route, evidence)
    : { failures: [], metrics: undefined };
  failures.push(...screenshotValidation.failures);
  if (context.primaryAssets.length === 0 && routeRequiresPrimaryProbe(route)) {
    failures.push(...validateRenderedProbe(route, { renderedProbe: evidence.renderedProbe }, "route", screenshotValidation.metrics));
  }
  failures.push(...validatePrimaryAssetEvidence(route, evidence, context, screenshotValidation.metrics));

  return {
    ok: failures.length === 0,
    required: routeRequiresPrimaryProbe(route),
    path,
    screenshotPath: routePrimaryProbeRelativeScreenshotPath(route.id),
    failures,
    evidence
  };
}

export function createRouteSourceHash(routeId, root = defaultRepoRoot) {
  const appDir = resolve(root, "apps", routeId);
  const hash = createHash("sha256");
  if (!existsSync(appDir)) return "sha256-missing";
  for (const file of readSourceFiles(appDir, root)) {
    const relativePath = relative(root, file).replace(/\\/g, "/");
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

export function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validatePrimaryAssetEvidence(route, evidence, context, screenshotMetrics) {
  const failures = [];
  if (!Array.isArray(evidence.primaryAssets)) {
    return ["primary-assets-not-array"];
  }

  const expectedIds = context.primaryAssets.map((asset) => asset.id);
  const actualIds = evidence.primaryAssets.map((asset) => asset?.id).filter(Boolean);
  if (actualIds.join(",") !== expectedIds.join(",")) {
    failures.push(`primary-assets:${actualIds.join(",")}`);
  }

  for (const expected of context.primaryAssets) {
    const actual = evidence.primaryAssets.find((asset) => asset?.id === expected.id);
    if (!actual) {
      failures.push(`missing-primary-asset:${expected.id}`);
      continue;
    }
    if (actual.role !== expected.role) failures.push(`primary-asset-role:${expected.id}:${String(actual.role)}`);
    if (actual.expectedTypedRef !== expected.expectedTypedRef) {
      failures.push(`primary-asset-typed-ref:${expected.id}:${String(actual.expectedTypedRef)}`);
    }
    if (expected.manifestHash && actual.manifestHash !== expected.manifestHash) {
      failures.push(`primary-asset-manifest-hash:${expected.id}:${String(actual.manifestHash)}`);
    }
    if (expected.routePrimaryEvidenceTarget) {
      failures.push(...validateRenderedProbe(route, actual, expected.id, screenshotMetrics));
    } else {
      failures.push(...validateSecondaryPrimaryAssetEvidence(actual, expected.id));
    }
  }

  return failures;
}

function validateSecondaryPrimaryAssetEvidence(asset, assetId) {
  const failures = [];
  if (asset.routePrimaryEvidenceTarget !== false) {
    failures.push(`secondary-primary-evidence-target:${assetId}:${String(asset.routePrimaryEvidenceTarget)}`);
  }
  if (asset.evidenceMode !== "secondary-present") {
    failures.push(`secondary-primary-evidence-mode:${assetId}:${String(asset.evidenceMode)}`);
  }
  return failures;
}

function validateRenderedProbe(route, asset, assetId, screenshotMetrics) {
  const probe = asset.renderedProbe;
  const failures = [];
  if (!probe || typeof probe !== "object" || Array.isArray(probe)) {
    return [`primary-asset-rendered-probe-missing:${assetId}`];
  }
  const expectedScreenshotPath = routePrimaryProbeRelativeScreenshotPath(route.id);
  if (probe.screenshotPath !== expectedScreenshotPath) {
    failures.push(`probe-screenshot-path:${assetId}:${String(probe.screenshotPath)}`);
  }
  if (typeof probe.sha256 !== "string" || !/^sha256-[a-f0-9]{64}$/i.test(probe.sha256)) failures.push(`probe-sha256:${assetId}`);
  if (!isPositiveInteger(probe.width) || !isPositiveInteger(probe.height)) failures.push(`probe-size:${assetId}`);
  if (!isValidCrop(probe.analysisCrop)) failures.push(`probe-analysis-crop:${assetId}`);
  if (!isPositiveInteger(probe.nonBlankPixels)) failures.push(`probe-nonblank:${assetId}`);
  if (!isPositiveInteger(probe.colorBuckets)) failures.push(`probe-color-buckets:${assetId}`);
  if (probe.visible !== true) failures.push(`probe-visible:${assetId}:${String(probe.visible)}`);
  if (probe.clipped !== false) failures.push(`probe-clipped:${assetId}:${String(probe.clipped)}`);
  if (probe.occludedByUi !== false) failures.push(`probe-ui-occluded:${assetId}:${String(probe.occludedByUi)}`);
  if (typeof probe.readabilityScore !== "number") {
    failures.push(`probe-readability:${assetId}:${String(probe.readabilityScore)}`);
  } else if (probe.readabilityScore < routePrimaryProbeThresholds.minReadabilityScore) {
    failures.push(`probe-readability:${assetId}:${probe.readabilityScore}`);
  }
  if (Array.isArray(probe.failures) && probe.failures.length > 0) {
    failures.push(...probe.failures.map((failure) => `probe-failure:${assetId}:${String(failure)}`));
  } else if (!Array.isArray(probe.failures)) {
    failures.push(`probe-failures-not-array:${assetId}`);
  }
  const bounds = probe.foregroundBounds;
  if (!bounds || !isNonNegativeInteger(bounds.x) || !isNonNegativeInteger(bounds.y) ||
      !isPositiveInteger(bounds.width) || !isPositiveInteger(bounds.height)) {
    failures.push(`probe-foreground-bounds:${assetId}`);
  }
  failures.push(...validateProbeThresholds(probe, bounds, assetId));
  if (screenshotMetrics) {
    failures.push(...compareRenderedProbeToPngMetrics(probe, screenshotMetrics, assetId));
  }
  return failures;
}

function validateProbeThresholds(probe, bounds, assetId) {
  const failures = [];
  if (isPositiveInteger(probe.nonBlankPixels) &&
      probe.nonBlankPixels < routePrimaryProbeThresholds.minNonBlankPixels) {
    failures.push(`probe-primary-foreground-too-small:${assetId}:${probe.nonBlankPixels}`);
  }
  if (isPositiveInteger(probe.colorBuckets) &&
      probe.colorBuckets < routePrimaryProbeThresholds.minColorBuckets) {
    failures.push(`probe-primary-color-buckets-too-low:${assetId}:${probe.colorBuckets}`);
  }
  if (bounds && isPositiveInteger(bounds.width) &&
      bounds.width < routePrimaryProbeThresholds.minForegroundWidth) {
    failures.push(`probe-primary-foreground-width:${assetId}:${bounds.width}`);
  }
  if (bounds && isPositiveInteger(bounds.height) &&
      bounds.height < routePrimaryProbeThresholds.minForegroundHeight) {
    failures.push(`probe-primary-foreground-height:${assetId}:${bounds.height}`);
  }
  return failures;
}

function validateScreenshotFiles(root, route, evidence) {
  const failures = [];
  const screenshotPath = routePrimaryProbeScreenshotPath(route.id, root);
  if (!existsSync(screenshotPath)) {
    failures.push(`missing-route-primary-screenshot:${relative(root, screenshotPath)}`);
    return { failures, metrics: undefined };
  }
  if (statSync(screenshotPath).size <= 0) {
    failures.push(`empty-route-primary-screenshot:${relative(root, screenshotPath)}`);
  }
  const actualSha = `sha256-${hashFile(screenshotPath)}`;
  let metrics;
  try {
    metrics = readPngForegroundMetrics(screenshotPath, readHeroAnalysisCrop(evidence));
  } catch (error) {
    failures.push(`route-primary-screenshot-decode:${error instanceof Error ? error.message : String(error)}`);
  }
  const heroAssetId = routePrimaryHeroAsset(route);
  const probeHashes = Array.isArray(evidence.primaryAssets)
    ? evidence.primaryAssets
      .filter((asset) => !heroAssetId || asset?.id === heroAssetId)
      .map((asset) => asset?.renderedProbe?.sha256)
      .filter((value) => typeof value === "string")
    : [];
  if (typeof evidence.renderedProbe?.sha256 === "string") {
    probeHashes.push(evidence.renderedProbe.sha256);
  }
  if (!probeHashes.includes(actualSha)) {
    failures.push(`route-primary-screenshot-hash:${actualSha}`);
  }
  return { failures, metrics };
}

function validateRendererEvidence(renderer) {
  const failures = [];
  if (!renderer || typeof renderer !== "object" || Array.isArray(renderer)) {
    return ["renderer-diagnostics-missing"];
  }
  if (!isPositiveInteger(renderer.drawCalls)) failures.push(`renderer-draw-calls:${String(renderer.drawCalls)}`);
  if (!Array.isArray(renderer.renderSize) ||
      !isPositiveInteger(renderer.renderSize[0]) ||
      !isPositiveInteger(renderer.renderSize[1])) {
    failures.push("renderer-render-size");
  }
  return failures;
}

function compareRenderedProbeToPngMetrics(probe, metrics, assetId) {
  const failures = [];
  if (probe.width !== metrics.width || probe.height !== metrics.height) {
    failures.push(`probe-png-size:${assetId}:${String(probe.width)}x${String(probe.height)}`);
  }
  if (!sameBounds(probe.analysisCrop, metrics.crop)) {
    failures.push(`probe-png-analysis-crop:${assetId}`);
  }
  if (probe.nonBlankPixels !== metrics.nonBlankPixels) {
    failures.push(`probe-png-nonblank:${assetId}:${String(probe.nonBlankPixels)}:${metrics.nonBlankPixels}`);
  }
  if (probe.colorBuckets !== metrics.colorBuckets) {
    failures.push(`probe-png-color-buckets:${assetId}:${String(probe.colorBuckets)}:${metrics.colorBuckets}`);
  }
  if (!sameBounds(probe.foregroundBounds, metrics.foregroundBounds)) {
    failures.push(`probe-png-foreground-bounds:${assetId}`);
  }
  if (probe.clipped !== metrics.clipped) failures.push(`probe-png-clipped:${assetId}:${String(probe.clipped)}:${metrics.clipped}`);
  if (probe.readabilityScore !== metrics.readabilityScore) {
    failures.push(`probe-png-readability:${assetId}:${String(probe.readabilityScore)}:${metrics.readabilityScore}`);
  }
  return failures;
}

function readHeroAnalysisCrop(evidence) {
  const heroProbe = Array.isArray(evidence.primaryAssets)
    ? evidence.primaryAssets.find((asset) => asset?.renderedProbe)?.renderedProbe
    : undefined;
  if (isValidCrop(heroProbe?.analysisCrop)) return heroProbe.analysisCrop;
  return isValidCrop(evidence.renderedProbe?.analysisCrop) ? evidence.renderedProbe.analysisCrop : undefined;
}

function sameBounds(left, right) {
  if (!left || !right) return left === right;
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function primaryAssetRole(route, assetId) {
  const role = route.primaryAssetRoles?.[assetId];
  return typeof role === "string" && role.trim() ? role : "unspecified";
}

function routePrimaryHeroAsset(route) {
  const explicit = route.routePrimaryHeroAsset;
  if (typeof explicit === "string" && route.primaryAssets?.includes(explicit)) return explicit;
  return route.primaryAssets?.[0];
}

function routeRequiresPrimaryProbe(route) {
  return Boolean(route.primaryAssets?.length) || route.requiresRoutePrimaryProbe === true;
}

function secondaryPrimaryAssets(route, heroAssetId) {
  if (Array.isArray(route.secondaryPrimaryAssets)) return route.secondaryPrimaryAssets;
  return (route.primaryAssets ?? []).filter((assetId) => assetId !== heroAssetId);
}

function readManifestAssetHash(assetId, root) {
  const manifestPath = resolve(root, "aura.assets.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const asset = (manifest.assets ?? []).find((entry) => entry?.id === assetId);
  return typeof asset?.hash === "string" ? asset.hash : undefined;
}

function getRouteHealthPath(route, root) {
  if (route.id === "showcase-index") return undefined;
  return resolve(root, "apps", route.id, "route-health.json");
}

function readSourceFiles(dir, root) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...readSourceFiles(path, root));
    } else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|css|html|md)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
}

function isValidTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isValidCrop(value) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isNonNegativeInteger(value.x) &&
    isNonNegativeInteger(value.y) &&
    isPositiveInteger(value.width) &&
    isPositiveInteger(value.height);
}

function safeRouteId(routeId) {
  if (typeof routeId !== "string" || !/^showcase-[a-z0-9-]+$/.test(routeId)) {
    throw new Error(`Unsafe showcase route id for route-primary probe path: ${String(routeId)}`);
  }
  return routeId;
}
