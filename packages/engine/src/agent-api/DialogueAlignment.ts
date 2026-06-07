import type { DialogueLine, DialogueTrackArtifact } from "./DialoguePerformance.js";

export interface DialogueAlignmentCue {
  readonly lineId: string;
  readonly audioFile?: string | undefined;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly driftSeconds: number;
}

export interface DialogueAlignmentReport {
  readonly kind: "dialogue-alignment";
  readonly lineCount: number;
  readonly alignedLineCount: number;
  readonly maxDriftSeconds: number;
  readonly cues: readonly DialogueAlignmentCue[];
}

export function alignDialogueToAudio(
  dialogue: DialogueTrackArtifact,
  durationsByAudioFile: Readonly<Record<string, number>>
): DialogueAlignmentReport {
  const cues = dialogue.lines.map((line): DialogueAlignmentCue => alignDialogueLine(line, durationsByAudioFile[line.audioFile ?? ""]));
  return {
    kind: "dialogue-alignment",
    lineCount: dialogue.lines.length,
    alignedLineCount: cues.filter((cue) => cue.audioFile && cue.driftSeconds <= 0.05).length,
    maxDriftSeconds: Math.max(0, ...cues.map((cue) => cue.driftSeconds)),
    cues
  };
}

function alignDialogueLine(line: DialogueLine, audioDuration?: number): DialogueAlignmentCue {
  const lineDuration = Math.max(0, line.endTime - line.startTime);
  const duration = audioDuration ?? lineDuration;
  return {
    lineId: line.lineId,
    audioFile: line.audioFile,
    startTime: line.startTime,
    endTime: line.startTime + duration,
    duration,
    driftSeconds: Math.abs(duration - lineDuration)
  };
}
