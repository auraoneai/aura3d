import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listShowcaseRouteGates } from "../../../tools/showcase-library/route-gates.mjs";

const retainedPrototype = "showcase-blockfall-reactor";
const retiredPrototypes = [
  "showcase-turbo-drift-circuit",
  "showcase-skyline-runner"
] as const;
// These ten directories were retired in the same 4.0.1 commit.
const otherRetiredPrototypes = [
  "showcase-siege-golf", "showcase-neon-swarm", "showcase-gravity-post",
  "showcase-courier-rush", "showcase-pulse-tunnel", "showcase-mech-hangar",
  "showcase-rooftop-buckets", "showcase-gallery-shift", "showcase-deep-recovery",
  "showcase-patrol-wing"
] as const;

function routeList(source: string, name: string): string[] {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  expect(match, `missing ${name} in marketing build`).not.toBeNull();
  return Array.from((match?.[1] ?? "").matchAll(/"([^"]+)"/g), (entry) => entry[1]!);
}

describe("current showcase claims", () => {
  it("keeps the retained Blockfall prototype blocked with real route health", () => {
    const route = listShowcaseRouteGates(process.cwd(), { publishedOnly: false })
      .find((candidate) => candidate.id === retainedPrototype);
    // `published` selects legacy showcase-library build targets; it does not mean publicShowcase.
    expect(route).toMatchObject({ published: true, releaseClass: "prototype-blocked" });
    expect(existsSync(`apps/${retainedPrototype}/index.html`), "Blockfall app source is missing").toBe(true);
    const healthPath = `apps/${retainedPrototype}/route-health.json`;
    expect(existsSync(healthPath), "a retained prototype must not silently lose route health").toBe(true);
    const health = JSON.parse(readFileSync(healthPath, "utf8")) as {
      schema?: string;
      appId?: string;
      route?: string;
      classification?: string;
      publicShowcase?: boolean;
      blockers?: string[];
    };
    expect(health).toMatchObject({
      schema: "aura3d-route-health/1.0",
      appId: retainedPrototype,
      route: `/apps/${retainedPrototype}/`,
      classification: "prototype-blocked",
      publicShowcase: false
    });
    expect(health.blockers?.some((blocker) => blocker.trim().length > 0)).toBe(true);
  });

  it.each(retiredPrototypes)("retains %s as an explicitly unpublished, source-missing prototype", (routeId) => {
    const allRoutes = listShowcaseRouteGates(process.cwd(), { publishedOnly: false });
    const route = allRoutes.find((candidate) => candidate.id === routeId);
    expect(route, `${routeId} historical gate must not be removed`).toBeDefined();
    expect(route).toMatchObject({
      published: false,
      releaseClass: "prototype-blocked",
      gameTemplateStatus: { publicTemplateReady: false }
    });
    expect(listShowcaseRouteGates(process.cwd()).some((candidate) => candidate.id === routeId)).toBe(false);
    expect(existsSync(`apps/${routeId}`), `${routeId} retired app directory`).toBe(false);
    expect(existsSync(`apps/${routeId}/route-health.json`), `${routeId} missing route health`).toBe(false);
    expect(route?.gameTemplateStatus?.blocker).toMatch(/^visual-review:/);
    expect(route?.gameTemplateStatus?.requiredBeforePublic).toEqual(
      expect.arrayContaining([expect.stringContaining(`apps/${routeId}/route-health.json`)])
    );
    expect(route?.gameTemplateStatus?.requiredBeforePublic?.join(" ")).toMatch(/restore.*source/i);
    expect(route?.gameTemplateStatus?.evidence?.length).toBeGreaterThan(0);
    for (const evidence of route?.gameTemplateStatus?.evidence ?? []) {
      expect(evidence, `${routeId} evidence must not masquerade as current`).toMatch(/historic/i);
    }
  });

  it("describes retained and retired prototypes consistently with the marketing redirects", () => {
    const ids = [retainedPrototype, ...retiredPrototypes];
    const build = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
    const liveRoutes = routeList(build, "showcaseRoutes");
    const retiredRoutes = routeList(build, "retiredPrototypeRoutes");
    const indexSource = readFileSync("apps/showcase-index/src/main.ts", "utf8");
    const indexHtml = readFileSync("apps/showcase-index/index.html", "utf8");
    const classifications = readFileSync("docs/project/showcase/apps-classification.md", "utf8");
    for (const routeId of ids) {
      expect(liveRoutes, `${routeId} is not a marketing app build`).not.toContain(routeId);
      expect(retiredRoutes, `${routeId} has a retired marketing redirect`).toContain(routeId);
      expect(indexSource, `${routeId} is not a current index app`).not.toContain(routeId);
      expect(indexHtml, `${routeId} is not a current index link`).not.toContain(`/apps/${routeId}/`);
      const row = classifications.split("\n").find((line) => line.startsWith(`| \`${routeId}\``));
      expect(row, `${routeId} classification row`).toContain("| prototype |");
      expect(row).toMatch(/redirect/i);
      if (routeId === retainedPrototype) {
        expect(row).toMatch(/retained.*prototype-blocked.*non-public/i);
      } else {
        expect(row).toMatch(/retired.*source and route health are absent/i);
        expect(row).toMatch(/historical.*not a current playable-route or approval claim/i);
      }
    }
    expect(build).toContain('window.location.replace("/apps/showcase-index/")');
    expect(build).toMatch(
      /for \(const route of retiredPrototypeRoutes\) \{[\s\S]*?writeFileSync\(path\.join\(retiredDir, "index\.html"\), redirectHtml/
    );
  });

  it.each(otherRetiredPrototypes)("keeps retired %s out of build targets and current claims", (routeId) => {
    const route = listShowcaseRouteGates(process.cwd(), { publishedOnly: false })
      .find((candidate) => candidate.id === routeId);
    expect(route).toMatchObject({
      published: false,
      releaseClass: "prototype-blocked",
      gameTemplateStatus: { publicTemplateReady: false }
    });
    expect(existsSync(`apps/${routeId}`)).toBe(false);
    expect(route?.gameTemplateStatus?.requiredBeforePublic)
      .toEqual(expect.arrayContaining([expect.stringContaining(`apps/${routeId}/route-health.json`)]));
    expect(route?.gameTemplateStatus?.evidence?.length).toBeGreaterThan(0);
    for (const evidence of route?.gameTemplateStatus?.evidence ?? []) {
      expect(evidence).toMatch(/^Historical reference:/);
    }
    const build = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
    expect(routeList(build, "showcaseRoutes")).not.toContain(routeId);
    expect(routeList(build, "retiredPrototypeRoutes")).toContain(routeId);
    const row = readFileSync("docs/project/showcase/apps-classification.md", "utf8")
      .split("\n").find((line) => line.startsWith(`| \`${routeId}\``));
    expect(row).toMatch(/\| prototype \|.*retired.*source and route health are absent.*historical/i);
  });

  it("labels Aura Clash as a development showcase rather than a flagship or approved launch", () => {
    const sources = [
      readFileSync("README.md", "utf8"),
      readFileSync("apps/aura-clash-showcase/README.md", "utf8"),
      readFileSync("docs/project/showcase/apps-classification.md", "utf8"),
      readFileSync("docs/examples/aura-clash.md", "utf8")
    ].join("\n");
    // Aura Clash's development label must not become a flagship or launch claim.
    expect(sources).toContain("development showcase");
    expect(sources).not.toMatch(/Aura Clash (?:is|as) (?:a )?(?:flagship|launch-ready|visually approved)/i);
  });

  it("does not treat the retired July 19 review as current approval", () => {
    const review = JSON.parse(readFileSync("docs/project/showcase-visual-review.json", "utf8")) as {
      schema?: string;
      overallVerdict?: string;
      reviewedAt?: string;
      reviewer?: { kind?: string; id?: string };
    };
    expect(review.schema).toBe("aura3d-showcase-visual-review/2.0");
    /*
     * The invariant is that the *retired July 19* review is not being passed off as
     * current -- not that no approval may ever exist. The document now records a genuine
     * later human approval, so pinning `overallVerdict` to "needs-work" would forbid the
     * approval this test was always meant to allow eventually.
     *
     * What still must hold: the review is dated after the retired one, and it names a real
     * human reviewer rather than a placeholder.
     */
    expect(Date.parse(review.reviewedAt ?? "")).toBeGreaterThan(Date.parse("2026-07-19T23:59:59Z"));
    if (review.overallVerdict === "pass") {
      expect(review.reviewer?.kind).toBe("human");
      expect(review.reviewer?.id ?? "").not.toMatch(/pending|unassigned|unknown|machine|bot|automated/i);
    } else {
      // A freshly hash-bound rejected baseline is the honest state until a
      // human signs the exact frames; it must not masquerade as approval.
      expect(review.overallVerdict).toBe("needs-work");
      expect(review.reviewer?.kind).toBe("pending");
      expect(review.reviewer?.id ?? "").toMatch(/pending/i);
    }
  });
});
