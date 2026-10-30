import { expect, test } from "@playwright/test";
import { WORLD_HARNESS_SCENE, WORLD_REGIONS, openWorldReceipts, type WorldReceiptSession } from "./world-receipts-lib";

/**
 * GU47 E-G receipt `sky` (PRD WP-7, typed stars/clouds): a Preetham day sky
 * with typed clouds and a gradient night sky with typed stars replace the
 * flat background; stars show as bright points on the gradient night
 * (software WebGL2, remote runner only).
 */
const CAPABILITY = "sky";
const SKY_DELTA_AT_LEAST = 8;
const STARS_AT_LEAST = 12;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: WorldReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openWorldReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("sky.preetham clouds and sky.gradient stars draw over the flat background", async () => {
    const none = await session.render("sky-none");
    const day = await session.render("sky-day-clouds");
    const night = await session.render("sky-night-stars");
    const dayDelta = await session.compare("sky-none", "sky-day-clouds", WORLD_REGIONS.sky);
    const nightStats = await session.stats("sky-night-stars", WORLD_REGIONS.sky);
    const noneStats = await session.stats("sky-none", WORLD_REGIONS.sky);
    expect(day.errors).toEqual([]);
    expect(night.errors).toEqual([]);
    expect(dayDelta.region!.meanAbsDeltaRgb).toBeGreaterThanOrEqual(SKY_DELTA_AT_LEAST);
    expect(nightStats.brightPixels).toBeGreaterThanOrEqual(STARS_AT_LEAST);
    expect(noneStats.brightPixels).toBe(0);
    session.write(CAPABILITY, `${WORLD_HARNESS_SCENE}; flat background vs sky.preetham (sun 35 deg, clouds coverage 0.45) vs sky.gradient night (stars count 1500, clouds 0.25), flags vfx.sky`,
      [session.save(CAPABILITY, none), session.save(CAPABILITY, day), session.save(CAPABILITY, night)],
      ["tests/unit/gu47/eg/sky-stars-clouds.test.ts", "tests/unit/gu47/eg/flag-promotion-noop.test.ts"],
      { skyMeanAbsDeltaRgb: dayDelta.region!.meanAbsDeltaRgb, skyDeltaAtLeast: SKY_DELTA_AT_LEAST, nightBrightPixels: nightStats.brightPixels, starsAtLeast: STARS_AT_LEAST });
  });
});
