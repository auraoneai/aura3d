import type { CaptionCue, CaptionTrackArtifact } from "./DialoguePerformance.js";
import { normalizePromptAnimationTime, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export type CaptionExportFormat = "vtt" | "srt";

export interface CaptionExportArtifact {
  readonly kind: "caption-export";
  readonly format: CaptionExportFormat;
  readonly language: string;
  readonly cueCount: number;
  readonly text: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly checksum: string;
  readonly path?: string | undefined;
}

export function exportCaptionTrack(captions: CaptionTrackArtifact, format: CaptionExportFormat, path?: string): CaptionExportArtifact {
  const text = format === "vtt" ? captionsToVtt(captions.cues) : captionsToSrt(captions.cues);
  return {
    kind: "caption-export",
    format,
    language: captions.language,
    cueCount: captions.cues.length,
    text,
    mimeType: format === "vtt" ? "text/vtt" : "application/x-subrip",
    byteLength: new TextEncoder().encode(text).byteLength,
    checksum: captionTextChecksum(text),
    ...(path ? { path } : {})
  };
}

export function exportCaptionTrackFile(captions: CaptionTrackArtifact, format: CaptionExportFormat, path: string): CaptionExportArtifact {
  return exportCaptionTrack(captions, format, path);
}

export function exportCaptionTrackVtt(track: CaptionTrackArtifact): string {
  return exportCaptionTrack(track, "vtt").text;
}

export function exportCaptionTrackSrt(track: CaptionTrackArtifact): string {
  return exportCaptionTrack(track, "srt").text;
}

export function captionsToVtt(cues: readonly CaptionCue[]): string {
  const lines = ["WEBVTT", ""];
  cues.forEach((cue, index) => {
    lines.push(cue.captionId || String(index + 1));
    lines.push(`${formatCaptionTimestamp(cue.startTime, "vtt")} --> ${formatCaptionTimestamp(cue.endTime, "vtt")}`);
    lines.push(captionCueFileSafeText(cue));
    lines.push("");
  });
  return lines.join("\n");
}

export function captionsToSrt(cues: readonly CaptionCue[]): string {
  const lines: string[] = [];
  cues.forEach((cue, index) => {
    lines.push(String(index + 1));
    lines.push(`${formatCaptionTimestamp(cue.startTime, "srt")} --> ${formatCaptionTimestamp(cue.endTime, "srt")}`);
    lines.push(captionCueFileSafeText(cue));
    lines.push("");
  });
  return lines.join("\n");
}

export function formatCaptionTimestamp(time: PromptAnimationSeconds, format: CaptionExportFormat): string {
  const normalized = normalizePromptAnimationTime(Math.max(0, time));
  const totalMs = Math.round(normalized * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor(totalMs % 3_600_000 / 60_000);
  const seconds = Math.floor(totalMs % 60_000 / 1000);
  const ms = totalMs % 1000;
  const separator = format === "srt" ? "," : ".";
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}${separator}${String(ms).padStart(3, "0")}`;
}

export function captionCueFileSafeText(cue: CaptionCue): string {
  return cue.text.replace(/\s+/g, " ").trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function captionTextChecksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `caption-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
