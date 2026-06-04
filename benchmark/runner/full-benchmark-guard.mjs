#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const override = args.has("--override") || process.env.AURA3D_ALLOW_FULL_BENCHMARK_RERUN === "1";
const nonRelease = args.has("--non-release") || process.env.AURA3D_NON_RELEASE_VALIDATION === "1";
const humanReviewPath = rawArgs.find((arg) => arg.startsWith("--human-review="))?.split("=").slice(1).join("=") ??
  process.env.AURA3D_HUMAN_REVIEW_NOTES;
const requiredReviewSections = {
  humanoidReview: [
    "neutralHumanReviewer",
    "thumbnailReadableConnectedCharacter",
    "noDetachedLimbs",
    "noBrokenJointChains",
    "handsAndFeetVisible",
    "groundingShadowVisible"
  ],
  materialReview: [
    "neutralHumanReviewer",
    "metalIdentifiedWithoutLabels",
    "glassIdentifiedWithoutLabels",
    "rubberIdentifiedWithoutLabels",
    "emissiveIdentifiedWithoutLabels",
    "clearcoatIdentifiedWithoutLabels",
    "exposureControlled"
  ],
  productReview: [
    "neutralHumanReviewer",
    "centeredGroundedStudioLitSneaker",
    "productPhotographyStage",
    "notBoxRoom"
  ],
  physicsReview: [
    "neutralHumanReviewer",
    "contactPhysicsStateVisible",
    "notToyLike",
    "atLeastAsPolishedAsRawThreeJs"
  ],
  particleReview: [
    "neutralHumanReviewer",
    "texturedGlowingLifetimeVariationVisible",
    "emitterGroundSplashEmissionUiVisible",
    "notWhitePointNoise"
  ],
  solarReview: [
    "neutralHumanReviewer",
    "sunSixPlanetsOrbitsLabelsStarfieldVisible",
    "labelsReadableAttached",
    "depthScaleCuesVisible"
  ],
  neonReview: [
    "neutralHumanReviewer",
    "controlledBloomTunnelDepthVisible",
    "notOverexposed",
    "ringDepthVisible"
  ],
  dataReview: [
    "neutralHumanReviewer",
    "axesTicksTitleLegendValuesHoverVisible",
    "noFloatingOrphans",
    "readsAsRealChart"
  ],
  miniGolfReview: [
    "neutralHumanReviewer",
    "playableHoleVisible",
    "requiredGameplayElementsVisible",
    "notRandomPrimitivesOnFlatPlane"
  ],
  cityReview: [
    "neutralHumanReviewer",
    "buildingsRoadsWindowsCrosswalksLightsPropsVisible",
    "dayNightStateEvidenceVisible",
    "scaleCuesReadable"
  ]
};

const approvedPrefixes = [
  "packages/engine/src/agent-api/",
  "packages/engine/src/agent-api/index.ts",
  "packages/physics/",
  "packages/rendering/",
  "packages/materials/",
  "packages/product-studio/",
  "benchmark/runner/",
  "benchmark/context/",
  "benchmark/prompts/",
  "docs/agents/",
  "llms.txt",
  "UnifiedPRD.md"
];

if (override) {
  console.log("Full benchmark rerun guard bypassed by explicit override.");
  process.exit(0);
}

const status = runGit(["status", "--porcelain"]);
if (status.status !== 0) {
  console.error("Full benchmark rerun guard could not inspect git status.");
  process.exit(1);
}

const changedFiles = status.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.replace(/^.. /, "").replace(/^.* -> /, ""))
  .sort();

const touchedFailedWorkstream = changedFiles.some((file) =>
  approvedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix))
);

if (!nonRelease) {
  if (changedFiles.length > 0) {
    console.error("Official full benchmark cannot start from a dirty worktree unless --non-release or an explicit override is used.");
    console.error(changedFiles.join("\n"));
    process.exit(1);
  }
  const review = validateHumanReview(humanReviewPath);
  if (!review.pass) {
    console.error("Official full benchmark requires passing human visual review notes before rerun.");
    console.error(review.failures.join("\n"));
    process.exit(1);
  }
} else {
  if (changedFiles.length === 0) {
    console.error("No code diff detected. Do not rerun the full benchmark without implementation changes or explicit override.");
    process.exit(1);
  }

  if (!touchedFailedWorkstream) {
    console.error("No changed file touches a UnifiedPRD failed workstream area. Refusing full benchmark rerun.");
    console.error(changedFiles.join("\n"));
    process.exit(1);
  }
}

const sourcePath = join(repoRoot, "packages/engine/src/agent-api/index.ts");
const distPath = join(repoRoot, "dist/engine/agent-api/index.js");
const sourceMtime = statSync(sourcePath).mtimeMs;
const distMtime = statSync(distPath).mtimeMs;
if (sourceMtime > distMtime + 1000) {
  console.error("dist/engine/agent-api/index.js is older than packages/engine/src/agent-api/index.ts. Run pnpm build first.");
  process.exit(1);
}

console.log("Full benchmark rerun guard passed for non-release validation.");

function runGit(args) {
  return spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

function validateHumanReview(path) {
  const failures = [];
  if (!path) {
    return { pass: false, failures: ["missing --human-review=<path> or AURA3D_HUMAN_REVIEW_NOTES"] };
  }
  const resolved = resolve(repoRoot, path);
  if (!existsSync(resolved)) {
    return { pass: false, failures: [`human review notes file missing: ${resolved}`] };
  }
  let review;
  try {
    review = JSON.parse(readFileSync(resolved, "utf8"));
  } catch (error) {
    return { pass: false, failures: [`human review notes are not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (review.schema !== "aura3d-human-review/1.0") failures.push("human review schema must be aura3d-human-review/1.0");
  if (!Date.parse(review.reviewedAt)) failures.push("human review reviewedAt must be a parseable timestamp");
  if (!String(review.reviewer ?? "").trim()) failures.push("human review reviewer is required");
  if (review.reviewerType !== "neutral-human") failures.push("human review reviewerType must be neutral-human");
  if (review.reviewerAffiliation !== "independent") failures.push("human review reviewerAffiliation must be independent");
  if (review.verdict !== "pass") failures.push("human review verdict must be pass before an official full benchmark rerun");
  if (hasDisqualifyingReviewLanguage(`${review.notes ?? ""}`)) failures.push("passing human review notes must not contain toy/demo/placeholder rejection language");
  if (!Array.isArray(review.screenshots) || review.screenshots.length === 0) failures.push("human review screenshots list is required");
  for (const [sectionName, requiredFields] of Object.entries(requiredReviewSections)) {
    const section = review[sectionName] ?? {};
    if (section.reviewerIsAuthorOrAgent !== false) failures.push(`${sectionName} must confirm reviewerIsAuthorOrAgent=false`);
    if (Number(section.score ?? 0) < 4) failures.push(`${sectionName} score must be at least 4`);
    for (const field of requiredFields) {
      if (section[field] !== true) failures.push(`${sectionName}.${field} must be true`);
    }
  }
  const humanoidReviewText = `${review.humanoidReview?.statement ?? ""} ${review.humanoidReview?.notes ?? ""}`;
  if (!/no longer looks like placeholder programmer art/i.test(humanoidReviewText)) {
    failures.push("humanoidReview must include the required placeholder-programmer-art acceptance sentence");
  }
  for (const entry of review.screenshots ?? []) {
    const filePath = entry.file ? resolve(repoRoot, entry.file) : "";
    if (!entry.file || !existsSync(filePath)) failures.push(`reviewed screenshot path missing: ${entry.file ?? "(blank)"}`);
    if (!entry.modifiedAt || !Date.parse(entry.modifiedAt)) failures.push(`reviewed screenshot timestamp missing or invalid: ${entry.file ?? "(blank)"}`);
    else if (entry.file && existsSync(filePath) && entry.modifiedAt !== statSync(filePath).mtime.toISOString()) {
      failures.push(`reviewed screenshot timestamp does not match current PNG mtime: ${entry.file}`);
    }
    if (entry.verdict !== "pass") failures.push(`reviewed screenshot verdict must be pass: ${entry.file ?? "(blank)"}`);
    if (Number(entry.score ?? 0) < 4) failures.push(`reviewed screenshot score must be at least 4: ${entry.file ?? "(blank)"}`);
    if (entry.visiblePromptMatch !== true) failures.push(`reviewed screenshot prompt match must be confirmed: ${entry.file ?? "(blank)"}`);
    if (!["better", "at-least-as-good", "not-applicable"].includes(entry.comparedToRawThreeJs)) {
      failures.push(`reviewed screenshot must include raw Three.js comparison: ${entry.file ?? "(blank)"}`);
    }
    if (!String(entry.notes ?? "").trim()) failures.push(`reviewed screenshot notes missing: ${entry.file ?? "(blank)"}`);
    if (/humanoid/i.test(`${entry.file ?? ""}`) && entry.placeholderProgrammerArt !== false) {
      failures.push(`humanoid screenshot review must set placeholderProgrammerArt=false: ${entry.file ?? "(blank)"}`);
    }
    if (hasDisqualifyingReviewLanguage(`${entry.notes ?? ""}`)) failures.push(`reviewed screenshot notes contain rejection language: ${entry.file ?? "(blank)"}`);
  }
  return { pass: failures.length === 0, failures };
}

function hasDisqualifyingReviewLanguage(value) {
  const text = String(value ?? "");
  if (/\b(toy|demo)\b/i.test(text)) return true;
  if (/\bstill\s+(looks?\s+)?like\s+placeholder\b/i.test(text)) return true;
  return /\bplaceholder\b/i.test(text) && !/no longer looks like placeholder programmer art/i.test(text);
}
