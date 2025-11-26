import { Logger } from '../core/Logger';

/**
 * Audio format types
 */
export enum AudioFormat {
  /** WAV format */
  WAV = 'wav',
  /** MP3 format */
  MP3 = 'mp3',
  /** OGG format */
  OGG = 'ogg',
  /** WebM format */
  WEBM = 'webm',
  /** Raw PCM */
  PCM = 'pcm'
}

/**
 * Conversion configuration
 */
export interface ConversionConfig {
  /** Target sample rate */
  sampleRate?: number;
  /** Target channel count */
  channelCount?: number;
  /** Target bit depth (for WAV) */
  bitDepth?: 8 | 16 | 24 | 32;
  /** Normalize audio (0-1) */
  normalize?: boolean;
}

/**
 * Audio format conversion utilities.
 * Converts between different audio formats and provides encoding/decoding.
 *
 * @example
 * ```typescript
 * const converter = new AudioConverter(audioContext);
 * const wavBlob = await converter.audioBufferToWav(buffer);
 * const buffer = await converter.blobToAudioBuffer(blob);
 * ```
 */
export class AudioConverter {
  private logger: Logger;
  private audioContext: AudioContext;

  /**
   * Creates a new AudioConverter instance
   *
   * @param audioContext - Web Audio API audio context
   */
  constructor(audioContext: AudioContext) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;
    this.logger.info('AudioConverter', 'Initialized');
  }

  /**
   * Converts an AudioBuffer to WAV format
   *
   * @param buffer - Audio buffer to convert
   * @param config - Conversion configuration
   * @returns WAV blob
   */
  async audioBufferToWav(buffer: AudioBuffer, config: ConversionConfig = {}): Promise<Blob> {
    const bitDepth = config.bitDepth ?? 16;
    const channelCount = config.channelCount ?? buffer.numberOfChannels;
    const sampleRate = config.sampleRate ?? buffer.sampleRate;

    let audioBuffer = buffer;

    if (sampleRate !== buffer.sampleRate || channelCount !== buffer.numberOfChannels) {
      audioBuffer = await this.resampleBuffer(buffer, sampleRate, channelCount);
    }

    if (config.normalize) {
      audioBuffer = this.normalizeBuffer(audioBuffer);
    }

    const length = audioBuffer.length * channelCount;
    const bytesPerSample = bitDepth / 8;
    const dataLength = length * bytesPerSample;
    const buffer_size = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(buffer_size);
    const view = new DataView(arrayBuffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, buffer_size - 8, true);
    this.writeString(view, 8, 'WAVE');

    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
    view.setUint16(32, channelCount * bytesPerSample, true);
    view.setUint16(34, bitDepth, true);

    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    const channels: Float32Array[] = [];

    for (let i = 0; i < channelCount; i++) {
      channels.push(audioBuffer.getChannelData(Math.min(i, audioBuffer.numberOfChannels - 1)));
    }

    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < channelCount; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));

        switch (bitDepth) {
          case 8:
            view.setUint8(offset, (sample + 1) * 127.5);
            offset += 1;
            break;
          case 16:
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
            break;
          case 24: {
            const val = Math.floor(sample * 0x7FFFFF);
            view.setUint8(offset, val & 0xFF);
            view.setUint8(offset + 1, (val >> 8) & 0xFF);
            view.setUint8(offset + 2, (val >> 16) & 0xFF);
            offset += 3;
            break;
          }
          case 32:
            view.setFloat32(offset, sample, true);
            offset += 4;
            break;
        }
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Writes a string to a DataView
   *
   * @param view - DataView to write to
   * @param offset - Offset in bytes
   * @param string - String to write
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Converts a Blob to AudioBuffer
   *
   * @param blob - Audio blob
   * @returns Promise that resolves to AudioBuffer
   */
  async blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Converts a URL to AudioBuffer
   *
   * @param url - Audio file URL
   * @returns Promise that resolves to AudioBuffer
   */
  async urlToAudioBuffer(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Resamples an AudioBuffer to a different sample rate
   *
   * @param buffer - Source audio buffer
   * @param targetSampleRate - Target sample rate
   * @param targetChannels - Target number of channels
   * @returns Promise that resolves to resampled buffer
   */
  async resampleBuffer(
    buffer: AudioBuffer,
    targetSampleRate: number,
    targetChannels?: number
  ): Promise<AudioBuffer> {
    const channelCount = targetChannels ?? buffer.numberOfChannels;
    const ratio = buffer.sampleRate / targetSampleRate;
    const newLength = Math.floor(buffer.length / ratio);

    const offlineContext = new OfflineAudioContext(
      channelCount,
      newLength,
      targetSampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineContext.destination);
    source.start(0);

    return await offlineContext.startRendering();
  }

  /**
   * Normalizes an AudioBuffer
   *
   * @param buffer - Audio buffer to normalize
   * @returns Normalized audio buffer
   */
  normalizeBuffer(buffer: AudioBuffer): AudioBuffer {
    const newBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      const newChannelData = newBuffer.getChannelData(channel);

      let max = 0;
      for (let i = 0; i < channelData.length; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > max) {
          max = abs;
        }
      }

      const scale = max > 0 ? 1 / max : 1;

      for (let i = 0; i < channelData.length; i++) {
        newChannelData[i] = channelData[i] * scale;
      }
    }

    return newBuffer;
  }

  /**
   * Converts stereo to mono
   *
   * @param buffer - Stereo audio buffer
   * @returns Mono audio buffer
   */
  stereoToMono(buffer: AudioBuffer): AudioBuffer {
    if (buffer.numberOfChannels === 1) {
      return buffer;
    }

    const monoBuffer = this.audioContext.createBuffer(
      1,
      buffer.length,
      buffer.sampleRate
    );

    const monoData = monoBuffer.getChannelData(0);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    for (let i = 0; i < buffer.length; i++) {
      monoData[i] = (leftData[i] + rightData[i]) / 2;
    }

    return monoBuffer;
  }

  /**
   * Converts mono to stereo
   *
   * @param buffer - Mono audio buffer
   * @returns Stereo audio buffer
   */
  monoToStereo(buffer: AudioBuffer): AudioBuffer {
    if (buffer.numberOfChannels === 2) {
      return buffer;
    }

    const stereoBuffer = this.audioContext.createBuffer(
      2,
      buffer.length,
      buffer.sampleRate
    );

    const sourceData = buffer.getChannelData(0);
    const leftData = stereoBuffer.getChannelData(0);
    const rightData = stereoBuffer.getChannelData(1);

    for (let i = 0; i < buffer.length; i++) {
      leftData[i] = sourceData[i];
      rightData[i] = sourceData[i];
    }

    return stereoBuffer;
  }

  /**
   * Reverses an AudioBuffer
   *
   * @param buffer - Audio buffer to reverse
   * @returns Reversed audio buffer
   */
  reverseBuffer(buffer: AudioBuffer): AudioBuffer {
    const reversedBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const reversedData = reversedBuffer.getChannelData(channel);

      for (let i = 0; i < buffer.length; i++) {
        reversedData[i] = sourceData[buffer.length - 1 - i];
      }
    }

    return reversedBuffer;
  }

  /**
   * Extracts a portion of an AudioBuffer
   *
   * @param buffer - Source audio buffer
   * @param start - Start time in seconds
   * @param duration - Duration in seconds
   * @returns Extracted audio buffer
   */
  extractSegment(buffer: AudioBuffer, start: number, duration: number): AudioBuffer {
    const startSample = Math.floor(start * buffer.sampleRate);
    const durationSamples = Math.floor(duration * buffer.sampleRate);
    const endSample = Math.min(startSample + durationSamples, buffer.length);
    const length = endSample - startSample;

    const segment = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      length,
      buffer.sampleRate
    );

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const segmentData = segment.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        segmentData[i] = sourceData[startSample + i];
      }
    }

    return segment;
  }

  /**
   * Concatenates multiple AudioBuffers
   *
   * @param buffers - Array of audio buffers to concatenate
   * @returns Concatenated audio buffer
   */
  concatenateBuffers(buffers: AudioBuffer[]): AudioBuffer {
    if (buffers.length === 0) {
      throw new Error('No buffers to concatenate');
    }

    const channelCount = buffers[0].numberOfChannels;
    const sampleRate = buffers[0].sampleRate;
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);

    const concatenated = this.audioContext.createBuffer(
      channelCount,
      totalLength,
      sampleRate
    );

    let offset = 0;

    for (const buffer of buffers) {
      for (let channel = 0; channel < channelCount; channel++) {
        const sourceData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        const destData = concatenated.getChannelData(channel);

        for (let i = 0; i < buffer.length; i++) {
          destData[offset + i] = sourceData[i];
        }
      }

      offset += buffer.length;
    }

    return concatenated;
  }

  /**
   * Applies fade in to an AudioBuffer
   *
   * @param buffer - Audio buffer
   * @param duration - Fade duration in seconds
   * @returns Audio buffer with fade in
   */
  fadeIn(buffer: AudioBuffer, duration: number): AudioBuffer {
    const fadedBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const fadeSamples = Math.floor(duration * buffer.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const fadedData = fadedBuffer.getChannelData(channel);

      for (let i = 0; i < buffer.length; i++) {
        const gain = i < fadeSamples ? i / fadeSamples : 1;
        fadedData[i] = sourceData[i] * gain;
      }
    }

    return fadedBuffer;
  }

  /**
   * Applies fade out to an AudioBuffer
   *
   * @param buffer - Audio buffer
   * @param duration - Fade duration in seconds
   * @returns Audio buffer with fade out
   */
  fadeOut(buffer: AudioBuffer, duration: number): AudioBuffer {
    const fadedBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const fadeSamples = Math.floor(duration * buffer.sampleRate);
    const fadeStart = buffer.length - fadeSamples;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const fadedData = fadedBuffer.getChannelData(channel);

      for (let i = 0; i < buffer.length; i++) {
        const gain = i > fadeStart ? (buffer.length - i) / fadeSamples : 1;
        fadedData[i] = sourceData[i] * gain;
      }
    }

    return fadedBuffer;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.logger.info('AudioConverter', 'Disposed');
  }
}
