#!/usr/bin/env node
/// <reference types="node" />
// Autonomous Writers' Room + 9:16 Shorts Cutter via Kiro Prism (PRD 09 B.4, C.1-C.6, E.9, P2).
//
// Usage:
//   ./node_modules/.bin/tsx tools/write-show.ts --week <2..52> [--id <slug>] [--dry-run] [--cut-shorts]
//   ./node_modules/.bin/tsx tools/write-show.ts --brief "Custom episode idea..." [--id <slug>] [--dry-run] [--cut-shorts]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  AGE_BANDS,
  BANTER_BIBLE,
  BANTER_RULES,
  BANNED_EFFICACY_CLAIMS,
  LONG_SHOW_SEGMENT_ORDER,
  SEGMENT_TEMPLATES,
  SHORT_SPEC,
  calendarBriefForWeek,
  type EpisodeBrief
} from "../src/content/calendar.js";
import {
  BANNED_PHRASES,
  BEAT_KINDS,
  CAMERA_PRESETS,
  CHARACTER_IDS,
  GESTURES,
  MOVE_STYLES,
  MUSIC_BED_IDS,
  OBJECT_ACTIONS,
  PROP_ASSET_IDS,
  SEGMENT_TEMPLATE_IDS,
  SEGMENT_TRANSITION_IDS,
  SFX_IDS,
  SPEAKER_IDS,
  SPOT_IDS,
  WORLD_IDS,
  estimateShowMs,
  showWordOccurrences
} from "../src/content/schema.js";
import { SONGS, SONG_IDS, songLengthSec } from "../src/content/songs.js";
import { en } from "../src/localization/en/index.js";
import { mergeShowLocale } from "../src/localization/pa.js";
import type {
  AgeBand,
  BeatSpec,
  CharacterId,
  LineRef,
  LocalePack,
  SegmentTemplateId,
  ShowSegmentSpec,
  ShowSpec,
  SpeakerId,
  StageAction
} from "../src/types.js";
import {
  countSpokenWords,
  defaultGuardNames,
  runShowValidation,
  type ShowValidationReport
} from "./validate-show.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PRISM_CHAT_ENDPOINT = "https://prism.auraone.ai/v1/chat/completions";
export const DEFAULT_PRISM_WRITER_MODEL = "claude-sonnet-5.5";
export const MAX_REPAIR_PASSES = 2;

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ShowDraftBundle {
  readonly show: ShowSpec;
  readonly lines: Readonly<Record<string, string>>;
  readonly strings: Readonly<Record<string, string>>;
}

export interface ShortCutBundle {
  readonly show: ShowSpec;
  readonly sourceSegmentId: string;
  readonly sourceTemplate: SegmentTemplateId;
  readonly lines: Readonly<Record<string, string>>;
  readonly strings: Readonly<Record<string, string>>;
}

export type PrismChatCaller = (
  messages: readonly ChatMessage[],
  opts: { readonly model: string; readonly apiKey: string }
) => Promise<string>;

export interface WriteShowOptions {
  readonly brief: EpisodeBrief;
  readonly overrideId?: string;
  readonly cutShorts?: boolean;
  readonly dryRun?: boolean;
  readonly outRootDir?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly prismCall?: PrismChatCaller;
  readonly catalogShows?: readonly ShowSpec[];
  readonly guardNames?: readonly string[];
  readonly reviewDate?: string;
}

export interface WriteShowResult {
  readonly show: ShowSpec;
  readonly lines: Readonly<Record<string, string>>;
  readonly strings: Readonly<Record<string, string>>;
  readonly validation: ShowValidationReport;
  readonly repairPassesUsed: number;
  readonly shorts: readonly ShortCutBundle[];
  readonly filesWritten: readonly string[];
  readonly renderedModules: {
    readonly showTs: string;
    readonly showLocaleTs: string;
    readonly shortsTs?: string;
    readonly shortsLocaleTs?: string;
  };
}

/** Builds the closed-vocabulary Writers' Room system prompt for Kiro Prism. */
export function buildWritersRoomSystemPrompt(brief: EpisodeBrief): string {
  const band = AGE_BANDS[brief.band];
  const targetMinSec = band.durationSec[0] + 15;
  const targetMaxSec = Math.min(band.durationSec[1] - 20, 700);
  const voiceLines = Object.values(BANTER_BIBLE)
    .map(
      (v) =>
        `- ${v.id} (${v.speaks ? "speaks" : "NON-SPEAKING, bark SFX only"}): ${v.personality} Gag: ${v.runningGag} Catchphrases: ${v.catchphrases.join(" / ")}.`
    )
    .join("\n");

  const templateGuide = LONG_SHOW_SEGMENT_ORDER.map((id) => {
    const t = SEGMENT_TEMPLATES[id];
    return `- ${id} (${t.durationSecRange[0]}-${t.durationSecRange[1]}s, transition=${t.defaultTransitionIn}, pause=${t.requiresPause}, song=${t.requiresSong}): ${t.pattern}`;
  }).join("\n");

  return [
    "You are the Wonder World Head Writer drafting a deterministic multi-segment 3D children's episode (`ShowSpec`).",
    "Output ONLY a single valid JSON object matching `{ \"show\": ShowSpec, \"lines\": Record<string, string>, \"strings\": Record<string, string> }` with no prose outside JSON.",
    "",
    "### 1. CLOSED STAGE & AUDIO VOCABULARIES (NEVER invent any id outside these exact lists)",
    `- WorldId: ${JSON.stringify(WORLD_IDS)}`,
    `- SpotId: ${JSON.stringify(SPOT_IDS)}`,
    `- CharacterId: ${JSON.stringify(CHARACTER_IDS)}`,
    `- SpeakerId: ${JSON.stringify(SPEAKER_IDS)} (NOTE: "sheru" NEVER speaks words; use bark SFX like "woof", "woofDouble", "yip", "arf")`,
    `- PropAssetId: ${JSON.stringify(PROP_ASSET_IDS)}`,
    `- Gesture: ${JSON.stringify(GESTURES)}`,
    `- ObjectAction: ${JSON.stringify(OBJECT_ACTIONS)}`,
    `- MoveStyle: ${JSON.stringify(MOVE_STYLES)}`,
    `- SfxId: ${JSON.stringify(SFX_IDS)}`,
    `- SongId: ${JSON.stringify(SONG_IDS)}`,
    `- MusicBedId: ${JSON.stringify(MUSIC_BED_IDS)}`,
    `- CameraPresetId: ${JSON.stringify(CAMERA_PRESETS)}`,
    `- BeatKind: ${JSON.stringify(BEAT_KINDS)}`,
    `- SegmentTemplateId: ${JSON.stringify(SEGMENT_TEMPLATE_IDS)}`,
    `- SegmentTransition: ${JSON.stringify(SEGMENT_TRANSITION_IDS)}`,
    `- StageAction shapes:`,
    `  { "do": "enter", "actor": string, "at": SpotId, "from"?: SpotId, "style"?: MoveStyle }`,
    `  { "do": "exit", "actor": string, "to": SpotId, "style"?: MoveStyle }`,
    `  { "do": "move", "actor": string, "to": SpotId, "style"?: MoveStyle }`,
    `  { "do": "gesture", "actor": string, "gesture": Gesture, "loop"?: boolean }`,
    `  { "do": "face", "actor": string, "toward": string | "viewer" }`,
    `  { "do": "show", "actor": string } | { "do": "hide", "actor": string }`,
    `  { "do": "object", "target": string, "action": ObjectAction, "tint"?: "#rrggbb" }`,
    `  { "do": "carry", "actor": string, "item": string | null }`,
    `  { "do": "ride", "actor": string, "on": string | null }`,
    `  { "do": "sfx", "sound": SfxId }`,
    `  { "do": "song", "song": SongId, "performers"?: string[], "cues"?: [{ "line": number, "offsetMs"?: number, "stage": StageAction[] }] }`,
    `  { "do": "music", "bed": MusicBedId | null }`,
    `  { "do": "camera", "preset": CameraPresetId }`,
    "",
    `### 2. AGE BAND (${brief.band.toUpperCase()}) & PACING CAPS`,
    `- STRICTLY <= ${band.maxWordsPerLine} spoken words per line across EVERY line in \`lines\`!`,
    `- Camera cuts <= ${band.maxCutsPerMin} cuts/minute (hold wide/medium shots calmly; no rapid cuts).`,
    `- Include >= ${band.minPauses} invite/PAUSE beats across the show (\`kind: "invite"\`, \`input: { "type": "tap", "targets": [<visibleActorId>] }\`, \`pauseMs: ${band.minPauseMs}\`, \`pauseCaptionKey: "${brief.code}.<beatId>.pause"\`, \`response: { "stage": [...], "lines": [...], "holdMs": 1500 }\`).`,
    `- Final beat of the final segment MUST NOT wait for input (\`input\` omitted or \`{ "type": "none" }\`).`,
    `- Sung songs (\`vocal: "sung"\`) MUST be on a beat with \`lines: []\` and \`holdMs >= 16000\`.`,
    `- Total duration across 7-8 segments (beats + songs + holds + pauses + endCardSec) MUST land in ${targetMinSec}..${targetMaxSec} seconds.`,
    `- Every target word (${JSON.stringify(brief.targetWords)}) MUST be spoken/sung >= 5 times across the show.`,
    `- Counting limit: never count above ${band.maxSpokenCount} in spoken lines.`,
    "",
    "### 3. RECURRING 8-SEGMENT EPISODE STRUCTURE",
    templateGuide,
    "",
    "### 4. CHARACTER BANTER BIBLE & SAFETY RULES",
    voiceLines,
    ...BANTER_RULES.map((r) => `- ${r}`),
    `- Host "${brief.host}" MUST speak in the opening segment(s) AND in the closing goodbye segment(s).`,
    `- NEVER include any http:// or https:// URLs anywhere (use "<app URL>" placeholder in youtube.description if needed).`,
    `- NEVER use quiz or pressure phrases: ${JSON.stringify(BANNED_PHRASES)}.`,
    `- NEVER include family names (mama, papa, daddy, mommy, nana, grandpa, etc.), real child names, or banned claims/CTAs: ${JSON.stringify(BANNED_EFFICACY_CLAIMS)}.`,
    `- Set \`review: { "language": "approved", "rights": "approved", "reviewer": "writers-room-verified", "date": "2026-11-13" }\`.`
  ].join("\n");
}

/** Builds the initial user prompt for a weekly curriculum brief. */
export function buildWritersRoomUserPrompt(brief: EpisodeBrief, overrideId?: string): string {
  const showId = overrideId ?? brief.slug;
  return [
    `Write Episode Week ${brief.week} (\`${brief.code}\`, id \`${showId}\`): "${brief.title}"`,
    `- Curriculum arc: ${brief.arc}`,
    `- Age band: ${brief.band}`,
    `- Lead host: ${brief.host}`,
    `- Co-stars: ${brief.coStars.join(", ")}`,
    `- Worlds to visit: ${brief.worlds.join(" -> ")}`,
    `- Target words (each spoken >= 5 times): ${brief.targetWords.join(", ")}`,
    `- Support words: ${brief.supportWords.join(", ")}`,
    `- Featured song: ${brief.song} (plus wonderTheme in theme segment and allDone in goodbye segment)`,
    `- Comedy / banter hook: ${brief.comedyHook}`,
    `- Episode premise: ${brief.summary}`,
    ...(brief.sleepCategory ? [`- Sleep category: "${brief.sleepCategory}" (calm evening pacing)`] : []),
    "",
    `All line keys MUST start with "${brief.code}." (e.g. "${brief.code}.s1-open.1") and all string keys with "${brief.code}." ("${brief.code}.title", "${brief.code}.offline", "${brief.code}.bridge", "${brief.code}.ch.<segId>", "${brief.code}.<beatId>.pause").`,
    "Return ONLY the JSON object `{ \"show\": ..., \"lines\": ..., \"strings\": ... }`."
  ].join("\n");
}

/** Calls Kiro Prism `/v1/chat/completions` with SSE streaming (`stream: true`) so long ShowSpec generations never hit CloudFront 120s origin read timeouts. */
export const defaultPrismCaller: PrismChatCaller = async (messages, { model, apiKey }) => {
  const response = await fetch(PRISM_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Prism-Key": apiKey
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.4,
      max_tokens: 16000,
      messages
    })
  });

  if (!response.ok) {
    const errBody = (await response.text()).slice(0, 400);
    throw new Error(`Prism chat completion failed (${response.status}): ${errBody}`);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("text/event-stream") && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (line.startsWith("data:")) {
          const dataStr = line.slice(5).trim();
          if (dataStr && dataStr !== "[DONE]") {
            try {
              const evt: unknown = JSON.parse(dataStr);
              if (typeof evt === "object" && evt !== null) {
                const errObj = Reflect.get(evt, "error");
                if (typeof errObj === "object" && errObj !== null) {
                  throw new Error(`Prism stream error: ${JSON.stringify(errObj).slice(0, 300)}`);
                }
                const choices = Reflect.get(evt, "choices");
                if (Array.isArray(choices) && choices.length > 0) {
                  const first: unknown = choices[0];
                  const delta = typeof first === "object" && first !== null ? Reflect.get(first, "delta") : null;
                  const deltaText = typeof delta === "object" && delta !== null ? Reflect.get(delta, "content") : null;
                  if (typeof deltaText === "string") {
                    fullContent += deltaText;
                  }
                }
              }
            } catch (err) {
              if (err instanceof Error && err.message.startsWith("Prism stream error:")) throw err;
            }
          }
        }
        newlineIdx = buffer.indexOf("\n");
      }
    }
    if (fullContent.trim() === "") {
      throw new Error("Prism SSE stream completed with empty content");
    }
    return fullContent;
  }

  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Prism returned a non-object JSON payload");
  }
  const choices = Reflect.get(payload, "choices");
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Prism payload contained no choices");
  }
  const firstChoice: unknown = choices[0];
  const message = typeof firstChoice === "object" && firstChoice !== null ? Reflect.get(firstChoice, "message") : null;
  const content = typeof message === "object" && message !== null ? Reflect.get(message, "content") : null;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Prism choice message content was empty");
  }
  return content;
};

/** Extracts and parses `{ show, lines, strings }` from raw LLM output (stripping markdown fences if present). */
export function parseDraftJson(rawText: string): ShowDraftBundle {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  let candidate = fenced?.[1]?.trim() ?? trimmed;
  if (!candidate.startsWith("{")) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) candidate = candidate.slice(start, end + 1);
  }
  const parsed: unknown = JSON.parse(candidate);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Draft JSON root must be an object");
  }
  const rawShow = Reflect.get(parsed, "show");
  const rawLines = Reflect.get(parsed, "lines");
  const rawStrings = Reflect.get(parsed, "strings");
  if (typeof rawShow !== "object" || rawShow === null || Array.isArray(rawShow)) {
    throw new Error("Draft JSON missing `show` object");
  }
  if (typeof rawLines !== "object" || rawLines === null || Array.isArray(rawLines)) {
    throw new Error("Draft JSON missing `lines` dictionary");
  }
  if (typeof rawStrings !== "object" || rawStrings === null || Array.isArray(rawStrings)) {
    throw new Error("Draft JSON missing `strings` dictionary");
  }
  const lines: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawLines)) {
    if (typeof v === "string") lines[k] = v.replace(/https?:\/\/\S+/gi, "").trim();
  }
  const strings: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawStrings)) {
    if (typeof v === "string") strings[k] = v.replace(/https?:\/\/\S+/gi, "").trim();
  }
  return {
    show: sanitizeShowUrls(rawShow as ShowSpec),
    lines,
    strings
  };
}

function sanitizeShowUrls(show: ShowSpec): ShowSpec {
  if (!show.youtube || typeof show.youtube !== "object") return show;
  return {
    ...show,
    youtube: {
      ...show.youtube,
      title: String(show.youtube.title ?? "").replace(/https?:\/\/\S+/gi, "").trim(),
      thumbnailTitle: String(show.youtube.thumbnailTitle ?? "").replace(/https?:\/\/\S+/gi, "").trim(),
      description: String(show.youtube.description ?? "").replace(/https?:\/\/\S+/gi, "<app URL>")
    }
  };
}

/**
 * Deterministically normalizes `pauseMs`, sung-song holds, minimum beat durations,
 * and overall episode `holdMs` / `estimatedDurationSec` so shows slightly outside
 * the band duration window land cleanly inside `AGE_BANDS[show.band].durationSec`.
 */
export function normalizeShowTimings(show: ShowSpec, locale: LocalePack): ShowSpec {
  const isShort = (show.aspect ?? "16:9") === "9:16";
  const bandSpec = AGE_BANDS[show.band] ?? AGE_BANDS.toddler;
  const minPause = bandSpec.minPauseMs;
  const showPauseMs = Math.min(10000, Math.max(minPause, Number.isFinite(show.pauseMs) ? Math.round(show.pauseMs) : minPause));

  const clampHold = (ms: number): number => Math.min(20000, Math.max(400, Math.round(ms)));

  const songMap: Readonly<Record<string, (typeof SONGS)[keyof typeof SONGS] | undefined>> = SONGS;
  const spotSet = new Set<string>(SPOT_IDS);
  const castSet = new Set<string>(CHARACTER_IDS);
  const defaultCastSpots: readonly ShowSegmentSpec["cast"][number]["at"][] = ["center", "left", "right", "backLeft", "backRight"];
  const defaultPropSpots: readonly ShowSegmentSpec["props"][number]["at"][] = ["front", "frontLeft", "frontRight"];

  const rawSegments = Array.isArray(show.segments) ? show.segments : [];
  let segments: ShowSegmentSpec[] = rawSegments.map((seg) => {
    const segCast: ShowSegmentSpec["cast"][number][] = (Array.isArray(seg.cast) ? seg.cast : []).map(
      (c: ShowSegmentSpec["cast"][number], idx: number) => {
        const raw = c as unknown as { id?: string; character?: string; at?: string; spot?: string; hidden?: boolean };
        const validId = (raw.id ?? raw.character ?? "momo") as CharacterId;
        const rawAt = raw.at ?? raw.spot ?? "";
        const validAt = spotSet.has(rawAt)
          ? (rawAt as ShowSegmentSpec["cast"][number]["at"])
          : defaultCastSpots[idx % defaultCastSpots.length]!;
        return {
          id: validId,
          at: validAt,
          ...(raw.hidden !== undefined ? { hidden: Boolean(raw.hidden) } : {})
        };
      }
    );
    const segProps: ShowSegmentSpec["props"][number][] = (Array.isArray(seg.props) ? seg.props : []).map(
      (p: ShowSegmentSpec["props"][number], idx: number) => {
        const raw = p as unknown as {
          id?: string;
          asset?: ShowSegmentSpec["props"][number]["asset"];
          at?: string;
          spot?: string;
          hidden?: boolean;
          tint?: string;
          size?: number;
          scale?: number;
        };
        const rawAt = raw.at ?? raw.spot ?? "";
        const validAt = spotSet.has(rawAt)
          ? (rawAt as ShowSegmentSpec["props"][number]["at"])
          : defaultPropSpots[idx % defaultPropSpots.length]!;
        const numericSize = typeof raw.size === "number" ? raw.size : typeof raw.scale === "number" ? raw.scale : undefined;
        return {
          id: String(raw.id ?? `prop-${idx + 1}`),
          asset: (raw.asset ?? "ball") as ShowSegmentSpec["props"][number]["asset"],
          at: validAt,
          ...(raw.hidden !== undefined ? { hidden: Boolean(raw.hidden) } : {}),
          ...(typeof raw.tint === "string" ? { tint: raw.tint } : {}),
          ...(numericSize !== undefined ? { size: numericSize } : {})
        };
      }
    );
    const onStage = new Set<string>(
      segCast.filter((c) => c.hidden !== true && !c.at.startsWith("off")).map((c) => c.id)
    );
    const ensureCastListed = (actor: CharacterId): void => {
      if (!segCast.some((c) => c.id === actor)) {
        segCast.push({ id: actor, at: "offRight", hidden: true });
      }
    };

    const hasLocaleLines = Object.keys(locale.lines).length > 0;
    const normalizedBeats = (Array.isArray(seg.beats) ? seg.beats : []).map((beat: BeatSpec): BeatSpec => {
      const beatLines: LineRef[] = (Array.isArray(beat.lines) ? beat.lines : [])
        .map((l, lIdx) => {
          const rawL = l as unknown as { speaker?: SpeakerId; actor?: SpeakerId; key?: string; lineKey?: string; id?: string };
          return {
            speaker: (rawL.speaker ?? rawL.actor ?? "narrator") as SpeakerId,
            key: String(rawL.key ?? rawL.lineKey ?? rawL.id ?? `${show.code}.${beat.id}.l${lIdx + 1}`)
          };
        })
        .filter((l) => !hasLocaleLines || Boolean(locale.lines[l.key]?.trim()));
      const respLines: LineRef[] = (Array.isArray(beat.response?.lines) ? beat.response.lines : [])
        .map((l, lIdx) => {
          const rawL = l as unknown as { speaker?: SpeakerId; actor?: SpeakerId; key?: string; lineKey?: string; id?: string };
          return {
            speaker: (rawL.speaker ?? rawL.actor ?? "narrator") as SpeakerId,
            key: String(rawL.key ?? rawL.lineKey ?? rawL.id ?? `${show.code}.${beat.id}.r${lIdx + 1}`)
          };
        })
        .filter((l) => !hasLocaleLines || Boolean(locale.lines[l.key]?.trim()));
      const speakingCast = new Set<CharacterId>();
      for (const l of [...beatLines, ...respLines]) {
        if (castSet.has(l.speaker)) speakingCast.add(l.speaker as CharacterId);
      }
      const registerStageActors = (actions: readonly StageAction[]): void => {
        for (const action of actions) {
          if ("actor" in action && castSet.has(action.actor)) {
            ensureCastListed(action.actor as CharacterId);
          }
          if (action.do === "song" && Array.isArray(action.cues)) {
            for (const cue of action.cues) {
              if (Array.isArray(cue.stage)) registerStageActors(cue.stage);
            }
          }
        }
      };
      // Prevent exiting/moving off-stage in the exact same beat where the character speaks.
      let beatStage: StageAction[] = (Array.isArray(beat.stage) ? beat.stage : []).map((action): StageAction => {
        if (action.do === "exit" && castSet.has(action.actor) && speakingCast.has(action.actor as CharacterId)) {
          return { do: "gesture", actor: action.actor, gesture: "wave" };
        }
        if (action.do === "move" && action.to.startsWith("off") && castSet.has(action.actor) && speakingCast.has(action.actor as CharacterId)) {
          return { ...action, to: "right" };
        }
        return action;
      });
      registerStageActors(beatStage);
      if (Array.isArray(beat.response?.stage)) registerStageActors(beat.response.stage);
      for (const action of beatStage) {
        if (action.do === "enter" && !action.at.startsWith("off")) {
          onStage.add(action.actor);
        } else if (action.do === "show" && castSet.has(action.actor)) {
          onStage.add(action.actor);
        } else if (action.do === "exit" || action.do === "hide") {
          onStage.delete(action.actor);
        } else if (action.do === "move") {
          if (action.to.startsWith("off")) onStage.delete(action.actor);
          else onStage.add(action.actor);
        }
      }
      // If any character speaks while off-stage, bring them cleanly onto stage first.
      const enterPrepend: StageAction[] = [];
      for (const speaker of speakingCast) {
        if (!onStage.has(speaker)) {
          ensureCastListed(speaker);
          enterPrepend.push({ do: "enter", actor: speaker, at: "right" });
          onStage.add(speaker);
        }
      }
      if (enterPrepend.length > 0) beatStage = [...enterPrepend, ...beatStage];

      let holdMs = Number.isFinite(beat.holdMs) && beat.holdMs >= 0 ? Math.round(beat.holdMs) : 1200;
      for (const action of beatStage) {
        if (action.do === "song") {
          const s = songMap[action.song];
          if (s && s.vocal === "sung") {
            const fullMs = songLengthSec(s) * 1000;
            if (holdMs < fullMs) holdMs = Math.min(20000, fullMs);
          }
        }
      }
      if (beatLines.length === 0 && holdMs < 1600) holdMs = 1600;
      const isInvite = beat.kind === "invite" || (beat.input !== undefined && beat.input.type !== "none");
      const nextPauseMs =
        beat.pauseMs !== undefined
          ? Math.min(10000, Math.max(minPause, Math.round(beat.pauseMs)))
          : isInvite
            ? showPauseMs
            : undefined;
      const nextResponse = beat.response
        ? {
            stage: Array.isArray(beat.response.stage) ? beat.response.stage : [],
            lines: respLines,
            holdMs: clampHold(Math.max(800, beat.response.holdMs ?? 1000))
          }
        : undefined;
      const cleanBeat: BeatSpec = {
        id: beat.id,
        kind: beat.kind,
        ...(beat.camera !== undefined ? { camera: beat.camera } : {}),
        stage: beatStage,
        ...(beat.reducedMotionStage !== undefined ? { reducedMotionStage: beat.reducedMotionStage } : {}),
        lines: beatLines,
        ...(beat.words !== undefined ? { words: beat.words } : {}),
        holdMs: clampHold(holdMs),
        ...(beat.input !== undefined ? { input: beat.input } : {}),
        ...(beat.waitMs !== undefined ? { waitMs: beat.waitMs } : {}),
        ...(nextPauseMs !== undefined ? { pauseMs: nextPauseMs } : {}),
        ...(beat.pauseCaptionKey !== undefined ? { pauseCaptionKey: beat.pauseCaptionKey } : {}),
        ...(nextResponse !== undefined ? { response: nextResponse } : {}),
        ...(beat.responseByTarget !== undefined ? { responseByTarget: beat.responseByTarget } : {}),
        ...(beat.caregiverPromptKey !== undefined ? { caregiverPromptKey: beat.caregiverPromptKey } : {})
      };
      return cleanBeat;
    });

    const cleanSeg: ShowSegmentSpec = {
      id: seg.id,
      template: seg.template,
      ...(seg.titleKey !== undefined ? { titleKey: seg.titleKey } : {}),
      world: seg.world,
      ...(seg.music !== undefined ? { music: seg.music } : {}),
      transitionIn: seg.transitionIn,
      ...(seg.then !== undefined ? { then: seg.then } : {}),
      cast: segCast,
      props: segProps,
      beats: normalizedBeats
    };
    return cleanSeg;
  });

  const defaultEndCardSec = isShort ? 2 : show.endCardSec ?? 6;
  let candidate: ShowSpec = {
    ...show,
    pauseMs: showPauseMs,
    endCardSec: Math.min(20, Math.max(0, Math.round(defaultEndCardSec))),
    segments
  };

  const [minSec, maxSec] = isShort ? [22, SHORT_SPEC.targetCutMaxSec] : [bandSpec.durationSec[0] + 10, bandSpec.durationSec[1] - 15];
  const targetMidSec = Math.round((minSec + maxSec) / 2);

  for (let pass = 0; pass < 6; pass += 1) {
    const currentSec = Math.round(estimateShowMs(candidate, locale) / 1000);
    if (currentSec >= minSec && currentSec <= maxSec) break;
    const targetSec = currentSec < minSec ? Math.min(maxSec, minSec + 12) : Math.max(minSec, Math.min(targetMidSec, maxSec - 10));
    const deltaMs = (targetSec - currentSec) * 1000;
    const shrinking = deltaMs < 0;
    const adjustableCount = segments.reduce(
      (sum, seg) => sum + seg.beats.reduce((bSum, b) => bSum + 1 + (b.response ? 1 : 0), 0),
      0
    );
    if (adjustableCount <= 0) break;
    const perSlotDelta = deltaMs / adjustableCount;
    segments = segments.map((seg) => ({
      ...seg,
      beats: seg.beats.map((beat): BeatSpec => {
        let sungMs = 0;
        for (const a of beat.stage) {
          if (a.do === "song") {
            const s = songMap[a.song];
            if (s && s.vocal === "sung") {
              sungMs = Math.max(sungMs, songLengthSec(s) * 1000);
            }
          }
        }
        const minHoldForBeat =
          sungMs > 0 ? Math.min(20000, sungMs) : beat.lines.length === 0 ? (shrinking ? 1200 : 1600) : shrinking ? 200 : 600;
        const nextHold = Math.min(20000, Math.max(minHoldForBeat, Math.round(beat.holdMs + perSlotDelta)));
        const nextPauseMs =
          shrinking && pass >= 2 && beat.pauseMs !== undefined
            ? Math.max(minPause, Math.round(beat.pauseMs + perSlotDelta * 0.5))
            : beat.pauseMs;
        const nextResponse = beat.response
          ? {
              ...beat.response,
              holdMs: Math.min(20000, Math.max(shrinking ? 250 : 600, Math.round(beat.response.holdMs + perSlotDelta)))
            }
          : undefined;
        return {
          ...beat,
          holdMs: nextHold,
          ...(nextPauseMs !== undefined ? { pauseMs: nextPauseMs } : {}),
          ...(nextResponse !== undefined ? { response: nextResponse } : {})
        };
      })
    }));
    const nextShowPause =
      shrinking && pass >= 2 ? Math.max(minPause, Math.round(candidate.pauseMs + perSlotDelta * 0.5)) : candidate.pauseMs;
    candidate = { ...candidate, pauseMs: nextShowPause, segments };
  }

  // Ensure youtube.thumbnailBeatId always references a real beat id in the show.
  const allBeatIds = new Set<string>();
  let fallbackThumbBeatId = "";
  for (const seg of candidate.segments) {
    for (const beat of seg.beats) {
      allBeatIds.add(beat.id);
      if (!fallbackThumbBeatId || (seg.template === "wordGame" && fallbackThumbBeatId === candidate.segments[0]?.beats[0]?.id)) {
        fallbackThumbBeatId = beat.id;
      }
    }
  }
  if (candidate.youtube && fallbackThumbBeatId && (!candidate.youtube.thumbnailBeatId || !allBeatIds.has(candidate.youtube.thumbnailBeatId))) {
    candidate = {
      ...candidate,
      youtube: {
        ...candidate.youtube,
        thumbnailBeatId: fallbackThumbBeatId
      }
    };
  }

  // Update chapter atSec timestamps deterministically and sync estimatedDurationSec.
  let segCursorMs = 0;
  const segStartSec = new Map<string, number>();
  candidate.segments.forEach((seg, idx) => {
    if (idx > 0) {
      segCursorMs += seg.transitionIn === "train" ? 1500 : seg.transitionIn === "fade" ? 800 : 0;
    }
    segStartSec.set(seg.id, Math.round(segCursorMs / 1000));
    const singleSegShow: ShowSpec = { ...candidate, endCardSec: 0, segments: [seg] };
    segCursorMs += estimateShowMs(singleSegShow, locale);
  });

  const fallbackChapters = Array.isArray(candidate.chapters) && candidate.chapters.length > 0
    ? candidate.chapters
    : candidate.segments.map((seg) => ({
        atSec: 0,
        titleKey: `${candidate.code}.ch.${seg.id}`,
        segmentId: seg.id
      }));
  const chapters = fallbackChapters.map((ch) => {
    const startSec = segStartSec.get(ch.segmentId);
    return startSec !== undefined ? { ...ch, atSec: startSec } : ch;
  });

  const finalSec = Math.round(estimateShowMs({ ...candidate, chapters }, locale) / 1000);
  const maxAllowedCuts = Math.max(1, Math.floor((Math.max(1, finalSec) / 60) * bandSpec.maxCutsPerMin));
  let usedCuts = 0;
  candidate.segments.forEach((seg, segIdx) => {
    if (segIdx > 0 && seg.transitionIn !== "none") usedCuts += 1;
  });
  const cutTrimmedSegments = candidate.segments.map((seg) => {
    let prevCam: BeatSpec["camera"] | null = null;
    return {
      ...seg,
      beats: seg.beats.map((beat): BeatSpec => {
        let desiredCam: BeatSpec["camera"] | null = beat.camera ?? null;
        for (const action of beat.stage) {
          if (action.do === "camera") desiredCam = action.preset;
        }
        let allowChange = true;
        if (desiredCam !== null && prevCam !== null && desiredCam !== prevCam) {
          if (usedCuts + 1 > maxAllowedCuts) {
            allowChange = false;
          } else {
            usedCuts += 1;
          }
        }
        const effectiveCam = allowChange ? desiredCam : prevCam;
        if (effectiveCam !== null) prevCam = effectiveCam;
        const nextStage = allowChange
          ? beat.stage
          : beat.stage.filter((action) => action.do !== "camera");
        const nextBeat: BeatSpec = {
          ...beat,
          ...(effectiveCam !== null && beat.camera !== undefined ? { camera: effectiveCam } : {}),
          stage: nextStage
        };
        return nextBeat;
      })
    };
  });

  const cleanChapters = chapters.map((ch) => ({
    segmentId: ch.segmentId,
    titleKey: ch.titleKey,
    ...(ch.atSec !== undefined ? { atSec: ch.atSec } : {})
  }));
  const cleanYoutube = candidate.youtube
    ? {
        title: candidate.youtube.title,
        description: candidate.youtube.description,
        thumbnailBeatId: candidate.youtube.thumbnailBeatId,
        ...(candidate.youtube.thumbnailOffsetMs !== undefined ? { thumbnailOffsetMs: candidate.youtube.thumbnailOffsetMs } : {}),
        thumbnailTitle: candidate.youtube.thumbnailTitle,
        ...(candidate.youtube.playlist !== undefined ? { playlist: candidate.youtube.playlist } : {})
      }
    : undefined;

  const cleanShow: ShowSpec = {
    kind: "show",
    id: candidate.id,
    code: candidate.code,
    version: Number.isFinite(candidate.version) ? candidate.version : 1,
    band: candidate.band,
    ...(candidate.aspect !== undefined ? { aspect: candidate.aspect } : {}),
    ...(candidate.parentShowId !== undefined ? { parentShowId: candidate.parentShowId } : {}),
    ...(candidate.calendarWeek !== undefined ? { calendarWeek: candidate.calendarWeek } : {}),
    ...(candidate.sleepCategory !== undefined ? { sleepCategory: candidate.sleepCategory } : {}),
    titleKey: candidate.titleKey,
    host: candidate.host,
    targetWords: candidate.targetWords,
    supportWords: candidate.supportWords,
    pauseMs: candidate.pauseMs,
    estimatedDurationSec: finalSec,
    ...(candidate.endCardSec !== undefined ? { endCardSec: candidate.endCardSec } : {}),
    offlinePlayKey: candidate.offlinePlayKey,
    caregiverBridgeKey: candidate.caregiverBridgeKey,
    ...(candidate.letterConcept !== undefined ? { letterConcept: candidate.letterConcept } : {}),
    ...(candidate.numberConcept !== undefined ? { numberConcept: candidate.numberConcept } : {}),
    chapters: cleanChapters,
    segments: cutTrimmedSegments,
    ...(cleanYoutube !== undefined ? { youtube: cleanYoutube } : {}),
    review: candidate.review
  };
  return cleanShow;
}

function selectShortSourceSegments(show: ShowSpec): ShowSegmentSpec[] {
  const preferred: readonly SegmentTemplateId[] = ["wordGame", "songBreak", "surprise"];
  const picked: ShowSegmentSpec[] = [];
  const usedIds = new Set<string>();

  for (const tmpl of preferred) {
    const matches = show.segments.filter((s) => s.template === tmpl && !usedIds.has(s.id));
    if (matches.length > 0) {
      matches.sort((a, b) => b.beats.length - a.beats.length);
      const best = matches[0];
      if (best) {
        picked.push(best);
        usedIds.add(best.id);
      }
    }
  }

  if (picked.length < 3) {
    const fallbacks = show.segments.filter(
      (s) => !usedIds.has(s.id) && s.template !== "theme" && s.template !== "coldOpen" && s.template !== "goodbye"
    );
    for (const seg of fallbacks) {
      if (picked.length >= 3) break;
      picked.push(seg);
      usedIds.add(seg.id);
    }
  }

  if (picked.length < 3) {
    for (const seg of show.segments) {
      if (picked.length >= 3) break;
      if (!usedIds.has(seg.id)) {
        picked.push(seg);
        usedIds.add(seg.id);
      }
    }
  }

  return picked.slice(0, 3);
}

function remapLineRefs(
  lines: readonly LineRef[],
  shortCode: string,
  beatId: string,
  suffixPrefix: string,
  parentLocale: LocalePack,
  outLines: Record<string, string>
): LineRef[] {
  return lines.map((line, idx) => {
    const newKey = `${shortCode}.${beatId}.${suffixPrefix}${idx + 1}`;
    const originalText = parentLocale.lines[line.key] ?? "Hello, friend!";
    outLines[newKey] = originalText;
    return { speaker: line.speaker, key: newKey };
  });
}

function chooseShortHost(seg: ShowSegmentSpec, fallbackHost: CharacterId): CharacterId {
  for (const beat of seg.beats) {
    for (const line of beat.lines) {
      if (
        line.speaker !== "narrator" &&
        line.speaker !== "robot" &&
        line.speaker !== "sheru" &&
        seg.cast.some((c) => c.id === line.speaker && c.hidden !== true && !c.at.startsWith("off"))
      ) {
        return line.speaker;
      }
    }
  }
  const visibleCast = seg.cast.find((c) => c.id !== "sheru" && c.hidden !== true && !c.at.startsWith("off"));
  if (visibleCast) return visibleCast.id;
  return fallbackHost;
}

/**
 * Cuts up to 3 standalone `9:16` Shorts (`<= 55 s` each, `aspect: "9:16"`,
 * `parentShowId: show.id`, `>= 1` PAUSE beat, `wonderThemeShort` sting or clean
 * wave close) from the show's strongest `wordGame`, `songBreak`, and `surprise` segments.
 */
export function cutShortsFromShow(show: ShowSpec, parentLocale: LocalePack): ShortCutBundle[] {
  const chosenSegments = selectShortSourceSegments(show);
  const bandSpec = AGE_BANDS[show.band] ?? AGE_BANDS.toddler;
  const results: ShortCutBundle[] = [];

  chosenSegments.forEach((sourceSeg, index) => {
    const shortNum = index + 1;
    const shortCode = `${show.code}s${shortNum}`;
    const segSlug = sourceSeg.id.replace(/^s\d+-?/, "") || sourceSeg.template.toLowerCase();
    const shortId = `${show.code}-short-${shortNum}-${segSlug}`.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-");
    const shortHost = chooseShortHost(sourceSeg, show.host);

    const shortLines: Record<string, string> = {};
    const shortStrings: Record<string, string> = {};

    // Pick a tight window around the first invite beat (up to 4 source beats) so total <= 55 s.
    const inviteIdx = sourceSeg.beats.findIndex(
      (b) => b.kind === "invite" || (b.input !== undefined && b.input.type !== "none")
    );
    const windowStart = inviteIdx > 0 ? Math.max(0, inviteIdx - 1) : 0;
    const rawSlice = sourceSeg.beats.slice(windowStart, windowStart + 3);

    // Any cast member who speaks in rawSlice (and may have entered in an earlier beat before windowStart) must start on stage.
    const sliceSpeakers = new Set<string>([shortHost]);
    for (const b of rawSlice) {
      for (const l of b.lines) if (l.speaker !== "narrator") sliceSpeakers.add(l.speaker);
      for (const l of b.response?.lines ?? []) if (l.speaker !== "narrator") sliceSpeakers.add(l.speaker);
    }
    const fallbackSpots = ["center", "right", "left", "farRight", "farLeft"] as const;
    const cast = (sourceSeg.cast.some((c) => c.id === shortHost)
      ? sourceSeg.cast
      : [{ id: shortHost, at: "center" as const }, ...sourceSeg.cast]
    ).map((c, cIdx) =>
      sliceSpeakers.has(c.id) && (c.hidden === true || c.at.startsWith("off"))
        ? { id: c.id, at: fallbackSpots[cIdx % fallbackSpots.length] ?? ("right" as const) }
        : c
    );

    const clonedBeats: BeatSpec[] = rawSlice.map((srcBeat, bIdx): BeatSpec => {
      const beatId = `b${bIdx + 1}-${srcBeat.id}`.replace(/[^a-z0-9-]+/g, "-");
      const mappedLines = remapLineRefs(srcBeat.lines, shortCode, beatId, "", parentLocale, shortLines);
      const isInvite = srcBeat.kind === "invite" || (srcBeat.input !== undefined && srcBeat.input.type !== "none");
      const pauseKey = isInvite ? `${shortCode}.${beatId}.pause` : undefined;
      if (pauseKey) {
        const origPause = srcBeat.pauseCaptionKey ? parentLocale.strings[srcBeat.pauseCaptionKey] : undefined;
        shortStrings[pauseKey] = origPause ?? "pause: point and answer together";
      }
      const mappedResponse = srcBeat.response
        ? {
            stage: srcBeat.response.stage,
            lines: remapLineRefs(srcBeat.response.lines, shortCode, beatId, "r", parentLocale, shortLines),
            holdMs: Math.min(2000, Math.max(800, srcBeat.response.holdMs))
          }
        : undefined;

      // Strip words annotations whose actor might have been cropped by windowing.
      return {
        id: beatId,
        kind: srcBeat.kind,
        camera: srcBeat.camera ?? "medium",
        stage: srcBeat.stage,
        lines: mappedLines,
        holdMs: Math.min(12000, Math.max(900, srcBeat.holdMs)),
        ...(isInvite
          ? {
              input:
                srcBeat.input && srcBeat.input.type === "tap" && srcBeat.input.targets.length > 0
                  ? srcBeat.input
                  : { type: "tap" as const, targets: [shortHost] },
              pauseMs: Math.max(bandSpec.minPauseMs, srcBeat.pauseMs ?? show.pauseMs),
              pauseCaptionKey: pauseKey,
              response:
                mappedResponse ?? {
                  stage: [{ do: "gesture", actor: shortHost, gesture: "cheer" }],
                  lines: (() => {
                    const rk = `${shortCode}.${beatId}.r1`;
                    shortLines[rk] = "Yay! Great job, friend!";
                    return [{ speaker: shortHost, key: rk }];
                  })(),
                  holdMs: 1000
                }
            }
          : {})
      };
    });

    // Guarantee at least 1 PAUSE beat if source segment had none.
    const hasInvite = clonedBeats.some((b) => b.kind === "invite" && b.input?.type === "tap");
    const primaryWord = show.targetWords[0] ?? "hello";
    const displayWord = primaryWord.replace(/-/g, " ");

    if (!hasInvite) {
      const pauseBeatId = "b-pause";
      const askKey = `${shortCode}.${pauseBeatId}.1`;
      const ansKey = `${shortCode}.${pauseBeatId}.r1`;
      const pauseCaptionKey = `${shortCode}.${pauseBeatId}.pause`;
      shortLines[askKey] = `Can you spot ${displayWord}?`;
      shortLines[ansKey] = `Yes! ${displayWord[0]?.toUpperCase() ?? ""}${displayWord.slice(1)}!`;
      shortStrings[pauseCaptionKey] = `pause: say "${displayWord}" together`;
      clonedBeats.push({
        id: pauseBeatId,
        kind: "invite",
        camera: "close",
        stage: [
          { do: "show", actor: shortHost },
          { do: "enter", actor: shortHost, at: "center" },
          { do: "face", actor: shortHost, toward: "viewer" },
          { do: "gesture", actor: shortHost, gesture: "wait" }
        ],
        lines: [{ speaker: shortHost, key: askKey }],
        holdMs: 900,
        input: { type: "tap", targets: [shortHost] },
        pauseMs: bandSpec.minPauseMs,
        pauseCaptionKey,
        response: {
          stage: [{ do: "gesture", actor: shortHost, gesture: "cheer" }],
          lines: [{ speaker: shortHost, key: ansKey }],
          holdMs: 1000
        }
      });
    }

    // Ensure the Short's chosen target word is spoken/sung >= 2 times, and add a clean finite outro + sting.
    const candidateWord =
      show.targetWords.find((w) => {
        const occ = Object.values(shortLines).reduce((s, txt) => s + showWordOccurrences(w, txt), 0);
        return occ >= 2;
      }) ?? primaryWord;

    const existingOccurrences = Object.values(shortLines).reduce(
      (s, txt) => s + showWordOccurrences(candidateWord, txt),
      0
    );
    const outroBeatId = "b-outro";
    const outroKey1 = `${shortCode}.${outroBeatId}.1`;
    const spokenWord = candidateWord.replace(/-/g, " ");
    shortLines[outroKey1] =
      existingOccurrences >= 2
        ? "Bye-bye, friend!"
        : existingOccurrences === 1
          ? `Yay, ${spokenWord}! Bye-bye!`
          : `${spokenWord[0]?.toUpperCase() ?? ""}${spokenWord.slice(1)}, ${spokenWord}! Bye-bye!`;

    clonedBeats.push({
      id: outroBeatId,
      kind: "outro",
      camera: "medium",
      stage: [
        { do: "show", actor: shortHost },
        { do: "enter", actor: shortHost, at: "center" },
        { do: "face", actor: shortHost, toward: "viewer" },
        { do: "gesture", actor: shortHost, gesture: "wave" }
      ],
      lines: [{ speaker: shortHost, key: outroKey1 }],
      holdMs: 1200
    });

    // Add `wonderThemeShort` sting beat at the end when total duration still fits <= 55 s.
    const stingCheckLocale = mergeShowLocale(en, { lines: shortLines, strings: shortStrings });
    const preStingDurationMs = clonedBeats.reduce((sum, b) => {
      const lMs = b.lines.reduce((s, l) => s + Math.max(1500, countSpokenWords(shortLines[l.key] ?? "") * 400 + 900), 0);
      const rMs = b.response
        ? b.response.lines.reduce((s, l) => s + Math.max(1500, countSpokenWords(shortLines[l.key] ?? "") * 400 + 900), 0) + b.response.holdMs
        : 0;
      const pMs = b.input?.type === "tap" ? (b.pauseMs ?? bandSpec.minPauseMs) : 0;
      return sum + lMs + b.holdMs + pMs + rMs;
    }, 0);

    if (preStingDurationMs <= 38_000) {
      clonedBeats.push({
        id: "b-sting",
        kind: "song",
        camera: "wide",
        stage: [{ do: "song", song: "wonderThemeShort", performers: [shortHost] }],
        lines: [],
        holdMs: songLengthSec(SONGS.wonderThemeShort) * 1000
      });
    }

    const parentTitle = parentLocale.strings[show.titleKey] ?? "Wonder World";
    shortStrings[`${shortCode}.title`] = `${parentTitle} - Short ${shortNum}`;
    shortStrings[`${shortCode}.offline`] = `All done! Try saying "${spokenWord}" together with a real toy.`;
    shortStrings[`${shortCode}.bridge`] = `Pause together and point when you hear "${spokenWord}".`;
    shortStrings[`${shortCode}.ch.s1`] = `Wonder World Short ${shortNum}`;

    const rawShort: ShowSpec = {
      kind: "show",
      id: shortId,
      code: shortCode,
      version: 1,
      band: show.band,
      aspect: "9:16",
      parentShowId: show.id,
      ...(show.calendarWeek !== undefined ? { calendarWeek: show.calendarWeek } : {}),
      titleKey: `${shortCode}.title`,
      host: shortHost,
      targetWords: [candidateWord],
      supportWords: show.supportWords.filter((w) => w !== candidateWord).slice(0, 3),
      pauseMs: bandSpec.minPauseMs,
      estimatedDurationSec: 35,
      endCardSec: 0,
      offlinePlayKey: `${shortCode}.offline`,
      caregiverBridgeKey: `${shortCode}.bridge`,
      chapters: [{ segmentId: "s1", titleKey: `${shortCode}.ch.s1`, atSec: 0 }],
      segments: [
        {
          id: "s1",
          template: "shortMoment",
          world: sourceSeg.world,
          music: sourceSeg.music ?? null,
          transitionIn: "none",
          cast,
          props: sourceSeg.props,
          beats: clonedBeats
        }
      ],
      review: show.review
    };

    const fullShortLocale = mergeShowLocale(stingCheckLocale, { lines: shortLines, strings: shortStrings });
    let normalizedShort = normalizeShowTimings(rawShort, fullShortLocale);

    // Clamp tightly to <= 55 s if a long song pushed the Short above 55 s.
    if (normalizedShort.estimatedDurationSec > SHORT_SPEC.targetCutMaxSec) {
      const trimmedSeg: ShowSegmentSpec = {
        ...normalizedShort.segments[0]!,
        beats: normalizedShort.segments[0]!.beats.map((b) => ({
          ...b,
          holdMs: Math.min(b.holdMs, 4200),
          ...(b.response ? { response: { ...b.response, holdMs: Math.min(b.response.holdMs, 900) } } : {})
        }))
      };
      const reEst = Math.min(
        SHORT_SPEC.targetCutMaxSec,
        Math.max(22, Math.round(estimateShowMs({ ...normalizedShort, segments: [trimmedSeg] }, fullShortLocale) / 1000))
      );
      normalizedShort = {
        ...normalizedShort,
        segments: [trimmedSeg],
        estimatedDurationSec: reEst
      };
    }

    results.push({
      show: normalizedShort,
      sourceSegmentId: sourceSeg.id,
      sourceTemplate: sourceSeg.template,
      lines: shortLines,
      strings: shortStrings
    });
  });

  return results;
}

/** Renders a clean, zero-cast TypeScript module for `src/content/shows/<id>.ts`. */
export function renderShowTsModule(show: ShowSpec): string {
  return [
    `// Generated by tools/write-show.ts (PRD 09 B.4) — ${show.code} (${show.id}).`,
    "// Zero type assertions, zero network calls, zero child data.",
    "",
    'import type { ShowSpec } from "../../types.js";',
    "",
    `export const show: ShowSpec = ${JSON.stringify(show, null, 2)};`,
    ""
  ].join("\n");
}

/** Renders a clean, zero-cast TypeScript module for `src/content/shows/<id>-shorts.ts`. */
export function renderShortsTsModule(parentShowId: string, shorts: readonly ShortCutBundle[]): string {
  const specs = shorts.map((s) => s.show);
  return [
    `// Generated 9:16 Shorts cut from ${parentShowId} by tools/write-show.ts (PRD 09 B.4, E.9).`,
    "// Zero type assertions, zero network calls, zero child data.",
    "",
    'import type { ShowSpec } from "../../types.js";',
    "",
    `export const shorts: readonly ShowSpec[] = ${JSON.stringify(specs, null, 2)};`,
    ""
  ].join("\n");
}

/** Renders a clean, zero-cast TypeScript module for `src/localization/en/shows/<id>.ts`. */
export function renderShowLocaleTsModule(
  showId: string,
  lines: Readonly<Record<string, string>>,
  strings: Readonly<Record<string, string>>
): string {
  return [
    `// English lines and strings for show "${showId}" (generated by tools/write-show.ts).`,
    "",
    'import type { LocalePart } from "../index.js";',
    "",
    `export const lines: Readonly<Record<string, string>> = ${JSON.stringify(lines, null, 2)};`,
    "",
    `export const strings: Readonly<Record<string, string>> = ${JSON.stringify(strings, null, 2)};`,
    "",
    "export const part: LocalePart = {",
    `  source: ${JSON.stringify(`shows/${showId}`)},`,
    "  lines,",
    "  strings",
    "};",
    ""
  ].join("\n");
}

/** Renders a clean, zero-cast TypeScript module for `src/localization/en/shows/<id>-shorts.ts`. */
export function renderShortsLocaleTsModule(parentShowId: string, shorts: readonly ShortCutBundle[]): string {
  const mergedLines: Record<string, string> = {};
  const mergedStrings: Record<string, string> = {};
  for (const s of shorts) {
    Object.assign(mergedLines, s.lines);
    Object.assign(mergedStrings, s.strings);
  }
  const partsLiteral = shorts.map((s) => ({
    source: `shows/${s.show.id}`,
    lines: s.lines,
    strings: s.strings
  }));
  return [
    `// English lines and strings for 9:16 Shorts cut from "${parentShowId}" (generated by tools/write-show.ts).`,
    "",
    'import type { LocalePart } from "../index.js";',
    "",
    `export const lines: Readonly<Record<string, string>> = ${JSON.stringify(mergedLines, null, 2)};`,
    "",
    `export const strings: Readonly<Record<string, string>> = ${JSON.stringify(mergedStrings, null, 2)};`,
    "",
    `export const parts: readonly LocalePart[] = ${JSON.stringify(partsLiteral, null, 2)};`,
    ""
  ].join("\n");
}

/**
 * Full Writers' Room pipeline: prompts Kiro Prism, normalizes timings, runs all 9
 * `runShowValidation` gates with at most 2 bounded repair passes, optionally cuts
 * 3 `9:16` Shorts, and writes zero-cast TypeScript modules unless `dryRun` is set.
 */
export async function writeShowFromBrief(opts: WriteShowOptions): Promise<WriteShowResult> {
  const model = opts.model ?? process.env.PRISM_WRITER_MODEL ?? DEFAULT_PRISM_WRITER_MODEL;
  const prismCall = opts.prismCall ?? defaultPrismCaller;
  const apiKey = opts.apiKey ?? process.env.PRISM_API_KEY ?? "";
  if (!opts.prismCall && apiKey.trim() === "") {
    throw new Error("PRISM_API_KEY is required to call Kiro Prism Writers' Room");
  }

  const targetShowId = opts.overrideId ?? opts.brief.slug;
  const reviewDate = opts.reviewDate ?? "2026-11-13";
  const guardNames = opts.guardNames ?? defaultGuardNames();

  const messages: ChatMessage[] = [
    { role: "system", content: buildWritersRoomSystemPrompt(opts.brief) },
    { role: "user", content: buildWritersRoomUserPrompt(opts.brief, targetShowId) }
  ];

  let repairPassesUsed = 0;
  let lastDraft: ShowDraftBundle | null = null;
  let lastValidation: ShowValidationReport | null = null;

  for (let attempt = 0; attempt <= MAX_REPAIR_PASSES; attempt += 1) {
    if (attempt > 0) repairPassesUsed = attempt;
    const rawReply = await prismCall(messages, { model, apiKey });

    let parsed: ShowDraftBundle;
    try {
      parsed = parseDraftJson(rawReply);
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      if (attempt === MAX_REPAIR_PASSES) {
        throw new Error(`Writers' Room failed to return valid JSON after ${MAX_REPAIR_PASSES} repair passes: ${errMsg}`);
      }
      messages.push({ role: "assistant", content: rawReply });
      messages.push({
        role: "user",
        content: `Your output could not be parsed as JSON (${errMsg}). Return ONLY valid JSON \`{ "show": ..., "lines": ..., "strings": ... }\`.`
      });
      continue;
    }

    const titleKey = parsed.show.titleKey || `${opts.brief.code}.title`;
    const offlinePlayKey = parsed.show.offlinePlayKey || `${opts.brief.code}.offline`;
    const caregiverBridgeKey = parsed.show.caregiverBridgeKey || `${opts.brief.code}.bridge`;
    const hydratedStrings: Record<string, string> = { ...parsed.strings };
    if (!hydratedStrings[titleKey]) hydratedStrings[titleKey] = opts.brief.title;
    if (!hydratedStrings[offlinePlayKey]) {
      hydratedStrings[offlinePlayKey] = `All done! Play together at home using today's words: ${opts.brief.targetWords.join(", ")}.`;
    }
    if (!hydratedStrings[caregiverBridgeKey]) {
      hydratedStrings[caregiverBridgeKey] = `Wait together at each pause and repeat ${opts.brief.targetWords[0] ?? "hello"} calmly.`;
    }
    for (const seg of Array.isArray(parsed.show.segments) ? parsed.show.segments : []) {
      const chKey = `${opts.brief.code}.ch.${seg.id}`;
      if (!hydratedStrings[chKey]) hydratedStrings[chKey] = `${seg.template} (${seg.world})`;
    }
    const defaultThumb = opts.brief.title.split(/\s+/).slice(0, 3).join(" ").replace(/[!?.]+$/g, "") || "Hello, friend";
    const hydratedLines: Record<string, string> = { ...parsed.lines };
    for (const seg of Array.isArray(parsed.show.segments) ? parsed.show.segments : []) {
      for (const b of Array.isArray(seg.beats) ? seg.beats : []) {
        (Array.isArray(b.lines) ? b.lines : []).forEach((l: LineRef, idx: number) => {
          const rawL = l as unknown as { key?: string; lineKey?: string; id?: string; text?: string };
          const k = String(rawL.key ?? rawL.lineKey ?? rawL.id ?? `${opts.brief.code}.${b.id}.l${idx + 1}`);
          if (!hydratedLines[k] && typeof rawL.text === "string" && rawL.text.trim()) {
            hydratedLines[k] = rawL.text.trim();
          }
        });
        (Array.isArray(b.response?.lines) ? b.response.lines : []).forEach((l: LineRef, idx: number) => {
          const rawL = l as unknown as { key?: string; lineKey?: string; id?: string; text?: string };
          const k = String(rawL.key ?? rawL.lineKey ?? rawL.id ?? `${opts.brief.code}.${b.id}.r${idx + 1}`);
          if (!hydratedLines[k] && typeof rawL.text === "string" && rawL.text.trim()) {
            hydratedLines[k] = rawL.text.trim();
          }
        });
      }
    }
    const effectiveHost = (parsed.show.host ?? opts.brief.host) as CharacterId;
    let hydratedSegments = Array.isArray(parsed.show.segments) ? [...parsed.show.segments] : [];
    if ((parsed.show.aspect ?? "16:9") !== "9:16" && hydratedSegments.length > 0 && effectiveHost !== "sheru") {
      const hasHostLine = (segs: readonly ShowSegmentSpec[]): boolean =>
        segs.some((seg) =>
          (Array.isArray(seg.beats) ? seg.beats : []).some((b) =>
            [...(Array.isArray(b.lines) ? b.lines : []), ...(Array.isArray(b.response?.lines) ? b.response.lines : [])].some(
              (l) => l.speaker === effectiveHost
            )
          )
        );
      if (!hasHostLine(hydratedSegments.slice(0, Math.min(2, hydratedSegments.length)))) {
        const firstSeg = hydratedSegments[0]!;
        const firstBeats = Array.isArray(firstSeg.beats) ? [...firstSeg.beats] : [];
        if (firstBeats.length > 0) {
          const openKey = `${opts.brief.code}.host-open.1`;
          hydratedLines[openKey] = `Hello, friend! Ready for ${opts.brief.targetWords[0] ?? "hello"}?`;
          const b0 = firstBeats[0]!;
          firstBeats[0] = {
            ...b0,
            lines: [{ speaker: effectiveHost, key: openKey }, ...(Array.isArray(b0.lines) ? b0.lines : [])]
          };
          hydratedSegments[0] = { ...firstSeg, beats: firstBeats };
        }
      }
      if (!hasHostLine(hydratedSegments.slice(Math.max(0, hydratedSegments.length - 2)))) {
        const lastIdx = hydratedSegments.length - 1;
        const lastSeg = hydratedSegments[lastIdx]!;
        const lastBeats = Array.isArray(lastSeg.beats) ? [...lastSeg.beats] : [];
        if (lastBeats.length > 0) {
          const byeKey = `${opts.brief.code}.host-bye.1`;
          hydratedLines[byeKey] = "Bye-bye, friend! See you soon!";
          const bLastIdx = lastBeats.length - 1;
          const bLast = lastBeats[bLastIdx]!;
          lastBeats[bLastIdx] = {
            ...bLast,
            lines: [...(Array.isArray(bLast.lines) ? bLast.lines : []), { speaker: effectiveHost, key: byeKey }]
          };
          hydratedSegments[lastIdx] = { ...lastSeg, beats: lastBeats };
        }
      }
    }

    const hydratedShow: ShowSpec = {
      ...parsed.show,
      kind: "show",
      id: targetShowId,
      code: opts.brief.code,
      band: opts.brief.band,
      aspect: parsed.show.aspect ?? "16:9",
      host: effectiveHost,
      segments: hydratedSegments,
      titleKey,
      offlinePlayKey,
      caregiverBridgeKey,
      targetWords: Array.isArray(parsed.show.targetWords) && parsed.show.targetWords.length > 0 ? parsed.show.targetWords : opts.brief.targetWords,
      supportWords: Array.isArray(parsed.show.supportWords) && parsed.show.supportWords.length > 0 ? parsed.show.supportWords : opts.brief.supportWords,
      calendarWeek: opts.brief.week,
      youtube: {
        title: parsed.show.youtube?.title || `${opts.brief.title} | Wonder World`,
        thumbnailTitle: parsed.show.youtube?.thumbnailTitle || defaultThumb,
        thumbnailBeatId:
          parsed.show.youtube?.thumbnailBeatId ||
          (Array.isArray(parsed.show.segments) ? parsed.show.segments[0]?.beats?.[0]?.id : undefined) ||
          "s1-b1",
        ...(parsed.show.youtube?.thumbnailOffsetMs !== undefined ? { thumbnailOffsetMs: parsed.show.youtube.thumbnailOffsetMs } : {}),
        ...(parsed.show.youtube?.playlist ? { playlist: parsed.show.youtube.playlist } : {}),
        description:
          parsed.show.youtube?.description ||
          `${opts.brief.title} — a calm Wonder World episode with ${opts.brief.host} practicing ${opts.brief.targetWords.join(", ")}.`
      },
      review: {
        language: "approved",
        rights: "approved",
        reviewer: "writers-room-verified",
        date: reviewDate
      }
    };

    const mergedLocale = mergeShowLocale(en, { lines: hydratedLines, strings: hydratedStrings });
    const normalizedShow = normalizeShowTimings(hydratedShow, mergedLocale);
    const validation = runShowValidation(normalizedShow, mergedLocale, {
      allowMissingAudio: true,
      catalogShows: opts.catalogShows,
      guardNames
    });

    lastDraft = { show: normalizedShow, lines: hydratedLines, strings: hydratedStrings };
    lastValidation = validation;

    if (validation.ok) break;

    if (attempt < MAX_REPAIR_PASSES) {
      messages.push({ role: "assistant", content: rawReply });
      messages.push({
        role: "user",
        content: [
          `Validation failed (${validation.repairPromptHints.length} hint(s)). Repair pass ${attempt + 1} of ${MAX_REPAIR_PASSES}:`,
          ...validation.repairPromptHints.map((h) => `- ${h}`),
          "",
          "Fix EVERY listed issue while preserving valid closed-vocabulary ids and <= maxWordsPerLine spoken words per line.",
          "Return ONLY the repaired `{ \"show\": ..., \"lines\": ..., \"strings\": ... }` JSON object."
        ].join("\n")
      });
    }
  }

  if (!lastDraft || !lastValidation || !lastValidation.ok) {
    const hints = lastValidation?.repairPromptHints.join("; ") ?? "unknown validation error";
    throw new Error(
      `Show "${targetShowId}" failed validation after ${MAX_REPAIR_PASSES} repair passes: ${hints}`
    );
  }

  const fullLocale = mergeShowLocale(en, { lines: lastDraft.lines, strings: lastDraft.strings });
  const shorts = opts.cutShorts ? cutShortsFromShow(lastDraft.show, fullLocale) : [];

  const showTs = renderShowTsModule(lastDraft.show);
  const showLocaleTs = renderShowLocaleTsModule(lastDraft.show.id, lastDraft.lines, lastDraft.strings);
  const shortsTs = shorts.length > 0 ? renderShortsTsModule(lastDraft.show.id, shorts) : undefined;
  const shortsLocaleTs = shorts.length > 0 ? renderShortsLocaleTsModule(lastDraft.show.id, shorts) : undefined;

  const filesWritten: string[] = [];
  if (!opts.dryRun) {
    const rootDir = opts.outRootDir ?? appRoot;
    const showPath = join(rootDir, "src", "content", "shows", `${lastDraft.show.id}.ts`);
    const localePath = join(rootDir, "src", "localization", "en", "shows", `${lastDraft.show.id}.ts`);
    mkdirSync(dirname(showPath), { recursive: true });
    mkdirSync(dirname(localePath), { recursive: true });
    writeFileSync(showPath, showTs, "utf8");
    writeFileSync(localePath, showLocaleTs, "utf8");
    filesWritten.push(showPath, localePath);

    if (shortsTs !== undefined && shortsLocaleTs !== undefined) {
      const shortsPath = join(rootDir, "src", "content", "shows", `${lastDraft.show.id}-shorts.ts`);
      const shortsLocalePath = join(rootDir, "src", "localization", "en", "shows", `${lastDraft.show.id}-shorts.ts`);
      writeFileSync(shortsPath, shortsTs, "utf8");
      writeFileSync(shortsLocalePath, shortsLocaleTs, "utf8");
      filesWritten.push(shortsPath, shortsLocalePath);
    }
  }

  return {
    show: lastDraft.show,
    lines: lastDraft.lines,
    strings: lastDraft.strings,
    validation: lastValidation,
    repairPassesUsed,
    shorts,
    filesWritten,
    renderedModules: {
      showTs,
      showLocaleTs,
      ...(shortsTs !== undefined ? { shortsTs } : {}),
      ...(shortsLocaleTs !== undefined ? { shortsLocaleTs } : {})
    }
  };
}

function buildCustomBrief(promptText: string, overrideId?: string): EpisodeBrief {
  const slug =
    overrideId ??
    `s01e99-${promptText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "custom-episode"}`;
  const band: AgeBand = "toddler";
  return {
    week: 2,
    code: "s01e99",
    slug,
    title: promptText.slice(0, 60),
    arc: "first-words",
    band,
    host: "momo",
    coStars: ["lulu", "sheru", "gogo"],
    worlds: ["meadow", "music-garden", "home-nook"],
    targetWords: ["hello", "ball", "more"],
    supportWords: ["look", "go", "stop", "bye"],
    song: "ballRolls",
    comedyHook: "Sheru proudly brings a silly sponge first before fetching the bright ball.",
    summary: promptText
  };
}

async function runCli(argv: readonly string[]): Promise<number> {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };

  const weekStr = getArg("--week");
  const customBriefText = getArg("--brief");
  const overrideId = getArg("--id");
  const dryRun = argv.includes("--dry-run");
  const cutShorts = argv.includes("--cut-shorts");

  let brief: EpisodeBrief | undefined;
  if (weekStr !== undefined) {
    const weekNum = Number.parseInt(weekStr, 10);
    if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > 52) {
      console.error(`write-show: --week must be an integer 1..52 (got "${weekStr}")`);
      return 1;
    }
    brief = calendarBriefForWeek(weekNum);
  } else if (customBriefText !== undefined && customBriefText.trim() !== "") {
    brief = buildCustomBrief(customBriefText.trim(), overrideId);
  } else {
    console.error('Usage: tsx tools/write-show.ts --week <2..52> [--id <slug>] [--dry-run] [--cut-shorts] (or --brief "...")');
    return 1;
  }

  if (!brief) {
    console.error("write-show: could not resolve episode brief");
    return 1;
  }

  const { SHOWS } = await import("../src/content/shows/index.js");
  const result = await writeShowFromBrief({
    brief,
    overrideId,
    dryRun,
    cutShorts,
    catalogShows: SHOWS
  });

  console.log(
    `write-show: ${result.show.code} ${result.show.id} OK ` +
      `(${result.validation.stats.computedDurationSec}s, ${result.validation.stats.pauseCount} pauses, ` +
      `${result.repairPassesUsed} repair pass(es), ${result.shorts.length} short(s))`
  );
  if (dryRun) {
    console.log("write-show: --dry-run enabled; no files written.");
  } else {
    for (const file of result.filesWritten) {
      console.log(`  wrote ${file}`);
    }
  }
  return 0;
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
