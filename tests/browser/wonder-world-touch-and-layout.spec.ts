/**
 * Wonder World J10 (PRD 04; PRD 06 QA-A07, QA-A08, QA-E05; PRD 03 section 6): in portrait and landscape tablet and a
 * portrait phone, the golden episode's tap waits accept a real tap on the ball and nothing else.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh touch-and-layout
 *
 * Per viewport (a touch-capable context, ?autostart=1&story=sheru-big-adventure&manual=1&mode=play-together):
 * - outside a wait, tap("ball") is refused and a real tap does nothing;
 * - at the "invite" wait: targetRects() names the ball with a large hit area, the topmost element at its centre is the
 *   canvas, the grown-up corner controls are at least 44 x 44 CSS px, inside the viewport and cover under a quarter of
 *   the target, "All done" is visible, the page does not scroll, a stray tap far from the ball changes nothing, and a
 *   page.mouse click at the target centre makes the director leave the wait by tap (taps + 1, targets cleared);
 * - at the "repeat" wait the same checks, with page.touchscreen taps.
 * Records: WWJSON touch-<viewport>, WWSHOT touch-<viewport>-invite.
 */
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  E17,
  MAX_TARGETS,
  MIN_CONTROL_PX,
  MIN_TARGET_PX,
  STORY_LOAD_TIMEOUT_MS,
  TEST_TIMEOUT_MS,
  advanceUntil,
  attachPageLog,
  boxOf,
  canvasBox,
  captureView,
  controlBoxes,
  distanceToBox,
  elementAt,
  emitJson,
  emitShot,
  openWonderWorld,
  overlapArea,
  qaState,
  qaTap,
  qaTargetRects,
  readBootError,
  runContext,
  sleep,
  waitFor,
  waitForStoryOnStage,
  SELECTORS,
  type Box,
  type ControlBox,
  type ElementInfo,
  type PageLog,
  type WonderQaState,
  type WonderTargetRect
} from "./wonder-world-lib";

const VIEWPORTS = [
  { label: "tablet-portrait", width: 768, height: 1024 },
  { label: "tablet-landscape", width: 1024, height: 768 },
  { label: "phone-portrait", width: 390, height: 844 }
] as const;

type Viewport = (typeof VIEWPORTS)[number];
type Input = "mouse" | "touch";

/** A grown-up control may cover at most this share of the child's target hit area. */
const MAX_CONTROL_COVER = 0.25;
/** A stray tap lands at least this far from the target's hit area (the stage's generous pick reaches about 100 px). */
const STRAY_MIN_DISTANCE_PX = 150;
/** One render per step while walking the story clock to a wait. */
const WALK_STEP_MS = 1_000;
const WALK_MAX_MS = 240_000;

interface WaitLayout {
  readonly beat: string;
  readonly state: WonderQaState;
  readonly canvas: Box;
  readonly rects: readonly WonderTargetRect[];
  /** The ball's hit area in viewport px. */
  readonly target: Box | null;
  readonly tap: { readonly x: number; readonly y: number } | null;
  readonly topAtTap: ElementInfo | null;
  readonly controls: readonly ControlBox[];
  readonly controlCover: readonly { readonly control: string; readonly fraction: number }[];
  readonly captions: Box | null;
  readonly captionCoversTap: boolean;
  readonly scrollOverflow: { readonly x: number; readonly y: number };
}

async function layoutAtWait(page: Page, beat: string): Promise<WaitLayout> {
  const state = await qaState(page);
  const rects = await qaTargetRects(page);
  const canvas = await canvasBox(page);
  const rect = rects.find((candidate) => candidate.id === E17.target) ?? null;
  // targetRects() is in viewport CSS px already (the app adds the canvas offset).
  const target = rect ? { x: rect.x, y: rect.y, width: rect.w, height: rect.h } : null;
  const tap = target ? { x: target.x + target.width / 2, y: target.y + target.height / 2 } : null;
  const topAtTap = tap ? await elementAt(page, tap.x, tap.y) : null;
  const controls = (await controlBoxes(page)).filter((control) => control.visible);
  const controlCover = target
    ? controls.map((control) => ({ control: control.control, fraction: Math.round((overlapArea(control, target) / Math.max(1, target.width * target.height)) * 1000) / 1000 }))
    : [];
  const captions = await boxOf(page, SELECTORS.captions);
  const captionCoversTap = Boolean(captions && tap && distanceToBox(tap.x, tap.y, captions) === 0);
  const scrollOverflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight
  }));
  return { beat, state, canvas, rects, target, tap, topAtTap, controls, controlCover, captions, captionCoversTap, scrollOverflow };
}

function layoutRecord(layout: WaitLayout): Record<string, unknown> {
  const { state, ...rest } = layout;
  return { ...rest, director: state.director, targets: state.targets, speaking: state.speaking, settings: state.settings };
}

function expectLayout(layout: WaitLayout, viewport: Viewport): void {
  const where = `${viewport.label} ${layout.beat}`;
  expect(layout.state.director?.phase, `${where}: the director waits`).toBe("waiting");
  expect(layout.state.director?.beatId, `${where}: at the expected beat`).toBe(layout.beat);
  expect(layout.state.targets, `${where}: the ball is the active target`).toContain(E17.target);
  expect(layout.state.targets.length, `${where}: at most ${MAX_TARGETS} targets`).toBeLessThanOrEqual(MAX_TARGETS);
  expect(layout.rects.length, `${where}: targetRects() at most ${MAX_TARGETS}`).toBeLessThanOrEqual(MAX_TARGETS);
  expect(layout.target, `${where}: targetRects() names the ball (${JSON.stringify(layout.rects)})`).not.toBeNull();
  const target = layout.target;
  const tap = layout.tap;
  if (!target || !tap) return;
  expect(target.width, `${where}: target hit area width`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(target.height, `${where}: target hit area height`).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(tap.x > 0 && tap.x < viewport.width && tap.y > 0 && tap.y < viewport.height, `${where}: target centre ${JSON.stringify(tap)} is on screen`).toBe(true);
  expect(layout.topAtTap?.isCanvas, `${where}: nothing covers the target centre (${JSON.stringify(layout.topAtTap)})`).toBe(true);
  expect.soft(layout.captionCoversTap, `${where}: the caption box does not sit on the target centre (${JSON.stringify(layout.captions)})`).toBe(false);

  expect(layout.controls.length, `${where}: the grown-up controls are shown`).toBeGreaterThan(0);
  for (const control of layout.controls) {
    expect(control.width, `${where}: control "${control.control}" width`).toBeGreaterThanOrEqual(MIN_CONTROL_PX);
    expect(control.height, `${where}: control "${control.control}" height`).toBeGreaterThanOrEqual(MIN_CONTROL_PX);
    const inside = control.x >= -0.5 && control.y >= -0.5 && control.x + control.width <= viewport.width + 0.5 && control.y + control.height <= viewport.height + 0.5;
    expect(inside, `${where}: control "${control.control}" ${JSON.stringify(control)} is inside the viewport`).toBe(true);
  }
  for (const cover of layout.controlCover) {
    expect(cover.fraction, `${where}: control "${cover.control}" covers ${cover.fraction} of the target`).toBeLessThan(MAX_CONTROL_COVER);
  }
  const allDone = layout.controls.find((control) => control.control === "all-done");
  expect(allDone, `${where}: "All done" is visible`).toBeDefined();
  expect(allDone?.disabled, `${where}: "All done" is enabled`).toBe(false);
  // The grown-up's parent confirm ("Your child had a turn") is offered while the turn waits.
  const confirm = layout.controls.find((control) => control.control === "confirm");
  expect(confirm, `${where}: the grown-up's "had a turn" control is visible`).toBeDefined();
  expect(confirm?.disabled, `${where}: the grown-up's "had a turn" control is enabled while the turn waits`).toBe(false);
  expect(layout.scrollOverflow.x, `${where}: no horizontal scroll`).toBeLessThanOrEqual(1);
  expect(layout.scrollOverflow.y, `${where}: no vertical scroll`).toBeLessThanOrEqual(1);
}

async function tapAt(page: Page, input: Input, x: number, y: number): Promise<void> {
  if (input === "mouse") await page.mouse.click(x, y);
  else await page.touchscreen.tap(x, y);
}

/** A point on the canvas far from the target and from every control, or null when the viewport has none. */
async function strayPoint(page: Page, viewport: Viewport, target: Box): Promise<{ x: number; y: number } | null> {
  const fractions: readonly (readonly [number, number])[] = [[0.12, 0.62], [0.88, 0.62], [0.5, 0.86], [0.12, 0.4], [0.88, 0.4], [0.5, 0.5], [0.12, 0.85], [0.88, 0.85]];
  for (const [fx, fy] of fractions) {
    const x = Math.round(viewport.width * fx);
    const y = Math.round(viewport.height * fy);
    if (distanceToBox(x, y, target) < STRAY_MIN_DISTANCE_PX) continue;
    if ((await elementAt(page, x, y)).isCanvas) return { x, y };
  }
  return null;
}

async function reachWait(page: Page, beat: string): Promise<WonderQaState> {
  const walk = await advanceUntil(page, { phase: "waiting", beatId: beat }, WALK_STEP_MS, WALK_MAX_MS);
  expect(walk.reached, `the director reaches the "${beat}" wait (spent ${walk.spentMs} ms; ${JSON.stringify(walk.state.director)})`).toBe(true);
  return walk.state;
}

interface TapResult {
  readonly input: Input;
  readonly beat: string;
  readonly stray: { readonly x: number; readonly y: number } | null;
  readonly strayIgnored: boolean | null;
  readonly tap: { readonly x: number; readonly y: number } | null;
  readonly before: WonderQaState["director"];
  readonly after: WonderQaState["director"];
  readonly targetsAfter: readonly string[];
}

/** Stray tap (ignored), then a real tap at the target centre that ends the wait by tap. */
async function tapTheBall(page: Page, log: PageLog, viewport: Viewport, layout: WaitLayout, input: Input): Promise<TapResult> {
  const where = `${viewport.label} ${layout.beat} (${input})`;
  const before = layout.state.director;
  const target = layout.target;
  const tap = layout.tap;
  let stray: { x: number; y: number } | null = null;
  let strayIgnored: boolean | null = null;
  if (target) {
    stray = await strayPoint(page, viewport, target);
    if (stray) {
      await tapAt(page, input, stray.x, stray.y);
      await sleep(400);
      const afterStray = await qaState(page);
      strayIgnored = afterStray.director?.taps === before?.taps && afterStray.director?.phase === "waiting";
      expect(strayIgnored, `${where}: a tap away from the ball changes nothing (${JSON.stringify(afterStray.director)})`).toBe(true);
    }
  }
  if (!tap || !before) throw new Error(`${where}: no target to tap`);
  await tapAt(page, input, tap.x, tap.y);
  const after = await waitFor(page, log, `${where}: the director leaves the wait by tap`, 15_000, async () => {
    const state = await qaState(page);
    const director = state.director;
    return director && director.taps === before.taps + 1 && director.phase !== "waiting" ? state : null;
  });
  expect(after.director?.taps, `${where}: exactly one accepted tap`).toBe(before.taps + 1);
  expect(after.targets, `${where}: targets clear once the wait ends`).toEqual([]);
  const confirmAfter = (await controlBoxes(page)).find((control) => control.control === "confirm");
  expect(confirmAfter?.disabled, `${where}: the grown-up's "had a turn" control is disabled once the wait ends`).toBe(true);
  return { input, beat: layout.beat, stray, strayIgnored, tap, before, after: after.director, targetsAfter: after.targets };
}

test.describe("Wonder World J10 touch and layout", () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  for (const viewport of VIEWPORTS) {
    test(`E17 ball taps by mouse and touch, large clear targets and controls (${viewport.label} ${viewport.width}x${viewport.height})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true });
      try {
        const page = await context.newPage();
        const log = attachPageLog(page);
        await openWonderWorld(page, server, log, { autostart: 1, story: E17.id, manual: 1, mode: "play-together" });
        await waitForStoryOnStage(page, log, E17.id, STORY_LOAD_TIMEOUT_MS * 2);

        // Outside a wait: the hook refuses the tap and a real tap on the scene does nothing.
        const greet = await qaState(page);
        expect(await qaTap(page, E17.target), "tap() is refused while no beat waits").toBe(false);
        await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
        await sleep(400);
        const afterIdleTap = await qaState(page);
        expect(afterIdleTap.director?.taps, "a tap outside a wait is not a turn").toBe(greet.director?.taps);
        expect(afterIdleTap.director?.beatId, "a tap outside a wait does not advance the story").toBe(greet.director?.beatId);

        // The invite wait, by mouse. Each layout is recorded before it is judged, so a failure keeps its numbers.
        await reachWait(page, E17.inviteBeat);
        const invite = await layoutAtWait(page, E17.inviteBeat);
        emitShot(`touch-${viewport.label}-invite`, await captureView(page), "jpg");
        emitJson(`touch-${viewport.label}-invite`, layoutRecord(invite));
        expectLayout(invite, viewport);
        const mouse = await tapTheBall(page, log, viewport, invite, "mouse");

        // The repeat wait, by touch.
        await reachWait(page, E17.repeatBeat);
        const repeat = await layoutAtWait(page, E17.repeatBeat);
        emitJson(`touch-${viewport.label}-repeat`, layoutRecord(repeat));
        expectLayout(repeat, viewport);
        const touch = await tapTheBall(page, log, viewport, repeat, "touch");

        const final = await qaState(page);
        emitJson(`touch-${viewport.label}`, {
          ...(await runContext(page, `touch-${viewport.label}`)),
          taps: [mouse, touch],
          consoleErrors: log.consoleErrors,
          pageErrors: log.pageErrors,
          appErrors: final.errors
        });
        expect(final.micRequested, "no microphone").toBe(false);
        expect(final.errors, "state().errors").toEqual([]);
        expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
        expect(log.pageErrors, "page errors").toEqual([]);
        expect(log.consoleErrors, "console errors").toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
