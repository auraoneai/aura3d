import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WS-5.4 — the retained Blockfall prototype stays blocked, while the retired Turbo and Skyline
 * sources remain explicitly absent and their historical gates remain unpublished.
 *
 * R5 is unusual among the PRD's rules in that it forbids an action rather than requiring one, so
 * nothing fails when it is obeyed and nothing fails when it is quietly broken either. That is the
 * shape of rule that gets broken during a release push — the promotion is one field in one JSON
 * file, and the honest blocker it replaces is exactly what a release checklist wants gone.
 *
 * A retained blocked route could be promoted in four independent places, checked here and in
 * the separate route-tiers suite:
 *
 * 1. `tools/showcase-library/route-gates.json` — `releaseClass` and `gameTemplateStatus`
 * 2. `apps/<route>/route-health.json` — `classification`, `publicShowcase`, `promotionStatus`,
 *    and the `blockers` array
 * 3. `docs/project/showcase-visual-review.json` — the human verdict
 * 4. `tests/unit/tools/route-tiers.test.ts` — the freshly generated WS-5.1 tier, since a tier is a promotion
 *
 * Turbo and Skyline were subsequently retired with their app directories. Their old review and
 * launch records are historical, not a substitute for current source and route health.
 *
 * These assertions must **fail** if a blocker is deleted. That is not a bug in the test.
 */

const RETAINED_BLOCKED_ROUTES = ["showcase-blockfall-reactor"] as const;
const RETIRED_ROUTES = [
  "showcase-skyline-runner",
  "showcase-turbo-drift-circuit"
] as const;
const BLOCKED_ROUTES = [...RETAINED_BLOCKED_ROUTES, ...RETIRED_ROUTES] as const;

interface GateRoute {
  readonly id: string;
  readonly published?: boolean;
  readonly releaseClass?: string;
  readonly gameTemplateStatus?: {
    readonly publicTemplateReady?: boolean;
    readonly blocker?: string;
    readonly requiredBeforePublic?: readonly string[];
  };
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

  it.each(RETAINED_BLOCKED_ROUTES)("%s is not published as a public showcase route", (id) => {
    const health = readRouteHealth(id);
    expect(health.classification).toBe("prototype-blocked");
    expect(health.publicShowcase, `${id} was marked publicShowcase`).toBe(false);
    // `promotionStatus` must still name a reason. An empty or "ready" value is the promotion.
    expect(health.promotionStatus, `${id} has no promotionStatus`).toBeTruthy();
    expect(health.promotionStatus).not.toMatch(/^(ready|promoted|release-ready|pass)$/i);
  });

  it.each(RETAINED_BLOCKED_ROUTES)("%s still carries at least one named blocker", (id) => {
    // The specific blockers are recorded so deleting one is visible in a diff rather than being
    // absorbed into a count. Measured 2026-08-07.
    const health = readRouteHealth(id);
    expect((health.blockers ?? []).length, `${id} has no blockers left`).toBeGreaterThan(0);
  });

  it.each(RETIRED_ROUTES)("%s is unpublished because its source and health were retired", (id) => {
    const route = gates.routes.find((candidate) => candidate.id === id);
    expect(route?.published, `${id} must not be offered as a build target`).toBe(false);
    expect(existsSync(`apps/${id}`), `${id} source must not be silently treated as present`).toBe(false);
    expect(existsSync(`apps/${id}/route-health.json`), `${id} route health`).toBe(false);
    expect(route?.gameTemplateStatus?.requiredBeforePublic).toEqual(
      expect.arrayContaining([expect.stringContaining(`apps/${id}/route-health.json`)])
    );
  });

  it("keeps declared game templates not-public-ready with a named blocker", () => {
    for (const id of BLOCKED_ROUTES) {
      const route = gates.routes.find((candidate) => candidate.id === id)!;
      const status = route.gameTemplateStatus;
      if (status === undefined) continue; // not every blocked route declares a template
      expect(status.publicTemplateReady, `${id} template was marked public-ready`).toBe(false);
      expect(status.blocker, `${id} template has no named blocker`).toBeTruthy();
    }
  });

  it("retains the historical visual-review verdicts as needs-work", () => {
    // These recorded verdicts are not current approval, especially for the retired routes.
    const review = JSON.parse(readFileSync("docs/project/showcase-visual-review.json", "utf8")) as {
      readonly routes: readonly { readonly id: string; readonly verdict: string }[];
    };
    for (const id of BLOCKED_ROUTES) {
      const row = review.routes.find((candidate) => candidate.id === id);
      expect(row, `${id} is missing from the visual review`).toBeDefined();
      expect(row!.verdict, `${id} visual review was flipped to ${row!.verdict}`).toBe("needs-work");
    }
  });

  it("preserves the retired routes' historical bindings without treating them as current health", () => {
    const archive = JSON.parse(readFileSync("docs/project/showcase-launch-evidence.json", "utf8")) as {
      readonly routes: readonly {
        readonly id: string;
        readonly releaseClass?: string;
        readonly publicReleaseCounted?: boolean;
        readonly routeHealth?: {
          readonly appId?: string;
          readonly classification?: string;
          readonly publicShowcase?: boolean;
          readonly gameAssetPairEvidence?: {
            readonly screenshotSha256?: string;
            readonly geometryEvidence?: { readonly routePrimaryScreenshotSha256?: string };
          };
        };
      }[];
    };
    for (const id of RETIRED_ROUTES) {
      const row = archive.routes.find((candidate) => candidate.id === id);
      expect(row).toMatchObject({
        releaseClass: "prototype-blocked",
        publicReleaseCounted: false,
        routeHealth: { appId: id, classification: "prototype-blocked", publicShowcase: false }
      });
      const pair = row?.routeHealth?.gameAssetPairEvidence;
      expect(pair?.screenshotSha256, `${id} historical screenshot hash`).toMatch(/^sha256-[0-9a-f]{64}$/);
      expect(pair?.geometryEvidence?.routePrimaryScreenshotSha256, `${id} historical geometry binding`)
        .toBe(pair?.screenshotSha256);
    }
  });
});
