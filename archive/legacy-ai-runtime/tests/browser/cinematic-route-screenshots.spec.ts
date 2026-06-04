import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readCinematicPngStats } from "../../tools/cinematic-scene-quality/pngStats";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/cinematic/route-health.json";
const screenshotPath = "tests/reports/cinematic/screenshots/cinematic-route-health.png";

interface CinematicBrowserRuntime {
  readonly status: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly textures: number;
  readonly renderer: string;
}

test.describe("cinematic route screenshots", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("captures route health evidence for the north-star cinematic route", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/?chrome=hidden`, { waitUntil: "domcontentloaded" });
    const runtime = await waitForRuntime(page);
    mkdirSync(dirname(resolve(screenshotPath)), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const stats = readCinematicPngStats(resolve(screenshotPath));
    const failures = [
      ...((runtime.status === "ready" || runtime.status === "running") ? [] : [`route status is ${runtime.status}`]),
      ...((runtime.drawCalls ?? 0) > 0 ? [] : ["drawCalls is zero"]),
      ...(stats.nonBlackPixels > stats.width * stats.height * 0.1 ? [] : ["screenshot is mostly black"]),
      ...(consoleErrors.length === 0 ? [] : [`console errors: ${consoleErrors.join("; ")}`]),
      ...(pageErrors.length === 0 ? [] : [`page errors: ${pageErrors.join("; ")}`])
    ];
    const report = {
      schema: "a3d-cinematic-route-health",
      generatedAt: new Date().toISOString(),
      pass: failures.length === 0,
      inputs: {
        origin: server.origin,
        providerMode: "fixture",
        backend: "webgl2",
        requiredFiles: ["/apps/cinematic-prompt-to-scene/"],
        requiredReports: [],
        environment: { A3D_AI_SCENE_PROVIDER_MODE: "fixture", A3D_AI_SCENE_NETWORK: "disabled" }
      },
      evidence: [{ path: "/apps/cinematic-prompt-to-scene/", runtime, screenshot: screenshotPath, stats, consoleErrors, pageErrors }],
      providerMode: "fixture",
      backend: "webgl2",
      networkUsed: false,
      blockedClaims: [],
      failures: failures.map((detail) => ({ id: detail.toLowerCase().replace(/[^a-z0-9]+/g, "-"), severity: "blocked", detail, nextAction: "Fix route readiness before cinematic release." })),
      unsupportedCases: failures.map((detail) => ({ id: detail.toLowerCase().replace(/[^a-z0-9]+/g, "-"), severity: "blocked", detail, nextAction: "Fix route readiness before cinematic release." })),
      screenshots: [{ path: screenshotPath, present: true, stats }]
    };
    mkdirSync(dirname(resolve(reportPath)), { recursive: true });
    writeFileSync(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
    expect(report.pass, failures.join("\n")).toBe(true);
  });
});

async function waitForRuntime(page: import("@playwright/test").Page): Promise<CinematicBrowserRuntime> {
  await page.waitForFunction(() => {
    const runtime = (window as unknown as { __a3dWowRuntime?: { readonly status: string; readonly frameCount: number; readonly drawCalls: number } }).__a3dWowRuntime;
    return runtime && (runtime.status === "ready" || runtime.status === "running") && runtime.frameCount >= 2 && runtime.drawCalls > 0;
  }, undefined, { timeout: 30_000 }).catch(() => undefined);
  return page.evaluate(() => (window as unknown as { __a3dWowRuntime?: CinematicBrowserRuntime }).__a3dWowRuntime ?? {
    status: "missing",
    frameCount: 0,
    drawCalls: 0,
    textures: 0,
    renderer: "unknown"
  });
}
