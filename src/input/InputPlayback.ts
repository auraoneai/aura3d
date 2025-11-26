/**
 * InputPlayback - Input playback from recordings
 *
 * Plays back recorded input events for replay, testing, and debugging.
 * Supports playback speed control, looping, seeking, and event callbacks.
 * Can be used to create deterministic replays and automated testing.
 *
 * @module input/InputPlayback
 *
 * @example
 * ```typescript
 * const playback = new InputPlayback();
 *
 * // Load recording
 * const json = localStorage.getItem('replay');
 * const recording = JSON.parse(json);
 * playback.load(recording);
 *
 * // Start playback
 * playback.play();
 *
 * // In game loop
 * function update(deltaTime: number) {
 *   playback.update(deltaTime);
 * }
 *
 * // Listen for events
 * playback.on('keydown', (event) => {
 *   keyboard.simulateKeyDown(event.keyCode);
 * });
 * ```
 */

import { Logger } from '../core/Logger';
import {
  Recording,
  AnyInputEvent,
  InputEventType,
  KeyboardInputEvent,
  MouseButtonInputEvent,
  MouseMoveInputEvent,
  MouseWheelInputEvent,
  ActionInputEvent,
  FrameInputEvent
} from './InputRecorder';

const logger = new Logger('InputPlayback');

/**
 * Playback state
 */
export enum PlaybackState {
  /**
   * Not playing
   */
  Stopped = 'stopped',

  /**
   * Currently playing
   */
  Playing = 'playing',

  /**
   * Paused
   */
  Paused = 'paused'
}

/**
 * Playback configuration
 */
export interface PlaybackConfig {
  /**
   * Playback speed multiplier (1.0 = normal speed)
   */
  speed?: number;

  /**
   * Loop playback
   */
  loop?: boolean;

  /**
   * Auto-play on load
   */
  autoPlay?: boolean;
}

/**
 * Event callback types
 */
export type PlaybackEventCallback = (event: AnyInputEvent) => void;
export type PlaybackStateCallback = () => void;

/**
 * Input playback for replaying recorded input events.
 *
 * @example
 * ```typescript
 * const playback = new InputPlayback({
 *   speed: 1.0,
 *   loop: false,
 *   autoPlay: true
 * });
 *
 * // Load recording
 * playback.load(recording);
 *
 * // Add event listeners
 * playback.on('keydown', (event) => {
 *   console.log(`Key down: ${event.keyCode}`);
 * });
 *
 * playback.on('action', (event) => {
 *   console.log(`Action: ${event.action}`);
 * });
 *
 * playback.on('complete', () => {
 *   console.log('Playback complete');
 * });
 *
 * // Control playback
 * playback.play();
 * playback.pause();
 * playback.stop();
 * playback.seek(5000); // Seek to 5 seconds
 * ```
 */
export class InputPlayback {
  /**
   * Configuration
   */
  private config: Required<PlaybackConfig>;

  /**
   * Loaded recording
   */
  private recording: Recording | null = null;

  /**
   * Current playback state
   */
  private state: PlaybackState = PlaybackState.Stopped;

  /**
   * Current playback time in milliseconds
   */
  private currentTime: number = 0;

  /**
   * Current event index
   */
  private currentEventIndex: number = 0;

  /**
   * Event callbacks
   */
  private eventCallbacks: Map<string, Set<Function>> = new Map();

  /**
   * Creates a new input playback.
   *
   * @param config - Playback configuration
   *
   * @example
   * ```typescript
   * const playback = new InputPlayback({
   *   speed: 1.5,
   *   loop: true
   * });
   * ```
   */
  constructor(config: PlaybackConfig = {}) {
    this.config = {
      speed: config.speed ?? 1.0,
      loop: config.loop ?? false,
      autoPlay: config.autoPlay ?? false
    };

    logger.debug('InputPlayback created');
  }

  /**
   * Loads a recording for playback.
   *
   * @param recording - Recording data
   *
   * @example
   * ```typescript
   * const json = localStorage.getItem('replay');
   * const recording = JSON.parse(json);
   * playback.load(recording);
   * ```
   */
  load(recording: Recording): void {
    this.stop();
    this.recording = recording;
    this.currentTime = 0;
    this.currentEventIndex = 0;

    logger.info(`Loaded recording: ${recording.metadata.eventCount} events, ${recording.metadata.duration}ms`);

    if (this.config.autoPlay) {
      this.play();
    }
  }

  /**
   * Starts or resumes playback.
   *
   * @example
   * ```typescript
   * playback.play();
   * ```
   */
  play(): void {
    if (!this.recording) {
      logger.warn('No recording loaded');
      return;
    }

    if (this.state === PlaybackState.Playing) {
      return;
    }

    this.state = PlaybackState.Playing;
    logger.debug('Playback started');
    this.emit('play');
  }

  /**
   * Pauses playback.
   *
   * @example
   * ```typescript
   * playback.pause();
   * ```
   */
  pause(): void {
    if (this.state !== PlaybackState.Playing) {
      return;
    }

    this.state = PlaybackState.Paused;
    logger.debug('Playback paused');
    this.emit('pause');
  }

  /**
   * Stops playback and resets to beginning.
   *
   * @example
   * ```typescript
   * playback.stop();
   * ```
   */
  stop(): void {
    if (this.state === PlaybackState.Stopped) {
      return;
    }

    this.state = PlaybackState.Stopped;
    this.currentTime = 0;
    this.currentEventIndex = 0;
    logger.debug('Playback stopped');
    this.emit('stop');
  }

  /**
   * Updates playback. Call once per frame.
   *
   * @param deltaTime - Time since last frame in seconds
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   playback.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (!this.recording || this.state !== PlaybackState.Playing) {
      return;
    }

    const deltaMs = deltaTime * 1000 * this.config.speed;
    this.currentTime += deltaMs;

    const events = this.recording.events;

    while (this.currentEventIndex < events.length) {
      const event = events[this.currentEventIndex];

      if (event.timestamp > this.currentTime) {
        break;
      }

      this.processEvent(event);
      this.currentEventIndex++;
    }

    if (this.currentEventIndex >= events.length) {
      if (this.config.loop) {
        this.seek(0);
      } else {
        this.state = PlaybackState.Stopped;
        this.emit('complete');
        logger.debug('Playback complete');
      }
    }
  }

  /**
   * Seeks to a specific time in the recording.
   *
   * @param timeMs - Time in milliseconds
   *
   * @example
   * ```typescript
   * playback.seek(5000); // Seek to 5 seconds
   * ```
   */
  seek(timeMs: number): void {
    if (!this.recording) {
      return;
    }

    this.currentTime = Math.max(0, Math.min(timeMs, this.recording.metadata.duration));

    this.currentEventIndex = 0;
    const events = this.recording.events;

    while (this.currentEventIndex < events.length) {
      if (events[this.currentEventIndex].timestamp >= this.currentTime) {
        break;
      }
      this.currentEventIndex++;
    }

    logger.debug(`Seeked to ${this.currentTime}ms`);
    this.emit('seek', this.currentTime);
  }

  /**
   * Sets playback speed.
   *
   * @param speed - Speed multiplier (1.0 = normal)
   *
   * @example
   * ```typescript
   * playback.setSpeed(2.0); // 2x speed
   * playback.setSpeed(0.5); // Half speed
   * ```
   */
  setSpeed(speed: number): void {
    this.config.speed = Math.max(0.1, Math.min(10, speed));
    logger.debug(`Playback speed set to ${this.config.speed}x`);
  }

  /**
   * Sets loop mode.
   *
   * @param loop - Whether to loop
   *
   * @example
   * ```typescript
   * playback.setLoop(true);
   * ```
   */
  setLoop(loop: boolean): void {
    this.config.loop = loop;
    logger.debug(`Loop ${loop ? 'enabled' : 'disabled'}`);
  }

  /**
   * Gets current playback state.
   *
   * @returns Playback state
   *
   * @example
   * ```typescript
   * const state = playback.getState();
   * if (state === PlaybackState.Playing) {
   *   console.log('Playing');
   * }
   * ```
   */
  getState(): PlaybackState {
    return this.state;
  }

  /**
   * Gets current playback time in milliseconds.
   *
   * @returns Current time
   *
   * @example
   * ```typescript
   * const time = playback.getCurrentTime();
   * console.log(`Current time: ${time}ms`);
   * ```
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Gets total recording duration in milliseconds.
   *
   * @returns Duration
   *
   * @example
   * ```typescript
   * const duration = playback.getDuration();
   * console.log(`Duration: ${duration}ms`);
   * ```
   */
  getDuration(): number {
    return this.recording?.metadata.duration ?? 0;
  }

  /**
   * Gets playback progress (0-1).
   *
   * @returns Progress from 0 to 1
   *
   * @example
   * ```typescript
   * const progress = playback.getProgress();
   * console.log(`Progress: ${(progress * 100).toFixed(1)}%`);
   * ```
   */
  getProgress(): number {
    const duration = this.getDuration();
    return duration > 0 ? this.currentTime / duration : 0;
  }

  /**
   * Gets current playback speed.
   *
   * @returns Speed multiplier
   */
  getSpeed(): number {
    return this.config.speed;
  }

  /**
   * Checks if looping is enabled.
   *
   * @returns True if looping
   */
  isLooping(): boolean {
    return this.config.loop;
  }

  /**
   * Checks if currently playing.
   *
   * @returns True if playing
   */
  isPlaying(): boolean {
    return this.state === PlaybackState.Playing;
  }

  /**
   * Checks if paused.
   *
   * @returns True if paused
   */
  isPaused(): boolean {
    return this.state === PlaybackState.Paused;
  }

  /**
   * Checks if stopped.
   *
   * @returns True if stopped
   */
  isStopped(): boolean {
    return this.state === PlaybackState.Stopped;
  }

  /**
   * Gets the loaded recording.
   *
   * @returns Recording or null
   */
  getRecording(): Recording | null {
    return this.recording;
  }

  /**
   * Adds an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function
   *
   * @example
   * ```typescript
   * playback.on('keydown', (event) => {
   *   console.log(`Key: ${event.keyCode}`);
   * });
   *
   * playback.on('complete', () => {
   *   console.log('Playback finished');
   * });
   * ```
   */
  on(event: string, callback: Function): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event)!.add(callback);
  }

  /**
   * Removes an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function
   */
  off(event: string, callback: Function): void {
    this.eventCallbacks.get(event)?.delete(callback);
  }

  /**
   * Processes a single event.
   *
   * @param event - Event to process
   * @private
   */
  private processEvent(event: AnyInputEvent): void {
    switch (event.type) {
      case InputEventType.KeyDown:
        this.emit('keydown', event);
        break;

      case InputEventType.KeyUp:
        this.emit('keyup', event);
        break;

      case InputEventType.MouseButtonDown:
        this.emit('mousedown', event);
        break;

      case InputEventType.MouseButtonUp:
        this.emit('mouseup', event);
        break;

      case InputEventType.MouseMove:
        this.emit('mousemove', event);
        break;

      case InputEventType.MouseWheel:
        this.emit('mousewheel', event);
        break;

      case InputEventType.ActionTriggered:
        this.emit('action', event);
        break;

      case InputEventType.Frame:
        this.emit('frame', event);
        break;
    }

    this.emit('event', event);
  }

  /**
   * Emits an event to all listeners.
   *
   * @param event - Event name
   * @param args - Event arguments
   * @private
   */
  private emit(event: string, ...args: any[]): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }

  /**
   * Disposes the playback.
   *
   * @example
   * ```typescript
   * playback.dispose();
   * ```
   */
  dispose(): void {
    this.stop();
    this.recording = null;
    this.eventCallbacks.clear();
    logger.debug('InputPlayback disposed');
  }
}
