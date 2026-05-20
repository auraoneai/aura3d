import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  V8_ROUTE_HEALTH_ORIGIN,
  V8_ROUTE_HEALTH_REPORT,
  discoverV8RootLinks,
  evaluateV8Route,
  type V8RouteHealthReport
} from "../../tools/v8-route-health/index";

test.describe("V8 route health", () => {
  test.setTimeout(60_000);

  test("root and linked working routes settle honestly on localhost:5180", async ({ browser }) => {
    const origin = V8_ROUTE_HEALTH_ORIGIN;
    const rootPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const root = await discoverV8RootLinks(rootPage, origin);
    await rootPage.close();

    expect(root.responseStatus, root.failures.join("\n")).toBe(200);
    expect(root.links.length, root.failures.join("\n")).toBeGreaterThan(0);
    expect(root.links.map((link) => link.path)).toContain("/apps/v8-animation-keyframes/");
    expect(root.links.map((link) => link.path)).toContain("/apps/v8-skinning-blending/");
    expect(root.links.map((link) => link.path)).toContain("/apps/v8-camera/");
    expect(root.links.map((link) => link.path)).toContain("/apps/v8-parallax-barrier/");

    const routes = [];
    for (const route of root.links) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const result = await evaluateV8Route(page, route);
      routes.push(result);
      await page.close();

      await test.step(`${route.path} reaches ready and draws`, async () => {
        expect(result.settled, formatRouteFailure(result.failures)).toBe(true);
        expect(result.status, formatRouteFailure(result.failures)).toBe("ready");
        expect(result.drawCalls ?? 0, formatRouteFailure(result.failures)).toBeGreaterThan(0);
        expect(result.failures, formatRouteFailure(result.failures)).toEqual([]);
      });
    }

    const failures = [
      ...root.failures,
      ...routes.flatMap((route) => route.failures.map((failure) => `${route.path}: ${failure}`))
    ];
    const report: V8RouteHealthReport = {
      schema: "g3d-v8-route-health/v1",
      generatedAt: new Date().toISOString(),
      origin,
      root: {
        url: `${origin}/`,
        status: root.responseStatus,
        ok: root.failures.length === 0,
        loadTimeMs: root.loadTimeMs,
        routeCount: root.links.length,
        links: root.links,
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
