#!/usr/bin/env node
// allow: SIZE_OK - standalone showcase release checker; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readShowcaseRouteGateConfig,
  routeGateConfigRelativePath,
  showcaseRouteGateHash
} from "./route-gates.mjs";
import { validateReleaseGameAssetPairEvidence } from "./showcase-game-release-gates.mjs";
import { validateGameGeometryContract } from "./game-geometry-contracts.mjs";
import { GAME_VISUAL_QA_CHECKS, writeGameVisualQaReport } from "./game-visual-qa.mjs";
import { applyDownwardOnlyManualReview } from "./showcase-manual-review-gate.mjs";
import { validateRoutePrimaryProbeEvidence } from "./route-primary-probes.mjs";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../..");
const configPath = "tools/showcase-library/vite.config.ts";
const routeGateConfig = readShowcaseRouteGateConfig(repoRoot);
const routeGateConfigHash = showcaseRouteGateHash(repoRoot);
const routes = routeGateConfig.routes.filter((route) => route.published);
const showcaseVisualReviewRelativePath = "docs/project/showcase-visual-review.json";
const RELEASE_READY_CANDIDATE = "release-ready candidate";
const INTERNAL_DIAGNOSTIC = "internal-diagnostic";
const GAME_LAYER_DIAGNOSTIC = "game-layer-diagnostic";
const PROTOTYPE_BLOCKED = "prototype-blocked";
const INDEX_ROUTE = "index-route";
const REMOVED_FROM_PUBLIC_SHOWCASE = "removed-from-public-showcase";

const startedAt = new Date().toISOString();
const routeReports = [];
const generatedAssetKeys = readGeneratedAssetKeys();
const manifestAssets = readManifestAssets();
const manifestAssetKeys = new Set(manifestAssets.keys());
const showcaseVisualReview = readShowcaseVisualReview();

for (const route of routes) {
  const distDir = join("apps", route.id, "dist");
  const releaseClass = routeReleaseClass(route);
  const publicReleaseCounted = releaseClass === RELEASE_READY_CANDIDATE;
  const staticGate = validateRouteStaticGate(route);
  const routePrimaryProbe = releaseClass === INDEX_ROUTE
    ? skippedRoutePrimaryProbe(route)
    : validateRoutePrimaryProbeEvidence(route, { root: repoRoot });
  const build = runCommand(
    `build:${route.id}`,
    "pnpm",
    ["exec", "vite", "build", "--config", configPath],
    { A3D_SHOWCASE_APP: route.id }
  );
  const deploy = releaseClass === INDEX_ROUTE
    ? skippedCommand(`deploy-check:${route.id}`, "index-route")
    : runCommand(
      `deploy-check:${route.id}`,
    "pnpm",
    deployCheckArgs(route, distDir)
  );
  const visualReview = validateRouteVisualReview(route, releaseClass, showcaseVisualReview);
  const gameVisualQa = releaseClass === RELEASE_READY_CANDIDATE && isPublicGameRoute(route)
    ? writeGameVisualQaReport({
      route,
      routeHealth: staticGate.routeHealth.gameAssetPairEvidence
        ? readJsonFile(staticGate.routeHealth.path)
        : undefined,
      root: repoRoot
    })
    : skippedGameVisualQa(route);
  const manualReviewDecision = applyDownwardOnlyManualReview({
    validatorOk: staticGate.ok && gameVisualQa.pass,
    manualReviewOk: visualReview.ok
  });
  const routeOk = manualReviewDecision.ok && routePrimaryProbe.ok && build.ok && deploy.ok;
  const diagnosticBlockers = collectDiagnosticBlockers(route, releaseClass, staticGate, routePrimaryProbe, deploy, visualReview);
  const classification = validateReleaseClassification(route, releaseClass, {
    staticGate,
    routePrimaryProbe,
    build,
    deploy,
    diagnosticBlockers
  });

  routeReports.push({
    ...route,
    releaseClass,
    publicReleaseCounted,
    publicReleaseOk: publicReleaseCounted ? routeOk : true,
    classificationOk: classification.ok,
    classificationFailures: classification.failures,
    diagnosticBlockers,
    finalStatus: finalStatusForRoute(routeOk, releaseClass, diagnosticBlockers),
    source: join("apps", route.id, "index.html"),
    distDir,
    ok: routeOk,
    staticGate,
    visualReview,
    gameVisualQa,
    routePrimaryProbe,
    build,
    deployCheck: deploy,
    dist: summarizeDist(resolve(repoRoot, distDir))
  });
}

const publicReleaseRoutes = routeReports.filter((route) => route.publicReleaseCounted);
const releaseCandidatePassed = publicReleaseRoutes.filter((route) => route.publicReleaseOk).length;
const publicVisualReviewOk = publicReleaseRoutes.every((route) => route.visualReview.ok);
const publicReleaseOk = releaseCandidatePassed === publicReleaseRoutes.length && publicReleaseRoutes.length > 0;
const allRoutesOk = routeReports.every((route) => route.ok);
const classificationOk = routeReports.every((route) => route.classificationOk);
const diagnostics = routeReports
  .filter((route) => route.releaseClass === INTERNAL_DIAGNOSTIC || route.releaseClass === GAME_LAYER_DIAGNOSTIC)
  .map((route) => ({
    id: route.id,
    classification: route.releaseClass,
    publicReleaseCounted: route.publicReleaseCounted,
    ok: route.ok,
    blockers: route.diagnosticBlockers
  }));
const gameLayerDiagnostics = diagnostics.filter((route) => route.classification === GAME_LAYER_DIAGNOSTIC);

const report = {
  schema: "aura3d-showcase-build-deploy/1.0",
  generatedAt: new Date().toISOString(),
  startedAt,
  gateConfig: {
    path: routeGateConfigRelativePath,
    schema: routeGateConfig.schema,
    hash: routeGateConfigHash
  },
  visualReview: {
    path: showcaseVisualReview.relativePath,
    ok: publicVisualReviewOk,
    allRoutesOk: showcaseVisualReview.ok,
    fileOk: showcaseVisualReview.fileOk,
    reviewer: showcaseVisualReview.reviewer,
    reviewedAt: showcaseVisualReview.reviewedAt,
    overallVerdict: showcaseVisualReview.overallVerdict,
    failures: showcaseVisualReview.failures
  },
  ok: publicReleaseOk && classificationOk,
  publicReleaseOk,
  publicVisualReviewOk,
  allRoutesOk,
  classificationOk,
  routeCount: routeReports.length,
  appCount: routeReports.filter((route) => route.id !== "showcase-index").length,
  releaseCandidateCount: publicReleaseRoutes.length,
  releaseCandidatePassed,
  internalDiagnosticCount: routeReports.filter((route) => route.releaseClass === INTERNAL_DIAGNOSTIC).length,
  gameLayerDiagnosticCount: routeReports.filter((route) => route.releaseClass === GAME_LAYER_DIAGNOSTIC).length,
  diagnosticRouteCount: diagnostics.length,
  prototypeBlockedCount: routeReports.filter((route) => route.releaseClass === PROTOTYPE_BLOCKED).length,
  indexRouteCount: routeReports.filter((route) => route.releaseClass === INDEX_ROUTE).length,
  removedFromPublicShowcaseCount: routeReports.filter((route) => route.releaseClass === REMOVED_FROM_PUBLIC_SHOWCASE).length,
  diagnostics,
  gameLayerDiagnostics,
  routes: routeReports,
  commands: {
    build: `A3D_SHOWCASE_APP=<route> pnpm exec vite build --config ${configPath}`,
    deployCheck: "pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/<route>/dist --release --source apps/<route>/src --asset <primary>"
  }
};

writeJson("tests/reports/showcase-library-build-deploy.json", report);
writeJson("docs/project/showcase-launch-evidence.json", compactReport(report));

if (!report.ok) {
  const failedPublic = routeReports
    .filter((route) => route.publicReleaseCounted && !route.publicReleaseOk)
    .map((route) => route.id);
  const failedClassifications = routeReports
    .filter((route) => !route.classificationOk)
    .map((route) => route.id);
  const details = [
    failedPublic.length > 0 ? `public release failed: ${failedPublic.join(", ")}` : "",
    failedClassifications.length > 0 ? `classification failed: ${failedClassifications.join(", ")}` : ""
  ].filter(Boolean).join("; ");
  console.error(`Showcase public release evidence failed${details ? ` (${details})` : ""}.`);
  process.exitCode = 1;
} else {
  console.log(
    `Showcase public release evidence passed for ${report.releaseCandidatePassed}/${report.releaseCandidateCount} release candidates; ` +
    `${report.internalDiagnosticCount} internal diagnostics retained; ` +
    `${report.gameLayerDiagnosticCount} game-layer diagnostics retained; ${report.indexRouteCount} index route handled separately.`
  );
}

function isPublicGameRoute(route) {
  return route.gameTemplateStatus?.category === "racing" || route.gameTemplateStatus?.category === "platformer";
}

function skippedGameVisualQa(route) {
  return {
    schema: "aura3d-game-visual-qa/1.0",
    routeId: route.id,
    category: route.gameTemplateStatus?.category ?? null,
    verdict: "skipped",
    pass: true,
    checks: [],
    blockers: []
  };
}

function readJsonFile(relativePath) {
  if (typeof relativePath !== "string" || !relativePath) return undefined;
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function runCommand(id, command, args, env = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      ...env
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });

  return {
    id,
    command: [command, ...args].join(" "),
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    startedAt,
    finishedAt: new Date().toISOString(),
    warnings: extractJsonArray(result.stdout, "warnings").map(redactEvidenceText),
    failures: extractJsonArray(result.stdout, "failures").map(redactEvidenceText),
    messages: extractJsonArray(result.stdout, "messages").map(redactEvidenceText),
    stdoutTail: redactEvidenceText(tail(result.stdout)),
    stderrTail: redactEvidenceText(tail(result.stderr))
  };
}

function skippedCommand(id, reason) {
  const timestamp = new Date().toISOString();
  return {
    id,
    command: `skipped:${reason}`,
    ok: true,
    status: 0,
    signal: null,
    startedAt: timestamp,
    finishedAt: timestamp,
    warnings: [],
    failures: [],
    messages: [`Skipped for ${reason}.`],
    stdoutTail: "",
    stderrTail: ""
  };
}

function skippedRoutePrimaryProbe(route) {
  return {
    ok: true,
    required: false,
    path: null,
    screenshotPath: null,
    failures: [],
    evidence: null,
    reason: `${route.id} is an index route, not a deployable 3D showcase route.`
  };
}

function routeReleaseClass(route) {
  if (typeof route.releaseClass === "string" && route.releaseClass.trim()) return route.releaseClass;
  return route.id === "showcase-index" ? INDEX_ROUTE : RELEASE_READY_CANDIDATE;
}

function validateReleaseClassification(route, releaseClass, evidence) {
  const failures = [];
  const routeHealth = evidence.staticGate.routeHealth;
  if (releaseClass === INDEX_ROUTE) {
    if (route.id !== "showcase-index") failures.push("index-route-id");
    if (route.primaryAssets.length !== 0) failures.push("index-route-primary-assets");
    if (route.requiresTypedPrimaryAssets) failures.push("index-route-typed-assets");
    if (evidence.routePrimaryProbe.required !== false) failures.push("index-route-primary-probe-required");
    if (!evidence.build.ok) failures.push("index-route-build");
  } else if (releaseClass === RELEASE_READY_CANDIDATE) {
    if (![RELEASE_READY_CANDIDATE, "candidate"].includes(routeHealth.classification)) {
      failures.push(`route-health-classification:${String(routeHealth.classification)}`);
    }
    if (routeHealth.publicShowcase !== true) {
      failures.push(`route-health-public-showcase:${String(routeHealth.publicShowcase)}`);
    }
    if (route.gameTemplateStatus) {
      if (route.gameTemplateStatus.publicTemplateReady !== true) {
        failures.push(`release-game-template-ready:${String(route.gameTemplateStatus.publicTemplateReady)}`);
      }
      if (!Array.isArray(route.gameTemplateStatus.evidence) || route.gameTemplateStatus.evidence.length === 0) {
        failures.push("release-game-template-evidence-missing");
      }
      failures.push(...validateReleaseGameAssetPairEvidence({ route, routeHealth, root: repoRoot }));
    }
    if (!evidence.staticGate.ok) failures.push("release-static-gate");
    if (!evidence.routePrimaryProbe.ok) failures.push("release-route-primary");
    if (!evidence.build.ok) failures.push("release-build");
    if (!evidence.deploy.ok) failures.push("release-deploy");
  } else if (releaseClass === INTERNAL_DIAGNOSTIC) {
    if (routeHealth.classification !== INTERNAL_DIAGNOSTIC) {
      failures.push(`route-health-classification:${String(routeHealth.classification)}`);
    }
    if (routeHealth.publicShowcase !== false) {
      failures.push(`route-health-public-showcase:${String(routeHealth.publicShowcase)}`);
    }
    if (!evidence.build.ok) failures.push("diagnostic-build");
    if (evidence.diagnosticBlockers.length === 0) failures.push("diagnostic-blocker-missing");
  } else if (releaseClass === GAME_LAYER_DIAGNOSTIC) {
    if (routeHealth.classification !== GAME_LAYER_DIAGNOSTIC) {
      failures.push(`route-health-classification:${String(routeHealth.classification)}`);
    }
    if (routeHealth.publicShowcase !== false) {
      failures.push(`route-health-public-showcase:${String(routeHealth.publicShowcase)}`);
    }
    if (route.gameTemplateStatus?.publicTemplateReady !== false) {
      failures.push(`game-layer-diagnostic-template-ready:${String(route.gameTemplateStatus?.publicTemplateReady)}`);
    }
    if (!evidence.build.ok) failures.push("game-layer-diagnostic-build");
    if (evidence.diagnosticBlockers.length === 0) failures.push("game-layer-diagnostic-blocker-missing");
  } else if (releaseClass === PROTOTYPE_BLOCKED || releaseClass === REMOVED_FROM_PUBLIC_SHOWCASE) {
    if (routeHealth.publicShowcase !== false) {
      failures.push(`route-health-public-showcase:${String(routeHealth.publicShowcase)}`);
    }
    if (releaseClass === PROTOTYPE_BLOCKED && evidence.diagnosticBlockers.length === 0) {
      failures.push("prototype-blocker-missing");
    }
  } else {
    failures.push(`unsupported-release-class:${String(releaseClass)}`);
  }
  return {
    ok: failures.length === 0,
    failures
  };
}

function readShowcaseVisualReview() {
  const relativePath = showcaseVisualReviewRelativePath;
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return {
      relativePath,
      ok: false,
      fileOk: false,
      reviewer: null,
      reviewedAt: null,
      overallVerdict: null,
      routeReviews: new Map(),
      failures: [`missing-showcase-visual-review:${relativePath}`]
    };
  }

  let review;
  try {
    review = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    return {
      relativePath,
      ok: false,
      fileOk: false,
      reviewer: null,
      reviewedAt: null,
      overallVerdict: null,
      routeReviews: new Map(),
      failures: [`invalid-showcase-visual-review-json:${error instanceof Error ? error.message : String(error)}`]
    };
  }

  const failures = [];
  if (review.schema !== "aura3d-showcase-visual-review/1.0") {
    failures.push(`visual-review-schema:${String(review.schema)}`);
  }
  if (!isSubstantiveText(review.reviewer)) failures.push("visual-review-reviewer");
  if (!isValidTimestamp(review.reviewedAt)) failures.push(`visual-review-reviewed-at:${String(review.reviewedAt)}`);
  if (!["pass", "fail", "needs-work"].includes(String(review.overallVerdict ?? ""))) {
    failures.push(`visual-review-overall-verdict:${String(review.overallVerdict)}`);
  }
  if (!isSubstantiveText(review.summary)) failures.push("visual-review-summary");
  if (!Array.isArray(review.routes)) failures.push("visual-review-routes-not-array");

  const routeReviews = new Map();
  for (const entry of Array.isArray(review.routes) ? review.routes : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (typeof entry.id === "string" && entry.id.trim()) routeReviews.set(entry.id, entry);
  }

  return {
    relativePath,
    ok: failures.length === 0 && review.overallVerdict === "pass",
    fileOk: failures.length === 0,
    reviewer: typeof review.reviewer === "string" ? review.reviewer : null,
    reviewedAt: typeof review.reviewedAt === "string" ? review.reviewedAt : null,
    overallVerdict: typeof review.overallVerdict === "string" ? review.overallVerdict : null,
    routeReviews,
    failures: [
      ...failures,
      ...(review.overallVerdict === "pass" ? [] : [`visual-review-overall-verdict:${String(review.overallVerdict)}`])
    ]
  };
}

function validateRouteVisualReview(route, releaseClass, review) {
  if (releaseClass !== RELEASE_READY_CANDIDATE) {
    const routeReview = review.routeReviews.get(route.id);
    const verdict = typeof routeReview?.verdict === "string" ? routeReview.verdict : "skipped";
    const blockingIssues = Array.isArray(routeReview?.blockingIssues) ? routeReview.blockingIssues : [];
    return {
      required: false,
      ok: true,
      path: review.relativePath,
      verdict,
      failures: blockingIssues.map((issue) => `route-visual-review-blocker:${route.id}:${String(issue)}`)
    };
  }

  const failures = [];
  failures.push(...review.failures.filter((failure) => !failure.startsWith("visual-review-overall-verdict:")));
  const routeReview = review.routeReviews.get(route.id);
  if (!routeReview) {
    failures.push(`missing-route-visual-review:${route.id}`);
    return {
      required: true,
      ok: false,
      path: review.relativePath,
      verdict: null,
      failures
    };
  }

  const verdict = typeof routeReview.verdict === "string" ? routeReview.verdict : "";
  if (verdict !== "pass") failures.push(`route-visual-review-verdict:${route.id}:${String(verdict || "missing")}`);
  if (!isSubstantiveText(routeReview.subject)) failures.push(`route-visual-review-subject:${route.id}`);
  if (!isSubstantiveText(routeReview.compositionNotes)) failures.push(`route-visual-review-composition:${route.id}`);
  if (!isSubstantiveText(routeReview.notes)) failures.push(`route-visual-review-notes:${route.id}`);
  if (!Array.isArray(routeReview.screenshotEvidence) || routeReview.screenshotEvidence.length === 0) {
    failures.push(`route-visual-review-screenshot-evidence:${route.id}`);
  }
  if (!Array.isArray(routeReview.blockingIssues)) failures.push(`route-visual-review-blocking-issues:${route.id}`);
  if (route.gameTemplateStatus?.category === "racing" || route.gameTemplateStatus?.category === "platformer") {
    const automatedChecks = Array.isArray(routeReview.automatedChecks) ? routeReview.automatedChecks : [];
    for (const check of GAME_VISUAL_QA_CHECKS) {
      if (!automatedChecks.includes(check)) failures.push(`route-visual-review-automated-check:${route.id}:${check}`);
    }
  }
  if (verdict === "pass" && Array.isArray(routeReview.blockingIssues) && routeReview.blockingIssues.length > 0) {
    failures.push(`route-visual-review-pass-has-blockers:${route.id}`);
  }

  return {
    required: true,
    ok: failures.length === 0,
    path: review.relativePath,
    verdict: verdict || null,
    failures
  };
}

function collectDiagnosticBlockers(route, releaseClass, staticGate, routePrimaryProbe, deploy, visualReview) {
  if (releaseClass !== INTERNAL_DIAGNOSTIC && releaseClass !== GAME_LAYER_DIAGNOSTIC && releaseClass !== PROTOTYPE_BLOCKED) return [];
  const blockers = [];
  if (route.gameTemplateStatus?.publicTemplateReady === false && typeof route.gameTemplateStatus.blocker === "string") {
    blockers.push(route.gameTemplateStatus.blocker);
  }
  for (const failure of staticGate.failures) blockers.push(`static:${failure}`);
  for (const failure of routePrimaryProbe.failures ?? []) blockers.push(`route-primary:${failure}`);
  for (const failure of deploy.failures ?? []) blockers.push(`deploy:${failure}`);
  for (const warning of deploy.warnings ?? []) blockers.push(`deploy-warning:${warning}`);
  for (const failure of visualReview.failures ?? []) blockers.push(`visual-review:${failure}`);
  if (route.id === "showcase-webgpu-particle-lab" && route.nativeWebGpuAllowed === false) {
    blockers.push("capability:native-webgpu-proof-absent");
  }
  return Array.from(new Set(blockers));
}

function finalStatusForRoute(routeOk, releaseClass, diagnosticBlockers) {
  if (releaseClass === RELEASE_READY_CANDIDATE) return routeOk ? "release-ready candidate" : "release-blocked";
  if (releaseClass === INTERNAL_DIAGNOSTIC) {
    return diagnosticBlockers.length > 0 ? "internal-diagnostic-retained" : "internal-diagnostic";
  }
  if (releaseClass === GAME_LAYER_DIAGNOSTIC) {
    return diagnosticBlockers.length > 0 ? "game-layer-diagnostic-retained" : "game-layer-diagnostic";
  }
  if (releaseClass === INDEX_ROUTE) return routeOk ? "index-route" : "index-route-blocked";
  return releaseClass;
}

function deployCheckArgs(route, distDir) {
  const args = [
    "exec",
    "tsx",
    "--tsconfig",
    "tsconfig.base.json",
    "packages/aura3d-cli/src/cli.ts",
    "check-deploy",
    "--dist",
    distDir
  ];
  const sourcePath = join("apps", route.id, "src");
  if (route.requiresTypedPrimaryAssets && route.primaryAssets.length > 0) {
    args.push("--release", "--source", sourcePath);
    for (const asset of route.primaryAssets) args.push("--asset", asset);
  } else {
    args.push("--source", sourcePath, "--no-assets");
  }
  return args;
}

function summarizeDist(distPath) {
  if (!existsSync(distPath)) {
    return {
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      hasIndexHtml: false,
      hasAuraAssets: false,
      files: []
    };
  }

  const files = walkFiles(distPath)
    .map((file) => ({
      path: relative(distPath, file),
      bytes: statSync(file).size
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    exists: true,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    hasIndexHtml: files.some((file) => file.path === "index.html"),
    hasAuraAssets: files.some((file) => file.path.startsWith("aura-assets/")),
    files: files.slice(0, 40)
  };
}

function walkFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function validateRouteStaticGate(route) {
  const sourceFiles = readShowcaseSourceFiles(route.id);
  const sourceText = sourceFiles.map((file) => file.text).join("\n");
  const routeHealth = validateRouteHealthGate(route);
  const geometryContract = route.gameTemplateStatus?.category === "racing" || route.gameTemplateStatus?.category === "platformer"
    ? validateGameGeometryContract(route, { root: repoRoot })
    : { ok: true, failures: [], required: false };
  const unsafePatterns = [
    { id: "model-string-id", pattern: /\bmodel\s*\(\s*["'`][^"'`]+["'`]/ },
    { id: "unsafe-model-url", pattern: /\bunsafeModelUrl\s*\(/ },
    { id: "gltf-loader", pattern: /\bGLTFLoader\b/ },
    { id: "three-import", pattern: /\bfrom\s+["']three(?:\/[^"']*)?["']|\bimport\s+["']three(?:\/[^"']*)?["']/ },
    { id: "three-namespace", pattern: /\bnew\s+THREE\./ },
    { id: "raw-remote-gltf", pattern: /https?:\/\/[^\s"'`]+\.g(?:lb|ltf)\b/i },
    { id: "route-local-webgpu", pattern: /\b(?:navigator\.gpu|requestAdapter|requestDevice|dispatchWorkgroups|GPUComputePipeline|WebGPURenderer)\b/ },
    { id: "dom-particle-stand-in", pattern: /\b(?:createElement|innerHTML|className|classList)\b[\s\S]{0,100}\bparticle\b/i }
  ].filter((entry) => entry.pattern.test(sourceText)).map((entry) => entry.id);
  const typedAssetRefs = Array.from(sourceText.matchAll(/\bassets\.([A-Za-z0-9_]+)/g)).map((match) => match[1]).filter(Boolean);
  const primaryAssets = route.primaryAssets.filter((asset) => typedAssetRefs.includes(asset));
  const primaryAssetEvidence = route.primaryAssets.map((assetId) => {
    const asset = manifestAssets.get(assetId);
    return {
      id: assetId,
      presentInManifest: Boolean(asset),
      presentInTypegen: generatedAssetKeys.has(assetId),
      typedAssetUsedInSource: typedAssetRefs.includes(assetId),
      ...(asset ? {
        url: asset.url,
        hash: asset.hash,
        source: redactEvidenceText(asset.source),
        outputPath: asset.outputPath,
        license: asset.provenance?.license,
        licenseName: asset.provenance?.licenseName,
        licenseUrl: asset.provenance?.licenseUrl,
        licenseRaw: redactEvidenceText(asset.provenance?.licenseRaw),
        sourcePage: asset.provenance?.sourcePage,
        downloadUrl: asset.provenance?.downloadUrl,
        sourceUrl: asset.provenance?.sourceUrl,
        sourceFamily: asset.provenance?.sourceFamily,
        author: asset.provenance?.author,
        attribution: asset.provenance?.attribution,
        retrievedAt: asset.provenance?.retrievedAt,
        thumbnailUrl: asset.thumbnailUrl
      } : {})
    };
  });
  const primitiveCalls = Array.from(sourceText.matchAll(/\bprimitives\.[A-Za-z_]+\s*\(/g)).length;
  const declarations = {
    publishesEvidenceGlobal: sourceText.includes(`window.${route.globalName}`) ||
      sourceText.includes(`Object.defineProperty(window, "${route.globalName}"`),
    hasStatus: /\bstatus\s*:/.test(sourceText),
    hasSystems: /\bsystems\s*:/.test(sourceText) || /\bsystems\s*=/.test(sourceText),
    hasControls: /\bcontrols\s*:/.test(sourceText) || /\bcontrols\s*=/.test(sourceText),
    hasClaimBoundary: /\bclaimBoundary\s*:/.test(sourceText) || /\bclaimBoundary\s*=/.test(sourceText),
    hasRouteHealthLikeEvidence: /\b(?:routeHealth|diagnostics|capabilityState|runtimeEvidence|app\.evidence)\b/.test(sourceText),
    hasAuraParticles: /\beffects\.particles\s*\(/.test(sourceText),
    hasNativeWebGpuOverclaim: sourceFiles.some((file) =>
      file.text.split(/\r?\n/).some((line) =>
        /\b(?:native WebGPU|WebGPU compute|GPU-compute particle simulation|compute shader)\b/i.test(line) &&
        !/\b(?:no native|does not claim|not claim|not include|n\/a|not a native|fallback)\b/i.test(line)
      )
    )
  };
  const failures = [];
  if (sourceFiles.length === 0) failures.push("missing-source-files");
  if (unsafePatterns.length > 0) failures.push(...unsafePatterns.map((id) => `unsafe:${id}`));
  if (primitiveCalls > route.primitiveBudget) failures.push(`primitive-budget:${primitiveCalls}/${route.primitiveBudget}`);
  if (!declarations.publishesEvidenceGlobal) failures.push("missing-evidence-global");
  if (!declarations.hasStatus) failures.push("missing-status");
  if (route.id !== "showcase-index" && !declarations.hasControls) failures.push("missing-controls");
  if (route.id !== "showcase-index" && !declarations.hasSystems) failures.push("missing-systems");
  if (route.id !== "showcase-index" && !declarations.hasClaimBoundary) failures.push("missing-claim-boundary");
  if (route.id !== "showcase-index" && !declarations.hasRouteHealthLikeEvidence) failures.push("missing-route-health-like-evidence");
  if (route.id !== "showcase-index" && declarations.hasNativeWebGpuOverclaim) failures.push("native-webgpu-overclaim");
  if (route.requiresAuraParticles && !declarations.hasAuraParticles) failures.push("missing-aura-particles");
  if (!routeHealth.ok) failures.push(...routeHealth.failures.map((failure) => `route-health:${failure}`));
  if (!geometryContract.ok) failures.push(...geometryContract.failures.map((failure) => `geometry-contract:${failure}`));
  if (route.requiresTypedPrimaryAssets) {
    for (const asset of route.primaryAssets) {
      if (!primaryAssets.includes(asset)) failures.push(`missing-primary-asset-source:${asset}`);
      if (!generatedAssetKeys.has(asset)) failures.push(`missing-generated-asset:${asset}`);
      if (!manifestAssetKeys.has(asset)) failures.push(`missing-manifest-asset:${asset}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    sourceFiles: sourceFiles.map((file) => relative(repoRoot, file.path)),
    primitiveCalls,
    primitiveBudget: route.primitiveBudget,
    primaryAssets,
    primaryAssetEvidence,
    typedAssetRefs: Array.from(new Set(typedAssetRefs)).sort(),
    declarations,
    routeHealth,
    geometryContract
  };
}

function validateRouteHealthGate(route) {
  if (route.id === "showcase-index") {
    return {
      ok: true,
      path: null,
      failures: [],
      appId: route.id,
      route: route.path,
      classification: INDEX_ROUTE,
      publicShowcase: false,
      primaryAssets: [],
      evidenceGlobal: `window.${route.globalName}`
    };
  }

  const relativePath = join("apps", route.id, "route-health.json");
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      path: relativePath,
      failures: ["missing-route-health-json"],
      appId: null,
      route: null,
      classification: null,
      publicShowcase: null,
      primaryAssets: [],
      evidenceGlobal: null
    };
  }

  let health;
  try {
    health = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      path: relativePath,
      failures: [`invalid-json:${error instanceof Error ? error.message : String(error)}`],
      appId: null,
      route: null,
      classification: null,
      publicShowcase: null,
      primaryAssets: [],
      evidenceGlobal: null
    };
  }

  const failures = [];
  const primaryAssets = Array.isArray(health.primaryAssets)
    ? health.primaryAssets
      .map((asset) => normalizeTypedAssetRef(asset?.typedRef))
      .filter(Boolean)
    : [];
  const expectedPrimaryAssets = new Set(route.primaryAssets);
  const healthPrimaryAssets = new Set(primaryAssets);
  const missingPrimaryAssets = route.primaryAssets.filter((asset) => !healthPrimaryAssets.has(asset));
  const extraPrimaryAssets = primaryAssets.filter((asset) => !expectedPrimaryAssets.has(asset));

  if (health.schema !== "aura3d-route-health/1.0") failures.push(`schema:${String(health.schema)}`);
  if (health.appId !== route.id) failures.push(`app-id:${String(health.appId)}`);
  if (health.route !== route.path) failures.push(`route:${String(health.route)}`);
  if (health.evidence?.global !== `window.${route.globalName}`) {
    failures.push(`global:${String(health.evidence?.global)}`);
  }
  if (health.evidence?.sourceReview !== `apps/${route.id}/src/main.ts`) {
    failures.push(`source-review:${String(health.evidence?.sourceReview)}`);
  }
  if (missingPrimaryAssets.length > 0) {
    failures.push(`missing-primary-assets:${missingPrimaryAssets.join(",")}`);
  }
  if (extraPrimaryAssets.length > 0) {
    failures.push(`extra-primary-assets:${extraPrimaryAssets.join(",")}`);
  }
  failures.push(...validateGameAssetPairRouteHealth(route, health));

  return {
    ok: failures.length === 0,
    path: relativePath,
    failures,
    appId: health.appId ?? null,
    route: health.route ?? null,
    classification: health.classification ?? null,
    publicShowcase: health.publicShowcase ?? null,
    primaryAssets,
    evidenceGlobal: health.evidence?.global ?? null,
    gameAssetPairEvidence: health.gameAssetPairEvidence ?? null
  };
}

function normalizeTypedAssetRef(ref) {
  return String(ref ?? "").replace(/^assets\./, "");
}

function validateGameAssetPairRouteHealth(route, health) {
  const status = route.gameTemplateStatus;
  if (!status || status.publicTemplateReady !== false) return [];
  if (status.category !== "racing" && status.category !== "platformer") return [];

  const failures = [];
  const evidence = health.gameAssetPairEvidence;
  if (!evidence || typeof evidence !== "object") {
    return [`missing-game-asset-pair-evidence:${status.category}`];
  }

  if (evidence.category !== status.category) {
    failures.push(`game-asset-pair-category:${String(evidence.category)}`);
  }
  if (evidence.verdict !== "fail") {
    failures.push(`game-asset-pair-verdict:${String(evidence.verdict)}`);
  }
  if (typeof evidence.screenshotEvidence !== "string" || evidence.screenshotEvidence.length === 0) {
    failures.push("missing-game-asset-pair-screenshot-evidence");
  }

  const evidenceAssets = Array.isArray(evidence.assets) ? evidence.assets.filter((asset) => typeof asset === "string") : [];
  const expectedAssets = new Set(route.primaryAssets);
  const actualAssets = new Set(evidenceAssets);
  const missingAssets = route.primaryAssets.filter((asset) => !actualAssets.has(asset));
  const extraAssets = evidenceAssets.filter((asset) => !expectedAssets.has(asset));
  if (missingAssets.length > 0) {
    failures.push(`game-asset-pair-missing-assets:${missingAssets.join(",")}`);
  }
  if (extraAssets.length > 0) {
    failures.push(`game-asset-pair-extra-assets:${extraAssets.join(",")}`);
  }

  const pairBlockers = Array.isArray(evidence.blockers) ? evidence.blockers.filter((blocker) => typeof blocker === "string" && blocker.length > 0) : [];
  if (pairBlockers.length === 0) {
    failures.push("missing-game-asset-pair-blockers");
  }

  const healthBlockers = Array.isArray(health.blockers) ? health.blockers : [];
  const requiredVerdictBlocker = `evidence:${status.category}-asset-pair:verdict-not-pass:fail`;
  if (!healthBlockers.includes(requiredVerdictBlocker)) {
    failures.push(`missing-route-health-blocker:${requiredVerdictBlocker}`);
  }
  for (const blocker of pairBlockers) {
    const requiredPairBlocker = `evidence:${status.category}-asset-pair:blocker:${blocker}`;
    if (!healthBlockers.includes(requiredPairBlocker)) {
      failures.push(`missing-route-health-blocker:${requiredPairBlocker}`);
    }
  }

  return failures;
}

function readShowcaseSourceFiles(routeId) {
  const appDir = resolve(repoRoot, "apps", routeId);
  if (!existsSync(appDir)) return [];
  return walkFiles(appDir)
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|html|md)$/.test(file))
    .filter((file) => !file.includes(`${join("dist")}/`))
    .map((file) => ({ path: file, text: readFileSync(file, "utf8") }));
}

function readGeneratedAssetKeys() {
  const generated = readFileSync(resolve(repoRoot, "src/aura-assets.ts"), "utf8");
  return new Set(Array.from(generated.matchAll(/"([A-Za-z0-9_]+)"\s*:/g)).map((match) => match[1]).filter(Boolean));
}

function readManifestAssets() {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, "aura.assets.json"), "utf8"));
  return new Map((manifest.assets ?? []).filter((asset) => asset.id).map((asset) => [asset.id, asset]));
}

function compactReport(report) {
  return {
    schema: report.schema,
    generatedAt: report.generatedAt,
    gateConfig: report.gateConfig,
    visualReview: report.visualReview,
    ok: report.ok,
    publicReleaseOk: report.publicReleaseOk,
    publicVisualReviewOk: report.publicVisualReviewOk,
    allRoutesOk: report.allRoutesOk,
    classificationOk: report.classificationOk,
    routeCount: report.routeCount,
    appCount: report.appCount,
    releaseCandidateCount: report.releaseCandidateCount,
    releaseCandidatePassed: report.releaseCandidatePassed,
    internalDiagnosticCount: report.internalDiagnosticCount,
    gameLayerDiagnosticCount: report.gameLayerDiagnosticCount,
    diagnosticRouteCount: report.diagnosticRouteCount,
    prototypeBlockedCount: report.prototypeBlockedCount,
    indexRouteCount: report.indexRouteCount,
    removedFromPublicShowcaseCount: report.removedFromPublicShowcaseCount,
    diagnostics: report.diagnostics,
    gameLayerDiagnostics: report.gameLayerDiagnostics,
    commands: report.commands,
    routes: report.routes.map((route) => ({
      id: route.id,
      label: route.label,
      path: route.path,
      globalName: route.globalName,
      releaseClass: route.releaseClass,
      publicReleaseCounted: route.publicReleaseCounted,
      publicReleaseOk: route.publicReleaseOk,
      classificationOk: route.classificationOk,
      classificationFailures: route.classificationFailures,
      diagnosticBlockers: route.diagnosticBlockers,
      finalStatus: route.finalStatus,
      source: route.source,
      distDir: route.distDir,
      gate: {
        releaseClass: route.releaseClass,
        primaryAssets: route.primaryAssets,
        primaryAssetRoles: route.primaryAssetRoles ?? {},
        routePrimaryHeroAsset: route.routePrimaryHeroAsset ?? null,
        secondaryPrimaryAssets: route.secondaryPrimaryAssets ?? [],
        primitiveBudget: route.primitiveBudget,
        requiresTypedPrimaryAssets: route.requiresTypedPrimaryAssets,
        requiresRoutePrimaryProbe: Boolean(route.requiresRoutePrimaryProbe),
        requiresKeyboardDelta: Boolean(route.requiresKeyboardDelta),
        requiresAnimationSubjectDelta: Boolean(route.requiresAnimationSubjectDelta),
        gameTemplateStatus: route.gameTemplateStatus ?? null,
        requiresAuraParticles: Boolean(route.requiresAuraParticles),
        nativeWebGpuAllowed: route.nativeWebGpuAllowed ?? null
      },
      ok: route.ok,
      staticGateOk: route.staticGate.ok,
      staticGateFailures: route.staticGate.failures,
      visualReview: route.visualReview,
      gameVisualQa: route.gameVisualQa,
      primaryAssetEvidence: route.staticGate.primaryAssetEvidence,
      routeHealth: route.staticGate.routeHealth,
      routePrimaryProbe: route.routePrimaryProbe,
      buildOk: route.build.ok,
      deployCheckOk: route.deployCheck.ok,
      dist: {
        exists: route.dist.exists,
        fileCount: route.dist.fileCount,
        totalBytes: route.dist.totalBytes,
        hasIndexHtml: route.dist.hasIndexHtml,
        hasAuraAssets: route.dist.hasAuraAssets
      },
      buildCommand: route.build.command,
      deployCheckCommand: route.deployCheck.command,
      deployWarnings: route.deployCheck.warnings,
      deployFailures: route.deployCheck.failures
    }))
  };
}

function extractJsonArray(stdout, key) {
  if (!stdout.trim()) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
}

function tail(value) {
  const normalized = value.trim();
  if (normalized.length <= 8000) return normalized;
  return normalized.slice(normalized.length - 8000);
}

function redactEvidenceText(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll(repoRoot, "<repo>")
    .replace(/(?:\.\.[/\\]){2,}(?:private[/\\]var|var|tmp|temp)[/\\][^\s"')]+/gi, "<local-temp-path>")
    .replace(/(?:^|\s)(?:\/private\/var|\/var\/folders|\/tmp|\/temp)[^\s"')]+/gi, " <local-temp-path>");
}

function isSubstantiveText(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length >= 12 && !/^(?:n\/a|none|todo|tbd|placeholder|ok|pass)$/i.test(trimmed);
}

function isValidTimestamp(value) {
  return typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value));
}

function writeJson(path, value) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}
