/**
 * @fileoverview Hierarchical state machine with parent/child state relationships.
 * Supports nested states, state history, and complex state hierarchies.
 * @module ai/fsm/HierarchicalFSM
 */

import { Blackboard } from '../Blackboard';
import { State } from './State';
import { Transition } from './Transition';
import { StateMachine } from './StateMachine';
import { Logger } from '../../core/Logger';

const logger = Logger.create('HierarchicalFSM');

/**
 * Hierarchical finite state machine supporting nested states.
 * States can contain child states, allowing for complex behavior hierarchies.
 *
 * @example
 * ```typescript
 * const blackboard = new Blackboard();
 * const hfsm = new HierarchicalFSM(blackboard);
 *
 * // Create hierarchical states
 * const combat = new State('combat', 'Combat Mode');
 * const attacking = new State('attacking', 'Attacking');
 * const defending = new State('defending', 'Defending');
 * const dodging = new State('dodging', 'Dodging');
 *
 * // Set up hierarchy
 * combat.addChild(attacking);
 * combat.addChild(defending);
 * combat.addChild(dodging);
 * combat.setInitialChild('defending');
 *
 * const idle = new State('idle', 'Idle');
 *
 * // Add to FSM
 * hfsm.addState(combat);
 * hfsm.addState(idle);
 *
 * // Add transitions at parent level
 * hfsm.addTransition(new Transition('idle', 'combat', (bb) => {
 *   return bb.get('enemySpotted', false);
 * }));
 *
 * // Add child state transitions
 * hfsm.addChildTransition('combat', new Transition('defending', 'attacking', (bb) => {
 *   return bb.get('openingFound', false);
 * }));
 *
 * // Start
 * hfsm.start('idle');
 * ```
 */
export class HierarchicalFSM {
  /** Underlying state machine */
  private readonly fsm: StateMachine;

  /** Child transitions per parent state */
  private readonly childTransitions: Map<string, Transition[]>;

  /**
   * Creates a new hierarchical FSM.
   *
   * @param blackboard - Shared blackboard
   * @param options - Optional configuration
   */
  constructor(
    blackboard: Blackboard = new Blackboard(),
    options: {
      maxHistorySize?: number;
      debugMode?: boolean;
    } = {}
  ) {
    this.fsm = new StateMachine(blackboard, options);
    this.childTransitions = new Map();
  }

  /**
   * Gets the blackboard.
   */
  get blackboard(): Blackboard {
    return this.fsm.blackboard;
  }

  /**
   * Adds a state to the machine.
   *
   * @param state - State to add
   * @returns This HFSM for chaining
   */
  addState(state: State): this {
    this.fsm.addState(state);
    return this;
  }

  /**
   * Removes a state from the machine.
   *
   * @param stateId - State ID to remove
   * @returns True if state was removed
   */
  removeState(stateId: string): boolean {
    this.childTransitions.delete(stateId);
    return this.fsm.removeState(stateId);
  }

  /**
   * Gets a state by ID.
   *
   * @param id - State ID
   * @returns State or undefined
   */
  getState(id: string): State | undefined {
    return this.fsm.getState(id);
  }

  /**
   * Adds a transition between parent states.
   *
   * @param transition - Transition to add
   * @returns This HFSM for chaining
   */
  addTransition(transition: Transition): this {
    this.fsm.addTransition(transition);
    return this;
  }

  /**
   * Adds a transition between child states of a parent.
   *
   * @param parentId - Parent state ID
   * @param transition - Transition to add
   * @returns This HFSM for chaining
   *
   * @example
   * ```typescript
   * hfsm.addChildTransition('combat',
   *   new Transition('attacking', 'defending', (bb) => {
   *     return bb.get('shouldDefend', false);
   *   })
   * );
   * ```
   */
  addChildTransition(parentId: string, transition: Transition): this {
    let transitions = this.childTransitions.get(parentId);
    if (!transitions) {
      transitions = [];
      this.childTransitions.set(parentId, transitions);
    }

    transitions.push(transition);
    // Sort by priority
    transitions.sort((a, b) => b.priority - a.priority);

    return this;
  }

  /**
   * Starts the state machine with an initial state.
   *
   * @param stateId - Initial state ID
   */
  start(stateId: string): void {
    this.fsm.start(stateId);
  }

  /**
   * Stops the state machine.
   */
  stop(): void {
    this.fsm.stop();
  }

  /**
   * Updates the state machine.
   *
   * @param deltaTime - Time since last update in seconds
   */
  update(deltaTime: number): void {
    this.fsm.update(deltaTime);
    this.checkChildTransitions();
  }

  /**
   * Checks transitions for child states.
   * @private
   */
  private checkChildTransitions(): void {
    const currentState = this.fsm.getCurrentState();
    if (!currentState || !currentState.currentChildState) {
      return;
    }

    const parentId = currentState.id;
    const transitions = this.childTransitions.get(parentId);
    if (!transitions) {
      return;
    }

    const currentChildId = currentState.currentChildState.id;

    // Check child transitions
    for (const transition of transitions) {
      if (!transition.appliesTo(currentChildId)) {
        continue;
      }

      if (transition.evaluate(this.fsm.blackboard)) {
        const targetChild = currentState.getChild(transition.toState);
        if (!targetChild) {
          logger.warn(`Child state '${transition.toState}' not found in parent '${parentId}'`);
          continue;
        }

        // Perform child transition
        this.transitionChild(currentState, targetChild);
        return;
      }
    }
  }

  /**
   * Transitions to a child state within a parent.
   * @private
   */
  private transitionChild(parent: State, newChild: State): void {
    // Exit current child
    if (parent.currentChildState) {
      this.exitState(parent.currentChildState);
    }

    // Enter new child
    parent.currentChildState = newChild;
    this.enterState(newChild);
  }

  /**
   * Enters a state.
   * @private
   */
  private enterState(state: State): void {
    if (state.onEnter) {
      state.onEnter(this.fsm.blackboard);
    }

    // Activate initial child if present
    if (state.hasChildren()) {
      let initialChild: State | null = null;

      if (state.rememberChildState && state.currentChildState) {
        initialChild = state.currentChildState;
      } else if (state.initialChildState) {
        initialChild = state.children.get(state.initialChildState) || null;
      } else {
        initialChild = Array.from(state.children.values())[0] || null;
      }

      if (initialChild) {
        state.currentChildState = initialChild;
        this.enterState(initialChild);
      }
    }
  }

  /**
   * Exits a state.
   * @private
   */
  private exitState(state: State): void {
    // Exit child first
    if (state.currentChildState) {
      this.exitState(state.currentChildState);
      if (!state.rememberChildState) {
        state.currentChildState = null;
      }
    }

    if (state.onExit) {
      state.onExit(this.fsm.blackboard);
    }
  }

  /**
   * Forces an immediate transition to a state.
   *
   * @param stateId - Target state ID
   */
  forceTransition(stateId: string): void {
    this.fsm.forceTransition(stateId);
  }

  /**
   * Forces a transition to a child state within the current parent.
   *
   * @param childId - Target child state ID
   * @throws Error if not in a parent state or child not found
   */
  forceChildTransition(childId: string): void {
    const currentState = this.fsm.getCurrentState();
    if (!currentState) {
      throw new Error('No current state');
    }

    const child = currentState.getChild(childId);
    if (!child) {
      throw new Error(`Child state '${childId}' not found in '${currentState.id}'`);
    }

    this.transitionChild(currentState, child);
  }

  /**
   * Returns to the previous state.
   *
   * @returns True if transition succeeded
   */
  back(): boolean {
    return this.fsm.back();
  }

  /**
   * Dispatches an event to the current state and its children.
   *
   * @param event - Event object
   */
  dispatchEvent(event: { type: string; data?: unknown }): void {
    const currentState = this.fsm.getCurrentState();
    if (!currentState) {
      return;
    }

    // Dispatch to deepest active child first
    this.dispatchEventToState(currentState, event);
  }

  /**
   * Dispatches event recursively through state hierarchy.
   * @private
   */
  private dispatchEventToState(state: State, event: { type: string; data?: unknown }): void {
    // Dispatch to child first (if active)
    if (state.currentChildState) {
      this.dispatchEventToState(state.currentChildState, event);
    }

    // Then dispatch to this state
    if (state.onEvent) {
      state.onEvent(event, this.fsm.blackboard);
    }
  }

  /**
   * Gets the current state.
   */
  getCurrentState(): State | null {
    return this.fsm.getCurrentState();
  }

  /**
   * Gets the current state ID.
   */
  getCurrentStateId(): string | null {
    return this.fsm.getCurrentStateId();
  }

  /**
   * Gets the full current state path (including all nested children).
   */
  getCurrentPath(): string | null {
    return this.fsm.getCurrentPath();
  }

  /**
   * Gets the deepest active child state.
   *
   * @returns Deepest active state or null
   */
  getDeepestActiveState(): State | null {
    let state = this.fsm.getCurrentState();
    if (!state) {
      return null;
    }

    while (state.currentChildState) {
      state = state.currentChildState;
    }

    return state;
  }

  /**
   * Checks if currently in a specific state (at any level).
   *
   * @param stateId - State ID to check
   * @returns True if in that state
   */
  isInState(stateId: string): boolean {
    let state = this.fsm.getCurrentState();
    while (state) {
      if (state.id === stateId) {
        return true;
      }
      state = state.currentChildState;
    }
    return false;
  }

  /**
   * Gets state history.
   *
   * @returns Array of previous states
   */
  getHistory(): State[] {
    return this.fsm.getHistory();
  }

  /**
   * Clears state history.
   */
  clearHistory(): void {
    this.fsm.clearHistory();
  }

  /**
   * Enables or disables debug mode.
   *
   * @param enabled - Whether to enable debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.fsm.setDebugMode(enabled);
  }

  /**
   * Gets statistics about the state machine.
   */
  getStats(): {
    stateCount: number;
    transitionCount: number;
    childTransitionCount: number;
    currentState: string | null;
    deepestState: string | null;
    historySize: number;
    isRunning: boolean;
  } {
    const baseStats = this.fsm.getStats();
    const childTransitionCount = Array.from(this.childTransitions.values())
      .reduce((sum, transitions) => sum + transitions.length, 0);

    return {
      ...baseStats,
      childTransitionCount,
      deepestState: this.getDeepestActiveState()?.id || null,
    };
  }

  /**
   * Gets a debug string representation.
   */
  toString(): string {
    return this.fsm.toString();
  }
}
