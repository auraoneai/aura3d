import type { AudioContextLike } from "./AudioContextManager";

export interface AudioAnalyserOptions {
  /**
   * Context to build the `AnalyserNode` on. Defaults to `source.context`,
   * which every real `AudioNode` exposes; pass it explicitly for minimal
   * fakes whose nodes do not carry a context reference.
   */
  readonly context?: AudioContextLike;
  /** FFT window size — power of two in [32, 32768]. three.js default is 2048. */
  readonly fftSize?: number;
  readonly minDecibels?: number;
  readonly maxDecibels?: number;
  readonly smoothingTimeConstant?: number;
}

/**
 * AU-03 — spectrum/level tap on a live node, the `AudioAnalyser` parity class.
 * Wraps a real `AnalyserNode`: `source` is connected into it (the analyser is a
 * tap — it does not need to reach the destination to analyse), and the byte
 * buffers are allocated once per `fftSize` and reused across reads.
 */
export class AudioAnalyser {
  readonly analyser: AnalyserNode;
  private frequencyBins: Uint8Array<ArrayBuffer>;
  private timeDomainBins: Uint8Array<ArrayBuffer>;

  constructor(source: AudioNode, options: AudioAnalyserOptions = {}) {
    const context = options.context ?? contextOfNode(source);
    const create = context?.createAnalyser;
    if (!context || typeof create !== "function") {
      throw new Error(
        "AudioAnalyser requires a context with createAnalyser — real AudioContext/OfflineAudioContext provide it; pass { context } when the source node does not expose one"
      );
    }
    const fftSize = options.fftSize ?? 2048;
    if (!Number.isInteger(fftSize) || fftSize < 32 || fftSize > 32_768 || (fftSize & (fftSize - 1)) !== 0) {
      throw new RangeError("AudioAnalyser fftSize must be a power of two between 32 and 32768");
    }
    const analyser = create.call(context);
    analyser.fftSize = fftSize;
    if (options.minDecibels !== undefined) analyser.minDecibels = options.minDecibels;
    if (options.maxDecibels !== undefined) analyser.maxDecibels = options.maxDecibels;
    if (options.smoothingTimeConstant !== undefined) analyser.smoothingTimeConstant = options.smoothingTimeConstant;
    source.connect(analyser);
    this.analyser = analyser;
    this.frequencyBins = new Uint8Array(analyser.frequencyBinCount || fftSize / 2);
    this.timeDomainBins = new Uint8Array(analyser.fftSize || fftSize);
  }

  get fftSize(): number {
    return this.analyser.fftSize;
  }

  get frequencyBinCount(): number {
    return this.analyser.frequencyBinCount;
  }

  /** Latest byte spectrum (0–255 per bin, dB-mapped); the same array is returned every call. */
  getFrequencyData(): Uint8Array {
    this.analyser.getByteFrequencyData(this.frequencyBins);
    return this.frequencyBins;
  }

  /** Mean of the byte spectrum — three.js `getAverageFrequency` parity. */
  getAverageFrequency(): number {
    const data = this.getFrequencyData();
    if (data.length === 0) return 0;
    let sum = 0;
    for (const value of data) sum += value;
    return sum / data.length;
  }

  /** Latest byte waveform (128 = zero); the same array is returned every call. */
  getTimeDomainData(): Uint8Array {
    this.analyser.getByteTimeDomainData(this.timeDomainBins);
    return this.timeDomainBins;
  }

  disconnect(): void {
    this.analyser.disconnect();
  }
}

/**
 * `createAnalyser(source, fftSize?, context?)` — the AU-03 factory spelling.
 * `context` (or `{ context }` in options) is only needed when the source node
 * does not expose `.context` itself (fakes); real `AudioNode`s resolve it.
 */
export function createAudioAnalyser(
  source: AudioNode,
  options: AudioAnalyserOptions | number = {},
  context?: AudioContextLike
): AudioAnalyser {
  return new AudioAnalyser(source, typeof options === "number" ? { fftSize: options, context } : options);
}

function contextOfNode(source: AudioNode): AudioContextLike | undefined {
  return (source as unknown as { context?: AudioContextLike }).context;
}
