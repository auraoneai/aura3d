/**
 * 02-S8 — environment background pixels on prd02-13 (IBL only, sky HDRI).
 *
 * With `lighting`, the Aura render shows the HDRI sky (PRD-02 §6.7
 * Background.ts) instead of the legacy solid fallback colour, so the sky-band
 * luma standard deviation is at least 0.7× the three.js reference. The
 * `no-background` control (`background: false`: solid fallback colour) must
 * fail the same criterion, proving the measurement discriminates.
 *
 * Not covered here (still open on 02-S8): `background('#123')` with
 * `environments.preset('studio')` keeping the colour — the shared benchmark
 * translator only emits HDRI environments.
 */
import { expect, test } from "@playwright/test";
import { skyMask, maskPixelCount } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import { stdLuma } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";

const SCENE = "prd02-13-ibl-only";
const RATIO_FLOOR = 0.7;

test.describe("02-S8 environment background (prd02-13)", () => {
  let server: LaneServer;
  let threeSkyStd = Number.NaN;

  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(300_000);
    if (Number.isFinite(threeSkyStd)) return;
    const { pixels } = await captureLaneScene(page, server, { scene: SCENE, engine: "three", flags: "none" });
    const mask = skyMask(getPrd02Spec(SCENE), pixels);
    expect(maskPixelCount(mask), "prd02-13 camera must see a sky band").toBeGreaterThan(1000);
    threeSkyStd = stdLuma(pixels, mask);
    expect(threeSkyStd, "three.js sky band must carry HDRI detail").toBeGreaterThan(1);
  });

  test("lighting on: sky-band luma std >= 0.7x three", async ({ page }) => {
    const { pixels } = await captureLaneScene(page, server, { scene: SCENE, flags: "lighting" });
    const auraStd = stdLuma(pixels, skyMask(getPrd02Spec(SCENE), pixels));
    expect(auraStd / threeSkyStd, `aura ${auraStd.toFixed(3)} vs three ${threeSkyStd.toFixed(3)}`).toBeGreaterThanOrEqual(RATIO_FLOOR);
  });

  test("no-background control (background:false) fails the criterion", async ({ page }) => {
    const { pixels } = await captureLaneScene(page, server, { scene: SCENE, flags: "lighting", control: "no-background" });
    const auraStd = stdLuma(pixels, skyMask(getPrd02Spec(SCENE), pixels));
    expect(auraStd / threeSkyStd, `control aura ${auraStd.toFixed(3)} vs three ${threeSkyStd.toFixed(3)}`).toBeLessThan(RATIO_FLOOR);
  });
});
