import { expect, test } from "@playwright/test";
import { WORLD_HARNESS_SCENE, WORLD_REGIONS, openWorldReceipts, type WorldReceiptSession } from "./world-receipts-lib";

/**
 * GU47 E-G receipt `water` (PRD WP-7, A3D_QR_WORLD_WATER alone): a
 * `world.water` lake draws with only the water sub-flag on (the WORLD lane
 * stays off, so the water-only contributor emits its passes); software
 * WebGL2, remote runner only.
 */
const CAPABILITY = "water";
const LAKE_DELTA_AT_LEAST = 10;

test.describe(`${CAPABILITY} receipt`, () => {
  test.setTimeout(240_000);
  let session: WorldReceiptSession;
  test.beforeAll(async ({ browser }) => { session = await openWorldReceipts(browser); });
  test.afterAll(async () => { await session?.close(); });

  test("a world.water lake draws without the WORLD lane", async () => {
    const off = await session.render("water-off");
    const on = await session.render("water-lake");
    const lake = await session.compare("water-off", "water-lake", WORLD_REGIONS.lake);
    // Printed before the checks so a failing run still says what it measured.
    console.log(`@@WATER ${JSON.stringify({ lake: lake.region, whole: lake.meanAbsDeltaRgb, drawCallsOff: off.drawCalls, drawCallsOn: on.drawCalls, errors: on.errors, consoleProblems: session.consoleProblems, warnings: session.consoleWarnings.filter((w) => /water|prd10|FRAME_|program/i.test(w)).slice(0, 12) })}`);
    expect(on.errors).toEqual([]);
    expect(lake.region!.meanAbsDeltaRgb).toBeGreaterThanOrEqual(LAKE_DELTA_AT_LEAST);
    expect(on.drawCalls).toBeGreaterThan(off.drawCalls);
    session.write(CAPABILITY, `${WORLD_HARNESS_SCENE}; world.water lake (circle r 7 m at z -8, calm) vs none, flags world.water only`,
      [session.save(CAPABILITY, off), session.save(CAPABILITY, on)],
      ["tests/unit/gu47/eg/flag-promotion-noop.test.ts", "tests/unit/contracts/impl/prd10-water.test.ts"],
      { lakeMeanAbsDeltaRgb: lake.region!.meanAbsDeltaRgb, lakeDeltaAtLeast: LAKE_DELTA_AT_LEAST, drawCallsOff: off.drawCalls, drawCallsOn: on.drawCalls });
  });
});
