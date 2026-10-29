/**
 * Wonder World J13 (PRD 04; PRD 06 QA-A05, QA-A06, QA-E12, gate G5; PRD 01 calm-visuals rules): reduced motion is on
 * when asked for, idle moments are still, and nothing flashes.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh low-motion
 *
 * 1. ?reducedMotion=1: state().settings.reducedMotion is true; a run of canvas frames across the opening beats (greet,
 *    hook and the cut to the model framing) has no frame-to-frame mean-luma jump above MAX_FRAME_JUMP and no
 *    up-and-back-down (or down-and-back-up) spike; two canvas frames 200 ms apart in the calm "invite" wait differ
 *    by a small luma change only.
 * 2. Parent setting path: without the URL flag reducedMotion starts false; the same flash check runs in normal motion;
 *    setReducedMotion(true) turns it on mid-story (and the idle pair is calm), setReducedMotion(false) turns it off.
 * Frames are canvas-only page screenshots (overlays hidden, black backdrop) so caption boxes do not count as flashes;
 * the story clock advances only through the QA hooks (?manual=1), so "200 ms apart" is 200 ms of story time.
 * Not covered here: SFX loudness, the third part of PRD 04 J13 (no QA hook reports levels). The mixer caps them; the
 * guard is unit-tested in apps/veer-wonder-world/tests/unit/runtime/audio-mixer.test.ts ("keeps SFX below voice and
 * the bed at its caps", "turns loud SFX down, never boosts quiet ones").
 * Records: WWJSON low-motion-flag, low-motion-setting; WWSHOT low-motion-idle.
 */
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  E17,
  TEST_TIMEOUT_MS,
  advanceUntil,
  attachPageLog,
  captureCanvas,
  captureView,
  decodePng,
  emitJson,
  emitShot,
  frameDelta,
  lumaStats,
  openWonderWorld,
  qaAdvance,
  qaSetReducedMotion,
  qaState,
  readBootError,
  runContext,
  saveReportFile,
  setCaptureMode,
  waitForStoryOnStage,
  type DecodedImage,
  type FrameDelta,
  type PageLog
} from "./wonder-world-lib";

const VIEWPORT = { width: 800, height: 600 } as const;
/** Story time between flash-run frames, and how many frames (about the first 30 s: greet, hook, model). */
const FLASH_STEP_MS = 500;
const FLASH_FRAMES = 60;
/** Mean luma (0-255) may not jump more than this between two frames 500 ms apart (a white or black frame would). */
const MAX_FRAME_JUMP = 40;
/** A flash: a change of more than this, reversed by the next frame. */
const SPIKE_DELTA = 15;
/** Two frames 200 ms apart in a reduced-motion idle wait. */
const IDLE_GAP_MS = 200;
const IDLE_MAX_MEAN_ABS_DIFF = 2.5;
const IDLE_MAX_CHANGED_RATIO = 0.04;
/** Let the wait settle past the target ring's soft opening before the idle pair. */
const INTO_WAIT_MS = 800;

interface FlashReport {
  readonly frames: number;
  readonly meanLuma: readonly number[];
  readonly maxJump: number;
  readonly spikes: readonly { readonly frame: number; readonly before: number; readonly at: number; readonly after: number }[];
  readonly darkestMean: number;
}

/** Canvas-only frames across `frames` steps of `stepMs` story time; returns the mean-luma series and flash findings. */
async function flashRun(page: Page, frames: number, stepMs: number): Promise<FlashReport> {
  const series: number[] = [];
  await setCaptureMode(page, true);
  try {
    for (let frame = 0; frame < frames; frame += 1) {
      series.push(lumaStats(decodePng(await captureCanvas(page, { canvasOnly: false }))).meanLuma);
      await qaAdvance(page, stepMs);
    }
  } finally {
    await setCaptureMode(page, false);
  }
  let maxJump = 0;
  const spikes: { frame: number; before: number; at: number; after: number }[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const before = series[index - 1] ?? 0;
    const at = series[index] ?? 0;
    maxJump = Math.max(maxJump, Math.abs(at - before));
    const after = series[index + 1];
    if (after === undefined) continue;
    const rise = at - before;
    const fall = at - after;
    if (Math.abs(rise) > SPIKE_DELTA && Math.abs(fall) > SPIKE_DELTA && Math.sign(rise) === Math.sign(fall)) spikes.push({ frame: index, before, at, after });
  }
  return { frames: series.length, meanLuma: series.map((value) => Math.round(value * 10) / 10), maxJump: Math.round(maxJump * 1000) / 1000, spikes, darkestMean: Math.min(...series) };
}

function expectNoFlashes(report: FlashReport, label: string): void {
  expect(report.frames, `${label}: frames sampled`).toBe(FLASH_FRAMES);
  expect(report.maxJump, `${label}: largest frame-to-frame mean-luma jump (${report.meanLuma.join(" ")})`).toBeLessThanOrEqual(MAX_FRAME_JUMP);
  expect(report.spikes, `${label}: no flash (a luma change reversed by the next frame)`).toEqual([]);
  expect(report.darkestMean, `${label}: no black frame in the run`).toBeGreaterThan(15);
}

interface IdlePair {
  readonly beatId: string | null;
  readonly phase: string | null;
  readonly delta: FrameDelta;
  readonly first: DecodedImage;
}

/** Walks to the E17 invite wait, settles into it, and measures two canvas frames IDLE_GAP_MS apart. */
async function idlePairAtInvite(page: Page, label: string): Promise<IdlePair> {
  const walk = await advanceUntil(page, { phase: "waiting", beatId: E17.inviteBeat }, 500, 240_000);
  expect(walk.reached, `${label}: the director reaches the invite wait (${JSON.stringify(walk.state.director)})`).toBe(true);
  await qaAdvance(page, INTO_WAIT_MS);
  const a = await captureCanvas(page, { canvasOnly: true });
  await qaAdvance(page, IDLE_GAP_MS);
  const b = await captureCanvas(page, { canvasOnly: true });
  const state = await qaState(page);
  expect(state.director?.phase, `${label}: still in the calm wait for the second frame`).toBe("waiting");
  saveReportFile(`low-motion-${label}-idle-a.png`, a);
  saveReportFile(`low-motion-${label}-idle-b.png`, b);
  const first = decodePng(a);
  return { beatId: state.director?.beatId ?? null, phase: state.director?.phase ?? null, delta: frameDelta(first, decodePng(b)), first };
}

function expectCalm(pair: IdlePair, label: string): void {
  expect(pair.delta.meanAbsLumaDiff, `${label}: mean |luma change| over ${IDLE_GAP_MS} ms of an idle wait ${JSON.stringify(pair.delta)}`).toBeLessThanOrEqual(IDLE_MAX_MEAN_ABS_DIFF);
  expect(pair.delta.changedRatio, `${label}: share of pixels that moved over ${IDLE_GAP_MS} ms ${JSON.stringify(pair.delta)}`).toBeLessThanOrEqual(IDLE_MAX_CHANGED_RATIO);
}

function expectClean(log: PageLog): void {
  expect(log.pageErrors, "page errors").toEqual([]);
  expect(log.consoleErrors, "console errors").toEqual([]);
}

test.describe("Wonder World J13 low motion", () => {
  test.setTimeout(TEST_TIMEOUT_MS);
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
