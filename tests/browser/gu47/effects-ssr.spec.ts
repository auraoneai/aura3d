import { expect, test } from "@playwright/test";
import { HARNESS_SCENE, REGIONS, openPostReceipts, type PostReceiptSession } from "./post-receipts-lib";

/**
 * GU47 E-C receipt effects-ssr (PRD WP-3 item 6): with an authored
 * screenSpaceReflections node the S3 trace runs and the glossy floor under the
 * crate picks up a reflection; without it S3 never runs (software WebGL2,
 * remote runner only).
 */
const CAPABILITY = "effects-ssr";
const FLOOR_DELTA_AT_LEAST = 1;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: PostReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openPostReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("S3 reflects the crate into the glossy floor and is off without the node", async () => {
    const off = await session.render("ssr-off");
    const on = await session.render("ssr-on");
    const delta = await session.compare("ssr-off", "ssr-on", REGIONS.floorUnderCrate);
    expect(off.stagesRan.some((stage) => stage.startsWith("S3"))).toBe(false);
    expect(on.stagesRan.some((stage) => stage.startsWith("S3:ssr-"))).toBe(true);
    expect(on.errors).toEqual([]);
    expect(delta.region!.meanAbsDeltaRgb).toBeGreaterThanOrEqual(FLOOR_DELTA_AT_LEAST);
    session.write(CAPABILITY, `${HARNESS_SCENE}; glossy floor, screenSpaceReflections absent vs intensity 1`, [session.save(CAPABILITY, off), session.save(CAPABILITY, on)],
      ["tests/unit/gu47/ec/ssr.test.ts"], { floorMeanAbsDeltaRgb: delta.region!.meanAbsDeltaRgb, floorDeltaAtLeast: FLOOR_DELTA_AT_LEAST, changedFraction: delta.changedFraction });
  });
});
