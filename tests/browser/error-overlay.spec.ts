import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// PRD-15 T4.3 — strict mount failures surface a DOM error overlay over the
// canvas: visible, focusable, axe-clean, readable at 390 px.

test.describe("renderer-mount error overlay (T4.3)", () => {
  test.setTimeout(90_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("shows a focusable, axe-clean alert over the canvas", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(`${server.origin}/tests/browser/error-overlay-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ERROR_OVERLAY__?.status === "ready", undefined, { timeout: 45_000 });

    const result = await page.evaluate(() => window.__AURA3D_ERROR_OVERLAY__);
    expect(result?.readyRejected, result?.error).toBe(true);
    expect(result?.overlayAttached, result?.error).toBe(true);

    const overlay = page.locator('[data-aura3d-error-overlay="true"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("role", "alert");
    await expect(overlay).toHaveAttribute("aria-live", "assertive");

    // The "Copy details" button is keyboard-focusable.
    const copy = overlay.getByRole("button", { name: "Copy details" });
    await copy.focus();
    await expect(copy).toBeFocused();

    // axe-core: no violations inside the overlay (page chrome is out of scope).
    const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const axe = (globalThis as { axe?: { run(el: Element): Promise<{ violations: readonly { id: string }[] }> } }).axe;
      if (!axe) return [{ id: "axe-not-loaded" }];
      const el = document.querySelector('[data-aura3d-error-overlay="true"]');
      if (!el) return [{ id: "overlay-missing" }];
      const { violations } = await axe.run(el);
      return violations;
    });
    expect(violations).toEqual([]);
  });

  test("stays readable at 390 px (no horizontal scroll, ≥16 px text)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(`${server.origin}/tests/browser/error-overlay-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ERROR_OVERLAY__?.status === "ready", undefined, { timeout: 45_000 });

    const overlay = page.locator('[data-aura3d-error-overlay="true"]');
    await expect(overlay).toBeVisible();
    const metrics = await overlay.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        scrollWiderThanClient: el.scrollWidth > el.clientWidth,
        fontSizePx: Number.parseFloat(style.fontSize),
        scrollsVertically: el.scrollHeight > el.clientHeight
      };
    });
    expect(metrics.scrollWiderThanClient).toBe(false);
    expect(metrics.fontSizePx).toBeGreaterThanOrEqual(16);
  });
});
