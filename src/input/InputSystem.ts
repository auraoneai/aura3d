/**
 * InputSystem - ECS system for input handling
 *
 * Integrates the input manager with the ECS framework. This system updates the input
 * manager each frame, handles input recording/playback for replays, and provides
 * per-frame input polling. It runs at high priority to ensure input is processed
 * before game logic systems.
 *
 * @module input/InputSystem
 *
 * @example
 * ```typescript
 * import { World } from '../ecs';
 * import { InputSystem } from './input';
 *
 * const world = new World();
 * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
 *
 * // Add input system
 * const inputSystem = new InputSystem(canvas);
 * world.addSystem(inputSystem);
 *
 * // Configure input contexts and actions
 * const inputManager = inputSystem.getInputManager();
 * const gameplay = inputManager.createContext({ name: 'gameplay' });
 * // ... configure actions
 *
 * // The system will automatically update input each frame
 * world.update(deltaTime);
 * ```
 */

import { System, SystemContext, SystemPriorities } from '../ecs/System';
import { Logger } from '../core/Logger';
import { InputManager, InputManagerConfig } from './InputManager';

const logger = new Logger('InputSystem');

/**
 * Input frame data for recording/playback
 */
interface InputFrame {
  /**
   * Frame timestamp
   */
  timestamp: number;

  /**
   * Frame number
   */
  frame: number;

  /**
   * Snapshot of input state (context -> action -> value)
   */
  state: Map<string, Map<string, { triggered: boolean; value: number }>>;
}

/**
 * Recording state
 */
interface RecordingState {
  /**
   * Whether recording is active
   */
  recording: boolean;

  /**
   * Recorded frames
   */
  frames: InputFrame[];

  /**
   * Start time of recording
   */
  startTime: number;

  /**
   * Start frame of recording
   */
  startFrame: number;
}

/**
 * Playback state
 */
interface PlaybackState {
  /**
   * Whether playback is active
   */
  playing: boolean;

  /**
   * Frames to play back
   */
  frames: InputFrame[];

  /**
   * Current playback frame index
   */
  currentFrameIndex: number;

  /**
   * Start time of playback
   */
  startTime: number;

  /**
   * Whether to loop playback
   */
  loop: boolean;
}

/**
 * ECS system for input handling.
 * Runs at high priority (INPUT) to process input before game logic.
 *
 * @example
 * ```typescript
 * // Create and add to world
 * const inputSystem = new InputSystem(canvas, {
 *   keyboard: true,
 *   mouse: true,
 *   gamepad: true
 * });
 * world.addSystem(inputSystem);
 *
 * // Access input manager from other systems
 * const inputManager = inputSystem.getInputManager();
 *
 * // In another system
 * class PlayerSystem extends System {
 *   update(context: SystemContext): void {
 *     const inputManager = this.world.getSystem(InputSystem).getInputManager();
 *     const move = inputManager.getAction('gameplay', 'move');
 *     // ... use input
 *   }
 * }
 * ```
 */
export class InputSystem extends System {
  /**
   * Query descriptor (input system doesn't query entities)
   */
  readonly query = [];

  /**
   * Input manager instance
   */
  private inputManager: InputManager;

  /**
   * Target element for input
   */
  private target: HTMLElement | Window;

  /**
   * Virtual canvas for virtual input (optional)
   */
  private virtualCanvas?: HTMLCanvasElement;

  /**
   * Recording state
   */
  private recordingState: RecordingState = {
    recording: false,
    frames: [],
    startTime: 0,
    startFrame: 0
  };

  /**
   * Playback state
   */
  private playbackState: PlaybackState = {
    playing: false,
    frames: [],
    currentFrameIndex: 0,
    startTime: 0,
    loop: false
  };

  /**
   * Whether to render virtual input
   */
  private shouldRenderVirtual: boolean = false;

  /**
   * Creates a new input system.
   *
   * @param target - Target element for input (canvas or window)
   * @param config - Input manager configuration
   * @param virtualCanvas - Optional canvas for virtual input
   *
   * @example
   * ```typescript
   * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
   * const inputSystem = new InputSystem(canvas, {
   *   keyboard: true,
   *   mouse: true,
   *   touch: true,
   *   gamepad: true,
   *   virtualInput: false
   * });
   * ```
   */
  constructor(
    target: HTMLElement | Window,
    config: InputManagerConfig = {},
    virtualCanvas?: HTMLCanvasElement
  ) {
    super({
      name: 'InputSystem',
      priority: SystemPriorities.INPUT,
      enabled: true
    });

    this.target = target;
    this.virtualCanvas = virtualCanvas;
    this.inputManager = new InputManager(config);
    this.shouldRenderVirtual = config.virtualInput ?? false;

    logger.debug('InputSystem created');
  }

  /**
   * Initializes the input system.
   * Called by ECS when system is added to world.
   */
  override onInit(): void {
    this.inputManager.initialize(this.target, this.virtualCanvas);
    logger.info('InputSystem initialized');
  }

  /**
   * Called when system starts.
   */
  override onStart(): void {
    logger.info('InputSystem started');
  }

  /**
   * Updates input each frame.
   * Processes input before other systems run.
   *
   * @param context - System context with timing information
   */
  update(context: SystemContext): void {
    // Handle playback
    if (this.playbackState.playing) {
      this.updatePlayback(context);
      return;
    }

    // Normal input update
    this.inputManager.update(context.deltaTime);

    // Record input if recording is active
    if (this.recordingState.recording) {
      this.recordFrame(context);
    }

    // Render virtual input if enabled
    if (this.shouldRenderVirtual) {
      const virtualInput = this.inputManager.getVirtualInput();
      if (virtualInput) {
        virtualInput.render();
      }
    }
  }

  /**
   * Gets the input manager instance.
   *
   * @returns Input manager
   *
   * @example
   * ```typescript
   * const inputManager = inputSystem.getInputManager();
   * const keyboard = inputManager.getKeyboard();
   * ```
   */
  getInputManager(): InputManager {
    return this.inputManager;
  }

  /**
   * Starts recording input for replay.
   *
   * @param context - Current system context
   *
   * @example
   * ```typescript
   * inputSystem.startRecording(context);
   * console.log('Recording started');
   * ```
   */
  startRecording(context: SystemContext): void {
    if (this.recordingState.recording) {
      logger.warn('Already recording');
      return;
    }

    this.recordingState.recording = true;
    this.recordingState.frames = [];
    this.recordingState.startTime = context.time;
    this.recordingState.startFrame = context.frameCount;

    logger.info('Started input recording');
  }

  /**
   * Stops recording input.
   *
   * @returns Recorded frames
   *
   * @example
   * ```typescript
   * const frames = inputSystem.stopRecording();
   * console.log(`Recorded ${frames.length} frames`);
   * ```
   */
  stopRecording(): InputFrame[] {
    if (!this.recordingState.recording) {
      logger.warn('Not currently recording');
      return [];
    }

    this.recordingState.recording = false;
    const frames = this.recordingState.frames;

    logger.info(`Stopped input recording (${frames.length} frames)`);
    return frames;
  }

  /**
   * Starts playing back recorded input.
   *
   * @param frames - Recorded input frames
   * @param context - Current system context
   * @param loop - Whether to loop playback
   *
   * @example
   * ```typescript
   * const frames = inputSystem.stopRecording();
   * inputSystem.startPlayback(frames, context, false);
   * ```
   */
  startPlayback(frames: InputFrame[], context: SystemContext, loop: boolean = false): void {
    if (this.playbackState.playing) {
      logger.warn('Already playing back');
      return;
    }

    if (frames.length === 0) {
      logger.warn('No frames to play back');
      return;
    }

    this.playbackState.playing = true;
    this.playbackState.frames = frames;
    this.playbackState.currentFrameIndex = 0;
    this.playbackState.startTime = context.time;
    this.playbackState.loop = loop;

    logger.info(`Started input playback (${frames.length} frames, loop: ${loop})`);
  }

  /**
   * Stops playing back recorded input.
   *
   * @example
   * ```typescript
   * inputSystem.stopPlayback();
   * ```
   */
  stopPlayback(): void {
    if (!this.playbackState.playing) {
      return;
    }

    this.playbackState.playing = false;
    this.playbackState.currentFrameIndex = 0;

    logger.info('Stopped input playback');
  }

  /**
   * Checks if currently recording.
   *
   * @returns True if recording
   */
  isRecording(): boolean {
    return this.recordingState.recording;
  }

  /**
   * Checks if currently playing back.
   *
   * @returns True if playing back
   */
  isPlayingBack(): boolean {
    return this.playbackState.playing;
  }

  /**
   * Exports recorded frames as JSON.
   *
   * @param frames - Frames to export
   * @returns JSON string
   *
   * @example
   * ```typescript
   * const frames = inputSystem.stopRecording();
   * const json = inputSystem.exportRecording(frames);
   * localStorage.setItem('replay', json);
   * ```
   */
  exportRecording(frames: InputFrame[]): string {
    const data = frames.map(frame => ({
      timestamp: frame.timestamp,
      frame: frame.frame,
      state: Array.from(frame.state.entries()).map(([context, actions]) => [
        context,
        Array.from(actions.entries())
      ])
    }));

    return JSON.stringify(data);
  }

  /**
   * Imports recorded frames from JSON.
   *
   * @param json - JSON string
   * @returns Imported frames
   *
   * @example
   * ```typescript
   * const json = localStorage.getItem('replay');
   * if (json) {
   *   const frames = inputSystem.importRecording(json);
   *   inputSystem.startPlayback(frames, context);
   * }
   * ```
   */
  importRecording(json: string): InputFrame[] {
    const data = JSON.parse(json);

    return data.map((frame: any) => ({
      timestamp: frame.timestamp,
      frame: frame.frame,
      state: new Map(
        frame.state.map(([context, actions]: [string, any[]]) => [
          context,
          new Map(actions)
        ])
      )
    }));
  }

  /**
   * Records current input frame.
   *
   * @param context - System context
   * @private
   */
  private recordFrame(context: SystemContext): void {
    const state = new Map<string, Map<string, { triggered: boolean; value: number }>>();

    // Capture state of all registered input contexts
    const contexts = this.inputManager.getContexts();
    for (const [contextName, inputContext] of contexts) {
      const actionStates = new Map<string, { triggered: boolean; value: number }>();

      // Get all actions in this context
      const actions = inputContext.getActions();
      for (const [actionName, action] of actions) {
        actionStates.set(actionName, {
          triggered: action.isTriggered(),
          value: action.getValue()
        });
      }

      state.set(contextName, actionStates);
    }

    this.recordingState.frames.push({
      timestamp: context.time,
      frame: context.frameCount,
      state
    });
  }

  /**
   * Updates playback state.
   *
   * @param context - System context
   * @private
   */
  private updatePlayback(context: SystemContext): void {
    const elapsed = context.time - this.playbackState.startTime;
    const frames = this.playbackState.frames;

    // Find frame to play
    while (
      this.playbackState.currentFrameIndex < frames.length &&
      frames[this.playbackState.currentFrameIndex].timestamp <= elapsed
    ) {
      const frame = frames[this.playbackState.currentFrameIndex];
      this.applyFrame(frame);
      this.playbackState.currentFrameIndex++;
    }

    // Check if playback finished
    if (this.playbackState.currentFrameIndex >= frames.length) {
      if (this.playbackState.loop) {
        this.playbackState.currentFrameIndex = 0;
        this.playbackState.startTime = context.time;
      } else {
        this.stopPlayback();
      }
    }
  }

  /**
   * Applies a recorded frame.
   *
   * @param frame - Frame to apply
   * @private
   */
  private applyFrame(frame: InputFrame): void {
    // Apply recorded state to all input contexts
    const contexts = this.inputManager.getContexts();

    for (const [contextName, contextState] of frame.state) {
      const inputContext = contexts.get(contextName);
      if (!inputContext) continue;

      const actions = inputContext.getActions();
      for (const [actionName, actionState] of contextState) {
        const action = actions.get(actionName);
        if (!action) continue;

        // Apply recorded state to the action
        action.setPlaybackState(actionState.triggered, actionState.value);
      }
    }
  }

  /**
   * Called when system is destroyed.
   */
  override onDestroy(): void {
    this.inputManager.dispose();
    logger.info('InputSystem destroyed');
  }
}
