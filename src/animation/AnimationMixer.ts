/**
 * Animation playback controller with blending and crossfade support.
 * Manages multiple animation states and controls playback timing.
 * @module animation/AnimationMixer
 */

import { Animation, ChannelType } from './Animation';
import { ObjectPool } from '../core/ObjectPool';

/**
 * Playback state for an animation.
 */
export enum PlaybackState {
  /** Animation is stopped */
  STOPPED = 'stopped',
  /** Animation is playing */
  PLAYING = 'playing',
  /** Animation is paused */
  PAUSED = 'paused'
}

/**
 * Animation action representing a playing animation instance.
 * Actions can be blended, crossfaded, and controlled independently.
 *
 * @example
 * ```typescript
 * const action = mixer.play(walkAnimation);
 * action.weight = 0.5;  // 50% influence
 * action.speed = 1.5;   // Play 50% faster
 * action.fadeIn(0.3);   // Fade in over 0.3 seconds
 * ```
 */
export class AnimationAction {
  /**
   * Animation clip being played.
   */
  readonly animation: Animation;

  /**
   * Current playback state.
   */
  state: PlaybackState;

  /**
   * Current time in seconds.
   */
  time: number;

  /**
   * Playback speed multiplier (1.0 = normal speed).
   */
  speed: number;

  /**
   * Blend weight (0 = no influence, 1 = full influence).
   */
  weight: number;

  /**
   * Target weight for fading.
   */
  private targetWeight: number;

  /**
   * Fade duration in seconds (0 = no fade).
   */
  private fadeDuration: number;

  /**
   * Elapsed fade time in seconds.
   */
  private fadeTime: number;

  /**
   * Starting weight for fade.
   */
  private fadeStartWeight: number;

  /**
   * Priority for blending (higher priority dominates).
   */
  priority: number;

  /**
   * Whether to reset time to 0 when stopped.
   */
  resetOnStop: boolean;

  /**
   * Event callbacks.
   */
  private callbacks: {
    onStart?: () => void;
    onLoop?: () => void;
    onFinish?: () => void;
  };

  /**
   * Creates a new animation action.
   *
   * @param animation - Animation to play
   *
   * @example
   * ```typescript
   * const action = new AnimationAction(walkAnimation);
   * ```
   */
  constructor(animation: Animation) {
    this.animation = animation;
    this.state = PlaybackState.STOPPED;
    this.time = 0;
    this.speed = 1.0;
    this.weight = 1.0;
    this.targetWeight = 1.0;
    this.fadeDuration = 0;
    this.fadeTime = 0;
    this.fadeStartWeight = 1.0;
    this.priority = 0;
    this.resetOnStop = true;
    this.callbacks = {};
  }

  /**
   * Starts playing the animation.
   *
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.play();
   * ```
   */
  play(): this {
    if (this.state !== PlaybackState.PLAYING) {
      this.state = PlaybackState.PLAYING;
      if (this.callbacks.onStart) {
        this.callbacks.onStart();
      }
    }
    return this;
  }

  /**
   * Pauses the animation.
   *
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.pause();
   * ```
   */
  pause(): this {
    this.state = PlaybackState.PAUSED;
    return this;
  }

  /**
   * Stops the animation.
   *
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.stop();
   * ```
   */
  stop(): this {
    this.state = PlaybackState.STOPPED;
    if (this.resetOnStop) {
      this.time = 0;
    }
    return this;
  }

  /**
   * Fades the animation weight to target over duration.
   *
   * @param targetWeight - Target weight
   * @param duration - Fade duration in seconds
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.fadeTo(0.5, 0.3); // Fade to 50% weight over 0.3 seconds
   * ```
   */
  fadeTo(targetWeight: number, duration: number): this {
    this.fadeStartWeight = this.weight;
    this.targetWeight = targetWeight;
    this.fadeDuration = duration;
    this.fadeTime = 0;
    return this;
  }

  /**
   * Fades the animation in from 0 weight.
   *
   * @param duration - Fade duration in seconds
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.fadeIn(0.3);
   * ```
   */
  fadeIn(duration: number): this {
    this.weight = 0;
    return this.fadeTo(this.targetWeight || 1.0, duration);
  }

  /**
   * Fades the animation out to 0 weight and stops it.
   *
   * @param duration - Fade duration in seconds
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.fadeOut(0.3);
   * ```
   */
  fadeOut(duration: number): this {
    return this.fadeTo(0, duration);
  }

  /**
   * Resets the animation to start.
   *
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.reset();
   * ```
   */
  reset(): this {
    this.time = 0;
    this.weight = 1.0;
    this.targetWeight = 1.0;
    this.fadeDuration = 0;
    this.fadeTime = 0;
    this.speed = 1.0;
    return this;
  }

  /**
   * Sets callback for animation start.
   *
   * @param callback - Callback function
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.onStart(() => console.log('Animation started'));
   * ```
   */
  onStart(callback: () => void): this {
    this.callbacks.onStart = callback;
    return this;
  }

  /**
   * Sets callback for animation loop.
   *
   * @param callback - Callback function
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.onLoop(() => console.log('Animation looped'));
   * ```
   */
  onLoop(callback: () => void): this {
    this.callbacks.onLoop = callback;
    return this;
  }

  /**
   * Sets callback for animation finish.
   *
   * @param callback - Callback function
   * @returns This action for chaining
   *
   * @example
   * ```typescript
   * action.onFinish(() => console.log('Animation finished'));
   * ```
   */
  onFinish(callback: () => void): this {
    this.callbacks.onFinish = callback;
    return this;
  }

  /**
   * Updates the action for one frame.
   *
   * @param deltaTime - Time elapsed since last frame in seconds
   * @internal
   */
  _update(deltaTime: number): void {
    if (this.state !== PlaybackState.PLAYING) {
      return;
    }

    // Update fade
    if (this.fadeDuration > 0) {
      this.fadeTime += deltaTime;
      const t = Math.min(this.fadeTime / this.fadeDuration, 1.0);
      this.weight = this.fadeStartWeight + (this.targetWeight - this.fadeStartWeight) * t;

      if (t >= 1.0) {
        this.fadeDuration = 0;
        this.fadeTime = 0;

        // Stop if faded out
        if (this.weight === 0) {
          this.stop();
          return;
        }
      }
    }

    // Update time
    const prevTime = this.time;
    this.time += deltaTime * this.speed;

    // Handle looping
    if (this.animation.loop) {
      const duration = this.animation.duration;
      if (duration > 0) {
        // Check for loop crossing
        if (prevTime < duration && this.time >= duration) {
          if (this.callbacks.onLoop) {
            this.callbacks.onLoop();
          }
        }
        this.time = this.time % duration;
      }
    } else {
      // Clamp to duration
      if (this.time >= this.animation.duration) {
        this.time = this.animation.duration;
        this.stop();
        if (this.callbacks.onFinish) {
          this.callbacks.onFinish();
        }
      }
    }
  }

  /**
   * Gets whether this action is currently playing.
   *
   * @returns True if playing
   *
   * @example
   * ```typescript
   * if (action.isPlaying) {
   *   console.log('Animation is playing');
   * }
   * ```
   */
  get isPlaying(): boolean {
    return this.state === PlaybackState.PLAYING;
  }

  /**
   * Gets the normalized time [0, 1].
   *
   * @returns Normalized time
   *
   * @example
   * ```typescript
   * const progress = action.normalizedTime;
   * console.log(`Animation ${progress * 100}% complete`);
   * ```
   */
  get normalizedTime(): number {
    return this.animation.duration > 0 ? this.time / this.animation.duration : 0;
  }
}

/**
 * Animation mixer for playing and blending multiple animations.
 * Manages animation actions, crossfading, and pose blending.
 *
 * @example
 * ```typescript
 * const mixer = new AnimationMixer();
 *
 * // Play animations
 * const walkAction = mixer.play(walkAnimation);
 * const runAction = mixer.play(runAnimation, { weight: 0 });
 *
 * // Crossfade between animations
 * mixer.crossfade(walkAction, runAction, 0.3);
 *
 * // Update mixer each frame
 * mixer.update(deltaTime);
 *
 * // Sample blended pose
 * const pose = mixer.getPose();
 * for (const [target, channels] of pose) {
 *   if (channels.position) {
 *     bone.position.copy(channels.position);
 *   }
 *   if (channels.rotation) {
 *     bone.rotation.copy(channels.rotation);
 *   }
 * }
 * ```
 */
export class AnimationMixer {
  /**
   * Active animation actions.
   */
  private actions: AnimationAction[];

  /**
   * Action pool for memory efficiency.
   */
  private actionPool: ObjectPool<AnimationAction>;

  /**
   * Time scale for all animations (1.0 = normal speed).
   */
  timeScale: number;

  /**
   * Whether to automatically remove finished actions.
   */
  autoRemoveFinished: boolean;

  /**
   * Creates a new animation mixer.
   *
   * @example
   * ```typescript
   * const mixer = new AnimationMixer();
   * ```
   */
  constructor() {
    this.actions = [];
    this.timeScale = 1.0;
    this.autoRemoveFinished = true;

    this.actionPool = new ObjectPool<AnimationAction>(
      () => new AnimationAction(null as any),
      (action) => {
        action.animation = null as any;
        action.state = PlaybackState.STOPPED;
        action.time = 0;
        action.speed = 1.0;
        action.weight = 1.0;
        action.priority = 0;
        action.resetOnStop = true;
      },
      10 // Pre-create 10 actions
    );
  }

  /**
   * Plays an animation and returns its action.
   *
   * @param animation - Animation to play
   * @param options - Playback options
   * @returns Animation action
   *
   * @example
   * ```typescript
   * const action = mixer.play(walkAnimation, {
   *   weight: 0.5,
   *   speed: 1.2,
   *   fadeInDuration: 0.3
   * });
   * ```
   */
  play(animation: Animation, options?: {
    weight?: number;
    speed?: number;
    fadeInDuration?: number;
    priority?: number;
    resetOnStop?: boolean;
  }): AnimationAction {
    const action = this.actionPool.acquire();
    (action as any).animation = animation;

    action.weight = options?.weight ?? 1.0;
    action.speed = options?.speed ?? 1.0;
    action.priority = options?.priority ?? 0;
    action.resetOnStop = options?.resetOnStop ?? true;

    if (options?.fadeInDuration) {
      action.weight = 0;
      action.fadeTo(options.weight ?? 1.0, options.fadeInDuration);
    }

    action.play();
    this.actions.push(action);

    return action;
  }

  /**
   * Stops an animation action.
   *
   * @param action - Action to stop
   *
   * @example
   * ```typescript
   * mixer.stop(walkAction);
   * ```
   */
  stop(action: AnimationAction): void {
    action.stop();
    this.removeAction(action);
  }

  /**
   * Stops all playing animations.
   *
   * @example
   * ```typescript
   * mixer.stopAll();
   * ```
   */
  stopAll(): void {
    for (let i = this.actions.length - 1; i >= 0; i--) {
      this.actions[i].stop();
    }
    this.actions.length = 0;
  }

  /**
   * Crossfades from one animation to another.
   *
   * @param from - Source action to fade out
   * @param to - Target action to fade in
   * @param duration - Crossfade duration in seconds
   *
   * @example
   * ```typescript
   * mixer.crossfade(walkAction, runAction, 0.3);
   * ```
   */
  crossfade(from: AnimationAction, to: AnimationAction, duration: number): void {
    from.fadeOut(duration);
    to.fadeIn(duration);
    to.play();
  }

  /**
   * Updates all active animations.
   * Call this once per frame.
   *
   * @param deltaTime - Time elapsed since last frame in seconds
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime) {
   *   mixer.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    const scaledDeltaTime = deltaTime * this.timeScale;

    // Update all actions
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const action = this.actions[i];
      action._update(scaledDeltaTime);

      // Remove finished actions if auto-remove enabled
      if (this.autoRemoveFinished && action.state === PlaybackState.STOPPED) {
        this.actions.splice(i, 1);
        this.actionPool.release(action);
      }
    }
  }

  /**
   * Gets the blended pose from all active animations.
   * Returns a map of target names to channel values.
   *
   * @returns Blended pose data
   *
   * @example
   * ```typescript
   * const pose = mixer.getPose();
   * for (const [target, channels] of pose) {
   *   const bone = skeleton.getBone(target);
   *   if (channels.position) bone.position.copy(channels.position);
   *   if (channels.rotation) bone.rotation.copy(channels.rotation);
   *   if (channels.scale) bone.scale.copy(channels.scale);
   * }
   * ```
   */
  getPose(): Map<string, Partial<Record<ChannelType, any>>> {
    const pose = new Map<string, Partial<Record<ChannelType, any>>>();

    // Sort actions by priority (lower priority first for blending)
    const sortedActions = this.actions
      .filter(a => a.state === PlaybackState.PLAYING && a.weight > 0)
      .sort((a, b) => a.priority - b.priority);

    // Sample and blend all actions
    for (const action of sortedActions) {
      const samples = action.animation.sampleAll(action.time);

      for (const [key, value] of samples) {
        const [target, type] = key.split(':') as [string, ChannelType];

        if (!pose.has(target)) {
          pose.set(target, {});
        }

        const channels = pose.get(target)!;

        // Blend value with weight
        if (channels[type] === undefined) {
          // First value for this channel
          channels[type] = this.scaleValue(value, action.weight, type);
        } else {
          // Blend with existing value
          channels[type] = this.blendValues(
            channels[type],
            value,
            action.weight,
            type
          );
        }
      }
    }

    return pose;
  }

  /**
   * Gets all active actions.
   *
   * @returns Array of actions
   *
   * @example
   * ```typescript
   * const actions = mixer.getActions();
   * console.log(`${actions.length} animations playing`);
   * ```
   */
  getActions(): ReadonlyArray<AnimationAction> {
    return this.actions;
  }

  /**
   * Finds an action by animation name.
   *
   * @param name - Animation name
   * @returns Action or undefined if not found
   *
   * @example
   * ```typescript
   * const walkAction = mixer.findAction('Walk');
   * if (walkAction) {
   *   walkAction.speed = 1.5;
   * }
   * ```
   */
  findAction(name: string): AnimationAction | undefined {
    return this.actions.find(a => a.animation.name === name);
  }

  /**
   * Removes an action from the mixer.
   *
   * @param action - Action to remove
   * @private
   */
  private removeAction(action: AnimationAction): void {
    const index = this.actions.indexOf(action);
    if (index !== -1) {
      this.actions.splice(index, 1);
      this.actionPool.release(action);
    }
  }

  /**
   * Scales a value by weight.
   *
   * @param value - Value to scale
   * @param weight - Weight [0, 1]
   * @param type - Channel type
   * @returns Scaled value
   * @private
   */
  private scaleValue(value: any, weight: number, type: ChannelType): any {
    if (weight === 1.0) {
      return value;
    }

    switch (type) {
      case ChannelType.POSITION:
      case ChannelType.SCALE:
        return value.scale(weight);

      case ChannelType.ROTATION: {
        const identity = { x: 0, y: 0, z: 0, w: 1 };
        return this.slerpQuaternion(identity, value, weight);
      }

      case ChannelType.WEIGHTS:
        return value.map((w: number) => w * weight);

      default:
        return value;
    }
  }

  /**
   * Blends two values.
   *
   * @param a - First value
   * @param b - Second value
   * @param weight - Blend weight for b [0, 1]
   * @param type - Channel type
   * @returns Blended value
   * @private
   */
  private blendValues(a: any, b: any, weight: number, type: ChannelType): any {
    if (weight === 0) {
      return a;
    }

    if (weight === 1.0) {
      return b;
    }

    switch (type) {
      case ChannelType.POSITION:
      case ChannelType.SCALE:
        return a.lerp(b, weight);

      case ChannelType.ROTATION:
        return this.slerpQuaternion(a, b, weight);

      case ChannelType.WEIGHTS: {
        const result = [];
        for (let i = 0; i < a.length; i++) {
          result[i] = a[i] * (1 - weight) + b[i] * weight;
        }
        return result;
      }

      default:
        return weight < 0.5 ? a : b;
    }
  }

  /**
   * Spherical linear interpolation for quaternions.
   *
   * @param a - Start quaternion
   * @param b - End quaternion
   * @param t - Interpolation factor
   * @returns Interpolated quaternion
   * @private
   */
  private slerpQuaternion(a: any, b: any, t: number): any {
    // Simplified slerp for mixer
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    // Handle shortest path
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
      dot = -dot;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    // Linear interpolation for close quaternions
    if (dot > 0.9995) {
      return {
        x: a.x + (bx - a.x) * t,
        y: a.y + (by - a.y) * t,
        z: a.z + (bz - a.z) * t,
        w: a.w + (bw - a.w) * t
      };
    }

    const theta = Math.acos(Math.min(dot, 1));
    const sinTheta = Math.sin(theta);
    const w0 = Math.sin((1 - t) * theta) / sinTheta;
    const w1 = Math.sin(t * theta) / sinTheta;

    return {
      x: a.x * w0 + bx * w1,
      y: a.y * w0 + by * w1,
      z: a.z * w0 + bz * w1,
      w: a.w * w0 + bw * w1
    };
  }
}
