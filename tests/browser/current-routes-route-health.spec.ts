import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  V8_ROUTE_HEALTH_ORIGIN,
  V8_ROUTE_HEALTH_REPORT,
  discoverV8RootLinks,
  evaluateV8Route,
  newV8RouteHealthPage,
  type V8RouteHealthReport
} from "../../tools/current-routes-route-health/index";

const EXPECTED_CURRENT_WOW_ROUTES = [
  "/apps/wow-tokyo-keyframes/",
  "/apps/wow-kira-ik-room/",
  "/apps/wow-neon-city/",
  "/apps/wow-orbital-fleet/",
  "/apps/wow-crystal-cavern/",
  "/apps/wow-robot-parade/",
  "/apps/wow-particle-vortex/",
  "/apps/wow-ocean-temple/",
  "/apps/wow-physics-arena/",
  "/apps/wow-material-cathedral/",
  "/apps/wow-astral-garden/",
  "/apps/wow-quantum-stage/"
] as const;

test.describe("V8 route health", () => {
  test.setTimeout(240_000);

  test("root visible authored routes have smoke, screenshot, DPR, and motion evidence", async ({ browser }) => {
    const origin = V8_ROUTE_HEALTH_ORIGIN;
    const rootPage = await newV8RouteHealthPage(browser);
    const root = await discoverV8RootLinks(rootPage, origin);
    await rootPage.close();

    expect(root.responseStatus, root.failures.join("\n")).toBe(200);
    expect(root.links.length, root.failures.join("\n")).toBeGreaterThan(0);
    expect(root.links.map((link) => link.path)).toContain("/apps/advanced-examples-gallery/");
    for (const path of EXPECTED_CURRENT_WOW_ROUTES) {
      expect(root.links.map((link) => link.path)).toContain(path);
    }

    const routes = [];
    for (const route of root.links) {
      const page = await newV8RouteHealthPage(browser);
      const result = await evaluateV8Route(page, route);
      routes.push(result);
      await page.close();

      await test.step(`${route.path} reaches ready and draws`, async () => {
        expect(result.settled, formatRouteFailure(result.failures)).toBe(true);
        expect(result.status, formatRouteFailure(result.failures)).toBe("ready");
        expect(result.drawCalls ?? 0, formatRouteFailure(result.failures)).toBeGreaterThan(0);
        expect(result.consoleErrors, formatRouteFailure(result.failures)).toEqual([]);
        expect(result.pageErrors, formatRouteFailure(result.failures)).toEqual([]);
        expect(result.responseErrors, formatRouteFailure(result.failures)).toEqual([]);
        expect(result.canvas?.pass, formatRouteFailure(result.failures)).toBe(true);
        expect(result.canvas?.backingScaleX ?? 0, formatRouteFailure(result.failures)).toBeGreaterThanOrEqual(1.18);
        expect(result.canvas?.backingScaleY ?? 0, formatRouteFailure(result.failures)).toBeGreaterThanOrEqual(1.18);
        expect(result.screenshot?.pass, formatRouteFailure(result.failures)).toBe(true);
        expect(result.screenshot?.path, formatRouteFailure(result.failures)).toContain("tests/reports/legacy-route-health/screenshots/");
        if (result.motion.required) {
          expect(result.motion.pass, formatRouteFailure(result.failures)).toBe(true);
          expect(result.motion.changedRatio, formatRouteFailure(result.failures)).toBeGreaterThanOrEqual(result.motion.minimumChangedRatio);
        }
        expect(result.failures, formatRouteFailure(result.failures)).toEqual([]);
      });
    }

    expect(root.legacySurfaceVisibility.visibleLegacyRoutes, root.failures.join("\n")).toEqual([]);
    expect(root.legacySurfaceVisibility.result, root.failures.join("\n")).toBe("none-visible");

    const failures = [
      ...root.failures,
      ...routes.flatMap((route) => route.failures.map((failure) => `${route.path}: ${failure}`))
    ];
    const report: V8RouteHealthReport = {
      schema: "a3d-current-routes-route-health/v1",
      generatedAt: new Date().toISOString(),
      origin,
      root: {
        url: `${origin}/`,
        status: root.responseStatus,
        ok: root.failures.length === 0,
        loadTimeMs: root.loadTimeMs,
        routeCount: root.links.length,
        links: root.links,
        legacySurfaceVisibility: root.legacySurfaceVisibility,
        failures: root.failures
      },
      routes,
      pass: failures.length === 0,
      failures
    };
    mkdirSync(resolve("tests/reports"), { recursive: true });
    writeFileSync(resolve(V8_ROUTE_HEALTH_REPORT), `${JSON.stringify(report, null, 2)}\n`);
  });
});

function formatRouteFailure(failures: readonly string[]): string {
  return failures.length > 0 ? failures.join("\n") : "route health result did not satisfy the V8 working-route contract";
}
