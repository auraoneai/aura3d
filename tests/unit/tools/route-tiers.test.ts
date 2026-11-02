import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isHostingRedirectedApp, liveGameIssue, readCatalogRoutePlan, readClassificationLabels, readGameInventory, readGateRoutes, readHostingRedirects } from "../../../tools/route-tiers/index";
import { parseAliasBuildContract, parseMarketingRoutes } from "../../../tools/route-tiers/marketing";

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
  let executionError: unknown;
  try {
    execFileSync(resolve("node_modules/.bin/tsx"), ["tools/route-tiers/index.ts"], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    executionError = error;
  }
  const result = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Report;
  // A launcher/runtime failure must not pass by reading an old successful report.
  if (executionError && result.unclassified.length === 0) throw executionError;
  return result;
}

const report = runClassifier();
const marketingSource = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
const marketing = parseMarketingRoutes(marketingSource);
const hostingRedirects = readHostingRedirects();
const aliasPlan = await readCatalogRoutePlan(marketing, parseAliasBuildContract(marketingSource), hostingRedirects);
const games = readGameInventory();
const gates = readGateRoutes();
const labels = readClassificationLabels();

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
        /classification doc|route-gates\.json|marketing\/scripts\/build-showcase-routes\.mjs|marketing\/public\/_redirects|docs\/workflows\/game-inventory\.json|create-aura3d template|shipped document|retained spec|diagnostic naming|Tier 4 candidate/.test(
          route.rationale
        ),
        `${route.id}: rationale does not cite a signal — "${route.rationale}"`
      ).toBe(true);
    }
  });

  it("keeps Tier 1 aligned with marketing and a valid gate or candidate label", () => {
    // An empty Tier 1 is valid while all candidates redirect or lack a valid signal.
    const tier1 = report.routes.filter((route) => route.tier === 1);
    for (const route of tier1) {
      expect(route.root, route.id).toBe("apps");
      expect(marketing.publicRoutes.has(route.id), `${route.id} is not in the marketing public list`).toBe(true);
      expect(marketing.redirectedRoutes.has(route.id), `${route.id} is a marketing redirect`).toBe(false);
      const sourceRoute = existsSync(resolve("apps", route.id, "index.html"));
      expect(sourceRoute, `${route.id} has no source entry point`).toBe(true);
      const game = games.get(route.id);
      if (game) expect(liveGameIssue(game, route.id, marketing, hostingRedirects, sourceRoute, aliasPlan), route.id).toBeUndefined();
      expect(isHostingRedirectedApp(route.id, hostingRedirects), `${route.id} is a host redirect`).toBe(false);
      const validGate = gates.get(route.id)?.releaseClass === "release-ready candidate";
      const candidateLabel = /^release-ready candidate/.test(labels.get(route.id) ?? "");
      expect(
        validGate || candidateLabel,
        `${route.id} is Tier 1 without a release gate or candidate label`
      ).toBe(true);
    }
  });

  it("includes every non-redirected marketing app even when it lacks a classification", () => {
    for (const id of marketing.publicRoutes) {
      if (marketing.redirectedRoutes.has(id)) continue;
      expect(report.routes.some((route) => route.root === "apps" && route.id === id), id).toBe(true);
    }
  });

  it("keeps retained Blockfall at Tier 3 and retired prototypes out of the inventory (R5)", () => {
    const blockfall = report.routes.find((candidate) => candidate.id === "showcase-blockfall-reactor");
    expect(blockfall, "retained Blockfall is missing from the inventory").toBeDefined();
    expect(blockfall!.tier, "Blockfall must not be promoted to Tier 1 or 2").toBe(3);

    const gates = JSON.parse(readFileSync("tools/showcase-library/route-gates.json", "utf8")) as {
      readonly routes: readonly { readonly id: string; readonly published: boolean; readonly releaseClass: string }[];
    };
    for (const id of ["showcase-skyline-runner", "showcase-turbo-drift-circuit"]) {
      expect(existsSync(`apps/${id}`), `${id} source is retired`).toBe(false);
      expect(report.routes.find((candidate) => candidate.id === id), `${id} has no current route to tier`).toBeUndefined();
      expect(gates.routes.find((candidate) => candidate.id === id)).toMatchObject({
        published: false,
        releaseClass: "prototype-blocked"
      });
    }
  });

  it.each([
    "compute-lab", "guard-canvas-lab", "instanced-texture-probe", "selfheal-lab", "webgpu-presentation-probe"
  ])("keeps %s classified as a diagnostic rather than a public release", (id) => {
    const row = report.routes.find((candidate) => candidate.root === "examples" && candidate.id === id);
    expect(row).toMatchObject({ tier: 3 });
    expect(row?.rationale).toContain("classification doc: diagnostic");
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
