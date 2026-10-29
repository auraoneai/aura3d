/**
 * Shared checks of the Wonder World J13 low-motion specs (PRD 04; PRD 06 QA-A05, QA-A06, QA-E12, gate G5; PRD 01
 * calm-visuals rules), split over two files: the two tests in one file took 52 of the remote runner's 60 minutes
 * (run wonder-I-20261029T152530Z):
 *   wonder-world-low-motion.spec.ts     ?reducedMotion=1
 *   wonder-world-low-motion-2.spec.ts   the parent setting
 * Frames are canvas-only page screenshots (overlays hidden, black backdrop) so caption boxes do not count as flashes;
 * the story clock advances only through the QA hooks (?manual=1), so "200 ms apart" is 200 ms of story time.
 */
import { expect, type Page } from "@playwright/test";
import {
  E17,
  advanceUntil,
  captureCanvas,
  decodePng,
  frameDelta,
  lumaStats,
  qaAdvance,
  qaState,
  saveReportFile,
  setCaptureMode,
  type DecodedImage,
  type FrameDelta,
  type PageLog
} from "./wonder-world-lib";

/** Small enough that the 60-frame runs fit the timeout on software WebGL2 (each frame is one render and one screenshot). */
export const VIEWPORT = { width: 640, height: 480 } as const;
/** Boot, then 60 rendered and captured frames, then the walk to the invite wait: run wonder-F-20261029T135132Z showed 15 minutes is too short on software WebGL2. */
export const LOW_MOTION_TIMEOUT_MS = 35 * 60_000;
/** Story time between flash-run frames, and how many frames (about the first 30 s: greet, hook, model). */
export const FLASH_STEP_MS = 500;
export const FLASH_FRAMES = 60;
/** Mean luma (0-255) may not jump more than this between two frames 500 ms apart (a white or black frame would). */
export const MAX_FRAME_JUMP = 40;
/** A flash: a change of more than this, reversed by the next frame. */
export const SPIKE_DELTA = 15;
/** Two frames 200 ms apart in a reduced-motion idle wait. */
export const IDLE_GAP_MS = 200;
export const IDLE_MAX_MEAN_ABS_DIFF = 2.5;
export const IDLE_MAX_CHANGED_RATIO = 0.04;
/** Let the wait settle past the target ring's soft opening before the idle pair. */
const INTO_WAIT_MS = 800;

export interface FlashReport {
  readonly frames: number;
  readonly meanLuma: readonly number[];
  readonly maxJump: number;
  readonly spikes: readonly { readonly frame: number; readonly before: number; readonly at: number; readonly after: number }[];
  readonly darkestMean: number;
}

/** Canvas-only frames across `frames` steps of `stepMs` story time; returns the mean-luma series and flash findings. */
export async function flashRun(page: Page, frames: number, stepMs: number): Promise<FlashReport> {
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

export function expectNoFlashes(report: FlashReport, label: string): void {
  expect(report.frames, `${label}: frames sampled`).toBe(FLASH_FRAMES);
  expect(report.maxJump, `${label}: largest frame-to-frame mean-luma jump (${report.meanLuma.join(" ")})`).toBeLessThanOrEqual(MAX_FRAME_JUMP);
  expect(report.spikes, `${label}: no flash (a luma change reversed by the next frame)`).toEqual([]);
  expect(report.darkestMean, `${label}: no black frame in the run`).toBeGreaterThan(15);
}

export interface IdlePair {
  readonly beatId: string | null;
  readonly phase: string | null;
  readonly delta: FrameDelta;
  readonly first: DecodedImage;
}

/** Walks to the E17 invite wait, settles into it, and measures two canvas frames IDLE_GAP_MS apart. */
export async function idlePairAtInvite(page: Page, label: string): Promise<IdlePair> {
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

export function expectCalm(pair: IdlePair, label: string): void {
  expect(pair.delta.meanAbsLumaDiff, `${label}: mean |luma change| over ${IDLE_GAP_MS} ms of an idle wait ${JSON.stringify(pair.delta)}`).toBeLessThanOrEqual(IDLE_MAX_MEAN_ABS_DIFF);
  expect(pair.delta.changedRatio, `${label}: share of pixels that moved over ${IDLE_GAP_MS} ms ${JSON.stringify(pair.delta)}`).toBeLessThanOrEqual(IDLE_MAX_CHANGED_RATIO);
}

export function expectClean(log: PageLog): void {
  expect(log.pageErrors, "page errors").toEqual([]);
  expect(log.consoleErrors, "console errors").toEqual([]);
}
