#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const outPath = resolve(
  appRoot,
  process.env.AURA_CLASH_REVIEW_PACKAGE_OUT ?? "launch-evidence/review-package.md"
);

const evidencePaths = {
  localGates: resolve(appRoot, "tests/reports/flagship-gates.json"),
  readiness: resolve(appRoot, "launch-evidence/aura-clash-106-readiness.json"),
  screenshotMeta: resolve(appRoot, "launch-evidence/first-frame.json"),
  screenshotPng: resolve(appRoot, "launch-evidence/playable-106-first-frame.png"),
  combatScreenshotPng: resolve(appRoot, "launch-evidence/playable-106-combat-frame.png"),
  koResetScreenshotPng: resolve(appRoot, "launch-evidence/playable-106-ko-reset.png"),
  vercelDeploy: resolve(appRoot, "launch-evidence/vercel-deploy.json"),
  deployedRoutes: resolve(appRoot, "launch-evidence/deployed-routes.json"),
  workflow: resolve(appRoot, "launch-evidence/workflow.json"),
  visualApproval: resolve(appRoot, "launch-evidence/visual-approval.json"),
  launchAssetEvidence: resolve(appRoot, "assets/source/aura-clash-launch-asset-evidence.json"),
  manifest: resolve(appRoot, "launch-evidence.manifest.json")
};

const evidence = Object.fromEntries(
  Object.entries(evidencePaths).map(([key, path]) => [key, readEvidence(path)])
);

const generatedAt = new Date().toISOString();
const visualReviewEvidence = evidence.screenshotMeta?.visualReviewEvidence ?? null;
const compositionEvidence = evidence.screenshotMeta?.compositionEvidence ?? null;
const summary = [
  ["Local gates", gateStatus(evidence.localGates?.ok === true)],
  ["1.0.6 readiness evidence", gateStatus(evidence.readiness?.ok === true)],
  ["First-frame screenshot metadata", evidence.screenshotMeta ? gateStatus(evidence.screenshotMeta?.ok === true) : "NOT USED BY CURRENT 1.0.6 FLOW"],
  ["First-frame screenshot file", gateStatus(existsSync(evidencePaths.screenshotPng))],
  ["Combat screenshot file", gateStatus(existsSync(evidencePaths.combatScreenshotPng))],
  ["KO/reset screenshot file", gateStatus(existsSync(evidencePaths.koResetScreenshotPng))],
  [
    "Visual review evidence contract",
    visualReviewEvidence
      ? visualReviewEvidence.ok === true
        ? "PASS"
        : "NEEDS HUMAN REVIEW / INCOMPLETE MACHINE SIGNALS"
      : "MISSING"
  ],
  [
    "Screenshot compositions",
    compositionEvidence
      ? compositionEvidence.threeCompositionEvidenceAvailable
        ? "THREE CAPTURED"
        : compositionEvidence.optionalAvailableCount > 0
          ? `${compositionEvidence.capturedCount} CAPTURED / ${compositionEvidence.expectedCount} EXPECTED`
          : "ONLY FIRST-FRAME DECLARED"
      : "MISSING"
  ],
  ["Launch asset visual source evidence", sourceEvidenceStatus(evidence.launchAssetEvidence)],
  ["Vercel deployment", gateStatus(evidence.vercelDeploy?.ok === true)],
  ["Deployed route and GLB URLs", gateStatus(evidence.deployedRoutes?.ok === true)],
  ["Workflow evidence", gateStatus(evidence.workflow?.ok === true)],
  ["Visual approval artifact", visualApprovalStatus(evidence.visualApproval)],
  ["Launch evidence manifest", sourceEvidenceStatus(evidence.manifest)]
];

const lines = [
  "# Aura Clash Launch Review Package",
  "",
  `Generated: ${generatedAt}`,
  "",
  "This package is for release review. It summarizes generated launch evidence, but it does not approve the visual gate automatically. The visual approval gate still requires explicit human approval.",
  "",
  "## Evidence summary",
  "",
  "| Gate | Status |",
  "| --- | --- |",
  ...summary.map(([label, status]) => `| ${label} | ${status} |`),
  "",
  "## Evidence files",
  "",
  ...Object.entries(evidencePaths).map(([key, path]) => {
    const exists = existsSync(path);
    return `- ${key}: ${exists ? relative(repoRoot, path) : "missing"}`;
  }),
  "",
  "## Screenshot review",
  "",
  existsSync(evidencePaths.screenshotPng)
    ? `- First-frame screenshot: ${relative(repoRoot, evidencePaths.screenshotPng)}`
    : "- First-frame screenshot: missing",
  existsSync(evidencePaths.combatScreenshotPng)
    ? `- Combat screenshot: ${relative(repoRoot, evidencePaths.combatScreenshotPng)}`
    : "- Combat screenshot: missing",
  existsSync(evidencePaths.koResetScreenshotPng)
    ? `- KO/reset screenshot: ${relative(repoRoot, evidencePaths.koResetScreenshotPng)}`
    : "- KO/reset screenshot: missing",
  evidence.screenshotMeta?.targetUrl ? `- Captured target: ${evidence.screenshotMeta.targetUrl}` : "- Captured target: missing",
  evidence.screenshotMeta?.finalUrl ? `- Final URL: ${evidence.screenshotMeta.finalUrl}` : "- Final URL: missing",
  evidence.screenshotMeta?.title ? `- Page title: ${evidence.screenshotMeta.title}` : "- Page title: missing",
  evidence.screenshotMeta?.visualReviewContract?.version
    ? `- Visual evidence contract: ${evidence.screenshotMeta.visualReviewContract.version}`
    : "- Visual evidence contract: missing",
  compositionEvidence
    ? `- Screenshot compositions captured: ${compositionEvidence.capturedCount}/${compositionEvidence.expectedCount}`
    : "- Screenshot compositions captured: missing",
  evidence.screenshotMeta?.visualEvidenceGate
    ? `- Machine visual evidence gate: ${evidence.screenshotMeta.visualEvidenceGate.machineChecksOk ? "PASS" : "NOT PASSING"}`
    : "- Machine visual evidence gate: missing",
  "",
  "## Source-only visual evidence contract",
  "",
  "This section reports machine-readable screenshot evidence for review. It does not replace human visual approval, and it should not be used to mark the visual gate complete by itself.",
  "",
  renderVisualReviewSummary(visualReviewEvidence),
  "",
  "## Screenshot composition evidence",
  "",
  renderCompositionSummary(compositionEvidence),
  "",
  "## Fighter visual validation source evidence",
  "",
  "This source evidence helps reviewers check Quaternius-derived fighter provenance, typed asset coverage, bounds, material readability, and no-fallback policy. It still does not replace browser screenshot review or user approval.",
  "",
  renderJsonSummary(evidence.launchAssetEvidence, ["ok", "generatedAt", "assetCount", "launchGlbCount", "fighterCount", "playableFighterCount", "routeUsageCount"]),
  "",
  "## Visual approval artifact",
  "",
  renderJsonSummary(evidence.visualApproval, ["ok", "approved", "approvedBy", "approvedAt", "gate", "screenshot", "screenshotMeta", "reviewPackage"]),
  "",
  "User decision:",
  "",
  "- [ ] Approved visually",
  "- [ ] Needs visual changes",
  "",
  "Approval command after explicit user approval:",
  "",
  "```bash",
  "AURA_CLASH_APPROVED_BY=\"<name>\" AURA_CLASH_VISUAL_APPROVAL_CONFIRMED=1 npm run launch:approve-visual",
  "npm run launch:update-prd",
  "```",
  "",
  "## Local gate details",
  "",
  renderJsonSummary(evidence.localGates, ["ok", "commandCount", "completedCount", "failedCount", "generatedAt"]),
  "",
  "## 1.0.6 readiness details",
  "",
  renderJsonSummary(evidence.readiness, ["ok", "generatedAt", "route", "release", "contextualRoute", "gates"]),
  "",
  "## Deployment details",
  "",
  renderJsonSummary(evidence.vercelDeploy, ["ok", "deploymentUrls", "generatedAt", "durationMs"]),
  "",
  "## Deployed route details",
  "",
  renderJsonSummary(evidence.deployedRoutes, ["ok", "origin", "canonicalBasePath", "routeCount", "manifestGlbCount", "targetCount", "failedCount", "generatedAt"]),
  "",
  "## Workflow details",
  "",
  renderJsonSummary(evidence.workflow, ["ok", "stepCount", "completedCount", "failedCount", "generatedAt"])
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${lines.join("\n")}\n`);
console.log(`Aura Clash launch review package written to ${outPath}`);

function readEvidence(path) {
  if (!existsSync(path) || !path.endsWith(".json")) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function gateStatus(ok) {
  return ok ? "PASS" : "MISSING / NOT PASSING";
}

function sourceEvidenceStatus(value) {
  if (!value) {
    return "MISSING";
  }

  if (value.ok === false) {
    return "PRESENT / NOT PASSING";
  }

  return "PRESENT FOR REVIEW";
}

function visualApprovalStatus(value) {
  return value?.ok === true && value?.approved === true ? "PASS" : value ? "PRESENT / NOT APPROVED" : "MISSING";
}

function renderJsonSummary(value, keys) {
  if (!value) {
    return "_Missing._";
  }

  const picked = {};
  for (const key of keys) {
    picked[key] = value[key] ?? null;
  }

  return ["```json", JSON.stringify(picked, null, 2), "```"].join("\n");
}

function renderVisualReviewSummary(value) {
  if (!value) {
    return "_Missing screenshot metadata visualReviewEvidence._";
  }

  const rows = [
    "| Area | Status | Page declaration | Visible DOM signal | Text signal |",
    "| --- | --- | --- | --- | --- |",
    ...value.areas.map(
      (area) =>
        `| ${area.label} | ${area.status.toUpperCase()} | ${yesNo(area.hasPageDeclaration)} | ${yesNo(area.hasVisibleDomSignal)} | ${yesNo(area.hasTextSignal)} |`
    )
  ];

  return [
    `Overall machine-readable status: ${value.ok ? "PASS" : "NEEDS HUMAN REVIEW / INCOMPLETE"}`,
    "",
    ...rows,
    "",
    "Required visual review coverage:",
    "",
    "- Debug overlays: debug/collider/hitbox/runtime evidence must be visible or explicitly declared.",
    "- Readable fighters: both fighters must be visible and readable in silhouette, pose, and side.",
    "- Effects: combat VFX, particles, impacts, bloom, trails, or flashes must be visible or explicitly declared.",
    "- HUD: health, timer, round, combo, controls, or pause/status HUD must be readable.",
    "- Stage depth: foreground, midground, background, floor, shadows, parallax, or arena boundaries must be evident.",
    "- Lighting/materials: lighting setup, shadows, reflections, emissive/metal/glass/material contrast, or equivalent checks must be evident."
  ].join("\n");
}

function renderCompositionSummary(value) {
  if (!value) {
    return "_Missing screenshot metadata compositionEvidence._";
  }

  const rows = [
    "| Composition | Role | Status | Screenshot | Target |",
    "| --- | --- | --- | --- | --- |",
    ...value.captures.map(
      (capture) =>
        `| ${capture.label} | ${capture.role} | ${capture.ok ? "PASS" : "NOT PASSING"} | ${formatEvidencePath(capture.screenshot)} | ${capture.targetUrl ?? "missing"} |`
    )
  ];
  const expectationRows = [
    "| Expected composition | Must show |",
    "| --- | --- |",
    ...value.expectations.map(
      (expectation) => `| ${expectation.label} | ${expectation.mustShow.join(", ")} |`
    )
  ];

  return [
    `Captured compositions: ${value.capturedCount}/${value.expectedCount}`,
    `Optional compositions available from route/env: ${value.optionalAvailableCount}`,
    `Fallback compositions available from capture source: ${value.fallbackAvailableCount ?? 0}`,
    `Total composition targets available before capture limit: ${value.availableCompositionCount ?? value.optionalAvailableCount}`,
    `Three-composition evidence available: ${yesNo(value.threeCompositionEvidenceAvailable)}`,
    "",
    ...rows,
    "",
    ...expectationRows
  ].join("\n");
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function formatEvidencePath(path) {
  if (!path) {
    return "missing";
  }

  return path.startsWith(repoRoot) ? relative(repoRoot, path) : path;
}
