import {
  createAuraVoiceVisemeTrack,
  sampleVisemeTrack,
  type AuraVoiceVisemeCue,
  type AuraVoiceVisemeTrack,
  type VisemeSample
} from "./VisemeController.js";
import { normalizePromptAnimationTime, promptAnimationContractVersion, type PromptAnimationFrameRate, type PromptAnimationId, type PromptAnimationLanguageCode, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface VisemeTimelineManualEdit {
  readonly id: PromptAnimationId;
  readonly cue: AuraVoiceVisemeCue;
  readonly reason?: string | undefined;
}

export interface VisemeTimelineTrackArtifact {
  readonly artifact: "viseme-timeline-track";
  readonly contractId: string;
  readonly episodeId: PromptAnimationId;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly sourceTrack: AuraVoiceVisemeTrack;
  readonly manualEdits: readonly VisemeTimelineManualEdit[];
  readonly cues: readonly AuraVoiceVisemeCue[];
  readonly generatedAt?: string | undefined;
}

export function createVisemeTimelineTrack(input: {
  readonly episodeId: PromptAnimationId;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly sourceTrack: AuraVoiceVisemeTrack;
  readonly manualEdits?: readonly VisemeTimelineManualEdit[] | undefined;
  readonly generatedAt?: string | undefined;
}): VisemeTimelineTrackArtifact {
  const manualEdits = input.manualEdits ?? [];
  return {
    artifact: "viseme-timeline-track",
    contractId: promptAnimationContractVersion,
    episodeId: input.episodeId,
    language: input.language,
    frameRate: input.frameRate,
    sourceTrack: input.sourceTrack,
    manualEdits,
    cues: applyManualVisemeEdits(input.sourceTrack.cues, manualEdits),
    ...(input.generatedAt ? { generatedAt: input.generatedAt } : {})
  };
}

export function applyManualVisemeEdits(
  sourceCues: readonly AuraVoiceVisemeCue[],
  manualEdits: readonly VisemeTimelineManualEdit[]
): readonly AuraVoiceVisemeCue[] {
  const manualCues = manualEdits.map((edit) => edit.cue);
  const retained = sourceCues.filter((cue) => !manualCues.some((manual) => cue.characterId === manual.characterId && rangesOverlap(cue, manual)));
  return [...retained, ...manualCues].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}

export function sampleVisemeTimelineTrack(
  track: VisemeTimelineTrackArtifact,
  time: PromptAnimationSeconds,
  characterId?: PromptAnimationId
): VisemeSample {
  return sampleVisemeTrack(
    createAuraVoiceVisemeTrack({
      episodeId: track.episodeId,
      language: track.language,
      frameRate: track.frameRate,
      cues: track.cues
    }),
    normalizePromptAnimationTime(time),
    characterId
  );
}

function rangesOverlap(a: AuraVoiceVisemeCue, b: AuraVoiceVisemeCue): boolean {
  return normalizePromptAnimationTime(a.startTime) < normalizePromptAnimationTime(b.endTime) &&
    normalizePromptAnimationTime(b.startTime) < normalizePromptAnimationTime(a.endTime);
}
