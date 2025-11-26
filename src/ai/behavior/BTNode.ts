/**
 * @fileoverview Base behavior tree node with status management.
 * Provides the foundation for all node types in the behavior tree system.
 * @module ai/behavior/BTNode
 */

import type { BehaviorContext } from './BehaviorTree';

/**
 * Node execution status returned from tick() operations.
 * Determines the control flow through the behavior tree.
 */
export enum NodeStatus {
  /** Node execution succeeded - goal achieved */
  SUCCESS = 'success',
  /** Node execution failed - goal not achievable */
  FAILURE = 'failure',
  /** Node is still running - async operation in progress */
  RUNNING = 'running',
}

/**
 * Node visitor interface for tree traversal and processing.
 * Used for debugging, serialization, and tree analysis.
 */
export interface NodeVisitor {
  /**
   * Called when visiting a node.
   *
   * @param node - The node being visited
   * @param depth - Current depth in the tree
   */
  visit(node: BTNode, depth: number): void;
}

/**
 * Base class for all behavior tree nodes.
 * Provides common functionality for status tracking, lifecycle hooks, and execution.
 *
 * @abstract
 *
 * @example
 * ```typescript
 * class CustomAction extends BTNode {
 *   tick(context: BehaviorContext): NodeStatus {
 *     // Perform action logic
 *     return NodeStatus.SUCCESS;
 *   }
 * }
 * ```
 */
export abstract class BTNode {
  /** Human-readable node name for debugging */
  readonly name: string;

  /** Unique identifier for this node instance */
  readonly id: string;

  /** Current execution status */
  status: NodeStatus;

  /** Whether node is currently executing */
  isRunning: boolean;

  /** Number of times this node has been ticked */
  tickCount: number;

  /** Timestamp of last execution */
  lastTickTime: number;

  /** User-defined metadata for this node */
  metadata: Map<string, unknown>;

  /** Whether this node is enabled (disabled nodes always return FAILURE) */
  enabled: boolean;

  /**
   * Creates a new behavior tree node.
   *
   * @param name - Node name for debugging
   */
  constructor(name: string = 'Node') {
    this.name = name;
    this.id = this.generateId();
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
    this.tickCount = 0;
    this.lastTickTime = 0;
    this.metadata = new Map();
    this.enabled = true;
  }

  /**
   * Generates a unique ID for this node.
   *
   * @returns Unique identifier
   */
  private generateId(): string {
    return `${this.constructor.name}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Executes the node logic.
   * Must be implemented by subclasses.
   *
   * @param context - Execution context with blackboard and timing
   * @returns Execution status
   */
  abstract tick(context: BehaviorContext): NodeStatus;

  /**
   * Called when node starts executing (status becomes RUNNING).
   * Override for initialization logic.
   *
   * @param context - Execution context
   */
  onEnter?(context: BehaviorContext): void;

  /**
   * Called when node finishes executing (status becomes SUCCESS or FAILURE).
   * Override for cleanup logic.
   *
   * @param context - Execution context
   */
  onExit?(context: BehaviorContext): void;

  /**
   * Called when node execution is aborted.
   * Override for interruption cleanup.
   *
   * @param context - Execution context
   */
  onAbort?(context: BehaviorContext): void;

  /**
   * Resets node state to initial values.
   * Should be called before reusing a node.
   */
  reset(): void {
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
    this.tickCount = 0;
  }

  /**
   * Aborts the current execution.
   * Calls onAbort if defined, then resets the node.
   *
   * @param context - Execution context
   */
  abort(context: BehaviorContext): void {
    if (this.isRunning && this.onAbort) {
      this.onAbort(context);
    }
    this.reset();
  }

  /**
   * Sets metadata for this node.
   *
   * @param key - Metadata key
   * @param value - Metadata value
   *
   * @example
   * ```typescript
   * node.setMetadata('priority', 10);
   * node.setMetadata('tags', ['combat', 'melee']);
   * ```
   */
  setMetadata(key: string, value: unknown): void {
    this.metadata.set(key, value);
  }

  /**
   * Gets metadata for this node.
   *
   * @param key - Metadata key
   * @param defaultValue - Default value if key not found
   * @returns Metadata value
   */
  getMetadata<T = unknown>(key: string, defaultValue?: T): T | undefined {
    return (this.metadata.get(key) as T) ?? defaultValue;
  }

  /**
   * Accepts a visitor for tree traversal.
   *
   * @param visitor - Visitor instance
   * @param depth - Current depth in tree
   */
  accept(visitor: NodeVisitor, depth: number = 0): void {
    visitor.visit(this, depth);
  }

  /**
   * Gets all child nodes (composite/decorator nodes override this).
   *
   * @returns Array of child nodes
   */
  getChildren(): BTNode[] {
    return [];
  }

  /**
   * Clones this node (deep copy).
   * Subclasses should override to properly clone their state.
   *
   * @returns Cloned node
   */
  clone(): BTNode {
    const cloned = Object.create(Object.getPrototypeOf(this));
    Object.assign(cloned, this);
    cloned.id = this.generateId();
    cloned.metadata = new Map(this.metadata);
    cloned.reset();
    return cloned;
  }

  /**
   * Gets a string representation of the node for debugging.
   *
   * @returns String representation
   */
  toString(): string {
    return `${this.name} [${this.status}] (ticks: ${this.tickCount})`;
  }

  /**
   * Gets a detailed debug string with hierarchy.
   *
   * @param indent - Indentation level
   * @returns Debug string
   */
  toDebugString(indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let result = `${prefix}${this.toString()}\n`;

    const children = this.getChildren();
    for (const child of children) {
      result += child.toDebugString(indent + 1);
    }

    return result;
  }
}
