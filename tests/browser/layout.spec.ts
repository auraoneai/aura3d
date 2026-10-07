import type {} from "./hud-layout-harness";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * HUD layout gate (PRD-09 1767 + §17): the three route fixtures' widget lists
 * must mount on the shared kit inside the anchor slots, render every widget
 * into `snapshot()`, and stay under each route's screen-fraction budget
 * (courier/aura-clash 22%, bank-shot 15%).
 */
test.describe("hud layout", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("fixtures mount widgets into anchors under the screen-fraction cap", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/tests/browser/hud-layout-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_HUD__?.status !== undefined, undefined, { timeout: 15_000 });
    const result = await page.evaluate(() => window.__AURA3D_HUD__);
    expect(result?.status, result?.error).toBe("ready");

    const caps: Record<string, number> = { courier: 0.22, "bank-shot": 0.15, "aura-clash": 0.22 };
    const counts: Record<string, number> = { courier: 7, "bank-shot": 6, "aura-clash": 14 };
    for (const report of result!.reports) {
      expect(report.widgetCount, report.name).toBe(counts[report.name]);
      expect(report.screenFraction, `${report.name} screen fraction`).toBeLessThanOrEqual(caps[report.name]);
      // every widget produced a measurable rect inside the canvas box
      for (const [id, r] of Object.entries(report.widgetRects)) {
        expect(r.w, `${report.name}:${id} width`).toBeGreaterThan(0);
        expect(r.h, `${report.name}:${id} height`).toBeGreaterThan(0);
      }
    }

    // anchor placement assertions per fixture
    const courier = result!.reports.find((r) => r.name === "courier")!;
    expect(courier.anchors["top"]).toContain("timer");
    expect(courier.anchors["top-right"]).toEqual(expect.arrayContaining(["score", "combo"]));
    expect(courier.anchors["center"]).toContain("nav");

    const clash = result!.reports.find((r) => r.name === "aura-clash")!;
    expect(clash.anchors["top-left"]).toEqual(expect.arrayContaining(["p1-health", "p1-meter", "p1-rounds"]));
    expect(clash.anchors["top-right"]).toEqual(expect.arrayContaining(["p2-health", "p2-meter", "p2-rounds"]));
    expect(clash.anchors["left"]).toContain("combo");

    const bank = result!.reports.find((r) => r.name === "bank-shot")!;
    expect(bank.anchors["bottom-right"]).toContain("strike");
    expect(bank.anchors["bottom"]).toContain("prompt");
  });

  test("mobile viewport keeps widget rects on-screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/tests/browser/hud-layout-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_HUD__?.status !== undefined, undefined, { timeout: 15_000 });
    const result = await page.evaluate(() => window.__AURA3D_HUD__);
    expect(result?.status, result?.error).toBe("ready");
    for (const report of result!.reports) {
      for (const [id, r] of Object.entries(report.widgetRects)) {
        expect(r.x + r.w, `${report.name}:${id} right edge`).toBeLessThanOrEqual(390);
        expect(r.y + r.h, `${report.name}:${id} bottom edge`).toBeLessThanOrEqual(844);
      }
    }
  });
});
