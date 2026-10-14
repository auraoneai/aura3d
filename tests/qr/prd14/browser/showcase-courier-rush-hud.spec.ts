import { expect, test } from "@playwright/test";
import { APPS, builtDist, serve, watchConsole } from "./lib/serve";

/**
 * §14.4 (Courier Rush): the mobile HUD stays under 15% of the screen at
 * 390×844. The HUD grid covers the whole canvas (`inset: 0`, pointer-events
 * none), so the measure is the union of the rendered widget (`.a3g-w`)
 * bounding rects, not the grid itself.
 */

const APP_DIR = "showcase-courier-rush";
const ROUTE_FLAG = "route-courier-rush";

test.describe("showcase-courier-rush mobile HUD (§14.4)", () => {
  test("HUD widget union <= 15% of viewport at 390x844", async ({ page }) => {
    const root = builtDist(APP_DIR);
    expect(root, `${APP_DIR} not built`).not.toBeUndefined();
    const errors = watchConsole(page);
    const { server, url } = await serve(root!);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${url}/?a3d-qr=${ROUTE_FLAG}`);
      await expect.poll(() => page.evaluate(() =>
        (window as Record<string, unknown>).__AURA3D_GAME__ !== undefined), { timeout: 30_000 }).toBe(true);
      await page.waitForTimeout(2500);
      const measured = await page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const widgets = Array.from(document.querySelectorAll<HTMLElement>(".a3g-hud .a3g-w"));
        const visible = widgets.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
        });
        // Union area: widgets are anchored in separate grid cells, so summing
        // rect areas does not double-count.
        const area = visible.reduce((sum, el) => {
          const r = el.getBoundingClientRect();
          return sum + r.width * r.height;
        }, 0);
        return { count: visible.length, area, viewport: vw * vh };
      });
      expect(measured.count, "HUD widgets rendered").toBeGreaterThan(0);
      expect(measured.area / measured.viewport).toBeLessThanOrEqual(0.15);
      expect(errors.filter((e) => e.includes("error")), "page errors").toEqual([]);
    } finally {
      server.close();
    }
  });
});
