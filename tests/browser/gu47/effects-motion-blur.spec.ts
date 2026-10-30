import { expect, test } from "@playwright/test";
import { HARNESS_SCENE, openPostReceipts, type PostReceiptSession } from "./post-receipts-lib";

/**
 * GU47 E-C receipt effects-motion-blur (PRD WP-3 item 4): the crate moves
 * 0.25 m per step; with motionBlur (shutter 0.75) S7 runs, is traced, and
 * smears the crate's edges against the identical unblurred run (software
 * WebGL2, remote runner only).
 */
const CAPABILITY = "effects-motion-blur";
const CHANGED_FRACTION_AT_LEAST = 0.002;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: PostReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openPostReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("S7 blurs the moving crate", async () => {
    const off = await session.render("mb-off");
    const on = await session.render("mb-on");
    const delta = await session.compare("mb-off", "mb-on");
    expect(on.stagesRan.some((stage) => stage.startsWith("S7:motion-blur"))).toBe(true);
    expect(on.errors).toEqual([]);
    expect(delta.changedFraction).toBeGreaterThanOrEqual(CHANGED_FRACTION_AT_LEAST);
    session.write(CAPABILITY, `${HARNESS_SCENE}; crate moving 0.25 m/step, motionBlur absent vs shutter 0.75`, [session.save(CAPABILITY, off), session.save(CAPABILITY, on)],
      ["tests/unit/gu47/ec/hdr-grade-and-stage-trace.test.ts"], { changedFraction: delta.changedFraction, changedFractionAtLeast: CHANGED_FRACTION_AT_LEAST });
  });
});
