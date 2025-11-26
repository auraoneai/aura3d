/**
 * Animation state machine for state-based animation control.
 * Supports automatic transitions, conditions, hierarchical states, and interruption.
 * @module animation/AnimationStateMachine
 */

import { AnimationClip } from './AnimationClip';
import { BlendTree } from './BlendTree';
import { AnimationEventTimeline } from './AnimationEvent';

/**
 * Condition operator for transition conditions.
 */
export enum ConditionOperator {
  /** Greater than */
  GREATER = 'greater',
  /** Less than */
  LESS = 'less',
  /** Equal to */
  EQUAL = 'equal',
  /** Not equal to */
  NOT_EQUAL = 'not_equal',
  /** Greater than or equal */
  GREATER_EQUAL = 'greater_equal',
  /** Less than or equal */
  LESS_EQUAL = 'less_equal'
}

/**
 * Parameter type for state machine control.
 */
export enum ParameterType {
  /** Floating point number */
  FLOAT = 'float',
  /** Integer number */
  INT = 'int',
  /** Boolean flag */
  BOOL = 'bool',
  /** Trigger (auto-resets after use) */
  TRIGGER = 'trigger'
}

/**
 * State machine parameter.
 */
export interface Parameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: ParameterType;
  /** Current value */
  value: number | boolean;
  /** Default value */
  defaultValue: number | boolean;
}

/**
 * Transition condition.
 */
export interface TransitionCondition {
  /** Parameter name */
  parameterName: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Threshold value */
  threshold: number | boolean;
}

/**
 * Interruption source for transitions.
 */
export enum InterruptionSource {
  /** No interruption allowed */
  NONE = 'none',
  /** Can be interrupted by transitions from current state */
  CURRENT_STATE = 'current_state',
  /** Can be interrupted by transitions from next state */
  NEXT_STATE = 'next_state',
  /** Can be interrupted by transitions from current or next state */
  CURRENT_THEN_NEXT = 'current_then_next',
  /** Can be interrupted by transitions from next or current state */
  NEXT_THEN_CURRENT = 'next_then_current'
}

/**
 * Transition between states.
 */
export class StateTransition {
  /**
   * Source state name (or null for Any state).
   */
  readonly fromState: string | null;

  /**
   * Target state name.
   */
  readonly toState: string;

  /**
   * Transition duration in seconds.
   */
  duration: number;

  /**
   * Exit time as normalized time [0, 1] of source state.
   * Set to negative value to disable exit time.
   */
  exitTime: number;

  /**
   * Whether to wait for exit time before transitioning.
   */
  hasExitTime: boolean;

  /**
   * Conditions that must be met for transition.
   */
  private conditions: TransitionCondition[];

  /**
   * Interruption source.
   */
  interruptionSource: InterruptionSource;

  /**
   * Transition offset - start time of target state.
   */
  offset: number;

  /**
   * Priority (higher = checked first).
   */
  priority: number;

  /**
   * Creates a state transition.
   *
   * @param fromState - Source state name (null for Any state)
   * @param toState - Target state name
   * @param duration - Transition duration in seconds
   *
   * @example
   * ```typescript
   * const transition = new StateTransition('idle', 'walk', 0.2);
   * transition.addCondition('speed', ConditionOperator.GREATER, 0.1);
   * ```
   */
  constructor(fromState: string | null, toState: string, duration: number = 0.2) {
    this.fromState = fromState;
    this.toState = toState;
    this.duration = duration;
    this.exitTime = -1;
    this.hasExitTime = false;
    this.conditions = [];
    this.interruptionSource = InterruptionSource.NONE;
    this.offset = 0;
    this.priority = 0;
  }

  /**
   * Adds a condition to this transition.
   *
   * @param parameterName - Parameter name
   * @param operator - Comparison operator
   * @param threshold - Threshold value
   * @returns This transition for chaining
   *
   * @example
   * ```typescript
   * transition.addCondition('speed', ConditionOperator.GREATER, 0.5);
   * ```
   */
  addCondition(
    parameterName: string,
    operator: ConditionOperator,
    threshold: number | boolean
  ): this {
    this.conditions.push({ parameterName, operator, threshold });
    return this;
  }

  /**
   * Removes all conditions.
   *
   * @example
   * ```typescript
   * transition.clearConditions();
   * ```
   */
  clearConditions(): void {
    this.conditions.length = 0;
  }

  /**
   * Gets all conditions.
   *
   * @returns Array of conditions
   */
  getConditions(): ReadonlyArray<TransitionCondition> {
    return this.conditions;
  }

  /**
   * Evaluates if all conditions are met.
   *
   * @param parameters - State machine parameters
   * @returns True if all conditions pass
   *
   * @internal
   */
  evaluateConditions(parameters: Map<string, Parameter>): boolean {
    if (this.conditions.length === 0) {
      return true;
    }

    for (const condition of this.conditions) {
      const param = parameters.get(condition.parameterName);
      if (!param) {
        return false;
      }

      if (!this.evaluateCondition(param.value, condition.operator, condition.threshold)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates a single condition.
   *
   * @param value - Parameter value
   * @param operator - Comparison operator
   * @param threshold - Threshold value
   * @returns True if condition passes
   * @private
   */
  private evaluateCondition(
    value: number | boolean,
    operator: ConditionOperator,
    threshold: number | boolean
  ): boolean {
    const numValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    const numThreshold = typeof threshold === 'boolean' ? (threshold ? 1 : 0) : threshold;

    switch (operator) {
      case ConditionOperator.GREATER:
        return numValue > numThreshold;
      case ConditionOperator.LESS:
        return numValue < numThreshold;
      case ConditionOperator.EQUAL:
        return Math.abs(numValue - numThreshold) < 0.0001;
      case ConditionOperator.NOT_EQUAL:
        return Math.abs(numValue - numThreshold) >= 0.0001;
      case ConditionOperator.GREATER_EQUAL:
        return numValue >= numThreshold;
      case ConditionOperator.LESS_EQUAL:
        return numValue <= numThreshold;
      default:
        return false;
    }
  }
}

/**
 * Animation state containing a clip or blend tree.
 */
export class AnimationState {
  /**
   * State name.
   */
  readonly name: string;

  /**
   * Animation clip or blend tree.
   */
  private source: AnimationClip | BlendTree;

  /**
   * Playback speed multiplier.
   */
  speed: number;

  /**
   * Whether this state loops.
   */
  loop: boolean;

  /**
   * Current playback time.
   */
  private time: number;

  /**
   * Event timeline for this state.
   */
  private eventTimeline: AnimationEventTimeline | null;

  /**
   * Transitions from this state.
   */
  private transitions: StateTransition[];

  /**
   * Tag for categorization.
   */
  tag: string;

  /**
   * Creates an animation state.
   *
   * @param name - State name
   * @param source - Animation clip or blend tree
   *
   * @example
   * ```typescript
   * const idleState = new AnimationState('idle', idleClip);
   * idleState.speed = 1.0;
   * idleState.loop = true;
   * ```
   */
  constructor(name: string, source: AnimationClip | BlendTree) {
    this.name = name;
    this.source = source;
    this.speed = 1.0;
    this.loop = true;
    this.time = 0;
    this.eventTimeline = null;
    this.transitions = [];
    this.tag = '';
  }

  /**
   * Sets the animation source.
   *
   * @param source - Clip or blend tree
   * @returns This state for chaining
   */
  setSource(source: AnimationClip | BlendTree): this {
    this.source = source;
    return this;
  }

  /**
   * Gets the animation source.
   *
   * @returns Clip or blend tree
   */
  getSource(): AnimationClip | BlendTree {
    return this.source;
  }

  /**
   * Adds a transition from this state.
   *
   * @param transition - State transition
   * @returns This state for chaining
   *
   * @example
   * ```typescript
   * const transition = new StateTransition('idle', 'walk', 0.2);
   * idleState.addTransition(transition);
   * ```
   */
  addTransition(transition: StateTransition): this {
    this.transitions.push(transition);
    this.transitions.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Removes a transition.
   *
   * @param transition - Transition to remove
   * @returns True if removed
   */
  removeTransition(transition: StateTransition): boolean {
    const index = this.transitions.indexOf(transition);
    if (index !== -1) {
      this.transitions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Gets all transitions from this state.
   *
   * @returns Array of transitions
   */
  getTransitions(): ReadonlyArray<StateTransition> {
    return this.transitions;
  }

  /**
   * Sets the event timeline.
   *
   * @param timeline - Event timeline
   * @returns This state for chaining
   */
  setEventTimeline(timeline: AnimationEventTimeline): this {
    this.eventTimeline = timeline;
    return this;
  }

  /**
   * Gets the event timeline.
   *
   * @returns Event timeline or null
   */
  getEventTimeline(): AnimationEventTimeline | null {
    return this.eventTimeline;
  }

  /**
   * Updates the state.
   *
   * @param deltaTime - Time delta in seconds
   * @internal
   */
  update(deltaTime: number): void {
    const prevTime = this.time;
    this.time += deltaTime * this.speed;

    if (this.source instanceof BlendTree) {
      this.source.update(deltaTime * this.speed);
    }

    if (this.eventTimeline) {
      this.eventTimeline.update(prevTime, this.time, this.loop);
    }
  }

  /**
   * Samples the state animation at current time.
   *
   * @returns Pose data
   * @internal
   */
  sample(): Map<string, any> {
    if (this.source instanceof BlendTree) {
      return this.source.getPose();
    }

    const duration = this.source.duration;
    const sampleTime = duration > 0 && this.loop ? this.time % duration : Math.min(this.time, duration);
    return this.source.sampleAll(sampleTime);
  }

  /**
   * Gets the normalized time [0, 1].
   *
   * @returns Normalized time
   */
  getNormalizedTime(): number {
    const duration = this.getDuration();
    return duration > 0 ? this.time / duration : 0;
  }

  /**
   * Sets the playback time.
   *
   * @param time - Time in seconds
   */
  setTime(time: number): void {
    this.time = time;
    if (this.eventTimeline) {
      this.eventTimeline.reset();
    }
  }

  /**
   * Gets the current playback time.
   *
   * @returns Time in seconds
   */
  getTime(): number {
    return this.time;
  }

  /**
   * Gets the state duration.
   *
   * @returns Duration in seconds
   */
  getDuration(): number {
    if (this.source instanceof BlendTree) {
      return this.source.getDuration();
    }
    return this.source.duration;
  }

  /**
   * Resets the state to initial time.
   */
  reset(): void {
    this.time = 0;
    if (this.source instanceof BlendTree) {
      this.source.reset();
    }
    if (this.eventTimeline) {
      this.eventTimeline.reset();
    }
  }
}

/**
 * Active state transition.
 * @internal
 */
interface ActiveTransition {
  /** Transition being executed */
  transition: StateTransition;
  /** Source state */
  fromState: AnimationState;
  /** Target state */
  toState: AnimationState;
  /** Transition progress [0, 1] */
  progress: number;
}

/**
 * Animation state machine for state-based animation control.
 *
 * Features:
 * - State graph with automatic transitions
 * - Parameter-driven conditions
 * - Exit time constraints
 * - Interruption rules
 * - Sub-state machines (hierarchical)
 * - Any-state transitions
 *
 * @example
 * ```typescript
 * const sm = new AnimationStateMachine('locomotion');
 *
 * // Add parameters
 * sm.addParameter('speed', ParameterType.FLOAT, 0);
 * sm.addParameter('grounded', ParameterType.BOOL, true);
 *
 * // Add states
 * const idle = sm.addState('idle', idleClip);
 * const walk = sm.addState('walk', walkClip);
 * const run = sm.addState('run', runClip);
 *
 * // Add transitions
 * const idleToWalk = sm.addTransition('idle', 'walk', 0.2);
 * idleToWalk.addCondition('speed', ConditionOperator.GREATER, 0.1);
 *
 * const walkToRun = sm.addTransition('walk', 'run', 0.3);
 * walkToRun.addCondition('speed', ConditionOperator.GREATER, 1.5);
 *
 * // Set default state
 * sm.setDefaultState('idle');
 *
 * // Update loop
 * sm.setParameter('speed', playerSpeed);
 * sm.update(deltaTime);
 * const pose = sm.getPose();
 * ```
 */
export class AnimationStateMachine {
  /**
   * State machine name.
   */
  readonly name: string;

  /**
   * Animation states.
   */
  private states: Map<string, AnimationState>;

  /**
   * State machine parameters.
   */
  private parameters: Map<string, Parameter>;

  /**
   * Any-state transitions (apply from any state).
   */
  private anyStateTransitions: StateTransition[];

  /**
   * Current active state.
   */
  private currentState: AnimationState | null;

  /**
   * Default state name.
   */
  private defaultStateName: string | null;

  /**
   * Active transition.
   */
  private activeTransition: ActiveTransition | null;

  /**
   * Sub-state machines.
   */
  private subStateMachines: Map<string, AnimationStateMachine>;

  /**
   * Creates an animation state machine.
   *
   * @param name - State machine name
   *
   * @example
   * ```typescript
   * const sm = new AnimationStateMachine('character');
   * ```
   */
  constructor(name: string) {
    this.name = name;
    this.states = new Map();
    this.parameters = new Map();
    this.anyStateTransitions = [];
    this.currentState = null;
    this.defaultStateName = null;
    this.activeTransition = null;
    this.subStateMachines = new Map();
  }

  /**
   * Adds a parameter to the state machine.
   *
   * @param name - Parameter name
   * @param type - Parameter type
   * @param defaultValue - Default value
   * @returns This state machine for chaining
   *
   * @example
   * ```typescript
   * sm.addParameter('speed', ParameterType.FLOAT, 0);
   * sm.addParameter('isJumping', ParameterType.BOOL, false);
   * sm.addParameter('jump', ParameterType.TRIGGER, false);
   * ```
   */
  addParameter(name: string, type: ParameterType, defaultValue: number | boolean = 0): this {
    this.parameters.set(name, {
      name,
      type,
      value: defaultValue,
      defaultValue
    });
    return this;
  }

  /**
   * Sets a parameter value.
   *
   * @param name - Parameter name
   * @param value - Parameter value
   * @returns This state machine for chaining
   *
   * @example
   * ```typescript
   * sm.setParameter('speed', 1.5);
   * sm.setParameter('isJumping', true);
   * ```
   */
  setParameter(name: string, value: number | boolean): this {
    const param = this.parameters.get(name);
    if (param) {
      param.value = value;
    }
    return this;
  }

  /**
   * Gets a parameter value.
   *
   * @param name - Parameter name
   * @returns Parameter value or undefined
   *
   * @example
   * ```typescript
   * const speed = sm.getParameter('speed');
   * ```
   */
  getParameter(name: string): number | boolean | undefined {
    return this.parameters.get(name)?.value;
  }

  /**
   * Adds an animation state.
   *
   * @param name - State name
   * @param source - Animation clip or blend tree
   * @returns Created state
   *
   * @example
   * ```typescript
   * const idle = sm.addState('idle', idleClip);
   * idle.speed = 1.0;
   * idle.loop = true;
   * ```
   */
  addState(name: string, source: AnimationClip | BlendTree): AnimationState {
    const state = new AnimationState(name, source);
    this.states.set(name, state);
    return state;
  }

  /**
   * Removes a state.
   *
   * @param name - State name
   * @returns True if removed
   *
   * @example
   * ```typescript
   * sm.removeState('crouch');
   * ```
   */
  removeState(name: string): boolean {
    return this.states.delete(name);
  }

  /**
   * Gets a state by name.
   *
   * @param name - State name
   * @returns State or undefined
   *
   * @example
   * ```typescript
   * const walkState = sm.getState('walk');
   * if (walkState) {
   *   walkState.speed = 1.2;
   * }
   * ```
   */
  getState(name: string): AnimationState | undefined {
    return this.states.get(name);
  }

  /**
   * Gets all states.
   *
   * @returns Map of states
   */
  getStates(): ReadonlyMap<string, AnimationState> {
    return this.states;
  }

  /**
   * Sets the default state (entered on start).
   *
   * @param name - State name
   * @returns This state machine for chaining
   *
   * @example
   * ```typescript
   * sm.setDefaultState('idle');
   * ```
   */
  setDefaultState(name: string): this {
    this.defaultStateName = name;
    if (!this.currentState) {
      this.enterState(name);
    }
    return this;
  }

  /**
   * Adds a transition between states.
   *
   * @param fromState - Source state name
   * @param toState - Target state name
   * @param duration - Transition duration
   * @returns Created transition
   *
   * @example
   * ```typescript
   * const transition = sm.addTransition('idle', 'walk', 0.2);
   * transition.addCondition('speed', ConditionOperator.GREATER, 0.1);
   * transition.hasExitTime = true;
   * transition.exitTime = 0.9;
   * ```
   */
  addTransition(fromState: string, toState: string, duration: number = 0.2): StateTransition {
    const transition = new StateTransition(fromState, toState, duration);
    const state = this.states.get(fromState);
    if (state) {
      state.addTransition(transition);
    }
    return transition;
  }

  /**
   * Adds an any-state transition (applies from any state).
   *
   * @param toState - Target state name
   * @param duration - Transition duration
   * @returns Created transition
   *
   * @example
   * ```typescript
   * const deathTransition = sm.addAnyStateTransition('death', 0.1);
   * deathTransition.addCondition('health', ConditionOperator.LESS_EQUAL, 0);
   * ```
   */
  addAnyStateTransition(toState: string, duration: number = 0.2): StateTransition {
    const transition = new StateTransition(null, toState, duration);
    this.anyStateTransitions.push(transition);
    this.anyStateTransitions.sort((a, b) => b.priority - a.priority);
    return transition;
  }

  /**
   * Adds a sub-state machine.
   *
   * @param name - Sub-state machine name
   * @param stateMachine - State machine instance
   * @returns This state machine for chaining
   *
   * @example
   * ```typescript
   * const combatSM = new AnimationStateMachine('combat');
   * sm.addSubStateMachine('combat', combatSM);
   * ```
   */
  addSubStateMachine(name: string, stateMachine: AnimationStateMachine): this {
    this.subStateMachines.set(name, stateMachine);
    return this;
  }

  /**
   * Gets the current state.
   *
   * @returns Current state or null
   *
   * @example
   * ```typescript
   * const current = sm.getCurrentState();
   * if (current) {
   *   console.log(`Current state: ${current.name}`);
   * }
   * ```
   */
  getCurrentState(): AnimationState | null {
    return this.currentState;
  }

  /**
   * Updates the state machine.
   * Evaluates transitions and updates current state.
   *
   * @param deltaTime - Time delta in seconds
   *
   * @example
   * ```typescript
   * sm.update(deltaTime);
   * ```
   */
  update(deltaTime: number): void {
    if (!this.currentState && this.defaultStateName) {
      this.enterState(this.defaultStateName);
    }

    if (!this.currentState) {
      return;
    }

    if (this.activeTransition) {
      this.updateTransition(deltaTime);
    } else {
      this.currentState.update(deltaTime);
      this.evaluateTransitions();
    }

    this.resetTriggers();

    for (const subSM of this.subStateMachines.values()) {
      subSM.update(deltaTime);
    }
  }

  /**
   * Gets the blended pose from current state (and transition if active).
   *
   * @returns Pose data
   *
   * @example
   * ```typescript
   * const pose = sm.getPose();
   * for (const [key, value] of pose) {
   *   applyToSkeleton(key, value);
   * }
   * ```
   */
  getPose(): Map<string, any> {
    if (!this.currentState) {
      return new Map();
    }

    if (this.activeTransition) {
      return this.getTransitionPose();
    }

    return this.currentState.sample();
  }

  /**
   * Resets the state machine to default state.
   *
   * @example
   * ```typescript
   * sm.reset();
   * ```
   */
  reset(): void {
    this.activeTransition = null;
    if (this.defaultStateName) {
      this.enterState(this.defaultStateName);
    }
    for (const [, param] of this.parameters) {
      param.value = param.defaultValue;
    }
  }

  /**
   * Enters a state by name.
   *
   * @param name - State name
   * @private
   */
  private enterState(name: string): void {
    const state = this.states.get(name);
    if (!state) {
      return;
    }

    if (this.currentState) {
      this.currentState.reset();
    }

    this.currentState = state;
    this.currentState.reset();
  }

  /**
   * Evaluates transitions from current state.
   * @private
   */
  private evaluateTransitions(): void {
    if (!this.currentState) {
      return;
    }

    for (const transition of this.anyStateTransitions) {
      if (this.shouldTransition(transition, this.currentState)) {
        this.startTransition(transition, this.currentState);
        return;
      }
    }

    const stateTransitions = this.currentState.getTransitions();
    for (const transition of stateTransitions) {
      if (this.shouldTransition(transition, this.currentState)) {
        this.startTransition(transition, this.currentState);
        return;
      }
    }
  }

  /**
   * Checks if a transition should occur.
   *
   * @param transition - Transition to check
   * @param fromState - Source state
   * @returns True if should transition
   * @private
   */
  private shouldTransition(transition: StateTransition, fromState: AnimationState): boolean {
    if (!transition.evaluateConditions(this.parameters)) {
      return false;
    }

    if (transition.hasExitTime && transition.exitTime >= 0) {
      const normalizedTime = fromState.getNormalizedTime();
      if (normalizedTime < transition.exitTime) {
        return false;
      }
    }

    return true;
  }

  /**
   * Starts a transition.
   *
   * @param transition - Transition to start
   * @param fromState - Source state
   * @private
   */
  private startTransition(transition: StateTransition, fromState: AnimationState): void {
    const toState = this.states.get(transition.toState);
    if (!toState) {
      return;
    }

    toState.setTime(transition.offset);

    this.activeTransition = {
      transition,
      fromState,
      toState,
      progress: 0
    };
  }

  /**
   * Updates the active transition.
   *
   * @param deltaTime - Time delta
   * @private
   */
  private updateTransition(deltaTime: number): void {
    if (!this.activeTransition) {
      return;
    }

    const { transition, fromState, toState } = this.activeTransition;

    fromState.update(deltaTime);
    toState.update(deltaTime);

    if (transition.duration > 0) {
      this.activeTransition.progress += deltaTime / transition.duration;
    } else {
      this.activeTransition.progress = 1.0;
    }

    if (this.activeTransition.progress >= 1.0) {
      this.currentState = toState;
      this.activeTransition = null;
    } else {
      if (transition.interruptionSource !== InterruptionSource.NONE) {
        this.evaluateInterruptions();
      }
    }
  }

  /**
   * Evaluates possible interruptions during transition.
   * @private
   */
  private evaluateInterruptions(): void {
    if (!this.activeTransition) {
      return;
    }

    const { transition, fromState, toState } = this.activeTransition;

    switch (transition.interruptionSource) {
      case InterruptionSource.CURRENT_STATE:
        for (const t of fromState.getTransitions()) {
          if (this.shouldTransition(t, fromState)) {
            this.startTransition(t, fromState);
            return;
          }
        }
        break;

      case InterruptionSource.NEXT_STATE:
        for (const t of toState.getTransitions()) {
          if (this.shouldTransition(t, toState)) {
            this.startTransition(t, toState);
            return;
          }
        }
        break;

      case InterruptionSource.CURRENT_THEN_NEXT:
        for (const t of fromState.getTransitions()) {
          if (this.shouldTransition(t, fromState)) {
            this.startTransition(t, fromState);
            return;
          }
        }
        for (const t of toState.getTransitions()) {
          if (this.shouldTransition(t, toState)) {
            this.startTransition(t, toState);
            return;
          }
        }
        break;

      case InterruptionSource.NEXT_THEN_CURRENT:
        for (const t of toState.getTransitions()) {
          if (this.shouldTransition(t, toState)) {
            this.startTransition(t, toState);
            return;
          }
        }
        for (const t of fromState.getTransitions()) {
          if (this.shouldTransition(t, fromState)) {
            this.startTransition(t, fromState);
            return;
          }
        }
        break;
    }
  }

  /**
   * Gets the blended pose during transition.
   *
   * @returns Blended pose
   * @private
   */
  private getTransitionPose(): Map<string, any> {
    if (!this.activeTransition) {
      return new Map();
    }

    const { fromState, toState, progress } = this.activeTransition;

    const fromPose = fromState.sample();
    const toPose = toState.sample();

    const blendedPose = new Map<string, any>();

    for (const [key, fromValue] of fromPose) {
      const toValue = toPose.get(key);
      if (toValue !== undefined) {
        blendedPose.set(key, this.lerpValue(fromValue, toValue, progress));
      } else {
        blendedPose.set(key, fromValue);
      }
    }

    for (const [key, toValue] of toPose) {
      if (!blendedPose.has(key)) {
        blendedPose.set(key, toValue);
      }
    }

    return blendedPose;
  }

  /**
   * Linearly interpolates between two values.
   *
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor [0, 1]
   * @returns Interpolated value
   * @private
   */
  private lerpValue(a: any, b: any, t: number): any {
    if (typeof a === 'number' && typeof b === 'number') {
      return a + (b - a) * t;
    }

    if (a && typeof a.lerp === 'function') {
      return a.lerp(b, t);
    }

    if (a && typeof a.x === 'number' && a.w !== undefined) {
      return this.slerpQuaternion(a, b, t);
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      const result = [];
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        result[i] = a[i] + (b[i] - a[i]) * t;
      }
      return result;
    }

    return t < 0.5 ? a : b;
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
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
      dot = -dot;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

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

  /**
   * Resets all trigger parameters.
   * @private
   */
  private resetTriggers(): void {
    for (const [, param] of this.parameters) {
      if (param.type === ParameterType.TRIGGER && param.value === true) {
        param.value = false;
      }
    }
  }
}
