/**
 * Wonder World J13, part 2 of 2 (PRD 04; PRD 06 QA-A05, QA-A06, QA-E12, gate G5; PRD 01 calm-visuals rules): the
 * parent-setting path. Without the URL flag reducedMotion starts false; the flash check of part 1 runs in normal
 * motion; setReducedMotion(true) turns reduced motion on mid-story (and the idle pair in the invite wait is calm), and
 * setReducedMotion(false) turns it off. The URL-flag path is wonder-world-low-motion.spec.ts; the shared checks are in
 * wonder-world-low-motion-lib.ts.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh low-motion-2   (about 27 min)
 * Records: WWJSON low-motion-setting.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { E17, attachPageLog, emitJson, openWonderWorld, qaSetReducedMotion, qaState, readBootError, runContext, waitForStoryOnStage } from "./wonder-world-lib";
import { FLASH_FRAMES, FLASH_STEP_MS, LOW_MOTION_TIMEOUT_MS, VIEWPORT, expectCalm, expectClean, expectNoFlashes, flashRun, idlePairAtInvite } from "./wonder-world-low-motion-lib";

test.describe("Wonder World J13 low motion (parent setting)", () => {
  test.setTimeout(LOW_MOTION_TIMEOUT_MS);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("parent setting: setReducedMotion turns reduced motion on and off mid-story; no flashing in normal motion", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    const log = attachPageLog(page);
    await openWonderWorld(page, server, log, { autostart: 1, story: E17.id, manual: 1, mode: "play-together" });
    await waitForStoryOnStage(page, log, E17.id);
    const start = await qaState(page);
    expect(start.settings.reducedMotion, "reduced motion is off by default (no URL flag, no saved setting)").toBe(false);

    const flashes = await flashRun(page, FLASH_FRAMES, FLASH_STEP_MS);
    await qaSetReducedMotion(page, true);
    const on = await qaState(page);
    expect(on.settings.reducedMotion, "setReducedMotion(true)").toBe(true);
    const idle = await idlePairAtInvite(page, "setting");
    await qaSetReducedMotion(page, false);
    const off = await qaState(page);
    emitJson("low-motion-setting", {
      ...(await runContext(page, "low-motion-setting")),
      flashesNormalMotion: flashes,
      idleReducedMotion: { beatId: idle.beatId, phase: idle.phase, delta: idle.delta },
      settings: { start: start.settings.reducedMotion, on: on.settings.reducedMotion, off: off.settings.reducedMotion },
      consoleErrors: log.consoleErrors,
      pageErrors: log.pageErrors
    });
    expectNoFlashes(flashes, "normal motion");
    expectCalm(idle, "reduced motion by setting");
    expect(off.settings.reducedMotion, "setReducedMotion(false)").toBe(false);
    expect(off.errors, "state().errors").toEqual([]);
    expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
    expectClean(log);
  });
});
