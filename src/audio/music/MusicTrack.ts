/**
 * @fileoverview Music track definition with metadata and loop points.
 * Represents a single music track with playback control and loop management.
 * @module audio/music/MusicTrack
 */

import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Music track metadata.
 *
 * @example
 * ```typescript
 * const metadata: MusicTrackMetadata = {
 *   title: 'Battle Theme',
 *   artist: 'Composer Name',
 *   album: 'Game OST',
 *   duration: 180.5,
 *   bpm: 140,
 *   key: 'Dm'
 * };
 * ```
 */
export interface MusicTrackMetadata {
  /**
   * Track title.
   */
  title?: string;

  /**
   * Artist/composer name.
   */
  artist?: string;

  /**
   * Album name.
   */
  album?: string;

  /**
   * Track duration in seconds.
   */
  duration?: number;

  /**
   * Tempo in beats per minute.
   */
  bpm?: number;

  /**
   * Musical key.
   */
  key?: string;

  /**
   * Genre tags.
   */
  genre?: string[];

  /**
   * Custom metadata.
   */
  [key: string]: any;
}

/**
 * Loop point configuration.
 *
 * @example
 * ```typescript
 * const loopPoints: LoopPoints = {
 *   start: 4.5,
 *   end: 120.0,
 *   enabled: true
 * };
 * ```
 */
export interface LoopPoints {
  /**
   * Loop start time in seconds.
   * Default: 0
   */
  start?: number;

  /**
   * Loop end time in seconds.
   * If not specified, uses track duration.
   */
  end?: number;

  /**
   * Enable looping.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Number of times to loop (0 = infinite).
   * Default: 0
   */
  count?: number;
}

/**
 * Music track state enumeration.
 */
export enum MusicTrackState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * Music track configuration.
 *
 * @example
 * ```typescript
 * const config: MusicTrackConfig = {
 *   url: '/audio/music/battle.mp3',
 *   metadata: {
 *     title: 'Battle Theme',
 *     bpm: 140
 *   },
 *   loopPoints: {
 *     start: 4.5,
 *     end: 120.0
 *   },
 *   volume: 0.8,
 *   preload: true
 * };
 * ```
 */
export interface MusicTrackConfig {
  /**
   * URL to audio file.
   */
  url: string;

  /**
   * Track metadata.
   */
  metadata?: MusicTrackMetadata;

  /**
   * Loop point configuration.
   */
  loopPoints?: LoopPoints;

  /**
   * Track volume (0.0 to 1.0).
   * Default: 1.0
   */
  volume?: number;

  /**
   * Preload the track.
   * Default: false
   */
  preload?: boolean;
}

/**
 * Music track with metadata, loop points, and playback control.
 *
 * Features:
 * - Audio buffer loading and caching
 * - Seamless looping with custom loop points
 * - Track metadata support
 * - Volume control
 * - Playback state management
 *
 * @example
 * ```typescript
 * const track = new MusicTrack('battle', {
 *   url: '/audio/music/battle.mp3',
 *   metadata: {
 *     title: 'Battle Theme',
 *     bpm: 140
 *   },
 *   loopPoints: {
 *     start: 4.5,
 *     end: 120.0
 *   }
 * });
 *
 * await track.load();
 *
 * // Get metadata
 * const metadata = track.getMetadata();
 * console.log(`Now playing: ${metadata.title} by ${metadata.artist}`);
 *
 * // Check duration
 * const duration = track.getDuration();
 * console.log(`Track length: ${duration}s`);
 * ```
 */
export class MusicTrack {
  private id: string;
  private config: Required<MusicTrackConfig>;
  private audioBuffer: AudioBuffer | null = null;
  private state: MusicTrackState = MusicTrackState.IDLE;
  private loopCount: number = 0;

  /**
   * Creates a new music track.
   *
   * @param id - Unique track identifier
   * @param config - Track configuration
   *
   * @example
   * ```typescript
   * const track = new MusicTrack('battle', {
   *   url: '/audio/music/battle.mp3',
   *   loopPoints: { start: 4.5, end: 120.0 }
   * });
   * ```
   */
  constructor(id: string, config: MusicTrackConfig) {
    this.id = id;
    this.config = {
      url: config.url,
      metadata: config.metadata ?? {},
      loopPoints: {
        start: config.loopPoints?.start ?? 0,
        end: config.loopPoints?.end ?? 0,
        enabled: config.loopPoints?.enabled ?? true,
        count: config.loopPoints?.count ?? 0
      },
      volume: config.volume ?? 1.0,
      preload: config.preload ?? false
    };

    if (this.config.preload) {
      this.load().catch(error => {
        logger.error('MusicTrack', `Failed to preload track ${id}: ${error}`);
      });
    }
  }

  /**
   * Gets the track ID.
   *
   * @returns Track ID
   *
   * @example
   * ```typescript
   * const id = track.getId();
   * ```
   */
  public getId(): string {
    return this.id;
  }

  /**
   * Gets the track URL.
   *
   * @returns Audio file URL
   *
   * @example
   * ```typescript
   * const url = track.getUrl();
   * ```
   */
  public getUrl(): string {
    return this.config.url;
  }

  /**
   * Gets the track metadata.
   *
   * @returns Metadata object
   *
   * @example
   * ```typescript
   * const metadata = track.getMetadata();
   * console.log(`${metadata.title} - ${metadata.artist}`);
   * ```
   */
  public getMetadata(): MusicTrackMetadata {
    return { ...this.config.metadata };
  }

  /**
   * Sets track metadata.
   *
   * @param metadata - Metadata to set
   *
   * @example
   * ```typescript
   * track.setMetadata({
   *   title: 'Updated Title',
   *   bpm: 150
   * });
   * ```
   */
  public setMetadata(metadata: Partial<MusicTrackMetadata>): void {
    Object.assign(this.config.metadata, metadata);
  }

  /**
   * Gets the loop points.
   *
   * @returns Loop points configuration
   *
   * @example
   * ```typescript
   * const loopPoints = track.getLoopPoints();
   * ```
   */
  public getLoopPoints(): LoopPoints {
    return { ...this.config.loopPoints };
  }

  /**
   * Sets the loop points.
   *
   * @param loopPoints - Loop points configuration
   *
   * @example
   * ```typescript
   * track.setLoopPoints({
   *   start: 5.0,
   *   end: 115.0,
   *   enabled: true
   * });
   * ```
   */
  public setLoopPoints(loopPoints: Partial<LoopPoints>): void {
    Object.assign(this.config.loopPoints, loopPoints);
    this.loopCount = 0;
  }

  /**
   * Gets the track volume.
   *
   * @returns Volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const volume = track.getVolume();
   * ```
   */
  public getVolume(): number {
    return this.config.volume;
  }

  /**
   * Sets the track volume.
   *
   * @param volume - Volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * track.setVolume(0.8);
   * ```
   */
  public setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Gets the track state.
   *
   * @returns Current state
   *
   * @example
   * ```typescript
   * if (track.getState() === MusicTrackState.LOADED) {
   *   // Track is ready to play
   * }
   * ```
   */
  public getState(): MusicTrackState {
    return this.state;
  }

  /**
   * Gets the track duration in seconds.
   *
   * @returns Duration or 0 if not loaded
   *
   * @example
   * ```typescript
   * const duration = track.getDuration();
   * console.log(`Track is ${duration} seconds long`);
   * ```
   */
  public getDuration(): number {
    if (this.audioBuffer) {
      return this.audioBuffer.duration;
    }
    return this.config.metadata.duration ?? 0;
  }

  /**
   * Gets the audio buffer.
   *
   * @returns Audio buffer or null if not loaded
   *
   * @example
   * ```typescript
   * const buffer = track.getAudioBuffer();
   * if (buffer) {
   *   console.log(`Buffer has ${buffer.numberOfChannels} channels`);
   * }
   * ```
   */
  public getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  /**
   * Loads the audio file.
   *
   * @param context - Audio context to use for decoding
   * @returns Promise that resolves when loaded
   *
   * @example
   * ```typescript
   * await track.load(audioContext);
   * ```
   */
  public async load(context?: globalThis.AudioContext): Promise<void> {
    if (this.state === MusicTrackState.LOADED || this.state === MusicTrackState.LOADING) {
      return;
    }

    this.state = MusicTrackState.LOADING;

    try {
      logger.debug('MusicTrack', `Loading track: ${this.id} from ${this.config.url}`);

      const response = await fetch(this.config.url);
      const arrayBuffer = await response.arrayBuffer();

      // Use provided context or create temporary one
      let audioContext = context;
      let shouldClose = false;

      if (!audioContext) {
        audioContext = new AudioContext();
        shouldClose = true;
      }

      this.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      if (shouldClose) {
        await audioContext.close();
      }

      // Update metadata with actual duration
      this.config.metadata.duration = this.audioBuffer.duration;

      // Set loop end to duration if not specified
      if (!this.config.loopPoints.end || this.config.loopPoints.end === 0) {
        this.config.loopPoints.end = this.audioBuffer.duration;
      }

      this.state = MusicTrackState.LOADED;
      logger.info('MusicTrack', `Loaded track: ${this.id} (${this.audioBuffer.duration.toFixed(2)}s)`);
    } catch (error) {
      this.state = MusicTrackState.ERROR;
      logger.error('MusicTrack', `Failed to load track ${this.id}: ${error}`);
      throw error;
    }
  }

  /**
   * Checks if the track is loaded.
   *
   * @returns True if loaded
   *
   * @example
   * ```typescript
   * if (track.isLoaded()) {
   *   // Can play the track
   * }
   * ```
   */
  public isLoaded(): boolean {
    return this.state === MusicTrackState.LOADED && this.audioBuffer !== null;
  }

  /**
   * Checks if the track should loop based on current loop count.
   *
   * @returns True if should continue looping
   *
   * @example
   * ```typescript
   * if (track.shouldLoop()) {
   *   // Loop back to start
   * }
   * ```
   */
  public shouldLoop(): boolean {
    if (!this.config.loopPoints.enabled) {
      return false;
    }

    const maxLoops = this.config.loopPoints.count ?? 0;
    if (maxLoops === 0) {
      return true; // Infinite looping
    }

    return this.loopCount < maxLoops;
  }

  /**
   * Increments the loop counter.
   *
   * @example
   * ```typescript
   * track.incrementLoopCount();
   * ```
   */
  public incrementLoopCount(): void {
    this.loopCount++;
  }

  /**
   * Resets the loop counter.
   *
   * @example
   * ```typescript
   * track.resetLoopCount();
   * ```
   */
  public resetLoopCount(): void {
    this.loopCount = 0;
  }

  /**
   * Gets the current loop count.
   *
   * @returns Number of loops completed
   *
   * @example
   * ```typescript
   * const count = track.getLoopCount();
   * console.log(`Looped ${count} times`);
   * ```
   */
  public getLoopCount(): number {
    return this.loopCount;
  }

  /**
   * Unloads the audio buffer to free memory.
   *
   * @example
   * ```typescript
   * track.unload();
   * ```
   */
  public unload(): void {
    this.audioBuffer = null;
    this.state = MusicTrackState.IDLE;
    this.loopCount = 0;
    logger.debug('MusicTrack', `Unloaded track: ${this.id}`);
  }

  /**
   * Clones the track configuration.
   *
   * @returns New MusicTrack with same configuration
   *
   * @example
   * ```typescript
   * const copy = track.clone();
   * ```
   */
  public clone(): MusicTrack {
    const clonedConfig: MusicTrackConfig = {
      url: this.config.url,
      metadata: { ...this.config.metadata },
      loopPoints: { ...this.config.loopPoints },
      volume: this.config.volume,
      preload: this.config.preload
    };

    const cloned = new MusicTrack(`${this.id}_clone`, clonedConfig);
    cloned.audioBuffer = this.audioBuffer; // Share the audio buffer
    cloned.state = this.state;

    return cloned;
  }
}
