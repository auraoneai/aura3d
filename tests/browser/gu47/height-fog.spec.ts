import { expect, test } from "@playwright/test";
import { WORLD_HARNESS_SCENE, WORLD_REGIONS, openWorldReceipts, type WorldReceiptSession } from "./world-receipts-lib";

/**
 * GU47 E-G receipt `height-fog` (PRD WP-7, A3D_QR_VFX_FOG promotion): height
 * fog washes the far column toward the fog colour while the near ground moves
 * much less (software WebGL2, remote runner only).
 */
const CAPABILITY = "height-fog";
const FAR_DELTA_AT_LEAST = 6;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: WorldReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openWorldReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("height fog grows with distance", async () => {
    const off = await session.render("fog-off");
    const on = await session.render("fog-height");
    const far = await session.compare("fog-off", "fog-height", WORLD_REGIONS.farColumn);
    const near = await session.compare("fog-off", "fog-height", WORLD_REGIONS.nearGround);
    expect(on.errors).toEqual([]);
    expect(far.region!.meanAbsDeltaRgb).toBeGreaterThanOrEqual(FAR_DELTA_AT_LEAST);
    expect(far.region!.meanAbsDeltaRgb).toBeGreaterThan(near.region!.meanAbsDeltaRgb);
    session.write(CAPABILITY, `${WORLD_HARNESS_SCENE}; atmosphere.setFog height (density 0.05, heightDensity 0.4, falloff 0.3) vs none, flags vfx.fog`,
      [session.save(CAPABILITY, off), session.save(CAPABILITY, on)],
      ["tests/unit/gu47/eg/flag-promotion-noop.test.ts"],
      { farMeanAbsDeltaRgb: far.region!.meanAbsDeltaRgb, nearMeanAbsDeltaRgb: near.region!.meanAbsDeltaRgb, farDeltaAtLeast: FAR_DELTA_AT_LEAST });
  });
});
