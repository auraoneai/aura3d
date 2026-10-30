import { expect, test } from "@playwright/test";
import { HARNESS_SCENE, openPostReceipts, type PostReceiptSession } from "./post-receipts-lib";

/**
 * GU47 E-C receipt effects-white-balance (PRD WP-3 item 1): the S10 HDR grade
 * writer. colorGrade temperature +0.2 vs 0 on the same scene must move the
 * frame's mean R/B ratio by >= 0.08 (software WebGL2, remote runner only).
 */
const CAPABILITY = "effects-white-balance";
const RB_SHIFT_AT_LEAST = 0.08;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: PostReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openPostReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("temperature +0.2 warms the frame (mean R/B +0.08) through the S10 grade", async () => {
    const neutral = await session.render("wb-neutral");
    const warm = await session.render("wb-warm");
    const ratio = (rgb: readonly number[]) => rgb[0]! / Math.max(1, rgb[2]!);
    const shift = ratio(warm.meanRgb) - ratio(neutral.meanRgb);
    expect(neutral.errors).toEqual([]);
    expect(warm.errors).toEqual([]);
    expect(warm.stagesRan.some((stage) => stage.startsWith("S10:hdr-grade"))).toBe(true);
    expect(shift).toBeGreaterThanOrEqual(RB_SHIFT_AT_LEAST);
    expect(session.consoleProblems).toEqual([]);
    session.write(CAPABILITY, `${HARNESS_SCENE}; colorGrade temperature 0 vs +0.2`, [session.save(CAPABILITY, neutral), session.save(CAPABILITY, warm)],
      ["tests/unit/gu47/ec/hdr-grade-and-stage-trace.test.ts"], { meanRbShift: shift, rbShiftAtLeast: RB_SHIFT_AT_LEAST });
  });
});
