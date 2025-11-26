/**
 * Frame timing, fixed timestep accumulator, and time management system.
 *
 * Provides high-precision timing using performance.now() and implements
 * a fixed timestep accumulator pattern for deterministic physics simulation.
 * Handles variable frame rates, time scaling, and prevents spiral of death.
 *
 * @example
 * ```typescript
 * // In game loop
 * Time.update();
 *
 * // Use variable timestep for rendering
 * renderer.render(Time.deltaTime);
 *
 * // Use fixed timestep for physics
 * for (const alpha of Time.getFixedStepIterator()) {
 *   physics.step(Time.fixedDeltaTime);
 * }
 * ```
 */
export class Time {
  /**
   * Variable delta time for rendering (in seconds).
   * Affected by timeScale. Use for smooth animations and rendering.
   */
  static deltaTime: number = 0;

  /**
   * Fixed delta time for physics simulation (in seconds).
   * Default is 1/60 (approximately 16.67ms). Use for deterministic physics.
   */
  static fixedDeltaTime: number = 1 / 60;

  /**
   * Unscaled delta time (in seconds).
   * Not affected by timeScale. Use for UI and pause-independent logic.
   */
  static unscaledDeltaTime: number = 0;

  /**
   * Total elapsed time since start (in seconds).
   * Affected by timeScale.
   */
  static time: number = 0;

  /**
   * Total number of frames rendered.
   * Monotonically increasing integer.
   */
  static frameCount: number = 0;

  /**
   * Time scale multiplier.
   * - 0 = paused
   * - 1 = normal speed
   * - 2 = double speed
   * - 0.5 = half speed
   */
  static timeScale: number = 1;

  /**
   * Maximum allowed delta time (in seconds).
   * Prevents spiral of death when tab is hidden or debugger pauses.
   * Default is 0.1 seconds (100ms).
   */
  static maxDeltaTime: number = 0.1;

  /**
   * Accumulated fixed time for physics stepping (in seconds).
   * Internal accumulator for fixed timestep pattern.
   */
  static fixedTime: number = 0;

  /**
   * Number of fixed steps executed this frame.
   * Used to limit maximum fixed steps per frame.
   */
  static fixedStepCount: number = 0;

  /**
   * Maximum number of fixed steps allowed per frame.
   * Prevents spiral of death by capping physics updates.
   */
  private static readonly MAX_FIXED_STEPS: number = 8;

  /**
   * Last recorded timestamp from performance.now() (in milliseconds).
   */
  private static lastTime: number = performance.now();

  /**
   * Accumulator for fixed timestep (in seconds).
   */
  private static accumulator: number = 0;

  /**
   * Flag to track if this is the first update.
   */
  private static isFirstUpdate: boolean = true;

  /**
   * Updates timing information for the current frame.
   * Should be called once per frame at the start of the game loop.
   *
   * Calculates delta time, updates counters, and accumulates time
   * for fixed timestep physics simulation.
   *
   * @example
   * ```typescript
   * function gameLoop() {
   *   Time.update();
   *   render();
   *   requestAnimationFrame(gameLoop);
   * }
   * ```
   */
  static update(): void {
    const currentTime = performance.now();

    // Calculate unscaled delta time in seconds
    let rawDelta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Handle first update or large time jumps
    if (this.isFirstUpdate) {
      rawDelta = this.fixedDeltaTime;
      this.isFirstUpdate = false;
    }

    // Cap delta time to prevent spiral of death
    rawDelta = Math.min(rawDelta, this.maxDeltaTime);

    // Store unscaled delta time
    this.unscaledDeltaTime = rawDelta;

    // Apply time scale
    this.deltaTime = rawDelta * this.timeScale;

    // Update total time
    this.time += this.deltaTime;

    // Increment frame count
    this.frameCount++;

    // Reset fixed step count for this frame
    this.fixedStepCount = 0;

    // Accumulate time for fixed timestep
    this.accumulator += this.deltaTime;

    // Cap accumulator to prevent excessive catch-up
    const maxAccumulator = this.fixedDeltaTime * this.MAX_FIXED_STEPS;
    if (this.accumulator > maxAccumulator) {
      this.accumulator = maxAccumulator;
    }
  }

  /**
   * Returns a generator that yields for each fixed timestep iteration.
   * Implements the fixed timestep accumulator pattern for deterministic physics.
   *
   * The generator yields an interpolation alpha value (0-1) that can be used
   * for smooth rendering between physics steps.
   *
   * @returns Generator that yields interpolation alpha for each fixed step
   *
   * @example
   * ```typescript
   * for (const alpha of Time.getFixedStepIterator()) {
   *   physicsSystem.step(Time.fixedDeltaTime);
   *   Time.fixedTime += Time.fixedDeltaTime;
   * }
   * ```
   */
  static *getFixedStepIterator(): Generator<number> {
    let stepCount = 0;

    while (this.accumulator >= this.fixedDeltaTime && stepCount < this.MAX_FIXED_STEPS) {
      // Subtract fixed delta time from accumulator
      this.accumulator -= this.fixedDeltaTime;

      // Increment counters
      this.fixedStepCount++;
      stepCount++;

      // Calculate interpolation alpha (remaining accumulator / fixed delta)
      const alpha = this.accumulator / this.fixedDeltaTime;

      // Yield alpha for this fixed step
      yield alpha;
    }
  }

  /**
   * Resets all timing information to initial state.
   * Useful when restarting the game or changing scenes.
   *
   * @example
   * ```typescript
   * // When loading a new level
   * Time.reset();
   * sceneManager.loadScene('level1');
   * ```
   */
  static reset(): void {
    this.deltaTime = 0;
    this.unscaledDeltaTime = 0;
    this.time = 0;
    this.frameCount = 0;
    this.fixedTime = 0;
    this.fixedStepCount = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.isFirstUpdate = true;
    this.timeScale = 1;
  }

  /**
   * Handles page visibility changes to prevent large delta spikes.
   * Should be called when the page becomes visible again after being hidden.
   *
   * @internal
   */
  static handleVisibilityChange(): void {
    if (!document.hidden) {
      // Reset last time to prevent large delta on next update
      this.lastTime = performance.now();
      // Clear accumulator to prevent physics catch-up
      this.accumulator = 0;
    }
  }
}

// Automatically handle page visibility changes
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    Time.handleVisibilityChange();
  });
}
