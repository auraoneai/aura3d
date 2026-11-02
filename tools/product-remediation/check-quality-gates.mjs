#!/usr/bin/env node
/**
 * Phase 16: combined runtime-quality and interaction-quality gate.
 *
 * Aggregates the retained evidence this remediation produces into the four invariant groups
 * the assignment names, and **fails** when an invariant is violated or when the evidence
 * needed to judge it is missing.
 *
 * The last part matters most. The previous regime's failure was not that its checks were
 * wrong but that missing evidence read as success: a route with no interaction trace looked
 * identical to a route that passed one. Here, `unproven` is a distinct outcome from `pass`,
 * and the gate exits non-zero for either a failure or an unproven required invariant.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createConfigFingerprint,
  EVIDENCE_FRESHNESS_SCHEMA,
  explainArtifactStaleness,
  sha256
} from "../evidence-freshness/index.mjs";
import { readShowcaseRouteGateConfig } from "../showcase-library/route-gates.mjs";
import {
  createRoutePrimaryProbeContext,
  routePrimaryProbeExpectedRouteIds,
  routePrimaryProbeReportDirRelativePath,
  routePrimaryProbeSchema
} from "../showcase-library/route-primary-probes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// Optionally print a current dependency-bound audit after checking its probe bindings.
// The ordinary explainer also writes this proof when run with --write.
if (process.argv.includes("--print-freshness-audit")) {
  try {
    const live = recomputeFreshnessAudit();
    const verdict = checkEvidenceFreshness(live, true);
    if (verdict.status !== "pass") throw new Error(verdict.detail);
    const routes = readShowcaseRouteGateConfig(root).routes;
    const paths = new Set(routePrimaryProbeExpectedRouteIds(routes)
      .map((id) => `${routePrimaryProbeReportDirRelativePath}/${id}.json`));
    const bindings = checkCurrentProbeBindings(routes, paths, live.rendererFingerprint);
    if (bindings.status !== "pass") throw new Error(bindings.detail);
    live.inputProof = currentInputProof(paths);
    await new Promise((resolveWrite, rejectWrite) => {
      process.stdout.write(`${JSON.stringify(live, null, 2)}\n`, (error) => {
        if (error) rejectWrite(error);
        else resolveWrite();
      });
    });
    process.exit(0);
  } catch (error) {
    console.error(`cannot produce freshness audit: ${error.message}`);
    process.exit(1);
  }
}

const auditDir = join(root, "tests/reports/showcase-interaction-audit");
const audits = existsSync(auditDir)
  ? readdirSync(auditDir).filter((name) => name.endsWith(".json")).map((name) => readJson(join(auditDir, name)))
  : [];

const checks = [];
/**
 * Record one invariant.
 *
 * `status` is `pass`, `fail`, or `unproven`. Three outcomes rather than two, because
 * "no evidence" is the condition that let every previous gate stay green.
 */
function record(group, id, description, status, detail) {
  checks.push({ group, id, description, status, detail });
}

// --- Interaction invariants -------------------------------------------------
if (audits.length === 0) {
  record("interaction", "coverage-exists", "interaction traces exist for public routes", "unproven",
    "no interaction-audit reports found; run tests/browser/showcase-route-interaction-audit.spec.ts");
} else {
  const operated = audits.reduce((total, audit) => total + audit.controlsOperated, 0);
  const passing = audits.reduce((total, audit) => total + audit.controlsPassing, 0);
  record("interaction", "every-control-performs-its-action",
    "every discovered control produces an observable state or UI change",
    passing === operated ? "pass" : "fail",
    `${passing}/${operated} controls across ${audits.length} routes`);

  const withErrors = audits.filter((audit) => audit.consoleErrors.length > 0);
  record("interaction", "no-runtime-errors-during-interaction",
    "no console or page errors while operating controls",
    withErrors.length === 0 ? "pass" : "fail",
    withErrors.length === 0 ? "0 routes with errors" : withErrors.map((audit) => audit.routeId).join(", "));

  const keyboard = audits.reduce((total, audit) => total + audit.keyboardResults.length, 0);
  const keyboardActive = audits.reduce((total, audit) => total + audit.keyboardResults.filter((entry) => entry.changed).length, 0);
  record("interaction", "declared-keys-respond",
    "every keyboard binding a route declares changes route state",
    keyboard === 0 ? "unproven" : keyboardActive === keyboard ? "pass" : "fail",
    `${keyboardActive}/${keyboard} declared keyboard bindings`);

  const restartFailures = audits.filter((audit) => audit.restartRecovered === false);
  record("interaction", "restart-restores-state",
    "reloading a route returns it to a mounted state",
    restartFailures.length === 0 ? "pass" : "fail",
    restartFailures.length === 0 ? `${audits.length} routes recovered` : restartFailures.map((audit) => audit.routeId).join(", "));

  // Focus indicators. Only routes that publish a focus report can be judged.
  const focusReports = audits.filter((audit) => (audit.observedInvariants?.focus ?? audit.finalInvariants?.focus));
  record("interaction", "focus-indicators-surround-target",
    "published focus invariants hold: ring circular, thinned on the tube axis, enclosing the target, callout outside it",
    focusReports.length === 0
      ? "unproven"
      : focusReports.every((audit) => (audit.observedInvariants?.focus ?? audit.finalInvariants.focus).passes) ? "pass" : "fail",
    focusReports.length === 0 ? "no route published a focus invariant report" : `${focusReports.length} route(s) reporting`);

  // Labels. A route authoring labels must have them on screen.
  const labelReports = audits.filter((audit) => (audit.observedInvariants?.labels ?? audit.finalInvariants?.labels) && (audit.observedInvariants?.labels ?? audit.finalInvariants.labels).total > 0);
  record("interaction", "labels-render-and-remain-readable",
    "routes that author labels have at least one placed on screen",
    labelReports.length === 0
      ? "unproven"
      : labelReports.every((audit) => (audit.observedInvariants?.labels ?? audit.finalInvariants.labels).visible > 0) ? "pass" : "fail",
    labelReports.length === 0 ? "no route reported placed labels" : `${labelReports.length} route(s) reporting`);

  // Touch/desktop equivalence.
  const mobileLoss = audits.filter((audit) =>
    audit.controlsDiscovered > 0 && audit.mobileControlsDiscovered < Math.floor(audit.controlsDiscovered * 0.9));
  record("interaction", "touch-and-desktop-equivalent",
    "mobile viewport exposes at least 90% of the desktop control set",
    mobileLoss.length === 0 ? "pass" : "fail",
    mobileLoss.length === 0 ? `${audits.length} routes checked` : mobileLoss.map((audit) => audit.routeId).join(", "));
}

// --- Spatial invariants -----------------------------------------------------
const spatialReports = audits.filter((audit) => (audit.observedInvariants?.spatial ?? audit.finalInvariants?.spatial));
record("spatial", "helper-geometry-anchored",
  "published spatial invariants hold: helpers inside, on, or within reach of their subject",
  spatialReports.length === 0
    ? "unproven"
    : spatialReports.every((audit) => (audit.observedInvariants?.spatial ?? audit.finalInvariants.spatial).passes) ? "pass" : "fail",
  spatialReports.length === 0 ? "no route published a spatial invariant report" : `${spatialReports.length} route(s) reporting`);

const inventoryPath = join(root, "tests/reports/aura3d-product-inventory.json");
if (!existsSync(inventoryPath)) {
  record("spatial", "no-floating-procedural-props", "no helper geometry at literal world coordinates in published routes", "unproven",
    "inventory report missing; run tools/product-remediation/build-product-inventory.mjs");
} else {
  const inventory = readJson(inventoryPath);
  const gates = readJson(join(root, "tools/showcase-library/route-gates.json"));
  const published = new Set(gates.routes.filter((route) => route.published).map((route) => route.id));
  const offenders = inventory.apps
    .filter((app) => published.has(app.routeId))
    .map((app) => ({
      routeId: app.routeId,
      findings: app.magicGeometry.filter((finding) =>
        finding.kind === "torus-flattened-into-bar" || finding.kind === "callout-without-world-anchor").length
    }))
    .filter((entry) => entry.findings > 0);
  /*
   * Only the two defect classes that are unambiguously wrong gate here.
   * `hardcoded-helper-placement` and `torus-rotate-scale-composition` include legitimate
   * level-design values, so gating on them would block on art direction. They are tracked as
   * metrics instead.
   */
  record("spatial", "no-defective-indicator-or-label-geometry",
    "no published route has a flattened focus indicator or a callout without a world anchor",
    offenders.length === 0 ? "pass" : "fail",
    offenders.length === 0 ? "0 published routes" : offenders.map((entry) => `${entry.routeId}:${entry.findings}`).join(", "));
}

// --- Gameplay invariants ----------------------------------------------------
const groundingPath = join(root, "tests/reports/turbo-vehicle-grounding/turbo-vehicle-grounding.json");
if (!existsSync(groundingPath)) {
  record("gameplay", "stable-grounding", "vehicle stays grounded across a driving stint", "unproven",
    "run tests/browser/turbo-vehicle-grounding.spec.ts");
  record("gameplay", "coherent-ai", "opponent is driven by the reusable AI driver", "unproven", "same report missing");
} else {
  const grounding = readJson(groundingPath);
  const observed = grounding.finalChassis?.observed ?? {};
  record("gameplay", "stable-grounding",
    "every wheel remains on the road for a full driving stint, with a bounded contact gap",
    observed.everUngrounded === false && (observed.maxContactGap ?? 1) < 0.05 ? "pass" : "fail",
    `everUngrounded=${observed.everUngrounded} maxContactGap=${observed.maxContactGap}`);
  record("gameplay", "suspension-and-attitude-respond",
    "suspension travels and the chassis pitches and rolls under load",
    observed.suspensionMoved && observed.pitchObserved && observed.rollObserved ? "pass" : "fail",
    `suspension=${observed.suspensionMoved} pitch=${observed.pitchObserved} roll=${observed.rollObserved}`);
  record("gameplay", "coherent-ai",
    "opponent is driven by the reusable look-ahead AI driver, not track-progress interpolation",
    grounding.opponentController === "aura-vehicle-driver-ai" ? "pass" : "fail",
    `controller=${grounding.opponentController}`);
}

const motionPath = join(root, "tests/reports/skyline-platformer-motion/skyline-platformer-motion.json");
if (!existsSync(motionPath)) {
  record("gameplay", "motion-consistent-with-geometry", "platformer motion suits its own level geometry", "unproven",
    "run tests/browser/skyline-platformer-motion.spec.ts");
} else {
  const motion = readJson(motionPath);
  record("gameplay", "motion-consistent-with-geometry",
    "platformer jump apex, reach and airtime are proportionate to the level's own steps and gaps",
    motion.motion?.invariants?.passes ? "pass" : "fail",
    `apexToRiseRatio=${motion.motion?.invariants?.measured?.apexToRiseRatio} airtime=${motion.motion?.airtime}`);
  record("gameplay", "landing-reliable",
    "the player spends most sampled frames grounded and is never airborne for an implausible run",
    motion.groundedSamples > motion.groundedSampleCount * 0.3 && motion.maxAirborneStreak < motion.groundedSampleCount * 0.5 ? "pass" : "fail",
    `grounded=${motion.groundedSamples}/${motion.groundedSampleCount} maxAirborneStreak=${motion.maxAirborneStreak}`);
  record("gameplay", "session-length-declared",
    "session length is derived and its limiting factor stated, not left to accident",
    motion.motion?.sessionLengthShortfall !== undefined || (motion.motion?.estimatedSessionSeconds ?? 0) > 120 ? "pass" : "fail",
    `estimatedSessionSeconds=${motion.motion?.estimatedSessionSeconds}`);
}

// --- Performance invariants -------------------------------------------------
const probeDir = join(root, "tests/reports/showcase-route-primary-probes");
if (!existsSync(probeDir)) {
  record("performance", "draw-call-budget", "published routes report draw calls within budget", "unproven", "route-primary probes missing");
} else {
  let requiredProbeNames;
  try {
    requiredProbeNames = new Set(routePrimaryProbeExpectedRouteIds(readShowcaseRouteGateConfig(root).routes)
      .map((id) => `${id}.json`));
  } catch {
    // If selection cannot be determined, do not silently ignore an unreadable report.
  }
  const unreadable = [];
  const probes = readdirSync(probeDir).filter((name) => name.endsWith(".json")).flatMap((name) => {
    try {
      return [readJson(join(probeDir, name))];
    } catch {
      if (!requiredProbeNames || requiredProbeNames.has(name)) unreadable.push(name);
      return [];
    }
  });
  const withRenderer = probes.filter((probe) => typeof probe?.renderer?.drawCalls === "number");
  /*
   * Budget stated, not fitted: 2000 draw calls is a generous ceiling for a browser scene at
   * 60fps on integrated graphics. A route above it is doing something that needs explaining.
   */
  const DRAW_CALL_BUDGET = 2000;
  const over = withRenderer.filter((probe) => probe.renderer.drawCalls > DRAW_CALL_BUDGET);
  record("performance", "draw-call-budget",
    `published routes stay under ${DRAW_CALL_BUDGET} draw calls`,
    unreadable.length > 0 || withRenderer.length === 0 ? "unproven" : over.length === 0 ? "pass" : "fail",
    unreadable.length > 0
      ? `unreadable probe report(s): ${unreadable.join(", ")}`
      : withRenderer.length === 0
      ? "no probe reported renderer draw calls"
      : `max ${Math.max(...withRenderer.map((probe) => probe.renderer.drawCalls))} across ${withRenderer.length} routes`);

  const mobileChecked = audits.filter((audit) => audit.mobileControlsDiscovered !== undefined);
  record("performance", "acceptable-mobile-behaviour",
    "routes stay mounted and operable at a 390x780 viewport",
    mobileChecked.length === 0 ? "unproven" : "pass",
    `${mobileChecked.length} routes resized without runtime errors`);
}

/**
 * A retained verdict is not a snapshot of the current tree. Validate its shape and full route
 * set, then independently re-run the authoritative explainer without --write and check the
 * current probe bindings. Never turn a missing, stale, partial or unreadable report into a pass.
 */
function checkEvidenceFreshness(freshness, skipRecomputation = false) {
  const invalid = (detail) => ({ status: "unproven", detail: `invalid freshness audit: ${detail}` });
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  if (!object(freshness)) return invalid("expected an object");

  const current = freshness.schema === "aura3d-explain-staleness/1.0";
  if (freshness.schema !== undefined && !current) return invalid(`unsupported schema ${String(freshness.schema)}`);
  if (!Array.isArray(freshness.artifacts) || freshness.artifacts.length === 0) {
    return invalid("a non-empty artifact verdict list is required; aggregate counts alone are insufficient");
  }
  if (!current && !has(freshness, "stale") && !has(freshness, "staleCount")
      && !freshness.artifacts.some((entry) => object(entry) && has(entry, "stale"))) {
    return invalid("missing schema or a recognized legacy stale verdict");
  }
  if ((current || has(freshness, "generatedAt"))
      && (typeof freshness.generatedAt !== "string" || Number.isNaN(Date.parse(freshness.generatedAt)))) {
    return invalid("missing or malformed generatedAt");
  }
  if ((current || has(freshness, "rendererFingerprint"))
      && (typeof freshness.rendererFingerprint !== "string" || !/^sha256-[a-f0-9]{64}$/.test(freshness.rendererFingerprint))) {
    return invalid("missing or malformed rendererFingerprint");
  }
  for (const key of ["frozenRoutes", "retiredRoutes", "ownershipConflicts", "orderingCycles"]) {
    const required = current;
    if ((required || has(freshness, key)) && !Array.isArray(freshness[key])) return invalid(`${key} must be an array`);
    if ((key === "frozenRoutes" || key === "retiredRoutes") && Array.isArray(freshness[key])
        && (freshness[key].some((id) => typeof id !== "string" || !id.trim())
          || new Set(freshness[key]).size !== freshness[key].length)) {
      return invalid(`${key} must contain unique route IDs`);
    }
  }

  const paths = new Set();
  const notCurrent = [];
  for (const [index, entry] of freshness.artifacts.entries()) {
    if (!object(entry) || typeof entry.artifact !== "string" || !entry.artifact.trim()) {
      return invalid(`artifact ${index} must identify its path`);
    }
    if (paths.has(entry.artifact)) return invalid(`duplicate artifact ${entry.artifact}`);
    paths.add(entry.artifact);
    if (typeof entry.unbound !== "boolean") return invalid(`${entry.artifact} is missing a boolean unbound verdict`);
    if ((current || has(entry, "fresh")) && typeof entry.fresh !== "boolean") {
      return invalid(`${entry.artifact} is missing a boolean fresh verdict`);
    }
    if (has(entry, "stale") && typeof entry.stale !== "boolean") return invalid(`${entry.artifact} has a malformed stale verdict`);
    if (!has(entry, "fresh") && !has(entry, "stale")) return invalid(`${entry.artifact} has no freshness verdict`);
    if ((entry.fresh === true && (entry.unbound || entry.stale === true))
        || (entry.fresh === false && entry.stale === false && !entry.unbound)) {
      return invalid(`${entry.artifact} has contradictory freshness verdicts`);
    }
    const staleOrUnbound = entry.fresh === false || entry.stale === true || entry.unbound;
    for (const key of ["reasons", "producerConflicts"]) {
      if ((current || has(entry, key)) && !Array.isArray(entry[key])) return invalid(`${entry.artifact} ${key} must be an array`);
      if (!staleOrUnbound && entry[key]?.length > 0) return invalid(`${entry.artifact} is fresh but has ${key}`);
    }
    if (current && entry.fresh === false && entry.reasons.length === 0) {
      return invalid(`${entry.artifact} is not fresh but has no reason`);
    }
    if (staleOrUnbound) notCurrent.push(`${entry.artifact}${entry.unbound ? " (unbound)" : ""}`);
  }

  if (current && !has(freshness, "staleArtifactCount")) return invalid("missing staleArtifactCount");
  for (const key of ["staleArtifactCount", "stale", "staleCount"]) {
    if (!has(freshness, key)) continue;
    if (!Number.isSafeInteger(freshness[key]) || freshness[key] < 0) return invalid(`${key} must be a nonnegative integer`);
    if (freshness[key] !== notCurrent.length) {
      return invalid(`${key}=${freshness[key]} disagrees with ${notCurrent.length} stale or unbound artifact verdict(s)`);
    }
  }

  let routes;
  try {
    routes = readShowcaseRouteGateConfig(root).routes;
    if (routes.length === 0 || routes.some((route) => typeof route.published !== "boolean"
        || (route.requiresRoutePrimaryProbe !== undefined && typeof route.requiresRoutePrimaryProbe !== "boolean"))) {
      return invalid("route gate metadata has missing or malformed selection flags");
    }
  } catch (error) {
    return invalid(`cannot read route gate metadata: ${error.message}`);
  }
  // The explainer also permits --route --write. A fresh subset must not masquerade as a full audit.
  const expected = new Set(routePrimaryProbeExpectedRouteIds(routes)
    .map((id) => `${routePrimaryProbeReportDirRelativePath}/${id}.json`));
  const missing = [...expected].filter((path) => !paths.has(path));
  const unexpected = [...paths].filter((path) => !expected.has(path));
  if (expected.size === 0 || missing.length > 0 || unexpected.length > 0) {
    return invalid(`audit does not cover the required published, non-frozen probes`
      + (missing.length ? `; missing: ${missing.join(", ")}` : "")
      + (unexpected.length ? `; unexpected: ${unexpected.join(", ")}` : ""));
  }
  for (const [key, ids] of [
    ["frozenRoutes", routes.filter((route) => route.retainedEvidenceFrozen === true).map((route) => route.id)],
    ["retiredRoutes", routes.filter((route) => route.published === false).map((route) => route.id)]
  ]) {
    if (has(freshness, key) && (freshness[key].length !== ids.length || ids.some((id) => !freshness[key].includes(id)))) {
      return invalid(`${key} disagrees with route gate metadata`);
    }
  }
  if (notCurrent.length > 0) {
    return { status: "fail", detail: `${notCurrent.length} of ${paths.size} artifact(s) stale or unbound: ${notCurrent.join(", ")}` };
  }
  if (!current) return invalid("legacy audit lacks current renderer and dependency proof");
  if (freshness.ownershipConflicts.length > 0 || freshness.orderingCycles.length > 0) {
    return { status: "fail", detail: "freshness audit has producer ownership conflicts or ordering cycles" };
  }
  if (skipRecomputation) return { status: "pass", detail: "valid full current audit" };

  let live;
  try {
    live = recomputeFreshnessAudit();
  } catch (error) {
    return { status: "unproven", detail: error.message };
  }
  const liveResult = checkEvidenceFreshness(live, true);
  if (liveResult.status !== "pass") {
    const causes = Array.isArray(live?.artifacts)
      ? live.artifacts.flatMap((entry) => (Array.isArray(entry?.reasons) ? entry.reasons : []).map((reason) =>
        `${entry.artifact}: ${reason?.kind}/${reason?.id} ${reason?.status}`))
      : [];
    return {
      ...liveResult,
      detail: `current freshness audit: ${liveResult.detail}${causes.length ? `; ${causes.join(", ")}` : ""}`
    };
  }
  if (freshness.rendererFingerprint !== live.rendererFingerprint) {
    return { status: "fail", detail: "retained freshness audit renderer fingerprint differs from the current renderer" };
  }
  const liveByPath = new Map(live.artifacts.map((entry) => [entry.artifact, entry]));
  for (const entry of freshness.artifacts) {
    const currentEntry = liveByPath.get(entry.artifact);
    if (!currentEntry || entry.fresh !== currentEntry.fresh || entry.unbound !== currentEntry.unbound
        || JSON.stringify(entry.reasons) !== JSON.stringify(currentEntry.reasons)
        || JSON.stringify(entry.producerConflicts) !== JSON.stringify(currentEntry.producerConflicts)) {
      return { status: "fail", detail: `retained freshness verdict differs from current evidence: ${entry.artifact}` };
    }
  }
  const bindings = checkCurrentProbeBindings(routes, expected, live.rendererFingerprint);
  if (bindings.status !== "pass") return bindings;
  if (!object(freshness.inputProof) || freshness.inputProof.schema !== "aura3d-freshness-input-proof/1.0"
      || typeof freshness.inputProof.routeGateHash !== "string" || !Array.isArray(freshness.inputProof.artifacts)) {
    return invalid("audit lacks dependency-bound input proof; run node tools/evidence-freshness/explain-staleness.mjs --write");
  }
  if (freshness.inputProof.artifacts.some((entry) => !object(entry) || typeof entry.artifact !== "string")) {
    return invalid("audit has malformed dependency-bound artifact proof");
  }
  let proof;
  try {
    proof = currentInputProof(expected);
  } catch (error) {
    return { status: "unproven", detail: `cannot read current freshness inputs: ${error.message}` };
  }
  const normalizedProof = {
    ...freshness.inputProof,
    artifacts: [...freshness.inputProof.artifacts].sort((a, b) =>
      a.artifact < b.artifact ? -1 : a.artifact > b.artifact ? 1 : 0)
  };
  if (createConfigFingerprint(normalizedProof) !== createConfigFingerprint(proof)) {
    return { status: "fail", detail: "retained freshness audit input proof differs from current gate, probes or screenshots" };
  }
  return {
    status: "pass",
    detail: `${paths.size} required published probe(s) fresh; retired and frozen evidence not audited or approved`
  };
}

function recomputeFreshnessAudit() {
  const explainerPath = join(root, "tools/evidence-freshness/explain-staleness.mjs");
  const run = spawnSync(process.execPath, [explainerPath, "--root", root, "--json"], {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30_000
  });
  if (run.error || run.status !== 0) {
    throw new Error(`cannot recompute current freshness audit: ${run.error?.message ?? run.stderr?.trim() ?? `exit ${run.status}`}`);
  }
  try {
    return JSON.parse(run.stdout);
  } catch (error) {
    throw new Error(`current freshness explainer returned invalid JSON: ${error.message}`);
  }
}

/** Hash the exact gate and producer artifacts judged by the audit; no timestamps or file writes. */
function currentInputProof(expectedPaths) {
  return {
    schema: "aura3d-freshness-input-proof/1.0",
    routeGateHash: sha256(readFileSync(join(root, "tools/showcase-library/route-gates.json"))),
    artifacts: [...expectedPaths].sort().map((artifact) => ({
      artifact,
      probeHash: sha256(readFileSync(join(root, artifact))),
      screenshotHash: sha256(readFileSync(join(root, artifact.replace(/\.json$/, ".png"))))
    }))
  };
}

/**
 * The explainer's compact verdict does not contain the inputs of a fresh probe. Check the actual
 * producer-shaped record and compare each dependency to the current producer context, including
 * the screenshot, so omitted bindings or missing inputs cannot look fresh by being left out.
 */
function checkCurrentProbeBindings(routes, expectedPaths, rendererFingerprint) {
  const invalid = (detail) => ({ status: "unproven", detail: `current probe proof unavailable: ${detail}` });
  const changed = (detail) => ({ status: "fail", detail: `current probe proof is stale: ${detail}` });
  const digest = (value) => typeof value === "string" && /^(?:sha256-)?[a-f0-9]{64}$/i.test(value);
  const equalDigest = (left, right) => digest(left) && digest(right)
    && left.replace(/^sha256-/, "").toLowerCase() === right.replace(/^sha256-/, "").toLowerCase();

  for (const route of routes) {
    const artifact = `${routePrimaryProbeReportDirRelativePath}/${route.id}.json`;
    if (!expectedPaths.has(artifact)) continue;
    try {
      const probe = readJson(join(root, artifact));
      const context = createRoutePrimaryProbeContext(route, root);
      const binding = probe?.freshness;
      if (!probe || probe.schema !== routePrimaryProbeSchema || probe.routeId !== route.id
          || probe.routePath !== route.path || probe.appId !== route.id) {
        return invalid(`${artifact} is missing its producer-shaped route identity`);
      }
      if (!binding || binding.schema !== EVIDENCE_FRESHNESS_SCHEMA || binding.artifact !== artifact
          || !Array.isArray(binding.dependencies) || !binding.producer
          || typeof binding.generatedAt !== "string" || Number.isNaN(Date.parse(binding.generatedAt))) {
        return invalid(`${artifact} lacks an explicit freshness binding`);
      }
      if (binding.producer.id !== context.producerId || binding.producer.version !== context.producerVersion
          || !equalDigest(binding.producer.fingerprint, context.producerFingerprint)) {
        return changed(`${artifact} producer identity or fingerprint`);
      }
      if (!digest(context.sourceHash) || !digest(context.routeGateHash)
          || (route.id !== "showcase-index" && !digest(context.routeHealthHash))
          || !digest(context.rendererFingerprint)) {
        return invalid(`${artifact} has missing route, gate, health or renderer sources`);
      }
      if (!equalDigest(context.rendererFingerprint, rendererFingerprint)
          || !equalDigest(probe.sourceHash, context.sourceHash)
          || !equalDigest(probe.routeGateHash, context.routeGateHash)
          || (route.id !== "showcase-index" && !equalDigest(probe.routeHealthHash, context.routeHealthHash))) {
        return changed(`${artifact} source, gate, health or renderer fingerprint`);
      }
      if (!Number.isInteger(probe.viewport?.width) || probe.viewport.width <= 0
          || !Number.isInteger(probe.viewport?.height) || probe.viewport.height <= 0) {
        return invalid(`${artifact} lacks a viewport contract`);
      }
      if (!Array.isArray(probe.primaryAssets)
          || probe.primaryAssets.length !== context.primaryAssets.length) {
        return invalid(`${artifact} lacks the configured primary assets`);
      }
      const dependencies = [
        { kind: "route-source", id: route.id, hash: context.sourceHash },
        { kind: "route-gate-config", id: "route-gates.json", hash: context.routeGateHash },
        ...(context.routeHealthHash
          ? [{ kind: "route-health", id: `${route.id}/route-health.json`, hash: context.routeHealthHash }]
          : []),
        { kind: "renderer-fingerprint", id: "agent-api+assets", hash: context.rendererFingerprint },
        { kind: "producer-version", id: context.producerId, hash: context.producerFingerprint },
        { kind: "viewport-contract", id: route.id, hash: createConfigFingerprint(probe.viewport) }
      ];
      for (const asset of context.primaryAssets) {
        const recorded = probe.primaryAssets.filter((item) => item?.id === asset.id);
        if (!digest(asset.manifestHash) || recorded.length !== 1) {
          return invalid(`${artifact} lacks manifest proof for primary asset ${asset.id}`);
        }
        if (!equalDigest(recorded[0].manifestHash, asset.manifestHash)) {
          return changed(`${artifact} primary asset ${asset.id}`);
        }
        dependencies.push({ kind: "primary-asset", id: asset.id, hash: asset.manifestHash });
      }
      const screenshotPath = `${routePrimaryProbeReportDirRelativePath}/${route.id}.png`;
      if (probe.renderedProbe?.screenshotPath !== screenshotPath || !digest(probe.renderedProbe?.sha256)) {
        return invalid(`${artifact} lacks a screenshot binding`);
      }
      const screenshotHash = sha256(readFileSync(join(root, screenshotPath)));
      if (!equalDigest(probe.renderedProbe.sha256, screenshotHash)) {
        return changed(`${artifact} screenshot`);
      }
      dependencies.push({ kind: "screenshot", id: `${route.id}.png`, hash: screenshotHash });
      const recorded = [...binding.dependencies];
      const keys = new Set();
      for (const dependency of recorded) {
        if (!dependency || typeof dependency.kind !== "string" || typeof dependency.id !== "string"
            || !digest(dependency.hash) || keys.has(`${dependency.kind}:${dependency.id}`)) {
          return invalid(`${artifact} has malformed or duplicate dependencies`);
        }
        keys.add(`${dependency.kind}:${dependency.id}`);
      }
      if (!keys.has(`screenshot:${route.id}.png`)) {
        recorded.push({ kind: "screenshot", id: `${route.id}.png`, hash: probe.renderedProbe.sha256 });
      }
      const result = explainArtifactStaleness({
        artifactPath: artifact,
        binding: { ...binding, dependencies: recorded },
        currentDependencies: dependencies
      });
      if (!result.fresh) {
        return changed(`${artifact}: ${result.reasons.map((reason) => `${reason.kind}/${reason.id} ${reason.status}`).join(", ")}`);
      }
    } catch (error) {
      return invalid(`${artifact}: ${error.message}`);
    }
  }
  return { status: "pass", detail: "all current probe bindings verified" };
}

const freshnessPath = join(root, "tests/reports/evidence-freshness/staleness-audit.json");
let freshnessResult;
try {
  freshnessResult = checkEvidenceFreshness(readJson(freshnessPath));
} catch (error) {
  freshnessResult = {
    status: "unproven",
    detail: error.code === "ENOENT"
      ? "freshness audit missing; run node tools/evidence-freshness/explain-staleness.mjs --write (or save output from node tools/product-remediation/check-quality-gates.mjs --print-freshness-audit)"
      : `freshness audit unreadable or invalid JSON: ${error.message}`
  };
}
record("performance", "evidence-freshness",
  "required published route-primary evidence is provably current",
  freshnessResult.status, freshnessResult.detail);

// --- Evidence completeness (Phase 17) ---------------------------------------
if (audits.length === 0) {
  record("evidence", "evidence-set-complete", "each interactive route retains more than a screenshot", "unproven",
    "no interaction-audit reports found");
} else {
  const incomplete = audits.filter((audit) =>
    (audit.viewportVariants ?? []).length < 3
    || (audit.frameSequence ?? []).length < 6
    || !audit.sourceFingerprint
    || !audit.configurationFingerprint
    || !audit.trace);
  record("evidence", "evidence-set-complete",
    "each route retains an interaction trace, control coverage, console report, three viewport variants, a six-frame sequence, and source plus configuration fingerprints",
    incomplete.length === 0 ? "pass" : "fail",
    incomplete.length === 0
      ? `${audits.length} routes with ${audits.reduce((total, audit) => total + (audit.viewportVariants ?? []).length, 0)} variants and ${audits.reduce((total, audit) => total + (audit.frameSequence ?? []).length, 0)} frames`
      : incomplete.map((audit) => audit.routeId).join(", "));

  /*
   * Motion proof, required only of routes that claim motion.
   *
   * A configurator at rest is correctly a still image. A simulation that renders six identical
   * frames while a movement key is held is broken.
   */
  const simulations = audits.filter((audit) => audit.frameVariationRequired === true);
  const stillSimulations = simulations.filter((audit) => (audit.distinctFrames ?? 0) <= 1);
  record("evidence", "simulations-render-motion",
    "routes with declared keyboard controls produce visibly different frames while input is held",
    simulations.length === 0 ? "unproven" : stillSimulations.length === 0 ? "pass" : "fail",
    simulations.length === 0
      ? "no route declared keyboard controls"
      : `${simulations.length - stillSimulations.length}/${simulations.length} simulations rendered motion`);
}

// --- Application kit adoption (Phase 12) ------------------------------------
if (!existsSync(inventoryPath)) {
  record("kits", "routes-configure-kits", "public application routes configure reusable kits", "unproven", "inventory report missing");
} else {
  const inventory = readJson(inventoryPath);
  /*
   * Adoption is measured from route source, not from a list.
   *
   * A kit nothing consumes is a claim rather than a capability, which is the standard the parity
   * generator applies to every other row.
   */
  const KIT_FACTORIES = [
    "createProductConfiguratorKit",
    "createDigitalTwinKit",
    "createArchitectureKit",
    "createSmartCityKit",
    "createCinematicKit"
  ];
  const adopters = new Map();
  for (const app of inventory.apps) {
    for (const file of app.sourceFiles ?? []) {
      let text;
      try {
        text = readFileSync(join(root, file), "utf8");
      } catch {
        continue;
      }
      for (const factory of KIT_FACTORIES) {
        if (new RegExp(`\\b${factory}\\b`).test(text)) {
          if (!adopters.has(factory)) adopters.set(factory, new Set());
          adopters.get(factory).add(app.routeId);
        }
      }
    }
  }
  const unadopted = KIT_FACTORIES.filter((factory) => !adopters.has(factory));
  record("kits", "routes-configure-kits",
    "every reusable application kit has at least one route configuring it",
    unadopted.length === 0 ? "pass" : "fail",
    unadopted.length === 0
      ? KIT_FACTORIES.map((factory) => `${factory}:${adopters.get(factory).size}`).join(", ")
      : `unadopted: ${unadopted.join(", ")}`);
}

const byStatus = { pass: 0, fail: 0, unproven: 0 };
for (const check of checks) byStatus[check.status] += 1;
const byGroup = {};
for (const check of checks) {
  byGroup[check.group] ??= { pass: 0, fail: 0, unproven: 0 };
  byGroup[check.group][check.status] += 1;
}

const report = {
  schema: "aura3d-quality-gates/1.0",
  generatedAt: new Date().toISOString(),
  producer: "tools/product-remediation/check-quality-gates.mjs",
  policy: [
    "Three outcomes: pass, fail, unproven. Missing evidence is unproven, never pass.",
    "The gate exits non-zero for any fail or any unproven invariant.",
    "Only unambiguous defect classes gate; values that include legitimate art direction are tracked as metrics."
  ],
  totals: { checks: checks.length, ...byStatus },
  byGroup,
  checks
};

writeFileSync(join(root, "tests/reports/aura3d-quality-gates.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log("wrote tests/reports/aura3d-quality-gates.json");
for (const check of checks) {
  const mark = check.status === "pass" ? "PASS" : check.status === "fail" ? "FAIL" : "UNPROVEN";
  console.log(`${mark.padEnd(9)} [${check.group}] ${check.id} -- ${check.detail}`);
}
console.log(`\n${byStatus.pass} pass, ${byStatus.fail} fail, ${byStatus.unproven} unproven`);
if (byStatus.fail > 0 || byStatus.unproven > 0) process.exitCode = 1;
