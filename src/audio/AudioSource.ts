/**
 * @fileoverview Audio source component for the G3D engine.
 * Provides play/pause/stop controls, volume, pitch, pan, and fade effects.
 * @module audio/AudioSource
 */

import { AudioContext } from './AudioContext';
import { AudioClip } from './AudioClip';
import { Vector3 } from '../math/Vector3';

/**
 * Audio source playback state.
 */
export enum AudioSourceState {
  STOPPED = 'stopped',
  PLAYING = 'playing',
  PAUSED = 'paused',
  FADING_IN = 'fading_in',
  FADING_OUT = 'fading_out'
}

/**
 * Configuration for audio source playback.
 *
 * @example
 * ```typescript
 * const config: AudioSourceConfig = {
 *   loop: true,
 *   volume: 0.8,
 *   pitch: 1.2,
 *   pan: -0.5
 * };
 * ```
 */
export interface AudioSourceConfig {
  /**
   * Enable looping playback (default: false).
   */
  loop?: boolean;

  /**
   * Volume level (0.0 to 1.0, default: 1.0).
   */
  volume?: number;

  /**
   * Playback pitch/speed (0.5 to 2.0, default: 1.0).
   */
  pitch?: number;

  /**
   * Stereo pan (-1.0 = left, 0.0 = center, 1.0 = right, default: 0.0).
   */
  pan?: number;

  /**
   * Start offset in seconds (default: 0).
   */
  startOffset?: number;

  /**
   * Playback duration in seconds, 0 = full clip (default: 0).
   */
  duration?: number;

  /**
   * Enable spatial audio (default: false).
   */
  spatial?: boolean;
}

/**
 * Audio source for playing audio clips with full playback control.
 *
 * Features:
 * - Play/pause/stop controls with seek support
 * - Volume, pitch, and stereo pan
 * - Looping with configurable points
 * - Fade in/out effects
 * - Playback position tracking
 * - Event callbacks (onEnded, onLoop, etc.)
 *
 * @example
 * ```typescript
 * // Create and play audio source
 * const source = new AudioSource('bgm');
 * source.setClip(musicClip);
 * source.setLoop(true);
 * source.setVolume(0.6);
 * source.play();
 *
 * // Fade out and stop
 * await source.fadeOut(2.0);
 * source.stop();
 *
 * // Seek to position
 * source.seek(30); // Jump to 30 seconds
 *
 * // Pause and resume
 * source.pause();
 * source.resume();
 * ```
 */
export class AudioSource {
  private name: string;
  private clip: AudioClip | null = null;
  private state: AudioSourceState = AudioSourceState.STOPPED;
  private config: Required<AudioSourceConfig>;

  // Web Audio nodes
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private panNode: StereoPannerNode | null = null;

  // Playback tracking
  private startTime: number = 0;
  private pauseTime: number = 0;
  private playbackOffset: number = 0;
  private scheduledStopTime: number = -1;

  // Callbacks
  private onEndedCallback: (() => void) | null = null;
  private onLoopCallback: (() => void) | null = null;

  // Stats
  private playCount: number = 0;
  private loopCount: number = 0;

  /**
   * Creates a new audio source.
   *
   * @param name - Source identifier for debugging
   *
   * @example
   * ```typescript
   * const source = new AudioSource('player_footsteps');
   * ```
   */
  constructor(name: string) {
    this.name = name;
    this.config = {
      loop: false,
      volume: 1.0,
      pitch: 1.0,
      pan: 0.0,
      startOffset: 0.0,
      duration: 0.0,
      spatial: false
    };
  }

  /**
   * Sets the audio clip to play.
   *
   * @param clip - AudioClip to play
   *
   * @example
   * ```typescript
   * const clip = new AudioClip('explosion');
   * await clip.loadFromURL('/audio/explosion.mp3');
   * source.setClip(clip);
   * ```
   */
  public setClip(clip: AudioClip | null): void {
    if (this.state === AudioSourceState.PLAYING) {
      this.stop();
    }
    this.clip = clip;
  }

  /**
   * Gets the current audio clip.
   *
   * @returns Current AudioClip or null
   *
   * @example
   * ```typescript
   * const clip = source.getClip();
   * console.log(`Playing: ${clip?.getName()}`);
   * ```
   */
  public getClip(): AudioClip | null {
    return this.clip;
  }

  /**
   * Starts or restarts playback from the beginning.
   *
   * @param config - Optional playback configuration
   *
   * @example
   * ```typescript
   * // Simple play
   * source.play();
   *
   * // Play with config
   * source.play({
   *   loop: true,
   *   volume: 0.8,
   *   startOffset: 5.0
   * });
   * ```
   */
  public play(config?: AudioSourceConfig): void {
    if (!this.clip || !this.clip.isLoaded()) {
      console.warn(`AudioSource "${this.name}": Cannot play - clip not loaded`);
      return;
    }

    // Merge config
    if (config) {
      Object.assign(this.config, config);
    }

    // Stop any existing playback
    if (this.state === AudioSourceState.PLAYING) {
      this.stop();
    }

    // Create audio nodes
    this.createNodes();

    // Get buffer and start playback
    const buffer = this.clip.getBuffer();
    if (!buffer || !this.sourceNode) {
      return;
    }

    this.sourceNode.buffer = buffer;
    this.sourceNode.loop = this.config.loop;
    this.sourceNode.playbackRate.value = this.config.pitch;

    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();

    // Calculate start parameters
    const offset = this.config.startOffset;
    const duration = this.config.duration > 0 ? this.config.duration : undefined;

    // Start playback
    if (duration !== undefined) {
      this.sourceNode.start(now, offset, duration);
      this.scheduledStopTime = now + duration;
    } else {
      this.sourceNode.start(now, offset);
      this.scheduledStopTime = -1;
    }

    this.startTime = now;
    this.playbackOffset = offset;
    this.state = AudioSourceState.PLAYING;
    this.playCount++;

    // Setup ended callback
    if (this.sourceNode) {
      this.sourceNode.onended = () => {
        if (this.state === AudioSourceState.PLAYING) {
          if (this.config.loop) {
            this.loopCount++;
            if (this.onLoopCallback) {
              this.onLoopCallback();
            }
          } else {
            this.state = AudioSourceState.STOPPED;
            if (this.onEndedCallback) {
              this.onEndedCallback();
            }
          }
        }
      };
    }
  }

  /**
   * Pauses playback at the current position.
   * Call resume() to continue from where it was paused.
   *
   * @example
   * ```typescript
   * source.pause();
   * // ... later ...
   * source.resume();
   * ```
   */
  public pause(): void {
    if (this.state !== AudioSourceState.PLAYING) {
      return;
    }

    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();
    this.pauseTime = now;

    // Calculate current playback position
    const elapsed = now - this.startTime;
    this.playbackOffset += elapsed;

    // Stop the source node
    this.stop();
    this.state = AudioSourceState.PAUSED;
  }

  /**
   * Resumes playback from the paused position.
   *
   * @example
   * ```typescript
   * source.pause();
   * await new Promise(resolve => setTimeout(resolve, 1000));
   * source.resume();
   * ```
   */
  public resume(): void {
    if (this.state !== AudioSourceState.PAUSED) {
      return;
    }

    // Resume from saved offset
    const savedOffset = this.playbackOffset;
    this.config.startOffset = savedOffset;
    this.play();
  }

  /**
   * Stops playback and resets to the beginning.
   *
   * @example
   * ```typescript
   * source.stop();
   * ```
   */
  public stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode.onended = null;
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    this.destroyNodes();

    this.state = AudioSourceState.STOPPED;
    this.startTime = 0;
    this.pauseTime = 0;
    this.playbackOffset = 0;
    this.scheduledStopTime = -1;
  }

  /**
   * Seeks to a specific playback position.
   * If playing, restarts from the new position. If paused, updates pause position.
   *
   * @param time - Time in seconds
   *
   * @example
   * ```typescript
   * source.seek(30); // Jump to 30 seconds
   * ```
   */
  public seek(time: number): void {
    if (!this.clip || !this.clip.isLoaded()) {
      return;
    }

    const duration = this.clip.getDuration();
    time = Math.max(0, Math.min(time, duration));

    if (this.state === AudioSourceState.PLAYING) {
      this.config.startOffset = time;
      this.play();
    } else if (this.state === AudioSourceState.PAUSED) {
      this.playbackOffset = time;
      this.config.startOffset = time;
    }
  }

  /**
   * Gets the current playback position in seconds.
   *
   * @returns Current position in seconds
   *
   * @example
   * ```typescript
   * const position = source.getPlaybackPosition();
   * console.log(`Playing at: ${position.toFixed(2)}s`);
   * ```
   */
  public getPlaybackPosition(): number {
    if (this.state === AudioSourceState.PAUSED) {
      return this.playbackOffset;
    }

    if (this.state === AudioSourceState.PLAYING) {
      const audioContext = AudioContext.getInstance();
      const now = audioContext.getCurrentTime();
      const elapsed = now - this.startTime;
      let position = this.playbackOffset + elapsed * this.config.pitch;

      // Handle looping
      if (this.clip && this.config.loop) {
        const duration = this.clip.getDuration();
        if (duration > 0) {
          position = position % duration;
        }
      }

      return position;
    }

    return 0;
  }

  /**
   * Gets the playback progress as a percentage (0.0 to 1.0).
   *
   * @returns Progress (0.0 = start, 1.0 = end)
   *
   * @example
   * ```typescript
   * const progress = source.getPlaybackProgress();
   * console.log(`Progress: ${(progress * 100).toFixed(1)}%`);
   * ```
   */
  public getPlaybackProgress(): number {
    if (!this.clip) {
      return 0;
    }

    const duration = this.clip.getDuration();
    if (duration <= 0) {
      return 0;
    }

    const position = this.getPlaybackPosition();
    return Math.min(1, position / duration);
  }

  /**
   * Sets the volume.
   *
   * @param volume - Volume level (0.0 to 1.0)
   * @param rampTime - Ramp time in seconds for smooth transition (default: 0)
   *
   * @example
   * ```typescript
   * source.setVolume(0.5, 1.0); // Fade to 50% over 1 second
   * ```
   */
  public setVolume(volume: number, rampTime: number = 0): void {
    volume = Math.max(0, Math.min(1, volume));
    this.config.volume = volume;

    if (this.gainNode) {
      const audioContext = AudioContext.getInstance();
      const now = audioContext.getCurrentTime();

      if (rampTime <= 0) {
        this.gainNode.gain.setValueAtTime(volume, now);
      } else {
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(volume, now + rampTime);
      }
    }
  }

  /**
   * Gets the current volume.
   *
   * @returns Volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const vol = source.getVolume();
   * ```
   */
  public getVolume(): number {
    return this.config.volume;
  }

  /**
   * Sets the playback pitch/speed.
   *
   * @param pitch - Pitch multiplier (0.5 to 2.0, where 1.0 = normal)
   *
   * @example
   * ```typescript
   * source.setPitch(1.5); // Play 50% faster/higher
   * source.setPitch(0.75); // Play 25% slower/lower
   * ```
   */
  public setPitch(pitch: number): void {
    pitch = Math.max(0.5, Math.min(2.0, pitch));
    this.config.pitch = pitch;

    if (this.sourceNode) {
      this.sourceNode.playbackRate.value = pitch;
    }
  }

  /**
   * Gets the current pitch.
   *
   * @returns Pitch multiplier
   *
   * @example
   * ```typescript
   * const pitch = source.getPitch();
   * ```
   */
  public getPitch(): number {
    return this.config.pitch;
  }

  /**
   * Sets the stereo pan position.
   *
   * @param pan - Pan position (-1.0 = left, 0.0 = center, 1.0 = right)
   *
   * @example
   * ```typescript
   * source.setPan(-0.5); // Pan 50% to the left
   * source.setPan(1.0);  // Full right
   * ```
   */
  public setPan(pan: number): void {
    pan = Math.max(-1, Math.min(1, pan));
    this.config.pan = pan;

    if (this.panNode) {
      this.panNode.pan.value = pan;
    }
  }

  /**
   * Gets the current pan position.
   *
   * @returns Pan position (-1.0 to 1.0)
   *
   * @example
   * ```typescript
   * const pan = source.getPan();
   * ```
   */
  public getPan(): number {
    return this.config.pan;
  }

  /**
   * Sets looping mode.
   *
   * @param loop - Enable looping
   *
   * @example
   * ```typescript
   * source.setLoop(true);
   * ```
   */
  public setLoop(loop: boolean): void {
    this.config.loop = loop;

    if (this.sourceNode) {
      this.sourceNode.loop = loop;
    }
  }

  /**
   * Gets the looping mode.
   *
   * @returns True if looping enabled
   *
   * @example
   * ```typescript
   * if (source.isLooping()) {
   *   console.log('Looping enabled');
   * }
   * ```
   */
  public isLooping(): boolean {
    return this.config.loop;
  }

  /**
   * Fades in the audio from silence to current volume.
   *
   * @param duration - Fade duration in seconds
   * @returns Promise that resolves when fade completes
   *
   * @example
   * ```typescript
   * source.setVolume(0.8);
   * await source.fadeIn(2.0); // Fade in to 80% over 2 seconds
   * ```
   */
  public async fadeIn(duration: number): Promise<void> {
    const targetVolume = this.config.volume;
    this.setVolume(0, 0);

    if (this.state !== AudioSourceState.PLAYING) {
      this.play();
    }

    this.state = AudioSourceState.FADING_IN;
    this.setVolume(targetVolume, duration);

    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.state === AudioSourceState.FADING_IN) {
          this.state = AudioSourceState.PLAYING;
        }
        resolve();
      }, duration * 1000);
    });
  }

  /**
   * Fades out the audio from current volume to silence.
   *
   * @param duration - Fade duration in seconds
   * @returns Promise that resolves when fade completes
   *
   * @example
   * ```typescript
   * await source.fadeOut(2.0);
   * source.stop();
   * ```
   */
  public async fadeOut(duration: number): Promise<void> {
    if (this.state !== AudioSourceState.PLAYING) {
      return;
    }

    this.state = AudioSourceState.FADING_OUT;
    this.setVolume(0, duration);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, duration * 1000);
    });
  }

  /**
   * Gets the playback state.
   *
   * @returns Current AudioSourceState
   *
   * @example
   * ```typescript
   * if (source.getState() === AudioSourceState.PLAYING) {
   *   console.log('Audio is playing');
   * }
   * ```
   */
  public getState(): AudioSourceState {
    return this.state;
  }

  /**
   * Checks if audio is currently playing.
   *
   * @returns True if playing
   *
   * @example
   * ```typescript
   * if (source.isPlaying()) {
   *   source.pause();
   * }
   * ```
   */
  public isPlaying(): boolean {
    return this.state === AudioSourceState.PLAYING || this.state === AudioSourceState.FADING_IN;
  }

  /**
   * Sets the callback for when playback ends.
   *
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * source.onEnded(() => {
   *   console.log('Playback finished');
   * });
   * ```
   */
  public onEnded(callback: (() => void) | null): void {
    this.onEndedCallback = callback;
  }

  /**
   * Sets the callback for when audio loops.
   *
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * source.onLoop(() => {
   *   console.log('Audio looped');
   * });
   * ```
   */
  public onLoop(callback: (() => void) | null): void {
    this.onLoopCallback = callback;
  }

  /**
   * Gets playback statistics.
   *
   * @returns Stats object
   *
   * @example
   * ```typescript
   * const stats = source.getStats();
   * console.log(`Played ${stats.playCount} times, looped ${stats.loopCount} times`);
   * ```
   */
  public getStats(): {
    name: string;
    state: AudioSourceState;
    playCount: number;
    loopCount: number;
    position: number;
    progress: number;
    volume: number;
    pitch: number;
    pan: number;
  } {
    return {
      name: this.name,
      state: this.state,
      playCount: this.playCount,
      loopCount: this.loopCount,
      position: this.getPlaybackPosition(),
      progress: this.getPlaybackProgress(),
      volume: this.config.volume,
      pitch: this.config.pitch,
      pan: this.config.pan
    };
  }

  /**
   * Disposes the audio source and releases resources.
   *
   * @example
   * ```typescript
   * source.dispose();
   * ```
   */
  public dispose(): void {
    this.stop();
    this.clip = null;
    this.onEndedCallback = null;
    this.onLoopCallback = null;
  }

  /**
   * Creates the Web Audio node graph.
   */
  private createNodes(): void {
    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();
    const masterOutput = audioContext.getMasterOutput();

    // Create source node
    this.sourceNode = context.createBufferSource();

    // Create gain node
    this.gainNode = context.createGain();
    this.gainNode.gain.value = this.config.volume;

    // Create pan node (if not spatial)
    if (!this.config.spatial) {
      this.panNode = context.createStereoPanner();
      this.panNode.pan.value = this.config.pan;

      // Connect: source -> gain -> pan -> master
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.panNode);
      this.panNode.connect(masterOutput);
    } else {
      // Connect: source -> gain -> master (spatial handled by SpatialAudio)
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(masterOutput);
    }
  }

  /**
   * Destroys the Web Audio node graph.
   */
  private destroyNodes(): void {
    if (this.panNode) {
      this.panNode.disconnect();
      this.panNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    // sourceNode is handled in stop()
  }
}
