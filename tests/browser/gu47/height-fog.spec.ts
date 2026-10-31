import { expect, test } from "@playwright/test";
import { WORLD_HARNESS_SCENE, WORLD_REGIONS, openWorldReceipts, type WorldReceiptSession } from "./world-receipts-lib";

/**
 * GU47 E-G receipt `height-fog` (PRD WP-7, A3D_QR_VFX_FOG promotion): height
 * fog washes the far columns further toward the fog colour than the near
 * ground (software WebGL2, remote runner only).
 *
 * Phase 2: "grows with distance" is measured as fog amount (0..1 toward the
 * fog colour, against a `fog-solid` reference frame), not as a raw RGB delta.
 * The raw delta also scales with each surface's contrast to the fog colour:
 * the pale columns (#c9c2b4) sit close to the fog colour (#a9b8c8) and the
 * dark ground (#6f7a5a) far from it, so a fully fogged column moved 12.7
 * while a half-fogged near ground moved 93.4. The raw deltas stay recorded.
 */
const CAPABILITY = "height-fog";
const FAR_DELTA_AT_LEAST = 6;
/** The far columns must be at least this much more fogged than the near ground (CPU mirror: about 0.99 vs 0.43..0.61). */
const AMOUNT_MARGIN = 0.15;

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
    const solid = await session.render("fog-solid");
    const farAmount = await session.fogAmount("fog-off", "fog-height", "fog-solid", WORLD_REGIONS.farColumn);
    const nearAmount = await session.fogAmount("fog-off", "fog-height", "fog-solid", WORLD_REGIONS.nearGround);
    expect(on.errors).toEqual([]);
    expect(solid.errors).toEqual([]);
    expect(far.region!.meanAbsDeltaRgb).toBeGreaterThanOrEqual(FAR_DELTA_AT_LEAST);
    expect(farAmount.pixels).toBeGreaterThan(50);
    expect(nearAmount.pixels).toBeGreaterThan(50);
    expect(farAmount.meanAmount).toBeGreaterThan(nearAmount.meanAmount + AMOUNT_MARGIN);
    session.write(CAPABILITY, `${WORLD_HARNESS_SCENE}; atmosphere.setFog height (density 0.05, heightDensity 0.4, falloff 0.3) vs none, flags vfx.fog; fog amount against an exp density-50 reference frame`,
      [session.save(CAPABILITY, off), session.save(CAPABILITY, on), session.save(CAPABILITY, solid)],
      ["tests/unit/gu47/eg/flag-promotion-noop.test.ts", "tests/unit/gu47/eg/height-fog-distance.test.ts"],
      {
        farFogAmount: farAmount.meanAmount, nearFogAmount: nearAmount.meanAmount, amountMargin: AMOUNT_MARGIN,
        farAmountPixels: farAmount.pixels, nearAmountPixels: nearAmount.pixels,
        farMeanAbsDeltaRgb: far.region!.meanAbsDeltaRgb, nearMeanAbsDeltaRgb: near.region!.meanAbsDeltaRgb, farDeltaAtLeast: FAR_DELTA_AT_LEAST
      });
  });
});
