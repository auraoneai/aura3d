import { expect, test } from "@playwright/test";
import { HARNESS_SCENE, REGIONS, openPostReceipts, type PostReceiptSession } from "./post-receipts-lib";

/**
 * GU47 E-C receipt effects-selective-bloom (PRD WP-3 item 7): with bloom on,
 * the emissive lamp (material bloom 1) blooms while the bright white wall
 * (material bloom 0) does not change (p95 within 3) against the same scene
 * without bloom. Needs the E-D forward alpha write and the LegacyPost
 * prefilter read (lane ec handoffs) before it can pass (software WebGL2,
 * remote runner only).
 */
const CAPABILITY = "effects-selective-bloom";
const LAMP_LUMA_GAIN_AT_LEAST = 2;
const WALL_P95_AT_MOST = 3;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: PostReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openPostReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("the lamp at weight 1 blooms, the wall at weight 0 does not", async () => {
    const off = await session.render("bloom-off");
    const on = await session.render("bloom-selective");
    const lamp = await session.compare("bloom-off", "bloom-selective", REGIONS.lamp);
    const wall = await session.compare("bloom-off", "bloom-selective", REGIONS.wall);
    // Logged before the checks so a failing run still says what it measured (GU47 phase 2).
    console.log(`[effects-selective-bloom] measured ${JSON.stringify({ lamp: lamp.region, wall: wall.region, skipped: on.skipped })}`);
    expect(on.errors).toEqual([]);
    expect(lamp.region!.meanLumaDelta).toBeGreaterThanOrEqual(LAMP_LUMA_GAIN_AT_LEAST);
    expect(wall.region!.p95AbsDelta).toBeLessThanOrEqual(WALL_P95_AT_MOST);
    session.write(CAPABILITY, `${HARNESS_SCENE}; wall material bloom 0, lamp bloom 1; bloom absent vs intensity 0.8 threshold 1`, [session.save(CAPABILITY, off), session.save(CAPABILITY, on)],
      ["tests/unit/gu47/ec/selective-bloom.test.ts"], { lampMeanLumaDelta: lamp.region!.meanLumaDelta, wallP95AbsDelta: wall.region!.p95AbsDelta, wallP95AtMost: WALL_P95_AT_MOST });
  });
});
