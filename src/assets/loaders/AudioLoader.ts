import { Asset } from '../Asset';
import { IAssetLoader, LoadOptions } from '../AssetLoader';

/**
 * Audio format types
 */
export enum AudioFormat {
  MP3 = 'mp3',
  OGG = 'ogg',
  WAV = 'wav',
  M4A = 'm4a',
  WEBM = 'webm'
}

/**
 * Audio data
 */
export interface AudioData {
  format: AudioFormat;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  buffer?: AudioBuffer;
  element?: HTMLAudioElement;
}

/**
 * Audio asset
 */
export class AudioAsset extends Asset {
  private audioData: AudioData | null = null;

  /**
   * Gets the audio data
   */
  getData(): AudioData | null {
    return this.audioData;
  }

  /**
   * Sets the audio data
   */
  setData(data: AudioData): void {
    this.audioData = data;
  }

  /**
   * Gets the audio duration in seconds
   */
  get duration(): number {
    return this.audioData?.duration || 0;
  }

  /**
   * Gets the sample rate
   */
  get sampleRate(): number {
    return this.audioData?.sampleRate || 0;
  }

  /**
   * Gets the number of channels
   */
  get numberOfChannels(): number {
    return this.audioData?.numberOfChannels || 0;
  }

  /**
   * Gets estimated memory size
   */
  getMemorySize(): number {
    if (!this.audioData || !this.audioData.buffer) {
      return 0;
    }

    // AudioBuffer memory = channels * length * 4 bytes (Float32)
    return (
      this.audioData.buffer.numberOfChannels *
      this.audioData.buffer.length *
      4
    );
  }

  /**
   * Disposes the asset
   */
  override dispose(): void {
    if (this.audioData) {
      // Clean up HTMLAudioElement
      if (this.audioData.element) {
        this.audioData.element.pause();
        this.audioData.element.src = '';
        this.audioData.element.load();
      }

      this.audioData = null;
    }

    super.dispose();
  }
}

/**
 * Audio loader with support for:
 * - MP3, OGG, WAV formats
 * - Web Audio API decoding
 * - Streaming for large files
 * - HTMLAudioElement fallback
 *
 * @example
 * ```typescript
 * const loader = new AudioLoader({
 *   useWebAudio: true,
 *   streaming: false
 * });
 *
 * const asset = await loader.load('music.mp3');
 * console.log(`Loaded ${asset.duration.toFixed(2)}s audio`);
 * ```
 */
export class AudioLoader implements IAssetLoader<AudioAsset> {
  private audioContext: AudioContext | null = null;
  private useWebAudio: boolean;
  private streaming: boolean;

  /**
   * Creates a new audio loader
   */
  constructor(options: {
    audioContext?: AudioContext;
    useWebAudio?: boolean;
    streaming?: boolean;
  } = {}) {
    this.audioContext = options.audioContext || null;
    this.useWebAudio = options.useWebAudio !== false;
    this.streaming = options.streaming || false;
  }

  /**
   * Loads an audio asset
   */
  async load(url: string, options: LoadOptions = {}): Promise<AudioAsset> {
    const asset = new AudioAsset({ name: url, metadata: { uri: url } });

    try {
      const format = this.detectFormat(url);

      let audioData: AudioData;

      if (this.streaming) {
        // Use HTMLAudioElement for streaming
        audioData = await this.loadStreaming(url, format, options);
      } else if (this.useWebAudio) {
        // Use Web Audio API for decoded buffer
        audioData = await this.loadWebAudio(url, format, options);
      } else {
        // Fallback to HTMLAudioElement
        audioData = await this.loadHTMLAudio(url, format, options);
      }

      asset.setData(audioData);

      return asset;
    } catch (error) {
      throw new Error(`Failed to load audio: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if this loader can handle the URL
   */
  canLoad(url: string): boolean {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['mp3', 'ogg', 'wav', 'm4a', 'webm'].includes(ext || '');
  }

  /**
   * Gets supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['mp3', 'ogg', 'wav', 'm4a', 'webm'];
  }

  /**
   * Detects audio format from URL
   * @private
   */
  private detectFormat(url: string): AudioFormat {
    const ext = url.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'mp3': return AudioFormat.MP3;
      case 'ogg': return AudioFormat.OGG;
      case 'wav': return AudioFormat.WAV;
      case 'm4a': return AudioFormat.M4A;
      case 'webm': return AudioFormat.WEBM;
      default: return AudioFormat.MP3;
    }
  }

  /**
   * Loads audio using Web Audio API
   * @private
   */
  private async loadWebAudio(
    url: string,
    format: AudioFormat,
    options: LoadOptions
  ): Promise<AudioData> {
    // Get or create audio context
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Fetch audio data
    const response = await fetch(url, {
      headers: options.headers,
      credentials: options.credentials,
      signal: options.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Track progress
    let loaded = 0;
    const total = parseInt(response.headers.get('Content-Length') || '0');

    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      loaded += value.length;

      if (options.onProgress && total > 0) {
        options.onProgress(loaded, total);
      }
    }

    // Concatenate chunks
    const buffer = new Uint8Array(loaded);
    let offset = 0;

    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Decode audio
    const audioBuffer = await this.audioContext.decodeAudioData(buffer.buffer);

    return {
      format,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      buffer: audioBuffer
    };
  }

  /**
   * Loads audio using HTMLAudioElement
   * @private
   */
  private async loadHTMLAudio(
    url: string,
    format: AudioFormat,
    options: LoadOptions
  ): Promise<AudioData> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();

      audio.oncanplaythrough = () => {
        resolve({
          format,
          duration: audio.duration,
          sampleRate: 44100, // Estimate
          numberOfChannels: 2, // Estimate
          element: audio
        });
      };

      audio.onerror = () => {
        reject(new Error('Failed to load audio'));
      };

      if (options.credentials) {
        audio.crossOrigin = options.credentials;
      }

      audio.src = url;
      audio.load();
    });
  }

  /**
   * Loads audio for streaming playback
   * @private
   */
  private async loadStreaming(
    url: string,
    format: AudioFormat,
    options: LoadOptions
  ): Promise<AudioData> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();

      // Resolve as soon as metadata is loaded
      audio.onloadedmetadata = () => {
        resolve({
          format,
          duration: audio.duration,
          sampleRate: 44100, // Estimate
          numberOfChannels: 2, // Estimate
          element: audio
        });
      };

      audio.onerror = () => {
        reject(new Error('Failed to load audio'));
      };

      if (options.credentials) {
        audio.crossOrigin = options.credentials;
      }

      // Enable streaming
      audio.preload = 'metadata';
      audio.src = url;
      audio.load();
    });
  }

  /**
   * Gets or creates the audio context
   */
  getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    return this.audioContext;
  }

  /**
   * Disposes the loader
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
