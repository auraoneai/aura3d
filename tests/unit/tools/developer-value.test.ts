import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WS-6.1 / §B.1 / §B.2 — the developer-value verdict, and why it currently fails on one axis.
 *
 * The PRD's proof for WS-6.1 is deliberately conjunctive:
 *
 * > fewer lines **and** bundle within budget **and** correct behaviour. All three, or it fails.
 *
 * And §B.1 is the release-defining condition:
 *
 * > 1.6 succeeds only if renderer parity improves AND developer bundle size approaches Three.js.
 *
 * So this test is written to **report a truthful verdict**, not to pass. Two of the three axes are
 * met and the bundle axis is not, which means WS-6.1 fails — and encoding that as a passing test
 * with a lowered threshold is exactly what R2 forbids ("never weaken a test or threshold to pass").
 * The assertions below therefore pin the *measured* state, including the failure, so that closing
 * the bundle gap flips a test rather than silently going unnoticed.
 */

const FRICTION_REPORT = "tests/reports/developer-friction.json";
const BUNDLE_REPORT = "tests/reports/bundle-scenarios.json";

interface FrictionReport {
  readonly scenarios: readonly {
    readonly id: string;
    readonly aura3d: { readonly authoredLines: number; readonly imports: number; readonly dependencyCount: number };
    readonly threejs: { readonly authoredLines: number; readonly imports: number; readonly dependencyCount: number };
    readonly aura3dFewerLines: boolean;
  }[];
  readonly gapReportWorkflows: readonly { readonly workflow: string; readonly aura3dLines: number; readonly threejsLines: number }[];
  readonly unmeasured: readonly { readonly field: string; readonly reason: string }[];
  readonly summary: Readonly<Record<string, number>>;
}

interface BundleReport {
  readonly pass: boolean;
  readonly scenarios: readonly { readonly id: string; readonly ratio: number; readonly maxRatio: number; readonly pass: boolean }[];
}

function readFriction(): FrictionReport {
  if (!existsSync(FRICTION_REPORT)) {
    execFileSync("npx", ["tsx", "tools/developer-friction/index.ts"], { stdio: "pipe" });
  }
  return JSON.parse(readFileSync(FRICTION_REPORT, "utf8")) as FrictionReport;
}

const friction = readFriction();
const bundle = JSON.parse(readFileSync(BUNDLE_REPORT, "utf8")) as BundleReport;

describe("§B.2 — developer friction is measured for both engines", () => {
  it("measures every scenario against its Three.js equivalent", () => {
    // A friction number without its Three.js counterpart is a number with no claim attached.
    expect(friction.scenarios.length).toBe(3);
    for (const scenario of friction.scenarios) {
      expect(scenario.aura3d.authoredLines, `${scenario.id}: no Aura3D lines`).toBeGreaterThan(0);
      expect(scenario.threejs.authoredLines, `${scenario.id}: no Three.js lines`).toBeGreaterThan(0);
    }
  });

  it("needs fewer authored lines in every scenario and every gap-report workflow", () => {
    // Measured: 9v15, 13v27, 19v40 on the bundle scenarios; 15v74, 10v68, 8v58, 8v62, 7v54,
    // 7v48, 9v64 on the gap-report workflows. This is the axis Aura3D genuinely wins.
    expect(friction.summary.scenariosWhereAura3dNeedsFewerLines).toBe(friction.summary.totalScenarios);
    expect(friction.summary.gapReportWorkflowsWhereAura3dNeedsFewerLines).toBe(friction.summary.gapReportWorkflows);
    expect(friction.summary.gapReportWorkflows).toBeGreaterThanOrEqual(6);
  });

  it("needs no more installs than the Three.js equivalent", () => {
    // Scenario 3 is the honest illustration: Three.js needs `three` + `cannon-es` for a game
    // runtime, Aura3D needs one package. Scenarios 1-2 tie at one install each, because Three.js
    // ships loaders and controls as subpaths of `three` — that cost shows up in the import count
    // (1 vs 4 in scenario 2), not the dependency count, and conflating the two would overclaim.
    expect(friction.summary.scenariosWhereAura3dNeedsFewerOrEqualDependencies).toBe(friction.summary.totalScenarios);
  });

  it("declares the fields it cannot measure here rather than inventing them", () => {
    // R1: `installToFirstCubeMinutes` needs a clean machine profile and a real registry install;
    // `startupMsToFirstFrame` needs a browser, and real per-route ready timings already exist in
    // tests/browser/tier12-route-health.spec.ts. Both are reported unmeasured, with a reason.
    const unmeasured = friction.unmeasured.map((field) => field.field).sort();
    expect(unmeasured).toEqual(["installToFirstCubeMinutes", "startupMsToFirstFrame"]);
    for (const field of friction.unmeasured) expect(field.reason.length).toBeGreaterThan(60);
  });
});

describe("§B.1 — the release-defining bundle condition", () => {
  it("is currently NOT met, and the measured ratios are pinned", () => {
    /*
     * Measured 2026-08-07 by `tools/bundle-scenarios` through its canonical config, against real
     * Three.js builds of the same scenes:
     *
     *   scenario 1  257,074 B vs 119,296 B = 2.155x  (limit 1.25x)
     *   scenario 2  258,168 B vs 146,680 B = 1.760x  (limit 1.25x)
     *   scenario 3  294,620 B vs 143,669 B = 2.051x  (limit 1.50x)
     *
     * All three exceed budget, so §B.1 fails and 1.6 does not ship on this dimension. The PRD is
     * explicit that the budget must not be raised (R2), so this asserts the failure rather than
     * accommodating it: when the gap closes, this test fails and gets updated to a pass.
     */
    expect(bundle.pass).toBe(false);
    const byId = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
    for (const [id, limit] of [
      ["scenario-1-core-primitive-scene", 1.25],
      ["scenario-2-product-viewer", 1.25],
      ["scenario-3-game-runtime", 1.5]
    ] as const) {
      const scenario = byId.get(id);
      expect(scenario, `${id} missing from the bundle report`).toBeDefined();
      expect(scenario!.maxRatio, `${id}: budget was changed from ${limit}`).toBe(limit);
      expect(scenario!.pass, `${id} now passes — update this test to assert the win`).toBe(false);
    }
  });

  it("has not had its budgets raised to manufacture a pass", () => {
    // The single most likely way this gate gets defeated. Budgets are derived from the measured
    // Three.js equivalent, so raising one requires Three.js to grow.
    for (const scenario of bundle.scenarios) {
      expect(scenario.maxRatio).toBeLessThanOrEqual(1.5);
    }
  });
});

describe("WS-6.1 — the conjunctive developer-value verdict", () => {
  it("fails, because 'all three or it fails' means all three", () => {
    /*
     * Axis 1, fewer authored lines: **met** — 3/3 scenarios and 7/7 workflows.
     * Axis 2, correct behaviour: **met** for 32 of 35 Tier 1/2 routes, with 3 pre-existing
     *   failures pinned by `tests/browser/tier12-route-health.spec.ts`.
     * Axis 3, bundle within budget: **not met** — 2.155x / 1.760x / 2.051x.
     *
     * Recording the verdict as a passing test would be the fabrication this PRD was written to
     * end. The verdict itself is the deliverable.
     */
    const fewerLines = friction.summary.scenariosWhereAura3dNeedsFewerLines === friction.summary.totalScenarios;
    const bundleWithinBudget = bundle.pass;
    const verdict = fewerLines && bundleWithinBudget;

    expect(fewerLines, "authored-line axis regressed").toBe(true);
    expect(bundleWithinBudget, "bundle axis — expected still failing; if fixed, update this test").toBe(false);
    expect(verdict, "WS-6.1 cannot pass while any axis fails").toBe(false);
  });
});
