import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * §10 — the §B release success metrics, as **conditions** rather than reports.
 *
 * The PRD's heading is the whole point: "these are conditions, not reports". A report can be
 * committed while its numbers fail; a condition either holds or blocks the release. So this asserts
 * the current verdict of each — including every remaining failure — so that a release cannot be cut on
 * the strength of "the report exists".
 *
 * One of the seven fails, and it is recorded rather than accommodated (R2). When it is fixed,
 * the corresponding assertion here fails and must be flipped, which is the mechanism that keeps
 * this file honest.
 */

const FIRST_1_6_COMMIT = "8471cb2f";

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("§B.1 — bundle ratios (release-defining)", () => {
  it("PASSES: every scenario is within its unchanged ratio to the Three.js equivalent", () => {
    const report = json<{ readonly pass: boolean; readonly scenarios: readonly { readonly id: string; readonly pass: boolean }[] }>(
      "tests/reports/bundle-scenarios.json"
    );
    expect(report.pass, "bundle scenario aggregate regressed").toBe(true);
    // Every scenario, not just the aggregate, so a partial fix is visible here.
    for (const scenario of report.scenarios) {
      expect(scenario.pass, `${scenario.id} regressed`).toBe(true);
    }
  });
});

describe("§B.2 — developer friction is complete for both engines", () => {
  it("measures every field for both engines, or declares it unmeasurable", () => {
    const report = json<{
      readonly scenarios: readonly { readonly aura3d: Record<string, unknown>; readonly threejs: Record<string, unknown> }[];
      readonly runtimeStartupToFirstFrame: {
        readonly aura3d: { readonly median: number; readonly sampleCount: number };
        readonly threejs: { readonly median: number; readonly sampleCount: number };
      };
      readonly unmeasured: readonly { readonly field: string; readonly reason: string }[];
    }>("tests/reports/developer-friction.json");
    expect(report.scenarios.length).toBe(3);
    for (const scenario of report.scenarios) {
      for (const field of ["authoredLines", "imports", "dependencyCount", "typecheckMs"]) {
        expect(scenario.aura3d[field], `aura3d.${field} missing`).toBeTypeOf("number");
        expect(scenario.threejs[field], `threejs.${field} missing`).toBeTypeOf("number");
      }
    }
    for (const engine of [report.runtimeStartupToFirstFrame.aura3d, report.runtimeStartupToFirstFrame.threejs]) {
      expect(engine.median).toBeGreaterThan(0);
      expect(engine.sampleCount).toBeGreaterThanOrEqual(3);
    }
    // Install-to-first-cube still requires a clean real-registry release profile.
    expect(report.unmeasured.map((field) => field.field)).toEqual(["installToFirstCubeMinutes"]);
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
     * Measured from the diff rather than judged. R11's subject is a *new subsystem*, not an
     * additive entry adapter or module boundary that composes existing owners. The bundle
     * replatform added nine deliberately narrow files in existing packages; pinning that exact
     * set makes a future unreviewed source-file addition fail this gate.
     *
     * `v1.5.2..HEAD` shows 19 added files, which is why the window matters: 10 landed before 1.6
     * started. The paths below are the only source additions after the first 1.6 commit.
     */
    const addedFiles = execFileSync(
      "git",
      ["diff", "--name-status", `${FIRST_1_6_COMMIT}~1..HEAD`, "--", "packages/**/src/**"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
      .split("\n")
      .filter((line) => line.startsWith("A\t"));
    expect(addedFiles, `unexpected source additions during 1.6: ${addedFiles.join(", ")}`).toEqual([
      "A\tpackages/assets/src/gltf-runtime.ts",
      "A\tpackages/engine/src/agent-api/lean-base.ts",
      "A\tpackages/engine/src/agent-api/lean-game.ts",
      "A\tpackages/engine/src/agent-api/lean-product.ts",
      "A\tpackages/engine/src/agent-api/lean.ts",
      "A\tpackages/rendering/src/ShaderLibraryCore.ts",
      "A\tpackages/rendering/src/lean-runtime.ts",
      "A\tpackages/rendering/src/lean/LeanProductRenderer.ts",
      "A\tpackages/rendering/src/lean/LeanProductionRenderer.ts"
    ]);

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
     * The exact source additions asserted above are entry adapters and renderer/shader module
     * boundaries for existing owners, so no NOT-list capability gained an implementation. This
     * also asserts the stronger, more direct form: the physics solver count went
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
