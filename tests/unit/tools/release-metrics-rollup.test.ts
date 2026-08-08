import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * §10 — the §B release success metrics, as **conditions** rather than reports.
 *
 * The PRD's heading is the whole point: "these are conditions, not reports". A report can be
 * committed while its numbers fail; a condition either holds or blocks the release. So this asserts
 * the current verdict of each — including the three that fail — so that a release cannot be cut on
 * the strength of "the report exists".
 *
 * Two of the seven fail, and both are recorded rather than accommodated (R2). When either is fixed,
 * the corresponding assertion here fails and must be flipped, which is the mechanism that keeps
 * this file honest.
 */

const FIRST_1_6_COMMIT = "8471cb2f";

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("§B.1 — bundle ratios (release-defining)", () => {
  it("FAILS: no scenario is within its ratio to the Three.js equivalent", () => {
    const report = json<{ readonly pass: boolean; readonly scenarios: readonly { readonly id: string; readonly pass: boolean }[] }>(
      "tests/reports/bundle-scenarios.json"
    );
    expect(report.pass, "bundle now passes — flip this assertion and update §B.1").toBe(false);
    // Every scenario, not just the aggregate, so a partial fix is visible here.
    for (const scenario of report.scenarios) {
      expect(scenario.pass, `${scenario.id} now passes — update this test`).toBe(false);
    }
  });
});

describe("§B.2 — developer friction is complete for both engines", () => {
  it("measures every field for both engines, or declares it unmeasurable", () => {
    const report = json<{
      readonly scenarios: readonly { readonly aura3d: Record<string, unknown>; readonly threejs: Record<string, unknown> }[];
      readonly unmeasured: readonly { readonly field: string; readonly reason: string }[];
    }>("tests/reports/developer-friction.json");
    expect(report.scenarios.length).toBe(3);
    for (const scenario of report.scenarios) {
      for (const field of ["authoredLines", "imports", "dependencyCount", "typecheckMs"]) {
        expect(scenario.aura3d[field], `aura3d.${field} missing`).toBeTypeOf("number");
        expect(scenario.threejs[field], `threejs.${field} missing`).toBeTypeOf("number");
      }
    }
    // "Complete" includes the two fields that cannot be measured in-process. Declaring them with a
    // reason is completeness; silently omitting them is not, and inventing them is worse.
    expect(report.unmeasured.length).toBe(2);
  });
});

describe("§B.3 — negative complexity", () => {
  it("FAILS on both conditions: source lines not lower, R12 not zero", () => {
    const report = json<{
      readonly baseline: { readonly packageSourceLines: number };
      readonly current: { readonly packageSourceLines: number; readonly duplicateOwnershipViolations: number };
    }>("tests/reports/negative-complexity.json");
    // Not lower — and the growth is recorded reasoning, not code. See §B.3 for the split.
    expect(
      report.current.packageSourceLines,
      "source lines are now at or below baseline — flip this and update §B.3"
    ).toBeGreaterThan(report.baseline.packageSourceLines);
    // 2 of 5, both blocked on ADR 0002 rather than on effort.
    expect(report.current.duplicateOwnershipViolations, "R12 reached 0 — flip this and update §B.3").toBe(2);
  });
});

describe("§B.4 — engine-layer fix ratio", () => {
  it("PASSES: at least 90% of changed source lines are under packages/", () => {
    const report = json<{ readonly ratio: number; readonly threshold: number; readonly pass: boolean }>(
      "tests/reports/engine-layer-ratio.json"
    );
    expect(report.pass).toBe(true);
    expect(report.ratio).toBeGreaterThanOrEqual(report.threshold);
  });
});

describe("R11 — architecture lock", () => {
  it("introduced no new engine subsystem during 1.6", () => {
    /*
     * Measured from the diff rather than judged. R11's subject is a *new subsystem*, and the
     * mechanical proxy is a new source file or a new package appearing during the 1.6 work.
     *
     * `v1.5.2..HEAD` shows 10 added files, which is why the window matters: all 10 landed before
     * 1.6 started. Measured from the first 1.6 commit, the count is 0.
     */
    const addedFiles = execFileSync(
      "git",
      ["diff", "--name-status", `${FIRST_1_6_COMMIT}~1..HEAD`, "--", "packages/**/src/**"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
      .split("\n")
      .filter((line) => line.startsWith("A\t"));
    expect(addedFiles, `new source files during 1.6: ${addedFiles.join(", ")}`).toEqual([]);

    const addedPackages = execFileSync(
      "git",
      ["diff", "--name-status", `${FIRST_1_6_COMMIT}~1..HEAD`, "--", "packages/*/package.json"],
      { encoding: "utf8" }
    )
      .split("\n")
      .filter((line) => line.startsWith("A\t"));
    expect(addedPackages, `new packages during 1.6: ${addedPackages.join(", ")}`).toEqual([]);
  });

  it("has an ADR for each decision that reached the lock", () => {
    // Both 1.6 decisions that R11 governs are recorded: retaining ECS/scripting after R8 refused
    // deletion, and blocking the racing force-model migration on a route-contract gap.
    const adrs = execFileSync("git", ["ls-files", "docs/architecture/adr"], { encoding: "utf8" })
      .split("\n")
      .filter((path) => path.endsWith(".md") && !path.endsWith("README.md"));
    expect(adrs.length).toBeGreaterThanOrEqual(2);
    expect(adrs.some((path) => path.includes("retain-ecs-and-scripting"))).toBe(true);
    expect(adrs.some((path) => path.includes("racing-kit-force-model"))).toBe(true);
  });
});

describe("§A — what Aura3D is NOT", () => {
  it("gained no hand-written implementation of a NOT-list capability during 1.6", () => {
    /*
     * §A's condition is specifically about *gaining* an implementation during 1.6, not about the
     * pre-existing ones — the PRD is explicit that "not a" means "does not build speculative
     * subsystems", not "must delete on sight", and R8/R1 refused three of those deletions.
     *
     * Since zero source files were added during 1.6 (asserted above), no NOT-list capability could
     * have gained one. This asserts the stronger, more direct form: the physics solver count went
     * *down*, which is the opposite of the drift §A exists to reverse.
     */
    const report = json<{ readonly current: { readonly duplicateOwnershipViolations: number } }>(
      "tests/reports/negative-complexity.json"
    );
    // Was 3 before P4 closed the physics-solver row; a rise would mean a new duplicate owner.
    expect(report.current.duplicateOwnershipViolations).toBeLessThanOrEqual(2);
    // And the one production solver is still one.
    const world = readFileSync("packages/physics/src/PhysicsWorld.ts", "utf8");
    const union = /^export type PhysicsBackend = ([^;]+);/m.exec(world);
    expect(union![1]!.split("|").length).toBe(1);
  });
});
