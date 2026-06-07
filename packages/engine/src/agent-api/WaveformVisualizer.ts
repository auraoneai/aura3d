import { normalizePromptAnimationTime, type PromptAnimationSeconds } from "./PromptAnimationContract.js";

export interface AudioWaveformPeak {
  readonly index: number;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly min: number;
  readonly max: number;
  readonly rms: number;
}

export interface AudioWaveformData {
  readonly kind: "audio-waveform";
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly duration: PromptAnimationSeconds;
  readonly peaks: readonly AudioWaveformPeak[];
}

export interface CreateAudioWaveformDataOptions {
  readonly samples: Float32Array | readonly number[];
  readonly sampleRate: number;
  readonly channelCount?: number | undefined;
  readonly bins?: number | undefined;
}

export interface WaveformVisualizerPeak {
  readonly min: number;
  readonly max: number;
  readonly rms?: number | undefined;
}

export interface WaveformVisualizerOptions {
  readonly width: number;
  readonly height: number;
  readonly padding?: number | undefined;
  readonly color?: string | undefined;
}

export interface WaveformVisualizerPoint {
  readonly x: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly rmsHeight: number;
}

export interface WaveformVisualization {
  readonly kind: "waveform-visualization";
  readonly width: number;
  readonly height: number;
  readonly pointCount: number;
  readonly color: string;
  readonly points: readonly WaveformVisualizerPoint[];
}

export interface WaveformDrawOptions {
  readonly width: number;
  readonly height: number;
  readonly foreground?: string | undefined;
  readonly background?: string | undefined;
  readonly playheadTime?: PromptAnimationSeconds | undefined;
  readonly selectionStartTime?: PromptAnimationSeconds | undefined;
  readonly selectionEndTime?: PromptAnimationSeconds | undefined;
}

export function createAudioWaveformData(options: CreateAudioWaveformDataOptions): AudioWaveformData {
  const channelCount = Math.max(1, Math.floor(options.channelCount ?? 1));
  const sampleCount = Math.floor(options.samples.length / channelCount);
  const duration = sampleCount / options.sampleRate;
  const binCount = Math.max(1, Math.min(options.bins ?? 512, sampleCount || 1));
  const samplesPerBin = Math.max(1, Math.ceil(sampleCount / binCount));
  const peaks: AudioWaveformPeak[] = [];

  for (let bin = 0; bin < binCount; bin += 1) {
    const startSample = bin * samplesPerBin;
    const endSample = Math.min(sampleCount, startSample + samplesPerBin);
    let min = 1;
    let max = -1;
    let sumSquares = 0;
    let count = 0;
    for (let sample = startSample; sample < endSample; sample += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const value = options.samples[sample * channelCount + channel] ?? 0;
        min = Math.min(min, value);
        max = Math.max(max, value);
        sumSquares += value * value;
        count += 1;
      }
    }
    peaks.push({
      index: bin,
      startTime: normalizePromptAnimationTime(startSample / options.sampleRate),
      endTime: normalizePromptAnimationTime(endSample / options.sampleRate),
      min: count === 0 ? 0 : min,
      max: count === 0 ? 0 : max,
      rms: count === 0 ? 0 : Math.sqrt(sumSquares / count)
    });
  }

  return {
    kind: "audio-waveform",
    sampleRate: options.sampleRate,
    channelCount,
    duration: normalizePromptAnimationTime(duration),
    peaks
  };
}

export function createWaveformVisualization(
  peaks: readonly WaveformVisualizerPeak[],
  options: WaveformVisualizerOptions
): WaveformVisualization {
  const width = positive(options.width, "width");
  const height = positive(options.height, "height");
  const padding = Math.max(0, options.padding ?? 0);
  const center = height / 2;
  const halfHeight = Math.max(1, height / 2 - padding);
  const denominator = Math.max(1, peaks.length - 1);
  return {
    kind: "waveform-visualization",
    width,
    height,
    pointCount: peaks.length,
    color: options.color ?? "#38bdf8",
    points: peaks.map((peak, index) => ({
      x: peaks.length === 1 ? width / 2 : index / denominator * width,
      yMin: center - clamp(peak.max, -1, 1) * halfHeight,
      yMax: center - clamp(peak.min, -1, 1) * halfHeight,
      rmsHeight: clamp(peak.rms ?? 0, 0, 1) * halfHeight
    }))
  };
}

export function waveformPeakAtTime(waveform: AudioWaveformData, time: PromptAnimationSeconds): AudioWaveformPeak | undefined {
  const normalized = normalizePromptAnimationTime(time);
  return waveform.peaks.find((peak) => normalized >= peak.startTime && normalized < peak.endTime) ?? waveform.peaks[waveform.peaks.length - 1];
}

export function drawWaveformToCanvas(
  context: Pick<CanvasRenderingContext2D, "fillStyle" | "strokeStyle" | "lineWidth" | "fillRect" | "beginPath" | "moveTo" | "lineTo" | "stroke">,
  waveform: AudioWaveformData,
  options: WaveformDrawOptions
): void {
  context.fillStyle = options.background ?? "#08111f";
  context.fillRect(0, 0, options.width, options.height);

  if (options.selectionStartTime !== undefined && options.selectionEndTime !== undefined) {
    const startX = timeToX(waveform, options.selectionStartTime, options.width);
    const endX = timeToX(waveform, options.selectionEndTime, options.width);
    context.fillStyle = "rgba(125, 211, 252, 0.18)";
    context.fillRect(startX, 0, Math.max(1, endX - startX), options.height);
  }

  const centerY = options.height / 2;
  context.strokeStyle = options.foreground ?? "#38bdf8";
  context.lineWidth = 1;
  context.beginPath();
  for (const peak of waveform.peaks) {
    const x = timeToX(waveform, peak.startTime, options.width);
    context.moveTo(x, centerY + peak.min * centerY);
    context.lineTo(x, centerY + peak.max * centerY);
  }
  context.stroke();

  if (options.playheadTime !== undefined) {
    const x = timeToX(waveform, options.playheadTime, options.width);
    context.strokeStyle = "#f8fafc";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, options.height);
    context.stroke();
  }
}

function timeToX(waveform: AudioWaveformData, time: PromptAnimationSeconds, width: number): number {
  if (waveform.duration <= 0) return 0;
  return Math.max(0, Math.min(width, time / waveform.duration * width));
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Waveform ${label} must be a positive finite number.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
