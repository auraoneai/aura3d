/**
 * @fileoverview Finite state machine with states and transitions.
 * Enhanced version with better transition management and lifecycle control.
 * @module ai/fsm/StateMachine
 */

import { Blackboard } from '../Blackboard';
import { State } from './State';
import { Transition } from './Transition';
import { Logger } from '../../core/Logger';

const logger = Logger.create('FSM');

/**
 * Finite state machine for AI behavior control.
 * Supports transitions with priorities, interrupts, and hierarchical states.
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
 * // Add states
 * fsm.addState(idle);
 * fsm.addState(patrol);
 *
 * // Add transitions
 * fsm.addTransition(new Transition('idle', 'patrol', (bb) => {
 *   return bb.get('shouldPatrol', false);
 * }));
 *
 * // Start FSM
 * fsm.start('idle');
 *
 * // Update each frame
 * fsm.update(deltaTime);
 * ```
 */
export class StateMachine {
  /** Shared blackboard */
  readonly blackboard: Blackboard;

  /** All registered states */
  private readonly states: Map<string, State>;

  /** All registered transitions */
  private readonly transitions: Transition[];

  /** Current active state */
  private currentState: State | null;

  /** Previous state (for history) */
  private previousState: State | null;

  /** State history stack */
  private readonly history: State[];

  /** Maximum history size */
  private readonly maxHistorySize: number;

  /** Whether FSM is running */
  private running: boolean;

  /** Enable debug logging */
  private debugMode: boolean;

  /** Pending state change (to avoid mid-update transitions) */
  private pendingTransition: { toState: State; fromState: State } | null;

  /**
   * Creates a new state machine.
   *
   * @param blackboard - Shared blackboard (default: new Blackboard)
   * @param options - Optional configuration
   *
   * @example
   * ```typescript
   * const fsm = new StateMachine(new Blackboard(), {
   *   maxHistorySize: 20,
   *   debugMode: true
   * });
   * ```
   */
  constructor(
    blackboard: Blackboard = new Blackboard(),
    options: {
      maxHistorySize?: number;
      debugMode?: boolean;
    } = {}
  ) {
    this.blackboard = blackboard;
    this.states = new Map();
    this.transitions = [];
    this.currentState = null;
    this.previousState = null;
    this.history = [];
    this.maxHistorySize = options.maxHistorySize ?? 10;
    this.running = false;
    this.debugMode = options.debugMode ?? false;
    this.pendingTransition = null;
  }

  /**
   * Adds a state to the machine.
   *
   * @param state - State to add
   * @returns This FSM for chaining
   */
  addState(state: State): this {
    this.states.set(state.id, state);
    if (this.debugMode) {
      logger.debug(`Added state: ${state.id}`);
    }
    return this;
  }

  /**
   * Removes a state from the machine.
   *
   * @param stateId - State ID to remove
   * @returns True if state was removed
   */
  removeState(stateId: string): boolean {
    const state = this.states.get(stateId);
    if (!state) {
      return false;
    }

    // Remove transitions involving this state
    for (let i = this.transitions.length - 1; i >= 0; i--) {
      const transition = this.transitions[i]!;
      if (transition.fromState === stateId || transition.toState === stateId) {
        this.transitions.splice(i, 1);
      }
    }

    this.states.delete(stateId);
    if (this.debugMode) {
      logger.debug(`Removed state: ${stateId}`);
    }
    return true;
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
   * Adds a transition to the machine.
   *
   * @param transition - Transition to add
   * @returns This FSM for chaining
   */
  addTransition(transition: Transition): this {
    this.transitions.push(transition);
    // Sort by priority (highest first)
    this.transitions.sort((a, b) => b.priority - a.priority);
    if (this.debugMode) {
      logger.debug(`Added transition: ${transition.name}`);
    }
    return this;
  }

  /**
   * Removes a transition from the machine.
   *
   * @param transition - Transition to remove
   * @returns True if transition was removed
   */
  removeTransition(transition: Transition): boolean {
    const index = this.transitions.indexOf(transition);
    if (index !== -1) {
      this.transitions.splice(index, 1);
      if (this.debugMode) {
        logger.debug(`Removed transition: ${transition.name}`);
      }
      return true;
    }
    return false;
  }

  /**
   * Starts the state machine with an initial state.
   *
   * @param stateId - Initial state ID
   * @throws Error if state not found
   */
  start(stateId: string): void {
    const state = this.states.get(stateId);
    if (!state) {
      throw new Error(`State '${stateId}' not found`);
    }

    this.running = true;
    this.transitionTo(state);
    if (this.debugMode) {
      logger.info(`Started FSM with state: ${stateId}`);
    }
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
    this.pendingTransition = null;
    if (this.debugMode) {
      logger.info('Stopped FSM');
    }
  }

  /**
   * Updates the state machine.
   *
   * @param deltaTime - Time since last update in seconds
   */
  update(deltaTime: number): void {
    if (!this.running || !this.currentState) {
      return;
    }

    // Update current state
    this.updateState(this.currentState, deltaTime);

    // Check transitions
    this.checkTransitions();

    // Process pending transition (if any)
    if (this.pendingTransition) {
      const { fromState, toState } = this.pendingTransition;
      this.exitState(fromState);
      this.currentState = toState;
      this.enterState(toState);
      this.pendingTransition = null;
    }
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
    if (!this.currentState || this.pendingTransition) {
      return;
    }

    // Check global transitions (sorted by priority)
    for (const transition of this.transitions) {
      if (!transition.appliesTo(this.currentState.id)) {
        continue;
      }

      if (transition.evaluate(this.blackboard)) {
        const targetState = this.states.get(transition.toState);
        if (!targetState) {
          logger.warn(`Transition target state '${transition.toState}' not found`);
          continue;
        }

        // Check if we can interrupt
        if (!transition.canInterrupt && this.currentState.onUpdate) {
          continue;
        }

        if (this.debugMode) {
          logger.debug(`Taking transition: ${transition.name}`);
        }

        // Invoke transition callback
        if (transition.onTransition) {
          transition.onTransition(this.currentState, targetState, this.blackboard);
        }

        // Schedule transition
        this.scheduleTransition(this.currentState, targetState);
        return;
      }
    }
  }

  /**
   * Schedules a state transition to occur after the current update.
   * @private
   */
  private scheduleTransition(fromState: State, toState: State): void {
    this.previousState = fromState;
    this.addToHistory(fromState);
    this.pendingTransition = { fromState, toState };
  }

  /**
   * Transitions to a new state immediately.
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
   * Enters a state (calls onEnter and activates initial child).
   * @private
   */
  private enterState(state: State): void {
    if (this.debugMode) {
      logger.debug(`Entering state: ${state.id}`);
    }

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
    if (this.debugMode) {
      logger.debug(`Exiting state: ${state.id}`);
    }

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
   */
  forceTransition(stateId: string): void {
    const state = this.states.get(stateId);
    if (!state) {
      throw new Error(`State '${stateId}' not found`);
    }

    if (this.debugMode) {
      logger.debug(`Force transition to: ${stateId}`);
    }

    this.transitionTo(state);
  }

  /**
   * Returns to the previous state.
   *
   * @returns True if transition succeeded
   */
  back(): boolean {
    if (this.previousState) {
      this.transitionTo(this.previousState);
      return true;
    }
    return false;
  }

  /**
   * Dispatches an event to the current state.
   *
   * @param event - Event object
   */
  dispatchEvent(event: { type: string; data?: unknown }): void {
    if (this.currentState && this.currentState.onEvent) {
      this.currentState.onEvent(event, this.blackboard);
    }
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
   * Enables or disables debug mode.
   *
   * @param enabled - Whether to enable debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Gets statistics about the state machine.
   */
  getStats(): {
    stateCount: number;
    transitionCount: number;
    currentState: string | null;
    historySize: number;
    isRunning: boolean;
  } {
    return {
      stateCount: this.states.size,
      transitionCount: this.transitions.length,
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
      .map((s) => `  ${s.id}`)
      .join('\n');

    const transitions = this.transitions
      .map((t) => `  ${t.name} (priority: ${t.priority})`)
      .join('\n');

    return `StateMachine {
  Current: ${this.getCurrentPath() || 'none'}
  States:
${states}
  Transitions:
${transitions}
}`;
  }
}
