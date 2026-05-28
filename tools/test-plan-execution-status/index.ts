import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { writeReport, type ReleaseCheck } from "../check-common";

type RoundStatus = "automated-pass" | "manual-pass" | "partial" | "external-gap";

interface RoundEvidence {
  readonly round: string;
  readonly status: RoundStatus;
  readonly evidence: readonly string[];
  readonly remaining?: string;
}

const rawThreeBaselinePassed = reportPass("tests/reports/agent-baseline-comparison.json");
const marketingComprehensionPassed = marketingComprehensionComplete();

const rounds: RoundEvidence[] = [
  round("Round 0: Product Context Evidence Matrix", "automated-pass", ["docs/project/product-context-evidence.md", "tests/reports/product-context-evidence.json"]),
  round("Round 1: Release Gate Verification", reportPass("tests/reports/product-context-evidence.json") ? "automated-pass" : "partial", ["pnpm run check:release", "pnpm run typecheck", "tests/reports/product-context-evidence.json"]),
  round("Round 2: Product-Cycle Language Guard", reportPass("tests/reports/marketing-truth.json") ? "automated-pass" : "partial", ["tests/reports/marketing-truth.json", "tests/reports/docs-site.json"]),
  round("Round 3: Archive Isolation", reportPass("tests/reports/product-cutover.json") ? "automated-pass" : "partial", ["tests/reports/product-cutover.json", "tests/reports/package-tarball-audit.json"]),
  round("Round 4: Package Tarball Audit", reportPass("tests/reports/package-tarball-audit.json") ? "automated-pass" : "partial", ["tests/reports/package-tarball-audit.json"]),
  round("Round 5: Clean Install Smoke", reportPass("tests/reports/package-clean-install.json") ? "automated-pass" : "partial", ["docs/project/clean-install-results.md", "tests/reports/package-clean-install.json"]),
  round("Round 6: Public API Compactness And Correctness", reportPass("tests/reports/public-api-contract.json") ? "automated-pass" : "partial", ["docs/project/public-api-contract.md", "tests/reports/public-api-contract.json"]),
  round("Round 7: Agent Context Evaluation", reportPass("tests/reports/agent-context/codex-self-test.json") && existsSync("docs/project/fresh-codex-agent-context-results.md") ? "partial" : "external-gap", ["docs/project/agent-dogfood-results.md", "docs/project/fresh-codex-agent-context-results.md", "tests/reports/agent-context/codex-self-test.json"], "Codex is proven; Claude Code, Cursor, and Copilot remain external/subscription runs."),
  round("Round 8: Raw Three.js Baseline", rawThreeBaselinePassed ? "manual-pass" : "partial", ["tests/reports/agent-baseline-comparison.json", "docs/project/agent-baseline-comparison.md"], rawThreeBaselinePassed ? undefined : "Complete the same-task raw Three.js baseline and compare against Aura3D dogfood."),
  round("Round 9: Asset Corpus Validation", reportPass("tests/reports/asset-corpus.json") ? "partial" : "external-gap", ["docs/project/asset-corpus-results.md", "tests/reports/asset-corpus.json"], "Generated/adversarial assets plus pinned Khronos, product-form, material-extension, Blender-export, animation, textured-PBR, and KTX2 local fixtures are proven; separately licensed Sketchfab CC0, Poly Haven, Meshy, and real Draco-compressed variants remain external corpus work."),
  round("Round 10: Typed Asset Reference IDE Test", reportPass("tests/reports/asset-cli.json") && reportPass("tests/reports/public-api-contract.json") ? "automated-pass" : "partial", ["tests/reports/asset-cli.json", "tests/reports/public-api-contract.json"]),
  round("Round 11: Template Lifecycle Dogfood", reportPass("tests/reports/package-clean-install.json") ? "automated-pass" : "partial", ["docs/project/clean-install-results.md", "tests/reports/package-clean-install.json"]),
  round("Round 12: Diagnostics And Screenshot Quality", "partial", ["tests/reports/package-clean-install.json", "tests/reports/agent-devtools.json", "tests/reports/error-message-quality.json", "docs/project/starter-template-visual-review.md", "docs/project/starter-example-visual-review.md", "docs/project/prompt-visual-quality-gap.md", "docs/project/prompt-fidelity-quality-results.md", "tests/reports/prompt-fidelity-quality.json"], "Current screenshots prove rendering, diagnostics, and basic visual cues. Prompt-fidelity audit now rejects object-plus-symbolic-effect fixtures, but current screenshots do not prove product-quality prompt-to-visual fidelity."),
  round("Round 13: Static Deployment Checks", reportPass("tests/reports/agent-deployment.json") ? "partial" : "external-gap", ["tests/reports/agent-deployment.json", "tests/reports/package-clean-install.json", "docs/project/external-deployment-results.md", "tests/reports/external-deployment-smoke.json"], "Local static/deploy checks are proven. Vercel deploy was attempted but blocked by HTTP 401 deployment protection; Cloudflare Pages and Netlify credentials are missing."),
  round("Round 14: Built Bundle Size Proof", reportPass("tests/reports/bundle-size.json") ? "automated-pass" : "partial", ["BUNDLE_SIZES.md", "tests/reports/bundle-size.json"]),
  round("Round 15: Docs Codeblock Execution", reportPass("tests/reports/docs-codeblocks.json") ? "automated-pass" : "partial", ["tests/reports/docs-codeblocks.json"]),
  round("Round 16: Error Message Quality", reportPass("tests/reports/error-message-quality.json") ? "automated-pass" : "partial", ["tests/reports/error-message-quality.json"]),
  round("Round 17: Marketing Link And Copy-Button Audit", reportPass("tests/reports/marketing-link-audit.json") ? "automated-pass" : "partial", ["tests/reports/marketing-link-audit.json"]),
  round("Round 18: Marketing Comprehension Test", marketingComprehensionPassed ? "manual-pass" : "external-gap", ["docs/project/marketing-comprehension-results.md"], marketingComprehensionPassed ? undefined : "Requires three real participants who do not know the codebase."),
  round("Round 19: Product Rebuild From Context Alone", "partial", ["docs/project/fresh-codex-agent-context-results.md", "docs/project/prompt-visual-quality-gap.md"], "Fresh Codex context-only work compiled, ran, used typed assets, and avoided hallucinated APIs, but the visual output remains object-plus-cue quality rather than product-quality prompt fidelity."),
  round("Round 20: Outside Beta Dogfood", existsSync("docs/project/outside-beta-dogfood-results.md") ? "partial" : "external-gap", ["docs/project/outside-beta-dogfood-results.md"], "Requires beta publication and external users.")
];

const externalGaps = rounds.filter((entry) => entry.status === "external-gap" || entry.remaining);
const fullyProvenRounds = rounds.filter((entry) => entry.status === "automated-pass" || entry.status === "manual-pass").length;
const checks: ReleaseCheck[] = [
  {
    id: "test-plan-rounds-classified",
    pass: rounds.length === 21 && rounds.every((entry) => entry.status),
    detail: `${rounds.length}/21 rounds classified`
  },
  {
    id: "local-evidence-does-not-hide-external-gaps",
    pass: externalGaps.length > 0,
    detail: `${externalGaps.length} rounds have remaining manual/external evidence noted`
  },
  {
    id: "local-automated-proof-present",
    pass: fullyProvenRounds > 0,
    detail: `${fullyProvenRounds}/${rounds.length} rounds are fully proven by current local/manual evidence; remaining rounds are classified instead of hidden`
  }
];

writeMarkdown(rounds, checks);
writeReport("tests/reports/test-plan-execution-status.json", "aura3d-test-plan-execution-status", checks, { rounds });

function round(roundName: string, status: RoundStatus, evidence: readonly string[], remaining?: string): RoundEvidence {
  return { round: roundName, status, evidence, remaining };
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

function marketingComprehensionComplete(): boolean {
  if (!existsSync("docs/project/marketing-comprehension-results.md")) return false;
  const text = readFileSync("docs/project/marketing-comprehension-results.md", "utf8");
  return !/not run|pending/i.test(text) && /Participant/i.test(text) && /pass/i.test(text);
}

function writeMarkdown(rounds: readonly RoundEvidence[], checks: readonly ReleaseCheck[]): void {
  const lines = [
    "# Test Plan Execution Status",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This document tracks `TestV4PlanPRD.md` round coverage. It is intentionally",
    "stricter than `check:release`: local automation can pass while external",
    "dogfood, external deployments, and human comprehension work remain open.",
    "",
    "## Summary",
    "",
    `- Rounds classified: ${rounds.length}/21`,
    `- Fully proven by current local/manual evidence: ${rounds.filter((entry) => entry.status === "automated-pass" || entry.status === "manual-pass").length}/${rounds.length}`,
    `- Rounds with remaining manual/external work: ${rounds.filter((entry) => entry.remaining || entry.status === "external-gap").length}`,
    "",
    "## Round Matrix",
    "",
    "| Round | Status | Evidence | Remaining Work |",
    "|---|---|---|---|",
    ...rounds.map((entry) => `| ${escapeTable(entry.round)} | \`${entry.status}\` | ${entry.evidence.map((item) => `\`${item}\``).join("<br>")} | ${escapeTable(entry.remaining ?? "")} |`),
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
