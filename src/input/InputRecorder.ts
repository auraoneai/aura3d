/**
 * InputRecorder - Input recording for replay and analysis
 *
 * Records all input events with timestamps for replay, debugging, and analysis.
 * Supports recording keyboard, mouse, and action states with frame-accurate timing.
 * Recordings can be exported to JSON for storage and sharing.
 *
 * @module input/InputRecorder
 *
 * @example
 * ```typescript
 * const recorder = new InputRecorder();
 *
 * // Start recording
 * recorder.start();
 *
 * // Record input events
 * recorder.recordKeyPress('KeyW', 100);
 * recorder.recordMouseClick(0, { x: 100, y: 200 }, 150);
 *
 * // Stop recording
 * recorder.stop();
 *
 * // Export recording
 * const json = recorder.export();
 * localStorage.setItem('replay', json);
 * ```
 */

import { Vector2 } from '../math/Vector2';
import { Logger } from '../core/Logger';

const logger = new Logger('InputRecorder');

/**
 * Input event types
 */
export enum InputEventType {
  KeyDown = 'keydown',
  KeyUp = 'keyup',
  MouseButtonDown = 'mousedown',
  MouseButtonUp = 'mouseup',
  MouseMove = 'mousemove',
  MouseWheel = 'mousewheel',
  ActionTriggered = 'action',
  Frame = 'frame'
}

/**
 * Base input event
 */
export interface InputEvent {
  /**
   * Event type
   */
  type: InputEventType;

  /**
   * Timestamp in milliseconds
   */
  timestamp: number;

  /**
   * Frame number
   */
  frame: number;
}

/**
 * Keyboard event
 */
export interface KeyboardInputEvent extends InputEvent {
  type: InputEventType.KeyDown | InputEventType.KeyUp;
  keyCode: string;
}

/**
 * Mouse button event
 */
export interface MouseButtonInputEvent extends InputEvent {
  type: InputEventType.MouseButtonDown | InputEventType.MouseButtonUp;
  button: number;
  position: { x: number; y: number };
}

/**
 * Mouse move event
 */
export interface MouseMoveInputEvent extends InputEvent {
  type: InputEventType.MouseMove;
  position: { x: number; y: number };
  delta: { x: number; y: number };
}

/**
 * Mouse wheel event
 */
export interface MouseWheelInputEvent extends InputEvent {
  type: InputEventType.MouseWheel;
  delta: { x: number; y: number };
}

/**
 * Action triggered event
 */
export interface ActionInputEvent extends InputEvent {
  type: InputEventType.ActionTriggered;
  context: string;
  action: string;
  value: number;
  vector?: { x: number; y: number };
}

/**
 * Frame marker event
 */
export interface FrameInputEvent extends InputEvent {
  type: InputEventType.Frame;
  deltaTime: number;
}

/**
 * Union of all input event types
 */
export type AnyInputEvent =
  | KeyboardInputEvent
  | MouseButtonInputEvent
  | MouseMoveInputEvent
  | MouseWheelInputEvent
  | ActionInputEvent
  | FrameInputEvent;

/**
 * Recording metadata
 */
export interface RecordingMetadata {
  /**
   * Recording start time
   */
  startTime: number;

  /**
   * Recording end time
   */
  endTime: number;

  /**
   * Total duration in milliseconds
   */
  duration: number;

  /**
   * Total number of frames
   */
  frameCount: number;

  /**
   * Total number of events
   */
  eventCount: number;

  /**
   * Recording version
   */
  version: string;
}

/**
 * Complete recording data
 */
export interface Recording {
  /**
   * Recording metadata
   */
  metadata: RecordingMetadata;

  /**
   * Recorded events
   */
  events: AnyInputEvent[];
}

/**
 * Input recorder for capturing input events with frame-accurate timing.
 *
 * @example
 * ```typescript
 * const recorder = new InputRecorder();
 *
 * // Start recording
 * recorder.start();
 *
 * // In game loop
 * function update(deltaTime: number) {
 *   recorder.recordFrame(deltaTime);
 *
 *   // Record inputs
 *   if (keyboard.justPressed('KeyW')) {
 *     recorder.recordKeyDown('KeyW');
 *   }
 *
 *   if (mouse.justPressed(MouseButton.Left)) {
 *     recorder.recordMouseButtonDown(MouseButton.Left, mouse.getPosition());
 *   }
 * }
 *
 * // Stop and export
 * recorder.stop();
 * const json = recorder.export();
 * ```
 */
export class InputRecorder {
  /**
   * Recorded events
   */
  private events: AnyInputEvent[] = [];

  /**
   * Whether currently recording
   */
  private recording: boolean = false;

  /**
   * Recording start time
   */
  private startTime: number = 0;

  /**
   * Current frame number
   */
  private currentFrame: number = 0;

  /**
   * Recording version
   */
  private readonly version: string = '1.0.0';

  /**
   * Maximum events to record (prevents memory overflow)
   */
  private maxEvents: number = 100000;

  /**
   * Creates a new input recorder.
   *
   * @param maxEvents - Maximum number of events to record
   *
   * @example
   * ```typescript
   * const recorder = new InputRecorder(50000);
   * ```
   */
  constructor(maxEvents: number = 100000) {
    this.maxEvents = maxEvents;
    logger.debug('InputRecorder created');
  }

  /**
   * Starts recording input events.
   *
   * @example
   * ```typescript
   * recorder.start();
   * console.log('Recording started');
   * ```
   */
  start(): void {
    if (this.recording) {
      logger.warn('Already recording');
      return;
    }

    this.events = [];
    this.recording = true;
    this.startTime = performance.now();
    this.currentFrame = 0;

    logger.info('Recording started');
  }

  /**
   * Stops recording input events.
   *
   * @example
   * ```typescript
   * recorder.stop();
   * console.log('Recording stopped');
   * ```
   */
  stop(): void {
    if (!this.recording) {
      logger.warn('Not currently recording');
      return;
    }

    this.recording = false;
    logger.info(`Recording stopped (${this.events.length} events, ${this.currentFrame} frames)`);
  }

  /**
   * Records a frame marker.
   *
   * @param deltaTime - Time since last frame in seconds
   *
   * @example
   * ```typescript
   * function update(deltaTime: number) {
   *   recorder.recordFrame(deltaTime);
   * }
   * ```
   */
  recordFrame(deltaTime: number): void {
    if (!this.recording) return;

    this.currentFrame++;

    this.addEvent({
      type: InputEventType.Frame,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      deltaTime
    });
  }

  /**
   * Records a key down event.
   *
   * @param keyCode - Key code
   *
   * @example
   * ```typescript
   * recorder.recordKeyDown('KeyW');
   * ```
   */
  recordKeyDown(keyCode: string): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.KeyDown,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      keyCode
    });
  }

  /**
   * Records a key up event.
   *
   * @param keyCode - Key code
   *
   * @example
   * ```typescript
   * recorder.recordKeyUp('KeyW');
   * ```
   */
  recordKeyUp(keyCode: string): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.KeyUp,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      keyCode
    });
  }

  /**
   * Records a mouse button down event.
   *
   * @param button - Button index
   * @param position - Mouse position
   *
   * @example
   * ```typescript
   * recorder.recordMouseButtonDown(0, { x: 100, y: 200 });
   * ```
   */
  recordMouseButtonDown(button: number, position: Vector2 | { x: number; y: number }): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.MouseButtonDown,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      button,
      position: { x: position.x, y: position.y }
    });
  }

  /**
   * Records a mouse button up event.
   *
   * @param button - Button index
   * @param position - Mouse position
   *
   * @example
   * ```typescript
   * recorder.recordMouseButtonUp(0, { x: 100, y: 200 });
   * ```
   */
  recordMouseButtonUp(button: number, position: Vector2 | { x: number; y: number }): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.MouseButtonUp,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      button,
      position: { x: position.x, y: position.y }
    });
  }

  /**
   * Records a mouse move event.
   *
   * @param position - Mouse position
   * @param delta - Mouse delta
   *
   * @example
   * ```typescript
   * recorder.recordMouseMove(
   *   { x: 100, y: 200 },
   *   { x: 5, y: -3 }
   * );
   * ```
   */
  recordMouseMove(
    position: Vector2 | { x: number; y: number },
    delta: Vector2 | { x: number; y: number }
  ): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.MouseMove,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      position: { x: position.x, y: position.y },
      delta: { x: delta.x, y: delta.y }
    });
  }

  /**
   * Records a mouse wheel event.
   *
   * @param delta - Scroll delta
   *
   * @example
   * ```typescript
   * recorder.recordMouseWheel({ x: 0, y: 100 });
   * ```
   */
  recordMouseWheel(delta: Vector2 | { x: number; y: number }): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.MouseWheel,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      delta: { x: delta.x, y: delta.y }
    });
  }

  /**
   * Records an action triggered event.
   *
   * @param context - Context name
   * @param action - Action name
   * @param value - Action value
   * @param vector - Action vector (for 2D actions)
   *
   * @example
   * ```typescript
   * recorder.recordAction('gameplay', 'jump', 1);
   * recorder.recordAction('gameplay', 'move', 0.8, { x: 0, y: 1 });
   * ```
   */
  recordAction(
    context: string,
    action: string,
    value: number,
    vector?: Vector2 | { x: number; y: number }
  ): void {
    if (!this.recording) return;

    this.addEvent({
      type: InputEventType.ActionTriggered,
      timestamp: this.getTimestamp(),
      frame: this.currentFrame,
      context,
      action,
      value,
      vector: vector ? { x: vector.x, y: vector.y } : undefined
    });
  }

  /**
   * Checks if currently recording.
   *
   * @returns True if recording
   *
   * @example
   * ```typescript
   * if (recorder.isRecording()) {
   *   console.log('Currently recording');
   * }
   * ```
   */
  isRecording(): boolean {
    return this.recording;
  }

  /**
   * Gets the number of recorded events.
   *
   * @returns Event count
   *
   * @example
   * ```typescript
   * const count = recorder.getEventCount();
   * console.log(`Recorded ${count} events`);
   * ```
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Gets the current frame number.
   *
   * @returns Frame number
   */
  getFrameCount(): number {
    return this.currentFrame;
  }

  /**
   * Gets the recording duration in milliseconds.
   *
   * @returns Duration in milliseconds
   */
  getDuration(): number {
    if (this.recording) {
      return performance.now() - this.startTime;
    }
    return this.events.length > 0
      ? this.events[this.events.length - 1].timestamp - this.events[0].timestamp
      : 0;
  }

  /**
   * Gets the complete recording.
   *
   * @returns Recording data
   *
   * @example
   * ```typescript
   * const recording = recorder.getRecording();
   * console.log(`Recorded ${recording.events.length} events`);
   * ```
   */
  getRecording(): Recording {
    const endTime = this.recording ? performance.now() : this.startTime + this.getDuration();

    return {
      metadata: {
        startTime: this.startTime,
        endTime,
        duration: this.getDuration(),
        frameCount: this.currentFrame,
        eventCount: this.events.length,
        version: this.version
      },
      events: this.events.slice()
    };
  }

  /**
   * Exports recording to JSON string.
   *
   * @returns JSON string
   *
   * @example
   * ```typescript
   * const json = recorder.export();
   * localStorage.setItem('replay', json);
   * ```
   */
  export(): string {
    return JSON.stringify(this.getRecording());
  }

  /**
   * Imports recording from JSON string.
   *
   * @param json - JSON string
   * @returns Imported recording
   *
   * @example
   * ```typescript
   * const json = localStorage.getItem('replay');
   * if (json) {
   *   const recording = recorder.import(json);
   * }
   * ```
   */
  import(json: string): Recording {
    return JSON.parse(json);
  }

  /**
   * Clears all recorded events.
   *
   * @example
   * ```typescript
   * recorder.clear();
   * ```
   */
  clear(): void {
    this.events = [];
    this.currentFrame = 0;
    logger.debug('Recording cleared');
  }

  /**
   * Gets current timestamp relative to recording start.
   *
   * @returns Timestamp in milliseconds
   * @private
   */
  private getTimestamp(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Adds an event to the recording.
   *
   * @param event - Event to add
   * @private
   */
  private addEvent(event: AnyInputEvent): void {
    if (this.events.length >= this.maxEvents) {
      logger.warn('Maximum events reached, dropping oldest events');
      this.events.shift();
    }

    this.events.push(event);
  }

  /**
   * Disposes the recorder.
   *
   * @example
   * ```typescript
   * recorder.dispose();
   * ```
   */
  dispose(): void {
    this.stop();
    this.clear();
    logger.debug('InputRecorder disposed');
  }
}
