import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  CURRENT_ROUTE_HEALTH_ORIGIN,
  discoverCurrentRootLinks,
  evaluateCurrentRoute,
  newCurrentRouteHealthPage
} from "../../tools/current-routes-route-health/index";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const AI_SCENE_ROUTES = [
  "/apps/aura-prompt-to-scene/",
  "/apps/aura-cinematic-prompt-lab/",
  "/apps/aura-scene-diff-editor/",
  "/apps/aura-shot-director/",
  "/apps/aura-world-builder/"
] as const;

test.describe("AI scene route health", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("root exposes all AI scene routes and each route reaches ready", async ({ browser }) => {
    const origin = process.env.A3D_ROUTE_HEALTH_ORIGIN ?? server.origin ?? CURRENT_ROUTE_HEALTH_ORIGIN;
    const rootPage = await newCurrentRouteHealthPage(browser);
    const root = await discoverCurrentRootLinks(rootPage, origin);
    await rootPage.close();
    const linksByPath = new Map(root.links.map((link) => [link.path, link]));
    const routes = [];

    for (const path of AI_SCENE_ROUTES) {
      expect(linksByPath.has(path), root.failures.join("\n")).toBe(true);
      const page = await newCurrentRouteHealthPage(browser);
      const result = await evaluateCurrentRoute(page, linksByPath.get(path)!);
      await page.close();
      routes.push(result);
      expect(result.status, result.failures.join("\n")).toBe("ready");
      expect(result.drawCalls ?? 0, result.failures.join("\n")).toBeGreaterThan(0);
      expect(result.canvas?.pass, result.failures.join("\n")).toBe(true);
      expect(result.screenshot?.pass, result.failures.join("\n")).toBe(true);
      expect(result.failures, result.failures.join("\n")).toEqual([]);
    }

    const failures = routes.flatMap((route) => route.failures.map((failure) => `${route.path}: ${failure}`));
    const report = {
      schema: "a3d-ai-scene-route-health",
      generatedAt: new Date().toISOString(),
      pass: failures.length === 0,
      inputs: {
        origin,
        requiredFiles: [...AI_SCENE_ROUTES],
        requiredReports: [],
        environment: { A3D_AI_SCENE_PROVIDER_MODE: "mock", A3D_AI_SCENE_NETWORK: "disabled" }
      },
      evidence: routes,
      providerMode: "mock",
      networkUsed: false,
      blockedClaims: [],
      unsupportedCases: failures.map((failure) => ({
        id: failure.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        severity: "blocked",
        detail: failure,
        nextAction: "Fix the failing AI scene route before release."
      }))
    };
    mkdirSync(resolve("tests/reports/ai-scene"), { recursive: true });
    writeFileSync(resolve("tests/reports/ai-scene/route-health.json"), `${JSON.stringify(report, null, 2)}\n`);
  });
});
