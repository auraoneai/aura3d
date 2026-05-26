import { expect, test } from "@playwright/test";
import {
  CURRENT_ROUTE_HEALTH_ORIGIN,
  discoverCurrentRootLinks,
  evaluateCurrentRoute,
  newCurrentRouteHealthPage
} from "../../tools/current-routes-route-health/index";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("animation startup route health truth", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("keeps the historical animation route hidden unless it has full route-health evidence", async ({ browser }) => {
    const rootPage = await newCurrentRouteHealthPage(browser);
    const root = await discoverCurrentRootLinks(rootPage, process.env.A3D_ROUTE_HEALTH_ORIGIN ?? server.origin ?? CURRENT_ROUTE_HEALTH_ORIGIN);
    await rootPage.close();

    const visibleRoute = root.links.find((link) => link.path === "/apps/regression-animation-keyframes/");
    if (!visibleRoute) {
      expect(root.legacySurfaceVisibility.visibleLegacyRoutes, root.failures.join("\n")).toEqual([]);
      return;
    }

    const page = await newCurrentRouteHealthPage(browser);
    const result = await evaluateCurrentRoute(page, visibleRoute);
    await page.close();

    expect(result.visible, result.failures.join("\n")).toBe(true);
    expect(result.status, result.failures.join("\n")).toBe("ready");
    expect(result.drawCalls ?? 0, result.failures.join("\n")).toBeGreaterThan(0);
    expect(result.canvas?.pass, result.failures.join("\n")).toBe(true);
    expect(result.screenshot?.pass, result.failures.join("\n")).toBe(true);
    expect(result.motion.required, result.failures.join("\n")).toBe(true);
    expect(result.motion.pass, result.failures.join("\n")).toBe(true);
    expect(result.failures, result.failures.join("\n")).toEqual([]);
    expect(root.legacySurfaceVisibility.visibleLegacyRoutes, root.failures.join("\n")).toEqual([]);
  });
});
