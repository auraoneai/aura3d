import { expect, test } from "@playwright/test";
import { HARNESS_SCENE, openPostReceipts, type PostReceiptSession } from "./post-receipts-lib";

/**
 * GU47 E-C receipt effects-lut (PRD WP-3 item 2): a non-identity .cube
 * (tests/browser/gu47/luts/teal-orange-33.cube, a copy of the tests/qr/prd03 fixture) bound in the S10b
 * display grade must change the frame's mean |dRGB| by >= 6 against the same
 * colorGrade without a lut (software WebGL2, remote runner only).
 */
const CAPABILITY = "effects-lut";
const MEAN_ABS_DRGB_AT_LEAST = 6;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: PostReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openPostReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("the teal-orange LUT moves mean |dRGB| by >= 6", async () => {
    const off = await session.render("lut-off");
    const on = await session.render("lut-teal-orange");
    const delta = await session.compare("lut-off", "lut-teal-orange");
    expect(off.errors).toEqual([]);
    expect(on.errors).toEqual([]);
    // Loaded and bound: no pending/unavailable LUT reason in the trace.
    expect(on.skipped.filter((reason) => /LUT_(INVALID|PENDING|UNAVAILABLE)/.test(reason))).toEqual([]);
    expect(delta.meanAbsDeltaRgb).toBeGreaterThanOrEqual(MEAN_ABS_DRGB_AT_LEAST);
    session.write(CAPABILITY, `${HARNESS_SCENE}; colorGrade without vs with lut teal-orange-33.cube`, [session.save(CAPABILITY, off), session.save(CAPABILITY, on)],
      ["tests/unit/gu47/ec/lut.test.ts"], { meanAbsDeltaRgb: delta.meanAbsDeltaRgb, changedFraction: delta.changedFraction, meanAbsDeltaRgbAtLeast: MEAN_ABS_DRGB_AT_LEAST });
  });
});
