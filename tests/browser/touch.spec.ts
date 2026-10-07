import type {} from "./hud-layout-harness";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Touch controls gate (PRD-09 1767 + §6.11): presets mount real elements with
 * >=48px targets, hidden until the first touchstart (unless the coarse-pointer
 * rule fires first), and [data-a3g-keyhint] elements hide once touch shows.
 */
test.describe("touch controls", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("presets mount >=48px targets and follow the visibility rule", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/tests/browser/hud-layout-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_HUD__?.status !== undefined, undefined, { timeout: 15_000 });
    const result = await page.evaluate(() => window.__AURA3D_HUD__);
    expect(result?.status, result?.error).toBe("ready");

    for (const report of result!.reports) {
      const t = report.touch;
      expect(t.preset, report.name).toBeTruthy();
      expect(t.elements.length, `${report.name} touch elements`).toBeGreaterThan(0);
      expect(t.minTargetPx, `${report.name} min target`).toBeGreaterThanOrEqual(48);
      expect(t.visibleInitially, `${report.name} hidden before first touch`).toBe(false);
      expect(t.visibleAfterTouch, `${report.name} visible after first touch`).toBe(true);
      expect(t.keyhintHiddenAfterTouch, `${report.name} keyhint hidden`).toBe(true);
    }

    // per-preset element assertions: steer-pedals has throttle/brake/boost,
    // dpad-4btn has the four action buttons, aim-drag has charge.
    const courier = result!.reports.find((r) => r.name === "courier")!.touch;
    expect(courier.elements).toEqual(expect.arrayContaining(["throttle", "brake"]));
    const clash = result!.reports.find((r) => r.name === "aura-clash")!.touch;
    expect(clash.elements).toEqual(expect.arrayContaining(["light", "heavy", "special", "jump"]));
    const bank = result!.reports.find((r) => r.name === "bank-shot")!.touch;
    expect(bank.elements).toContain("charge");
  });
});
