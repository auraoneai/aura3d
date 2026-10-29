// Beat runner (PRD 04 B02): beat order, stage selection and timing math,
// driven by the authored content rather than loose setTimeout webs. The
// episode director uses these helpers; tools and tests use them to estimate
// running time. Pure: no DOM, no clocks, no randomness.

import type { BeatSpec, LineRef, StageAction, StorySpec } from "../types.js";
import { normalizeWaitMs } from "./turn-taking.js";

/** Used when a line has no known recorded duration (or its audio failed). */
export const DEFAULT_LINE_MS = 2600;

/** Child-safety rule: never more than two tap targets at a time. */
export const MAX_TARGETS = 2;

export type BeatSection = "beats" | "intro" | "round" | "outro";

/**
 * Where the director is in a story. `round` is 0 for episodes and activity
 * intros, 1..roundLimit inside activity rounds, and the last round played
 * during an activity outro.
 */
export interface BeatCursor {
  readonly section: BeatSection;
  readonly index: number;
  readonly round: number;
}

/** Recorded line duration in ms, or undefined when unknown. */
export type LineMs = (key: string) => number | undefined;

/** Non-negative finite milliseconds; anything else becomes 0. */
export function finiteMs(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Duration of a line: the known recorded length, else the 2600 ms fallback. */
export function lineDurationMs(key: string, lineMs?: LineMs): number {
  const ms = lineMs?.(key);
  if (ms === undefined || !Number.isFinite(ms)) return DEFAULT_LINE_MS;
  return Math.max(0, ms);
}

/** How long a beat waits for a turn: the override (parent setting), else beat.waitMs, else 5000. */
export function beatWaitMs(beat: BeatSpec, override?: number): number {
  return normalizeWaitMs(override !== undefined && Number.isFinite(override) ? override : beat.waitMs);
}

/** True when the beat pauses for a turn (tap, parent confirm or timeout). */
export function beatWaits(beat: BeatSpec): boolean {
  return beat.input !== undefined && beat.input.type !== "none";
}

/** The beat's tap targets: unique, non-empty ids, at most MAX_TARGETS, in authored order. */
export function beatTargets(beat: BeatSpec): readonly string[] {
  if (beat.input === undefined || beat.input.type === "none") return [];
  const out: string[] = [];
  for (const id of beat.input.targets) {
    if (id.length === 0 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_TARGETS) break;
  }
  return out;
}

/**
 * Stage actions applied when a beat starts: `reducedMotionStage` replaces
 * `stage` when reduced motion is on, and the beat's camera preset (if any)
 * is applied first.
 */
export function beatStage(beat: BeatSpec, reducedMotion = false): readonly StageAction[] {
  const base = reducedMotion && beat.reducedMotionStage ? beat.reducedMotionStage : beat.stage;
  if (!beat.camera) return base;
  const camera: StageAction = { do: "camera", preset: beat.camera };
  return [camera, ...base];
}

/** Rounds an activity may play (0 for episodes or an invalid limit). */
export function roundLimitOf(story: StorySpec): number {
  if (story.kind !== "activity" || !Number.isFinite(story.roundLimit)) return 0;
  return Math.max(0, Math.floor(story.roundLimit));
}

export function sectionBeats(story: StorySpec, section: BeatSection): readonly BeatSpec[] {
  if (story.kind === "episode") return section === "beats" ? story.beats : [];
  if (section === "intro") return story.intro;
  if (section === "round") return story.round;
  if (section === "outro") return story.outro;
  return [];
}

export function beatAt(story: StorySpec, cursor: BeatCursor): BeatSpec | null {
  return sectionBeats(story, cursor.section)[cursor.index] ?? null;
}

/** Settle on the first real beat at or after the given position, skipping empty sections. */
function seek(story: StorySpec, section: BeatSection, index: number, round: number): BeatCursor | null {
  if (story.kind === "episode") {
    return index < story.beats.length ? { section: "beats", index, round: 0 } : null;
  }
  if (section === "intro") {
    if (index < story.intro.length) return { section, index, round: 0 };
    if (story.round.length > 0 && roundLimitOf(story) >= 1) return { section: "round", index: 0, round: 1 };
    return seek(story, "outro", 0, 0);
  }
  if (section === "round") {
    if (index < story.round.length && round >= 1 && round <= roundLimitOf(story)) return { section, index, round };
    return seek(story, "outro", 0, round);
  }
  if (section === "outro") {
    return index < story.outro.length ? { section, index, round } : null;
  }
  return null;
}

/** The first beat of a story, or null when it has none. */
export function firstCursor(story: StorySpec): BeatCursor | null {
  return story.kind === "episode" ? seek(story, "beats", 0, 0) : seek(story, "intro", 0, 0);
}

/**
 * The beat after `cursor`. At the end of an activity round, `more` (a tap or
 * parent confirm on the round's more-or-done beat) starts another round
 * until the round limit; otherwise the outro plays. Null at the story's end.
 */
export function nextCursor(story: StorySpec, cursor: BeatCursor, more: boolean): BeatCursor | null {
  if (story.kind === "episode") return seek(story, "beats", cursor.index + 1, 0);
  if (cursor.section === "round" && cursor.index + 1 >= story.round.length) {
    if (more && cursor.round < roundLimitOf(story)) return seek(story, "round", 0, cursor.round + 1);
    return seek(story, "outro", 0, cursor.round);
  }
  return seek(story, cursor.section, cursor.index + 1, cursor.round);
}

/**
 * Beats in play order. For activities, `round` is the number of rounds
 * played (clamped to 0..roundLimit; default roundLimit).
 */
export function storyBeats(story: StorySpec, round?: number): BeatSpec[] {
  if (story.kind === "episode") return [...story.beats];
  const limit = roundLimitOf(story);
  const rounds = round === undefined || !Number.isFinite(round) ? limit : Math.min(limit, Math.max(0, Math.floor(round)));
  const out: BeatSpec[] = [...story.intro];
  for (let r = 0; r < rounds; r += 1) out.push(...story.round);
  out.push(...story.outro);
  return out;
}

function linesMs(lines: readonly LineRef[], lineMs?: LineMs): number {
  let total = 0;
  for (const line of lines) total += lineDurationMs(line.key, lineMs);
  return total;
}

/** Time one beat takes on the silent path: no LINE_DONE, every wait runs to its timeout. */
export function estimateBeatMs(beat: BeatSpec, lineMs?: LineMs, waitMs?: number): number {
  let total = linesMs(beat.lines, lineMs) + finiteMs(beat.holdMs);
  if (beatWaits(beat)) total += beatWaitMs(beat, waitMs);
  if (beat.response) total += linesMs(beat.response.lines, lineMs) + finiteMs(beat.response.holdMs);
  return total;
}

/**
 * Silent-child running time in ms: no taps, no LINE_DONE, every wait times
 * out. Activities play one round (a more-or-done timeout goes to the outro).
 * `waitMs` mirrors the director's waitMs option (parent setting).
 */
export function estimateStoryMs(story: StorySpec, lineMs?: LineMs, waitMs?: number): number {
  let total = 0;
  for (const beat of storyBeats(story, 1)) total += estimateBeatMs(beat, lineMs, waitMs);
  return total;
}
