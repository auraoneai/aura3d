import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  CURRENT_ROUTE_HEALTH_ORIGIN,
  CURRENT_ROUTE_HEALTH_REPORT,
  discoverCurrentRootLinks,
  evaluateCurrentRoute,
  newCurrentRouteHealthPage,
  type CurrentRouteHealthReport
} from "../../tools/current-routes-route-health/index";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const EXPECTED_CURRENT_WOW_ROUTES = [
  "/apps/wow-tokyo-keyframes/",
  "/apps/wow-robot-expressive-rig/",
  "/apps/wow-concept-car-cinema/",
  "/apps/wow-damaged-helmet-pbr-detail/",
  "/apps/wow-antique-camera-viewer/",
  "/apps/wow-duck-prop-studio/",
  "/apps/wow-cesium-milk-truck-viewer/",
  "/apps/wow-soldier-animation-viewer/",
  "/apps/wow-boombox-texture-lab/",
  "/apps/wow-avocado-pbr-study/",
  "/apps/wow-clearcoat-material-sample/",
  "/apps/wow-sheen-material-grid/",
  "/apps/wow-standard-animated-cube/",
  "/apps/wow-standard-product-camera/",
  "/apps/wow-standard-material-spheres/",
  "/apps/wow-simple-triangle/",
  "/apps/wow-simple-transforms/",
  "/apps/wow-simple-material-lighting/",
  "/apps/wow-simple-points-lines/",
  "/apps/wow-additional-variant-product/",
  "/apps/wow-additional-transmission-sample/",
  "/apps/wow-additional-cesium-man-animation/",
  "/apps/wow-webgpu-triangle/",
  "/apps/wow-webgpu-render-target/",
  "/apps/wow-webgpu-pbr-asset/",
  "/apps/wow-webgpu-product-viewer/",
  "/apps/wow-webgpu-instancing/",
  "/apps/wow-webgpu-compute-particles/"
] as const;

const EXPECTED_ADVANCED_GALLERY_ROUTES = [
  "/apps/advanced-examples-gallery/#water-lab",
  "/apps/advanced-examples-gallery/#ocean-observatory",
  "/apps/advanced-examples-gallery/#reactor-post",
  "/apps/advanced-examples-gallery/#smart-city",
  "/apps/advanced-examples-gallery/#data-galaxy",
  "/apps/advanced-examples-gallery/#product-configurator",
  "/apps/advanced-examples-gallery/#robotics-lab",
  "/apps/advanced-examples-gallery/#physics-playground",
  "/apps/advanced-examples-gallery/#fog-cathedral",
  "/apps/advanced-examples-gallery/#digital-twin"
] as const;

test.describe("current route health", () => {
  test.setTimeout(240_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("root visible authored routes have smoke, screenshot, DPR, and motion evidence", async ({ browser }) => {
    const origin = process.env.A3D_ROUTE_HEALTH_ORIGIN ?? server.origin ?? CURRENT_ROUTE_HEALTH_ORIGIN;
    const rootPage = await newCurrentRouteHealthPage(browser);
    const root = await discoverCurrentRootLinks(rootPage, origin);
    await rootPage.close();

    expect(root.responseStatus, root.failures.join("\n")).toBe(200);
    expect(root.links.length, root.failures.join("\n")).toBeGreaterThan(0);
    for (const path of EXPECTED_ADVANCED_GALLERY_ROUTES) {
      expect(root.links.map((link) => link.path)).toContain(path);
    }
    for (const path of EXPECTED_CURRENT_WOW_ROUTES) {
      expect(root.links.map((link) => link.path)).toContain(path);
    }

    const routes = [];
    for (const route of root.links) {
      const page = await newCurrentRouteHealthPage(browser);
      const result = await evaluateCurrentRoute(page, route);
      routes.push(result);
      await page.close();

      await test.step(`${route.path} reaches ready and draws`, async () => {
        const webgpuRoute = route.path.startsWith("/apps/wow-webgpu-");
        expect(result.settled, formatRouteFailure(result.failures)).toBe(true);
        if (webgpuRoute && result.status === "unsupported") {
          expect(result.errorText ?? "", formatRouteFailure(result.failures)).toMatch(/webgpu|navigator\.gpu|adapter|device|unsupported/i);
        } else {
          expect(result.status, formatRouteFailure(result.failures)).toBe("ready");
          expect(result.drawCalls ?? 0, formatRouteFailure(result.failures)).toBeGreaterThan(0);
        }
        expect(result.consoleErrors, formatRouteFailure(result.failures)).toEqual([]);
        expect(result.pageErrors, formatRouteFailure(result.failures)).toEqual([]);
        expect(result.responseErrors, formatRouteFailure(result.failures)).toEqual([]);
        expect(result.canvas?.pass, formatRouteFailure(result.failures)).toBe(true);
        const minimumBackingScale = result.path.startsWith("/apps/advanced-examples-gallery/") ? 0.85 : 1.18;
        expect(result.canvas?.backingScaleX ?? 0, formatRouteFailure(result.failures)).toBeGreaterThanOrEqual(minimumBackingScale);
        expect(result.canvas?.backingScaleY ?? 0, formatRouteFailure(result.failures)).toBeGreaterThanOrEqual(minimumBackingScale);
        expect(result.screenshot?.pass, formatRouteFailure(result.failures)).toBe(true);
        expect(result.screenshot?.path, formatRouteFailure(result.failures)).toContain("tests/reports/current-route-health/screenshots/");
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
    const report: CurrentRouteHealthReport = {
      schema: "a3d-current-routes-route-health",
      generatedAt: new Date().toISOString(),
      origin,
      root: {
        url: `${origin}/index.html`,
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
  return failures.length > 0 ? failures.join("\n") : "route health result did not satisfy the current working-route contract";
}
