import type { AudioClip } from "./AudioClip";

export interface AudioWaveformOptions {
  readonly peakCount?: number;
  readonly samplesPerPeak?: number;
  readonly channel?: number | "mix";
  readonly normalize?: boolean;
}

export interface AudioWaveformPeak {
  readonly min: number;
  readonly max: number;
  readonly rms: number;
}

export interface AudioWaveformData {
  readonly duration: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly peakCount: number;
  readonly samplesPerPeak: number;
  readonly normalized: boolean;
  readonly peaks: readonly AudioWaveformPeak[];
}

export interface AudioWaveformPathPoint {
  readonly x: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly rmsHeight: number;
}

export interface AudioWaveformPathOptions {
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
}

export type AudioWaveformInput = AudioBuffer | AudioClip;

export function createAudioWaveform(input: AudioWaveformInput, options: AudioWaveformOptions = {}): AudioWaveformData {
  const buffer = audioBufferFromInput(input);
  const channels = buffer.numberOfChannels;
  const sampleRate = finitePositive(buffer.sampleRate, "sampleRate");
  const duration = Math.max(0, buffer.duration);
  const totalSamples = Math.max(0, Math.round(duration * sampleRate));
  const samplesPerPeak = resolveSamplesPerPeak(totalSamples, options);
  const peakCount = totalSamples === 0 ? 0 : Math.ceil(totalSamples / samplesPerPeak);
  const peaks: AudioWaveformPeak[] = [];
  const sourceChannels = collectWaveformChannels(buffer, options.channel ?? "mix");

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex++) {
    const start = peakIndex * samplesPerPeak;
    const end = Math.min(totalSamples, start + samplesPerPeak);
    let min = 0;
    let max = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      let value = 0;
      for (const channel of sourceChannels) {
        value += channel[sampleIndex] ?? 0;
      }
      value /= sourceChannels.length;
      min = Math.min(min, value);
      max = Math.max(max, value);
      sumSquares += value * value;
      sampleCount++;
    }

    peaks.push({
      min,
      max,
      rms: sampleCount === 0 ? 0 : Math.sqrt(sumSquares / sampleCount)
    });
  }

  const normalize = options.normalize ?? false;
  const outputPeaks = normalize ? normalizePeaks(peaks) : peaks;
  return {
    duration,
    sampleRate,
    channels,
    peakCount: outputPeaks.length,
    samplesPerPeak,
    normalized: normalize,
    peaks: outputPeaks
  };
}

export function sampleAudioWaveformAtTime(waveform: AudioWaveformData, timeSeconds: number): AudioWaveformPeak {
  if (waveform.peaks.length === 0 || waveform.duration <= 0) {
    return { min: 0, max: 0, rms: 0 };
  }
  const normalizedTime = clamp(timeSeconds / waveform.duration, 0, 1);
  const index = Math.min(waveform.peaks.length - 1, Math.floor(normalizedTime * waveform.peaks.length));
  return waveform.peaks[index] ?? { min: 0, max: 0, rms: 0 };
}

export function createAudioWaveformPath(waveform: AudioWaveformData, options: AudioWaveformPathOptions): readonly AudioWaveformPathPoint[] {
  const width = finitePositive(options.width, "width");
  const height = finitePositive(options.height, "height");
  const padding = Math.max(0, options.padding ?? 0);
  const drawableHeight = Math.max(1, height - padding * 2);
  const centerY = padding + drawableHeight / 2;
  const halfHeight = drawableHeight / 2;
  const denominator = Math.max(1, waveform.peaks.length - 1);

  return waveform.peaks.map((peak, index) => ({
    x: waveform.peaks.length === 1 ? width / 2 : index / denominator * width,
    yMin: centerY - clamp(peak.max, -1, 1) * halfHeight,
    yMax: centerY - clamp(peak.min, -1, 1) * halfHeight,
    rmsHeight: clamp(peak.rms, 0, 1) * halfHeight
  }));
}

export function audioWaveformPeakRange(waveform: AudioWaveformData): { readonly min: number; readonly max: number; readonly rmsMax: number } {
  let min = 0;
  let max = 0;
  let rmsMax = 0;
  for (const peak of waveform.peaks) {
    min = Math.min(min, peak.min);
    max = Math.max(max, peak.max);
    rmsMax = Math.max(rmsMax, peak.rms);
  }
  return { min, max, rmsMax };
}

function audioBufferFromInput(input: AudioWaveformInput): AudioBuffer {
  return "buffer" in input ? input.buffer : input;
}

function resolveSamplesPerPeak(totalSamples: number, options: AudioWaveformOptions): number {
  if (options.samplesPerPeak !== undefined) {
    return Math.max(1, Math.floor(finitePositive(options.samplesPerPeak, "samplesPerPeak")));
  }
  if (options.peakCount !== undefined) {
    const peakCount = Math.max(1, Math.floor(finitePositive(options.peakCount, "peakCount")));
    return Math.max(1, Math.ceil(totalSamples / peakCount));
  }
  return Math.max(1, Math.ceil(totalSamples / 1024));
}

function collectWaveformChannels(buffer: AudioBuffer, channel: number | "mix"): readonly Float32Array[] {
  if (buffer.numberOfChannels <= 0) {
    throw new Error("Audio waveform requires at least one channel");
  }
  if (channel === "mix") {
    return Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  }
  if (!Number.isInteger(channel) || channel < 0 || channel >= buffer.numberOfChannels) {
    throw new Error(`Audio waveform channel ${channel} is outside the buffer channel range`);
  }
  return [buffer.getChannelData(channel)];
}

function normalizePeaks(peaks: readonly AudioWaveformPeak[]): readonly AudioWaveformPeak[] {
  let maxAbs = 0;
  for (const peak of peaks) {
    maxAbs = Math.max(maxAbs, Math.abs(peak.min), Math.abs(peak.max), peak.rms);
  }
  if (maxAbs <= 0) return peaks;
  return peaks.map((peak) => ({
    min: peak.min / maxAbs,
    max: peak.max / maxAbs,
    rms: peak.rms / maxAbs
  }));
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Audio waveform ${label} must be a positive finite number`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
