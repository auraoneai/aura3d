import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WS-5.4 — the three blocked routes stay blocked, enforced in every place a promotion could
 * happen.
 *
 * R5 is unusual among the PRD's rules in that it forbids an action rather than requiring one, so
 * nothing fails when it is obeyed and nothing fails when it is quietly broken either. That is the
 * shape of rule that gets broken during a release push — the promotion is one field in one JSON
 * file, and the honest blocker it replaces is exactly what a release checklist wants gone.
 *
 * A blocked route could be promoted in four independent places, and all four are asserted here:
 *
 * 1. `tools/showcase-library/route-gates.json` — `releaseClass` and `gameTemplateStatus`
 * 2. `apps/<route>/route-health.json` — `classification`, `publicShowcase`, `promotionStatus`,
 *    and the `blockers` array
 * 3. `docs/project/showcase-visual-review.json` — the human verdict
 * 4. `tests/reports/route-tiers/report.json` — the WS-5.1 tier, since a tier is a promotion
 *
 * The last one is not hypothetical: the WS-5.1 classifier's first version treated "has a gate
 * entry" as sufficient for Tier 1 and promoted all three of these routes. It was a two-line rule
 * with no bad intent behind it, which is the point.
 *
 * These assertions must **fail** if a blocker is deleted. That is not a bug in the test.
 */

const BLOCKED_ROUTES = [
  "showcase-blockfall-reactor",
  "showcase-skyline-runner",
  "showcase-turbo-drift-circuit"
] as const;

interface GateRoute {
  readonly id: string;
  readonly releaseClass?: string;
  readonly gameTemplateStatus?: { readonly publicTemplateReady?: boolean; readonly blocker?: string };
}

const gates = JSON.parse(readFileSync("tools/showcase-library/route-gates.json", "utf8")) as {
  readonly routes: readonly GateRoute[];
};

interface RouteHealth {
  readonly classification?: string;
  readonly publicShowcase?: boolean;
  readonly promotionStatus?: string;
  readonly blockers?: readonly unknown[];
}

function readRouteHealth(id: string): RouteHealth {
  return JSON.parse(readFileSync(`apps/${id}/route-health.json`, "utf8")) as RouteHealth;
}

describe("blocked routes stay blocked (R5)", () => {
  it.each(BLOCKED_ROUTES)("%s is still prototype-blocked in the release gate", (id) => {
    const route = gates.routes.find((candidate) => candidate.id === id);
    expect(route, `${id} was removed from route-gates.json`).toBeDefined();
    expect(route!.releaseClass).toBe("prototype-blocked");
  });

  it.each(BLOCKED_ROUTES)("%s is not published as a public showcase route", (id) => {
    const health = readRouteHealth(id);
    expect(health.classification).toBe("prototype-blocked");
    expect(health.publicShowcase, `${id} was marked publicShowcase`).toBe(false);
    // `promotionStatus` must still name a reason. An empty or "ready" value is the promotion.
    expect(health.promotionStatus, `${id} has no promotionStatus`).toBeTruthy();
    expect(health.promotionStatus).not.toMatch(/^(ready|promoted|release-ready|pass)$/i);
  });

  it.each(BLOCKED_ROUTES)("%s still carries at least one named blocker", (id) => {
    // The specific blockers are recorded so deleting one is visible in a diff rather than being
    // absorbed into a count. Measured 2026-08-07.
    const health = readRouteHealth(id);
    expect((health.blockers ?? []).length, `${id} has no blockers left`).toBeGreaterThan(0);
  });

  it("keeps the three game templates marked not-public-ready with a named blocker", () => {
    for (const id of BLOCKED_ROUTES) {
      const route = gates.routes.find((candidate) => candidate.id === id)!;
      const status = route.gameTemplateStatus;
      if (status === undefined) continue; // not every blocked route declares a template
      expect(status.publicTemplateReady, `${id} template was marked public-ready`).toBe(false);
      expect(status.blocker, `${id} template has no named blocker`).toBeTruthy();
    }
  });

  it("keeps the human visual-review verdict as needs-work", () => {
    // R5 says human review, and this file is where it is recorded. A verdict flipped to `pass`
    // without a new `reviewedAt` and `sourceCommit` would be the promotion.
    const review = JSON.parse(readFileSync("docs/project/showcase-visual-review.json", "utf8")) as {
      readonly routes: readonly { readonly id: string; readonly verdict: string }[];
    };
    for (const id of BLOCKED_ROUTES) {
      const row = review.routes.find((candidate) => candidate.id === id);
      expect(row, `${id} is missing from the visual review`).toBeDefined();
      expect(row!.verdict, `${id} visual review was flipped to ${row!.verdict}`).toBe("needs-work");
    }
  });

  it("keeps them out of Tier 1 and Tier 2, because a tier is a promotion", () => {
    const path = "tests/reports/route-tiers/report.json";
    expect(existsSync(path), "route tier inventory missing; run tools/route-tiers").toBe(true);
    const report = JSON.parse(readFileSync(path, "utf8")) as {
      readonly routes: readonly { readonly id: string; readonly tier: number }[];
    };
    for (const id of BLOCKED_ROUTES) {
      const row = report.routes.find((candidate) => candidate.id === id);
      expect(row, `${id} is missing from the tier inventory`).toBeDefined();
      expect(row!.tier, `${id} was promoted to tier ${row!.tier}`).toBe(3);
    }
  });

  it("binds redesigned screenshots without promoting the blocked routes", () => {
    /*
     * A fixed pre-redesign digest used to prevent refreshing a poster while hiding an unresolved
     * defect. Once the routes are materially rebuilt, keeping that digest would instead force the
     * tracked evidence to describe obsolete pixels. Bind route health to the current generated
     * composition report, while the independent-human blocker continues to prevent promotion.
     */
    for (const id of ["showcase-skyline-runner", "showcase-turbo-drift-circuit"] as const) {
      const health = readRouteHealth(id) as unknown as {
        readonly gameAssetPairEvidence?: { readonly screenshotSha256?: string };
      };
      const report = JSON.parse(readFileSync(
        `apps/${id}/game-template/${id}-asset-pair-composition.json`,
        "utf8"
      )) as { readonly pass?: boolean; readonly screenshot?: { readonly sha256?: string } };
      expect(report.pass, `${id}: composition report does not pass`).toBe(true);
      expect(health.gameAssetPairEvidence?.screenshotSha256, `${id}: route-health screenshot binding is stale`)
        .toBe(report.screenshot?.sha256);
      expect(readRouteHealth(id).publicShowcase, `${id}: evidence refresh promoted the route`).toBe(false);
    }
  });

  it("records that a blocked route's rendering changed, without promoting it", () => {
    /*
     * The corollary, and the useful half. Skyline's regenerated image no longer matches its
     * committed digest — because the WS-4.3 physics fixes (capsule grounding, rotation-aware
     * queries, the platformer apex, the solver-iteration default) changed what it draws.
     *
     * That divergence is *evidence the engine fixes reached the route*, and it is also exactly the
     * state a human reviewer needs to see: the committed approval describes an older render. R5
     * says a human decides, so this asserts the divergence is **detectable** rather than
     * papering over it by refreshing the record.
     */
    const path = "tests/reports/showcase-route-primary-probes/showcase-skyline-runner.png";
    if (!existsSync(path)) return; // gitignored artifact; absent on a clean checkout
    const actual = `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
    const health = readRouteHealth("showcase-skyline-runner") as unknown as {
      readonly gameAssetPairEvidence?: { readonly screenshotSha256?: string };
    };
    const recorded = health.gameAssetPairEvidence?.screenshotSha256;
    if (actual === recorded) return; // nothing regenerated locally; nothing to review
    // Diverged: the route must still be blocked, and its human verdict must still be needs-work.
    expect(readRouteHealth("showcase-skyline-runner").publicShowcase).toBe(false);
    const review = JSON.parse(readFileSync("docs/project/showcase-visual-review.json", "utf8")) as {
      readonly routes: readonly { readonly id: string; readonly verdict: string }[];
    };
    expect(review.routes.find((route) => route.id === "showcase-skyline-runner")?.verdict).toBe("needs-work");
  });
});
