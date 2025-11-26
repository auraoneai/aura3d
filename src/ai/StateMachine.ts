/**
 * @fileoverview Finite state machine for AI behavior control.
 * Provides state transitions with conditions, hierarchical states, and history.
 * @module ai/StateMachine
 */

import { Blackboard } from './Blackboard';

/**
 * State transition condition function.
 */
export type TransitionCondition = (blackboard: Blackboard) => boolean;

/**
 * State transition definition.
 */
export interface StateTransition {
  /** Target state ID */
  targetState: string;
  /** Transition condition */
  condition: TransitionCondition;
  /** Transition priority (higher = checked first) */
  priority: number;
}

/**
 * State in the state machine.
 *
 * @example
 * ```typescript
 * const idleState = new State('Idle');
 *
 * idleState.onEnter = (blackboard) => {
 *   console.log('Entering idle state');
 *   blackboard.set('velocity', 0);
 * };
 *
 * idleState.onUpdate = (deltaTime, blackboard) => {
 *   // Idle behavior...
 * };
 *
 * idleState.onExit = (blackboard) => {
 *   console.log('Leaving idle state');
 * };
 * ```
 */
export class State {
  /** Unique state identifier */
  readonly id: string;

  /** Human-readable state name */
  name: string;

  /** Transitions from this state */
  readonly transitions: StateTransition[];

  /** Parent state (for hierarchical FSM) */
  parent: State | null;

  /** Child states (for hierarchical FSM) */
  readonly children: Map<string, State>;

  /** Initial child state ID */
  initialChildState: string | null;

  /** Current active child state */
  currentChildState: State | null;

  /** Whether to remember child state on exit (history) */
  rememberChildState: boolean;

  /**
   * Called when entering the state.
   */
  onEnter?: (blackboard: Blackboard) => void;

  /**
   * Called each update while in the state.
   */
  onUpdate?: (deltaTime: number, blackboard: Blackboard) => void;

  /**
   * Called when exiting the state.
   */
  onExit?: (blackboard: Blackboard) => void;

  /**
   * Creates a new state.
   *
   * @param id - State identifier
   * @param name - State name (defaults to id)
   */
  constructor(id: string, name?: string) {
    this.id = id;
    this.name = name ?? id;
    this.transitions = [];
    this.parent = null;
    this.children = new Map();
    this.initialChildState = null;
    this.currentChildState = null;
    this.rememberChildState = false;
  }

  /**
   * Adds a transition to another state.
   *
   * @param targetState - Target state ID
   * @param condition - Transition condition
   * @param priority - Transition priority
   * @returns This state for chaining
   *
   * @example
   * ```typescript
   * idleState.addTransition('patrol', (bb) => bb.get('shouldPatrol'), 10);
   * idleState.addTransition('alert', (bb) => bb.get('enemySpotted'), 20);
   * ```
   */
  addTransition(
    targetState: string,
    condition: TransitionCondition,
    priority: number = 0
  ): this {
    this.transitions.push({ targetState, condition, priority });
    // Sort by priority (highest first)
    this.transitions.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Adds a child state for hierarchical FSM.
   *
   * @param state - Child state
   * @returns This state for chaining
   */
  addChild(state: State): this {
    state.parent = this;
    this.children.set(state.id, state);
    return this;
  }

  /**
   * Sets the initial child state.
   *
   * @param stateId - Child state ID
   * @returns This state for chaining
   */
  setInitialChild(stateId: string): this {
    this.initialChildState = stateId;
    return this;
  }

  /**
   * Checks if this state has child states.
   */
  hasChildren(): boolean {
    return this.children.size > 0;
  }

  /**
   * Gets a child state by ID.
   */
  getChild(id: string): State | undefined {
    return this.children.get(id);
  }

  /**
   * Gets full state path (e.g., "Combat.Attacking").
   */
  getPath(): string {
    if (this.parent) {
      return `${this.parent.getPath()}.${this.id}`;
    }
    return this.id;
  }
}

/**
 * Finite state machine for AI behavior control.
 * Supports transitions, hierarchical states, and state history.
 *
 * @example
 * ```typescript
 * // Create FSM with blackboard
 * const blackboard = new Blackboard();
 * const fsm = new StateMachine(blackboard);
 *
 * // Define states
 * const idle = new State('idle');
 * idle.onEnter = (bb) => console.log('Now idle');
 * idle.onUpdate = (dt, bb) => {
 *   // Idle behavior...
 * };
 *
 * const patrol = new State('patrol');
 * patrol.onUpdate = (dt, bb) => {
 *   // Patrol behavior...
 * };
 *
 * const chase = new State('chase');
 * chase.onUpdate = (dt, bb) => {
 *   // Chase behavior...
 * };
 *
 * // Add transitions
 * idle.addTransition('patrol', (bb) => !bb.get('enemySpotted'));
 * patrol.addTransition('chase', (bb) => bb.get('enemySpotted'), 10);
 * chase.addTransition('patrol', (bb) => !bb.get('enemySpotted'));
 *
 * // Add states to FSM
 * fsm.addState(idle);
 * fsm.addState(patrol);
 * fsm.addState(chase);
 *
 * // Start FSM
 * fsm.start('idle');
 *
 * // Update each frame
 * fsm.update(deltaTime);
 *
 * // Trigger state changes via blackboard
 * blackboard.set('enemySpotted', true); // Will transition to chase
 * ```
 */
export class StateMachine {
  /** Shared blackboard */
  readonly blackboard: Blackboard;

  /** All registered states */
  private states: Map<string, State>;

  /** Current active state */
  private currentState: State | null;

  /** Previous state (for history) */
  private previousState: State | null;

  /** State history stack */
  private history: State[];

  /** Maximum history size */
  private maxHistorySize: number;

  /** Whether FSM is running */
  private running: boolean;

  /**
   * Creates a new state machine.
   *
   * @param blackboard - Shared blackboard
   * @param maxHistorySize - Maximum history entries
   */
  constructor(blackboard: Blackboard = new Blackboard(), maxHistorySize: number = 10) {
    this.blackboard = blackboard;
    this.states = new Map();
    this.currentState = null;
    this.previousState = null;
    this.history = [];
    this.maxHistorySize = maxHistorySize;
    this.running = false;
  }

  /**
   * Adds a state to the machine.
   *
   * @param state - State to add
   * @returns This FSM for chaining
   *
   * @example
   * ```typescript
   * fsm.addState(new State('idle'))
   *    .addState(new State('patrol'))
   *    .addState(new State('chase'));
   * ```
   */
  addState(state: State): this {
    this.states.set(state.id, state);
    return this;
  }

  /**
   * Gets a state by ID.
   *
   * @param id - State ID
   * @returns State or undefined
   */
  getState(id: string): State | undefined {
    return this.states.get(id);
  }

  /**
   * Starts the state machine with an initial state.
   *
   * @param stateId - Initial state ID
   * @throws Error if state not found
   *
   * @example
   * ```typescript
   * fsm.start('idle');
   * ```
   */
  start(stateId: string): void {
    const state = this.states.get(stateId);
    if (!state) {
      throw new Error(`State '${stateId}' not found`);
    }

    this.running = true;
    this.transitionTo(state);
  }

  /**
   * Stops the state machine.
   */
  stop(): void {
    if (this.currentState) {
      this.exitState(this.currentState);
      this.currentState = null;
    }
    this.running = false;
  }

  /**
   * Updates the state machine.
   *
   * @param deltaTime - Time since last update
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   fsm.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (!this.running || !this.currentState) {
      return;
    }

    // Update current state
    this.updateState(this.currentState, deltaTime);

    // Check transitions
    this.checkTransitions();
  }

  /**
   * Updates a state and its active child states.
   * @private
   */
  private updateState(state: State, deltaTime: number): void {
    // Update this state
    if (state.onUpdate) {
      state.onUpdate(deltaTime, this.blackboard);
    }

    // Update active child state
    if (state.currentChildState) {
      this.updateState(state.currentChildState, deltaTime);
    }
  }

  /**
   * Checks and processes state transitions.
   * @private
   */
  private checkTransitions(): void {
    if (!this.currentState) return;

    // Check transitions from current state
    const transition = this.findValidTransition(this.currentState);

    if (transition) {
      const targetState = this.states.get(transition.targetState);
      if (targetState) {
        this.transitionTo(targetState);
      }
    }

    // Check child state transitions
    if (this.currentState.currentChildState) {
      const childTransition = this.findValidTransition(this.currentState.currentChildState);
      if (childTransition) {
        const targetState = this.currentState.children.get(childTransition.targetState);
        if (targetState) {
          this.transitionChildTo(this.currentState, targetState);
        }
      }
    }
  }

  /**
   * Finds the first valid transition from a state.
   * @private
   */
  private findValidTransition(state: State): StateTransition | null {
    for (const transition of state.transitions) {
      if (transition.condition(this.blackboard)) {
        return transition;
      }
    }
    return null;
  }

  /**
   * Transitions to a new state.
   * @private
   */
  private transitionTo(newState: State): void {
    // Exit current state
    if (this.currentState) {
      this.exitState(this.currentState);
      this.previousState = this.currentState;
      this.addToHistory(this.currentState);
    }

    // Enter new state
    this.currentState = newState;
    this.enterState(newState);
  }

  /**
   * Transitions to a child state within a parent.
   * @private
   */
  private transitionChildTo(parent: State, newChild: State): void {
    // Exit current child
    if (parent.currentChildState) {
      this.exitState(parent.currentChildState);
    }

    // Enter new child
    parent.currentChildState = newChild;
    this.enterState(newChild);
  }

  /**
   * Enters a state (calls onEnter and activates initial child).
   * @private
   */
  private enterState(state: State): void {
    if (state.onEnter) {
      state.onEnter(this.blackboard);
    }

    // Activate initial child state if hierarchical
    if (state.hasChildren()) {
      let initialChild: State | null = null;

      if (state.rememberChildState && state.currentChildState) {
        // Resume previous child
        initialChild = state.currentChildState;
      } else if (state.initialChildState) {
        // Use configured initial child
        initialChild = state.children.get(state.initialChildState) || null;
      } else {
        // Use first child
        initialChild = Array.from(state.children.values())[0] || null;
      }

      if (initialChild) {
        state.currentChildState = initialChild;
        this.enterState(initialChild);
      }
    }
  }

  /**
   * Exits a state (calls onExit and exits child states).
   * @private
   */
  private exitState(state: State): void {
    // Exit child state first
    if (state.currentChildState) {
      this.exitState(state.currentChildState);
      if (!state.rememberChildState) {
        state.currentChildState = null;
      }
    }

    if (state.onExit) {
      state.onExit(this.blackboard);
    }
  }

  /**
   * Adds a state to history.
   * @private
   */
  private addToHistory(state: State): void {
    this.history.push(state);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Forces an immediate transition to a state.
   *
   * @param stateId - Target state ID
   * @throws Error if state not found
   *
   * @example
   * ```typescript
   * fsm.forceTransition('alert');
   * ```
   */
  forceTransition(stateId: string): void {
    const state = this.states.get(stateId);
    if (!state) {
      throw new Error(`State '${stateId}' not found`);
    }

    this.transitionTo(state);
  }

  /**
   * Returns to the previous state.
   *
   * @returns True if transition succeeded
   *
   * @example
   * ```typescript
   * fsm.back(); // Go back to previous state
   * ```
   */
  back(): boolean {
    if (this.previousState) {
      this.transitionTo(this.previousState);
      return true;
    }
    return false;
  }

  /**
   * Gets the current state.
   */
  getCurrentState(): State | null {
    return this.currentState;
  }

  /**
   * Gets the current state ID.
   */
  getCurrentStateId(): string | null {
    return this.currentState?.id || null;
  }

  /**
   * Gets the full current state path (including child states).
   *
   * @example
   * ```typescript
   * // If in Combat state with Attacking child:
   * console.log(fsm.getCurrentPath()); // "Combat.Attacking"
   * ```
   */
  getCurrentPath(): string | null {
    if (!this.currentState) return null;

    let path = this.currentState.id;
    let child = this.currentState.currentChildState;

    while (child) {
      path += `.${child.id}`;
      child = child.currentChildState;
    }

    return path;
  }

  /**
   * Checks if currently in a specific state.
   *
   * @param stateId - State ID to check
   * @returns True if in that state
   */
  isInState(stateId: string): boolean {
    return this.currentState?.id === stateId;
  }

  /**
   * Gets state history.
   *
   * @returns Array of previous states (most recent last)
   */
  getHistory(): State[] {
    return [...this.history];
  }

  /**
   * Clears state history.
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Gets statistics about the state machine.
   */
  getStats(): {
    stateCount: number;
    currentState: string | null;
    historySize: number;
    isRunning: boolean;
  } {
    return {
      stateCount: this.states.size,
      currentState: this.getCurrentStateId(),
      historySize: this.history.length,
      isRunning: this.running,
    };
  }

  /**
   * Gets a debug string representation.
   */
  toString(): string {
    const states = Array.from(this.states.values())
      .map((s) => `  ${s.id} (${s.transitions.length} transitions)`)
      .join('\n');

    return `StateMachine {
  Current: ${this.getCurrentPath() || 'none'}
  States:
${states}
}`;
  }
}
