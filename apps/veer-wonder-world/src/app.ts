// Wonder World app shell (PRD 04 A06; PRD 03 sections 2-4, 6 and 8; PRD 01
// sections 6-9; PRD 06 QA-E02..E12, QA-A01..A09, QA-P01..P04).
//
// Composes what the other modules build: the content catalog and the English
// locale pack, the parent settings, the start screen and the story menu, the
// stage (src/scenes/stage.ts, which owns the one `createGame` from
// `@aura3d/engine/game`), the audio mixer (the one AudioContext; its
// `gameSoundOptions()` go into that createGame), the narration player, one
// episode director per story, the touch router, the session gate, the child
// controls, captions, the parent gate and panel, and the end-of-story card.
//
// Effect routing (routeDirectorEffect): "stage" goes to stage.apply, and its
// sfx/song/music actions to the mixer; "speak" to the narration player, whose
// onStart shows the caption and starts the talking pulse (a squash/bob while
// the line plays; never lip sync); "targets" to the stage highlights, the
// touch router and the grown-up's "Your child had a turn" control (the parent
// confirm, PRD 01 section 3.2, enabled only while a turn waits);
// "caregiver" to the parent tip line; pause/resume media to the
// mixer and narration; "finished" stops every sound; "offline" shows the
// end-of-story card, and only the grown-up's button leaves it, for the menu.
// Nothing ever starts the next story by itself.
//
// Time. One story clock moves in fixed 50 ms steps, only while a story runs
// and nothing pauses it. Each step ticks the director, then the clock (which
// fires the narration player's caption and safety timers). The live loop is
// `createFixedStepLoop`; the stage animates every frame on the story clock as
// presented by `createFixedStepPresenter`, so it moves smoothly at any refresh
// rate and never drifts from the director. `?manual=1` stops the live loop:
// only QA calls move time, the stage then steps with the director, and lines
// end on story time alone (a recorded clip's real end is not waited for), so
// a QA run gives the same result every time. No code here reads a wall clock.
//
// Audio. Nothing is audible before a grown-up taps "Tap to start": that tap
// unlocks the mixer. With `?autostart=1` there is no start screen, so the first
// real tap or key press unlocks it instead; until then lines run on caption
// timing. When audio cannot start the story carries on with captions shown and
// a short notice, without asking again.
//
// Safety rules held here: silence always completes (every wait ends by
// itself); "All done" works from every screen and every beat; leaving the tab
// pauses, and coming back stays paused until a grown-up taps Resume; a story
// always ends on its offline card and never plays the next one; no
// microphone, no network call besides the app's own same-origin assets, no
// analytics, and no child data in state, storage or errors.

import { createFixedStepLoop, type AuraApp } from "@aura3d/engine";
import { createFixedStepPresenter } from "@aura3d/engine/game";
import { AUDIO_MANIFEST } from "./audio-manifest.js";
import { LOCALE_PACKS, STORIES, storyByCode, storyById, storyCode } from "./content/catalog.js";
import { estimateLineMs } from "./content/schema.js";
import { createAudioMixer, type AudioMixer } from "./runtime/audio-mixer.js";
import type { LineMs } from "./runtime/beat-runner.js";
import { createEpisodeDirector } from "./runtime/episode-director.js";
import type { WonderFlags } from "./runtime/feature-flags.js";
import { createLocale, type Locale } from "./runtime/locale.js";
import { createNarrationPlayer, type NarrationPlayer } from "./runtime/narration-player.js";
import { createPauseSet, type PauseReason } from "./runtime/pause-reasons.js";
import { createSessionGate } from "./runtime/session-gate.js";
import { bindCanvasTaps, createTouchRouter, type TouchRouter } from "./runtime/touch-router.js";
import { createStage, type StageDiagnostics, type TargetRect, type WonderStage } from "./scenes/stage.js";
import type {
  AudioClipRef,
  DirectorEffect,
  DirectorEvent,
  DirectorSnapshot,
  LineRef,
  MusicBedId,
  ParentSettings,
  PlayMode,
  SongId,
  SpeakerId,
  StageAction,
  StageAdapter,
  StorySpec
} from "./types.js";
import { applyDisplaySettings } from "./ui/accessibility.js";
import { mountCaptions, type Captions } from "./ui/captions.js";
import { mountChildControls, type ChildControls } from "./ui/child-controls.js";
import { showEpisodeMenu, type MenuItem } from "./ui/episode-menu.js";
import { showOfflineCard } from "./ui/offline-card.js";
import { requireParent } from "./ui/parent-gate.js";
import { openParentPanel } from "./ui/parent-panel.js";
import { WAIT_MS_DEFAULT, clampWaitMs, saveSettings, type SettingsStorage } from "./ui/settings-store.js";
import { showLoading, showStartScreen } from "./ui/start-screen.js";

// ---------------------------------------------------------------- constants

/** Fixed simulation step: the director, the story clock and QA runs move in these. */
export const STEP_MS = 50;

/**
 * Live runs: how long past a line's recorded (or estimated) length the
 * director waits for the narration player's end-of-line before moving on by
 * itself (covers fetching and decoding a clip). Manual QA runs use none.
 */
export const LINE_GRACE_MS = 1500;

/** Taps on the same target closer than this are one tap (the touch router default). */
export const TAP_DEBOUNCE_MS = 400;

/** Most line keys one story's spoken log keeps (the longest story speaks under 80 lines; activities repeat rounds). */
export const SPOKEN_LOG_MAX = 400;

/**
 * The canvas binding's own repeat guard: none. The story runner's touch router
 * already debounces accepted taps (TAP_DEBOUNCE_MS), and a tap that ends a
 * wait clears the targets at once, so a second press finds nothing to hit. A
 * guard on the canvas as well would also remember taps the runner refused,
 * such as a tap on a highlighted target while paused; story time is frozen
 * during a pause, so that would swallow the child's first tap after Resume.
 */
export const CANVAS_TAP_DEBOUNCE_MS = 0;

/** runToEnd stops after this much story time when no limit is given (20 minutes; the longest story is about 6). */
export const RUN_TO_END_DEFAULT_MS = 20 * 60 * 1000;

/** The stage is never advanced by more than this in one update call (it clamps larger steps). */
const STAGE_UPDATE_MAX_MS = 100;

/** Recorded errors kept for QA state (messages only, never user data). */
const MAX_ERRORS = 20;
const MAX_ERROR_LENGTH = 240;

/** How many upcoming voice lines are fetched and decoded ahead of time. */
const PRELOAD_LINES_AHEAD = 2;

export type FinishReason = "complete" | "all-done";

// ---------------------------------------------------------------- story clock

/** Story time in ms, moved only by `advance` (fixed steps from the loop or QA). */
export interface StoryClock {
  now(): number;
  /** Runs `fn` once story time has moved `ms` further; returns a cancel function. Never runs synchronously. */
  schedule(fn: () => void, ms: number): () => void;
  /** Moves story time on, then runs every due timer in due order (timers a callback adds are included). */
  advance(ms: number): void;
  /** Timers waiting to run. */
  pending(): number;
}

/** Bound on timers run in one advance (a timer that keeps re-arming itself at 0 ms cannot hang a step). */
const MAX_TIMERS_PER_ADVANCE = 1000;

export function createStoryClock(start = 0): StoryClock {
  interface Timer {
    readonly due: number;
    readonly order: number;
    readonly fn: () => void;
    cancelled: boolean;
  }
  let now = Number.isFinite(start) ? start : 0;
  let order = 0;
  let timers: Timer[] = [];

  const nextDue = (): Timer | null => {
    let best: Timer | null = null;
    for (const timer of timers) {
      if (timer.cancelled || timer.due > now) continue;
      if (!best || timer.due < best.due || (timer.due === best.due && timer.order < best.order)) best = timer;
    }
    return best;
  };

  return {
    now: () => now,
    schedule(fn, ms) {
      const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;
      const timer: Timer = { due: now + delay, order: order++, fn, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    advance(ms) {
      if (Number.isFinite(ms) && ms > 0) now += ms;
      for (let guard = 0; guard < MAX_TIMERS_PER_ADVANCE; guard += 1) {
        const timer = nextDue();
        if (!timer) break;
        timer.cancelled = true;
        timer.fn();
      }
      timers = timers.filter((timer) => !timer.cancelled);
    },
    pending: () => timers.filter((timer) => !timer.cancelled).length
  };
}

// ---------------------------------------------------------------- line timing and talking

/**
 * Length of a spoken line in ms: the recorded clip's duration when there is
 * one (so a silent run keeps the voiced pacing), otherwise the slow-narration
 * estimate of its caption text (src/content/schema.ts `estimateLineMs`).
 */
export function spokenLineMs(text: string, clip: AudioClipRef | undefined): number {
  const recorded = clip?.durationMs;
  if (recorded !== undefined && Number.isFinite(recorded) && recorded > 0) return recorded;
  return estimateLineMs(text);
}

/**
 * The stage node that gets the talking pulse while `speaker` talks: the cast
 * member with that id, else the prop with that id or asset (the baby robot of
 * E13 is a prop), else nobody (the off-screen narrator).
 */
export function talkingActorFor(story: StorySpec, speaker: SpeakerId): string | null {
  if (speaker === "narrator") return null;
  if (story.cast.some((member) => member.id === speaker)) return speaker;
  const prop = story.props.find((p) => p.id === speaker) ?? story.props.find((p) => p.asset === speaker);
  return prop ? prop.id : null;
}

/** Every line key of a story in play order (one activity round), used to fetch upcoming clips early. */
export function storyLineKeys(story: StorySpec): readonly string[] {
  const beats = story.kind === "episode" ? story.beats : [...story.intro, ...story.round, ...story.outro];
  const keys: string[] = [];
  for (const beat of beats) {
    for (const line of beat.lines) if (!keys.includes(line.key)) keys.push(line.key);
    for (const line of beat.response?.lines ?? []) if (!keys.includes(line.key)) keys.push(line.key);
  }
  return keys;
}

/** The songs and music beds a story's stage actions can start. */
export function storyMusic(story: StorySpec): { readonly songs: readonly SongId[]; readonly beds: readonly MusicBedId[] } {
  const beats = story.kind === "episode" ? story.beats : [...story.intro, ...story.round, ...story.outro];
  const songs: SongId[] = [];
  const beds: MusicBedId[] = [];
  const scan = (actions: readonly StageAction[] | undefined): void => {
    for (const action of actions ?? []) {
      if (action.do === "song" && !songs.includes(action.song)) songs.push(action.song);
      if (action.do === "music" && action.bed !== null && !beds.includes(action.bed)) beds.push(action.bed);
      // A song's line cues can change the bed too (07 B20).
      if (action.do === "song") for (const cue of action.cues ?? []) scan(cue.stage);
    }
  };
  for (const beat of beats) {
    scan(beat.stage);
    scan(beat.reducedMotionStage);
    scan(beat.response?.stage);
  }
  if (story.music && !beds.includes(story.music)) beds.push(story.music);
  return { songs, beds };
}

// ---------------------------------------------------------------- effect routing

/**
 * Where director effects go. In the app these are the stage, the mixer, the
 * narration player and the caption overlay; unit tests pass plain objects.
 */
export interface StorySinks {
  readonly stage: Pick<StageAdapter, "apply" | "setTalking" | "setTargets">;
  readonly audio: Pick<AudioMixer, "playSfx" | "playSong" | "setBed" | "pauseAll" | "resumeAll" | "stopAll">;
  readonly narration: Pick<NarrationPlayer, "play" | "stop" | "pause" | "resume">;
  readonly captions: Pick<Captions, "show" | "clear" | "setTip">;
  /** Caption text of a line key and the parent tip text of a string key, in the current locale. */
  readonly text: { line(key: string): string; str(key: string): string };
  /** The director paused (true) or resumed (false) every sound. */
  readonly onMediaPaused?: (paused: boolean) => void;
  /** A beat started (true) or stopped (false) waiting for a turn: the grown-up's "had a turn" confirm is available. */
  readonly onTurn?: (waiting: boolean) => void;
  /** The story ended ("complete" or "all-done"); every sound has already stopped. */
  readonly onFinished?: (reason: FinishReason) => void;
  /** Show the end-of-story card with this offline-play string key. Never start another story from here. */
  readonly onOffline?: (key: string) => void;
}

/** Performs one director effect. */
export function routeDirectorEffect(effect: DirectorEffect, sinks: StorySinks, router: Pick<TouchRouter, "setTargets" | "reset">): void {
  switch (effect.type) {
    case "stage": {
      sinks.stage.apply(effect.actions);
      for (const action of effect.actions) {
        if (action.do === "sfx") sinks.audio.playSfx(action.sound);
        else if (action.do === "song") sinks.audio.playSong(action.song);
        else if (action.do === "music") sinks.audio.setBed(action.bed);
      }
      return;
    }
    case "speak":
      sinks.narration.play(effect.line);
      return;
    case "stopSpeech":
      sinks.narration.stop();
      sinks.stage.setTalking(null);
      sinks.captions.clear();
      return;
    case "targets":
      router.setTargets(effect.targets);
      sinks.stage.setTargets(effect.targets);
      sinks.onTurn?.(effect.targets !== null && effect.targets.length > 0);
      return;
    case "caregiver":
      sinks.captions.setTip(effect.key === null ? null : sinks.text.str(effect.key));
      return;
    case "pauseMedia":
      sinks.audio.pauseAll();
      sinks.narration.pause();
      sinks.onMediaPaused?.(true);
      return;
    case "resumeMedia":
      sinks.narration.resume();
      sinks.audio.resumeAll();
      sinks.onMediaPaused?.(false);
      return;
    case "finished":
      // Everything stops, and nothing is left held: a pause that was in force
      // must not mute the next story.
      router.reset();
      sinks.stage.setTargets(null);
      sinks.onTurn?.(false);
      sinks.stage.setTalking(null);
      sinks.narration.stop();
      sinks.audio.stopAll();
      sinks.narration.resume();
      sinks.audio.resumeAll();
      sinks.captions.clear();
      sinks.captions.setTip(null);
      sinks.onFinished?.(effect.reason);
      return;
    case "offline":
      sinks.onOffline?.(effect.key);
      return;
  }
}

/** Performs director effects in order. */
export function routeDirectorEffects(effects: readonly DirectorEffect[], sinks: StorySinks, router: Pick<TouchRouter, "setTargets" | "reset">): void {
  for (const effect of effects) routeDirectorEffect(effect, sinks, router);
}

// ---------------------------------------------------------------- story runner

export interface StoryRunnerOptions {
  readonly story: StorySpec;
  readonly mode: PlayMode;
  readonly sinks: StorySinks;
  /** The director's own end of a line (story ms) when no end-of-line arrives first. */
  readonly lineMs: LineMs;
  /** Forward the narration player's end-of-line to the director (live runs). Manual QA runs end lines on story time only. */
  readonly followNarration: boolean;
  /** The parent's waiting time; undefined keeps each beat's authored wait. */
  readonly waitMs?: number;
  readonly reducedMotion?: boolean;
  readonly debounceMs?: number;
}

/** One story's director, touch router and line bookkeeping. No DOM, no clock: callers pass time in. */
export interface StoryRunner {
  readonly story: StorySpec;
  readonly mode: PlayMode;
  /** Sends START (once). */
  start(): void;
  /** Story time moved by `dtMs`. */
  tick(dtMs: number): void;
  /** The narration player started a line: caption and talking pulse. */
  lineStarted(line: LineRef): void;
  /** The narration player finished a line. */
  lineEnded(key: string): void;
  /** A child tap that hit `target` at story time `nowMs`. True when it was taken as the turn. */
  tap(target: string, nowMs: number): boolean;
  /** The parent confirms a gesture or sound. True when it was taken as the turn. */
  confirm(nowMs: number): boolean;
  pause(): void;
  resume(): void;
  skipBeat(): void;
  allDone(): void;
  audioUnavailable(): void;
  setReducedMotion(on: boolean): void;
  setWaitMs(waitMs: number | undefined): void;
  /** Tap targets the router accepts now (at most two). */
  activeTargets(): readonly string[];
  /** The line being spoken (or held), if any. */
  speakingLine(): LineRef | null;
  /** Keys of the lines started in this story, in order (QA: the spoken-order check). */
  spokenKeys(): readonly string[];
  snapshot(): DirectorSnapshot;
  started(): boolean;
  /** Why the story ended, or null while it runs. */
  finishReason(): FinishReason | null;
  /** Ends the story without an offline card (route change, exit, app teardown). */
  dispose(): void;
}

export function createStoryRunner(options: StoryRunnerOptions): StoryRunner {
  const { story, mode, sinks } = options;
  const director = createEpisodeDirector(story, {
    lineMs: options.lineMs,
    reducedMotion: options.reducedMotion === true,
    ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {})
  });
  const router = createTouchRouter(options.debounceMs !== undefined ? { debounceMs: options.debounceMs } : {});
  let begun = false;
  let disposed = false;
  let speaking: LineRef | null = null;
  let finished: FinishReason | null = null;
  const spoken: string[] = [];

  const send = (event: DirectorEvent): DirectorEffect[] => {
    if (disposed) return [];
    const effects = director.send(event);
    for (const effect of effects) {
      if (effect.type === "stopSpeech" || effect.type === "finished") speaking = null;
      if (effect.type === "finished") finished = effect.reason;
      routeDirectorEffect(effect, sinks, router);
    }
    return effects;
  };

  return {
    story,
    mode,
    start() {
      if (begun || disposed) return;
      begun = true;
      send({ type: "START", mode });
    },
    tick(dtMs) {
      if (!begun) return;
      send({ type: "TICK", dtMs });
    },
    lineStarted(line) {
      if (disposed || finished !== null) return;
      speaking = line;
      if (spoken.length < SPOKEN_LOG_MAX) spoken.push(line.key);
      sinks.captions.show(line.speaker, sinks.text.line(line.key));
      sinks.stage.setTalking(talkingActorFor(story, line.speaker));
    },
    lineEnded(key) {
      if (disposed) return;
      if (speaking?.key === key) {
        speaking = null;
        sinks.stage.setTalking(null);
        sinks.captions.clear();
      }
      if (options.followNarration && begun) send({ type: "LINE_DONE", key });
    },
    tap(target, nowMs) {
      // Only a waiting beat takes a turn; a tap at any other moment (or while paused) is not even
      // remembered, so it cannot swallow the next real tap as a "double tap".
      if (!begun || disposed || finished !== null || director.snapshot().phase !== "waiting") return false;
      const routed = router.route(target, nowMs);
      if (routed === null) return false;
      return send({ type: "TAP", target: routed }).length > 0;
    },
    confirm(nowMs) {
      if (!begun || disposed || finished !== null || director.snapshot().phase !== "waiting") return false;
      if (!router.confirm(nowMs)) return false;
      return send({ type: "PARENT_CONFIRM" }).length > 0;
    },
    pause() {
      send({ type: "PAUSE" });
    },
    resume() {
      send({ type: "RESUME" });
    },
    skipBeat() {
      send({ type: "SKIP_BEAT" });
    },
    allDone() {
      send({ type: "ALL_DONE" });
    },
    audioUnavailable() {
      send({ type: "AUDIO_UNAVAILABLE" });
    },
    setReducedMotion(on) {
      director.setReducedMotion(on);
    },
    setWaitMs(waitMs) {
      director.setWaitMs(waitMs);
    },
    activeTargets: () => router.active() ?? [],
    speakingLine: () => speaking,
    spokenKeys: () => [...spoken],
    snapshot: () => director.snapshot(),
    started: () => begun,
    finishReason: () => finished,
    dispose() {
      if (disposed) return;
      send({ type: "DISPOSE" });
      disposed = true;
      speaking = null;
      router.reset();
    }
  };
}

// ---------------------------------------------------------------- the app

export type WonderScreen = "start" | "menu" | "story" | "offline";

/** Page-load switches the app reads (main.ts parses them with readQaParams and readFlags). */
export interface WonderQuery {
  /** `?story=<id or code>`: open this story right after start. */
  readonly story?: string;
  /** `?autostart=1`: no start screen; audio stays locked until a real tap. */
  readonly autostart: boolean;
  /** `?manual=1`: no live loop; only QA calls move story time. */
  readonly manual: boolean;
}

export interface WonderAppOptions {
  /** The overlay root (`#ui`). */
  readonly uiRoot: HTMLElement;
  /** The canvas host (`#stage`); null mounts the stage headless. */
  readonly stageHost: HTMLElement | null;
  readonly flags: WonderFlags;
  readonly query: WonderQuery;
  /** Parent settings for this session (loaded from the device by main.ts). */
  readonly settings: ParentSettings;
  /** Where settings are saved; null keeps them in memory only. */
  readonly storage: SettingsStorage | null;
}

/** Plain-JSON app state for QA hooks. No child data. */
export interface WonderState {
  readonly screen: WonderScreen;
  readonly storyId: string | null;
  readonly director: DirectorSnapshot | null;
  readonly targets: readonly string[];
  /** Key of the line being spoken, e.g. "e17.hook.1"; null between lines and while paused. */
  readonly speaking: string | null;
  /** Speaker of that line. */
  readonly speaker: string | null;
  /** Keys of every line started in the current (or last ended) story, in order. */
  readonly spoken: readonly string[];
  readonly audio: { readonly unlocked: boolean; readonly available: boolean };
  readonly settings: {
    readonly mode: string;
    readonly reducedMotion: boolean;
    readonly captions: boolean;
    readonly music: boolean;
    readonly sound: boolean;
  };
  readonly stage: { readonly drawCalls: number; readonly nodes: number; readonly modelsEnabled: boolean };
  readonly micRequested: false;
  readonly errors: readonly string[];
}

export interface RunToEndResult {
  readonly finished: boolean;
  readonly reason: FinishReason | null;
  /** Story time this call advanced (ms). */
  readonly elapsedMs: number;
}

export type WonderDiagnostics = Partial<StageDiagnostics> & { readonly drawCalls: number; readonly nodes: number; readonly renderPath?: string };

export interface WonderApp {
  /** Resolves once the stage drew its first warmed frame; rejects when it cannot mount. */
  whenReady(): Promise<void>;
  isReady(): boolean;
  state(): WonderState;
  /** Opens a story (slug or code such as "e17"), skipping the start screen and menu; resolves once it is playing. */
  startStory(id: string, mode?: PlayMode): Promise<void>;
  /** Moves story time in fixed 50 ms steps (director and stage), then draws once. */
  advance(ms: number): void;
  /** Steps with zero input until the story ends (or `maxMs`). Does nothing while paused. */
  runToEnd(maxMs?: number): RunToEndResult;
  /** A child tap on a target id. False when that target is not active. */
  tap(targetId: string): boolean;
  /** The parent's "they answered" confirm on a waiting beat. */
  parentConfirm(): boolean;
  pause(): void;
  /** The grown-up's Resume: lifts the pause, the hidden-tab pause and the lost-device pause. */
  resume(): void;
  /** Ends the story calmly with its offline card, from any screen and any beat. */
  allDone(): void;
  /** Manual next: ends the current beat. */
  skipBeat(): void;
  setReducedMotion(on: boolean): void;
  /** Active tap targets in viewport CSS px (for real pointer taps). */
  targetRects(): TargetRect[];
  /** Drawn bounds of the given scene nodes in viewport CSS px (QA region captures). */
  nodeRects(ids: readonly string[]): TargetRect[];
  /** Applies stage actions to the running story's stage at once (QA pose and turnaround sheets); not a story event. */
  stageApply(actions: readonly StageAction[]): void;
  /** Starts or stops a character's talking pulse without a line (QA). */
  setTalking(actor: string | null): void;
  diagnostics(): WonderDiagnostics;
  /** Leaves the start screen without unlocking audio (QA). */
  begin(): void;
  /** Ends any story without its card and shows the menu (or the start screen before it was passed). */
  reset(): void;
  /** The mounted Aura3D app (for captures), or null before the stage exists. */
  auraApp(): AuraApp | null;
  /** Records an error message for QA state. */
  reportError(error: unknown): void;
  dispose(): void;
}

interface ActiveStory {
  readonly story: StorySpec;
  readonly runner: StoryRunner;
  readonly captions: Captions;
  readonly controls: ChildControls;
}

const MENU_ITEMS: readonly MenuItem[] = STORIES.map((story) => ({
  id: story.id,
  code: storyCode(story),
  titleKey: story.titleKey,
  kind: story.kind,
  host: story.host,
  number: story.number,
  phase: story.phase
}));

/** A story by slug or by code (`e17`, `g03`). */
export function findStory(id: string): StorySpec | undefined {
  const key = id.trim();
  return storyById(key) ?? storyByCode(key.toLowerCase());
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}...` : text;
}

/** The parent's waiting time as a director override; the default keeps each beat's authored wait. */
/** Frames to wait for before the stage boot starts, and the backstop for a hidden tab that draws none. */
const FIRST_PAINT_FALLBACK_MS = 250;

/**
 * Resolves once the browser has drawn a frame (two animation frames), or after FIRST_PAINT_FALLBACK_MS when no
 * frame comes (a hidden tab). The stage boot waits for it: the boot holds the main thread for a while (model
 * decode, shader warm-up), and started at once it kept the start screen from being drawn, so the page stayed
 * blank for seconds on a fast machine and for minutes on a software renderer.
 */
function afterFirstPaint(win: Window | null): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    if (win && typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(() => win.requestAnimationFrame(finish));
    setTimeout(finish, FIRST_PAINT_FALLBACK_MS);
  });
}

function waitOverride(waitMs: number): number | undefined {
  return waitMs === WAIT_MS_DEFAULT ? undefined : clampWaitMs(waitMs);
}

/** Fixed steps for `ms` of story time (at least one for any positive time, at most RUN_TO_END_DEFAULT_MS worth). */
export function stepsFor(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(Math.ceil(RUN_TO_END_DEFAULT_MS / STEP_MS), Math.max(1, Math.round(ms / STEP_MS)));
}

export function createApp(options: WonderAppOptions): WonderApp {
  const { uiRoot, stageHost, flags, query, storage } = options;
  const doc = uiRoot.ownerDocument;
  const view = doc.defaultView;

  let settings: ParentSettings = { ...options.settings, wordList: [...options.settings.wordList] };
  /** `?reducedMotion=1` forces calm motion for this page load without changing the saved setting. */
  let forcedReducedMotion = flags.reducedMotion;
  const reducedMotionNow = (): boolean => settings.reducedMotion || forcedReducedMotion;
  let locale: Locale = createLocale(LOCALE_PACKS, settings.locale);
  const text = {
    line: (key: string): string => locale.line(key),
    str: (key: string): string => locale.str(key)
  };

  const errors: string[] = [];
  const recordError = (error: unknown): void => {
    errors.push(errorMessage(error));
    if (errors.length > MAX_ERRORS) errors.shift();
  };

  applyDisplaySettings(doc, { ...settings, reducedMotion: reducedMotionNow() });

  // ---- audio: one mixer (the one AudioContext), one narration player on story time
  const mixer = createAudioMixer({ manifest: AUDIO_MANIFEST, musicEnabled: settings.music, soundEnabled: settings.sound });
  mixer.setSfxVolume(settings.sfxVolume);
  /** True when sound cannot play at all this session (no Web Audio, `?audio=0`, or the start tap could not unlock it). */
  let audioFailed = !flags.audio || mixer.manager === null;
  const clock = createStoryClock();
  const recordedLine = (key: string): AudioClipRef | undefined => (locale.locale === "en" ? AUDIO_MANIFEST.lines[key] : undefined);
  const lineLength = (key: string): number => spokenLineMs(locale.line(key), recordedLine(key));

  let active: ActiveStory | null = null;
  let lineOrder: readonly string[] = [];

  const preloadAfter = (key: string): void => {
    if (!flags.audio || !mixer.isUnlocked()) return;
    const index = lineOrder.indexOf(key);
    for (let i = index + 1; i <= index + PRELOAD_LINES_AHEAD && i > 0 && i < lineOrder.length; i += 1) {
      const next = lineOrder[i];
      if (next !== undefined) void mixer.preload(recordedLine(next));
    }
  };

  const narration = createNarrationPlayer({
    mixer,
    clip: (key) => (flags.audio ? recordedLine(key) : undefined),
    onStart: (line) => {
      const current = active;
      if (!current) return;
      current.runner.lineStarted(line);
      current.controls.setReplayAvailable(true);
      preloadAfter(line.key);
    },
    onEnd: (key) => {
      active?.runner.lineEnded(key);
    },
    estimateMs: lineLength,
    now: () => clock.now(),
    schedule: (fn, ms) => clock.schedule(fn, ms)
  });
  narration.setMuted(!settings.sound);

  // ---- screens
  let screen: WonderScreen = "start";
  let started = false;
  let disposed = false;
  let removeStart: (() => void) | null = null;
  let removeMenu: (() => void) | null = null;
  let removeOffline: (() => void) | null = null;
  let removeLoading: (() => void) | null = null;
  let gateAbort: AbortController | null = null;
  let closePanel: (() => void) | null = null;
  let disarmGesture: (() => void) | null = null;

  // ---- story state
  let pending: StorySpec | null = null;
  let storyToken = 0;
  const pauseReasons = createPauseSet();
  /** The story whose offline card is showing, with its final director snapshot. */
  let ended: { readonly storyId: string; readonly snapshot: DirectorSnapshot; readonly spoken: readonly string[] } | null = null;
  let initialStory: StorySpec | null = null;
  if (query.story !== undefined && query.story.length > 0) {
    const found = findStory(query.story);
    if (found) initialStory = found;
    else recordError("unknown story id in ?story");
  }

  // ---- stage, loop and presenter
  let stage: WonderStage | null = null;
  let stageBootError: unknown = undefined;
  /** The stage could not start at all (the menu then says so). */
  let stageFailed = false;
  let ready = false;
  let unbindTaps: (() => void) | null = null;
  const unsubscribers: Array<() => void> = [];

  const presenter = createFixedStepPresenter<{ readonly t: number }>({
    snapshot: () => ({ t: clock.now() }),
    blend: (a, b, u) => ({ t: a.t + (b.t - a.t) * u })
  });
  let stageShownMs = clock.now();

  /** The running story, or null when there is none, it ended or something pauses it. */
  const runningStory = (): ActiveStory | null => {
    const current = active;
    if (!current || pauseReasons.paused() || !current.runner.started() || current.runner.finishReason() !== null) return null;
    return current;
  };

  /** One fixed step: director, then the story clock (narration timers); the stage too when `withStage`. */
  const stepStory = (withStage: boolean): void => {
    const current = runningStory();
    if (!current) return;
    current.runner.tick(STEP_MS);
    clock.advance(STEP_MS);
    if (withStage && active === current) stage?.update(STEP_MS / 1000);
  };

  /** Restarts presentation at the current story time (story start, QA steps). */
  const syncPresenter = (): void => {
    presenter.reset();
    stageShownMs = clock.now();
  };

  const updateStage = (ms: number): void => {
    const target = stage;
    if (!target) return;
    let left = ms;
    while (left > 1e-6) {
      const part = Math.min(left, STAGE_UPDATE_MAX_MS);
      target.update(part / 1000);
      left -= part;
    }
  };

  const loop = createFixedStepLoop({
    stepSeconds: STEP_MS / 1000,
    manual: query.manual,
    step: () => {
      stepStory(false);
      presenter.afterStep();
    },
    render: () => {
      if (!runningStory()) return;
      const shown = presenter.present(loop, true).t;
      const dt = shown - stageShownMs;
      if (dt <= 0) return;
      stageShownMs = shown;
      updateStage(dt);
    }
  });

  /** Draws the current state once (after QA steps); never while a story's world is still being swapped in. */
  const presentNow = (): void => {
    const target = stage;
    if (!target || !active) return;
    try {
      target.game().app.step(0);
    } catch (error) {
      recordError(error);
    }
  };

  // ---- pause bookkeeping (story-scoped)
  const storyExists = (): boolean => active !== null || pending !== null;

  const addPause = (reason: PauseReason): void => {
    if (disposed || !storyExists()) return;
    if (pauseReasons.add(reason)) active?.runner.pause();
    active?.controls.setPaused(true);
  };

  const releasePause = (reasons: readonly PauseReason[]): void => {
    if (!storyExists()) {
      pauseReasons.clear();
      return;
    }
    if (!pauseReasons.release(reasons)) return;
    active?.runner.resume();
    active?.controls.setPaused(false);
  };

  /** Back from a hidden tab or a lost GPU: stay paused until a grown-up taps Resume (never auto-resume speech). */
  const holdForGrownUp = (reason: "hidden" | "device"): void => {
    if (!pauseReasons.holdForGrownUp(reason)) return;
    active?.controls.setPaused(true);
  };

  const resumeByGrownUp = (): void => releasePause(["user", "hidden", "device"]);

  // ---- audio unlock
  const markAudioUnavailable = (): void => {
    if (disposed) return;
    audioFailed = true;
    active?.captions.setAudioUnavailable(true);
    active?.runner.audioUnavailable();
  };

  /** The start button's handler calls this synchronously inside the tap (the one place audio unlocks). */
  const unlockFromStartTap = (): void => {
    if (!flags.audio || mixer.manager === null) {
      markAudioUnavailable();
      return;
    }
    void mixer.unlock().then((ok) => {
      if (disposed) return;
      if (ok) disarmGesture?.();
      else markAudioUnavailable();
    });
  };

  /** No start screen (`?autostart=1`, QA begin/startStory): the first real tap or key press unlocks audio. */
  const armGestureUnlock = (): void => {
    if (disarmGesture || !view || !flags.audio || mixer.manager === null || mixer.isUnlocked()) return;
    const types = ["pointerup", "touchend", "click", "keydown"] as const;
    const onGesture = (): void => {
      if (disposed || mixer.isUnlocked()) {
        disarm();
        return;
      }
      void mixer.unlock().then((ok) => {
        if (ok) disarm();
      });
    };
    const disarm = (): void => {
      for (const type of types) view.removeEventListener(type, onGesture, true);
      if (disarmGesture === disarm) disarmGesture = null;
    };
    for (const type of types) view.addEventListener(type, onGesture, true);
    disarmGesture = disarm;
  };

  // ---- settings
  const applySettings = (next: ParentSettings): void => {
    if (disposed) return;
    const previous = settings;
    settings = { ...next, wordList: [...next.wordList] };
    saveSettings(storage, settings);
    if (previous.music !== settings.music) mixer.setMusicEnabled(settings.music);
    if (previous.sfxVolume !== settings.sfxVolume) mixer.setSfxVolume(settings.sfxVolume);
    if (previous.sound !== settings.sound) {
      mixer.setSoundEnabled(settings.sound);
      narration.setMuted(!settings.sound);
    }
    if (previous.locale !== settings.locale) locale = createLocale(LOCALE_PACKS, settings.locale);
    const reduced = reducedMotionNow();
    applyDisplaySettings(doc, { ...settings, reducedMotion: reduced });
    stage?.setReducedMotion(reduced);
    const current = active;
    if (current) {
      current.captions.setEnabled(settings.captions);
      current.runner.setReducedMotion(reduced);
      current.runner.setWaitMs(waitOverride(settings.waitMs));
    }
  };

  // ---- screens
  const dropLoading = (): void => {
    const remove = removeLoading;
    removeLoading = null;
    remove?.();
  };

  const closeScreens = (): void => {
    const start = removeStart;
    const menu = removeMenu;
    const offline = removeOffline;
    removeStart = null;
    removeMenu = null;
    removeOffline = null;
    start?.();
    menu?.();
    offline?.();
    if (screen === "offline") ended = null;
  };

  const closeParentUi = (): void => {
    const abort = gateAbort;
    const panel = closePanel;
    gateAbort = null;
    closePanel = null;
    abort?.abort();
    panel?.();
  };

  /** Ends the current or loading story without a card: stops every sound and removes the story UI. */
  const endStory = (): void => {
    storyToken += 1;
    pending = null;
    dropLoading();
    closeParentUi();
    const current = active;
    active = null;
    lineOrder = [];
    pauseReasons.clear();
    if (current) {
      current.runner.dispose();
      current.controls.dispose();
      current.captions.dispose();
    }
    narration.stop();
    narration.resume();
    mixer.stopAll();
    mixer.resumeAll();
    stage?.setTargets(null);
    stage?.setTalking(null);
    syncPresenter();
  };

  const showMenu = (): void => {
    if (disposed) return;
    closeScreens();
    started = true;
    screen = "menu";
    removeMenu = showEpisodeMenu(
      uiRoot,
      locale,
      MENU_ITEMS,
      (id) => {
        const story = findStory(id);
        if (story) void openStory(story, settings.mode);
      },
      // After the stage failed to start, say so on the menu instead of bouncing back silently.
      { onParent: () => void openParentFlow(), stageUnavailable: stageFailed }
    );
  };

  const showOffline = (story: StorySpec, key: string): void => {
    if (disposed) return;
    const snapshot = active?.story === story ? active.runner.snapshot() : null;
    const spoken = active?.story === story ? active.runner.spokenKeys() : [];
    endStory();
    closeScreens();
    screen = "offline";
    ended = snapshot ? { storyId: story.id, snapshot, spoken } : null;
    removeOffline = showOfflineCard(
      uiRoot,
      locale,
      locale.str(key),
      () => {
        removeOffline = null;
        ended = null;
        showMenu();
      },
      // The story's caregiver bridge (PRD 01 section 4.3) as a small grown-up note under the activity.
      { note: locale.str(story.caregiverBridgeKey, "") }
    );
  };

  const proceedFromStart = (mode: PlayMode): void => {
    started = true;
    const story = initialStory;
    initialStory = null;
    if (story) void openStory(story, mode);
    else showMenu();
  };

  const showStart = (): void => {
    if (disposed) return;
    closeScreens();
    screen = "start";
    removeStart = showStartScreen(
      uiRoot,
      locale,
      (mode) => {
        removeStart = null;
        unlockFromStartTap();
        if (mode !== settings.mode) applySettings({ ...settings, mode });
        proceedFromStart(mode);
      },
      { initialMode: settings.mode }
    );
  };

  const exitToMenu = (): void => {
    endStory();
    showMenu();
  };

  async function openParentFlow(): Promise<void> {
    if (disposed || gateAbort || closePanel) return;
    addPause("parent");
    const abort = new AbortController();
    gateAbort = abort;
    const ok = await requireParent(uiRoot, locale, { signal: abort.signal });
    if (gateAbort === abort) gateAbort = null;
    if (disposed) return;
    if (!ok || abort.signal.aborted) {
      releasePause(["parent"]);
      return;
    }
    closePanel = openParentPanel(
      uiRoot,
      locale,
      settings,
      (next) => applySettings(next),
      () => {
        closePanel = null;
        exitToMenu();
      },
      {
        storage,
        onClose: () => {
          closePanel = null;
          releasePause(["parent"]);
        }
      }
    );
  }

  const allDone = (): void => {
    if (disposed) return;
    const current = active;
    if (current) {
      // The director stops every sound and asks for the offline card.
      current.runner.allDone();
      return;
    }
    const loading = pending;
    if (loading) showOffline(loading, loading.offlinePlayKey);
  };

  const preloadStoryMedia = (story: StorySpec): void => {
    if (!flags.audio || !mixer.isUnlocked()) return;
    const music = storyMusic(story);
    for (const song of music.songs) void mixer.preload(AUDIO_MANIFEST.songs[song]);
    for (const bed of music.beds) void mixer.preload(AUDIO_MANIFEST.beds[bed]);
    for (const key of lineOrder.slice(0, PRELOAD_LINES_AHEAD)) void mixer.preload(recordedLine(key));
  };

  const nextInCatalog = (story: StorySpec): StorySpec | undefined => {
    const index = STORIES.indexOf(story);
    return STORIES[(index + 1) % STORIES.length];
  };

  /** Loads a story's world and starts its director. Resolves "started", "cancelled" (a newer request won) or "failed". */
  async function openStory(story: StorySpec, mode: PlayMode): Promise<"started" | "cancelled" | "failed"> {
    if (disposed) return "cancelled";
    endStory();
    closeScreens();
    started = true;
    const token = storyToken;
    pending = story;
    screen = "story";
    removeLoading = showLoading(uiRoot, locale);
    let target: WonderStage;
    try {
      target = await stageReady;
      if (token !== storyToken || disposed) return "cancelled";
      await target.load(story);
    } catch (error) {
      if (token !== storyToken || disposed) return "cancelled";
      // A stage that could not mount is recorded once, at boot.
      if (error !== stageBootError) recordError(error);
      pending = null;
      dropLoading();
      showMenu();
      return "failed";
    }
    if (token !== storyToken || disposed) return "cancelled";
    dropLoading();
    pending = null;

    const captions = mountCaptions(uiRoot, locale);
    captions.setEnabled(settings.captions);
    captions.setAudioUnavailable(audioFailed);
    const controls = mountChildControls(uiRoot, locale, {
      onPause: () => addPause("user"),
      onResume: () => resumeByGrownUp(),
      onReplayWord: () => {
        narration.replay();
      },
      onAllDone: () => allDone(),
      onParent: () => void openParentFlow(),
      onConfirmTurn: () => {
        active?.runner.confirm(clock.now());
      }
    });
    controls.setReplayAvailable(false);
    const override = waitOverride(settings.waitMs);
    const runner = createStoryRunner({
      story,
      mode,
      sinks: {
        stage: target,
        audio: mixer,
        narration,
        captions,
        text,
        onMediaPaused: (paused) => controls.setPaused(paused),
        onTurn: (waiting) => controls.setTurnWaiting(waiting),
        onOffline: (key) => showOffline(story, key)
      },
      lineMs: (key) => lineLength(key) + (query.manual ? 0 : LINE_GRACE_MS),
      followNarration: !query.manual,
      reducedMotion: reducedMotionNow(),
      debounceMs: TAP_DEBOUNCE_MS,
      ...(override !== undefined ? { waitMs: override } : {})
    });
    active = { story, runner, captions, controls };
    lineOrder = storyLineKeys(story);
    preloadStoryMedia(story);
    syncPresenter();
    runner.start();
    // Draw the opening beat's state at once (camera, entrances), also when only QA calls move time.
    target.update(0);
    if (active?.runner === runner) {
      if (audioFailed) runner.audioUnavailable();
      if (pauseReasons.paused()) {
        runner.pause();
        controls.setPaused(true);
      }
    }
    const next = nextInCatalog(story);
    if (next && next !== story) target.prefetch(next);
    return "started";
  }

  // ---- stage boot (createStage awaits the first mount and warmPrograms before showing a frame). It starts after
  // the first screen has been drawn (afterFirstPaint), so the start screen shows while the stage boots.
  const stageReady: Promise<WonderStage> = afterFirstPaint(doc.defaultView).then(() => {
    if (disposed) throw new Error("app disposed before the stage boot started");
    return createStage({
      target: stageHost,
      reducedMotion: reducedMotionNow(),
      models: flags.models,
      ...(flags.modelWaitMs !== null ? { modelTimeoutMs: flags.modelWaitMs } : {}),
      ...(flags.audio ? { sound: mixer.gameSoundOptions() } : {}),
      // A song line's cues are applied by the stage; their sounds are the mixer's (07 B20).
      onSongCue: (cue) => {
        if (disposed || !runningStory()) return;
        for (const action of cue.actions) {
          if (action.do === "sfx") mixer.playSfx(action.sound);
          else if (action.do === "music") mixer.setBed(action.bed);
        }
      }
    });
  }).then((created) => {
    if (disposed) {
      created.dispose();
      throw new Error("app disposed before the stage mounted");
    }
    stage = created;
    const mounted = created.game().app;
    // Child taps: pointer events on the canvas, hit-tested by the stage's raycast pick.
    const surface = mounted.canvas ?? stageHost;
    if (surface) {
      unbindTaps = bindCanvasTaps(
        surface,
        (x, y) => created.pick(x, y),
        (id) => {
          active?.runner.tap(id, clock.now());
        },
        () => clock.now(),
        { debounceMs: CANVAS_TAP_DEBOUNCE_MS }
      );
    }
    // A lost GPU context pauses the story like a hidden tab (03 section 3 CONTEXT_LOST); a grown-up resumes it.
    unsubscribers.push(mounted.onDeviceLost(() => addPause("device")));
    unsubscribers.push(mounted.onDeviceRestored(() => holdForGrownUp("device")));
    ready = true;
    return created;
  });
  stageReady.catch((error: unknown) => {
    stageBootError = error;
    stageFailed = true;
    if (disposed) return;
    recordError(error);
    // The menu is up (nothing loading, no grown-up dialog open): show it again with the calm notice.
    if (screen === "menu" && pending === null && active === null && !gateAbort && !closePanel) showMenu();
  });

  const sessionGate = createSessionGate(doc, {
    onHide: () => addPause("hidden"),
    onShow: () => holdForGrownUp("hidden")
  });

  if (!query.manual) loop.start();

  // ---- first screen
  if (query.autostart) {
    armGestureUnlock();
    proceedFromStart(settings.mode);
  } else {
    showStart();
  }

  // ---- public API
  const stageDiagnostics = (): WonderDiagnostics => {
    const target = stage;
    if (!target) return { drawCalls: 0, nodes: 0 };
    try {
      return target.diagnostics();
    } catch (error) {
      recordError(error);
      return { drawCalls: 0, nodes: 0 };
    }
  };

  const app: WonderApp = {
    whenReady: () => stageReady.then(() => undefined),
    isReady: () => ready && !disposed,
    state() {
      const current = active;
      const snapshot = current ? current.runner.snapshot() : null;
      // A held line is not being spoken: while paused nothing is audible.
      const line = current && snapshot?.phase !== "paused" ? current.runner.speakingLine() : null;
      const diagnostics = stageDiagnostics();
      return {
        screen,
        storyId: current?.story.id ?? pending?.id ?? ended?.storyId ?? null,
        director: snapshot ?? ended?.snapshot ?? null,
        targets: current ? [...current.runner.activeTargets()] : [],
        speaking: line?.key ?? null,
        speaker: line?.speaker ?? null,
        spoken: current ? current.runner.spokenKeys() : (ended?.spoken ?? []),
        audio: { unlocked: mixer.isUnlocked(), available: !audioFailed },
        settings: {
          mode: settings.mode,
          reducedMotion: reducedMotionNow(),
          captions: settings.captions,
          music: settings.music,
          sound: settings.sound
        },
        stage: { drawCalls: diagnostics.drawCalls, nodes: diagnostics.nodes, modelsEnabled: flags.models },
        micRequested: false,
        errors: [...errors]
      };
    },
    async startStory(id, mode) {
      const story = findStory(id);
      if (!story) throw new Error(`unknown story "${id.slice(0, 40)}"`);
      if (screen === "start") armGestureUnlock();
      const result = await openStory(story, mode ?? settings.mode);
      if (result === "failed") throw new Error(`story "${story.id}" failed to load`);
      if (result === "cancelled") throw new Error(`story "${story.id}" was replaced before it started`);
    },
    advance(ms) {
      const steps = stepsFor(ms);
      for (let i = 0; i < steps; i += 1) stepStory(true);
      syncPresenter();
      presentNow();
    },
    runToEnd(maxMs) {
      const current = active;
      if (!current) return { finished: false, reason: null, elapsedMs: 0 };
      const limit = maxMs !== undefined && Number.isFinite(maxMs) && maxMs > 0 ? maxMs : RUN_TO_END_DEFAULT_MS;
      let elapsed = 0;
      while (active === current && runningStory() === current && elapsed < limit) {
        stepStory(true);
        elapsed += STEP_MS;
      }
      syncPresenter();
      presentNow();
      const reason = current.runner.finishReason();
      return { finished: reason !== null, reason, elapsedMs: elapsed };
    },
    tap: (targetId) => active?.runner.tap(targetId, clock.now()) ?? false,
    parentConfirm: () => active?.runner.confirm(clock.now()) ?? false,
    pause: () => addPause("user"),
    resume: () => resumeByGrownUp(),
    allDone,
    skipBeat() {
      active?.runner.skipBeat();
    },
    setReducedMotion(on) {
      forcedReducedMotion = false;
      applySettings({ ...settings, reducedMotion: on });
    },
    targetRects() {
      const target = stage;
      if (!target) return [];
      const rects = target.targetRects();
      const canvas = target.game().app.canvas;
      const box = canvas ? canvas.getBoundingClientRect() : null;
      const left = box ? box.left : 0;
      const top = box ? box.top : 0;
      return rects.map((rect) => ({ id: rect.id, x: rect.x + left, y: rect.y + top, w: rect.w, h: rect.h }));
    },
    nodeRects(ids) {
      const target = stage;
      if (!target) return [];
      const canvas = target.game().app.canvas;
      const box = canvas ? canvas.getBoundingClientRect() : null;
      const left = box ? box.left : 0;
      const top = box ? box.top : 0;
      return target.nodeRects(ids).map((rect) => ({ id: rect.id, x: rect.x + left, y: rect.y + top, w: rect.w, h: rect.h }));
    },
    stageApply(actions) {
      if (disposed || !active) return;
      stage?.apply(actions);
    },
    setTalking(actor) {
      if (disposed || !active) return;
      stage?.setTalking(actor);
    },
    diagnostics: stageDiagnostics,
    begin() {
      if (screen !== "start" || disposed) return;
      armGestureUnlock();
      proceedFromStart(settings.mode);
    },
    reset() {
      if (disposed) return;
      endStory();
      closeScreens();
      if (started) showMenu();
      else showStart();
    },
    auraApp: () => (stage ? stage.game().app : null),
    reportError: recordError,
    dispose() {
      if (disposed) return;
      endStory();
      closeScreens();
      disposed = true;
      loop.stop();
      sessionGate.dispose();
      disarmGesture?.();
      unbindTaps?.();
      unbindTaps = null;
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
      stage?.dispose();
      stage = null;
      ready = false;
      narration.dispose();
      mixer.dispose();
    }
  };
  return app;
}
