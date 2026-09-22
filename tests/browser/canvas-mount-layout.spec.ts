/**
 * Guards the shared canvas-mount layout rule in `applyDefaultCanvasMountLayout`.
 *
 * A mount that owns the page should be viewport-tall. A mount nested inside a layout
 * container must fill that container instead: forcing `100vh` onto a nested mount made
 * it taller than its own parent by the parent's padding, and because these routes set
 * `body { overflow: hidden }`, the bottom strip of the playfield was simply amputated
 * with no scrollbar to recover it. Bank Shot, Vault Breakers and Patrol Wing all lost
 * roughly 32 px of visible game that way.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const PADDED_SHELL_ROUTES = [
  "showcase-bank-shot",
  "showcase-vault-breakers",
  "showcase-patrol-wing",
  "showcase-siege-golf",
];

test.describe("nested canvas mount layout", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  for (const route of PADDED_SHELL_ROUTES) {
    test(`${route} keeps its whole playfield inside the viewport`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`${server.origin}/apps/${route}/`, { waitUntil: "load", timeout: 120_000 });
      await page.waitForSelector("canvas", { timeout: 60_000 });
      await page.waitForTimeout(12_000);

      const geometry = await page.evaluate(() => {
        const canvas = document.querySelector("canvas")!;
        const mount = canvas.parentElement!;
        const canvasRect = canvas.getBoundingClientRect();
        const mountRect = mount.getBoundingClientRect();
        const style = getComputedStyle(mount);
        return {
          canvasBottom: canvasRect.bottom,
          canvasHeight: canvasRect.height,
          mountHeight: mountRect.height,
          mountMinHeight: style.minHeight,
          viewportHeight: window.innerHeight,
          documentHeight: document.documentElement.scrollHeight,
        };
      });

      // Nothing of the playfield may fall below the fold.
      expect(geometry.canvasBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
      // The page must not be scrollable to reach hidden game area.
      expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
      // The canvas fills its mount rather than the viewport.
      expect(Math.abs(geometry.canvasHeight - geometry.mountHeight)).toBeLessThanOrEqual(2);
      expect(geometry.mountMinHeight).not.toBe(`${geometry.viewportHeight}px`);
    });
  }

  test("a page-owning mount still gets viewport height", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await page.goto(`${server.origin}/apps/showcase-rooftop-buckets/`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForSelector("canvas", { timeout: 60_000 });
    await page.waitForTimeout(12_000);

    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      return { height: rect.height, bottom: rect.bottom, viewport: window.innerHeight };
    });

    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.height).toBeGreaterThan(geometry.viewport * 0.8);
  });
});
