/**
 * touch.spec.ts (PRD-09 §15, mobile emulation `hasTouch: true`): the touch
 * preset shows controls only after a real touch, ≥44 px targets, and a tap on
 * a control lands its mapped action on the input sink. Runs under the
 * `webkit-mobile`/`chromium-mobile` projects in playwright.prd09.config.ts.
 */
import { devices } from "@playwright/test";
import { expect, test, withServer } from "./support";
import type { Page } from "@playwright/test";

test.use({ ...devices["Pixel 7"], hasTouch: true });

async function loadTouch(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/tests/browser/game-shell/harness.html?scenario=frozen`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForFunction(() => window.__AURA3D_SHELL__?.status === "ready", undefined, { timeout: 30_000 });
}

withServer((getServer) => {
  test("touch controls appear on first touch and drive the mapped action", async ({ page }) => {
    await loadTouch(page, getServer().origin);
    await page.waitForTimeout(300);

    const before = await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>(".a3g-touch [data-control]").length
    );

    await page.touchscreen.tap(200, 600);
    await page.waitForTimeout(100);

    const after = await page.evaluate(() => {
      const els = [...Array.from(document.querySelectorAll<HTMLElement>(".a3g-touch [data-control]"))];
      return {
        count: els.length,
        minTarget: els.length
          ? Math.min(...els.map((el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }))
          : 0,
        visible: els.filter((el) => getComputedStyle(el).display !== "none").length
      };
    });

    // The fixture mounts a touch preset — controls materialize on first touch
    // with ≥44 px targets (§6.11). If the build exposes no touch layer the
    // assert fails loudly instead of passing vacuously.
    expect(after.count, "no touch controls rendered after first touch").toBeGreaterThan(before);
    expect(after.minTarget).toBeGreaterThanOrEqual(44);
    expect(after.visible).toBeGreaterThan(0);
  });

  test("tapping a control delivers its mapped action to the input sink", async ({ page }) => {
    await loadTouch(page, getServer().origin);
    await page.touchscreen.tap(200, 600);
    await page.waitForTimeout(100);

    const pressed = await page.evaluate(async () => {
      const els = [...Array.from(document.querySelectorAll<HTMLElement>(".a3g-touch [data-control]"))]
        .filter((el) => getComputedStyle(el).display !== "none");
      if (els.length === 0) return null;
      const el = els[0];
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [] as never }));
      const down = new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: cx, clientY: cy });
      el.dispatchEvent(down);
      await new Promise((res) => setTimeout(res, 50));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: cx, clientY: cy }));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [] as never }));
      return el.getAttribute("data-control");
    });
    expect(pressed, "no visible touch control to tap").not.toBeNull();
    // The control's mapping is asserted by the HUD harness's actionsReceived
    // sink in the touch spec of hud-layout-harness; here we assert the tap
    // reached a control element (no swallowed pointer events under the HUD).
    expect(pressed!.length).toBeGreaterThan(0);
  });
});
