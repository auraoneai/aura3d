/**
 * The story clock of a zero-input `?manual=1` run, simulated in Node (no browser) for the capture specs
 * (wonder-world-characters*.spec.ts, wonder-world-stills*.spec.ts).
 *
 * With `?manual=1` the app moves its episode director only through the QA hooks, in fixed 50 ms steps, and a line ends
 * after its recorded length (src/app.ts: in manual runs `lineMs` is the clip's duration, or the caption estimate when a
 * line has no clip, with no grace). Feeding the app's own director (src/runtime/episode-director.ts) the same steps
 * gives the exact phase, beat, line and stage-action timeline. The specs use it to reach a moment with one advance()
 * (one render instead of hundreds on software WebGL2) and to find calm windows (no stage action, line or song) for
 * staged captures. `jumpTo` checks that the page's director really is where the simulation says, so a drift between
 * the two fails loudly instead of producing captures of the wrong moment.
 */
import type { Page } from "@playwright/test";
import { AUDIO_MANIFEST } from "../../apps/veer-wonder-world/src/audio-manifest";
import { estimateLineMs } from "../../apps/veer-wonder-world/src/content/schema";
import { en } from "../../apps/veer-wonder-world/src/localization/en/index";
import { createEpisodeDirector } from "../../apps/veer-wonder-world/src/runtime/episode-director";
import type { CameraPresetId, DirectorPhase, StageAction } from "../../apps/veer-wonder-world/src/types";
import { authoredStory, passBeats, qaAdvance, qaState, type WonderQaState } from "./wonder-world-lib";

/** The app's fixed simulation step (src/app.ts STEP_MS). */
export const STEP_MS = 50;
/** A zero-input story never runs this long (the longest is about 6 minutes). */
const MAX_STORY_MS = 20 * 60_000;
/** A song keeps its performers moving for its own length; when the manifest has none, this long. */
const SONG_FALLBACK_MS = 20_000;
/** Margin after a line or a song before the stage counts as calm again. */
const AFTER_LINE_MS = 100;
const AFTER_SONG_MS = 500;
const ACTIVE: readonly DirectorPhase[] = ["speaking", "holding", "waiting", "responding"];

export interface TimelineStep {
  /** Story time after this step (ms); step i is at i * STEP_MS, step 0 is START. */
  readonly t: number;
  readonly phase: DirectorPhase;
  readonly beatId: string | null;
  readonly beatIndex: number;
  /** Stage actions the director emitted in this step (beat start, response start). */
  readonly stage: readonly StageAction[];
  /** The line key started in this step, if any. */
  readonly speak: string | null;
}

export interface StoryTimeline {
  readonly storyId: string;
  /** Story time at which the director finished. */
  readonly endMs: number;
  readonly steps: readonly TimelineStep[];
  /** The step at story time `t` (a multiple of STEP_MS), or undefined past the end. */
  at(t: number): TimelineStep | undefined;
  /** True when the director stays active and no stage action, line or song lands in (t, t + ms]. */
  calm(t: number, ms: number): boolean;
  /** The earliest step time at or after `from` with `calm(t, ms)`, or null. */
  findCalm(from: number, ms: number): number | null;
  /** The camera preset in force at `t` and the story time it was set. */
  cameraAt(t: number): { readonly preset: CameraPresetId; readonly since: number };
  /** First and last step time of the first visit to a beat, or null when the run never reaches it. */
  beatSpan(beatId: string): { readonly start: number; readonly end: number } | null;
  /** The first step time at which the director waits in this beat, or null. */
  waitStart(beatId: string): number | null;
}

/** The app's manual-run line length: the recorded clip's duration, else the caption estimate of the English text. */
export function manualLineMs(key: string): number {
  const recorded = AUDIO_MANIFEST.lines[key]?.durationMs;
  if (recorded !== undefined && Number.isFinite(recorded) && recorded > 0) return recorded;
  return estimateLineMs(en.lines[key] ?? key);
}

function songMs(action: StageAction): number {
  if (action.do !== "song") return 0;
  const clip = AUDIO_MANIFEST.songs[action.song];
  return clip && clip.durationMs > 0 ? clip.durationMs : SONG_FALLBACK_MS;
}

/** Runs the story's director with zero input, step by step, exactly as `advance()` does in a `?manual=1` page. */
export function storyTimeline(storyId: string): StoryTimeline {
  const story = authoredStory(storyId);
  const director = createEpisodeDirector(story, { lineMs: manualLineMs });
  const steps: TimelineStep[] = [];
  const record = (t: number, effects: ReturnType<typeof director.send>): void => {
    const stage: StageAction[] = [];
    let speak: string | null = null;
    for (const effect of effects) {
      if (effect.type === "stage") stage.push(...effect.actions);
      if (effect.type === "speak") speak = effect.line.key;
    }
    const snapshot = director.snapshot();
    steps.push({ t, phase: snapshot.phase, beatId: snapshot.beatId, beatIndex: snapshot.beatIndex, stage, speak });
  };
  record(0, director.send({ type: "START", mode: "watch-sing" }));
  for (let t = STEP_MS; t <= MAX_STORY_MS && director.snapshot().phase !== "finished"; t += STEP_MS) {
    record(t, director.send({ type: "TICK", dtMs: STEP_MS }));
  }
  const last = steps[steps.length - 1];
  const endMs = last ? last.t : 0;

  // busy[i]: something happens in (t[i-1], t[i]]: a stage action, a line, a song, or the director is not active.
  const busy = steps.map((step) => step.stage.length > 0 || !ACTIVE.includes(step.phase));
  const mark = (fromIndex: number, untilMs: number): void => {
    const until = Math.min(steps.length - 1, Math.ceil(untilMs / STEP_MS));
    for (let index = Math.max(0, fromIndex); index <= until; index += 1) busy[index] = true;
  };
  steps.forEach((step, index) => {
    if (step.speak !== null) mark(index, step.t + manualLineMs(step.speak) + AFTER_LINE_MS);
    for (const action of step.stage) if (action.do === "song") mark(index, step.t + songMs(action) + AFTER_SONG_MS);
  });

  const cameras: { preset: CameraPresetId; since: number }[] = [];
  for (const step of steps) for (const action of step.stage) if (action.do === "camera") cameras.push({ preset: action.preset, since: step.t });

  const indexOf = (t: number): number => Math.round(t / STEP_MS);
  const calm = (t: number, ms: number): boolean => {
    const from = indexOf(t);
    const until = Math.ceil((t + ms) / STEP_MS);
    if (from < 0 || until >= steps.length) return false;
    const start = steps[from];
    if (!start || !ACTIVE.includes(start.phase)) return false;
    for (let index = from + 1; index <= until; index += 1) if (busy[index]) return false;
    return true;
  };

  return {
    storyId,
    endMs,
    steps,
    at: (t) => steps[indexOf(t)],
    calm,
    findCalm(from, ms) {
      for (let t = Math.ceil(from / STEP_MS) * STEP_MS; t + ms <= endMs; t += STEP_MS) if (calm(t, ms)) return t;
      return null;
    },
    cameraAt(t) {
      let current: { preset: CameraPresetId; since: number } = { preset: "wide", since: 0 };
      for (const change of cameras) if (change.since <= t) current = change;
      return current;
    },
    beatSpan(beatId) {
      const first = steps.findIndex((step) => step.beatId === beatId);
      if (first < 0) return null;
      let end = first;
      while (end + 1 < steps.length && steps[end + 1]?.beatId === beatId) end += 1;
      return { start: steps[first]?.t ?? 0, end: steps[end]?.t ?? 0 };
    },
    waitStart(beatId) {
      return steps.find((step) => step.beatId === beatId && step.phase === "waiting")?.t ?? null;
    }
  };
}

/** The opening wide shot: the first moment from `notBefore` with the wide camera settled for 1.5 s (entrances done). */
export function openingWideShot(timeline: StoryTimeline, notBefore = 4_000): number {
  for (let t = notBefore; t <= timeline.endMs; t += STEP_MS) {
    const camera = timeline.cameraAt(t);
    if (camera.preset === "wide" && t - camera.since >= 1_500) return t;
  }
  return notBefore;
}

export interface StillMoment {
  readonly beatId: string;
  readonly kind: string;
  /** Story time of the capture. */
  readonly t: number;
  readonly rule: string;
}

/**
 * The moment a story's still shows: its first "invite" or "model" beat (pass order). A beat that waits for a turn is
 * shown 600 ms into the wait (the target ring has opened); any other 3 s after the beat starts (camera eased in,
 * entrances and the gesture under way), or at its last step when it is shorter.
 */
export function stillMoment(timeline: StoryTimeline): StillMoment {
  const story = authoredStory(timeline.storyId);
  const entry = passBeats(story).find(({ beat }) => beat.kind === "invite" || beat.kind === "model") ?? passBeats(story)[1] ?? passBeats(story)[0];
  if (!entry) throw new Error(`${timeline.storyId} has no beats`);
  const span = timeline.beatSpan(entry.beat.id);
  if (!span) throw new Error(`${timeline.storyId}: the zero-input timeline never reaches beat "${entry.beat.id}"`);
  const wait = timeline.waitStart(entry.beat.id);
  if (wait !== null) {
    return { beatId: entry.beat.id, kind: entry.beat.kind, t: Math.min(wait + 600, span.end), rule: "600 ms into the beat's wait" };
  }
  return { beatId: entry.beat.id, kind: entry.beat.kind, t: Math.min(span.start + 3_000, span.end), rule: "3 s after the beat starts" };
}

/**
 * Advances the page's story clock to `t` (one advance call, one render) and checks the page's director against the
 * simulated timeline: same story time, beat and phase. Throws, with both sides, when they differ.
 */
export async function jumpTo(page: Page, timeline: StoryTimeline, t: number): Promise<WonderQaState> {
  const now = (await qaState(page)).director?.elapsedMs ?? 0;
  if (t < now - 0.5) throw new Error(`${timeline.storyId}: cannot jump back from ${now} ms to ${t} ms`);
  if (t > now + 0.5) await qaAdvance(page, t - now);
  const state = await qaState(page);
  const director = state.director;
  const expected = timeline.at(t);
  if (
    !director ||
    !expected ||
    director.storyId !== timeline.storyId ||
    Math.abs(director.elapsedMs - t) > 0.5 ||
    director.beatId !== expected.beatId ||
    director.phase !== expected.phase
  ) {
    throw new Error(
      `${timeline.storyId}: the page's director is not where the simulated timeline is at ${t} ms: ` +
        `page ${JSON.stringify(director)}, timeline ${JSON.stringify(expected ? { t: expected.t, phase: expected.phase, beatId: expected.beatId } : null)}`
    );
  }
  return state;
}
