import { Logger } from '../../core/Logger';

/**
 * Audio codec types
 */
export enum AudioCodec {
  OPUS = 'opus',
  PCM = 'pcm',
  AAC = 'aac'
}

/**
 * Audio encoding configuration
 */
export interface AudioEncodingConfig {
  /** Audio codec */
  codec: AudioCodec;
  /** Sample rate (Hz) */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Bitrate (bps) */
  bitrate?: number;
  /** Frame duration (ms) for Opus */
  frameDuration?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Encoded audio frame
 */
export interface EncodedAudioFrame {
  /** Encoded data */
  data: ArrayBuffer;
  /** Timestamp */
  timestamp: number;
  /** Frame duration (ms) */
  duration: number;
  /** Codec used */
  codec: AudioCodec;
}

/**
 * Audio encoder/decoder for voice chat compression.
 * Provides interface for Opus codec and other audio codecs.
 *
 * Note: This is a high-level interface. Actual Opus encoding requires
 * WebAssembly implementation or native codec via WebRTC.
 *
 * @example
 * ```typescript
 * const encoder = new AudioEncoder({
 *   codec: AudioCodec.OPUS,
 *   sampleRate: 48000,
 *   channels: 1,
 *   bitrate: 24000
 * });
 *
 * const encoded = encoder.encode(audioBuffer);
 * const decoded = encoder.decode(encoded);
 * ```
 */
export class AudioEncoder {
  private readonly config: Required<AudioEncodingConfig>;
  private readonly logger: Logger;
  private encoder: any = null; // Would be Opus encoder instance
  private decoder: any = null; // Would be Opus decoder instance

  constructor(config: AudioEncodingConfig) {
    this.config = {
      codec: config.codec,
      sampleRate: config.sampleRate,
      channels: config.channels,
      bitrate: config.bitrate ?? 24000, // 24 kbps default for voice
      frameDuration: config.frameDuration ?? 20, // 20ms frames
      debug: config.debug ?? false
    };
    this.logger = new Logger('AudioEncoder');

    this.initialize();
  }

  /**
   * Initialize encoder/decoder
   */
  private initialize(): void {
    if (this.config.codec === AudioCodec.OPUS) {
      // In a real implementation, this would initialize Opus codec
      // via WebAssembly or native implementation
      if (this.config.debug) {
        this.logger.debug('Opus codec initialized (stub)');
      }
    } else if (this.config.codec === AudioCodec.PCM) {
      // PCM is uncompressed, no codec needed
      if (this.config.debug) {
        this.logger.debug('PCM codec initialized');
      }
    } else if (this.config.codec === AudioCodec.AAC) {
      // AAC codec initialization
      if (this.config.debug) {
        this.logger.debug('AAC codec initialized (stub)');
      }
    }
  }

  /**
   * Encode audio data
   *
   * @param audioData - Float32Array audio samples
   * @returns Encoded audio frame
   */
  public encode(audioData: Float32Array): EncodedAudioFrame {
    const timestamp = performance.now();

    let encodedData: ArrayBuffer;

    switch (this.config.codec) {
      case AudioCodec.OPUS:
        encodedData = this.encodeOpus(audioData);
        break;

      case AudioCodec.PCM:
        encodedData = this.encodePCM(audioData);
        break;

      case AudioCodec.AAC:
        encodedData = this.encodeAAC(audioData);
        break;

      default:
        throw new Error(`Unsupported codec: ${this.config.codec}`);
    }

    const duration = (audioData.length / this.config.sampleRate) * 1000;

    if (this.config.debug) {
      this.logger.debug(
        `Encoded ${audioData.length} samples to ${encodedData.byteLength} bytes`
      );
    }

    return {
      data: encodedData,
      timestamp,
      duration,
      codec: this.config.codec
    };
  }

  /**
   * Decode audio data
   *
   * @param frame - Encoded audio frame
   * @returns Decoded Float32Array audio samples
   */
  public decode(frame: EncodedAudioFrame): Float32Array {
    let decodedData: Float32Array;

    switch (frame.codec) {
      case AudioCodec.OPUS:
        decodedData = this.decodeOpus(frame.data);
        break;

      case AudioCodec.PCM:
        decodedData = this.decodePCM(frame.data);
        break;

      case AudioCodec.AAC:
        decodedData = this.decodeAAC(frame.data);
        break;

      default:
        throw new Error(`Unsupported codec: ${frame.codec}`);
    }

    if (this.config.debug) {
      this.logger.debug(
        `Decoded ${frame.data.byteLength} bytes to ${decodedData.length} samples`
      );
    }

    return decodedData;
  }

  /**
   * Encode audio using Opus codec
   * Note: Stub implementation - would use actual Opus encoder
   */
  private encodeOpus(audioData: Float32Array): ArrayBuffer {
    // In production, this would use libopus via WebAssembly
    // For now, we'll do a simple conversion to Int16

    const frameSize = (this.config.sampleRate * this.config.frameDuration) / 1000;
    const int16Data = new Int16Array(frameSize);

    for (let i = 0; i < Math.min(audioData.length, frameSize); i++) {
      // Convert float32 [-1, 1] to int16 [-32768, 32767]
      const s = Math.max(-1, Math.min(1, audioData[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Simulate compression (actual Opus would achieve ~10:1 compression)
    return int16Data.buffer;
  }

  /**
   * Decode audio using Opus codec
   * Note: Stub implementation - would use actual Opus decoder
   */
  private decodeOpus(encodedData: ArrayBuffer): Float32Array {
    // In production, this would use libopus via WebAssembly
    const int16Data = new Int16Array(encodedData);
    const float32Data = new Float32Array(int16Data.length);

    for (let i = 0; i < int16Data.length; i++) {
      // Convert int16 to float32
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
    }

    return float32Data;
  }

  /**
   * Encode audio as PCM (uncompressed)
   */
  private encodePCM(audioData: Float32Array): ArrayBuffer {
    const int16Data = new Int16Array(audioData.length);

    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return int16Data.buffer;
  }

  /**
   * Decode PCM audio
   */
  private decodePCM(encodedData: ArrayBuffer): Float32Array {
    const int16Data = new Int16Array(encodedData);
    const float32Data = new Float32Array(int16Data.length);

    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
    }

    return float32Data;
  }

  /**
   * Encode audio using AAC codec
   * Note: Stub implementation
   */
  private encodeAAC(audioData: Float32Array): ArrayBuffer {
    // AAC encoding would require a proper encoder library
    // For now, fall back to PCM
    return this.encodePCM(audioData);
  }

  /**
   * Decode AAC audio
   * Note: Stub implementation
   */
  private decodeAAC(encodedData: ArrayBuffer): Float32Array {
    // AAC decoding would require a proper decoder library
    // For now, fall back to PCM
    return this.decodePCM(encodedData);
  }

  /**
   * Get encoder configuration
   */
  public getConfig(): AudioEncodingConfig {
    return { ...this.config };
  }

  /**
   * Calculate frame size in samples
   */
  public getFrameSize(): number {
    return Math.floor((this.config.sampleRate * this.config.frameDuration) / 1000);
  }

  /**
   * Calculate expected bitrate
   */
  public getBitrate(): number {
    if (this.config.codec === AudioCodec.PCM) {
      // PCM bitrate = sample_rate * bit_depth * channels
      return this.config.sampleRate * 16 * this.config.channels;
    }
    return this.config.bitrate;
  }

  /**
   * Estimate compression ratio
   */
  public getCompressionRatio(): number {
    if (this.config.codec === AudioCodec.PCM) {
      return 1.0; // No compression
    } else if (this.config.codec === AudioCodec.OPUS) {
      // Opus typically achieves 10:1 to 20:1 compression for voice
      const uncompressedBitrate = this.config.sampleRate * 16 * this.config.channels;
      return uncompressedBitrate / this.config.bitrate;
    } else if (this.config.codec === AudioCodec.AAC) {
      // AAC typically achieves 8:1 to 12:1 compression
      const uncompressedBitrate = this.config.sampleRate * 16 * this.config.channels;
      return uncompressedBitrate / this.config.bitrate;
    }
    return 1.0;
  }

  /**
   * Process audio buffer from AudioContext
   *
   * @param audioBuffer - Web Audio API AudioBuffer
   * @returns Array of encoded frames
   */
  public processAudioBuffer(audioBuffer: AudioBuffer): EncodedAudioFrame[] {
    const frames: EncodedAudioFrame[] = [];
    const frameSize = this.getFrameSize();
    const channelData = audioBuffer.getChannelData(0); // Use first channel

    // Split into frames
    for (let i = 0; i < channelData.length; i += frameSize) {
      const frameData = channelData.slice(i, i + frameSize);

      // Pad last frame if needed
      if (frameData.length < frameSize) {
        const padded = new Float32Array(frameSize);
        padded.set(frameData);
        frames.push(this.encode(padded));
      } else {
        frames.push(this.encode(frameData));
      }
    }

    return frames;
  }

  /**
   * Create AudioBuffer from decoded frames
   *
   * @param frames - Array of encoded frames
   * @param audioContext - Web Audio API AudioContext
   * @returns AudioBuffer
   */
  public createAudioBuffer(
    frames: EncodedAudioFrame[],
    audioContext: AudioContext
  ): AudioBuffer {
    // Decode all frames
    const decodedFrames = frames.map(frame => this.decode(frame));

    // Calculate total length
    const totalLength = decodedFrames.reduce((sum, frame) => sum + frame.length, 0);

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(
      this.config.channels,
      totalLength,
      this.config.sampleRate
    );

    // Copy decoded data
    const channelData = audioBuffer.getChannelData(0);
    let offset = 0;
    for (const frame of decodedFrames) {
      channelData.set(frame, offset);
      offset += frame.length;
    }

    return audioBuffer;
  }

  /**
   * Get encoder statistics
   */
  public getStats(): {
    codec: AudioCodec;
    sampleRate: number;
    channels: number;
    bitrate: number;
    compressionRatio: number;
    frameSize: number;
  } {
    return {
      codec: this.config.codec,
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      bitrate: this.getBitrate(),
      compressionRatio: this.getCompressionRatio(),
      frameSize: this.getFrameSize()
    };
  }
}
