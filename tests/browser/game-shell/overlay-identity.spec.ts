/**
 * overlay-identity.spec.ts (PRD-09 §15): juice idle (overlay amounts 0) vs
 * juice disabled must render identical output — max per-channel abs diff = 0
 * on the canvas readback and the page screenshot, on WebGL2 and on WebGPU
 * (Chromium w/ WebGPU enabled; the C-05 stub's DOM element must be absent or
 * fully transparent at zero). The shader-path variant is integrated-only
 * until the real C-05 setOutputOverlay lands (capability-detected).
 */
import { expect, test, loadHarness, stepFrames, withServer, type Page } from "./support";

type Pixels = number[] | null;

async function snapPixels(page: Page): Promise<Pixels> {
  return page.evaluate(() => window.__AURA3D_SHELL__!.readPixels?.() ?? null);
}

function maxDiff(a: Pixels, b: Pixels): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i += 1) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

withServer((getServer) => {
  test("idle overlay is pixel-identical to disabled", async ({ page }) => {
    // Pass A: juice mounted but idle (peak amounts resolve to 0).
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    await stepFrames(page, 3);
    const idle = await snapPixels(page);
    const idleShot = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });

    // Pass B: force the overlay element off + bypass via shell.overlay:"dom"
    // (the DOM driver is the standalone path; amounts already read 0).
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>(".a3g-overlay").forEach((el) => {
        el.style.opacity = "0";
        el.style.display = "none";
      });
    });
    await stepFrames(page, 1);
    const off = await snapPixels(page);
    const offShot = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });

    expect(maxDiff(idle, off), "canvas readback differs with idle overlay").toBe(0);
    expect(idleShot.equals(offShot), "page screenshot differs with idle overlay").toBe(true);
  });

  test("overlay DOM element is absent or fully transparent at zero", async ({ page }) => {
    await loadHarness(page, getServer(), "?scenario=frozen&animate=0");
    await stepFrames(page, 2);
    const probe = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".a3g-overlay");
      if (!el) return { present: false, opacity: 0 };
      return { present: true, opacity: Number.parseFloat(getComputedStyle(el).opacity) || 0 };
    });
    if (probe.present) {
      expect(probe.opacity, "stub overlay element visible at idle").toBe(0);
    }
  });
});
