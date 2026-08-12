import { expect, test } from "@playwright/test";
import {
  loadAuraClashArena,
  readAuraClashProof,
  setFighterTestState
} from "./helpers/auraClashArenaHarness";

/**
 * The camera has to respond to combat, and that response has to be falsifiable.
 *
 * `cameraFrameBounds` was previously a fixed literal, so a KO, a heavy connect and an idle round were
 * all framed identically and the only impact "feedback" was DOM callout text. It is now a getter the
 * renderer re-reads each frame, driven by `hitStopRemaining` -- state the deterministic simulation
 * owns and this path never writes back to.
 *
 * These assertions are paired deliberately: an idle round must show **zero** responding frames, so a
 * passing punch-in cannot come from an always-on animation. Sampling runs on a `requestAnimationFrame`
 * recorder installed before the input, because the hit-stop window is at most 0.13s and polling the
 * proof after `keyboard.up` misses it entirely.
 */
test.describe("Aura Clash camera combat feedback", () => {
  test("frames tighten on a landed hit and rest otherwise", async ({ page }) => {
    test.setTimeout(90_000);
    await loadAuraClashArena(page, "?auraTestDriver=1");

    const resting = await readAuraClashProof(page);
    expect(resting.camera?.respondingToCombat, "an untouched round must sit at the resting frame volume").toBe(false);
    expect(resting.camera?.punchIn).toBe(0);
    expect(resting.camera?.frameWidthUnits).toBe(resting.camera?.restingFrameWidthUnits);
    expect(resting.camera?.settled).toBe(true);

    await installCameraRecorder(page);

    // Negative control: with no input at all, the camera must never report responding.
    await page.waitForTimeout(700);
    const idle = await readCameraSamples(page);
    expect(idle.length, "recorder should capture frames while idle").toBeGreaterThan(20);
    expect(
      idle.filter((sample) => sample.respondingToCombat).length,
      "an idle round must produce zero camera-response frames, or the punch-in is unconditional"
    ).toBe(0);

    await setFighterTestState(page, { playerX: -0.86, rivalX: 0.44, rivalHealth: 300, playerMeter: 100 });
    for (const code of ["KeyK", "KeyJ", "KeyL"]) {
      await page.keyboard.down(code);
      await page.waitForTimeout(200);
      await page.keyboard.up(code);
      await page.waitForTimeout(420);
    }

    const proof = await readAuraClashProof(page);
    expect(proof.totalHits, "the probe must land at least one hit for the camera claim to mean anything").toBeGreaterThan(0);

    const samples = await readCameraSamples(page);
    const responding = samples.filter((sample) => sample.respondingToCombat);
    expect(responding.length, "a landed hit must tighten the frame volume for at least one frame").toBeGreaterThan(0);

    const peakPunch = Math.max(...samples.map((sample) => sample.punchIn));
    expect(peakPunch, "punch-in should scale toward 1 at the special-move hit-stop peak").toBeGreaterThan(0.3);

    const narrowest = Math.min(...samples.map((sample) => sample.frameWidthUnits));
    expect(narrowest, "the frame volume must actually narrow, not merely report that it did")
      .toBeLessThan(resting.camera!.restingFrameWidthUnits);

    // Every responding frame must be backed by a non-zero hit-stop the simulation set.
    for (const sample of responding) {
      expect(sample.impactStrength, "camera response must be backed by real hit-stop state").toBeGreaterThan(0);
    }

    // The response decays: the camera must return to rest rather than staying punched in.
    await page.waitForTimeout(900);
    const settled = await readAuraClashProof(page);
    expect(settled.camera?.respondingToCombat, "the punch-in must decay back to the resting volume").toBe(false);
  });
});

type CameraSample = {
  impactStrength: number;
  punchIn: number;
  roundOverFraming: boolean;
  frameWidthUnits: number;
  restingFrameWidthUnits: number;
  respondingToCombat: boolean;
  settled: boolean;
};

/** Record camera evidence every animation frame, so the sub-0.13s hit-stop window is not missed. */
async function installCameraRecorder(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    target.__AURA_CLASH_CAMERA_SAMPLES__ = [];
    const tick = (): void => {
      const proof = (target.__AURA_CLASH_ARENA_PROOF__ as { camera?: unknown } | undefined)?.camera;
      if (proof) (target.__AURA_CLASH_CAMERA_SAMPLES__ as unknown[]).push({ ...(proof as object) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readCameraSamples(page: import("@playwright/test").Page): Promise<CameraSample[]> {
  return page.evaluate(() => (window as unknown as Record<string, CameraSample[]>).__AURA_CLASH_CAMERA_SAMPLES__ ?? []);
}
