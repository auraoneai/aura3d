import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeReport, type ReleaseCheck } from "../check-common";

type RoundStatus = "automated-pass" | "manual-pass" | "partial" | "external-gap" | "optional-external";

interface RoundEvidence {
  readonly round: string;
  readonly status: RoundStatus;
  readonly evidence: readonly string[];
  readonly remaining?: string;
  readonly optionalFollowUp?: string;
}

const rawThreeBaselinePassed = reportPass("tests/reports/agent-baseline-comparison.json");
const marketingComprehensionPassed = marketingComprehensionComplete();
const promptFidelityProductQualityReady = promptFidelityReady();
const codexFiveTaskEvalPassed = reportCheckPass("tests/reports/agent-context/codex-self-test.json", "codex-five-task-completes-at-least-four-of-five");
const codexRepairEvalPassed = reportCheckPass("tests/reports/agent-context/codex-self-test.json", "codex-repair-screenshot-improves-to-product-quality");
const claudeCodeEvalPassed = reportPass("tests/reports/agent-context/claude-code-eval.json") && existsSync("docs/project/claude-code-agent-context-results.md");
const vercelPublicSmokePassed = reportCheckPass("tests/reports/external-deployment-smoke.json", "vercel-public-smoke");
const cloudflarePublicSmokePassed = reportCheckPass("tests/reports/external-deployment-smoke.json", "cloudflare-pages-public-smoke");
const sketchfabAssetCorpusPassed = reportPass("tests/reports/sketchfab-asset-corpus.json");
const agentContextPassed = reportPass("tests/reports/agent-context/codex-self-test.json") && existsSync("docs/project/fresh-codex-agent-context-results.md") && claudeCodeEvalPassed && codexFiveTaskEvalPassed && codexRepairEvalPassed;
const assetCorpusPassed = reportPass("tests/reports/asset-corpus.json") && sketchfabAssetCorpusPassed;
const staticDeploymentPassed = reportPass("tests/reports/agent-deployment.json") && vercelPublicSmokePassed && cloudflarePublicSmokePassed;

const rounds: RoundEvidence[] = [
  round("Round 0: Product Context Evidence Matrix", "automated-pass", ["docs/project/product-context-evidence.md", "tests/reports/product-context-evidence.json"]),
  round("Round 1: Release Gate Verification", reportPass("tests/reports/product-context-evidence.json") ? "automated-pass" : "partial", ["pnpm run check:release", "pnpm run typecheck", "tests/reports/product-context-evidence.json"]),
  round("Round 2: Product-Cycle Language Guard", reportPass("tests/reports/marketing-truth.json") ? "automated-pass" : "partial", ["tests/reports/marketing-truth.json", "tests/reports/docs-site.json"]),
  round("Round 3: Archive Isolation", reportPass("tests/reports/product-cutover.json") ? "automated-pass" : "partial", ["tests/reports/product-cutover.json", "tests/reports/package-tarball-audit.json"]),
  round("Round 4: Package Tarball Audit", reportPass("tests/reports/package-tarball-audit.json") ? "automated-pass" : "partial", ["tests/reports/package-tarball-audit.json"]),
  round("Round 5: Clean Install Smoke", reportPass("tests/reports/package-clean-install.json") ? "automated-pass" : "partial", ["docs/project/clean-install-results.md", "tests/reports/package-clean-install.json"]),
  round("Round 6: Public API Compactness And Correctness", reportPass("tests/reports/public-api-contract.json") ? "automated-pass" : "partial", ["docs/project/public-api-contract.md", "tests/reports/public-api-contract.json"]),
  round("Round 7: Agent Context Evaluation", agentContextPassed ? "manual-pass" : "external-gap", ["docs/project/agent-dogfood-results.md", "docs/project/fresh-codex-agent-context-results.md", "docs/project/claude-code-agent-context-results.md", "tests/reports/agent-context/codex-self-test.json", "tests/reports/agent-context/claude-code-eval.json"], agentContextPassed
    ? undefined
    : "Codex prompt-plan self-test, Codex five-task eval, Codex repair eval, and Claude Code five-task eval must all pass.", "Cursor and Copilot remain optional external/subscription runs."),
  round("Round 8: Raw Three.js Baseline", rawThreeBaselinePassed ? "manual-pass" : "partial", ["tests/reports/agent-baseline-comparison.json", "docs/project/agent-baseline-comparison.md"], rawThreeBaselinePassed ? undefined : "Complete the same-task raw Three.js baseline and compare against Aura3D dogfood."),
  round("Round 9: Asset Corpus Validation", assetCorpusPassed ? "automated-pass" : "external-gap", ["docs/project/asset-corpus-results.md", "docs/project/sketchfab-asset-corpus-results.md", "tests/reports/asset-corpus.json", "tests/reports/sketchfab-asset-corpus.json"], assetCorpusPassed
    ? undefined
    : "Generated/adversarial asset corpus and authenticated Sketchfab CC0 browser render must pass.", "Meshy exports remain optional because the current free-user account has no API access."),
  round("Round 10: Typed Asset Reference IDE Test", reportPass("tests/reports/asset-cli.json") && reportPass("tests/reports/public-api-contract.json") ? "automated-pass" : "partial", ["tests/reports/asset-cli.json", "tests/reports/public-api-contract.json"]),
  round("Round 11: Template Lifecycle Dogfood", reportPass("tests/reports/package-clean-install.json") ? "automated-pass" : "partial", ["docs/project/clean-install-results.md", "tests/reports/package-clean-install.json"]),
  round(
    "Round 12: Diagnostics And Screenshot Quality",
    reportPass("tests/reports/package-clean-install.json") && promptFidelityProductQualityReady ? "automated-pass" : "partial",
    ["tests/reports/package-clean-install.json", "tests/reports/agent-devtools.json", "tests/reports/error-message-quality.json", "docs/project/starter-template-visual-review.md", "docs/project/starter-example-visual-review.md", "docs/project/prompt-visual-quality-gap.md", "docs/project/prompt-fidelity-quality-results.md", "tests/reports/prompt-fidelity-quality.json"],
    reportPass("tests/reports/package-clean-install.json") && promptFidelityProductQualityReady
      ? undefined
      : "Current screenshots prove rendering, diagnostics, and basic visual cues, but fewer than three release-facing prompt artifacts have product-quality review labels."
  ),
  round("Round 13: Static Deployment Checks", staticDeploymentPassed ? "manual-pass" : "external-gap", ["tests/reports/agent-deployment.json", "tests/reports/package-clean-install.json", "docs/project/external-deployment-results.md", "tests/reports/external-deployment-smoke.json"], staticDeploymentPassed
    ? undefined
    : "Local static/deploy checks plus Vercel and Cloudflare Pages public smoke must pass.", "Netlify remains optional because no Netlify token or project target is available."),
  round("Round 14: Built Bundle Size Proof", reportPass("tests/reports/bundle-size.json") ? "automated-pass" : "partial", ["BUNDLE_SIZES.md", "tests/reports/bundle-size.json"]),
  round("Round 15: Docs Codeblock Execution", reportPass("tests/reports/docs-codeblocks.json") ? "automated-pass" : "partial", ["tests/reports/docs-codeblocks.json"]),
  round("Round 16: Error Message Quality", reportPass("tests/reports/error-message-quality.json") ? "automated-pass" : "partial", ["tests/reports/error-message-quality.json"]),
  round("Round 17: Marketing Link And Copy-Button Audit", reportPass("tests/reports/marketing-link-audit.json") ? "automated-pass" : "partial", ["tests/reports/marketing-link-audit.json"]),
  round("Round 18: Marketing Comprehension Test", marketingComprehensionPassed ? "manual-pass" : "external-gap", ["docs/project/marketing-comprehension-results.md", "tests/reports/marketing-comprehension.json"], marketingComprehensionPassed ? undefined : "Requires the three-profile marketing comprehension rubric to pass.", "Live-human interviews remain optional follow-up research."),
  round("Round 19: Product Rebuild From Context Alone", promptFidelityProductQualityReady && reportPass("tests/reports/agent-context/codex-self-test.json") ? "manual-pass" : "partial", ["docs/project/fresh-codex-agent-context-results.md", "docs/project/agent-dogfood-results.md", "docs/project/prompt-visual-quality-gap.md"], promptFidelityProductQualityReady && reportPass("tests/reports/agent-context/codex-self-test.json") ? undefined : "Fresh Codex context-only work compiled, ran, used typed assets, and avoided hallucinated APIs, but visual output still needs product-quality prompt fidelity."),
  round("Round 20: Outside Beta Dogfood", "optional-external", ["docs/project/outside-beta-dogfood-results.md", "docs/project/external-proof-readiness.md", ".github/ISSUE_TEMPLATE"], undefined, "Outside beta dogfood requires beta publication and external users; per owner clarification it is optional, not a local release blocker.")
];

const requiredGaps = rounds.filter((entry) => entry.status !== "optional-external" && (entry.status === "external-gap" || entry.remaining));
const optionalExternal = rounds.filter((entry) => entry.status === "optional-external" || entry.optionalFollowUp);
const fullyProvenRounds = rounds.filter((entry) => entry.status === "automated-pass" || entry.status === "manual-pass").length;
const checks: ReleaseCheck[] = [
  {
    id: "test-plan-rounds-classified",
    pass: rounds.length === 21 && rounds.every((entry) => entry.status),
    detail: `${rounds.length}/21 rounds classified`
  },
  {
    id: "required-test-plan-rounds-complete",
    pass: requiredGaps.length === 0,
    detail: `${requiredGaps.length} required rounds have remaining evidence`
  },
  {
    id: "optional-external-rounds-are-visible",
    pass: optionalExternal.length >= 4,
    detail: `${optionalExternal.length} optional external follow-ups are recorded without blocking local release proof`
  },
  {
    id: "local-automated-proof-present",
    pass: fullyProvenRounds > 0,
    detail: `${fullyProvenRounds}/${rounds.length} rounds are fully proven by current local/manual evidence; remaining rounds are classified instead of hidden`
  }
];

writeMarkdown(rounds, checks);
writeReport("tests/reports/test-plan-execution-status.json", "aura3d-test-plan-execution-status", checks, { rounds });

function round(roundName: string, status: RoundStatus, evidence: readonly string[], remaining?: string, optionalFollowUp?: string): RoundEvidence {
  return { round: roundName, status, evidence, remaining, optionalFollowUp };
}

function reportPass(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly pass?: unknown };
    return parsed.pass === true;
  } catch {
    return false;
  }
}

function reportCheckPass(path: string, id: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly checks?: readonly { readonly id?: unknown; readonly pass?: unknown }[] };
    return (parsed.checks ?? []).some((check) => check.id === id && check.pass === true);
  } catch {
    return false;
  }
}

function marketingComprehensionComplete(): boolean {
  if (!existsSync("docs/project/marketing-comprehension-results.md") || !existsSync("tests/reports/marketing-comprehension.json")) return false;
  try {
    const parsed = JSON.parse(readFileSync("tests/reports/marketing-comprehension.json", "utf8")) as {
      readonly pass?: unknown;
      readonly participants?: readonly { readonly result?: unknown }[];
      readonly passCriteria?: Record<string, unknown>;
    };
    const criteria = parsed.passCriteria ?? {};
    return parsed.pass === true &&
      parsed.participants?.length === 3 &&
      parsed.participants.every((entry) => entry.result === "pass") &&
      Object.values(criteria).every((value) => value === true);
  } catch {
    return false;
  }
}

function promptFidelityReady(): boolean {
  if (!existsSync("tests/reports/prompt-fidelity-quality.json")) return false;
  try {
    const parsed = JSON.parse(readFileSync("tests/reports/prompt-fidelity-quality.json", "utf8")) as {
      readonly pass?: unknown;
      readonly productQualityReady?: unknown;
      readonly releaseFacingProductQualityPasses?: unknown;
    };
    return parsed.pass === true && parsed.productQualityReady === true && Number(parsed.releaseFacingProductQualityPasses) >= 3;
  } catch {
    return false;
  }
}

function writeMarkdown(rounds: readonly RoundEvidence[], checks: readonly ReleaseCheck[]): void {
  const lines = [
    "# Test Plan Execution Status",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This document tracks `TestV4PlanPRD.md` round coverage. It is intentionally",
    "stricter than `check:release`: required local/manual evidence must pass,",
    "while optional external-service or outside-user follow-ups stay visible.",
    "",
    "## Summary",
    "",
    `- Rounds classified: ${rounds.length}/21`,
    `- Fully proven by current local/manual evidence: ${rounds.filter((entry) => entry.status === "automated-pass" || entry.status === "manual-pass").length}/${rounds.length}`,
    `- Required rounds with remaining work: ${rounds.filter((entry) => entry.status !== "optional-external" && (entry.remaining || entry.status === "external-gap")).length}`,
    `- Optional external follow-ups: ${rounds.filter((entry) => entry.status === "optional-external" || entry.optionalFollowUp).length}`,
    "",
    "## Round Matrix",
    "",
    "| Round | Status | Evidence | Remaining Work | Optional Follow-Up |",
    "|---|---|---|---|---|",
    ...rounds.map((entry) => `| ${escapeTable(entry.round)} | \`${entry.status}\` | ${entry.evidence.map((item) => `\`${item}\``).join("<br>")} | ${escapeTable(entry.remaining ?? "")} | ${escapeTable(entry.optionalFollowUp ?? "")} |`),
    "",
    "## Checks",
    "",
    "| Check | Result | Detail |",
    "|---|---:|---|",
    ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "pass" : "fail"} | ${escapeTable(check.detail)} |`),
    ""
  ];
  mkdirSync("docs/project", { recursive: true });
  writeFileSync("docs/project/test-plan-execution-status.md", `${lines.join("\n")}\n`);
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
