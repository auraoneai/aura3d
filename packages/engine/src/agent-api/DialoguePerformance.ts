import {
  createPromptAnimationIssue,
  normalizePromptAnimationTime,
  promptAnimationContractVersion,
  promptAnimationDriftFrames,
  promptAnimationFrameAtTime,
  type PromptAnimationArtifactBase,
  type PromptAnimationFrameRate,
  type PromptAnimationId,
  type PromptAnimationLanguageCode,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";

export type DialogueEmotion =
  | "neutral"
  | "happy"
  | "excited"
  | "curious"
  | "concerned"
  | "sad"
  | "surprised"
  | "whisper"
  | "shout";

export type DialogueDeliveryDirection = "natural" | "slow" | "fast" | "sing-song" | "deadpan" | "dramatic";

export interface DialogueWordTiming {
  readonly word: string;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly confidence?: number | undefined;
}

export interface DialogueLine {
  readonly lineId: PromptAnimationId;
  readonly speakerId: PromptAnimationId;
  readonly text: string;
  readonly language: PromptAnimationLanguageCode;
  readonly audioFile?: string | undefined;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly wordTimings?: readonly DialogueWordTiming[] | undefined;
  readonly emotion: DialogueEmotion | string;
  readonly delivery: DialogueDeliveryDirection | string;
  readonly direction?: string | undefined;
}

export interface DialogueTrackArtifact extends PromptAnimationArtifactBase<"dialogue-track"> {
  readonly language: PromptAnimationLanguageCode;
  readonly duration: PromptAnimationSeconds;
  readonly lines: readonly DialogueLine[];
}

export interface CaptionCue {
  readonly captionId: PromptAnimationId;
  readonly lineId?: PromptAnimationId | undefined;
  readonly shotId?: PromptAnimationId | undefined;
  readonly sceneId?: PromptAnimationId | undefined;
  readonly text: string;
  readonly language: PromptAnimationLanguageCode;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly speakerId?: PromptAnimationId | undefined;
  readonly lineSafe: boolean;
}

export interface CaptionTrackArtifact extends PromptAnimationArtifactBase<"caption-track"> {
  readonly language: PromptAnimationLanguageCode;
  readonly cues: readonly CaptionCue[];
}

export type AudioStemRole = "narration" | "dialogue" | "music" | "ambience" | "sfx";

export interface AudioStem {
  readonly id: PromptAnimationId;
  readonly role: AudioStemRole;
  readonly path: string;
  readonly startTime: PromptAnimationSeconds;
  readonly duration: PromptAnimationSeconds;
  readonly gainDb?: number | undefined;
  readonly ducking?: "none" | "under-dialogue" | "under-narration" | undefined;
  readonly language?: PromptAnimationLanguageCode | undefined;
}

export interface AudioStemManifestArtifact extends PromptAnimationArtifactBase<"audio-stems"> {
  readonly duration: PromptAnimationSeconds;
  readonly stems: readonly AudioStem[];
}

export interface DubMapEntry {
  readonly originalStoryboardId?: PromptAnimationId | undefined;
  readonly dubbedStoryboardId?: PromptAnimationId | undefined;
  readonly originalStoryboardSceneId?: PromptAnimationId | undefined;
  readonly dubbedStoryboardSceneId?: PromptAnimationId | undefined;
  readonly originalLineId: PromptAnimationId;
  readonly dubbedLineId: PromptAnimationId;
  readonly originalCaptionId?: PromptAnimationId | undefined;
  readonly dubbedCaptionId?: PromptAnimationId | undefined;
  readonly originalCharacterId?: PromptAnimationId | undefined;
  readonly dubbedCharacterId?: PromptAnimationId | undefined;
  readonly originalSpeakerId: PromptAnimationId;
  readonly dubbedSpeakerId: PromptAnimationId;
  readonly originalLanguage: PromptAnimationLanguageCode;
  readonly dubbedLanguage: PromptAnimationLanguageCode;
  readonly originalShotId?: PromptAnimationId | undefined;
  readonly dubbedShotId?: PromptAnimationId | undefined;
  readonly originalSceneId?: PromptAnimationId | undefined;
  readonly dubbedSceneId?: PromptAnimationId | undefined;
}

export interface DubMapArtifact extends PromptAnimationArtifactBase<"dub-map"> {
  readonly sourceLanguage: PromptAnimationLanguageCode;
  readonly targetLanguage: PromptAnimationLanguageCode;
  readonly entries: readonly DubMapEntry[];
}

export interface DialogueTimingReport {
  readonly lineCount: number;
  readonly missingAudioFiles: readonly PromptAnimationId[];
  readonly missingWordTimings: readonly PromptAnimationId[];
  readonly missingCaptions: readonly PromptAnimationId[];
  readonly captionDriftFrames: number;
  readonly maxAllowedDriftFrames: number;
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export interface CaptionTimingProofLine {
  readonly lineId: PromptAnimationId;
  readonly captionId?: PromptAnimationId | undefined;
  readonly startDriftFrames: number;
  readonly endDriftFrames: number;
  readonly maxDriftFrames: number;
  readonly status: "pass" | "fail" | "missing";
}

export interface CaptionTimingProof {
  readonly status: "pass" | "fail";
  readonly frameRate: PromptAnimationFrameRate;
  readonly maxAllowedDriftFrames: number;
  readonly lineCount: number;
  readonly cueCount: number;
  readonly coveredLineIds: readonly PromptAnimationId[];
  readonly missingLineIds: readonly PromptAnimationId[];
  readonly orphanCaptionIds: readonly PromptAnimationId[];
  readonly maxDriftFrames: number;
  readonly lines: readonly CaptionTimingProofLine[];
  readonly issues: readonly PromptAnimationValidationIssue[];
}

export function defineDialogueTrack<const TTrack extends DialogueTrackArtifact>(track: TTrack): TTrack {
  return track;
}

export function defineCaptionTrack<const TTrack extends CaptionTrackArtifact>(track: TTrack): TTrack {
  return track;
}

export function defineAudioStemManifest<const TManifest extends AudioStemManifestArtifact>(manifest: TManifest): TManifest {
  return manifest;
}

export function defineDubMap<const TDubMap extends DubMapArtifact>(dubMap: TDubMap): TDubMap {
  return dubMap;
}

export function createDialogueTrack(input: {
  readonly episodeId: PromptAnimationId;
  readonly language: PromptAnimationLanguageCode;
  readonly lines: readonly DialogueLine[];
  readonly duration?: PromptAnimationSeconds | undefined;
  readonly generatedAt?: string | undefined;
}): DialogueTrackArtifact {
  let duration = input.duration ?? 0;
  for (const line of input.lines) duration = Math.max(duration, line.endTime);
  return {
    artifact: "dialogue-track",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    language: input.language,
    duration: normalizePromptAnimationTime(duration),
    lines: input.lines,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function createAudioStemManifest(input: {
  readonly episodeId: PromptAnimationId;
  readonly stems: readonly AudioStem[];
  readonly duration?: PromptAnimationSeconds | undefined;
  readonly generatedAt?: string | undefined;
}): AudioStemManifestArtifact {
  let duration = input.duration ?? 0;
  for (const stem of input.stems) duration = Math.max(duration, stem.startTime + stem.duration);
  return {
    artifact: "audio-stems",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    duration: normalizePromptAnimationTime(duration),
    stems: input.stems,
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function lineSafeCaptionText(text: string, maxLineLength = 42): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLineLength) return normalized;

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

export function deriveCaptionTrackFromDialogue(
  dialogue: DialogueTrackArtifact,
  options: {
    readonly maxLineLength?: number | undefined;
    readonly captionIdByLineId?: Record<string, PromptAnimationId> | undefined;
    readonly shotByLineId?: Record<string, PromptAnimationId> | undefined;
    readonly sceneByLineId?: Record<string, PromptAnimationId> | undefined;
    readonly generatedAt?: string | undefined;
  } = {}
): CaptionTrackArtifact {
  const cues: CaptionCue[] = dialogue.lines.map((line) => ({
    captionId: options.captionIdByLineId?.[line.lineId] ?? `${line.lineId}:caption`,
    lineId: line.lineId,
    ...(options.shotByLineId?.[line.lineId] ? { shotId: options.shotByLineId[line.lineId] } : {}),
    ...(options.sceneByLineId?.[line.lineId] ? { sceneId: options.sceneByLineId[line.lineId] } : {}),
    text: lineSafeCaptionText(line.text, options.maxLineLength ?? 42),
    language: line.language,
    startTime: line.startTime,
    endTime: line.endTime,
    speakerId: line.speakerId,
    lineSafe: true
  }));

  return {
    artifact: "caption-track",
    contractId: dialogue.contractId,
    episodeId: dialogue.episodeId,
    language: dialogue.language,
    cues,
    ...(options.generatedAt ? { generatedAt: options.generatedAt } : {})
  };
}

export function dialogueLineAtTime(
  dialogue: DialogueTrackArtifact,
  time: PromptAnimationSeconds,
  speakerId?: PromptAnimationId
): DialogueLine | undefined {
  const normalized = normalizePromptAnimationTime(time);
  for (const line of dialogue.lines) {
    if (speakerId && line.speakerId !== speakerId) continue;
    if (normalized >= line.startTime && normalized < line.endTime) return line;
  }
  return undefined;
}

export function captionCueAtTime(
  captions: CaptionTrackArtifact,
  time: PromptAnimationSeconds,
  speakerId?: PromptAnimationId
): CaptionCue | undefined {
  const normalized = normalizePromptAnimationTime(time);
  for (const cue of captions.cues) {
    if (speakerId && cue.speakerId !== speakerId) continue;
    if (normalized >= cue.startTime && normalized < cue.endTime) return cue;
  }
  return undefined;
}

export function captionCuesForShot(
  captions: CaptionTrackArtifact,
  shotId: PromptAnimationId
): readonly CaptionCue[] {
  return captions.cues.filter((cue) => cue.shotId === shotId);
}

export function createCaptionTimingProof(
  dialogue: DialogueTrackArtifact,
  captions: CaptionTrackArtifact,
  options: {
    readonly frameRate?: PromptAnimationFrameRate | undefined;
    readonly maxAllowedDriftFrames?: number | undefined;
  } = {}
): CaptionTimingProof {
  const frameRate = options.frameRate ?? 30;
  const maxAllowedDriftFrames = options.maxAllowedDriftFrames ?? 1;
  const captionsByLine = new Map<string, CaptionCue>();
  const coveredLineIds: PromptAnimationId[] = [];
  const missingLineIds: PromptAnimationId[] = [];
  const orphanCaptionIds: PromptAnimationId[] = [];
  const lines: CaptionTimingProofLine[] = [];
  const issues: PromptAnimationValidationIssue[] = [...validateCaptionTrack(captions)];
  let maxDriftFrames = 0;

  for (const cue of captions.cues) {
    if (cue.lineId) captionsByLine.set(cue.lineId, cue);
    else orphanCaptionIds.push(cue.captionId);
  }

  const dialogueLineIds = new Set(dialogue.lines.map((line) => line.lineId));
  for (const cue of captions.cues) {
    if (cue.lineId && !dialogueLineIds.has(cue.lineId)) orphanCaptionIds.push(cue.captionId);
  }

  for (const line of dialogue.lines) {
    const caption = captionsByLine.get(line.lineId);
    if (!caption) {
      missingLineIds.push(line.lineId);
      lines.push({
        lineId: line.lineId,
        startDriftFrames: 0,
        endDriftFrames: 0,
        maxDriftFrames: 0,
        status: "missing"
      });
      issues.push(
        createPromptAnimationIssue("error", "caption-proof-line-missing", `Dialogue line "${line.lineId}" has no caption timing proof.`, {
          path: `captions.${line.lineId}`,
          time: line.startTime
        })
      );
      continue;
    }

    coveredLineIds.push(line.lineId);
    const startDriftFrames = promptAnimationDriftFrames(Math.abs(caption.startTime - line.startTime), frameRate);
    const endDriftFrames = promptAnimationDriftFrames(Math.abs(caption.endTime - line.endTime), frameRate);
    const lineMaxDriftFrames = Math.max(startDriftFrames, endDriftFrames);
    maxDriftFrames = Math.max(maxDriftFrames, lineMaxDriftFrames);
    const status = lineMaxDriftFrames <= maxAllowedDriftFrames ? "pass" : "fail";
    lines.push({
      lineId: line.lineId,
      captionId: caption.captionId,
      startDriftFrames,
      endDriftFrames,
      maxDriftFrames: lineMaxDriftFrames,
      status
    });
    if (status === "fail") {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "caption-proof-drift",
          `Caption cue "${caption.captionId}" drifts ${lineMaxDriftFrames} frames from dialogue line "${line.lineId}".`,
          { path: `captions.${caption.captionId}`, frame: lineMaxDriftFrames, time: caption.startTime }
        )
      );
    }
  }

  for (const captionId of orphanCaptionIds) {
    issues.push(
      createPromptAnimationIssue("warning", "caption-proof-orphan", `Caption cue "${captionId}" is not mapped to a dialogue line.`, {
        path: `captions.${captionId}`
      })
    );
  }

  return {
    status: missingLineIds.length === 0 && maxDriftFrames <= maxAllowedDriftFrames ? "pass" : "fail",
    frameRate,
    maxAllowedDriftFrames,
    lineCount: dialogue.lines.length,
    cueCount: captions.cues.length,
    coveredLineIds,
    missingLineIds,
    orphanCaptionIds,
    maxDriftFrames,
    lines,
    issues
  };
}

export function validateDialogueTrack(dialogue: DialogueTrackArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const lineIds = new Set<string>();

  for (const [index, line] of dialogue.lines.entries()) {
    if (!line.lineId) {
      issues.push(
        createPromptAnimationIssue("error", "dialogue-line-id-missing", `Dialogue line at index ${index} is missing an id.`, {
          path: `lines.${index}.lineId`
        })
      );
    }
    if (lineIds.has(line.lineId)) {
      issues.push(
        createPromptAnimationIssue("error", "dialogue-line-id-duplicate", `Duplicate dialogue line id "${line.lineId}".`, {
          path: `lines.${index}.lineId`
        })
      );
    }
    lineIds.add(line.lineId);

    if (line.endTime <= line.startTime) {
      issues.push(
        createPromptAnimationIssue("error", "dialogue-line-duration", `Dialogue line "${line.lineId}" must end after it starts.`, {
          path: `lines.${index}`,
          time: line.startTime
        })
      );
    }

    if (!line.audioFile) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "dialogue-audio-missing",
          `Dialogue line "${line.lineId}" is missing an audio file.`,
          { path: `lines.${index}.audioFile`, time: line.startTime }
        )
      );
    }
  }

  return issues;
}

export function validateCaptionTrack(captions: CaptionTrackArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const captionIds = new Set<string>();

  captions.cues.forEach((cue, index) => {
    if (!cue.captionId) {
      issues.push(
        createPromptAnimationIssue("error", "caption-id-missing", `Caption cue at index ${index} is missing an id.`, {
          path: `cues.${index}.captionId`
        })
      );
    }
    if (captionIds.has(cue.captionId)) {
      issues.push(
        createPromptAnimationIssue("error", "caption-id-duplicate", `Duplicate caption id "${cue.captionId}".`, {
          path: `cues.${index}.captionId`,
          time: cue.startTime
        })
      );
    }
    captionIds.add(cue.captionId);

    if (!cue.text.trim()) {
      issues.push(
        createPromptAnimationIssue("error", "caption-text-missing", `Caption cue "${cue.captionId}" is empty.`, {
          path: `cues.${index}.text`,
          time: cue.startTime
        })
      );
    }

    if (cue.endTime <= cue.startTime) {
      issues.push(
        createPromptAnimationIssue("error", "caption-duration", `Caption cue "${cue.captionId}" must end after it starts.`, {
          path: `cues.${index}`,
          time: cue.startTime
        })
      );
    }

    if (!cue.lineSafe) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "caption-line-safe",
          `Caption cue "${cue.captionId}" is not marked line-safe for publish readiness.`,
          { path: `cues.${index}.lineSafe`, time: cue.startTime }
        )
      );
    }
  });

  return issues;
}

export function validateAudioStemManifest(manifest: AudioStemManifestArtifact): readonly PromptAnimationValidationIssue[] {
  const issues: PromptAnimationValidationIssue[] = [];
  const stemIds = new Set<string>();

  if (manifest.stems.length === 0) {
    issues.push(createPromptAnimationIssue("error", "audio-stems-empty", "Audio stem manifest must contain at least one stem."));
  }

  manifest.stems.forEach((stem, index) => {
    if (!stem.id) {
      issues.push(
        createPromptAnimationIssue("error", "audio-stem-id-missing", `Audio stem at index ${index} is missing an id.`, {
          path: `stems.${index}.id`
        })
      );
    }
    if (stemIds.has(stem.id)) {
      issues.push(
        createPromptAnimationIssue("error", "audio-stem-id-duplicate", `Duplicate audio stem id "${stem.id}".`, {
          path: `stems.${index}.id`,
          time: stem.startTime
        })
      );
    }
    stemIds.add(stem.id);

    if (!stem.path) {
      issues.push(
        createPromptAnimationIssue("error", "audio-stem-path-missing", `Audio stem "${stem.id}" has no path.`, {
          path: `stems.${index}.path`,
          time: stem.startTime
        })
      );
    }

    if (stem.duration <= 0) {
      issues.push(
        createPromptAnimationIssue("error", "audio-stem-duration", `Audio stem "${stem.id}" must have positive duration.`, {
          path: `stems.${index}.duration`,
          time: stem.startTime
        })
      );
    }

    if (stem.startTime < 0) {
      issues.push(
        createPromptAnimationIssue("error", "audio-stem-start-time", `Audio stem "${stem.id}" starts before zero.`, {
          path: `stems.${index}.startTime`,
          time: stem.startTime
        })
      );
    }

    if (stem.startTime + stem.duration > manifest.duration + 0.000001) {
      issues.push(
        createPromptAnimationIssue(
          "error",
          "audio-stem-outside-manifest",
          `Audio stem "${stem.id}" extends beyond the manifest duration.`,
          { path: `stems.${index}`, time: stem.startTime }
        )
      );
    }
  });

  return issues;
}

export function createDialogueTimingReport(
  dialogue: DialogueTrackArtifact,
  captions?: CaptionTrackArtifact,
  frameRate: PromptAnimationFrameRate = 30,
  maxTimingDriftFrames = 1
): DialogueTimingReport {
  const issues = [...validateDialogueTrack(dialogue), ...(captions ? validateCaptionTrack(captions) : [])];
  const missingAudioFiles: string[] = [];
  const missingWordTimings: string[] = [];
  const missingCaptions: string[] = [];
  let captionDriftFrames = 0;

  for (const line of dialogue.lines) {
    if (!line.audioFile) missingAudioFiles.push(line.lineId);
    if (!line.wordTimings || line.wordTimings.length === 0) missingWordTimings.push(line.lineId);
  }

  if (captions) {
    const captionsByLine = new Map<string, CaptionCue>();
    for (const cue of captions.cues) {
      if (cue.lineId) captionsByLine.set(cue.lineId, cue);
    }

    for (const line of dialogue.lines) {
      const caption = captionsByLine.get(line.lineId);
      if (!caption) {
        missingCaptions.push(line.lineId);
        issues.push(
          createPromptAnimationIssue("error", "caption-missing", `Dialogue line "${line.lineId}" has no caption cue.`, {
            path: `captions.${line.lineId}`,
            time: line.startTime
          })
        );
        continue;
      }
      const driftSeconds = Math.max(
        Math.abs(caption.startTime - line.startTime),
        Math.abs(caption.endTime - line.endTime)
      );
      const driftFrames = promptAnimationDriftFrames(driftSeconds, frameRate);
      captionDriftFrames = Math.max(captionDriftFrames, driftFrames);
      if (driftFrames > maxTimingDriftFrames) {
        issues.push(
          createPromptAnimationIssue(
            "error",
            "caption-timing-drift",
            `Caption cue "${caption.captionId}" drifts ${driftFrames} frames from dialogue line "${line.lineId}".`,
            { path: `captions.${caption.captionId}`, frame: driftFrames, time: caption.startTime }
          )
        );
      }
    }
  } else {
    missingCaptions.push(...dialogue.lines.map((line) => line.lineId));
  }

  return {
    lineCount: dialogue.lines.length,
    missingAudioFiles,
    missingWordTimings,
    missingCaptions,
    captionDriftFrames,
    maxAllowedDriftFrames: maxTimingDriftFrames,
    issues
  };
}
