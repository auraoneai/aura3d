import { createAudioWaveformData, type AudioWaveformData } from "./WaveformVisualizer.js";
import {
  createAuraVoiceVisemeTrack,
  createGlbBlendshapeVisemeCue,
  type AuraVoiceVisemeCue,
  type AuraVoiceVisemeId,
  type AuraVoiceVisemeTrack
} from "./VisemeController.js";
import { normalizePromptAnimationTime, type PromptAnimationFrameRate, type PromptAnimationId, type PromptAnimationLanguageCode, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface AudioVisemeAnalysisFrame {
  readonly index: number;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly rms: number;
  readonly peak: number;
  readonly mouthOpenness: number;
  readonly visemeId: AuraVoiceVisemeId;
}

export interface AudioVisemeAnalysis {
  readonly kind: "audio-viseme-analysis";
  readonly characterId: PromptAnimationId;
  readonly language: PromptAnimationLanguageCode;
  readonly sampleRate: number;
  readonly frameRate: PromptAnimationFrameRate;
  readonly duration: PromptAnimationSeconds;
  readonly analysisWindowSeconds: PromptAnimationSeconds;
  readonly frames: readonly AudioVisemeAnalysisFrame[];
  readonly waveform: AudioWaveformData;
}

export interface AnalyzeAudioVisemesOptions {
  readonly episodeId: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly speakerId?: PromptAnimationId | undefined;
  readonly lineId?: PromptAnimationId | undefined;
  readonly language: PromptAnimationLanguageCode;
  readonly frameRate: PromptAnimationFrameRate;
  readonly samples: Float32Array | readonly number[];
  readonly sampleRate: number;
  readonly channelCount?: number | undefined;
  readonly startTime?: PromptAnimationSeconds | undefined;
  readonly analysisWindowSeconds?: PromptAnimationSeconds | undefined;
  readonly silenceThreshold?: number | undefined;
  readonly blendshapeMap?: Record<string, string> | undefined;
  readonly generatedAt?: string | undefined;
}

export function analyzeAudioVisemes(options: AnalyzeAudioVisemesOptions): AudioVisemeAnalysis {
  const channelCount = Math.max(1, Math.floor(options.channelCount ?? 1));
  const sampleCount = Math.floor(options.samples.length / channelCount);
  const duration = sampleCount / options.sampleRate;
  const windowSeconds = options.analysisWindowSeconds ?? Math.min(0.05, 1 / options.frameRate);
  const samplesPerWindow = Math.max(1, Math.round(windowSeconds * options.sampleRate));
  const silenceThreshold = options.silenceThreshold ?? 0.025;
  const frames: AudioVisemeAnalysisFrame[] = [];

  for (let startSample = 0, index = 0; startSample < sampleCount; startSample += samplesPerWindow, index += 1) {
    const endSample = Math.min(sampleCount, startSample + samplesPerWindow);
    let sumSquares = 0;
    let peak = 0;
    let count = 0;
    for (let sample = startSample; sample < endSample; sample += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const value = Math.abs(options.samples[sample * channelCount + channel] ?? 0);
        peak = Math.max(peak, value);
        sumSquares += value * value;
        count += 1;
      }
    }
    const rms = count === 0 ? 0 : Math.sqrt(sumSquares / count);
    const mouthOpenness = rms <= silenceThreshold ? 0 : Math.max(0, Math.min(1, (rms - silenceThreshold) / Math.max(0.001, 0.45 - silenceThreshold)));
    const startTime = normalizePromptAnimationTime((options.startTime ?? 0) + startSample / options.sampleRate);
    const endTime = normalizePromptAnimationTime((options.startTime ?? 0) + endSample / options.sampleRate);
    frames.push({
      index,
      startTime,
      endTime,
      rms,
      peak,
      mouthOpenness,
      visemeId: classifyAmplitudeViseme(mouthOpenness, peak)
    });
  }

  return {
    kind: "audio-viseme-analysis",
    characterId: options.characterId,
    language: options.language,
    sampleRate: options.sampleRate,
    frameRate: options.frameRate,
    duration: normalizePromptAnimationTime(duration),
    analysisWindowSeconds: normalizePromptAnimationTime(windowSeconds),
    frames,
    waveform: createAudioWaveformData({
      samples: options.samples,
      sampleRate: options.sampleRate,
      channelCount,
      bins: Math.min(2048, Math.max(64, frames.length))
    })
  };
}

export function createAudioDrivenVisemeTrack(options: AnalyzeAudioVisemesOptions): AuraVoiceVisemeTrack {
  const analysis = analyzeAudioVisemes(options);
  const cues = mergeAudioVisemeFrames(analysis.frames).map((frame, index): AuraVoiceVisemeCue => createGlbBlendshapeVisemeCue({
    id: `${options.lineId ?? options.characterId}:audio-viseme:${index}`,
    characterId: options.characterId,
    ...(options.speakerId ? { speakerId: options.speakerId } : {}),
    ...(options.lineId ? { lineId: options.lineId } : {}),
    startTime: frame.startTime,
    endTime: frame.endTime,
    visemeId: frame.visemeId,
    mouthOpenness: frame.mouthOpenness,
    weight: frame.visemeId === "sil" ? 0.2 : Math.max(0.35, frame.mouthOpenness),
    ...(options.blendshapeMap ? { blendshapeMap: options.blendshapeMap } : {})
  }));
  return createAuraVoiceVisemeTrack({
    episodeId: options.episodeId,
    language: options.language,
    frameRate: options.frameRate,
    cues,
    generatedAt: options.generatedAt
  });
}

export function mergeAudioVisemeFrames(frames: readonly AudioVisemeAnalysisFrame[]): readonly AudioVisemeAnalysisFrame[] {
  const merged: AudioVisemeAnalysisFrame[] = [];
  for (const frame of frames) {
    const previous = merged[merged.length - 1];
    if (previous && previous.visemeId === frame.visemeId) {
      merged[merged.length - 1] = {
        ...previous,
        endTime: frame.endTime,
        rms: Math.max(previous.rms, frame.rms),
        peak: Math.max(previous.peak, frame.peak),
        mouthOpenness: Math.max(previous.mouthOpenness, frame.mouthOpenness)
      };
    } else {
      merged.push(frame);
    }
  }
  return merged;
}

function classifyAmplitudeViseme(mouthOpenness: number, peak: number): AuraVoiceVisemeId {
  if (mouthOpenness <= 0.04) return "sil";
  if (mouthOpenness >= 0.72) return "aa";
  if (peak >= 0.62) return "ah";
  if (mouthOpenness >= 0.42) return "eh";
  if (mouthOpenness >= 0.22) return "ih";
  return "m";
}
