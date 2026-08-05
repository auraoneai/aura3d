import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { readPngPerceptualSignature } from "./png-foreground.mjs";
import { createRouteSourceHash } from "./route-primary-probes.mjs";

export const showcaseVisualReviewSchema = "aura3d-showcase-visual-review/2.0";
export const showcaseVisualReviewRelativePath = "docs/project/showcase-visual-review.json";

const verdicts = new Set(["pass", "fail", "needs-work"]);
const approvalScopes = new Set(["public-release", "development-review", "diagnostic-only"]);
const screenshotKinds = new Set(["desktop", "mobile", "gameplay", "first-load", "interaction", "result"]);
const nonHumanReviewerPattern = /\b(?:machine|fixture|bot|automation|automated|ci|system|pending|unassigned|unknown|test)\b/i;

/**
 * Manual review is a downward-only release veto. It can reject machine-passing
 * evidence, but it can never promote evidence that failed an automated gate.
 */
export function applyDownwardOnlyManualReview(input) {
  const validatorOk = input.validatorOk === true;
  const manualReviewOk = input.manualReviewOk === true;
  return {
    ok: validatorOk && manualReviewOk,
    validatorOk,
    manualReviewOk,
    vetoedByManualReview: validatorOk && !manualReviewOk,
    blockedByValidator: !validatorOk
  };
}

export function loadAndValidateShowcaseVisualReview(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const relativePath = options.path ?? showcaseVisualReviewRelativePath;
  const absolutePath = safeResolve(root, relativePath);
  if (!absolutePath || !existsSync(absolutePath)) {
    return emptyReview(relativePath, [`missing-showcase-visual-review:${relativePath}`]);
  }
  try {
    return validateShowcaseVisualReviewRecord(
      JSON.parse(readFileSync(absolutePath, "utf8")),
      { ...options, root, path: relativePath }
    );
  } catch (error) {
    return emptyReview(relativePath, [
      `invalid-showcase-visual-review-json:${error instanceof Error ? error.message : String(error)}`
    ]);
  }
}

export function validateShowcaseVisualReviewRecord(review, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const relativePath = options.path ?? showcaseVisualReviewRelativePath;
  const routes = Array.isArray(options.routes) ? options.routes : [];
  const failures = [];

  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return emptyReview(relativePath, ["visual-review-not-object"]);
  }
  if (review.schema !== showcaseVisualReviewSchema) {
    failures.push(`visual-review-schema:${String(review.schema)}`);
  }
  const reviewer = validateReviewer(review.reviewer, failures);
  const reviewedAtMs = timestampMs(review.reviewedAt);
  if (reviewedAtMs === undefined) failures.push(`visual-review-reviewed-at:${String(review.reviewedAt)}`);
  if (!isCommitSha(review.sourceCommit)) failures.push(`visual-review-source-commit:${String(review.sourceCommit)}`);
  if (!verdicts.has(review.overallVerdict)) {
    failures.push(`visual-review-overall-verdict:${String(review.overallVerdict)}`);
  }
  if (!substantive(review.summary)) failures.push("visual-review-summary");
  if (!Array.isArray(review.routes)) failures.push("visual-review-routes-not-array");

  const routeReviews = new Map();
  const routeResults = new Map();
  for (const entry of Array.isArray(review.routes) ? review.routes : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !substantive(entry.id)) {
      failures.push("visual-review-route-invalid");
      continue;
    }
    if (routeReviews.has(entry.id)) {
      failures.push(`visual-review-route-duplicate:${entry.id}`);
      continue;
    }
    routeReviews.set(entry.id, entry);
    const route = routes.find((candidate) => candidate.id === entry.id) ?? { id: entry.id };
    routeResults.set(entry.id, validateRouteReviewRecord(route, entry, {
      root,
      documentReviewedAtMs: reviewedAtMs,
      documentSourceCommit: review.sourceCommit,
      reviewer
    }));
  }

  const hasPassingRoute = [...routeResults.values()].some((result) => result.verdict === "pass");
  if ((review.overallVerdict === "pass" || hasPassingRoute) && reviewer.human !== true) {
    failures.push("visual-review-human-reviewer-required");
  }
  if (review.overallVerdict === "pass") {
    for (const route of routes.filter((candidate) => candidate.releaseClass === "release-ready candidate")) {
      const result = routeResults.get(route.id);
      if (!result?.ok || result.verdict !== "pass" || result.approvalScope !== "public-release") {
        failures.push(`visual-review-public-route-not-approved:${route.id}`);
      }
    }
  }

  const routeFailures = [...routeResults.values()].flatMap((result) => result.failures);
  const fileOk = failures.length === 0 && routeFailures.length === 0;
  const ok = fileOk && review.overallVerdict === "pass";
  return {
    relativePath,
    ok,
    fileOk,
    reviewer: reviewer.name,
    reviewerRecord: reviewer,
    reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : null,
    sourceCommit: typeof review.sourceCommit === "string" ? review.sourceCommit : null,
    overallVerdict: typeof review.overallVerdict === "string" ? review.overallVerdict : null,
    routeReviews,
    routeResults,
    failures: [
      ...failures,
      ...routeFailures,
      ...(review.overallVerdict === "pass" ? [] : [`visual-review-overall-verdict:${String(review.overallVerdict)}`])
    ]
  };
}

export function validateRouteReviewRecord(route, entry, options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const failures = [];
  const routeId = route.id ?? entry.id;
  const verdict = verdicts.has(entry.verdict) ? entry.verdict : null;
  if (!verdict) failures.push(`route-visual-review-verdict:${routeId}:${String(entry.verdict)}`);
  if (!approvalScopes.has(entry.approvalScope)) {
    failures.push(`route-visual-review-approval-scope:${routeId}:${String(entry.approvalScope)}`);
  }
  const blockingIssues = Array.isArray(entry.blockingIssues)
    ? entry.blockingIssues.filter((issue) => substantive(issue))
    : [];
  if (!Array.isArray(entry.blockingIssues)) {
    failures.push(`route-visual-review-blockers-not-array:${routeId}`);
  }
  if (verdict === "pass" && blockingIssues.length > 0) {
    failures.push(`route-visual-review-pass-with-blockers:${routeId}`);
  }
  if (verdict !== "pass" && blockingIssues.length === 0) {
    failures.push(`route-visual-review-nonpass-without-blockers:${routeId}`);
  }
  if (verdict === "pass" && entry.approvalScope !== "public-release") {
    failures.push(`route-visual-review-pass-not-public-release:${routeId}`);
  }
  if (verdict === "pass" && options.reviewer?.human !== true) {
    failures.push(`route-visual-review-human-reviewer-required:${routeId}`);
  }

  const reviewedAtMs = timestampMs(entry.reviewedAt);
  if (reviewedAtMs === undefined) failures.push(`route-visual-review-reviewed-at:${routeId}:${String(entry.reviewedAt)}`);
  if (entry.sourceCommit !== options.documentSourceCommit || !isCommitSha(entry.sourceCommit)) {
    failures.push(`route-visual-review-source-commit:${routeId}:${String(entry.sourceCommit)}`);
  }

  const expectedSourceHash = createRouteSourceHash(routeId, root);
  if (entry.sourceHash !== expectedSourceHash) {
    failures.push(`route-visual-review-source-hash:${routeId}`);
  }
  const routeHealthPath = resolve(root, "apps", routeId, "route-health.json");
  const expectedRouteHealthHash = existsSync(routeHealthPath) ? hashFile(routeHealthPath) : undefined;
  if (!expectedRouteHealthHash || entry.routeHealthHash !== expectedRouteHealthHash) {
    failures.push(`route-visual-review-route-health-hash:${routeId}`);
  }

  const relevantNewestMtime = newestRelevantMtime(root, routeId);
  if (reviewedAtMs !== undefined && relevantNewestMtime > reviewedAtMs) {
    failures.push(`route-visual-review-stale-source:${routeId}`);
  }
  if (options.documentReviewedAtMs !== undefined && reviewedAtMs !== undefined &&
      reviewedAtMs > options.documentReviewedAtMs) {
    failures.push(`route-visual-review-after-document:${routeId}`);
  }

  const screenshots = Array.isArray(entry.screenshots) ? entry.screenshots : [];
  if (!Array.isArray(entry.screenshots) || screenshots.length === 0) {
    failures.push(`route-visual-review-screenshots:${routeId}`);
  }
  const seenKinds = new Set();
  for (const screenshot of screenshots) {
    const kind = screenshot?.kind;
    if (!screenshotKinds.has(kind)) failures.push(`route-visual-review-screenshot-kind:${routeId}:${String(kind)}`);
    else seenKinds.add(kind);
    const absolute = safeResolve(root, screenshot?.path);
    if (!absolute || !existsSync(absolute)) {
      failures.push(`route-visual-review-screenshot-missing:${routeId}:${String(screenshot?.path)}`);
      continue;
    }
    /*
     * Approval survives a re-render of the *same* frame, but not a changed frame.
     *
     * Binding approval only to `sha256` made this gate unsatisfiable rather than strict. GPU
     * rasterisation is not bit-reproducible: re-rendering an identically settled frame changed
     * 55 of 3,888,000 colour channels (0.0014%, max delta 27/255) — about 18 pixels of a 1.3 MP
     * image, visually identical. So every regeneration invalidated a still-correct signature, the
     * only way to stay green was never to re-run the screenshot spec, and the gate went red before
     * 1.5.2 and stayed there.
     *
     * An exact hash match is still the strongest evidence and is accepted immediately. When it
     * differs, the recorded `perceptualSignature` is consulted: an 8x8 grid of quantised average
     * colours, coarse enough to absorb rounding but not a moved, recoloured or missing element.
     * A review that predates this field has no signature to fall back on and still fails on hash,
     * which is the correct conservative behaviour rather than a silent downgrade.
     */
    const exactMatch = screenshot.sha256 === hashFile(absolute);
    let perceptualMatch = false;
    if (!exactMatch && typeof screenshot.perceptualSignature === "string" && screenshot.perceptualSignature) {
      try {
        perceptualMatch = readPngPerceptualSignature(absolute).signature === screenshot.perceptualSignature;
      } catch {
        perceptualMatch = false;
      }
    }
    if (!exactMatch && !perceptualMatch) {
      failures.push(`route-visual-review-screenshot-hash:${routeId}:${String(screenshot.path)}`);
    }
    /*
     * The mtime check exists so a reviewer cannot approve, then have the artifact quietly replaced.
     * A perceptual match already proves the pixels still show what was approved, so mtime alone is
     * not evidence of change — otherwise merely re-running the spec would invalidate a signature the
     * pixels still support.
     */
    if (!perceptualMatch && reviewedAtMs !== undefined && statSync(absolute).mtimeMs > reviewedAtMs) {
      failures.push(`route-visual-review-stale-screenshot:${routeId}:${String(screenshot.path)}`);
    }
    if (!Number.isInteger(screenshot?.viewport?.width) || !Number.isInteger(screenshot?.viewport?.height)) {
      failures.push(`route-visual-review-screenshot-viewport:${routeId}:${String(screenshot?.path)}`);
    }
  }
  if (verdict === "pass") {
    for (const requiredKind of ["desktop", "mobile", "gameplay"]) {
      if (!seenKinds.has(requiredKind)) failures.push(`route-visual-review-screenshot-kind-missing:${routeId}:${requiredKind}`);
    }
  }

  return {
    required: route.releaseClass === "release-ready candidate",
    ok: failures.length === 0 && verdict === "pass",
    routeId,
    verdict,
    approvalScope: entry.approvalScope,
    blockingIssues,
    screenshots,
    failures
  };
}

function validateReviewer(value, failures) {
  const reviewer = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const name = substantive(reviewer.name) ? reviewer.name.trim() : null;
  const id = substantive(reviewer.id) ? reviewer.id.trim() : null;
  if (!name) failures.push("visual-review-reviewer-name");
  if (!id) failures.push("visual-review-reviewer-id");
  const human = reviewer.kind === "human" && Boolean(name && id) &&
    !nonHumanReviewerPattern.test(`${name} ${id}`);
  if (reviewer.kind !== "human" && reviewer.kind !== "pending") {
    failures.push(`visual-review-reviewer-kind:${String(reviewer.kind)}`);
  }
  return { name, id, kind: reviewer.kind ?? null, human };
}

function newestRelevantMtime(root, routeId) {
  const paths = [
    resolve(root, "apps", routeId),
    resolve(root, "tools/showcase-library"),
    resolve(root, "tests/reports/showcase-route-primary-probes", `${routeId}.json`)
  ];
  let newest = 0;
  for (const path of paths) {
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) {
      for (const file of walk(path)) newest = Math.max(newest, statSync(file).mtimeMs);
    } else {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    if (name === "dist" || name === "node_modules" || name === ".DS_Store") continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function safeResolve(root, path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\0")) return undefined;
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : absolute;
}

function hashFile(path) {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function timestampMs(value) {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{7,40}$/i.test(value);
}

function substantive(value) {
  return typeof value === "string" && value.trim().length >= 2;
}

function emptyReview(relativePath, failures) {
  return {
    relativePath,
    ok: false,
    fileOk: false,
    reviewer: null,
    reviewerRecord: { name: null, id: null, kind: null, human: false },
    reviewedAt: null,
    sourceCommit: null,
    overallVerdict: null,
    routeReviews: new Map(),
    routeResults: new Map(),
    failures
  };
}
