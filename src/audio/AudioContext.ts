/**
 * @fileoverview Web Audio API context wrapper for G3D engine.
 * Provides centralized audio context management, global controls, and lifecycle handling.
 * @module audio/AudioContext
 */

/**
 * Audio context state enumeration.
 */
export enum AudioContextState {
  SUSPENDED = 'suspended',
  RUNNING = 'running',
  CLOSED = 'closed',
  INTERRUPTED = 'interrupted'
}

/**
 * Configuration options for AudioContext initialization.
 *
 * @example
 * ```typescript
 * const config: AudioContextConfig = {
 *   sampleRate: 48000,
 *   latencyHint: 'interactive',
 *   masterVolume: 0.8
 * };
 * ```
 */
export interface AudioContextConfig {
  /**
   * Sample rate in Hz (default: hardware default, typically 44100 or 48000).
   */
  sampleRate?: number;

  /**
   * Audio latency hint for optimizing buffer sizes.
   * - 'interactive': Low latency for games (default)
   * - 'balanced': Balance between latency and power
   * - 'playback': Optimized for playback
   */
  latencyHint?: AudioContextLatencyCategory;

  /**
   * Initial master volume (0.0 to 1.0, default: 1.0).
   */
  masterVolume?: number;

  /**
   * Enable automatic resume on user interaction (default: true).
   */
  autoResume?: boolean;
}

/**
 * Centralized Web Audio API context manager for the G3D engine.
 *
 * Handles:
 * - Audio context creation and lifecycle
 * - Global volume control via master gain node
 * - Automatic suspend/resume on page visibility
 * - Audio worklet loading and management
 * - Mobile browser compatibility
 *
 * @example
 * ```typescript
 * // Initialize audio context
 * const audioCtx = AudioContext.getInstance();
 * await audioCtx.initialize({ latencyHint: 'interactive' });
 *
 * // Get native context and master output
 * const context = audioCtx.getContext();
 * const destination = audioCtx.getMasterOutput();
 *
 * // Create audio graph
 * const oscillator = context.createOscillator();
 * oscillator.connect(destination);
 * oscillator.start();
 *
 * // Control master volume
 * audioCtx.setMasterVolume(0.5);
 *
 * // Cleanup
 * await audioCtx.dispose();
 * ```
 */
export class AudioContext {
  private static instance: AudioContext | null = null;

  private context: globalThis.AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private config: Required<AudioContextConfig>;
  private state: AudioContextState = AudioContextState.SUSPENDED;
  private initialized: boolean = false;

  private workletModules: Map<string, boolean> = new Map();
  private suspendTimer: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private interactionHandler: (() => void) | null = null;

  // Stats
  private startTime: number = 0;
  private resumeCount: number = 0;
  private suspendCount: number = 0;

  /**
   * Private constructor - use getInstance() for singleton access.
   */
  private constructor() {
    this.config = {
      sampleRate: 0, // Use default
      latencyHint: 'interactive',
      masterVolume: 1.0,
      autoResume: true
    };
  }

  /**
   * Gets the singleton AudioContext instance.
   *
   * @returns The singleton AudioContext instance
   *
   * @example
   * ```typescript
   * const audioCtx = AudioContext.getInstance();
   * ```
   */
  public static getInstance(): AudioContext {
    if (!AudioContext.instance) {
      AudioContext.instance = new AudioContext();
    }
    return AudioContext.instance;
  }

  /**
   * Initializes the Web Audio API context.
   * Must be called before any audio operations.
   * Safe to call multiple times - subsequent calls are no-ops.
   *
   * @param config - Configuration options
   * @returns Promise that resolves when initialization completes
   *
   * @example
   * ```typescript
   * const audioCtx = AudioContext.getInstance();
   * await audioCtx.initialize({
   *   latencyHint: 'interactive',
   *   masterVolume: 0.8
   * });
   * ```
   */
  public async initialize(config?: AudioContextConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Merge config with defaults
    if (config) {
      Object.assign(this.config, config);
    }

    // Create Web Audio context
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AudioContextClass) {
      throw new Error('Web Audio API not supported in this browser');
    }

    const contextOptions: AudioContextOptions = {
      latencyHint: this.config.latencyHint
    };

    if (this.config.sampleRate > 0) {
      contextOptions.sampleRate = this.config.sampleRate;
    }

    this.context = new AudioContextClass(contextOptions);
    this.startTime = this.context.currentTime;

    // Create master gain node
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.config.masterVolume;
    this.masterGain.connect(this.context.destination);

    // Update state
    this.state = this.context.state as AudioContextState;

    // Setup automatic resume on user interaction (for mobile browsers)
    if (this.config.autoResume) {
      this.setupAutoResume();
    }

    // Setup visibility change handler
    this.setupVisibilityHandler();

    this.initialized = true;

    // Try to resume context if suspended (may require user interaction)
    if (this.context.state === 'suspended') {
      await this.resume().catch(() => {
        // Resume may fail without user interaction - this is expected
      });
    }
  }

  /**
   * Gets the native Web Audio API context.
   *
   * @returns The native AudioContext
   * @throws Error if not initialized
   *
   * @example
   * ```typescript
   * const context = audioCtx.getContext();
   * const oscillator = context.createOscillator();
   * ```
   */
  public getContext(): globalThis.AudioContext {
    if (!this.context) {
      throw new Error('AudioContext not initialized. Call initialize() first.');
    }
    return this.context;
  }

  /**
   * Gets the master output gain node.
   * All audio should connect to this node instead of context.destination.
   *
   * @returns The master gain node
   * @throws Error if not initialized
   *
   * @example
   * ```typescript
   * const destination = audioCtx.getMasterOutput();
   * const source = context.createBufferSource();
   * source.connect(destination);
   * ```
   */
  public getMasterOutput(): GainNode {
    if (!this.masterGain) {
      throw new Error('AudioContext not initialized. Call initialize() first.');
    }
    return this.masterGain;
  }

  /**
   * Sets the master volume.
   * Affects all audio playing through this context.
   *
   * @param volume - Volume level (0.0 to 1.0)
   * @param rampTime - Ramp time in seconds for smooth transition (default: 0.05)
   *
   * @example
   * ```typescript
   * // Instant change
   * audioCtx.setMasterVolume(0.5, 0);
   *
   * // Smooth fade over 1 second
   * audioCtx.setMasterVolume(0.5, 1.0);
   * ```
   */
  public setMasterVolume(volume: number, rampTime: number = 0.05): void {
    if (!this.masterGain || !this.context) {
      return;
    }

    volume = Math.max(0, Math.min(1, volume));
    this.config.masterVolume = volume;

    const now = this.context.currentTime;
    if (rampTime <= 0) {
      this.masterGain.gain.setValueAtTime(volume, now);
    } else {
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(volume, now + rampTime);
    }
  }

  /**
   * Gets the current master volume.
   *
   * @returns Current master volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const currentVolume = audioCtx.getMasterVolume();
   * console.log(`Master volume: ${currentVolume * 100}%`);
   * ```
   */
  public getMasterVolume(): number {
    return this.config.masterVolume;
  }

  /**
   * Resumes the audio context.
   * Required after page load or tab switch on some browsers.
   *
   * @returns Promise that resolves when context is resumed
   *
   * @example
   * ```typescript
   * await audioCtx.resume();
   * console.log('Audio context resumed');
   * ```
   */
  public async resume(): Promise<void> {
    if (!this.context || this.context.state === 'running') {
      return;
    }

    await this.context.resume();
    this.state = AudioContextState.RUNNING;
    this.resumeCount++;
  }

  /**
   * Suspends the audio context.
   * Useful for pausing all audio and saving CPU/battery.
   *
   * @returns Promise that resolves when context is suspended
   *
   * @example
   * ```typescript
   * await audioCtx.suspend();
   * console.log('Audio context suspended');
   * ```
   */
  public async suspend(): Promise<void> {
    if (!this.context || this.context.state === 'suspended') {
      return;
    }

    await this.context.suspend();
    this.state = AudioContextState.SUSPENDED;
    this.suspendCount++;
  }

  /**
   * Gets the current audio context state.
   *
   * @returns Current AudioContextState
   *
   * @example
   * ```typescript
   * if (audioCtx.getState() === AudioContextState.RUNNING) {
   *   // Audio is active
   * }
   * ```
   */
  public getState(): AudioContextState {
    if (this.context) {
      this.state = this.context.state as AudioContextState;
    }
    return this.state;
  }

  /**
   * Gets the current audio context time in seconds.
   * Monotonically increasing timer for scheduling audio events.
   *
   * @returns Current time in seconds
   *
   * @example
   * ```typescript
   * const now = audioCtx.getCurrentTime();
   * oscillator.start(now + 1.0); // Start in 1 second
   * ```
   */
  public getCurrentTime(): number {
    return this.context ? this.context.currentTime : 0;
  }

  /**
   * Gets the context sample rate in Hz.
   *
   * @returns Sample rate (e.g., 44100 or 48000)
   *
   * @example
   * ```typescript
   * const sampleRate = audioCtx.getSampleRate();
   * console.log(`Sample rate: ${sampleRate} Hz`);
   * ```
   */
  public getSampleRate(): number {
    return this.context ? this.context.sampleRate : 0;
  }

  /**
   * Loads an Audio Worklet module for custom audio processing.
   * Worklets run on a separate audio thread for low-latency processing.
   *
   * @param name - Worklet identifier
   * @param url - Path to the worklet JavaScript file
   * @returns Promise that resolves when worklet is loaded
   *
   * @example
   * ```typescript
   * await audioCtx.loadWorklet('customProcessor', '/audio/custom-processor.js');
   * const worklet = context.createAudioWorkletNode(context, 'customProcessor');
   * ```
   */
  public async loadWorklet(name: string, url: string): Promise<void> {
    if (!this.context) {
      throw new Error('AudioContext not initialized');
    }

    if (this.workletModules.has(name)) {
      return; // Already loaded
    }

    if (!this.context.audioWorklet) {
      throw new Error('Audio Worklets not supported in this browser');
    }

    await this.context.audioWorklet.addModule(url);
    this.workletModules.set(name, true);
  }

  /**
   * Checks if an Audio Worklet is loaded.
   *
   * @param name - Worklet identifier
   * @returns True if worklet is loaded
   *
   * @example
   * ```typescript
   * if (audioCtx.hasWorklet('customProcessor')) {
   *   // Use the worklet
   * }
   * ```
   */
  public hasWorklet(name: string): boolean {
    return this.workletModules.has(name);
  }

  /**
   * Disposes the audio context and cleans up all resources.
   * After calling this, initialize() must be called again to use audio.
   *
   * @returns Promise that resolves when disposal is complete
   *
   * @example
   * ```typescript
   * await audioCtx.dispose();
   * console.log('Audio context disposed');
   * ```
   */
  public async dispose(): Promise<void> {
    // Remove event listeners
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.interactionHandler) {
      document.removeEventListener('click', this.interactionHandler);
      document.removeEventListener('touchstart', this.interactionHandler);
      document.removeEventListener('keydown', this.interactionHandler);
      this.interactionHandler = null;
    }

    // Clear timers
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }

    // Close audio context
    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    // Reset state
    this.masterGain = null;
    this.state = AudioContextState.CLOSED;
    this.initialized = false;
    this.workletModules.clear();
  }

  /**
   * Gets audio statistics.
   *
   * @returns Statistics object
   *
   * @example
   * ```typescript
   * const stats = audioCtx.getStats();
   * console.log(`Uptime: ${stats.uptime}s, Resumes: ${stats.resumeCount}`);
   * ```
   */
  public getStats(): {
    sampleRate: number;
    currentTime: number;
    uptime: number;
    state: AudioContextState;
    resumeCount: number;
    suspendCount: number;
    workletCount: number;
  } {
    const currentTime = this.getCurrentTime();
    return {
      sampleRate: this.getSampleRate(),
      currentTime,
      uptime: currentTime - this.startTime,
      state: this.getState(),
      resumeCount: this.resumeCount,
      suspendCount: this.suspendCount,
      workletCount: this.workletModules.size
    };
  }

  /**
   * Setup automatic resume on user interaction.
   * Required for mobile browsers that suspend audio by default.
   */
  private setupAutoResume(): void {
    this.interactionHandler = async () => {
      if (this.context && this.context.state === 'suspended') {
        await this.resume();
      }

      // Remove listeners after first interaction
      if (this.interactionHandler) {
        document.removeEventListener('click', this.interactionHandler);
        document.removeEventListener('touchstart', this.interactionHandler);
        document.removeEventListener('keydown', this.interactionHandler);
        this.interactionHandler = null;
      }
    };

    document.addEventListener('click', this.interactionHandler, { once: false });
    document.addEventListener('touchstart', this.interactionHandler, { once: false });
    document.addEventListener('keydown', this.interactionHandler, { once: false });
  }

  /**
   * Setup visibility change handler to suspend/resume audio.
   * Saves CPU/battery when tab is not visible.
   */
  private setupVisibilityHandler(): void {
    this.visibilityHandler = () => {
      if (document.hidden) {
        // Tab hidden - suspend after a short delay
        this.suspendTimer = window.setTimeout(() => {
          this.suspend().catch(() => {
            // Ignore errors
          });
        }, 1000); // 1 second delay
      } else {
        // Tab visible - cancel suspend timer and resume
        if (this.suspendTimer !== null) {
          clearTimeout(this.suspendTimer);
          this.suspendTimer = null;
        }

        this.resume().catch(() => {
          // Ignore errors
        });
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }
}
