import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { HOOK, emit, hasRoad, look, open, raf } from "./gridroad-lib";

/**
 * Gridlock Courier road tour (docs/audit/game-leftovers.md, road flip). Remote-only (tools/remote-acr/run.sh).
 * Teleports to five places across the city, drives briefly and settles, then records the frame. The same tour runs with the road in
 * one 1,020 m quad (`roadcells=1`), one quad per 60 m tile (the default) and 64 x 64 cells, so the frames can be compared offline: the
 * lane paint must sit on the street centre line in every variant that is not the single quad. `@@GT <variant> <i> std=<luma spread> road=<bool>`.
 */
const STOPS: readonly (readonly [number, number, number, number])[] = [
  [30, -300, 0, 270],
  [30, 0, 0, 40],
  [-150, 210, Math.PI / 2, 40],
  [330, -90, Math.PI, 40],
  [-210, 390, -Math.PI / 2, 40]
];

export function gridTour(variant: string, query: string, size: readonly [number, number] = [1280, 720]): void {
  test.describe(`gridlock road tour: ${variant}`, () => {
    test.setTimeout(3_300_000);
    let server: ExampleDevServer;
    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    test(`road present at every stop (${query || "default"})`, async ({ browser }) => {
      const page = await open(browser, server, `?manual=1${query ? `&${query}` : ""}`, size[0], size[1]);
      const roads: boolean[] = [];
      for (let i = 0; i < STOPS.length; i++) {
        const [x, z, heading, frames] = STOPS[i]!;
        await page.evaluate(([hk, px, pz, ph, n]) => {
          const api = (window as unknown as Record<string, any>)[hk as string];
          api.reset();
          api.teleport(px, pz, ph);
          api.stepFrames(n, { w: true });
          if (n > 100) api.stepFrames(30, { w: true, d: true, space: true });
        }, [HOOK, x, z, heading, frames] as const);
        await raf(page, 2);
        await page.evaluate((hk) => (window as unknown as Record<string, any>)[hk].settle(), HOOK);
        await raf(page, 1);
        const png = await page.screenshot({ type: "png" });
        const l = await look(page, png);
        roads.push(hasRoad(l));
        process.stdout.write(`@@GT ${variant} ${i} std=${l.std.toFixed(1)} road=${hasRoad(l)}\n`);
        emit(`gt-${variant}-${i}`, await page.screenshot({ type: "jpeg", quality: 88 }));
      }
      process.stdout.write(`@@GTSUM ${variant} roads=${JSON.stringify(roads)}\n`);
      await page.context().close();
      expect(roads.every(Boolean), `${variant}: road at every stop ${JSON.stringify(roads)}`).toBe(true);
    });
  });
}
