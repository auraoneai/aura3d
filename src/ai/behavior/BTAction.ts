/**
 * @fileoverview Action leaf nodes for behavior trees.
 * Provides action nodes with async support and execution context.
 * @module ai/behavior/BTAction
 */

import { BTNode, NodeStatus } from './BTNode';
import type { BehaviorContext } from './BehaviorTree';

/**
 * Action function signature.
 * Synchronous function that returns a status immediately.
 */
export type ActionFunction = (context: BehaviorContext) => NodeStatus;

/**
 * Async action function signature.
 * Returns a promise that resolves to a status.
 */
export type AsyncActionFunction = (context: BehaviorContext) => Promise<NodeStatus>;

/**
 * Action node - performs an action and returns success/failure.
 * Supports both synchronous and asynchronous actions.
 *
 * @example
 * ```typescript
 * // Synchronous action
 * const moveToTarget = new BTAction('MoveToTarget', (context) => {
 *   const target = context.blackboard.get('target');
 *   const position = context.blackboard.get('position');
 *
 *   if (!target) return NodeStatus.FAILURE;
 *
 *   // Move toward target
 *   const direction = target.sub(position).normalize();
 *   position.addInPlace(direction.scale(5 * context.deltaTime));
 *
 *   // Check if reached
 *   if (position.distanceTo(target) < 1.0) {
 *     return NodeStatus.SUCCESS;
 *   }
 *
 *   return NodeStatus.RUNNING;
 * });
 *
 * // Asynchronous action
 * const loadAsset = new BTAction('LoadAsset', async (context) => {
 *   const assetPath = context.blackboard.get('assetPath');
 *   try {
 *     const asset = await assetLoader.load(assetPath);
 *     context.blackboard.set('loadedAsset', asset);
 *     return NodeStatus.SUCCESS;
 *   } catch (error) {
 *     return NodeStatus.FAILURE;
 *   }
 * });
 * ```
 */
export class BTAction extends BTNode {
  /** Action function to execute */
  private readonly action: ActionFunction | AsyncActionFunction;

  /** Whether this action is async */
  private readonly isAsync: boolean;

  /** Pending promise for async actions */
  private pendingPromise: Promise<NodeStatus> | null;

  /**
   * Creates a new action node.
   *
   * @param name - Node name
   * @param action - Action function (sync or async)
   */
  constructor(name: string, action: ActionFunction | AsyncActionFunction) {
    super(name);
    this.action = action;
    this.isAsync = action.constructor.name === 'AsyncFunction';
    this.pendingPromise = null;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.isRunning = true;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    // Handle async actions
    if (this.isAsync) {
      if (!this.pendingPromise) {
        // Start async action
        this.pendingPromise = (this.action as AsyncActionFunction)(context);

        // Handle promise resolution
        this.pendingPromise
          .then((status) => {
            this.status = status;
            this.isRunning = false;
            this.pendingPromise = null;

            if (this.onExit) {
              this.onExit(context);
            }
          })
          .catch((error) => {
            console.error(`Action "${this.name}" async error:`, error);
            this.status = NodeStatus.FAILURE;
            this.isRunning = false;
            this.pendingPromise = null;

            if (this.onExit) {
              this.onExit(context);
            }
          });

        // Return RUNNING while waiting
        this.status = NodeStatus.RUNNING;
        return NodeStatus.RUNNING;
      }

      // Still waiting for promise
      return this.status;
    }

    // Handle synchronous actions
    this.status = (this.action as ActionFunction)(context);

    if (this.status !== NodeStatus.RUNNING) {
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
    }

    return this.status;
  }

  override reset(): void {
    super.reset();
    this.pendingPromise = null;
  }

  override abort(context: BehaviorContext): void {
    if (this.pendingPromise) {
      // Cancel pending promise (best effort)
      this.pendingPromise = null;
    }
    super.abort(context);
  }
}

/**
 * Idle action - does nothing and returns SUCCESS immediately.
 * Useful for placeholder nodes or default behaviors.
 *
 * @example
 * ```typescript
 * const idle = new BTIdle('Idle');
 * ```
 */
export class BTIdle extends BTNode {
  /**
   * Creates a new idle node.
   *
   * @param name - Node name
   */
  constructor(name: string = 'Idle') {
    super(name);
  }

  tick(context: BehaviorContext): NodeStatus {
    this.tickCount++;
    this.lastTickTime = Date.now();
    this.status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }
}

/**
 * Wait action - waits for a duration then returns SUCCESS.
 * Different from BTWait decorator (which waits before executing child).
 *
 * @example
 * ```typescript
 * const wait2Seconds = new BTWaitAction('Wait2s', 2.0);
 * ```
 */
export class BTWaitAction extends BTNode {
  /** Wait duration in seconds */
  private readonly duration: number;

  /** Elapsed time in seconds */
  private elapsed: number;

  /**
   * Creates a new wait action node.
   *
   * @param name - Node name
   * @param duration - Wait duration in seconds
   */
  constructor(name: string = 'Wait', duration: number) {
    super(name);
    this.duration = duration;
    this.elapsed = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.elapsed = 0;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    this.elapsed += context.deltaTime;

    if (this.elapsed < this.duration) {
      this.status = NodeStatus.RUNNING;
      return NodeStatus.RUNNING;
    }

    this.status = NodeStatus.SUCCESS;
    this.isRunning = false;
    if (this.onExit) {
      this.onExit(context);
    }
    return NodeStatus.SUCCESS;
  }

  override reset(): void {
    super.reset();
    this.elapsed = 0;
  }
}

/**
 * Log action - logs a message and returns SUCCESS.
 * Useful for debugging behavior trees.
 *
 * @example
 * ```typescript
 * const log = new BTLog('LogMessage', 'Reached this point');
 * ```
 */
export class BTLog extends BTNode {
  /** Message to log */
  private readonly message: string;

  /** Whether to include blackboard snapshot */
  private readonly includeBlackboard: boolean;

  /**
   * Creates a new log action node.
   *
   * @param name - Node name
   * @param message - Message to log
   * @param includeBlackboard - Whether to log blackboard snapshot
   */
  constructor(name: string = 'Log', message: string, includeBlackboard: boolean = false) {
    super(name);
    this.message = message;
    this.includeBlackboard = includeBlackboard;
  }

  tick(context: BehaviorContext): NodeStatus {
    this.tickCount++;
    this.lastTickTime = Date.now();

    console.log(`[BT] ${this.name}: ${this.message}`);

    if (this.includeBlackboard) {
      console.log('Blackboard:', context.blackboard.snapshot());
    }

    this.status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }
}

/**
 * SetBlackboard action - sets a value in the blackboard.
 * Useful for updating state without writing custom actions.
 *
 * @example
 * ```typescript
 * const setHealth = new BTSetBlackboard('SetHealth', 'health', 100);
 * const setTarget = new BTSetBlackboard('SetTarget', 'target', () => findNearestEnemy());
 * ```
 */
export class BTSetBlackboard extends BTNode {
  /** Blackboard key to set */
  private readonly key: string;

  /** Value to set (can be function) */
  private readonly value: unknown | ((context: BehaviorContext) => unknown);

  /**
   * Creates a new set-blackboard action node.
   *
   * @param name - Node name
   * @param key - Blackboard key
   * @param value - Value or value function
   */
  constructor(name: string = 'SetBlackboard', key: string, value: unknown | ((context: BehaviorContext) => unknown)) {
    super(name);
    this.key = key;
    this.value = value;
  }

  tick(context: BehaviorContext): NodeStatus {
    this.tickCount++;
    this.lastTickTime = Date.now();

    const actualValue = typeof this.value === 'function' ? this.value(context) : this.value;
    context.blackboard.set(this.key, actualValue);

    this.status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }
}

/**
 * ClearBlackboard action - deletes a value from the blackboard.
 *
 * @example
 * ```typescript
 * const clearTarget = new BTClearBlackboard('ClearTarget', 'target');
 * ```
 */
export class BTClearBlackboard extends BTNode {
  /** Blackboard key to clear */
  private readonly key: string;

  /**
   * Creates a new clear-blackboard action node.
   *
   * @param name - Node name
   * @param key - Blackboard key to clear
   */
  constructor(name: string = 'ClearBlackboard', key: string) {
    super(name);
    this.key = key;
  }

  tick(context: BehaviorContext): NodeStatus {
    this.tickCount++;
    this.lastTickTime = Date.now();

    context.blackboard.delete(this.key);

    this.status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }
}
