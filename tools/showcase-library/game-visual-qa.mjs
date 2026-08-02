import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  readPngDifferenceMetrics,
  readPngFlatRegionMetrics,
  readPngForegroundMetrics,
  readPngVisualCompositionMetrics
} from "./png-foreground.mjs";
import { createRouteSourceHash, hashRouteHealthDependency } from "./route-primary-probes.mjs";

export const GAME_VISUAL_QA_CHECKS = [
  "subject-bound-to-surface",
  "contact",
  "camera-readability",
  "scale-contract",
  "debug-guide-absence",
  "subject-pixel-isolation",
  "viewport-composition",
  "foreground-background-balance",
  "flat-region-budget",
  "hud-occlusion-budget",
  "material-visual-change",
  "gameplay-pixel-change"
];
export const STRUCTURAL_GAME_CHECKS = [
  "subject-bound-to-surface", "contact", "camera-readability", "scale-contract", "debug-guide-absence"
];
export const IMAGE_GAME_CHECKS = GAME_VISUAL_QA_CHECKS.filter((id) => !STRUCTURAL_GAME_CHECKS.includes(id));
const compositionCheck = {
  "subject-bound-to-surface": "binding-overlap", contact: "contact", "camera-readability": "camera-readability",
  "scale-contract": "scale-contract", "debug-guide-absence": "debug-guide-absence"
};

export function validateGameVisualQa(input) {
  const root = resolve(input.root ?? process.cwd());
  const routeId = input.route.id;
  const category = input.route.gameTemplateStatus?.category;
  const failures = [];
  const health = input.routeHealth ?? readJson(root, `apps/${routeId}/route-health.json`, failures, "route-health");
  const pair = record(health?.gameAssetPairEvidence);
  const compositionPath = string(pair?.compositionReport);
  const probePath = `tests/reports/showcase-route-primary-probes/${routeId}.json`;
  const composition = compositionPath ? readJson(root, compositionPath, failures, "composition") : undefined;
  if (!compositionPath) failures.push("composition-path-missing");
  const probe = readJson(root, probePath, failures, "route-primary");
  const screenshotPath = string(composition?.screenshot?.path) ?? `tests/reports/showcase-route-primary-probes/${routeId}.png`;
  const screenshotAbsolute = safeResolve(root, screenshotPath, failures, "screenshot");
  let pngMetrics;
  let compositionMetrics;
  let flatMetrics;
  let isolatedMetrics;
  const viewportMetrics = [];
  if (screenshotAbsolute && existsSync(screenshotAbsolute)) {
    try {
      pngMetrics = input.pngMetrics ?? readPngForegroundMetrics(screenshotAbsolute, probe?.renderedProbe?.analysisCrop);
      compositionMetrics = input.compositionMetrics ??
        readPngVisualCompositionMetrics(screenshotAbsolute, probe?.renderedProbe?.analysisCrop);
      /*
       * Reuse the composition pass's flat-region numbers instead of decoding the frame a second time.
       * A separate `readPngFlatRegionMetrics` call here tripled decode work on the visual-QA path and
       * pushed `showcase-route-gates` past its 20s timeout.
       */
      flatMetrics = input.flatMetrics ?? (compositionMetrics && typeof compositionMetrics.flatFraction === "number"
        ? {
          width: compositionMetrics.width,
          height: compositionMetrics.height,
          crop: compositionMetrics.crop,
          quantiseBits: compositionMetrics.quantiseBits,
          dominantBucketFraction: compositionMetrics.dominantBucketFraction,
          flatFraction: compositionMetrics.flatFraction,
          distinctBuckets: compositionMetrics.distinctBuckets
        }
        : readPngFlatRegionMetrics(screenshotAbsolute, probe?.renderedProbe?.analysisCrop));
      const suppressedPath = string(probe?.renderedProbe?.subjectSuppressedScreenshotPath);
      const suppressedAbsolute = suppressedPath ? safeResolve(root, suppressedPath, failures, "subject-suppressed") : undefined;
      if (suppressedAbsolute && existsSync(suppressedAbsolute)) {
        isolatedMetrics = input.isolatedMetrics ?? readPngDifferenceMetrics(
          screenshotAbsolute,
          suppressedAbsolute,
          probe?.renderedProbe?.analysisCrop
        );
      } else if (!input.isolatedMetrics) {
        failures.push(`subject-suppressed-missing:${String(suppressedPath)}`);
      }
    }
    catch (error) { failures.push(`png-analysis:${error instanceof Error ? error.message : String(error)}`); }
  } else if (screenshotAbsolute) failures.push(`screenshot-missing:${screenshotPath}`);
  const healthEvidence = record(health?.evidence);
  for (const [kind, path] of [
    ["desktop", string(healthEvidence?.desktopScreenshot)],
    ["mobile", string(healthEvidence?.mobileScreenshot)]
  ]) {
    const canonicalViewportPath = `tests/reports/showcase-library-screenshots/${routeId}-${kind}.png`;
    const selectedPath = existsSync(resolve(root, canonicalViewportPath)) ? canonicalViewportPath : path;
    if (!selectedPath) {
      viewportMetrics.push({ kind, path: null, missing: true });
      continue;
    }
    const absolute = safeResolve(root, selectedPath, failures, `${kind}-screenshot`);
    if (!absolute || !existsSync(absolute)) {
      viewportMetrics.push({ kind, path: selectedPath, missing: true });
      continue;
    }
    try {
      viewportMetrics.push({
        kind,
        path: selectedPath,
        sha256: hash(readFileSync(absolute)),
        // Carries dominantBucketFraction / flatFraction / distinctBuckets from the same single pass.
        ...readPngVisualCompositionMetrics(absolute)
      });
    } catch (error) {
      failures.push(`${kind}-screenshot-analysis:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const checks = [];
  for (const id of GAME_VISUAL_QA_CHECKS.slice(0, 5)) {
    const sourceId = compositionCheck[id];
    const source = Array.isArray(composition?.checks) ? composition.checks.find((check) => check?.id === sourceId) : undefined;
    const blockers = [];
    if (!source) blockers.push(`composition-check-missing:${sourceId}`);
    else if (source.verdict !== "pass") blockers.push(...(Array.isArray(source.blockers) && source.blockers.length ? source.blockers : [`composition-check-fail:${sourceId}`]));
    checks.push({ id, verdict: blockers.length ? "fail" : "pass", source: sourceId, tolerance: source?.tolerance ?? {}, measured: source?.measured ?? {}, blockers });
  }
  const subjectIsolationBlockers = [];
  const minSubjectAreaRatio = category === "racing" ? 0.008 : 0.006;
  const isolatedAreaRatio = isolatedMetrics?.foregroundAreaRatio ?? 0;
  if (!isolatedMetrics?.foregroundBounds) subjectIsolationBlockers.push("isolated-subject-missing");
  if (isolatedMetrics?.clipped === true) subjectIsolationBlockers.push("isolated-subject-clipped");
  if (isolatedAreaRatio < minSubjectAreaRatio) {
    subjectIsolationBlockers.push(`isolated-subject-too-small:${isolatedAreaRatio}`);
  }
  checks.push({
    id: "subject-pixel-isolation",
    verdict: subjectIsolationBlockers.length ? "fail" : "pass",
    source: "visible-minus-subject-suppressed-pixels",
    tolerance: { minSubjectAreaRatio, clipped: false },
    measured: isolatedMetrics ?? {},
    blockers: subjectIsolationBlockers
  });

  const viewportBlockers = [];
  if (compositionMetrics?.clipped === true) viewportBlockers.push("viewport-primary-component-clipped");
  if ((compositionMetrics?.edgeOccupancyRatio ?? 1) > 0.42) {
    viewportBlockers.push(`viewport-edge-occupancy:${String(compositionMetrics?.edgeOccupancyRatio)}`);
  }
  if ((compositionMetrics?.foregroundCoverageRatio ?? 0) < 0.025) {
    viewportBlockers.push(`empty-proof-staging:${String(compositionMetrics?.foregroundCoverageRatio)}`);
  }
  /*
   * A full-bleed viewport is not a clipped subject.
   *
   * `readPngVisualCompositionMetrics().clipped` means "the analysed foreground component touches a frame
   * edge". For the *isolated subject* probe that is a genuine defect and is still blocked above via
   * `isolated-subject-clipped`. For a whole viewport screenshot it is normal and often correct: a chase
   * camera on a racing circuit fills the frame edge-to-edge with road, barriers and terrain by design,
   * and Turbo Drift Circuit measures `foregroundCoverageRatio` 0.974 desktop / 0.912 mobile with
   * `edgeOccupancyRatio` 0.189 / 0.186 -- well inside the 0.42 edge budget. Blocking that as
   * "foreground clipped" would require deliberately letting background intrude at the frame edge, which
   * is the opposite of the composition this check exists to protect.
   *
   * So a full-bleed viewport is only blocked when it *also* crowds the frame edge with the subject
   * component, which is what `edgeOccupancyRatio` already measures.
   */
  for (const viewport of viewportMetrics) {
    if (viewport.missing) viewportBlockers.push(`${viewport.kind}-screenshot-missing`);
    if (viewport.clipped === true && (viewport.edgeOccupancyRatio ?? 0) > 0.42) {
      viewportBlockers.push(`${viewport.kind}-foreground-clipped-and-edge-crowded:${String(viewport.edgeOccupancyRatio)}`);
    }
    if (typeof viewport.foregroundCoverageRatio === "number" && viewport.foregroundCoverageRatio < 0.02) {
      viewportBlockers.push(`${viewport.kind}-empty-staging:${viewport.foregroundCoverageRatio}`);
    }
    if (typeof viewport.edgeOccupancyRatio === "number" && viewport.edgeOccupancyRatio > 0.5) {
      viewportBlockers.push(`${viewport.kind}-edge-occupancy:${viewport.edgeOccupancyRatio}`);
    }
  }
  checks.push({
    id: "viewport-composition",
    verdict: viewportBlockers.length ? "fail" : "pass",
    source: "composed-screenshot-pixels",
    tolerance: { maxEdgeOccupancyRatio: 0.42, minForegroundCoverageRatio: 0.025 },
    measured: { composed: compositionMetrics ?? {}, viewports: viewportMetrics },
    blockers: viewportBlockers
  });

  const balanceBlockers = [];
  if ((compositionMetrics?.largestComponentAreaRatio ?? 0) > 0.72) {
    balanceBlockers.push(`giant-foreground-occluder:${String(compositionMetrics?.largestComponentAreaRatio)}`);
  }
  if ((compositionMetrics?.backgroundCoverageRatio ?? 0) < 0.08) {
    balanceBlockers.push(`background-balance:${String(compositionMetrics?.backgroundCoverageRatio)}`);
  }
  checks.push({
    id: "foreground-background-balance",
    verdict: balanceBlockers.length ? "fail" : "pass",
    source: "composed-screenshot-pixels",
    tolerance: { maxLargestComponentAreaRatio: 0.72, minBackgroundCoverageRatio: 0.08 },
    measured: compositionMetrics ?? {},
    blockers: balanceBlockers
  });

  /*
   * Documented empty-flat-region budget.
   *
   * ## Why this check exists
   *
   * The brief requires a "documented threshold" on empty-sky dominance and lists it as an acceptance
   * requirement for Skyline Runner. Nothing enforced one. `measureFlatRegionFraction` was added to the
   * engine's composition layer and used only in unit tests against synthetic pixel buffers, so the
   * *shipped* frame's flat-region fraction was never gated -- and no other check can see it: every
   * existing image check measures the frame relative to its background colour, and flat sky *is* the
   * background.
   *
   * ## Where the numbers come from
   *
   * Measured on the current retained frames, not chosen by taste:
   *
   * | frame | dominantBucketFraction | flatFraction |
   * | --- | --- | --- |
   * | Turbo Drift Circuit route-primary | 0.167 | 0.324 |
   * | Blockfall Reactor route-primary | 0.322 | 0.431 |
   * | Skyline Runner route-primary (before the planned sky) | 0.437 | 0.598 |
   *
   * The budget is set to `maxDominantBucketFraction: 0.42` / `maxFlatFraction: 0.58`. That is deliberately
   * tight enough that Skyline's pre-fix frame **fails** it -- a threshold every current frame already
   * passes would document nothing and prevent nothing -- and loose enough that Turbo and Blockfall, whose
   * composition is not in question, keep passing with real headroom.
   *
   * Viewport captures are held to a looser `maxViewportFlatFraction`. A mobile capture shows far less
   * horizontal world at the same camera distance, so its sky share is structurally higher; holding it to the
   * desktop number would reward cropping the level rather than composing the frame.
   */
  const flatBudget = { maxDominantBucketFraction: 0.42, maxFlatFraction: 0.58, maxViewportFlatFraction: 0.62 };
  const flatBlockers = [];
  if (!flatMetrics) flatBlockers.push("flat-region-metrics-missing");
  else {
    if (flatMetrics.dominantBucketFraction > flatBudget.maxDominantBucketFraction) {
      flatBlockers.push(`dominant-flat-region:${flatMetrics.dominantBucketFraction}`);
    }
    if (flatMetrics.flatFraction > flatBudget.maxFlatFraction) {
      flatBlockers.push(`flat-region-fraction:${flatMetrics.flatFraction}`);
    }
  }
  for (const viewport of viewportMetrics) {
    if (viewport.missing) continue;
    if (typeof viewport.flatFraction !== "number") {
      flatBlockers.push(`${viewport.kind}-flat-region-metrics-missing`);
      continue;
    }
    if (viewport.flatFraction > flatBudget.maxViewportFlatFraction) {
      flatBlockers.push(`${viewport.kind}-flat-region-fraction:${viewport.flatFraction}`);
    }
  }
  checks.push({
    id: "flat-region-budget",
    verdict: flatBlockers.length ? "fail" : "pass",
    source: "quantised-colour-bucket-concentration",
    tolerance: flatBudget,
    measured: {
      composed: flatMetrics ?? {},
      viewports: viewportMetrics.map((viewport) => ({
        kind: viewport.kind,
        flatFraction: viewport.flatFraction,
        dominantBucketFraction: viewport.dominantBucketFraction,
        distinctBuckets: viewport.distinctBuckets
      }))
    },
    blockers: flatBlockers
  });
  const rendered = record(probe?.renderedProbe);
  const compositionProbe = record(probe?.compositionProbe);
  const injectedPngMetrics = input.pngMetrics !== undefined;
  const subjectBounds = injectedPngMetrics ? pngMetrics?.foregroundBounds : record(compositionProbe?.subjectBounds) ?? record(rendered?.foregroundBounds);
  const analysisCrop = injectedPngMetrics ? pngMetrics?.crop : record(rendered?.analysisCrop) ?? pngMetrics?.crop;
  const subjectClipped = injectedPngMetrics ? pngMetrics?.clipped : compositionProbe?.subjectClipped ?? rendered?.clipped;
  const subjectReadabilityScore = injectedPngMetrics ? pngMetrics?.readabilityScore : compositionProbe?.subjectReadabilityScore ?? rendered?.readabilityScore;
  const hudBlockers = [];
  const minReadabilityScore = 30;
  const maxForegroundAreaRatio = 0.78;
  const foregroundAreaRatio = subjectBounds && analysisCrop
    ? round((subjectBounds.width * subjectBounds.height) / (analysisCrop.width * analysisCrop.height)) : 0;
  if (rendered?.occludedByUi !== false) hudBlockers.push(`hud-occluded:${String(rendered?.occludedByUi)}`);
  if (rendered?.clipped !== false || subjectClipped !== false) hudBlockers.push("hud-subject-clipped");
  if (typeof subjectReadabilityScore !== "number" || subjectReadabilityScore < minReadabilityScore) hudBlockers.push(`hud-readability:${String(subjectReadabilityScore)}`);
  if (foregroundAreaRatio > maxForegroundAreaRatio) hudBlockers.push(`hud-foreground-area:${foregroundAreaRatio}`);
  checks.push({ id: "hud-occlusion-budget", verdict: hudBlockers.length ? "fail" : "pass", source: "route-primary-subject-isolation", tolerance: { occludedByUi: false, clipped: false, minReadabilityScore, maxForegroundAreaRatio }, measured: { occludedByUi: rendered?.occludedByUi, clipped: subjectClipped, readabilityScore: subjectReadabilityScore, foregroundAreaRatio }, blockers: hudBlockers });

  const visualChangeBlockers = [];
  const baselinePath = string(input.baselinePath ?? input.route.visualChangeBaseline);
  let visualChange;
  if (baselinePath) {
    const baselineAbsolute = safeResolve(root, baselinePath, failures, "visual-baseline");
    if (!baselineAbsolute || !existsSync(baselineAbsolute)) {
      visualChangeBlockers.push(`visual-baseline-missing:${baselinePath}`);
    } else if (screenshotAbsolute) {
      try {
        visualChange = input.visualChangeMetrics ??
          readPngDifferenceMetrics(screenshotAbsolute, baselineAbsolute, input.materialChangeCrop ?? analysisCrop, 18);
        if ((visualChange.nonBackgroundRatio ?? 0) < 0.035) {
          visualChangeBlockers.push(`scene-material-change-too-small:${visualChange.nonBackgroundRatio}`);
        }
      } catch (error) {
        visualChangeBlockers.push(`visual-change-analysis:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  checks.push({
    id: "material-visual-change",
    verdict: visualChangeBlockers.length ? "fail" : "pass",
    source: baselinePath ? "approved-baseline-minus-rebuilt-scene-outside-hud" : "not-required-without-approved-baseline",
    tolerance: { minChangedRatio: baselinePath ? 0.035 : 0 },
    measured: visualChange ?? {},
    blockers: visualChangeBlockers
  });

  const gameplayChangeBlockers = [];
  let gameplayChange;
  const gameplayBeforePath = string(healthEvidence?.gameplayBeforeScreenshot) ??
    `tests/reports/showcase-gameplay/${routeId}-before-input.png`;
  const gameplayAfterPath = string(healthEvidence?.gameplayAfterInputScreenshot) ??
    `tests/reports/showcase-gameplay/${routeId}-after-input.png`;
  const gameplayBeforeAbsolute = safeResolve(root, gameplayBeforePath, failures, "gameplay-before");
  const gameplayAfterAbsolute = safeResolve(root, gameplayAfterPath, failures, "gameplay-after");
  if (!gameplayBeforeAbsolute || !existsSync(gameplayBeforeAbsolute)) {
    gameplayChangeBlockers.push(`gameplay-before-missing:${gameplayBeforePath}`);
  }
  if (!gameplayAfterAbsolute || !existsSync(gameplayAfterAbsolute)) {
    gameplayChangeBlockers.push(`gameplay-after-missing:${gameplayAfterPath}`);
  }
  if (gameplayBeforeAbsolute && gameplayAfterAbsolute &&
      existsSync(gameplayBeforeAbsolute) && existsSync(gameplayAfterAbsolute)) {
    try {
      gameplayChange = input.gameplayChangeMetrics ??
        readPngDifferenceMetrics(gameplayAfterAbsolute, gameplayBeforeAbsolute, input.gameplayChangeCrop, 18);
      if ((gameplayChange.nonBackgroundRatio ?? 0) < 0.002) {
        gameplayChangeBlockers.push(`gameplay-pixel-delta-too-small:${gameplayChange.nonBackgroundRatio}`);
      }
    } catch (error) {
      gameplayChangeBlockers.push(`gameplay-change-analysis:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  checks.push({
    id: "gameplay-pixel-change",
    verdict: gameplayChangeBlockers.length ? "fail" : "pass",
    source: "mounted-gameplay-before-minus-after-pixels",
    tolerance: { minChangedRatio: 0.002 },
    measured: gameplayChange ?? {},
    blockers: gameplayChangeBlockers
  });

  if (composition?.schema !== "aura3d-showcase-asset-pair-composition/1.0") failures.push(`composition-schema:${String(composition?.schema)}`);
  if (composition?.routeId !== routeId) failures.push(`composition-route:${String(composition?.routeId)}`);
  if (composition?.category !== category) failures.push(`composition-category:${String(composition?.category)}`);
  if (composition?.verdict !== "pass" || composition?.pass !== true) failures.push(`composition-verdict:${String(composition?.verdict)}`);
  if (probe?.routeId !== routeId || probe?.pass !== true) failures.push(`route-primary-verdict:${String(probe?.pass)}`);
  if (pair?.verdict !== "pass") failures.push(`route-health-pair-verdict:${String(pair?.verdict)}`);
  if (pair?.screenshotEvidence !== screenshotPath) failures.push("route-health-screenshot-link");
  const screenshotHash = screenshotAbsolute && existsSync(screenshotAbsolute) ? hash(readFileSync(screenshotAbsolute)) : undefined;
  if (screenshotHash && composition?.screenshot?.sha256 !== screenshotHash) failures.push("composition-screenshot-stale");
  if (screenshotHash && rendered?.sha256 !== screenshotHash) failures.push("route-primary-screenshot-stale");
  if (probe?.sourceHash !== createRouteSourceHash(routeId, root)) failures.push("route-primary-source-stale");
  const healthAbsolute = safeResolve(root, `apps/${routeId}/route-health.json`, failures, "route-health");
  /*
   * Hash the same narrowed dependency the probe binds.
   *
   * Hashing the whole file here re-created the ordering cycle on the consumer side: the composition producer rewrites
   * `gameAssetPairEvidence` (which it derives from this very probe), so a whole-file comparison always reported the
   * probe as stale after composition ran, forcing a second probe run. `hashRouteHealthDependency` excludes that block,
   * so producer and consumer agree on what the probe actually depends on.
   */
  if (healthAbsolute && existsSync(healthAbsolute) && probe?.routeHealthHash !== hashRouteHealthDependency(healthAbsolute)) {
    failures.push("route-primary-health-stale");
  }
  for (const check of checks) if (check.verdict !== "pass") failures.push(...check.blockers.map((blocker) => `${check.id}:${blocker}`));
  const unique = [...new Set(failures)];
  return {
    schema: "aura3d-game-visual-qa/2.0",
    routeId,
    category,
    verdict: unique.length ? "fail" : "pass",
    pass: unique.length === 0,
    evidenceLabel: "structural/image QA pass",
    humanVisualApproval: false,
    humanVisualApprovalNote:
      "Structural and image QA only. This report never records human visual approval.",
    structuralChecks: checks.filter((check) => STRUCTURAL_GAME_CHECKS.includes(check.id)),
    imageChecks: checks.filter((check) => IMAGE_GAME_CHECKS.includes(check.id)),
    humanReviewRequiredFor: ["art-direction", "lighting-hierarchy", "coherence", "polish", "public-demo-acceptability"],
    compositionReport: compositionPath,
    routePrimaryProbe: probePath,
    screenshot: {
      path: screenshotPath,
      sha256: screenshotHash,
      metrics: pngMetrics,
      compositionMetrics,
      flatMetrics,
      isolatedMetrics,
      viewportMetrics,
      gameplayChange: {
        beforePath: gameplayBeforePath,
        afterPath: gameplayAfterPath,
        metrics: gameplayChange
      }
    },
    checks,
    blockers: unique
  };
}

export function writeGameVisualQaReport(input, outputPath) {
  const report = validateGameVisualQa(input); const path = resolve(input.root ?? process.cwd(), outputPath ?? `tests/reports/showcase-game-visual-qa/${input.route.id}.json`);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`); return report;
}
function readJson(root, path, failures, label) { const absolute = safeResolve(root, path, failures, label); if (!absolute) return undefined; if (!existsSync(absolute)) { failures.push(`${label}-missing:${path}`); return undefined; } try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { failures.push(`${label}-invalid-json:${path}`); return undefined; } }
function safeResolve(root, path, failures, label) { if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\0")) { failures.push(`${label}-unsafe-path:${String(path)}`); return undefined; } const absolute = resolve(root, path); const rel = relative(root, absolute); if (rel.startsWith("..") || isAbsolute(rel)) { failures.push(`${label}-unsafe-path:${path}`); return undefined; } return absolute; }
function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : undefined; }
function string(value) { return typeof value === "string" && value ? value : undefined; }
function hash(bytes) { return `sha256-${createHash("sha256").update(bytes).digest("hex")}`; }
function round(value) { return Math.round(value * 10000) / 10000; }
