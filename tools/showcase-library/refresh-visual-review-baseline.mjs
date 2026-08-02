#!/usr/bin/env node
/**
 * Refreshes `docs/project/showcase-visual-review.json` as a *rejected baseline*.
 *
 * This producer only recomputes the hashes and timestamps that bind the review
 * document to the artifacts it describes. It can never grant approval:
 *
 * - the reviewer stays `kind: "pending"`;
 * - `overallVerdict` stays `needs-work`;
 * - every route verdict stays `needs-work` with at least one blocking issue;
 * - `approvalScope` stays `development-review`.
 *
 * Human approval is applied separately, by a human, against exact screenshots.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readShowcaseRouteGateConfig } from "./route-gates.mjs";
import { createRouteSourceHash } from "./route-primary-probes.mjs";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../..");
const reviewRelativePath = "docs/project/showcase-visual-review.json";
const reviewPath = resolve(repoRoot, reviewRelativePath);

const PENDING_BLOCKER = "review:independent-human-approval-pending";

function hashFile(path) {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function screenshotCandidates(routeId) {
  return [
    {
      kind: "desktop",
      path: `tests/reports/showcase-library-screenshots/${routeId}-desktop.png`,
      viewport: { width: 1440, height: 900 }
    },
    {
      kind: "mobile",
      path: `tests/reports/showcase-library-screenshots/${routeId}-mobile.png`,
      viewport: { width: 390, height: 844 }
    },
    {
      kind: "gameplay",
      path: `tests/reports/showcase-gameplay/${routeId}-after-input.png`,
      viewport: { width: 1440, height: 900 }
    }
  ];
}

const existing = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, "utf8")) : {};
const existingById = new Map((existing.routes ?? []).map((entry) => [entry.id, entry]));
const config = readShowcaseRouteGateConfig(repoRoot);
const reviewedRoutes = config.routes.filter((route) =>
  route.published && route.id !== "showcase-index" &&
  (route.releaseClass === "release-ready candidate" || route.releaseClass === "prototype-blocked"));

const sourceCommit = process.env.A3D_REVIEW_SOURCE_COMMIT ?? existing.sourceCommit;
if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
  console.error("Set A3D_REVIEW_SOURCE_COMMIT to the 40-character commit the artifacts were produced at.");
  process.exit(1);
}

let newestArtifactMs = 0;
const routes = [];
for (const route of reviewedRoutes) {
  const previous = existingById.get(route.id) ?? {};
  const routeHealthPath = resolve(repoRoot, "apps", route.id, "route-health.json");
  const screenshots = [];
  for (const candidate of screenshotCandidates(route.id)) {
    const absolute = resolve(repoRoot, candidate.path);
    if (!existsSync(absolute)) continue;
    newestArtifactMs = Math.max(newestArtifactMs, statSync(absolute).mtimeMs);
    screenshots.push({ ...candidate, sha256: hashFile(absolute) });
  }

  const blockingIssues = Array.isArray(previous.blockingIssues)
    ? previous.blockingIssues.filter((issue) => typeof issue === "string" && issue.trim())
    : [];
  if (!blockingIssues.includes(PENDING_BLOCKER)) blockingIssues.push(PENDING_BLOCKER);

  routes.push({
    id: route.id,
    reviewedAt: "PLACEHOLDER",
    sourceCommit,
    sourceHash: createRouteSourceHash(route.id, repoRoot),
    ...(existsSync(routeHealthPath) ? { routeHealthHash: hashFile(routeHealthPath) } : {}),
    screenshots,
    // Always a rejected baseline. This producer cannot emit "pass".
    verdict: "needs-work",
    blockingIssues,
    approvalScope: "development-review"
  });
}

for (const route of reviewedRoutes) {
  const sourceDir = resolve(repoRoot, "apps", route.id);
  if (existsSync(sourceDir)) newestArtifactMs = Math.max(newestArtifactMs, statSync(sourceDir).mtimeMs);
}
const reviewedAt = new Date(Math.max(Date.now(), newestArtifactMs + 1000)).toISOString();
for (const route of routes) route.reviewedAt = reviewedAt;

const document = {
  schema: "aura3d-showcase-visual-review/2.0",
  reviewer: {
    id: "pending-user-review",
    name: "Pending independent human review",
    kind: "pending"
  },
  reviewedAt,
  sourceCommit,
  overallVerdict: "needs-work",
  summary: "Hash-refreshed rejected baseline. These retained screenshots record the "
    + "current machine-inspected state of each route for the active visual rebuild. "
    + "No route has independent human approval, and this document cannot grant it.",
  routes
};

writeFileSync(reviewPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(
  `Refreshed ${reviewRelativePath} as a rejected baseline for ${routes.length} routes ` +
  "(overallVerdict=needs-work, reviewer=pending)."
);
