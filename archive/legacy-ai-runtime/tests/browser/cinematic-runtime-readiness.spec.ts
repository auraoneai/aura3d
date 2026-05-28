import { expect, test } from "@playwright/test";
import {
  CINEMATIC_RUNTIME_READINESS_REPORT,
  createCinematicRuntimeReadinessReport,
  writeCinematicRuntimeReadinessReport,
  type CinematicRuntimeProbe
} from "../../tools/cinematic-runtime-readiness/index";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

interface CinematicBrowserRuntime {
  readonly status: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly textures: number;
  readonly renderer: string;
  readonly renderWidth: number;
  readonly renderHeight: number;
}

test.describe("cinematic runtime readiness", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("requires renderer-owned VFX, prop, environment, animation, and clean runtime diagnostics", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/apps/cinematic-prompt-to-scene/?chrome=hidden`, { waitUntil: "domcontentloaded" });
    const first = await waitForRuntime(page);
    await page.waitForTimeout(900);
    const second = await waitForRuntime(page);
    const runtime: CinematicRuntimeProbe = {
      status: second.status,
      frameCount: second.frameCount,
      drawCalls: second.drawCalls,
      textures: second.textures,
      renderer: second.renderer,
      backend: second.renderer?.replace("a3d-", ""),
      renderWidth: second.renderWidth,
      renderHeight: second.renderHeight,
      consoleErrors,
      pageErrors,
      cameraAnimationAdvanced: (second.frameCount ?? 0) > (first.frameCount ?? 0)
    };
    const report = createCinematicRuntimeReadinessReport({
      runtime,
      screenshots: ["tests/reports/cinematic/screenshots/cinematic-route-health.png", "tests/reports/cinematic/screenshots/cinematic-prompt-to-scene.png"]
    });
    writeCinematicRuntimeReadinessReport(report);
    expect(report.pass, `${CINEMATIC_RUNTIME_READINESS_REPORT}\n${report.failures.map((entry) => entry.detail).join("\n")}`).toBe(true);
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
    renderer: "unknown",
    renderWidth: 0,
    renderHeight: 0
  });
}
