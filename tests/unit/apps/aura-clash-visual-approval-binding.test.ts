import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * FS-201 negative coverage: passing machine suites must not be able to promote Aura Clash launch
 * readiness while visual approval is absent or stale.
 *
 * The gap this pins was real. `record-visual-approval.mjs` writes `screenshotSha256`,
 * `screenshotMetaSha256`, and `reviewPackageSha256`, but `create-launch-readiness-report.mjs` only
 * asked whether `visual-approval.json` existed and reported `ok: true` — it never re-checked those
 * digests. Measured before the fix: binding an approval to the current first frame, appending bytes
 * to that frame, then re-running readiness left `visual-screenshot-approved` **passing** and dropped
 * the open-gate count from 3 to 1. A human approval refers to specific pixels, so an approval whose
 * screenshot has since changed must fail closed.
 *
 * These tests drive the real script rather than a reimplementation, so they exercise the shipped
 * gate logic. Each test copies the evidence directory into an isolated temp root and points the
 * producer at it through `AURA_CLASH_READINESS_INPUT_ROOT`, so retained repository evidence is never
 * written by a non-authoritative producer and the suite cannot race concurrent readers.
 */
const appRoot = resolve(process.cwd(), "apps/aura-clash-showcase");
const readinessScript = resolve(appRoot, "scripts/create-launch-readiness-report.mjs");

/*
 * Isolated evidence root.
 *
 * These are negative controls: they must exercise a *missing* approval, a *tampered* screenshot digest
 * and a digest-free approval. Previously that was done by mutating
 * `apps/aura-clash-showcase/launch-evidence/` in place and restoring it in `afterEach`, which this
 * file's own comment acknowledged. Two things went wrong with that:
 *
 *  - It made a non-authoritative producer write retained repository evidence. That is the exact
 *    mechanism that let a stale `first-frame.png` appear current.
 *  - It raced any concurrently running test that reads the same evidence, which is why this suite
 *    passed in isolation and failed under full-suite load.
 *
 * The readiness producer now accepts `AURA_CLASH_READINESS_INPUT_ROOT`, so each test copies the
 * evidence directory into a fresh temp root and mutates the copy. Retained evidence is never touched.
 */
let evidenceRoot: string;
let evidenceDir: string;
let approvalPath: string;
let screenshotPath: string;
let screenshotMetaPath: string;
let reviewPackagePath: string;

beforeEach(() => {
  evidenceRoot = mkdtempSync(join(tmpdir(), "aura-clash-readiness-"));
  evidenceDir = resolve(evidenceRoot, "launch-evidence");
  cpSync(resolve(appRoot, "launch-evidence"), evidenceDir, { recursive: true });
  // `assets/source/aura-clash-launch-asset-evidence.json` is also inspected by the producer.
  cpSync(resolve(appRoot, "assets/source"), resolve(evidenceRoot, "assets/source"), { recursive: true });
  approvalPath = resolve(evidenceDir, "visual-approval.json");
  screenshotPath = resolve(evidenceDir, "first-frame.png");
  screenshotMetaPath = resolve(evidenceDir, "first-frame.json");
  reviewPackagePath = resolve(evidenceDir, "review-package.md");
  // Start from the "no approval recorded" state; the repo copy may or may not carry one.
  if (existsSync(approvalPath)) unlinkSync(approvalPath);
});

afterEach(() => {
  rmSync(evidenceRoot, { recursive: true, force: true });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runReadiness(): {
  readonly ok: boolean;
  readonly summary: { readonly openGateCount: number };
  readonly gates: readonly { readonly id: string; readonly ok: boolean }[];
  readonly artifacts: Record<string, { readonly ok?: boolean; readonly approvalBindingOk?: boolean; readonly approvalBindingFailures?: readonly string[] }>;
} {
  execFileSync("node", [readinessScript], {
    stdio: "pipe",
    env: {
      ...process.env,
      AURA_CLASH_READINESS_INPUT_ROOT: evidenceRoot,
      AURA_CLASH_READINESS_OUT: resolve(evidenceDir, "readiness.json"),
      AURA_CLASH_READINESS_MD_OUT: resolve(evidenceDir, "readiness.md")
    }
  });
  return JSON.parse(readFileSync(resolve(evidenceDir, "readiness.json"), "utf8"));
}

function visualGate(report: ReturnType<typeof runReadiness>): { readonly id: string; readonly ok: boolean } {
  const gate = report.gates.find((entry) => entry.id === "visual-screenshot-approved");
  if (!gate) throw new Error("visual-screenshot-approved gate is missing from the readiness report");
  return gate;
}

/** An approval bound to whatever the artifacts hash to right now. */
function writeApprovalBoundToCurrentArtifacts(): void {
  writeFileSync(approvalPath, `${JSON.stringify({
    ok: true,
    approved: true,
    approvedBy: "negative-test",
    screenshot: "launch-evidence/first-frame.png",
    screenshotMeta: "launch-evidence/first-frame.json",
    reviewPackage: "launch-evidence/review-package.md",
    screenshotSha256: sha256(screenshotPath),
    screenshotMetaSha256: sha256(screenshotMetaPath),
    reviewPackageSha256: sha256(reviewPackagePath)
  }, null, 2)}\n`);
}

describe("Aura Clash launch readiness cannot be promoted without current visual approval", () => {
  it("holds the visual gate open while no approval exists, even though machine suites pass", () => {
    const report = runReadiness();

    // A machine-verifiable, locally-determined gate genuinely passes.
    const gameplaySmoke = report.gates.find((entry) => entry.id === "gameplay-smoke");
    expect(gameplaySmoke?.ok).toBe(true);

    /*
     * `deployed-route-confirmed` is deliberately *not* asserted here.
     *
     * It reads `launch-evidence/deployed-routes.json`, which records live HTTP probes against
     * https://aura3d.auraone.ai. Its state therefore depends on what is currently deployed, not on the
     * code under test: it fails right now because the deployed origin still serves the old
     * `arenaRooftopBuilding.3e351f48.glb` (404), and the route has since moved to the textured
     * `arenaNeonDowntownTextured` arena, which has not been deployed. Asserting it made this test fail
     * for a reason unrelated to its subject, and would equally have let a stale *passing* artifact
     * stand in for a fresh probe.
     *
     * The claim this test exists to defend is narrower and fully local: **no combination of passing
     * machine gates may promote readiness while human visual approval is absent.** That is asserted
     * below without depending on deployment state.
     */
    expect(visualGate(report).ok).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.summary.openGateCount).toBeGreaterThanOrEqual(1);

    // The visual gate must be open on its own account, not merely swept up by another failing gate.
    const visual = visualGate(report) as { ok: boolean; missingArtifactIds?: readonly string[] };
    expect(
      visual.missingArtifactIds ?? [],
      "the visual gate must name its own missing approval artifact"
    ).not.toEqual([]);
  });

  it("rejects an approval whose recorded screenshot digest no longer matches the file", () => {
    writeApprovalBoundToCurrentArtifacts();

    // Sanity check: the freshly bound approval is accepted, so the rejection below is caused by
    // staleness rather than by the approval being malformed.
    expect(visualGate(runReadiness()).ok).toBe(true);

    // Replace the approved pixels without touching the approval record.
    writeFileSync(screenshotPath, Buffer.concat([readFileSync(screenshotPath), Buffer.from("STALE")]));

    const report = runReadiness();
    expect(visualGate(report).ok).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.artifacts.visualApproval.approvalBindingOk).toBe(false);
    expect(report.artifacts.visualApproval.approvalBindingFailures?.join(" ")).toMatch(/screenshotSha256 is stale/);
  });

  it("rejects an approval that records no digests at all", () => {
    // A hand-written approval file must not be able to satisfy the gate.
    writeFileSync(approvalPath, `${JSON.stringify({ ok: true, approved: true, approvedBy: "hand-written" }, null, 2)}\n`);

    const report = runReadiness();
    expect(visualGate(report).ok).toBe(false);
    expect(report.artifacts.visualApproval.approvalBindingOk).toBe(false);
    expect(report.artifacts.visualApproval.approvalBindingFailures?.join(" ")).toMatch(/is missing or is not a sha256 digest/);
  });
});
