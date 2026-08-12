import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import {
  CURRENT_ROUTE_HEALTH_ORIGIN,
  CURRENT_ROUTE_HEALTH_REPORT,
  discoverCurrentRootLinks,
  evaluateCurrentRoute,
  newCurrentRouteHealthPage,
  type CurrentRouteHealthReport
} from "../../tools/current-routes-route-health/index";

const EXPECTED_STARTER_ROUTES = [
  "/apps/hello-world-typed-asset/",
  "/apps/material-lighting/",
  "/apps/camera-path/",
  // The Three.js instancing-parity audit reads this route's runtime evidence out of the
  // generated route-health report, so it has to be evaluated here rather than only discovered.
  "/apps/instancing-performance/"
] as const;

test.describe("current route health", () => {
  test.setTimeout(120_000);

  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    server = await createServer({
      root: process.cwd(),
      logLevel: "error",
      server: { hmr: false }
    });
    await server.listen(0);
    origin = server.resolvedUrls?.local[0]?.replace(/\/$/, "")
      ?? server.resolvedUrls?.network[0]?.replace(/\/$/, "")
      ?? CURRENT_ROUTE_HEALTH_ORIGIN;
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("root visible starter examples reach ready and draw", async ({ browser }) => {
    const routeOrigin = process.env.A3D_ROUTE_HEALTH_ORIGIN ?? origin;
    const rootPage = await newCurrentRouteHealthPage(browser);
    const root = await discoverCurrentRootLinks(rootPage, routeOrigin);
    await rootPage.close();

    expect(root.responseStatus, root.failures.join("\n")).toBe(200);
    for (const path of EXPECTED_STARTER_ROUTES.filter((path) => path !== "/apps/instancing-performance/")) {
      expect(root.links.map((link) => link.path)).toContain(path);
    }

    const routes = [];
    const healthRoutes = [
      ...root.links.filter((link) => EXPECTED_STARTER_ROUTES.includes(link.path as (typeof EXPECTED_STARTER_ROUTES)[number])),
      {
        label: "CurrentRoutes Instancing Performance",
        href: `${routeOrigin}/apps/instancing-performance/`,
        path: "/apps/instancing-performance/"
      }
    ];
    for (const route of healthRoutes) {
      const page = await newCurrentRouteHealthPage(browser);
      const result = await evaluateCurrentRoute(page, route);
      routes.push(result);
      await page.close();
      expect(result.status, formatRouteFailure(result.failures)).toBe("ready");
      expect(result.drawCalls ?? 0, formatRouteFailure(result.failures)).toBeGreaterThan(0);
      expect(result.consoleErrors, formatRouteFailure(result.failures)).toEqual([]);
      expect(result.pageErrors, formatRouteFailure(result.failures)).toEqual([]);
      expect(result.responseErrors, formatRouteFailure(result.failures)).toEqual([]);
      expect(result.canvas?.pass, formatRouteFailure(result.failures)).toBe(true);
      expect(result.screenshot?.pass, formatRouteFailure(result.failures)).toBe(true);
    }

    const failures = [
      ...root.failures,
      ...routes.flatMap((route) => route.failures.map((failure) => `${route.path}: ${failure}`))
    ];
    const report: CurrentRouteHealthReport = {
      schema: "a3d-current-routes-route-health",
      generatedAt: new Date().toISOString(),
      origin: routeOrigin,
      root: {
        url: `${routeOrigin}/index.html`,
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
    writeFileSync(resolve(CURRENT_ROUTE_HEALTH_REPORT), `${JSON.stringify(report, null, 2)}\n`);
  });
});

function formatRouteFailure(failures: readonly string[]): string {
  return failures.length > 0 ? failures.join("\n") : "route health result did not satisfy the route contract";
}
