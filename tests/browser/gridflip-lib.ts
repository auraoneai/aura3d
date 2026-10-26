import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { HOOK, emit, hasRoad, look, open, raf } from "./gridroad-lib";

/**
 * Gridlock Courier road-flip investigation (docs/audit/game-leftovers.md). Remote-only (tools/remote-acr/run.sh).
 * After a 300 m teleport the road used to come and go between consecutive frames. Each variant teleports, settles, then renders
 * N frames in a row and records whether the road is in each one. `@@GF <variant> <i> std=<luma spread> road=<bool>`.
 */
export function gridFlipVariant(variant: string, query: string, frames = 8, size: readonly [number, number] = [1280, 720]): void {
  test.describe(`gridlock road flip: ${variant}`, () => {
    test.setTimeout(3_300_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    test(`road present in ${frames} consecutive frames after a long jump (${query})`, async ({ browser }) => {
      const page = await open(browser, server, `?manual=1&${query}`, size[0], size[1]);
      await page.evaluate((hk) => {
        const api = (window as unknown as Record<string, any>)[hk];
        api.reset();
        api.teleport(30, -300, 0);
        api.stepFrames(240, { w: true });
        api.stepFrames(30, { w: true, d: true, space: true });
      }, HOOK);
      await raf(page, 2);
      await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].settle(), HOOK);
      const roads: boolean[] = [];
      for (let i = 0; i < frames; i++) {
        await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].stepFrames(1, { w: true }), HOOK);
        await raf(page, 1);
        const png = await page.screenshot({ type: "png" });
        const l = await look(page, png);
        roads.push(hasRoad(l));
        process.stdout.write(`@@GF ${variant} ${i} std=${l.std.toFixed(1)} road=${hasRoad(l)}\n`);
        if (i === 0 || i === frames - 1 || !hasRoad(l)) emit(`gf-${variant}-${i}-${hasRoad(l) ? "road" : "flat"}`, await page.screenshot({ type: "jpeg", quality: 80 }));
      }
      process.stdout.write(`@@GFSUM ${variant} roads=${JSON.stringify(roads)}\n`);
      await page.context().close();
      expect(roads.every(Boolean), `${variant}: road in every consecutive frame ${JSON.stringify(roads)}`).toBe(true);
    });
  });
}
