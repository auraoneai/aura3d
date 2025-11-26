/**
 * @fileoverview Music player with playlist support and crossfading.
 * Provides high-level music playback control with seamless transitions.
 * @module audio/music/MusicPlayer
 */

import { AudioContext } from '../AudioContext';
import { MusicTrack, MusicTrackState } from './MusicTrack';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

/**
 * Music player state enumeration.
 */
export enum MusicPlayerState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  CROSSFADING = 'crossfading'
}

/**
 * Playback configuration options.
 *
 * @example
 * ```typescript
 * const config: PlaybackConfig = {
 *   volume: 0.8,
 *   fadeInDuration: 2.0,
 *   fadeOutDuration: 2.0,
 *   startTime: 0
 * };
 * ```
 */
export interface PlaybackConfig {
  /**
   * Playback volume (0.0 to 1.0).
   * Default: 1.0
   */
  volume?: number;

  /**
   * Fade-in duration in seconds.
   * Default: 0
   */
  fadeInDuration?: number;

  /**
   * Fade-out duration in seconds.
   * Default: 0
   */
  fadeOutDuration?: number;

  /**
   * Start time in track (seconds).
   * Default: 0
   */
  startTime?: number;

  /**
   * Crossfade duration when switching tracks (seconds).
   * Default: 2.0
   */
  crossfadeDuration?: number;
}

/**
 * Music player with track playback and crossfading.
 *
 * Features:
 * - Single track playback with loop support
 * - Fade in/out effects
 * - Crossfading between tracks
 * - Volume control
 * - Playback position tracking
 *
 * @example
 * ```typescript
 * const player = new MusicPlayer();
 * player.initialize();
 *
 * const track = new MusicTrack('battle', {
 *   url: '/audio/music/battle.mp3',
 *   loopPoints: { start: 4.5, end: 120.0 }
 * });
 *
 * await track.load(audioContext.getContext());
 * await player.play(track, { fadeInDuration: 2.0 });
 *
 * // Later, switch to different track
 * await player.crossfadeTo(newTrack, 3.0);
 *
 * // Control playback
 * player.pause();
 * player.resume();
 * player.stop();
 * ```
 */
export class MusicPlayer {
  private context: globalThis.AudioContext;
  private outputNode: GainNode;
  private volumeNode: GainNode;

  private currentTrack: MusicTrack | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private state: MusicPlayerState = MusicPlayerState.IDLE;

  private playbackStartTime: number = 0;
  private pauseTime: number = 0;
  private currentPosition: number = 0;

  private loopCheckInterval: number | null = null;
  private fadeTimeout: number | null = null;

  /**
   * Creates a new music player.
   *
   * @example
   * ```typescript
   * const player = new MusicPlayer();
   * ```
   */
  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();

    this.volumeNode = this.context.createGain();
    this.outputNode = this.context.createGain();

    this.volumeNode.connect(this.outputNode);
  }

  /**
   * Initializes the music player.
   *
   * @param outputDestination - Output node (defaults to master output)
   *
   * @example
   * ```typescript
   * player.initialize();
   * ```
   */
  public initialize(outputDestination?: AudioNode): void {
    const audioContext = AudioContext.getInstance();
    const destination = outputDestination ?? audioContext.getMasterOutput();

    this.outputNode.connect(destination);

    logger.info('MusicPlayer', 'Initialized music player');
  }

  /**
   * Plays a music track.
   *
   * @param track - Track to play
   * @param config - Playback configuration
   * @returns Promise that resolves when playback starts
   *
   * @example
   * ```typescript
   * await player.play(track, { fadeInDuration: 2.0 });
   * ```
   */
  public async play(track: MusicTrack, config: PlaybackConfig = {}): Promise<void> {
    if (!track.isLoaded()) {
      throw new Error('Track must be loaded before playing');
    }

    this.stop();

    this.currentTrack = track;
    this.currentPosition = config.startTime ?? 0;

    const volume = config.volume ?? 1.0;
    const fadeInDuration = config.fadeInDuration ?? 0;

    this.currentSource = this.context.createBufferSource();
    this.currentSource.buffer = track.getAudioBuffer();
    this.currentSource.connect(this.volumeNode);

    const loopPoints = track.getLoopPoints();
    if (loopPoints.enabled) {
      this.currentSource.loop = true;
      this.currentSource.loopStart = loopPoints.start ?? 0;
      this.currentSource.loopEnd = loopPoints.end ?? track.getDuration();
    }

    if (fadeInDuration > 0) {
      this.volumeNode.gain.setValueAtTime(0, this.context.currentTime);
      this.volumeNode.gain.linearRampToValueAtTime(volume, this.context.currentTime + fadeInDuration);
    } else {
      this.volumeNode.gain.setValueAtTime(volume, this.context.currentTime);
    }

    this.playbackStartTime = this.context.currentTime;
    this.currentSource.start(this.context.currentTime, this.currentPosition);
    this.state = MusicPlayerState.PLAYING;

    if (loopPoints.enabled && (loopPoints.count ?? 0) > 0) {
      this.startLoopCheck();
    }

    this.currentSource.onended = () => {
      if (this.state === MusicPlayerState.PLAYING) {
        this.state = MusicPlayerState.STOPPED;
        this.currentTrack = null;
        this.currentSource = null;
      }
    };

    logger.info('MusicPlayer', `Playing track: ${track.getId()}`);
  }

  /**
   * Pauses playback.
   *
   * @example
   * ```typescript
   * player.pause();
   * ```
   */
  public pause(): void {
    if (this.state !== MusicPlayerState.PLAYING) {
      return;
    }

    this.pauseTime = this.context.currentTime;
    this.currentPosition = this.getPosition();

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.stopLoopCheck();
    this.state = MusicPlayerState.PAUSED;

    logger.debug('MusicPlayer', 'Paused playback');
  }

  /**
   * Resumes playback after pause.
   *
   * @example
   * ```typescript
   * player.resume();
   * ```
   */
  public async resume(): Promise<void> {
    if (this.state !== MusicPlayerState.PAUSED || !this.currentTrack) {
      return;
    }

    await this.play(this.currentTrack, {
      startTime: this.currentPosition,
      volume: this.volumeNode.gain.value
    });

    logger.debug('MusicPlayer', 'Resumed playback');
  }

  /**
   * Stops playback with optional fade-out.
   *
   * @param fadeOutDuration - Fade-out duration in seconds
   * @returns Promise that resolves when stopped
   *
   * @example
   * ```typescript
   * await player.stop(2.0);
   * ```
   */
  public async stop(fadeOutDuration: number = 0): Promise<void> {
    if (this.state === MusicPlayerState.IDLE || this.state === MusicPlayerState.STOPPED) {
      return;
    }

    this.stopLoopCheck();

    if (fadeOutDuration > 0 && this.currentSource) {
      const now = this.context.currentTime;
      this.volumeNode.gain.setValueAtTime(this.volumeNode.gain.value, now);
      this.volumeNode.gain.linearRampToValueAtTime(0, now + fadeOutDuration);

      await new Promise(resolve => {
        this.fadeTimeout = window.setTimeout(resolve, fadeOutDuration * 1000);
      });
    }

    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }

    this.currentTrack = null;
    this.currentPosition = 0;
    this.playbackStartTime = 0;
    this.pauseTime = 0;
    this.state = MusicPlayerState.STOPPED;

    logger.debug('MusicPlayer', 'Stopped playback');
  }

  /**
   * Crossfades from current track to new track.
   *
   * @param newTrack - Track to crossfade to
   * @param duration - Crossfade duration in seconds
   * @returns Promise that resolves when crossfade completes
   *
   * @example
   * ```typescript
   * await player.crossfadeTo(newTrack, 3.0);
   * ```
   */
  public async crossfadeTo(newTrack: MusicTrack, duration: number = 2.0): Promise<void> {
    if (!newTrack.isLoaded()) {
      throw new Error('New track must be loaded before crossfading');
    }

    this.state = MusicPlayerState.CROSSFADING;

    const newVolumeNode = this.context.createGain();
    newVolumeNode.connect(this.outputNode);
    newVolumeNode.gain.setValueAtTime(0, this.context.currentTime);

    const newSource = this.context.createBufferSource();
    newSource.buffer = newTrack.getAudioBuffer();
    newSource.connect(newVolumeNode);

    const loopPoints = newTrack.getLoopPoints();
    if (loopPoints.enabled) {
      newSource.loop = true;
      newSource.loopStart = loopPoints.start ?? 0;
      newSource.loopEnd = loopPoints.end ?? newTrack.getDuration();
    }

    const now = this.context.currentTime;

    if (this.volumeNode) {
      this.volumeNode.gain.setValueAtTime(this.volumeNode.gain.value, now);
      this.volumeNode.gain.linearRampToValueAtTime(0, now + duration);
    }

    newVolumeNode.gain.linearRampToValueAtTime(1.0, now + duration);

    newSource.start(now);

    await new Promise(resolve => {
      this.fadeTimeout = window.setTimeout(resolve, duration * 1000);
    });

    if (this.currentSource) {
      this.currentSource.stop();
    }

    this.currentSource = newSource;
    this.currentTrack = newTrack;
    this.volumeNode = newVolumeNode;
    this.playbackStartTime = this.context.currentTime;
    this.currentPosition = 0;
    this.state = MusicPlayerState.PLAYING;

    logger.info('MusicPlayer', `Crossfaded to track: ${newTrack.getId()}`);
  }

  /**
   * Sets the playback volume.
   *
   * @param volume - Volume (0.0 to 1.0)
   * @param rampTime - Ramp time in seconds
   *
   * @example
   * ```typescript
   * player.setVolume(0.5, 1.0);
   * ```
   */
  public setVolume(volume: number, rampTime: number = 0): void {
    volume = Math.max(0, Math.min(1, volume));

    const now = this.context.currentTime;
    if (rampTime <= 0) {
      this.volumeNode.gain.setValueAtTime(volume, now);
    } else {
      this.volumeNode.gain.setValueAtTime(this.volumeNode.gain.value, now);
      this.volumeNode.gain.linearRampToValueAtTime(volume, now + rampTime);
    }
  }

  /**
   * Gets the current volume.
   *
   * @returns Volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const volume = player.getVolume();
   * ```
   */
  public getVolume(): number {
    return this.volumeNode.gain.value;
  }

  /**
   * Gets the current playback position in seconds.
   *
   * @returns Position in seconds
   *
   * @example
   * ```typescript
   * const position = player.getPosition();
   * ```
   */
  public getPosition(): number {
    if (this.state === MusicPlayerState.PLAYING) {
      return this.currentPosition + (this.context.currentTime - this.playbackStartTime);
    }
    return this.currentPosition;
  }

  /**
   * Gets the current track.
   *
   * @returns Current track or null
   *
   * @example
   * ```typescript
   * const track = player.getCurrentTrack();
   * ```
   */
  public getCurrentTrack(): MusicTrack | null {
    return this.currentTrack;
  }

  /**
   * Gets the player state.
   *
   * @returns Current state
   *
   * @example
   * ```typescript
   * if (player.getState() === MusicPlayerState.PLAYING) {
   *   console.log('Music is playing');
   * }
   * ```
   */
  public getState(): MusicPlayerState {
    return this.state;
  }

  /**
   * Gets the output node.
   *
   * @returns Output GainNode
   *
   * @example
   * ```typescript
   * const output = player.getOutput();
   * ```
   */
  public getOutput(): AudioNode {
    return this.outputNode;
  }

  /**
   * Disposes the player and releases resources.
   *
   * @example
   * ```typescript
   * player.dispose();
   * ```
   */
  public dispose(): void {
    this.stop();
    this.volumeNode.disconnect();
    this.outputNode.disconnect();
  }

  /**
   * Starts the loop check interval.
   */
  private startLoopCheck(): void {
    this.stopLoopCheck();

    this.loopCheckInterval = window.setInterval(() => {
      if (!this.currentTrack || this.state !== MusicPlayerState.PLAYING) {
        this.stopLoopCheck();
        return;
      }

      const loopPoints = this.currentTrack.getLoopPoints();
      const position = this.getPosition();

      if (position >= (loopPoints.end ?? this.currentTrack.getDuration())) {
        this.currentTrack.incrementLoopCount();

        if (!this.currentTrack.shouldLoop()) {
          this.stop();
          this.stopLoopCheck();
        }
      }
    }, 100);
  }

  /**
   * Stops the loop check interval.
   */
  private stopLoopCheck(): void {
    if (this.loopCheckInterval !== null) {
      clearInterval(this.loopCheckInterval);
      this.loopCheckInterval = null;
    }
  }
}
