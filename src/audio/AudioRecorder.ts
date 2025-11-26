import { Logger } from '../core/Logger';

/**
 * Recording configuration
 */
export interface RecordingConfig {
  /** MIME type for recording */
  mimeType?: string;
  /** Audio bitrate in bits per second */
  audioBitsPerSecond?: number;
  /** Time slice for data events in milliseconds */
  timeSlice?: number;
  /** Input device ID (for getUserMedia) */
  deviceId?: string;
  /** Sample rate */
  sampleRate?: number;
  /** Channel count */
  channelCount?: number;
}

/**
 * Recording state
 */
export enum RecordingState {
  /** Recorder is inactive */
  INACTIVE = 'inactive',
  /** Recorder is recording */
  RECORDING = 'recording',
  /** Recorder is paused */
  PAUSED = 'paused'
}

/**
 * Recording data event
 */
export interface RecordingDataEvent {
  /** Audio blob */
  blob: Blob;
  /** Timestamp */
  timestamp: number;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Audio recorder using MediaRecorder API.
 * Records audio from microphone or other audio sources.
 *
 * @example
 * ```typescript
 * const recorder = new AudioRecorder();
 * await recorder.start();
 * setTimeout(() => {
 *   const blob = recorder.stop();
 *   // Use the recorded blob
 * }, 5000);
 * ```
 */
export class AudioRecorder {
  private logger: Logger;
  private config: Required<Omit<RecordingConfig, 'deviceId'>> & { deviceId?: string };

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime: number = 0;

  private onDataCallbacks: Array<(event: RecordingDataEvent) => void> = [];
  private onStateChangeCallbacks: Array<(state: RecordingState) => void> = [];
  private onErrorCallbacks: Array<(error: Error) => void> = [];

  /**
   * Creates a new AudioRecorder instance
   *
   * @param config - Recording configuration
   */
  constructor(config: RecordingConfig = {}) {
    this.logger = Logger.getInstance();

    this.config = {
      mimeType: config.mimeType ?? this.getSupportedMimeType(),
      audioBitsPerSecond: config.audioBitsPerSecond ?? 128000,
      timeSlice: config.timeSlice ?? 1000,
      deviceId: config.deviceId,
      sampleRate: config.sampleRate ?? 48000,
      channelCount: config.channelCount ?? 1
    };

    this.logger.info('AudioRecorder', `Initialized with MIME type: ${this.config.mimeType}`);
  }

  /**
   * Gets the first supported MIME type
   *
   * @returns Supported MIME type
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm';
  }

  /**
   * Starts recording from the microphone
   *
   * @returns Promise that resolves when recording starts
   */
  async start(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.logger.warn('AudioRecorder', 'Already recording');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: this.config.deviceId ? { exact: this.config.deviceId } : undefined,
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channelCount,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      await this.startRecording(this.mediaStream);

      this.logger.info('AudioRecorder', 'Started recording from microphone');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Starts recording from a media stream
   *
   * @param stream - Media stream to record
   * @returns Promise that resolves when recording starts
   */
  async startFromStream(stream: MediaStream): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.logger.warn('AudioRecorder', 'Already recording');
      return;
    }

    try {
      this.mediaStream = stream;
      await this.startRecording(stream);

      this.logger.info('AudioRecorder', 'Started recording from stream');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Starts recording from an audio node using MediaStreamDestination
   *
   * @param audioContext - Audio context
   * @param sourceNode - Source audio node
   * @returns Promise that resolves when recording starts
   */
  async startFromAudioNode(audioContext: AudioContext, sourceNode: AudioNode): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.logger.warn('AudioRecorder', 'Already recording');
      return;
    }

    try {
      const destination = audioContext.createMediaStreamDestination();
      sourceNode.connect(destination);

      this.mediaStream = destination.stream;
      await this.startRecording(destination.stream);

      this.logger.info('AudioRecorder', 'Started recording from audio node');
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Internal method to start recording
   *
   * @param stream - Media stream
   */
  private async startRecording(stream: MediaStream): Promise<void> {
    this.chunks = [];
    this.startTime = Date.now();

    const options: MediaRecorderOptions = {
      mimeType: this.config.mimeType,
      audioBitsPerSecond: this.config.audioBitsPerSecond
    };

    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);

        const recordingEvent: RecordingDataEvent = {
          blob: event.data,
          timestamp: Date.now(),
          duration: Date.now() - this.startTime
        };

        this.onDataCallbacks.forEach(callback => callback(recordingEvent));
      }
    };

    this.mediaRecorder.onstop = () => {
      this.onStateChangeCallbacks.forEach(callback => callback(RecordingState.INACTIVE));
    };

    this.mediaRecorder.onstart = () => {
      this.onStateChangeCallbacks.forEach(callback => callback(RecordingState.RECORDING));
    };

    this.mediaRecorder.onpause = () => {
      this.onStateChangeCallbacks.forEach(callback => callback(RecordingState.PAUSED));
    };

    this.mediaRecorder.onresume = () => {
      this.onStateChangeCallbacks.forEach(callback => callback(RecordingState.RECORDING));
    };

    this.mediaRecorder.onerror = (event: Event) => {
      const error = new Error('MediaRecorder error');
      this.handleError(error);
    };

    this.mediaRecorder.start(this.config.timeSlice);
  }

  /**
   * Pauses recording
   */
  pause(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      return;
    }

    this.mediaRecorder.pause();
    this.logger.info('AudioRecorder', 'Paused recording');
  }

  /**
   * Resumes recording
   */
  resume(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') {
      return;
    }

    this.mediaRecorder.resume();
    this.logger.info('AudioRecorder', 'Resumed recording');
  }

  /**
   * Stops recording and returns the recorded blob
   *
   * @returns Promise that resolves to the recorded audio blob
   */
  async stop(): Promise<Blob> {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      return new Blob([], { type: this.config.mimeType });
    }

    return new Promise<Blob>((resolve) => {
      const recorder = this.mediaRecorder!;

      const onStop = () => {
        const blob = new Blob(this.chunks, { type: this.config.mimeType });
        this.cleanup();
        resolve(blob);
      };

      recorder.addEventListener('stop', onStop, { once: true });
      recorder.stop();

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      this.logger.info('AudioRecorder', 'Stopped recording');
    });
  }

  /**
   * Gets the current recording state
   *
   * @returns Current recording state
   */
  getState(): RecordingState {
    if (!this.mediaRecorder) {
      return RecordingState.INACTIVE;
    }

    return this.mediaRecorder.state as RecordingState;
  }

  /**
   * Gets the recording duration
   *
   * @returns Duration in milliseconds
   */
  getDuration(): number {
    if (this.startTime === 0) {
      return 0;
    }

    return Date.now() - this.startTime;
  }

  /**
   * Gets the current recorded chunks
   *
   * @returns Array of recorded blobs
   */
  getChunks(): Blob[] {
    return [...this.chunks];
  }

  /**
   * Gets available audio input devices
   *
   * @returns Promise that resolves to array of device info
   */
  async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      this.handleError(error as Error);
      return [];
    }
  }

  /**
   * Checks if a MIME type is supported
   *
   * @param mimeType - MIME type to check
   * @returns True if supported
   */
  static isTypeSupported(mimeType: string): boolean {
    return MediaRecorder.isTypeSupported(mimeType);
  }

  /**
   * Gets all supported MIME types
   *
   * @returns Array of supported MIME types
   */
  static getSupportedMimeTypes(): string[] {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm;codecs=pcm',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav'
    ];

    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }

  /**
   * Registers a callback for recording data
   *
   * @param callback - Data callback
   */
  onData(callback: (event: RecordingDataEvent) => void): void {
    this.onDataCallbacks.push(callback);
  }

  /**
   * Registers a callback for state changes
   *
   * @param callback - State change callback
   */
  onStateChange(callback: (state: RecordingState) => void): void {
    this.onStateChangeCallbacks.push(callback);
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
   * Handles errors
   *
   * @param error - Error that occurred
   */
  private handleError(error: Error): void {
    this.onErrorCallbacks.forEach(callback => callback(error));
    this.logger.error('AudioRecorder', `Error: ${error.message}`);
  }

  /**
   * Cleans up recording state
   */
  private cleanup(): void {
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTime = 0;
  }

  /**
   * Checks if recording is active
   *
   * @returns True if recording
   */
  isRecording(): boolean {
    return this.getState() === RecordingState.RECORDING;
  }

  /**
   * Updates configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: Partial<RecordingConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('AudioRecorder', 'Configuration updated');
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.stop();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    this.onDataCallbacks = [];
    this.onStateChangeCallbacks = [];
    this.onErrorCallbacks = [];

    this.logger.info('AudioRecorder', 'Disposed');
  }
}
