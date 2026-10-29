import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Calibration sweep for the five no-HDRI looks: steady-state mean luma of the look scene with the procedural fill scaled by
 * each factor. Prints `LOOK_SWEEP <json>`. Remote only (tools/remote-acr/run.sh).
 */
const IDS = ["night-city", "polar-night", "neon-arcade", "space", "underwater"];
const SCALES = [0, 0.6, 0.7, 0.8, 0.9, 1];

test("fill scale sweep", async ({ page }) => {
  test.setTimeout(900_000);
  const server: ExampleDevServer = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}/tests/browser/exposure-looks-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as { __LOOKS__?: unknown }).__LOOKS__), undefined, { timeout: 60_000 });
    for (const id of IDS) {
      for (const scale of SCALES) {
        const c = await page.evaluate(([i, k]) => (window as unknown as { __LOOKS__: { render(i: string, ms: number, k: number): Promise<{ meanLuma: number; firstFrameLuma: number }> } }).__LOOKS__.render(i as string, 4000, k as number), [id, scale] as const);
        console.log(`LOOK_SWEEP ${JSON.stringify({ id, scale, meanLuma: c.meanLuma, firstFrameLuma: c.firstFrameLuma })}`);
      }
    }
  } finally {
    await server.close();
  }
});
