/**
 * Wonder World capture suites (remote runner only), shared by the split spec files:
 *   wonder-world-characters.spec.ts ... wonder-world-characters-3.spec.ts   character sheets (PRD 02 section 2
 *                                                                          approval deliverables; gaps 02:28, 02:29,
 *                                                                          02:31/02:128, 02:34)
 *   wonder-world-stills.spec.ts ... wonder-world-stills-4.spec.ts       one still per story for the evidence README
 *
 * Both open the app with `?autostart=1&manual=1&models=1&modelWaitMs=180000` (each story load waits for its models
 * instead of drawing stand-ins) and reach every moment through the simulated story clock (wonder-world-timeline.ts):
 * one advance() per jump, checked against the page's director. Every picture is canvas-only (overlays hidden, black
 * backdrop), measured as a PNG and printed as the same frame re-encoded to JPEG in the page.
 *
 * A character sheet, per character, in the story whose cast it is in (CHARACTER_STORIES):
 *   (e) phone: at 320x568 CSS px, the story's opening wide shot (a character the opening keeps hidden is shown at its
 *       spot); its nodeRect is at least 48 px tall and its middle differs clearly in luma or colour from the band of
 *       ground around it (silhouette check);
 *   then at 800x600, each job inside a calm window of the story (no stage action, line or song lands meanwhile), after
 *   a pin that hides the rest of the cast and the props, stands the character at center facing the viewer, clears its
 *   gesture and sets the close camera (reduced motion on for the pin, so camera and turn settle in one step):
 *   (a) turnaround: front, left (offLeft), back and right (offRight) views in reduced motion (no idle sway), one crop
 *       around its nodeRect each; the view most unlike the front differs from it clearly (Lumi's back matches its
 *       front but for the face, so the side views carry the check) and the face actions add no stage warning;
 *   (b) pose sheet: the six 02 section 2 states as body poses, each captured mid-motion in normal motion: neutral
 *       (idle), delighted (happy), curious (look), surprised (surprise), waiting (wait), good-bye (wave);
 *   (c) talking pulse, in reduced motion: there the idle loop (Lumi's float), breathing target rings and halos all
 *       stand still and the pulse still runs (at half strength), so it is the only thing that can move the crop. Four
 *       crops 100 ms apart with setTalking(id) on, then four with it off: the larger of two 200 ms pair deltas must be
 *       visible while talking and much smaller while silent;
 *   (d) reduced motion: the same "happy" gesture sampled at the same offsets in normal and in reduced motion; the
 *       character's nodeRect travels clearly less (every "happy" is a hop or a float). Crop deltas are recorded too,
 *       but a mean luma change saturates for a large, detailed body such as GoGo's: a half-height hop changed it
 *       almost as much as a full one.
 * Records: WWJSON char-<id> per character and chars-<ids>-summary; WWSHOT char-<id>-phone, char-<id>-turn-<view>,
 * char-<id>-pose-<state>.
 *
 * A still, per story: its first "invite" or "model" beat (600 ms into the beat's wait, or 3 s after the beat starts),
 * 1024x768, printed as WWSHOT still-<code>, with WWJSON still-<code> (beat, director, frame statistics, model status,
 * which story nodes drew as models) and stills-<range>-summary (with the request, console and storage evidence).
 */
import { expect, test, type Page } from "@playwright/test";
import type { Gesture, StageAction } from "../../apps/veer-wonder-world/src/types";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import {
  SOFTWARE_GL_NOTE,
  addedEntries,
  admittedModelKeys,
  attachPageLog,
  authoredStory,
  canvasBox,
  captureCanvas,
  captureRegionPng,
  colourStats,
  cropAround,
  decodePng,
  emitJson,
  emitShot,
  expectPagePrivacy,
  frameDelta,
  liveNodes,
  lumaStats,
  openWonderWorld,
  pngToJpeg,
  qaAdvance,
  qaDiagnostics,
  qaNodeRects,
  qaSetReducedMotion,
  qaSetTalking,
  qaStageApply,
  qaStartStory,
  qaState,
  redact,
  remountIfModelsLate,
  runContext,
  silhouetteContrast,
  sleep,
  storyRange,
  waitForStoryOnStage,
  type Box,
  type CharacterStory,
  type DecodedImage,
  type FrameDelta,
  type PageLog,
  type SilhouetteReport,
  type StoryEntry,
  type WonderNodeRect
} from "./wonder-world-lib";
import { jumpTo, openingWideShot, stillMoment, storyTimeline, type StoryTimeline } from "./wonder-world-timeline";

// ---------------------------------------------------------------- shared settings

/** Each story load waits this long for its models (`?modelWaitMs`): software WebGL2 slows the downloads past 10 s. */
const MODEL_WAIT_MS = 180_000;
/** In-page deadline for one startStory with that model wait and the program warm-up. */
const LOAD_TIMEOUT_MS = 420_000;
/** One test runs a whole file; the runner kills a run at 60 minutes, so a slow file fails before that. */
const SUITE_TIMEOUT_MS = 52 * 60_000;
/** Real time for the canvas to resize before the next drawn frame. */
const RESIZE_SETTLE_MS = 2_000;
const JPEG_QUALITY = 0.85;

const PHONE = { width: 320, height: 568 } as const;
const SHEET = { width: 800, height: 600 } as const;
const STILL = { width: 1024, height: 768 } as const;

function message(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error)).slice(0, 1_500);
}

/** The story nodes that should draw from an admitted GLB: the cast, and props whose model is admitted. */
function modelNodeIds(storyId: string): string[] {
  const story = authoredStory(storyId);
  const admitted = admittedModelKeys();
  return [
    ...story.cast.filter((member) => admitted === null || admitted.has(member.id)).map((member) => member.id),
    ...story.props.filter((prop) => admitted !== null && admitted.has(prop.asset)).map((prop) => prop.id)
  ];
}

/** Loads a story at the current viewport (the first one is already loading from the page URL) and remounts late models. */
async function loadStory(page: Page, log: PageLog, storyId: string, alreadyLoading: boolean, modelIds: readonly string[]): Promise<{ readonly loadMs: number; readonly firstMount: unknown }> {
  const started = Date.now();
  if (!alreadyLoading) await qaStartStory(page, storyId, "watch-sing", LOAD_TIMEOUT_MS);
  await waitForStoryOnStage(page, log, storyId, LOAD_TIMEOUT_MS);
  const firstMount = await remountIfModelsLate(page, log, storyId, "watch-sing", modelIds, LOAD_TIMEOUT_MS);
  return { loadMs: Date.now() - started, firstMount };
}

// ---------------------------------------------------------------- character sheets

/**
 * The turnaround views: the character faces the viewer, or the spot `toward` (offLeft, back, offRight). The stage's
 * `face` action turns toward the viewer or toward a node, so a hidden story node (the anchor) is first set down on
 * that spot and the character faces it.
 */
const VIEWS = [
  { view: "front", toward: "viewer" },
  { view: "left", toward: "offLeft" },
  { view: "back", toward: "back" },
  { view: "right", toward: "offRight" }
] as const;

/** Stage actions that turn `character` toward one turnaround view (an anchor node stands on the spot, hidden). */
function faceView(character: string, anchor: string, view: (typeof VIEWS)[number]): StageAction[] {
  if (view.toward === "viewer") return [{ do: "face", actor: character, toward: "viewer" }];
  return [
    { do: "enter", actor: anchor, at: view.toward, from: view.toward },
    { do: "hide", actor: anchor },
    { do: "face", actor: character, toward: anchor }
  ];
}

/** The six 02 section 2 states as body poses, each captured `atMs` after its gesture starts (mid-motion for every character). */
const POSES: readonly { readonly state: string; readonly gesture: Gesture; readonly atMs: number }[] = [
  { state: "neutral", gesture: "idle", atMs: 400 },
  { state: "delighted", gesture: "happy", atMs: 450 },
  { state: "curious", gesture: "look", atMs: 800 },
  { state: "surprised", gesture: "surprise", atMs: 350 },
  { state: "waiting", gesture: "wait", atMs: 500 },
  { state: "good-bye", gesture: "wave", atMs: 600 }
];

/** Crop around the nodeRect: room above for hops and stretches, a little below the feet. */
const CROP_GROW = { side: 0.3, top: 0.35, bottom: 0.12 } as const;
/** Story time of the pin (one step at reduced motion settles camera, facing and hides). */
const PIN_MS = 100;
const FRAME_MS = 100;
const TURN_JOB_MS = PIN_MS + VIEWS.length * FRAME_MS;
const POSES_JOB_MS = PIN_MS + POSES.reduce((sum, pose) => sum + pose.atMs, 0);
/** The reduced-motion job: "happy" sampled 300-600 ms after it starts, in normal and then in reduced motion. */
const REDUCED_GESTURE: Gesture = "happy";
const REDUCED_FIRST_FRAME_MS = 300;
const REDUCED_JOB_MS = PIN_MS + 2 * (REDUCED_FIRST_FRAME_MS + 3 * FRAME_MS);

// Thresholds (software WebGL2 frames of an 800x600 canvas; the record keeps every number so they can be tuned).
const PHONE_MIN_HEIGHT_PX = 48;
const SILHOUETTE_MIN_LUMA_DIFF = 12;
const SILHOUETTE_MIN_COLOUR_DISTANCE = 30;
const SILHOUETTE_MIN_SEPARATED_SHARE = 0.4;
/** The view most unlike the front differs from it: one of these, over the crop. */
const TURN_MIN_MEAN_ABS = 1;
const TURN_MIN_CHANGED = 0.02;
/** The talking pulse is visible: one of these, over the crop, for the larger 200 ms pair. */
const TALK_MIN_MEAN_ABS = 0.5;
const TALK_MIN_CHANGED = 0.005;
/** In reduced motion nothing but the pulse moves, so silent frames stay under this share of the talking delta. */
const SILENT_MAX_SHARE = 0.5;
/** Story time between clearing the talking flag and the first silent crop (the pulse stops at once). */
const TALK_GAP_MS = 200;
/** Reduced motion is clearly smaller: its nodeRect travel is at most this share of normal motion's. */
const REDUCED_MAX_SHARE = 0.75;
/** Normal motion must move the nodeRect at least this much (px) for the travel to be compared. */
const REDUCED_MIN_TRAVEL_PX = 2;

interface PairDeltas {
  readonly pairs: readonly FrameDelta[];
  /** The pair with the larger mean |luma change| (a single pair can land where the motion turns round). */
  readonly best: FrameDelta;
}

/** Deltas of the frame pairs 200 ms apart among four frames 100 ms apart: (0, 2) and (1, 3). */
function pairDeltas(frames: readonly DecodedImage[]): PairDeltas {
  const pairs: FrameDelta[] = [];
  for (const [a, b] of [[0, 2], [1, 3]] as const) {
    const first = frames[a];
    const second = frames[b];
    if (first && second) pairs.push(frameDelta(first, second));
  }
  const best = pairs.reduce<FrameDelta>((top, pair) => (pair.meanAbsLumaDiff > top.meanAbsLumaDiff ? pair : top), { meanAbsLumaDiff: 0, meanLumaDelta: 0, changedRatio: 0 });
  return { pairs, best };
}

interface SheetContext {
  readonly page: Page;
  readonly log: PageLog;
  readonly entry: CharacterStory;
  readonly timeline: StoryTimeline;
  /** Every other story node (the rest of the cast and the props), hidden by the pin. */
  readonly others: readonly string[];
}

/** Hides the rest of the stage, stands the character at center facing the viewer with no gesture, close camera. */
async function pin(context: SheetContext, keepReducedMotion: boolean): Promise<void> {
  const { page, entry } = context;
  await qaSetReducedMotion(page, true);
  await qaStageApply(page, [
    ...context.others.map((actor): StageAction => ({ do: "hide", actor })),
    { do: "enter", actor: entry.character, at: "center", from: "center" },
    { do: "gesture", actor: entry.character, gesture: "idle" },
    { do: "face", actor: entry.character, toward: "viewer" },
    { do: "camera", preset: "close" }
  ]);
  await qaAdvance(page, PIN_MS);
  if (!keepReducedMotion) await qaSetReducedMotion(page, false);
}

/** The crop around the character's nodeRect after a pin (null when it is not shown). */
async function sheetCrop(context: SheetContext): Promise<{ readonly rect: WonderNodeRect; readonly crop: Box } | null> {
  const rect = (await qaNodeRects(context.page, [context.entry.character])).find((candidate) => candidate.id === context.entry.character);
  if (!rect) return null;
  const crop = cropAround(rect, await canvasBox(context.page), CROP_GROW);
  return crop ? { rect, crop } : null;
}

/**
 * Jumps to the first calm window of `ms` from now in which the character is not running (GoGo chugs between a "go"
 * and a "stop" in G02, which would move every frame of a job); null when the story has none left.
 */
async function calmJump(context: SheetContext, ms: number): Promise<number | null> {
  const now = (await qaState(context.page)).director?.elapsedMs ?? 0;
  const at = context.timeline.findCalm(Math.ceil(now / 50) * 50, ms, (t) => !context.timeline.running(context.entry.character, t, t + ms));
  if (at === null) return null;
  await jumpTo(context.page, context.timeline, at);
  return at;
}

async function cropShot(page: Page, crop: Box): Promise<{ readonly png: Buffer; readonly image: DecodedImage }> {
  const png = await captureRegionPng(page, crop);
  return { png, image: decodePng(png) };
}

interface CharacterSheetResult {
  readonly record: Record<string, unknown>;
  readonly errors: string[];
  readonly modelDrawn: boolean | null;
  readonly phone: { readonly height: number; readonly silhouette: SilhouetteReport } | null;
  readonly turnWarnings: readonly string[] | null;
  readonly frontBack: FrameDelta | null;
  /** The turned view most unlike the front (largest mean |luma change|), with its name. */
  readonly turned: { readonly view: string; readonly delta: FrameDelta } | null;
  readonly poses: number;
  /** Reduced motion, talking: 200 ms pair deltas of four crops 100 ms apart (only the pulse moves). */
  readonly talking: PairDeltas | null;
  /** Reduced motion, silent: the same, after the talking flag is cleared (nothing should move). */
  readonly silent: PairDeltas | null;
  readonly normal: PairDeltas | null;
  readonly reduced: PairDeltas | null;
  /** How far the nodeRect moved across the four crops (spread of its top edge plus spread of its height, px). */
  readonly normalTravel: number | null;
  readonly reducedTravel: number | null;
  readonly sheetWarnings: readonly string[];
  readonly appErrors: readonly string[];
}

/** One character's sheet; a failing step is recorded (with the steps before it kept) instead of thrown. */
async function characterSheet(page: Page, log: PageLog, entry: CharacterStory, alreadyLoading: boolean): Promise<CharacterSheetResult> {
  const character = entry.character;
  const errors: string[] = [];
  const record: Record<string, unknown> = { character, story: entry.story, code: entry.code, note: SOFTWARE_GL_NOTE };
  const result: {
    -readonly [K in keyof CharacterSheetResult]: CharacterSheetResult[K];
  } = {
    record,
    errors,
    modelDrawn: null,
    phone: null,
    turnWarnings: null,
    frontBack: null,
    turned: null,
    poses: 0,
    talking: null,
    silent: null,
    normal: null,
    reduced: null,
    normalTravel: null,
    reducedTravel: null,
    sheetWarnings: [],
    appErrors: []
  };
  const errorsBefore = (await qaState(page).catch(() => null))?.errors ?? [];
  const mark = log.mark();
  try {
    // Load at phone size: the stage frames the story for the canvas it loads into.
    await page.setViewportSize(PHONE);
    record["load"] = await loadStory(page, log, entry.story, alreadyLoading, [character]);
    const drawn = (await liveNodes(page, [character])).nodes[0] ?? null;
    record["drawnAs"] = drawn?.tags ?? null;
    result.modelDrawn = drawn ? drawn.tags.includes("model") : false;
    const story = authoredStory(entry.story);
    const timeline = storyTimeline(entry.story);
    const context: SheetContext = {
      page,
      log,
      entry,
      timeline,
      others: [...story.cast.filter((member) => member.id !== character).map((member) => member.id), ...story.props.map((prop) => prop.id)]
    };

    // (e) Phone: the opening wide shot at 320x568.
    const phoneAt = openingWideShot(timeline);
    await jumpTo(page, timeline, phoneAt);
    let rects = await qaNodeRects(page, [character]);
    let shownForShot = false;
    if (rects.length === 0) {
      // The opening keeps it hidden: show it at its spot, at once.
      shownForShot = true;
      await qaSetReducedMotion(page, true);
      await qaStageApply(page, [{ do: "show", actor: character }]);
      await qaAdvance(page, 50);
      await qaSetReducedMotion(page, false);
      rects = await qaNodeRects(page, [character]);
    }
    const phoneRect = rects[0] ?? null;
    const phoneCanvas = await canvasBox(page);
    const phonePng = await captureCanvas(page, { canvasOnly: true });
    emitShot(`char-${character}-phone`, await pngToJpeg(page, phonePng, JPEG_QUALITY), "jpg");
    const phoneImage = decodePng(phonePng);
    if (phoneRect) {
      const box: Box = { x: Math.round(phoneRect.x - Math.floor(phoneCanvas.x)), y: Math.round(phoneRect.y - Math.floor(phoneCanvas.y)), width: Math.round(phoneRect.w), height: Math.round(phoneRect.h) };
      const silhouette = silhouetteContrast(phoneImage, box);
      result.phone = { height: silhouette.box.height, silhouette };
    }
    record["phone"] = {
      viewport: PHONE,
      storyMs: phoneAt,
      camera: timeline.cameraAt(phoneAt),
      shownForShot,
      nodeRect: phoneRect,
      canvas: phoneCanvas,
      visibleHeight: result.phone?.height ?? null,
      silhouette: result.phone?.silhouette ?? null,
      frame: lumaStats(phoneImage)
    };

    // The sheet, at 800x600.
    await page.setViewportSize(SHEET);
    await sleep(RESIZE_SETTLE_MS);
    const warningsAtSheet = (await qaDiagnostics(page))?.warnings ?? [];

    // (a) Turnaround, in reduced motion (turns settle in one step, no idle sway).
    const anchor = context.others[0] ?? null;
    const turnAt = await calmJump(context, TURN_JOB_MS);
    if (turnAt === null) errors.push("turnaround: no calm window left in the story");
    else if (anchor === null) errors.push("turnaround: the story has no other node to stand on a spot as the facing anchor");
    else {
      await pin(context, true);
      const cropped = await sheetCrop(context);
      if (!cropped) errors.push("turnaround: the character has no nodeRect after the pin");
      else {
        const warningsBefore = (await qaDiagnostics(page))?.warnings ?? [];
        const views: { view: string; toward: string; image: DecodedImage; frame: unknown }[] = [];
        for (const view of VIEWS) {
          await qaStageApply(page, faceView(character, anchor, view));
          await qaAdvance(page, FRAME_MS);
          const shot = await cropShot(page, cropped.crop);
          emitShot(`char-${character}-turn-${view.view}`, await pngToJpeg(page, shot.png, JPEG_QUALITY), "jpg");
          views.push({ view: view.view, toward: view.toward, image: shot.image, frame: lumaStats(shot.image) });
        }
        const warningsAfter = (await qaDiagnostics(page))?.warnings ?? [];
        result.turnWarnings = addedEntries(warningsBefore, warningsAfter).map((warning) => redact(warning));
        const front = views[0]?.image;
        const back = views.find((view) => view.view === "back")?.image;
        result.frontBack = front && back ? frameDelta(front, back) : null;
        if (front) {
          for (const view of views.slice(1)) {
            const delta = frameDelta(front, view.image);
            if (!result.turned || delta.meanAbsLumaDiff > result.turned.delta.meanAbsLumaDiff) result.turned = { view: view.view, delta };
          }
        }
        record["turnaround"] = {
          storyMs: turnAt,
          reducedMotion: true,
          anchor,
          nodeRect: cropped.rect,
          crop: cropped.crop,
          views: views.map((view) => ({ view: view.view, toward: view.toward, frame: view.frame, vsFront: front ? frameDelta(front, view.image) : null })),
          frontBack: result.frontBack,
          mostUnlikeFront: result.turned,
          warningsAdded: result.turnWarnings
        };
      }
      await qaSetReducedMotion(page, false);
    }

    // (b) Pose sheet, in normal motion.
    const posesAt = await calmJump(context, POSES_JOB_MS);
    if (posesAt === null) errors.push("poses: no calm window left in the story");
    else {
      await pin(context, false);
      const cropped = await sheetCrop(context);
      if (!cropped) errors.push("poses: the character has no nodeRect after the pin");
      else {
        const states: Record<string, unknown>[] = [];
        let neutral: DecodedImage | null = null;
        for (const pose of POSES) {
          await qaStageApply(page, [{ do: "gesture", actor: character, gesture: pose.gesture }]);
          await qaAdvance(page, pose.atMs);
          const shot = await cropShot(page, cropped.crop);
          emitShot(`char-${character}-pose-${pose.state}`, await pngToJpeg(page, shot.png, JPEG_QUALITY), "jpg");
          if (pose.gesture === "idle") neutral = shot.image;
          states.push({ ...pose, frame: lumaStats(shot.image), vsNeutral: neutral && pose.gesture !== "idle" ? frameDelta(neutral, shot.image) : null });
          result.poses += 1;
        }
        record["poses"] = { storyMs: posesAt, nodeRect: cropped.rect, crop: cropped.crop, states };
      }
    }

    // (c) Talking pulse, in reduced motion (pinned with reduced motion kept on): talking, then silent.
    const talkAt = await calmJump(context, PIN_MS + 8 * FRAME_MS + TALK_GAP_MS);
    if (talkAt === null) errors.push("talking: no calm window left in the story");
    else {
      await pin(context, true);
      const cropped = await sheetCrop(context);
      if (!cropped) errors.push("talking: the character has no nodeRect after the pin");
      else {
        const talkingFrames: DecodedImage[] = [];
        const silentFrames: DecodedImage[] = [];
        await qaSetTalking(page, character);
        for (let index = 0; index < 4; index += 1) {
          await qaAdvance(page, FRAME_MS);
          talkingFrames.push((await cropShot(page, cropped.crop)).image);
        }
        await qaSetTalking(page, null);
        for (let index = 0; index < 4; index += 1) {
          await qaAdvance(page, index === 0 ? TALK_GAP_MS : FRAME_MS);
          silentFrames.push((await cropShot(page, cropped.crop)).image);
        }
        result.talking = pairDeltas(talkingFrames);
        result.silent = pairDeltas(silentFrames);
        record["talking"] = {
          storyMs: talkAt,
          reducedMotion: true,
          crop: cropped.crop,
          talking: result.talking,
          silent: result.silent,
          silentShare: result.talking.best.meanAbsLumaDiff > 0 ? Math.round((result.silent.best.meanAbsLumaDiff / result.talking.best.meanAbsLumaDiff) * 1000) / 1000 : null
        };
      }
    }

    // (d) Reduced motion: the same gesture at the same offsets, normal then reduced.
    const reducedAt = await calmJump(context, REDUCED_JOB_MS);
    if (reducedAt === null) errors.push("reduced motion: no calm window left in the story");
    else {
      await pin(context, false);
      const cropped = await sheetCrop(context);
      if (!cropped) errors.push("reduced motion: the character has no nodeRect after the pin");
      else {
        const sample = async (): Promise<{ readonly frames: DecodedImage[]; readonly travel: number }> => {
          const frames: DecodedImage[] = [];
          const rects: WonderNodeRect[] = [];
          await qaStageApply(page, [{ do: "gesture", actor: character, gesture: REDUCED_GESTURE }]);
          for (let index = 0; index < 4; index += 1) {
            await qaAdvance(page, index === 0 ? REDUCED_FIRST_FRAME_MS : FRAME_MS);
            frames.push((await cropShot(page, cropped.crop)).image);
            const rect = (await qaNodeRects(page, [character])).find((candidate) => candidate.id === character);
            if (rect) rects.push(rect);
          }
          const spread = (values: readonly number[]): number => (values.length > 0 ? Math.max(...values) - Math.min(...values) : 0);
          return { frames, travel: Math.round((spread(rects.map((rect) => rect.y)) + spread(rects.map((rect) => rect.h))) * 10) / 10 };
        };
        const normal = await sample();
        await qaSetReducedMotion(page, true);
        const reduced = await sample();
        await qaSetReducedMotion(page, false);
        result.normal = pairDeltas(normal.frames);
        result.reduced = pairDeltas(reduced.frames);
        result.normalTravel = normal.travel;
        result.reducedTravel = reduced.travel;
        record["reducedMotion"] = {
          storyMs: reducedAt,
          gesture: REDUCED_GESTURE,
          crop: cropped.crop,
          normalTravelPx: normal.travel,
          reducedTravelPx: reduced.travel,
          normal: result.normal,
          reduced: result.reduced,
          reducedShare: result.normal.best.meanAbsLumaDiff > 0 ? Math.round((result.reduced.best.meanAbsLumaDiff / result.normal.best.meanAbsLumaDiff) * 1000) / 1000 : null
        };
      }
    }
    const warningsAtEnd = (await qaDiagnostics(page))?.warnings ?? [];
    result.sheetWarnings = addedEntries(warningsAtSheet, warningsAtEnd).map((warning) => redact(warning));
    record["stageWarnings"] = { added: result.sheetWarnings, total: warningsAtEnd.length };
  } catch (error) {
    errors.push(message(error));
    await qaSetReducedMotion(page, false).catch(() => undefined);
  }
  const final = await qaState(page).catch(() => null);
  result.appErrors = addedEntries(errorsBefore, final?.errors ?? []).map((entry) => redact(entry));
  const slice = log.since(mark);
  record["director"] = final?.director ?? null;
  record["errors"] = { steps: errors, app: result.appErrors, console: slice.consoleErrors, page: slice.pageErrors, badResponses: slice.badResponses };
  return result;
}

function expectCharacterSheet(entry: CharacterStory, result: CharacterSheetResult, log: { readonly consoleErrors: readonly string[]; readonly pageErrors: readonly string[] }): void {
  const who = `${entry.character} (${entry.code.toUpperCase()} ${entry.story})`;
  expect.soft(result.errors, `${who}: every sheet step ran`).toEqual([]);
  expect.soft(result.modelDrawn, `${who}: drawn from its admitted GLB, not a stand-in`).toBe(true);
  // (e) phone silhouette.
  expect.soft(result.phone, `${who}: shown in the phone wide shot`).not.toBeNull();
  if (result.phone) {
    const s = result.phone.silhouette;
    expect.soft(result.phone.height, `${who}: at least ${PHONE_MIN_HEIGHT_PX} px tall at 320x568 in the wide shot`).toBeGreaterThanOrEqual(PHONE_MIN_HEIGHT_PX);
    const clear = s.lumaDiff >= SILHOUETTE_MIN_LUMA_DIFF || s.colourDistance >= SILHOUETTE_MIN_COLOUR_DISTANCE || s.separatedShare >= SILHOUETTE_MIN_SEPARATED_SHARE;
    expect.soft(clear, `${who}: the silhouette stands out from the ground (luma diff ${s.lumaDiff}, colour distance ${s.colourDistance}, separated ${s.separatedShare})`).toBe(true);
  }
  // (a) turnaround.
  expect.soft(result.turnWarnings, `${who}: the turnaround's face actions add no stage warning`).toEqual([]);
  expect.soft(result.frontBack, `${who}: the turnaround has a front and a back view`).not.toBeNull();
  if (result.turned) {
    const { view, delta } = result.turned;
    const turned = delta.meanAbsLumaDiff >= TURN_MIN_MEAN_ABS || delta.changedRatio >= TURN_MIN_CHANGED;
    expect.soft(turned, `${who}: the turnaround turns (the ${view} view, the most unlike the front: ${JSON.stringify(delta)})`).toBe(true);
  }
  // (b) poses.
  expect.soft(result.poses, `${who}: all six poses captured`).toBe(POSES.length);
  // (c) talking pulse.
  expect.soft(result.talking, `${who}: the talking pulse was measured`).not.toBeNull();
  if (result.talking && result.silent) {
    const talk = result.talking.best;
    const silent = result.silent.best;
    expect.soft(talk.meanAbsLumaDiff >= TALK_MIN_MEAN_ABS || talk.changedRatio >= TALK_MIN_CHANGED, `${who}: the talking pulse is visible, at its reduced-motion half strength (${JSON.stringify(talk)})`).toBe(true);
    expect.soft(silent.meanAbsLumaDiff, `${who}: silent frames move much less than talking ones (silent ${JSON.stringify(silent)}, talking ${JSON.stringify(talk)})`).toBeLessThanOrEqual(talk.meanAbsLumaDiff * SILENT_MAX_SHARE);
  }
  // (d) reduced motion.
  expect.soft(result.reduced, `${who}: the reduced-motion pass was measured`).not.toBeNull();
  if (result.normalTravel !== null && result.reducedTravel !== null) {
    expect.soft(result.normalTravel, `${who}: "${REDUCED_GESTURE}" moves the character in normal motion`).toBeGreaterThanOrEqual(REDUCED_MIN_TRAVEL_PX);
    expect.soft(result.reducedTravel, `${who}: "${REDUCED_GESTURE}" travels clearly less with reduced motion (reduced ${result.reducedTravel} px, normal ${result.normalTravel} px; crop deltas ${JSON.stringify(result.reduced?.best)} and ${JSON.stringify(result.normal?.best)})`).toBeLessThanOrEqual(result.normalTravel * REDUCED_MAX_SHARE);
  }
  expect.soft(result.sheetWarnings, `${who}: the sheet adds no stage warning`).toEqual([]);
  expect.soft(result.appErrors, `${who}: state().errors`).toEqual([]);
  expect.soft(log.consoleErrors, `${who}: console errors`).toEqual([]);
  expect.soft(log.pageErrors, `${who}: page errors`).toEqual([]);
}

/** One describe block, one test: every listed character's sheet in one page (one boot), each a soft-failing step. */
export function defineCharacterSheetSuite(options: { readonly title: string; readonly characters: readonly CharacterStory[] }): void {
  test.describe(options.title, () => {
    test.setTimeout(SUITE_TIMEOUT_MS);
    let server: ExampleDevServer;
    test.beforeAll(async () => {
      server = await startExampleDevServer();
    });
    test.afterAll(async () => {
      await server?.close();
    });

    const names = options.characters.map((entry) => entry.character);
    test(`character sheets: ${names.join(", ")}`, async ({ page }) => {
      const first = options.characters[0];
      if (!first) throw new Error("no characters");
      await page.setViewportSize(PHONE);
      const log = attachPageLog(page, server.origin);
      await openWonderWorld(page, server, log, { autostart: 1, story: first.story, manual: 1, mode: "watch-sing", models: 1, modelWaitMs: MODEL_WAIT_MS });
      const context = await runContext(page, `chars-${names.join("-")}`);
      const summary: Record<string, unknown>[] = [];
      for (const entry of options.characters) {
        await test.step(`${entry.character} in ${entry.code.toUpperCase()} ${entry.story}`, async () => {
          const mark = log.mark();
          const result = await characterSheet(page, log, entry, entry === first);
          emitJson(`char-${entry.character}`, { context: { runId: context["runId"], commit: context["commit"], engineVersion: context["engineVersion"], renderer: context["renderer"] }, ...result.record });
          summary.push({
            character: entry.character,
            story: entry.story,
            errors: result.errors,
            model: result.modelDrawn,
            phoneHeight: result.phone?.height ?? null,
            silhouette: result.phone ? { lumaDiff: result.phone.silhouette.lumaDiff, colourDistance: result.phone.silhouette.colourDistance, separatedShare: result.phone.silhouette.separatedShare } : null,
            frontBack: result.frontBack,
            mostUnlikeFront: result.turned,
            poses: result.poses,
            talking: result.talking?.best ?? null,
            silent: result.silent?.best ?? null,
            normal: result.normal?.best ?? null,
            reduced: result.reduced?.best ?? null,
            travelPx: { normal: result.normalTravel, reduced: result.reducedTravel },
            stageWarnings: result.sheetWarnings.length
          });
          expectCharacterSheet(entry, result, log.since(mark));
        });
      }
      const privacy = await expectPagePrivacy(page, log, "character sheets");
      emitJson(`chars-${names.join("-")}-summary`, { ...context, characters: summary, ...privacy });
    });
  });
}

// ---------------------------------------------------------------- per-story stills

/** One still: the story's first invite or model beat, canvas only, at 1024x768. Never throws for a story failure. */
async function storyStill(page: Page, log: PageLog, story: StoryEntry, alreadyLoading: boolean): Promise<{ readonly record: Record<string, unknown>; readonly problems: string[] }> {
  const problems: string[] = [];
  const record: Record<string, unknown> = { code: story.code, id: story.id, title: story.title, kind: story.kind, viewport: STILL, note: SOFTWARE_GL_NOTE };
  const mark = log.mark();
  const errorsBefore = (await qaState(page).catch(() => null))?.errors ?? [];
  const warningsBefore = (await qaDiagnostics(page).catch(() => null))?.warnings ?? [];
  const ids = modelNodeIds(story.id);
  try {
    record["load"] = await loadStory(page, log, story.id, alreadyLoading, ids);
    const timeline = storyTimeline(story.id);
    const moment = stillMoment(timeline);
    record["moment"] = { ...moment, camera: timeline.cameraAt(moment.t) };
    const state = await jumpTo(page, timeline, moment.t);
    record["director"] = state.director;
    const png = await captureCanvas(page, { canvasOnly: true });
    emitShot(`still-${story.code}`, await pngToJpeg(page, png, JPEG_QUALITY), "jpg");
    const image = decodePng(png);
    const luma = lumaStats(image);
    record["frame"] = { width: image.width, height: image.height, luma, colour: colourStats(image) };
    if (!(luma.nonBlackRatio > 0.5 && luma.coarseColours > 12)) problems.push(`the frame is not drawn (${JSON.stringify(luma)})`);
    const nodes = await liveNodes(page, ids);
    record["nodes"] = nodes.nodes;
    const standIns = nodes.nodes.filter((node) => !node.tags.includes("model")).map((node) => node.id);
    if (standIns.length > 0) problems.push(`drawn as stand-ins instead of their admitted GLBs: ${standIns.join(", ")}`);
    const diagnostics = await qaDiagnostics(page);
    record["stage"] = {
      drawCalls: diagnostics?.drawCalls ?? null,
      nodes: diagnostics?.nodes ?? null,
      world: diagnostics?.["world"] ?? null,
      modelNodes: diagnostics?.["modelNodes"] ?? null,
      standInNodes: diagnostics?.["standInNodes"] ?? null,
      modelStatus: diagnostics?.["modelStatus"] ?? null
    };
    const warningsAdded = addedEntries(warningsBefore, diagnostics?.warnings ?? []).map((warning) => redact(warning));
    record["stageWarnings"] = warningsAdded;
    if (warningsAdded.length > 0) problems.push(`stage warnings: ${warningsAdded.join(" | ")}`);
  } catch (error) {
    problems.push(message(error));
  }
  const final = await qaState(page).catch(() => null);
  const appErrors = addedEntries(errorsBefore, final?.errors ?? []).map((entry) => redact(entry));
  const slice = log.since(mark);
  if (appErrors.length > 0) problems.push(`state().errors: ${appErrors.join(" | ")}`);
  if (slice.pageErrors.length > 0) problems.push(`page errors: ${slice.pageErrors.join(" | ")}`);
  if (slice.consoleErrors.length > 0) problems.push(`console errors: ${slice.consoleErrors.join(" | ")}`);
  record["errors"] = { app: appErrors, console: slice.consoleErrors, page: slice.pageErrors, badResponses: slice.badResponses };
  record["problems"] = problems;
  return { record, problems };
}

/** One describe block, one test: one still per listed story in one page (one boot), each a soft-failing step. */
export function defineStillsSuite(options: { readonly title: string; readonly stories: readonly StoryEntry[] }): void {
  test.describe(options.title, () => {
    test.setTimeout(SUITE_TIMEOUT_MS);
    let server: ExampleDevServer;
    test.beforeAll(async () => {
      server = await startExampleDevServer();
    });
    test.afterAll(async () => {
      await server?.close();
    });

    const range = storyRange(options.stories);
    test(`${range}: one canvas-only still per story at its first invite or model beat`, async ({ page }) => {
      const first = options.stories[0];
      if (!first) throw new Error("no stories");
      await page.setViewportSize(STILL);
      const log = attachPageLog(page, server.origin);
      await openWonderWorld(page, server, log, { autostart: 1, story: first.id, manual: 1, mode: "watch-sing", models: 1, modelWaitMs: MODEL_WAIT_MS });
      const context = await runContext(page, `stills-${range}`);
      const summary: Record<string, unknown>[] = [];
      for (const story of options.stories) {
        await test.step(`${story.code.toUpperCase()} ${story.title} (${story.id})`, async () => {
          const still = await storyStill(page, log, story, story === first);
          emitJson(`still-${story.code}`, { context: { runId: context["runId"], commit: context["commit"], engineVersion: context["engineVersion"], renderer: context["renderer"] }, ...still.record });
          summary.push({ code: story.code, id: story.id, moment: still.record["moment"] ?? null, problems: still.problems });
          expect.soft(still.problems, `${story.code.toUpperCase()} ${story.id}: the still is drawn from the admitted models with no error`).toEqual([]);
        });
      }
      const privacy = await expectPagePrivacy(page, log, `stills ${range}`);
      emitJson(`stills-${range.toLowerCase()}-summary`, { ...context, stories: summary, ...privacy });
    });
  });
}
