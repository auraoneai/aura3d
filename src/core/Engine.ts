/**
 * Engine.ts
 *
 * Main engine class coordinating all subsystems.
 * Implements a singleton pattern with complete lifecycle management,
 * fixed timestep accumulator for physics, and event-driven architecture.
 *
 * @module core/Engine
 */

import { World } from '../ecs/World';
import { Time } from './Time';
import { EventBus } from './EventBus';
import { Logger } from './Logger';
import { Renderer, RendererConfig, RendererBackend, RenderMode } from '../rendering/Renderer';
import { QualityPreset } from '../rendering/RenderSettings';

/**
 * Configuration options for engine initialization.
 *
 * @example
 * ```typescript
 * const config: EngineConfig = {
 *   canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
 *   targetFPS: 60,
 *   fixedTimestep: 1/60,
 *   maxSubSteps: 8,
 *   enableProfiling: true,
 *   autoStart: true
 * };
 * ```
 */
export interface EngineConfig {
  /**
   * Canvas element for rendering.
   * Optional; can be set later or not at all for headless mode.
   */
  canvas?: HTMLCanvasElement;

  /**
   * Target frames per second for the main loop.
   * @default 60
   */
  targetFPS?: number;

  /**
   * Fixed timestep for physics simulation in seconds.
   * @default 1/60 (approximately 16.67ms)
   */
  fixedTimestep?: number;

  /**
   * Maximum number of fixed update substeps per frame.
   * Prevents spiral of death when frame time is too long.
   * @default 8
   */
  maxSubSteps?: number;

  /**
   * Enable performance profiling and detailed stats.
   * @default false
   */
  enableProfiling?: boolean;

  /**
   * Automatically start the engine after initialization.
   * @default true
   */
  autoStart?: boolean;
}

/**
 * Engine state enumeration for lifecycle management.
 * Enforces valid state transitions and prevents invalid operations.
 */
export enum EngineState {
  /** Engine has been created but not initialized */
  UNINITIALIZED = 'uninitialized',

  /** Engine is initialized and ready to start */
  INITIALIZED = 'initialized',

  /** Engine is actively running the main loop */
  RUNNING = 'running',

  /** Engine is paused (can be resumed) */
  PAUSED = 'paused',

  /** Engine is stopped (can be restarted) */
  STOPPED = 'stopped',

  /** Engine has been destroyed and cannot be used */
  DESTROYED = 'destroyed'
}

/**
 * Event callback collection for engine lifecycle hooks.
 * All callbacks are optional and can be set to null to disable.
 */
interface EngineEvents {
  /** Called after engine initialization completes */
  onInit: ((engine: Engine) => void) | null;

  /** Called when engine starts running */
  onStart: ((engine: Engine) => void) | null;

  /** Called when engine stops */
  onStop: ((engine: Engine) => void) | null;

  /** Called when engine is paused */
  onPause: ((engine: Engine) => void) | null;

  /** Called when engine resumes from pause */
  onResume: ((engine: Engine) => void) | null;

  /** Called each frame with variable delta time */
  onUpdate: ((deltaTime: number) => void) | null;

  /** Called each fixed timestep iteration */
  onFixedUpdate: ((fixedDeltaTime: number) => void) | null;

  /** Called after all updates each frame */
  onLateUpdate: ((deltaTime: number) => void) | null;

  /** Called when engine is destroyed */
  onDestroy: ((engine: Engine) => void) | null;
}

/**
 * Performance statistics for debugging and profiling.
 */
interface EngineStats {
  /** Current frames per second */
  fps: number;

  /** Average frame time in milliseconds */
  frameTime: number;

  /** Total number of entities in the world */
  entityCount: number;

  /** Total number of active systems */
  systemCount: number;
}

/**
 * Main engine class coordinating all subsystems.
 *
 * The Engine is the central coordinator of the entire game framework:
 * - Manages complete lifecycle (initialization → running → destruction)
 * - Orchestrates World, Time, EventBus, and Logger subsystems
 * - Implements fixed timestep accumulator for deterministic physics
 * - Provides main loop using requestAnimationFrame
 * - Handles visibility changes (pauses when tab is hidden)
 * - Singleton pattern ensures single engine instance
 * - Event-driven architecture for flexible extension
 *
 * Performance targets:
 * - Frame overhead: < 0.5ms
 * - State transition: < 0.1ms
 * - Fixed timestep accuracy: ±0.001ms
 *
 * @example
 * ```typescript
 * // Create and configure engine
 * const engine = Engine.create({
 *   canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
 *   targetFPS: 60,
 *   fixedTimestep: 1/60,
 *   enableProfiling: true
 * });
 *
 * // Add systems to world
 * engine.world.addSystem(new PhysicsSystem());
 * engine.world.addSystem(new RenderSystem());
 *
 * // Set up event handlers
 * engine.events.onUpdate = (dt) => {
 *   // Custom game logic
 * };
 *
 * // Initialize and start
 * await engine.init();
 * engine.start();
 *
 * // Later: cleanup
 * engine.destroy();
 * ```
 */
export class Engine {
  /**
   * Singleton instance reference.
   * Only one engine can exist at a time.
   */
  private static _instance: Engine | null = null;

  /**
   * Engine configuration (frozen for immutability).
   */
  private readonly _config: Readonly<EngineConfig>;

  /**
   * Current engine state.
   */
  private _state: EngineState;

  /**
   * ECS World instance managing entities, components, and systems.
   */
  private readonly _world: World;

  /**
   * Canvas element for rendering (optional).
   */
  private _canvas: HTMLCanvasElement | null;

  /**
   * Renderer instance for GPU rendering.
   */
  private _renderer: Renderer | null = null;

  /**
   * Logger instance for engine logging.
   */
  private readonly logger = Logger.create('Engine');

  /**
   * Event callback collection.
   */
  private readonly _events: EngineEvents;

  /**
   * requestAnimationFrame handle for the main loop.
   */
  private rafHandle: number | null = null;

  /**
   * Fixed timestep accumulator for physics (seconds).
   */
  private accumulator: number = 0;

  /**
   * Last recorded timestamp for delta time calculation.
   */
  private lastTime: number = 0;

  /**
   * Frame count for FPS calculation.
   */
  private _frameCount: number = 0;

  /**
   * Current FPS (updated every second).
   */
  private _fps: number = 0;

  /**
   * FPS calculation accumulator.
   */
  private fpsAccumulator: number = 0;

  /**
   * FPS frame counter.
   */
  private fpsFrameCount: number = 0;

  /**
   * Last FPS update time.
   */
  private lastFpsUpdate: number = 0;

  /**
   * Average frame time in milliseconds.
   */
  private _frameTime: number = 0;

  /**
   * Frame time smoothing factor.
   */
  private readonly FRAME_TIME_SMOOTHING = 0.95;

  /**
   * Visibility change event handler.
   */
  private visibilityChangeHandler: (() => void) | null = null;

  /**
   * Creates a new Engine instance.
   * Private constructor enforces singleton pattern.
   *
   * @param config - Engine configuration options
   * @private
   */
  private constructor(config: EngineConfig = {}) {
    if (Engine._instance !== null) {
      throw new Error('Engine instance already exists. Use Engine.getInstance() or Engine.create()');
    }

    this._config = Object.freeze({
      targetFPS: config.targetFPS ?? 60,
      fixedTimestep: config.fixedTimestep ?? 1 / 60,
      maxSubSteps: config.maxSubSteps ?? 8,
      enableProfiling: config.enableProfiling ?? false,
      autoStart: config.autoStart ?? true,
      canvas: config.canvas
    });

    this._state = EngineState.UNINITIALIZED;
    this._canvas = this._config.canvas ?? null;

    this._world = new World({
      initialEntityCapacity: 1024
    });

    this._events = {
      onInit: null,
      onStart: null,
      onStop: null,
      onPause: null,
      onResume: null,
      onUpdate: null,
      onFixedUpdate: null,
      onLateUpdate: null,
      onDestroy: null
    };

    Time.fixedDeltaTime = this._config.fixedTimestep!;
    Time.maxDeltaTime = this._config.fixedTimestep! * this._config.maxSubSteps!;

    Engine._instance = this;

    this.logger.info('Engine created', {
      targetFPS: this._config.targetFPS,
      fixedTimestep: this._config.fixedTimestep,
      maxSubSteps: this._config.maxSubSteps
    });
  }

  /**
   * Gets the singleton engine instance.
   * @returns The current engine instance, or null if not created
   */
  static get instance(): Engine | null {
    return Engine._instance;
  }

  /**
   * Gets the frozen engine configuration.
   */
  get config(): Readonly<EngineConfig> {
    return this._config;
  }

  /**
   * Gets the ECS World instance.
   */
  get world(): World {
    return this._world;
  }

  /**
   * Gets the current engine state.
   */
  get state(): EngineState {
    return this._state;
  }

  /**
   * Gets the canvas element.
   */
  get canvas(): HTMLCanvasElement | null {
    return this._canvas;
  }

  /**
   * Gets the renderer instance.
   * Returns null if no canvas was provided or renderer hasn't been initialized.
   */
  get renderer(): Renderer | null {
    return this._renderer;
  }

  /**
   * Gets the event callback collection.
   */
  get events(): EngineEvents {
    return this._events;
  }

  /**
   * Registers an event listener (EventEmitter-style API).
   *
   * @param event - Event name ('update', 'fixedUpdate', 'lateUpdate', 'init', 'start', 'stop', 'pause', 'resume', 'destroy')
   * @param callback - Callback function
   * @returns this for chaining
   */
  on(event: string, callback: Function): this {
    switch (event) {
      case 'update':
        this._events.onUpdate = callback as (deltaTime: number) => void;
        break;
      case 'fixedUpdate':
        this._events.onFixedUpdate = callback as (fixedDeltaTime: number) => void;
        break;
      case 'lateUpdate':
        this._events.onLateUpdate = callback as (deltaTime: number) => void;
        break;
      case 'init':
        this._events.onInit = callback as (engine: Engine) => void;
        break;
      case 'start':
        this._events.onStart = callback as (engine: Engine) => void;
        break;
      case 'stop':
        this._events.onStop = callback as (engine: Engine) => void;
        break;
      case 'pause':
        this._events.onPause = callback as (engine: Engine) => void;
        break;
      case 'resume':
        this._events.onResume = callback as (engine: Engine) => void;
        break;
      case 'destroy':
        this._events.onDestroy = callback as (engine: Engine) => void;
        break;
    }
    return this;
  }

  /**
   * Removes an event listener.
   *
   * @param event - Event name
   * @param callback - Callback function (optional, removes all if not provided)
   * @returns this for chaining
   */
  off(event: string, callback?: Function): this {
    switch (event) {
      case 'update':
        this._events.onUpdate = null;
        break;
      case 'fixedUpdate':
        this._events.onFixedUpdate = null;
        break;
      case 'lateUpdate':
        this._events.onLateUpdate = null;
        break;
      case 'init':
        this._events.onInit = null;
        break;
      case 'start':
        this._events.onStart = null;
        break;
      case 'stop':
        this._events.onStop = null;
        break;
      case 'pause':
        this._events.onPause = null;
        break;
      case 'resume':
        this._events.onResume = null;
        break;
      case 'destroy':
        this._events.onDestroy = null;
        break;
    }
    return this;
  }

  /**
   * Gets the variable delta time in seconds.
   */
  get deltaTime(): number {
    return Time.deltaTime;
  }

  /**
   * Gets the total elapsed time in seconds.
   */
  get time(): number {
    return Time.time;
  }

  /**
   * Gets the total frame count.
   */
  get frameCount(): number {
    return this._frameCount;
  }

  /**
   * Gets the current frames per second.
   */
  get fps(): number {
    return this._fps;
  }

  /**
   * Checks if engine is currently running.
   */
  get isRunning(): boolean {
    return this._state === EngineState.RUNNING;
  }

  /**
   * Checks if engine is currently paused.
   */
  get isPaused(): boolean {
    return this._state === EngineState.PAUSED;
  }

  /**
   * Checks if engine is initialized.
   */
  get isInitialized(): boolean {
    return this._state !== EngineState.UNINITIALIZED && this._state !== EngineState.DESTROYED;
  }

  /**
   * Initializes the engine and all subsystems.
   * This must be called before starting the engine.
   *
   * State transition: UNINITIALIZED → INITIALIZED
   *
   * @returns Promise that resolves when initialization completes
   * @throws Error if engine is not in UNINITIALIZED state
   *
   * @example
   * ```typescript
   * const engine = Engine.create({ autoStart: false });
   * await engine.init();
   * engine.start();
   * ```
   */
  async init(): Promise<void> {
    if (this._state !== EngineState.UNINITIALIZED) {
      this.logger.warn(`Cannot initialize engine from state: ${this._state}`);
      return;
    }

    this.logger.info('Initializing engine...');

    Time.reset();

    this._world.init();

    // Initialize renderer if canvas is provided
    if (this._canvas) {
      try {
        this._renderer = await Renderer.create({
          canvas: this._canvas,
          backend: RendererBackend.Auto,
          renderMode: RenderMode.Forward,
          quality: QualityPreset.High,
          enableProfiling: this._config.enableProfiling ?? false
        });
        this.logger.info('Renderer initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize renderer', error);
        // Continue without renderer - headless mode
      }
    }

    this.setupVisibilityHandling();

    this._state = EngineState.INITIALIZED;

    if (this._events.onInit) {
      try {
        this._events.onInit(this);
      } catch (error) {
        this.logger.error('Error in onInit callback', error);
      }
    }

    EventBus.emit('engine:start', undefined);

    this.logger.info('Engine initialized successfully');

    if (this._config.autoStart) {
      this.start();
    }
  }

  /**
   * Starts the engine main loop.
   *
   * State transition: INITIALIZED → RUNNING or STOPPED → RUNNING or PAUSED → RUNNING
   *
   * @throws Error if engine is not initialized
   *
   * @example
   * ```typescript
   * engine.start();
   * ```
   */
  start(): void {
    if (this._state === EngineState.DESTROYED) {
      throw new Error('Cannot start destroyed engine');
    }

    if (this._state === EngineState.UNINITIALIZED) {
      throw new Error('Cannot start uninitialized engine. Call init() first.');
    }

    if (this._state === EngineState.RUNNING) {
      this.logger.warn('Engine is already running');
      return;
    }

    this.logger.info('Starting engine...');

    this._world.start();

    this._state = EngineState.RUNNING;
    this.lastTime = performance.now();
    this.lastFpsUpdate = this.lastTime;
    this.accumulator = 0;

    if (this._events.onStart) {
      try {
        this._events.onStart(this);
      } catch (error) {
        this.logger.error('Error in onStart callback', error);
      }
    }

    EventBus.emit('engine:start', undefined);

    this.rafHandle = requestAnimationFrame(this.mainLoop.bind(this));

    this.logger.info('Engine started');
  }

  /**
   * Stops the engine main loop.
   *
   * State transition: RUNNING → STOPPED or PAUSED → STOPPED
   *
   * @example
   * ```typescript
   * engine.stop();
   * ```
   */
  stop(): void {
    if (this._state !== EngineState.RUNNING && this._state !== EngineState.PAUSED) {
      this.logger.warn(`Cannot stop engine from state: ${this._state}`);
      return;
    }

    this.logger.info('Stopping engine...');

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }

    this._world.stop();

    this._state = EngineState.STOPPED;

    if (this._events.onStop) {
      try {
        this._events.onStop(this);
      } catch (error) {
        this.logger.error('Error in onStop callback', error);
      }
    }

    EventBus.emit('engine:stop', undefined);

    this.logger.info('Engine stopped');
  }

  /**
   * Pauses the engine main loop.
   *
   * State transition: RUNNING → PAUSED
   *
   * @example
   * ```typescript
   * engine.pause();
   * ```
   */
  pause(): void {
    if (this._state !== EngineState.RUNNING) {
      this.logger.warn(`Cannot pause engine from state: ${this._state}`);
      return;
    }

    this.logger.info('Pausing engine...');

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }

    this._state = EngineState.PAUSED;

    if (this._events.onPause) {
      try {
        this._events.onPause(this);
      } catch (error) {
        this.logger.error('Error in onPause callback', error);
      }
    }

    EventBus.emit('engine:pause', undefined);

    this.logger.info('Engine paused');
  }

  /**
   * Resumes the engine from paused state.
   *
   * State transition: PAUSED → RUNNING
   *
   * @example
   * ```typescript
   * engine.resume();
   * ```
   */
  resume(): void {
    if (this._state !== EngineState.PAUSED) {
      this.logger.warn(`Cannot resume engine from state: ${this._state}`);
      return;
    }

    this.logger.info('Resuming engine...');

    this._state = EngineState.RUNNING;
    this.lastTime = performance.now();

    if (this._events.onResume) {
      try {
        this._events.onResume(this);
      } catch (error) {
        this.logger.error('Error in onResume callback', error);
      }
    }

    EventBus.emit('engine:resume', undefined);

    this.rafHandle = requestAnimationFrame(this.mainLoop.bind(this));

    this.logger.info('Engine resumed');
  }

  /**
   * Destroys the engine and cleans up all resources.
   * After calling destroy, the engine instance should not be used.
   *
   * State transition: * → DESTROYED
   *
   * @example
   * ```typescript
   * engine.destroy();
   * ```
   */
  destroy(): void {
    if (this._state === EngineState.DESTROYED) {
      this.logger.warn('Engine already destroyed');
      return;
    }

    this.logger.info('Destroying engine...');

    if (this._state === EngineState.RUNNING || this._state === EngineState.PAUSED) {
      this.stop();
    }

    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }

    this.cleanupVisibilityHandling();

    // Dispose renderer
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    this._world.destroy();

    if (this._events.onDestroy) {
      try {
        this._events.onDestroy(this);
      } catch (error) {
        this.logger.error('Error in onDestroy callback', error);
      }
    }

    EventBus.emit('engine:stop', undefined);

    this._state = EngineState.DESTROYED;

    Engine._instance = null;

    this.logger.info('Engine destroyed');
  }

  /**
   * Executes a single frame tick.
   * Normally called automatically by the main loop, but can be called manually
   * for stepped debugging or non-real-time scenarios.
   *
   * @example
   * ```typescript
   * // Manual stepping for debugging
   * engine.tick();
   * ```
   */
  tick(): void {
    if (this._state !== EngineState.RUNNING) {
      return;
    }

    const currentTime = performance.now();
    const frameStartTime = currentTime;

    Time.update();

    const deltaTime = Time.deltaTime;
    this.accumulator += deltaTime;

    this._frameCount++;
    this.updateFPS(currentTime, frameStartTime);

    const maxAccumulator = this._config.fixedTimestep! * this._config.maxSubSteps!;
    if (this.accumulator > maxAccumulator) {
      this.accumulator = maxAccumulator;
    }

    if (this._events.onUpdate) {
      try {
        this._events.onUpdate(deltaTime);
      } catch (error) {
        this.logger.error('Error in onUpdate callback', error);
      }
    }

    this._world.update(deltaTime);

    let substeps = 0;
    while (this.accumulator >= this._config.fixedTimestep! && substeps < this._config.maxSubSteps!) {
      if (this._events.onFixedUpdate) {
        try {
          this._events.onFixedUpdate(this._config.fixedTimestep!);
        } catch (error) {
          this.logger.error('Error in onFixedUpdate callback', error);
        }
      }

      this._world.fixedUpdate(this._config.fixedTimestep!);

      this.accumulator -= this._config.fixedTimestep!;
      substeps++;
    }

    if (this._events.onLateUpdate) {
      try {
        this._events.onLateUpdate(deltaTime);
      } catch (error) {
        this.logger.error('Error in onLateUpdate callback', error);
      }
    }

    this._world.lateUpdate(deltaTime);
  }

  /**
   * Gets current engine performance statistics.
   *
   * @returns Object containing performance metrics
   *
   * @example
   * ```typescript
   * const stats = engine.getStats();
   * console.log(`FPS: ${stats.fps}, Entities: ${stats.entityCount}`);
   * ```
   */
  getStats(): EngineStats {
    return {
      fps: this._fps,
      frameTime: this._frameTime,
      entityCount: this._world.entityCount,
      systemCount: this._world.systemCount
    };
  }

  /**
   * Creates a new engine instance with the given configuration.
   * This is the primary way to create an engine.
   *
   * @param config - Engine configuration options
   * @returns New engine instance
   * @throws Error if an engine instance already exists
   *
   * @example
   * ```typescript
   * const engine = Engine.create({
   *   canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
   *   targetFPS: 60,
   *   enableProfiling: true
   * });
   * ```
   */
  static create(config?: EngineConfig): Engine {
    if (Engine._instance !== null) {
      throw new Error('Engine instance already exists. Destroy the existing instance first.');
    }
    return new Engine(config);
  }

  /**
   * Gets the singleton engine instance.
   *
   * @returns The current engine instance, or null if not created
   *
   * @example
   * ```typescript
   * const engine = Engine.getInstance();
   * if (engine) {
   *   console.log(`Engine is ${engine.state}`);
   * }
   * ```
   */
  static getInstance(): Engine | null {
    return Engine._instance;
  }

  /**
   * Main loop implementation using requestAnimationFrame.
   * Handles frame timing, fixed timestep accumulation, and all update phases.
   *
   * @private
   */
  private mainLoop(): void {
    if (this._state !== EngineState.RUNNING) {
      return;
    }

    this.tick();

    this.rafHandle = requestAnimationFrame(this.mainLoop.bind(this));
  }

  /**
   * Updates FPS calculation every second.
   *
   * @param currentTime - Current timestamp in milliseconds
   * @param frameStartTime - Frame start timestamp in milliseconds
   * @private
   */
  private updateFPS(currentTime: number, frameStartTime: number): void {
    this.fpsFrameCount++;

    const elapsed = currentTime - this.lastFpsUpdate;
    if (elapsed >= 1000) {
      this._fps = Math.round((this.fpsFrameCount * 1000) / elapsed);
      this.fpsFrameCount = 0;
      this.lastFpsUpdate = currentTime;
    }

    const currentFrameTime = performance.now() - frameStartTime;
    this._frameTime = this._frameTime * this.FRAME_TIME_SMOOTHING +
                      currentFrameTime * (1 - this.FRAME_TIME_SMOOTHING);
  }

  /**
   * Sets up page visibility change handling.
   * Automatically pauses engine when tab is hidden.
   *
   * @private
   */
  private setupVisibilityHandling(): void {
    if (typeof document === 'undefined') {
      return;
    }

    this.visibilityChangeHandler = () => {
      if (document.hidden) {
        if (this._state === EngineState.RUNNING) {
          this.pause();
          this.logger.info('Engine paused (tab hidden)');
        }
      } else {
        if (this._state === EngineState.PAUSED) {
          this.lastTime = performance.now();
          this.accumulator = 0;
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  /**
   * Cleans up visibility change handling.
   *
   * @private
   */
  private cleanupVisibilityHandling(): void {
    if (typeof document === 'undefined' || !this.visibilityChangeHandler) {
      return;
    }

    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    this.visibilityChangeHandler = null;
  }
}

// EngineConfig is already exported from './EngineConfig'
