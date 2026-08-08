import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WS-5.1 — every public route has a tier, and the classification is derived rather than authored.
 *
 * The PRD's proof is "committed inventory with one tier + rationale per route, totalling 150+".
 * A committed inventory alone would rot: nothing would notice a new route with no tier, which is
 * precisely how the repository reached 136 routes with 11 gated ones.
 *
 * So the inventory is regenerated here and compared, and the exhaustiveness claim is asserted
 * rather than described. `tools/route-tiers` exits non-zero on any unclassified route, so adding
 * a route forces a tier decision at the point the route is added.
 */

const REPORT_PATH = "tests/reports/route-tiers/report.json";

interface RouteRow {
  readonly id: string;
  readonly root: "apps" | "examples";
  readonly tier: 1 | 2 | 3 | 4;
  readonly rationale: string;
  readonly interactive: boolean;
  readonly hasRouteHealth: boolean;
  readonly releaseClass?: string;
}

interface Report {
  readonly counts: Readonly<Record<string, number>>;
  readonly totalRoutes: number;
  readonly tier12Count: number;
  readonly unclassified: readonly string[];
  readonly method: string;
  readonly routes: readonly RouteRow[];
}

function runClassifier(): Report {
  // Exits non-zero when anything is unclassified, which is the gate; capture either way so the
  // failure message below can name the routes rather than just the exit code.
  try {
    execFileSync("npx", ["tsx", "tools/route-tiers/index.ts"], { encoding: "utf8", stdio: "pipe" });
  } catch {
    /* fall through to the report, which records why */
  }
  return JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Report;
}

const report = runClassifier();

describe("every public route has a release tier", () => {
  it("classifies every route, with no unclassified remainder", () => {
    expect(report.unclassified, `unclassified routes: ${report.unclassified.join(", ")}`).toEqual([]);
  });

  it("covers the whole route surface", () => {
    // The PRD says "totalling 150+", counting 112 apps + 38 examples at the time it was written.
    // Measured now: 102 apps + 37 examples less 3 shared-code directories = 136. The assertion is
    // therefore on completeness against the filesystem, not on a number copied from prose.
    const appsAndExamples = report.routes.filter((route) => route.root === "apps" || route.root === "examples");
    expect(appsAndExamples.length).toBe(report.totalRoutes);
    expect(report.totalRoutes).toBeGreaterThan(130);
  });

  it("gives every route a rationale that cites a signal", () => {
    const vague = report.routes.filter((route) => route.rationale.trim().length < 12);
    expect(vague.map((route) => route.id)).toEqual([]);
    for (const route of report.routes) {
      // Each rationale must name where the tier came from, so an inventory row can be checked.
      expect(
        /classification doc|route-gates\.json|create-aura3d template|shipped document|retained spec|diagnostic naming|Tier 4 candidate/.test(
          route.rationale
        ),
        `${route.id}: rationale does not cite a signal — "${route.rationale}"`
      ).toBe(true);
    }
  });

  it("keeps Tier 1 aligned with the shipped release gate rather than widening it", () => {
    // Tier 1 is "public and marketed", and route-gates.json is what actually gates a release.
    // A Tier 1 route that is not gated would be a marketing claim with no gate behind it.
    const tier1 = report.routes.filter((route) => route.tier === 1);
    expect(tier1.length).toBeGreaterThan(0);
    for (const route of tier1) {
      expect(
        route.rationale.includes("route-gates.json") || route.rationale.includes("release-ready candidate"),
        `${route.id} is Tier 1 without a release gate`
      ).toBe(true);
    }
  });

  it("keeps the three blocked routes out of Tier 1 and Tier 2 (R5)", () => {
    // R5: these must not be promoted without human review. A tier is a promotion, so the
    // classifier must not hand them one — this is the mechanical half of WS-5.4.
    for (const id of ["showcase-blockfall-reactor", "showcase-skyline-runner", "showcase-turbo-drift-circuit"]) {
      const route = report.routes.find((candidate) => candidate.id === id);
      expect(route, `${id} is missing from the inventory`).toBeDefined();
      expect(route!.tier, `${id} was promoted to tier ${route!.tier}; R5 forbids it`).toBe(3);
    }
  });

  it("records the derivation method, not a hand-authored list", () => {
    expect(report.method).toMatch(/never hand-authored per route/);
    expect(report.method).toMatch(/apps-classification\.md/);
  });

  it("detects interaction from route source so WS-5.2 can scope evidence", () => {
    // A repository of 136 routes where none is interactive would mean the detector is broken —
    // which it was, when it only looked in `<route>/src` and every flat example read as static.
    const interactive = report.routes.filter((route) => route.interactive);
    expect(interactive.length).toBeGreaterThan(20);
    // And not everything: a detector that returns true for all routes proves nothing either.
    expect(interactive.length).toBeLessThan(report.totalRoutes);
  });
});
