#!/usr/bin/env node
/// <reference types="node" />
// Static B.6 broadcast-episode & 9:16 Short validator (PRD 09 B.4, B.6, C.1-C.6, E.3, R1-R14).
//
// Usage:
//   ./node_modules/.bin/tsx tools/validate-show.ts --all [--locale en|pa|es|hi] [--allow-missing-audio] [--json]
//   ./node_modules/.bin/tsx tools/validate-show.ts --id <showId> [--locale en|pa|es|hi] [--allow-missing-audio] [--json]
//
// Programmatic entry:
//   runShowValidation(show, locale, opts) -> { ok, gates, repairPromptHints, stats, srtPreview }

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STORIES } from "../src/content/catalog.js";
import {
  AGE_BANDS,
  SHORT_SPEC,
  bannedEfficacyClaimsIn,
  checkSafetyFacts
} from "../src/content/calendar.js";
import {
  estimateShowMs,
  familyNamesIn,
  bannedPhrasesIn,
  validateShow,
  type AudioTables
} from "../src/content/schema.js";
import { SONGS, songLengthSec } from "../src/content/songs.js";
import { storyBeats } from "../src/runtime/beat-runner.js";
import { en } from "../src/localization/en/index.js";
import { paShowLocale } from "../src/localization/pa.js";
import { esShowLocale } from "../src/localization/es.js";
import { hiShowLocale } from "../src/localization/hi.js";
import type {
  BeatSpec,
  CameraPresetId,
  LineRef,
  LocalePack,
  ShowSegmentSpec,
  ShowSpec,
  SongId,
  StageAction,
  StorySpec
} from "../src/types.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKING_SUFFIX = "-wonder-world";

/** Dynamically derives the founder-child guard name from the working folder prefix without storing it in code. */
export function defaultGuardNames(rootDir: string = appRoot): readonly string[] {
  const folder = basename(rootDir);
  return folder.endsWith(WORKING_SUFFIX) && folder.length > WORKING_SUFFIX.length
    ? [folder.slice(0, -WORKING_SUFFIX.length)]
    : [];
}

export type ShowGateName =
  | "schema"
  | "language"
  | "banter"
  | "pacing"
  | "privacy"
  | "rights"
  | "captions"
  | "originality"
  | "safetyFacts";

export const SHOW_GATE_NAMES: readonly ShowGateName[] = [
  "schema",
  "language",
  "banter",
  "pacing",
  "privacy",
  "rights",
  "captions",
  "originality",
  "safetyFacts"
];

export interface ShowGateResult {
  readonly ok: boolean;
  readonly errors: string[];
}

export interface SrtCue {
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly kind: "line" | "pause";
  readonly key: string;
  readonly rawText: string;
  readonly renderedText: string;
}

export interface ShowValidationReport {
  readonly showId: string;
  readonly code: string;
  readonly locale: string;
  readonly ok: boolean;
  readonly gates: Record<ShowGateName, ShowGateResult>;
  readonly repairPromptHints: string[];
  readonly stats: {
    readonly computedDurationSec: number;
    readonly declaredDurationSec: number;
    readonly pauseCount: number;
    readonly cameraCuts: number;
    readonly cameraCutsPerMin: number;
    readonly maxLineWordsSeen: number;
    readonly cueCount: number;
  };
  readonly srtPreview: string;
}

export interface RunShowValidationOptions {
  readonly audio?: AudioTables;
  readonly requireAudio?: boolean;
  readonly allowMissingAudio?: boolean;
  readonly guardNames?: readonly string[];
  readonly catalogStories?: readonly StorySpec[];
  readonly catalogShows?: readonly ShowSpec[];
  readonly provenanceDir?: string;
}

const SHERU_BARK_TOKENS: ReadonlySet<string> = new Set([
  "woof", "arf", "yip", "aroo", "ruff", "huff", "bow", "wow"
]);

const SHERU_BARK_SFX: ReadonlySet<string> = new Set([
  "woof", "woofSoft", "woofDouble", "yip", "arf", "pant", "sniffs", "huff", "aroo"
]);

const RECURRING_RITUAL_SONGS: readonly SongId[] = [
  "wonderTheme", "wonderThemeShort", "hello", "allDone", "starlightHum"
];

const MOCKING_BANTER_PATTERN =
  /\b(?:you(?:'re|\s+are)\s+(?:dumb|stupid|bad|slow|weird|annoying|wrong)|nobody\s+likes|go\s+away|loser)\b/i;

const PRIVACY_CTA_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "subscribe", pattern: /\bsubscribe\b/i },
  { label: "smash like / like button", pattern: /\b(?:smash\s+like|hit\s+(?:the\s+)?like|like\s+and\s+share)\b/i },
  { label: "notification bell", pattern: /\b(?:hit|ring|tap)\s+the\s+bell\b/i },
  { label: "link in bio", pattern: /\blink\s+in\s+bio\b/i },
  { label: "buy now / shop", pattern: /\b(?:buy\s+now|shop\s+now|order\s+now)\b/i },
  { label: "merch", pattern: /\bmerch(?:andise)?\b/i },
  { label: "leave a comment", pattern: /\b(?:leave|write|type|drop)\s+a\s+comment\b/i },
  { label: "ask personal info", pattern: /\b(?:what(?:'s|\s+is)\s+your\s+(?:name|address)|how\s+old\s+are\s+you|tell\s+us\s+where\s+you\s+live)\b/i }
];

const EXTERNAL_URL_PATTERN = /\bhttps?:\/\/[^\s)>"]+|\bwww\.[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Counts spoken words in a dialogue line, ignoring bracketed vocal notes (`[yawn]`),
 * standalone ellipses (`...`, `…`), dashes, and punctuation across Latin, Gurmukhi,
 * and Devanagari scripts.
 */
export function countSpokenWords(text: string): number {
  const withoutBrackets = text.replace(/\[[^\]]*\]/g, " ");
  const separated = withoutBrackets
    .replace(/\u2026|\.{2,}|[\u2013\u2014]/g, " ")
    .trim();
  if (separated === "") return 0;
  return separated
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}

function isSheruBarkOnly(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "") return false;
  return normalized.split(" ").every((token) => {
    if (SHERU_BARK_TOKENS.has(token)) return true;
    return [...SHERU_BARK_TOKENS].some(
      (bark) =>
        token.length > bark.length &&
        token.startsWith(bark) &&
        [...token.slice(bark.length)].every((ch) => ch === bark.slice(-1))
    );
  });
}

function isPauseBeat(beat: BeatSpec): boolean {
  return beat.kind === "invite" || (beat.input !== undefined && beat.input.type !== "none");
}

function lineDurationMs(key: string, locale: LocalePack, audio?: AudioTables): number {
  const recorded = audio?.lines[key]?.durationMs;
  if (recorded !== undefined && Number.isFinite(recorded) && recorded > 0) return recorded;
  const text = locale.lines[key] ?? "";
  const words = Math.max(1, countSpokenWords(text));
  return Math.min(8000, Math.max(1500, 900 + words * 380));
}

function transitionDurationMs(seg: ShowSegmentSpec, index: number): number {
  if (index === 0) return 0;
  if (seg.transitionIn === "train") return 1500;
  if (seg.transitionIn === "fade") return 800;
  return 0;
}

function beatBroadcastDurationMs(beat: BeatSpec, show: ShowSpec, locale: LocalePack, audio?: AudioTables): number {
  let total = beat.lines.reduce((sum, l) => sum + lineDurationMs(l.key, locale, audio), 0);
  total += Number.isFinite(beat.holdMs) && beat.holdMs > 0 ? beat.holdMs : 0;
  if (isPauseBeat(beat)) {
    const pause = beat.pauseMs !== undefined && Number.isFinite(beat.pauseMs) ? beat.pauseMs : show.pauseMs;
    total += pause > 0 ? pause : 2500;
  }
  if (beat.response) {
    total += beat.response.lines.reduce((sum, l) => sum + lineDurationMs(l.key, locale, audio), 0);
    total += Number.isFinite(beat.response.holdMs) && beat.response.holdMs > 0 ? beat.response.holdMs : 0;
  }
  // Account for sung song duration when beat holds a song with short post-song holdMs.
  for (const action of beat.stage) {
    if (action.do === "song" && Object.prototype.hasOwnProperty.call(SONGS, action.song)) {
      const songSpec = SONGS[action.song];
      if (songSpec.vocal === "sung") {
        const recordedSongMs = audio?.songs[action.song]?.durationMs;
        const songMs =
          recordedSongMs !== undefined && Number.isFinite(recordedSongMs) && recordedSongMs > 0
            ? recordedSongMs
            : songLengthSec(songSpec) * 1000;
        if (total < songMs) total = songMs;
      }
    }
  }
  return total;
}

export function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const mins = Math.floor((clamped % 3_600_000) / 60_000);
  const secs = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const pad3 = (n: number): string => String(n).padStart(3, "0");
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)},${pad3(millis)}`;
}

/**
 * Builds deterministic broadcast SRT cues (including `[pause: ...]` caregiver cues
 * at every invite/PAUSE beat) and formats the `.srt` text.
 */
export function buildShowSrt(
  show: ShowSpec,
  locale: LocalePack,
  opts: { readonly audio?: AudioTables } = {}
): { readonly srt: string; readonly cues: readonly SrtCue[] } {
  const cues: SrtCue[] = [];
  let cursorMs = 0;

  const pushCue = (kind: "line" | "pause", key: string, rawText: string, renderedText: string, durationMs: number): void => {
    const startMs = cursorMs;
    const safeDur = Math.max(400, Math.round(durationMs));
    const endMs = startMs + safeDur;
    cues.push({
      index: cues.length + 1,
      startMs,
      endMs,
      kind,
      key,
      rawText,
      renderedText
    });
    cursorMs = endMs + 40;
  };

  show.segments.forEach((segment, segIdx) => {
    cursorMs += transitionDurationMs(segment, segIdx);
    for (const beat of segment.beats) {
      for (const line of beat.lines) {
        const raw = locale.lines[line.key] ?? "";
        const dur = lineDurationMs(line.key, locale, opts.audio);
        pushCue("line", line.key, raw, raw.trim(), dur);
      }
      if (Number.isFinite(beat.holdMs) && beat.holdMs > 0) {
        cursorMs += beat.holdMs;
      }
      if (isPauseBeat(beat)) {
        const pauseMs =
          beat.pauseMs !== undefined && Number.isFinite(beat.pauseMs) && beat.pauseMs > 0
            ? beat.pauseMs
            : show.pauseMs > 0
              ? show.pauseMs
              : 2500;
        const customPause = beat.pauseCaptionKey ? locale.strings[beat.pauseCaptionKey] : undefined;
        const rawPause = (customPause ?? "pause: wait and answer together").trim();
        const bracketed =
          rawPause.startsWith("[") && rawPause.endsWith("]")
            ? rawPause
            : rawPause.toLowerCase().startsWith("pause:")
              ? `[${rawPause}]`
              : `[pause: ${rawPause}]`;
        pushCue("pause", beat.pauseCaptionKey ?? `${show.code}.${beat.id}.pause`, rawPause, bracketed, Math.max(800, pauseMs - 80));
      }
      if (beat.response) {
        for (const line of beat.response.lines) {
          const raw = locale.lines[line.key] ?? "";
          const dur = lineDurationMs(line.key, locale, opts.audio);
          pushCue("line", line.key, raw, raw.trim(), dur);
        }
        if (Number.isFinite(beat.response.holdMs) && beat.response.holdMs > 0) {
          cursorMs += beat.response.holdMs;
        }
      }
    }
  });

  const srt = cues
    .map((cue) => `${cue.index}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.renderedText}`)
    .join("\n\n");

  return { srt, cues };
}

function collectSegmentLines(segment: ShowSegmentSpec): LineRef[] {
  const out: LineRef[] = [];
  for (const beat of segment.beats) {
    out.push(...beat.lines);
    if (beat.response) out.push(...beat.response.lines);
    if (beat.responseByTarget) {
      for (const branch of Object.values(beat.responseByTarget)) {
        if (branch?.lines) out.push(...branch.lines);
      }
    }
  }
  return out;
}

function collectPrimaryPlayLines(show: ShowSpec): LineRef[] {
  const out: LineRef[] = [];
  for (const seg of show.segments) {
    for (const beat of seg.beats) {
      out.push(...beat.lines);
      if (beat.response) out.push(...beat.response.lines);
    }
  }
  return out;
}

function collectSegmentActions(segment: ShowSegmentSpec): StageAction[] {
  const out: StageAction[] = [];
  const pushAll = (actions: readonly StageAction[] | undefined): void => {
    for (const a of actions ?? []) {
      out.push(a);
      if (a.do === "song") {
        for (const cue of a.cues ?? []) pushAll(cue.stage);
      }
    }
  };
  for (const beat of segment.beats) {
    pushAll(beat.stage);
    pushAll(beat.reducedMotionStage);
    pushAll(beat.response?.stage);
    for (const branch of Object.values(beat.responseByTarget ?? {})) {
      pushAll(branch?.stage);
    }
  }
  return out;
}

function normalizeForOriginality(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSubstantiveLinesAndFourGrams(lines: readonly string[]): {
  readonly lineSet: ReadonlySet<string>;
  readonly fourGrams: ReadonlySet<string>;
} {
  const lineSet = new Set<string>();
  const words: string[] = [];
  for (const raw of lines) {
    const norm = normalizeForOriginality(raw);
    if (norm === "") continue;
    const tokens = norm.split(" ").filter(Boolean);
    if (tokens.length >= 3) lineSet.add(norm);
    words.push(...tokens);
  }
  const fourGrams = new Set<string>();
  for (let i = 0; i + 4 <= words.length; i += 1) {
    fourGrams.add(words.slice(i, i + 4).join(" "));
  }
  return { lineSet, fourGrams };
}

function overlapFraction(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) shared += 1;
  }
  return shared / a.size;
}

function storySpokenTexts(story: StorySpec, locale: LocalePack): string[] {
  const out: string[] = [];
  for (const beat of storyBeats(story)) {
    for (const l of beat.lines) {
      const t = locale.lines[l.key];
      if (t) out.push(t);
    }
    for (const l of beat.response?.lines ?? []) {
      const t = locale.lines[l.key];
      if (t) out.push(t);
    }
  }
  return out;
}

function showNarrativeSpokenTexts(show: ShowSpec, locale: LocalePack): string[] {
  const out: string[] = [];
  for (const seg of show.segments) {
    if (seg.template === "theme" || seg.template === "goodbye") continue;
    for (const line of collectSegmentLines(seg)) {
      const t = locale.lines[line.key];
      if (t) out.push(t);
    }
  }
  if (out.length === 0) {
    for (const seg of show.segments) {
      for (const line of collectSegmentLines(seg)) {
        const t = locale.lines[line.key];
        if (t) out.push(t);
      }
    }
  }
  return out;
}

function readProvenanceRecord(file: string): Record<string, Record<string, unknown>> {
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        out[k] = Object.fromEntries(Object.entries(v));
      }
    }
    return out;
  } catch {
    return {};
  }
}

function guardNameRegexes(guardNames: readonly string[]): RegExp[] {
  return guardNames
    .filter((n) => n.trim().length > 0)
    .map(
      (name) =>
        new RegExp(
          `(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9]|${WORKING_SUFFIX})`,
          "i"
        )
    );
}

/**
 * Runs all 9 static B.6 QC gates (`schema`, `language`, `banter`, `pacing`,
 * `privacy`, `rights`, `captions`, `originality`, `safetyFacts`) on a `ShowSpec`
 * and returns per-gate results plus actionable `repairPromptHints` for `write-show.ts`.
 */
export function runShowValidation(
  show: ShowSpec,
  locale: LocalePack,
  opts: RunShowValidationOptions = {}
): ShowValidationReport {
  const guardNames = opts.guardNames ?? defaultGuardNames();
  const requireAudio =
    opts.allowMissingAudio === true ? false : opts.requireAudio === true ? true : opts.allowMissingAudio === false;

  const isShort = (show.aspect ?? "16:9") === "9:16";
  const bandSpec = AGE_BANDS[show.band] ?? AGE_BANDS.toddler;

  // 1. Gate: schema (validateShow, routing review.* messages to the rights gate).
  const rawSchemaIssues = validateShow(show, locale, {
    audio: opts.audio,
    requireAudio,
    guardNames
  });
  const schemaErrors = rawSchemaIssues
    .filter((issue) => !issue.message.startsWith("review."))
    .map((issue) => issue.message);

  // Gather all lines & strings referenced by this show.
  const allSegmentLines = show.segments.flatMap((seg) =>
    collectSegmentLines(seg).map((line) => ({ segId: seg.id, line }))
  );
  const allShowActions = show.segments.flatMap((seg) => collectSegmentActions(seg));

  // 2. Gate: language (word-per-line cap per AGE_BANDS, banned child-safety phrases, family/guard names).
  const languageErrors: string[] = [];
  const maxWordsCap = bandSpec.maxWordsPerLine;
  let maxLineWordsSeen = 0;

  for (const { segId, line } of allSegmentLines) {
    const text = locale.lines[line.key];
    if (text === undefined) continue;
    const wordCount = countSpokenWords(text);
    if (wordCount > maxLineWordsSeen) maxLineWordsSeen = wordCount;
    if (wordCount > maxWordsCap) {
      languageErrors.push(
        `segment "${segId}" line ${line.key} has ${wordCount} spoken words ("${text}"); ${show.band} band cap is ${maxWordsCap}`
      );
    }
    if (locale.locale === "en") {
      for (const banned of bannedPhrasesIn(text)) {
        languageErrors.push(`segment "${segId}" line ${line.key} uses banned phrase "${banned}"`);
      }
    }
    for (const fam of familyNamesIn(text, guardNames)) {
      languageErrors.push(`segment "${segId}" line ${line.key} uses family or guard name "${fam}"`);
    }
  }

  // 3. Gate: banter (Sheru bark-only, >= 2 cast characters interact in long shows, host speaks in opening & goodbye).
  const banterErrors: string[] = [];
  const distinctCast = new Set<string>();
  const activeCast = new Set<string>();

  for (const seg of show.segments) {
    for (const member of seg.cast) distinctCast.add(member.id);
    for (const action of collectSegmentActions(seg)) {
      if (
        (action.do === "gesture" || action.do === "enter" || action.do === "move" || action.do === "carry" || action.do === "ride") &&
        distinctCast.has(action.actor)
      ) {
        activeCast.add(action.actor);
      }
      if (action.do === "sfx" && SHERU_BARK_SFX.has(action.sound) && distinctCast.has("sheru")) {
        activeCast.add("sheru");
      }
    }
  }

  for (const { segId, line } of allSegmentLines) {
    if (line.speaker !== "narrator" && line.speaker !== "robot") activeCast.add(line.speaker);
    const text = locale.lines[line.key] ?? "";
    if (line.speaker === "sheru") {
      if (!isSheruBarkOnly(text)) {
        banterErrors.push(
          `segment "${segId}" line ${line.key} ("${text}") gives spoken words to Sheru; Sheru only barks ("Woof!" or bark SFX)`
        );
      }
    }
    if (locale.locale === "en" && MOCKING_BANTER_PATTERN.test(text)) {
      banterErrors.push(`segment "${segId}" line ${line.key} ("${text}") mocks or puts down a character`);
    }
  }

  if (!isShort) {
    if (distinctCast.size < 2 || activeCast.size < 2) {
      banterErrors.push(
        `long show must have at least 2 cast characters interacting on stage (found ${activeCast.size} active of ${distinctCast.size} cast)`
      );
    }
    if (show.segments.length > 0) {
      const openingSegs = show.segments.slice(0, Math.min(2, show.segments.length));
      const closingSegs = show.segments.slice(Math.max(0, show.segments.length - 2));
      const hostInOpening = openingSegs.some((seg) =>
        collectSegmentLines(seg).some((l) => l.speaker === show.host)
      );
      const hostInClosing = closingSegs.some((seg) =>
        collectSegmentLines(seg).some((l) => l.speaker === show.host)
      );
      if (!hostInOpening) {
        banterErrors.push(`host "${show.host}" must speak in the opening segments (${openingSegs.map((s) => s.id).join(", ")})`);
      }
      if (!hostInClosing) {
        banterErrors.push(`host "${show.host}" must speak in the goodbye segments (${closingSegs.map((s) => s.id).join(", ")})`);
      }
    }
  }

  // 4. Gate: pacing (camera cuts/min, PAUSE count & minPauseMs, beat >= 1.5s, duration within band).
  const pacingErrors: string[] = [];
  let pauseCount = 0;
  let cameraCuts = 0;
  let totalDetailedMs = 0;

  show.segments.forEach((seg, segIdx) => {
    totalDetailedMs += transitionDurationMs(seg, segIdx);
    if (segIdx > 0 && seg.transitionIn !== "none") cameraCuts += 1;
    let prevCam: CameraPresetId | null = null;
    for (const beat of seg.beats) {
      let beatCam: CameraPresetId | null = beat.camera ?? null;
      for (const action of beat.stage) {
        if (action.do === "camera") beatCam = action.preset;
      }
      if (beatCam !== null) {
        if (prevCam !== null && beatCam !== prevCam) cameraCuts += 1;
        prevCam = beatCam;
      }
      const beatMs = beatBroadcastDurationMs(beat, show, locale, opts.audio);
      totalDetailedMs += beatMs;
      if (beatMs < 1500) {
        pacingErrors.push(`segment "${seg.id}" beat "${beat.id}" lasts ${beatMs} ms; beats must be at least 1500 ms`);
      }
      if (isPauseBeat(beat)) {
        pauseCount += 1;
        const effectivePauseMs =
          beat.pauseMs !== undefined && Number.isFinite(beat.pauseMs) ? beat.pauseMs : show.pauseMs;
        if (effectivePauseMs < bandSpec.minPauseMs) {
          pacingErrors.push(
            `segment "${seg.id}" beat "${beat.id}" PAUSE is ${effectivePauseMs} ms; ${show.band} band requires >= ${bandSpec.minPauseMs} ms`
          );
        }
      }
    }
  });

  if (show.endCardSec !== undefined && Number.isFinite(show.endCardSec) && show.endCardSec > 0) {
    totalDetailedMs += show.endCardSec * 1000;
  }

  const schemaEstimatedMs = estimateShowMs(show, locale, { audio: opts.audio });
  const computedDurationSec = Math.round(Math.max(totalDetailedMs, schemaEstimatedMs) / 1000);
  const minPausesRequired = isShort ? SHORT_SPEC.minPauses : bandSpec.minPauses;

  if (pauseCount < minPausesRequired) {
    pacingErrors.push(
      `show has ${pauseCount} PAUSE (invite) beat(s); ${isShort ? "Shorts" : `${show.band} long shows`} require at least ${minPausesRequired}`
    );
  }

  const durationMin = Math.max(computedDurationSec, 1) / 60;
  const cameraCutsPerMin = Number((cameraCuts / durationMin).toFixed(2));
  if (cameraCutsPerMin > bandSpec.maxCutsPerMin) {
    pacingErrors.push(
      `camera cut rate is ${cameraCutsPerMin}/min (${cameraCuts} cuts over ${computedDurationSec} s); ${show.band} band cap is ${bandSpec.maxCutsPerMin}/min`
    );
  }

  const [minDurSec, maxDurSec] = isShort ? SHORT_SPEC.durationSec : bandSpec.durationSec;
  if (computedDurationSec < minDurSec || computedDurationSec > maxDurSec) {
    pacingErrors.push(
      `computed duration ${computedDurationSec} s is outside ${isShort ? "Short" : `${show.band} band`} window ${minDurSec}-${maxDurSec} s`
    );
  }
  if (show.estimatedDurationSec < minDurSec || show.estimatedDurationSec > maxDurSec) {
    pacingErrors.push(
      `estimatedDurationSec ${show.estimatedDurationSec} s is outside ${isShort ? "Short" : `${show.band} band`} window ${minDurSec}-${maxDurSec} s`
    );
  }

  // 5. Gate: privacy (zero child data, zero family names, zero external URLs, zero subscribe/buy CTAs).
  const privacyErrors: string[] = [];
  const guardPatterns = guardNameRegexes(guardNames);

  const inspectPrivacyText = (label: string, text: string, allowRelativeOrPlaceholderUrl = false): void => {
    for (const rx of guardPatterns) {
      if (rx.test(text)) {
        privacyErrors.push(`${label} contains guarded child identity`);
      }
    }
    for (const fam of familyNamesIn(text, guardNames)) {
      privacyErrors.push(`${label} uses family or child name "${fam}"`);
    }
    if (/\{name\}|\bWELCOME_NAME\b/.test(text)) {
      privacyErrors.push(`${label} leaks personalized welcome name token`);
    }
    const urls = text.match(EXTERNAL_URL_PATTERN) ?? [];
    if (urls.length > 0 && !allowRelativeOrPlaceholderUrl) {
      privacyErrors.push(`${label} contains external URL (${urls[0]})`);
    } else if (urls.length > 0 && allowRelativeOrPlaceholderUrl) {
      for (const url of urls) {
        if (guardPatterns.some((rx) => rx.test(url))) {
          privacyErrors.push(`${label} URL exposes guarded child name`);
        }
        if (!/^https:\/\/aura3d\.auraone\.ai\b/i.test(url)) {
          privacyErrors.push(`${label} contains disallowed external URL (${url})`);
        }
      }
    }
    for (const cta of PRIVACY_CTA_PATTERNS) {
      if (cta.pattern.test(text)) {
        privacyErrors.push(`${label} contains disallowed CTA or personal-data prompt (${cta.label})`);
      }
    }
  };

  inspectPrivacyText("show.id", show.id);
  inspectPrivacyText("show.code", show.code);
  inspectPrivacyText("show.review.reviewer", show.review.reviewer);

  const showStringEntries: [string, string | undefined][] = [
    [`string ${show.titleKey}`, locale.strings[show.titleKey]],
    [`string ${show.offlinePlayKey}`, locale.strings[show.offlinePlayKey]],
    [`string ${show.caregiverBridgeKey}`, locale.strings[show.caregiverBridgeKey]],
    ...show.chapters.map((ch): [string, string | undefined] => [`chapter ${ch.titleKey}`, locale.strings[ch.titleKey]])
  ];
  for (const seg of show.segments) {
    if (seg.titleKey) showStringEntries.push([`segment title ${seg.titleKey}`, locale.strings[seg.titleKey]]);
    for (const beat of seg.beats) {
      if (beat.caregiverPromptKey) {
        showStringEntries.push([`tip ${beat.caregiverPromptKey}`, locale.strings[beat.caregiverPromptKey]]);
      }
      if (beat.pauseCaptionKey) {
        showStringEntries.push([`pauseCaption ${beat.pauseCaptionKey}`, locale.strings[beat.pauseCaptionKey]]);
      }
    }
  }
  for (const [label, value] of showStringEntries) {
    if (value !== undefined) inspectPrivacyText(label, value);
  }
  for (const { line } of allSegmentLines) {
    inspectPrivacyText(`line key ${line.key}`, line.key);
    const text = locale.lines[line.key];
    if (text !== undefined) inspectPrivacyText(`line ${line.key}`, text);
  }
  if (show.youtube) {
    inspectPrivacyText("youtube.title", show.youtube.title);
    inspectPrivacyText("youtube.thumbnailTitle", show.youtube.thumbnailTitle);
    inspectPrivacyText("youtube.description", show.youtube.description, true);
    if (show.youtube.playlist) inspectPrivacyText("youtube.playlist", show.youtube.playlist);
  }

  // 6. Gate: rights (approved language & rights review + paid audio provenance check).
  const rightsErrors: string[] = [];
  if (show.review.language !== "approved") {
    rightsErrors.push(`review.language is "${String(show.review.language)}"; must be "approved"`);
  }
  if (show.review.rights !== "approved") {
    rightsErrors.push(`review.rights is "${String(show.review.rights)}"; must be "approved"`);
  }
  if (
    typeof show.review.reviewer !== "string" ||
    show.review.reviewer.trim() === "" ||
    /^(?:pending|pending-human|todo|tbd|none)$/i.test(show.review.reviewer.trim())
  ) {
    rightsErrors.push(`review.reviewer "${show.review.reviewer}" must name a real reviewer, not pending`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(show.review.date)) {
    rightsErrors.push(`review.date "${show.review.date}" must be YYYY-MM-DD`);
  }

  const provDir = opts.provenanceDir ?? join(appRoot, "provenance", "audio");
  if (existsSync(provDir)) {
    const songProv = readProvenanceRecord(join(provDir, "songs.json"));
    const bedProv = readProvenanceRecord(join(provDir, "beds.json"));
    const sfxProv = readProvenanceRecord(join(provDir, "sfx.json"));
    const lineProv = readProvenanceRecord(join(provDir, "lines.json"));

    const checkTier = (kind: string, id: string, table: Record<string, Record<string, unknown>>): void => {
      const rec = table[id];
      if (!rec) return;
      const tier = typeof rec["tier"] === "string" ? rec["tier"].toLowerCase() : "";
      if (tier === "free" || tier === "unlicensed") {
        rightsErrors.push(`${kind} "${id}" provenance tier is "${tier}"; commercial paid tier required`);
      }
    };

    for (const seg of show.segments) {
      if (seg.music) checkTier("music bed", seg.music, bedProv);
    }
    for (const action of allShowActions) {
      if (action.do === "song") checkTier("song", action.song, songProv);
      if (action.do === "music" && action.bed) checkTier("music bed", action.bed, bedProv);
      if (action.do === "sfx") checkTier("sfx", action.sound, sfxProv);
    }
    for (const { line } of allSegmentLines) {
      checkTier("line", line.key, lineProv);
    }
  }

  // 7. Gate: captions (build SRT preview with [pause: ...] cues, zero empty cues, monotonic timestamps, exact locale match).
  const captionsErrors: string[] = [];
  const { srt: srtPreview, cues } = buildShowSrt(show, locale, { audio: opts.audio });
  const primaryLines = collectPrimaryPlayLines(show);

  if (cues.length === 0) {
    captionsErrors.push("SRT preview produced zero caption cues");
  }
  let prevEndMs = 0;
  for (const cue of cues) {
    if (cue.renderedText.trim() === "") {
      captionsErrors.push(`SRT cue #${cue.index} (${cue.key}) has empty text`);
    }
    if (cue.startMs < prevEndMs) {
      captionsErrors.push(`SRT cue #${cue.index} (${cue.key}) starts at ${cue.startMs} ms before previous cue ended (${prevEndMs} ms)`);
    }
    if (cue.endMs <= cue.startMs) {
      captionsErrors.push(`SRT cue #${cue.index} (${cue.key}) endMs (${cue.endMs}) must exceed startMs (${cue.startMs})`);
    }
    prevEndMs = cue.endMs;
  }

  const lineCues = cues.filter((c) => c.kind === "line");
  if (lineCues.length !== primaryLines.length) {
    captionsErrors.push(`SRT has ${lineCues.length} spoken-line cues for ${primaryLines.length} primary spoken lines`);
  } else {
    primaryLines.forEach((line, idx) => {
      const cue = lineCues[idx];
      const expected = locale.lines[line.key];
      if (expected === undefined) {
        captionsErrors.push(`SRT cue for ${line.key} is missing locale text in "${locale.locale}"`);
      } else if (cue === undefined || cue.rawText !== expected || cue.renderedText !== expected.trim()) {
        captionsErrors.push(`SRT cue for ${line.key} does not exactly match locale.lines["${line.key}"]`);
      }
    });
  }

  const pauseCues = cues.filter((c) => c.kind === "pause");
  if (pauseCues.length !== pauseCount) {
    captionsErrors.push(`SRT has ${pauseCues.length} [pause: ...] cues for ${pauseCount} PAUSE beat(s)`);
  }
  for (const pc of pauseCues) {
    if (!/^\[pause:\s*.+\]$/i.test(pc.renderedText)) {
      captionsErrors.push(`PAUSE cue #${pc.index} ("${pc.renderedText}") must format as "[pause: ...]"`);
    }
  }

  // 8. Gate: originality (line-overlap and 4-gram similarity < 25% vs all 42 STORIES and other SHOWS).
  const originalityErrors: string[] = [];
  if (locale.locale === "en") {
    const ritualLyricLines = new Set<string>();
    for (const songId of RECURRING_RITUAL_SONGS) {
      for (const lyric of SONGS[songId].lyrics) {
        ritualLyricLines.add(normalizeForOriginality(lyric));
      }
    }

    const candidateRaw = showNarrativeSpokenTexts(show, locale).filter(
      (line) => !ritualLyricLines.has(normalizeForOriginality(line))
    );
    const candidateSig = extractSubstantiveLinesAndFourGrams(candidateRaw);

    const storiesToCompare = opts.catalogStories ?? STORIES;
    for (const story of storiesToCompare) {
      const refSig = extractSubstantiveLinesAndFourGrams(storySpokenTexts(story, en));
      const lineOverlap = candidateSig.lineSet.size >= 4 ? overlapFraction(candidateSig.lineSet, refSig.lineSet) : 0;
      const gramOverlap = candidateSig.fourGrams.size >= 6 ? overlapFraction(candidateSig.fourGrams, refSig.fourGrams) : 0;
      const worst = Math.max(lineOverlap, gramOverlap);
      if (worst >= 0.25) {
        originalityErrors.push(
          `shares ${(worst * 100).toFixed(1)}% lines/4-grams with story "${story.id}" (must be < 25%)`
        );
      }
    }

    const showsToCompare = opts.catalogShows ?? [];
    for (const other of showsToCompare) {
      if (other.id === show.id || other.code === show.code) continue;
      if (show.parentShowId !== undefined && show.parentShowId === other.id) continue;
      if (other.parentShowId !== undefined && other.parentShowId === show.id) continue;
      if (show.parentShowId !== undefined && other.parentShowId === show.parentShowId) continue;

      const refSig = extractSubstantiveLinesAndFourGrams(showNarrativeSpokenTexts(other, locale));
      const lineOverlap = candidateSig.lineSet.size >= 4 ? overlapFraction(candidateSig.lineSet, refSig.lineSet) : 0;
      const gramOverlap = candidateSig.fourGrams.size >= 6 ? overlapFraction(candidateSig.fourGrams, refSig.fourGrams) : 0;
      const worst = Math.max(lineOverlap, gramOverlap);
      if (worst >= 0.25) {
        originalityErrors.push(
          `shares ${(worst * 100).toFixed(1)}% lines/4-grams with show "${other.id}" (must be < 25%)`
        );
      }
    }
  }

  // 9. Gate: safetyFacts (BANNED_EFFICACY_CLAIMS + SAFETY_FACTS on lines, offline card, caregiver bridge, YouTube metadata).
  const safetyErrors: string[] = [];
  const checkSafetySurface = (
    label: string,
    text: string | undefined,
    context: "line" | "offline" | "bridge" | "metadata"
  ): void => {
    if (text === undefined || text.trim() === "") return;
    for (const claim of bannedEfficacyClaimsIn(text)) {
      safetyErrors.push(`${label} uses banned efficacy or marketing claim "${claim}"`);
    }
    for (const issue of checkSafetyFacts(text, { context })) {
      safetyErrors.push(`${label} [${issue.ruleId}]: ${issue.message}`);
    }
  };

  for (const { line } of allSegmentLines) {
    checkSafetySurface(`line ${line.key}`, locale.lines[line.key], "line");
  }
  checkSafetySurface(`offlinePlay (${show.offlinePlayKey})`, locale.strings[show.offlinePlayKey], "offline");
  checkSafetySurface(`caregiverBridge (${show.caregiverBridgeKey})`, locale.strings[show.caregiverBridgeKey], "bridge");
  checkSafetySurface(`title (${show.titleKey})`, locale.strings[show.titleKey], "metadata");
  for (const ch of show.chapters) {
    checkSafetySurface(`chapter (${ch.titleKey})`, locale.strings[ch.titleKey], "metadata");
  }
  if (show.youtube) {
    checkSafetySurface("youtube.title", show.youtube.title, "metadata");
    checkSafetySurface("youtube.description", show.youtube.description, "metadata");
    checkSafetySurface("youtube.thumbnailTitle", show.youtube.thumbnailTitle, "metadata");
  }

  const gates: Record<ShowGateName, ShowGateResult> = {
    schema: { ok: schemaErrors.length === 0, errors: schemaErrors },
    language: { ok: languageErrors.length === 0, errors: languageErrors },
    banter: { ok: banterErrors.length === 0, errors: banterErrors },
    pacing: { ok: pacingErrors.length === 0, errors: pacingErrors },
    privacy: { ok: privacyErrors.length === 0, errors: privacyErrors },
    rights: { ok: rightsErrors.length === 0, errors: rightsErrors },
    captions: { ok: captionsErrors.length === 0, errors: captionsErrors },
    originality: { ok: originalityErrors.length === 0, errors: originalityErrors },
    safetyFacts: { ok: safetyErrors.length === 0, errors: safetyErrors }
  };

  const ok = SHOW_GATE_NAMES.every((gate) => gates[gate].ok);

  const repairPromptHints: string[] = [];
  for (const gate of SHOW_GATE_NAMES) {
    const res = gates[gate];
    if (!res.ok) {
      for (const err of res.errors.slice(0, 8)) {
        repairPromptHints.push(`[${gate}] ${err}`);
      }
      if (res.errors.length > 8) {
        repairPromptHints.push(`[${gate}] ...and ${res.errors.length - 8} more ${gate} error(s)`);
      }
    }
  }

  return {
    showId: show.id,
    code: show.code,
    locale: locale.locale,
    ok,
    gates,
    repairPromptHints,
    stats: {
      computedDurationSec,
      declaredDurationSec: show.estimatedDurationSec,
      pauseCount,
      cameraCuts,
      cameraCutsPerMin,
      maxLineWordsSeen,
      cueCount: cues.length
    },
    srtPreview
  };
}

export function resolveShowLocalePack(localeCode: string): LocalePack {
  switch (localeCode) {
    case "en":
      return en;
    case "pa":
      return paShowLocale();
    case "es":
      return esShowLocale();
    case "hi":
      return hiShowLocale();
    default:
      throw new Error(`Unsupported locale "${localeCode}". Expected en, pa, es or hi.`);
  }
}

async function runCli(argv: readonly string[]): Promise<number> {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };
  const showId = getArg("--id");
  const runAll = argv.includes("--all") || showId === undefined;
  const localeCode = getArg("--locale") ?? "en";
  const allowMissingAudio = argv.includes("--allow-missing-audio");
  const requireAudioFlag = argv.includes("--require-audio");
  const jsonOut = argv.includes("--json");

  const { SHOWS } = await import("../src/content/shows/index.js");
  let audioManifest: AudioTables | undefined;
  try {
    const mod = await import("../src/audio-manifest.js");
    audioManifest = mod.AUDIO_MANIFEST;
  } catch {
    audioManifest = undefined;
  }

  const locale = resolveShowLocalePack(localeCode);
  const selectedShows: readonly ShowSpec[] = showId
    ? SHOWS.filter((s) => s.id === showId || s.code === showId)
    : runAll
      ? SHOWS
      : [];

  if (showId && selectedShows.length === 0) {
    const msg = `validate-show: show "${showId}" not found in SHOWS (${SHOWS.length} registered)`;
    if (jsonOut) {
      console.log(JSON.stringify({ ok: false, error: msg, reports: [] }, null, 2));
    } else {
      console.error(msg);
    }
    return 1;
  }

  const requireAudio = !allowMissingAudio && (requireAudioFlag || Boolean(audioManifest));
  const reports = selectedShows.map((show) =>
    runShowValidation(show, locale, {
      audio: audioManifest,
      requireAudio,
      allowMissingAudio,
      catalogShows: SHOWS
    })
  );

  const allOk = reports.every((r) => r.ok);
  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          ok: allOk,
          locale: localeCode,
          count: reports.length,
          reports: reports.map(({ srtPreview: _srt, ...rest }) => rest)
        },
        null,
        2
      )
    );
    return allOk ? 0 : 1;
  }

  if (reports.length === 0) {
    console.log(`validate-show (${localeCode}): 0 shows registered; OK`);
    return 0;
  }

  for (const report of reports) {
    console.log(
      `${report.code} ${report.showId} [${report.locale}]: ${report.ok ? "OK" : "FAILED"} ` +
        `(${report.stats.computedDurationSec}s, ${report.stats.pauseCount} pauses, ${report.stats.cameraCutsPerMin} cuts/min)`
    );
    if (!report.ok) {
      for (const hint of report.repairPromptHints) {
        console.log(`  - ${hint}`);
      }
    }
  }

  return allOk ? 0 : 1;
}

const isDirectEntry =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectEntry) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exitCode = 1;
    }
  );
}
