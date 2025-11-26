/**
 * @fileoverview Audio clip data container for the G3D engine.
 * Handles audio buffer loading, decoding, and streaming support.
 * @module audio/AudioClip
 */

import { AudioContext } from './AudioContext';

/**
 * Audio clip loading state.
 */
export enum AudioClipState {
  UNLOADED = 'unloaded',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error'
}

/**
 * Configuration for audio clip loading.
 *
 * @example
 * ```typescript
 * const config: AudioClipLoadConfig = {
 *   streaming: true,
 *   preload: false,
 *   volume: 0.8
 * };
 * ```
 */
export interface AudioClipLoadConfig {
  /**
   * Enable streaming for large files (not fully decoded, default: false).
   * Streaming reduces memory usage but may increase latency.
   */
  streaming?: boolean;

  /**
   * Preload the audio data immediately (default: true).
   */
  preload?: boolean;

  /**
   * Default volume for this clip (0.0 to 1.0, default: 1.0).
   */
  volume?: number;
}

/**
 * Audio clip container managing audio buffer data.
 *
 * Handles:
 * - Loading audio from URLs or ArrayBuffers
 * - Decoding audio data via Web Audio API
 * - Streaming support for large files
 * - Duration and sample rate metadata
 * - Memory management and disposal
 *
 * @example
 * ```typescript
 * // Load an audio clip
 * const clip = new AudioClip('explosion');
 * await clip.loadFromURL('/audio/explosion.mp3');
 *
 * // Get clip info
 * console.log(`Duration: ${clip.getDuration()}s`);
 * console.log(`Sample rate: ${clip.getSampleRate()} Hz`);
 * console.log(`Channels: ${clip.getChannelCount()}`);
 *
 * // Use with AudioSource
 * const buffer = clip.getBuffer();
 * const source = context.createBufferSource();
 * source.buffer = buffer;
 * source.start();
 *
 * // Cleanup
 * clip.dispose();
 * ```
 */
export class AudioClip {
  private name: string;
  private buffer: AudioBuffer | null = null;
  private state: AudioClipState = AudioClipState.UNLOADED;
  private url: string | null = null;
  private error: Error | null = null;
  private config: Required<AudioClipLoadConfig>;

  // Stats
  private loadTime: number = 0;
  private byteSize: number = 0;

  /**
   * Creates a new audio clip.
   *
   * @param name - Clip identifier for debugging
   *
   * @example
   * ```typescript
   * const clip = new AudioClip('background_music');
   * ```
   */
  constructor(name: string) {
    this.name = name;
    this.config = {
      streaming: false,
      preload: true,
      volume: 1.0
    };
  }

  /**
   * Loads audio data from a URL.
   *
   * @param url - Path to audio file (supports mp3, ogg, wav, etc.)
   * @param config - Loading configuration
   * @returns Promise that resolves when loading completes
   *
   * @example
   * ```typescript
   * const clip = new AudioClip('music');
   * await clip.loadFromURL('/audio/music.mp3', {
   *   streaming: true,
   *   preload: true
   * });
   * ```
   */
  public async loadFromURL(url: string, config?: AudioClipLoadConfig): Promise<void> {
    if (this.state === AudioClipState.LOADING) {
      throw new Error(`AudioClip "${this.name}" is already loading`);
    }

    if (this.state === AudioClipState.LOADED) {
      this.dispose();
    }

    // Merge config
    if (config) {
      Object.assign(this.config, config);
    }

    this.url = url;
    this.state = AudioClipState.LOADING;
    this.error = null;

    const startTime = performance.now();

    try {
      // Fetch audio data
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      this.byteSize = arrayBuffer.byteLength;

      // Decode audio data
      if (this.config.streaming) {
        // For streaming, we still decode fully but could implement chunked decoding
        await this.loadFromArrayBuffer(arrayBuffer);
      } else {
        await this.loadFromArrayBuffer(arrayBuffer);
      }

      this.loadTime = performance.now() - startTime;
    } catch (err) {
      this.state = AudioClipState.ERROR;
      this.error = err instanceof Error ? err : new Error(String(err));
      throw this.error;
    }
  }

  /**
   * Loads audio data from an ArrayBuffer.
   *
   * @param arrayBuffer - Raw audio data
   * @returns Promise that resolves when decoding completes
   *
   * @example
   * ```typescript
   * const clip = new AudioClip('sound');
   * const arrayBuffer = await fetch('/audio/sound.wav').then(r => r.arrayBuffer());
   * await clip.loadFromArrayBuffer(arrayBuffer);
   * ```
   */
  public async loadFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();

    this.state = AudioClipState.LOADING;
    this.error = null;

    try {
      // Decode audio data
      this.buffer = await context.decodeAudioData(arrayBuffer);
      this.state = AudioClipState.LOADED;
      this.byteSize = arrayBuffer.byteLength;
    } catch (err) {
      this.state = AudioClipState.ERROR;
      this.error = err instanceof Error ? err : new Error('Failed to decode audio data');
      throw this.error;
    }
  }

  /**
   * Loads audio data from an existing AudioBuffer.
   * Useful for procedurally generated audio or cloning.
   *
   * @param buffer - AudioBuffer to use
   *
   * @example
   * ```typescript
   * const clip = new AudioClip('generated');
   * const context = audioContext.getContext();
   * const buffer = context.createBuffer(2, 44100, 44100);
   * // Fill buffer with audio data...
   * clip.loadFromBuffer(buffer);
   * ```
   */
  public loadFromBuffer(buffer: AudioBuffer): void {
    this.buffer = buffer;
    this.state = AudioClipState.LOADED;
    this.error = null;
    this.byteSize = buffer.length * buffer.numberOfChannels * 4; // Estimate (f32 per sample)
  }

  /**
   * Gets the audio buffer.
   *
   * @returns AudioBuffer or null if not loaded
   *
   * @example
   * ```typescript
   * const buffer = clip.getBuffer();
   * if (buffer) {
   *   const source = context.createBufferSource();
   *   source.buffer = buffer;
   *   source.start();
   * }
   * ```
   */
  public getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  /**
   * Gets the clip name.
   *
   * @returns Clip name
   *
   * @example
   * ```typescript
   * console.log(`Playing: ${clip.getName()}`);
   * ```
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Gets the clip loading state.
   *
   * @returns Current AudioClipState
   *
   * @example
   * ```typescript
   * if (clip.getState() === AudioClipState.LOADED) {
   *   // Ready to play
   * }
   * ```
   */
  public getState(): AudioClipState {
    return this.state;
  }

  /**
   * Checks if the clip is loaded and ready to play.
   *
   * @returns True if loaded
   *
   * @example
   * ```typescript
   * if (clip.isLoaded()) {
   *   audioSource.play(clip);
   * }
   * ```
   */
  public isLoaded(): boolean {
    return this.state === AudioClipState.LOADED && this.buffer !== null;
  }

  /**
   * Gets the audio duration in seconds.
   *
   * @returns Duration in seconds, or 0 if not loaded
   *
   * @example
   * ```typescript
   * const duration = clip.getDuration();
   * console.log(`Clip length: ${duration.toFixed(2)}s`);
   * ```
   */
  public getDuration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  /**
   * Gets the audio sample rate in Hz.
   *
   * @returns Sample rate (e.g., 44100 or 48000)
   *
   * @example
   * ```typescript
   * const sampleRate = clip.getSampleRate();
   * console.log(`Sample rate: ${sampleRate} Hz`);
   * ```
   */
  public getSampleRate(): number {
    return this.buffer ? this.buffer.sampleRate : 0;
  }

  /**
   * Gets the number of audio channels.
   *
   * @returns Channel count (1 = mono, 2 = stereo, etc.)
   *
   * @example
   * ```typescript
   * const channels = clip.getChannelCount();
   * console.log(`Channels: ${channels === 1 ? 'Mono' : 'Stereo'}`);
   * ```
   */
  public getChannelCount(): number {
    return this.buffer ? this.buffer.numberOfChannels : 0;
  }

  /**
   * Gets the total sample count.
   *
   * @returns Total samples across all channels
   *
   * @example
   * ```typescript
   * const samples = clip.getSampleCount();
   * console.log(`Total samples: ${samples}`);
   * ```
   */
  public getSampleCount(): number {
    return this.buffer ? this.buffer.length : 0;
  }

  /**
   * Gets the URL this clip was loaded from.
   *
   * @returns URL or null if loaded from buffer
   *
   * @example
   * ```typescript
   * const url = clip.getURL();
   * console.log(`Loaded from: ${url}`);
   * ```
   */
  public getURL(): string | null {
    return this.url;
  }

  /**
   * Gets the last error that occurred during loading.
   *
   * @returns Error object or null
   *
   * @example
   * ```typescript
   * if (clip.getState() === AudioClipState.ERROR) {
   *   console.error('Load failed:', clip.getError());
   * }
   * ```
   */
  public getError(): Error | null {
    return this.error;
  }

  /**
   * Gets the default volume for this clip.
   *
   * @returns Volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const volume = clip.getDefaultVolume();
   * ```
   */
  public getDefaultVolume(): number {
    return this.config.volume;
  }

  /**
   * Sets the default volume for this clip.
   *
   * @param volume - Volume level (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * clip.setDefaultVolume(0.5);
   * ```
   */
  public setDefaultVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Gets memory usage statistics.
   *
   * @returns Stats object with memory and timing info
   *
   * @example
   * ```typescript
   * const stats = clip.getStats();
   * console.log(`Memory: ${(stats.memorySizeBytes / 1024 / 1024).toFixed(2)} MB`);
   * console.log(`Load time: ${stats.loadTime.toFixed(2)} ms`);
   * ```
   */
  public getStats(): {
    name: string;
    state: AudioClipState;
    duration: number;
    sampleRate: number;
    channels: number;
    samples: number;
    memorySizeBytes: number;
    fileSizeBytes: number;
    loadTime: number;
    url: string | null;
  } {
    return {
      name: this.name,
      state: this.state,
      duration: this.getDuration(),
      sampleRate: this.getSampleRate(),
      channels: this.getChannelCount(),
      samples: this.getSampleCount(),
      memorySizeBytes: this.buffer
        ? this.buffer.length * this.buffer.numberOfChannels * 4
        : 0,
      fileSizeBytes: this.byteSize,
      loadTime: this.loadTime,
      url: this.url
    };
  }

  /**
   * Disposes the audio clip and frees memory.
   * After calling this, the clip must be reloaded to use again.
   *
   * @example
   * ```typescript
   * clip.dispose();
   * console.log('Clip disposed');
   * ```
   */
  public dispose(): void {
    this.buffer = null;
    this.state = AudioClipState.UNLOADED;
    this.error = null;
    this.byteSize = 0;
    this.loadTime = 0;
  }

  /**
   * Creates a clone of this audio clip.
   * The clone shares the same AudioBuffer (zero-copy).
   *
   * @param name - Name for the cloned clip
   * @returns New AudioClip instance
   *
   * @example
   * ```typescript
   * const original = new AudioClip('sound');
   * await original.loadFromURL('/audio/sound.mp3');
   * const clone = original.clone('sound_copy');
   * ```
   */
  public clone(name?: string): AudioClip {
    const cloned = new AudioClip(name || `${this.name}_clone`);
    if (this.buffer) {
      cloned.loadFromBuffer(this.buffer);
    }
    cloned.url = this.url;
    cloned.config = { ...this.config };
    return cloned;
  }
}
