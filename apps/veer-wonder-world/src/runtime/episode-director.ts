// Episode director (PRD 04 B01, PRD 03 section 3): the pure, deterministic
// story machine for episodes and activities.
//
// The director knows nothing about the DOM, audio or clocks. The app feeds it
// events (START, TICK with elapsed ms, LINE_DONE, TAP, ...) and performs the
// effects it returns (stage actions, speech, touch targets, ...). Time only
// moves through TICK, so the same events always give the same effects.
//
// Per beat: stage (reduced-motion variant when asked; the beat camera first),
// the caregiver hint key (null clears it), then one "speak" per line. A line
// ends on LINE_DONE for its key or after lineMs(key) (fallback 2600 ms) of
// TICK time, whichever comes first, so silent or failed audio still advances.
// Then the beat holds for holdMs. A beat with input shows its targets and
// waits (option waitMs, else beat.waitMs, else 5000 ms) for a tap on a target
// or a parent confirm; the wait also ends by itself. Then the targets clear
// and the response plays (stage, lines, hold).
//
// Activities: intro, then the round beats; a more-or-done beat answered by a
// tap or parent confirm plays another round (up to roundLimit); a timeout,
// skip or reached limit goes to the outro.
//
// Safety rules held here: silence never fails (every wait ends by itself),
// there is no failure or "wrong" state, double taps never advance twice, at
// most two targets are shown, "all done" works at any moment, the story always
// ends with an offline card, nothing plays after it ends, and nothing plays
// next by itself.

import type {
  BeatSpec,
  DirectorEffect,
  DirectorEvent,
  DirectorPhase,
  DirectorSnapshot,
  LineRef,
  PlayMode,
  StageAction,
  StorySpec
} from "../types.js";
import {
  beatAt,
  beatBroadcastPauseMs,
  beatStage,
  beatTargets,
  beatWaitMs,
  beatWaitsInMode,
  broadcastPauseStageActions,
  finiteMs,
  firstCursor,
  lineDurationMs,
  nextCursor,
  resolveBeatResponse,
  type BeatCursor,
  type LineMs
} from "./beat-runner.js";
import { createTurnTaking, type TurnResolution, type TurnSource, type TurnTaking } from "./turn-taking.js";

/** Opening establishing breath before Beat 0 dialogue starts in live TV pacing. */
export const TV_OPENING_LEAD_IN_MS = 650;
/** Scene-establishing shot when transitioning into a new segment (`segIndex > 0`) in live TV pacing. */
export const TV_SEGMENT_LEAD_IN_MS = 1200;
/** Natural sentence breath between two spoken lines by the same speaker in live TV pacing. */
export const TV_SAME_SPEAKER_GAP_MS = 550;
/** Natural conversational turn pause when speaker changes inside a beat in live TV pacing. */
export const TV_SPEAKER_CHANGE_GAP_MS = 750;
/** Calm TV-show breath after standard spoken dialogue beats (replaces 7–9s static holdMs padding). */
export const TV_POST_LINE_HOLD_MS = 1850;
/** Scene hold when characters enter/exit/move/carry/ride so physical actions land naturally. */
export const TV_ACTION_HOLD_MS = 2400;
/** Closing breath at the end of a segment or episode (`outro`) before transitioning onward. */
export const TV_OUTRO_HOLD_MS = 2600;
/** Settle beat right after asking the viewer a question before the call-and-response pause opens. */
export const TV_PRE_TURN_HOLD_MS = 850;
/** Maximum hold on non-song silent visual beats during live TV-paced episode playback. */
export const TV_SILENT_BEAT_MAX_HOLD_MS = 2500;
/** Natural preschool TV viewer pause in Watch & Sing / Auto / Broadcast live playback. */
export const TV_WATCH_WAIT_MS = 2800;
/** Unhurried interactive viewer pause in Play Together episode playback when default waitMs is kept. */
export const TV_PLAY_WAIT_MS = 3400;
/** Calm bedtime viewer pause in Wind-down episode playback when default waitMs is kept. */
export const TV_WIND_DOWN_WAIT_MS = 4400;

export interface EpisodeDirectorOptions {
  /** Overrides every beat's waitMs (the parent "waiting time" setting). */
  readonly waitMs?: number;
  /** Default broadcast PAUSE duration in ms when `beat.pauseMs` is omitted (e.g. `show.pauseMs`). */
  readonly pauseMsOverride?: number;
  /** Use each beat's reducedMotionStage when it has one. */
  readonly reducedMotion?: boolean;
  /**
   * Live YouTube-Kids TV pacing for episodes and multi-segment shows: adds natural
   * scene-establishing breaths, sentence/speaker turn gaps, and calm post-beat holds
   * while preserving full song durations, static validators, and deterministic QA renders.
   */
  readonly tvPacing?: boolean;
  /** Optional scene-establishing lead-in (ms) before Beat 0 speaks (defaults to `TV_OPENING_LEAD_IN_MS` when `tvPacing` is true). */
  readonly leadInMs?: number;
  /**
   * Recorded line duration in ms; undefined means the 2600 ms fallback. The
   * director moves to the next line after this much TICK time even when no
   * LINE_DONE arrives, so include any grace you want for recorded clips.
   */
  readonly lineMs?: LineMs;
}

export interface EpisodeDirector {
  send(event: DirectorEvent): DirectorEffect[];
  snapshot(): DirectorSnapshot;
}

/** The director plus live parent-setting changes (applied from the next beat or wait). */
export interface EpisodeDirectorControls extends EpisodeDirector {
  /** Reduced motion changed in the parent panel; applies to beats that start later. */
  setReducedMotion(on: boolean): void;
  /** Waiting time changed in the parent panel; applies to waits that start later (undefined = authored waits). */
  setWaitMs(waitMs: number | undefined): void;
  /** Total duration (ms) of the currently active wait/turn step, or 0 when not waiting. */
  currentWaitDurationMs?(): number;
}

/** A tap or confirm this soon (in story time) after an accepted one is ignored. */
export const TAP_GUARD_MS = 300;

/** Belt-and-braces bound on steps completed inside one TICK. */
const MAX_STEPS_PER_TICK = 100000;

type Part = "main" | "response";
type Step = "line" | "gap" | "hold" | "wait" | "none";
type ActivePhase = "speaking" | "holding" | "waiting" | "responding";

function isActive(phase: DirectorPhase): phase is ActivePhase {
  return phase === "speaking" || phase === "holding" || phase === "waiting" || phase === "responding";
}

function hasMovementStageAction(actions: readonly StageAction[]): boolean {
  return actions.some(
    (action) =>
      action.do === "enter" ||
      action.do === "exit" ||
      action.do === "move" ||
      action.do === "carry" ||
      action.do === "ride"
  );
}

export function createEpisodeDirector(story: StorySpec, options: EpisodeDirectorOptions = {}): EpisodeDirectorControls {
  const lineMs = options.lineMs;
  const pauseMsOverride = options.pauseMsOverride;
  const tvPacing = options.tvPacing === true;
  const openingLeadInMs =
    options.leadInMs !== undefined ? finiteMs(options.leadInMs) : tvPacing ? TV_OPENING_LEAD_IN_MS : 0;
  let reducedMotion = options.reducedMotion === true;
  let waitOverride = options.waitMs;

  let phase: DirectorPhase = "idle";
  let pausedFrom: ActivePhase | null = null;
  let mode: PlayMode | null = null;
  let cursor: BeatCursor | null = null;
  let beat: BeatSpec | null = null;
  let beatIndex = -1;
  let round = 0;
  let part: Part = "main";
  let step: Step = "none";
  let lines: readonly LineRef[] = [];
  let lineIndex = 0;
  let stepElapsedMs = 0;
  let stepDurationMs = 0;
  let holdMs = 0;
  let activeStageActions: readonly StageAction[] = [];
  let currentTurnDurationMs = 0;
  let turn: TurnTaking | null = null;
  let targets: readonly string[] = [];
  let broadcastPauseActive = false;
  let moreChosen = false;
  let elapsedMs = 0;
  let taps = 0;
  let lastAcceptedAt: number | null = null;
  let lineDoneWhilePaused = false;
  let finishedReason: "complete" | "all-done" | null = null;

  function effectiveHoldMs(list: readonly LineRef[], hold: number): number {
    const raw = finiteMs(hold);
    if (!tvPacing) return raw;
    if (activeStageActions.some((action) => action.do === "song")) return raw;
    if (list.length === 0) return Math.min(raw, TV_SILENT_BEAT_MAX_HOLD_MS);
    if (part === "main" && beat && beatWaitsInMode(beat, mode)) return Math.min(raw, TV_PRE_TURN_HOLD_MS);
    if (part === "main" && beat?.kind === "outro") return Math.min(raw, TV_OUTRO_HOLD_MS);
    const cap = hasMovementStageAction(activeStageActions) ? TV_ACTION_HOLD_MS : TV_POST_LINE_HOLD_MS;
    return Math.min(raw, cap);
  }

  function effectiveWaitMs(b: BeatSpec): number {
    const isBroadcast = mode === "broadcast";
    if (!tvPacing) return isBroadcast ? beatBroadcastPauseMs(b, pauseMsOverride) : beatWaitMs(b, waitOverride);
    if (waitOverride !== undefined) return beatWaitMs(b, waitOverride);
    if (mode === "wind-down") return Math.min(beatWaitMs(b, undefined), TV_WIND_DOWN_WAIT_MS);
    if (mode === "play-together") return Math.min(beatWaitMs(b, undefined), TV_PLAY_WAIT_MS);
    const base = isBroadcast ? beatBroadcastPauseMs(b, pauseMsOverride) : beatWaitMs(b, undefined);
    return Math.min(base, TV_WATCH_WAIT_MS);
  }

  function finish(reason: "complete" | "all-done", out: DirectorEffect[]): void {
    phase = "finished";
    finishedReason = reason;
    step = "none";
    pausedFrom = null;
    turn?.cancel();
    currentTurnDurationMs = 0;
    targets = [];
    out.push({ type: "finished", reason });
    out.push({ type: "offline", key: story.offlinePlayKey });
  }

  function startBeat(out: DirectorEffect[]): void {
    const next = cursor ? beatAt(story, cursor) : null;
    if (!cursor || !next) {
      finish("complete", out);
      return;
    }
    beat = next;
    beatIndex += 1;
    round = cursor.round;
    part = "main";
    turn = null;
    currentTurnDurationMs = 0;
    targets = [];
    const actions = beatStage(next, reducedMotion);
    activeStageActions = actions;
    out.push({ type: "stage", actions });
    out.push({ type: "caregiver", key: next.caregiverPromptKey ?? null });
    startLines(next.lines, next.holdMs, out);
  }

  function startLines(list: readonly LineRef[], hold: number, out: DirectorEffect[]): void {
    lines = list;
    lineIndex = 0;
    holdMs = effectiveHoldMs(list, hold);
    if (lines.length > 0) {
      if (beatIndex === 0 && part === "main" && openingLeadInMs > 0) {
        step = "gap";
        stepElapsedMs = 0;
        stepDurationMs = openingLeadInMs;
        lineDoneWhilePaused = false;
        phase = "speaking";
        return;
      }
      startLine(out);
    } else {
      startHold(out);
    }
  }

  function startLine(out: DirectorEffect[]): void {
    const line = lines[lineIndex];
    if (!line) {
      startHold(out);
      return;
    }
    step = "line";
    stepElapsedMs = 0;
    stepDurationMs = lineDurationMs(line.key, lineMs);
    lineDoneWhilePaused = false;
    phase = part === "response" ? "responding" : "speaking";
    out.push({ type: "speak", line });
  }

  function lineFinished(out: DirectorEffect[]): void {
    const prevSpeaker = lines[lineIndex]?.speaker;
    lineIndex += 1;
    if (lineIndex < lines.length) {
      if (tvPacing) {
        const nextSpeaker = lines[lineIndex]?.speaker;
        const gapMs =
          prevSpeaker !== undefined && nextSpeaker !== undefined && prevSpeaker !== nextSpeaker
            ? TV_SPEAKER_CHANGE_GAP_MS
            : TV_SAME_SPEAKER_GAP_MS;
        step = "gap";
        stepElapsedMs = 0;
        stepDurationMs = gapMs;
        lineDoneWhilePaused = false;
        phase = part === "response" ? "responding" : "speaking";
        return;
      }
      startLine(out);
    } else {
      startHold(out);
    }
  }

  function startHold(out: DirectorEffect[]): void {
    step = "hold";
    stepElapsedMs = 0;
    stepDurationMs = holdMs;
    phase = part === "response" ? "responding" : "holding";
    if (stepDurationMs <= 0) holdFinished(out);
  }

  function clearBroadcastPause(out: DirectorEffect[]): void {
    if (!broadcastPauseActive) return;
    broadcastPauseActive = false;
    out.push({ type: "broadcastPause", active: false, captionKey: null, targets: [] });
  }

  function holdFinished(out: DirectorEffect[]): void {
    if (part === "main" && beat && beatWaitsInMode(beat, mode)) startWait(beat, out);
    else endBeat(out);
  }

  function startWait(b: BeatSpec, out: DirectorEffect[]): void {
    const isBroadcast = mode === "broadcast";
    const waitDuration = effectiveWaitMs(b);
    const waiting = createTurnTaking(waitDuration);
    turn = waiting;
    currentTurnDurationMs = waitDuration;
    waiting.start();
    if (!waiting.state().active) {
      currentTurnDurationMs = 0;
      // A zero wait ends at once: no targets or pause cues flash on and off.
      playResponse("timeout", null, out);
      return;
    }
    step = "wait";
    phase = "waiting";
    if (isBroadcast) {
      targets = [];
      broadcastPauseActive = true;
      const pauseTargets = b.input && b.input.type !== "none" ? [...b.input.targets] : [];
      out.push({ type: "stage", actions: broadcastPauseStageActions(b, story) });
      out.push({
        type: "broadcastPause",
        active: true,
        captionKey: b.pauseCaptionKey ?? b.caregiverPromptKey ?? null,
        targets: pauseTargets
      });
      return;
    }
    targets = beatTargets(b);
    out.push({ type: "targets", targets });
  }

  function closeWait(by: TurnResolution, tappedTarget: string | null, out: DirectorEffect[]): void {
    targets = [];
    currentTurnDurationMs = 0;
    if (mode === "broadcast") {
      clearBroadcastPause(out);
    } else {
      out.push({ type: "targets", targets: null });
    }
    playResponse(by, tappedTarget, out);
  }

  function playResponse(by: TurnResolution, tappedTarget: string | null, out: DirectorEffect[]): void {
    step = "none";
    if (beat?.input?.type === "more-or-done") {
      moreChosen = mode === "broadcast" ? true : by !== "timeout";
    }
    const response = beat ? resolveBeatResponse(beat, by, tappedTarget) : null;
    if (response) {
      part = "response";
      activeStageActions = response.stage;
      out.push({ type: "stage", actions: response.stage });
      startLines(response.lines, response.holdMs, out);
    } else {
      endBeat(out);
    }
  }

  function endBeat(out: DirectorEffect[]): void {
    step = "none";
    turn?.cancel();
    const previous = cursor;
    cursor = previous ? nextCursor(story, previous, moreChosen) : null;
    // Each round starts with a fresh "more?" choice.
    if (cursor && previous && cursor.round !== previous.round) moreChosen = false;
    startBeat(out);
  }

  function remainingInStep(): number {
    if (step === "line" || step === "gap" || step === "hold") return Math.max(0, stepDurationMs - stepElapsedMs);
    if (step === "wait" && turn) return turn.remainingMs();
    return Number.POSITIVE_INFINITY;
  }

  function advance(dtMs: number, out: DirectorEffect[]): void {
    let remaining = dtMs;
    // Each pass either uses up the remaining time or completes one step, and
    // stories are finite, so the loop always ends; the guard is a backstop.
    for (let guard = 0; remaining > 0 && isActive(phase) && guard < MAX_STEPS_PER_TICK; guard += 1) {
      const need = remainingInStep();
      if (!Number.isFinite(need)) break;
      const used = Math.min(remaining, need);
      elapsedMs += used;
      remaining -= used;
      if (step === "wait" && turn) {
        const resolved = turn.tick(used);
        if (resolved) {
          closeWait(resolved, null, out);
        } else if (used >= need) {
          turn.cancel();
          closeWait("timeout", null, out);
        }
        continue;
      }
      stepElapsedMs += used;
      if (used < need) break;
      if (step === "line") lineFinished(out);
      else if (step === "gap") startLine(out);
      else holdFinished(out);
    }
  }

  function accept(source: TurnSource, tappedTarget: string | null, out: DirectorEffect[]): void {
    if (phase !== "waiting" || step !== "wait" || !turn) return;
    if (lastAcceptedAt !== null && elapsedMs - lastAcceptedAt < TAP_GUARD_MS) return;
    if (!turn.respond(source)) return;
    lastAcceptedAt = elapsedMs;
    if (source === "tap") taps += 1;
    closeWait(source, tappedTarget, out);
  }

  function send(event: DirectorEvent): DirectorEffect[] {
    const out: DirectorEffect[] = [];
    if (phase === "disposed") return out;

    if (event.type === "DISPOSE") {
      if (isActive(phase) || phase === "paused") {
        out.push({ type: "stopSpeech" });
        clearBroadcastPause(out);
        out.push({ type: "targets", targets: null });
      }
      turn?.cancel();
      step = "none";
      pausedFrom = null;
      targets = [];
      phase = "disposed";
      return out;
    }
    if (phase === "finished") return out;

    switch (event.type) {
      case "START": {
        if (phase !== "idle") return out;
        mode = event.mode;
        cursor = firstCursor(story);
        startBeat(out);
        return out;
      }
      case "TICK": {
        if (!isActive(phase) || !Number.isFinite(event.dtMs) || event.dtMs <= 0) return out;
        advance(event.dtMs, out);
        return out;
      }
      case "LINE_DONE": {
        if (step !== "line" || lines[lineIndex]?.key !== event.key) return out;
        if (phase === "paused") {
          lineDoneWhilePaused = true;
          return out;
        }
        if (isActive(phase)) lineFinished(out);
        return out;
      }
      case "TAP": {
        if (mode === "broadcast") return out;
        if (!targets.includes(event.target)) return out;
        accept("tap", event.target, out);
        return out;
      }
      case "PARENT_CONFIRM": {
        if (mode === "broadcast") return out;
        accept("parent", null, out);
        return out;
      }
      case "PAUSE": {
        if (!isActive(phase)) return out;
        pausedFrom = phase;
        phase = "paused";
        out.push({ type: "pauseMedia" });
        return out;
      }
      case "RESUME": {
        if (phase !== "paused" || !pausedFrom) return out;
        phase = pausedFrom;
        pausedFrom = null;
        out.push({ type: "resumeMedia" });
        if (lineDoneWhilePaused && step === "line") {
          lineDoneWhilePaused = false;
          lineFinished(out);
        }
        return out;
      }
      case "SKIP_BEAT": {
        // Ignored while paused or before START: resume first.
        if (!isActive(phase)) return out;
        out.push({ type: "stopSpeech" });
        if (step === "wait") {
          turn?.cancel();
          targets = [];
          clearBroadcastPause(out);
          out.push({ type: "targets", targets: null });
        }
        endBeat(out);
        return out;
      }
      case "ALL_DONE": {
        out.push({ type: "stopSpeech" });
        clearBroadcastPause(out);
        out.push({ type: "targets", targets: null });
        finish("all-done", out);
        return out;
      }
      case "AUDIO_UNAVAILABLE": {
        // Nothing to change: every line already ends on lineMs timing when no
        // LINE_DONE arrives, and "speak" effects still drive the captions.
        return out;
      }
      default:
        return out;
    }
  }

  function snapshot(): DirectorSnapshot {
    return {
      storyId: story.id,
      phase,
      mode,
      beatIndex,
      beatId: beat?.id ?? null,
      round,
      lineIndex,
      elapsedMs,
      waitedMs: turn?.state().waitedMs ?? 0,
      taps,
      finishedReason
    };
  }

  return {
    send,
    snapshot,
    setReducedMotion(on) {
      reducedMotion = on;
    },
    setWaitMs(waitMs) {
      waitOverride = waitMs;
    },
    currentWaitDurationMs() {
      return step === "wait" ? currentTurnDurationMs : 0;
    }
  };
}
