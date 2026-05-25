import { expect, test } from "@playwright/test";
import {
  V8_ROUTE_HEALTH_ORIGIN,
  discoverV8RootLinks,
  evaluateV8Route,
  newV8RouteHealthPage
} from "../../tools/current-routes-route-health/index";

test.describe("V8 V7 animation startup truth", () => {
  test("keeps the historical V7 animation route hidden unless it has full route-health evidence", async ({ browser }) => {
    const rootPage = await newV8RouteHealthPage(browser);
    const root = await discoverV8RootLinks(rootPage, V8_ROUTE_HEALTH_ORIGIN);
    await rootPage.close();

    const visibleRoute = root.links.find((link) => link.path === "/apps/regression-animation-keyframes/");
    if (!visibleRoute) {
      expect(root.legacySurfaceVisibility.visibleLegacyRoutes, root.failures.join("\n")).toEqual([]);
      return;
    }

    const page = await newV8RouteHealthPage(browser);
    const result = await evaluateV8Route(page, visibleRoute);
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
