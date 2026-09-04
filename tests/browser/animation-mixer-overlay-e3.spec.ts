import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = "tests/reports/animation-mixer-overlay-e3";

test.describe("E3 animation debug overlay shows live states, weights, and events", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("overlay renders states plus weights plus events and refreshes per frame", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${server.origin}/tests/browser/animation-mixer-e3-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as any).__AURA3D_ANIMATION_MIXER_E3__), undefined, {
      timeout: 30_000
    });

    const evidence = await page.evaluate(() => (window as any).__AURA3D_ANIMATION_MIXER_E3__);
    expect(evidence?.status, evidence?.error).toBe("ready");
    expect(errors).toEqual([]);

    const overlay = page.locator('[data-overlay="animation-debug"]');
    await expect(overlay).toBeVisible();
    // Live states: all three clips listed with per-state rows.
    for (const name of ["idle", "run", "wave"]) {
      await expect(overlay.locator(`[data-state^="${name}#"]`).first()).toBeVisible();
    }
    // Live weights: the crossfaded run action carries weight ~1.
    const runWeight = await overlay.locator('[data-state="run#1"] [data-weight]').getAttribute("data-weight");
    expect(Number(runWeight)).toBeCloseTo(1, 2);
    // Active events: both clip markers rendered with frame stamps.
    await expect(overlay.locator('[data-event="footstep"]')).toContainText("idle:footstep");
    await expect(overlay.locator('[data-event="stride"]')).toContainText("run:stride");
    // Per-frame refresh: 11 overlay updates, and the DOM changed between phases.
    expect(evidence?.overlayFrame).toBe(11);
    expect(evidence?.overlayLiveChanged).toBe(true);

    await page.screenshot({ path: `${reportDir}/overlay.png` });
    writeJson(`${reportDir}/animation-mixer-overlay-e3.json`, {
      status: evidence?.status,
      overlayFrame: evidence?.overlayFrame,
      stateNames: evidence?.stateNames,
      layerNames: evidence?.layerNames,
      eventsFired: evidence?.eventsFired,
      runWeight,
      overlayLiveChanged: evidence?.overlayLiveChanged,
      pageErrors: errors
    });
  });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
}
