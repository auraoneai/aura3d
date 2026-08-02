import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rebuildingRoutes = [
  "showcase-blockfall-reactor",
  "showcase-turbo-drift-circuit",
  "showcase-skyline-runner"
] as const;

describe("current showcase claims", () => {
  it("keeps all three rebuilding games out of public release promotion", () => {
    const config = JSON.parse(readFileSync("tools/showcase-library/route-gates.json", "utf8")) as {
      routes: Array<{ id: string; releaseClass: string }>;
    };
    for (const routeId of rebuildingRoutes) {
      const route = config.routes.find((candidate) => candidate.id === routeId);
      const health = JSON.parse(readFileSync(`apps/${routeId}/route-health.json`, "utf8")) as {
        classification?: string;
        publicShowcase?: boolean;
        blockers?: string[];
      };
      expect(route?.releaseClass, routeId).toBe("prototype-blocked");
      expect(health.classification, routeId).toBe("prototype-blocked");
      expect(health.publicShowcase, routeId).toBe(false);
      expect(health.blockers?.length, routeId).toBeGreaterThan(0);
    }
  });

  it("labels Aura Clash as a development showcase rather than a flagship or approved launch", () => {
    const sources = [
      readFileSync("README.md", "utf8"),
      readFileSync("apps/aura-clash-showcase/README.md", "utf8"),
      readFileSync("docs/project/showcase/apps-classification.md", "utf8"),
      readFileSync("docs/project/showcase/aura-clash-showcase-plan.md", "utf8")
    ].join("\n");
    expect(sources).toContain("development showcase");
    expect(sources).not.toMatch(/Aura Clash (?:is|as) (?:a )?(?:flagship|launch-ready|visually approved)/i);
  });

  it("does not treat the retired July 19 review as current approval", () => {
    const review = JSON.parse(readFileSync("docs/project/showcase-visual-review.json", "utf8")) as {
      schema?: string;
      overallVerdict?: string;
      reviewedAt?: string;
    };
    expect(review.schema).toBe("aura3d-showcase-visual-review/2.0");
    expect(review.overallVerdict).toBe("needs-work");
    expect(Date.parse(review.reviewedAt ?? "")).toBeGreaterThan(Date.parse("2026-07-19T23:59:59Z"));
  });
});
