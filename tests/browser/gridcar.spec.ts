import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { HOOK, emit, look, open, raf } from "./gridroad-lib";

/** Gridlock Courier hero car frames at two sizes (remote only). Evidence: the car reads as an opaque body with a dark canopy. */
test.describe("gridlock courier hero car", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const [w, h] of [[1280, 720], [1440, 900]] as const) {
    test(`hero car at ${w}x${h}`, async ({ browser }) => {
      const page = await open(browser, server, "?manual=1&warmenvms=600000", w, h);
      await page.evaluate((hk) => {
        const api = (window as unknown as Record<string, any>)[hk];
        api.reset();
        api.stepFrames(40, { w: true });
      }, HOOK);
      await raf(page, 2);
      const s = await look(page, await page.screenshot({ type: "png" }));
      process.stdout.write(`@@GC ${w}x${h} ${JSON.stringify({ carBright: Number(s.carBright.toFixed(3)), carMean: Number(s.carMean.toFixed(1)), std: Number(s.std.toFixed(1)) })}\n`);
      emit(`gc-${w}x${h}`, await page.screenshot({ type: "jpeg", quality: 88 }));
      await page.context().close();
    });
  }
});
