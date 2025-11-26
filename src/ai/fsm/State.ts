/**
 * @fileoverview State class with lifecycle callbacks for finite state machines.
 * Provides enter/exit/update methods and event handling.
 * @module ai/fsm/State
 */

import { Blackboard } from '../Blackboard';

/**
 * State class representing a single state in a finite state machine.
 * Supports lifecycle callbacks: enter, exit, update, and custom event handling.
 * Can be used standalone or as part of a hierarchical FSM.
 *
 * @example
 * ```typescript
 * const idleState = new State('idle', 'Idle');
 *
 * idleState.onEnter = (blackboard) => {
 *   console.log('Entering idle state');
 *   blackboard.set('isIdle', true);
 * };
 *
 * idleState.onUpdate = (deltaTime, blackboard) => {
 *   // Check for player input
 *   if (blackboard.get('inputDetected')) {
 *     return; // Transition will be handled by state machine
 *   }
 * };
 *
 * idleState.onExit = (blackboard) => {
 *   console.log('Exiting idle state');
 *   blackboard.set('isIdle', false);
 * };
 *
 * idleState.onEvent = (event, blackboard) => {
 *   if (event.type === 'damage') {
 *     blackboard.set('lastDamageTime', Date.now());
 *   }
 * };
 * ```
 */
export class State {
  /** Unique state identifier */
  readonly id: string;

  /** Human-readable state name */
  name: string;

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

  /** Arbitrary data attached to this state */
  data: Map<string, unknown>;

  /**
   * Called when entering the state.
   * Use this for initialization, playing animations, or setting up conditions.
   *
   * @param blackboard - Shared data storage
   */
  onEnter?: (blackboard: Blackboard) => void;

  /**
   * Called each update while in the state.
   * Use this for per-frame logic, physics updates, or condition checking.
   *
   * @param deltaTime - Time elapsed since last update in seconds
   * @param blackboard - Shared data storage
   */
  onUpdate?: (deltaTime: number, blackboard: Blackboard) => void;

  /**
   * Called when exiting the state.
   * Use this for cleanup, stopping animations, or resetting conditions.
   *
   * @param blackboard - Shared data storage
   */
  onExit?: (blackboard: Blackboard) => void;

  /**
   * Called when a custom event is dispatched to this state.
   * Use this for handling specific game events (damage, interaction, etc.).
   *
   * @param event - The event object
   * @param blackboard - Shared data storage
   */
  onEvent?: (event: { type: string; data?: unknown }, blackboard: Blackboard) => void;

  /**
   * Creates a new state.
   *
   * @param id - Unique state identifier
   * @param name - Human-readable name (defaults to id)
   *
   * @example
   * ```typescript
   * const idle = new State('idle');
   * const patrol = new State('patrol', 'Patrol Mode');
   * ```
   */
  constructor(id: string, name?: string) {
    this.id = id;
    this.name = name ?? id;
    this.parent = null;
    this.children = new Map();
    this.initialChildState = null;
    this.currentChildState = null;
    this.rememberChildState = false;
    this.data = new Map();
  }

  /**
   * Adds a child state for hierarchical FSM.
   *
   * @param state - Child state to add
   * @returns This state for chaining
   *
   * @example
   * ```typescript
   * const combat = new State('combat');
   * const attacking = new State('attacking');
   * const defending = new State('defending');
   *
   * combat.addChild(attacking).addChild(defending);
   * combat.setInitialChild('defending');
   * ```
   */
  addChild(state: State): this {
    state.parent = this;
    this.children.set(state.id, state);
    return this;
  }

  /**
   * Removes a child state.
   *
   * @param stateId - ID of child state to remove
   * @returns True if child was removed
   */
  removeChild(stateId: string): boolean {
    const child = this.children.get(stateId);
    if (child) {
      child.parent = null;
      this.children.delete(stateId);
      if (this.currentChildState === child) {
        this.currentChildState = null;
      }
      if (this.initialChildState === stateId) {
        this.initialChildState = null;
      }
      return true;
    }
    return false;
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
   *
   * @param id - Child state ID
   * @returns Child state or undefined
   */
  getChild(id: string): State | undefined {
    return this.children.get(id);
  }

  /**
   * Gets all child states.
   *
   * @returns Array of child states
   */
  getChildren(): State[] {
    return Array.from(this.children.values());
  }

  /**
   * Gets full state path (e.g., "Combat.Attacking").
   *
   * @returns Full hierarchical path
   */
  getPath(): string {
    if (this.parent) {
      return `${this.parent.getPath()}.${this.id}`;
    }
    return this.id;
  }

  /**
   * Gets the depth of this state in the hierarchy (root = 0).
   */
  getDepth(): number {
    let depth = 0;
    let current: State | null = this.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }

  /**
   * Sets arbitrary data on this state.
   *
   * @param key - Data key
   * @param value - Data value
   * @returns This state for chaining
   */
  setData(key: string, value: unknown): this {
    this.data.set(key, value);
    return this;
  }

  /**
   * Gets arbitrary data from this state.
   *
   * @param key - Data key
   * @returns Data value or undefined
   */
  getData<T = unknown>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  /**
   * Checks if this state has data with the given key.
   *
   * @param key - Data key
   * @returns True if data exists
   */
  hasData(key: string): boolean {
    return this.data.has(key);
  }

  /**
   * Clears all data from this state.
   */
  clearData(): void {
    this.data.clear();
  }

  /**
   * Gets a string representation of this state.
   */
  toString(): string {
    const childrenInfo = this.hasChildren() ? ` (${this.children.size} children)` : '';
    return `State[${this.id}]${childrenInfo}`;
  }
}
