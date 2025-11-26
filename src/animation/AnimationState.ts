/**
 * Animation state machine for state-based animation transitions.
 * Provides state management, transitions with conditions, and blend trees.
 * @module animation/AnimationState
 */

import { Animation } from './Animation';
import { AnimationMixer, AnimationAction } from './AnimationMixer';

/**
 * Transition condition type.
 */
export type TransitionCondition = () => boolean;

/**
 * Animation state representing a single animation or blend tree.
 *
 * @example
 * ```typescript
 * const idleState: AnimationStateData = {
 *   name: 'Idle',
 *   animation: idleAnimation,
 *   loop: true,
 *   speed: 1.0
 * };
 * ```
 */
export interface AnimationStateData {
  /** State name */
  name: string;
  /** Animation to play */
  animation: Animation;
  /** Whether to loop */
  loop?: boolean;
  /** Playback speed */
  speed?: number;
  /** Layer index for layered animation */
  layer?: number;
  /** Layer mask (bone names to affect) */
  mask?: string[];
}

/**
 * Transition between animation states.
 *
 * @example
 * ```typescript
 * const transition: AnimationTransition = {
 *   from: 'Idle',
 *   to: 'Walk',
 *   duration: 0.3,
 *   condition: () => velocity > 0.1
 * };
 * ```
 */
export interface AnimationTransition {
  /** Source state name */
  from: string;
  /** Target state name */
  to: string;
  /** Transition duration in seconds */
  duration: number;
  /** Condition function (return true to trigger transition) */
  condition?: TransitionCondition;
  /** Can transition be interrupted? */
  interruptible?: boolean;
  /** Exit time (normalized [0, 1]) */
  exitTime?: number;
}

/**
 * Animation state machine for managing animation states and transitions.
 * Provides high-level animation control with state-based logic.
 *
 * @example
 * ```typescript
 * // Create state machine
 * const stateMachine = new AnimationStateMachine(mixer);
 *
 * // Add states
 * stateMachine.addState({
 *   name: 'Idle',
 *   animation: idleAnimation,
 *   loop: true
 * });
 *
 * stateMachine.addState({
 *   name: 'Walk',
 *   animation: walkAnimation,
 *   loop: true
 * });
 *
 * stateMachine.addState({
 *   name: 'Jump',
 *   animation: jumpAnimation,
 *   loop: false
 * });
 *
 * // Add transitions
 * stateMachine.addTransition({
 *   from: 'Idle',
 *   to: 'Walk',
 *   duration: 0.2,
 *   condition: () => velocity > 0.1
 * });
 *
 * stateMachine.addTransition({
 *   from: 'Walk',
 *   to: 'Idle',
 *   duration: 0.2,
 *   condition: () => velocity < 0.1
 * });
 *
 * stateMachine.addTransition({
 *   from: 'Idle',
 *   to: 'Jump',
 *   duration: 0.1,
 *   condition: () => jumpPressed
 * });
 *
 * // Set initial state
 * stateMachine.setState('Idle');
 *
 * // Update each frame
 * stateMachine.update(deltaTime);
 * ```
 */
export class AnimationStateMachine {
  /**
   * Animation mixer for playback.
   */
  private mixer: AnimationMixer;

  /**
   * States mapped by name.
   */
  private states: Map<string, AnimationStateData>;

  /**
   * Transitions list.
   */
  private transitions: AnimationTransition[];

  /**
   * Current state name.
   */
  private currentState: string | null;

  /**
   * Current state action.
   */
  private currentAction: AnimationAction | null;

  /**
   * Active transition.
   */
  private activeTransition: {
    transition: AnimationTransition;
    elapsed: number;
    fromAction: AnimationAction;
    toAction: AnimationAction;
  } | null;

  /**
   * Creates a new animation state machine.
   *
   * @param mixer - Animation mixer to use
   *
   * @example
   * ```typescript
   * const stateMachine = new AnimationStateMachine(mixer);
   * ```
   */
  constructor(mixer: AnimationMixer) {
    this.mixer = mixer;
    this.states = new Map();
    this.transitions = [];
    this.currentState = null;
    this.currentAction = null;
    this.activeTransition = null;
  }

  /**
   * Adds a state to the state machine.
   *
   * @param state - State data
   * @returns This state machine for chaining
   *
   * @example
   * ```typescript
   * stateMachine.addState({
   *   name: 'Run',
   *   animation: runAnimation,
   *   loop: true,
   *   speed: 1.2
   * });
   * ```
   */
  addState(state: AnimationStateData): this {
    this.states.set(state.name, state);
    return this;
  }

  /**
   * Removes a state from the state machine.
   *
   * @param name - State name
   * @returns True if state was removed
   *
   * @example
   * ```typescript
   * stateMachine.removeState('OldAnimation');
   * ```
   */
  removeState(name: string): boolean {
    if (this.currentState === name) {
      this.currentState = null;
      if (this.currentAction) {
        this.mixer.stop(this.currentAction);
        this.currentAction = null;
      }
    }
    return this.states.delete(name);
  }

  /**
   * Adds a transition between states.
   *
   * @param transition - Transition data
   * @returns This state machine for chaining
   *
   * @example
   * ```typescript
   * stateMachine.addTransition({
   *   from: 'Crouch',
   *   to: 'Stand',
   *   duration: 0.3,
   *   condition: () => !crouchButton,
   *   interruptible: true
   * });
   * ```
   */
  addTransition(transition: AnimationTransition): this {
    this.transitions.push(transition);
    return this;
  }

  /**
   * Sets the current state (immediate, no transition).
   *
   * @param name - State name
   * @returns True if state was set
   *
   * @example
   * ```typescript
   * stateMachine.setState('Idle');
   * ```
   */
  setState(name: string): boolean {
    const state = this.states.get(name);
    if (!state) {
      console.warn(`State ${name} not found`);
      return false;
    }

    // Stop current action
    if (this.currentAction) {
      this.mixer.stop(this.currentAction);
    }

    // Cancel active transition
    if (this.activeTransition) {
      this.mixer.stop(this.activeTransition.fromAction);
      this.mixer.stop(this.activeTransition.toAction);
      this.activeTransition = null;
    }

    // Play new state
    this.currentState = name;
    this.currentAction = this.mixer.play(state.animation, {
      speed: state.speed ?? 1.0
    });

    if (state.loop !== undefined) {
      this.currentAction.animation.loop = state.loop;
    }

    return true;
  }

  /**
   * Transitions to a state with crossfade.
   *
   * @param name - State name
   * @param duration - Transition duration (optional, uses default from transition)
   * @returns True if transition started
   *
   * @example
   * ```typescript
   * stateMachine.transitionTo('Combat', 0.5);
   * ```
   */
  transitionTo(name: string, duration?: number): boolean {
    if (this.currentState === name) {
      return false;
    }

    const state = this.states.get(name);
    if (!state) {
      console.warn(`State ${name} not found`);
      return false;
    }

    if (!this.currentAction) {
      return this.setState(name);
    }

    // Find transition duration
    const transitionDuration = duration ?? this.findTransitionDuration(this.currentState!, name) ?? 0.3;

    // Start new action
    const toAction = this.mixer.play(state.animation, {
      weight: 0,
      speed: state.speed ?? 1.0
    });

    if (state.loop !== undefined) {
      toAction.animation.loop = state.loop;
    }

    // Set up transition
    this.activeTransition = {
      transition: {
        from: this.currentState!,
        to: name,
        duration: transitionDuration
      },
      elapsed: 0,
      fromAction: this.currentAction,
      toAction
    };

    this.currentState = name;
    this.currentAction = toAction;

    return true;
  }

  /**
   * Updates the state machine.
   * Call this every frame to process transitions.
   *
   * @param deltaTime - Time elapsed since last update in seconds
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime) {
   *   stateMachine.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    // Update active transition
    if (this.activeTransition) {
      this.activeTransition.elapsed += deltaTime;
      const t = Math.min(this.activeTransition.elapsed / this.activeTransition.transition.duration, 1.0);

      // Update weights
      this.activeTransition.fromAction.weight = 1.0 - t;
      this.activeTransition.toAction.weight = t;

      // Complete transition
      if (t >= 1.0) {
        this.mixer.stop(this.activeTransition.fromAction);
        this.activeTransition = null;
      }
    }

    // Check for automatic transitions
    if (this.currentState && !this.activeTransition) {
      for (const transition of this.transitions) {
        if (transition.from === this.currentState) {
          // Check exit time
          if (transition.exitTime !== undefined && this.currentAction) {
            const normalizedTime = this.currentAction.normalizedTime;
            if (normalizedTime < transition.exitTime) {
              continue;
            }
          }

          // Check condition
          if (transition.condition && transition.condition()) {
            this.transitionTo(transition.to, transition.duration);
            break;
          }
        }
      }
    }
  }

  /**
   * Gets the current state name.
   *
   * @returns Current state name or null
   *
   * @example
   * ```typescript
   * const state = stateMachine.getCurrentState();
   * console.log(`Current state: ${state}`);
   * ```
   */
  getCurrentState(): string | null {
    return this.currentState;
  }

  /**
   * Gets whether a transition is active.
   *
   * @returns True if transitioning
   *
   * @example
   * ```typescript
   * if (stateMachine.isTransitioning()) {
   *   console.log('Transitioning between states');
   * }
   * ```
   */
  isTransitioning(): boolean {
    return this.activeTransition !== null;
  }

  /**
   * Gets the current action.
   *
   * @returns Current animation action or null
   *
   * @example
   * ```typescript
   * const action = stateMachine.getCurrentAction();
   * if (action) {
   *   console.log(`Playing: ${action.animation.name}`);
   * }
   * ```
   */
  getCurrentAction(): AnimationAction | null {
    return this.currentAction;
  }

  /**
   * Gets all state names.
   *
   * @returns Array of state names
   *
   * @example
   * ```typescript
   * const states = stateMachine.getStateNames();
   * console.log(`Available states: ${states.join(', ')}`);
   * ```
   */
  getStateNames(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Finds transition duration between two states.
   *
   * @param from - Source state
   * @param to - Target state
   * @returns Transition duration or undefined
   * @private
   */
  private findTransitionDuration(from: string, to: string): number | undefined {
    const transition = this.transitions.find(
      t => t.from === from && t.to === to
    );
    return transition?.duration;
  }

  /**
   * Clears all states and transitions.
   *
   * @example
   * ```typescript
   * stateMachine.clear();
   * ```
   */
  clear(): void {
    if (this.currentAction) {
      this.mixer.stop(this.currentAction);
    }

    if (this.activeTransition) {
      this.mixer.stop(this.activeTransition.fromAction);
      this.mixer.stop(this.activeTransition.toAction);
    }

    this.states.clear();
    this.transitions.length = 0;
    this.currentState = null;
    this.currentAction = null;
    this.activeTransition = null;
  }
}
