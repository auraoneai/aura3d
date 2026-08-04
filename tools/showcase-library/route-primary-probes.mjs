// allow: SIZE_OK - single route-primary evidence validator; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  defaultRepoRoot,
  routeGateConfigRelativePath,
  showcaseRouteGateHash
} from "./route-gates.mjs";
import { readPngDifferenceMetrics, readPngForegroundMetrics } from "./png-foreground.mjs";
import {
  createConfigFingerprint,
  createProducerFingerprint,
  createRendererFingerprint
} from "../evidence-freshness/index.mjs";

/**
 * Producer identity for freshness binding.
 *
 * Bump when the retained shape or the measurement semantics change, so previously-generated artifacts
 * are correctly reported as produced by an older producer rather than silently accepted.
 */
export const ROUTE_PRIMARY_PROBE_PRODUCER_ID = "route-primary-probes";
export const ROUTE_PRIMARY_PROBE_PRODUCER_VERSION = "1.1";

export const routePrimaryProbeSchema = "aura3d-route-primary-probe/1.0";
export const routePrimaryProbeReportDirRelativePath = "tests/reports/showcase-route-primary-probes";
export const routePrimaryProbeThresholds = Object.freeze({
  minNonBlankPixels: 2500,
  minColorBuckets: 8,
  minForegroundWidth: 96,
  minForegroundHeight: 72,
  minReadabilityScore: 35
});

export const routePrimaryProbeSummarySchema = "aura3d-route-primary-probe-summary/2.0";
export const routePrimaryProbeFullSummaryRelativePath =
  `${routePrimaryProbeReportDirRelativePath}/_summary.json`;
export const routePrimaryProbeTargetedSummaryRelativePath =
  `${routePrimaryProbeReportDirRelativePath}/_summary.targeted.json`;

/**
 * Retained route-primary summaries must state whether they came from a full run
 * over every probe-required published route or from a targeted subset. Targeted
 * runs write a distinct path so a partial artifact can never masquerade as the
 * full-suite result that release tooling consumes.
 */
export function routePrimaryProbeSummaryRelativePath(runScope) {
  if (runScope === "full") return routePrimaryProbeFullSummaryRelativePath;
  if (runScope === "targeted") return routePrimaryProbeTargetedSummaryRelativePath;
  throw new Error(`Unsupported route-primary summary run scope: ${String(runScope)}`);
}

export function routePrimaryProbeSummaryPath(runScope, root = defaultRepoRoot) {
  return resolve(root, routePrimaryProbeSummaryRelativePath(runScope));
}

/**
 * Every published route that requires a route-primary probe. This is the
 * expected route set for a full run and the minimum executed route set that
 * release tooling accepts.
 */
/**
 * Routes a full producer sweep is expected to (re)generate.
 *
 * Excludes `retainedEvidenceFrozen` routes: superseded historical certification records
 * that stay `published` so their build, deploy, and classification gates keep running, but
 * whose retained probes must not be rewritten by a sweep. The
 * `showcase-public-{racing,platformer}-presentation-proof` and `*-game-layer-proof` routes
 * were the original cases; both have since been deleted, so the filter is currently a
 * no-op guard kept for any future frozen route. Regenerating them churns gitignored artifacts and, worse, rebinds shared asset
 * evidence to screenshots that no promoted route reviews (defect 44/46).
 */
export function routePrimaryProbeExpectedRouteIds(routes) {
  return routes
    .filter((route) => route.published !== false
      && route.retainedEvidenceFrozen !== true
      && routeRequiresPrimaryProbe(route))
    .map((route) => route.id);
}

/** True when a route's retained evidence is frozen and producers must skip it. */
export function routePrimaryProbeIsFrozen(route) {
  return route?.retainedEvidenceFrozen === true;
}

export function createRoutePrimaryProbeSummary({
  runScope,
  routes,
  selectedRouteIds,
  outcomes,
  routeGateConfig,
  routeGateConfigHash,
  generatedAt = new Date().toISOString(),
  root = defaultRepoRoot
}) {
  const expectedRouteIds = routePrimaryProbeExpectedRouteIds(routes);
  const executedRouteIds = outcomes.map((outcome) => outcome.routeId);
  const selected = Array.isArray(selectedRouteIds) && selectedRouteIds.length > 0
    ? [...selectedRouteIds]
    : [...expectedRouteIds];
  const missingRouteIds = selected.filter((routeId) => !executedRouteIds.includes(routeId));
  const routeVerdicts = outcomes.map((outcome) => {
    const pass = outcome.pass === true;
    const allowedToFail = routeAllowsFailingRoutePrimaryProbe(outcome.routeId, root);
    return {
      routeId: outcome.routeId,
      pass,
      verdict: pass ? "pass" : "fail",
      allowedToFail,
      blocking: !pass && !allowedToFail,
      failures: [...(outcome.failures ?? [])],
      evidencePath: outcome.evidencePath,
      screenshotPath: outcome.screenshotPath
    };
  });

  return {
    schema: routePrimaryProbeSummarySchema,
    generatedAt,
    runScope,
    evidenceLabel: "structural/image QA pass",
    humanVisualApproval: false,
    humanVisualApprovalNote:
      "Structural/image QA only. A passing route-primary summary is never human visual approval.",
    summaryPath: routePrimaryProbeSummaryRelativePath(runScope),
    routeGateConfig: {
      path: routeGateConfigRelativePath,
      schema: routeGateConfig?.schema,
      hash: routeGateConfigHash
    },
    selectedRouteIds: selected,
    expectedRouteIds,
    expectedRouteCount: expectedRouteIds.length,
    executedRouteIds,
    executedRouteCount: executedRouteIds.length,
    missingRouteIds,
    failingRouteIds: routeVerdicts.filter((route) => !route.pass).map((route) => route.routeId),
    blockingRouteIds: routeVerdicts.filter((route) => route.blocking).map((route) => route.routeId),
    pass: missingRouteIds.length === 0 && routeVerdicts.every((route) => !route.blocking),
    routeVerdicts,
    routes: routeVerdicts
  };
}

/**
 * A route may retain a failing route-primary probe only while its own
 * route-health demotes it out of the public showcase. Public/promoted routes may
 * never retain a failing probe.
 */
export function routeAllowsFailingRoutePrimaryProbe(routeId, root = defaultRepoRoot) {
  const healthPath = resolve(root, "apps", String(routeId), "route-health.json");
  if (!existsSync(healthPath)) return false;
  let health;
  try {
    health = JSON.parse(readFileSync(healthPath, "utf8"));
  } catch {
    return false;
  }
  if (health?.publicShowcase === false) return true;
  const classification = String(health?.classification ?? "").toLowerCase();
  const promotionStatus = String(health?.promotionStatus ?? "").toLowerCase();
  const demoted = /blocked|prototype|diagnostic|internal|removed/;
  return demoted.test(classification) || demoted.test(promotionStatus);
}

/**
 * Release tooling entry point. A summary is only acceptable when it is a full
 * run whose executed route set covers every promoted route and every executed
 * route passed.
 */
export function validateRoutePrimaryProbeSummary(options = {}) {
  const root = resolve(options.root ?? defaultRepoRoot);
  const relativePath = options.path ?? routePrimaryProbeFullSummaryRelativePath;
  const path = resolve(root, relativePath);
  const requiredRouteIds = [...(options.requiredRouteIds ?? [])];
  const failures = [];

  if (!existsSync(path)) {
    return {
      ok: false,
      path: relativePath,
      summary: null,
      requiredRouteIds,
      failures: [`missing-route-primary-summary:${relativePath}`]
    };
  }

  let summary;
  try {
    summary = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      summary: null,
      requiredRouteIds,
      failures: [`invalid-route-primary-summary-json:${error instanceof Error ? error.message : String(error)}`]
    };
  }

  if (summary?.schema !== routePrimaryProbeSummarySchema) {
    failures.push(`route-primary-summary-schema:${String(summary?.schema)}`);
  }
  if (summary?.runScope !== "full") {
    failures.push(`route-primary-summary-run-scope:${String(summary?.runScope)}`);
  }
  if (summary?.humanVisualApproval !== false) {
    failures.push(`route-primary-summary-human-approval-claim:${String(summary?.humanVisualApproval)}`);
  }
  if (!isValidTimestamp(summary?.generatedAt)) {
    failures.push(`route-primary-summary-generated-at:${String(summary?.generatedAt)}`);
  }
  if (options.routeGateConfigHash && summary?.routeGateConfig?.hash !== options.routeGateConfigHash) {
    failures.push(`route-primary-summary-route-gate-hash:${String(summary?.routeGateConfig?.hash)}`);
  }

  const executedRouteIds = Array.isArray(summary?.executedRouteIds) ? summary.executedRouteIds : [];
  const routeVerdicts = Array.isArray(summary?.routeVerdicts) ? summary.routeVerdicts : [];
  if (!Array.isArray(summary?.executedRouteIds)) failures.push("route-primary-summary-executed-route-ids");
  if (!Array.isArray(summary?.routeVerdicts)) failures.push("route-primary-summary-route-verdicts");
  if (!Array.isArray(summary?.expectedRouteIds)) failures.push("route-primary-summary-expected-route-ids");
  if (summary?.executedRouteCount !== executedRouteIds.length) {
    failures.push(`route-primary-summary-executed-count:${String(summary?.executedRouteCount)}`);
  }
  if (Array.isArray(summary?.expectedRouteIds) && summary?.expectedRouteCount !== summary.expectedRouteIds.length) {
    failures.push(`route-primary-summary-expected-count:${String(summary?.expectedRouteCount)}`);
  }
  if (Array.isArray(summary?.expectedRouteIds) && executedRouteIds.length < summary.expectedRouteIds.length) {
    failures.push(
      `route-primary-summary-partial-run:${executedRouteIds.length}/${summary.expectedRouteIds.length}`
    );
  }
  if (Array.isArray(summary?.missingRouteIds) && summary.missingRouteIds.length > 0) {
    failures.push(`route-primary-summary-missing-routes:${summary.missingRouteIds.join(",")}`);
  }

  for (const routeId of requiredRouteIds) {
    if (!executedRouteIds.includes(routeId)) {
      failures.push(`route-primary-summary-route-not-executed:${routeId}`);
      continue;
    }
    const verdict = routeVerdicts.find((route) => route?.routeId === routeId);
    if (!verdict) {
      failures.push(`route-primary-summary-route-verdict-missing:${routeId}`);
    } else if (verdict.pass !== true) {
      failures.push(`route-primary-summary-route-failed:${routeId}`);
    }
  }

  for (const verdict of routeVerdicts) {
    if (verdict?.pass === true) continue;
    const allowedToFail = routeAllowsFailingRoutePrimaryProbe(verdict?.routeId, root);
    if (verdict?.allowedToFail !== allowedToFail) {
      failures.push(`route-primary-summary-allowed-to-fail-mismatch:${String(verdict?.routeId)}`);
    }
    if (!allowedToFail) {
      failures.push(`route-primary-summary-failing-route:${String(verdict?.routeId)}`);
    }
  }

  if (summary?.pass !== true) failures.push(`route-primary-summary-pass:${String(summary?.pass)}`);

  return {
    ok: failures.length === 0,
    path: relativePath,
    summary,
    requiredRouteIds,
    failures
  };
}

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
    /*
     * Freshness dimensions beyond source/gate/health.
     *
     * Without these, a retained probe could not be invalidated by a renderer change, a producer change,
     * or a viewport-contract change -- so a screenshot rendered by different renderer code still read as
     * current. `explain-staleness` reported all three as `unbound`, which is what prompted adding them.
     */
    rendererFingerprint: createRendererFingerprint(root),
    producerFingerprint: createProducerFingerprint(
      "tools/showcase-library/route-primary-probes.mjs",
      ROUTE_PRIMARY_PROBE_PRODUCER_VERSION,
      root
    ),
    producerId: ROUTE_PRIMARY_PROBE_PRODUCER_ID,
    producerVersion: ROUTE_PRIMARY_PROBE_PRODUCER_VERSION,
    routeHealthHash: routeHealthPath && existsSync(routeHealthPath) ? hashRouteHealthDependency(routeHealthPath) : undefined,
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
    hash.update(normalizeCompositionOwnedDigests(readFileSync(file, "utf8")));
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

/**
 * Neutralise screenshot digests that the composition producer rewrites inside generated route sources.
 *
 * `regenerate-game-composition-evidence` rewrites every `routePrimaryScreenshotSha256` / `screenshotSha256` literal in
 * `src/generated/game-geometry.ts` to match the screenshot *this probe just produced*. Hashing those bytes made the
 * route-source binding self-invalidating in exactly the same way the route-health binding was: the probe bound a value
 * the next producer was guaranteed to change.
 *
 * Replacing the digest value (not the field) keeps every other byte of the generated module in the hash, so a real
 * geometry change still invalidates the probe. Only the one value composition owns is normalised away.
 */
function normalizeCompositionOwnedDigests(source) {
  return source.replace(
    /("(?:routePrimaryScreenshotSha256|screenshotSha256)":\s*")sha256-[a-f0-9]{64}(")/g,
    "$1<composition-owned>$2"
  );
}

/**
 * Parts of `route-health.json` the composition producer owns, which this probe therefore does not depend on.
 *
 * `regenerate-game-composition-evidence` derives these *from this probe's own output*, so hashing them created a
 * genuine ordering cycle: the probe bound values the next producer was guaranteed to change, leaving the probe's
 * binding stale after every run and forcing a second probe run to close the loop.
 *
 * Two shapes had to be excluded, and finding the second one required checking rather than assuming. The top-level
 * `gameAssetPairEvidence` block is the obvious one. Less obvious: `synchronizeScreenshotHashes` rewrites
 * `screenshotSha256` / `routePrimaryScreenshotSha256` **anywhere in the document**, including under
 * `racing.raceDesign.assetPairEvidence` and `platformer.levelDesign.assetPairEvidence`. Excluding only the top-level
 * block left Skyline and Turbo still reporting stale, which is what surfaced the nested fields.
 *
 * Both lists are *exclusions*, not an allowlist of included keys: a new field added to route-health should invalidate
 * this probe by default. Silence on new fields is how a binding quietly stops protecting anything.
 */
export const ROUTE_HEALTH_COMPOSITION_OWNED_FIELDS = Object.freeze(["gameAssetPairEvidence"]);

/** Digest fields the composition producer rewrites at any depth, keyed on field name. */
export const ROUTE_HEALTH_COMPOSITION_OWNED_DIGEST_FIELDS = Object.freeze([
  "screenshotSha256",
  "routePrimaryScreenshotSha256"
]);

/**
 * Hash the part of `route-health.json` this probe actually depends on.
 *
 * Serialized with sorted keys so the digest is insensitive to key order, which a producer rewriting one block can
 * otherwise change incidentally.
 */
export function hashRouteHealthDependency(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // An unparseable route-health is a real problem, but not this function's to diagnose: fall back to raw bytes so
    // the caller still gets a stable digest rather than a crash.
    return `sha256-${hashFile(path)}`;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return `sha256-${hashFile(path)}`;
  }
  const dependency = {};
  for (const key of Object.keys(parsed).sort()) {
    if (ROUTE_HEALTH_COMPOSITION_OWNED_FIELDS.includes(key)) continue;
    dependency[key] = stripCompositionOwnedDigests(parsed[key]);
  }
  return `sha256-${createHash("sha256").update(stableJson(dependency)).digest("hex")}`;
}

/** Recursively drop composition-owned digest fields, wherever they appear in the document. */
function stripCompositionOwnedDigests(value) {
  if (Array.isArray(value)) return value.map(stripCompositionOwnedDigests);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (ROUTE_HEALTH_COMPOSITION_OWNED_DIGEST_FIELDS.includes(key)) continue;
    out[key] = stripCompositionOwnedDigests(entry);
  }
  return out;
}

/** Key-order-independent JSON serialization, so a rewrite that reorders keys does not read as a change. */
function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
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
  if (probe.controlsInViewport !== true) {
    failures.push(`probe-controls-outside-viewport:${assetId}:${String(probe.controlsInViewport)}`);
  }
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
    const renderedProbe = evidence.renderedProbe;
    const suppressedRelative = renderedProbe?.subjectSuppressedScreenshotPath;
    if (typeof suppressedRelative === "string") {
      const expectedSuppressed = `${routePrimaryProbeReportDirRelativePath}/${safeRouteId(route.id)}-subject-suppressed.png`;
      if (suppressedRelative !== expectedSuppressed) failures.push(`subject-suppressed-screenshot-path:${suppressedRelative}`);
      const suppressedPath = resolve(root, suppressedRelative);
      const suppressedRel = relative(root, suppressedPath);
      if (suppressedRel.startsWith("..") || !existsSync(suppressedPath)) {
        failures.push(`missing-subject-suppressed-screenshot:${suppressedRelative}`);
      } else {
        const suppressedSha = `sha256-${hashFile(suppressedPath)}`;
        if (renderedProbe.subjectSuppressedScreenshotSha256 !== suppressedSha) {
          failures.push(`subject-suppressed-screenshot-hash:${suppressedSha}`);
        }
        metrics = readPngDifferenceMetrics(screenshotPath, suppressedPath, readHeroAnalysisCrop(evidence));
      }
    } else {
      metrics = readPngForegroundMetrics(screenshotPath, readHeroAnalysisCrop(evidence));
    }
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
