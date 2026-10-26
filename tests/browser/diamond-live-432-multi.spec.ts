import { test } from "@playwright/test";
import { runLive } from "./diamond-live-lib";

/** Several plate appearances on the live site (see diamond-live-lib.ts): batter runs, is hidden, a new batter steps in. */
test.setTimeout(3_300_000);
test.use({ viewport: { width: 960, height: 600 }, deviceScaleFactor: Number(process.env.DIAMOND_LIVE_DPR ?? 1) });
test("live diamond multi part", async ({ page }) => {
  await runLive(page, "multi", Number(process.env.DIAMOND_LIVE_DPR ?? 1));
});
