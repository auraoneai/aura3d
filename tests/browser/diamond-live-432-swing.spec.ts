import { test } from "@playwright/test";
import { runLive } from "./diamond-live-lib";

/** The owner's path against the live site (see diamond-live-lib.ts): desktop 1440x900, default game camera, Quick Play. */
test.setTimeout(3_300_000);
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DIAMOND_LIVE_DPR ?? 1) });
test("live diamond swing part", async ({ page }) => {
  await runLive(page, "swing", Number(process.env.DIAMOND_LIVE_DPR ?? 1));
});
