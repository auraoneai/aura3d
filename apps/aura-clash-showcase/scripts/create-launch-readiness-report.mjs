#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
/*
 * Root the readiness inputs are read from.
 *
 * This defaults to the real app directory, which is correct for the authoritative producer. It is
 * overridable because the negative-control tests in
 * `tests/unit/apps/aura-clash-visual-approval-binding.test.ts` must exercise *rejection* paths --
 * a missing approval, a tampered screenshot digest, a digest-free approval -- and the only way to do
 * that without an override is to mutate `apps/aura-clash-showcase/launch-evidence/` in place and
 * restore it afterwards. That is precisely what let a stale `first-frame.png` appear current, and it
 * makes the suite race whenever another test reads the same evidence concurrently.
 *
 * With this override the tests copy the evidence directory into a temp root and mutate the copy, so
 * retained repository evidence is never written by a non-authoritative producer.
 */
const inputRoot = process.env.AURA_CLASH_READINESS_INPUT_ROOT
  ? path.resolve(process.env.AURA_CLASH_READINESS_INPUT_ROOT)
  : appRoot;
const outJson = path.resolve(
  appRoot,
  process.env.AURA_CLASH_READINESS_OUT ?? "launch-evidence/readiness.json"
);
const outMarkdown = path.resolve(
  appRoot,
  process.env.AURA_CLASH_READINESS_MD_OUT ?? "launch-evidence/readiness.md"
);

const artifacts = {
  localGates: inspectJson("launch-evidence/local-gates.json"),
  firstFrameJson: inspectJson("launch-evidence/first-frame.json"),
  firstFramePng: inspectFile("launch-evidence/first-frame.png"),
  reviewPackage: inspectFile("launch-evidence/review-package.md"),
  vercelDeploy: inspectJson("launch-evidence/vercel-deploy.json"),
  deployedRoutes: inspectJson("launch-evidence/deployed-routes.json"),
  visualApproval: verifyVisualApprovalBinding(inspectJson("launch-evidence/visual-approval.json")),
  launchAssetEvidence: inspectJson("assets/source/aura-clash-launch-asset-evidence.json"),
  prdCoverage: inspectJson("launch-evidence/prd-evidence-coverage.json"),
  wiring: inspectJson("launch-evidence/evidence-wiring.json"),
  crossRuntime: inspectJson("launch-evidence/cross-runtime-evidence.json")
};

const gates = [
  {
    id: "fighter-runtime-visual-validation",
    prdLineHint: 264,
    prdLabel:
      "Quaternius-derived fighter visual validation proof remains pending until `apps/aura-clash-showcase/launch-evidence/first-frame.json`, `apps/aura-clash-showcase/launch-evidence/first-frame.png`, `apps/aura-clash-showcase/launch-evidence/review-package.md`, `apps/aura-clash-showcase/launch-evidence/visual-approval.json`, and `apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json` prove the fighters are visible, grounded, correctly oriented, readable, and free of detached hair/clothes/accessories in runtime/browser screenshots.",
    label:
      "Quaternius-derived fighter visual validation proof: fighters visible, grounded, oriented, readable, and no detached accessories.",
    commandPath:
      "npm run launch:proof, then review launch-evidence/review-package.md, then record visual approval after explicit user approval.",
    artifactIds: [
      "firstFrameJson",
      "firstFramePng",
      "reviewPackage",
      "visualApproval",
      "launchAssetEvidence"
    ]
  },
  {
    id: "source-is-not-approval-boundary",
    prdLineHint: 265,
    prdLabel:
      "Source manifests and typed asset declarations do not complete visual screenshot approval, deployed GLB reachability, or human visual quality approval; completion requires `first-frame.json`, `first-frame.png`, `review-package.md`, `deployed-routes.json`, and `visual-approval.json` with `ok: true`.",
    label:
      "Source manifests and typed assets are separated from screenshot approval, deployed GLB reachability, and human visual approval.",
    commandPath:
      "Generate screenshot/review evidence, deployed route evidence, and explicit visual approval evidence.",
    artifactIds: [
      "firstFrameJson",
      "firstFramePng",
      "reviewPackage",
      "deployedRoutes",
      "visualApproval"
    ]
  },
  {
    id: "capture-and-review-first-frame",
    prdLineHint: 443,
    prdLabel: "Capture and review first-frame screenshot.",
    label: "Capture and review first-frame screenshot.",
    commandPath: "npm run launch:screenshot && npm run launch:review-package",
    artifactIds: ["firstFrameJson", "firstFramePng", "reviewPackage"]
  },
  {
    id: "build-app-and-marketing",
    prdLineHint: 463,
    prdLabel: "Build app and marketing site.",
    label: "Build app and marketing site.",
    commandPath: "npm run launch:local-gates",
    artifactIds: ["localGates"]
  },
  {
    id: "deploy-to-vercel",
    prdLineHint: 464,
    prdLabel: "Deploy to Vercel.",
    label: "Deploy to Vercel.",
    commandPath: "AURA_CLASH_RUN_VERCEL_DEPLOY=1 npm run launch:proof",
    artifactIds: ["vercelDeploy"]
  },
  {
    id: "deployed-route-and-glb-200",
    prdLineHint: 465,
    prdLabel: "Confirm deployed route and GLB URLs return 200.",
    label: "Confirm deployed route and GLB URLs return 200.",
    commandPath: "AURA_CLASH_RUN_DEPLOYED_EVIDENCE=1 npm run launch:proof",
    artifactIds: ["deployedRoutes"]
  },
  {
    id: "gameplay-smoke",
    prdLineHint: 491,
    prdLabel:
      "Gameplay smoke passes. Source strengthened in `apps/aura-clash-showcase/tests/playable-smoke.spec.ts` for runtime responsiveness and no-scene-reconstruction hooks, but no pass is claimed until executed evidence exists.",
    label: "Gameplay smoke passes.",
    commandPath: "npm run launch:local-gates",
    artifactIds: ["localGates"]
  },
  {
    id: "visual-screenshot-approved",
    prdLineHint: 492,
    prdLabel: "Visual screenshot approved by user.",
    label: "Visual screenshot approved by user.",
    commandPath:
      "AURA_CLASH_APPROVED_BY='<name>' AURA_CLASH_VISUAL_APPROVAL_CONFIRMED=1 npm run launch:approve-visual",
    artifactIds: ["visualApproval"]
  },
  {
    id: "deployed-route-confirmed",
    prdLineHint: 494,
    prdLabel: "Deployed route confirmed.",
    label: "Deployed route confirmed.",
    commandPath: "AURA_CLASH_RUN_DEPLOYED_EVIDENCE=1 npm run launch:proof",
    artifactIds: ["deployedRoutes"]
  }
].map((gate) => {
  const requiredArtifacts = gate.artifactIds.map((artifactId) => ({
    id: artifactId,
    ...artifacts[artifactId]
  }));
  const missing = requiredArtifacts.filter((artifact) => artifact.ok !== true);

  return {
    ...gate,
    ok: missing.length === 0,
    requiredArtifacts,
    missingArtifactIds: missing.map((artifact) => artifact.id)
  };
});

const openGates = gates.filter((gate) => !gate.ok);
const report = {
  ok: openGates.length === 0,
  generatedAt: new Date().toISOString(),
  appRoot: toRepoRelative(appRoot),
  prd: "docs/project/showcase/aura-clash-showcase-plan.md",
  boundary:
    "This report classifies readiness only. It does not mark PRD checkboxes and does not replace generated evidence, deployed proof, or explicit user approval.",
  summary: {
    gateCount: gates.length,
    readyGateCount: gates.length - openGates.length,
    openGateCount: openGates.length
  },
  artifacts,
  gates,
  openGates: openGates.map(({ id, label, commandPath, missingArtifactIds }) => ({
    id,
    label,
    commandPath,
    missingArtifactIds
  }))
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outMarkdown, `${renderMarkdown(report)}\n`);

console.log(`Aura Clash launch readiness report written to ${toRepoRelative(outJson)}`);
console.log(`Aura Clash launch readiness markdown written to ${toRepoRelative(outMarkdown)}`);

/**
 * Rejects a visual approval that is not bound to the artifacts currently on disk.
 *
 * `record-visual-approval.mjs` writes `screenshotSha256`, `screenshotMetaSha256`, and
 * `reviewPackageSha256`, but nothing ever re-checked them: readiness only asked whether the file
 * existed and reported `ok: true`. A recorded approval therefore stayed "ready" after the
 * screenshot it approved had been replaced. Verified before this change by binding an approval to
 * the current frame, appending bytes to that frame, and re-running readiness — the gate still
 * passed and the open-gate count dropped from 3 to 1.
 *
 * Approval is human sign-off on *specific pixels*, so a hash mismatch means the approval no
 * longer refers to what would ship and must fail closed rather than carry forward.
 */
function verifyVisualApprovalBinding(approval) {
  if (!approval.exists || approval.ok !== true || !approval.json) return approval;

  const bindings = [
    ["screenshotSha256", approval.json.screenshot ?? "launch-evidence/first-frame.png"],
    ["screenshotMetaSha256", approval.json.screenshotMeta ?? "launch-evidence/first-frame.json"],
    ["reviewPackageSha256", approval.json.reviewPackage ?? "launch-evidence/review-package.md"]
  ];

  const bindingFailures = [];
  for (const [field, relativePath] of bindings) {
    const recorded = approval.json[field];
    if (typeof recorded !== "string" || !/^[0-9a-f]{64}$/.test(recorded)) {
      bindingFailures.push(`${field} is missing or is not a sha256 digest`);
      continue;
    }
    // Resolve against `inputRoot`, not `appRoot`: an approval's digests must be verified against the
    // same evidence tree the rest of the report inspected. Resolving here against the real app root
    // made a redirected run hash the repository's screenshot instead of the one under test.
    const absolutePath = path.resolve(inputRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      bindingFailures.push(`${field} refers to a missing artifact: ${relativePath}`);
      continue;
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
    if (actual !== recorded) {
      bindingFailures.push(`${field} is stale: ${relativePath} now hashes to ${actual}`);
    }
  }

  if (bindingFailures.length === 0) {
    return { ...approval, approvalBindingOk: true, approvalBindingFailures: [] };
  }

  return {
    ...approval,
    ok: false,
    approvalBindingOk: false,
    approvalBindingFailures: bindingFailures
  };
}

function inspectJson(relativePath) {
  const file = inspectFile(relativePath);
  if (!file.exists) {
    return file;
  }

  try {
    file.json = JSON.parse(fs.readFileSync(file.absolutePath, "utf8"));
    file.ok = file.ok && file.json?.ok === true;
  } catch (error) {
    file.ok = false;
    file.error = error instanceof Error ? error.message : String(error);
  }

  return file;
}

function inspectFile(relativePath) {
  const absolutePath = path.resolve(inputRoot, relativePath);
  const exists = fs.existsSync(absolutePath);
  const sizeBytes = exists ? fs.statSync(absolutePath).size : 0;

  return {
    path: toRepoRelative(absolutePath),
    absolutePath,
    exists,
    sizeBytes,
    ok: exists && sizeBytes > 0
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Aura Clash Launch Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    report.boundary,
    "",
    "## Summary",
    "",
    `- Gates ready: ${report.summary.readyGateCount}/${report.summary.gateCount}`,
    `- Gates open: ${report.summary.openGateCount}`,
    "",
    "## Remaining gates",
    "",
    "| Gate | Status | Missing artifacts | Command path |",
    "| --- | --- | --- | --- |",
    ...report.gates.map((gate) => {
      const missing = gate.missingArtifactIds.length > 0 ? gate.missingArtifactIds.join(", ") : "none";
      return `| ${gate.label} | ${gate.ok ? "READY" : "OPEN"} | ${missing} | \`${gate.commandPath.replaceAll("|", "\\|")}\` |`;
    }),
    "",
    "## Artifact status",
    "",
    "| Artifact | Status | Path |",
    "| --- | --- | --- |",
    ...Object.entries(report.artifacts).map(([id, artifact]) => {
      return `| ${id} | ${artifact.ok ? "OK" : "MISSING / NOT OK"} | ${artifact.path} |`;
    })
  ];

  return lines.join("\n");
}

function toRepoRelative(target) {
  // Report paths as if read from the real app root even when `inputRoot` is redirected, so a test
  // running against a temp copy still produces the repository-relative paths the gate schema expects
  // rather than leaking an absolute temp directory into retained evidence.
  const normalized = inputRoot === appRoot
    ? target
    : path.resolve(appRoot, path.relative(inputRoot, target));
  return path.relative(repoRoot, normalized).replaceAll(path.sep, "/");
}
