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
import { SFX } from "./content/sfx.js";
import { SHOWS, showById } from "./content/shows/index.js";
import { SLEEP_SONG_IDS, SONGS, SONG_IDS, songCueTimesMs, songLengthSec } from "./content/songs.js";
import { createAudioMixer, type AudioMixer } from "./runtime/audio-mixer.js";
import { storyBeats, type LineMs } from "./runtime/beat-runner.js";
import { createEpisodeDirector } from "./runtime/episode-director.js";
import type { WonderFlags } from "./runtime/feature-flags.js";
import { createLocale, type Locale } from "./runtime/locale.js";
import {
  createNarrationPlayer,
  sampleSpeechEnvelope,
  sampleVisemeTrack,
  type NarrationPlayer
} from "./runtime/narration-player.js";
import { createPauseSet, type PauseReason } from "./runtime/pause-reasons.js";
import { createSessionGate } from "./runtime/session-gate.js";
import { bindCanvasTaps, createTouchRouter, type TouchRouter } from "./runtime/touch-router.js";
import { WORLD_LOOKS, detectMobileThermalProfile } from "./scenes/looks.js";
import { createStage, type StageDiagnostics, type StageSpatialNodeState, type TargetRect, type WonderStage } from "./scenes/stage.js";
import type {
  AudioClipRef,
  AudioEventLogEntry,
  DirectorEffect,
  DirectorEvent,
  DirectorSnapshot,
  EpisodeSpec,
  LineRef,
  MusicBedId,
  ParentSettings,
  PlayMode,
  ShowAspect,
  ShowSegmentSpec,
  ShowSpec,
  SongId,
  SpeakerId,
  StageAction,
  StageAdapter,
  StorySpec,
  WorldId
} from "./types.js";
import { applyDisplaySettings, uiText } from "./ui/accessibility.js";
import { mountCaptions, type Captions } from "./ui/captions.js";
import { mountChildControls, type ChildControls } from "./ui/child-controls.js";
import { SONG_WORLDS, menuSection, showEpisodeMenu, type MenuItem } from "./ui/episode-menu.js";
import { bindViewportCssVars, dismissIosFullscreenTip, enterLandscapeFullMode, syncThemeColor } from "./ui/fullscreen.js";
import { showOfflineCard } from "./ui/offline-card.js";
import { requireParent } from "./ui/parent-gate.js";
import { openParentPanel } from "./ui/parent-panel.js";
import { wordLabel } from "./ui/parent-wordlist.js";
import { WAIT_MS_DEFAULT, WAIT_MS_MIN, clampWaitMs, sanitizeSettings, saveSettings, type SettingsStorage } from "./ui/settings-store.js";
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

/** Every line key of a story in play order (including target-specific responses and round variants), used to fetch upcoming clips early. */
export function storyLineKeys(story: StorySpec): readonly string[] {
  const beats = storyBeats(story);
  const keys: string[] = [];
  const push = (key: string): void => {
    if (!keys.includes(key)) keys.push(key);
  };
  for (const beat of beats) {
    for (const line of beat.lines) push(line.key);
    for (const line of beat.response?.lines ?? []) push(line.key);
    for (const resp of Object.values(beat.responseByTarget ?? {})) {
      for (const line of resp?.lines ?? []) push(line.key);
    }
  }
  return keys;
}

/** The songs and music beds a story's stage actions can start. */
export function storyMusic(story: StorySpec): { readonly songs: readonly SongId[]; readonly beds: readonly MusicBedId[] } {
  const beats = storyBeats(story);
  const songs: SongId[] = [];
  const beds: MusicBedId[] = [];
  const scan = (actions: readonly StageAction[] | undefined): void => {
    for (const action of actions ?? []) {
      if (action.do === "sfx") continue;
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
    for (const resp of Object.values(beat.responseByTarget ?? {})) {
      scan(resp?.stage);
    }
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
  /** Broadcast PAUSE beat started (`active: true`) or ended (`active: false`). */
  readonly onBroadcastPause?: (effect: Extract<DirectorEffect, { readonly type: "broadcastPause" }>) => void;
  /** Optional observer for individual stage actions (deterministic eventLog). */
  readonly onStageAction?: (action: StageAction) => void;
  /** Optional observer when speech begins for a line. */
  readonly onSpeak?: (line: LineRef) => void;
  /** Optional observer when speech stops abruptly. */
  readonly onStopSpeech?: () => void;
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
        sinks.onStageAction?.(action);
        if (action.do === "sfx") sinks.audio.playSfx(action.sound);
        else if (action.do === "song") sinks.audio.playSong(action.song);
        else if (action.do === "music") sinks.audio.setBed(action.bed);
      }
      return;
    }
    case "speak":
      sinks.onSpeak?.(effect.line);
      sinks.narration.play(effect.line);
      return;
    case "stopSpeech":
      sinks.onStopSpeech?.();
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
    case "broadcastPause":
      sinks.onBroadcastPause?.(effect);
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
  /** Default broadcast PAUSE duration in ms when `beat.pauseMs` is omitted (`show.pauseMs`). */
  readonly pauseMsOverride?: number;
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
    ...(options.waitMs !== undefined ? { waitMs: options.waitMs } : {}),
    ...(options.pauseMsOverride !== undefined ? { pauseMsOverride: options.pauseMsOverride } : {})
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

export type WonderScreen = "start" | "menu" | "story" | "offline" | "idle" | "playing";

/** Page-load switches the app reads (main.ts parses them with readQaParams and readFlags). */
export interface WonderQuery {
  /** `?story=<id or code>`: open this story right after start. */
  readonly story?: string;
  /** `?show=<id or code>`: open this multi-segment broadcast show right after start. */
  readonly show?: string;
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
  /** Optional welcome-name override (`null` in broadcast mode). */
  readonly welcomeName?: string | null;
  /** Optional injected stage adapter (test seam for deterministic headless tests). */
  readonly stage?: StageAdapter;
  /** Optional extra `ShowSpec` entries searched alongside `SHOWS` (test seam). */
  readonly shows?: readonly ShowSpec[];
  /** Optional extra `StorySpec` entries searched alongside `STORIES` (test seam). */
  readonly stories?: readonly StorySpec[];
  /** Optional per-line audio clip overrides searched alongside `AUDIO_MANIFEST.lines` (test seam). */
  readonly audioClips?: Readonly<Record<string, AudioClipRef>>;
}

/** Plain-JSON app state for QA hooks. No child data. */
export interface WonderState {
  readonly screen: WonderScreen;
  readonly storyId: string | null;
  readonly segmentId: string | null;
  readonly segmentIndex: number;
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
  readonly stage: { readonly drawCalls: number; readonly nodes: number; readonly proceduralNodes: number };
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
  /** Opens a story (slug or code such as "e17", or falls back to a `ShowSpec`), skipping the start screen and menu; resolves once it is playing. */
  startStory(id: string, mode?: PlayMode): Promise<void>;
  /** Opens a multi-segment `ShowSpec` by id, code, or spec (PRD 09 B3.3). */
  startShow(id: string | ShowSpec): Promise<void>;
  /** True when `id` matches a registered `ShowSpec` id or code. */
  hasShow?(id: string): boolean;
  /** Resolves once any pending stage load or `swapSegment` chain has finished mounting and warming. */
  flushStage?(): Promise<void>;
  /** Opens a standalone song stage scene; resolves once it is playing. */
  startSong?(id: SongId): Promise<void>;
  /** Opens the continuous 11-song hushed Lullaby Jukebox; resolves once the first lullaby is playing. */
  startLullabyJukebox?(): Promise<void>;
  /** Updates parent settings in memory and storage (QA / bedtime timer control). */
  updateSettings?(partial: Partial<ParentSettings>): void;
  /** Moves story time in fixed 50 ms steps (director and stage), then draws once. */
  advance(ms: number): void;
  /** Advances fixed 50 ms simulation ticks up to `floor(tMs/50)*50` plus exact fractional stage presentation (PRD 09 B3.4). */
  advanceTo(tMs: number, options?: { readonly render?: boolean }): void;
  /** Deterministic audio/speech/pause event log stamped with `storyTimeMs` (PRD 09 B3.5). */
  eventLog(): readonly AudioEventLogEntry[];
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
  /** World-space bounds, yaw, door/gate open progress, and carry state for spatial physics checks. */
  spatialState?(): readonly StageSpatialNodeState[];
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

type StoryUiCaptions = Pick<
  Captions,
  "show" | "clear" | "setTip" | "setEnabled" | "setAudioUnavailable" | "setHighlightWords" | "dispose"
>;

type StoryUiControls = Pick<
  ChildControls,
  | "setPaused"
  | "setReplayAvailable"
  | "setTurnWaiting"
  | "setAutoPlay"
  | "setWindDown"
  | "setSleepTimerLabel"
  | "setWaitProgress"
  | "dispose"
>;

type AppStage = StageAdapter & {
  readonly ready?: WonderStage["ready"];
  readonly diagnostics?: WonderStage["diagnostics"];
  readonly prefetch?: WonderStage["prefetch"];
  readonly game?: WonderStage["game"];
  readonly targetRects?: WonderStage["targetRects"];
  readonly nodeRects?: WonderStage["nodeRects"];
  readonly spatialState?: WonderStage["spatialState"];
};

const NOOP_CAPTIONS: StoryUiCaptions = {
  show: () => undefined,
  clear: () => undefined,
  setTip: () => undefined,
  setEnabled: () => undefined,
  setAudioUnavailable: () => undefined,
  setHighlightWords: () => undefined,
  dispose: () => undefined
};

const NOOP_CONTROLS: StoryUiControls = {
  setPaused: () => undefined,
  setReplayAvailable: () => undefined,
  setTurnWaiting: () => undefined,
  setAutoPlay: () => undefined,
  setWindDown: () => undefined,
  setSleepTimerLabel: () => undefined,
  setWaitProgress: () => undefined,
  dispose: () => undefined
};

interface ActiveStory {
  readonly story: StorySpec;
  readonly runner: StoryRunner;
  readonly captions: StoryUiCaptions;
  readonly controls: StoryUiControls;
}

interface ActiveShow {
  readonly show: ShowSpec;
  readonly mode: PlayMode;
  readonly target: AppStage;
  readonly captions: StoryUiCaptions;
  readonly controls: StoryUiControls;
  segmentIndex: number;
  segmentId: string;
  segmentOffsetMs: number;
  readonly spoken: string[];
  readonly segmentAppliedActions: StageAction[];
  finalizePendingSegment: (() => void) | null;
}

interface ActiveSong {
  readonly songId: SongId;
  readonly queue: readonly SongId[];
  readonly index: number;
  readonly captions: StoryUiCaptions;
  readonly controls: StoryUiControls;
  readonly durationMs: number;
  readonly cues: readonly number[];
  elapsedMs: number;
  shownLyricIndex: number;
}

/** Default turn-waiting override in evening Wind-down mode when the parent kept the 5 s default. */
export const WIND_DOWN_WAIT_MS = 6000;

/** Curated descending-arousal bedtime progression: calm routines/games -> bedtime stories -> lullaby jukebox -> quiet sleep card. */
export const WIND_DOWN_STORY_CODES = ["g13", "g15", "e19", "e22", "e21", "e23", "e24", "e25", "e26"] as const;

const MENU_ITEMS: readonly MenuItem[] = STORIES.map((story) => ({
  id: story.id,
  code: storyCode(story),
  titleKey: story.titleKey,
  kind: story.kind,
  host: story.host,
  number: story.number,
  phase: story.phase,
  world: story.world,
  ...(story.sleepCategory !== undefined ? { sleepCategory: story.sleepCategory } : {}),
  targetWords: story.targetWords,
  ...(story.kind === "episode" ? { durationSec: story.estimatedDurationSec } : { rounds: story.roundLimit })
}));

/** Continuous Auto-play order: matches the Story Menu order (P1 episodes, P2 episodes, then G01-G16 games). */
const ORDERED_STORIES: readonly StorySpec[] = [
  ...menuSection(MENU_ITEMS, "episode"),
  ...menuSection(MENU_ITEMS, "activity")
].flatMap((item) => {
  const found = storyById(item.id);
  return found ? [found] : [];
});

/** Curated descending-arousal playlist for evening Wind-down mode. */
const WIND_DOWN_PLAYLIST: readonly StorySpec[] = WIND_DOWN_STORY_CODES.flatMap((code) => {
  const found = storyByCode(code);
  return found ? [found] : [];
});

/** Story vocabulary words to highlight softly in caregiver captions. */
function storyHighlightWords(story: StorySpec, settings: ParentSettings): readonly string[] {
  const focusSet = new Set(settings.wordList);
  const words = [...story.targetWords];
  for (const word of story.supportWords) {
    if (focusSet.has(word) && !words.includes(word)) words.push(word);
  }
  return words;
}

/** A story by slug or by code (`e17`, `g03`). */
export function findStory(id: string, extraStories?: readonly StorySpec[]): StorySpec | undefined {
  const key = id.trim();
  const lower = key.toLowerCase();
  if (extraStories) {
    const custom = extraStories.find((s) => s.id === key || storyCode(s).toLowerCase() === lower);
    if (custom) return custom;
  }
  return storyById(key) ?? storyByCode(lower);
}

/** A multi-segment broadcast show by slug or by code (`ep01`, `sh01`). */
export function findShow(id: string, extraShows?: readonly ShowSpec[]): ShowSpec | undefined {
  const key = id.trim();
  const lower = key.toLowerCase();
  if (extraShows) {
    const custom = extraShows.find((s) => s.id === key || s.code.toLowerCase() === lower);
    if (custom) return custom;
  }
  return showById(key) ?? SHOWS.find((s) => s.code.toLowerCase() === lower);
}

/** Builds a synthetic single-segment `EpisodeSpec` from a `ShowSegmentSpec` (PRD 09 B3.3). */
export function segmentToEpisodeSpec(show: ShowSpec, seg: ShowSegmentSpec): EpisodeSpec {
  return {
    kind: "episode",
    id: `${show.id}__${seg.id}`,
    version: show.version,
    phase: "P1",
    ...(show.sleepCategory !== undefined ? { sleepCategory: show.sleepCategory } : {}),
    titleKey: seg.titleKey ?? show.titleKey,
    world: seg.world,
    cast: seg.cast,
    props: seg.props,
    beats: seg.beats,
    host: show.host,
    targetWords: show.targetWords,
    supportWords: show.supportWords,
    ...(seg.music !== undefined && seg.music !== null ? { music: seg.music } : {}),
    offlinePlayKey: show.offlinePlayKey,
    caregiverBridgeKey: show.caregiverBridgeKey,
    ...(show.letterConcept !== undefined ? { letterConcept: show.letterConcept } : {}),
    ...(show.numberConcept !== undefined ? { numberConcept: show.numberConcept } : {}),
    estimatedDurationSec: 120,
    number: 1,
    review: show.review
  };
}

function dismissBootSplash(uiRoot: HTMLElement, doc: Document): void {
  if (typeof doc.getElementById === "function") {
    doc.getElementById("ww-boot")?.remove();
  }
  if (typeof uiRoot.querySelectorAll === "function") {
    for (const node of Array.from(uiRoot.querySelectorAll('[data-ui="boot"]'))) {
      node.remove();
    }
  }
  for (const child of Array.from(uiRoot.children ?? [])) {
    if (child.getAttribute?.("id") === "ww-boot" || child.getAttribute?.("data-ui") === "boot") {
      child.remove();
    }
  }
}

function applyBroadcastFraming(target: HTMLElement | null | undefined, aspect: ShowAspect): void {
  if (!target) return;
  const width = aspect === "9:16" ? "1080px" : "1920px";
  const height = aspect === "9:16" ? "1920px" : "1080px";
  target.style.setProperty?.("width", width);
  target.style.setProperty?.("height", height);
  try {
    target.style.width = width;
    target.style.height = height;
  } catch {
    // Minimal style stubs may only implement setProperty.
  }
  if (target.dataset) {
    target.dataset["broadcast"] = "true";
    target.dataset["aspect"] = aspect;
  }
  target.setAttribute?.("data-broadcast", "true");
  target.setAttribute?.("data-aspect", aspect);
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

function waitOverride(waitMs: number, mode?: PlayMode): number | undefined {
  if (mode === "auto" && waitMs === WAIT_MS_DEFAULT) return WAIT_MS_MIN;
  if (mode === "wind-down" && waitMs === WAIT_MS_DEFAULT) return WIND_DOWN_WAIT_MS;
  return waitMs === WAIT_MS_DEFAULT ? undefined : clampWaitMs(waitMs);
}

function formatSleepRemaining(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
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
  const effectiveWelcomeName: string | null | undefined = flags.broadcast ? null : options.welcomeName;

  let settings: ParentSettings = {
    ...options.settings,
    ...(flags.broadcast ? { mode: "broadcast" } : {}),
    wordList: [...options.settings.wordList]
  };
  /** `?reducedMotion=1` forces calm motion for this page load without changing the saved setting. */
  let forcedReducedMotion = flags.reducedMotion;
  const reducedMotionNow = (): boolean => settings.reducedMotion || forcedReducedMotion;
  const windDownNow = (): boolean => !flags.broadcast && (settings.windDown || settings.mode === "wind-down");
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

  if (flags.broadcast) {
    dismissBootSplash(uiRoot, doc);
    applyBroadcastFraming(doc.documentElement, flags.aspect);
    applyBroadcastFraming(uiRoot, flags.aspect);
    applyBroadcastFraming(stageHost, flags.aspect);
  }

  applyDisplaySettings(doc, { ...settings, reducedMotion: reducedMotionNow(), windDown: windDownNow() });
  const unbindViewport = flags.broadcast ? () => undefined : bindViewportCssVars(view, doc);

  let sleepDimEl: HTMLDivElement | null = null;
  const setSleepDim = (alpha: number): void => {
    if (flags.broadcast) return;
    const clamped = Number.isFinite(alpha) ? Math.max(0, Math.min(0.55, alpha)) : 0;
    if (clamped <= 0.001) {
      if (sleepDimEl) {
        sleepDimEl.remove();
        sleepDimEl = null;
      }
      uiRoot.style.removeProperty("--ww-sleep-dim");
      return;
    }
    if (!sleepDimEl) {
      sleepDimEl = doc.createElement("div");
      sleepDimEl.className = "ww-sleep-dim";
      sleepDimEl.setAttribute("aria-hidden", "true");
      uiRoot.appendChild(sleepDimEl);
    }
    uiRoot.style.setProperty("--ww-sleep-dim", clamped.toFixed(3));
  };

  // ---- audio: one mixer (the one AudioContext), one narration player on story time
  const mixer = createAudioMixer({ manifest: AUDIO_MANIFEST, musicEnabled: settings.music, soundEnabled: settings.sound });
  mixer.setSfxVolume(settings.sfxVolume);
  /** True when sound cannot play at all this session (no Web Audio, `?audio=0`, or the start tap could not unlock it). */
  let audioFailed = !flags.audio || mixer.manager === null;
  const clock = createStoryClock();
  const recordedLine = (key: string): AudioClipRef | undefined =>
    options.audioClips?.[key] ??
    (locale.locale === "en" ? AUDIO_MANIFEST.lines[key] : AUDIO_MANIFEST.localeLines?.[locale.locale]?.[key]);
  const lineLength = (key: string): number => spokenLineMs(locale.line(key), recordedLine(key));

  let active: ActiveStory | null = null;
  let activeShow: ActiveShow | null = null;
  let activeSong: ActiveSong | null = null;
  let lineOrder: readonly string[] = [];
  let sleepElapsedMs = 0;

  // ---- deterministic simulation time + audio event log (PRD 09 B3.4, B3.5)
  let simStoryMs = 0;
  let stageShownStoryMs = 0;
  let inSyncStep = false;
  let audioEventLog: AudioEventLogEntry[] = [];
  let currentBedId: MusicBedId | null = null;
  let loggedLine: {
    readonly key: string;
    readonly speaker: SpeakerId;
    readonly startedAtMs: number;
    readonly durationMs: number;
  } | null = null;
  let speechDucked = false;
  let loggedSong: { readonly id: SongId; readonly endsAtMs: number } | null = null;
  let activePauseId: string | null = null;

  const currentStoryMs = (): number => {
    if (activeShow) {
      const segElapsed = active ? active.runner.snapshot().elapsedMs : 0;
      return Math.max(simStoryMs, activeShow.segmentOffsetMs + segElapsed);
    }
    if (active) {
      return Math.max(simStoryMs, active.runner.snapshot().elapsedMs);
    }
    return simStoryMs;
  };

  const stampStoryMs = (): number => Math.round(currentStoryMs());

  const pushAudioEvent = (entry: AudioEventLogEntry): void => {
    audioEventLog.push(entry);
  };

  const closeLoggedLine = (keepDuck: boolean): void => {
    if (loggedLine !== null) {
      const prev = loggedLine;
      loggedLine = null;
      pushAudioEvent({
        t: stampStoryMs(),
        type: "line",
        action: "stop",
        id: prev.key,
        speaker: prev.speaker
      });
    }
    if (!keepDuck && speechDucked) {
      speechDucked = false;
      pushAudioEvent({
        t: stampStoryMs(),
        type: "duck",
        action: "stop",
        id: "speech",
        gain: 1
      });
    }
  };

  const closeLoggedSong = (): void => {
    if (loggedSong === null) return;
    const prev = loggedSong;
    loggedSong = null;
    pushAudioEvent({
      t: stampStoryMs(),
      type: "song",
      action: "stop",
      id: prev.id
    });
  };

  const closeBroadcastPause = (): void => {
    if (activePauseId === null) return;
    const prevId = activePauseId;
    activePauseId = null;
    mixer.setPauseDuck(false);
    pushAudioEvent({
      t: stampStoryMs(),
      type: "pause",
      action: "stop",
      id: prevId
    });
    pushAudioEvent({
      t: stampStoryMs(),
      type: "duck",
      action: "stop",
      id: "pause",
      gain: 1
    });
  };

  const transitionBed = (nextBed: MusicBedId | null): void => {
    if (nextBed === currentBedId) {
      mixer.setBed(nextBed);
      return;
    }
    if (currentBedId !== null) {
      pushAudioEvent({
        t: stampStoryMs(),
        type: "bed",
        action: "stop",
        id: currentBedId
      });
    }
    currentBedId = nextBed;
    mixer.setBed(nextBed);
    if (nextBed !== null) {
      pushAudioEvent({
        t: stampStoryMs(),
        type: "bed",
        action: "start",
        id: nextBed
      });
    }
  };

  const logStageAudioAction = (action: StageAction): void => {
    if (action.do === "sfx") {
      const sfxDur = Math.round(
        AUDIO_MANIFEST.sfx[action.sound]?.durationMs ?? (SFX[action.sound]?.durationSec ?? 0.5) * 1000
      );
      pushAudioEvent({
        t: stampStoryMs(),
        type: "sfx",
        action: "start",
        id: action.sound,
        durationMs: sfxDur
      });
    } else if (action.do === "song") {
      closeLoggedSong();
      const songDur = Math.round(
        AUDIO_MANIFEST.songs[action.song]?.durationMs ?? songLengthSec(SONGS[action.song]) * 1000
      );
      pushAudioEvent({
        t: stampStoryMs(),
        type: "song",
        action: "start",
        id: action.song,
        durationMs: songDur
      });
      loggedSong = { id: action.song, endsAtMs: currentStoryMs() + songDur };
    } else if (action.do === "music") {
      transitionBed(action.bed);
    }
  };

  const resetPlaybackTelemetry = (): void => {
    simStoryMs = 0;
    stageShownStoryMs = 0;
    audioEventLog = [];
    currentBedId = null;
    loggedLine = null;
    speechDucked = false;
    loggedSong = null;
    activePauseId = null;
    mixer.setPauseDuck(false);
  };

  const syncSpeechStage = (subStepMs = 0): void => {
    const target = stage;
    if (!target) return;
    const current = active;
    if (!current || pauseReasons.paused()) {
      target.setSpeechEnergy?.(0);
      target.setSpeechViseme?.(null, null);
      return;
    }
    const speaking = current.runner.speakingLine();
    if (!speaking) {
      target.setSpeechEnergy?.(0);
      target.setSpeechViseme?.(null, null);
      return;
    }
    const clip = recordedLine(speaking.key);
    const timing = narration.timing();
    const baseElapsed =
      loggedLine && loggedLine.key === speaking.key
        ? Math.max(0, simStoryMs - loggedLine.startedAtMs)
        : timing
          ? timing.elapsedMs
          : 0;
    const sampleMs =
      timing && timing.mode === "audio" && !query.manual ? timing.elapsedMs + subStepMs : baseElapsed + subStepMs;
    const dur = loggedLine?.durationMs ?? timing?.durationMs ?? lineLength(speaking.key);
    const energy = sampleSpeechEnvelope(clip?.env, sampleMs, dur);
    target.setSpeechEnergy?.(energy);
    const sampledViseme = sampleVisemeTrack(clip?.visemes, sampleMs);
    if (sampledViseme !== null) {
      target.setSpeechViseme?.(sampledViseme.viseme, sampledViseme.openness);
    } else {
      target.setSpeechViseme?.(null, null);
    }
  };

  const resetSleepFade = (): void => {
    sleepElapsedMs = 0;
    setSleepDim(0);
    mixer.setSleepGain(1);
  };

  const syncSleepControls = (controls: StoryUiControls | null | undefined): void => {
    if (!controls) return;
    if (settings.sleepTimerMin > 0) {
      const remainingMs = Math.max(0, settings.sleepTimerMin * 60_000 - sleepElapsedMs);
      controls.setSleepTimerLabel?.(formatSleepRemaining(remainingMs));
    } else {
      controls.setSleepTimerLabel?.(null);
    }
  };

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
    clip: (key) => recordedLine(key),
    onStart: (line) => {
      const current = active;
      if (!current) return;
      current.runner.lineStarted(line);
      current.controls.setReplayAvailable(true);
      preloadAfter(line.key);
    },
    onEnd: (key) => {
      const current = active;
      current?.runner.lineEnded(key);
      if (loggedLine?.key === key && current?.runner.speakingLine() === null) {
        closeLoggedLine(false);
        stage?.setSpeechViseme?.(null, null);
      }
    },
    estimateMs: lineLength,
    now: () => clock.now(),
    schedule: (fn, ms) => clock.schedule(fn, ms)
  });
  narration.setMuted(!flags.audio || !settings.sound);

  // ---- screens
  let screen: WonderScreen = flags.broadcast ? "idle" : "start";
  let started = flags.broadcast;
  let disposed = false;

  const syncChromeTheme = (worldHint?: WorldId | null): void => {
    if (settings.highContrast) {
      syncThemeColor(doc, "#ffffff");
      return;
    }
    if (screen === "story") {
      const currentSongId = activeSong?.songId ?? pendingSong;
      const isSleepStory =
        (active?.story ?? pending)?.sleepCategory === "bedtime" ||
        (currentSongId !== null && SONGS[currentSongId].sleep === true);
      if (isSleepStory) {
        syncThemeColor(doc, "#181324");
        return;
      }
      const world =
        worldHint ??
        active?.story.world ??
        pending?.world ??
        (currentSongId !== null ? SONG_WORLDS[currentSongId].world : null);
      if (world) {
        syncThemeColor(doc, WORLD_LOOKS[world].background);
        return;
      }
    }
    if (windDownNow()) {
      syncThemeColor(doc, "#181324");
      return;
    }
    if (screen === "start") {
      syncThemeColor(doc, "#e3edf6");
      return;
    }
    syncThemeColor(doc, "#f4efe6");
  };
  syncChromeTheme();
  let removeStart: (() => void) | null = null;
  let removeMenu: (() => void) | null = null;
  let removeOffline: (() => void) | null = null;
  let removeLoading: (() => void) | null = null;
  let gateAbort: AbortController | null = null;
  let closePanel: (() => void) | null = null;
  let disarmGesture: (() => void) | null = null;

  // ---- story state
  let pending: StorySpec | null = null;
  let pendingShowId: string | null = null;
  let pendingSegmentId: string | null = null;
  let pendingSegmentIndex = -1;
  let pendingSong: SongId | null = null;
  let storyToken = 0;
  const pauseReasons = createPauseSet();
  /** The story whose offline card is showing (or finished broadcast run), with its final director snapshot. */
  let ended: {
    readonly storyId: string;
    readonly segmentId: string | null;
    readonly segmentIndex: number;
    readonly snapshot: DirectorSnapshot;
    readonly spoken: readonly string[];
  } | null = null;
  let initialStory: StorySpec | null = null;
  let initialShow: ShowSpec | null = null;
  if (query.show !== undefined && query.show.length > 0) {
    const foundShow = findShow(query.show, options.shows);
    if (foundShow) initialShow = foundShow;
    else recordError("unknown show id in ?show");
  }
  if (query.story !== undefined && query.story.length > 0) {
    const found = findStory(query.story, options.stories);
    if (found) {
      initialStory = found;
    } else {
      const fallbackShow = findShow(query.story, options.shows);
      if (fallbackShow) initialShow = fallbackShow;
      else recordError("unknown story id in ?story");
    }
  }

  // ---- stage, loop and presenter
  let stage: AppStage | null = null;
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

  /** The running standalone song / lullaby jukebox track, or null when paused or absent. */
  const runningSong = (): ActiveSong | null => {
    if (!activeSong || pauseReasons.paused()) return null;
    return activeSong;
  };

  const tickSleepTimer = (): boolean => {
    if (flags.broadcast || settings.sleepTimerMin <= 0) return false;
    const totalMs = settings.sleepTimerMin * 60_000;
    sleepElapsedMs += STEP_MS;
    const remainingMs = Math.max(0, totalMs - sleepElapsedMs);
    const controls = active?.controls ?? activeSong?.controls ?? null;
    controls?.setSleepTimerLabel?.(formatSleepRemaining(remainingMs));
    if (remainingMs <= 60_000) {
      const dimProgress = 1 - remainingMs / 60_000;
      setSleepDim(0.55 * Math.max(0, Math.min(1, dimProgress)));
    } else {
      setSleepDim(0);
    }
    if (remainingMs <= 30_000) {
      const audioProgress = Math.max(0, Math.min(1, 1 - remainingMs / 30_000));
      mixer.setSleepGain(0.5 * (1 + Math.cos(Math.PI * audioProgress)));
    } else {
      mixer.setSleepGain(1);
    }
    if (remainingMs <= 0) {
      showSleepGoodnight();
      return true;
    }
    return false;
  };

  /** One fixed step: director or song jukebox, then the story clock; the stage too when `withStage`. */
  const stepStory = (withStage: boolean): void => {
    if (activeShow?.finalizePendingSegment) {
      activeShow.finalizePendingSegment();
    }
    const current = runningStory();
    if (current) {
      const prevShow = activeShow;
      const beforeSegElapsed = current.runner.snapshot().elapsedMs;
      current.runner.tick(STEP_MS);
      if (prevShow && activeShow === prevShow && active !== current) {
        // Segment completed mid-step; carry any unused remainder of this 50 ms step into the new segment.
        const usedInFinishedSeg = Math.max(0, current.runner.snapshot().elapsedMs - beforeSegElapsed);
        const leftoverMs = Math.max(0, STEP_MS - usedInFinishedSeg);
        prevShow.finalizePendingSegment?.();
        const nextActive = runningStory();
        if (leftoverMs > 0 && nextActive && nextActive !== current) {
          nextActive.runner.tick(leftoverMs);
        }
      }
      simStoryMs += STEP_MS;
      clock.advance(STEP_MS);
      if (loggedSong !== null && currentStoryMs() >= loggedSong.endsAtMs - 1e-6) {
        closeLoggedSong();
      }
      if (
        loggedLine !== null &&
        (query.manual || !flags.audio || audioFailed || !settings.sound) &&
        simStoryMs - loggedLine.startedAtMs >= loggedLine.durationMs - 1e-6 &&
        (active === null || active.runner.speakingLine()?.key !== loggedLine.key)
      ) {
        closeLoggedLine(false);
      }
      if (tickSleepTimer()) return;
      syncSpeechStage(0);
      const afterActive = active;
      if (afterActive) {
        const snap = afterActive.runner.snapshot();
        if (snap.phase === "waiting" && !flags.broadcast) {
          const beat = storyBeats(afterActive.story).find((b) => b.id === snap.beatId);
          const totalWaitMs = waitOverride(settings.waitMs, settings.mode) ?? beat?.waitMs ?? WAIT_MS_DEFAULT;
          const fracRemaining = totalWaitMs > 0 ? Math.max(0, Math.min(1, 1 - snap.waitedMs / totalWaitMs)) : 0;
          afterActive.controls.setWaitProgress?.(fracRemaining);
        }
      }
      if (withStage && active !== null) {
        stage?.update(STEP_MS / 1000);
        stageShownStoryMs = simStoryMs;
      }
      return;
    }
    const songState = runningSong();
    if (!songState) return;
    simStoryMs += STEP_MS;
    clock.advance(STEP_MS);
    songState.elapsedMs += STEP_MS;
    if (tickSleepTimer()) return;
    const spec = SONGS[songState.songId];
    while (
      songState.shownLyricIndex + 1 < songState.cues.length &&
      songState.shownLyricIndex + 1 < spec.lyrics.length &&
      songState.elapsedMs >= (songState.cues[songState.shownLyricIndex + 1] ?? Number.POSITIVE_INFINITY)
    ) {
      songState.shownLyricIndex += 1;
      const lyric = spec.lyrics[songState.shownLyricIndex];
      if (lyric !== undefined) {
        const host = SONG_WORLDS[songState.songId].host;
        songState.captions.show(spec.vocal === "instrumental" ? "narrator" : host, lyric, []);
      }
    }
    if (withStage && activeSong === songState) {
      stage?.update(STEP_MS / 1000);
      stageShownStoryMs = simStoryMs;
    }
    if (songState.elapsedMs >= songState.durationMs) {
      if (songState.index + 1 < songState.queue.length) {
        void openSongQueue(songState.queue, songState.index + 1);
      } else if (spec.sleep === true || windDownNow()) {
        showSleepGoodnight();
      } else {
        exitToMenu();
      }
    }
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

  const mobileThermal = detectMobileThermalProfile(view);
  let lastFixedRafMs = -1_000_000;
  const activeNativeFixedRaf = new Map<number, number>();
  let nextLogicalFixedRaf = 1;

  const loop = createFixedStepLoop({
    stepSeconds: STEP_MS / 1000,
    manual: query.manual,
    ...(mobileThermal && view && typeof view.requestAnimationFrame === "function" && typeof view.cancelAnimationFrame === "function"
      ? {
          schedule: (callback: (nowMs: number) => void): number => {
            const logicalId = nextLogicalFixedRaf;
            nextLogicalFixedRaf += 1;
            const onRaf = (nowMs: number): void => {
              if (!activeNativeFixedRaf.has(logicalId)) return;
              const minIntervalMs = reducedMotionNow() || windDownNow() ? 31.5 : 15.2;
              if (nowMs - lastFixedRafMs < minIntervalMs) {
                activeNativeFixedRaf.set(logicalId, view.requestAnimationFrame(onRaf));
                return;
              }
              activeNativeFixedRaf.delete(logicalId);
              lastFixedRafMs = nowMs;
              callback(nowMs);
            };
            activeNativeFixedRaf.set(logicalId, view.requestAnimationFrame(onRaf));
            return logicalId;
          },
          cancel: (logicalHandle: unknown): void => {
            if (typeof logicalHandle !== "number") return;
            const nativeId = activeNativeFixedRaf.get(logicalHandle);
            activeNativeFixedRaf.delete(logicalHandle);
            if (nativeId !== undefined) view.cancelAnimationFrame(nativeId);
          }
        }
      : {}),
    step: () => {
      stepStory(false);
      presenter.afterStep();
    },
    render: () => {
      const storyRunning = runningStory();
      const songRunning = runningSong();
      if (!storyRunning && !songRunning) return;
      const shown = presenter.present(loop, true).t;
      const dt = shown - stageShownMs;
      if (dt <= 0) return;
      stageShownMs = shown;
      if (storyRunning) {
        syncSpeechStage(Math.max(0, dt));
      }
      updateStage(dt);
    }
  });

  const shouldActivelyRun = (): boolean =>
    !disposed &&
    (screen === "story" || screen === "playing") &&
    (pending !== null ||
      pendingSong !== null ||
      ((active !== null || activeSong !== null) && !pauseReasons.paused()));

  const syncExecutionState = (): void => {
    const activeRun = shouldActivelyRun();
    stage?.setRenderPaused?.(!activeRun);
    if (!query.manual) {
      if (activeRun) loop.start();
      else loop.stop();
    }
  };

  /** Draws the current state once (after QA steps); never while a story's world is still being swapped in. */
  const presentNow = (): void => {
    const target = stage;
    if (!target || !target.game || (!active && !activeSong)) return;
    try {
      target.game().app.step(0);
    } catch (error) {
      recordError(error);
    }
  };

  // ---- pause bookkeeping (story- or song-scoped)
  const storyExists = (): boolean => active !== null || activeSong !== null || pending !== null || pendingSong !== null;

  const addPause = (reason: PauseReason): void => {
    if (disposed || !storyExists()) return;
    if (pauseReasons.add(reason)) {
      active?.runner.pause();
      if (activeSong) mixer.pauseAll();
    }
    active?.controls.setPaused(true);
    activeSong?.controls.setPaused(true);
    syncExecutionState();
  };

  const releasePause = (reasons: readonly PauseReason[]): void => {
    if (!storyExists()) {
      pauseReasons.clear();
      syncExecutionState();
      return;
    }
    if (!pauseReasons.release(reasons)) return;
    active?.runner.resume();
    if (activeSong) mixer.resumeAll();
    active?.controls.setPaused(false);
    activeSong?.controls.setPaused(false);
    syncExecutionState();
  };

  /** Back from a hidden tab or a lost GPU: stay paused until a grown-up taps Resume (never auto-resume speech). */
  const holdForGrownUp = (reason: "hidden" | "device"): void => {
    if (!pauseReasons.holdForGrownUp(reason)) return;
    active?.controls.setPaused(true);
    activeSong?.controls.setPaused(true);
    syncExecutionState();
  };

  // ---- audio unlock
  const needsAudioUnlock = (): boolean =>
    flags.audio &&
    mixer.manager !== null &&
    (!mixer.isUnlocked() || (mixer.manager.state !== "running" && mixer.manager.state !== "closed"));

  const markAudioUnavailable = (): void => {
    if (disposed) return;
    audioFailed = true;
    active?.captions.setAudioUnavailable(true);
    activeSong?.captions.setAudioUnavailable(true);
    active?.runner.audioUnavailable();
  };

  const markAudioAvailable = (): void => {
    if (disposed || !audioFailed) return;
    audioFailed = false;
    active?.captions.setAudioUnavailable(false);
    activeSong?.captions.setAudioUnavailable(false);
  };

  /** The start/menu/replay/resume button handlers call this synchronously inside the tap (also re-arms gestures if AirPlay/OS blocks initial unlock). */
  const unlockFromStartTap = (): void => {
    if (!flags.audio || mixer.manager === null) {
      markAudioUnavailable();
      return;
    }
    void mixer.unlock().then((ok) => {
      if (disposed) return;
      if (ok) {
        markAudioAvailable();
        if (!needsAudioUnlock()) disarmGesture?.();
      } else if (!mixer.isUnlocked()) {
        markAudioUnavailable();
        armGestureUnlock();
      }
    });
  };

  /** No start screen (`?autostart=1`, QA begin/startStory) or after OS/AirPlay interruption: next real tap unlocks audio. */
  const armGestureUnlock = (): void => {
    if (flags.broadcast || disarmGesture || !view || !needsAudioUnlock()) return;
    const types = ["touchend", "click", "keydown", "pointerup"] as const;
    const onGesture = (): void => {
      if (disposed || !needsAudioUnlock()) {
        if (mixer.isUnlocked()) markAudioAvailable();
        disarm();
        return;
      }
      void mixer.unlock().then((ok) => {
        if (disposed) return;
        if (ok) {
          markAudioAvailable();
          if (!needsAudioUnlock()) disarm();
        }
      });
    };
    const disarm = (): void => {
      for (const type of types) view.removeEventListener(type, onGesture, true);
      if (disarmGesture === disarm) disarmGesture = null;
    };
    for (const type of types) view.addEventListener(type, onGesture, true);
    disarmGesture = disarm;
  };

  const resumeByGrownUp = (): void => {
    if (!disposed && needsAudioUnlock()) {
      void mixer.unlock().then((ok) => {
        if (disposed) return;
        if (ok) {
          markAudioAvailable();
          if (!needsAudioUnlock()) disarmGesture?.();
        } else {
          armGestureUnlock();
        }
      });
    }
    releasePause(["user", "hidden", "device"]);
  };

  if (flags.audio && mixer.manager) {
    unsubscribers.push(
      mixer.manager.onStateChange((state) => {
        if (disposed) return;
        if (state === "running" && mixer.isUnlocked()) {
          markAudioAvailable();
          disarmGesture?.();
        } else if (state !== "running" && state !== "closed" && started) {
          armGestureUnlock();
        }
      })
    );
  }

  // ---- settings
  let manualMode: "play-together" | "watch-sing" = settings.mode === "watch-sing" ? "watch-sing" : "play-together";

  const applySettings = (next: ParentSettings): void => {
    if (disposed) return;
    const previous = settings;
    settings = {
      ...next,
      ...(flags.broadcast ? { mode: "broadcast" } : {}),
      wordList: [...next.wordList]
    };
    if (settings.mode === "play-together" || settings.mode === "watch-sing") manualMode = settings.mode;
    if (!flags.broadcast) saveSettings(storage, settings);
    if (previous.music !== settings.music) mixer.setMusicEnabled(settings.music);
    if (previous.sfxVolume !== settings.sfxVolume) mixer.setSfxVolume(settings.sfxVolume);
    if (previous.sound !== settings.sound) {
      mixer.setSoundEnabled(settings.sound);
      narration.setMuted(!flags.audio || !settings.sound);
    }
    if (previous.sleepTimerMin !== settings.sleepTimerMin) resetSleepFade();
    if (previous.locale !== settings.locale) locale = createLocale(LOCALE_PACKS, settings.locale);
    const reduced = reducedMotionNow();
    const windDown = windDownNow();
    applyDisplaySettings(doc, { ...settings, reducedMotion: reduced, windDown });
    syncChromeTheme();
    stage?.setReducedMotion(reduced);
    const current = active;
    if (current) {
      current.captions.setEnabled(settings.captions);
      current.captions.setHighlightWords?.(storyHighlightWords(current.story, settings));
      current.controls.setAutoPlay?.(settings.mode === "auto");
      current.controls.setWindDown?.(windDown);
      syncSleepControls(current.controls);
      current.runner.setReducedMotion(reduced);
      current.runner.setWaitMs(waitOverride(settings.waitMs, settings.mode));
    }
    const currentSong = activeSong;
    if (currentSong) {
      currentSong.captions.setEnabled(settings.captions);
      currentSong.controls.setAutoPlay?.(settings.mode === "auto");
      currentSong.controls.setWindDown?.(windDown);
      syncSleepControls(currentSong.controls);
    }
  };

  const toggleAutoPlay = (on: boolean): void => {
    applySettings({ ...settings, mode: on ? "auto" : manualMode });
  };

  const toggleWindDown = (on: boolean): void => {
    applySettings({
      ...settings,
      windDown: on,
      ...(on ? {} : settings.mode === "wind-down" ? { mode: manualMode } : {})
    });
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
    dismissIosFullscreenTip(doc);
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

  /** Ends the current or loading story/song without a card: stops every sound and removes the play UI. */
  const endStory = (): void => {
    storyToken += 1;
    pending = null;
    pendingShowId = null;
    pendingSegmentId = null;
    pendingSegmentIndex = -1;
    pendingSong = null;
    dropLoading();
    closeParentUi();
    const current = active;
    const currentShow = activeShow;
    const currentSong = activeSong;
    active = null;
    activeShow = null;
    activeSong = null;
    lineOrder = [];
    pauseReasons.clear();
    if (current) {
      current.runner.dispose();
      current.controls.dispose();
      current.captions.dispose();
    } else if (currentShow) {
      currentShow.controls.dispose();
      currentShow.captions.dispose();
    }
    if (currentSong) {
      currentSong.controls.dispose();
      currentSong.captions.dispose();
    }
    narration.stop();
    narration.resume();
    mixer.stopAll();
    mixer.resumeAll();
    stage?.setTargets(null);
    stage?.setTalking(null);
    stage?.setSpeechEnergy?.(null);
    stage?.setSpeechViseme?.(null, null);
    syncPresenter();
    syncExecutionState();
  };

  const showMenu = (): void => {
    if (disposed) return;
    closeScreens();
    started = true;
    if (flags.broadcast) {
      screen = "idle";
      syncExecutionState();
      return;
    }
    screen = "menu";
    syncExecutionState();
    syncChromeTheme();
    removeMenu = showEpisodeMenu(
      uiRoot,
      locale,
      MENU_ITEMS,
      (id) => {
        unlockFromStartTap();
        const story = findStory(id, options.stories);
        if (story) void openStory(story, settings.mode);
      },
      // After the stage failed to start, say so on the menu instead of bouncing back silently.
      {
        onParent: () => void openParentFlow(),
        autoPlay: settings.mode === "auto",
        onToggleAuto: toggleAutoPlay,
        windDown: windDownNow(),
        onToggleWindDown: toggleWindDown,
        onSelectSong: (songId) => {
          unlockFromStartTap();
          void openSongQueue([songId], 0);
        },
        onPlayAllLullabies: () => {
          unlockFromStartTap();
          void openSongQueue(SLEEP_SONG_IDS, 0);
        },
        stageUnavailable: stageFailed,
        selectedWords: settings.wordList
      }
    );
  };

  function showSleepGoodnight(): void {
    if (disposed) return;
    endStory();
    closeScreens();
    resetSleepFade();
    if (flags.broadcast) {
      screen = "idle";
      syncExecutionState();
      return;
    }
    screen = "offline";
    syncExecutionState();
    syncThemeColor(doc, settings.highContrast ? "#ffffff" : "#181324");
    removeOffline = showOfflineCard(
      uiRoot,
      locale,
      "",
      () => {
        removeOffline = null;
        ended = null;
        showMenu();
      },
      { variant: "sleep" }
    );
  }

  const finishPlaybackState = (
    storyId: string,
    segmentId: string | null,
    segmentIndex: number,
    snapshot: DirectorSnapshot | null,
    spoken: readonly string[]
  ): void => {
    closeLoggedLine(false);
    closeLoggedSong();
    closeBroadcastPause();
    transitionBed(null);
    ended = snapshot ? { storyId, segmentId, segmentIndex, snapshot, spoken } : null;
  };

  const showOffline = (
    story: StorySpec,
    key: string,
    overrideMeta?: {
      readonly storyId: string;
      readonly segmentId: string | null;
      readonly segmentIndex: number;
      readonly spoken: readonly string[];
    }
  ): void => {
    if (disposed) return;
    const snapshot = active?.story === story ? active.runner.snapshot() : null;
    const spoken = overrideMeta?.spoken ?? (active?.story === story ? active.runner.spokenKeys() : []);
    finishPlaybackState(
      overrideMeta?.storyId ?? story.id,
      overrideMeta?.segmentId ?? null,
      overrideMeta?.segmentIndex ?? -1,
      snapshot,
      spoken
    );
    endStory();
    closeScreens();
    if (flags.broadcast) {
      screen = "idle";
      syncExecutionState();
      return;
    }
    const isSleepVariant = windDownNow() || story.sleepCategory === "bedtime";
    screen = "offline";
    syncExecutionState();
    syncThemeColor(doc, settings.highContrast ? "#ffffff" : isSleepVariant ? "#181324" : "#f4efe6");
    removeOffline = showOfflineCard(
      uiRoot,
      locale,
      locale.str(key),
      () => {
        removeOffline = null;
        ended = null;
        showMenu();
      },
      // The story's caregiver bridge (PRD 01 section 4.3), target word recap chips, and story cast.
      {
        note: locale.str(story.caregiverBridgeKey, ""),
        words: story.targetWords.map((id) => ({ id, label: wordLabel(id) })),
        cast: story.cast.map((member) => member.id),
        ...(isSleepVariant ? { variant: "sleep" } : {})
      }
    );
  };

  const proceedFromStart = (mode: PlayMode): void => {
    started = true;
    const show = initialShow;
    initialShow = null;
    if (show) {
      void openShow(show, mode);
      return;
    }
    const defaultStory =
      mode === "auto"
        ? (ORDERED_STORIES[0] ?? STORIES[0] ?? null)
        : mode === "wind-down"
          ? (WIND_DOWN_PLAYLIST[0] ?? STORIES[0] ?? null)
          : null;
    const story = initialStory ?? defaultStory;
    initialStory = null;
    if (story) void openStory(story, mode);
    else showMenu();
  };

  const showStart = (): void => {
    if (disposed) return;
    closeScreens();
    if (flags.broadcast) {
      screen = "idle";
      syncExecutionState();
      return;
    }
    screen = "start";
    syncExecutionState();
    syncChromeTheme();
    removeStart = showStartScreen(
      uiRoot,
      locale,
      (mode) => {
        removeStart = null;
        unlockFromStartTap();
        if (mode !== settings.mode) applySettings({ ...settings, mode });
        proceedFromStart(mode);
        enterLandscapeFullMode(doc, uiRoot.querySelector?.('[data-ui="menu"]') ?? uiRoot, {
          swipe: uiText(locale, "ui.fullscreen.iosSwipe"),
          home: uiText(locale, "ui.fullscreen.iosHome"),
          close: uiText(locale, "ui.fullscreen.iosClose")
        });
      },
      {
        initialMode: settings.mode,
        ...(effectiveWelcomeName !== undefined ? { welcomeName: effectiveWelcomeName } : {}),
        onModeChange: (previewMode) => {
          const previewWindDown = settings.windDown || previewMode === "wind-down";
          applyDisplaySettings(doc, { ...settings, reducedMotion: reducedMotionNow(), windDown: previewWindDown });
          syncThemeColor(doc, settings.highContrast ? "#ffffff" : previewWindDown ? "#181324" : "#e3edf6");
        }
      }
    );
  };

  const exitToMenu = (): void => {
    endStory();
    showMenu();
  };

  async function openParentFlow(): Promise<void> {
    if (flags.broadcast || disposed || gateAbort || closePanel) return;
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
    if (activeSong || pendingSong) {
      const songId = activeSong?.songId ?? pendingSong;
      if ((songId && SONGS[songId].sleep === true) || windDownNow()) showSleepGoodnight();
      else exitToMenu();
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
    const playlist = ORDERED_STORIES.length > 0 ? ORDERED_STORIES : STORIES;
    const index = playlist.indexOf(story);
    if (index >= 0) return playlist[(index + 1) % playlist.length];
    const rawIndex = STORIES.indexOf(story);
    return STORIES[(rawIndex + 1) % STORIES.length];
  };

  const handleSpeakStart = (line: LineRef): void => {
    closeLoggedLine(true);
    const clip = recordedLine(line.key);
    const dur = Math.round(clip?.durationMs ?? lineLength(line.key));
    loggedLine = {
      key: line.key,
      speaker: line.speaker,
      startedAtMs: currentStoryMs(),
      durationMs: dur
    };
    pushAudioEvent({
      t: stampStoryMs(),
      type: "line",
      action: "start",
      id: line.key,
      speaker: line.speaker,
      durationMs: dur
    });
    if (!speechDucked) {
      speechDucked = true;
      pushAudioEvent({
        t: stampStoryMs(),
        type: "duck",
        action: "start",
        id: "speech",
        gain: 0.25
      });
    }
    syncSpeechStage(0);
  };

  const handleBroadcastPauseEffect = (
    effect: Extract<DirectorEffect, { readonly type: "broadcastPause" }>,
    fallbackBeatId: string | null
  ): void => {
    if (effect.active) {
      closeBroadcastPause();
      const pauseId = effect.captionKey ?? fallbackBeatId ?? "pause";
      activePauseId = pauseId;
      mixer.setPauseDuck(true);
      pushAudioEvent({
        t: stampStoryMs(),
        type: "pause",
        action: "start",
        id: pauseId
      });
      pushAudioEvent({
        t: stampStoryMs(),
        type: "duck",
        action: "start",
        id: "pause",
        gain: 0.5
      });
    } else {
      closeBroadcastPause();
    }
  };

  const withSyncStep = <T>(fn: () => T): T => {
    const prev = inSyncStep;
    inSyncStep = true;
    try {
      return fn();
    } finally {
      inSyncStep = prev;
    }
  };

  /** Loads a standalone song or lullaby-jukebox track on a hushed stage. */
  async function openSongQueue(queue: readonly SongId[], index: number): Promise<"started" | "cancelled" | "failed"> {
    const songId = queue[index];
    if (disposed || !songId) return "cancelled";
    endStory();
    closeScreens();
    resetPlaybackTelemetry();
    started = true;
    const token = storyToken;
    pendingSong = songId;
    screen = flags.broadcast ? "playing" : "story";
    syncExecutionState();
    const mapping = SONG_WORLDS[songId];
    const spec = SONGS[songId];
    syncChromeTheme(mapping.world);
    if (!flags.broadcast) {
      removeLoading = showLoading(uiRoot, locale, {
        world: mapping.world,
        host: mapping.host,
        title: locale.str(spec.titleKey, songId)
      });
    }
    let target: AppStage;
    try {
      target = await stageReady;
      if (token !== storyToken || disposed) return "cancelled";
      if (target.loadLullabyScene) {
        await target.loadLullabyScene(mapping.world);
      } else if (STORIES[0]) {
        await target.load(STORIES[0], { nightVeil: true });
      }
    } catch (error) {
      if (token !== storyToken || disposed) return "cancelled";
      if (error !== stageBootError) recordError(error);
      pendingSong = null;
      dropLoading();
      showMenu();
      return "failed";
    }
    if (token !== storyToken || disposed) return "cancelled";
    dropLoading();
    pendingSong = null;

    const captions: StoryUiCaptions = flags.broadcast
      ? NOOP_CAPTIONS
      : mountCaptions(uiRoot, locale, { highlightWords: [] });
    captions.setEnabled(settings.captions);
    captions.setAudioUnavailable(audioFailed);
    const controls: StoryUiControls = flags.broadcast
      ? NOOP_CONTROLS
      : mountChildControls(uiRoot, locale, {
          onPause: () => addPause("user"),
          onResume: () => resumeByGrownUp(),
          onReplayWord: () => undefined,
          onAllDone: () => allDone(),
          onParent: () => void openParentFlow(),
          initialAuto: settings.mode === "auto",
          onToggleAuto: toggleAutoPlay,
          initialWindDown: windDownNow(),
          onToggleWindDown: toggleWindDown
        });
    controls.setReplayAvailable(false);
    syncSleepControls(controls);

    transitionBed(null);
    const recordedSongMs = AUDIO_MANIFEST.songs[songId]?.durationMs;
    const fallbackMs = Math.round(songLengthSec(spec) * 1000);
    const clipMs = mixer.playSong(songId);
    const durationMs = Math.max(
      4000,
      clipMs > 0 ? Math.round(clipMs) : recordedSongMs !== undefined && recordedSongMs > 0 ? recordedSongMs : fallbackMs
    );
    const cues = songCueTimesMs(songId, durationMs);
    const songAction: StageAction = {
      do: "song",
      song: songId,
      ...(spec.sleep === true ? { performers: spec.vocal === "instrumental" ? [] : ["lumi"] } : {})
    };
    logStageAudioAction(songAction);
    target.apply([songAction]);

    const firstLyric = spec.lyrics[0];
    let shownLyricIndex = -1;
    if (firstLyric !== undefined && (cues[0] ?? 0) === 0) {
      shownLyricIndex = 0;
      captions.show(spec.vocal === "instrumental" ? "narrator" : mapping.host, firstLyric, []);
    }

    activeSong = {
      songId,
      queue,
      index,
      captions,
      controls,
      durationMs,
      cues,
      elapsedMs: 0,
      shownLyricIndex
    };
    const nextSongId = queue[index + 1];
    if (nextSongId !== undefined && flags.audio && mixer.isUnlocked()) {
      void mixer.preload(AUDIO_MANIFEST.songs[nextSongId]);
    }
    syncPresenter();
    target.update(0);
    if (query.manual) presentNow();
    if (activeSong?.songId === songId && pauseReasons.paused()) {
      mixer.pauseAll();
      controls.setPaused(true);
    }
    syncExecutionState();
    return "started";
  }

  /** Loads a story's world and starts its director. Resolves "started", "cancelled" (a newer request won) or "failed". */
  async function openStory(story: StorySpec, requestedMode: PlayMode): Promise<"started" | "cancelled" | "failed"> {
    if (disposed) return "cancelled";
    const mode: PlayMode = flags.broadcast ? "broadcast" : requestedMode;
    endStory();
    closeScreens();
    resetPlaybackTelemetry();
    started = true;
    const token = storyToken;
    pending = story;
    screen = flags.broadcast ? "playing" : "story";
    syncExecutionState();
    syncChromeTheme(story.world);
    if (!flags.broadcast) {
      removeLoading = showLoading(uiRoot, locale, {
        world: story.world,
        host: story.host,
        title: locale.str(story.titleKey)
      });
    }
    let target: AppStage;
    try {
      target = await stageReady;
      if (token !== storyToken || disposed) return "cancelled";
      await target.load(story, {
        nightVeil: windDownNow() || mode === "wind-down" || story.sleepCategory === "bedtime"
      });
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

    const captions: StoryUiCaptions = flags.broadcast
      ? NOOP_CAPTIONS
      : mountCaptions(uiRoot, locale, {
          highlightWords: storyHighlightWords(story, settings)
        });
    captions.setEnabled(settings.captions);
    captions.setAudioUnavailable(audioFailed);
    const controls: StoryUiControls = flags.broadcast
      ? NOOP_CONTROLS
      : mountChildControls(uiRoot, locale, {
          onPause: () => addPause("user"),
          onResume: () => resumeByGrownUp(),
          onReplayWord: () => {
            if (needsAudioUnlock()) unlockFromStartTap();
            narration.replay();
          },
          onAllDone: () => allDone(),
          onParent: () => void openParentFlow(),
          onConfirmTurn: () => {
            if (needsAudioUnlock()) unlockFromStartTap();
            active?.runner.confirm(clock.now());
          },
          initialAuto: settings.mode === "auto",
          onToggleAuto: toggleAutoPlay,
          initialWindDown: windDownNow(),
          onToggleWindDown: toggleWindDown
        });
    controls.setReplayAvailable(false);
    syncSleepControls(controls);
    const override = mode === "broadcast" ? undefined : waitOverride(settings.waitMs, settings.mode);
    const runner = createStoryRunner({
      story,
      mode,
      sinks: {
        stage: target,
        audio: mixer,
        narration,
        captions,
        text,
        onStageAction: (action) => logStageAudioAction(action),
        onSpeak: (line) => handleSpeakStart(line),
        onStopSpeech: () => {
          closeLoggedLine(false);
          target.setSpeechViseme?.(null, null);
        },
        onBroadcastPause: (effect) => handleBroadcastPauseEffect(effect, runner.snapshot().beatId),
        onMediaPaused: (paused) => controls.setPaused(paused),
        onTurn: (waiting) => controls.setTurnWaiting(waiting),
        onFinished: () => {
          closeLoggedLine(false);
          closeLoggedSong();
          closeBroadcastPause();
          transitionBed(null);
          target.setSpeechViseme?.(null, null);
        },
        onOffline: (key) => {
          if (!flags.broadcast && settings.mode === "wind-down" && runner.finishReason() === "complete") {
            const sleepIndex = WIND_DOWN_PLAYLIST.indexOf(story);
            if (sleepIndex >= 0 && sleepIndex + 1 < WIND_DOWN_PLAYLIST.length) {
              const nextSleep = WIND_DOWN_PLAYLIST[sleepIndex + 1];
              if (nextSleep) {
                void openStory(nextSleep, settings.mode);
                return;
              }
            }
            void openSongQueue(SLEEP_SONG_IDS, 0);
            return;
          }
          if (!flags.broadcast && settings.mode === "auto" && runner.finishReason() === "complete") {
            const next = nextInCatalog(story);
            if (next) {
              void openStory(next, settings.mode);
              return;
            }
          }
          showOffline(story, key);
        }
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
    if (story.music !== undefined) {
      transitionBed(story.music);
    }
    syncPresenter();
    runner.start();
    syncSpeechStage(0);
    // Draw the opening beat's state at once (camera, entrances), also when only QA calls move time.
    target.update(0);
    if (query.manual) presentNow();
    if (active?.runner === runner) {
      if (audioFailed) runner.audioUnavailable();
      if (pauseReasons.paused()) {
        runner.pause();
        controls.setPaused(true);
      }
    }
    syncExecutionState();
    const next = nextInCatalog(story);
    if (next && next !== story) target.prefetch?.(next);
    return "started";
  }

  /** Starts one segment's `StoryRunner` inside an active multi-segment `ShowSpec` (PRD 09 B3.3). */
  const mountShowSegmentRunner = (showState: ActiveShow, segIndex: number, segStory: EpisodeSpec): void => {
    const { show, mode, target, captions, controls } = showState;
    showState.segmentAppliedActions.length = 0;
    const hasNextSegment = segIndex + 1 < show.segments.length;
    const override = mode === "broadcast" ? undefined : waitOverride(settings.waitMs, settings.mode);
    let advancingToNext = false;

    const segmentAudio: StorySinks["audio"] = {
      playSfx: (id) => mixer.playSfx(id),
      playSong: (id, onEnded) => mixer.playSong(id, onEnded),
      setBed: (id) => mixer.setBed(id),
      pauseAll: () => mixer.pauseAll(),
      resumeAll: () => mixer.resumeAll(),
      stopAll: () => {
        if (hasNextSegment && runner.finishReason() === "complete") {
          mixer.stopSong();
          mixer.setPauseDuck(false);
        } else {
          mixer.stopAll();
        }
      }
    };

    const runner = createStoryRunner({
      story: segStory,
      mode,
      pauseMsOverride: show.pauseMs,
      sinks: {
        stage: target,
        audio: segmentAudio,
        narration,
        captions,
        text,
        onStageAction: (action) => {
          showState.segmentAppliedActions.push(action);
          logStageAudioAction(action);
        },
        onSpeak: (line) => handleSpeakStart(line),
        onStopSpeech: () => {
          closeLoggedLine(false);
          target.setSpeechViseme?.(null, null);
        },
        onBroadcastPause: (effect) => handleBroadcastPauseEffect(effect, runner.snapshot().beatId),
        onMediaPaused: (paused) => controls.setPaused(paused),
        onTurn: (waiting) => controls.setTurnWaiting(waiting),
        onFinished: (reason) => {
          closeLoggedLine(false);
          closeLoggedSong();
          closeBroadcastPause();
          target.setSpeechViseme?.(null, null);
          for (const key of runner.spokenKeys()) {
            if (showState.spoken.length < SPOKEN_LOG_MAX) showState.spoken.push(key);
          }
          if (reason === "complete" && hasNextSegment && activeShow === showState && !disposed) {
            advancingToNext = true;
            const nextIndex = segIndex + 1;
            const nextSeg = show.segments[nextIndex];
            if (!nextSeg) return;
            showState.segmentOffsetMs += runner.snapshot().elapsedMs;
            showState.segmentIndex = nextIndex;
            showState.segmentId = nextSeg.id;
            active = null;
            const nextSegStory = segmentToEpisodeSpec(show, nextSeg);
            if (nextSeg.music === null) {
              transitionBed(null);
            } else if (nextSeg.music !== undefined) {
              transitionBed(nextSeg.music);
            }
            const loadOpts = {
              nightVeil: windDownNow() || mode === "wind-down" || show.sleepCategory === "bedtime"
            };
            pending = nextSegStory;
            const swapPromise = target.swapSegment
              ? target.swapSegment(nextSegStory, nextSeg.transitionIn, loadOpts)
              : target.load(nextSegStory, loadOpts);
            let finalized = false;
            const finalize = (): void => {
              if (finalized || disposed || activeShow !== showState) return;
              finalized = true;
              showState.finalizePendingSegment = null;
              pending = null;
              mountShowSegmentRunner(showState, nextIndex, nextSegStory);
            };
            showState.finalizePendingSegment = finalize;
            if (inSyncStep) {
              finalize();
            }
            void swapPromise
              .then(() => {
                if (disposed || activeShow !== showState) return;
                if (!finalized) {
                  finalize();
                  target.update(0);
                  if (query.manual) presentNow();
                  syncExecutionState();
                } else if (options.stage === undefined && showState.segmentIndex === nextIndex) {
                  if (showState.segmentAppliedActions.length > 0) {
                    target.apply([...showState.segmentAppliedActions]);
                  }
                  const activeTargets = active?.runner.activeTargets() ?? [];
                  target.setTargets(activeTargets.length > 0 ? activeTargets : null);
                  const speaking = active?.runner.speakingLine() ?? null;
                  target.setTalking(speaking ? talkingActorFor(nextSegStory, speaking.speaker) : null);
                  syncSpeechStage(0);
                  target.update(0);
                  if (query.manual) presentNow();
                }
              })
              .catch((err: unknown) => {
                if (!disposed) recordError(err);
              });
          } else {
            transitionBed(null);
          }
        },
        onOffline: (key) => {
          if (advancingToNext) return;
          showOffline(segStory, key, {
            storyId: show.id,
            segmentId: showState.segmentId,
            segmentIndex: showState.segmentIndex,
            spoken: [...showState.spoken]
          });
        }
      },
      lineMs: (key) => lineLength(key) + (query.manual ? 0 : LINE_GRACE_MS),
      followNarration: !query.manual,
      reducedMotion: reducedMotionNow(),
      debounceMs: TAP_DEBOUNCE_MS,
      ...(override !== undefined ? { waitMs: override } : {})
    });

    if (!flags.broadcast) {
      captions.setHighlightWords?.(storyHighlightWords(segStory, settings));
      syncChromeTheme(segStory.world);
    }
    active = { story: segStory, runner, captions, controls };
    lineOrder = storyLineKeys(segStory);
    preloadStoryMedia(segStory);
    syncPresenter();
    runner.start();
    syncSpeechStage(0);
    if (active?.runner === runner) {
      if (audioFailed) runner.audioUnavailable();
      if (pauseReasons.paused()) {
        runner.pause();
        controls.setPaused(true);
      }
    }
  };

  /** Loads segment 0 of a `ShowSpec` and plays all segments sequentially without resetting `storyTimeMs` or `eventLog`. */
  async function openShow(show: ShowSpec, requestedMode?: PlayMode): Promise<"started" | "cancelled" | "failed"> {
    if (disposed) return "cancelled";
    const seg0 = show.segments[0];
    if (!seg0) {
      recordError(`show "${show.id}" has no segments`);
      return "failed";
    }
    const mode: PlayMode = flags.broadcast ? "broadcast" : (requestedMode ?? "broadcast");
    endStory();
    closeScreens();
    resetPlaybackTelemetry();
    started = true;
    const token = storyToken;
    const seg0Story = segmentToEpisodeSpec(show, seg0);
    pending = seg0Story;
    pendingShowId = show.id;
    pendingSegmentId = seg0.id;
    pendingSegmentIndex = 0;
    screen = flags.broadcast ? "playing" : "story";
    syncExecutionState();
    syncChromeTheme(seg0.world);
    if (!flags.broadcast) {
      removeLoading = showLoading(uiRoot, locale, {
        world: seg0.world,
        host: show.host,
        title: locale.str(show.titleKey, show.id)
      });
    }
    let target: AppStage;
    try {
      target = await stageReady;
      if (token !== storyToken || disposed) return "cancelled";
      if (target.prefetch) {
        for (let i = 1; i < show.segments.length; i += 1) {
          const upcoming = show.segments[i];
          if (upcoming) target.prefetch(segmentToEpisodeSpec(show, upcoming));
        }
      }
      await target.load(seg0Story, {
        nightVeil: windDownNow() || mode === "wind-down" || show.sleepCategory === "bedtime"
      });
    } catch (error) {
      if (token !== storyToken || disposed) return "cancelled";
      if (error !== stageBootError) recordError(error);
      pending = null;
      pendingShowId = null;
      pendingSegmentId = null;
      pendingSegmentIndex = -1;
      dropLoading();
      showMenu();
      return "failed";
    }
    if (token !== storyToken || disposed) return "cancelled";
    dropLoading();
    pending = null;
    pendingShowId = null;
    pendingSegmentId = null;
    pendingSegmentIndex = -1;

    const captions: StoryUiCaptions = flags.broadcast
      ? NOOP_CAPTIONS
      : mountCaptions(uiRoot, locale, {
          highlightWords: storyHighlightWords(seg0Story, settings)
        });
    captions.setEnabled(settings.captions);
    captions.setAudioUnavailable(audioFailed);
    const controls: StoryUiControls = flags.broadcast
      ? NOOP_CONTROLS
      : mountChildControls(uiRoot, locale, {
          onPause: () => addPause("user"),
          onResume: () => resumeByGrownUp(),
          onReplayWord: () => {
            if (needsAudioUnlock()) unlockFromStartTap();
            narration.replay();
          },
          onAllDone: () => allDone(),
          onParent: () => void openParentFlow(),
          onConfirmTurn: () => {
            if (needsAudioUnlock()) unlockFromStartTap();
            active?.runner.confirm(clock.now());
          },
          initialAuto: settings.mode === "auto",
          onToggleAuto: toggleAutoPlay,
          initialWindDown: windDownNow(),
          onToggleWindDown: toggleWindDown
        });
    controls.setReplayAvailable(false);
    syncSleepControls(controls);

    const showState: ActiveShow = {
      show,
      mode,
      target,
      captions,
      controls,
      segmentIndex: 0,
      segmentId: seg0.id,
      segmentOffsetMs: 0,
      spoken: [],
      segmentAppliedActions: [],
      finalizePendingSegment: null
    };
    activeShow = showState;
    if (seg0.music === null) {
      transitionBed(null);
    } else if (seg0.music !== undefined) {
      transitionBed(seg0.music);
    }
    mountShowSegmentRunner(showState, 0, seg0Story);
    target.update(0);
    if (query.manual) presentNow();
    syncExecutionState();
    return "started";
  }

  // ---- stage boot (createStage awaits the first mount and warmPrograms before showing a frame). It starts after
  // the first screen has been drawn (afterFirstPaint), so the start screen shows while the stage boots.
  const stageReady: Promise<AppStage> = options.stage
    ? Promise.resolve(options.stage).then((injected) => {
        if (disposed) {
          injected.dispose();
          throw new Error("app disposed before the stage mounted");
        }
        stage = injected;
        if (!flags.broadcast && stageHost) {
          unbindTaps = bindCanvasTaps(
            stageHost,
            (x, y) => injected.pick(x, y),
            (id) => {
              if (needsAudioUnlock()) unlockFromStartTap();
              active?.runner.tap(id, clock.now());
            },
            () => clock.now(),
            { debounceMs: CANVAS_TAP_DEBOUNCE_MS }
          );
        }
        syncExecutionState();
        ready = true;
        return injected;
      })
    : afterFirstPaint(flags.broadcast ? null : doc.defaultView)
        .then(() => {
          if (disposed) throw new Error("app disposed before the stage boot started");
          return createStage({
            target: stageHost,
            reducedMotion: reducedMotionNow(),
            manualClock: query.manual,
            backend: flags.backend,
            ...(flags.audio ? { sound: mixer.gameSoundOptions() } : {}),
            // A song line's cues are applied by the stage; their sounds are the mixer's (07 B20).
            onSongCue: (cue) => {
              if (disposed || (!runningStory() && !runningSong())) return;
              for (const action of cue.actions) {
                logStageAudioAction(action);
                if (action.do === "sfx") mixer.playSfx(action.sound);
                else if (action.do === "music") mixer.setBed(action.bed);
              }
            }
          });
        })
        .then((created) => {
          if (disposed) {
            created.dispose();
            throw new Error("app disposed before the stage mounted");
          }
          stage = created;
          const mounted = created.game().app;
          if (!flags.broadcast) {
            // Child taps: pointer events on the canvas, hit-tested by the stage's raycast pick.
            const surface = mounted.canvas ?? stageHost;
            if (surface) {
              unbindTaps = bindCanvasTaps(
                surface,
                (x, y) => created.pick(x, y),
                (id) => {
                  if (needsAudioUnlock()) unlockFromStartTap();
                  active?.runner.tap(id, clock.now());
                },
                () => clock.now(),
                { debounceMs: CANVAS_TAP_DEBOUNCE_MS }
              );
            }
            // A lost GPU context pauses the story like a hidden tab (03 section 3 CONTEXT_LOST); a grown-up resumes it.
            unsubscribers.push(mounted.onDeviceLost(() => addPause("device")));
            unsubscribers.push(mounted.onDeviceRestored(() => holdForGrownUp("device")));
          } else if (mounted.canvas) {
            applyBroadcastFraming(mounted.canvas, flags.aspect);
          }
          syncExecutionState();
          ready = true;
          return created;
        });
  stageReady.catch((error: unknown) => {
    stageBootError = error;
    stageFailed = true;
    if (disposed) return;
    recordError(error);
    // The menu is up (nothing loading, no grown-up dialog open): show it again with the calm notice.
    if (
      !flags.broadcast &&
      screen === "menu" &&
      pending === null &&
      pendingSong === null &&
      active === null &&
      activeSong === null &&
      !gateAbort &&
      !closePanel
    ) {
      showMenu();
    }
  });

  const sessionGate = flags.broadcast
    ? { dispose: () => undefined }
    : createSessionGate(doc, {
        onHide: () => addPause("hidden"),
        onShow: () => holdForGrownUp("hidden")
      });

  // ---- first screen
  if (flags.broadcast) {
    if (initialShow) {
      const show = initialShow;
      initialShow = null;
      void openShow(show, "broadcast");
    } else if (initialStory) {
      const story = initialStory;
      initialStory = null;
      void openStory(story, "broadcast");
    } else {
      screen = "idle";
    }
  } else if (query.autostart) {
    armGestureUnlock();
    proceedFromStart(settings.mode);
  } else {
    showStart();
  }
  syncExecutionState();

  // ---- public API
  const stageDiagnostics = (): WonderDiagnostics => {
    const target = stage;
    if (!target || !target.diagnostics) return { drawCalls: 0, nodes: 0 };
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
      const currentShow = activeShow;
      const snapshot = current ? current.runner.snapshot() : null;
      // A held line is not being spoken: while paused nothing is audible.
      const line = current && snapshot?.phase !== "paused" ? current.runner.speakingLine() : null;
      const diagnostics = stageDiagnostics();
      const spokenList = currentShow
        ? [...currentShow.spoken, ...(current ? current.runner.spokenKeys() : [])]
        : current
          ? current.runner.spokenKeys()
          : (ended?.spoken ?? []);
      return {
        screen,
        storyId:
          currentShow?.show.id ??
          pendingShowId ??
          current?.story.id ??
          pending?.id ??
          ended?.storyId ??
          activeSong?.songId ??
          pendingSong ??
          null,
        segmentId: currentShow?.segmentId ?? pendingSegmentId ?? (current ? null : (ended?.segmentId ?? null)),
        segmentIndex: currentShow?.segmentIndex ?? (pendingSegmentIndex >= 0 ? pendingSegmentIndex : (current ? -1 : (ended?.segmentIndex ?? -1))),
        director: snapshot ?? ended?.snapshot ?? null,
        targets: current ? [...current.runner.activeTargets()] : [],
        speaking: line?.key ?? null,
        speaker: line?.speaker ?? null,
        spoken: spokenList,
        audio: { unlocked: mixer.isUnlocked(), available: !audioFailed },
        settings: {
          mode: settings.mode,
          reducedMotion: reducedMotionNow(),
          captions: settings.captions,
          music: settings.music,
          sound: settings.sound
        },
        stage: {
          drawCalls: diagnostics.drawCalls,
          nodes: diagnostics.nodes,
          proceduralNodes: diagnostics.proceduralNodes ?? 0
        },
        micRequested: false,
        errors: [...errors]
      };
    },
    async startStory(id, mode) {
      const story = findStory(id, options.stories);
      if (!story) {
        const show = findShow(id, options.shows);
        if (show) {
          await app.startShow(show);
          return;
        }
        throw new Error(`unknown story "${id.slice(0, 40)}"`);
      }
      if (screen === "start") armGestureUnlock();
      const effectiveMode: PlayMode = flags.broadcast ? "broadcast" : (mode ?? settings.mode);
      const result = await openStory(story, effectiveMode);
      if (result === "failed") throw new Error(`story "${story.id}" failed to load`);
      if (result === "cancelled") throw new Error(`story "${story.id}" was replaced before it started`);
    },
    async startShow(idOrSpec) {
      const show = typeof idOrSpec === "string" ? findShow(idOrSpec, options.shows) : idOrSpec;
      if (!show) {
        const label = typeof idOrSpec === "string" ? idOrSpec.slice(0, 40) : "";
        throw new Error(`unknown show "${label}"`);
      }
      if (screen === "start") armGestureUnlock();
      const result = await openShow(show, flags.broadcast ? "broadcast" : "broadcast");
      if (result === "failed") throw new Error(`show "${show.id}" failed to load`);
      if (result === "cancelled") throw new Error(`show "${show.id}" was replaced before it started`);
    },
    hasShow: (id) => findShow(id, options.shows) !== undefined,
    flushStage: () => (stage && stage.ready ? stage.ready() : stageReady.then(() => undefined)),
    async startSong(id) {
      if (!SONG_IDS.includes(id)) throw new Error(`unknown song "${String(id).slice(0, 40)}"`);
      if (screen === "start") armGestureUnlock();
      const result = await openSongQueue([id], 0);
      if (result === "failed") throw new Error(`song "${id}" failed to load`);
      if (result === "cancelled") throw new Error(`song "${id}" was replaced before it started`);
    },
    async startLullabyJukebox() {
      if (screen === "start") armGestureUnlock();
      const result = await openSongQueue(SLEEP_SONG_IDS, 0);
      if (result === "failed") throw new Error("lullaby jukebox failed to load");
      if (result === "cancelled") throw new Error("lullaby jukebox was replaced before it started");
    },
    updateSettings(partial) {
      applySettings(sanitizeSettings({ ...settings, ...partial }, settings));
    },
    advance(ms) {
      const steps = stepsFor(ms);
      withSyncStep(() => {
        for (let i = 0; i < steps; i += 1) {
          const catchUp = simStoryMs - stageShownStoryMs;
          if (catchUp > 1e-6) {
            updateStage(catchUp);
            stageShownStoryMs = simStoryMs;
          }
          stepStory(true);
        }
      });
      syncPresenter();
      presentNow();
    },
    advanceTo(tMs, stepOpts) {
      if (!Number.isFinite(tMs) || tMs < 0) return;
      const fixedTargetMs = Math.floor((tMs + 1e-6) / STEP_MS) * STEP_MS;
      withSyncStep(() => {
        while (
          (runningStory() !== null || runningSong() !== null || activeShow?.finalizePendingSegment !== null) &&
          !pauseReasons.paused() &&
          (active !== null || activeSong !== null || activeShow !== null) &&
          simStoryMs + STEP_MS <= fixedTargetMs + 1e-6
        ) {
          const nextBoundaryMs = simStoryMs + STEP_MS;
          const preTickDeltaMs = nextBoundaryMs - stageShownStoryMs;
          if (preTickDeltaMs > 1e-9) {
            updateStage(preTickDeltaMs);
            stageShownStoryMs = nextBoundaryMs;
          }
          const prevSim = simStoryMs;
          stepStory(false);
          if (simStoryMs === prevSim) break;
          stageShownStoryMs = simStoryMs;
        }
        const remainderMs = Math.max(0, tMs - simStoryMs);
        if (runningStory() !== null || runningSong() !== null) {
          if (runningStory() !== null) {
            syncSpeechStage(remainderMs);
          }
          const fracDeltaMs = simStoryMs + remainderMs - stageShownStoryMs;
          if (fracDeltaMs > 1e-9) {
            updateStage(fracDeltaMs);
            stageShownStoryMs = simStoryMs + remainderMs;
          }
        }
      });
      syncPresenter();
      if (stepOpts?.render !== false) {
        presentNow();
      }
    },
    eventLog: () => [...audioEventLog],
    runToEnd(maxMs) {
      const currentShow = activeShow;
      if (currentShow) {
        const limit = maxMs !== undefined && Number.isFinite(maxMs) && maxMs > 0 ? maxMs : RUN_TO_END_DEFAULT_MS;
        let elapsed = 0;
        withSyncStep(() => {
          while (activeShow === currentShow && !pauseReasons.paused() && elapsed < limit) {
            currentShow.finalizePendingSegment?.();
            if (runningStory() === null) break;
            stepStory(true);
            elapsed += STEP_MS;
          }
        });
        syncPresenter();
        presentNow();
        const finished = activeShow !== currentShow;
        const reason = finished ? (ended?.snapshot.finishedReason ?? "complete") : (active?.runner.finishReason() ?? null);
        return { finished, reason, elapsedMs: elapsed };
      }
      const current = active;
      if (current) {
        const limit = maxMs !== undefined && Number.isFinite(maxMs) && maxMs > 0 ? maxMs : RUN_TO_END_DEFAULT_MS;
        let elapsed = 0;
        withSyncStep(() => {
          while (active === current && runningStory() === current && elapsed < limit) {
            stepStory(true);
            elapsed += STEP_MS;
          }
        });
        syncPresenter();
        presentNow();
        const reason = current.runner.finishReason();
        return { finished: reason !== null, reason, elapsedMs: elapsed };
      }
      const currentSong = activeSong;
      if (!currentSong) return { finished: false, reason: null, elapsedMs: 0 };
      const limit = maxMs !== undefined && Number.isFinite(maxMs) && maxMs > 0 ? maxMs : RUN_TO_END_DEFAULT_MS;
      let elapsed = 0;
      withSyncStep(() => {
        while (activeSong === currentSong && runningSong() === currentSong && elapsed < limit) {
          stepStory(true);
          elapsed += STEP_MS;
        }
      });
      syncPresenter();
      presentNow();
      const finished = activeSong !== currentSong;
      return { finished, reason: finished ? "complete" : null, elapsedMs: elapsed };
    },
    tap: (targetId) => (flags.broadcast ? false : (active?.runner.tap(targetId, clock.now()) ?? false)),
    parentConfirm: () => (flags.broadcast ? false : (active?.runner.confirm(clock.now()) ?? false)),
    pause: () => addPause("user"),
    resume: () => resumeByGrownUp(),
    allDone,
    skipBeat() {
      active?.runner.skipBeat();
    },
    setReducedMotion(on) {
      forcedReducedMotion = false;
      applySettings({ ...settings, reducedMotion: on });
      if (query.manual && (active || activeSong)) {
        stage?.update(0);
        presentNow();
      }
    },
    targetRects() {
      const target = stage;
      if (!target || !target.targetRects) return [];
      const rects = target.targetRects();
      const canvas = target.game ? target.game().app.canvas : null;
      const box = canvas ? canvas.getBoundingClientRect() : null;
      const left = box ? box.left : 0;
      const top = box ? box.top : 0;
      return rects.map((rect) => ({ id: rect.id, x: rect.x + left, y: rect.y + top, w: rect.w, h: rect.h }));
    },
    nodeRects(ids) {
      const target = stage;
      if (!target || !target.nodeRects) return [];
      const canvas = target.game ? target.game().app.canvas : null;
      const box = canvas ? canvas.getBoundingClientRect() : null;
      const left = box ? box.left : 0;
      const top = box ? box.top : 0;
      return target.nodeRects(ids).map((rect) => ({ id: rect.id, x: rect.x + left, y: rect.y + top, w: rect.w, h: rect.h }));
    },
    stageApply(actions) {
      if (disposed || (!active && !activeSong)) return;
      stage?.apply(actions);
      if (query.manual) {
        stage?.update(0);
        presentNow();
      }
    },
    setTalking(actor) {
      if (disposed || (!active && !activeSong)) return;
      stage?.setTalking(actor);
    },
    spatialState: () => (stage && stage.spatialState ? stage.spatialState() : []),
    diagnostics: stageDiagnostics,
    begin() {
      if (flags.broadcast || screen !== "start" || disposed) return;
      armGestureUnlock();
      proceedFromStart(settings.mode);
    },
    reset() {
      if (disposed) return;
      endStory();
      closeScreens();
      resetSleepFade();
      resetPlaybackTelemetry();
      if (flags.broadcast) {
        screen = "idle";
        syncExecutionState();
        return;
      }
      if (started) showMenu();
      else showStart();
    },
    auraApp: () => (stage && stage.game ? stage.game().app : null),
    reportError: recordError,
    dispose() {
      if (disposed) return;
      endStory();
      closeScreens();
      resetSleepFade();
      disposed = true;
      loop.stop();
      sessionGate.dispose();
      unbindViewport();
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
