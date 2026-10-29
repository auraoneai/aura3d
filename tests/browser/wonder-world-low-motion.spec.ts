/**
 * Wonder World J13, part 1 of 2 (PRD 04; PRD 06 QA-A05, QA-A06, QA-E12, gate G5; PRD 01 calm-visuals rules): reduced
 * motion is on when the URL asks for it, idle moments are still, and nothing flashes.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh low-motion   (about 26 min)
 *
 * ?reducedMotion=1: state().settings.reducedMotion is true; a run of canvas frames across the opening beats (greet,
 * hook and the cut to the model framing) has no frame-to-frame mean-luma jump above MAX_FRAME_JUMP and no
 * up-and-back-down (or down-and-back-up) spike; two canvas frames 200 ms apart in the calm "invite" wait differ by a
 * small luma change only. The parent-setting path is wonder-world-low-motion-2.spec.ts; the shared checks are in
 * wonder-world-low-motion-lib.ts.
 * Not covered here: SFX loudness, the third part of PRD 04 J13 (no QA hook reports levels). The mixer caps them; the
 * guard is unit-tested in apps/veer-wonder-world/tests/unit/runtime/audio-mixer.test.ts ("keeps SFX below voice and
 * the bed at its caps", "turns loud SFX down, never boosts quiet ones").
 * Records: WWJSON low-motion-flag; WWSHOT low-motion-idle.
 */
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  E17,
  attachPageLog,
  captureView,
  emitJson,
  emitShot,
  lumaStats,
  openWonderWorld,
  qaState,
  readBootError,
  runContext,
  waitForStoryOnStage
} from "./wonder-world-lib";
import {
  FLASH_FRAMES,
  FLASH_STEP_MS,
  IDLE_GAP_MS,
  IDLE_MAX_CHANGED_RATIO,
  IDLE_MAX_MEAN_ABS_DIFF,
  LOW_MOTION_TIMEOUT_MS,
  MAX_FRAME_JUMP,
  SPIKE_DELTA,
  VIEWPORT,
  expectCalm,
  expectClean,
  expectNoFlashes,
  flashRun,
  idlePairAtInvite
} from "./wonder-world-low-motion-lib";

test.describe("Wonder World J13 low motion (URL flag)", () => {
  test.setTimeout(LOW_MOTION_TIMEOUT_MS);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("?reducedMotion=1: reduced motion on, no flashing, calm idle frames", async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    const log = attachPageLog(page);
    await openWonderWorld(page, server, log, { autostart: 1, story: E17.id, manual: 1, mode: "play-together", reducedMotion: 1 });
    await waitForStoryOnStage(page, log, E17.id);
    const start = await qaState(page);
    expect(start.settings.reducedMotion, "?reducedMotion=1 turns reduced motion on").toBe(true);

    const flashes = await flashRun(page, FLASH_FRAMES, FLASH_STEP_MS);
    const idle = await idlePairAtInvite(page, "flag");
    emitShot("low-motion-idle", await captureView(page), "jpg");
    const end = await qaState(page);
    emitJson("low-motion-flag", {
      ...(await runContext(page, "low-motion-flag")),
      settings: end.settings,
      flashes,
      idle: { beatId: idle.beatId, phase: idle.phase, delta: idle.delta, firstFrame: lumaStats(idle.first) },
      thresholds: { MAX_FRAME_JUMP, SPIKE_DELTA, IDLE_GAP_MS, IDLE_MAX_MEAN_ABS_DIFF, IDLE_MAX_CHANGED_RATIO },
      consoleErrors: log.consoleErrors,
      pageErrors: log.pageErrors
    });
    expectNoFlashes(flashes, "reduced motion");
    expectCalm(idle, "reduced motion");
    expect(end.settings.reducedMotion, "reduced motion stays on").toBe(true);
    expect(end.errors, "state().errors").toEqual([]);
    expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
    expectClean(log);
  });
});
