import { Logger } from '../core/Logger';

/**
 * Stream configuration
 */
export interface StreamConfig {
  /** Buffer size in seconds */
  bufferSize?: number;
  /** Number of buffers to use */
  bufferCount?: number;
  /** Preload size in seconds */
  preloadSize?: number;
  /** Enable loop */
  loop?: boolean;
}

/**
 * Stream state
 */
export enum StreamState {
  /** Stream is idle */
  IDLE = 'idle',
  /** Stream is loading */
  LOADING = 'loading',
  /** Stream is playing */
  PLAYING = 'playing',
  /** Stream is paused */
  PAUSED = 'paused',
  /** Stream encountered an error */
  ERROR = 'error'
}

/**
 * Streaming progress data
 */
export interface StreamProgress {
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Buffered ranges */
  buffered: Array<{ start: number; end: number }>;
  /** Loading progress (0-1) */
  loadProgress: number;
}

/**
 * Audio streamer for long audio files.
 * Streams audio data progressively to reduce memory usage.
 *
 * @example
 * ```typescript
 * const streamer = new AudioStreamer(audioContext);
 * await streamer.load('https://example.com/long-audio.mp3');
 * streamer.play();
 * ```
 */
export class AudioStreamer {
  private logger: Logger;
  private audioContext: AudioContext;
  private config: Required<StreamConfig>;

  private mediaElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode;

  private state: StreamState = StreamState.IDLE;
  private duration: number = 0;

  private onStateChangeCallbacks: Array<(state: StreamState) => void> = [];
  private onProgressCallbacks: Array<(progress: StreamProgress) => void> = [];
  private onEndedCallbacks: Array<() => void> = [];
  private onErrorCallbacks: Array<(error: Error) => void> = [];

  /**
   * Creates a new AudioStreamer instance
   *
   * @param audioContext - Web Audio API audio context
   * @param config - Stream configuration
   */
  constructor(audioContext: AudioContext, config: StreamConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;

    this.config = {
      bufferSize: config.bufferSize ?? 10,
      bufferCount: config.bufferCount ?? 3,
      preloadSize: config.preloadSize ?? 5,
      loop: config.loop ?? false
    };

    this.gainNode = audioContext.createGain();

    this.logger.info('AudioStreamer', 'Initialized');
  }

  /**
   * Loads an audio file for streaming
   *
   * @param url - URL of the audio file
   * @returns Promise that resolves when loading starts
   */
  async load(url: string): Promise<void> {
    this.setState(StreamState.LOADING);

    try {
      this.mediaElement = new Audio();
      this.mediaElement.crossOrigin = 'anonymous';
      this.mediaElement.preload = 'auto';
      this.mediaElement.loop = this.config.loop;

      this.setupMediaElementListeners();

      this.sourceNode = this.audioContext.createMediaElementSource(this.mediaElement);
      this.sourceNode.connect(this.gainNode);

      this.mediaElement.src = url;

      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          this.duration = this.mediaElement?.duration ?? 0;
          this.setState(StreamState.IDLE);
          cleanup();
          resolve();
        };

        const onError = () => {
          const error = new Error('Failed to load audio');
          this.handleError(error);
          cleanup();
          reject(error);
        };

        const cleanup = () => {
          this.mediaElement?.removeEventListener('canplaythrough', onCanPlay);
          this.mediaElement?.removeEventListener('error', onError);
        };

        this.mediaElement?.addEventListener('canplaythrough', onCanPlay);
        this.mediaElement?.addEventListener('error', onError);
      });

      this.logger.info('AudioStreamer', `Loaded audio from ${url}`);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Sets up media element event listeners
   */
  private setupMediaElementListeners(): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.addEventListener('play', () => {
      this.setState(StreamState.PLAYING);
    });

    this.mediaElement.addEventListener('pause', () => {
      this.setState(StreamState.PAUSED);
    });

    this.mediaElement.addEventListener('ended', () => {
      this.setState(StreamState.IDLE);
      this.onEndedCallbacks.forEach(callback => callback());
    });

    this.mediaElement.addEventListener('timeupdate', () => {
      this.emitProgress();
    });

    this.mediaElement.addEventListener('error', () => {
      const error = new Error('Media element error');
      this.handleError(error);
    });

    this.mediaElement.addEventListener('progress', () => {
      this.emitProgress();
    });
  }

  /**
   * Plays the audio stream
   */
  async play(): Promise<void> {
    if (!this.mediaElement) {
      throw new Error('No audio loaded');
    }

    try {
      await this.mediaElement.play();
      this.setState(StreamState.PLAYING);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Pauses the audio stream
   */
  pause(): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.pause();
    this.setState(StreamState.PAUSED);
  }

  /**
   * Stops the audio stream
   */
  stop(): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.pause();
    this.mediaElement.currentTime = 0;
    this.setState(StreamState.IDLE);
  }

  /**
   * Seeks to a specific time
   *
   * @param time - Time in seconds
   */
  seek(time: number): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.currentTime = Math.max(0, Math.min(time, this.duration));
  }

  /**
   * Sets the playback volume
   *
   * @param volume - Volume level (0-1)
   */
  setVolume(volume: number): void {
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Sets the playback rate
   *
   * @param rate - Playback rate (0.5-2.0)
   */
  setPlaybackRate(rate: number): void {
    if (!this.mediaElement) {
      return;
    }

    this.mediaElement.playbackRate = Math.max(0.5, Math.min(2.0, rate));
  }

  /**
   * Sets loop mode
   *
   * @param loop - Whether to loop
   */
  setLoop(loop: boolean): void {
    this.config.loop = loop;

    if (this.mediaElement) {
      this.mediaElement.loop = loop;
    }
  }

  /**
   * Gets the current stream state
   *
   * @returns Current stream state
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Gets the current playback time
   *
   * @returns Current time in seconds
   */
  getCurrentTime(): number {
    return this.mediaElement?.currentTime ?? 0;
  }

  /**
   * Gets the total duration
   *
   * @returns Duration in seconds
   */
  getDuration(): number {
    return this.duration;
  }

  /**
   * Gets the current progress
   *
   * @returns Stream progress data
   */
  getProgress(): StreamProgress {
    const buffered: Array<{ start: number; end: number }> = [];

    if (this.mediaElement?.buffered) {
      for (let i = 0; i < this.mediaElement.buffered.length; i++) {
        buffered.push({
          start: this.mediaElement.buffered.start(i),
          end: this.mediaElement.buffered.end(i)
        });
      }
    }

    const loadProgress = this.duration > 0 && buffered.length > 0
      ? buffered[buffered.length - 1].end / this.duration
      : 0;

    return {
      currentTime: this.getCurrentTime(),
      duration: this.duration,
      buffered,
      loadProgress
    };
  }

  /**
   * Sets the stream state
   *
   * @param state - New state
   */
  private setState(state: StreamState): void {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.onStateChangeCallbacks.forEach(callback => callback(state));
  }

  /**
   * Emits progress update
   */
  private emitProgress(): void {
    const progress = this.getProgress();
    this.onProgressCallbacks.forEach(callback => callback(progress));
  }

  /**
   * Handles errors
   *
   * @param error - Error that occurred
   */
  private handleError(error: Error): void {
    this.setState(StreamState.ERROR);
    this.onErrorCallbacks.forEach(callback => callback(error));
    this.logger.error('AudioStreamer', `Error: ${error.message}`);
  }

  /**
   * Registers a callback for state changes
   *
   * @param callback - State change callback
   */
  onStateChange(callback: (state: StreamState) => void): void {
    this.onStateChangeCallbacks.push(callback);
  }

  /**
   * Registers a callback for progress updates
   *
   * @param callback - Progress callback
   */
  onProgress(callback: (progress: StreamProgress) => void): void {
    this.onProgressCallbacks.push(callback);
  }

  /**
   * Registers a callback for when playback ends
   *
   * @param callback - Ended callback
   */
  onEnded(callback: () => void): void {
    this.onEndedCallbacks.push(callback);
  }

  /**
   * Registers a callback for errors
   *
   * @param callback - Error callback
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  /**
   * Checks if the stream is playing
   *
   * @returns True if playing
   */
  isPlaying(): boolean {
    return this.state === StreamState.PLAYING;
  }

  /**
   * Connects the streamer to a destination
   *
   * @param destination - Destination audio node
   */
  connect(destination: AudioNode): void {
    this.gainNode.connect(destination);
  }

  /**
   * Disconnects the streamer from all destinations
   */
  disconnect(): void {
    this.gainNode.disconnect();
  }

  /**
   * Gets the output node
   *
   * @returns Gain node
   */
  getOutputNode(): GainNode {
    return this.gainNode;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.stop();

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaElement) {
      this.mediaElement.src = '';
      this.mediaElement = null;
    }

    this.gainNode.disconnect();

    this.onStateChangeCallbacks = [];
    this.onProgressCallbacks = [];
    this.onEndedCallbacks = [];
    this.onErrorCallbacks = [];

    this.logger.info('AudioStreamer', 'Disposed');
  }
}
