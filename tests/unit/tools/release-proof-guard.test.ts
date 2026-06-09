import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const guardPath = resolve("tools/release-proof-guard.mjs");

describe("release proof guard", () => {
  it("blocks by default when the latest decision round is no-ship even if an older round ships", () => {
    const repo = createReleaseRepo();
    writeRound(repo, 12, { decision: "ship", signedDecision: true });
    writeRound(repo, 13, { decision: "no-ship", signedDecision: true });
    writeRemaining(repo, { task12: true, task17: true });
    writeChangelog(repo, 12, { passing: true });

    const result = runGuard(repo);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("round-13-decision.md must contain a standalone `Decision: ship` line");
  });

  it("passes for an explicit signed shipping round with matching release notes", () => {
    const repo = createReleaseRepo();
    writeRound(repo, 14, { decision: "ship", signedDecision: true });
    writeRemaining(repo, { task12: true, task17: true });
    writeChangelog(repo, 14, { passing: true });

    const result = runGuard(repo, "14");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-proof-ok: Round 14 benchmark proof is present");
  });

  it("requires the ship decision file to be signed", () => {
    const repo = createReleaseRepo();
    writeRound(repo, 14, { decision: "ship", signedDecision: false });
    writeRemaining(repo, { task12: true, task17: true });
    writeChangelog(repo, 14, { passing: true });

    const result = runGuard(repo, "14");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("round-14-decision.md must include the signed user approval");
  });

  it("rejects contradictory release notes for the selected shipping round", () => {
    const repo = createReleaseRepo();
    writeRound(repo, 14, { decision: "ship", signedDecision: true });
    writeRemaining(repo, { task12: true, task17: true });
    writeChangelog(repo, 14, { passing: true, contradictory: true });

    const result = runGuard(repo, "14");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CHANGELOG.md contains failing/no-ship wording for selected Round 14");
  });
});

function createReleaseRepo() {
  const repo = mkdtempSync(join(tmpdir(), "aura3d-release-proof-"));
  mkdirSync(join(repo, "benchmark", "results"), { recursive: true });
  writeFileSync(
    join(repo, "UnifiedPRD.md"),
    `# Unified PRD

- [x] Obtain explicit user approval of the clean validation benchmark.
- [x] Record the approval artifact or note next to the benchmark run.
- [x] Engine parity benchmark passes the frozen thresholds.
- [x] Official benchmark report records a pass.
- [x] No pass relies on PRD edits made during the benchmark.
- [x] No pass relies on self-authored structural QA as final scoring.
- [x] Write release notes after the benchmark passes.
- [x] Ensure release notes claim only what the evidence supports.
- [x] Run required package/release checks.
`
  );
  return repo;
}

function writeRound(repo: string, round: number, options: { readonly decision: "ship" | "no-ship"; readonly signedDecision: boolean }) {
  writeFileSync(
    join(repo, "benchmark", "results", `round-${round}.md`),
    `# Round ${round}\n\nUser signature: \`gchahal1982\`\n\nPrompt result.\n`
  );
  writeFileSync(
    join(repo, "benchmark", "results", `round-${round}-engine.md`),
    `# Round ${round} Engine\n\nUser signature: \`gchahal1982\`\n\nEngine result.\n`
  );
  const decisionLine = options.decision === "ship" ? "Decision: ship" : "Decision: fix specific gaps and re-run. Do not ship.";
  const signature = options.signedDecision ? "User signature: `gchahal1982`\n\n" : "";
  writeFileSync(
    join(repo, "benchmark", "results", `round-${round}-decision.md`),
    `# Round ${round} Decision\n\n${signature}${decisionLine}\n`
  );
}

function writeRemaining(repo: string, options: { readonly task12: boolean; readonly task17: boolean }) {
  writeFileSync(
    join(repo, "REMAINING.md"),
    `# Remaining\n\n- [${options.task12 ? "x" : " "}] 12. Pass the main prompt benchmark.\n- [${options.task17 ? "x" : " "}] 17. Write release notes.\n`
  );
}

function writeChangelog(repo: string, round: number, options: { readonly passing: boolean; readonly contradictory?: boolean }) {
  const status = options.passing ? "Round " + round + " passed and is go-live ready." : "Round " + round + " is pending.";
  const contradiction = options.contradictory ? "\nRound " + round + " failed and is no-ship." : "";
  writeFileSync(
    join(repo, "CHANGELOG.md"),
    `# Changelog\n\n## 1.0.0\n\n${status}${contradiction}\n\n- benchmark/results/round-${round}.md\n- benchmark/results/round-${round}-engine.md\n- benchmark/results/round-${round}-decision.md\n`
  );
}

function runGuard(repo: string, round?: string) {
  return spawnSync(process.execPath, round ? [guardPath, round] : [guardPath], {
    cwd: repo,
    encoding: "utf8"
  });
}
